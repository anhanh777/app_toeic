// Điều khiển trả lời dùng chung cho các dạng câu IELTS (Practice, Mock,
// Ôn câu sai). Trắc nghiệm A–D dùng lại nút .option như TOEIC nên không
// nằm ở đây — chỉ các dạng riêng của IELTS: T/F/NG, Y/N/NG, matching
// (select), điền từ (ô nhập text + đếm từ).
import type { Question } from './api';
import { isFillIn, isMatching, wordCount } from './exam';

export interface AnswerResultLike {
  correct: boolean;
  correctLabel?: string | null;
  correctText?: string | null;
  explanation?: string;
  transcript?: string;
  xpAwarded?: number;
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

export function IeltsAnswerControl({ q, value, onChange, onCommit, disabled, graded, duplicateHeading }: Props) {
  const type = q.questionType || 'multiple_choice';

  // --- True / False / Not Given & Yes / No / Not Given ---
  if (type === 'true_false_not_given' || type === 'yes_no_not_given') {
    const labels = type === 'true_false_not_given' ? TFNG_LABELS : YNNG_LABELS;
    // Ưu tiên options backend trả (label + content); thiếu thì dùng nhãn cố định.
    const opts = labels.map(l => q.options.find(o => o.label === l) || { label: l, content: l });
    return (
      <div>
        <p className="muted" style={{ marginTop: 0 }}>
          {type === 'true_false_not_given'
            ? '💡 FALSE = bài nói ngược lại, NOT GIVEN = bài không nhắc tới.'
            : '💡 NO = tác giả phản đối, NOT GIVEN = bài không nhắc tới.'}
        </p>
        <div className="exam-opts">
          {opts.map(o => {
            let cls = 'option';
            if (value === o.label) cls += ' selected';
            if (graded) {
              if (o.label === graded.correctLabel) cls += ' correct';
              else if (value === o.label && !graded.correct) cls += ' wrong';
            }
            return (
              <button key={o.label} className={cls} disabled={disabled || !!graded}
                onClick={() => { onChange(o.label); onCommit?.(o.label); }}>
                <strong>{o.label}</strong>{o.content && o.content !== o.label ? ` ${o.content}` : ''}
              </button>
            );
          })}
        </div>
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
            ⚠ Thi thật được dùng lại 1 tiêu đề, nhưng 2 đoạn cùng 1 tiêu đề thường là 1 câu sai — kiểm tra lại nhé.
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
    return (
      <div>
        <input
          type="text"
          value={value}
          disabled={disabled || !!graded}
          placeholder={q.wordLimit != null ? `Nhập đáp án (tối đa ${q.wordLimit} từ)` : 'Nhập đáp án'}
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

  return null;
}
