// Luyện Writing IELTS (Giai đoạn 1, v3) — IELTS-only.
// Đề mẫu (Task 1/Task 2), editor + đếm giờ + đếm từ, nộp bài, xem lại
// bài đã nộp. Chưa chấm AI — sẽ có ở Giai đoạn 2.
import { useEffect, useState } from 'react';
import { api, type WritingSubmission, type WritingTask } from '../api';
import { ErrorBox } from '../components';
import { wordCount } from '../exam';
import { fmtClock, useCountdown } from '../ielts-phase1';

export default function Writing() {
  const [tasks, setTasks] = useState<WritingTask[]>([]);
  const [subs, setSubs] = useState<WritingSubmission[]>([]);
  const [task, setTask] = useState<WritingTask | null>(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [running, setRunning] = useState(false);
  const minutes = task?.minutes ?? 20;
  const { left, reset } = useCountdown(minutes * 60, running, () => setRunning(false));

  const loadSubs = () => api.writingSubmissions().then(setSubs).catch(() => undefined);
  useEffect(() => {
    api.writingTasks().then(setTasks).catch(setError);
    loadSubs();
  }, []);

  const pick = (t: WritingTask) => {
    setTask(t); setContent(''); setSubmitted(false); setRunning(false); reset();
  };

  const submit = async () => {
    if (!task) return;
    setSaving(true); setError(null);
    try {
      await api.submitWriting({ taskId: task.id, content, durationSec: minutes * 60 - left });
      setSubmitted(true); setRunning(false);
      loadSubs();
    } catch (e) { setError(e); } finally { setSaving(false); }
  };

  const minWords = task?.type === 'task1' ? 150 : 250;

  return (
    <div>
      <div className="hero">
        <h1>✍️ Luyện Writing IELTS</h1>
        <p className="sub">Task 1 (20 phút, tối thiểu 150 từ) · Task 2 (40 phút, tối thiểu 250 từ). Đề mẫu — nội dung tự soạn, chưa phải đề thi thật.</p>
      </div>
      <ErrorBox error={error} />

      <div className="card">
        <h2>Chọn đề</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
          {tasks.map(t => (
            <div key={t.id} className={`card part-card${task?.id === t.id ? ' selected' : ''}`} role="button" tabIndex={0}
              onClick={() => pick(t)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') pick(t); }}>
              <span className="pill">{t.type === 'task1' ? 'Task 1' : 'Task 2'}</span>
              {t.isSample && <span className="pill" style={{ marginLeft: '.3rem' }}>Đề mẫu</span>}
              <p style={{ margin: '.4rem 0 0' }}><strong>{t.title}</strong></p>
              <p className="muted" style={{ margin: '.2rem 0 0' }}>{t.minutes} phút</p>
            </div>
          ))}
        </div>
        {!tasks.length && <p className="muted">Chưa có đề Writing mẫu.</p>}
      </div>

      {task && (
        <div className="card">
          <h2>{task.title} <span className="pill">{task.type === 'task1' ? 'Task 1' : 'Task 2'}</span></h2>
          <p>{task.prompt}</p>
          {task.chartData && (
            <table style={{ width: '100%' }}>
              <tbody>{task.chartData.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}</tbody>
            </table>
          )}
          <p>⏱ Còn lại: <strong>{fmtClock(left)}</strong> · {wordCount(content)} từ (tối thiểu {minWords})</p>
          <div className="btn-row">
            <button className="btn btn-sm" disabled={running} onClick={() => setRunning(true)}>Bắt đầu làm bài</button>
          </div>
          <label htmlFor="writing-editor">Bài viết của bạn</label>
          <textarea id="writing-editor" rows={12} value={content} onChange={e => setContent(e.target.value)}
            placeholder="Viết bài của bạn ở đây…" />
          <div className="btn-row" style={{ marginTop: '.6rem' }}>
            <button className="btn" disabled={!content.trim() || saving} onClick={() => void submit()}>
              {saving ? 'Đang nộp…' : 'Nộp bài'}
            </button>
          </div>
          {submitted && <p style={{ color: 'var(--green-ink)' }}>✅ Đã nộp bài. Chưa chấm AI — sẽ có ở Giai đoạn 2.</p>}
        </div>
      )}

      <div className="card">
        <h2>Bài đã nộp ({subs.length})</h2>
        {!subs.length && <p className="muted">Chưa có bài nộp nào.</p>}
        {subs.map(s => (
          <div key={s.id} className="panel" style={{ marginBottom: '.5rem' }}>
            <p style={{ margin: '.1rem 0' }}>
              <strong>{s.taskId}</strong> · {s.wordCount ?? wordCount(s.content)} từ
              {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleDateString('vi-VN')}` : ''}
              {s.isBaseline ? ' · Bài mẫu chẩn đoán' : ''}
            </p>
            <p className="muted" style={{ margin: '.1rem 0' }}>Chưa chấm AI — sẽ có ở Giai đoạn 2.</p>
            <details><summary>Xem bài viết</summary><p style={{ whiteSpace: 'pre-wrap' }}>{s.content}</p></details>
          </div>
        ))}
      </div>
    </div>
  );
}
