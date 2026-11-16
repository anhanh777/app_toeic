import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorBox } from '../components';

/* Đăng nhập quản trị: chỉ email + mật khẩu (không dùng Google login).
   Tài khoản phải có role admin thì mới vào được các module bên trong. */
export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      nav('/');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Đăng nhập thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '26rem', margin: '4rem auto' }}>
      <h1>🛠️ Quản trị</h1>
      <p className="muted">Đăng nhập bằng tài khoản admin để quản lý đề thi, câu hỏi, từ vựng và tài khoản.</p>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        <label htmlFor="password">Mật khẩu</label>
        <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        <ErrorBox error={error} />
        <button className="btn btn-block" type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
      <p className="muted" style={{ marginTop: '1rem' }}>Tài khoản demo admin: demo@toeic.app</p>
    </div>
  );
}
