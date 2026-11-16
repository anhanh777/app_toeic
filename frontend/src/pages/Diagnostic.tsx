// Chẩn đoán IELTS (Giai đoạn 1, v3) — IELTS-only.
// (a) Listening+Reading: làm mock full TS-024 (90 phút, nghe 1 lần) rồi
// lưu 1 attempt làm chẩn đoán; (b) bản đồ năng lực từ GET diagnostic/latest;
// (c) baseline Writing; (d) baseline Speaking. Tất cả baseline đều ghi rõ
// "Bài mẫu — nội dung tự soạn, chưa phải đề thi thật" và "Chưa chấm AI —
// sẽ có ở Giai đoạn 2".
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Attempt, type DiagnosticMap, type SpeakingPrompt, type WritingTask } from '../api';
import { ErrorBox } from '../components';
import { bandLevel, questionTypeName, wordCount } from '../exam';
import { fmtClock, useCountdown } from '../ielts-phase1';

const SAMPLE_NOTE = 'Bài mẫu — nội dung tự soạn, chưa phải đề thi thật.';
const NO_AI_NOTE = 'Chưa chấm AI — sẽ có ở Giai đoạn 2.';

export default function Diagnostic() {
  const [diag, setDiag] = useState<DiagnosticMap | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const load = () => {
    api.latestDiagnostic().then(setDiag).catch(() => undefined);
    api.testHistory('ielts').then(a => setAttempts(a.filter(x => x.mode === 'full'))).catch(setError);
  };
  useEffect(load, []);

  const saveAsDiagnostic = async (attemptId: number) => {
    setSaving(attemptId); setError(null);
    try { setDiag(await api.completeDiagnostic(attemptId)); } catch (e) { setError(e); } finally { setSaving(null); }
  };

  return (
    <div>
      <div className="hero">
        <h1>🧭 Chẩn đoán IELTS</h1>
        <p className="sub">Biết mình đang ở đâu trước khi luyện — gồm Listening + Reading và bài mẫu Writing/Speaking.</p>
      </div>
      <ErrorBox error={error} />
      <p className="muted">{SAMPLE_NOTE}</p>

      <div className="card">
        <h2>(a) Listening + Reading — thi thử full 90 phút</h2>
        <p>Làm bài thi thử đầy đủ (TS-024, 80 câu, 90 phút, nghe 1 lần) rồi quay lại đây lưu làm chẩn đoán.</p>
        <div className="btn-row">
          <Link className="btn" to="/mock?testSetId=TS-024&exam=ielts">▶ Làm bài chẩn đoán (TS-024)</Link>
        </div>
        {attempts.length > 0 && (
          <>
            <h3 style={{ marginTop: '1rem' }}>Bài thi thử full gần đây</h3>
            {attempts.slice(0, 5).map(a => (
              <div key={a.id} className="panel" style={{ marginBottom: '.5rem', display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>#{a.id} · {a.finished_at ? new Date(a.finished_at).toLocaleDateString('vi-VN') : ''}</span>
                <span>Band {a.overallBand ?? '—'} (L {a.listeningBand ?? '—'} · R {a.readingBand ?? '—'})</span>
                <button className="btn btn-sm" disabled={saving === a.id} onClick={() => void saveAsDiagnostic(a.id)}>
                  {saving === a.id ? 'Đang lưu…' : 'Lưu làm chẩn đoán'}
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>(b) Bản đồ năng lực</h2>
        {!diag ? (
          <p className="muted">Chưa có chẩn đoán. Làm bài thi thử full rồi lưu làm chẩn đoán để xem bản đồ năng lực.</p>
        ) : (
          <>
            <p>
              Band ước lượng: Listening <strong>{diag.bands?.listening ?? '—'}</strong> · Reading <strong>{diag.bands?.reading ?? '—'}</strong> · Tổng <strong>Band {diag.bands?.overall ?? '—'}</strong>
              {diag.bands?.overall != null && <span className="muted"> ({bandLevel(diag.bands.overall)})</span>}
              {diag.totalCorrect != null && <span className="muted"> · {diag.totalCorrect} câu đúng</span>}
            </p>
            {diag.bySection && <ScoreTable title="Theo Section" data={diag.bySection} />}
            {diag.byPassage && <ScoreTable title="Theo Passage" data={diag.byPassage} />}
            {diag.byType && (
              <>
                <h3>Theo dạng câu</h3>
                <table style={{ width: '100%' }}>
                  <thead><tr><th style={{ textAlign: 'left' }}>Dạng câu</th><th>Đúng</th><th>Tổng</th><th>Tỉ lệ</th></tr></thead>
                  <tbody>
                    {Object.entries(diag.byType).map(([t, v]) => (
                      <tr key={t}>
                        <td>{questionTypeName(t)}</td><td>{v.correct}</td><td>{v.total}</td>
                        <td>{v.total ? `${Math.round((v.correct / v.total) * 100)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {diag.weakestTypes?.length ? (
              <p><strong>3 dạng yếu nhất:</strong> {diag.weakestTypes.slice(0, 3).map(questionTypeName).join(' · ')}</p>
            ) : null}
            <p className="muted">Nên làm lại chẩn đoán rút gọn mỗi 2 tuần để thấy tiến bộ.</p>
          </>
        )}
      </div>

      <WritingBaseline />
      <SpeakingBaseline />
    </div>
  );
}

function ScoreTable({ title, data }: { title: string; data: Record<string, { correct: number; total: number }> }) {
  return (
    <>
      <h3>{title}</h3>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} style={{ marginBottom: '.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{k}</span><span>{v.correct}/{v.total}</span></div>
          <div className="bar"><i style={{ width: `${v.total ? (v.correct / v.total) * 100 : 0}%` }} /></div>
        </div>
      ))}
    </>
  );
}

/* ================= (c) Writing baseline ================= */
function WritingBaseline() {
  const [tasks, setTasks] = useState<WritingTask[]>([]);
  const [task, setTask] = useState<WritingTask | null>(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const minutes = task?.minutes ?? 20;
  const { left, reset } = useCountdown(minutes * 60, running, () => setRunning(false));

  useEffect(() => { api.writingTasks().then(setTasks).catch(setError); }, []);

  const pick = (t: WritingTask) => {
    setTask(t); setContent(''); setSubmitted(false); setRunning(false); reset();
  };
  const submit = async () => {
    if (!task) return;
    setSaving(true); setError(null);
    try {
      await api.submitWriting({ taskId: task.id, content, durationSec: minutes * 60 - left, isBaseline: true });
      setSubmitted(true); setRunning(false);
    } catch (e) { setError(e); } finally { setSaving(false); }
  };

  return (
    <div className="card">
      <h2>(c) Baseline Writing</h2>
      <p className="muted">{SAMPLE_NOTE} {NO_AI_NOTE}</p>
      <ErrorBox error={error} />
      <div className="btn-row" style={{ flexWrap: 'wrap' }}>
        {tasks.map(t => (
          <button key={t.id} type="button" className={`btn btn-sm${task?.id === t.id ? ' gold' : ' secondary'}`} onClick={() => pick(t)}>
            {t.type === 'task1' ? 'Task 1 (20 phút)' : 'Task 2 (40 phút)'} — {t.title}
          </button>
        ))}
      </div>
      {!tasks.length && <p className="muted">Chưa có đề Writing mẫu.</p>}
      {task && (
        <>
          <h3 style={{ marginTop: '1rem' }}>{task.title}</h3>
          <p>{task.prompt}</p>
          {task.chartData && (
            <table style={{ width: '100%' }}>
              <tbody>{task.chartData.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}</tbody>
            </table>
          )}
          <p>⏱ Còn lại: <strong>{fmtClock(left)}</strong> · {wordCount(content)} từ</p>
          <div className="btn-row">
            <button className="btn btn-sm" disabled={running} onClick={() => setRunning(true)}>Bắt đầu làm bài</button>
          </div>
          <label htmlFor="diag-writing">Bài viết của bạn</label>
          <textarea id="diag-writing" rows={10} value={content} onChange={e => setContent(e.target.value)}
            placeholder="Viết bài của bạn ở đây…" />
          <p className="muted">{wordCount(content)} từ · Tối thiểu Task 1: 150 từ, Task 2: 250 từ.</p>
          <div className="btn-row">
            <button className="btn btn-sm" disabled={!content.trim() || saving} onClick={() => void submit()}>
              {saving ? 'Đang nộp…' : 'Nộp bài mẫu'}
            </button>
          </div>
          {submitted && <p style={{ color: 'var(--green-ink)' }}>✅ Đã lưu bài mẫu. {NO_AI_NOTE}</p>}
        </>
      )}
    </div>
  );
}

/* ================= (d) Speaking baseline ================= */
function SpeakingBaseline() {
  const [prompts, setPrompts] = useState<SpeakingPrompt[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activePrompt, setActivePrompt] = useState<SpeakingPrompt | null>(null);
  const [prepLeft, setPrepLeft] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.speakingPrompts().then(setPrompts).catch(setError);
    return () => { stopAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAll = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (prepRef.current) clearInterval(prepRef.current);
    mediaRef.current?.stream.getTracks().forEach(t => t.stop());
    mediaRef.current = null;
    setRecording(false);
  };

  const startPrep = (p: SpeakingPrompt) => {
    setActivePrompt(p);
    setPrepLeft(60);
    if (prepRef.current) clearInterval(prepRef.current);
    prepRef.current = setInterval(() => setPrepLeft(s => {
      if (s <= 1 && prepRef.current) clearInterval(prepRef.current);
      return Math.max(0, s - 1);
    }), 1000);
  };

  const startRec = async () => {
    setMicError(null); setSaved(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } catch {
      setMicError('Không truy cập được micro. Hãy cho phép quyền micro trong trình duyệt rồi bấm "thử lại".');
    }
  };

  const stopRec = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  };

  const saveRec = async () => {
    if (!audioBlob || !activePrompt) return;
    setSaving(true); setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
        r.onerror = reject;
        r.readAsDataURL(audioBlob);
      });
      await api.saveSpeakingRecording({
        promptId: activePrompt.id, part: activePrompt.part,
        audioBase64: base64, mimeType: audioBlob.type, durationSec: elapsed, isBaseline: true,
      });
      setSaved(true);
    } catch (e) { setError(e); } finally { setSaving(false); }
  };

  const byPart = (n: 1 | 2 | 3) => prompts.filter(p => p.part === n);

  return (
    <div className="card">
      <h2>(d) Baseline Speaking</h2>
      <p className="muted">{SAMPLE_NOTE} {NO_AI_NOTE}</p>
      <ErrorBox error={error} />
      {micError && (
        <div className="error">{micError} <button className="btn btn-sm" onClick={() => void startRec()}>Thử lại</button></div>
      )}
      {([1, 2, 3] as const).map(n => (
        <div key={n}>
          <h3>Part {n}</h3>
          {byPart(n).map(p => (
            <div key={p.id} className="panel" style={{ marginBottom: '.5rem' }}>
              <p style={{ margin: '.1rem 0' }}><strong>{p.topic}</strong></p>
              {p.cueCard && <p style={{ margin: '.1rem 0' }}>{p.cueCard}</p>}
              {p.bullets?.length ? <ul>{p.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul> : null}
              {p.questions?.length ? <ul>{p.questions.map((q, i) => <li key={i}>{q}</li>)}</ul> : null}
              <div className="btn-row">
                {n === 2 && <button className="btn btn-sm secondary" onClick={() => startPrep(p)}>Chuẩn bị 1 phút</button>}
                <button className="btn btn-sm" onClick={() => setActivePrompt(p)}>Chọn đề này để nói</button>
              </div>
            </div>
          ))}
        </div>
      ))}
      {!prompts.length && <p className="muted">Chưa có đề Speaking mẫu.</p>}
      {activePrompt && (
        <div className="panel">
          <p><strong>Đang nói:</strong> {activePrompt.topic} (Part {activePrompt.part})</p>
          {activePrompt.part === 2 && prepLeft > 0 && <p>⏱ Chuẩn bị: còn <strong>{fmtClock(prepLeft)}</strong></p>}
          {activePrompt.part === 2 && <p className="muted">Nói 1:30–2:00. Nếu dừng quá 5 giây, hít một hơi rồi nói tiếp — đừng bỏ dở.</p>}
          <p>⏱ Đã nói: <strong>{fmtClock(elapsed)}</strong></p>
          <div className="btn-row">
            {!recording
              ? <button className="btn btn-sm" onClick={() => void startRec()}>● Bắt đầu ghi âm</button>
              : <button className="btn btn-sm" onClick={stopRec}>■ Dừng ghi âm</button>}
          </div>
          {audioUrl && (
            <>
              <p>Nghe lại bản ghi:</p>
              <audio controls src={audioUrl} />
              <div className="btn-row" style={{ marginTop: '.5rem' }}>
                <button className="btn btn-sm" disabled={saving} onClick={() => void saveRec()}>
                  {saving ? 'Đang lưu…' : 'Lưu bản ghi mẫu'}
                </button>
              </div>
            </>
          )}
          {saved && <p style={{ color: 'var(--green-ink)' }}>✅ Đã lưu bản ghi mẫu. {NO_AI_NOTE}</p>}
        </div>
      )}
    </div>
  );
}
