// Điều khiển trả lời dùng chung cho các dạng câu IELTS (Practice, Mock,
// Ôn câu sai). Trắc nghiệm A–D dùng lại nút .option như TOEIC nên không
// nằm ở đây — chỉ các dạng riêng của IELTS: T/F/NG, Y/N/NG, matching
// (select), điền từ (ô nhập text + đếm từ).
import type { Question } from './api';
import { isFillIn, isMatching, isMultiAnswer, parseSelectedLabels, toggleSelectedLabel, wordCount } from './exam';

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
    return (
      <div>
        <p className="muted" style={{ marginTop: 0 }}>💡 Chọn 2–3 đáp án (đúng hết mới tính điểm).</p>
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
          <p style={{ margin: '.4rem 0 0' }}>Đáp án đúng: <strong>{correctSet.join(', ') || graded.correctLabel}</strong></p>
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
