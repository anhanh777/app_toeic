'use strict';

// Admin: CRUD cau hoi + tu vung (kem dap an dung / giai thich), import JSON, backup.

const express = require('express');
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

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
  const { total, items } = db.listQuestions({ part, limit, offset, search, admin: true });
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
  // updateQuestion nhan options dang [{label, content}] + correct rieng.
  const err = validateQuestion({
    id: merged.id,
    part: merged.part,
    content: merged.content,
    options: merged.options,
    correct: merged.correct,
    explanation: merged.explanation,
    difficulty: merged.difficulty,
  });
  if (err) return res.status(400).json({ error: err });
  const updated = db.updateQuestion(req.params.id, {
    part: merged.part,
    passageId: merged.passageId,
    passageTitle: merged.passageTitle,
    passageText: merged.passageText,
    script: merged.script,
    content: merged.content,
    explanation: merged.explanation,
    topic: merged.topic,
    difficulty: merged.difficulty,
    options: merged.options.map((o) => ({ label: o.label, content: o.content })),
    correct: merged.correct,
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
  const { total, items } = db.listVocabulary({ topic, limit, offset });
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

/* ---------- backup ---------- */

router.get('/admin/backup', (req, res) => {
  // KHONG bao gom password hash (chi dem so user).
  return res.json({
    exportedAt: new Date().toISOString(),
    questions: db.getAllQuestionsForBackup(),
    vocabulary: db.getAllVocabularyForBackup(),
    usersCount: db.countUsers(),
    attemptsCount: db.countAttempts(),
  });
});

module.exports = router;
