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
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
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
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  exam TEXT DEFAULT 'toeic',
  part INTEGER,
  passage_id TEXT,
  content TEXT,
  explanation TEXT,
  topic TEXT,
  difficulty TEXT,
  script TEXT,
  passage_text TEXT
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
  title TEXT,
  content TEXT,
  script TEXT,
  type TEXT
);
CREATE TABLE IF NOT EXISTS vocabulary (
  id TEXT PRIMARY KEY,
  word TEXT,
  phonetic TEXT,
  meaning TEXT,
  example TEXT,
  topic TEXT
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  mode TEXT,
  part INTEGER,
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
  leaderboard_eligible INTEGER DEFAULT 1
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
CREATE INDEX IF NOT EXISTS idx_questions_part ON questions(part);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_xp_user_created ON xp_events(user_id, created_at);
`;

function initDb() {
  db.exec(SCHEMA);
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
    passageTitle: (passage && passage.title) || null,
    passageText: (passage && passage.content) || row.passage_text || null,
    script: (passage && passage.script) || row.script || null,
    content: row.content,
    topic: row.topic || null,
    difficulty: row.difficulty || null,
    options: (opts || []).map((o) => ({ label: o.label, content: o.content })),
  };
}

function mapQuestionAdmin(row, opts, passage) {
  const base = mapQuestion(row, opts, passage);
  const correct = (opts || []).find((o) => o.is_correct === 1);
  return {
    ...base,
    explanation: row.explanation || null,
    correct: correct ? correct.label : null,
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
    .prepare(`SELECT id, part, title, content, script, type FROM passages WHERE id IN (${placeholders})`)
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

function updateUserProfile(id, { name, targetScore, hideOnLeaderboard }) {
  const cur = findUserById(id);
  if (!cur) return null;
  db.prepare(
    'UPDATE users SET name = ?, target_score = ?, hide_on_leaderboard = ? WHERE id = ?'
  ).run(
    name !== undefined ? name : cur.name,
    targetScore !== undefined ? targetScore : cur.target_score,
    hideOnLeaderboard !== undefined ? (hideOnLeaderboard ? 1 : 0) : cur.hide_on_leaderboard,
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

/* ---------------- passages ---------------- */

function upsertPassage({ id, part, title, content, script, type }) {
  db.prepare(
    `INSERT INTO passages (id, part, title, content, script, type) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET part = excluded.part, title = excluded.title,
       content = excluded.content, script = excluded.script, type = excluded.type`
  ).run(id, part || null, title || null, content || null, script || null, type || null);
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
    questionIds: qids,
  };
}

/* ---------------- questions ---------------- */

/**
 * Chen 1 cau hoi (seed-format) kem 4 phuong an. Neu co passageId + thong tin
 * doan thi upsert luon passage. Dung trong transaction de khong nua voi.
 * @param {object} q {id, part, passageId, passageTitle, passageText, script, content, explanation, topic, difficulty, options:[{label,content}], correct}
 */
function insertQuestion(q) {
  return transaction(() => {
    if (q.passageId && (q.passageText || q.passageTitle || q.script)) {
      upsertPassage({
        id: q.passageId,
        part: q.part,
        title: q.passageTitle || null,
        content: q.passageText || null,
        script: q.script || null,
        type: q.part <= 4 ? 'listening' : 'reading',
      });
    }
    db.prepare(
      `INSERT INTO questions (id, exam, part, passage_id, content, explanation, topic, difficulty, script, passage_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      q.id,
      'toeic',
      q.part,
      q.passageId || null,
      q.content,
      q.explanation || null,
      q.topic || null,
      q.difficulty || null,
      q.script || null,
      q.passageText || null
    );
    const optStmt = db.prepare(
      'INSERT INTO options (question_id, label, content, is_correct) VALUES (?, ?, ?, ?)'
    );
    for (const o of q.options) {
      optStmt.run(q.id, o.label, o.content, o.label === q.correct ? 1 : 0);
    }
  });
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
      });
    }
    db.prepare(
      `UPDATE questions SET part = ?, passage_id = ?, content = ?, explanation = ?,
       topic = ?, difficulty = ?, script = ?, passage_text = ? WHERE id = ?`
    ).run(
      fields.part !== undefined ? fields.part : cur.part,
      fields.passageId !== undefined ? fields.passageId : cur.passage_id,
      fields.content !== undefined ? fields.content : cur.content,
      fields.explanation !== undefined ? fields.explanation : cur.explanation,
      fields.topic !== undefined ? fields.topic : cur.topic,
      fields.difficulty !== undefined ? fields.difficulty : cur.difficulty,
      fields.script !== undefined ? fields.script : cur.script,
      fields.passageText !== undefined ? fields.passageText : cur.passage_text,
      id
    );
    if (fields.options && fields.correct) {
      db.prepare('DELETE FROM options WHERE question_id = ?').run(id);
      const optStmt = db.prepare(
        'INSERT INTO options (question_id, label, content, is_correct) VALUES (?, ?, ?, ?)'
      );
      for (const o of fields.options) {
        optStmt.run(id, o.label, o.content, o.label === fields.correct ? 1 : 0);
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
  return { ...row, options: opts };
}

function countQuestions() {
  return db.prepare('SELECT COUNT(*) AS c FROM questions').get().c;
}

function countByPart() {
  const rows = db
    .prepare('SELECT part, COUNT(*) AS c FROM questions GROUP BY part ORDER BY part')
    .all();
  return rows.map((r) => ({ part: r.part, count: r.c }));
}

function listQuestions({ part, limit, offset, search, admin }) {
  const where = [];
  const params = [];
  if (part) {
    where.push('part = ?');
    params.push(part);
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

function getQuestionsByPart(part) {
  const rows = db.prepare('SELECT * FROM questions WHERE part = ? ORDER BY id').all(part);
  return hydrateQuestions(rows, false);
}

function getAllQuestionsOrdered() {
  const rows = db.prepare('SELECT * FROM questions ORDER BY part, id').all();
  return hydrateQuestions(rows, false);
}

function getAllQuestionsForBackup() {
  const rows = db.prepare('SELECT * FROM questions ORDER BY part, id').all();
  return hydrateQuestions(rows, true);
}

/* ---------------- attempts & answers ---------------- */

function createAttempt({ userId, mode, part, questionIds, durationSec }) {
  const info = db
    .prepare(
      `INSERT INTO attempts (user_id, mode, part, question_ids, started_at, duration_sec, leaderboard_eligible)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      userId,
      mode,
      part || null,
      JSON.stringify(questionIds || []),
      nowIso(),
      durationSec || null
    );
  return getAttempt(Number(info.lastInsertRowid));
}

function getAttempt(id) {
  const row = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
  return mapAttempt(row);
}

function listAttemptsByUser(userId, { modes, limit }) {
  let sql = 'SELECT * FROM attempts WHERE user_id = ?';
  const params = [userId];
  if (modes && modes.length) {
    sql += ` AND mode IN (${modes.map(() => '?').join(',')})`;
    params.push(...modes);
  }
  sql += ' ORDER BY started_at DESC LIMIT ?';
  params.push(limit || 50);
  return db.prepare(sql).all(...params).map(mapAttempt);
}

function finishAttempt(id, fields) {
  db.prepare(
    `UPDATE attempts SET finished_at = ?, duration_sec = ?, listening_correct = ?,
     reading_correct = ?, listening_score = ?, reading_score = ?, total_score = ?,
     xp_earned = ?, leaderboard_eligible = ? WHERE id = ?`
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
    id
  );
  return getAttempt(id);
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

function getUserAnswerStats(userId) {
  const rows = db
    .prepare(
      `SELECT q.part AS part, COUNT(*) AS answered,
              COALESCE(SUM(a.is_correct), 0) AS correct
       FROM answers a
       JOIN questions q ON q.id = a.question_id
       JOIN attempts t ON t.id = a.attempt_id
       WHERE t.user_id = ? AND a.is_correct IS NOT NULL
       GROUP BY q.part ORDER BY q.part`
    )
    .all(userId);
  return rows.map((r) => ({
    part: r.part,
    answered: r.answered,
    correct: r.correct,
  }));
}

function countAnsweredByUser(userId) {
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

function listWrongQuestions(userId, part) {
  let sql = `SELECT w.question_id AS qid, w.wrong_count AS wrongCount,
                    w.last_wrong_at AS lastWrongAt, q.*
             FROM wrong_questions w JOIN questions q ON q.id = w.question_id
             WHERE w.user_id = ?`;
  const params = [userId];
  if (part) {
    sql += ' AND q.part = ?';
    params.push(part);
  }
  sql += ' ORDER BY w.last_wrong_at DESC';
  const rows = db.prepare(sql).all(...params);
  const hydrated = hydrateQuestions(
    rows.map((r) => ({
      id: r.id,
      exam: r.exam,
      part: r.part,
      passage_id: r.passage_id,
      content: r.content,
      explanation: r.explanation,
      topic: r.topic,
      difficulty: r.difficulty,
      script: r.script,
      passage_text: r.passage_text,
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

function listVocabulary({ topic, limit, offset }) {
  const where = [];
  const params = [];
  if (topic) {
    where.push('topic = ?');
    params.push(topic);
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
    'INSERT INTO vocabulary (id, word, phonetic, meaning, example, topic) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(v.id, v.word, v.phonetic || null, v.meaning, v.example || null, v.topic || null);
}

function updateVocabulary(id, fields) {
  const cur = getVocabularyById(id);
  if (!cur) return null;
  db.prepare(
    'UPDATE vocabulary SET word = ?, phonetic = ?, meaning = ?, example = ?, topic = ? WHERE id = ?'
  ).run(
    fields.word !== undefined ? fields.word : cur.word,
    fields.phonetic !== undefined ? fields.phonetic : cur.phonetic,
    fields.meaning !== undefined ? fields.meaning : cur.meaning,
    fields.example !== undefined ? fields.example : cur.example,
    fields.topic !== undefined ? fields.topic : cur.topic,
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
  listAllUsersPublic,
  // passages
  upsertPassage,
  getPassage,
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
  // attempts & answers
  createAttempt,
  getAttempt,
  listAttemptsByUser,
  finishAttempt,
  countAttempts,
  upsertAnswer,
  getAnswersByAttempt,
  getUserAnswerStats,
  countAnsweredByUser,
  getActivityStartedAt,
  getRecentFullScores,
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
  getXpTotals,
};
