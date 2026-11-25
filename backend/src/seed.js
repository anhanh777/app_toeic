'use strict';

/**
 * seed.js — seed CSDL tu data/questions.json + data/vocabulary.json
 * (file seed do data agent quan ly) va tao 2 tai khoan demo.
 *
 * - Chiu duoc file seed CHUA TON TAI (in canh bao, bo qua, van tao demo user).
 * - Chay lai duoc (idempotent): chi seed cau hoi/tu vung CHUA CO theo id
 *   (bo qua id da ton tai), chi tao demo user khi email chua ton tai.
 *   Ly do: tu khi co backup/khoi phuc, DB ton tai qua cac lan deploy nen
 *   seed dang "bo qua ca bang khi count > 0" se khien bo de MOI day len
 *   sau do khong bao gio duoc seed. Bo de IELTS theo tung Test da lam
 *   dung kieu nay tu truoc (tao test set neu thieu, chi seed khi de chua
 *   co cau nao).
 * - Seed KHONG cap nhat cau hoi/tu vung da co: sua noi dung cau cu trong
 *   file seed van can PUT qua API nhu hien nay (de khong ghi de sua doi
 *   cua admin tren web).
 * - Duoc goi tu src/index.js moi lan khoi dong, va chay doc lap bang
 *   `npm run seed`.
 */

const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');

function readJsonArray(file) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    console.warn(`[seed] khong tim thay ${full} — bo qua (data agent se tao sau).`);
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!Array.isArray(parsed)) {
      console.warn(`[seed] ${file} khong phai JSON array — bo qua.`);
      return [];
    }
    return parsed;
  } catch (err) {
    console.warn(`[seed] khong doc duoc ${file}: ${err.message} — bo qua.`);
    return [];
  }
}

function validSeedQuestion(q) {
  // Luat seed rieng (rong hon db.validateImportQuestion o 1 diem):
  // Part 2 chap nhan 3 phuong an (de ETS chuan) HOAC 4 phuong an.
  // Part 1/2 chi-nghe duoc rong noi dung (nhu validateImportQuestion).
  if (!q || typeof q.id !== 'string') return false;
  if (!Number.isInteger(q.part) || q.part < 1 || q.part > 7) return false;
  const listeningOnly = q.part === 1 || q.part === 2;
  if (!listeningOnly && (typeof q.content !== 'string' || !q.content.trim())) return false;
  if (!Array.isArray(q.options)) return false;
  if (q.part === 2) {
    if (q.options.length !== 3 && q.options.length !== 4) return false;
  } else if (q.options.length !== 4) {
    return false;
  }
  const labels = q.options.map((o) => o && o.label);
  if (new Set(labels).size !== labels.length) return false;
  if (!labels.every((l) => ['A', 'B', 'C', 'D'].includes(l))) return false;
  if (
    !listeningOnly &&
    q.options.some((o) => !o || typeof o.content !== 'string' || !o.content.trim())
  ) {
    return false;
  }
  if (typeof q.correct !== 'string' || !['A', 'B', 'C', 'D'].includes(q.correct)) return false;
  return true;
}

