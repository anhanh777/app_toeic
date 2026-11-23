// Điều khiển trả lời dùng chung cho các dạng câu IELTS (Practice, Mock,
// Ôn câu sai). Trắc nghiệm A–D dùng lại nút .option như TOEIC nên không
// nằm ở đây — chỉ các dạng riêng của IELTS: T/F/NG, Y/N/NG, matching
// (select), điền từ (ô nhập text + đếm từ).
import { useState } from 'react';
import type { Question } from './api';
import { isFillIn, isMatching, isMultiAnswer, parseSelectedLabels, stripLeadingNumber, toggleSelectedLabel, wordCount } from './exam';
import { useMenuIcons } from './menuIcons';

export interface AnswerResultLike {
  correct: boolean;
  correctLabel?: string | null;
  correctText?: string | null;
  explanation?: string;
  transcript?: string;
  xpAwarded?: number;
  /** Điểm từng phần của câu gộp (VD đúng 1/2 nhãn → marks=1, maxMarks=2). */
  marks?: number | null;
  maxMarks?: number | null;
}

interface Props {
  q: Question;
  /** Đáp án hiện tại: nhãn (dạng chọn) hoặc text đã gõ (dạng điền từ). */
  value: string;
  onChange: (v: string) => void;
  /** Gọi khi đáp án "chốt" (chọn nút/select, hoặc blur khỏi ô nhập) —
   * Mock dùng để autosave, Practice/Ôn câu sai không cần. */
  onCommit?: (v: string) => void;
  disabled?: boolean;
  /** Kết quả chấm (chỉ Practice/Ôn câu sai mới có). */
  graded?: AnswerResultLike | null;
  /** true khi 2 câu trong cùng 1 passage đang chọn trùng 1 tiêu đề. */
  duplicateHeading?: boolean;
}

const TFNG_LABELS = ['TRUE', 'FALSE', 'NOT GIVEN'];
const YNNG_LABELS = ['YES', 'NO', 'NOT GIVEN'];

/** Gợi ý trong ô nhập theo dạng điền từ (mặc định: 'Nhập đáp án'). */
const FILL_IN_PLACEHOLDERS: Record<string, string> = {
  note_completion: 'Nhập đáp án cho ghi chú',
  table_completion: 'Nhập đáp án cho ô trong bảng',
  flow_chart_completion: 'Nhập đáp án cho bước trong sơ đồ',
  diagram_completion: 'Nhập nhãn cho sơ đồ',
};

