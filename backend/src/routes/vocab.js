'use strict';

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

/** Nhom chu de + so cum (cho luoi box chu de o tab Tu chung). */
router.get('/vocabulary/topics', authMiddleware, (req, res) => {
  const exam = req.query.exam === 'ielts' ? 'ielts' : req.query.exam === 'toeic' ? 'toeic' : undefined;
  return res.json({ topics: db.countVocabularyByTopic(exam) });
});
/** Dot A — tim 1 cum trong "Tu chung" theo dung tu/cum (khong phan biet
 * hoa/thuong). Dat truoc cac route /vocabulary/:id... */
router.get('/vocabulary/by-word', authMiddleware, (req, res) => {
  const word = typeof req.query.word === 'string' ? req.query.word.trim() : '';
  if (!word) return res.status(400).json({ error: 'thieu word', message: 'Thiếu tham số word.' });
  const vocab = db.getVocabularyByWord(word);
  if (!vocab) return res.status(404).json({ error: 'khong tim thay tu vung' });
  return res.json(vocab);
});
router.get('/vocabulary', authMiddleware, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const topic = typeof req.query.topic === 'string' && req.query.topic.trim()
    ? req.query.topic.trim()
    : undefined;
  const exam = req.query.exam === 'ielts' ? 'ielts' : req.query.exam === 'toeic' ? 'toeic' : undefined;
  const { total, items } = db.listVocabulary({ topic, limit, offset, exam });
  const statusMap = db.getUserVocabMap(req.user.id);
  return res.json({
    total,
    limit,
    offset,
    items: items.map((v) => ({ ...v, status: statusMap[v.id] || 'learning' })),
  });
});

router.post('/vocabulary/:id/mark', authMiddleware, (req, res) => {
  const { status } = req.body || {};
  if (!['learning', 'learned', 'wrong'].includes(status)) {
    return res.status(400).json({ error: 'status phai la learning, learned hoac wrong' });
  }
  const vocab = db.getVocabularyById(req.params.id);
  if (!vocab) return res.status(404).json({ error: 'khong tim thay tu vung' });
  db.markUserVocabulary(req.user.id, req.params.id, status);
  return res.json({ ok: true, id: req.params.id, status });
});

/** Luu 1 cum chung vao "Tu cua toi" (kem SRS mac dinh: stage 0, due ngay mai).
 * Da co san -> tra alreadyExists, khong tao trung. */
router.post('/vocabulary/:id/learn', authMiddleware, (req, res) => {
  const vocab = db.getVocabularyById(req.params.id);
  if (!vocab) return res.status(404).json({ error: 'khong tim thay tu vung' });
  const existing = db.getUserWordByWord(req.user.id, vocab.word);
  if (existing) return res.json({ ok: true, alreadyExists: true, word: existing });
  let word;
  try {
    word = db.insertUserWord(req.user.id, {
      word: vocab.word,
      phonetic: vocab.phonetic,
      meaning: vocab.meaning,
      example: vocab.example,
      context: vocab.example,
      topic: vocab.topic,
    });
  } catch (err) {
    // Bấm đúp / 2 request song song: UNIQUE(user_id, word) ném lỗi —
    // đọc lại, nếu đã có thì coi như alreadyExists.
    const raced = db.getUserWordByWord(req.user.id, vocab.word);
    if (raced) return res.json({ ok: true, alreadyExists: true, word: raced });
    throw err;
  }
  return res.status(201).json({ ok: true, alreadyExists: false, word });
});

/** Hoc ca bo theo chu de: luu tat ca cum cua chu de (theo exam) vao
 * "Tu cua toi", bo qua cum da co. */
router.post('/vocabulary/learn-set', authMiddleware, (req, res) => {
  const topic = typeof req.body.topic === 'string' ? req.body.topic.trim() : '';
  const exam = req.body.exam === 'ielts' ? 'ielts' : req.body.exam === 'toeic' ? 'toeic' : undefined;
  if (!topic) return res.status(400).json({ error: 'thieu topic' });
  const { items } = db.listVocabulary({ topic, exam, limit: 500, offset: 0 });
  let added = 0;
  let skipped = 0;
  for (const v of items) {
    if (db.getUserWordByWord(req.user.id, v.word)) {
      skipped += 1;
      continue;
    }
    try {
      db.insertUserWord(req.user.id, {
        word: v.word,
        phonetic: v.phonetic,
        meaning: v.meaning,
        example: v.example,
        context: v.example,
        topic: v.topic,
      });
    } catch (err) {
      // Trung lap do request song song: bo qua, dem vao skipped.
      if (!db.getUserWordByWord(req.user.id, v.word)) throw err;
      skipped += 1;
      continue;
    }
    added += 1;
  }
  return res.json({ ok: true, total: items.length, added, skipped });
});

module.exports = router;
