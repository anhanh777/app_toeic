'use strict';

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { computeStreakDays } = require('../xp');

const router = express.Router();

router.get('/stats/overview', authMiddleware, (req, res) => {
  const userRow = db.findUserById(req.user.id);
  const perPart = db.getUserAnswerStats(req.user.id);
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
  return res.json({
    totalAnswered,
    totalCorrect,
    accuracy,
    byPart,
    weakestPart,
    streakDays: computeStreakDays(req.user.id),
    targetScore: userRow ? userRow.target_score : 650,
    totalXp: db.sumXp(req.user.id),
    recentScores: db.getRecentFullScores(req.user.id, 20),
  });
});

router.get('/stats/history', authMiddleware, (req, res) => {
  const attempts = db.listAttemptsByUser(req.user.id, { limit: 50 });
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
    }))
  );
});

module.exports = router;
