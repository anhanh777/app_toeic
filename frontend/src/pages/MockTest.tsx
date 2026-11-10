import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Question, type TestSet } from '../api';
import { ErrorBox, partName } from '../components';
import { speak, stopSpeak, ttsSupported, ttsTextFor } from '../tts';

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function MockTest() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const testSetId = params.get('testSetId') || undefined;
  const [testSet, setTestSet] = useState<TestSet | null>(null);
  const [mode, setMode] = useState<'mini' | 'full'>('mini');
  const [part, setPart] = useState(5);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState(1);
  const submittedRef = useRef(false);

  const start = async () => {
    setBusy(true); setError(null);
    try {
      const t = testSetId
        ? await api.createTest('full', undefined, 120, testSetId)
        : await api.createTest(mode, mode === 'mini' ? part : undefined, 120);
      setAttemptId(t.attemptId);
      setSecondsLeft(t.durationSec || 7200);
      const qs: Question[] = [];
      for (const id of t.questionIds) {
        try { qs.push(await api.question(id)); } catch { /* skip missing */ }
      }
      setQuestions(qs);
      setIdx(0); setAnswers({});
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!attemptId || submittedRef.current) return;
    submittedRef.current = true;
    stopSpeak();
    try { await api.submitTest(attemptId); nav(`/result/${attemptId}`); }
    catch (e) { submittedRef.current = false; setError(e); }
  };

  useEffect(() => {
    if (testSetId) api.testSet(testSetId).then(setTestSet).catch(setError);
  }, [testSetId]);

  useEffect(() => {
    if (!attemptId || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [attemptId, secondsLeft > 0]);

  useEffect(() => {
    if (attemptId && secondsLeft <= 0 && !submittedRef.current) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, attemptId]);

  useEffect(() => () => stopSpeak(), [idx]);

  const choose = async (label: string) => {
    const q = questions[idx];
    if (!q || !attemptId) return;
    setAnswers(a => ({ ...a, [q.id]: label }));
    try { await api.saveTestAnswer(attemptId, q.id, label); } catch (e) { setError(e); }
  };

  if (!attemptId) {
    if (testSetId) {
      return (
        <div className="card">
          <h1>Thi thử cả đề</h1>
          <ErrorBox error={error} />
          {testSet ? (
            <div>
              <p><strong>{testSet.title}</strong></p>
              {testSet.description && <p className="muted">{testSet.description}</p>}
              <p><span className="stat-num">{testSet.totalQuestions}</span> câu • 120 phút</p>
              <p className="muted">{testSet.parts.map(p => `P${p.part} ${p.count}`).join(' · ')}</p>
              {testSet.missing.length > 0 && (
                <p style={{ color: '#B98A1D' }}>⚠ Đề chưa đủ câu chuẩn: {testSet.missing.map(m => `Part ${m.part} thiếu ${m.missing} câu`).join(', ')}.</p>
              )}
            </div>
          ) : <p>Đang tải thông tin đề thi…</p>}
          <p className="muted">Làm đủ {testSet?.totalQuestions || ''} câu, hết giờ tự nộp. Đáp án được lưu tự động sau mỗi câu. Điểm thi thử là <strong>điểm ước lượng</strong> (thang 10–990).</p>
          <div className="btn-row">
            <button className="btn gold" disabled={busy || !testSet || !testSet.totalQuestions} onClick={start}>{busy ? 'Đang tạo đề…' : 'Bắt đầu thi'}</button>
          </div>
        </div>
      );
    }
    return (
      <div className="card">
        <h1>Thi thử</h1>
        <ErrorBox error={error} />
        <label>Loại bài thi</label>
        <select value={mode} onChange={e => setMode(e.target.value as 'mini' | 'full')}>
          <option value="mini">Thi mini — 1 Part</option>
          <option value="full">Thi full — toàn bộ ngân hàng, 120 phút</option>
        </select>
        {mode === 'mini' && (<><label>Chọn Part</label><select value={part} onChange={e => setPart(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>{partName(p)}</option>)}</select></>)}
        <p className="muted">Thi full: làm đủ 120 phút, hết giờ tự nộp. Đáp án được lưu tự động sau mỗi câu. Điểm thi thử là <strong>điểm ước lượng</strong> (thang 10–990). Bài mini chỉ báo số câu đúng/tổng, không có điểm 10–990.</p>
        <div className="btn-row"><button className="btn" disabled={busy} onClick={start}>{busy ? 'Đang tạo đề…' : 'Bắt đầu thi'}</button></div>
      </div>
    );
  }

  const q = questions[idx];
  if (!q) return <p>Đang tải đề thi…</p>;
  const answeredCount = Object.keys(answers).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
        <p className="muted">{testSet ? `📚 ${testSet.title} — ` : ''}Câu {idx + 1}/{questions.length} • Đã trả lời: {answeredCount}</p>
        <span className={`timer ${secondsLeft < 300 ? 'low' : ''}`}>⏱ {fmt(secondsLeft)}</span>
      </div>
      <ErrorBox error={error} />
      <div className="card screen">
        <p className="tag">{partName(q.part)}</p>
        {q.passageText && <div className="passage">{q.passageText}</div>}
        <p><strong>{q.content}</strong></p>
        {q.part <= 4 && (
          <div className="card audio-box">
            <p className="muted">Âm thanh đọc bằng giọng máy (TTS)</p>
            <div className="btn-row">
              <button className="btn secondary" onClick={() => { if (ttsSupported()) speak(ttsTextFor(q), rate); }}>▶ Phát âm thanh</button>
              <button className="btn secondary" onClick={stopSpeak}>⏹ Dừng</button>
            </div>
            <label htmlFor="rate">Tốc độ đọc: {rate.toFixed(2)}x</label>
            <input id="rate" type="range" min={0.5} max={1.5} step={0.25} value={rate} onChange={e => setRate(Number(e.target.value))} />
          </div>
        )}
        {q.options.map(o => (
          <button key={o.label} className={`option ${answers[q.id] === o.label ? 'selected' : ''}`} onClick={() => choose(o.label)}>
            <strong>{o.label}.</strong> {o.content}
          </button>
        ))}
        <div className="btn-row">
          <button className="btn secondary" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}>← Câu trước</button>
          {idx + 1 < questions.length
            ? <button className="btn" onClick={() => setIdx(i => i + 1)}>Câu tiếp →</button>
            : <button className="btn" onClick={submit}>Nộp bài</button>}
        </div>
        <p className="muted">Nộp bài chỉ 1 lần. Hết giờ hệ thống tự nộp.</p>
      </div>
    </div>
  );
}
