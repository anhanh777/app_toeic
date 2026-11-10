'use strict';

// Test cho structureSplit.js — chay bang node thuan, khong framework:
//   node backend/src/structureSplit.test.js
// In PASS/FAIL tung case, exit 0 neu tat ca pass, 1 neu co case fail.

const fs = require('fs');
const path = require('path');
const { isScannedText, splitStructure } = require('./structureSplit');

let passed = 0;
let failed = 0;

function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function readSample(name) {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'data', name), 'utf-8');
}

// ---------- isScannedText ----------
check(
  'isScannedText: text chi co marker trang "-- 1 of 1 --" la scan',
  isScannedText('-- 1 of 1 --\n') === true
);
check(
  'isScannedText: text chi co marker trang + so trang la scan',
  isScannedText('-- 1 of 1 --\n\n2\n') === true
);
check(
  'isScannedText: text ngan < 100 ky tu thuc la scan',
  isScannedText('Hello world') === true
);
check(
  'isScannedText: text dai >= 100 ky tu thuc khong phai scan',
  isScannedText('a'.repeat(150)) === false
);
check(
  'isScannedText: file sample co chu khong phai scan',
  isScannedText(readSample('ai-parse-sample.txt')) === false
);

// ---------- splitStructure tren file sample co cau truc ----------
const sample = splitStructure(readSample('ai-parse-sample.txt'));

const partCounts = {};
sample.parts.forEach((p) => {
  partCounts[p.part] = p.questionCount;
});
check(
  'sample: tach duoc 5 Part (1, 2, 3, 5, 7)',
  sample.parts.length === 5 &&
    [1, 2, 3, 5, 7].every((n) => partCounts[n] !== undefined),
  `parts=${JSON.stringify(sample.parts)}`
);
check(
  'sample: so cau moi Part dung (P1=1, P2=1, P3=3, P5=1, P7=2)',
  partCounts[1] === 1 &&
    partCounts[2] === 1 &&
    partCounts[3] === 3 &&
    partCounts[5] === 1 &&
    partCounts[7] === 2,
  `partCounts=${JSON.stringify(partCounts)}`
);
check(
  'sample: startLine Part 1 la dong 4 (tinh tu 1)',
  sample.parts.find((p) => p.part === 1).startLine === 4,
  `startLine=${sample.parts.find((p) => p.part === 1).startLine}`
);
check(
  'sample: answerKeyFound = true, du 8 dap an',
  sample.answerKeyFound === true &&
    sample.answerKey !== null &&
    Object.keys(sample.answerKey).length === 8,
  `answerKey=${JSON.stringify(sample.answerKey)}`
);
check(
  'sample: answerKey dung (1:A 2:B 3:A 4:A 5:B 6:B 7:A 8:C)',
  sample.answerKey &&
    sample.answerKey[1] === 'A' &&
    sample.answerKey[2] === 'B' &&
    sample.answerKey[3] === 'A' &&
    sample.answerKey[4] === 'A' &&
    sample.answerKey[5] === 'B' &&
    sample.answerKey[6] === 'B' &&
    sample.answerKey[7] === 'A' &&
    sample.answerKey[8] === 'C',
  `answerKey=${JSON.stringify(sample.answerKey)}`
);

const p3Block = sample.blocks.find(
  (b) => b.part === 3 && b.expectedQuestions.join(',') === '3,4,5'
);
check(
  'sample: block P3 gom dung cau 3, 4, 5',
  !!p3Block,
  `blocks P3=${JSON.stringify(sample.blocks.filter((b) => b.part === 3).map((b) => b.expectedQuestions))}`
);
check(
  'sample: block P3 co passageText la doan hoi thoai',
  !!p3Block &&
    typeof p3Block.passageText === 'string' &&
    p3Block.passageText.includes('Woman: Hi, David') &&
    p3Block.passageText.includes('sales report for the Chicago branch'),
  `passageText=${p3Block ? JSON.stringify(p3Block.passageText.slice(0, 80)) : 'khong co block'}`
);
const p7Block = sample.blocks.find(
  (b) => b.part === 7 && b.expectedQuestions.join(',') === '7,8'
);
check(
  'sample: block P7 gom dung cau 7, 8',
  !!p7Block,
  `blocks P7=${JSON.stringify(sample.blocks.filter((b) => b.part === 7).map((b) => b.expectedQuestions))}`
);
check(
  'sample: block P7 co passageText la notice',
  !!p7Block &&
    typeof p7Block.passageText === 'string' &&
    p7Block.passageText.includes('NOTICE: OFFICE RELOCATION') &&
    p7Block.passageText.includes('25 Green Street'),
  `passageText=${p7Block ? JSON.stringify(p7Block.passageText.slice(0, 80)) : 'khong co block'}`
);
check(
  'sample: tong 8 cau trong blocks, khong trung/lac',
  sample.blocks.reduce((n, b) => n + b.expectedQuestions.length, 0) === 8,
  `total=${sample.blocks.reduce((n, b) => n + b.expectedQuestions.length, 0)}`
);
check(
  'sample: warning ghi thieu Part 4, 6',
  sample.warnings.some((w) => w.includes('Thiếu Part') && w.includes('4') && w.includes('6')),
  `warnings=${JSON.stringify(sample.warnings)}`
);

// ---------- splitStructure tren file mau lech cau truc ----------
const unstructured = splitStructure(readSample('ai-parse-sample-unstructured.txt'));
check(
  'unstructured: khong co tieu de Part -> parts rong',
  Array.isArray(unstructured.parts) && unstructured.parts.length === 0,
  `parts=${JSON.stringify(unstructured.parts)}`
);
check(
  'unstructured: blocks rong, khong crash',
  Array.isArray(unstructured.blocks) && unstructured.blocks.length === 0
);
check(
  'unstructured: answerKeyFound = false',
  unstructured.answerKeyFound === false && unstructured.answerKey === null
);
check(
  'unstructured: warning ghi khong tim thay tieu de Part',
  unstructured.warnings.some((w) => w.includes('Không tìm thấy tiêu đề Part')),
  `warnings=${JSON.stringify(unstructured.warnings)}`
);
check(
  'unstructured: warning ghi van tim duoc 8 cau hoi nhung khong gan duoc Part',
  unstructured.warnings.some((w) => w.includes('8 câu hỏi') && w.includes('không xác định được Part')),
  `warnings=${JSON.stringify(unstructured.warnings)}`
);
check(
  'unstructured: warning ghi khong thay answer key',
  unstructured.warnings.some((w) => w.includes('Không tìm thấy phần Answer Key')),
  `warnings=${JSON.stringify(unstructured.warnings)}`
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
