import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Component, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './auth';
import { ExamProvider, ExamPicker, TextSizeControl, TextSizeProvider, useExam, useIeltsSetupRedirect, useTextSize } from './exam';
import { applyTheme, resolveTheme, type Theme } from './theme';
import { LoadingEffect, UiSettingsProvider, useUiSettings } from './uiSettings';
import { BrandProvider, useBrand } from './brand';
import { MenuIconsProvider, useMenuIcons, type MenuIconKey } from './menuIcons';
import Login from './pages/Login';
import Home from './pages/Home';
import Today from './pages/Today';
import IeltsSetup from './pages/IeltsSetup';
import Diagnostic from './pages/Diagnostic';
import ErrorLog from './pages/ErrorLog';
import Writing from './pages/Writing';
import Speaking from './pages/Speaking';
import Practice from './pages/Practice';
import PracticePartSets from './pages/PracticePartSets';
import PracticeSession from './pages/PracticeSession';
import TestSetDetail from './pages/TestSetDetail';
import MockTest from './pages/MockTest';
import Result from './pages/Result';
import WrongQuestions from './pages/WrongQuestions';
import Vocabulary from './pages/Vocabulary';
import Stats from './pages/Stats';
import Leaderboard from './pages/Leaderboard';
import Settings from './pages/Settings';
import Privacy from './pages/Privacy';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { settings } = useUiSettings();
  // Đang chờ máy chủ (Render bản miễn phí ngủ khi không dùng, dậy mất vài
  // giây): hiện thẻ chờ rõ ràng thay vì 1 dòng "Đang tải…" trên nền tối
  // trống — nhìn như trang bị đen. Hiệu ứng + câu chờ theo cài đặt giao diện.
  if (loading) return (
    <div className="card" style={{ marginTop: '1rem', textAlign: 'center', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <LoadingEffect effect={settings.ui.loading.page} speed={settings.ui.loading.speed} size="lg" />
      </div>
      <p style={{ fontWeight: 700, margin: '.4rem 0' }}>Đang mở app…</p>
      <p className="muted" style={{ margin: 0 }}>{settings.ui.loading.text}</p>
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

/* Nút cỡ chữ trên thanh nav: chỉ bấm mới mở/đóng bảng kéo chọn cỡ chữ
   (A- / thanh kéo / A+). KHÔNG mở bằng hover nữa — rê chuột qua khe hở
   giữa nút và bảng sẽ làm bảng tự đóng mất. Bấm ra ngoài hoặc Esc thì đóng. */
function TextSizeMenu() {
  const { level, setLevel, label } = useTextSize();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open ]);
  return (
    <div className="nav-menu-wrap" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Cỡ chữ" aria-expanded={open}
        title={`Cỡ chữ: ${label}`} onClick={() => setOpen(o => !o)}>🔠</button>
      {open && (
        <div className="text-size-popover" role="menu" aria-label="Chọn cỡ chữ">
          <TextSizeControl level={level} setLevel={setLevel} />
        </div>
      )}
    </div>
  );
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

/* ---- Thanh nav kiểu ghim: chỉ tối đa 4 mục ghim hiện trên thanh trên,
   còn lại nằm trong menu ☰ bên phải. Lựa chọn ghim lưu localStorage. ---- */
type NavItem = { path: string; label: string; icon: string; end?: boolean; ieltsOnly?: boolean; menuKey?: MenuIconKey };
const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Trang chủ', icon: '🏠', end: true, menuKey: 'home' },
  { path: '/today', label: 'Hôm nay', icon: '📅', menuKey: 'today' },
  { path: '/practice', label: 'Luyện tập', icon: '✏️', menuKey: 'practice' },
  { path: '/mock', label: 'Thi thử', icon: '⏱️', menuKey: 'mock' },
  { path: '/wrong', label: 'Câu sai', icon: '❌', menuKey: 'wrong' },
  { path: '/ielts/diagnostic', label: 'Chẩn đoán', icon: '🧭', ieltsOnly: true, menuKey: 'diagnostic' },
  { path: '/ielts/errors', label: 'Sổ lỗi', icon: '🐉', ieltsOnly: true, menuKey: 'errors' },
  { path: '/ielts/writing', label: 'Viết', icon: '✍️', ieltsOnly: true, menuKey: 'writing' },
  { path: '/ielts/speaking', label: 'Nói', icon: '🎤', ieltsOnly: true, menuKey: 'speaking' },
  { path: '/vocabulary', label: 'Từ vựng', icon: '📖', menuKey: 'vocabulary' },
  { path: '/stats', label: 'Thống kê', icon: '📊', menuKey: 'stats' },
  { path: '/leaderboard', label: 'Xếp hạng', icon: '🏆', menuKey: 'leaderboard' },
  { path: '/settings', label: 'Cài đặt', icon: '⚙️', menuKey: 'settings' },
];
const NAV_PINS_KEY = 'app_nav_pins';
const MAX_PINS = 4;
const DEFAULT_PINS = ['/', '/today', '/practice', '/mock'];

function useNavPins() {
  const [pins, setPins] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(NAV_PINS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.filter((p): p is string => typeof p === 'string');
      }
    } catch { /* bỏ qua, dùng mặc định */ }
    return DEFAULT_PINS;
  });
  const save = (next: string[]) => {
    setPins(next);
    try { localStorage.setItem(NAV_PINS_KEY, JSON.stringify(next)); } catch { /* bỏ qua */ }
  };
  return { pins, save };
}

