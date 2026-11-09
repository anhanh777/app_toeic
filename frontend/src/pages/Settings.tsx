import { useState } from 'react';
import { api, hideOnLbOf, targetScoreOf } from '../api';
import { useAuth } from '../auth';
import { ErrorBox } from '../components';

export default function Settings() {
  const { user, setUser } = useAuth();
  const [target, setTarget] = useState(targetScoreOf(user));
  const [hide, setHide] = useState(hideOnLbOf(user));
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg('');
    try {
      const u = await api.updateMe({ targetScore: target, hideOnLeaderboard: hide });
      setUser(u); setMsg('Đã lưu cài đặt.');
    } catch (err) { setError(err); }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg('');
    try { await api.changePassword(current, next); setMsg('Đã đổi mật khẩu.'); setCurrent(''); setNext(''); }
    catch (err) { setError(err); }
  };

  return (
    <div>
      <h1>Cài đặt</h1>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      <form className="card" onSubmit={saveProfile}>
        <h2>Mục tiêu &amp; bảng xếp hạng</h2>
        <label htmlFor="target">Mục tiêu điểm TOEIC (10–990)</label>
        <input id="target" type="number" min={10} max={990} value={target} onChange={e => setTarget(Number(e.target.value))} />
        <label><input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)} style={{ width: 'auto' }} /> Ẩn tên trên bảng xếp hạng (hiện là “Người dùng ẩn danh”)</label>
        <div className="btn-row"><button className="btn">Lưu cài đặt</button></div>
      </form>
      <form className="card" onSubmit={changePw}>
        <h2>Đổi mật khẩu</h2>
        <p className="muted">Tài khoản đăng nhập bằng Google không có mật khẩu — bỏ qua mục này.</p>
        <label htmlFor="current">Mật khẩu hiện tại</label>
        <input id="current" type="password" value={current} onChange={e => setCurrent(e.target.value)} required />
        <label htmlFor="next">Mật khẩu mới</label>
        <input id="next" type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={6} />
        <div className="btn-row"><button className="btn">Đổi mật khẩu</button></div>
      </form>
    </div>
  );
}
