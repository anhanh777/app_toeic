import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorBox } from '../components';
import { LoadingEffect, activeStyle, useUiSettings } from '../uiSettings';
import { useBrand } from '../brand';
import '../login.css';

/* Đăng nhập quản trị: chỉ email + mật khẩu (không dùng Google login).
   Tài khoản phải có role admin thì mới vào được các module bên trong.
   Backend chạy trên Render free tier nên lần đầu có thể mất vài giây để
   "đánh thức" — sau 2.5s vẫn chưa xong thì hiện lời nhắn chờ thân thiện. */
export default function Login() {
  const { login } = useAuth();
  const { settings } = useUiSettings();
  const { brand } = useBrand();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!busy) { setSlow(false); return; }
    const t = window.setTimeout(() => setSlow(true), 2500);
    return () => window.clearTimeout(t);
  }, [busy]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      nav('/');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Đăng nhập thất bại.'));
      setShake(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <span className="login-blob login-blob--sage" aria-hidden="true" />
      <span className="login-blob login-blob--cream" aria-hidden="true" />
      <span className="login-blob login-blob--sky" aria-hidden="true" />
      <div
        className={`card login-card${shake ? ' login-shake' : ''}`}
        onAnimationEnd={e => { if (e.animationName === 'login-shake') setShake(false); }}
      >
        <div className="login-badge" aria-hidden="true">
          {brand.logoType === 'image' && brand.logoUrl ? (
            <img src={brand.logoUrl} alt="" style={{ width: '2rem', height: '2rem', objectFit: 'cover', borderRadius: 8 }} />
          ) : (
            brand.logoEmoji
          )}
        </div>
        <h1 className="login-title">{brand.name}</h1>
        <p className="muted login-sub">{brand.tagline || 'Luyện thi TOEIC · IELTS'}</p>
        <p className="muted login-sub">Đăng nhập bằng tài khoản admin để quản lý đề thi, câu hỏi, từ vựng và tài khoản.</p>
        <form onSubmit={submit}>
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="VD: demo@toeic.app" />
          </div>
          <div className="login-field">
            <label htmlFor="password">Mật khẩu</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Nhập mật khẩu" />
          </div>
          <ErrorBox error={error} />
          <button className="btn btn-block login-btn" type="submit" disabled={busy}>
            {busy ? (
              <><LoadingEffect effect={activeStyle(settings).loading.loginButton} speed={activeStyle(settings).loading.speed} size="sm" /> Đang đăng nhập…</>
            ) : (
              'Đăng nhập'
            )}
          </button>
          {busy && slow && (
            <p className="login-slow">
              <LoadingEffect effect={activeStyle(settings).loading.page} speed={activeStyle(settings).loading.speed} size="sm" />
              {activeStyle(settings).loading.text}
            </p>
          )}
        </form>
        <p className="muted login-demo">Tài khoản demo admin: <b>demo@toeic.app</b></p>
      </div>
    </div>
  );
}
