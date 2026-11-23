// Helpers port từ frontend/src/exam.tsx (web) — logic dùng chung,
// không phụ thuộc DOM nên giữ nguyên hành vi.
import type { ExamId } from './exam';

// Số câu THẬT trong đề. Luyện riêng 1 Part/Section thì danh sách chỉ chứa
// câu của Part đó nên số thứ tự trong danh sách (1–39) không phải số thật
// (32–70) — cộng thêm mốc đầu Part: TOEIC P1=1, P2=7, P3=32, P4=71,
// P5=101, P6=131, P7=147; IELTS Listening S1=1, S2=11, S3=21, S4=31,
// Reading P1=41, P2=54, P3=67 (part 5/6/7).
export const QUESTION_NUMBER_OFFSETS: Record<string, Record<number, number>> = {
  toeic: { 1: 1, 2: 7, 3: 32, 4: 71, 5: 101, 6: 131, 7: 147 },
  ielts: { 1: 1, 2: 11, 3: 21, 4: 31, 5: 41, 6: 54, 7: 67 },
};

export function realQuestionNumber(
  exam: string | null | undefined,
  part: number,
  indexWithinPart: number,
): number {
  const offsets = QUESTION_NUMBER_OFFSETS[exam || 'toeic'] || QUESTION_NUMBER_OFFSETS.toeic;
  return (offsets[part] ?? 1) + indexWithinPart - 1;
}

/** Số câu trên đề giấy mà 1 row chiếm: câu gộp list_selection ("Choose
 * TWO/THREE") chiếm 2–3 số; mọi câu khác chiếm 1. Backend tính sẵn
 * (mapQuestion: đếm số nhãn đúng của list_selection). */
export function paperSpanOf(q: { questionType?: string | null; paperSpan?: number | null }): number {
  return q.paperSpan != null && q.paperSpan > 0 ? q.paperSpan : 1;
}

/** Đánh số đề thật cho 1 danh sách câu đã xếp theo thứ tự đề: đếm tích
 * lũy theo Part, câu gộp (paperSpan 2–3) chiếm 2–3 số nên các câu sau
 * vẫn giữ đúng số trên đề giấy. Trả Map<id, { n, label }> với n = số
 * bắt đầu (dùng cho stripLeadingNumber, thông báo lỗi) và label = "11"
 * hoặc "11–12" (dùng để hiển thị). */
export function paperNumbersFor(
  exam: string | null | undefined,
  questions: { id: string; part: number; questionType?: string | null; paperSpan?: number | null }[],
): Map<string, { n: number; label: string }> {
  const map = new Map<string, { n: number; label: string }>();
  const nextInPart: Record<number, number> = {};
  for (const q of questions) {
    const start = nextInPart[q.part] ?? 1;
    const span = paperSpanOf(q);
    nextInPart[q.part] = start + span;
    const n = realQuestionNumber(exam, q.part, start);
    map.set(q.id, { n, label: span > 1 ? `${n}–${n + span - 1}` : `${n}` });
  }
  return map;
}

// Nội dung câu hỏi đôi khi đã chứa số câu ở đầu ("147. Where is...") do
// dữ liệu gốc giữ lại số — khi hiển thị số inline thì bỏ số đó đi để khỏi
// lặp "147. 147. ...". Chỉ bỏ khi số đầu câu đúng bằng số đang hiển thị.
export function stripLeadingNumber(content: string, n: number): string {
  return content.replace(new RegExp(`^${n}\\.\\s*`), '');
}

/** Nhãn ngắn cho 1 Part theo kỳ thi: "Part 1" / "Section 1" / "Passage 1". */
export function partLabel(part: number, exam: ExamId | null | undefined): string {
  if (exam === 'ielts') return part <= 4 ? `Section ${part}` : `Passage ${part - 4}`;
  return `Part ${part}`;
}

