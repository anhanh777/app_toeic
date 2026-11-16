'use strict';

/**
 * db.js — MODULE SQL DUY NHAT cua backend.
 *
 * Moi cau SQL cua app deu nam o day (hoac trong helper ma module nay export).
 * Routes KHONG duoc viet SQL truc tiep — chi goi cac ham duoi day.
 *
 * - SQLite qua node:sqlite (DatabaseSync, co san tu Node 22.5+/24, khong can
 *   native module). Luu tru file .db, duong dan lay tu env DATABASE_PATH,
 *   mac dinh backend/data/app.db.
 * - Schema viet bang SQL chuan, tuong thich Postgres (xem docs/database.md):
 *   kieu INTEGER / TEXT / REAL / TIMESTAMP, timestamp dang text ISO-8601,
 *   tinh toan ngay gio bang JS, khong dung ham dac thu SQLite (khong dung
 *   strftime, khong dung date() trong logic app — chi so sanh chuoi ISO).
 *   Luu y: `INTEGER PRIMARY KEY AUTOINCREMENT` o SQLite ~ SERIAL/BIGSERIAL
 *   o Postgres; `ON CONFLICT ... DO UPDATE` co o ca hai.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function resolveDbPath() {
  const fromEnv = process.env.DATABASE_PATH;
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(__dirname, '..', 'data', 'app.db');
}

const DB_PATH = resolveDbPath();
const FALLBACK_DB_PATH = path.join(__dirname, '..', 'data', 'app.db');
let DB_FILE = DB_PATH;
try {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
} catch (err) {
  // Render goi Free khong co persistent disk: /var/data khong ghi duoc
  // (EACCES). Roi ve file .db trong thu muc backend/data — du lieu se mat
  // khi redeploy, nhung app van chay duoc de test.
  console.warn(`[db] khong tao duoc thu muc ${path.dirname(DB_PATH)} (${err.code}) — dung ${FALLBACK_DB_PATH} thay the.`);
  DB_FILE = FALLBACK_DB_PATH;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  role TEXT DEFAULT 'user',
  target_score INTEGER DEFAULT 650,
  google_id TEXT UNIQUE,
  avatar_url TEXT,
  hide_on_leaderboard INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS test_sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  total_questions INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 0,
  exam TEXT DEFAULT 'toeic',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  exam TEXT DEFAULT 'toeic',
  part INTEGER,
  passage_id TEXT,
  test_set_id TEXT,
  content TEXT,
  explanation TEXT,
  topic TEXT,
  difficulty TEXT,
  script TEXT,
  passage_text TEXT,
  image_url TEXT,
  audio_url TEXT,
  question_type TEXT,
  word_limit INTEGER,
  accepted_answers TEXT,
  correct_text TEXT
);
CREATE TABLE IF NOT EXISTS options (
  question_id TEXT,
  label TEXT,
  content TEXT,
  is_correct INTEGER,
  PRIMARY KEY (question_id, label)
);
CREATE TABLE IF NOT EXISTS passages (
  id TEXT PRIMARY KEY,
  part INTEGER,
  test_set_id TEXT,
  title TEXT,
  content TEXT,
  script TEXT,
  type TEXT,
  audio_url TEXT,
  exam TEXT,
  passage_type TEXT
);
CREATE TABLE IF NOT EXISTS part_media (
  test_set_id TEXT NOT NULL,
  part INTEGER NOT NULL,
  audio_url TEXT NOT NULL,
  PRIMARY KEY (test_set_id, part)
);
CREATE TABLE IF NOT EXISTS vocabulary (
  id TEXT PRIMARY KEY,
  word TEXT,
  phonetic TEXT,
  meaning TEXT,
  example TEXT,
  topic TEXT,
  exam TEXT DEFAULT 'toeic'
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  mode TEXT,
  part INTEGER,
  test_set_id TEXT,
  question_ids TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_sec INTEGER,
  listening_correct INTEGER,
  reading_correct INTEGER,
  listening_score INTEGER,
  reading_score INTEGER,
  total_score INTEGER,
  xp_earned INTEGER,
  leaderboard_eligible INTEGER DEFAULT 1,
  exam TEXT DEFAULT 'toeic',
  listening_band REAL,
  reading_band REAL,
  overall_band REAL
);
CREATE TABLE IF NOT EXISTS answers (
  attempt_id INTEGER,
  question_id TEXT,
  selected TEXT,
  is_correct INTEGER,
  PRIMARY KEY (attempt_id, question_id)
);
CREATE TABLE IF NOT EXISTS wrong_questions (
  user_id INTEGER,
  question_id TEXT,
  wrong_count INTEGER DEFAULT 1,
  last_wrong_at TEXT,
  PRIMARY KEY (user_id, question_id)
);
CREATE TABLE IF NOT EXISTS user_vocabulary (
  user_id INTEGER,
  vocab_id TEXT,
  status TEXT DEFAULT 'learning',
  last_reviewed_at TEXT,
  PRIMARY KEY (user_id, vocab_id)
);
CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  xp INTEGER,
  reason TEXT,
  created_at TEXT
);
/* ---------------- IELTS Phase 1 (them moi, khong sua bang cu) ---------------- */
CREATE TABLE IF NOT EXISTS ielts_profiles (
  user_id INTEGER PRIMARY KEY,
  exam_date TEXT,
  target_listening REAL,
  target_reading REAL,
  target_writing REAL,
  target_speaking REAL,
  quit_reason TEXT,
  setup_done INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  question_id TEXT,
  attempt_id INTEGER,
  skill TEXT,
  question_type TEXT,
  error_code TEXT NOT NULL,
  evidence TEXT,
  missed_keyword TEXT,
  time_spent_sec INTEGER,
  guessed INTEGER DEFAULT 0,
  review_due TEXT,
  review_stage INTEGER DEFAULT 0,
  resolved INTEGER DEFAULT 0,
  last_review_correct INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS monster_state (
  user_id INTEGER,
  error_code TEXT,
  hits INTEGER DEFAULT 0,
  killed INTEGER DEFAULT 0,
  killed_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (user_id, error_code)
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  date TEXT,
  minutes INTEGER,
  module TEXT,
  goal_completed INTEGER DEFAULT 0,
  exam TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS mock_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  kind TEXT,
  exam TEXT DEFAULT 'ielts',
  test_set_id TEXT,
  attempt_id INTEGER,
  listening_correct INTEGER,
  reading_correct INTEGER,
  listening_band REAL,
  reading_band REAL,
  overall_band REAL,
  duration_sec INTEGER,
  valid INTEGER DEFAULT 1,
  ability_map TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  week_start TEXT,
  focus_type TEXT,
  focus_code TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS writing_tasks (
  id TEXT PRIMARY KEY,
  task_type TEXT,
  prompt_type TEXT,
  topic TEXT,
  prompt TEXT,
  chart_data TEXT,
  is_sample INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS writing_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  task_id TEXT,
  content TEXT,
  word_count INTEGER,
  duration_sec INTEGER,
  self_scores TEXT,
  is_baseline INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS speaking_prompts (
  id TEXT PRIMARY KEY,
  part INTEGER,
  topic TEXT,
  prompt TEXT,
  cue_card TEXT,
  is_sample INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS speaking_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  prompt_id TEXT,
  part INTEGER,
  audio_data TEXT,
  mime_type TEXT,
  duration_sec INTEGER,
  is_baseline INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_error_log_user_due ON error_log(user_id, review_due, resolved);
CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON sessions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_mock_tests_user_kind ON mock_tests(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_writing_sub_user ON writing_submissions(user_id, id);
CREATE INDEX IF NOT EXISTS idx_speaking_rec_user ON speaking_recordings(user_id, id);
CREATE INDEX IF NOT EXISTS idx_questions_part ON questions(part);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_xp_user_created ON xp_events(user_id, created_at);
`;

function initDb() {
  db.exec(SCHEMA);
  // DB cu da ton tai truoc khi co cot test_set_id: them cot neu chua co.
  ensureColumn('questions', 'test_set_id', 'TEXT');
  ensureColumn('questions', 'image_url', 'TEXT');
  ensureColumn('questions', 'audio_url', 'TEXT');
  ensureColumn('questions', 'question_type', 'TEXT');
  ensureColumn('questions', 'word_limit', 'INTEGER');
  ensureColumn('questions', 'accepted_answers', 'TEXT');
  ensureColumn('questions', 'correct_text', 'TEXT');
  ensureColumn('test_sets', 'exam', "TEXT DEFAULT 'toeic'");
  ensureColumn('attempts', 'exam', "TEXT DEFAULT 'toeic'");
  ensureColumn('attempts', 'listening_band', 'REAL');
  ensureColumn('attempts', 'reading_band', 'REAL');
  ensureColumn('attempts', 'overall_band', 'REAL');
  ensureColumn('passages', 'exam', 'TEXT');
  ensureColumn('passages', 'passage_type', 'TEXT');
  ensureColumn('vocabulary', 'exam', "TEXT DEFAULT 'toeic'");
  ensureColumn('passages', 'test_set_id', 'TEXT');
  ensureColumn('passages', 'audio_url', 'TEXT');
  ensureColumn('attempts', 'test_set_id', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_questions_testset_part ON questions(test_set_id, part)');
}

/** Them cot vao bang neu chua ton tai (guard bang PRAGMA table_info). */
function ensureColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/* ---------------- row mapping ---------------- */

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role || 'user',
    targetScore: row.target_score != null ? row.target_score : 650,
    googleId: row.google_id || null,
    avatarUrl: row.avatar_url || null,
    hideOnLeaderboard: row.hide_on_leaderboard === 1,
    createdAt: row.created_at,
  };
}

function mapQuestion(row, opts, passage) {
  return {
    id: row.id,
    exam: row.exam || 'toeic',
    part: row.part,
    passageId: row.passage_id || null,
    testSetId: row.test_set_id || null,
    passageTitle: (passage && passage.title) || null,
    passageText: (passage && passage.content) || row.passage_text || null,
    script: (passage && passage.script) || row.script || null,
    content: row.content,
    topic: row.topic || null,
    difficulty: row.difficulty || null,
    imageUrl: row.image_url || null,
    audioUrl: row.audio_url || (passage && passage.audio_url) || null,
    questionType: row.question_type || 'multiple_choice',
    wordLimit: row.word_limit != null ? row.word_limit : null,
    options: (opts || []).map((o) => ({ label: o.label, content: o.content })),
  };
}

function parseAcceptedAnswersField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function mapQuestionAdmin(row, opts, passage) {
  const base = mapQuestion(row, opts, passage);
  const correct = (opts || []).find((o) => o.is_correct === 1);
  return {
    ...base,
    explanation: row.explanation || null,
    correct: correct ? correct.label : null,
    correctText: row.correct_text || null,
    acceptedAnswers: parseAcceptedAnswersField(row.accepted_answers),
    options: (opts || []).map((o) => ({
      label: o.label,
      content: o.content,
      isCorrect: o.is_correct === 1,
    })),
  };
}

function mapAttempt(row) {
  if (!row) return null;
  let questionIds = [];
  try {
    questionIds = row.question_ids ? JSON.parse(row.question_ids) : [];
  } catch (_) {
    questionIds = [];
  }
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    part: row.part,
    testSetId: row.test_set_id || null,
    questionIds,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationSec: row.duration_sec,
    listeningCorrect: row.listening_correct,
    readingCorrect: row.reading_correct,
    listeningScore: row.listening_score,
    readingScore: row.reading_score,
    totalScore: row.total_score,
    xpEarned: row.xp_earned,
    leaderboardEligible: row.leaderboard_eligible === 1,
    exam: row.exam || 'toeic',
    listeningBand: row.listening_band != null ? row.listening_band : null,
    readingBand: row.reading_band != null ? row.reading_band : null,
    overallBand: row.overall_band != null ? row.overall_band : null,
  };
}

/** Lay options cho mot tap question_id (tra ve Map question_id -> [options]). */
function optionsByQuestionIds(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT question_id, label, content, is_correct FROM options WHERE question_id IN (${placeholders}) ORDER BY question_id, label`
    )
    .all(...ids);
  for (const r of rows) {
    if (!map.has(r.question_id)) map.set(r.question_id, []);
    map.get(r.question_id).push(r);
  }
  return map;
}

function passagesByIds(ids) {
  const map = new Map();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return map;
  const placeholders = uniq.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, part, title, content, script, type, audio_url FROM passages WHERE id IN (${placeholders})`)
    .all(...uniq);
  for (const r of rows) map.set(r.id, r);
  return map;
}

/** Ghep cau hoi + options + passage thanh doi tuong day du. */
function hydrateQuestions(rows, admin) {
  const ids = rows.map((r) => r.id);
  const optMap = optionsByQuestionIds(ids);
  const passMap = passagesByIds(rows.map((r) => r.passage_id));
  return rows.map((r) =>
    admin
      ? mapQuestionAdmin(r, optMap.get(r.id) || [], passMap.get(r.passage_id))
      : mapQuestion(r, optMap.get(r.id) || [], passMap.get(r.passage_id))
  );
}

/* ---------------- users ---------------- */

function createUser({ email, passwordHash, name, role, googleId, avatarUrl }) {
  const stmt = db.prepare(
    'INSERT INTO users (email, password_hash, name, role, google_id, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const info = stmt.run(
    email,
    passwordHash || null,
    name || null,
    role || 'user',
    googleId || null,
    avatarUrl || null,
    nowIso()
  );
  return findUserById(Number(info.lastInsertRowid));
}

function findUserByEmail(email) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  return row || null; // tra ve row tho (gom password_hash) — chi dung noi bo
}

function findUserById(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return row || null;
}

function findUserByGoogleId(googleId) {
  const row = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
  return row || null;
}

function updateUserProfile(id, { name, targetScore, hideOnLeaderboard, avatarUrl }) {
  const cur = findUserById(id);
  if (!cur) return null;
  db.prepare(
    'UPDATE users SET name = ?, target_score = ?, hide_on_leaderboard = ?, avatar_url = ? WHERE id = ?'
  ).run(
    name !== undefined ? name : cur.name,
    targetScore !== undefined ? targetScore : cur.target_score,
    hideOnLeaderboard !== undefined ? (hideOnLeaderboard ? 1 : 0) : cur.hide_on_leaderboard,
    avatarUrl !== undefined ? avatarUrl : cur.avatar_url,
    id
  );
  return findUserById(id);
}

function updateUserPassword(id, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function linkGoogleAccount(id, googleId, avatarUrl) {
  const cur = findUserById(id);
  db.prepare('UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?').run(
    googleId,
    avatarUrl || cur.avatar_url,
    id
  );
  return findUserById(id);
}

function countUsers() {
  return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
}

function countAdmins() {
  return db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
}

/** Admin cap nhat tai khoan: ten, quyen, target_score, an tren bang xep hang. */
function adminUpdateUser(id, { name, role, targetScore, hideOnLeaderboard }) {
  const cur = findUserById(id);
  if (!cur) return null;
  db.prepare(
    'UPDATE users SET name = ?, role = ?, target_score = ?, hide_on_leaderboard = ? WHERE id = ?'
  ).run(
    name !== undefined ? name : cur.name,
    role !== undefined ? role : cur.role,
    targetScore !== undefined ? targetScore : cur.target_score,
    hideOnLeaderboard !== undefined ? (hideOnLeaderboard ? 1 : 0) : cur.hide_on_leaderboard,
    id
  );
  return findUserById(id);
}

/**
 * Xoa THAT 1 tai khoan cung toan bo du lieu hoc cua ho (attempts + answers,
 * cau sai, tu vung ca nhan, xp, error log, monster, sessions, mock tests,
 * plan, ielts profile, bai viet/noi). Tat ca trong 1 transaction.
 */
function deleteUser(id) {
  return transaction(() => {
    const attemptIds = db
      .prepare('SELECT id FROM attempts WHERE user_id = ?')
      .all(id)
      .map((r) => r.id);
    if (attemptIds.length) {
      const placeholders = attemptIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM answers WHERE attempt_id IN (${placeholders})`).run(...attemptIds);
    }
    db.prepare('DELETE FROM attempts WHERE user_id = ?').run(id);
    for (const table of [
      'wrong_questions',
      'user_vocabulary',
      'xp_events',
      'ielts_profiles',
      'error_log',
      'monster_state',
      'sessions',
      'mock_tests',
      'plan',
      'writing_submissions',
      'speaking_recordings',
    ]) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id);
    }
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return info.changes > 0;
  });
}

