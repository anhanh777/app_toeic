import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../auth';
import { ErrorBox } from '../components';
import { LoadingEffect, useUiSettings } from '../uiSettings';
import { useBrand } from '../brand';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function Login() {
  const { login, register, googleLogin } = useAuth();
  const { settings } = useUiSettings();
  const { brand } = useBrand();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
      nav('/');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <>
    {/* Hero thuong hieu — giong ban mobile: logo + ten + tagline, tren the dang nhap. */}
    <div style={{ textAlign: 'center', margin: '2rem auto 0', maxWidth: 480 }}>
      {brand.logoType === 'image' && brand.logoUrl ? (
        <img src={brand.logoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 14 }} />
      ) : (
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto',
          backgroundColor: 'var(--accent)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 36,
        }}>
          {brand.logoEmoji}
        </div>
      )}
      <p style={{ fontWeight: 800, fontSize: 22, margin: '.6rem 0 .2rem' }}>{brand.name}</p>
      {brand.tagline ? <p className="muted" style={{ margin: 0 }}>{brand.tagline}</p> : null}
    </div>
    <div className="card" style={{ maxWidth: 480, margin: '2rem auto' }}>
      <h1 style={{ textAlign: 'center' }}>{mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h1>
      <p className="muted">Luyện thi TOEIC — Listening &amp; Reading. Tài khoản demo: user@toeic.app / user123 (admin: demo@toeic.app / admin123).</p>
      <form onSubmit={submit}>
        {mode === 'register' && (<><label htmlFor="name">Họ tên</label><input id="name" value={name} onChange={e => setName(e.target.value)} required /></>)}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <label htmlFor="password">Mật khẩu</label>
        <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
        <ErrorBox error={error} />
        <div className="btn-row"><button className="btn" disabled={busy}>{busy ? <><LoadingEffect effect={settings.ui.loading.loginButton} speed={settings.ui.loading.speed} size="sm" /> Đang xử lý…</> : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</button></div>
      </form>
      <p><button type="button" className="btn ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
      </button></p>
      <hr />
      <h3>Đăng nhập bằng Google</h3>
      {GOOGLE_CLIENT_ID ? (
        <GoogleLogin
          onSuccess={async (res) => {
            setError(null);
            try { await googleLogin(res.credential || ''); nav('/'); }
            catch (err) { setError(err); }
          }}
          onError={() => setError(new Error('Đăng nhập Google thất bại.'))}
        />
      ) : (
        <div>
          <button className="btn secondary" disabled>Đăng nhập bằng Google</button>
          <p className="muted">Chưa cấu hình Google OAuth — xem README</p>
        </div>
      )}
      <p className="muted"><Link to="/">← Về trang chủ</Link>{' • '}<Link to="/privacy">Chính sách bảo mật</Link></p>
    </div>
    </>
  );
}
