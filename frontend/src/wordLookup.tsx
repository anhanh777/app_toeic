import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type DictionaryEntry, type UserWord } from './api';

/**
 * wordLookup.tsx — tra tu nhanh trong doan van (Reading).
 *
 * - WordText tach van ban thanh cac tu co the bam duoc. Bam/cham (tren
 *   may tinh: them hover ~400ms) mo popup tra tu: phien am, loai tu,
 *   nghia tieng Viet — KHONG hien cau vi du (theo yeu cau cua YingYing
 *   2026-11-17). Tra bang Gemini qua backend (co cache nen
 *   moi tu chi tra 1 lan); tra loi thi hien "Khong tra duoc" — KHONG
 *   bao gio hien nghia tu bia.
 * - Popup co nut "＋ Luu vao tu vung": bam moi luu (khong tu luu); da
 *   luu thi nut doi thanh "Da luu ✓", bam lai thi bo luu. Tu da luu
 *   duoc gach chan cham trong bai.
 * - Danh sach tu da luu duoc cache o muc module (1 lan goi API moi
 *   lan mo trang); cac WordText tren cung trang dung chung.
 */

/* ---- cache tu da luu (module-level) ---- */

let savedMap = new Map<string, UserWord>();
let savedLoaded = false;
let savedLoading: Promise<void> | null = null;
const savedListeners = new Set<() => void>();
function notifySaved() { savedListeners.forEach((fn) => fn()); }

export function loadSavedWords(force = false): Promise<void> {
  if (savedLoaded && !force) return Promise.resolve();
  if (savedLoading) return savedLoading;
  savedLoading = api.userWords('', 500, 0)
    .then((d) => {
      savedMap = new Map(d.items.map((w) => [w.word.toLowerCase(), w]));
      savedLoaded = true;
    })
    .catch(() => { /* giu cache cu; lan mo sau thu lai */ })
    .finally(() => { savedLoading = null; });
  return savedLoading;
}

export function useSavedWords(): Map<string, UserWord> {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    savedListeners.add(fn);
    void loadSavedWords();
    return () => { savedListeners.delete(fn); };
  }, []);
  return savedMap;
}

export async function saveWordFromLookup(entry: DictionaryEntry, context?: string): Promise<UserWord> {
  const row = await api.createUserWord({
    word: entry.word,
    phonetic: entry.phonetic ?? undefined,
    pos: entry.pos ?? undefined,
    meaning: entry.meaning_vi,
    example: entry.example ?? undefined,
    context: context || undefined,
  });
  savedMap.set(row.word.toLowerCase(), row);
  notifySaved();
  return row;
}

export async function unsaveWord(word: string): Promise<void> {
  const row = savedMap.get(word.toLowerCase());
  if (!row) return;
  await api.deleteUserWord(row.id);
  savedMap.delete(word.toLowerCase());
  notifySaved();
}

/* ---- tach cau chua tu (lam ngu canh cho tra tu) ---- */

function sentenceAround(text: string, index: number): string {
  let start = -1;
  for (const ch of ['.', '!', '?', '\n']) start = Math.max(start, text.lastIndexOf(ch, index - 1));
  let end = text.length;
  for (const ch of ['.', '!', '?', '\n']) {
    const i = text.indexOf(ch, index);
    if (i !== -1) end = Math.min(end, i + 1);
  }
  const s = text.slice(start + 1, end).trim().replace(/\s+/g, ' ');
  return s.length > 300 ? s.slice(0, 300) : s;
}

interface PopState {
  word: string;
  context: string;
  left: number;
  top: number;
  entry: DictionaryEntry | null;
  loading: boolean;
  error: string | null;
}

const POP_W = 320;
const POP_H = 300;

function popPosition(rect: DOMRect): { left: number; top: number } {
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - POP_W - 8));
  const below = rect.bottom + 8;
  const top = below + POP_H > window.innerHeight ? Math.max(8, rect.top - POP_H - 8) : below;
  return { left, top };
}

/**
 * Van ban co cac tu bam duoc de tra tu. Chi dung cho DOAN VAN DOC
 * (TOEIC P6/P7, IELTS Reading) — khong dung cho de bai, giai thich,
 * transcript trong ban nay.
 */
