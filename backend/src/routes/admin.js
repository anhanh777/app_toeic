'use strict';

// Admin: CRUD cau hoi + tu vung (kem dap an dung / giai thich), import JSON, backup.

const express = require('express');
const db = require('../db');
const { authMiddleware, requireAdmin, hashPassword, toPublicUser } = require('../auth');
const { isTypedType, isMultiAnswerType } = require('../ieltsGrading');

const router = express.Router();
router.use(authMiddleware, requireAdmin);

/**
 * Validate 1 cau hoi dang seed-format. Tra ve null neu hop le, neu khong tra ly do.
 * Quy tac part/content/options/correct dung chung db.validateImportQuestion
 * (da noi long cho cau chi-nghe Part 1/2); o day chi them cac dieu kien
 * rieng cua trang Admin tong (id, explanation, difficulty).
 */
function validateQuestion(q) {
  if (!q || typeof q !== 'object') return 'doi tuong cau hoi khong hop le';
  if (typeof q.id !== 'string' || !q.id.trim()) return 'thieu id';
  // Cau IELTS: validate bang validateImportQuestion mo rong (khong bat buoc
  // explanation nhu TOEIC — cau dien tu co the chua co giai thich).
  if (q.exam === 'ielts') return db.validateImportQuestion(q, 0);
  const coreErr = db.validateImportQuestion(q, 0);
  if (coreErr) return coreErr;
  const correctCount = q.options.filter((o) => o.label === q.correct).length;
  if (correctCount !== 1) return 'phai co dung 1 dap an dung';
  if (typeof q.explanation !== 'string' || !q.explanation.trim()) {
    return 'thieu explanation';
  }
  if (q.difficulty !== undefined && !['easy', 'medium', 'hard'].includes(q.difficulty)) {
    return 'difficulty phai la easy, medium hoac hard';
  }
  return null;
}

function validateVocab(v) {
  if (!v || typeof v !== 'object') return 'doi tuong tu vung khong hop le';
  if (typeof v.id !== 'string' || !v.id.trim()) return 'thieu id';
  if (typeof v.word !== 'string' || !v.word.trim()) return 'thieu word';
  if (typeof v.meaning !== 'string' || !v.meaning.trim()) return 'thieu meaning';
  return null;
}

/* ---------- questions ---------- */

router.get('/admin/questions', (req, res) => {
  const part = req.query.part ? parseInt(req.query.part, 10) : undefined;
  if (req.query.part && (!Number.isInteger(part) || part < 1 || part > 7)) {
    return res.status(400).json({ error: 'part phai tu 1 den 7' });
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const search = typeof req.query.search === 'string' && req.query.search.trim()
    ? req.query.search.trim()
    : undefined;
  const exam = req.query.exam === 'ielts' ? 'ielts' : req.query.exam === 'toeic' ? 'toeic' : undefined;
  const { total, items } = db.listQuestions({ part, limit, offset, search, admin: true, exam });
  return res.json({ total, limit, offset, items });
});

router.post('/admin/questions', (req, res) => {
  const err = validateQuestion(req.body || {});
  if (err) return res.status(400).json({ error: err });
  if (db.getQuestionById(req.body.id, true)) {
    return res.status(400).json({ error: 'id da ton tai' });
  }
  try {
    db.insertQuestion(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  return res.status(201).json(db.getQuestionById(req.body.id, true));
});

router.put('/admin/questions/:id', (req, res) => {
  const existing = db.getQuestionById(req.params.id, true);
  if (!existing) return res.status(404).json({ error: 'khong tim thay cau hoi' });
  const merged = { ...existing, ...req.body, id: req.params.id };
  // PUT chi sua 1 phan (vd chi doi imageUrl) nen khong dung validateQuestion
  // cua trang Admin tong (bat buoc explanation + difficulty): cau nhap tu AI
  // co the khong co explanation, va PUT doi anh se loi "thieu explanation".
  // Chi kiem tra luat cot loi nhu luc import + dung 1 dap an dung.
  const coreErr = db.validateImportQuestion(
    {
      id: merged.id,
      exam: merged.exam,
      part: merged.part,
      content: merged.content,
      options: merged.options,
      correct: merged.correct,
      questionType: merged.questionType,
      correctText: merged.correctText,
      acceptedAnswers: merged.acceptedAnswers,
      wordLimit: merged.wordLimit,
    },
    0
  );
  if (coreErr) return res.status(400).json({ error: coreErr });
  const isTyped = isTypedType(merged.questionType);
  if (isMultiAnswerType(merged.questionType)) {
    // list_selection: correct la mang 2-3 nhan thuoc cac phuong an.
    const correctArr = Array.isArray(merged.correct) ? merged.correct : [];
    const optLabels = new Set(merged.options.map((o) => o.label));
    if (
      correctArr.length < 2 || correctArr.length > 3 ||
      new Set(correctArr.map((c) => String(c).toUpperCase())).size !== correctArr.length ||
      !correctArr.every((c) => optLabels.has(String(c).toUpperCase()))
    ) {
      return res.status(400).json({ error: 'list selection phai co 2-3 dap an dung khac nhau' });
    }
  } else if (!isTyped) {
    const correctCount = merged.options.filter((o) => o.label === merged.correct).length;
    if (correctCount !== 1) return res.status(400).json({ error: 'phai co dung 1 dap an dung' });
  }
  const updated = db.updateQuestion(req.params.id, {
    exam: merged.exam,
    part: merged.part,
    passageId: merged.passageId,
    passageTitle: merged.passageTitle,
    passageText: merged.passageText,
    script: merged.script,
    content: merged.content,
    explanation: merged.explanation,
    topic: merged.topic,
    difficulty: merged.difficulty,
    questionType: merged.questionType,
    wordLimit: merged.wordLimit,
    acceptedAnswers: merged.acceptedAnswers,
    correctText: merged.correctText,
    options: merged.options.map((o) => ({ label: o.label, content: o.content })),
    correct: merged.correct,
    // Cho phep sua anh/audio cua cau hoi qua PUT (truoc day 2 truong nay
    // bi bo qua nen sua anh qua API khong co tac dung).
    imageUrl: merged.imageUrl,
    audioUrl: merged.audioUrl,
  });
  return res.json(updated);
});

router.delete('/admin/questions/:id', (req, res) => {
  const ok = db.deleteQuestion(req.params.id);
  if (!ok) return res.status(404).json({ error: 'khong tim thay cau hoi' });
  return res.json({ ok: true });
});

router.post('/admin/questions/import', (req, res) => {
  const questions = (req.body || {}).questions;
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'body phai co questions la array' });
  }
  let imported = 0;
  const errors = [];
  questions.forEach((q, index) => {
    const err = validateQuestion(q);
    if (err) {
      errors.push({ index, reason: err });
      return;
    }
    if (db.getQuestionById(q.id, true)) {
      errors.push({ index, reason: 'id da ton tai' });
      return;
    }
    try {
      db.insertQuestion(q);
      imported += 1;
    } catch (e) {
      // Khong bao gio chen nua voi 1 row loi: insertQuestion chay trong transaction.
      errors.push({ index, reason: e.message });
    }
  });
  return res.json({ imported, errors });
});

