'use strict';

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { awardXp } = require('../xp');
const { gradeTypedAnswer, isTypedType, gradeListSelection, isMultiAnswerType, parseSelectedLabels } = require('../ieltsGrading');

const router = express.Router();

router.get('/wrong-questions', authMiddleware, (req, res) => {
  const part = req.query.part ? parseInt(req.query.part, 10) : undefined;
  if (req.query.part && (!Number.isInteger(part) || part < 1 || part > 7)) {
    return res.status(400).json({ error: 'part phai tu 1 den 7' });
  }
  const exam = req.query.exam === 'ielts' ? 'ielts' : req.query.exam === 'toeic' ? 'toeic' : undefined;
  // Đợt 3 (Ý 4): lọc thêm theo dạng câu hỏi / đề vừa thi (optional).
  const questionType = typeof req.query.questionType === 'string' && req.query.questionType ? req.query.questionType : undefined;
  const testSetId = typeof req.query.testSetId === 'string' && req.query.testSetId ? req.query.testSetId : undefined;
  // Cau hoi tra ve da redact (khong co dap an dung / giai thich).
  return res.json(db.listWrongQuestions(req.user.id, part, exam, questionType, testSetId));
});

router.post('/wrong-questions/:questionId/review', authMiddleware, (req, res) => {
  const { questionId } = req.params;
  const { selected } = req.body || {};
  if (typeof selected !== 'string') {
    return res.status(400).json({ error: 'thieu selected' });
  }
  const q = db.getQuestionRowById(questionId);
  if (!q) return res.status(404).json({ error: 'khong tim thay cau hoi' });
  let correct;
  let correctLabel = null;
  let correctText = null;
  const typed = isTypedType(q.question_type);
  if (typed) {
    const graded = gradeTypedAnswer(selected, q.correct_text, q.acceptedAnswers, q.word_limit);
    if (graded.overLimit) {
      return res.status(400).json({ error: 'vuot_gioi_han_tu' });
    }
    correct = graded.correct;
    correctText = q.correct_text || null;
  } else if (isMultiAnswerType(q.question_type)) {
    // list_selection: nhu practice.js — nop sai dinh dang van cham sai, khong 400.
    const correctLabels = q.options.filter((o) => o.is_correct === 1).map((o) => o.label);
    if (!correctLabels.length) return res.status(500).json({ error: 'cau hoi chua co dap an dung' });
    const picked = parseSelectedLabels(selected);
    const validLabels = new Set(q.options.map((o) => o.label));
    const validPick =
      picked.length >= 2 && picked.length <= 3 && picked.every((l) => validLabels.has(l));
    correct = validPick && gradeListSelection(selected, correctLabels).correct;
    correctLabel = correctLabels.join(', ');
  } else {
    const correctOpt = q.options.find((o) => o.is_correct === 1);
    if (!correctOpt) return res.status(500).json({ error: 'cau hoi chua co dap an dung' });
    correct = selected.trim().toUpperCase() === correctOpt.label;
    correctLabel = correctOpt.label;
  }
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
    correctLabel,
    ...(typed ? { correctText } : {}),
    explanation: q.explanation || null,
    transcript,
    xpAwarded,
  });
});

module.exports = router;
