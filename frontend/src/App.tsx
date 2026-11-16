import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { Component, useState } from 'react';
import { AuthProvider, useAuth } from './auth';
import { ExamProvider, ExamPicker, useExam, useIeltsSetupRedirect } from './exam';
import { applyTheme, resolveTheme, type Theme } from './theme';
import Login from './pages/Login';
import Home from './pages/Home';
import Today from './pages/Today';
import IeltsSetup from './pages/IeltsSetup';
import Diagnostic from './pages/Diagnostic';
import ErrorLog from './pages/ErrorLog';
import Writing from './pages/Writing';
import Speaking from './pages/Speaking';
import Practice from './pages/Practice';
import PracticeSession from './pages/PracticeSession';
import TestSetDetail from './pages/TestSetDetail';
import MockTest from './pages/MockTest';
import Result from './pages/Result';
import WrongQuestions from './pages/WrongQuestions';
import Vocabulary from './pages/Vocabulary';
import Stats from './pages/Stats';
import Leaderboard from './pages/Leaderboard';
import Admin from './pages/Admin';
import TestSetAdmin from './pages/TestSetAdmin';
import Settings from './pages/Settings';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  // Đang chờ máy chủ (Render bản miễn phí ngủ khi không dùng, dậy mất vài
  // giây): hiện thẻ chờ rõ ràng thay vì 1 dòng "Đang tải…" trên nền tối
  // trống — nhìn như trang bị đen.
  if (loading) return (
    <div className="card" style={{ marginTop: '1rem', textAlign: 'center', padding: '2rem 1rem' }}>
      <p style={{ fontSize: '1.6rem', margin: 0 }}>⏳</p>
      <p style={{ fontWeight: 700, margin: '.4rem 0' }}>Đang mở app…</p>
      <p className="muted" style={{ margin: 0 }}>Máy chủ đang khởi động, chờ vài giây nhé.</p>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/* Lưới an toàn: 1 trang lỗi thì chỉ trang đó hiện thông báo + nút tải lại,
   thay vì React gỡ cả cây và màn hình đen thui (không còn header). */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown) { console.error('App crash:', error); }
  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h1>😅 Trang này đang gặp lỗi</h1>
          <p className="muted">App không tải được trang này. Thử tải lại trang — nếu vẫn lỗi thì chụp màn hình gửi mình nhé.</p>
          <div className="btn-row">
            <button className="btn" onClick={() => window.location.reload()}>Tải lại trang</button>
            <Link className="btn secondary" to="/" onClick={() => this.setState({ error: null })}>Về trang chủ</Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* Nút đổi sáng/tối ở góc phải header — hiện cả khi chưa đăng nhập. */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
      title={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

function Layout() {
  const { user, logout } = useAuth();
  const { exam, clearExam } = useExam();
  const nav = useNavigate();
  // IELTS-only: chưa setup lần đầu thì chuyển sang /ielts/setup
  // (TOEIC không bao giờ bị chuyển). Xem exam.tsx.
  useIeltsSetupRedirect();
  const brand = exam === 'ielts'
    ? '🎓 Luyện thi IELTS'
    : exam === 'toeic'
      ? '🌸 Luyện thi TOEIC'
      : '📚 Luyện thi TOEIC · IELTS';
  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/">{brand}</Link>
        {user && exam && (
          <nav>
            <NavLink to="/" end>Trang chủ</NavLink>
            {/* "Hôm nay" dùng chung cho CẢ 2 kỳ thi (streak + bad-day dùng chung). */}
            <NavLink to="/today">Hôm nay</NavLink>
            <NavLink to="/practice">Luyện tập</NavLink>
            <NavLink to="/mock">Thi thử</NavLink>
            <NavLink to="/wrong">Câu sai</NavLink>
            {exam === 'ielts' && (
              <>
                <NavLink to="/ielts/diagnostic">Chẩn đoán</NavLink>
                <NavLink to="/ielts/errors">Sổ lỗi</NavLink>
                <NavLink to="/ielts/writing">Viết</NavLink>
                <NavLink to="/ielts/speaking">Nói</NavLink>
              </>
            )}
            <NavLink to="/vocabulary">Từ vựng</NavLink>
            <NavLink to="/stats">Thống kê</NavLink>
            <NavLink to="/leaderboard">Xếp hạng</NavLink>
            {user.role === 'admin' && <NavLink to="/admin">Quản trị</NavLink>}
            <NavLink to="/settings">Cài đặt</NavLink>
          </nav>
        )}
        {user && (
          <div className="topbar-actions">
            {exam && <button className="btn secondary" style={{ padding: '.3rem .7rem' }} onClick={() => { clearExam(); nav('/'); }}>↔ Đổi bài thi</button>}
            <button className="btn secondary" style={{ padding: '.3rem .7rem' }} onClick={() => { logout(); nav('/login'); }}>Đăng xuất ({(user.name || '').trim() || (user.email || '').split('@')[0] || 'Tài khoản'})</button>
          </div>
        )}
        <ThemeToggle />
      </header>
      <main className="container">
        {/* Sau đăng nhập mà chưa chọn kỳ thi thì hiện màn hình chọn kỳ thi;
            các trang chỉ fetch dữ liệu sau khi đã chọn exam. */}
        {user && exam === null ? (
          <ExamPicker />
        ) : (
          <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
            {/* "Hôm nay" dùng chung cho cả 2 kỳ thi. Các route IELTS còn lại chỉ hiện khi exam==='ielts'. */}
            <Route path="/today" element={<RequireAuth><Today /></RequireAuth>} />
            <Route path="/ielts/setup" element={<RequireAuth><IeltsSetup /></RequireAuth>} />
            <Route path="/ielts/diagnostic" element={<RequireAuth><Diagnostic /></RequireAuth>} />
            <Route path="/ielts/errors" element={<RequireAuth><ErrorLog /></RequireAuth>} />
            <Route path="/ielts/writing" element={<RequireAuth><Writing /></RequireAuth>} />
            <Route path="/ielts/speaking" element={<RequireAuth><Speaking /></RequireAuth>} />
            <Route path="/practice" element={<RequireAuth><Practice /></RequireAuth>} />
            <Route path="/practice/test-set/:id" element={<RequireAuth><TestSetDetail /></RequireAuth>} />
            <Route path="/practice/session" element={<RequireAuth><PracticeSession /></RequireAuth>} />
            <Route path="/mock" element={<RequireAuth><MockTest /></RequireAuth>} />
            <Route path="/result/:id" element={<RequireAuth><Result /></RequireAuth>} />
            <Route path="/wrong" element={<RequireAuth><WrongQuestions /></RequireAuth>} />
            <Route path="/vocabulary" element={<RequireAuth><Vocabulary /></RequireAuth>} />
            <Route path="/stats" element={<RequireAuth><Stats /></RequireAuth>} />
            <Route path="/leaderboard" element={<RequireAuth><Leaderboard /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
            <Route path="/admin/test-set/:id" element={<RequireAuth><TestSetAdmin /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="*" element={<p>Không tìm thấy trang. <Link to="/">Về trang chủ</Link></p>} />
          </Routes>
          </ErrorBoundary>
        )}
      </main>
      <footer>LUYỆN THI TOEIC • ĐIỂM THI THỬ LÀ ĐIỂM ƯỚC LƯỢNG, KHÔNG PHẢI ĐIỂM CHÍNH THỨC CỦA ETS • ÂM THANH ĐỌC BẰNG GIỌNG MÁY (TTS) • BAND IELTS TRONG APP LÀ BAND ƯỚC LƯỢNG ĐỂ THAM KHẢO</footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider><ExamProvider><Layout /></ExamProvider></AuthProvider>
    </BrowserRouter>
  );
}
