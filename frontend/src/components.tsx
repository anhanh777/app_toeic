import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from './api';
import { speak, stopSpeak, pauseSpeak, resumeSpeak, ttsSupported } from './tts';

/** Small shared UI helpers. */
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error);
  return <div className="error">{msg}</div>;
}
export function useAsync<T>(fn: () => Promise<T>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (): Promise<T | null> => {
    setLoading(true); setError(null);
    try { return await fn(); } catch (e) { setError(e); return null; } finally { setLoading(false); }
  };
  return { loading, error, run, setError };
}
export const PART_NAMES: Record<number, string> = {
  1: 'Part 1 — Mô tả tranh', 2: 'Part 2 — Hỏi & đáp', 3: 'Part 3 — Hội thoại',
  4: 'Part 4 — Bài nói ngắn', 5: 'Part 5 — Hoàn thành câu', 6: 'Part 6 — Hoàn thành đoạn văn',
  7: 'Part 7 — Đọc hiểu',
};
export function partName(p: number) { return PART_NAMES[p] || `Part ${p}`; }
export function sectionOf(part: number) { return part <= 4 ? 'Listening' : 'Reading'; }

/** Rank tier from a TOEIC total score (same bands as scoreLevel in api.ts). */
export function tierOf(total?: number | null): { name: string; icon: string; cls: string } {
  if (total == null) return { name: 'Chưa xếp hạng', icon: '✦', cls: 'tier-bronze' };
  if (total < 450) return { name: 'Đồng', icon: '🥉', cls: 'tier-bronze' };
  if (total < 600) return { name: 'Bạc', icon: '🥈', cls: 'tier-silver' };
  if (total < 750) return { name: 'Vàng', icon: '🥇', cls: 'tier-gold' };
  if (total < 900) return { name: 'Bạch kim', icon: '💎', cls: 'tier-platinum' };
  return { name: 'Kim cương', icon: '👑', cls: 'tier-diamond' };
}

/** Level from total XP: 100 XP = 1 level. */
export function xpLevel(totalXp: number) {
  const xp = Math.max(0, totalXp || 0);
  return { level: Math.floor(xp / 100) + 1, progress: xp % 100 };
}

