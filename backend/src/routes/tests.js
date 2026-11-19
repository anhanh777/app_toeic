'use strict';

// Thi thu: tao bai (mini/full), autosave tung cau, nop 1 lan roi cham diem.

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { awardXp } = require('../xp');
const { scoreFullTest, ieltsBandForSkill, ieltsOverallBand } = require('../scoring');
const { gradeTypedAnswer, isTypedType, gradeListSelection, isMultiAnswerType } = require('../ieltsGrading');

const router = express.Router();

const SECTION_OF_PART = { 1: 'listening', 2: 'listening', 3: 'listening', 4: 'listening', 5: 'reading', 6: 'reading', 7: 'reading' };

function isListeningPart(part) {
  return part >= 1 && part <= 4;
}

function buildSubmitResponse(attempt, answers) {
  const byPartMap = new Map();
  let listeningCorrect = 0;
  let readingCorrect = 0;
  let listeningTotal = 0;
  let readingTotal = 0;
  const wrongQuestionIds = [];
  for (const a of answers) {
    if (a.part == null) continue;
    if (!byPartMap.has(a.part)) byPartMap.set(a.part, { part: a.part, answered: 0, correct: 0, total: 0 });
    const row = byPartMap.get(a.part);
    row.total += 1;
    if (a.isCorrect != null) {
      row.answered += 1;
      if (a.isCorrect) row.correct += 1;
      else wrongQuestionIds.push(a.questionId);
    }
    if (isListeningPart(a.part)) {
      listeningTotal += 1;
      if (a.isCorrect) listeningCorrect += 1;
    } else {
      readingTotal += 1;
      if (a.isCorrect) readingCorrect += 1;
    }
  }
  // Cac cau trong de nhung chua tra loi cung tinh vao total cua tung Part.
  const unanswered = (attempt.questionIds || []).filter(
    (qid) => !answers.some((a) => a.questionId === qid)
  );
  if (unanswered.length) {
    const qs = unanswered
      .map((qid) => db.getQuestionRowById(qid))
      .filter(Boolean);
    for (const q of qs) {
      if (!byPartMap.has(q.part)) byPartMap.set(q.part, { part: q.part, answered: 0, correct: 0, total: 0 });
      byPartMap.get(q.part).total += 1;
      if (isListeningPart(q.part)) listeningTotal += 1;
      else readingTotal += 1;
    }
  }
  const byPart = [...byPartMap.values()].sort((a, b) => a.part - b.part);
  return {
    attemptId: attempt.id,
    mode: attempt.mode,
    exam: attempt.exam || 'toeic',
    listeningCorrect,
    readingCorrect,
    listeningScore: attempt.listeningScore,
    readingScore: attempt.readingScore,
    totalScore: attempt.totalScore,
    listeningBand: attempt.listeningBand != null ? attempt.listeningBand : null,
    readingBand: attempt.readingBand != null ? attempt.readingBand : null,
    overallBand: attempt.overallBand != null ? attempt.overallBand : null,
    byPart,
    wrongQuestionIds,
    xpAwarded: attempt.xpEarned || 0,
    leaderboardEligible: attempt.leaderboardEligible,
  };
}