/* ---------------- passages ---------------- */

function upsertPassage({ id, part, title, content, script, type, testSetId, audioUrl, exam, passageType }) {
  db.prepare(
    `INSERT INTO passages (id, part, title, content, script, type, test_set_id, audio_url, exam, passage_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET part = excluded.part, title = excluded.title,
       content = excluded.content, script = excluded.script, type = excluded.type,
       test_set_id = excluded.test_set_id,
       audio_url = COALESCE(excluded.audio_url, passages.audio_url),
       exam = COALESCE(excluded.exam, passages.exam),
       passage_type = COALESCE(excluded.passage_type, passages.passage_type)`
  ).run(id, part || null, title || null, content || null, script || null, type || null, testSetId || null, audioUrl || null, exam || null, passageType || null);
}

function getPassage(id) {
  const row = db.prepare('SELECT * FROM passages WHERE id = ?').get(id);
  if (!row) return null;
  const qids = db
    .prepare('SELECT id FROM questions WHERE passage_id = ? ORDER BY id')
    .all(id)
    .map((r) => r.id);
  return {
    id: row.id,
    part: row.part,
    title: row.title,
    content: row.content,
    script: row.script,
    type: row.type,
    audioUrl: row.audio_url || null,
    exam: row.exam || null,
    passageType: row.passage_type || null,
    questionIds: qids,
  };
}

/** Cap nhat audio cho 1 doan van (Part 3/4/6/7). Tra ve null neu khong co doan. */
function updatePassageMedia(id, { audioUrl }) {
  const cur = db.prepare('SELECT * FROM passages WHERE id = ?').get(id);
  if (!cur) return null;
  db.prepare('UPDATE passages SET audio_url = ? WHERE id = ?').run(
    audioUrl !== undefined ? audioUrl : cur.audio_url,
    id
  );
  return getPassage(id);
}

/* ---------------- questions ---------------- */

/**
 * Chen 1 cau hoi (seed-format) kem 4 phuong an. Neu co passageId + thong tin
 * doan thi upsert luon passage. Dung trong transaction de khong nua voi.
 * @param {object} q {id, part, passageId, passageTitle, passageText, script, content, explanation, topic, difficulty, options:[{label,content}], correct}
 */
function insertQuestion(q) {
  return transaction(() => insertQuestionTx(q));
}

