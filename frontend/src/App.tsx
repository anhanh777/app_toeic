import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Login from './pages/Login';
import Home from './pages/Home';
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
  if (loading) return <p>Đang tải…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/">🕹️ TOEIC <span className="arcade">ARCADE</span></Link>
        {user && (
          <nav>
            <NavLink to="/" end>Trang chủ</NavLink>
            <NavLink to="/practice">Luyện tập</NavLink>
            <NavLink to="/mock">Thi thử</NavLink>
            <NavLink to="/wrong">Câu sai</NavLink>
            <NavLink to="/vocabulary">Từ vựng</NavLink>
            <NavLink to="/stats">Thống kê</NavLink>
            <NavLink to="/leaderboard">Xếp hạng</NavLink>
            {user.role === 'admin' && <NavLink to="/admin">Quản trị</NavLink>}
            <NavLink to="/settings">Cài đặt</NavLink>
            <button className="btn secondary" style={{ padding: '.3rem .7rem' }} onClick={() => { logout(); nav('/login'); }}>Đăng xuất ({user.name})</button>
          </nav>
        )}
      </header>
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
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
      </main>
      <footer>🕹️ TOEIC ARCADE — LUYỆN THI TOEIC • ĐIỂM THI THỬ LÀ ĐIỂM ƯỚC LƯỢNG, KHÔNG PHẢI ĐIỂM CHÍNH THỨC CỦA ETS • ÂM THANH ĐỌC BẰNG GIỌNG MÁY (TTS)</footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider><Layout /></AuthProvider>
    </BrowserRouter>
  );
}
