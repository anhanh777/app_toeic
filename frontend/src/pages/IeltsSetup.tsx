// Thiết lập lần đầu cho IELTS (Giai đoạn 1, v3) — IELTS-only.
// Lưu lên backend (POST /api/ielts/profile, setupDone=true) VÀ lưu
// mirror localStorage (ielts_setup_done + ielts_profile). Nếu backend
// lỗi, vẫn giữ bản local và cho đi tiếp — không chặn người học.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type QuitReason } from '../api';
import { ErrorBox } from '../components';

const REASONS: { id: QuitReason; label: string; note: string }[] = [
  { id: 'chan', label: 'Chán', note: 'App sẽ ưu tiên đổi chủ đề thường xuyên và thêm thử thách ngắn.' },
  { id: 'met', label: 'Mệt', note: 'App sẽ ưu tiên chế độ ngày nhẹ (bad-day) và bài ngắn 5–10 phút.' },
  { id: 'khong_thay_tien_bo', label: 'Không thấy tiến bộ', note: 'App sẽ ưu tiên cho bạn thấy Band Compass và biểu đồ lỗi theo tuần.' },
];

export function saveSetupLocal(profile: Record<string, unknown>) {
  try {
    localStorage.setItem('ielts_setup_done', '1');
    localStorage.setItem('ielts_profile', JSON.stringify(profile));
  } catch { /* bỏ qua */ }
}

export default function IeltsSetup() {
  const nav = useNavigate();
  const [examDate, setExamDate] = useState('');
  const [bands, setBands] = useState({ listening: 6.5, reading: 6.5, writing: 6.5, speaking: 6.5 });
  const [quitReason, setQuitReason] = useState<QuitReason | ''>('');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const setBand = (k: keyof typeof bands, v: string) => {
    const n = Number(v);
    if (!Number.isNaN(n)) setBands(b => ({ ...b, [k]: Math.max(0, Math.min(9, n)) }));
  };

  const submit = async (skip: boolean) => {
    setSaving(true); setError(null);
    const profile = skip
      ? { skipped: true, setupDone: true }
      : { examDate: examDate || undefined, targetListening: bands.listening, targetReading: bands.reading, targetWriting: bands.writing, targetSpeaking: bands.speaking, quitReason: quitReason || undefined, setupDone: true };
    saveSetupLocal(profile);
    try { await api.saveIeltsProfile(profile); } catch (e) { setError(e); /* vẫn đi tiếp bằng bản local */ }
    setSaving(false);
    nav('/today');
  };

  return (
    <div>
      <div className="hero">
        <h1>🎓 Thiết lập IELTS của bạn</h1>
        <p className="sub">Mất chưa tới 1 phút — app sẽ cá nhân hoá lộ trình theo mục tiêu và lý do bạn hay bỏ cuộc.</p>
      </div>
      <ErrorBox error={error} />
      <div className="card">
        <label htmlFor="exam-date">Ngày thi dự kiến</label>
        <input id="exam-date" type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
        <h2 style={{ marginTop: '1rem' }}>Band mục tiêu (0–9)</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
          {([
            ['listening', '🎧 Listening'], ['reading', '📖 Reading'],
            ['writing', '✍️ Writing'], ['speaking', '🎤 Speaking'],
          ] as const).map(([k, label]) => (
            <div key={k}>
              <label htmlFor={`band-${k}`}>{label}</label>
              <input id={`band-${k}`} type="number" min={0} max={9} step={0.5} value={bands[k]}
                onChange={e => setBand(k, e.target.value)} />
            </div>
          ))}
        </div>
        <h2 style={{ marginTop: '1rem' }}>Vì sao bạn hay bỏ cuộc khi luyện thi?</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          {REASONS.map(r => (
            <div key={r.id} className={`card part-card${quitReason === r.id ? ' selected' : ''}`} role="button" tabIndex={0}
              onClick={() => setQuitReason(r.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setQuitReason(r.id); }}>
              <strong>{r.label}</strong>
              <p className="muted" style={{ margin: '.3rem 0 0' }}>{r.note}</p>
            </div>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: '1rem' }}>
          <button className="btn" disabled={saving} onClick={() => void submit(false)}>
            {saving ? 'Đang lưu…' : 'Lưu và bắt đầu'}
          </button>
          <button className="btn secondary" disabled={saving} onClick={() => void submit(true)}>Bỏ qua</button>
        </div>
        <p className="muted">Đổi được bất cứ lúc nào ở trang Cài đặt (sẽ bổ sung ở giai đoạn sau).</p>
      </div>
    </div>
  );
}
