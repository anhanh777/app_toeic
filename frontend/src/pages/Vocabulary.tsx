import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type UserWord, type Vocab, type WordSentence } from '../api';
import { AFFIXES, AFFIX_EXAMPLES, AFFIX_KIND_LABEL, bareAffix, findAffixSplit, type AffixEntry, type AffixKind } from '../data/affixes';
import { ErrorBox, confirmDialog } from '../components';
import { useExam } from '../exam';

type WordStatus = 'learning' | 'learned' | 'wrong';
const STATUS_LABEL: Record<WordStatus, string> = { learning: 'Đang học', learned: 'Đã thuộc', wrong: 'Chưa thuộc' };
const REVIEW_STAGE_MAX = 5;

/** Chu ngay on lai gon: "Den han on" / "On: dd/mm/yyyy" / "Da thuoc lau dai". */
function dueText(w: UserWord): string {
  if ((w.reviewStage ?? 0) >= REVIEW_STAGE_MAX) return 'Đã thuộc lâu dài';
  if (!w.reviewDue) return 'Đến hạn ôn';
  const today = new Date().toISOString().slice(0, 10);
  if (w.reviewDue <= today) return 'Đến hạn ôn';
  return `Ôn: ${new Date(`${w.reviewDue}T00:00:00`).toLocaleDateString('vi-VN')}`;
}

function normAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Che tu goc trong cau ngu canh (khong phan biet hoa/thuong); null neu khong che duoc. */
function clozeSentence(context: string | null | undefined, word: string): string | null {
  if (!context) return null;
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc, 'i');
  if (!re.test(context)) return null;
  return context.replace(re, '______');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** To vang tu goc trong 1 cau (khong phan biet hoa/thuong): uu tien
 * khop nguyen tu (word-boundary), neu khong co thi khop chuoi con.
 * Tu khong co trong cau thi tra cau nguyen. */
function highlightWord(sentence: string, word: string): ReactNode {
  const w = word.trim();
  if (!w) return sentence;
  const esc = escapeRe(w);
  let parts = sentence.split(new RegExp(`\\b(${esc})\\b`, 'gi'));
  if (parts.length === 1) parts = sentence.split(new RegExp(`(${esc})`, 'gi'));
  if (parts.length === 1) return sentence;
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1
        ? <mark key={i} className="vocab-hl">{p}</mark>
        : <span key={i}>{p}</span>))}
    </>
  );
}

/** Hien 1 tu, to sang phan affix neu tu co trong bang affix (chi khop
 * chinh xac — xem findAffixSplit). Giu nguyen cach viet hoa cua tu goc
 * bang cach cat theo do dai 2 phan da luu. */
function AffixWord({ word }: { word: string }) {
  const hit = findAffixSplit(word);
  if (!hit) return <>{word}</>;
  const p0 = word.slice(0, hit.parts[0].length);
  const p1 = word.slice(hit.parts[0].length);
  const bare = bareAffix(hit.entry.affix);
  const affixFirst = hit.parts[0] === bare;
  const title = `${hit.entry.affix} = ${hit.entry.meaning}`;
  return (
    <span className="vocab-affix-word">
      {affixFirst
        ? <><span className="vocab-affix-part" title={title}>{p0}</span><span>{p1}</span></>
        : <><span>{p0}</span><span className="vocab-affix-part" title={title}>{p1}</span></>}
    </span>
  );
}

/** Dong ghi chu duoi tu tren flashcard: "un- — khong, phu dinh + happy"
 * (tien to/goc dung truoc) hoac "informa + -tion — su, hanh dong"
 * (hau to/goc dung sau). Dung " — " thay cho ngoac don vi mot so nghia
 * affix da co ngoac don ben trong (vd "co the, dang (tao tinh tu)"). */
function affixNote(word: string): string | null {
  const hit = findAffixSplit(word);
  if (!hit) return null;
  const p0 = word.slice(0, hit.parts[0].length);
  const p1 = word.slice(hit.parts[0].length);
  const label = `${hit.entry.affix} — ${hit.entry.meaning}`;
  return hit.parts[0] === bareAffix(hit.entry.affix) ? `${label} + ${p1}` : `${p0} + ${label}`;
}

/** Cau co chua tu khong (khong phan biet hoa/thuong)? Chap nhan cac dang
 * bien doi don gian: +s/+es/+d/+ed/+ing, va bo 'e' + 'ing'/'ed' neu tu
 * ket thuc bang 'e'. Khop theo ranh gioi tu. */
function sentenceHasWord(sentence: string, word: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  const forms = [w, `${w}s`, `${w}es`, `${w}d`, `${w}ed`, `${w}ing`];
  if (w.endsWith('e')) forms.push(`${w.slice(0, -1)}ing`, `${w.slice(0, -1)}ed`);
  return forms.some((f) => new RegExp(`\\b${escapeRe(f)}\\b`, 'i').test(sentence));
}

type QuizType = 'mcq' | 'type' | 'cloze' | 'affix';
interface QuizQ {
  type: QuizType;
  word: UserWord;
  options?: string[];
  cloze?: string;
  /** Dang 'affix': nhan goi y vd "un- (khong, phu dinh)". */
  affixLabel?: string;
  affixKind?: AffixKind;
  /** Dang 'affix': id cua UserWord trung tu neu tu da co trong so. */
  savedId?: number;
}

/** 1 cau hoi cho 1 tu: xoay vong mcq -> go tu -> dien cau ngu canh ->
 * doan nghia qua tien to, co fallback khi khong du du lieu (it hon 4
 * tu thi khong co mcq; khong co context thi khong co cloze). Cau affix
 * lay tu ngan hang vi du cua bang affix (uu tien tu CHUA co trong so),
 * `usedAffix` chong trung trong cung phien. */
function buildQuiz(word: UserWord, all: UserWord[], idx: number, usedAffix?: Set<string>): QuizQ {
  const order: QuizType[] = ['mcq', 'type', 'cloze', 'affix'];
  let type = order[idx % 4];
  const distinctMeanings = [
    ...new Set(
      all.filter((w) => w.id !== word.id).map((w) => w.meaning.trim()).filter((m) => m && m !== word.meaning.trim()),
    ),
  ];
  if (type === 'mcq' && distinctMeanings.length < 3) type = 'type';
  if (type === 'cloze') {
    const c = clozeSentence(word.context, word.word);
    if (c) return { type: 'cloze', word, cloze: c };
    type = 'type';
  }
  if (type === 'affix') {
    const savedByWord = new Map(all.map((w) => [w.word.toLowerCase(), w]));
    const fresh = AFFIX_EXAMPLES.filter(
      (e) => !usedAffix?.has(e.word) && !savedByWord.has(e.word),
    );
    const pool = fresh.length > 0
      ? fresh
      : AFFIX_EXAMPLES.filter((e) => !usedAffix?.has(e.word));
    const pick = shuffle(pool.length > 0 ? pool : AFFIX_EXAMPLES)[0];
    usedAffix?.add(pick.word);
    const saved = savedByWord.get(pick.word);
    const distractors = [
      ...new Set(
        AFFIX_EXAMPLES.filter((e) => e.word !== pick.word && e.meaning !== pick.meaning).map((e) => e.meaning),
      ),
    ];
    const fakeWord: UserWord = {
      id: saved?.id ?? -1,
      word: pick.word,
      meaning: pick.meaning,
      status: 'learning',
      mastery: saved?.mastery ?? 0,
    };
    return {
      type: 'affix',
      word: fakeWord,
      options: shuffle([pick.meaning, ...shuffle(distractors).slice(0, 3)]),
      affixLabel: `${pick.affix} (${pick.affixMeaning})`,
      affixKind: pick.kind,
      savedId: saved?.id,
    };
  }
  if (type === 'mcq') {
    const picks = shuffle(distinctMeanings).slice(0, 3);
    return { type: 'mcq', word, options: shuffle([word.meaning, ...picks]) };
  }
  return { type: 'type', word };
}

function MasteryBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={`vocab-mastery${pct >= 80 ? ' vocab-mastery--high' : ''}`}>
      <div className="vocab-mastery-track"><div className="vocab-mastery-fill" style={{ width: `${pct}%` }} /></div>
      <span className="vocab-mastery-num">{pct}%</span>
    </div>
  );
}

/** Pill ngay on lai — mau theo trang thai (den han = vang, da thuoc lau dai = xanh). */
function DuePill({ w }: { w: UserWord }) {
  const stage = w.reviewStage ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const cls = stage >= REVIEW_STAGE_MAX
    ? 'vocab-pill--done'
    : (!w.reviewDue || w.reviewDue <= today) ? 'vocab-pill--due' : '';
  return <span className={`vocab-pill ${cls}`}>{dueText(w)}</span>;
}

function StatusPill({ status }: { status: WordStatus }) {
  return <span className={`vocab-pill vocab-pill--${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Flashcard dung chung cho ca 2 tab: tu lon o giua, lat co chieu sau,
 * dieu huong truoc/sau + nut danh dau ben duoi, footer tuy theo tab. */
function FlashcardView({ word, sub, meaning, example, flipped, onFlip, onPrev, onNext, prevDisabled, nextDisabled, counter, actions, footer }: {
  word: string;
  sub: string;
  meaning: string;
  example: string;
  flipped: boolean;
  onFlip: () => void;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  counter: string;
  actions: ReactNode;
  footer?: ReactNode;
}) {
  const note = affixNote(word);
  return (
    <>
      <div
        className={`flashcard vocab-flashcard${flipped ? ' flipped' : ''}`}
        onClick={onFlip}
        role="button"
        tabIndex={0}
        aria-label={`Thẻ từ ${word} — bấm để lật`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlip(); } }}
      >
        <div className="flashcard-inner">
          <div className="flashcard-face">
            <div className="big"><AffixWord word={word} /></div>
            {note && <div className="vocab-affix-note">{note}</div>}
            {sub && <div className="muted">{sub}</div>}
            <span className="vocab-flip-hint">Bấm để lật thẻ</span>
          </div>
          <div className="flashcard-face back">
            <div className="vocab-flash-mean">{meaning}</div>
            {example && <p>{highlightWord(example, word)}</p>}
            <span className="vocab-flip-hint">Bấm để lật lại</span>
          </div>
        </div>
      </div>
      <div className="vocab-flash-nav">
        <button type="button" className="btn secondary btn-sm" disabled={prevDisabled} onClick={onPrev}>← Từ trước</button>
        <span className="vocab-flash-counter">{counter}</span>
        <button type="button" className="btn secondary btn-sm" disabled={nextDisabled} onClick={onNext}>Từ tiếp →</button>
      </div>
      <div className="vocab-flash-actions">{actions}</div>
      {footer}
    </>
  );
}

/**
 * Trang Từ vựng — 3 kho:
 * - "Từ của tôi" (mặc định): từ cá nhân, lưu khi tra từ trong đoạn văn
 *   lúc luyện tập hoặc thêm tay; sửa/xóa/đánh dấu được; ôn theo lịch
 *   ngắt quãng 1–3–7–14–30 ngày kèm điểm thành thạo.
 * - "Từ chung": cụm từ/collocations trích từ đề thi trong app, chia theo
 *   chủ đề; bấm "＋ Lưu" để đưa cụm vào "Từ của tôi" kèm lịch ôn.
 * - "Tiền tố – Hậu tố": bảng tra cứu tiền tố/hậu tố/gốc từ, mọi ví dụ
 *   đều là từ có thật trong đề thi của app (không cần mạng).
 */
export default function Vocabulary() {
  const [tab, setTab] = useState<'mine' | 'shared' | 'affix'>('mine');
  return (
    <div className="vocab-page">
      <h1>Từ vựng</h1>
      <div className="vocab-tabs" role="tablist" aria-label="Kho từ vựng">
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={`vocab-tab${tab === 'mine' ? ' vocab-tab--active' : ''}`} onClick={() => setTab('mine')}>Từ của tôi</button>
        <button type="button" role="tab" aria-selected={tab === 'shared'} className={`vocab-tab${tab === 'shared' ? ' vocab-tab--active' : ''}`} onClick={() => setTab('shared')}>Từ chung</button>
        <button type="button" role="tab" aria-selected={tab === 'affix'} className={`vocab-tab${tab === 'affix' ? ' vocab-tab--active' : ''}`} onClick={() => setTab('affix')}>Tiền tố – Hậu tố</button>
      </div>
      <div key={tab} className="vocab-panel">
        {tab === 'mine' ? <MyWords /> : tab === 'shared' ? <SharedWords /> : <AffixReference />}
      </div>
    </div>
  );
}

/** Tab tra cuu tien to / hau to / goc tu — du lieu tinh trong
 * data/affixes.ts, khong goi API. Tim theo affix, nghia hoac tu vi du. */
function AffixReference() {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const groups: { kind: AffixKind; label: string; items: AffixEntry[] }[] = (
    ['prefix', 'suffix', 'root'] as AffixKind[]
  ).map((kind) => ({
    kind,
    label: kind === 'prefix' ? 'Tiền tố' : kind === 'suffix' ? 'Hậu tố' : 'Gốc từ',
    items: AFFIXES.filter((e) => {
      if (e.kind !== kind) return false;
      if (!query) return true;
      return (
        e.affix.toLowerCase().includes(query)
        || e.meaning.toLowerCase().includes(query)
        || e.examples.some((ex) => ex.word.includes(query) || ex.meaning.toLowerCase().includes(query))
      );
    }),
  }));
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  return (
    <div>
      <p className="muted vocab-shared-intro">Biết tiền tố, hậu tố và gốc từ sẽ giúp bạn đoán nghĩa từ mới khi gặp trong đề thi. Mọi từ ví dụ dưới đây đều có thật trong đề thi của app — phần tiền tố/hậu tố/gốc từ được tô sáng.</p>
      <div className="vocab-affix-search">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm tiền tố, hậu tố, gốc từ hoặc từ ví dụ…"
          aria-label="Tìm trong bảng tiền tố – hậu tố"
        />
      </div>
      {total === 0 ? (
        <div className="card"><p>Không tìm thấy mục nào khớp “{q.trim()}”.</p></div>
      ) : groups.map((g) => g.items.length === 0 ? null : (
        <section key={g.kind} className="vocab-affix-group" aria-label={g.label}>
          <h2>{g.label}</h2>
          <div className="vocab-affix-grid">
            {g.items.map((e) => (
              <article key={e.affix} className="vocab-affix-card">
                <div className="vocab-affix-head">
                  <span className="vocab-affix-name">{e.affix}</span>
                  <span className="vocab-pill">{AFFIX_KIND_LABEL[e.kind]}</span>
                </div>
                <div className="vocab-affix-meaning">{e.meaning}</div>
                <ul className="vocab-affix-examples">
                  {e.examples.map((ex) => (
                    <li key={ex.word}>
                      <span className="vocab-affix-ex-word"><AffixWord word={ex.word} /></span>
                      <span className="muted">{ex.meaning}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const QUIZ_BADGE: Record<QuizType, string> = { mcq: 'Chọn nghĩa', type: 'Gõ từ', cloze: 'Điền câu', affix: 'Đoán nghĩa qua tiền tố' };
const QUIZ_LETTERS = ['A', 'B', 'C', 'D'];
/* Manh giay mau cho man tong ket — CSS thuan, khong thu vien. */
const CONFETTI: { left: number; delay: number; color: string; size: number; round: boolean }[] = [
  { left: 5, delay: 0, color: 'var(--accent)', size: 9, round: false },
  { left: 12, delay: 0.2, color: 'var(--gold)', size: 7, round: true },
  { left: 20, delay: 0.1, color: 'var(--exam-orange)', size: 10, round: false },
  { left: 28, delay: 0.35, color: 'var(--green)', size: 8, round: true },
  { left: 36, delay: 0.05, color: 'var(--red)', size: 9, round: false },
  { left: 44, delay: 0.25, color: 'var(--accent)', size: 7, round: true },
  { left: 52, delay: 0.15, color: 'var(--gold)', size: 10, round: false },
  { left: 60, delay: 0.3, color: 'var(--exam-orange)', size: 8, round: true },
  { left: 68, delay: 0, color: 'var(--green)', size: 9, round: false },
  { left: 76, delay: 0.2, color: 'var(--red)', size: 7, round: true },
  { left: 84, delay: 0.1, color: 'var(--accent)', size: 10, round: false },
  { left: 92, delay: 0.3, color: 'var(--gold)', size: 8, round: true },
];

/* Phien kiem tra on tap: 1 cau hoi/lan, tra loi xong moi nop len server
 * (moi cau la 1 buoc on tap ngat quang). Het phien moi hien tong ket.
 * Cau 'affix' co the hoi tu MOI chua co trong so: cau do khong goi
 * server, khong XP, nhung user co the luu tu vao so ngay sau khi tra loi. */
function VocabReviewSession({ queue, allWords, onReviewed, onAdded, onClose }: {
  queue: UserWord[];
  allWords: UserWord[];
  onReviewed: (w: UserWord) => void;
  onAdded?: (w: UserWord) => void;
  onClose: () => void;
}) {
  // Cau hoi chot ngay khi mo phien (khong xao lai khi danh sach tu doi);
  // usedAffix chong lap cau affix trong cung phien.
  const [quizzes] = useState<QuizQ[]>(() => {
    const usedAffix = new Set<string>();
    return queue.map((w, i) => buildQuiz(w, allWords, i, usedAffix));
  });
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [feedback, setFeedback] = useState<null | { correct: boolean; xp: number }>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [finished, setFinished] = useState(false);
  // Luu tu moi tu cau affix (chi hien sau khi tra loi cau affix chua luu).
  const [affixSaved, setAffixSaved] = useState(false);
  const [affixSaving, setAffixSaving] = useState(false);
  const [affixMsg, setAffixMsg] = useState('');

  const quiz = quizzes[idx];
  const progress = quizzes.length ? Math.round(((idx + (feedback ? 1 : 0)) / quizzes.length) * 100) : 0;

  const submit = async (answer: string) => {
    if (!quiz || feedback || busy) return;
    const correct = quiz.type === 'mcq' || quiz.type === 'affix'
      ? answer === quiz.word.meaning
      : normAnswer(answer) === normAnswer(quiz.word.word);
    // Cau affix ve tu moi chua co trong so: khong goi server, khong XP.
    if (quiz.type === 'affix' && !quiz.savedId) {
      setFeedback({ correct, xp: 0 });
      setResults((prev) => [...prev, correct]);
      return;
    }
    setBusy(true);
    try {
      const r = await api.reviewUserWord(quiz.word.id, correct);
      onReviewed(r.word);
      setFeedback({ correct, xp: r.xpAwarded });
      setResults((prev) => [...prev, correct]);
      setTotalXp((x) => x + r.xpAwarded);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const saveAffixWord = async () => {
    if (!quiz || quiz.type !== 'affix' || affixSaving) return;
    setAffixSaving(true);
    try {
      const row = await api.createUserWord({ word: quiz.word.word, meaning: quiz.word.meaning });
      setAffixSaved(true);
      if (row.existed) {
        setAffixMsg(`Từ “${row.word}” đã có trong Từ của tôi rồi.`);
      } else {
        setAffixMsg(`Đã lưu “${row.word}” vào Từ của tôi — sẽ ôn lại vào ngày mai.`);
        onAdded?.(row);
      }
    } catch (e) { setError(e); } finally { setAffixSaving(false); }
  };

  const next = () => {
    if (idx + 1 >= quizzes.length) { setFinished(true); return; }
    setIdx((i) => i + 1);
    setPicked(null);
    setTyped('');
    setFeedback(null);
    setAffixSaved(false);
    setAffixMsg('');
  };

  if (finished) {
    const nCorrect = results.filter(Boolean).length;
    const total = results.length;
    const pct = total ? Math.round((nCorrect / total) * 100) : 0;
    const wrongWords = quizzes.filter((_, i) => results[i] === false).map((q) => q.word);
    const praise = pct === 100
      ? 'Xuất sắc! Bạn nhớ hết cả rồi.'
      : pct >= 70
        ? 'Rất tốt! Tiếp tục phát huy nhé.'
        : pct >= 40
          ? 'Khá ổn — các từ sai sẽ ôn lại vào ngày mai.'
          : 'Đừng nản — ôn lại ngày mai sẽ nhớ hơn.';
    const RING_C = 2 * Math.PI * 52;
    const ringOff = RING_C * (1 - (total ? nCorrect / total : 0));
    return (
      <div className="card vocab-summary-card">
        <div className="vocab-confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <i key={i} style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, background: c.color, width: c.size, height: c.size, borderRadius: c.round ? '50%' : 2 }} />
          ))}
        </div>
        <h2>🎉 Đã ôn xong!</h2>
        <ErrorBox error={error} />
        <div className="vocab-ring-wrap">
          <svg className="vocab-ring" viewBox="0 0 120 120" role="img" aria-label={`Đúng ${nCorrect} trên ${total} từ`}>
            <circle className="vocab-ring-track" cx="60" cy="60" r="52" />
            <circle className="vocab-ring-fill" cx="60" cy="60" r="52" style={{ '--ring-off': ringOff } as CSSProperties} />
          </svg>
          <div className="vocab-ring-text"><b>{nCorrect}/{total}</b><span>từ đúng</span></div>
        </div>
        {totalXp > 0 && <div className="vocab-xp-pill">＋{totalXp} XP</div>}
        <p className="vocab-summary-praise">{praise}</p>
        {wrongWords.length > 0 && (
          <div className="vocab-wrong-list">
            <p className="muted">Từ cần ôn lại vào ngày mai:</p>
            <div className="vocab-wrong-chips">
              {wrongWords.map((w) => <span key={`${w.id}:${w.word}`} className="vocab-wrong-chip">{w.word}</span>)}
            </div>
          </div>
        )}
        <p className="muted">Các từ đã được lên lịch ôn lại theo lịch ngắt quãng (1–3–7–14–30 ngày).</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose}>Về danh sách từ</button>
        </div>
      </div>
    );
  }

  if (!quiz) return null;
  const { word } = quiz;
  const isNewAffix = quiz.type === 'affix' && !quiz.savedId;
  // Ngu canh that cua tu (neu co) — chi hien o dang mcq/type, vi cloze
  // da co cau, affix thi khong phai tu trong so.
  const contextText = (quiz.type === 'mcq' || quiz.type === 'type')
    ? (word.context || word.example || '')
    : '';
  const affixKindLabel = quiz.affixKind ? AFFIX_KIND_LABEL[quiz.affixKind] : 'tiền tố';

  return (
    <div className="card vocab-quiz-card">
      <div className="btn-row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Ôn tập hôm nay</h2>
        <button type="button" className="btn ghost btn-sm" onClick={onClose}>← Thoát phiên ôn</button>
      </div>
      <ErrorBox error={error} />
      <div className="vocab-quiz-progress">
        <div className="vocab-dots" aria-hidden="true">
          {quizzes.map((_, i) => {
            const done = i < results.length;
            const wrong = results[i] === false;
            const current = i === idx && !done;
            return (
              <span
                key={i}
                className={`vocab-dot${done ? ' vocab-dot--done' : ''}${wrong ? ' vocab-dot--wrong' : ''}${current ? ' vocab-dot--current' : ''}`}
              />
            );
          })}
        </div>
        <span className="vocab-quiz-count">Câu {idx + 1}/{quizzes.length}</span>
      </div>
      <div className="vocab-progress"><div className="vocab-progress-fill" style={{ width: `${progress}%` }} /></div>

      <div key={idx} className="vocab-quiz-qwrap">
        <div className="vocab-quiz-meta">
          <span className="vocab-q-badge">{QUIZ_BADGE[quiz.type]}</span>
          <span className="muted">{isNewAffix ? 'Từ mới — chưa có trong sổ của bạn' : `Thành thạo hiện tại: ${word.mastery ?? 0}%`}</span>
        </div>

        {quiz.type === 'mcq' && (
          <>
            <p className="vocab-quiz-q">“<span className="vocab-q-word">{word.word}</span>” có nghĩa là gì?</p>
            {contextText && (
              <div className="vocab-context"><span className="vocab-context-label">Ngữ cảnh:</span>{highlightWord(contextText, word.word)}</div>
            )}
            {quiz.options?.map((opt, i) => {
              const isPicked = picked === opt;
              const isRight = opt === word.meaning;
              const cls = feedback
                ? `option vocab-opt${isRight ? ' vocab-opt--correct' : ''}${isPicked && !isRight ? ' vocab-opt--wrong' : ''}`
                : 'option vocab-opt';
              return (
                <button key={opt} type="button" className={cls} disabled={!!feedback || busy} onClick={() => { setPicked(opt); void submit(opt); }}>
                  <strong aria-hidden="true">{QUIZ_LETTERS[i] ?? ''}</strong>{opt}
                  {feedback && isRight ? <span aria-hidden="true"> ✓</span> : ''}
                  {feedback && isPicked && !isRight ? <span aria-hidden="true"> ✗</span> : ''}
                </button>
              );
            })}
          </>
        )}

        {quiz.type === 'affix' && (
          <>
            <p className="vocab-quiz-q">“<span className="vocab-q-word">{word.word}</span>” có nghĩa là gì?</p>
            <p className="vocab-affix-hint">💡 Từ này có {affixKindLabel} <strong>{quiz.affixLabel}</strong> — hãy đoán nghĩa qua {affixKindLabel} nhé.</p>
            {quiz.options?.map((opt, i) => {
              const isPicked = picked === opt;
              const isRight = opt === word.meaning;
              const cls = feedback
                ? `option vocab-opt${isRight ? ' vocab-opt--correct' : ''}${isPicked && !isRight ? ' vocab-opt--wrong' : ''}`
                : 'option vocab-opt';
              return (
                <button key={opt} type="button" className={cls} disabled={!!feedback || busy} onClick={() => { setPicked(opt); void submit(opt); }}>
                  <strong aria-hidden="true">{QUIZ_LETTERS[i] ?? ''}</strong>{opt}
                  {feedback && isRight ? <span aria-hidden="true"> ✓</span> : ''}
                  {feedback && isPicked && !isRight ? <span aria-hidden="true"> ✗</span> : ''}
                </button>
              );
            })}
          </>
        )}

        {quiz.type === 'type' && (
          <>
            <p className="vocab-quiz-q">Từ nào có nghĩa “<span className="vocab-q-word">{word.meaning}</span>”?</p>
            {contextText && (
              <div className="vocab-context"><span className="vocab-context-label">Ngữ cảnh:</span>{highlightWord(contextText, word.word)}</div>
            )}
            <div className="btn-row vocab-answer-row">
              <input
                value={typed}
                autoFocus
                className={feedback && !feedback.correct ? 'vocab-input--wrong' : undefined}
                disabled={!!feedback || busy}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void submit(typed); }}
                placeholder="Gõ từ tiếng Anh…"
                aria-label="Gõ từ tiếng Anh"
              />
              {!feedback && (
                <button type="button" className="btn" disabled={busy || !typed.trim()} onClick={() => void submit(typed)}>
                  {busy ? 'Đang chấm…' : 'Trả lời'}
                </button>
              )}
            </div>
          </>
        )}

        {quiz.type === 'cloze' && (
          <>
            <p className="vocab-quiz-q">Điền từ còn thiếu vào câu:</p>
            <p className="vocab-cloze">{quiz.cloze}</p>
            <p className="muted">Gợi ý: {word.meaning}</p>
            <div className="btn-row vocab-answer-row">
              <input
                value={typed}
                autoFocus
                className={feedback && !feedback.correct ? 'vocab-input--wrong' : undefined}
                disabled={!!feedback || busy}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void submit(typed); }}
                placeholder="Gõ từ còn thiếu…"
                aria-label="Gõ từ còn thiếu"
              />
              {!feedback && (
                <button type="button" className="btn" disabled={busy || !typed.trim()} onClick={() => void submit(typed)}>
                  {busy ? 'Đang chấm…' : 'Trả lời'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {feedback && (
        <>
          {feedback.correct ? (
            <div className="success vocab-feedback--ok">
              {isNewAffix
                ? `Chính xác! Bạn đã đoán đúng nghĩa nhờ ${affixKindLabel}.`
                : <>Chính xác! +5 điểm thành thạo{feedback.xp > 0 ? ` • +${feedback.xp} XP` : ''}.</>}
            </div>
          ) : (
            <div className="error vocab-feedback--bad">
              Chưa đúng. {quiz.type === 'mcq' || quiz.type === 'affix'
                ? <>Đáp án đúng: <strong>{word.meaning}</strong>.</>
                : <>Từ đúng: <strong>{word.word}</strong> — {word.meaning}.</>}
              {!isNewAffix && ' Từ này sẽ ôn lại vào ngày mai.'}
            </div>
          )}
          {affixMsg && <div className="success">{affixMsg}</div>}
          <div className="btn-row">
            {isNewAffix && !affixSaved && (
              <button type="button" className="btn secondary" disabled={affixSaving} onClick={() => void saveAffixWord()}>
                {affixSaving ? 'Đang lưu…' : '＋ Lưu từ này vào sổ'}
              </button>
            )}
            <button type="button" className="btn" onClick={next}>
              {idx + 1 >= quizzes.length ? 'Xem kết quả' : 'Câu tiếp theo →'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* Viet cau voi tu (phuong phap 5, ban tu doi chieu): user tu viet 1
 * cau co chua tu, tu doi chieu voi cau mau that, roi tu danh dau
 * Dat/Chua dat. Cau mau CHI lay tu du lieu that (example/context cua
 * tu, hoac example trong kho Tu chung) — khong bao gio bia cau mau.
 * Server tu +5 mastery 1 lan duy nhat khi danh dau Dat lan dau;
 * client chi hien "+5" khi mastery tra ve that su tang. Khong co XP. */
function SentenceComposer({ word, onWordUpdated, onClose }: {
  word: UserWord;
  onWordUpdated: (w: UserWord) => void;
  onClose: () => void;
}) {
  const [sentences, setSentences] = useState<WordSentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const [draft, setDraft] = useState('');
  const [inlineError, setInlineError] = useState('');
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<string[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.listWordSentences(word.id)
      .then((d) => setSentences(d.items))
      .catch(setError)
      .finally(() => setLoading(false));
    // Cau mau that: uu tien example roi context cua tu (toi da 2 cau,
    // khu trung); neu ca 2 trong thi tra kho Tu chung theo dung tu.
    const local = [...new Set(
      [word.example, word.context].map((s) => s?.trim()).filter((s): s is string => !!s),
    )].slice(0, 2);
    if (local.length > 0) {
      setSamples(local);
    } else {
      setSamplesLoading(true);
      api.vocabularyByWord(word.word)
        .then((v) => { if (v.example?.trim()) setSamples([v.example.trim()]); })
        .catch(() => undefined)
        .finally(() => setSamplesLoading(false));
    }
    // Chi tai 1 lan khi mo composer (key theo word.id o noi goi).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id]);

  const save = async () => {
    const sentence = draft.trim();
    if (!sentenceHasWord(sentence, word.word)) {
      setInlineError(`Câu của bạn chưa có từ ${word.word}.`);
      return;
    }
    setInlineError('');
    setBusy(true);
    try {
      const s = await api.createWordSentence(word.id, sentence);
      setSentences((list) => [s, ...list]);
      setDraft('');
      setMsg('Đã lưu câu của bạn. Hãy tự đối chiếu với câu mẫu, rồi đánh dấu Đạt nếu câu đúng.');
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const markSentence = async (s: WordSentence, mark: 'good' | 'not_yet') => {
    const before = word.mastery ?? 0;
    try {
      const r = await api.markWordSentence(word.id, s.id, mark);
      setSentences((list) => list.map((x) => (x.id === s.id ? r.sentence : x)));
      onWordUpdated(r.word);
      if (mark === 'good' && (r.word.mastery ?? 0) > before) {
        setMsg(`＋5 điểm thành thạo cho từ “${word.word}”.`);
      } else if (mark === 'good') {
        setMsg('Đã đánh dấu Đạt cho câu này.');
      } else {
        setMsg('Đã đánh dấu Chưa đạt — hãy sửa lại câu rồi đánh dấu lại nhé.');
      }
    } catch (e) { setError(e); }
  };

  const removeSentence = async (s: WordSentence) => {
    if (!(await confirmDialog({ title: 'Xóa câu này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true }))) return;
    try {
      await api.deleteWordSentence(word.id, s.id);
      setSentences((list) => list.filter((x) => x.id !== s.id));
    } catch (e) { setError(e); }
  };

  return (
    <div className="card vocab-composer vocab-anim-in">
      <div className="btn-row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Viết câu với từ “{word.word}” — {word.meaning}</h2>
        <button type="button" className="btn ghost btn-sm" onClick={onClose}>Đóng ✕</button>
      </div>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      {samplesLoading ? (
        <p className="muted">Đang tìm câu mẫu…</p>
      ) : samples.length > 0 ? (
        <div className="vocab-sample-box">
          <span className="vocab-sample-label">Câu mẫu:</span>
          {samples.map((s, i) => <p key={i}>{highlightWord(s, word.word)}</p>)}
        </div>
      ) : (
        <p className="muted">Hãy viết một câu với từ này trong một tình huống công việc hoặc học tập quen thuộc với bạn.</p>
      )}
      <label>Viết câu của bạn</label>
      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setInlineError(''); }}
        rows={3}
        placeholder={`Viết một câu có từ ${word.word}…`}
        aria-label={`Viết câu với từ ${word.word}`}
      />
      {inlineError && <p className="error">{inlineError}</p>}
      <div className="btn-row">
        <button type="button" className="btn" disabled={busy || !draft.trim()} onClick={() => void save()}>
          {busy ? 'Đang lưu…' : 'Lưu câu'}
        </button>
      </div>
      <h3>Câu đã lưu ({sentences.length})</h3>
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : sentences.length === 0 ? (
        <p className="muted">Chưa có câu nào. Viết câu đầu tiên ở trên nhé.</p>
      ) : (
        <ul className="vocab-sentence-list">
          {sentences.map((s) => (
            <li key={s.id} className="vocab-sentence-item">
              <div className="vocab-sentence-text">
                <span>{highlightWord(s.sentence, word.word)}</span>
                <span className="muted vocab-sentence-date">
                  {new Date(s.createdAt).toLocaleDateString('vi-VN')}
                </span>
                {s.masteryAwarded && <span className="vocab-pill vocab-pill--done">＋5 thành thạo</span>}
              </div>
              <div className="btn-row vocab-sentence-actions">
                <button type="button" className="btn ghost btn-sm" disabled={s.selfMark === 'good'} onClick={() => void markSentence(s, 'good')}>Đạt ✓</button>
                <button type="button" className="btn ghost btn-sm" disabled={s.selfMark === 'not_yet'} onClick={() => void markSentence(s, 'not_yet')}>Chưa đạt</button>
                <button type="button" className="btn ghost btn-sm" onClick={() => void removeSentence(s)}>Xóa</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MyWords() {
  const [words, setWords] = useState<UserWord[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [idx, setIdx] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  // On tap ngat quang: hang doi tu den han + phien kiem tra.
  const [dueItems, setDueItems] = useState<UserWord[]>([]);
  const [dueTotal, setDueTotal] = useState(0);
  const [session, setSession] = useState<{ queue: UserWord[] } | null>(null);
  const [searchParams] = useSearchParams();
  const autoStartRef = useRef(false);
  // Sửa từ: form mở theo từ đang sửa.
  const [editing, setEditing] = useState<UserWord | null>(null);
  const [editForm, setEditForm] = useState({ phonetic: '', pos: '', meaning: '', example: '', topic: '' });
  // Viết câu với từ: chỉ lưu id — từ lấy lại từ danh sách words để luôn
  // có mastery mới nhất sau khi đánh dấu Đạt/Chưa đạt.
  const [composerId, setComposerId] = useState<number | null>(null);
  const composerWord = words.find((x) => x.id === composerId) ?? null;
  // Thêm từ mới tay: gõ từ -> tra cứu tự điền -> sửa lại -> lưu.
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ word: '', phonetic: '', pos: '', meaning: '', example: '', topic: '' });
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const load = () => {
    api.userWords('', 500, 0).then((d) => { setWords(d.items); setIdx(0); setFlipped(false); }).catch(setError);
    api.dueUserWords(20).then((d) => { setDueItems(d.items); setDueTotal(d.total); }).catch(setError);
  };
  useEffect(load, []);

  // Mo tu trang Hom nay (?review=due): tu dong bat phien on khi co tu den han.
  useEffect(() => {
    if (searchParams.get('review') === 'due' && dueItems.length > 0 && !autoStartRef.current) {
      autoStartRef.current = true;
      setSession({ queue: dueItems.slice(0, 20) });
    }
  }, [searchParams, dueItems]);

  /** 1 tu vua duoc on trong phien: cap nhat danh sach + rut khoi hang doi. */
  const handleReviewed = (updated: UserWord) => {
    setWords((list) => list.map((x) => (x.id === updated.id ? updated : x)));
    setDueItems((list) => list.filter((x) => x.id !== updated.id));
    setDueTotal((n) => Math.max(0, n - 1));
  };

  const filtered = useMemo(
    () => (statusFilter ? words.filter((w) => w.status === statusFilter) : words),
    [words, statusFilter]
  );
  const safeIdx = filtered.length ? Math.min(idx, filtered.length - 1) : 0;
  const w = filtered[safeIdx];

  // So lieu cho dai thong ke + bo loc chip (chi hien thi, khong doi logic).
  const counts = useMemo(() => ({
    all: words.length,
    learning: words.filter((x) => x.status === 'learning').length,
    learned: words.filter((x) => x.status === 'learned').length,
    wrong: words.filter((x) => x.status === 'wrong').length,
  }), [words]);
  const FILTERS: { key: string; label: string; count: number }[] = [
    { key: '', label: 'Tất cả', count: counts.all },
    { key: 'learning', label: 'Đang học', count: counts.learning },
    { key: 'learned', label: 'Đã thuộc', count: counts.learned },
    { key: 'wrong', label: 'Chưa thuộc', count: counts.wrong },
  ];

  const mark = async (id: number, status: WordStatus) => {
    const wasDue = dueItems.some((x) => x.id === id);
    try {
      const updated = await api.markUserWord(id, status);
      setWords((list) => list.map((x) => (x.id === id ? updated : x)));
      // Danh dau Da thuoc/Chua thuoc cung len lich on moi -> rut khoi hang doi hom nay.
      if (wasDue && status !== 'learning') {
        setDueItems((list) => list.filter((x) => x.id !== id));
        setDueTotal((n) => Math.max(0, n - 1));
      }
      setMsg(`Đã đánh dấu "${updated.word}": ${STATUS_LABEL[status]}.`);
    } catch (e) { setError(e); }
  };

  const removeWord = async (word: UserWord) => {
    if (!(await confirmDialog({ title: `Xóa từ "${word.word}" khỏi Từ của tôi?`, confirmText: 'Xóa', cancelText: 'Hủy', danger: true }))) return;
    const wasDue = dueItems.some((x) => x.id === word.id);
    try {
      await api.deleteUserWord(word.id);
      setWords((list) => list.filter((x) => x.id !== word.id));
      if (wasDue) {
        setDueItems((list) => list.filter((x) => x.id !== word.id));
        setDueTotal((n) => Math.max(0, n - 1));
      }
      setMsg(`Đã xóa từ "${word.word}".`);
    } catch (e) { setError(e); }
  };

  const startEdit = (word: UserWord) => {
    setEditing(word);
    setEditForm({
      phonetic: word.phonetic || '',
      pos: word.pos || '',
      meaning: word.meaning || '',
      example: word.example || '',
      topic: word.topic || '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.meaning.trim()) { setError(new Error('Nghĩa không được để trống.')); return; }
    try {
      const updated = await api.updateUserWord(editing.id, {
        phonetic: editForm.phonetic, pos: editForm.pos, meaning: editForm.meaning,
        example: editForm.example, topic: editForm.topic,
      });
      setWords((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      setEditing(null);
      setMsg(`Đã lưu sửa đổi cho từ "${updated.word}".`);
    } catch (e) { setError(e); }
  };

  const lookupAdd = async () => {
    const word = addForm.word.trim();
    if (!word) { setLookupError('Gõ từ cần thêm trước đã.'); return; }
    setLookupError('');
    setLookupLoading(true);
    try {
      const entry = await api.dictionaryLookup(word);
      setAddForm((f) => ({
        ...f,
        word: entry.word,
        phonetic: entry.phonetic || '',
        pos: entry.pos || '',
        meaning: entry.meaning_vi,
        example: entry.example || '',
      }));
    } catch {
      setLookupError('Không tra được từ này, thử lại sau (hoặc tự gõ nghĩa rồi lưu).');
    } finally {
      setLookupLoading(false);
    }
  };

  const saveAdd = async () => {
    if (!addForm.word.trim() || !addForm.meaning.trim()) {
      setError(new Error('Cần có từ và nghĩa tiếng Việt mới lưu được.'));
      return;
    }
    try {
      const row = await api.createUserWord({
        word: addForm.word.trim(),
        phonetic: addForm.phonetic || undefined,
        pos: addForm.pos || undefined,
        meaning: addForm.meaning.trim(),
        example: addForm.example || undefined,
        topic: addForm.topic || undefined,
      });
      if (row.existed) {
        setMsg(`Từ "${row.word}" đã có trong Từ của tôi rồi.`);
      } else {
        setWords((list) => [row, ...list]);
        setMsg(`Đã thêm từ "${row.word}" vào Từ của tôi.`);
      }
      setAddForm({ word: '', phonetic: '', pos: '', meaning: '', example: '', topic: '' });
      setShowAdd(false);
    } catch (e) { setError(e); }
  };

  return (
    <div>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      {session ? (
        <VocabReviewSession
          queue={session.queue}
          allWords={words}
          onReviewed={handleReviewed}
          onAdded={(w) => setWords((list) => [w, ...list])}
          onClose={() => setSession(null)}
        />
      ) : (
        <>
          {dueTotal > 0 ? (
            <div className="vocab-due-card">
              <div className="vocab-due-text">
                <div className="vocab-due-eyebrow">📖 Ôn tập hôm nay</div>
                <div className="vocab-due-num">{dueTotal} <span>từ đến hạn ôn</span></div>
                <div className="muted">Mỗi từ ôn đúng +2 XP (tối đa 20 XP/ngày).</div>
              </div>
              <button type="button" className="btn vocab-due-btn" onClick={() => setSession({ queue: dueItems.slice(0, 20) })}>Bắt đầu ôn →</button>
            </div>
          ) : words.length > 0 ? (
            <div className="success vocab-due-done">🎉 Hôm nay không còn từ đến hạn ôn.</div>
          ) : null}

          {words.length > 0 && (
            <div className="stat-grid vocab-stats">
              <div className="stat-box"><b>{words.length}</b><span>Từ đã lưu</span></div>
              <div className="stat-box"><b>{dueTotal}</b><span>Đến hạn hôm nay</span></div>
              <div className="stat-box"><b>{counts.learned}</b><span>Đã thuộc</span></div>
            </div>
          )}

          <div className="vocab-toolbar">
            <div className="vocab-filter" role="group" aria-label="Lọc theo trạng thái">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`vocab-chip${statusFilter === f.key ? ' vocab-chip--active' : ''}`}
                  aria-pressed={statusFilter === f.key}
                  onClick={() => { setStatusFilter(f.key); setIdx(0); setFlipped(false); }}
                >
                  {f.label} <span>{f.count}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => setShowAdd((v) => !v)}>＋ Thêm từ mới</button>
          </div>

          {showAdd && (
            <div className="card vocab-form-card vocab-anim-in">
              <h2>Thêm từ mới</h2>
              <label>Từ tiếng Anh</label>
              <div className="btn-row vocab-answer-row">
                <input value={addForm.word} onChange={(e) => setAddForm((f) => ({ ...f, word: e.target.value }))} placeholder="vd: supervisor" />
                <button type="button" className="btn secondary" disabled={lookupLoading} onClick={() => void lookupAdd()}>
                  {lookupLoading ? 'Đang tra…' : 'Tra cứu'}
                </button>
              </div>
              {lookupError && <p className="error">{lookupError}</p>}
              <p className="muted">Bấm "Tra cứu" để tự điền phiên âm, loại từ và nghĩa — sửa lại nếu cần rồi bấm Lưu.</p>
              <div className="vocab-form-grid">
                <div>
                  <label>Phiên âm</label>
                  <input value={addForm.phonetic} onChange={(e) => setAddForm((f) => ({ ...f, phonetic: e.target.value }))} placeholder="/ˈsuːpərvaɪzər/" />
                </div>
                <div>
                  <label>Loại từ</label>
                  <input value={addForm.pos} onChange={(e) => setAddForm((f) => ({ ...f, pos: e.target.value }))} placeholder="vd: danh từ" />
                </div>
              </div>
              <label>Nghĩa tiếng Việt</label>
              <input value={addForm.meaning} onChange={(e) => setAddForm((f) => ({ ...f, meaning: e.target.value }))} />
              <label>Ví dụ</label>
              <input value={addForm.example} onChange={(e) => setAddForm((f) => ({ ...f, example: e.target.value }))} />
              <label>Chủ đề (không bắt buộc)</label>
              <input value={addForm.topic} onChange={(e) => setAddForm((f) => ({ ...f, topic: e.target.value }))} placeholder="vd: office" />
              <div className="btn-row">
                <button type="button" className="btn" onClick={() => void saveAdd()}>Lưu từ</button>
                <button type="button" className="btn secondary" onClick={() => setShowAdd(false)}>Đóng</button>
              </div>
            </div>
          )}

          {w ? (
            <div className="card">
              <h2>Flashcard</h2>
              <FlashcardView
                word={w.word}
                sub={[w.phonetic, w.pos].filter(Boolean).join(' · ')}
                meaning={w.meaning}
                example={w.example || ''}
                flipped={flipped}
                onFlip={() => setFlipped((f) => !f)}
                onPrev={() => { setIdx((i) => i - 1); setFlipped(false); }}
                onNext={() => { setIdx((i) => i + 1); setFlipped(false); }}
                prevDisabled={safeIdx === 0}
                nextDisabled={safeIdx + 1 >= filtered.length}
                counter={`Từ ${safeIdx + 1}/${filtered.length}`}
                actions={
                  <>
                    <button type="button" className="btn" onClick={() => void mark(w.id, 'learned')}>Đã thuộc ✅</button>
                    <button type="button" className="btn danger" onClick={() => void mark(w.id, 'wrong')}>Chưa thuộc ❌</button>
                    <button type="button" className="btn secondary" onClick={() => setComposerId(w.id)}>✍️ Viết câu</button>
                  </>
                }
                footer={
                  <div className="vocab-flash-meta">
                    <StatusPill status={w.status} />
                    <MasteryBar value={w.mastery ?? 0} />
                    <DuePill w={w} />
                  </div>
                }
              />
            </div>
          ) : (
            <div className="card">
              <p>Chưa có từ nào ở đây. Khi luyện tập, bấm vào từ trong đoạn văn rồi chọn ＋ Lưu vào từ vựng — từ sẽ hiện ở đây. Bạn cũng có thể bấm "＋ Thêm từ mới" để tự thêm.</p>
            </div>
          )}

          {editing && (
            <div className="card vocab-form-card vocab-anim-in">
              <h2>Sửa từ "{editing.word}"</h2>
              <div className="vocab-form-grid">
                <div>
                  <label>Phiên âm</label>
                  <input value={editForm.phonetic} onChange={(e) => setEditForm((f) => ({ ...f, phonetic: e.target.value }))} />
                </div>
                <div>
                  <label>Loại từ</label>
                  <input value={editForm.pos} onChange={(e) => setEditForm((f) => ({ ...f, pos: e.target.value }))} />
                </div>
              </div>
              <label>Nghĩa tiếng Việt</label>
              <input value={editForm.meaning} onChange={(e) => setEditForm((f) => ({ ...f, meaning: e.target.value }))} />
              <label>Ví dụ</label>
              <input value={editForm.example} onChange={(e) => setEditForm((f) => ({ ...f, example: e.target.value }))} />
              <label>Chủ đề</label>
              <input value={editForm.topic} onChange={(e) => setEditForm((f) => ({ ...f, topic: e.target.value }))} />
              <div className="btn-row">
                <button type="button" className="btn" onClick={() => void saveEdit()}>Lưu sửa đổi</button>
                <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Hủy</button>
              </div>
            </div>
          )}

          {words.length > 0 && (
            <div className="card">
              <h2>Danh sách từ ({filtered.length})</h2>
              <table className="vocab-table">
                <thead><tr><th>Từ</th><th>Nghĩa</th><th>Thành thạo</th><th>Trạng thái</th><th></th></tr></thead>
                <tbody>
                  {filtered.map((v, i) => (
                    <tr key={v.id} className="vocab-row-in" style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}>
                      <td className="vocab-word-cell">
                        <strong><AffixWord word={v.word} /></strong>
                        <span className="muted">{[v.phonetic, v.pos].filter(Boolean).join(' · ')}</span>
                        {v.example ? <span className="muted vocab-ex">{highlightWord(v.example, v.word)}</span> : null}
                      </td>
                      <td className="vocab-meaning-cell">{v.meaning}</td>
                      <td>
                        <MasteryBar value={v.mastery ?? 0} />
                        <DuePill w={v} />
                      </td>
                      <td>
                        <select className="vocab-status-sel" value={v.status} onChange={(e) => void mark(v.id, e.target.value as WordStatus)} aria-label={`Trạng thái của từ ${v.word}`}>
                          <option value="learning">Đang học</option>
                          <option value="learned">Đã thuộc</option>
                          <option value="wrong">Chưa thuộc</option>
                        </select>
                      </td>
                      <td>
                        <div className="btn-row vocab-row-actions">
                          <button type="button" className="btn ghost btn-sm" onClick={() => setComposerId(v.id)}>Viết câu</button>
                          <button type="button" className="btn ghost btn-sm" onClick={() => startEdit(v)}>Sửa</button>
                          <button type="button" className="btn ghost btn-sm" onClick={() => void removeWord(v)}>Xóa</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {composerWord && (
            <SentenceComposer
              key={composerWord.id}
              word={composerWord}
              onWordUpdated={(updated) => setWords((list) => list.map((x) => (x.id === updated.id ? updated : x)))}
              onClose={() => setComposerId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function SharedWords() {
  const { exam } = useExam();
  const ex = exam ?? 'toeic';
  const [topics, setTopics] = useState<{ topic: string; count: number }[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const [words, setWords] = useState<Vocab[]>([]);
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [flipped, setFlipped] = useState(false);
  const [idx, setIdx] = useState(0);
  const [msg, setMsg] = useState('');
  const [learning, setLearning] = useState(false);

  useEffect(() => {
    setTopic(null);
    setLoading(true);
    api.vocabularyTopics(ex).then(setTopics).catch(setError).finally(() => setLoading(false));
  }, [ex]);

  useEffect(() => {
    if (!topic) return;
    setLoading(true);
    setMsg('');
    Promise.all([api.vocabulary(topic, 1000, ex), api.userWords('', 500)])
      .then(([ws, mine]) => {
        setWords(ws);
        setIdx(0);
        setFlipped(false);
        setSavedWords(new Set(mine.items.map((w) => w.word.toLowerCase())));
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [topic, ex]);

  const w = words[idx];
  const total = topics.reduce((s, t) => s + t.count, 0);
  const savedCount = words.filter((v) => savedWords.has(v.word.toLowerCase())).length;

  const mark = async (status: 'learning' | 'learned' | 'wrong', vocabId?: string) => {
    const id = vocabId || w?.id;
    if (!id) return;
    try {
      await api.markVocab(id, status);
      setMsg(status === 'learned' ? 'Đã đánh dấu đã thuộc ✅' : status === 'wrong' ? 'Đã đưa vào danh sách ôn lại.' : 'Đã đánh dấu đang học.');
    } catch (e) { setError(e); }
  };

  const learnOne = async (v: Vocab) => {
    try {
      const r = await api.learnVocab(v.id);
      setSavedWords((s) => new Set(s).add(v.word.toLowerCase()));
      setMsg(r.alreadyExists ? `"${v.word}" đã có trong Từ của tôi.` : `Đã lưu "${v.word}" vào Từ của tôi — sẽ ôn lại vào ngày mai.`);
    } catch (e) { setError(e); }
  };

  const learnSet = async () => {
    if (!topic || learning) return;
    setLearning(true);
    try {
      const r = await api.learnVocabSet(topic, ex);
      setSavedWords((s) => {
        const next = new Set(s);
        words.forEach((v) => next.add(v.word.toLowerCase()));
        return next;
      });
      setMsg(r.added > 0
        ? `Đã thêm ${r.added} cụm vào Từ của tôi${r.skipped > 0 ? ` (${r.skipped} cụm đã có sẵn)` : ''} — các cụm mới sẽ ôn lại vào ngày mai.`
        : 'Cả bộ này đã có trong Từ của tôi rồi.');
    } catch (e) { setError(e); } finally { setLearning(false); }
  };

  if (loading && !topic && topics.length === 0) {
    return <p className="muted">Đang tải kho từ chung…</p>;
  }

  return (
    <div>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      {topics.length === 0 ? (
        <div className="card">
          <p>Chưa có từ chung cho kỳ thi này.</p>
        </div>
      ) : topic === null ? (
        <>
          <p className="muted vocab-shared-intro">Từ và cụm từ trích từ đề thi trong app và sách 600 từ vựng TOEIC, chia theo chủ đề. Bấm vào một chủ đề để xem danh sách từ và lưu vào "Từ của tôi" kèm lịch ôn.</p>
          <div className="pick-grid">
            {topics.map((t, i) => (
              <button key={t.topic} type="button" className="pick-box vocab-topic-box" style={{ animationDelay: `${Math.min(i, 9) * 50}ms` }} onClick={() => setTopic(t.topic)}>
                <b>{t.topic}</b>
                <span>{t.count} cụm</span>
              </button>
            ))}
          </div>
          <p className="muted">Tổng cộng {total} cụm.</p>
        </>
      ) : (
        <>
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={() => { setTopic(null); setMsg(''); }}>← Tất cả chủ đề</button>
            <button type="button" className="btn" disabled={learning || words.length === 0} onClick={() => void learnSet()}>
              {learning ? 'Đang lưu…' : `Học bộ này (${words.length} cụm)`}
            </button>
          </div>
          <div className="vocab-topic-head">
            <h2>{topic}</h2>
            <div className="vocab-topic-meta">
              <span>Đã lưu {savedCount}/{words.length} cụm</span>
              <div className="vocab-progress vocab-topic-progress"><div className="vocab-progress-fill" style={{ width: `${words.length ? Math.round((savedCount / words.length) * 100) : 0}%` }} /></div>
            </div>
          </div>
          {loading ? (
            <p className="muted">Đang tải…</p>
          ) : words.length === 0 ? (
            <div className="card"><p>Chủ đề này chưa có cụm từ nào.</p></div>
          ) : (
            <>
              {w && (
                <div className="card">
                  <h2>Flashcard</h2>
                  <FlashcardView
                    word={w.word}
                    sub={w.phonetic || ''}
                    meaning={w.meaning}
                    example={w.example || ''}
                    flipped={flipped}
                    onFlip={() => setFlipped((f) => !f)}
                    onPrev={() => { setIdx((i) => i - 1); setFlipped(false); }}
                    onNext={() => { setIdx((i) => i + 1); setFlipped(false); }}
                    prevDisabled={idx === 0}
                    nextDisabled={idx + 1 >= words.length}
                    counter={`Từ ${idx + 1}/${words.length}`}
                    actions={
                      <>
                        <button type="button" className="btn" onClick={() => void mark('learned')}>Đã thuộc ✅</button>
                        <button type="button" className="btn danger" onClick={() => void mark('wrong')}>Chưa thuộc ❌</button>
                      </>
                    }
                  />
                </div>
              )}

              <div className="card">
                <h2>Danh sách cụm ({words.length})</h2>
                <table className="vocab-table"><thead><tr><th>Cụm từ</th><th>Phiên âm</th><th>Nghĩa</th><th></th></tr></thead>
                  <tbody>{words.map((v, i) => {
                    const saved = savedWords.has(v.word.toLowerCase());
                    return (
                      <tr key={v.id} className="vocab-row-in" style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}>
                        <td className="vocab-word-cell">
                          <strong><AffixWord word={v.word} /></strong>
                          {v.example ? <span className="muted vocab-ex">{highlightWord(v.example, v.word)}</span> : null}
                        </td>
                        <td className="vocab-phonetic">{v.phonetic || ''}</td>
                        <td className="vocab-meaning-cell">{v.meaning}</td>
                        <td><button type="button" className="btn ghost btn-sm vocab-save-btn" disabled={saved} onClick={() => void learnOne(v)}>{saved ? 'Đã lưu ✓' : '＋ Lưu'}</button></td>
                      </tr>
                    );
                  })}</tbody></table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
