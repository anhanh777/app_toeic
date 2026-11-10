'use strict';

// structureSplit.js — TANG 2 cua tinh nang "Nhan dien de tu dong theo cau truc —
// Hybrid 3 tang": tach cau truc de thi TOEIC tu van ban thuan.
//
// CHI dung regex, KHONG goi AI, KHONG goi mang. Dung de:
//  - phat hien file PDF scan (khong co lop chu) qua isScannedText(),
//  - tach tieu de Part, khoi cau hoi, nhom doan van (Part 3/4/6/7),
//    vung Answer Key o cuoi file qua splitStructure().
//
// Quy uoc:
//  - startLine la so dong BAT DAU TU 1 (dong dau tien cua file la 1).
//  - Vung Answer Key (tu dong tieu de "ANSWER KEY" / "Dap an" tro di) KHONG
//    tinh vao noi dung cau hoi.

const PART_HEADER_RE = /^\s*(?:part|phần)\s*([1-7])\s*(?:[-–—:.]\s*.*|\(.*\))?$/i;
const ANSWER_KEY_HEADER_RE = /^\s*(answer\s*key|đáp\s*án|key)\s*$/i;
const ANSWER_LINE_RE = /^\s*(\d+)\s*[.\-:)]\s*([A-Da-d])\b/;
const QUESTION_RE = /^\s*(?:question|câu)\s+(\d+)\b/i;
const NUMBERED_RE = /^\s*(\d+)\s*[.)]\s+\S/;
const PASSAGE_GROUP_RE = /questions?\s+(\d+)\s*(?:[-–—]|to)\s*(\d+)/i;
const PAGE_MARKER_RE = /^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/i;
const PAGE_NUMBER_ONLY_RE = /^\s*\d+\s*$/;

/**
 * Kiem tra text co phai la ket qua trich xuat tu file scan / anh
 * (khong co lop chu) hay khong. Loai bo cac dong marker trang
 * ("-- 1 of 1 --"), dong chi co so trang, dong trong roi dem so ky tu
 * thuc con lai; duoi 100 ky tu thi coi la scan.
 * @param {string} text van ban trich duoc tu file
 * @returns {boolean} true neu text gan nhu rong (file scan)
 */
function isScannedText(text) {
  const lines = String(text || '').split(/\r?\n/);
  let chars = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (PAGE_MARKER_RE.test(line)) continue;
    if (PAGE_NUMBER_ONLY_RE.test(line)) continue;
    chars += line.replace(/\s/g, '').length;
  }
  return chars < 100;
}

/** Tim so thu tu cac cau hoi trong lines[from..to). */
function findQuestionNumbers(lines, from, to) {
  const nums = [];
  for (let i = from; i < to; i++) {
    const m = lines[i].match(QUESTION_RE) || lines[i].match(NUMBERED_RE);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!nums.includes(n)) nums.push(n);
    }
  }
  return nums.sort((a, b) => a - b);
}

/**
 * Tach 1 section Part thanh cac block.
 * @param {string[]} lines toan bo dong cua file
 * @param {{part:number, startLine:number, endLine:number}} section
 *   startLine/endLine la chi so 0-based, endLine la dong ket thuc (exclusive)
 * @param {string[]} warnings mang warnings chung de ghi them canh bao
 * @returns {{blocks: object[], questionCount: number}}
 */
