'use strict';

/**
 * auth.js — JWT + bcrypt + middleware xac thuc.
 * Khong chua SQL (SQL nam o db.js). Google ID token duoc verify o routes/auth.js.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '7d';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/** Loai bo truong nhay cam truoc khi tra user ra ngoai. */
function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role || 'user',
    targetScore: row.target_score != null ? row.target_score : 650,
    googleId: row.google_id || null,
    avatarUrl: row.avatar_url || null,
    hideOnLeaderboard: row.hide_on_leaderboard === 1,
    createdAt: row.created_at,
  };
}

/** Middleware: yeu cau Bearer JWT hop le. Gan req.user = {id, email, role}. */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    req.user = { id: payload.id, email: payload.email, role: payload.role || 'user' };
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

/** Middleware: chi admin. Dung sau authMiddleware. */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  toPublicUser,
  authMiddleware,
  requireAdmin,
};