/* ---------- vocabulary ---------- */

router.get('/admin/vocabulary', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const topic = typeof req.query.topic === 'string' && req.query.topic.trim()
    ? req.query.topic.trim()
    : undefined;
  const exam = req.query.exam === 'ielts' ? 'ielts' : req.query.exam === 'toeic' ? 'toeic' : undefined;
  const { total, items } = db.listVocabulary({ topic, limit, offset, exam });
  return res.json({ total, limit, offset, items });
});

router.post('/admin/vocabulary', (req, res) => {
  const err = validateVocab(req.body || {});
  if (err) return res.status(400).json({ error: err });
  if (db.getVocabularyById(req.body.id)) {
    return res.status(400).json({ error: 'id da ton tai' });
  }
  try {
    db.insertVocabulary(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  return res.status(201).json(db.getVocabularyById(req.body.id));
});

router.put('/admin/vocabulary/:id', (req, res) => {
  const existing = db.getVocabularyById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'khong tim thay tu vung' });
  const merged = { ...existing, ...req.body, id: req.params.id };
  const err = validateVocab(merged);
  if (err) return res.status(400).json({ error: err });
  return res.json(db.updateVocabulary(req.params.id, merged));
});

router.delete('/admin/vocabulary/:id', (req, res) => {
  const ok = db.deleteVocabulary(req.params.id);
  if (!ok) return res.status(404).json({ error: 'khong tim thay tu vung' });
  return res.json({ ok: true });
});

router.post('/admin/vocabulary/import', (req, res) => {
  const items = (req.body || {}).items;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'body phai co items la array' });
  }
  let imported = 0;
  const errors = [];
  items.forEach((v, index) => {
    const err = validateVocab(v);
    if (err) {
      errors.push({ index, reason: err });
      return;
    }
    if (db.getVocabularyById(v.id)) {
      errors.push({ index, reason: 'id da ton tai' });
      return;
    }
    try {
      db.insertVocabulary(v);
      imported += 1;
    } catch (e) {
      errors.push({ index, reason: e.message });
    }
  });
  return res.json({ imported, errors });
});

/* ---------- users (quan ly tai khoan) ----------
 * Danh sach KHONG bao gio tra password_hash (map qua toPublicUser).
 * Bao ve: khong duoc xoa / ha quyen chinh minh, khong duoc xoa / ha quyen
 * admin cuoi cung. Reset o day chi la dat lai MAT KHAU (khong reset tien do). */

router.get('/admin/users', (req, res) => {
  return res.json({ users: db.listAllUsersPublic() });
});

