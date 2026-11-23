import { useEffect, useId, useRef, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
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

/** 1 chỗ trống trong đoạn văn (Part 6 TOEIC): số câu + trạng thái trả lời. */
export interface BlankState { selected?: string; graded?: boolean | null; }
/**
 * Đoạn văn có chỗ trống: mỗi `131. ________` được thay bằng chip số có màu
 * (bấm vào thì cuộn tới câu đó; đã trả lời thì chip hiện chữ cái đã chọn
 * và đổi màu). Chỗ trống `________` không có số thì hiện chip trống.
 */
export function PassageWithBlanks({ text, blanks, onBlankClick, renderText }: {
  text: string;
  blanks?: Record<number, BlankState>;
  onBlankClick?: (num: number) => void;
  /** Ve doan van thuong (giua cac chip): neu co thi dung ham nay de ve (vd: tu bam duoc de tra tu). */
  renderText?: (text: string) => React.ReactNode;
}) {
  // Tách văn bản thành: đoạn thường | chip chỗ trống có số | chip trống.
  const parts: React.ReactNode[] = [];
  const re = /(\d+)\s*\.\s*_{2,}|_{2,}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<Fragment key={`seg-${last}`}>{renderText ? renderText(text.slice(last, m.index)) : text.slice(last, m.index)}</Fragment>);
    const numMatch = /^(\d+)\s*\./.exec(m[0]);
    const num = numMatch ? Number(numMatch[1]) : null;
    const st = num != null ? blanks?.[num] : undefined;
    const cls = ['blank-chip'];
    if (st?.selected) cls.push(st.graded === true ? 'correct' : st.graded === false ? 'wrong' : 'answered');
    parts.push(
      <button
        key={`blank-${k++}`}
        type="button"
        className={cls.join(' ')}
        onClick={() => { if (num != null) onBlankClick?.(num); }}
        title={num != null ? `Chỗ trống câu ${num} — bấm để tới câu hỏi` : 'Chỗ trống'}
      >
        {num != null ? num : '…'}
        <span className="blank-line" aria-hidden />
        {st?.selected ? ` · ${st.selected}` : ''}
      </button>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={`seg-${last}`}>{renderText ? renderText(text.slice(last)) : text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

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

/* ---- Phong cach 'lively' (Duolingo): mascot + dai nhiem vu hang ngay ----
   Chi render khi trang goi no (khi style==='lively'); pastel khong goi
   nen khong thay gi. MASCOT: /mascot.png (cu hong cam hoa anh dao).
   DU LIEU THAT: streak/XP/nhiem vu do trang truyen vao (tu statsOverview
   / /api/today); thieu thi hien 0, KHONG bia so. Backend KHONG co so du
   xu (coin) — chi co XP (xp_events) nen dai nay chi hien XP, khong hien
   so xu gia. */
export function LivelyMascot({ size = 96, alt = 'Mascot ANHANH' }: { size?: number; alt?: string }) {
  return (
    <img src="/mascot.png" alt={alt} className="lively-mascot" width={size} height={size} />
  );
}

export interface DailyTaskItem {
  id: string;
  label: string;
  meta?: string;
  to: string;
  done: boolean;
}

export function LivelyDailyStrip({ streakDays, totalXp, tasks }: {
  streakDays: number;
  /** XP tong (statsOverview.totalXp). Khong co thi truyen undefined — chip XP se an. */
  totalXp?: number;
  tasks: DailyTaskItem[];
}) {
  const doneCount = tasks.filter(t => t.done).length;
  return (
    <section className="lively-strip" aria-label="Nhiệm vụ hôm nay">
      <div className="lively-strip-mascot">
        <LivelyMascot size={96} />
        <span className="lively-strip-bubble">Học tiếp nào! 💪</span>
      </div>
      <div className="lively-strip-body">
        <div className="lively-strip-stats">
          <span className="lively-stat lively-stat--streak">🔥 {streakDays} ngày</span>
          {totalXp != null && <span className="lively-stat lively-stat--xp">⭐ {totalXp} XP</span>}
          <span className="lively-stat lively-stat--tasks">🎯 {doneCount}/{tasks.length} nhiệm vụ</span>
        </div>
        <ul className="lively-tasks">
          {tasks.map(t => (
            <li key={t.id}>
              <Link to={t.to} className={`lively-task${t.done ? ' lively-task--done' : ''}`}>
                <span aria-hidden>{t.done ? '✅' : '⭕'}</span>
                <span>{t.label}{t.meta ? <span className="lively-task-meta"> — {t.meta}</span> : null}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
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
  audioUrl, ttsText, stopKey, onError, playOnce, onFirstPlay,
}: {
  audioUrl?: string | null;
  ttsText: string;
  /** Đổi giá trị này khi chuyển câu — audio đang phát sẽ bị dừng. */
  stopKey: unknown;
  onError?: (e: unknown) => void;
  /** Thi thử IELTS: audio mỗi Section chỉ phát 1 lần — bấm phát rồi thì
   * nút nghe bị vô hiệu (vẫn tạm dừng/tiếp tục được trong lần phát đó,
   * phát xong thì không nghe lại được nữa). */
  playOnce?: boolean;
  /** Gọi 1 lần khi lần phát đầu tiên bắt đầu (để trang thi đánh dấu
   * Section đã phát). */
  onFirstPlay?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // idle: chưa phát | playing: đang phát | paused: đã tạm dừng | ended: phát xong
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused' | 'ended'>('idle');
  // Đã bắt đầu lần phát duy nhất (chỉ dùng khi playOnce).
  const [playedOnce, setPlayedOnce] = useState(false);
  const [progress, setProgress] = useState(0);
  // Tốc độ phát (khôi phục như bản đầu: 0.5–1.5x) + thời lượng/vị trí hiện tại
  // để hiển thị giờ phát và tua tới từng đoạn.
  const [rate, setRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  // Âm lượng (0–1) — chỉ áp dụng cho file audio.
  const [volume, setVolume] = useState(1);
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

  // Áp âm lượng cho file audio.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, audioUrl]);

  // Tua lùi/tới 5 giây (kiểu YouPass) — vẫn trong cùng 1 lượt phát nên
  // không vi phạm chế độ phát 1 lần của thi thử.
  const seekBy = (sec: number) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + sec), el.duration);
    if (status === 'ended') setStatus('paused');
  };

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
    markPlayed();
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
    markPlayed();
    claimPlayback();
    setStatus('playing');
    speak(ttsText, rate, () => { if (genRef.current === gen) setStatus('ended'); });
  };

  const toggle = () => {
    // Chế độ phát 1 lần: đã bắt đầu phát rồi thì không phát lại từ đầu
    // (vẫn tạm dừng/tiếp tục được trong lần phát đó — nút chỉ khóa hẳn
    // khi audio đã phát xong, xử lý ở `playDisabled` bên dưới).
    if (playOnce && playedOnce && status !== 'playing' && status !== 'paused') return;
    if (status === 'playing') { if (audioUrl) pauseFile(); else { pauseSpeak(); setStatus('paused'); } return; }
    if (status === 'paused') { if (audioUrl) playFile(); else { resumeSpeak(); setStatus('playing'); } return; }
    if (audioUrl) playFile(); else playTts();
  };

  // Ghi nhận lần phát đầu tiên (chỉ khi playOnce): nút nghe bị vô hiệu
  // hẳn khi lần phát đó đã kết thúc; trong lúc đang phát/tạm dừng thì
  // nút vẫn là Tạm dừng/Tiếp tục để nghe hết 1 lượt.
  const markPlayed = () => {
    if (playOnce && !playedOnce) {
      setPlayedOnce(true);
      onFirstPlay?.();
    }
  };
  const playDisabled = !!playOnce && playedOnce && (status === 'ended' || status === 'idle');
  const label =
    playDisabled ? '🔊 Đã nghe 1 lần'
    : status === 'playing' ? '⏸ Tạm dừng'
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
        <button className="btn listen-btn" disabled={playDisabled} onClick={toggle}>{label}</button>
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
        <div className="listen-controls-row">
          <button type="button" className="btn btn-sm secondary" onClick={() => seekBy(-5)} title="Tua lùi 5 giây" aria-label="Tua lùi 5 giây">⏪ 5s</button>
          <button type="button" className="btn btn-sm secondary" onClick={() => seekBy(5)} title="Tua tới 5 giây" aria-label="Tua tới 5 giây">5s ⏩</button>
          <label className="listen-volume" htmlFor={`${rateId}-vol`}>🔊
            <input
              id={`${rateId}-vol`} type="range" min={0} max={1} step={0.1} value={volume}
              onChange={e => setVolume(Number(e.target.value))}
              aria-label="Âm lượng"
            />
          </label>
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
  if (!ttsText.trim()) {
    return (
      <div className="card audio-box audio-missing">
        <div className="btn-row">
          <button className="btn" disabled title="Chưa có file audio cho Part này">🔊 Nghe</button>
        </div>
        <p className="audio-missing-text">
          <strong>Chưa có file audio cho Part này.</strong>
        </p>
      </div>
    );
  }
  return (
    <div className="card audio-box audio-single">
      <button className="btn listen-btn" disabled={playDisabled} onClick={toggle}>{label}</button>
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

/** Nội dung câu hỏi IELTS: chữ thường, chỉ chỗ trống ______ in đậm — cả
 * câu in đậm như trước thì đoạn dài đọc nặng mắt. Số câu đã đậm sẵn ở
 * .exam-q-num nên không đậm thêm ở đây. */
export function QuestionText({ text }: { text: string }) {
  const parts = text.split(/(__+)/).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        /^_+$/.test(p) ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>
      )}
    </>
  );
}

/** Thanh số câu (kiểu YouPass) cho phòng thi IELTS: bấm số để nhảy tới câu
 * đó. state: todo = chưa làm, done = đã trả lời (thi thử) hoặc đã chọn đáp
 * án nhưng chưa chấm (luyện tập), correct/wrong = đã chấm (luyện tập).
 * group: nhãn nhóm (Section/Passage) — các câu liên tiếp cùng nhóm hiện
 * chung 1 nhãn. currentId: câu đang làm (viền nổi). flagged: câu được
 * đánh dấu (chấm cam). */
export type PaletteItemState = 'todo' | 'done' | 'correct' | 'wrong';
export interface PaletteItem { n: number; id: string; state: PaletteItemState; group?: string; flagged?: boolean; noted?: boolean }
export function QuestionPalette({ items, onJump, currentId, variant = 'bar' }: {
  items: PaletteItem[];
  onJump: (id: string) => void;
  currentId?: string | null;
  // 'bar': hang ngang cuon duoi phong thi; 'side': luoi doc trong cot phai.
  variant?: 'bar' | 'side';
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Gom các câu liên tiếp cùng nhóm (theo group) để hiện nhãn 1 lần.
  // (Tính trước early return vì các hook bên dưới cần dùng groups.)
  const groups: { label?: string; items: PaletteItem[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.label === it.group) last.items.push(it);
    else groups.push({ label: it.group, items: [it] });
  }
  // Cột phải: các nhóm thu gọn được (accordion) — chỉ mở nhóm đang làm.
  // Mặc định mở nhóm đầu tiên; khi câu đang làm đổi sang nhóm khác thì
  // tự mở nhóm đó. Bản 'bar' không dùng state này.
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
  const currentGroupIdx = currentId
    ? groups.findIndex(g => g.items.some(it => it.id === currentId))
    : -1;
  useEffect(() => {
    if (variant === 'side' && currentGroupIdx >= 0) setExpandedIdx(currentGroupIdx);
  }, [variant, currentGroupIdx]);
  // Khi cau dang lam doi (scroll-spy), cuon bang cau hoi de nut cau do
  // luon nam trong vung nhin — quan trong o bai full 80 cau (hang ngang
  // o thanh duoi, cot doc o cot phai), neu khong nut duoc highlight se
  // nam ngoai man hinh. 'nearest' chi cuon khi nut dang nam ngoai vung
  // nhin, khong tranh cuon voi tay. Phu thuoc ca expandedIdx de cuon
  // lai sau khi nhom vua tu mo ra.
  useEffect(() => {
    if (!currentId) return;
    wrapRef.current?.querySelector('.q-palette-btn--current')
      ?.scrollIntoView({ behavior: 'auto', inline: 'nearest', block: 'nearest' });
  }, [currentId, expandedIdx]);
  if (!items.length) return null;
  const renderBtn = (it: PaletteItem) => (
    <button
      key={it.id} type="button"
      className={`q-palette-btn q-palette-btn--${it.state}${it.id === currentId ? ' q-palette-btn--current' : ''}${it.flagged ? ' q-palette-btn--flagged' : ''}${it.noted ? ' q-palette-btn--noted' : ''}`}
      onClick={() => onJump(it.id)}
      aria-label={`Câu ${it.n}${it.flagged ? ' (đã đánh dấu)' : ''}${it.noted ? ' (có ghi chú)' : ''}`}
      title={`Câu ${it.n}${it.flagged ? ' — đã đánh dấu' : ''}${it.noted ? ' — có ghi chú' : ''}`}
    >{it.n}</button>
  );
  return (
    <div ref={wrapRef} className={`q-palette${variant === 'side' ? ' q-palette--side' : ''}`} role="navigation" aria-label="Điều hướng câu hỏi">
      {groups.map((g, gi) => variant === 'side' ? (
        <div key={gi} className="q-palette-sidegroup">
          <button type="button" className="q-palette-sidegroup-head" aria-expanded={expandedIdx === gi}
            onClick={() => setExpandedIdx(expandedIdx === gi ? null : gi)}>
            {g.label && <span className="q-palette-group-label">{g.label}</span>}
            <span className="q-palette-sidegroup-count">{g.items.filter(it => it.state !== 'todo').length}/{g.items.length}</span>
            <span className={`q-palette-sidegroup-chev${expandedIdx === gi ? ' q-palette-sidegroup-chev--open' : ''}`}>▾</span>
          </button>
          {expandedIdx === gi && (
            <span className="q-palette-group">{g.items.map(renderBtn)}</span>
          )}
        </div>
      ) : (
        <span key={gi} className="q-palette-group">
          {g.label && <span className="q-palette-group-label">{g.label}</span>}
          {g.items.map(renderBtn)}
        </span>
      ))}
    </div>
  );
}

/* ---- Hộp thoại xác nhận theo kiểu giao diện của app (thay window.confirm) ---- */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Nút chính màu đỏ (Xóa/Thoát). */
  danger?: boolean;
}

type PendingConfirm = ConfirmOptions & { resolve: (ok: boolean) => void };

let pendingConfirm: PendingConfirm | null = null;
let confirmListener: ((req: PendingConfirm | null) => void) | null = null;

/** Mở hộp thoại xác nhận của app, trả về true khi người dùng bấm nút chính. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // Không bao giờ để hộp thoại cũ treo: đang mở mà gọi thêm thì coi như hủy cái cũ.
    pendingConfirm?.resolve(false);
    const req: PendingConfirm = { ...opts, resolve };
    pendingConfirm = req;
    confirmListener?.(req);
  });
}

/** Gắn 1 lần ở gốc app (App.tsx) — vẽ hộp thoại khi có yêu cầu chờ. */
export function ConfirmDialogHost() {
  const [req, setReq] = useState<PendingConfirm | null>(null);
  const close = (ok: boolean) => {
    const r = req;
    pendingConfirm = null;
    setReq(null);
    r?.resolve(ok);
  };
  useEffect(() => {
    confirmListener = setReq;
    return () => {
      confirmListener = null;
    };
  }, []);
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);
  if (!req) return null;
  return (
    <div className="confirm-overlay" role="alertdialog" aria-modal="true" aria-label={req.title} onClick={() => close(false)}>
      <div className="card confirm-card" onClick={(e) => e.stopPropagation()}>
        <h2>{req.title}</h2>
        {req.message ? <p className="muted">{req.message}</p> : null}
        <div className="btn-row">
          <button type="button" className="btn secondary" onClick={() => close(false)} autoFocus>{req.cancelText ?? 'Hủy'}</button>
          <button type="button" className={`btn${req.danger ? ' danger' : ''}`} onClick={() => close(true)}>{req.confirmText ?? 'Đồng ý'}</button>
        </div>
      </div>
    </div>
  );
}
