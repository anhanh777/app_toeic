'use strict';

// Bo de thi (test sets): xem danh sach/chi tiet (public) + CRUD/import (admin).

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { validateCloudinaryUrl } = require('./media');
const { authMiddleware, requireAdmin } = require('../auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Chuan 1 de TOEIC 200 cau (ke hoach muc 3.3).
const STANDARD = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
const PARTS = [1, 2, 3, 4, 5, 6, 7];

/** Middleware tuy chon: co token hop le thi gan req.user, khong thi req.user = null. */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  req.user = null;
  if (!match) return next();
  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    req.user = { id: payload.id, email: payload.email, role: payload.role || 'user' };
  } catch (_) {
    req.user = null;
  }
  return next();
}

function partsWithCounts(testSetId) {
  const counts = db.countByPartForTestSet(testSetId);
  const byPart = new Map(counts.map((c) => [c.part, c.count]));
  return PARTS.map((part) => ({ part, count: byPart.get(part) || 0 }));
}

function missingParts(parts) {
  return parts
    .map((p) => ({ part: p.part, missing: Math.max(0, STANDARD[p.part] - p.count) }))
    .filter((m) => m.missing > 0);
}

function progressFor(user, testSet) {
  if (!user) return null;
  const byPartRows = db.getUserProgressByTestSet(user.id, testSet.id);
  const byPartMap = new Map(byPartRows.map((r) => [r.part, r]));
  const byPart = PARTS.map((part) => ({
    part,
    answered: byPartMap.get(part)?.answered || 0,
    correct: byPartMap.get(part)?.correct || 0,
  }));
  const answered = byPart.reduce((s, p) => s + p.answered, 0);
  const correct = byPart.reduce((s, p) => s + p.correct, 0);
  return { byPart, answered, correct, total: testSet.totalQuestions };
}

function serializeTestSet(testSet, user) {
  const parts = partsWithCounts(testSet.id);
  return {
    id: testSet.id,
    title: testSet.title,
    description: testSet.description,
    totalQuestions: testSet.totalQuestions,
    isPublished: testSet.isPublished,
    createdAt: testSet.createdAt,
    parts,
    missing: missingParts(parts),
    progress: progressFor(user, testSet),
  };
}

/* ---------- public ---------- */

router.get('/test-sets', optionalAuth, (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const sets = db.listTestSets({ includeDrafts: !!isAdmin });
  return res.json(sets.map((s) => serializeTestSet(s, req.user)));
});

router.get('/test-sets/:id', optionalAuth, (req, res) => {
  const testSet = db.getTestSet(req.params.id);
  if (!testSet) return res.status(404).json({ error: 'khong tim thay bo de' });
  const isAdmin = req.user && req.user.role === 'admin';
  if (!testSet.isPublished && !isAdmin) {
    return res.status(404).json({ error: 'khong tim thay bo de' });
  }
  return res.json(serializeTestSet(testSet, req.user));
});

/* Audio cap Part (Part 1-4, 1 file cho toan bo Part) — public, khong can dang nhap. */
router.get('/test-sets/:id/part-media', (req, res) => {
  const testSet = db.getTestSet(req.params.id);
  if (!testSet) return res.status(404).json({ error: 'khong tim thay bo de' });
  return res.json(db.getPartMedia(req.params.id));
});

/* ---------- admin ---------- */

router.post('/admin/test-sets', authMiddleware, requireAdmin, (req, res) => {
  const { title, description, isPublished } = req.body || {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'thieu title' });
  }
  const created = db.createTestSet({
    id: db.nextTestSetId(),
    title: title.trim(),
    description: typeof description === 'string' ? description : null,
    isPublished: !!isPublished,
  });
  return res.status(201).json(created);
});

router.put('/admin/test-sets/:id', authMiddleware, requireAdmin, (req, res) => {
  const existing = db.getTestSet(req.params.id);
  if (!existing) return res.status(404).json({ error: 'khong tim thay bo de' });
  const { title, description, isPublished } = req.body || {};
  const fields = {};
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title khong hop le' });
    }
    fields.title = title.trim();
  }
  if (description !== undefined) fields.description = description;
  if (isPublished !== undefined) fields.isPublished = !!isPublished;
  return res.json(db.updateTestSet(req.params.id, fields));
});