function Layout() {
  const { user, logout } = useAuth();
  const { exam, clearExam } = useExam();
  const nav = useNavigate();
  const loc = useLocation();
  // Phong thi/luyen tap mo rong (phuong an A): khung 1400px thay vi 960px.
  const wideRoom = loc.pathname === '/practice/session' || loc.pathname === '/mock';
  // IELTS-only: chưa setup lần đầu thì chuyển sang /ielts/setup
  // (TOEIC không bao giờ bị chuyển). Xem exam.tsx.
  useIeltsSetupRedirect();
  const { brand } = useBrand();
  const { icons } = useMenuIcons();
  const examLabel = exam === 'ielts'
    ? 'Luyện thi IELTS'
    : exam === 'toeic'
      ? 'Luyện thi TOEIC'
      : 'Luyện thi TOEIC · IELTS';
  const { pins, save: savePins } = useNavPins();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  // Tên hiển thị: tên tài khoản, thiếu thì lấy phần trước @ của email.
  const displayName = (user?.name || '').trim() || (user?.email || '').split('@')[0] || 'Tài khoản';
  const availableItems = NAV_ITEMS.filter(it =>
    (!it.ieltsOnly || exam === 'ielts'));
  const pinnedItems = availableItems.filter(it => pins.includes(it.path));
  const togglePin = (path: string) => {
    if (pins.includes(path)) { savePins(pins.filter(p => p !== path)); setPinMsg(null); return; }
    // Giới hạn tính theo số mục ĐANG HIỆN được ghim (mục của kỳ thi khác
    // vẫn giữ trong danh sách nhưng không chiếm chỗ).
    if (pinnedItems.length >= MAX_PINS) {
      setPinMsg(`Chỉ ghim tối đa ${MAX_PINS} mục thôi — bỏ ghim 1 mục rồi ghim mục khác nhé.`);
      return;
    }
    setPinMsg(null);
    savePins([...pins, path]);
  };
  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/">
          {brand.logoType === 'image' && brand.logoUrl ? (
            <img src={brand.logoUrl} alt="" style={{ width: 22, height: 22, borderRadius: 6, verticalAlign: '-4px', marginRight: 6 }} />
          ) : (
            brand.logoEmoji
          )}{' '}
          {brand.name} — {examLabel}
        </Link>
        {user && exam && (
          <nav>
            <div className="topbar-nav-inner">
              {pinnedItems.map(it => (
                <NavLink key={it.path} to={it.path} end={it.end}>{it.label}</NavLink>
              ))}
            </div>
          </nav>
        )}
        {user && exam && (
          <div className="nav-menu-wrap">
            <button type="button" className="nav-menu-btn" aria-label="Mở menu" aria-expanded={menuOpen}
              title="Tất cả mục" onClick={() => { setMenuOpen(o => !o); setProfileOpen(false); setPinMsg(null); }}>☰</button>
            {menuOpen && (
              <>
                <div className="nav-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="nav-menu" role="menu">
                  <p className="nav-menu-title">Tất cả mục — bấm 📌 để ghim lên thanh trên (tối đa {MAX_PINS})</p>
                  {availableItems.map(it => {
                    const pinned = pins.includes(it.path);
                    return (
                      <div key={it.path} className="nav-menu-row">
                        <span className="nav-menu-mid">
                          {/* Icon lấy từ MenuIconsProvider (admin sửa được);
                              mục không có key thì giữ icon cứng. */}
                          <span className="nav-menu-ico" aria-hidden>{it.menuKey ? icons[it.menuKey] : it.icon}</span>
                          <NavLink to={it.path} end={it.end} onClick={() => setMenuOpen(false)}>{it.label}</NavLink>
                        </span>
                        <button type="button" className={`pin-btn${pinned ? ' pinned' : ''}`}
                          aria-label={pinned ? `Bỏ ghim ${it.label}` : `Ghim ${it.label} lên thanh trên`}
                          title={pinned ? 'Bỏ ghim khỏi thanh trên' : 'Ghim lên thanh trên'}
                          onClick={() => togglePin(it.path)}>📌</button>
                      </div>
                    );
                  })}
                  {pinMsg && <p className="pin-limit-msg">{pinMsg}</p>}
                </div>
              </>
            )}
          </div>
        )}
        {user && (
          <div className="topbar-actions">
            <TextSizeMenu />
            {exam && (
              <button type="button" className="icon-btn" aria-label="Đổi bài thi" title="Đổi bài thi"
                onClick={() => { clearExam(); nav('/'); }}>{icons['switch-exam']}</button>
            )}
            <div className="nav-menu-wrap">
              <button type="button" className="avatar-btn" aria-label="Tài khoản của tôi" aria-expanded={profileOpen}
                title={displayName} onClick={() => { setProfileOpen(o => !o); setMenuOpen(false); }}>
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt="" />
                  : displayName[0]?.toUpperCase() ?? '👤'}
              </button>
              {profileOpen && (
                <>
                  <div className="nav-menu-backdrop" onClick={() => setProfileOpen(false)} />
                  <div className="profile-menu" role="menu">
                    <div className="profile-menu-head">
                      <span className="avatar-btn big" aria-hidden>
                        {user.avatarUrl
                          ? <img src={user.avatarUrl} alt="" />
                          : displayName[0]?.toUpperCase() ?? '👤'}
                      </span>
                      <div>
                        <strong>{displayName}</strong>
                        <span className="muted">{user.email}</span>
                      </div>
                    </div>
                    <Link className="profile-menu-item" to="/profile" onClick={() => setProfileOpen(false)}>👤 Hồ sơ &amp; Cài đặt</Link>
                    <button type="button" className="profile-menu-item"
                      onClick={() => { setProfileOpen(false); logout(); nav('/login'); }}>↪ Đăng xuất</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <ThemeToggle />
      </header>
      <main className={wideRoom ? 'container container--wide' : 'container'}>
        {/* Sau đăng nhập mà chưa chọn kỳ thi thì hiện màn hình chọn kỳ thi;
            các trang chỉ fetch dữ liệu sau khi đã chọn exam. */}
        {user && exam === null ? (
          <ExamPicker />
        ) : (
          <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
            {/* "Hôm nay" dùng chung cho cả 2 kỳ thi. Các route IELTS còn lại chỉ hiện khi exam==='ielts'. */}
            <Route path="/today" element={<RequireAuth><Today /></RequireAuth>} />
            <Route path="/ielts/setup" element={<RequireAuth><IeltsSetup /></RequireAuth>} />
            <Route path="/ielts/diagnostic" element={<RequireAuth><Diagnostic /></RequireAuth>} />
            <Route path="/ielts/errors" element={<RequireAuth><ErrorLog /></RequireAuth>} />
            <Route path="/ielts/writing" element={<RequireAuth><Writing /></RequireAuth>} />
            <Route path="/ielts/speaking" element={<RequireAuth><Speaking /></RequireAuth>} />
            <Route path="/practice" element={<RequireAuth><Practice /></RequireAuth>} />
            <Route path="/practice/part/:part" element={<RequireAuth><PracticePartSets /></RequireAuth>} />
            <Route path="/practice/test-set/:id" element={<RequireAuth><TestSetDetail /></RequireAuth>} />
            <Route path="/practice/session" element={<RequireAuth><PracticeSession /></RequireAuth>} />
            <Route path="/mock" element={<RequireAuth><MockTest /></RequireAuth>} />
            <Route path="/result/:id" element={<RequireAuth><Result /></RequireAuth>} />
            <Route path="/wrong" element={<RequireAuth><WrongQuestions /></RequireAuth>} />
            <Route path="/vocabulary" element={<RequireAuth><Vocabulary /></RequireAuth>} />
            <Route path="/stats" element={<RequireAuth><Stats /></RequireAuth>} />
            <Route path="/leaderboard" element={<RequireAuth><Leaderboard /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="*" element={<p>Không tìm thấy trang. <Link to="/">Về trang chủ</Link></p>} />
          </Routes>
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <BrandProvider><MenuIconsProvider><UiSettingsProvider><AuthProvider><ExamProvider><TextSizeProvider><Layout /></TextSizeProvider></ExamProvider></AuthProvider></UiSettingsProvider></MenuIconsProvider></BrandProvider>
    </BrowserRouter>
  );
}