/** Chen 1 cau hoi, KHONG tu mo transaction (dung trong import transaction chung). */
function insertQuestionTx(q) {
  if (q.passageId && (q.passageText || q.passageTitle || q.script)) {
    upsertPassage({
      id: q.passageId,
      part: q.part,
      title: q.passageTitle || null,
      content: q.passageText || null,
      script: q.script || null,
      type: q.part <= 4 ? 'listening' : 'reading',
      testSetId: q.testSetId || null,
      exam: q.exam || 'toeic',
      passageType: q.passageType || null,
    });
  }
  db.prepare(
    `INSERT INTO questions (id, exam, part, passage_id, test_set_id, content, explanation, topic, difficulty, script, passage_text, image_url, audio_url, question_type, word_limit, accepted_answers, correct_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    q.id,
    q.exam || 'toeic',
    q.part,
    q.passageId || null,
    q.testSetId || null,
    q.content,
    q.explanation || null,
    q.topic || null,
    q.difficulty || null,
    q.script || null,
    q.passageText || null,
    q.imageUrl || null,
    q.audioUrl || null,
    q.questionType || 'multiple_choice',
    q.wordLimit != null ? q.wordLimit : null,
    Array.isArray(q.acceptedAnswers) ? JSON.stringify(q.acceptedAnswers) : (typeof q.acceptedAnswers === 'string' ? q.acceptedAnswers : null),
    q.correctText != null ? q.correctText : null
  );
  const optStmt = db.prepare(
    'INSERT INTO options (question_id, label, content, is_correct) VALUES (?, ?, ?, ?)'
  );
  // correct co the la mang nhan (list_selection: ["A","C"]) — danh dau
  // is_correct=1 cho moi nhan trong mang; dang chuoi cu giu nguyen.
  const correctLabels = Array.isArray(q.correct)
    ? q.correct.map((c) => String(c).toUpperCase())
    : [q.correct];
  for (const o of (q.options || [])) {
    optStmt.run(q.id, o.label, o.content, correctLabels.includes(o.label) ? 1 : 0);
  }
}

function updateQuestion(id, fields) {
  const cur = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  if (!cur) return null;
  return transaction(() => {
    if (fields.passageId && (fields.passageText || fields.passageTitle || fields.script)) {
      upsertPassage({
        id: fields.passageId,
        part: fields.part !== undefined ? fields.part : cur.part,
        title: fields.passageTitle || null,
        content: fields.passageText || null,
        script: fields.script || null,
        type: (fields.part !== undefined ? fields.part : cur.part) <= 4 ? 'listening' : 'reading',
        exam: fields.exam !== undefined ? fields.exam : cur.exam,
        passageType: fields.passageType !== undefined ? fields.passageType : cur.passage_type,
      });
    }
    db.prepare(
      `UPDATE questions SET exam = ?, part = ?, passage_id = ?, content = ?, explanation = ?,
       topic = ?, difficulty = ?, script = ?, passage_text = ?, image_url = ?, audio_url = ?,
       question_type = ?, word_limit = ?, accepted_answers = ?, correct_text = ? WHERE id = ?`
    ).run(
      fields.exam !== undefined ? fields.exam : cur.exam,
      fields.part !== undefined ? fields.part : cur.part,
      fields.passageId !== undefined ? fields.passageId : cur.passage_id,
      fields.content !== undefined ? fields.content : cur.content,
      fields.explanation !== undefined ? fields.explanation : cur.explanation,
      fields.topic !== undefined ? fields.topic : cur.topic,
      fields.difficulty !== undefined ? fields.difficulty : cur.difficulty,
      fields.script !== undefined ? fields.script : cur.script,
      fields.passageText !== undefined ? fields.passageText : cur.passage_text,
      fields.imageUrl !== undefined ? fields.imageUrl : cur.image_url,
      fields.audioUrl !== undefined ? fields.audioUrl : cur.audio_url,
      fields.questionType !== undefined ? fields.questionType : cur.question_type,
      fields.wordLimit !== undefined ? fields.wordLimit : cur.word_limit,
      fields.acceptedAnswers !== undefined
        ? (Array.isArray(fields.acceptedAnswers) ? JSON.stringify(fields.acceptedAnswers) : fields.acceptedAnswers)
        : cur.accepted_answers,
      fields.correctText !== undefined ? fields.correctText : cur.correct_text,
      id
    );
    if (Array.isArray(fields.options)) {
      db.prepare('DELETE FROM options WHERE question_id = ?').run(id);
      const optStmt = db.prepare(
        'INSERT INTO options (question_id, label, content, is_correct) VALUES (?, ?, ?, ?)'
      );
      // correct co the la mang nhan (list_selection) — nhu insertQuestionTx.
      const updCorrectLabels = Array.isArray(fields.correct)
        ? fields.correct.map((c) => String(c).toUpperCase())
        : [fields.correct];
      for (const o of fields.options) {
        optStmt.run(id, o.label, o.content, updCorrectLabels.includes(o.label) ? 1 : 0);
      }
    }
    return getQuestionById(id, true);
  });
}

function deleteQuestion(id) {
  return transaction(() => {
    db.prepare('DELETE FROM options WHERE question_id = ?').run(id);
    const info = db.prepare('DELETE FROM questions WHERE id = ?').run(id);
    return info.changes > 0;
  });
}

function getQuestionById(id, admin) {
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  if (!row) return null;
  return hydrateQuestions([row], !!admin)[0];
}

function getQuestionRowById(id) {
  // Row tho (gom dap an) cho logic cham diem noi bo.
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  if (!row) return null;
  const opts = db
    .prepare('SELECT label, content, is_correct FROM options WHERE question_id = ? ORDER BY label')
    .all(id);
  return { ...row, options: opts, acceptedAnswers: parseAcceptedAnswersField(row.accepted_answers) };
}

function countQuestions(exam) {
  if (exam) {
    return db.prepare('SELECT COUNT(*) AS c FROM questions WHERE exam = ?').get(exam).c;
  }
  return db.prepare('SELECT COUNT(*) AS c FROM questions').get().c;
}

function countByPart(exam) {
  if (exam) {
    const rows = db
      .prepare('SELECT part, COUNT(*) AS c FROM questions WHERE exam = ? GROUP BY part ORDER BY part')
      .all(exam);
    return rows.map((r) => ({ part: r.part, count: r.c }));
  }
  const rows = db
    .prepare('SELECT part, COUNT(*) AS c FROM questions GROUP BY part ORDER BY part')
    .all();
  return rows.map((r) => ({ part: r.part, count: r.c }));
}

function listQuestions({ part, limit, offset, search, admin, testSetId, exam }) {
  const where = [];
  const params = [];
  if (part) {
    where.push('part = ?');
    params.push(part);
  }
  if (exam) {
    where.push('exam = ?');
    params.push(exam);
  }
  if (testSetId) {
    where.push('test_set_id = ?');
    params.push(testSetId);
  }
  if (search) {
    where.push('(content LIKE ? OR topic LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM questions ${whereSql}`)
    .get(...params).c;
  const rows = db
    .prepare(
      `SELECT * FROM questions ${whereSql} ORDER BY part, id LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  return { total, items: hydrateQuestions(rows, !!admin) };
}

function getQuestionsByPart(part, exam) {
  if (exam) {
    const rows = db.prepare('SELECT * FROM questions WHERE part = ? AND exam = ? ORDER BY id').all(part, exam);
    return hydrateQuestions(rows, false);
  }
  const rows = db.prepare('SELECT * FROM questions WHERE part = ? ORDER BY id').all(part);
  return hydrateQuestions(rows, false);
}

function getAllQuestionsOrdered(exam) {
  if (exam) {
    const rows = db.prepare('SELECT * FROM questions WHERE exam = ? ORDER BY part, id').all(exam);
    return hydrateQuestions(rows, false);
  }
  const rows = db.prepare('SELECT * FROM questions ORDER BY part, id').all();
  return hydrateQuestions(rows, false);
}

function getAllQuestionsForBackup() {
  const rows = db.prepare('SELECT * FROM questions ORDER BY part, id').all();
  return hydrateQuestions(rows, true);
}

/* ---------------- test sets ---------------- */

function mapTestSet(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description || null,
    totalQuestions: row.total_questions != null ? row.total_questions : 0,
    isPublished: row.is_published === 1,
    exam: row.exam || 'toeic',
    createdAt: row.created_at,
  };
}

/** Id de tiep theo dang TS-NNN dua tren max id hien co. */
function nextTestSetId() {
  const rows = db.prepare("SELECT id FROM test_sets WHERE id LIKE 'TS-%'").all();
  let max = 0;
  for (const r of rows) {
    const m = /^TS-(\d+)$/.exec(r.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `TS-${String(max + 1).padStart(3, '0')}`;
}

function createTestSet({ id, title, description, isPublished, exam }) {
  const newId = id || nextTestSetId();
  db.prepare(
    'INSERT INTO test_sets (id, title, description, total_questions, is_published, exam, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)'
  ).run(newId, title, description || null, isPublished ? 1 : 0, exam || 'toeic', nowIso());
  return getTestSet(newId);
}

function getTestSet(id) {
  const row = db.prepare('SELECT * FROM test_sets WHERE id = ?').get(id);
  return mapTestSet(row);
}

function listTestSets({ includeDrafts, exam }) {
  const where = [];
  const params = [];
  if (!includeDrafts) where.push('is_published = 1');
  if (exam) {
    where.push('exam = ?');
    params.push(exam);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM test_sets ${whereSql} ORDER BY id`).all(...params).map(mapTestSet);
}

function updateTestSet(id, fields) {
  const cur = getTestSet(id);
  if (!cur) return null;
  db.prepare(
    'UPDATE test_sets SET title = ?, description = ?, is_published = ?, exam = ? WHERE id = ?'
  ).run(
    fields.title !== undefined ? fields.title : cur.title,
    fields.description !== undefined ? fields.description : cur.description,
    fields.isPublished !== undefined ? (fields.isPublished ? 1 : 0) : (cur.isPublished ? 1 : 0),
    fields.exam !== undefined ? fields.exam : cur.exam,
    id
  );
  return getTestSet(id);
}

function deleteTestSet(id) {
  // Xoa THAT bo de cung toan bo du lieu thuoc ve no (khop voi hop thoai
  // xac nhan o Admin "Xoa bo de cung toan bo cau hoi trong de?"):
  // options + cau hoi cua de, cac passage cua de (ke ca passage chi con
  // duoc cau hoi cua de nay tro toi), part_media, roi moi xoa dong test_sets.
  // Khong cham toi du lieu cua de khac. Tat ca trong 1 transaction.
  return transaction(() => {
    const qids = db
      .prepare('SELECT id, passage_id FROM questions WHERE test_set_id = ?')
      .all(id);
    const passageIds = [...new Set(qids.map((q) => q.passage_id).filter(Boolean))];
    if (qids.length) {
      const placeholders = qids.map(() => '?').join(',');
      const ids = qids.map((q) => q.id);
      db.prepare(`DELETE FROM options WHERE question_id IN (${placeholders})`).run(...ids);
      db.prepare(`DELETE FROM answers WHERE question_id IN (${placeholders})`).run(...ids);
      db.prepare(`DELETE FROM wrong_questions WHERE question_id IN (${placeholders})`).run(...ids);
    }
    db.prepare('DELETE FROM questions WHERE test_set_id = ?').run(id);
    // Passage cua de: xoa theo test_set_id, va ca passage ma cau hoi cua de
    // tro toi nhung khong con cau hoi nao khac tro toi nua.
    db.prepare('DELETE FROM passages WHERE test_set_id = ?').run(id);
    if (passageIds.length) {
      const placeholders = passageIds.map(() => '?').join(',');
      db.prepare(
        `DELETE FROM passages WHERE id IN (${placeholders})
         AND id NOT IN (SELECT passage_id FROM questions WHERE passage_id IS NOT NULL)`
      ).run(...passageIds);
    }
    db.prepare('DELETE FROM part_media WHERE test_set_id = ?').run(id);
    const info = db.prepare('DELETE FROM test_sets WHERE id = ?').run(id);
    return info.changes > 0;
  });
}

/** Cap nhat total_questions = so cau hien co cua de. */
function refreshTestSetTotal(testSetId) {
  db.prepare(
    'UPDATE test_sets SET total_questions = (SELECT COUNT(*) FROM questions WHERE test_set_id = ?) WHERE id = ?'
  ).run(testSetId, testSetId);
}