function parsePartSection(lines, section, warnings) {
  const { part, startLine, endLine } = section;
  // Quet cac moc: tieu de nhom doan van ("Questions 3-5 refer to..." /
  // "answer questions 3 to 5") va dau moi cau hoi ("Question N" / "N. ...").
  const items = [];
  for (let i = startLine + 1; i < endLine; i++) {
    const gm = lines[i].match(PASSAGE_GROUP_RE);
    if (gm) {
      items.push({ kind: 'group', start: parseInt(gm[1], 10), end: parseInt(gm[2], 10), line: i });
      continue;
    }
    const qm = lines[i].match(QUESTION_RE) || lines[i].match(NUMBERED_RE);
    if (qm) items.push({ kind: 'question', num: parseInt(qm[1], 10), line: i });
  }

  const blocks = [];
  let questionCount = 0;

  if (items.length === 0) {
    warnings.push(`Part ${part} không tìm thấy câu hỏi nào.`);
    blocks.push({
      part,
      text: lines.slice(startLine, endLine).join('\n').trim(),
      expectedQuestions: [],
      passageText: null,
      warnings: [`Part ${part} không tìm thấy câu hỏi nào.`],
    });
    return { blocks, questionCount };
  }

  // Doan text cua 1 item = tu dong bat dau cua no den dong bat dau item ke tiep.
  const itemText = (idx) => {
    const from = items[idx].line;
    const to = idx + 1 < items.length ? items[idx + 1].line : endLine;
    return lines.slice(from, to).join('\n').trim();
  };
  // Doan van chung cua 1 nhom = cac dong sau dong tieu de nhom den item ke tiep.
  const groupPassage = (idx) => {
    const from = items[idx].line + 1;
    const to = idx + 1 < items.length ? items[idx + 1].line : endLine;
    return lines.slice(from, to).join('\n').trim();
  };

  let currentGroup = null; // {start, end, passageText, questions: [{num, text}]}
  const standalone = []; // cau hoi khong thuoc nhom doan van nao

  function flushGroup() {
    if (!currentGroup) return;
    const qNums = currentGroup.questions.map((q) => q.num);
    const blockWarnings = [];
    if (qNums.length === 0) {
      warnings.push(
        `Nhóm đoạn văn Part ${part} (câu ${currentGroup.start}–${currentGroup.end}) không tìm thấy câu hỏi nào.`
      );
    } else {
      const missing = [];
      for (let n = currentGroup.start; n <= currentGroup.end; n++) {
        if (!qNums.includes(n)) missing.push(n);
      }
      if (missing.length) {
        blockWarnings.push(
          `Nhóm đoạn văn Part ${part} (câu ${currentGroup.start}–${currentGroup.end}) thiếu câu ${missing.join(', ')}.`
        );
        warnings.push(blockWarnings[0]);
      }
    }
    if (qNums.length > 0) {
      const textParts = [];
      if (currentGroup.passageText) textParts.push(currentGroup.passageText);
      currentGroup.questions.forEach((q) => textParts.push(q.text));
      blocks.push({
        part,
        text: textParts.join('\n\n'),
        expectedQuestions: qNums,
        passageText: currentGroup.passageText || null,
        warnings: blockWarnings,
      });
    }
    currentGroup = null;
  }

  items.forEach((item, idx) => {
    if (item.kind === 'group') {
      flushGroup();
      currentGroup = {
        start: item.start,
        end: item.end,
        passageText: groupPassage(idx),
        questions: [],
      };
      return;
    }
    // item.kind === 'question'
    questionCount += 1;
    const q = { num: item.num, text: itemText(idx) };
    if (currentGroup && item.num >= currentGroup.start && item.num <= currentGroup.end) {
      currentGroup.questions.push(q);
    } else {
      flushGroup();
      standalone.push(q);
    }
  });
  flushGroup();

  if (standalone.length > 0) {
    const headerLine = lines[startLine];
    const textParts = [headerLine];
    standalone.forEach((q) => textParts.push(q.text));
    blocks.push({
      part,
      text: textParts.join('\n\n').trim(),
      expectedQuestions: standalone.map((q) => q.num),
      passageText: null,
      warnings: [],
    });
  }

  return { blocks, questionCount };
}

/**
 * Tach cau truc de thi tu van ban thuan.
 * @param {string} text van ban trich tu file (.txt/.docx/.pdf co lop chu)
 * @returns {{
 *   parts: {part:number, startLine:number, questionCount:number}[],
 *   answerKeyFound: boolean,
 *   answerKey: {[n:number]: string} | null,
 *   warnings: string[],
 *   blocks: {part:number, text:string, expectedQuestions:number[], passageText:string|null, warnings:string[]}[]
 * }}
 */
