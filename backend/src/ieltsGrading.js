'use strict';

/**
 * ieltsGrading.js — cham cau dien tu IELTS (form/sentence/summary completion,
 * short_answer) + danh sach cac dang cau hoi IELTS.
 *
 * Quy tac chuan hoa dap an dien tu truoc khi so sanh (xem ke hoach giai doan 2,
 * tuan 2): lowercase, trim, gop khoang trang, bo mao tu the/a/an o dau,
 * bo dau cau cuoi (. , ! ? ; :), bo ngoac kep bao quanh. Khop chinh xac sau
 * chuan hoa voi correct_text hoac 1 phan tu accepted_answers thi dung.
 */

const IELTS_QUESTION_TYPES = [
  'multiple_choice',
  'true_false_not_given',
  'yes_no_not_given',
  'matching_headings',
  'matching_information',
  'matching_features',
  'matching',
  'labelling',
  'form_completion',
  'sentence_completion',
  'summary_completion',
  'short_answer',
  'note_completion',
  'table_completion',
  'flow_chart_completion',
  'diagram_completion',
  'matching_sentence_endings',
  'list_selection',
  'choosing_title',
];

// Dang dien tu: dap an dung luu o questions.correct_text, options = [].
const TYPED_TYPES = new Set([
  'form_completion',
  'sentence_completion',
  'summary_completion',
  'short_answer',
  'note_completion',
  'table_completion',
  'flow_chart_completion',
  'diagram_completion',
]);

function isTypedType(questionType) {
  return TYPED_TYPES.has(questionType);
}

/** Chi list_selection moi co nhieu dap an dung (chon 2-3 nhan). */
function isMultiAnswerType(questionType) {
  return questionType === 'list_selection';
}

/**
 * Parse chuoi/mang nhan da chon ve mang nhan da chuan hoa: uppercase, trim,
 * loai trung, sort. Vd "c, A" -> ["A", "C"]; ["C", "a"] -> ["A", "C"].
 */
function parseSelectedLabels(selected) {
  const raw = Array.isArray(selected)
    ? selected
    : typeof selected === 'string'
      ? selected.split(',')
      : [];
  return [...new Set(raw.map((s) => String(s).trim().toUpperCase()).filter(Boolean))].sort();
}

/**
 * Cham cau list_selection THEO TUNG PHAN (cham tung chu — giong de that:
 * moi chu dung = 1 diem, moi cau trong cap/bo ba la 1 cau rieng tren de).
 * selected co the la chuoi "A,C" (dang luu trong answers.selected) hoac mang nhan.
 * - Chon THUA so nhan yeu cau, hoac nhan khong co trong options -> toan bo
 *   cau 0 diem (chon thua la sai luat de thi).
 * - Chon it hon so nhan yeu cau: moi nhan dung duoc 1 diem, nhan chua chon = 0.
 * @param {string|string[]} selected - nhan da chon
 * @param {string[]|string} correctLabels - nhan dung
 * @param {string[]|null} [validLabels] - cac nhan co trong options (de loai
 *   nhan la); bo qua thi chi kiem tra so luong.
 * @returns {{correct:boolean, marks:number, maxMarks:number,
 *   correctCount:number, totalCount:number}}
 *   correct = dung HET (all-or-nothing, dung cho cau sai / cổng ôn tập / XP);
 *   marks = so diem thuc (0..maxMarks) dung cho band/diem tong.
 */
function gradeListSelection(selected, correctLabels, validLabels) {
  const picked = parseSelectedLabels(selected);
  const correct = parseSelectedLabels(correctLabels);
  const maxMarks = correct.length;
  const correctSet = new Set(correct);
  const allValid = !Array.isArray(validLabels) || picked.every((l) => validLabels.includes(l));
  // Chon thua so nhan yeu cau, hoac co nhan la -> 0 diem ca cau.
  const marks =
    !allValid || picked.length > maxMarks
      ? 0
      : picked.filter((l) => correctSet.has(l)).length;
  return {
    correct: picked.length > 0 && picked.length === maxMarks && marks === maxMarks,
    marks,
    maxMarks,
    correctCount: marks,
    totalCount: maxMarks,
  };
}

/** Chuan hoa 1 dap an dien tu de so sanh. */
function normalizeTypedAnswer(text) {
  if (text == null) return '';
  let s = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  // Bo ngoac kep bao quanh ("..." hoac '...').
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      s = s.slice(1, -1).trim();
    }
  }
  // Bo dau cau cuoi.
  s = s.replace(/[. ,! ? ; :]+$/g, '').trim();
  // Bo mao tu o dau.
  s = s.replace(/^(the|a|an)\s+/g, '');
  return s;
}

/** Dem so tu (tach theo khoang trang). Chuoi rong = 0 tu. */
function countWords(text) {
  const s = String(text || '').trim();
  if (!s) return 0;
  return s.split(/\s+/).length;
}

/**
 * Cham 1 cau dien tu.
 * @param {string} userText - dap an nguoi dung go
 * @param {string} correctText - dap an dung (questions.correct_text)
 * @param {string[]|string|null} acceptedAnswers - cac cach viet khac chap nhan
 * @param {number|null} wordLimit - gioi han so tu (null = khong gioi han)
 * @returns {{correct:boolean, overLimit:boolean, wordCount:number}}
 *   Qua gioi han tu -> correct=false, overLimit=true (chua cham).
 */
function gradeTypedAnswer(userText, correctText, acceptedAnswers, wordLimit) {
  const wordCount = countWords(userText);
  const overLimit =
    Number.isInteger(wordLimit) && wordLimit > 0 ? wordCount > wordLimit : false;
  if (overLimit) return { correct: false, overLimit: true, wordCount };
  const normalized = normalizeTypedAnswer(userText);
  if (!normalized) return { correct: false, overLimit: false, wordCount };
  const candidates = [correctText];
  if (Array.isArray(acceptedAnswers)) {
    candidates.push(...acceptedAnswers);
  } else if (typeof acceptedAnswers === 'string' && acceptedAnswers.trim()) {
    try {
      const parsed = JSON.parse(acceptedAnswers);
      if (Array.isArray(parsed)) candidates.push(...parsed);
    } catch (_) {
      // accepted_answers khong phai JSON hop le: bo qua.
    }
  }
  const correct = candidates.some(
    (c) => typeof c === 'string' && c.trim() && normalizeTypedAnswer(c) === normalized
  );
  return { correct, overLimit: false, wordCount };
}

/** Parse questions.accepted_answers (JSON string) ve array, loi -> []. */
function parseAcceptedAnswers(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

module.exports = {
  IELTS_QUESTION_TYPES,
  TYPED_TYPES,
  isTypedType,
  isMultiAnswerType,
  parseSelectedLabels,
  gradeListSelection,
  normalizeTypedAnswer,
  countWords,
  gradeTypedAnswer,
  parseAcceptedAnswers,
};