function seedQuestions() {
  // Seed tang dan theo id: chi chen cau CHUA CO (id chua ton tai).
  // DB co the da co cau hoi tu lan boot truoc (sau khi khoi phuc tu backup)
  // nhung bo de MOI van phai duoc seed — khong duoc bo qua ca bang.
  const list = readJsonArray('questions.json').filter(validSeedQuestion);
  // ETS 2024 - Test 01 (= De so 01, Bo de 2024): 200 cau trong
  // data/questions.json (testSetId TS-003). Tao truoc khi seed cau hoi de
  // insertQuestion gan dung test_set_id.
  if (!db.getTestSet('TS-003')) {
    db.createTestSet({
      id: 'TS-003',
      title: 'ETS 2024 - Test 01',
      description: 'ETS 2024 Test 01 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2024 Test 01 TS-003.');
  }
  if (!db.getTestSet('TS-004')) {
    db.createTestSet({
      id: 'TS-004',
      title: 'ETS 2024 - Test 02',
      description: 'ETS 2024 Test 02 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2024 Test 02 TS-004.');
  }
  if (!db.getTestSet('TS-005')) {
    db.createTestSet({
      id: 'TS-005',
      title: 'ETS 2024 - Test 03',
      description: 'ETS 2024 Test 03 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2024 Test 03 TS-005.');
  }
  if (!db.getTestSet('TS-006')) {
    db.createTestSet({
      id: 'TS-006',
      title: 'ETS 2024 - Test 05',
      description: 'ETS 2024 Test 05 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2024 Test 05 TS-006.');
  }
  if (!db.getTestSet('TS-007')) {
    db.createTestSet({
      id: 'TS-007',
      title: 'ETS 2024 - Test 04',
      description: 'ETS 2024 Test 04 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2024 Test 04 TS-007.');
  }
  if (!db.getTestSet('TS-009')) {
    db.createTestSet({
      id: 'TS-009',
      title: 'ETS 2024 - Test 06',
      description: 'ETS 2024 Test 06 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2024 Test 06 TS-009.');
  }
  if (!db.getTestSet('TS-010')) {
    db.createTestSet({
      id: 'TS-010',
      title: 'ETS 2024 - Test 07',
      description: 'ETS 2024 Test 07 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2024 Test 07 TS-010.');
  }
  if (!db.getTestSet('TS-011')) {
    db.createTestSet({
      id: 'TS-011',
      title: 'ETS 2024 - Test 08',
      description: 'ETS 2024 Test 08 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2024 Test 08 TS-011.');
  }
  if (!db.getTestSet('TS-012')) {
    db.createTestSet({
      id: 'TS-012',
      title: 'ETS 2024 - Test 09',
      description: 'ETS 2024 Test 09 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2024 Test 09 TS-012.');
  }
  if (!db.getTestSet('TS-013')) {
    db.createTestSet({
      id: 'TS-013',
      title: 'ETS 2024 - Test 10',
      description: 'ETS 2024 Test 10 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2024 Test 10 TS-013.');
  }
  if (!db.getTestSet('TS-014')) {
    db.createTestSet({
      id: 'TS-014',
      title: 'ETS 2026 - Test 01',
      description: 'ETS 2026 Test 01 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2026 Test 01 TS-014.');
  }
  if (!db.getTestSet('TS-015')) {
    db.createTestSet({
      id: 'TS-015',
      title: 'ETS 2026 - Test 02',
      description: 'ETS 2026 Test 02 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2026 Test 02 TS-015.');
  }
  if (!db.getTestSet('TS-016')) {
    db.createTestSet({
      id: 'TS-016',
      title: 'ETS 2026 - Test 03',
      description: 'ETS 2026 Test 03 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2026 Test 03 TS-016.');
  }
  if (!db.getTestSet('TS-017')) {
    db.createTestSet({
      id: 'TS-017',
      title: 'ETS 2026 - Test 04',
      description: 'ETS 2026 Test 04 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2026 Test 04 TS-017.');
  }
  if (!db.getTestSet('TS-018')) {
    db.createTestSet({
      id: 'TS-018',
      title: 'ETS 2026 - Test 05',
      description: 'ETS 2026 Test 05 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2026 Test 05 TS-018.');
  }
  if (!db.getTestSet('TS-019')) {
    db.createTestSet({
      id: 'TS-019',
      title: 'ETS 2026 - Test 06',
      description: 'ETS 2026 Test 06 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2026 Test 06 TS-019.');
  }
  if (!db.getTestSet('TS-020')) {
    db.createTestSet({
      id: 'TS-020',
      title: 'ETS 2026 - Test 07',
      description: 'ETS 2026 Test 07 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2026 Test 07 TS-020.');
  }
  if (!db.getTestSet('TS-021')) {
    db.createTestSet({
      id: 'TS-021',
      title: 'ETS 2026 - Test 08',
      description: 'ETS 2026 Test 08 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2026 Test 08 TS-021.');
  }
  if (!db.getTestSet('TS-022')) {
    db.createTestSet({
      id: 'TS-022',
      title: 'ETS 2026 - Test 09',
      description: 'ETS 2026 Test 09 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2026 Test 09 TS-022.');
  }
  if (!db.getTestSet('TS-023')) {
    db.createTestSet({
      id: 'TS-023',
      title: 'ETS 2026 - Test 10',
      description: 'ETS 2026 Test 10 - LC + RC (200 câu)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2026 Test 10 TS-023.');
  }
  if (!db.getTestSet('TS-025')) {
    db.createTestSet({
      id: 'TS-025',
      title: 'ETS 2025 - Test 01',
      description: 'ETS 2025 (YBM TOEIC 1000 Vol.1) Test 01 - LC + RC (200 câu, chua co audio nghe that)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2025 Test 01 TS-025.');
  }
  if (!db.getTestSet('TS-026')) {
    db.createTestSet({
      id: 'TS-026',
      title: 'ETS 2025 - Test 02',
      description: 'ETS 2025 (YBM TOEIC 1000 Vol.1) Test 02 - LC + RC (200 câu, audio TTS từ transcript)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2025 Test 02 TS-026.');
  }
  if (!db.getTestSet('TS-045')) {
    db.createTestSet({
      id: 'TS-045',
      title: 'ETS 2025 - Test 06',
      description: 'ETS 2025 (YBM TOEIC 1000 Vol.1) Test 06 - LC + RC (200 câu, chua co audio nghe that)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2025 Test 06 TS-045.');
  }
  if (!db.getTestSet('TS-044')) {
    db.createTestSet({
      id: 'TS-044',
      title: 'ETS 2025 - Test 03',
      description: 'ETS 2025 (YBM TOEIC 1000 Vol.1) Test 03 - LC + RC (200 câu, chua co audio nghe that)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2025 Test 03 TS-044.');
  }
  if (!db.getTestSet('TS-043')) {
    db.createTestSet({
      id: 'TS-043',
      title: 'ETS 2025 - Test 04',
      description: 'ETS 2025 (YBM TOEIC 1000 Vol.1) Test 04 - LC + RC (200 câu, chua co audio nghe that)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2025 Test 04 TS-043.');
  }
  if (!db.getTestSet('TS-042')) {
    db.createTestSet({
      id: 'TS-042',
      title: 'ETS 2025 - Test 05',
      description: 'ETS 2025 (YBM TOEIC 1000 Vol.1) Test 05 - LC + RC (200 câu, chua co audio nghe that)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2025 Test 05 TS-042.');
  }
  if (!db.getTestSet('TS-041')) {
    db.createTestSet({
      id: 'TS-041',
      title: 'ETS 2025 - Test 08',
      description: 'ETS 2025 (YBM TOEIC 1000 Vol.1) Test 08 - LC + RC (200 câu, chua co audio nghe that)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2025 Test 08 TS-041.');
  }
  if (!db.getTestSet('TS-040')) {
    db.createTestSet({
      id: 'TS-040',
      title: 'ETS 2025 - Test 09',
      description: 'ETS 2025 (YBM TOEIC 1000 Vol.1) Test 09 - LC + RC (200 câu, chua co audio nghe that)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2025 Test 09 TS-040.');
  }
  if (!db.getTestSet('TS-066')) {
    db.createTestSet({
      id: 'TS-066',
      title: 'ETS 2025 - Test 07',
      description: 'ETS 2025 (YBM TOEIC 1000 Vol.1) Test 07 - LC + RC (200 câu, chua co audio nghe that)',
      isPublished: 1,
    });
    console.log('[seed] da tao ETS 2025 Test 07 TS-066.');
  }
  let inserted = 0;
  let skipped = 0;
  for (const q of list) {
    if (db.getQuestionRowById(q.id)) {
      skipped += 1;
      continue;
    }
    try {
      db.insertQuestion({ ...q, testSetId: q.testSetId });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau hoi moi (${skipped} cau da co — bo qua).`);
  if (db.getTestSet('TS-003')) db.refreshTestSetTotal('TS-003');
  if (db.getTestSet('TS-004')) db.refreshTestSetTotal('TS-004');
  if (db.getTestSet('TS-005')) db.refreshTestSetTotal('TS-005');
  if (db.getTestSet('TS-006')) db.refreshTestSetTotal('TS-006');
  if (db.getTestSet('TS-007')) db.refreshTestSetTotal('TS-007');
  if (db.getTestSet('TS-009')) db.refreshTestSetTotal('TS-009');
  if (db.getTestSet('TS-010')) db.refreshTestSetTotal('TS-010');
  if (db.getTestSet('TS-011')) db.refreshTestSetTotal('TS-011');
  if (db.getTestSet('TS-012')) db.refreshTestSetTotal('TS-012');
  if (db.getTestSet('TS-013')) db.refreshTestSetTotal('TS-013');
  if (db.getTestSet('TS-014')) db.refreshTestSetTotal('TS-014');
  if (db.getTestSet('TS-015')) db.refreshTestSetTotal('TS-015');
  if (db.getTestSet('TS-016')) db.refreshTestSetTotal('TS-016');
  if (db.getTestSet('TS-017')) db.refreshTestSetTotal('TS-017');
  if (db.getTestSet('TS-018')) db.refreshTestSetTotal('TS-018');
  if (db.getTestSet('TS-019')) db.refreshTestSetTotal('TS-019');
  if (db.getTestSet('TS-020')) db.refreshTestSetTotal('TS-020');
  if (db.getTestSet('TS-021')) db.refreshTestSetTotal('TS-021');
  if (db.getTestSet('TS-022')) db.refreshTestSetTotal('TS-022');
  if (db.getTestSet('TS-023')) db.refreshTestSetTotal('TS-023');
  if (db.getTestSet('TS-025')) db.refreshTestSetTotal('TS-025');
  if (db.getTestSet('TS-026')) db.refreshTestSetTotal('TS-026');
  if (db.getTestSet('TS-045')) db.refreshTestSetTotal('TS-045');
  if (db.getTestSet('TS-044')) db.refreshTestSetTotal('TS-044');
  if (db.getTestSet('TS-043')) db.refreshTestSetTotal('TS-043');
  if (db.getTestSet('TS-042')) db.refreshTestSetTotal('TS-042');
  if (db.getTestSet('TS-041')) db.refreshTestSetTotal('TS-041');
  if (db.getTestSet('TS-040')) db.refreshTestSetTotal('TS-040');
  return inserted;
}

function validSeedIeltsQuestion(q) {
  if (!q || typeof q.id !== 'string' || !q.id.trim()) return false;
  if (q.exam !== undefined && q.exam !== 'ielts') return false;
  return db.validateImportQuestion({ ...q, exam: 'ielts' }, 0) === null;
}

/**
 * Cambridge IELTS 21 Test 01 (TS-028) — de thi that, tro thanh de chan doan
 * (thay TS-024). Mirror seedIeltsSample(): neu file
 * data/ielts-cam21-test1.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-028 chua co cau nao.
 */
function seedIeltsCam21Test1() {
  const list = readJsonArray('ielts-cam21-test1.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 21 Test 1 hop le — bo qua TS-028.');
    return 0;
  }
  if (!db.getTestSet('TS-028')) {
    db.createTestSet({
      id: 'TS-028',
      title: 'Cambridge IELTS 21 — Test 01',
      description:
        'Cambridge IELTS 21 Academic, Test 01: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật, dùng làm đề chẩn đoán.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 21 Test 01 TS-028.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-028', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-028 da co ${existing.total} cau — bo qua seed Cam 21 Test 1.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-028' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 21 Test 1 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 21 Test 1 (TS-028).`);
  return inserted;
}

/**
 * Cam 21 Test 2 — TS-029. Mirror seedIeltsCam21Test1(): neu file
 * data/ielts-cam21-test2.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-029 chua co cau nao.
 */
function seedIeltsCam21Test2() {
  const list = readJsonArray('ielts-cam21-test2.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 21 Test 2 hop le — bo qua TS-029.');
    return 0;
  }
  if (!db.getTestSet('TS-029')) {
    db.createTestSet({
      id: 'TS-029',
      title: 'Cambridge IELTS 21 — Test 02',
      description:
        'Cambridge IELTS 21 Academic, Test 02: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 21 Test 02 TS-029.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-029', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-029 da co ${existing.total} cau — bo qua seed Cam 21 Test 2.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-029' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 21 Test 2 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 21 Test 2 (TS-029).`);
  return inserted;
}

/**
 * Cam 21 Test 3 — TS-030. Mirror seedIeltsCam21Test2(): neu file
 * data/ielts-cam21-test3.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-030 chua co cau nao.
 */
function seedIeltsCam21Test3() {
  const list = readJsonArray('ielts-cam21-test3.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 21 Test 3 hop le — bo qua TS-030.');
    return 0;
  }
  if (!db.getTestSet('TS-030')) {
    db.createTestSet({
      id: 'TS-030',
      title: 'Cambridge IELTS 21 — Test 03',
      description:
        'Cambridge IELTS 21 Academic, Test 03: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 21 Test 03 TS-030.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-030', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-030 da co ${existing.total} cau — bo qua seed Cam 21 Test 3.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-030' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 21 Test 3 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 21 Test 3 (TS-030).`);
  return inserted;
}

/**
 * Cam 21 Test 4 — TS-031. Mirror seedIeltsCam21Test3(): neu file
 * data/ielts-cam21-test4.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-031 chua co cau nao.
 */
function seedIeltsCam21Test4() {
  const list = readJsonArray('ielts-cam21-test4.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 21 Test 4 hop le — bo qua TS-031.');
    return 0;
  }
  if (!db.getTestSet('TS-031')) {
    db.createTestSet({
      id: 'TS-031',
      title: 'Cambridge IELTS 21 — Test 04',
      description:
        'Cambridge IELTS 21 Academic, Test 04: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 21 Test 04 TS-031.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-031', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-031 da co ${existing.total} cau — bo qua seed Cam 21 Test 4.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-031' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 21 Test 4 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 21 Test 4 (TS-031).`);
  return inserted;
}

/**
 * Cam 20 Test 1 — TS-032. Mirror seedIeltsCam21Test4(): neu file
 * data/ielts-cam20-test1.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-032 chua co cau nao.
 */
function seedIeltsCam20Test1() {
  const list = readJsonArray('ielts-cam20-test1.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 20 Test 1 hop le — bo qua TS-032.');
    return 0;
  }
  if (!db.getTestSet('TS-032')) {
    db.createTestSet({
      id: 'TS-032',
      title: 'Cambridge IELTS 20 — Test 01',
      description:
        'Cambridge IELTS 20 Academic, Test 01: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 20 Test 01 TS-032.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-032', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-032 da co ${existing.total} cau — bo qua seed Cam 20 Test 1.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-032' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 20 Test 1 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 20 Test 1 (TS-032).`);
  return inserted;
}

/**
 * Cam 20 Test 2 — TS-033. Mirror seedIeltsCam20Test1(): neu file
 * data/ielts-cam20-test2.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-033 chua co cau nao.
 */
function seedIeltsCam20Test2() {
  const list = readJsonArray('ielts-cam20-test2.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 20 Test 2 hop le — bo qua TS-033.');
    return 0;
  }
  if (!db.getTestSet('TS-033')) {
    db.createTestSet({
      id: 'TS-033',
      title: 'Cambridge IELTS 20 — Test 02',
      description:
        'Cambridge IELTS 20 Academic, Test 02: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 20 Test 02 TS-033.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-033', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-033 da co ${existing.total} cau — bo qua seed Cam 20 Test 2.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-033' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 20 Test 2 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 20 Test 2 (TS-033).`);
  return inserted;
}

/**
 * Cam 20 Test 3 — TS-034. Mirror seedIeltsCam20Test2(): neu file
 * data/ielts-cam20-test3.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-034 chua co cau nao.
 */
function seedIeltsCam20Test3() {
  const list = readJsonArray('ielts-cam20-test3.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 20 Test 3 hop le — bo qua TS-034.');
    return 0;
  }
  if (!db.getTestSet('TS-034')) {
    db.createTestSet({
      id: 'TS-034',
      title: 'Cambridge IELTS 20 — Test 03',
      description:
        'Cambridge IELTS 20 Academic, Test 03: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 20 Test 03 TS-034.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-034', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-034 da co ${existing.total} cau — bo qua seed Cam 20 Test 3.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-034' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 20 Test 3 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 20 Test 3 (TS-034).`);
  return inserted;
}

/**
 * Cam 20 Test 4 — TS-035. Mirror seedIeltsCam20Test3(): neu file
 * data/ielts-cam20-test4.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-035 chua co cau nao.
 */
function seedIeltsCam20Test4() {
  const list = readJsonArray('ielts-cam20-test4.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 20 Test 4 hop le — bo qua TS-035.');
    return 0;
  }
  if (!db.getTestSet('TS-035')) {
    db.createTestSet({
      id: 'TS-035',
      title: 'Cambridge IELTS 20 — Test 04',
      description:
        'Cambridge IELTS 20 Academic, Test 04: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 20 Test 04 TS-035.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-035', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-035 da co ${existing.total} cau — bo qua seed Cam 20 Test 4.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-035' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 20 Test 4 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 20 Test 4 (TS-035).`);
  return inserted;
}

/**
 * Cam 19 Test 1 — TS-036. Mirror seedIeltsCam20Test4(): neu file
 * data/ielts-cam19-test1.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-036 chua co cau nao.
 */
function seedIeltsCam19Test1() {
  const list = readJsonArray('ielts-cam19-test1.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 19 Test 1 hop le — bo qua TS-036.');
    return 0;
  }
  if (!db.getTestSet('TS-036')) {
    db.createTestSet({
      id: 'TS-036',
      title: 'Cambridge IELTS 19 — Test 01',
      description:
        'Cambridge IELTS 19 Academic, Test 01: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 19 Test 01 TS-036.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-036', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-036 da co ${existing.total} cau — bo qua seed Cam 19 Test 1.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-036' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 19 Test 1 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 19 Test 1 (TS-036).`);
  return inserted;
}

/**
 * Cam 19 Test 2 — TS-037. Mirror seedIeltsCam19Test1(): neu file
 * data/ielts-cam19-test2.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-037 chua co cau nao.
 */
function seedIeltsCam19Test2() {
  const list = readJsonArray('ielts-cam19-test2.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 19 Test 2 hop le — bo qua TS-037.');
    return 0;
  }
  if (!db.getTestSet('TS-037')) {
    db.createTestSet({
      id: 'TS-037',
      title: 'Cambridge IELTS 19 — Test 02',
      description:
        'Cambridge IELTS 19 Academic, Test 02: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 19 Test 02 TS-037.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-037', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-037 da co ${existing.total} cau — bo qua seed Cam 19 Test 2.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-037' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 19 Test 2 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 19 Test 2 (TS-037).`);
  return inserted;
}

/**
 * Cam 19 Test 3 — TS-038. Mirror seedIeltsCam19Test2(): neu file
 * data/ielts-cam19-test3.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-038 chua co cau nao.
 */
function seedIeltsCam19Test3() {
  const list = readJsonArray('ielts-cam19-test3.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 19 Test 3 hop le — bo qua TS-038.');
    return 0;
  }
  if (!db.getTestSet('TS-038')) {
    db.createTestSet({
      id: 'TS-038',
      title: 'Cambridge IELTS 19 — Test 03',
      description:
        'Cambridge IELTS 19 Academic, Test 03: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 19 Test 03 TS-038.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-038', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-038 da co ${existing.total} cau — bo qua seed Cam 19 Test 3.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-038' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 19 Test 3 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 19 Test 3 (TS-038).`);
  return inserted;
}

/**
 * Cam 19 Test 4 — TS-039. Mirror seedIeltsCam19Test3(): neu file
 * data/ielts-cam19-test4.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-039 chua co cau nao.
 */
function seedIeltsCam19Test4() {
  const list = readJsonArray('ielts-cam19-test4.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 19 Test 4 hop le — bo qua TS-039.');
    return 0;
  }
  if (!db.getTestSet('TS-039')) {
    db.createTestSet({
      id: 'TS-039',
      title: 'Cambridge IELTS 19 — Test 04',
      description:
        'Cambridge IELTS 19 Academic, Test 04: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 19 Test 04 TS-039.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-039', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-039 da co ${existing.total} cau — bo qua seed Cam 19 Test 4.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-039' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 19 Test 4 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 19 Test 4 (TS-039).`);
  return inserted;
}

/**
 * Cam 18 Test 1 — TS-046. Mirror seedIeltsCam19Test4(): neu file
 * data/ielts-cam18-test1.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-046 chua co cau nao.
 */
function seedIeltsCam18Test1() {
  const list = readJsonArray('ielts-cam18-test1.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 18 Test 1 hop le — bo qua TS-046.');
    return 0;
  }
  if (!db.getTestSet('TS-046')) {
    db.createTestSet({
      id: 'TS-046',
      title: 'Cambridge IELTS 18 — Test 01',
      description:
        'Cambridge IELTS 18 Academic, Test 01: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 18 Test 01 TS-046.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-046', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-046 da co ${existing.total} cau — bo qua seed Cam 18 Test 1.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-046' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 18 Test 1 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 18 Test 1 (TS-046).`);
  return inserted;
}

/**
 * Cam 18 Test 2 — TS-047. Mirror seedIeltsCam18Test1(): neu file
 * data/ielts-cam18-test2.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-047 chua co cau nao.
 */
function seedIeltsCam18Test2() {
  const list = readJsonArray('ielts-cam18-test2.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 18 Test 2 hop le — bo qua TS-047.');
    return 0;
  }
  if (!db.getTestSet('TS-047')) {
    db.createTestSet({
      id: 'TS-047',
      title: 'Cambridge IELTS 18 — Test 02',
      description:
        'Cambridge IELTS 18 Academic, Test 02: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 18 Test 02 TS-047.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-047', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-047 da co ${existing.total} cau — bo qua seed Cam 18 Test 2.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-047' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 18 Test 2 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 18 Test 2 (TS-047).`);
  return inserted;
}

/**
 * Cam 18 Test 3 — TS-048. Mirror seedIeltsCam18Test2(): neu file
 * data/ielts-cam18-test3.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-048 chua co cau nao.
 */
function seedIeltsCam18Test3() {
  const list = readJsonArray('ielts-cam18-test3.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 18 Test 3 hop le — bo qua TS-048.');
    return 0;
  }
  if (!db.getTestSet('TS-048')) {
    db.createTestSet({
      id: 'TS-048',
      title: 'Cambridge IELTS 18 — Test 03',
      description:
        'Cambridge IELTS 18 Academic, Test 03: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 18 Test 03 TS-048.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-048', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-048 da co ${existing.total} cau — bo qua seed Cam 18 Test 3.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-048' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 18 Test 3 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 18 Test 3 (TS-048).`);
  return inserted;
}

/**
 * Cam 18 Test 4 — TS-049. Mirror seedIeltsCam18Test3(): neu file
 * data/ielts-cam18-test4.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-049 chua co cau nao.
 */
function seedIeltsCam18Test4() {
  const list = readJsonArray('ielts-cam18-test4.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 18 Test 4 hop le — bo qua TS-049.');
    return 0;
  }
  if (!db.getTestSet('TS-049')) {
    db.createTestSet({
      id: 'TS-049',
      title: 'Cambridge IELTS 18 — Test 04',
      description:
        'Cambridge IELTS 18 Academic, Test 04: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 18 Test 04 TS-049.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-049', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-049 da co ${existing.total} cau — bo qua seed Cam 18 Test 4.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-049' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 18 Test 4 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 18 Test 4 (TS-049).`);
  return inserted;
}

/**
 * Cam 17 Test 1 — TS-050. Mirror seedIeltsCam18Test4(): neu file
 * data/ielts-cam17-test1.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-050 chua co cau nao.
 */
function seedIeltsCam17Test1() {
  const list = readJsonArray('ielts-cam17-test1.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 17 Test 1 hop le — bo qua TS-050.');
    return 0;
  }
  if (!db.getTestSet('TS-050')) {
    db.createTestSet({
      id: 'TS-050',
      title: 'Cambridge IELTS 17 — Test 01',
      description:
        'Cambridge IELTS 17 Academic, Test 01: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 17 Test 01 TS-050.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-050', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-050 da co ${existing.total} cau — bo qua seed Cam 17 Test 1.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-050' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 17 Test 1 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 17 Test 1 (TS-050).`);
  return inserted;
}

function seedIeltsCam17Test2() {
  const list = readJsonArray('ielts-cam17-test2.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 17 Test 2 hop le — bo qua TS-051.');
    return 0;
  }
  if (!db.getTestSet('TS-051')) {
    db.createTestSet({
      id: 'TS-051',
      title: 'Cambridge IELTS 17 — Test 02',
      description:
        'Cambridge IELTS 17 Academic, Test 02: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 17 Test 02 TS-051.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-051', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-051 da co ${existing.total} cau — bo qua seed Cam 17 Test 2.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-051' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 17 Test 2 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 17 Test 2 (TS-051).`);
  return inserted;
}

function seedIeltsCam17Test3() {
  const list = readJsonArray('ielts-cam17-test3.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 17 Test 3 hop le — bo qua TS-052.');
    return 0;
  }
  if (!db.getTestSet('TS-052')) {
    db.createTestSet({
      id: 'TS-052',
      title: 'Cambridge IELTS 17 — Test 03',
      description:
        'Cambridge IELTS 17 Academic, Test 03: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 17 Test 03 TS-052.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-052', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-052 da co ${existing.total} cau — bo qua seed Cam 17 Test 3.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-052' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 17 Test 3 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 17 Test 3 (TS-052).`);
  return inserted;
}

/**
 * Cam 17 Test 4 — TS-053. Mirror seedIeltsCam17Test3(): neu file
 * data/ielts-cam17-test4.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-053 chua co cau nao.
 */
function seedIeltsCam17Test4() {
  const list = readJsonArray('ielts-cam17-test4.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 17 Test 4 hop le — bo qua TS-053.');
    return 0;
  }
  if (!db.getTestSet('TS-053')) {
    db.createTestSet({
      id: 'TS-053',
      title: 'Cambridge IELTS 17 — Test 04',
      description:
        'Cambridge IELTS 17 Academic, Test 04: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 17 Test 04 TS-053.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-053', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-053 da co ${existing.total} cau — bo qua seed Cam 17 Test 4.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-053' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 17 Test 4 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 17 Test 4 (TS-053).`);
  return inserted;
}

function seedIeltsCam16Test1() {
  const list = readJsonArray('ielts-cam16-test1.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 16 Test 1 hop le — bo qua TS-054.');
    return 0;
  }
  if (!db.getTestSet('TS-054')) {
    db.createTestSet({
      id: 'TS-054',
      title: 'Cambridge IELTS 16 — Test 01',
      description:
        'Cambridge IELTS 16 Academic, Test 01: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 16 Test 01 TS-054.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-054', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-054 da co ${existing.total} cau — bo qua seed Cam 16 Test 1.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-054' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 16 Test 1 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 16 Test 1 (TS-054).`);
  return inserted;
}

function seedIeltsCam16Test2() {
  const list = readJsonArray('ielts-cam16-test2.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 16 Test 2 hop le — bo qua TS-055.');
    return 0;
  }
  if (!db.getTestSet('TS-055')) {
    db.createTestSet({
      id: 'TS-055',
      title: 'Cambridge IELTS 16 — Test 02',
      description:
        'Cambridge IELTS 16 Academic, Test 02: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 16 Test 02 TS-055.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-055', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-055 da co ${existing.total} cau — bo qua seed Cam 16 Test 2.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-055' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 16 Test 2 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 16 Test 2 (TS-055).`);
  return inserted;
}

function seedIeltsCam16Test3() {
  const list = readJsonArray('ielts-cam16-test3.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 16 Test 3 hop le — bo qua TS-056.');
    return 0;
  }
  if (!db.getTestSet('TS-056')) {
    db.createTestSet({
      id: 'TS-056',
      title: 'Cambridge IELTS 16 — Test 03',
      description:
        'Cambridge IELTS 16 Academic, Test 03: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 16 Test 03 TS-056.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-056', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-056 da co ${existing.total} cau — bo qua seed Cam 16 Test 3.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-056' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 16 Test 3 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 16 Test 3 (TS-056).`);
  return inserted;
}

function seedIeltsCam16Test4() {
  const list = readJsonArray('ielts-cam16-test4.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 16 Test 4 hop le — bo qua TS-057.');
    return 0;
  }
  if (!db.getTestSet('TS-057')) {
    db.createTestSet({
      id: 'TS-057',
      title: 'Cambridge IELTS 16 — Test 04',
      description:
        'Cambridge IELTS 16 Academic, Test 04: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 16 Test 04 TS-057.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-057', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-057 da co ${existing.total} cau — bo qua seed Cam 16 Test 4.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-057' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 16 Test 4 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 16 Test 4 (TS-057).`);
  return inserted;
}

function seedIeltsCam15Test1() {
  const list = readJsonArray('ielts-cam15-test1.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 15 Test 1 hop le — bo qua TS-058.');
    return 0;
  }
  if (!db.getTestSet('TS-058')) {
    db.createTestSet({
      id: 'TS-058',
      title: 'Cambridge IELTS 15 — Test 01',
      description:
        'Cambridge IELTS 15 Academic, Test 01: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 15 Test 01 TS-058.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-058', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-058 da co ${existing.total} cau — bo qua seed Cam 15 Test 1.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-058' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 15 Test 1 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 15 Test 1 (TS-058).`);
  return inserted;
}

function seedIeltsCam15Test2() {
  const list = readJsonArray('ielts-cam15-test2.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 15 Test 2 hop le — bo qua TS-059.');
    return 0;
  }
  if (!db.getTestSet('TS-059')) {
    db.createTestSet({
      id: 'TS-059',
      title: 'Cambridge IELTS 15 — Test 02',
      description:
        'Cambridge IELTS 15 Academic, Test 02: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 15 Test 02 TS-059.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-059', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-059 da co ${existing.total} cau — bo qua seed Cam 15 Test 2.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-059' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 15 Test 2 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 15 Test 2 (TS-059).`);
  return inserted;
}

function seedIeltsCam15Test3() {
  const list = readJsonArray('ielts-cam15-test3.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 15 Test 3 hop le — bo qua TS-060.');
    return 0;
  }
  if (!db.getTestSet('TS-060')) {
    db.createTestSet({
      id: 'TS-060',
      title: 'Cambridge IELTS 15 — Test 03',
      description:
        'Cambridge IELTS 15 Academic, Test 03: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 15 Test 03 TS-060.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-060', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-060 da co ${existing.total} cau — bo qua seed Cam 15 Test 3.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-060' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 15 Test 3 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 15 Test 3 (TS-060).`);
  return inserted;
}

function seedIeltsCam15Test4() {
  const list = readJsonArray('ielts-cam15-test4.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 15 Test 4 hop le — bo qua TS-061.');
    return 0;
  }
  if (!db.getTestSet('TS-061')) {
    db.createTestSet({
      id: 'TS-061',
      title: 'Cambridge IELTS 15 — Test 04',
      description:
        'Cambridge IELTS 15 Academic, Test 04: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 15 Test 04 TS-061.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-061', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-061 da co ${existing.total} cau — bo qua seed Cam 15 Test 4.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-061' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 15 Test 4 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 15 Test 4 (TS-061).`);
  return inserted;
}

function seedIeltsCam14Test1() {
  const list = readJsonArray('ielts-cam14-test1.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 14 Test 1 hop le — bo qua TS-062.');
    return 0;
  }
  if (!db.getTestSet('TS-062')) {
    db.createTestSet({
      id: 'TS-062',
      title: 'Cambridge IELTS 14 — Test 01',
      description:
        'Cambridge IELTS 14 Academic, Test 01: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 14 Test 01 TS-062.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-062', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-062 da co ${existing.total} cau — bo qua seed Cam 14 Test 1.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-062' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 14 Test 1 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 14 Test 1 (TS-062).`);
  return inserted;
}

function seedIeltsCam13Test1() {
  const list = readJsonArray('ielts-cam13-test1.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 13 Test 1 hop le — bo qua TS-067.');
    return 0;
  }
  if (!db.getTestSet('TS-067')) {
    db.createTestSet({
      id: 'TS-067',
      title: 'Cambridge IELTS 13 — Test 01',
      description:
        'Cambridge IELTS 13 Academic, Test 01: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 13 Test 01 TS-067.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-067', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-067 da co ${existing.total} cau — bo qua seed Cam 13 Test 1.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-067' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 13 Test 1 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 13 Test 1 (TS-067).`);
  return inserted;
}

function seedIeltsCam14Test2() {
  const list = readJsonArray('ielts-cam14-test2.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 14 Test 2 hop le — bo qua TS-063.');
    return 0;
  }
  if (!db.getTestSet('TS-063')) {
    db.createTestSet({
      id: 'TS-063',
      title: 'Cambridge IELTS 14 — Test 02',
      description:
        'Cambridge IELTS 14 Academic, Test 02: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 14 Test 02 TS-063.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-063', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-063 da co ${existing.total} cau — bo qua seed Cam 14 Test 2.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-063' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 14 Test 2 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 14 Test 2 (TS-063).`);
  return inserted;
}

function seedIeltsCam14Test3() {
  const list = readJsonArray('ielts-cam14-test3.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 14 Test 3 hop le — bo qua TS-064.');
    return 0;
  }
  if (!db.getTestSet('TS-064')) {
    db.createTestSet({
      id: 'TS-064',
      title: 'Cambridge IELTS 14 — Test 03',
      description:
        'Cambridge IELTS 14 Academic, Test 03: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 14 Test 03 TS-064.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-064', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-064 da co ${existing.total} cau — bo qua seed Cam 14 Test 3.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-064' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 14 Test 3 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 14 Test 3 (TS-064).`);
  return inserted;
}

function seedIeltsCam14Test4() {
  const list = readJsonArray('ielts-cam14-test4.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS Cam 14 Test 4 hop le — bo qua TS-065.');
    return 0;
  }
  if (!db.getTestSet('TS-065')) {
    db.createTestSet({
      id: 'TS-065',
      title: 'Cambridge IELTS 14 — Test 04',
      description:
        'Cambridge IELTS 14 Academic, Test 04: Listening 4 Section + Reading 3 Passage (80 câu). Đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao Cambridge IELTS 14 Test 04 TS-065.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-065', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-065 da co ${existing.total} cau — bo qua seed Cam 14 Test 4.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-065' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau Cam 14 Test 4 ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau Cam 14 Test 4 (TS-065).`);
  return inserted;
}

function seedVocabulary() {
  // Seed tang dan theo id (nhu seedQuestions): chi chen tu CHUA CO.
  const list = readJsonArray('vocabulary.json').filter(
    (v) => v && typeof v.id === 'string' && typeof v.word === 'string' && typeof v.meaning === 'string'
  );
  let inserted = 0;
  let skipped = 0;
  for (const v of list) {
    if (db.getVocabularyById(v.id)) {
      skipped += 1;
      continue;
    }
    try {
      db.insertVocabulary(v);
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua tu ${v.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} tu vung moi (${skipped} tu da co — bo qua).`);
  return inserted;
}

function seedIeltsWritingTasks() {
  // De mau Writing IELTS (tu soan, chi 2 de). Idempotent: bo qua id da co.
  const list = readJsonArray('ielts-writing-tasks.json').filter(
    (t) => t && typeof t.id === 'string' && typeof t.prompt === 'string'
  );
  let inserted = 0;
  for (const t of list) {
    if (db.getWritingTask(t.id)) continue;
    try {
      db.insertWritingTask(t);
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua writing task ${t.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} writing tasks IELTS sample.`);
  return inserted;
}

function seedIeltsSpeakingPrompts() {
  // Prompt mau Speaking IELTS (tu soan). Idempotent: bo qua id da co.
  const list = readJsonArray('ielts-speaking-prompts.json').filter(
    (p) => p && typeof p.id === 'string' && Number.isInteger(p.part) && typeof p.prompt === 'string'
  );
  let inserted = 0;
  for (const p of list) {
    if (db.getSpeakingPrompt(p.id)) continue;
    try {
      db.insertSpeakingPrompt(p);
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua speaking prompt ${p.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} speaking prompts IELTS sample.`);
  return inserted;
}

function seedDemoUsers() {
  const demos = [
    { email: 'demo@toeic.app', password: 'admin123', name: 'Demo Admin', role: 'admin' },
    { email: 'user@toeic.app', password: 'user123', name: 'Demo User', role: 'user' },
  ];
  for (const d of demos) {
    if (!db.findUserByEmail(d.email)) {
      db.createUser({
        email: d.email,
        passwordHash: bcrypt.hashSync(d.password, 10),
        name: d.name,
        role: d.role,
      });
      console.log(`[seed] da tao demo ${d.email} (${d.role}).`);
    }
  }
}

function seedPartMedia() {
  // Audio ca Part 1-4 cho tung bo de (link Cloudinary). Bang part_media KHONG
  // duoc seed mac dinh nen sau moi lan redeploy (Render free tier xoa DB) thi
  // audio gan qua API se mat — seed tu data/part-media.json de du ben.
  let list = [];
  try {
    list = readJsonArray('part-media.json');
  } catch (err) {
    console.warn(`[seed] khong doc duoc part-media.json: ${err.message}`);
    return 0;
  }
  let seeded = 0;
  for (const m of list) {
    if (!m || typeof m.testSetId !== 'string' || !Number.isInteger(m.part) || typeof m.audioUrl !== 'string') {
      continue;
    }
    if (!db.getTestSet(m.testSetId)) continue;
    try {
      db.setPartMedia(m.testSetId, m.part, m.audioUrl);
      seeded += 1;
    } catch (err) {
      console.warn(`[seed] bo qua part-media ${m.testSetId} P${m.part}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${seeded}/${list.length} part-media.`);
  return seeded;
}

function seedUiSettings() {
  // Cai dat giao dien dong (scope C): chi chen mac dinh khi key chua co
  // (INSERT OR IGNORE) — khong bao gio ghi de cai dat admin da sua.
  // Mac dinh nam trong code (backend/src/uiSettings.js) nen Render
  // free-tier reseed van khoi phuc duoc.
  //
  // Migrate 1 lan (2026-11-20, mo hinh styles): khoi styles moi lay theo
  // cai dat chung cu dang co trong DB — pastel.accent lay theo ui.accent
  // (mau co ay da luu), loading moi kieu lay theo ui.loading chung
  // (page=bouncing-dots, text="Bình tĩnh...."); lively.accent mac dinh
  // #58CC02 tu registry. Chi ap khi key styles chua co trong DB.
  const { defaultFlatSettings, STYLE_REGISTRY } = require('./uiSettings');
  const defaults = defaultFlatSettings();
  const legacyAccent = db.getSetting('ui.accent');
  if (
    legacyAccent !== undefined &&
    /^#[0-9a-fA-F]{6}$/.test(legacyAccent) &&
    db.getSetting('ui.styles.pastel.accent') === undefined
  ) {
    defaults['ui.styles.pastel.accent'] = legacyAccent;
  }
  for (const s of STYLE_REGISTRY) {
    for (const f of ['loginButton', 'page', 'table', 'speed', 'text']) {
      const legacy = db.getSetting(`ui.loading.${f}`);
      if (legacy !== undefined && db.getSetting(`ui.styles.${s.id}.loading.${f}`) === undefined) {
        defaults[`ui.styles.${s.id}.loading.${f}`] = legacy;
      }
    }
  }
  let added = 0;
  for (const [key, value] of Object.entries(defaults)) {
    if (db.getSetting(key) === undefined) {
      db.setSetting(key, value);
      added += 1;
    }
  }
  if (added > 0) console.log(`[seed] app_settings: them ${added} gia tri mac dinh.`);
  return added;
}

function seedBrandSettings() {
  // Cai dat thuong hieu: chi chen mac dinh khi key chua co
  // (khong bao gio ghi de cai dat admin da sua). Mac dinh nam trong
  // code (backend/src/brandSettings.js) nen Render free-tier reseed
  // van khoi phuc duoc.
  const { defaultFlatBrand } = require('./brandSettings');
  const defaults = defaultFlatBrand();
  let added = 0;
  for (const [key, value] of Object.entries(defaults)) {
    if (db.getBrandSetting(key) === undefined) {
      db.setBrandSetting(key, value);
      added += 1;
    }
  }
  if (added > 0) console.log(`[seed] brand_settings: them ${added} gia tri mac dinh.`);
  return added;
}

function seedMenuIcons() {
  // Bieu tuong menu: chi chen mac dinh khi key chua co
  // (khong bao gio ghi de icon admin da sua). Mac dinh nam trong
  // code (backend/src/menuIcons.js) nen Render free-tier reseed
  // van khoi phuc duoc.
  const { defaultMenuIcons } = require('./menuIcons');
  const defaults = defaultMenuIcons();
  let added = 0;
  for (const [key, value] of Object.entries(defaults)) {
    if (db.getMenuIcon(key) === undefined) {
      db.setMenuIcon(key, value);
      added += 1;
    }
  }
  if (added > 0) console.log(`[seed] menu_icons: them ${added} gia tri mac dinh.`);
  return added;
}

function seedAll() {
  db.initDb();
  // DB trong (vua bi Render xoa) -> seed tuoi: bat bao tri de app hoc vien
  // khong hien du lieu trong/sai trong luc nap lai; restore-watch tat sau
  // khi khoi phuc xong. Chi bat khi DB trong han — khoi dong binh thuong
  // (DB con du lieu) khong dung toi bao tri. Luu y: lan chay dau tien tren
  // 1 deploy moi cung la "DB trong" nen bao tri se bat va can admin tat
  // tay 1 lan (hoac doi chu ky backup/restore dau tien tat ho).
  const freshDb = db.countQuestions() === 0 && db.countUsers() === 0;
  seedUiSettings();
  seedBrandSettings();
  seedMenuIcons();
  seedQuestions();
  seedIeltsCam21Test1();
  seedIeltsCam21Test2();
  seedIeltsCam21Test3();
  seedIeltsCam21Test4();
  seedIeltsCam20Test1();
  seedIeltsCam20Test2();
  seedIeltsCam20Test3();
  seedIeltsCam20Test4();
  seedIeltsCam19Test1();
  seedIeltsCam19Test2();
  seedIeltsCam19Test3();
  seedIeltsCam19Test4();
  seedIeltsCam18Test1();
  seedIeltsCam18Test2();
  seedIeltsCam18Test3();
  seedIeltsCam18Test4();
  seedIeltsCam17Test1();
  seedIeltsCam17Test2();
  seedIeltsCam17Test3();
  seedIeltsCam17Test4();
  seedIeltsCam16Test1();
  seedIeltsCam16Test2();
  seedIeltsCam16Test3();
  seedIeltsCam16Test4();
  seedIeltsCam15Test1();
  seedIeltsCam15Test2();
  seedIeltsCam15Test3();
  seedIeltsCam15Test4();
  seedIeltsCam14Test1();
  seedIeltsCam14Test2();
  seedIeltsCam14Test3();
  seedIeltsCam14Test4();
  seedIeltsCam13Test1();
  seedPartMedia();
  seedVocabulary();
  seedIeltsWritingTasks();
  seedIeltsSpeakingPrompts();
  seedDemoUsers();
  if (db.getTestSet('TS-028')) db.refreshTestSetTotal('TS-028');
  if (db.getTestSet('TS-029')) db.refreshTestSetTotal('TS-029');
  if (db.getTestSet('TS-030')) db.refreshTestSetTotal('TS-030');
  if (db.getTestSet('TS-031')) db.refreshTestSetTotal('TS-031');
  if (db.getTestSet('TS-032')) db.refreshTestSetTotal('TS-032');
  if (db.getTestSet('TS-033')) db.refreshTestSetTotal('TS-033');
  if (db.getTestSet('TS-034')) db.refreshTestSetTotal('TS-034');
  if (db.getTestSet('TS-035')) db.refreshTestSetTotal('TS-035');
  if (db.getTestSet('TS-036')) db.refreshTestSetTotal('TS-036');
  if (db.getTestSet('TS-037')) db.refreshTestSetTotal('TS-037');
  if (db.getTestSet('TS-038')) db.refreshTestSetTotal('TS-038');
  if (db.getTestSet('TS-039')) db.refreshTestSetTotal('TS-039');
  if (db.getTestSet('TS-046')) db.refreshTestSetTotal('TS-046');
  if (db.getTestSet('TS-047')) db.refreshTestSetTotal('TS-047');
  if (db.getTestSet('TS-048')) db.refreshTestSetTotal('TS-048');
  if (db.getTestSet('TS-049')) db.refreshTestSetTotal('TS-049');
  if (db.getTestSet('TS-050')) db.refreshTestSetTotal('TS-050');
  if (db.getTestSet('TS-051')) db.refreshTestSetTotal('TS-051');
  if (db.getTestSet('TS-052')) db.refreshTestSetTotal('TS-052');
  if (db.getTestSet('TS-053')) db.refreshTestSetTotal('TS-053');
  if (db.getTestSet('TS-054')) db.refreshTestSetTotal('TS-054');
  if (db.getTestSet('TS-055')) db.refreshTestSetTotal('TS-055');
  if (db.getTestSet('TS-056')) db.refreshTestSetTotal('TS-056');
  if (db.getTestSet('TS-057')) db.refreshTestSetTotal('TS-057');
  if (db.getTestSet('TS-058')) db.refreshTestSetTotal('TS-058');
  if (db.getTestSet('TS-059')) db.refreshTestSetTotal('TS-059');
  if (db.getTestSet('TS-060')) db.refreshTestSetTotal('TS-060');
  if (db.getTestSet('TS-061')) db.refreshTestSetTotal('TS-061');
  if (db.getTestSet('TS-062')) db.refreshTestSetTotal('TS-062');
  if (db.getTestSet('TS-063')) db.refreshTestSetTotal('TS-063');
  if (db.getTestSet('TS-064')) db.refreshTestSetTotal('TS-064');
  if (db.getTestSet('TS-065')) db.refreshTestSetTotal('TS-065');
  if (db.getTestSet('TS-067')) db.refreshTestSetTotal('TS-067');
  if (freshDb) {
    db.setSetting('maintenance.enabled', true);
    db.setSetting('maintenance.auto', true);
    console.log('[seed] DB trong -> bat bao tri (maintenance.enabled=true, auto=true).');
  }
  console.log(
    `[seed] xong: ${db.countQuestions()} cau hoi, ${db.countVocabulary()} tu vung, ${db.countUsers()} user.`
  );
}

if (require.main === module) {
  seedAll();
}

module.exports = { seedAll, seedQuestions, seedVocabulary, seedDemoUsers, seedPartMedia, seedUiSettings, seedBrandSettings, seedMenuIcons, seedIeltsCam21Test1, seedIeltsCam21Test2, seedIeltsCam21Test3, seedIeltsCam21Test4, seedIeltsCam20Test1, seedIeltsCam20Test2, seedIeltsCam20Test3, seedIeltsCam20Test4, seedIeltsCam19Test1, seedIeltsCam19Test2, seedIeltsCam19Test3, seedIeltsCam19Test4, seedIeltsCam18Test1, seedIeltsCam18Test2, seedIeltsCam18Test3, seedIeltsCam18Test4, seedIeltsCam17Test1, seedIeltsCam17Test2, seedIeltsCam17Test3, seedIeltsCam17Test4, seedIeltsCam16Test1, seedIeltsCam16Test2, seedIeltsCam16Test3, seedIeltsCam16Test4, seedIeltsCam15Test1, seedIeltsCam15Test2, seedIeltsCam15Test3, seedIeltsCam15Test4, seedIeltsWritingTasks, seedIeltsSpeakingPrompts, validSeedIeltsQuestion };