export function WordText({ text }: { text: string }) {
  const saved = useSavedWords();
  const [pop, setPop] = useState<PopState | null>(null);
  const [saving, setSaving] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const popId = useRef(Math.random().toString(36).slice(2));
  const popRef = useRef<HTMLDivElement | null>(null);

  // Dong popup nay khi co popup khac mo (chi 1 popup tai 1 thoi diem).
  useEffect(() => {
    const fn = (e: Event) => {
      if ((e as CustomEvent).detail !== popId.current) setPop(null);
    };
    window.addEventListener('wl-open', fn);
    return () => window.removeEventListener('wl-open', fn);
  }, []);

  // Dong popup: phim Escape, cuon trang, hoac bam ra ngoai (tru bam vao tu khac).
  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(null); };
    const onScroll = () => setPop(null);
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (popRef.current && popRef.current.contains(t)) return;
      if (t.closest && t.closest('.wl-word')) return;
      setPop(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [pop]);

  useEffect(() => () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
  }, []);

  const openFor = (word: string, index: number, el: HTMLElement) => {
    const lower = word.toLowerCase();
    const { left, top } = popPosition(el.getBoundingClientRect());
    // Tu nay dang mo roi thi chi cap nhat vi tri, khong tra lai.
    if (pop && pop.word.toLowerCase() === lower && (pop.entry || pop.loading)) {
      setPop({ ...pop, left, top });
      return;
    }
    const context = sentenceAround(text, index);
    const existing = saved.get(lower) ?? null;
    window.dispatchEvent(new CustomEvent('wl-open', { detail: popId.current }));
    if (existing) {
      // Da luu roi: hien thang du lieu da luu, khoi goi tra tu.
      setPop({
        word, context, left, top,
        entry: { word: existing.word, phonetic: existing.phonetic, pos: existing.pos, meaning_vi: existing.meaning, example: existing.example },
        loading: false, error: null,
      });
      return;
    }
    setPop({ word, context, left, top, entry: null, loading: true, error: null });
    api.dictionaryLookup(word, context)
      .then((entry) => {
        // API tra thay tu da luu (map saved cua trang nay dang cu, vd luu tu
        // trang khac / thiet bi khac) — dong bo lai de nut hien "Da luu ✓".
        if (entry.saved && entry.id) {
          savedMap.set(lower, {
            id: entry.id, word: entry.word, phonetic: entry.phonetic ?? null,
            pos: entry.pos ?? null, meaning: entry.meaning_vi, example: entry.example ?? null,
            status: entry.status ?? 'learning',
          });
          notifySaved();
        }
        setPop((p) => (p && p.word.toLowerCase() === lower ? { ...p, entry, loading: false } : p));
      })
      .catch(() => setPop((p) => (p && p.word.toLowerCase() === lower ? { ...p, loading: false, error: 'Không tra được, thử lại sau.' } : p)));
  };

  const clearHover = () => {
    if (hoverTimer.current) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null; }
  };

  const savedRow = pop ? saved.get(pop.word.toLowerCase()) ?? null : null;

  const onSave = async () => {
    if (!pop || !pop.entry) return;
    setSaving(true);
    try {
      await saveWordFromLookup(pop.entry, pop.context);
    } catch {
      setPop((p) => (p ? { ...p, error: 'Không lưu được, thử lại sau.' } : p));
    } finally {
      setSaving(false);
    }
  };
  const onUnsave = async () => {
    if (!pop) return;
    setSaving(true);
    try {
      await unsaveWord(pop.word);
    } catch {
      setPop((p) => (p ? { ...p, error: 'Không bỏ lưu được, thử lại sau.' } : p));
    } finally {
      setSaving(false);
    }
  };

  // Tach van ban: giu nguyen khoang trang/dau cau/so; chi tu chu cai moi bam duoc.
  const wordRe = /([A-Za-z]+(?:['’\-][A-Za-z]+)*)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const w = m[0];
    const idx = m.index;
    const isSaved = saved.has(w.toLowerCase());
    nodes.push(
      <span
        key={k++}
        role="button"
        tabIndex={0}
        className={`wl-word${isSaved ? ' saved' : ''}`}
        onClick={(e) => { clearHover(); openFor(w, idx, e.currentTarget); }}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          clearHover();
          hoverTimer.current = window.setTimeout(() => openFor(w, idx, el), 400);
        }}
        onMouseLeave={clearHover}
        onKeyDown={(e) => { if (e.key === 'Enter') openFor(w, idx, e.currentTarget); }}
      >
        {w}
      </span>
    );
    last = m.index + w.length;
  }
  if (last < text.length) nodes.push(text.slice(last));

  return (
    <>
      {nodes}
      {pop && createPortal(
        <div ref={popRef} className="wl-popover" style={{ left: pop.left, top: pop.top }} role="dialog" aria-label={`Tra từ ${pop.word}`}>
          <div className="wl-pop-head">
            <strong>{pop.word}</strong>
            {pop.entry?.phonetic && <span className="muted">{pop.entry.phonetic}</span>}
            <button type="button" className="btn ghost btn-sm wl-close" onClick={() => setPop(null)} aria-label="Đóng">✕</button>
          </div>
          {pop.loading && <p className="muted">Đang tra từ…</p>}
          {pop.error && <p className="error">{pop.error}</p>}
          {pop.entry && (
            <>
              {pop.entry.pos && <p style={{ margin: '.2rem 0' }}><span className="muted">Loại từ:</span> {pop.entry.pos}</p>}
              <p style={{ margin: '.2rem 0' }}><strong>{pop.entry.meaning_vi}</strong></p>
              {savedRow ? (
                <button type="button" className="btn secondary btn-sm" disabled={saving} onClick={() => void onUnsave()}>
                  Đã lưu ✓ — bấm để bỏ lưu
                </button>
              ) : (
                <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void onSave()}>
                  ＋ Lưu vào từ vựng
                </button>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