function splitStructure(text) {
  const lines = String(text || '').split(/\r?\n/);
  const warnings = [];

  // --- Vung Answer Key o cuoi file (khong tinh vao noi dung cau hoi) ---
  let keyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (ANSWER_KEY_HEADER_RE.test(lines[i])) {
      keyStart = i;
      break;
    }
  }
  let answerKey = null;
  let answerKeyFound = false;
  if (keyStart >= 0) {
    const key = {};
    for (let i = keyStart + 1; i < lines.length; i++) {
      const m = lines[i].match(ANSWER_LINE_RE);
      if (m) key[parseInt(m[1], 10)] = m[2].toUpperCase();
    }
    if (Object.keys(key).length > 0) {
      answerKey = key;
      answerKeyFound = true;
    } else {
      warnings.push('Tìm thấy tiêu đề Answer Key / Đáp án nhưng không đọc được đáp án nào bên dưới.');
    }
  }
  const contentEnd = keyStart >= 0 ? keyStart : lines.length;

  // --- Tieu de Part ---
  const sections = [];
  for (let i = 0; i < contentEnd; i++) {
    const m = lines[i].match(PART_HEADER_RE);
    if (!m) continue;
    const part = parseInt(m[1], 10);
    if (sections.length > 0) sections[sections.length - 1].endLine = i;
    sections.push({ part, startLine: i, endLine: contentEnd });
  }

  if (sections.length === 0) {
    warnings.push('Không tìm thấy tiêu đề Part nào — không tách được cấu trúc theo Part.');
    const found = findQuestionNumbers(lines, 0, contentEnd);
    if (found.length > 0) {
      warnings.push(
        `Tìm thấy ${found.length} câu hỏi (Câu ${found[0]}–${found[found.length - 1]}) nhưng không xác định được Part — sẽ dùng AI đọc toàn bộ file.`
      );
    } else {
      warnings.push('Cũng không tìm thấy câu hỏi nào trong file.');
    }
    if (!answerKeyFound) warnings.push('Không tìm thấy phần Answer Key / Đáp án.');
    return { parts: [], answerKeyFound, answerKey, warnings, blocks: [] };
  }

  // --- Tach tung Part thanh block ---
  const partsByNumber = new Map(); // part -> {part, startLine, questionCount}
  const blocks = [];
  const allQuestionNums = [];
  for (const section of sections) {
    const { blocks: sectionBlocks, questionCount } = parsePartSection(lines, section, warnings);
    blocks.push(...sectionBlocks);
    sectionBlocks.forEach((b) => allQuestionNums.push(...b.expectedQuestions));
    const existing = partsByNumber.get(section.part);
    if (existing) {
      existing.questionCount += questionCount;
    } else {
      partsByNumber.set(section.part, {
        part: section.part,
        startLine: section.startLine + 1, // tra ve so dong bat dau tu 1
        questionCount,
      });
    }
  }
  const parts = [...partsByNumber.values()];

  // --- Canh bao: thieu Part, so cau khong lien tuc, khong co answer key ---
  const present = new Set(parts.map((p) => p.part));
  const missingParts = [1, 2, 3, 4, 5, 6, 7].filter((p) => !present.has(p));
  if (missingParts.length > 0) {
    warnings.push(`Thiếu Part ${missingParts.join(', ')} (đề thi TOEIC đầy đủ có 7 Part).`);
  }
  const sortedNums = [...new Set(allQuestionNums)].sort((a, b) => a - b);
  if (sortedNums.length > 0) {
    const missingNums = [];
    for (let n = sortedNums[0]; n <= sortedNums[sortedNums.length - 1]; n++) {
      if (!sortedNums.includes(n)) missingNums.push(n);
    }
    if (missingNums.length > 0) {
      warnings.push(`Số câu không liên tục — thiếu câu ${missingNums.join(', ')}.`);
    }
  }
  if (!answerKeyFound) warnings.push('Không tìm thấy phần Answer Key / Đáp án.');

  return { parts, answerKeyFound, answerKey, warnings, blocks };
}

module.exports = { isScannedText, splitStructure };
