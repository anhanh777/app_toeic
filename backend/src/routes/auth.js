'use strict';

const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const { hashPassword, comparePassword, signToken, toPublicUser, authMiddleware } = require('../auth');

const router = express.Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: 'email khong hop le' });
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'mat khau phai co it nhat 6 ky tu' });
  }
  if (db.findUserByEmail(email)) {
    return res.status(400).json({ error: 'email da duoc dang ky' });
  }
  const row = db.createUser({
    email,
    passwordHash: hashPassword(password),
    name: name || email.split('@')[0],
    role: 'user',
  });
  const user = toPublicUser(row);
  return res.status(201).json({ token: signToken(user), user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email) || typeof password !== 'string') {
    return res.status(400).json({ error: 'email hoac mat khau khong hop le' });
  }
  const row = db.findUserByEmail(email);
  if (!row || !comparePassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'email hoac mat khau khong dung' });
  }
  const user = toPublicUser(row);
  return res.json({ token: signToken(user), user });
});

router.post('/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(501).json({ error: 'google_not_configured' });
  }
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'thieu idToken' });
  let payload;
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    payload = ticket.getPayload();
  } catch (_) {
    return res.status(401).json({ error: 'idToken Google khong hop le' });
  }
  if (!payload || !payload.email) {
    return res.status(401).json({ error: 'idToken Google khong hop le' });
  }
  // 1) Da lien ket google_id -> dang nhap thang. 2) Trung email -> lien ket.
  // 3) Chua co -> tao tai khoan moi (khong co mat khau).
  let row = db.findUserByGoogleId(payload.sub);
  if (!row) {
    row = db.findUserByEmail(payload.email);
    if (row) {
      row = db.linkGoogleAccount(row.id, payload.sub, payload.picture || null);
    }
  }
  if (!row) {
    row = db.createUser({
      email: payload.email,
      passwordHash: null,
      name: payload.name || payload.email.split('@')[0],
      role: 'user',
      googleId: payload.sub,
      avatarUrl: payload.picture || null,
    });
  }
  const user = toPublicUser(row);
  return res.json({ token: signToken(user), user });
});

router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'mat khau moi phai co it nhat 6 ky tu' });
  }
  const row = db.findUserById(req.user.id);
  if (!row) return res.status(404).json({ error: 'khong tim thay tai khoan' });
  if (!row.password_hash) {
    return res.status(400).json({ error: 'tai khoan Google chua dat mat khau' });
  }
  if (!comparePassword(currentPassword, row.password_hash)) {
    return res.status(401).json({ error: 'mat khau hien tai khong dung' });
  }
  db.updateUserPassword(req.user.id, hashPassword(newPassword));
  return res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => {
  const row = db.findUserById(req.user.id);
  if (!row) return res.status(404).json({ error: 'khong tim thay tai khoan' });
  return res.json({ user: toPublicUser(row) });
});

module.exports = router;
