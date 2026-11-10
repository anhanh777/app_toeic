'use strict';

// Thi thu: tao bai (mini/full), autosave tung cau, nop 1 lan roi cham diem.

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { awardXp } = require('../xp');
const { scoreFullTest } = require('../scoring');

const router = express.Router();

const SECTION_OF_PART = { 1: 'listening', 2: 'listening', 3: 'listening', 4: 'listening', 5: 'reading', 6: 'reading', 7: 'reading' };

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
    listeningCorrect,
    readingCorrect,
    listeningScore: attempt.listeningScore,
    readingScore: attempt.readingScore,
    totalScore: attempt.totalScore,
    byPart,
    wrongQuestionIds,
    xpAwarded: attempt.xpEarned || 0,
    leaderboardEligible: attempt.leaderboardEligible,
  };
}

router.post('/tests', authMiddleware, (req, res) => {
  const { mode, part, count, durationMinutes, testSetId, questionIds: bodyQuestionIds } = req.body || {};
  if (mode !== 'mini' && mode !== 'full') {
    return res.status(400).json({ error: 'mode phai la mini hoac full' });
  }
  // Thi theo de: kiem tra de ton tai truoc.
  let testSet = null;
  if (testSetId) {
    testSet = db.getTestSet(testSetId);
    if (!testSet) return res.status(404).json({ error: 'khong tim thay bo de' });
  }
  let questionIds;
  let durationSec;
  let attemptPart = null;
  if (mode === 'mini') {
    const p = parseInt(part, 10);
    if (!Number.isInteger(p) || p < 1 || p > 7) {
      return res.status(400).json({ error: 'mini test can part tu 1 den 7' });
    }
    const bank = testSetId
      ? db.listQuestions({ testSetId, part: p, limit: 200, offset: 0 }).items
      : db.getQuestionsByPart(p);
    if (!bank.length) return res.status(400).json({ error: 'Part nay chua co cau hoi' });
    const n = count === undefined ? 10 : parseInt(count, 10);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: 'count phai la so nguyen >= 1' });
    }
    questionIds = shuffle(bank.map((q) => q.id)).slice(0, Math.min(n, bank.length));
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
      const all = db.getAllQuestionsOrdered();
      if (!all.length) return res.status(400).json({ error: 'chua co cau hoi nao' });
      questionIds = all.map((q) => q.id);
    }
    if (!questionIds.length) return res.status(400).json({ error: 'chua co cau hoi nao' });
    // Mac dinh 120 phut; durationMinutes chi de smoke-test, frontend luon dung 120.
    durationSec = durationMinutes ? Math.round(durationMinutes * 60) : 7200;
  }
  const attempt = db.createAttempt({
    userId: req.user.id,
    mode,
    part: attemptPart,
    questionIds,
    durationSec,
    testSetId: testSet ? testSet.id : null,
  });
  return res.status(201).json({
    attemptId: attempt.id,
    testSetId: attempt.testSetId,
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
  db.upsertAnswer(attempt.id, questionId, selected.trim().toUpperCase(), null);
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
    const correctOpt = q.options.find((o) => o.is_correct === 1);
    const isCorrect = !!(
      ans &&
      ans.selected &&
      correctOpt &&
      ans.selected.toUpperCase() === correctOpt.label
    );
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
  if (attempt.mode === 'full') {
    // Chi de full moi co du ca 2 phan de quy doi 10-990 (diem uoc luong).
    const scored = scoreFullTest(listeningCorrect, listeningTotal, readingCorrect, readingTotal);
    listeningScore = scored.listeningScore;
    readingScore = scored.readingScore;
    totalScore = scored.totalScore;
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
    return {
      questionId: qid,
      part: q.part,
      content: q.content,
      passageId: q.passageId,
      passageTitle: q.passageTitle,
      passageText: q.passageText,
      script: q.script,
      options: q.options,
      selected: ans ? ans.selected : null,
      correct: ans ? ans.isCorrect : null,
      correctLabel: q.correct,
      explanation: q.explanation,
      topic: q.topic,
      difficulty: q.difficulty,
    };
  });
  return res.json({ ...summary, startedAt: attempt.startedAt, finishedAt: attempt.finishedAt, durationSec: attempt.durationSec, detail });
});

router.get('/tests/history', authMiddleware, (req, res) => {
  const attempts = db.listAttemptsByUser(req.user.id, { modes: ['mini', 'full'], limit: 50 });
  return res.json(
    attempts.map((a) => ({
      id: a.id,
      mode: a.mode,
      part: a.part,
      questionCount: a.questionIds.length,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      durationSec: a.durationSec,
      listeningCorrect: a.listeningCorrect,
      readingCorrect: a.readingCorrect,
      listeningScore: a.listeningScore,
      readingScore: a.readingScore,
      totalScore: a.totalScore,
      xpEarned: a.xpEarned,
      leaderboardEligible: a.leaderboardEligible,
    }))
  );
});

module.exports = router;
