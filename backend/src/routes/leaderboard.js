'use strict';

// Bang xep hang: 2 bang (diem thi thu full / XP), 3 tab (tuan / thang / moi luc).

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

function periodStartIso(tab) {
  const now = new Date();
  if (tab === 'week') {
    // Tuan hien tai, bat dau thu Hai 00:00 UTC.
    const day = now.getUTCDay(); // 0 = Chu nhat
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday));
    return monday.toISOString();
  }
  if (tab === 'month') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  }
  return null; // all
}

router.get('/leaderboard', authMiddleware, (req, res) => {
  const metric = req.query.metric === 'xp' ? 'xp' : 'score';
  const tab = ['week', 'month', 'all'].includes(req.query.tab) ? req.query.tab : 'all';
  const since = periodStartIso(tab);

  const usersById = new Map(db.listAllUsersPublic().map((u) => [u.id, u]));
  const visible = (u) => u && !u.hideOnLeaderboard;

  let ranked = [];
  if (metric === 'score') {
    // Bang diem: diem full-test cao nhat cua moi user trong khoang, chi bai hop le.
    const best = db.getBestFullScores(since);
    ranked = best
      .filter((b) => visible(usersById.get(b.userId)))
      .map((b, i) => {
        const u = usersById.get(b.userId);
        return {
          rank: i + 1,
          userId: b.userId,
          name: u.name || u.email,
          avatarUrl: u.avatarUrl,
          score: b.score,
          xp: db.sumXp(b.userId, since),
          answered: db.countAnsweredByUser(b.userId),
        };
      });
  } else {
    // Bang XP: tong xp_events trong khoang.
    const totals = db.getXpTotals(since);
    ranked = totals
      .filter((t) => t.xp > 0 && visible(usersById.get(t.userId)))
      .map((t, i) => {
        const u = usersById.get(t.userId);
        return {
          rank: i + 1,
          userId: t.userId,
          name: u.name || u.email,
          avatarUrl: u.avatarUrl,
          score: null,
          xp: t.xp,
          answered: db.countAnsweredByUser(t.userId),
        };
      });
  }

  // Vi tri cua minh: co trong bang thi lay hang do; khong co thi rank null
  // nhung van tra score/xp cua minh trong khoang.
  const meRow = ranked.find((e) => e.userId === req.user.id);
  let me;
  if (meRow) {
    me = { rank: meRow.rank, score: meRow.score, xp: meRow.xp };
  } else if (metric === 'score') {
    const mine = db.getBestFullScores(since).find((b) => b.userId === req.user.id);
    me = { rank: null, score: mine ? mine.score : null, xp: db.sumXp(req.user.id, since) };
  } else {
    me = { rank: null, score: null, xp: db.sumXp(req.user.id, since) };
  }

  return res.json({ metric, tab, entries: ranked, me });
});

module.exports = router;