function countByPartForTestSet(testSetId) {
  const rows = db
    .prepare(
      'SELECT part, COUNT(*) AS c FROM questions WHERE test_set_id = ? GROUP BY part ORDER BY part'
    )
    .all(testSetId);
  return rows.map((r) => ({ part: r.part, count: r.c }));
}

/**
 * Tien do cua user trong 1 de: dem tu answers JOIN attempts JOIN questions,
 * chi tinh cau co test_set_id = de do. answered = so cau distinct da tra loi
 * (is_correct NOT NULL), correct = so cau distinct tra loi dung.
 */
function getUserProgressByTestSet(userId, testSetId) {
  const rows = db
    .prepare(
      `SELECT q.part AS part,
              COUNT(DISTINCT a.question_id) AS answered,
              COUNT(DISTINCT CASE WHEN a.is_correct = 1 THEN a.question_id END) AS correct
       FROM answers a
       JOIN attempts t ON t.id = a.attempt_id
       JOIN questions q ON q.id = a.question_id
       WHERE t.user_id = ? AND q.test_set_id = ? AND a.is_correct IS NOT NULL
       GROUP BY q.part ORDER BY q.part`
    )
    .all(userId, testSetId);
  return rows.map((r) => ({ part: r.part, answered: r.answered, correct: r.correct }));
}

/**
 * Kiem tra 1 cau import. Tra ve null neu hop le, neu khong tra ly do loi tieng Viet.
 * Cau chi-nghe (Part 1/2): de thi that KHONG in noi dung cau hoi/phuong an
 * (Part 1 chi co anh + 4 cau noi trong audio, Part 2 chi co cau hoi + 3 cau
 * tra loi trong audio) nen cho phep content rong va options rong (chi can
 * nhan). Part 2 co dung 3 phuong an (A, B, C). Dap an dung van bat buoc khi
 * import/luu chinh thuc — dap an trong thi cau van bi liet vao `invalid`
 * o buoc parse (xem aiParse.js).
 * @param {object} q cau hoi dang seed-format
 * @param {number} index vi tri cau trong mang import (chi de bao loi)
 */
function validateImportQuestion(q, index) {
  if (!q || typeof q !== 'object') return 'Câu hỏi không hợp lệ';
  if (!Number.isInteger(q.part) || q.part < 1 || q.part > 7) {
    return 'Part phải là số nguyên từ 1 đến 7';
  }
  // Nhanh IELTS: exam === 'ielts' (question_type mac dinh multiple_choice).
  if (q.exam === 'ielts') return validateIeltsImportQuestion(q);
  const listeningOnly = q.part === 1 || q.part === 2;
  const expectedLabels = q.part === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
  if (!listeningOnly && (typeof q.content !== 'string' || !q.content.trim())) {
    return 'Thiếu nội dung câu hỏi';
  }
  if (!Array.isArray(q.options) || q.options.length !== expectedLabels.length) {
    return q.part === 2
      ? 'Part 2 phải có đúng 3 phương án'
      : 'Phải có đúng 4 phương án';
  }
  const labels = q.options.map((o) => o && o.label);
  if (
    new Set(labels).size !== expectedLabels.length ||
    !labels.every((l) => expectedLabels.includes(l))
  ) {
    return q.part === 2
      ? 'Các phương án Part 2 phải có đủ nhãn A, B, C và không trùng nhau'
      : 'Các phương án phải có đủ nhãn A, B, C, D và không trùng nhau';
  }
  if (
    !listeningOnly &&
    q.options.some((o) => !o || typeof o.content !== 'string' || !o.content.trim())
  ) {
    return 'Mỗi phương án phải có nội dung';
  }
  if (typeof q.correct !== 'string' || !expectedLabels.includes(q.correct)) {
    return q.part === 2
      ? 'Đáp án đúng phải là một trong 3 nhãn A, B, C'
      : 'Đáp án đúng phải là một trong 4 nhãn A, B, C, D';
  }
  return null;
}

/**
 * Kiem tra 1 cau IELTS (exam === 'ielts'). Tra ve null neu hop le.
 * - Dang dien tu (form/sentence/summary completion, short_answer): options
 *   rong duoc phep, bat buoc correct_text (string non-empty); word_limit neu
 *   co phai la so nguyen duong.
 * - Dang chon/nn: options phai dung nhan theo quy uoc tung dang va correct
 *   phai thuoc cac nhan do.
 */
const IELTS_TYPES = [
  'multiple_choice', 'true_false_not_given', 'yes_no_not_given',
  'matching_headings', 'matching_information', 'matching_features',
  'matching', 'labelling', 'form_completion', 'sentence_completion',
  'summary_completion', 'short_answer',
  'note_completion', 'table_completion', 'flow_chart_completion',
  'diagram_completion', 'matching_sentence_endings', 'list_selection',
  'choosing_title',
];
const IELTS_TYPED_TYPES = ['form_completion', 'sentence_completion', 'summary_completion', 'short_answer', 'note_completion', 'table_completion', 'flow_chart_completion', 'diagram_completion'];

function romanNumeral(n) {
  const table = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  let rest = n;
  for (const [value, sym] of table) {
    while (rest >= value) { out += sym; rest -= value; }
  }
  return out;
}

function validateIeltsImportQuestion(q) {
  const type = q.questionType || 'multiple_choice';
  if (!IELTS_TYPES.includes(type)) return 'question_type IELTS không hợp lệ';
  const listeningOnly = q.part === 1 || q.part === 2;
  if (!listeningOnly && (typeof q.content !== 'string' || !q.content.trim())) {
    return 'Thiếu nội dung câu hỏi';
  }
  if (q.wordLimit !== undefined && q.wordLimit !== null) {
    if (!Number.isInteger(q.wordLimit) || q.wordLimit <= 0) {
      return 'word_limit phải là số nguyên dương';
    }
  }
  if (IELTS_TYPED_TYPES.includes(type)) {
    if (typeof q.correctText !== 'string' || !q.correctText.trim()) {
      return 'Câu điền từ phải có correct_text';
    }
    if (q.options !== undefined && q.options !== null && !Array.isArray(q.options)) {
      return 'options của câu điền từ phải là mảng (có thể rỗng)';
    }
    return null;
  }
  // list_selection: chon 2-3 nhan, dap an dung la MANG cac nhan (vd ["A","C"]).
  if (type === 'list_selection') {
    if (!Array.isArray(q.options) || q.options.length < 5 || q.options.length > 7) {
      return 'Câu list selection phải có từ 5 đến 7 phương án';
    }
    const lsLabels = q.options.map((_, i) => String.fromCharCode(65 + i));
    const lsActual = q.options.map((o) => o && o.label);
    if (
      new Set(lsActual).size !== lsLabels.length ||
      !lsActual.every((l, i) => l === lsLabels[i])
    ) {
      return `Các phương án phải có đủ nhãn ${lsLabels.join(', ')} theo đúng thứ tự`;
    }
    if (q.options.some((o) => !o || typeof o.content !== 'string' || !o.content.trim())) {
      return 'Mỗi phương án phải có nội dung';
    }
    if (!Array.isArray(q.correct) || q.correct.length < 2 || q.correct.length > 3) {
      return 'Đáp án đúng của list selection phải là mảng 2–3 nhãn';
    }
    const upper = q.correct.map((c) => (typeof c === 'string' ? c.toUpperCase() : c));
    if (
      new Set(upper).size !== upper.length ||
      !upper.every((l) => lsLabels.includes(l))
    ) {
      return 'Đáp án đúng của list selection phải là 2–3 nhãn khác nhau thuộc các phương án';
    }
    return null;
  }
  // Dang chon/noi: can options dung nhan.
  if (!Array.isArray(q.options) || q.options.length < 2) {
    return 'Câu IELTS dạng chọn/nối phải có ít nhất 2 phương án';
  }
  let expectedLabels;
  if (type === 'true_false_not_given') {
    expectedLabels = ['TRUE', 'FALSE', 'NOT GIVEN'];
  } else if (type === 'yes_no_not_given') {
    expectedLabels = ['YES', 'NO', 'NOT GIVEN'];
  } else if (type === 'matching_headings') {
    expectedLabels = q.options.map((_, i) => romanNumeral(i + 1));
  } else if (type === 'multiple_choice') {
    if (q.options.length !== 3 && q.options.length !== 4) {
      return 'Câu multiple choice IELTS phải có 3 hoặc 4 phương án';
    }
    expectedLabels = ['A', 'B', 'C', 'D'].slice(0, q.options.length);
  } else if (type === 'choosing_title') {
    // Giong multiple_choice: 3-4 phuong an A-D, 1 dap an dung.
    if (q.options.length !== 3 && q.options.length !== 4) {
      return 'Câu choosing title phải có 3 hoặc 4 phương án';
    }
    expectedLabels = ['A', 'B', 'C', 'D'].slice(0, q.options.length);
  } else if (type === 'matching_sentence_endings') {
    // Giong matching: nhan A.. theo so phuong an, 1 dap an dung.
    expectedLabels = q.options.map((_, i) => String.fromCharCode(65 + i));
  } else {
    // matching_information (A..G), matching_features (A..C), matching, labelling (A..F)
    expectedLabels = q.options.map((_, i) => String.fromCharCode(65 + i));
  }
  const labels = q.options.map((o) => o && o.label);
  if (
    new Set(labels).size !== expectedLabels.length ||
    !labels.every((l, i) => l === expectedLabels[i])
  ) {
    return `Các phương án phải có đủ nhãn ${expectedLabels.join(', ')} theo đúng thứ tự`;
  }
  if (q.options.some((o) => !o || typeof o.content !== 'string' || !o.content.trim())) {
    return 'Mỗi phương án phải có nội dung';
  }
  if (typeof q.correct !== 'string' || !expectedLabels.includes(q.correct)) {
    return `Đáp án đúng phải là một trong các nhãn ${expectedLabels.join(', ')}`;
  }
  return null;
}

/**
 * Import nhieu cau vao 1 de trong 1 transaction. Cau loi bi bo qua va ghi vao
 * errors; cau trung id cung bi bo qua. Tra ve {imported, errors}.
 */
function importTestSetQuestions(testSetId, questions) {
  let imported = 0;
  const errors = [];
  transaction(() => {
    (questions || []).forEach((q, index) => {
      const err = validateImportQuestion(q, index);
      if (err) {
        errors.push({ index, id: q && q.id ? q.id : null, reason: err });
        return;
      }
      if (db.prepare('SELECT 1 FROM questions WHERE id = ?').get(q.id)) {
        errors.push({ index, id: q.id, reason: 'ID câu hỏi đã tồn tại' });
        return;
      }
      try {
        insertQuestionTx({ ...q, testSetId });
        imported += 1;
      } catch (e) {
        errors.push({ index, id: q.id, reason: e.message });
      }
    });
    refreshTestSetTotal(testSetId);
  });
  return { imported, errors };
}

