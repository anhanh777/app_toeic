'use strict';

// Luyen tap: tra loi 1 cau -> cham ngay, hien giai thich + transcript sau khi tra loi.

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { awardXp } = require('../xp');

const router = express.Router();

router.post('/practice/answer', authMiddleware, (req, res) => {
  const { questionId, selected } = req.body || {};
  if (!questionId || typeof selected !== 'string') {
    return res.status(400).json({ error: 'thieu questionId hoac selected' });
  }
  const q = db.getQuestionRowById(questionId);
  if (!q) return res.status(404).json({ error: 'khong tim thay cau hoi' });
  const selectedUpper = selected.trim().toUpperCase();
  const correctOpt = q.options.find((o) => o.is_correct === 1);
  if (!correctOpt) return res.status(500).json({ error: 'cau hoi chua co dap an dung' });
  if (!q.options.some((o) => o.label === selectedUpper)) {
    return res.status(400).json({ error: 'selected phai la A, B, C hoac D' });
  }
  const correct = selectedUpper === correctOpt.label;

  // Luu lich su luyen tap: 1 attempt mode='practice' cho moi cau (de thong ke
  // theo Part / streak / lich su). Diem thi chi tinh tu attempt mode mini/full.
  const attempt = db.createAttempt({
    userId: req.user.id,
    mode: 'practice',
    part: q.part,
    questionIds: [questionId],
    durationSec: 0,
  });
  db.upsertAnswer(attempt.id, questionId, selectedUpper, correct);
  const isListening = q.part >= 1 && q.part <= 4;
  db.finishAttempt(attempt.id, {
    finishedAt: new Date().toISOString(),
    durationSec: 0,
    listeningCorrect: isListening ? (correct ? 1 : 0) : null,
    readingCorrect: !isListening ? (correct ? 1 : 0) : null,
    listeningScore: null,
    readingScore: null,
    totalScore: null,
    xpEarned: correct ? 10 : 0,
    leaderboardEligible: false,
  });

  if (!correct) {
    db.upsertWrongQuestion(req.user.id, questionId);
  }
  const { xpAwarded } = awardXp(req.user.id, correct ? 10 : 0, 'practice_correct');

  // Transcript: script cua cau (Part 1/2) hoac script/passage cua doan (Part 3/4/6/7).
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