export function IeltsAnswerControl({ q, value, onChange, onCommit, disabled, graded, duplicateHeading }: Props) {
  const type = q.questionType || 'multiple_choice';

  // --- True / False / Not Given & Yes / No / Not Given ---
  // 3 nhãn dài (đặc biệt "NOT GIVEN") hiển thị dạng hàng nút pill ngang,
  // KHÔNG dùng ô tròn 1.7rem của phương án A/B/C/D (ô đó chỉ vừa 1 chữ).
  if (type === 'true_false_not_given' || type === 'yes_no_not_given') {
    const labels = type === 'true_false_not_given' ? TFNG_LABELS : YNNG_LABELS;
    // Ưu tiên options backend trả (label + content); thiếu thì dùng nhãn cố định.
    const opts = labels.map(l => q.options.find(o => o.label === l) || { label: l, content: l });
    return (
      <div className="ielts-tfng">
        <p className="muted" style={{ marginTop: 0 }}>
          {type === 'true_false_not_given'
            ? '💡 FALSE = bài nói ngược lại, NOT GIVEN = bài không nhắc tới.'
            : '💡 NO = tác giả phản đối, NOT GIVEN = bài không nhắc tới.'}
        </p>
        <div className="ielts-tfng-row">
          {opts.map(o => {
            let cls = 'option ielts-tfng-opt';
            if (value === o.label) cls += ' selected';
            if (graded) {
              if (o.label === graded.correctLabel) cls += ' correct';
              else if (value === o.label && !graded.correct) cls += ' wrong';
            }
            return (
              <button key={o.label} className={cls} disabled={disabled || !!graded}
                onClick={() => { onChange(o.label); onCommit?.(o.label); }}>
                <strong>{o.label}</strong>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // --- List Selection: chọn 2–3 đáp án (checkbox), đúng hết mới tính
  // điểm. Đáp án lưu dạng chuỗi nhãn đã sắp xếp, nối bằng dấu phẩy, VD "A,C".
  if (isMultiAnswer(type)) {
    const selected = parseSelectedLabels(value);
    const correctSet = graded?.correctLabel ? parseSelectedLabels(graded.correctLabel) : [];
    // Số nhãn phải chọn = số câu trên đề mà row này gộp (2–3); dữ liệu cũ
    // chưa có paperSpan thì giữ gợi ý chung "2–3".
    const need = q.paperSpan && q.paperSpan > 1 ? q.paperSpan : null;
    const isPartial = !!graded && !graded.correct && graded.marks != null && graded.maxMarks != null && graded.marks > 0 && graded.marks < graded.maxMarks;
    return (
      <div>
        <p className="muted" style={{ marginTop: 0 }}>💡 {need ? `Chọn ${need} đáp án — mỗi đáp án đúng tính 1 điểm.` : 'Chọn 2–3 đáp án — mỗi đáp án đúng tính 1 điểm.'}</p>
        <div className="exam-opts ielts-multi">
          {q.options.map(o => {
            const isSel = selected.includes(o.label);
            let cls = 'option';
            if (isSel) cls += ' selected';
            if (graded) {
              if (correctSet.includes(o.label)) cls += ' correct';
              else if (isSel) cls += ' wrong';
            }
            return (
              <label key={o.label} className={cls}>
                <input
                  type="checkbox"
                  checked={isSel}
                  disabled={disabled || !!graded}
                  onChange={() => {
                    // Chặn chọn quá số nhãn cần: đã đủ thì không bật thêm.
                    if (!isSel && need && selected.length >= need) return;
                    const next = toggleSelectedLabel(value, o.label);
                    onChange(next);
                    onCommit?.(next);
                  }}
                  aria-label={`Chọn đáp án ${o.label}`}
                />
                <strong>{o.label}</strong> {o.content}
              </label>
            );
          })}
        </div>
        {graded && graded.correctLabel && (
          <p style={{ margin: '.4rem 0 0' }}>Đáp án đúng: <strong>{correctSet.join(', ') || graded.correctLabel}</strong>{isPartial ? ` — bạn đúng ${graded.marks}/${graded.maxMarks}, tính ${graded.marks} điểm nhưng chưa đủ để tính là đúng.` : ''}</p>
        )}
      </div>
    );
  }

  // --- Matching / Labelling: 1 ô select với các options của câu ---
  if (isMatching(type)) {
    return (
      <div>
        <select
          value={value}
          disabled={disabled || !!graded}
          onChange={e => { onChange(e.target.value); onCommit?.(e.target.value); }}
          aria-label="Chọn đáp án"
        >
          <option value="">— Chọn đáp án —</option>
          {q.options.map(o => (
            <option key={o.label} value={o.label}>
              {o.label}{o.content ? `. ${o.content}` : ''}
            </option>
          ))}
        </select>
        {type === 'matching_headings' && duplicateHeading && (
          <p style={{ color: 'var(--amber)', margin: '.4rem 0 0' }}>
            ⚠️ Thi thật được dùng lại 1 tiêu đề, nhưng 2 đoạn cùng 1 tiêu đề thường là 1 câu sai — kiểm tra lại nhé.
          </p>
        )}
        {graded && graded.correctLabel && (
          <p style={{ margin: '.4rem 0 0' }}>Đáp án đúng: <strong>{graded.correctLabel}</strong></p>
        )}
      </div>
    );
  }

  // --- Điền từ: ô nhập text + đếm số từ trực tiếp ---
  if (isFillIn(type)) {
    const n = wordCount(value);
    const over = q.wordLimit != null && n > q.wordLimit;
    // Gợi ý theo ngữ cảnh của dạng điền (bảng / sơ đồ / ghi chú…).
    const base = FILL_IN_PLACEHOLDERS[type] ?? 'Nhập đáp án';
    return (
      <div>
        <input
          type="text"
          value={value}
          disabled={disabled || !!graded}
          placeholder={q.wordLimit != null ? `${base} (tối đa ${q.wordLimit} từ)` : base}
          onChange={e => onChange(e.target.value)}
          onBlur={() => onCommit?.(value)}
          aria-label="Đáp án điền từ"
        />
        <p className={`word-count${over ? ' over' : ''}`}>
          {q.wordLimit != null ? `${n}/${q.wordLimit} từ` : `${n} từ`}
          {over ? ' — vượt giới hạn số từ, hãy rút gọn đáp án.' : ''}
        </p>
        {graded && graded.correctText != null && (
          <p style={{ margin: '.4rem 0 0' }}>Đáp án đúng: <strong>{graded.correctText}</strong></p>
        )}
      </div>
    );
  }

  // Trắc nghiệm A–D (multiple_choice, choosing_title): KHÔNG xử lý ở
  // đây — các màn hình dùng lại nút .option như TOEIC.
  return null;
}

/* ================= Phòng nghe kiểu YouPass ================= */

// Hướng dẫn nhóm câu (dạng điền từ) — suy ra từ questionType vì dữ liệu
// Cam không lưu sẵn hướng dẫn theo nhóm. Dùng cho khối ghi chú inline.
const NOTES_INSTRUCTIONS: Record<string, string> = {
  note_completion: 'Complete the notes below.',
  table_completion: 'Complete the table below.',
  form_completion: 'Complete the form below.',
  sentence_completion: 'Complete the sentences below.',
  summary_completion: 'Complete the summary below.',
  flow_chart_completion: 'Complete the flow chart below.',
  diagram_completion: 'Label the diagram below.',
  short_answer: 'Answer the questions below.',
  labelling: 'Label the map below.',
};
export function notesInstructionFor(type: string): string {
  return NOTES_INSTRUCTIONS[type] ?? 'Complete the questions below.';
}
const WORD_NUMBERS = ['', 'ONE WORD', 'NO MORE THAN TWO WORDS', 'NO MORE THAN THREE WORDS', 'NO MORE THAN FOUR WORDS'];
export function wordLimitLineFor(wordLimit: number | null | undefined): string | null {
  if (wordLimit == null) return null;
  const words = WORD_NUMBERS[wordLimit] ?? `NO MORE THAN ${wordLimit} WORDS`;
  return `Write ${words} AND/OR A NUMBER for each answer.`;
}

// Hướng dẫn nhóm matching (kéo-thả/bấm-đặt) — dạng chung vì dữ liệu
// không lưu hướng dẫn gốc theo nhóm.
const MATCH_INSTRUCTIONS: Record<string, string> = {
  matching: 'Choose the correct answer and move it into the gap.',
  matching_features: 'Match each statement with the correct person or thing.',
  matching_information: 'Choose the correct letter for each question.',
  matching_headings: 'Choose the correct heading for each paragraph.',
  matching_sentence_endings: 'Choose the correct ending for each sentence.',
  labelling: 'Choose the correct letter for each label.',
};
export function matchInstructionFor(type: string): string {
  return MATCH_INSTRUCTIONS[type] ?? 'Choose the correct answer and move it into the gap.';
}

export type BlockItem = { q: Question; n: number; label: string };
export type BlockSegment =
  | { kind: 'notes'; items: BlockItem[] }
  | { kind: 'matching'; items: BlockItem[] }
  | { kind: 'single'; item: BlockItem };

/** Chia các câu trong 1 khối thành: khối ghi chú inline (≥2 câu điền từ
 * liên tiếp cùng dạng — CHỈ Listening), bảng matching kéo-thả (≥2 câu nối
 * liên tiếp cùng dạng + cùng danh sách phương án — cả Listening lẫn
 * Reading), còn lại render từng câu như cũ. */
export function splitGroupSegments(items: BlockItem[]): BlockSegment[] {
  const out: BlockSegment[] = [];
  const optionsSig = (q: Question) => q.options.map(o => `${o.label}=${o.content ?? ''}`).join('|');
  let i = 0;
  while (i < items.length) {
    const { q } = items[i];
    const type = q.questionType || 'multiple_choice';
    const isFill = q.part <= 4 && isFillIn(type);
    const isMatch = isMatching(type);
    if (isFill || isMatch) {
      let j = i + 1;
      while (j < items.length) {
        const q2 = items[j].q;
        const t2 = q2.questionType || 'multiple_choice';
        if (q2.part !== q.part || t2 !== type) break;
        if (isMatch && optionsSig(q2) !== optionsSig(q)) break;
        j += 1;
      }
      if (j - i >= 2) {
        out.push({ kind: isFill ? 'notes' : 'matching', items: items.slice(i, j) });
        i = j;
        continue;
      }
    }
    out.push({ kind: 'single', item: items[i] });
    i += 1;
  }
  return out;
}

interface GroupBlockProps {
  items: BlockItem[];
  valueOf: (q: Question) => string;
  onChange: (q: Question, v: string) => void;
  /** Gọi khi đáp án "chốt" (blur khỏi ô nhập / đặt đáp án vào ô) —
   * Mock dùng để autosave, Practice không cần. */
  onCommit?: (q: Question, v: string) => void;
  disabled?: boolean;
  /** Kết quả chấm theo id câu (chỉ Practice mới có) — để tô màu ô nhập. */
  gradedById?: Record<string, AnswerResultLike | undefined>;
  flaggedById?: Record<string, boolean>;
  onToggleFlag?: (q: Question) => void;
  onFocusQuestion?: (q: Question) => void;
}

/** Nút đánh dấu câu — icon lấy từ hệ thống quản lí biểu tượng
 * (menu-icons: flag / flagged, sửa được từ web quản trị), không hard-code
 * emoji ở đây nữa (🏳 trơn từng hiện dạng text outline, nhìn như ký tự lỗi). */
export function FlagButton({ flagged, onToggle, label }: { flagged: boolean; onToggle: () => void; label: string }) {
  const { icons } = useMenuIcons();
  return (
    <button
      type="button" className={`flag-btn${flagged ? ' flag-btn--on' : ''}`}
      onClick={onToggle} title={flagged ? 'Bỏ đánh dấu câu này' : 'Đánh dấu câu này để xem lại sau'}
      aria-label={label} aria-pressed={flagged}
    >{flagged ? icons.flagged : icons.flag}</button>
  );
}

/** Khối ghi chú inline kiểu YouPass: các dòng câu của 1 nhóm điền từ hiện
 * nguyên văn, ô nhập nằm ngay trong dòng chữ (thay cho "______").
 * Dữ liệu Cam không có văn bản ghi chú hoàn chỉnh (mỗi câu là 1 dòng
 * riêng, không có tiêu đề mục) nên khối này ghép các dòng câu lại. */
export function IeltsNotesBlock({ items, valueOf, onChange, onCommit, disabled, gradedById, flaggedById, onToggleFlag, onFocusQuestion }: GroupBlockProps) {
  const first = items[0];
  const last = items[items.length - 1];
  const type = first.q.questionType || 'note_completion';
  const wordLimit = first.q.wordLimit;
  const limitLine = wordLimitLineFor(wordLimit);
  return (
    <div className="ielts-notes">
      <p className="ielts-notes-head"><strong>Questions {first.n}–{last.n}</strong></p>
      <p className="ielts-notes-inst">{notesInstructionFor(type)}</p>
      {limitLine && <p className="ielts-notes-inst">{limitLine}</p>}
      <div className="ielts-notes-body">
        {items.map(({ q, n }) => {
          const value = valueOf(q);
          const graded = gradedById?.[q.id];
          const over = q.wordLimit != null && wordCount(value) > q.wordLimit;
          const content = stripLeadingNumber(q.content || '', n);
          // Tách dòng chữ tại chỗ trống (2+ gạch dưới); không có chỗ trống
          // thì ô nhập nằm cuối dòng.
          const parts = content.split(/_{2,}/);
          const input = (
            <span className={`notes-blank${graded ? (graded.correct ? ' notes-blank--correct' : ' notes-blank--wrong') : ''}${over ? ' notes-blank--over' : ''}`}>
              <span className="notes-blank-num">{n}</span>
              <input
                type="text"
                value={value}
                disabled={disabled || !!graded}
                placeholder={q.wordLimit != null ? `Tối đa ${q.wordLimit} từ` : 'Nhập đáp án'}
                onChange={e => onChange(q, e.target.value)}
                onBlur={() => onCommit?.(q, value)}
                onFocus={() => onFocusQuestion?.(q)}
                aria-label={`Đáp án câu ${n}`}
                title={over ? `Vượt giới hạn ${q.wordLimit} từ — hãy rút gọn đáp án` : `Câu ${n}`}
              />
            </span>
          );
          return (
            <p key={q.id} id={`q-${q.id}`} className="ielts-notes-line">
              {parts.length > 1 ? (
                <>{parts[0]}{input}{parts.slice(1).join(' ')}</>
              ) : (
                <>{content} {input}</>
              )}
              {onToggleFlag && (
                <FlagButton flagged={!!flaggedById?.[q.id]} onToggle={() => onToggleFlag(q)} label={`Đánh dấu câu ${n}`} />
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/** Bảng matching kiểu YouPass: cột trái là các mục cần nối kèm ô trống,
 * cột phải là danh sách đáp án — bấm chọn đáp án rồi bấm vào ô trống để
 * đặt (hoặc kéo đáp án vào ô). Bấm vào ô đã điền để xóa đáp án đó.
 * matching_headings được dùng lại 1 tiêu đề (theo luật thi thật) nên đáp
 * án đã dùng không bị khóa; các dạng nối khác mỗi đáp án chỉ dùng 1 lần.
 * layout='stacked' (Reading, cột phải hẹp): xếp dọc, đáp án nằm dưới. */
export function IeltsMatchingBoard({ items, valueOf, onChange, onCommit, disabled, gradedById, flaggedById, onToggleFlag, onFocusQuestion, layout }: GroupBlockProps & { layout?: 'side' | 'stacked' }) {
  const first = items[0];
  const last = items[items.length - 1];
  const type = first.q.questionType || 'matching';
  const options = first.q.options;
  const allowReuse = type === 'matching_headings';
  const [picked, setPicked] = useState<string | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const usedLabels = new Set(items.map(({ q }) => valueOf(q)).filter(Boolean));
  const place = (q: Question, label: string | null) => {
    onChange(q, label ?? '');
    if (label != null) onCommit?.(q, label);
    else onCommit?.(q, '');
    setPicked(null);
  };
  const onGapClick = (q: Question) => {
    if (disabled) return;
    onFocusQuestion?.(q);
    const cur = valueOf(q);
    if (picked) {
      if (picked !== cur) place(q, picked);
      else setPicked(null);
      return;
    }
    // Không có đáp án đang chọn: bấm vào ô đã điền thì xóa đáp án đó.
    if (cur) place(q, null);
  };
  return (
    <div className="ielts-match">
      <p className="ielts-notes-head"><strong>Questions {first.n}–{last.n}</strong></p>
      <p className="ielts-notes-inst">{matchInstructionFor(type)}</p>
      <div className={`ielts-match-grid${layout === 'stacked' ? ' ielts-match-grid--stacked' : ''}`}>
        <div className="ielts-match-items">
          {items.map(({ q, n }) => {
            const value = valueOf(q);
            const graded = gradedById?.[q.id];
            const opt = value ? options.find(o => o.label === value) : undefined;
            return (
              <div key={q.id} id={`q-${q.id}`} className="ielts-match-row">
                <span className="ielts-match-item">{stripLeadingNumber(q.content || '', n)}</span>
                <button
                  type="button"
                  className={`ielts-match-gap${value ? ' ielts-match-gap--filled' : ''}${graded ? (graded.correct ? ' ielts-match-gap--correct' : ' ielts-match-gap--wrong') : ''}`}
                  disabled={disabled || !!graded}
                  onClick={() => onGapClick(q)}
                  onDragOver={e => { if (dragLabel) e.preventDefault(); }}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragLabel) { place(q, dragLabel); setDragLabel(null); }
                  }}
                  title={value ? `Đáp án: ${value}${opt?.content ? ` — ${opt.content}` : ''} (bấm để xóa)` : `Ô trống câu ${n} — bấm chọn đáp án bên phải rồi bấm vào đây`}
                  aria-label={`Ô trống câu ${n}`}
                >
                  {value ? <><strong>{value}</strong>{opt?.content ? ` — ${opt.content}` : ''}</> : <span className="notes-blank-num">{n}</span>}
                </button>
                {onToggleFlag && (
                  <FlagButton flagged={!!flaggedById?.[q.id]} onToggle={() => onToggleFlag(q)} label={`Đánh dấu câu ${n}`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="ielts-match-options">
          <p style={{ marginTop: 0 }}><strong>List of options</strong></p>
          <p className="muted">Bấm chọn đáp án rồi bấm vào ô trống để điền, hoặc kéo đáp án vào ô trống.</p>
          <div className="ielts-match-chips">
            {options.map(o => {
              const used = !allowReuse && usedLabels.has(o.label);
              return (
                <button
                  key={o.label}
                  type="button"
                  draggable={!disabled && !used}
                  className={`ielts-match-chip${picked === o.label ? ' ielts-match-chip--picked' : ''}${used ? ' ielts-match-chip--used' : ''}`}
                  disabled={disabled || used}
                  onClick={() => setPicked(picked === o.label ? null : o.label)}
                  onDragStart={() => setDragLabel(o.label)}
                  onDragEnd={() => setDragLabel(null)}
                  title={used ? 'Đáp án này đã được dùng' : `Chọn đáp án ${o.label}`}
                >
                  <strong>{o.label}</strong>{o.content ? `. ${o.content}` : ''}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