/** Tên đầy đủ cho 1 Part theo kỳ thi (dùng cho tiêu đề, thẻ chọn, thống kê). */
export function partNameFor(part: number, exam: ExamId | null | undefined): string {
  return partLabel(part, exam);
}

// ---- Dạng câu hỏi IELTS ----
export const QUESTION_TYPE_NAMES: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false_not_given: 'True / False / Not Given',
  yes_no_not_given: 'Yes / No / Not Given',
  matching_headings: 'Nối tiêu đề (Matching Headings)',
  matching_information: 'Nối thông tin (Matching Information)',
  matching_features: 'Nối đặc điểm (Matching Features)',
  matching: 'Nối (Matching)',
  labelling: 'Ghi nhãn (Labelling)',
  form_completion: 'Điền form (Form Completion)',
  sentence_completion: 'Hoàn thành câu (Sentence Completion)',
  summary_completion: 'Hoàn thành tóm tắt (Summary Completion)',
  short_answer: 'Trả lời ngắn (Short Answer)',
  note_completion: 'Điền ghi chú (Note Completion)',
  table_completion: 'Điền bảng (Table Completion)',
  flow_chart_completion: 'Điền sơ đồ quy trình (Flow-chart Completion)',
  diagram_completion: 'Ghi nhãn sơ đồ (Diagram Completion)',
  matching_sentence_endings: 'Nối câu (Matching Sentence Endings)',
  list_selection: 'Chọn từ danh sách (List Selection)',
  choosing_title: 'Chọn tiêu đề (Choosing a Title)',
};
export function questionTypeName(t?: string | null): string {
  return (t && QUESTION_TYPE_NAMES[t]) || 'Trắc nghiệm';
}

/** Dạng điền từ: form/sentence/summary completion + short_answer. */
export const FILL_IN_TYPES = new Set([
  'form_completion', 'sentence_completion', 'summary_completion', 'short_answer',
  'note_completion', 'table_completion', 'flow_chart_completion', 'diagram_completion',
]);
export function isFillIn(t?: string | null): boolean {
  return !!t && FILL_IN_TYPES.has(t);
}
export function isMatching(t?: string | null): boolean {
  return !!t && (
    t === 'matching_headings' || t === 'matching_information' ||
    t === 'matching_features' || t === 'matching' || t === 'labelling' ||
    t === 'matching_sentence_endings'
  );
}

/** Dạng chọn nhiều đáp án: chỉ list_selection — đáp án là chuỗi các nhãn
 * đã chọn, sắp xếp rồi nối bằng dấu phẩy, VD "A,C". Chấm từng phần ở
 * backend: mỗi nhãn đúng tính 1 điểm (câu gộp 2–3 nhãn = 2–3 điểm);
 * đúng 1 phần vẫn được điểm nhưng tính là "sai" khi ôn lại (xem
 * paperSpanOf/paperNumbersFor bên dưới). */
export function isMultiAnswer(t?: string | null): boolean {
  return t === 'list_selection';
}

/** "A,C" / "A, C" → ["A", "C"]; chuỗi rỗng → []. */
export function parseSelectedLabels(value?: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(',').map((s) => s.trim()).filter(Boolean))].sort();
}

/** Bật/tắt 1 nhãn trong chuỗi đã chọn: trả về chuỗi đã sắp xếp, không
 * trùng, nối bằng dấu phẩy, VD toggleSelectedLabel("A,C", "B") → "A,B,C". */
export function toggleSelectedLabel(value: string, label: string): string {
  const set = new Set(parseSelectedLabels(value));
  if (set.has(label)) set.delete(label);
  else set.add(label);
  return [...set].sort().join(',');
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Nhãn mức cho band IELTS (chỉ để tham khảo). */
export function bandLevel(band?: number | null): string {
  if (band == null) return '—';
  if (band < 5) return 'Cơ bản';
  if (band < 6) return 'Trung bình';
  if (band < 7) return 'Khá';
  if (band < 8) return 'Tốt';
  return 'Xuất sắc';
}