router.post('/tests', authMiddleware, (req, res) => {
  const { mode, part, count, durationMinutes, testSetId, questionIds: bodyQuestionIds, exam: bodyExam } = req.body || {};
  if (mode !== 'mini' && mode !== 'full') {
    return res.status(400).json({ error: 'mode phai la mini hoac full' });
  }
  // Thi theo de: kiem tra de ton tai truoc.
  let testSet = null;
  if (testSetId) {
    testSet = db.getTestSet(testSetId);
    if (!testSet) return res.status(404).json({ error: 'khong tim thay bo de' });
  }
  const exam = testSet ? (testSet.exam || 'toeic') : (bodyExam === 'ielts' ? 'ielts' : 'toeic');
  let questionIds;
  let durationSec;
  let attemptPart = null;
  if (mode === 'mini') {
    const p = parseInt(part, 10);
    if (!Number.isInteger(p) || p < 1 || p > 7) {
      return res.status(400).json({ error: 'mini test can part tu 1 den 7' });
    }
    // Mini: lay TRON 1 Part (Section/Passage) cua 1 de duy nhat, dung du
    // so cau cua Part do trong de — khong tron cau tu nhieu de, khong cat
    // bot. Co testSetId thi dung de do; khong co thi chon ngau nhien 1 de
    // co cau hoi o Part nay. Ap dung cho ca IELTS va TOEIC.
    let bank;
    if (testSetId) {
      bank = db.listQuestions({ testSetId, part: p, limit: 200, offset: 0 }).items;
    } else {
      const all = db.getQuestionsByPart(p, exam);
      const bySet = new Map();
      for (const q of all) {
        if (!q.testSetId) continue;
        if (!bySet.has(q.testSetId)) bySet.set(q.testSetId, []);
        bySet.get(q.testSetId).push(q);
      }
      const setIds = [...bySet.keys()];
      if (!setIds.length) return res.status(400).json({ error: 'Part nay chua co cau hoi' });
      const chosen = setIds[Math.floor(Math.random() * setIds.length)];
      bank = bySet.get(chosen);
      // Ghi nhan de duoc chon vao attempt de hien thi dung de + lay audio
      // dung de (frontend tai part-media theo testSetId tra ve).
      testSet = db.getTestSet(chosen);
    }
    if (!bank.length) return res.status(400).json({ error: 'Part nay chua co cau hoi' });
    questionIds = bank.map((q) => q.id);
    durationSec = durationMinutes ? Math.round(durationMinutes * 60) : 30 * 60;
    attemptPart = p;
  } else {
    if (Array.isArray(bodyQuestionIds) && bodyQuestionIds.length) {
      questionIds = bodyQuestionIds.filter((id) => typeof id === 'string');
    } else if (testSetId) {
      // Thi thu ca de: lay toan bo cau cua de, toi da 200 cau.
      const { items } = db.listQuestions({ testSetId, limit: 200, offset: 0 });
      if (!items.length) return res.status(400).json({ error: 'bo de nay chua co cau hoi' });
      questionIds = items.map((q) => q.id);
    } else {
      const all = db.getAllQuestionsOrdered(exam);
      if (!all.length) return res.status(400).json({ error: 'chua co cau hoi nao' });
      questionIds = all.map((q) => q.id);
    }
    if (!questionIds.length) return res.status(400).json({ error: 'chua co cau hoi nao' });
    // IELTS full mac dinh 90 phut (5400s); TOEIC full 120 phut nhu cu.
    // durationMinutes chi de smoke-test, frontend luon dung mac dinh.
    durationSec = durationMinutes
      ? Math.round(durationMinutes * 60)
      : (exam === 'ielts' ? 5400 : 7200);
  }
  const attempt = db.createAttempt({
    userId: req.user.id,
    mode,
    part: attemptPart,
    questionIds,
    durationSec,
    testSetId: testSet ? testSet.id : null,
    exam,
  });
  return res.status(201).json({
    attemptId: attempt.id,
    testSetId: attempt.testSetId,
    exam: attempt.exam,
    questionIds,
    durationSec,
    startedAt: attempt.startedAt,
  });
});