export function XpBar({ xp, gold }: { xp: number; gold?: boolean }) {
  const { level, progress } = xpLevel(xp);
  return (
    <div>
      <div className="xp-label"><span>⭐ Cấp {level}</span><span>{progress}/100 XP</span></div>
      <div className={`xpbar${gold ? ' gold' : ''}`}><i style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

export function TierBadge({ total }: { total?: number | null }) {
  const t = tierOf(total);
  return <span className={`tier ${t.cls}`}>{t.icon} {t.name}</span>;
}

export function RankChip({ rank }: { rank: number }) {
  const cls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
  return <span className={`rank-chip ${cls}`}>#{rank}</span>;
}

/**
 * Trình phát audio cho phần Nghe (Part 1–4), dùng chung cho
 * PracticeSession và MockTest — vẫn CHỈ CÓ ĐÚNG 1 NÚT PHÁT DUY NHẤT
 * cho mỗi khối audio: bấm để phát, bấm lại để tạm dừng, phát xong nút
 * thành "Nghe lại". Không còn thanh điều khiển mặc định của <audio>,
 * không còn hàng nhiều nút TTS. Thẻ <audio> ẩn, điều khiển bằng state
 * React. Nhưng vẫn chỉnh được từng đoạn như bản đầu: vạch tiến trình
 * bấm/kéo được để nhảy tới đoạn cần nghe (seek) + thanh trượt tốc độ
 * phát 0.5–1.5x (áp dụng cả file audio lẫn TTS).
 * - Có audioUrl (file mp3 đã upload / AI sinh, gồm audio của đoạn cho
 *   Part 3/4 do backend gộp): 1 nút + vạch tiến trình bấm được + giờ
 *   phát + thanh trượt tốc độ.
 * - Không có audioUrl: TTS (giọng máy) cũng chỉ 1 nút, cùng nhãn như
 *   khi có file, kèm thanh trượt tốc độ (TTS không tua được).
 * - Không có audioUrl lẫn chữ để đọc TTS (câu chỉ-nghe chưa có file):
 *   khối .audio-missing với nút "🔊 Nghe" disabled — giữ nguyên.
 * Khi stopKey đổi (chuyển câu) thì dừng cả audio element lẫn TTS.
 * Chỉ 1 hộp audio được phát cùng lúc trong toàn trang: khi 1 hộp bắt đầu
 * phát, hộp đang phát trước đó tự dừng (kẻo 2 file nghe chồng lên nhau —
 * trang thi full có tới 4 nút nghe Part + nút từng câu ở đề chưa có audio).
 */
let activeStop: (() => void) | null = null;

export function ListeningAudio({
  audioUrl, ttsText, stopKey, onError,
}: {
  audioUrl?: string | null;
  ttsText: string;
  /** Đổi giá trị này khi chuyển câu — audio đang phát sẽ bị dừng. */
  stopKey: unknown;
  onError?: (e: unknown) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // idle: chưa phát | playing: đang phát | paused: đã tạm dừng | ended: phát xong
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused' | 'ended'>('idle');
  const [progress, setProgress] = useState(0);
  // Tốc độ phát (khôi phục như bản đầu: 0.5–1.5x) + thời lượng/vị trí hiện tại
  // để hiển thị giờ phát và tua tới từng đoạn.
  const [rate, setRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const barRef = useRef<HTMLDivElement | null>(null);
  const seekingRef = useRef(false);
  const rateId = useId();
  // Thế hệ phát: để callback onEnd của TTS cũ không đổi nhầm trạng thái
  // sau khi đã dừng (stopKey đổi / unmount).
  const genRef = useRef(0);

  const stopAllRef = useRef<() => void>(() => {});
  const stopAll = () => {
    genRef.current += 1;
    audioRef.current?.pause();
    stopSpeak();
    setStatus('idle');
    setProgress(0);
    setCurrentTime(0);
    if (activeStop === stopAllRef.current) activeStop = null;
  };
  // Giữ ref luôn trỏ tới stopAll mới nhất (stopAll tạo lại mỗi lần render).
  useEffect(() => { stopAllRef.current = stopAll; });
  // Giành quyền phát: dừng hộp đang phát trước đó (nếu khác hộp này) rồi
  // đăng ký hộp này là hộp đang phát.
  const claimPlayback = () => {
    if (activeStop && activeStop !== stopAllRef.current) activeStop();
    activeStop = stopAllRef.current;
  };

  useEffect(() => { stopAll(); }, [stopKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Áp tốc độ phát cho file audio (giống bản đầu).
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate, audioUrl]);

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };
  // Nhảy tới từng đoạn trong file audio: bấm hoặc kéo trên vạch tiến trình.
  const seekFromEvent = (e: React.PointerEvent) => {
    const el = audioRef.current;
    const bar = barRef.current;
    if (!el || !bar || !el.duration) return;
    const r = bar.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    el.currentTime = frac * el.duration;
    setProgress(frac);
    setCurrentTime(frac * el.duration);
    if (status === 'ended') setStatus('paused');
  };

  const playFile = () => {
    const el = audioRef.current;
    if (!el) return;
    claimPlayback();
    if (status === 'ended') { el.currentTime = 0; setProgress(0); }
    el.play().catch(() => setStatus('idle'));
    setStatus('playing');
  };
  const pauseFile = () => {
    audioRef.current?.pause();
    setStatus('paused');
  };
  const playTts = () => {
    if (!ttsSupported()) {
      onError?.(new Error('Trình duyệt của bạn không hỗ trợ đọc giọng máy (TTS).'));
      return;
    }
    const gen = genRef.current;
    claimPlayback();
    setStatus('playing');
    speak(ttsText, rate, () => { if (genRef.current === gen) setStatus('ended'); });
  };

  const toggle = () => {
    if (status === 'playing') { if (audioUrl) pauseFile(); else { pauseSpeak(); setStatus('paused'); } return; }
    if (status === 'paused') { if (audioUrl) playFile(); else { resumeSpeak(); setStatus('playing'); } return; }
    if (audioUrl) playFile(); else playTts();
  };

  const label =
    status === 'playing' ? '⏸ Tạm dừng'
    : status === 'paused' ? '▶ Tiếp tục'
    : status === 'ended' ? '↻ Nghe lại'
    : '🔊 Nghe';

  if (audioUrl) {
    return (
      <div className="card audio-box audio-single">
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          style={{ display: 'none' }}
          onLoadedMetadata={e => { if (e.currentTarget.duration) setDuration(e.currentTarget.duration); }}
          onEnded={() => { setStatus('ended'); setProgress(1); }}
          onTimeUpdate={e => {
            const el = e.currentTarget;
            if (el.duration) { setProgress(el.currentTime / el.duration); setCurrentTime(el.currentTime); }
          }}
        />
        <button className="btn listen-btn" onClick={toggle}>{label}</button>
        <div className="listen-seek-row">
          <div
            className="listen-progress"
            ref={barRef}
            role="slider"
            aria-label="Tua tới đoạn cần nghe"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            onPointerDown={e => { seekingRef.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekFromEvent(e); }}
            onPointerMove={e => { if (seekingRef.current) seekFromEvent(e); }}
            onPointerUp={() => { seekingRef.current = false; }}
            onPointerCancel={() => { seekingRef.current = false; }}
          ><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <span className="listen-time">{fmt(currentTime)} / {fmt(duration)}</span>
        </div>
        <div className="listen-rate">
          <label htmlFor={rateId}>Tốc độ phát: {rate.toFixed(2)}x</label>
          <input
            id={rateId} type="range" min={0.5} max={1.5} step={0.25} value={rate}
            onChange={e => setRate(Number(e.target.value))}
          />
        </div>
      </div>
    );
  }

  // Fallback TTS như cũ khi chưa có file audio.
  // Câu chỉ-nghe (Part 1/2) chưa có audio lẫn transcript thì không có gì
  // để đọc — hiện KHỐI RÕ RÀNG thay vì ghi chú mờ: nút "Nghe" to, dễ thấy
  // (disabled — bấm không làm gì, trông như cố ý chứ không như bị mất nút)
  // + dòng chữ rõ + hướng dẫn admin upload file cho Part này.
  if (!ttsText.trim()) {
    return (
      <div className="card audio-box audio-missing">
        <div className="btn-row">
          <button className="btn" disabled title="Chưa có file audio cho Part này">🔊 Nghe</button>
        </div>
        <p className="audio-missing-text">
          <strong>Chưa có file audio cho Part này.</strong>{' '}
          Admin: vào trang Quản trị → chi tiết đề → mục 🎧 Audio cả Part để upload file mp3.
        </p>
      </div>
    );
  }
  return (
    <div className="card audio-box audio-single">
      <button className="btn listen-btn" onClick={toggle}>{label}</button>
      <div className="listen-rate">
        <label htmlFor={rateId}>Tốc độ phát: {rate.toFixed(2)}x</label>
        <input
          id={rateId} type="range" min={0.5} max={1.5} step={0.25} value={rate}
          onChange={e => setRate(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
