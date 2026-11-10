// Helpers dùng chung cho tính năng Bộ đề: chuẩn số câu 1 đề TOEIC,
// validate câu hỏi import ở frontend và chuẩn hóa file JSON về mảng câu hỏi.
import type { ImportQuestion } from './api';

export const STANDARD_COUNTS: Record<number, number> = {
  1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54,
};
export const STANDARD_TOTAL = 200;

export interface QuestionError { index: number; id?: string; reason: string; }

export function validateQuestion(q: unknown, index: number): QuestionError | null {
  const o = q as Record<string, unknown>;
  const id = typeof o?.id === 'string' ? o.id : undefined;
  const fail = (reason: string): QuestionError => ({ index, id, reason });
  if (!o || typeof o !== 'object') return fail('Câu hỏi không phải là object.');
  const part = Number(o.part);
  if (!Number.isInteger(part) || part < 1 || part > 7) return fail('Part phải là số nguyên từ 1 đến 7.');
  if (typeof o.content !== 'string' || !o.content.trim()) return fail('Thiếu nội dung câu hỏi (content).');
  if (!Array.isArray(o.options) || o.options.length !== 4) return fail('Phải có đủ 4 phương án (options).');
  const labels = new Set<string>();
  for (const opt of o.options as unknown[]) {
    const p = opt as Record<string, unknown>;
    if (!p || typeof p !== 'object') return fail('Phương án không hợp lệ.');
    if (typeof p.label !== 'string' || !['A', 'B', 'C', 'D'].includes(p.label)) return fail('Nhãn phương án phải là A, B, C hoặc D.');
    if (labels.has(p.label)) return fail(`Trùng nhãn phương án ${p.label}.`);
    labels.add(p.label);
    if (typeof p.content !== 'string' || !p.content.trim()) return fail(`Phương án ${p.label} thiếu nội dung.`);
  }
  if (typeof o.correct !== 'string' || !['A', 'B', 'C', 'D'].includes(o.correct)) return fail('Đáp án đúng (correct) phải là A, B, C hoặc D.');
  if (!labels.has(o.correct)) return fail(`Đáp án đúng ${o.correct} không có trong danh sách phương án.`);
  return null;
}

export function splitValid(raw: unknown[]): { valid: ImportQuestion[]; errors: QuestionError[] } {
  const valid: ImportQuestion[] = [];
  const errors: QuestionError[] = [];
  raw.forEach((q, i) => {
    const err = validateQuestion(q, i);
    if (err) errors.push(err);
    else valid.push(q as ImportQuestion);
  });
  return { valid, errors };
}

/** Chuẩn hóa nội dung file JSON đã parse về { title?, description?, questions }.
 *  Chấp nhận: mảng câu hỏi trực tiếp, { questions: [...] },
 *  { parts: { "1": [...], "2": [...] } }, hoặc { title, description?, questions }. */
export function normalizeImportFile(parsed: unknown): { title?: string; description?: string; questions: unknown[] } {
  if (Array.isArray(parsed)) return { questions: parsed };
  const o = parsed as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new Error('File JSON không đúng định dạng: cần mảng câu hỏi hoặc object có "questions" hoặc "parts".');
  const title = typeof o.title === 'string' ? o.title : undefined;
  const description = typeof o.description === 'string' ? o.description : undefined;
  if (Array.isArray(o.questions)) return { title, description, questions: o.questions };
  if (o.parts && typeof o.parts === 'object') {
    const questions: unknown[] = [];
    for (const [key, arr] of Object.entries(o.parts as Record<string, unknown>)) {
      if (!Array.isArray(arr)) continue;
      for (const q of arr) {
        const qq = q as Record<string, unknown>;
        questions.push({ ...qq, part: Number(key) });
      }
    }
    return { title, description, questions };
  }
  throw new Error('Không tìm thấy danh sách câu hỏi trong file. File cần có "questions" (mảng) hoặc "parts" (object theo Part).');
}

export function countByPart(questions: ImportQuestion[]): { part: number; count: number }[] {
  return [1, 2, 3, 4, 5, 6, 7].map(p => ({ part: p, count: questions.filter(q => q.part === p).length }));
}
