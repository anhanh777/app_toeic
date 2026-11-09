import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, type Question } from '../api';
import { ErrorBox, partName } from '../components';
import { speak, stopSpeak, pauseSpeak, resumeSpeak, ttsSupported, ttsTextFor } from '../tts';

export default function PracticeSession() {
  const [params] = useSearchParams();
  const part = Number(params.get('part') || 5);
  const count = Number(params.get('count') || 10);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: boolean; correctLabel: string; explanation?: string; transcript?: string; xpAwarded?: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState({ correct: 0, done: 0 });
  const rateRef = useRef(rate);
  rateRef.current = rate;

  useEffect(() => {
    setLoading(true);
    api.questions(part, count).then(setQuestions).catch(setError).finally(() => setLoading(false));
    return () => stopSpeak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, count]);

  useEffect(() => () => stopSpeak(), [idx]);

  const q = questions[idx];
  const isListening = part <= 4;

  const play = () => {
    if (!q) return;
    if (!ttsSupported()) { setError(new Error('Trình duyệt của bạn không hỗ trợ đọc giọng máy (TTS).')); return; }
    setPlaying(true);
    speak(ttsTextFor(q), rateRef.current, () => setPlaying(false));
  };
  const submit = async () => {
    if (!q || !selected) return;
    try {
      const r = await api.practiceAnswer(q.id, selected);
      setResult(r);
      setScore(s => ({ correct: s.correct + (r.correct ? 1 : 0), done: s.done + 1 }));
    } catch (e) { setError(e); }
  };
  const next = () => { stopSpeak(); setSelected(null); setResult(null); setPlaying(false); setIdx(i => i + 1); };

  if (loading) return <p>Đang tải câu hỏi…</p>;
  if (!questions.length) return <div><ErrorBox error={error} /><p>Chưa có câu hỏi cho Part này. <Link to="/practice">Quay lại chọn Part</Link></p></div>;
  if (idx >= questions.length) {
    return (
      <div className="card">
        <h1>Hoàn thành!</h1>
        <p className="big">{score.correct}/{score.done} câu đúng</p>
        <p>{score.done ? `Tỉ lệ đúng: ${Math.round((score.correct / score.done) * 100)}%` : ''}</p>
        <div className="btn-row"><Link className="btn" to="/practice">Luyện Part khác</Link><Link className="btn secondary" to="/wrong">Ôn câu sai</Link></div>
      </div>
    );
  }

  return (
    <div>
      <p className="muted">{partName(part)} — Câu {idx + 1}/{questions.length} • Đúng {score.correct}/{score.done}</p>
      <ErrorBox error={error} />
      <div className="card screen">
        {q.passageText && (<div className="passage">{q.passageText}</div>)}
        <p><strong>{q.content}</strong></p>
        {isListening && (
          <div className="card audio-box">
            <p className="muted">Âm thanh đọc bằng giọng máy (TTS)</p>
            <div className="btn-row">
              <button className="btn" onClick={play}>{playing ? '🔊 Đang đọc…' : '▶ Phát âm thanh'}</button>
              <button className="btn secondary" onClick={() => { pauseSpeak(); setPlaying(false); }}>⏸ Tạm dừng</button>
              <button className="btn secondary" onClick={() => { resumeSpeak(); setPlaying(true); }}>▶ Tiếp tục</button>
              <button className="btn secondary" onClick={play}>↻ Nghe lại</button>
            </div>
            <label htmlFor="rate">Tốc độ đọc: {rate.toFixed(2)}x</label>
            <input id="rate" type="range" min={0.5} max={1.5} step={0.25} value={rate} onChange={e => setRate(Number(e.target.value))} />
          </div>
        )}
        {q.options.map(o => {
          let cls = 'option';
          if (selected === o.label) cls += ' selected';
          if (result) {
            if (o.label === result.correctLabel) cls += ' correct';
            else if (selected === o.label && !result.correct) cls += ' wrong';
          }
          return <button key={o.label} className={cls} disabled={!!result} onClick={() => setSelected(o.label)}><strong>{o.label}.</strong> {o.content}</button>;
        })}
        {!result ? (
          <div className="btn-row"><button className="btn" disabled={!selected} onClick={submit}>Nộp đáp án</button></div>
        ) : (
          <div>
            <p style={{ color: result.correct ? '#15803d' : '#dc2626', fontWeight: 700 }}>
              {result.correct ? '✅ Đúng rồi!' : `❌ Sai rồi. Đáp án đúng: ${result.correctLabel}`} {result.xpAwarded ? `(+${result.xpAwarded} XP)` : ''}
            </p>
            {result.explanation && <p><strong>Giải thích:</strong> {result.explanation}</p>}
            {result.transcript && <p><strong>Transcript:</strong> {result.transcript}</p>}
            <div className="btn-row"><button className="btn" onClick={next}>{idx + 1 < questions.length ? 'Câu tiếp theo →' : 'Xem kết quả'}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
