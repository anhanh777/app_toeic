'use strict';

const express = require('express');
const db = require('../db');
const { toPublicUser, authMiddleware } = require('../auth');

const router = express.Router();

router.patch('/me', authMiddleware, (req, res) => {
  const { name, targetScore, hideOnLeaderboard } = req.body || {};
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: 'ten khong hop le' });
  }
  if (
    targetScore !== undefined &&
    (!Number.isInteger(targetScore) || targetScore < 10 || targetScore > 990)
  ) {
    return res.status(400).json({ error: 'targetScore phai tu 10 den 990' });
  }
  if (hideOnLeaderboard !== undefined && typeof hideOnLeaderboard !== 'boolean') {
    return res.status(400).json({ error: 'hideOnLeaderboard phai la boolean' });
  }
  const row = db.updateUserProfile(req.user.id, {
    name: name !== undefined ? name.trim() : undefined,
    targetScore,
    hideOnLeaderboard,
  });
  if (!row) return res.status(404).json({ error: 'khong tim thay tai khoan' });
  return res.json({ user: toPublicUser(row) });
});

module.exports = router;
