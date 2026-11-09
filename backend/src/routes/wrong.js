'use strict';

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { awardXp } = require('../xp');

const router = express.Router();

router.get('/wrong-questions', authMiddleware, (req, res) => {
  const part = req.query.part ? parseInt(req.query.part, 10) : undefined;
  if (req.query.part && (!Number.isInteger(part) || part < 1 || part > 7)) {
    return res.status(400).json({ error: 'part phai tu 1 den 7' });
  }
  // Cau hoi tra ve da redact (khong co dap an dung / giai thich).
  return res.json(db.listWrongQuestions(req.user.id, part));
});

router.post('/wrong-questions/:questionId/review', authMiddleware, (req, res) => {
  const { questionId } = req.params;
  const { selected } = req.body || {};
  if (typeof selected !== 'string') {
    return res.status(400).json({ error: 'thieu selected' });
  }
  const q = db.getQuestionRowById(questionId);
  if (!q) return res.status(404).json({ error: 'khong tim thay cau hoi' });
  const correctOpt = q.options.find((o) => o.is_correct === 1);
  if (!correctOpt) return res.status(500).json({ error: 'cau hoi chua co dap an dung' });
  const correct = selected.trim().toUpperCase() === correctOpt.label;
  let xpAwarded = 0;
  if (correct) {
    db.deleteWrongQuestion(req.user.id, questionId);
    xpAwarded = awardXp(req.user.id, 5, 'wrong_review_correct').xpAwarded;
  }
  let transcript = q.script || null;
  if (!transcript && q.passage_id) {
    const passage = db.getPassage(q.passage_id);
    transcript = (passage && (passage.script || passage.content)) || q.passage_text || null;
  }
  if (!transcript) transcript = q.passage_text || null;
  return res.json({
    correct,
    correctLabel: correctOpt.label,
    explanation: q.explanation || null,
    transcript,
    xpAwarded,
  });
});

module.exports = router;
