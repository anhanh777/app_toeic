// Luyện Speaking IELTS (Giai đoạn 1, v3) — IELTS-only.
// Đề theo Part (Part 1 chủ đề, Part 2 cue card + chuẩn bị 1 phút,
// Part 3 theo bộ). Ghi âm bằng MediaRecorder (audio/webm), nghe lại,
// lưu lên server (base64). Micro bị từ chối thì báo rõ + nút thử lại,
// KHÔNG giả lập bản ghi.
import { useEffect, useRef, useState } from 'react';
import { api, type SpeakingPrompt, type SpeakingRecording } from '../api';
import { ErrorBox } from '../components';
import { fmtClock } from '../ielts-phase1';

export default function Speaking() {
  const [prompts, setPrompts] = useState<SpeakingPrompt[]>([]);
  const [recs, setRecs] = useState<SpeakingRecording[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [active, setActive] = useState<SpeakingPrompt | null>(null);
  const [prepLeft, setPrepLeft] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRecs = () => api.speakingRecordings().then(setRecs).catch(() => undefined);
  useEffect(() => {
    api.speakingPrompts().then(setPrompts).catch(setError);
    loadRecs();
    return () => { stopTracks(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTracks = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (prepRef.current) clearInterval(prepRef.current);
    mediaRef.current?.stream.getTracks().forEach(t => t.stop());
    mediaRef.current = null;
    setRecording(false);
  };

  const startPrep = (p: SpeakingPrompt) => {
    setActive(p);
    setPrepLeft(60);
    if (prepRef.current) clearInterval(prepRef.current);
    prepRef.current = setInterval(() => setPrepLeft(s => {
      if (s <= 1 && prepRef.current) clearInterval(prepRef.current);
      return Math.max(0, s - 1);
    }), 1000);
  };

  const startRec = async (p?: SpeakingPrompt) => {
    const prompt = p ?? active;
    if (!prompt) return;
    setActive(prompt); setMicError(null); setSaved(false);
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
    if (!audioBlob || !active) return;
    setSaving(true); setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
        r.onerror = reject;
        r.readAsDataURL(audioBlob);
      });
      await api.saveSpeakingRecording({
        promptId: active.id, part: active.part,
        audioBase64: base64, mimeType: audioBlob.type, durationSec: elapsed,
      });
      setSaved(true);
      loadRecs();
    } catch (e) { setError(e); } finally { setSaving(false); }
  };

  const byPart = (n: 1 | 2 | 3) => prompts.filter(p => p.part === n);

  return (
    <div>
      <div className="hero">
        <h1>🎤 Luyện Speaking IELTS</h1>
        <p className="sub">Part 1 hỏi đáp · Part 2 nói 1:30–2:00 · Part 3 thảo luận. Đề mẫu — nội dung tự soạn, chưa phải đề thi thật.</p>
      </div>
      <ErrorBox error={error} />
      {micError && (
        <div className="error">{micError} <button className="btn btn-sm" onClick={() => void startRec()}>Thử lại</button></div>
      )}

      {([1, 2, 3] as const).map(n => (
        <div className="card" key={n}>
          <h2>Part {n}{n === 1 ? ' — Hỏi đáp' : n === 2 ? ' — Nói dài (cue card)' : ' — Thảo luận'}</h2>
          {!byPart(n).length && <p className="muted">Chưa có đề mẫu cho Part {n}.</p>}
          {byPart(n).map(p => (
            <div key={p.id} className="panel" style={{ marginBottom: '.5rem' }}>
              <p style={{ margin: '.1rem 0' }}><strong>{p.topic}</strong></p>
              {p.cueCard && <p style={{ margin: '.1rem 0' }}>{p.cueCard}</p>}
              {p.bullets?.length ? <ul>{p.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul> : null}
              {p.questions?.length ? <ul>{p.questions.map((q, i) => <li key={i}>{q}</li>)}</ul> : null}
              <div className="btn-row">
                {n === 2 && <button className="btn btn-sm secondary" onClick={() => startPrep(p)}>Chuẩn bị 1 phút</button>}
                <button className="btn btn-sm" onClick={() => setActive(p)}>Chọn đề này</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {active && (
        <div className="card">
          <h2>🎙️ Đang luyện: {active.topic} (Part {active.part})</h2>
          {active.part === 2 && prepLeft > 0 && <p>⏱️ Chuẩn bị: còn <strong>{fmtClock(prepLeft)}</strong></p>}
          {active.part === 2 && <p className="muted">Nói 1:30–2:00. Nếu dừng quá 5 giây, hít một hơi rồi nói tiếp — đừng bỏ dở.</p>}
          <p>⏱️ Đã nói: <strong>{fmtClock(elapsed)}</strong></p>
          <div className="btn-row">
            {!recording
              ? <button className="btn" onClick={() => void startRec()}>● Bắt đầu ghi âm</button>
              : <button className="btn" onClick={stopRec}>■ Dừng ghi âm</button>}
          </div>
          {audioUrl && (
            <>
              <p>Nghe lại bản ghi:</p>
              <audio controls src={audioUrl} />
              <div className="btn-row" style={{ marginTop: '.5rem' }}>
                <button className="btn btn-sm" disabled={saving} onClick={() => void saveRec()}>
                  {saving ? 'Đang lưu…' : 'Lưu bản ghi'}
                </button>
              </div>
            </>
          )}
          {saved && <p style={{ color: 'var(--green-ink)' }}>✅ Đã lưu bản ghi. Chưa chấm AI — tính năng này sẽ có sau.</p>}
        </div>
      )}

      <div className="card">
        <h2>Bản ghi của tôi ({recs.length})</h2>
        {!recs.length && <p className="muted">Chưa có bản ghi nào.</p>}
        {recs.map(r => (
          <div key={r.id} className="panel" style={{ marginBottom: '.5rem' }}>
            <p style={{ margin: '.1rem 0' }}>
              <strong>Part {r.part}</strong> · {r.promptId}
              {r.durationSec != null ? ` · ${fmtClock(r.durationSec)}` : ''}
              {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString('vi-VN')}` : ''}
              {r.isBaseline ? ' · Bài mẫu chẩn đoán' : ''}
            </p>
            {r.audioData ? <audio controls src={r.audioData} /> : <p className="muted">Không có file audio.</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
