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
];

// Dang dien tu: dap an dung luu o questions.correct_text, options = [].
const TYPED_TYPES = new Set([
  'form_completion',
  'sentence_completion',
  'summary_completion',
  'short_answer',
]);

function isTypedType(questionType) {
  return TYPED_TYPES.has(questionType);
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
  normalizeTypedAnswer,
  countWords,
  gradeTypedAnswer,
  parseAcceptedAnswers,
};
