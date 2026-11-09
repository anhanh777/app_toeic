'use strict';

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

router.get('/vocabulary', authMiddleware, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const topic = typeof req.query.topic === 'string' && req.query.topic.trim()
    ? req.query.topic.trim()
    : undefined;
  const { total, items } = db.listVocabulary({ topic, limit, offset });
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

module.exports = router;
