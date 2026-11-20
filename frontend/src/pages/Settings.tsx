import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, hideOnLbOf, targetScoreOf } from '../api';
import type { IeltsProfile } from '../api';
import { useAuth } from '../auth';
import { useExam } from '../exam';
import { ErrorBox } from '../components';
import { uploadToCloudinary } from '../cloudinary';

const QUIT_REASON_OPTIONS = [
  { value: '', label: '— Chưa chọn —' },
  { value: 'chan', label: 'Chán, mất hứng học' },
  { value: 'met', label: 'Mệt, không có thời gian' },
  { value: 'khong_thay_tien_bo', label: 'Không thấy tiến bộ' },
];

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const bandOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

export default function Settings() {
  const { user, setUser } = useAuth();
  const { exam } = useExam();
  const displayName = (user?.name || '').trim() || (user?.email || '').split('@')[0] || 'Tài khoản';

  const [name, setName] = useState(user?.name ?? '');
  const [target, setTarget] = useState(targetScoreOf(user));
  const [hide, setHide] = useState(hideOnLbOf(user));
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');

  // Ảnh đại diện.
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');

  // Hồ sơ IELTS (chỉ khi đã có hồ sơ, hoặc đang dùng bài thi IELTS).
  const [ieltsLoaded, setIeltsLoaded] = useState(false);
  const [hasIelts, setHasIelts] = useState(false);
  const [ieltsDate, setIeltsDate] = useState('');
  const [tL, setTL] = useState('');
  const [tR, setTR] = useState('');
  const [tW, setTW] = useState('');
  const [tS, setTS] = useState('');
  const [quitReason, setQuitReason] = useState('');
  const [ieltsMsg, setIeltsMsg] = useState('');

  useEffect(() => {
    let alive = true;
    api.ieltsProfile()
      .then((p) => {
        if (!alive) return;
        const has = !!(
          p &&
          (p.setupDone ||
            p.skipped ||
            p.examDate ||
            p.targetListening != null ||
            p.targetReading != null ||
            p.targetWriting != null ||
            p.targetSpeaking != null ||
            p.quitReason)
        );
        setHasIelts(has);
        if (has) {
          setIeltsDate(p.examDate || '');
          setTL(p.targetListening != null ? String(p.targetListening) : '');
          setTR(p.targetReading != null ? String(p.targetReading) : '');
          setTW(p.targetWriting != null ? String(p.targetWriting) : '');
          setTS(p.targetSpeaking != null ? String(p.targetSpeaking) : '');
          setQuitReason(p.quitReason || '');
        }
        setIeltsLoaded(true);
      })
      .catch(() => {
        if (alive) setIeltsLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg(''); setAvatarMsg('');
    try {
      const u = await api.updateMe({ name: name.trim() || undefined, targetScore: target, hideOnLeaderboard: hide });
      setUser(u); setMsg('Đã lưu hồ sơ.');
    } catch (err) { setError(err); }
  };

  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null); setAvatarMsg(''); setAvatarBusy(true);
    try {
      const cfg = await api.mediaConfigPublic();
      if (!cfg.configured) throw new Error('Chưa cấu hình Cloudinary trên máy chủ.');
      const url = await uploadToCloudinary(file, 'toeic/avatars', cfg);
      const u = await api.updateMe({ avatarUrl: url });
      setUser(u); setAvatarMsg('Đã đổi ảnh đại diện.');
    } catch (err) { setError(err); }
    finally { setAvatarBusy(false); }
  };

  const removeAvatar = async () => {
    setError(null); setAvatarMsg(''); setAvatarBusy(true);
    try {
      const u = await api.updateMe({ avatarUrl: null });
      setUser(u); setAvatarMsg('Đã gỡ ảnh đại diện.');
    } catch (err) { setError(err); }
    finally { setAvatarBusy(false); }
  };

  const saveIelts = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setIeltsMsg('');
    try {
      const body: Partial<IeltsProfile> = {
        examDate: ieltsDate || null,
        targetListening: bandOrNull(tL),
        targetReading: bandOrNull(tR),
        targetWriting: bandOrNull(tW),
        targetSpeaking: bandOrNull(tS),
        quitReason: (quitReason || null) as IeltsProfile['quitReason'],
      };
      await api.saveIeltsProfile(body);
      setIeltsMsg('Đã lưu hồ sơ IELTS.');
    } catch (err) { setError(err); }
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg('');
    try { await api.changePassword(current, next); setMsg('Đã đổi mật khẩu.'); setCurrent(''); setNext(''); }
    catch (err) { setError(err); }
  };

  const showIelts = ieltsLoaded && (hasIelts || exam === 'ielts');

  return (
    <div>
      <h1>Hồ sơ cá nhân</h1>
      <p className="muted">Xem và cập nhật thông tin tài khoản của bạn.</p>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      {avatarMsg && <div className="success">{avatarMsg}</div>}
      {ieltsMsg && <div className="success">{ieltsMsg}</div>}

      <form className="card" onSubmit={saveProfile}>
        <h2>Thông tin tài khoản</h2>
        <div className="profile-avatar-row">
          <span className="profile-avatar" aria-hidden>
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt="Ảnh đại diện" />
              : displayName[0]?.toUpperCase() ?? '👤'}
          </span>
          <div className="profile-avatar-actions">
            <label className="btn secondary" htmlFor="avatarFile" style={{ cursor: 'pointer' }}>
              {avatarBusy ? 'Đang tải ảnh…' : 'Đổi ảnh đại diện'}
            </label>
            <input id="avatarFile" type="file" accept="image/png,image/jpeg" hidden
              onChange={onAvatarFile} disabled={avatarBusy} />
            {user?.avatarUrl && (
              <button type="button" className="btn secondary" onClick={removeAvatar} disabled={avatarBusy}>Gỡ ảnh</button>
            )}
            <p className="muted" style={{ margin: 0 }}>Ảnh .png/.jpg, tối đa 5MB.</p>
          </div>
        </div>
        <dl className="profile-view">
          <div><dt>Email</dt><dd>{user?.email || '—'}</dd></div>
          <div><dt>Vai trò</dt><dd>{user?.role === 'admin' ? 'Quản trị viên' : 'Học viên'}</dd></div>
          <div><dt>Ngày tạo tài khoản</dt><dd>{formatDate(user?.createdAt)}</dd></div>
          <div><dt>Đăng nhập</dt><dd>{user?.googleId ? 'Đã liên kết tài khoản Google' : 'Email và mật khẩu'}</dd></div>
        </dl>
        <label htmlFor="displayName">Tên hiển thị</label>
        <input id="displayName" value={name} onChange={e => setName(e.target.value)} placeholder="Tên bạn muốn hiện trên app" />
        <label htmlFor="target">Mục tiêu điểm TOEIC (10–990)</label>
        <input id="target" type="number" min={10} max={990} value={target} onChange={e => setTarget(Number(e.target.value))} />
        <label><input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)} style={{ width: 'auto' }} /> Ẩn tên trên bảng xếp hạng (hiện là “Người dùng ẩn danh”)</label>
        <div className="btn-row"><button className="btn">Lưu hồ sơ</button></div>
      </form>

      {showIelts && (
        <form className="card" onSubmit={saveIelts}>
          <h2>Hồ sơ IELTS</h2>
          {hasIelts ? (
            <>
              <label htmlFor="examDate">Ngày thi dự kiến</label>
              <input id="examDate" type="date" value={ieltsDate} onChange={e => setIeltsDate(e.target.value)} />
              <div className="ielts-band-grid">
                <div>
                  <label htmlFor="bandL">Band mục tiêu — Nghe</label>
                  <input id="bandL" type="number" min={0} max={9} step={0.5} value={tL} onChange={e => setTL(e.target.value)} placeholder="VD: 7.5" />
                </div>
                <div>
                  <label htmlFor="bandR">Band mục tiêu — Đọc</label>
                  <input id="bandR" type="number" min={0} max={9} step={0.5} value={tR} onChange={e => setTR(e.target.value)} placeholder="VD: 7.5" />
                </div>
                <div>
                  <label htmlFor="bandW">Band mục tiêu — Viết</label>
                  <input id="bandW" type="number" min={0} max={9} step={0.5} value={tW} onChange={e => setTW(e.target.value)} placeholder="VD: 7.0" />
                </div>
                <div>
                  <label htmlFor="bandS">Band mục tiêu — Nói</label>
                  <input id="bandS" type="number" min={0} max={9} step={0.5} value={tS} onChange={e => setTS(e.target.value)} placeholder="VD: 7.0" />
                </div>
              </div>
              <label htmlFor="quitReason">Lý do hay bỏ cuộc</label>
              <select id="quitReason" value={quitReason} onChange={e => setQuitReason(e.target.value)}>
                {QUIT_REASON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="btn-row"><button className="btn">Lưu hồ sơ IELTS</button></div>
            </>
          ) : (
            <p>Bạn chưa thiết lập hồ sơ IELTS. <Link className="btn secondary btn-sm" to="/ielts/setup">Thiết lập ngay →</Link></p>
          )}
        </form>
      )}

      <form className="card" onSubmit={changePw}>
        <h2>Đổi mật khẩu</h2>
        <p className="muted">Tài khoản đăng nhập bằng Google không có mật khẩu — bỏ qua mục này.</p>
        <label htmlFor="current">Mật khẩu hiện tại</label>
        <input id="current" type="password" value={current} onChange={e => setCurrent(e.target.value)} required />
        <label htmlFor="next">Mật khẩu mới</label>
        <input id="next" type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={6} />
        <div className="btn-row"><button className="btn">Đổi mật khẩu</button></div>
      </form>

      <p><Link className="btn secondary btn-sm" to="/stats">Xem thống kê học tập của bạn →</Link></p>
    </div>
  );
}
