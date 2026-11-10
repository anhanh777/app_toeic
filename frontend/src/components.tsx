import { useEffect, useRef, useState } from 'react';
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
 * PracticeSession và MockTest.
 * - Có audioUrl (file mp3 đã upload / AI sinh, gồm audio của đoạn cho
 *   Part 3/4 do backend gộp): trình phát HTML5 + thanh trượt tốc độ.
 * - Không có audioUrl: giữ nguyên nút TTS cũ làm fallback.
 * Khi stopKey đổi (chuyển câu) thì dừng cả audio element lẫn TTS.
 */
export function ListeningAudio({
  audioUrl, ttsText, rate, onRateChange, stopKey, variant, onError,
}: {
  audioUrl?: string | null;
  ttsText: string;
  rate: number;
  onRateChange: (r: number) => void;
  /** Đổi giá trị này khi chuyển câu — audio đang phát sẽ bị dừng. */
  stopKey: unknown;
  /** 'practice': đủ nút TTS (phát / tạm dừng / tiếp tục / nghe lại). 'mock': chỉ phát / dừng. */
  variant: 'practice' | 'mock';
  onError?: (e: unknown) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const stopAll = () => {
    audioRef.current?.pause();
    stopSpeak();
    setPlaying(false);
  };

  useEffect(() => { stopAll(); }, [stopKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate, audioUrl]);

  const playTts = () => {
    if (!ttsSupported()) {
      onError?.(new Error('Trình duyệt của bạn không hỗ trợ đọc giọng máy (TTS).'));
      return;
    }
    setPlaying(true);
    speak(ttsText, rate, () => setPlaying(false));
  };

  if (audioUrl) {
    return (
      <div className="card audio-box">
        <p className="muted">🎧 Nghe đoạn audio</p>
        <audio
          ref={audioRef}
          controls
          src={audioUrl}
          preload="metadata"
          style={{ width: '100%' }}
        />
        <div className="btn-row">
          <button className="btn secondary" onClick={stopAll}>⏹ Dừng</button>
        </div>
        <label htmlFor="audio-rate">Tốc độ phát: {rate.toFixed(2)}x</label>
        <input
          id="audio-rate" type="range" min={0.5} max={1.5} step={0.25} value={rate}
          onChange={e => {
            const r = Number(e.target.value);
            onRateChange(r);
            if (audioRef.current) audioRef.current.playbackRate = r;
          }}
        />
      </div>
    );
  }

  // Fallback TTS như cũ khi chưa có file audio.
  // Câu chỉ-nghe (Part 1/2) chưa có audio lẫn transcript thì không có gì
  // để đọc — hiện ghi chú thay vì nút phát rỗng.
  if (!ttsText.trim()) {
    return (
      <div className="card audio-box">
        <p className="muted">🎧 Câu chỉ-nghe — chưa có file audio. Admin cần upload file mp3 cho câu này (trang chi tiết đề → "AI đọc audio" cũng cần có transcript).</p>
      </div>
    );
  }
  return (
    <div className="card audio-box">
      <p className="muted">Âm thanh đọc bằng giọng máy (TTS)</p>
      <div className="btn-row">
        <button className={variant === 'practice' ? 'btn' : 'btn secondary'} onClick={playTts}>{playing ? '🔊 Đang đọc…' : '▶ Phát âm thanh'}</button>
        {variant === 'practice' ? (
          <>
            <button className="btn secondary" onClick={() => { pauseSpeak(); setPlaying(false); }}>⏸ Tạm dừng</button>
            <button className="btn secondary" onClick={() => { resumeSpeak(); setPlaying(true); }}>▶ Tiếp tục</button>
            <button className="btn secondary" onClick={playTts}>↻ Nghe lại</button>
          </>
        ) : (
          <button className="btn secondary" onClick={stopAll}>⏹ Dừng</button>
        )}
      </div>
      <label htmlFor="rate">Tốc độ đọc: {rate.toFixed(2)}x</label>
      <input id="rate" type="range" min={0.5} max={1.5} step={0.25} value={rate} onChange={e => onRateChange(Number(e.target.value))} />
    </div>
  );
}