/** Them 1 cau vao de (them thu cong). Loi thi throw Error tieng Viet. */
function addQuestionToTestSet(testSetId, q) {
  const err = validateImportQuestion(q, 0);
  if (err) throw new Error(err);
  if (!q.id || typeof q.id !== 'string' || !q.id.trim()) {
    throw new Error('Thiếu ID câu hỏi');
  }
  if (db.prepare('SELECT 1 FROM questions WHERE id = ?').get(q.id)) {
    throw new Error('ID câu hỏi đã tồn tại');
  }
  transaction(() => {
    insertQuestionTx({ ...q, testSetId });
    refreshTestSetTotal(testSetId);
  });
  return getQuestionById(q.id, true);
}

/* ---------------- part media (audio cap Part) ---------------- */

/**
 * Audio cap Part: 1 file audio cho TOAN BO 1 Part (Part 1-4 moi Part 1 file).
 * Tra ve object {[part]: audioUrl} chi gom cac Part da co audio,
 * vd {1: "https://...", 3: "https://..."}.
 */
function getPartMedia(testSetId) {
  const rows = db
    .prepare('SELECT part, audio_url FROM part_media WHERE test_set_id = ? ORDER BY part')
    .all(testSetId);
  const out = {};
  for (const r of rows) out[r.part] = r.audio_url;
  return out;
}

/** Luu (upsert) audio cho 1 Part cua 1 de. */
function setPartMedia(testSetId, part, audioUrl) {
  db.prepare(
    `INSERT INTO part_media (test_set_id, part, audio_url) VALUES (?, ?, ?)
     ON CONFLICT(test_set_id, part) DO UPDATE SET audio_url = excluded.audio_url`
  ).run(testSetId, part, audioUrl);
  return { part, audioUrl };
}

/* ---------------- attempts & answers ---------------- */

function createAttempt({ userId, mode, part, questionIds, durationSec, testSetId, exam }) {
  const info = db
    .prepare(
      `INSERT INTO attempts (user_id, mode, part, test_set_id, question_ids, started_at, duration_sec, leaderboard_eligible, exam)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      userId,
      mode,
      part || null,
      testSetId || null,
      JSON.stringify(questionIds || []),
      nowIso(),
      durationSec || null,
      exam || 'toeic'
    );
  return getAttempt(Number(info.lastInsertRowid));
}

function getAttempt(id) {
  const row = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
  return mapAttempt(row);
}

function listAttemptsByUser(userId, { modes, limit, exam }) {
  let sql = 'SELECT * FROM attempts WHERE user_id = ?';
  const params = [userId];
  if (modes && modes.length) {
    sql += ` AND mode IN (${modes.map(() => '?').join(',')})`;
    params.push(...modes);
  }
  if (exam) {
    sql += ' AND exam = ?';
    params.push(exam);
  }
  sql += ' ORDER BY started_at DESC LIMIT ?';
  params.push(limit || 50);
  return db.prepare(sql).all(...params).map(mapAttempt);
}

function finishAttempt(id, fields) {
  db.prepare(
    `UPDATE attempts SET finished_at = ?, duration_sec = ?, listening_correct = ?,
     reading_correct = ?, listening_score = ?, reading_score = ?, total_score = ?,
     xp_earned = ?, leaderboard_eligible = ?,
     listening_band = ?, reading_band = ?, overall_band = ? WHERE id = ?`
  ).run(
    fields.finishedAt,
    fields.durationSec,
    fields.listeningCorrect != null ? fields.listeningCorrect : null,
    fields.readingCorrect != null ? fields.readingCorrect : null,
    fields.listeningScore != null ? fields.listeningScore : null,
    fields.readingScore != null ? fields.readingScore : null,
    fields.totalScore != null ? fields.totalScore : null,
    fields.xpEarned != null ? fields.xpEarned : null,
    fields.leaderboardEligible ? 1 : 0,
    fields.listeningBand != null ? fields.listeningBand : null,
    fields.readingBand != null ? fields.readingBand : null,
    fields.overallBand != null ? fields.overallBand : null,
    id
  );
  return getAttempt(id);
}

/** Hủy bài thi chưa nộp (nút Thoát ở MockTest): xóa đáp án đã lưu + attempt.
    Bài đã nộp rồi thì không hủy được (đã có kết quả + XP). */
function deleteAttempt(id) {
  const cur = getAttempt(id);
  if (!cur) return false;
  return transaction(() => {
    db.prepare('DELETE FROM answers WHERE attempt_id = ?').run(id);
    db.prepare('DELETE FROM attempts WHERE id = ?').run(id);
    return true;
  })();
}

function countAttempts() {
  return db.prepare('SELECT COUNT(*) AS c FROM attempts').get().c;
}

function upsertAnswer(attemptId, questionId, selected, isCorrect) {
  db.prepare(
    `INSERT INTO answers (attempt_id, question_id, selected, is_correct) VALUES (?, ?, ?, ?)
     ON CONFLICT(attempt_id, question_id) DO UPDATE SET selected = excluded.selected,
       is_correct = excluded.is_correct`
  ).run(attemptId, questionId, selected, isCorrect == null ? null : isCorrect ? 1 : 0);
}

function getAnswersByAttempt(attemptId) {
  return db
    .prepare(
      `SELECT a.question_id AS questionId, a.selected, a.is_correct AS isCorrect,
              q.part AS part
       FROM answers a LEFT JOIN questions q ON q.id = a.question_id
       WHERE a.attempt_id = ? ORDER BY q.part, a.question_id`
    )
    .all(attemptId)
    .map((r) => ({
      questionId: r.questionId,
      selected: r.selected,
      isCorrect: r.isCorrect == null ? null : r.isCorrect === 1,
      part: r.part,
    }));
}

function getUserAnswerStats(userId, exam) {
  let sql = `SELECT q.part AS part, COUNT(*) AS answered,
              COALESCE(SUM(a.is_correct), 0) AS correct
       FROM answers a
       JOIN questions q ON q.id = a.question_id
       JOIN attempts t ON t.id = a.attempt_id
       WHERE t.user_id = ? AND a.is_correct IS NOT NULL`;
  const params = [userId];
  if (exam) {
    sql += ' AND q.exam = ?';
    params.push(exam);
  }
  sql += ' GROUP BY q.part ORDER BY q.part';
  const rows = db.prepare(sql).all(...params);
  return rows.map((r) => ({
    part: r.part,
    answered: r.answered,
    correct: r.correct,
  }));
}

/** Thong ke theo dang cau hoi (IELTS): [{questionType, answered, correct}]. */
function getUserAnswerStatsByType(userId, exam) {
  let sql = `SELECT COALESCE(q.question_type, 'multiple_choice') AS questionType,
              COUNT(*) AS answered,
              COALESCE(SUM(a.is_correct), 0) AS correct
       FROM answers a
       JOIN questions q ON q.id = a.question_id
       JOIN attempts t ON t.id = a.attempt_id
       WHERE t.user_id = ? AND a.is_correct IS NOT NULL`;
  const params = [userId];
  if (exam) {
    sql += ' AND q.exam = ?';
    params.push(exam);
  }
  sql += ' GROUP BY questionType ORDER BY answered DESC';
  return db.prepare(sql).all(...params).map((r) => ({
    questionType: r.questionType,
    answered: r.answered,
    correct: r.correct,
  }));
}

function countAnsweredByUser(userId, exam) {
  if (exam) {
    return db
      .prepare(
        `SELECT COUNT(*) AS c FROM answers a JOIN attempts t ON t.id = a.attempt_id
         JOIN questions q ON q.id = a.question_id
         WHERE t.user_id = ? AND a.is_correct IS NOT NULL AND q.exam = ?`
      )
      .get(userId, exam).c;
  }
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM answers a JOIN attempts t ON t.id = a.attempt_id
       WHERE t.user_id = ? AND a.is_correct IS NOT NULL`
    )
    .get(userId).c;
}

function getActivityStartedAt(userId) {
  // Tra ve danh sach started_at (text ISO) — tach ngay theo UTC bang JS.
  return db
    .prepare('SELECT started_at FROM attempts WHERE user_id = ? ORDER BY started_at')
    .all(userId)
    .map((r) => r.started_at)
    .filter(Boolean);
}

function getRecentFullScores(userId, limit) {
  return db
    .prepare(
      `SELECT finished_at, total_score FROM attempts
       WHERE user_id = ? AND mode = 'full' AND total_score IS NOT NULL
       ORDER BY finished_at DESC LIMIT ?`
    )
    .all(userId, limit || 20)
    .map((r) => ({ date: r.finished_at, totalScore: r.total_score }));
}

/** Lich su band cua cac bai full IELTS, moi nhat truoc. */
function getRecentFullBands(userId, limit) {
  return db
    .prepare(
      `SELECT finished_at, listening_band, reading_band, overall_band FROM attempts
       WHERE user_id = ? AND mode = 'full' AND exam = 'ielts' AND overall_band IS NOT NULL
       ORDER BY finished_at DESC LIMIT ?`
    )
    .all(userId, limit || 20)
    .map((r) => ({
      date: r.finished_at,
      listeningBand: r.listening_band,
      readingBand: r.reading_band,
      overallBand: r.overall_band,
    }));
}

/* ---------------- wrong questions ---------------- */

function upsertWrongQuestion(userId, questionId) {
  const ts = nowIso();
  db.prepare(
    `INSERT INTO wrong_questions (user_id, question_id, wrong_count, last_wrong_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       wrong_count = wrong_questions.wrong_count + 1, last_wrong_at = excluded.last_wrong_at`
  ).run(userId, questionId, ts);
}

