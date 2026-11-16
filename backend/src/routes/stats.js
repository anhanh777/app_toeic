'use strict';

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { computeStreakDays } = require('../xp');

const router = express.Router();

router.get('/stats/overview', authMiddleware, (req, res) => {
  const exam = req.query.exam === 'ielts' ? 'ielts' : 'toeic';
  const userRow = db.findUserById(req.user.id);
  const perPart = db.getUserAnswerStats(req.user.id, exam);
  const byPart = [1, 2, 3, 4, 5, 6, 7].map((part) => {
    const found = perPart.find((p) => p.part === part);
    const answered = found ? found.answered : 0;
    const correct = found ? found.correct : 0;
    return {
      part,
      answered,
      correct,
      accuracy: answered > 0 ? Math.round((correct / answered) * 1000) / 10 : null,
    };
  });
  const totalAnswered = byPart.reduce((s, p) => s + p.answered, 0);
  const totalCorrect = byPart.reduce((s, p) => s + p.correct, 0);
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 1000) / 10 : null;
  let weakestPart = null;
  const attempted = byPart.filter((p) => p.answered > 0);
  if (attempted.length) {
    weakestPart = attempted.reduce((min, p) =>
      p.accuracy < min.accuracy ? p : min
    ).part;
  }
  const byTypeRows = db.getUserAnswerStatsByType(req.user.id, exam);
  const byType = byTypeRows.map((t) => ({
    questionType: t.questionType,
    answered: t.answered,
    correct: t.correct,
    accuracy: t.answered > 0 ? Math.round((t.correct / t.answered) * 1000) / 10 : null,
  }));
  let weakestType = null;
  const attemptedTypes = byType.filter((t) => t.answered > 0);
  if (attemptedTypes.length) {
    weakestType = attemptedTypes.reduce((min, t) =>
      t.accuracy < min.accuracy ? t : min
    ).questionType;
  }
  return res.json({
    exam,
    totalAnswered,
    totalCorrect,
    accuracy,
    byPart,
    weakestPart,
    byType,
    weakestType,
    bandHistory: exam === 'ielts' ? db.getRecentFullBands(req.user.id, 20) : [],
    streakDays: computeStreakDays(req.user.id),
    targetScore: userRow ? userRow.target_score : 650,
    totalXp: db.sumXp(req.user.id),
    recentScores: db.getRecentFullScores(req.user.id, 20),
  });
});

router.get('/stats/history', authMiddleware, (req, res) => {
  const exam = req.query.exam === 'ielts' ? 'ielts' : req.query.exam === 'toeic' ? 'toeic' : undefined;
  const attempts = db.listAttemptsByUser(req.user.id, { limit: 50, exam });
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
    }))
  );
});

module.exports = router;
