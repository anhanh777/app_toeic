import { useState } from 'react';
import { ApiError } from './api';

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
