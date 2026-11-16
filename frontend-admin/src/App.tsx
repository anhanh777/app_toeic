import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';
import { applyTheme, resolveTheme, type Theme } from './theme';
import Login from './pages/Login';
import Admin from './pages/Admin';
import TestSetAdmin from './pages/TestSetAdmin';
import IeltsAdmin from './pages/IeltsAdmin';
import IeltsTestSetAdmin from './pages/IeltsTestSetAdmin';
import Users from './pages/Users';

/* Nút đổi sáng/tối ở góc phải header. */
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

/* Chỉ tài khoản admin mới được vào web quản trị (mẫu như trang Admin cũ). */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="card"><p>⏳ Đang mở app… Máy chủ đang khởi động</p></div>;
  if (!user) return <div className="card"><h1>Chưa đăng nhập</h1><p><Link to="/login">Đăng nhập</Link> bằng tài khoản admin để tiếp tục.</p></div>;
  if (user.role !== 'admin') {
    return <div className="card"><h1>Không có quyền truy cập</h1><p>Trang quản trị chỉ dành cho tài khoản admin. Tài khoản của bạn không có quyền xem trang này.</p></div>;
  }
  return <>{children}</>;
}

function Dashboard() {
  return (
    <div>
      <h1>Quản trị</h1>
      <div className="card">
        <h2>📚 Đề TOEIC</h2>
        <p>Quản lý bộ đề, câu hỏi, nhận diện bằng AI, audio/ảnh theo Part, nhập tay theo loạt, từ vựng và sao lưu.</p>
        <p><Link className="btn" to="/toeic">Mở quản lý đề TOEIC</Link></p>
      </div>
      <div className="card">
        <h2>🎧 Đề IELTS</h2>
        <p>Quản lý đề IELTS Academic riêng: 19 dạng câu hỏi, câu trả lời gõ tay, giới hạn số từ, ảnh bản đồ, audio từng Section.</p>
        <p><Link className="btn" to="/ielts">Mở quản lý đề IELTS</Link></p>
      </div>
      <div className="card">
        <h2>👤 Tài khoản</h2>
        <p>Thêm, sửa, xóa tài khoản; cập nhật quyền và điểm mục tiêu; đặt lại mật khẩu.</p>
        <p><Link className="btn" to="/users">Mở quản lý tài khoản</Link></p>
      </div>
    </div>
  );
}

function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const displayName = (user?.name || '').trim() || (user?.email || '').split('@')[0] || 'Tài khoản';
  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/">🛠️ Quản trị — Luyện thi TOEIC · IELTS</Link>
        {user && user.role === 'admin' && (
          <nav>
            <div className="topbar-nav-inner">
              <NavLink to="/" end>Trang chủ</NavLink>
              <NavLink to="/toeic">Đề TOEIC</NavLink>
              <NavLink to="/ielts">Đề IELTS</NavLink>
              <NavLink to="/users">Tài khoản</NavLink>
            </div>
          </nav>
        )}
        {user && (
          <div className="topbar-actions">
            <span className="muted">{displayName}</span>
            <button type="button" className="icon-btn" aria-label="Đăng xuất" title="Đăng xuất"
              onClick={() => { logout(); nav('/login'); }}>🚪</button>
          </div>
        )}
        <ThemeToggle />
      </header>
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAdmin><Dashboard /></RequireAdmin>} />
          <Route path="/toeic" element={<RequireAdmin><Admin /></RequireAdmin>} />
          <Route path="/toeic/test-set/:id" element={<RequireAdmin><TestSetAdmin /></RequireAdmin>} />
          <Route path="/ielts" element={<RequireAdmin><IeltsAdmin /></RequireAdmin>} />
          <Route path="/ielts/test-set/:id" element={<RequireAdmin><IeltsTestSetAdmin /></RequireAdmin>} />
          <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
          <Route path="*" element={<p>Không tìm thấy trang. <Link to="/">Về trang quản trị</Link></p>} />
        </Routes>
      </main>
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