router.delete('/admin/test-sets/:id', authMiddleware, requireAdmin, (req, res) => {
  if (req.params.id === 'TS-001') {
    return res.status(400).json({ error: 'khong the xoa de mau' });
  }
  const ok = db.deleteTestSet(req.params.id);
  if (!ok) return res.status(404).json({ error: 'khong tim thay bo de' });
  return res.json({ ok: true });
});

router.post('/admin/test-sets/:id/import', authMiddleware, requireAdmin, (req, res) => {
  const testSet = db.getTestSet(req.params.id);
  if (!testSet) return res.status(404).json({ error: 'khong tim thay bo de' });
  const questions = (req.body || {}).questions;
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'body phai co questions la array' });
  }
  // Tu sinh id cho cau chua co id: TS-xxx-P<part>-<nnn>, khong trung id hien co
  // (ca id trong DB va id cua cac cau khac trong cung batch import).
  const usedIds = new Set(
    questions
      .filter((q) => q && typeof q === 'object' && typeof q.id === 'string' && q.id.trim())
      .map((q) => q.id)
  );
  const prepared = questions.map((q) => {
    if (!q || typeof q !== 'object') return q;
    if (typeof q.id === 'string' && q.id.trim()) return q;
    const part = Number.isInteger(q.part) ? q.part : 0;
    let n = 1;
    let genId;
    do {
      genId = `${testSet.id}-P${part}-${String(n).padStart(3, '0')}`;
      n += 1;
    } while (db.getQuestionById(genId, true) || usedIds.has(genId));
    usedIds.add(genId);
    return { ...q, id: genId };
  });
  const result = db.importTestSetQuestions(testSet.id, prepared);
  return res.json(result);
});

router.post('/admin/test-sets/:id/questions', authMiddleware, requireAdmin, (req, res) => {
  const testSet = db.getTestSet(req.params.id);
  if (!testSet) return res.status(404).json({ error: 'khong tim thay bo de' });
  try {
    const created = db.addQuestionToTestSet(testSet.id, req.body || {});
    return res.status(201).json(created);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

/* ---------- audio cap Part (Part 1-4) ---------- */

router.post('/admin/test-sets/:id/parts/:part/media', authMiddleware, requireAdmin, (req, res) => {
  const testSet = db.getTestSet(req.params.id);
  if (!testSet) return res.status(404).json({ error: 'khong tim thay bo de' });
  const part = Number(req.params.part);
  if (!Number.isInteger(part) || part < 1 || part > 4) {
    return res.status(400).json({ error: 'Chi ho tro audio cap Part cho Part 1 den Part 4' });
  }
  const { audioUrl } = req.body || {};
  const err = validateCloudinaryUrl(audioUrl, 'URL audio');
  if (err) return res.status(400).json({ error: err });
  const saved = db.setPartMedia(testSet.id, part, audioUrl);
  return res.json(saved);
});

/* ---------- them thu cong theo loat (bulk) ---------- */

router.post('/admin/test-sets/:id/questions/bulk', authMiddleware, requireAdmin, (req, res) => {
  const testSet = db.getTestSet(req.params.id);
  if (!testSet) return res.status(404).json({ error: 'khong tim thay bo de' });
  const questions = (req.body || {}).questions;
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'body phai co questions la array' });
  }
  if (questions.length > 200) {
    return res.status(400).json({ error: 'toi da 200 cau hoi moi lan' });
  }
  // Tu sinh id cho cau chua co id: TS-xxx-P<part>-<nnn>, khong trung id hien co
  // (ca id trong DB va id cua cac cau khac trong cung batch) — COPY dung logic
  // cua route import ben tren.
  const usedIds = new Set(
    questions
      .filter((q) => q && typeof q === 'object' && typeof q.id === 'string' && q.id.trim())
      .map((q) => q.id)
  );
  const prepared = questions.map((q) => {
    if (!q || typeof q !== 'object') return q;
    if (typeof q.id === 'string' && q.id.trim()) return q;
    const part = Number.isInteger(q.part) ? q.part : 0;
    let n = 1;
    let genId;
    do {
      genId = `${testSet.id}-P${part}-${String(n).padStart(3, '0')}`;
      n += 1;
    } while (db.getQuestionById(genId, true) || usedIds.has(genId));
    usedIds.add(genId);
    return { ...q, id: genId };
  });
  const result = db.importTestSetQuestions(testSet.id, prepared);
  return res.json(result);
});

module.exports = router;
