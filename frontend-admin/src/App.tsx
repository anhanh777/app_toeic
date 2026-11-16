import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';
import { applyTheme, resolveTheme, type Theme } from './theme';
import Login from './pages/Login';

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

function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const displayName = (user?.name || '').trim() || (user?.email || '').split('@')[0] || 'Tài khoản';
  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/">🛠️ Quản trị — Luyện thi TOEIC · IELTS</Link>
        {user && (
          <div className="topbar-actions">
            <span className="muted">{displayName} ({user.email})</span>
            <button type="button" className="icon-btn" aria-label="Đăng xuất" title="Đăng xuất"
              onClick={() => { logout(); nav('/login'); }}>🚪</button>
          </div>
        )}
        <ThemeToggle />
      </header>
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAdmin><DashboardPlaceholder /></RequireAdmin>} />
          <Route path="*" element={<p>Không tìm thấy trang. <Link to="/">Về trang quản trị</Link></p>} />
        </Routes>
      </main>
    </div>
  );
}

/* Trang chờ tạm thời — các module quản trị được chuyển sang ở phần 3–5. */
function DashboardPlaceholder() {
  return (
    <div className="card">
      <h1>Quản trị</h1>
      <p>Web quản trị riêng đang được dựng. Các module (đề TOEIC, đề IELTS, câu hỏi, AI, audio/ảnh, nhập tay, từ vựng, sao lưu, tài khoản) sẽ lần lượt chuyển sang đây.</p>
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