function listWrongQuestions(userId, part, exam) {
  let sql = `SELECT w.question_id AS qid, w.wrong_count AS wrongCount,
                    w.last_wrong_at AS lastWrongAt, q.*
             FROM wrong_questions w JOIN questions q ON q.id = w.question_id
             WHERE w.user_id = ?`;
  const params = [userId];
  if (part) {
    sql += ' AND q.part = ?';
    params.push(part);
  }
  if (exam) {
    sql += ' AND q.exam = ?';
    params.push(exam);
  }
  sql += ' ORDER BY w.last_wrong_at DESC';
  const rows = db.prepare(sql).all(...params);
  const hydrated = hydrateQuestions(
    rows.map((r) => ({
      id: r.id,
      exam: r.exam,
      part: r.part,
      passage_id: r.passage_id,
      test_set_id: r.test_set_id,
      content: r.content,
      explanation: r.explanation,
      topic: r.topic,
      difficulty: r.difficulty,
      script: r.script,
      passage_text: r.passage_text,
      image_url: r.image_url,
      audio_url: r.audio_url,
      question_type: r.question_type,
      word_limit: r.word_limit,
      accepted_answers: r.accepted_answers,
      correct_text: r.correct_text,
    })),
    false
  );
  return hydrated.map((q, i) => ({
    ...q,
    wrongCount: rows[i].wrongCount,
    lastWrongAt: rows[i].lastWrongAt,
  }));
}

function deleteWrongQuestion(userId, questionId) {
  const info = db
    .prepare('DELETE FROM wrong_questions WHERE user_id = ? AND question_id = ?')
    .run(userId, questionId);
  return info.changes > 0;
}

/* ---------------- vocabulary ---------------- */

function countVocabulary() {
  return db.prepare('SELECT COUNT(*) AS c FROM vocabulary').get().c;
}

function listVocabulary({ topic, limit, offset, exam }) {
  const where = [];
  const params = [];
  if (topic) {
    where.push('topic = ?');
    params.push(topic);
  }
  if (exam) {
    where.push('exam = ?');
    params.push(exam);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM vocabulary ${whereSql}`).get(...params).c;
  const rows = db
    .prepare(`SELECT * FROM vocabulary ${whereSql} ORDER BY id LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  return { total, items: rows };
}

function getVocabularyById(id) {
  return db.prepare('SELECT * FROM vocabulary WHERE id = ?').get(id) || null;
}

function insertVocabulary(v) {
  db.prepare(
    'INSERT INTO vocabulary (id, word, phonetic, meaning, example, topic, exam) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(v.id, v.word, v.phonetic || null, v.meaning, v.example || null, v.topic || null, v.exam || 'toeic');
}

function updateVocabulary(id, fields) {
  const cur = getVocabularyById(id);
  if (!cur) return null;
  db.prepare(
    'UPDATE vocabulary SET word = ?, phonetic = ?, meaning = ?, example = ?, topic = ?, exam = ? WHERE id = ?'
  ).run(
    fields.word !== undefined ? fields.word : cur.word,
    fields.phonetic !== undefined ? fields.phonetic : cur.phonetic,
    fields.meaning !== undefined ? fields.meaning : cur.meaning,
    fields.example !== undefined ? fields.example : cur.example,
    fields.topic !== undefined ? fields.topic : cur.topic,
    fields.exam !== undefined ? fields.exam : cur.exam,
    id
  );
  return getVocabularyById(id);
}

function deleteVocabulary(id) {
  return db.prepare('DELETE FROM vocabulary WHERE id = ?').run(id).changes > 0;
}

function getAllVocabularyForBackup() {
  return db.prepare('SELECT * FROM vocabulary ORDER BY id').all();
}

function markUserVocabulary(userId, vocabId, status) {
  db.prepare(
    `INSERT INTO user_vocabulary (user_id, vocab_id, status, last_reviewed_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, vocab_id) DO UPDATE SET status = excluded.status,
       last_reviewed_at = excluded.last_reviewed_at`
  ).run(userId, vocabId, status, nowIso());
}

function getUserVocabMap(userId) {
  const rows = db
    .prepare('SELECT vocab_id, status FROM user_vocabulary WHERE user_id = ?')
    .all(userId);
  const map = {};
  for (const r of rows) map[r.vocab_id] = r.status;
  return map;
}

/* ---------------- XP & leaderboard ---------------- */

function addXpEvent(userId, xp, reason) {
  const info = db
    .prepare('INSERT INTO xp_events (user_id, xp, reason, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, xp, reason, nowIso());
  return Number(info.lastInsertRowid);
}

function sumXp(userId, sinceIso) {
  if (sinceIso) {
    return (
      db
        .prepare('SELECT COALESCE(SUM(xp), 0) AS s FROM xp_events WHERE user_id = ? AND created_at >= ?')
        .get(userId, sinceIso).s || 0
    );
  }
  return (
    db.prepare('SELECT COALESCE(SUM(xp), 0) AS s FROM xp_events WHERE user_id = ?').get(userId)
      .s || 0
  );
}

function hasXpReason(userId, reason) {
  return (
    db
      .prepare('SELECT COUNT(*) AS c FROM xp_events WHERE user_id = ? AND reason = ?')
      .get(userId, reason).c > 0
  );
}

/** Bang diem: bai full hop le tot nhat cua moi user trong khoang (sinceIso null = moi luc). */
function getBestFullScores(sinceIso) {
  let sql = `SELECT user_id, total_score, finished_at FROM attempts
             WHERE mode = 'full' AND leaderboard_eligible = 1 AND total_score IS NOT NULL`;
  const params = [];
  if (sinceIso) {
    sql += ' AND finished_at >= ?';
    params.push(sinceIso);
  }
  sql += ' ORDER BY total_score DESC, finished_at ASC';
  const rows = db.prepare(sql).all(...params);
  const best = new Map();
  for (const r of rows) {
    if (!best.has(r.user_id)) {
      best.set(r.user_id, { userId: r.user_id, score: r.total_score, date: r.finished_at });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || (a.date < b.date ? -1 : 1));
}

/** Bang band IELTS: overall_band cao nhat cua moi user (bai full IELTS hop le
 *  trong khoang); bang nhau thi nguoi nop truoc xep tren. */
function getBestFullBands(sinceIso) {
  let sql = `SELECT user_id, overall_band, finished_at FROM attempts
             WHERE mode = 'full' AND exam = 'ielts' AND leaderboard_eligible = 1 AND overall_band IS NOT NULL`;
  const params = [];
  if (sinceIso) {
    sql += ' AND finished_at >= ?';
    params.push(sinceIso);
  }
  sql += ' ORDER BY overall_band DESC, finished_at ASC';
  const rows = db.prepare(sql).all(...params);
  const best = new Map();
  for (const r of rows) {
    if (!best.has(r.user_id)) {
      best.set(r.user_id, { userId: r.user_id, score: r.overall_band, date: r.finished_at });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || (a.date < b.date ? -1 : 1));
}

/** Bang XP: tong XP cua moi user trong khoang (sinceIso null = moi luc). */
function getXpTotals(sinceIso) {
  let sql = 'SELECT user_id, COALESCE(SUM(xp), 0) AS xp FROM xp_events';
  const params = [];
  if (sinceIso) {
    sql += ' WHERE created_at >= ?';
    params.push(sinceIso);
  }
  sql += ' GROUP BY user_id ORDER BY xp DESC';
  return db.prepare(sql).all(...params).map((r) => ({ userId: r.user_id, xp: r.xp }));
}

function listAllUsersPublic() {
  return db
    .prepare('SELECT * FROM users ORDER BY id')
    .all()
    .map(mapUser);
}

/* ---------------- IELTS Phase 1: profile, error log, monster, sessions,
   mock_tests, plan, writing, speaking ----------------
 * Ngay thang: chuoi ISO YYYY-MM-DD (UTC, cung quy uoc voi xp.js).
 * Lich on tap loi (spaced repetition): cac moc ngay [1, 3, 7, 14, 30].
 *   - Moi loi tao o stage 0, han on = ngay mai.
 *   - On dung: stage + 1, han on = hom nay + days[stage moi]; stage 5
 *     (on dung sau moc 30 ngay) -> resolved = 1.
 *   - On sai: stage ve 0, han on = ngay mai.
 * Quai (monster): moi lan on dung 1 loi tinh 1 hit cho error_code do;
 *   hits toi da 3 -> killed = 1, ghi killed_at. */

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const REVIEW_DAYS = [1, 3, 7, 14, 30];

function mapIeltsProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    examDate: row.exam_date || null,
    targetListening: row.target_listening != null ? row.target_listening : null,
    targetReading: row.target_reading != null ? row.target_reading : null,
    targetWriting: row.target_writing != null ? row.target_writing : null,
    targetSpeaking: row.target_speaking != null ? row.target_speaking : null,
    quitReason: row.quit_reason || null,
    setupDone: row.setup_done === 1,
    skipped: row.skipped === 1,
    updatedAt: row.updated_at,
  };
}

function getIeltsProfile(userId) {
  const row = db.prepare('SELECT * FROM ielts_profiles WHERE user_id = ?').get(userId);
  return mapIeltsProfile(row);
}

function setIeltsProfile(userId, fields) {
  const cur = getIeltsProfile(userId);
  const next = {
    exam_date: fields.examDate !== undefined ? fields.examDate : (cur ? cur.examDate : null),
    target_listening: fields.targetListening !== undefined ? fields.targetListening : (cur ? cur.targetListening : null),
    target_reading: fields.targetReading !== undefined ? fields.targetReading : (cur ? cur.targetReading : null),
    target_writing: fields.targetWriting !== undefined ? fields.targetWriting : (cur ? cur.targetWriting : null),
    target_speaking: fields.targetSpeaking !== undefined ? fields.targetSpeaking : (cur ? cur.targetSpeaking : null),
    quit_reason: fields.quitReason !== undefined ? fields.quitReason : (cur ? cur.quitReason : null),
    setup_done: fields.setupDone !== undefined ? (fields.setupDone ? 1 : 0) : (cur ? (cur.setupDone ? 1 : 0) : 0),
    skipped: fields.skipped !== undefined ? (fields.skipped ? 1 : 0) : (cur ? (cur.skipped ? 1 : 0) : 0),
  };
  db.prepare(
    `INSERT INTO ielts_profiles (user_id, exam_date, target_listening, target_reading, target_writing, target_speaking, quit_reason, setup_done, skipped, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET exam_date = excluded.exam_date,
       target_listening = excluded.target_listening, target_reading = excluded.target_reading,
       target_writing = excluded.target_writing, target_speaking = excluded.target_speaking,
       quit_reason = excluded.quit_reason, setup_done = excluded.setup_done,
       skipped = excluded.skipped, updated_at = excluded.updated_at`
  ).run(userId, next.exam_date, next.target_listening, next.target_reading, next.target_writing, next.target_speaking, next.quit_reason, next.setup_done, next.skipped, nowIso());
  return getIeltsProfile(userId);
}

/* ---------------- error log ---------------- */

function mapErrorLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    questionId: row.question_id || null,
    attemptId: row.attempt_id != null ? row.attempt_id : null,
    skill: row.skill,
    questionType: row.question_type || null,
    errorCode: row.error_code,
    evidence: row.evidence || null,
    missedKeyword: row.missed_keyword || null,
    timeSpentSec: row.time_spent_sec != null ? row.time_spent_sec : null,
    guessed: row.guessed === 1,
    reviewDue: row.review_due || null,
    reviewStage: row.review_stage != null ? row.review_stage : 0,
    resolved: row.resolved === 1,
    lastReviewCorrect: row.last_review_correct == null ? null : row.last_review_correct === 1,
    createdAt: row.created_at,
  };
}

function createErrorLog({ userId, questionId, attemptId, skill, questionType, errorCode, evidence, missedKeyword, timeSpentSec, guessed }) {
  const info = db.prepare(
    `INSERT INTO error_log (user_id, question_id, attempt_id, skill, question_type, error_code, evidence, missed_keyword, time_spent_sec, guessed, review_due, review_stage, resolved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
  ).run(
    userId,
    questionId || null,
    attemptId != null ? attemptId : null,
    skill,
    questionType || null,
    errorCode,
    evidence || null,
    missedKeyword || null,
    timeSpentSec != null ? timeSpentSec : null,
    guessed ? 1 : 0,
    addDaysStr(todayStr(), 1),
    nowIso()
  );
  return getErrorLogById(Number(info.lastInsertRowid));
}

function getErrorLogById(id) {
  const row = db.prepare('SELECT * FROM error_log WHERE id = ?').get(id);
  return mapErrorLog(row);
}

function listErrorLog(userId, { skill, code, resolved } = {}) {
  const where = ['user_id = ?'];
  const params = [userId];
  if (skill) { where.push('skill = ?'); params.push(skill); }
  if (code) { where.push('error_code = ?'); params.push(code); }
  if (resolved !== undefined) { where.push('resolved = ?'); params.push(resolved ? 1 : 0); }
  return db.prepare(`SELECT * FROM error_log WHERE ${where.join(' AND ')} ORDER BY id DESC`).all(...params).map(mapErrorLog);
}

/** Cac loi den han on (review_due <= hom nay, chua xong). */
function listDueErrorLog(userId) {
  return db.prepare(
    'SELECT * FROM error_log WHERE user_id = ? AND resolved = 0 AND review_due <= ? ORDER BY review_due ASC, id ASC'
  ).all(userId, todayStr()).map(mapErrorLog);
}

/**
 * Tien 1 buoc on tap cho 1 loi. Tra ve row da cap nhat (null neu khong co).
 * Dung: stage + 1, han = hom nay + days[stage moi]; dung o stage 4 -> stage 5,
 * resolved = 1. Sai: stage ve 0, han = ngay mai.
 */
function reviewErrorLog(id, correct) {
  const cur = getErrorLogById(id);
  if (!cur) return null;
  let stage = cur.reviewStage;
  let resolved = 0;
  let due;
  if (correct) {
    stage += 1;
    if (stage >= REVIEW_DAYS.length) {
      stage = REVIEW_DAYS.length;
      resolved = 1;
      due = cur.reviewDue;
    } else {
      due = addDaysStr(todayStr(), REVIEW_DAYS[stage]);
    }
  } else {
    stage = 0;
    due = addDaysStr(todayStr(), 1);
  }
  db.prepare(
    'UPDATE error_log SET review_stage = ?, review_due = ?, resolved = ?, last_review_correct = ? WHERE id = ?'
  ).run(stage, due, resolved, correct ? 1 : 0, id);
  return getErrorLogById(id);
}

/** Dem loi theo ma (tong + so da xong) cho man quai. */
function getErrorLogCountsByCode(userId) {
  return db.prepare(
    `SELECT error_code AS code, COUNT(*) AS total,
            COALESCE(SUM(resolved), 0) AS resolved
     FROM error_log WHERE user_id = ? GROUP BY error_code`
  ).all(userId).map((r) => ({ code: r.code, total: r.total, resolved: r.resolved }));
}

/* ---------------- monster state ---------------- */

function mapMonsterState(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    errorCode: row.error_code,
    hits: row.hits != null ? row.hits : 0,
    killed: row.killed === 1,
    killedAt: row.killed_at || null,
    updatedAt: row.updated_at,
  };
}

function getMonsterState(userId, errorCode) {
  const row = db.prepare('SELECT * FROM monster_state WHERE user_id = ? AND error_code = ?').get(userId, errorCode);
  return mapMonsterState(row);
}

/** Cong 1 hit cho 1 ma loi; du 3 hit thi quai chet (killed = 1). */
function bumpMonsterHit(userId, errorCode) {
  const cur = getMonsterState(userId, errorCode);
  const hits = Math.min(3, (cur ? cur.hits : 0) + 1);
  const killed = hits >= 3 ? 1 : 0;
  db.prepare(
    `INSERT INTO monster_state (user_id, error_code, hits, killed, killed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, error_code) DO UPDATE SET hits = excluded.hits,
       killed = excluded.killed, killed_at = excluded.killed_at,
       updated_at = excluded.updated_at`
  ).run(userId, errorCode, hits, killed, killed ? nowIso() : (cur ? cur.killedAt : null), nowIso());
  return getMonsterState(userId, errorCode);
}

function listMonsterStates(userId) {
  return db.prepare('SELECT * FROM monster_state WHERE user_id = ?').all(userId).map(mapMonsterState);
}

/* ---------------- sessions (hoat dong ngay / "Hom nay") ---------------- */

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    minutes: row.minutes != null ? row.minutes : null,
    module: row.module,
    goalCompleted: row.goal_completed === 1,
    exam: row.exam || null,
    createdAt: row.created_at,
  };
}

function createSession(userId, { date, minutes, module, goalCompleted, exam }) {
  const info = db.prepare(
    'INSERT INTO sessions (user_id, date, minutes, module, goal_completed, exam, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, date || todayStr(), minutes != null ? minutes : null, module, goalCompleted ? 1 : 0, exam || null, nowIso());
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(Number(info.lastInsertRowid));
  return mapSession(row);
}

/** Sessions cua user trong khoang ngay [from, to] (YYYY-MM-DD, bao ca 2 dau). */
function listSessionsByDateRange(userId, from, to) {
  return db.prepare(
    'SELECT * FROM sessions WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC, id ASC'
  ).all(userId, from, to).map(mapSession);
}

/* ---------------- mock_tests (diagnostic + mock IELTS) ---------------- */

function mapMockTest(row) {
  if (!row) return null;
  let abilityMap = null;
  try {
    abilityMap = row.ability_map ? JSON.parse(row.ability_map) : null;
  } catch (_) {
    abilityMap = null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    exam: row.exam || 'ielts',
    testSetId: row.test_set_id || null,
    attemptId: row.attempt_id != null ? row.attempt_id : null,
    listeningCorrect: row.listening_correct != null ? row.listening_correct : null,
    readingCorrect: row.reading_correct != null ? row.reading_correct : null,
    listeningBand: row.listening_band != null ? row.listening_band : null,
    readingBand: row.reading_band != null ? row.reading_band : null,
    overallBand: row.overall_band != null ? row.overall_band : null,
    durationSec: row.duration_sec != null ? row.duration_sec : null,
    valid: row.valid === 1,
    abilityMap,
    createdAt: row.created_at,
  };
}

/** Danh dau cac mock cu cung kind la khong hop le (chi ban moi nhat tinh). */
function invalidateMockTests(userId, kind) {
  db.prepare('UPDATE mock_tests SET valid = 0 WHERE user_id = ? AND kind = ?').run(userId, kind);
}

function createMockTest({ userId, kind, exam, testSetId, attemptId, listeningCorrect, readingCorrect, listeningBand, readingBand, overallBand, durationSec, abilityMap }) {
  return transaction(() => {
    invalidateMockTests(userId, kind);
    const info = db.prepare(
      `INSERT INTO mock_tests (user_id, kind, exam, test_set_id, attempt_id, listening_correct, reading_correct, listening_band, reading_band, overall_band, duration_sec, valid, ability_map, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      userId, kind, exam || 'ielts', testSetId || null, attemptId != null ? attemptId : null,
      listeningCorrect != null ? listeningCorrect : null,
      readingCorrect != null ? readingCorrect : null,
      listeningBand != null ? listeningBand : null,
      readingBand != null ? readingBand : null,
      overallBand != null ? overallBand : null,
      durationSec != null ? durationSec : null,
      abilityMap ? JSON.stringify(abilityMap) : null,
      nowIso()
    );
    const row = db.prepare('SELECT * FROM mock_tests WHERE id = ?').get(Number(info.lastInsertRowid));
    return mapMockTest(row);
  });
}

