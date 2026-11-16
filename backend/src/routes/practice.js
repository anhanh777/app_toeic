'use strict';

// Luyen tap: tra loi 1 cau -> cham ngay, hien giai thich + transcript sau khi tra loi.

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { awardXp } = require('../xp');
const { gradeTypedAnswer, isTypedType } = require('../ieltsGrading');

const router = express.Router();

router.post('/practice/answer', authMiddleware, (req, res) => {
  const { questionId, selected } = req.body || {};
  if (!questionId || typeof selected !== 'string') {
    return res.status(400).json({ error: 'thieu questionId hoac selected' });
  }
  const q = db.getQuestionRowById(questionId);
  if (!q) return res.status(404).json({ error: 'khong tim thay cau hoi' });
  const exam = q.exam || 'toeic';
  const typed = isTypedType(q.question_type);
  let correct;
  let correctLabel = null;
  let correctText = null;
  let storedSelected;
  if (typed) {
    // Cau dien tu: selected la text tu do; kiem tra gioi han tu TRUOC khi
    // cham — qua gioi han thi 400, khong ghi attempt/cau sai.
    const graded = gradeTypedAnswer(selected, q.correct_text, q.acceptedAnswers, q.word_limit);
    if (graded.overLimit) {
      return res.status(400).json({ error: 'vuot_gioi_han_tu' });
    }
    correct = graded.correct;
    correctText = q.correct_text || null;
    storedSelected = selected.trim();
  } else {
    const selectedUpper = selected.trim().toUpperCase();
    const correctOpt = q.options.find((o) => o.is_correct === 1);
    if (!correctOpt) return res.status(500).json({ error: 'cau hoi chua co dap an dung' });
    if (!q.options.some((o) => o.label === selectedUpper)) {
      return res.status(400).json({ error: 'selected phai la A, B, C hoac D' });
    }
    correct = selectedUpper === correctOpt.label;
    correctLabel = correctOpt.label;
    storedSelected = selectedUpper;
  }

  // Luu lich su luyen tap: 1 attempt mode='practice' cho moi cau (de thong ke
  // theo Part / streak / lich su). Diem thi chi tinh tu attempt mode mini/full.
  const attempt = db.createAttempt({
    userId: req.user.id,
    mode: 'practice',
    part: q.part,
    questionIds: [questionId],
    durationSec: 0,
    exam,
  });
  db.upsertAnswer(attempt.id, questionId, storedSelected, correct);
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
    correctLabel,
    ...(typed ? { correctText } : {}),
    explanation: q.explanation || null,
    transcript,
    xpAwarded,
  });
});

module.exports = router;
