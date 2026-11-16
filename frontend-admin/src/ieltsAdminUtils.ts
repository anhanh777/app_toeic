// Helpers riêng cho quản trị đề IELTS: nhãn Part, số câu chuẩn, validator
// frontend cho câu hỏi IELTS — bản sao y quy tắc của backend
// (db.js validateIeltsImportQuestion) để báo lỗi ngay ở bước xem trước,
// máy chủ vẫn là nơi kiểm tra cuối cùng.
import type { QuestionError } from './testSetUtils';

export const IELTS_PART_LABELS: Record<number, string> = {
  1: 'Section 1', 2: 'Section 2', 3: 'Section 3', 4: 'Section 4',
  5: 'Passage 1', 6: 'Passage 2', 7: 'Passage 3',
};

export const IELTS_STANDARD_COUNTS: Record<number, number> = {
  1: 10, 2: 10, 3: 10, 4: 10, 5: 13, 6: 13, 7: 14,
};
export const IELTS_STANDARD_TOTAL = 80;

export const IELTS_TYPES = [
  'multiple_choice', 'true_false_not_given', 'yes_no_not_given',
  'matching_headings', 'matching_information', 'matching_features',
  'matching', 'labelling', 'form_completion', 'sentence_completion',
  'summary_completion', 'short_answer',
  'note_completion', 'table_completion', 'flow_chart_completion',
  'diagram_completion', 'matching_sentence_endings', 'list_selection',
  'choosing_title',
];

export const IELTS_TYPED_TYPES = new Set([
  'form_completion', 'sentence_completion', 'summary_completion', 'short_answer',
  'note_completion', 'table_completion', 'flow_chart_completion', 'diagram_completion',
]);

function romanNumeral(n: number): string {
  const table: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  let rest = n;
  for (const [value, sym] of table) {
    while (rest >= value) { out += sym; rest -= value; }
  }
  return out;
}

/** Nhãn phương án kỳ vọng theo dạng câu (giống backend). */
export function expectedIeltsLabels(type: string, optionCount: number): string[] {
  if (type === 'true_false_not_given') return ['TRUE', 'FALSE', 'NOT GIVEN'];
  if (type === 'yes_no_not_given') return ['YES', 'NO', 'NOT GIVEN'];
  if (type === 'matching_headings') {
    return Array.from({ length: optionCount }, (_, i) => romanNumeral(i + 1));
  }
  if (type === 'multiple_choice' || type === 'choosing_title') {
    return ['A', 'B', 'C', 'D'].slice(0, optionCount);
  }
  return Array.from({ length: optionCount }, (_, i) => String.fromCharCode(65 + i));
}

export function validateIeltsQuestion(q: unknown, index: number): QuestionError | null {
  const o = q as Record<string, unknown>;
  const id = typeof o?.id === 'string' ? o.id : undefined;
  const fail = (reason: string): QuestionError => ({ index, id, reason });
  if (!o || typeof o !== 'object') return fail('Câu hỏi không phải là object.');
  const part = Number(o.part);
  if (!Number.isInteger(part) || part < 1 || part > 7) return fail('Part phải là số nguyên từ 1 đến 7.');
  const type = typeof o.questionType === 'string' ? o.questionType : 'multiple_choice';
  if (!IELTS_TYPES.includes(type)) return fail('Dạng câu hỏi IELTS không hợp lệ.');
  const listeningOnly = part === 1 || part === 2;
  if (!listeningOnly && (typeof o.content !== 'string' || !o.content.trim())) {
    return fail('Thiếu nội dung câu hỏi (content).');
  }
  if (o.wordLimit !== undefined && o.wordLimit !== null) {
    if (!Number.isInteger(o.wordLimit) || (o.wordLimit as number) <= 0) {
      return fail('Giới hạn từ (word_limit) phải là số nguyên dương.');
    }
  }
  if (IELTS_TYPED_TYPES.has(type)) {
    if (typeof o.correctText !== 'string' || !o.correctText.trim()) {
      return fail('Câu điền từ phải có đáp án đúng (correct_text).');
    }
    if (o.options !== undefined && o.options !== null && !Array.isArray(o.options)) {
      return fail('Phương án của câu điền từ phải là mảng (có thể rỗng).');
    }
    return null;
  }
  if (type === 'list_selection') {
    if (!Array.isArray(o.options) || o.options.length < 5 || o.options.length > 7) {
      return fail('Câu list selection phải có từ 5 đến 7 phương án.');
    }
    const labels = (o.options as unknown[]).map((_, i) => String.fromCharCode(65 + i));
    const actual = (o.options as Record<string, unknown>[]).map(x => x && x.label);
    if (new Set(actual).size !== labels.length || !actual.every((l, i) => l === labels[i])) {
      return fail(`Các phương án phải có đủ nhãn ${labels.join(', ')} theo đúng thứ tự.`);
    }
    if ((o.options as Record<string, unknown>[]).some(x => !x || typeof x.content !== 'string' || !x.content.trim())) {
      return fail('Mỗi phương án phải có nội dung.');
    }
    if (!Array.isArray(o.correct) || o.correct.length < 2 || o.correct.length > 3) {
      return fail('Đáp án đúng của list selection phải là mảng 2–3 nhãn.');
    }
    const upper = (o.correct as unknown[]).map(c => (typeof c === 'string' ? c.toUpperCase() : c));
    if (new Set(upper).size !== upper.length || !upper.every(l => labels.includes(l as string))) {
      return fail('Đáp án đúng của list selection phải là 2–3 nhãn khác nhau thuộc các phương án.');
    }
    return null;
  }
  if (!Array.isArray(o.options) || o.options.length < 2) {
    return fail('Câu IELTS dạng chọn/nối phải có ít nhất 2 phương án.');
  }
  if (type === 'multiple_choice' || type === 'choosing_title') {
    if (o.options.length !== 3 && o.options.length !== 4) {
      return fail(`Câu ${type === 'multiple_choice' ? 'multiple choice' : 'choosing title'} IELTS phải có 3 hoặc 4 phương án.`);
    }
  }
  const expected = expectedIeltsLabels(type, o.options.length);
  const labels = (o.options as Record<string, unknown>[]).map(x => x && x.label);
  if (new Set(labels).size !== expected.length || !labels.every((l, i) => l === expected[i])) {
    return fail(`Các phương án phải có đủ nhãn ${expected.join(', ')} theo đúng thứ tự.`);
  }
  if ((o.options as Record<string, unknown>[]).some(x => !x || typeof x.content !== 'string' || !x.content.trim())) {
    return fail('Mỗi phương án phải có nội dung.');
  }
  if (typeof o.correct !== 'string' || !expected.includes(o.correct)) {
    return fail(`Đáp án đúng phải là một trong các nhãn ${expected.join(', ')}.`);
  }
  return null;
}

export function splitValidIelts(raw: unknown[]): { valid: Record<string, unknown>[]; errors: QuestionError[] } {
  const valid: Record<string, unknown>[] = [];
  const errors: QuestionError[] = [];
  raw.forEach((q, i) => {
    const err = validateIeltsQuestion(q, i);
    if (err) errors.push(err);
    else valid.push(q as Record<string, unknown>);
  });
  return { valid, errors };
}