/** Mock moi nhat cua 1 kind (ke ca ban valid = 0 neu khong con ban nao hop le). */
function getLatestMockTest(userId, kind) {
  const row = db.prepare(
    'SELECT * FROM mock_tests WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT 1'
  ).get(userId, kind);
  return mapMockTest(row);
}

function getMockTestById(id) {
  const row = db.prepare('SELECT * FROM mock_tests WHERE id = ?').get(id);
  return mapMockTest(row);
}

/* ---------------- plan (trong tam tuan) ---------------- */

function mapPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    weekStart: row.week_start,
    focusType: row.focus_type || null,
    focusCode: row.focus_code || null,
    createdAt: row.created_at,
  };
}

function getWeeklyPlan(userId, weekStart) {
  const row = db.prepare('SELECT * FROM plan WHERE user_id = ? AND week_start = ? ORDER BY id DESC LIMIT 1').get(userId, weekStart);
  return mapPlan(row);
}

function setWeeklyPlan(userId, { weekStart, focusType, focusCode }) {
  const cur = getWeeklyPlan(userId, weekStart);
  if (cur) {
    db.prepare('UPDATE plan SET focus_type = ?, focus_code = ? WHERE id = ?').run(
      focusType !== undefined ? focusType : cur.focusType,
      focusCode !== undefined ? focusCode : cur.focusCode,
      cur.id
    );
    return getWeeklyPlan(userId, weekStart);
  }
  const info = db.prepare(
    'INSERT INTO plan (user_id, week_start, focus_type, focus_code, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, weekStart, focusType || null, focusCode || null, nowIso());
  const row = db.prepare('SELECT * FROM plan WHERE id = ?').get(Number(info.lastInsertRowid));
  return mapPlan(row);
}

/* ---------------- writing tasks & submissions ---------------- */

const WRITING_TASK_TYPE_LABELS = {
  line_graph: 'Line graph', bar_chart: 'Bar chart', pie_chart: 'Pie chart',
  table: 'Table', process: 'Process diagram', map: 'Map', mixed_charts: 'Mixed charts',
  opinion: 'Opinion essay', discussion: 'Discussion essay',
  problem_solution: 'Problem and solution',
  advantages_disadvantages: 'Advantages and disadvantages',
  two_part: 'Two-part question',
};

function mapWritingTask(row) {
  if (!row) return null;
  let chartData = null;
  try {
    chartData = row.chart_data ? JSON.parse(row.chart_data) : null;
  } catch (_) {
    chartData = null;
  }
  // Frontend (Writing.tsx, Diagnostic.tsx) doc t.type / t.title / t.minutes
  // (theo interface WritingTask) — bang chi co task_type/topic/prompt nen
  // suy ra o day: type = task_type, minutes 20 (Task 1) / 40 (Task 2),
  // title = nhan dang bai + chu de.
  const type = row.task_type;
  const label = WRITING_TASK_TYPE_LABELS[row.prompt_type] || row.prompt_type || type;
  return {
    id: row.id,
    taskType: row.task_type,
    type,
    title: row.topic ? `${label} — ${row.topic}` : label,
    minutes: type === 'task1' ? 20 : 40,
    promptType: row.prompt_type || null,
    topic: row.topic || null,
    prompt: row.prompt,
    chartData,
    isSample: row.is_sample === 1,
  };
}

function listWritingTasks() {
  return db.prepare('SELECT * FROM writing_tasks ORDER BY id').all().map(mapWritingTask);
}

function getWritingTask(id) {
  const row = db.prepare('SELECT * FROM writing_tasks WHERE id = ?').get(id);
  return mapWritingTask(row);
}

function insertWritingTask({ id, taskType, promptType, topic, prompt, chartData, isSample }) {
  db.prepare(
    'INSERT INTO writing_tasks (id, task_type, prompt_type, topic, prompt, chart_data, is_sample) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id, taskType, promptType || null, topic || null, prompt,
    chartData ? JSON.stringify(chartData) : null,
    isSample === undefined ? 1 : (isSample ? 1 : 0)
  );
  return getWritingTask(id);
}

function mapWritingSubmission(row) {
  if (!row) return null;
  let selfScores = null;
  try {
    selfScores = row.self_scores ? JSON.parse(row.self_scores) : null;
  } catch (_) {
    selfScores = null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    content: row.content,
    wordCount: row.word_count != null ? row.word_count : 0,
    durationSec: row.duration_sec != null ? row.duration_sec : null,
    selfScores,
    isBaseline: row.is_baseline === 1,
    createdAt: row.created_at,
  };
}

function createWritingSubmission({ userId, taskId, content, wordCount, durationSec, selfScores, isBaseline }) {
  const info = db.prepare(
    `INSERT INTO writing_submissions (user_id, task_id, content, word_count, duration_sec, self_scores, is_baseline, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId, taskId, content, wordCount,
    durationSec != null ? durationSec : null,
    selfScores ? JSON.stringify(selfScores) : null,
    isBaseline ? 1 : 0, nowIso()
  );
  const row = db.prepare('SELECT * FROM writing_submissions WHERE id = ?').get(Number(info.lastInsertRowid));
  return mapWritingSubmission(row);
}

function listWritingSubmissions(userId) {
  return db.prepare('SELECT * FROM writing_submissions WHERE user_id = ? ORDER BY id DESC').all(userId).map(mapWritingSubmission);
}

/* ---------------- speaking prompts & recordings ---------------- */

function mapSpeakingPrompt(row) {
  if (!row) return null;
  let cueCard = null;
  try {
    cueCard = row.cue_card ? JSON.parse(row.cue_card) : null;
  } catch (_) {
    cueCard = row.cue_card;
  }
  return {
    id: row.id,
    part: row.part,
    topic: row.topic || null,
    prompt: row.prompt,
    cueCard,
    isSample: row.is_sample === 1,
  };
}

function listSpeakingPrompts() {
  return db.prepare('SELECT * FROM speaking_prompts ORDER BY part, id').all().map(mapSpeakingPrompt);
}

function getSpeakingPrompt(id) {
  const row = db.prepare('SELECT * FROM speaking_prompts WHERE id = ?').get(id);
  return mapSpeakingPrompt(row);
}

function insertSpeakingPrompt({ id, part, topic, prompt, cueCard, isSample }) {
  db.prepare(
    'INSERT INTO speaking_prompts (id, part, topic, prompt, cue_card, is_sample) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    id, part, topic || null, prompt,
    cueCard !== undefined && cueCard !== null ? (typeof cueCard === 'string' ? cueCard : JSON.stringify(cueCard)) : null,
    isSample === undefined ? 1 : (isSample ? 1 : 0)
  );
  return getSpeakingPrompt(id);
}

function mapSpeakingRecording(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    promptId: row.prompt_id,
    part: row.part,
    audioData: row.audio_data || null,
    mimeType: row.mime_type || null,
    durationSec: row.duration_sec != null ? row.duration_sec : null,
    isBaseline: row.is_baseline === 1,
    createdAt: row.created_at,
  };
}

function createSpeakingRecording({ userId, promptId, part, audioData, mimeType, durationSec, isBaseline }) {
  const info = db.prepare(
    `INSERT INTO speaking_recordings (user_id, prompt_id, part, audio_data, mime_type, duration_sec, is_baseline, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId, promptId, part, audioData, mimeType || null,
    durationSec != null ? durationSec : null, isBaseline ? 1 : 0, nowIso()
  );
  const row = db.prepare('SELECT * FROM speaking_recordings WHERE id = ?').get(Number(info.lastInsertRowid));
  return mapSpeakingRecording(row);
}

function listSpeakingRecordings(userId) {
  return db.prepare('SELECT * FROM speaking_recordings WHERE user_id = ? ORDER BY id DESC').all(userId).map(mapSpeakingRecording);
}

/* ---------------- ho tro "Hom nay" (chi doc bang cu) ---------------- */

/** Dem cau hoi theo dang (phuc vu khoi drill IELTS). */
function countQuestionsByType(exam, questionType) {
  return db.prepare(
    'SELECT COUNT(*) AS c FROM questions WHERE exam = ? AND COALESCE(question_type, \'multiple_choice\') = ?'
  ).get(exam, questionType).c;
}

/**
 * Hang doi on cau sai TOEIC: tu bang wrong_questions (chi doc).
 * Sap xep: sai nhieu nhat truoc, roi den cau sai lau nhat.
 */
function getWrongQueue(userId, exam, limit) {
  const rows = db.prepare(
    `SELECT w.question_id AS questionId, w.wrong_count AS wrongCount,
            w.last_wrong_at AS lastWrongAt
     FROM wrong_questions w JOIN questions q ON q.id = w.question_id
     WHERE w.user_id = ? AND q.exam = ?
     ORDER BY w.wrong_count DESC, w.last_wrong_at ASC LIMIT ?`
  ).all(userId, exam, limit || 10);
  return rows.map((r) => ({ questionId: r.questionId, wrongCount: r.wrongCount, lastWrongAt: r.lastWrongAt }));
}

function countWrongQuestions(userId, exam) {
  return db.prepare(
    `SELECT COUNT(*) AS c FROM wrong_questions w JOIN questions q ON q.id = w.question_id
     WHERE w.user_id = ? AND q.exam = ?`
  ).get(userId, exam).c;
}

module.exports = {
  db,
  initDb,
  nowIso,
  mapUser,
  // users
  createUser,
  findUserByEmail,
  findUserById,
  findUserByGoogleId,
  updateUserProfile,
  updateUserPassword,
  linkGoogleAccount,
  countUsers,
  countAdmins,
  adminUpdateUser,
  deleteUser,
  listAllUsersPublic,
  // passages
  upsertPassage,
  getPassage,
  updatePassageMedia,
  // questions
  insertQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestionById,
  getQuestionRowById,
  countQuestions,
  countByPart,
  listQuestions,
  getQuestionsByPart,
  getAllQuestionsOrdered,
  getAllQuestionsForBackup,
  // test sets
  createTestSet,
  getTestSet,
  listTestSets,
  updateTestSet,
  deleteTestSet,
  nextTestSetId,
  countByPartForTestSet,
  getUserProgressByTestSet,
  validateImportQuestion,
  importTestSetQuestions,
  addQuestionToTestSet,
  refreshTestSetTotal,
  // part media (audio cap Part)
  getPartMedia,
  setPartMedia,
  // attempts & answers
  createAttempt,
  getAttempt,
  listAttemptsByUser,
  finishAttempt,
  deleteAttempt,
  countAttempts,
  upsertAnswer,
  getAnswersByAttempt,
  getUserAnswerStats,
  getUserAnswerStatsByType,
  countAnsweredByUser,
  getActivityStartedAt,
  getRecentFullScores,
  getRecentFullBands,
  // wrong questions
  upsertWrongQuestion,
  listWrongQuestions,
  deleteWrongQuestion,
  // vocabulary
  countVocabulary,
  listVocabulary,
  getVocabularyById,
  insertVocabulary,
  updateVocabulary,
  deleteVocabulary,
  getAllVocabularyForBackup,
  markUserVocabulary,
  getUserVocabMap,
  // xp & leaderboard
  addXpEvent,
  sumXp,
  hasXpReason,
  getBestFullScores,
  getBestFullBands,
  getXpTotals,
  // IELTS Phase 1 (moi)
  todayStr,
  addDaysStr,
  REVIEW_DAYS,
  getIeltsProfile,
  setIeltsProfile,
  createErrorLog,
  getErrorLogById,
  listErrorLog,
  listDueErrorLog,
  reviewErrorLog,
  getErrorLogCountsByCode,
  getMonsterState,
  bumpMonsterHit,
  listMonsterStates,
  createSession,
  listSessionsByDateRange,
  invalidateMockTests,
  createMockTest,
  getLatestMockTest,
  getMockTestById,
  getWeeklyPlan,
  setWeeklyPlan,
  listWritingTasks,
  getWritingTask,
  insertWritingTask,
  createWritingSubmission,
  listWritingSubmissions,
  listSpeakingPrompts,
  getSpeakingPrompt,
  insertSpeakingPrompt,
  createSpeakingRecording,
  listSpeakingRecordings,
  countQuestionsByType,
  getWrongQueue,
  countWrongQuestions,
};
