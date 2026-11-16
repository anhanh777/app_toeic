'use strict';

const express = require('express');
const db = require('../db');
const { toPublicUser, authMiddleware } = require('../auth');

const router = express.Router();

router.patch('/me', authMiddleware, (req, res) => {
  const { name, targetScore, hideOnLeaderboard, avatarUrl } = req.body || {};
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
  // avatarUrl: null = gỡ ảnh; string = URL https (thường là Cloudinary sau khi upload).
  if (avatarUrl !== undefined && avatarUrl !== null) {
    if (typeof avatarUrl !== 'string' || avatarUrl.length > 500) {
      return res.status(400).json({ error: 'avatarUrl khong hop le' });
    }
    try {
      const u = new URL(avatarUrl.trim());
      if (u.protocol !== 'https:') throw new Error('not https');
    } catch (_) {
      return res.status(400).json({ error: 'avatarUrl phai la URL https' });
    }
  }
  const row = db.updateUserProfile(req.user.id, {
    name: name !== undefined ? name.trim() : undefined,
    targetScore,
    hideOnLeaderboard,
    avatarUrl: avatarUrl === undefined ? undefined : (avatarUrl === null ? null : avatarUrl.trim()),
  });
  if (!row) return res.status(404).json({ error: 'khong tim thay tai khoan' });
  return res.json({ user: toPublicUser(row) });
});

module.exports = router;