router.post('/admin/users', (req, res) => {
  const { email, password, name, role } = req.body || {};
  if (
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({ error: 'email khong hop le' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'mat khau phai co it nhat 6 ky tu' });
  }
  if (role !== undefined && !['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'role phai la user hoac admin' });
  }
  if (db.findUserByEmail(email.trim().toLowerCase())) {
    return res.status(409).json({ error: 'email da ton tai' });
  }
  const row = db.createUser({
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    name: typeof name === 'string' && name.trim() ? name.trim() : null,
    role: role || 'user',
  });
  return res.status(201).json({ user: toPublicUser(row) });
});

router.put('/admin/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id khong hop le' });
  const target = db.findUserById(id);
  if (!target) return res.status(404).json({ error: 'khong tim thay tai khoan' });
  const { name, role, targetScore, hideOnLeaderboard, isActive } = req.body || {};
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: 'ten khong hop le' });
  }
  if (role !== undefined && !['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'role phai la user hoac admin' });
  }
  if (
    targetScore !== undefined &&
    (!Number.isInteger(targetScore) || targetScore < 10 || targetScore > 990)
  ) {
    return res.status(400).json({ error: 'targetScore phai tu 10 den 990' });
  }
  if (hideOnLeaderboard !== undefined && typeof hideOnLeaderboard !== 'boolean') {
    return res.status(400).json({ error: 'hideOnLeaderboard phai la boolean' });
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive phai la boolean' });
  }
  if (target.role === 'admin' && role === 'user') {
    if (target.id === req.user.id) {
      return res.status(403).json({ error: 'khong the tu ha quyen cua minh' });
    }
    if (db.countAdmins() <= 1) {
      return res.status(403).json({ error: 'khong the ha quyen admin cuoi cung' });
    }
  }
  // Khoa tai khoan: khong duoc khoa chinh minh, khong duoc khoa admin
  // dang hoat dong cuoi cung (mo khoa thi luon cho phep).
  if (isActive === false) {
    if (target.id === req.user.id) {
      return res.status(403).json({ error: 'khong the khoa chinh minh' });
    }
    if (target.role === 'admin' && target.is_active !== 0 && db.countActiveAdmins() <= 1) {
      return res.status(403).json({ error: 'khong the khoa admin dang hoat dong cuoi cung' });
    }
  }
  const row = db.adminUpdateUser(id, {
    name: name !== undefined ? name.trim() : undefined,
    role,
    targetScore,
    hideOnLeaderboard,
    isActive,
  });
  return res.json({ user: toPublicUser(row) });
});

router.delete('/admin/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id khong hop le' });
  const target = db.findUserById(id);
  if (!target) return res.status(404).json({ error: 'khong tim thay tai khoan' });
  if (target.id === req.user.id) {
    return res.status(403).json({ error: 'khong the xoa chinh minh' });
  }
  if (target.role === 'admin' && db.countAdmins() <= 1) {
    return res.status(403).json({ error: 'khong the xoa admin cuoi cung' });
  }
  const ok = db.deleteUser(id);
  return res.json({ ok });
});

router.post('/admin/users/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id khong hop le' });
  const target = db.findUserById(id);
  if (!target) return res.status(404).json({ error: 'khong tim thay tai khoan' });
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'mat khau moi phai co it nhat 6 ky tu' });
  }
  db.updateUserPassword(id, hashPassword(password));
  return res.json({ ok: true });
});

/* ---------- backup ---------- */

router.get('/admin/backup', (req, res) => {
  // KHONG bao gom password hash (chi dem so user).
  return res.json({
    exportedAt: new Date().toISOString(),
    questions: db.getAllQuestionsForBackup(),
    vocabulary: db.getAllVocabularyForBackup(),
    userWords: db.getAllUserWordsForBackup(),
    usersCount: db.countUsers(),
    attemptsCount: db.countAttempts(),
  });
});

/* ---------- cai dat giao dien dong (scope C) ---------- */

const uiSettings = require('../uiSettings');

/** Doc day du cai dat giao dien (da normalize: thieu/sai -> mac dinh code). */
function readUiSettingsDoc() {
  return uiSettings.normalizeSettings(uiSettings.unflattenSettings(db.getAllSettings()));
}

router.get('/admin/settings', (req, res) => {
  return res.json(readUiSettingsDoc());
});

/**
 * PUT /api/admin/settings — luu cai dat giao dien. Chap nhan 2 dang:
 * - Tai lieu day du: { ui: { accent, fontScale, loading: {...} } }
 * - 1 key: { key: 'ui.accent', value: '#4A90D9' }
 * Chi luu key trong allowlist; gia tri khong hop le -> 400, khong luu gi.
 * Tra ve tai lieu day du sau khi luu.
 */
router.put('/admin/settings', (req, res) => {
  const body = req.body || {};
  let flat = {};
  if (typeof body.key === 'string') {
    flat = { [body.key]: body.value };
  } else if (body.ui && typeof body.ui === 'object') {
    flat = uiSettings.flattenSettings(body);
  } else {
    return res.status(400).json({ error: 'gui { ui: {...} } hoac { key, value }' });
  }
  const keys = Object.keys(flat);
  if (keys.length === 0) return res.status(400).json({ error: 'khong co cai dat nao de luu' });
  for (const key of keys) {
    const err = uiSettings.validateSetting(key, flat[key]);
    if (err) return res.status(400).json({ error: err });
  }
  for (const key of keys) db.setSetting(key, flat[key]);
  return res.json(readUiSettingsDoc());
});

module.exports = router;
