'use strict';

/**
 * seed.js — seed CSDL tu data/questions.json + data/vocabulary.json
 * (file seed do data agent quan ly) va tao 2 tai khoan demo.
 *
 * - Chiu duoc file seed CHUA TON TAI (in canh bao, bo qua, van tao demo user).
 * - Chay lai duoc (idempotent): chi seed cau hoi/tu vung khi bang dang rong,
 *   chi tao demo user khi email chua ton tai.
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
  if (db.countQuestions() > 0) {
    console.log(`[seed] questions da co ${db.countQuestions()} cau — bo qua seed cau hoi.`);
    return 0;
  }
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
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, testSetId: q.testSetId });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau hoi.`);
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
  return inserted;
}

function validSeedIeltsQuestion(q) {
  if (!q || typeof q.id !== 'string' || !q.id.trim()) return false;
  if (q.exam !== undefined && q.exam !== 'ielts') return false;
  return db.validateImportQuestion({ ...q, exam: 'ielts' }, 0) === null;
}

/**
 * De mau bo sung TS-027 — cac dang bai IELTS moi (note/table/flow_chart/
 * diagram completion, matching_sentence_endings, list_selection,
 * choosing_title). Mirror seedIeltsSample(): neu file
 * data/ielts-sample-types.json chua co thi chi warn, khong tao de rong;
 * chi seed khi TS-027 chua co cau nao.
 */
function seedIeltsSampleTypes() {
  const list = readJsonArray('ielts-sample-types.json').filter(validSeedIeltsQuestion);
  if (!list.length) {
    console.log('[seed] khong co cau IELTS sample bo sung hop le — bo qua TS-027.');
    return 0;
  }
  if (!db.getTestSet('TS-027')) {
    db.createTestSet({
      id: 'TS-027',
      title: 'IELTS Academic — Mẫu dạng bài bổ sung (Sample)',
      description:
        'Đề mẫu IELTS Academic: các dạng bài bổ sung (note/table/flow-chart/diagram completion, matching sentence endings, list selection, choosing title). Nội dung tự soạn để test tính năng, KHÔNG phải đề thi thật.',
      isPublished: 1,
      exam: 'ielts',
    });
    console.log('[seed] da tao IELTS Sample Types TS-027.');
  }
  const existing = db.listQuestions({ testSetId: 'TS-027', limit: 1, offset: 0 });
  if (existing.total > 0) {
    console.log(`[seed] TS-027 da co ${existing.total} cau — bo qua seed IELTS sample bo sung.`);
    return 0;
  }
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion({ ...q, exam: 'ielts', testSetId: 'TS-027' });
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau IELTS ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau IELTS sample bo sung (TS-027).`);
  return inserted;
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

function seedVocabulary() {
  if (db.countVocabulary() > 0) {
    console.log(`[seed] vocabulary da co ${db.countVocabulary()} tu — bo qua seed tu vung.`);
    return 0;
  }
  const list = readJsonArray('vocabulary.json').filter(
    (v) => v && typeof v.id === 'string' && typeof v.word === 'string' && typeof v.meaning === 'string'
  );
  let inserted = 0;
  for (const v of list) {
    try {
      db.insertVocabulary(v);
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua tu ${v.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} tu vung.`);
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

function seedAll() {
  db.initDb();
  seedQuestions();
  seedIeltsSampleTypes();
  seedIeltsCam21Test1();
  seedIeltsCam21Test2();
  seedPartMedia();
  seedVocabulary();
  seedIeltsWritingTasks();
  seedIeltsSpeakingPrompts();
  seedDemoUsers();
  if (db.getTestSet('TS-027')) db.refreshTestSetTotal('TS-027');
  if (db.getTestSet('TS-028')) db.refreshTestSetTotal('TS-028');
  if (db.getTestSet('TS-029')) db.refreshTestSetTotal('TS-029');
  console.log(
    `[seed] xong: ${db.countQuestions()} cau hoi, ${db.countVocabulary()} tu vung, ${db.countUsers()} user.`
  );
}

if (require.main === module) {
  seedAll();
}

module.exports = { seedAll, seedQuestions, seedVocabulary, seedDemoUsers, seedPartMedia, seedIeltsSampleTypes, seedIeltsCam21Test1, seedIeltsCam21Test2, seedIeltsWritingTasks, seedIeltsSpeakingPrompts, validSeedIeltsQuestion };