router.post('/tests/:id/answers', authMiddleware, (req, res) => {
  const attempt = db.getAttempt(parseInt(req.params.id, 10));
  if (!attempt) return res.status(404).json({ error: 'khong tim thay bai thi' });
  if (attempt.userId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (attempt.finishedAt) return res.status(400).json({ error: 'bai thi da nop' });
  const { questionId, selected } = req.body || {};
  if (!questionId || typeof selected !== 'string') {
    return res.status(400).json({ error: 'thieu questionId hoac selected' });
  }
  if (!attempt.questionIds.includes(questionId)) {
    return res.status(400).json({ error: 'cau hoi khong thuoc bai thi nay' });
  }
  // Autosave: chi luu, CHUA cham diem (is_correct = null).
  // Luu selected.trim() KHONG uppercase de khong hong dap an dien tu IELTS;
  // luc cham o submit se uppercase khi so voi nhan MC.
  db.upsertAnswer(attempt.id, questionId, selected.trim(), null);
  return res.json({ ok: true });
});

/** Hủy bài thi chưa nộp (nút Thoát ở MockTest): chỉ chủ bài thi mới hủy
    được; bài đã nộp rồi thì không hủy (đã có kết quả + XP). */
router.delete('/tests/:id', authMiddleware, (req, res) => {
  const attempt = db.getAttempt(parseInt(req.params.id, 10));
  if (!attempt) return res.status(404).json({ error: 'khong tim thay bai thi' });
  if (attempt.userId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (attempt.finishedAt) return res.status(400).json({ error: 'bai thi da nop, khong huy duoc' });
  db.deleteAttempt(attempt.id);
  return res.json({ ok: true });
});

router.post('/tests/:id/submit', authMiddleware, (req, res) => {
  const attempt = db.getAttempt(parseInt(req.params.id, 10));
  if (!attempt) return res.status(404).json({ error: 'khong tim thay bai thi' });
  if (attempt.userId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (attempt.finishedAt) {
    // Da nop roi: tra lai ket qua da luu (tranh cham 2 lan / cong XP 2 lan).
    const answers = db.getAnswersByAttempt(attempt.id);
    return res.json(buildSubmitResponse(attempt, answers));
  }
  const answers = db.getAnswersByAttempt(attempt.id);
  const now = new Date();
  const startedAt = new Date(attempt.startedAt);
  const durationSec = Math.max(0, Math.round((now - startedAt) / 1000));

  // Cham: doi chieu tung dap an da luu voi dap an dung.
  let listeningCorrect = 0;
  let readingCorrect = 0;
  let listeningTotal = 0;
  let readingTotal = 0;
  const wrongQuestionIds = [];
  for (const qid of attempt.questionIds) {
    const q = db.getQuestionRowById(qid);
    if (!q) continue;
    const ans = answers.find((a) => a.questionId === qid);
    let isCorrect;
    if (isTypedType(q.question_type)) {
      // Cau dien tu IELTS: qua word_limit = sai (van ghi cau sai).
      const graded = gradeTypedAnswer(ans ? ans.selected : '', q.correct_text, q.acceptedAnswers, q.word_limit);
      isCorrect = !!(ans && ans.selected && graded.correct);
    } else if (isMultiAnswerType(q.question_type)) {
      // list_selection: all-or-nothing theo tap nhan; moi cau van tinh 1 diem.
      const correctLabels = q.options.filter((o) => o.is_correct === 1).map((o) => o.label);
      isCorrect = !!(
        ans &&
        ans.selected &&
        correctLabels.length &&
        gradeListSelection(ans.selected, correctLabels).correct
      );
    } else {
      const correctOpt = q.options.find((o) => o.is_correct === 1);
      isCorrect = !!(
        ans &&
        ans.selected &&
        correctOpt &&
        ans.selected.toUpperCase() === correctOpt.label
      );
    }
    if (isListeningPart(q.part)) {
      listeningTotal += 1;
      if (isCorrect) listeningCorrect += 1;
    } else {
      readingTotal += 1;
      if (isCorrect) readingCorrect += 1;
    }
    if (ans) {
      db.upsertAnswer(attempt.id, qid, ans.selected, isCorrect);
      if (!isCorrect) {
        wrongQuestionIds.push(qid);
        db.upsertWrongQuestion(req.user.id, qid);
      }
    }
  }

  let listeningScore = null;
  let readingScore = null;
  let totalScore = null;
  let listeningBand = null;
  let readingBand = null;
  let overallBand = null;
  if (attempt.mode === 'full') {
    if (attempt.exam === 'ielts') {
      // IELTS full: tinh band L/R/tong, khong quy doi diem TOEIC 10-990.
      listeningBand = ieltsBandForSkill(listeningCorrect, 'listening');
      readingBand = ieltsBandForSkill(readingCorrect, 'reading');
      overallBand = ieltsOverallBand(listeningBand, readingBand);
    } else {
      // Chi de full moi co du ca 2 phan de quy doi 10-990 (diem uoc luong).
      const scored = scoreFullTest(listeningCorrect, listeningTotal, readingCorrect, readingTotal);
      listeningScore = scored.listeningScore;
      readingScore = scored.readingScore;
      totalScore = scored.totalScore;
    }
  }
  // Chong gian lan bang diem: bai full nop duoi 10 phut thi khong tinh.
  const leaderboardEligible = attempt.mode === 'full' && durationSec >= 600;

  const { xpAwarded } = awardXp(req.user.id, 50, 'mock_completed');
  const finished = db.finishAttempt(attempt.id, {
    finishedAt: now.toISOString(),
    durationSec,
    listeningCorrect,
    readingCorrect,
    listeningScore,
    readingScore,
    totalScore,
    listeningBand,
    readingBand,
    overallBand,
    xpEarned: xpAwarded,
    leaderboardEligible,
  });
  const gradedAnswers = db.getAnswersByAttempt(attempt.id);
  const response = buildSubmitResponse(finished, gradedAnswers);
  response.xpAwarded = xpAwarded;
  return res.json(response);
});

router.get('/tests/:id/result', authMiddleware, (req, res) => {
  const attempt = db.getAttempt(parseInt(req.params.id, 10));
  if (!attempt) return res.status(404).json({ error: 'khong tim thay bai thi' });
  if (attempt.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!attempt.finishedAt) {
    return res.status(400).json({ error: 'bai thi chua nop' });
  }
  const answers = db.getAnswersByAttempt(attempt.id);
  const summary = buildSubmitResponse(attempt, answers);
  const detail = attempt.questionIds.map((qid) => {
    const q = db.getQuestionById(qid, true);
    const ans = answers.find((a) => a.questionId === qid);
    if (!q) return { questionId: qid, selected: ans ? ans.selected : null, correct: null };
    const typed = isTypedType(q.questionType);
    // list_selection: q.correct (mapQuestionAdmin) chi lay nhan dung DAU TIEN
    // nen phai ghep tat ca nhan is_correct; cac dang khac giu nguyen.
    const multi = isMultiAnswerType(q.questionType);
    const correctLabel = multi
      ? (q.options || []).filter((o) => o.isCorrect).map((o) => o.label).join(', ') || null
      : q.correct;
    return {
      questionId: qid,
      exam: q.exam || 'toeic',
      part: q.part,
      questionType: q.questionType,
      wordLimit: q.wordLimit,
      content: q.content,
      passageId: q.passageId,
      passageTitle: q.passageTitle,
      passageText: q.passageText,
      script: q.script,
      options: q.options,
      selected: ans ? ans.selected : null,
      correct: ans ? ans.isCorrect : null,
      correctLabel,
      correctText: typed ? q.correctText : null,
      explanation: q.explanation,
      topic: q.topic,
      difficulty: q.difficulty,
    };
  });
  return res.json({ ...summary, startedAt: attempt.startedAt, finishedAt: attempt.finishedAt, durationSec: attempt.durationSec, detail });
});

router.get('/tests/history', authMiddleware, (req, res) => {
  const exam = req.query.exam === 'ielts' ? 'ielts' : req.query.exam === 'toeic' ? 'toeic' : undefined;
  const attempts = db.listAttemptsByUser(req.user.id, { modes: ['mini', 'full'], limit: 50, exam });
  return res.json(
    attempts.map((a) => ({
      id: a.id,
      mode: a.mode,
      exam: a.exam,
      part: a.part,
      testSetId: a.testSetId,
      questionCount: a.questionIds.length,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      durationSec: a.durationSec,
      listeningCorrect: a.listeningCorrect,
      readingCorrect: a.readingCorrect,
      listeningScore: a.listeningScore,
      readingScore: a.readingScore,
      totalScore: a.totalScore,
      listeningBand: a.listeningBand,
      readingBand: a.readingBand,
      overallBand: a.overallBand,
      xpEarned: a.xpEarned,
      leaderboardEligible: a.leaderboardEligible,
    }))
  );
});

module.exports = router;
