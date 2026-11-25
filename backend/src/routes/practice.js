'use strict';

// Luyen tap: tra loi 1 cau -> cham ngay, hien giai thich + transcript sau khi tra loi.

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { awardXp } = require('../xp');
const { gradeTypedAnswer, isTypedType, gradeListSelection, isMultiAnswerType, parseSelectedLabels } = require('../ieltsGrading');

const router = express.Router();

router.post('/practice/answer', authMiddleware, (req, res) => {
  const { questionId, selected, reveal } = req.body || {};
  if (!questionId || (typeof selected !== 'string' && reveal !== true)) {
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
  // Diem tung phan: list_selection (Choose TWO/THREE) marks = so nhan dung,
  // maxMarks = so nhan yeu cau (2/3); dang khac marks = correct ? 1 : 0.
  // `correct` (dung HET) van quyet dinh XP + cau sai — dung 1 phan thi
  // van vao cau sai de on lai, nhung van duoc diem vao band.
  let marks = null;
  let maxMarks = 1;
  // Reveal: cau de trong sau khi nop tat ca — tra dap an dung + giai
  // thich ma KHONG ghi attempt/dap an/cau sai/XP. Frontend chi goi sau
  // khi da nop (submit-all), cho cau chua lam, de hien giai thich.
  if (reveal === true && (selected == null || selected === '')) {
    if (typed) {
      correctText = q.correct_text || null;
      marks = 0;
      maxMarks = 1;
    } else if (isMultiAnswerType(q.question_type)) {
      const correctLabels = q.options.filter((o) => o.is_correct === 1).map((o) => o.label);
      if (!correctLabels.length) return res.status(500).json({ error: 'cau hoi chua co dap an dung' });
      correctLabel = correctLabels.join(', ');
      marks = 0;
      maxMarks = correctLabels.length;
    } else {
      const correctOpt = q.options.find((o) => o.is_correct === 1);
      if (!correctOpt) return res.status(500).json({ error: 'cau hoi chua co dap an dung' });
      correctLabel = correctOpt.label;
      marks = 0;
      maxMarks = 1;
    }
    let transcript = q.script || null;
    if (!transcript && q.passage_id) {
      const passage = db.getPassage(q.passage_id);
      transcript = (passage && passage.script) || null;
    }
    return res.json({
      correct: false,
      correctLabel,
      ...(typed ? { correctText } : {}),
      ...(isMultiAnswerType(q.question_type) ? { marks, maxMarks } : {}),
      explanation: q.explanation || null,
      transcript,
      xpAwarded: 0,
    });
  }
  if (typed) {
    // Cau dien tu: selected la text tu do; kiem tra gioi han tu TRUOC khi
    // cham — qua gioi han thi 400, khong ghi attempt/cau sai.
    const graded = gradeTypedAnswer(selected, q.correct_text, q.acceptedAnswers, q.word_limit);
    if (graded.overLimit) {
      return res.status(400).json({ error: 'vuot_gioi_han_tu' });
    }
    correct = graded.correct;
    marks = correct ? 1 : 0;
    correctText = q.correct_text || null;
    storedSelected = selected.trim();
  } else if (isMultiAnswerType(q.question_type)) {
    // list_selection: chon 2-3 nhan, cham TUNG PHAN theo tap nhan
    // (gradeListSelection): chon thua so nhan yeu cau hoac nhan la thi 0
    // diem; chon it hon thi moi nhan dung duoc 1 diem.
    const correctLabels = q.options.filter((o) => o.is_correct === 1).map((o) => o.label);
    if (!correctLabels.length) return res.status(500).json({ error: 'cau hoi chua co dap an dung' });
    const graded = gradeListSelection(selected, correctLabels, q.options.map((o) => o.label));
    correct = graded.correct;
    marks = graded.marks;
    maxMarks = graded.maxMarks;
    correctLabel = correctLabels.join(', ');
    storedSelected = parseSelectedLabels(selected).join(',');
  } else {
    const selectedUpper = selected.trim().toUpperCase();
    const correctOpt = q.options.find((o) => o.is_correct === 1);
    if (!correctOpt) return res.status(500).json({ error: 'cau hoi chua co dap an dung' });
    if (!q.options.some((o) => o.label === selectedUpper)) {
      return res.status(400).json({ error: 'selected phai la A, B, C hoac D' });
    }
    correct = selectedUpper === correctOpt.label;
    marks = correct ? 1 : 0;
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
  db.upsertAnswer(attempt.id, questionId, storedSelected, correct, marks, maxMarks);
  const isListening = q.part >= 1 && q.part <= 4;
  db.finishAttempt(attempt.id, {
    finishedAt: new Date().toISOString(),
    durationSec: 0,
    // Luyen 1 cau: diem dung = marks (list_selection dung 1 phan van duoc
    // diem do; dang khac marks = correct ? 1 : 0).
    listeningCorrect: isListening ? marks : null,
    readingCorrect: !isListening ? marks : null,
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

  // Transcript: CHI script that (ban thu am) cua cau (Part 1/2) hoac
  // script cua doan (Part 3/4/6/7). KHONG fallback ve passage.content /
  // passage_text: o TOEIC Part 3/4 do la bang/hinh minh hoa kem theo
  // (danh sach dien vien, gio tau...) chu KHONG phai loi thoai — gan nhan
  // "Transcript:" cho no la sai (audit 19/11). Bang do van hien san o dau
  // khoi cau hoi nen khong mat thong tin khi bo fallback. IELTS Listening:
  // script la audioscript that cua ca Section nen nhan giu nguyen.
  let transcript = q.script || null;
  if (!transcript && q.passage_id) {
    const passage = db.getPassage(q.passage_id);
    transcript = (passage && passage.script) || null;
  }

  return res.json({
    correct,
    correctLabel,
    ...(typed ? { correctText } : {}),
    ...(isMultiAnswerType(q.question_type) ? { marks, maxMarks } : {}),
    explanation: q.explanation || null,
    transcript,
    xpAwarded,
  });
});

module.exports = router;
