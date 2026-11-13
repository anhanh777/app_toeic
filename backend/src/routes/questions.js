'use strict';

// Cau hoi / doan van — cac GET nay KHONG bao gio tra dap an dung hay giai thich.
// (Admin xem dap an qua /api/admin/questions.)
// Tat ca deu can dang nhap: khach chua dang nhap khong lay duoc de thi/cau hoi.

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

const SECTION = { 1: 'listening', 2: 'listening', 3: 'listening', 4: 'listening', 5: 'reading', 6: 'reading', 7: 'reading' };

router.get('/parts', authMiddleware, (req, res) => {
  const counts = db.countByPart();
  const byPart = new Map(counts.map((c) => [c.part, c.count]));
  const parts = [1, 2, 3, 4, 5, 6, 7].map((part) => ({
    part,
    count: byPart.get(part) || 0,
    section: SECTION[part],
  }));
  return res.json(parts);
});

router.get('/questions', authMiddleware, (req, res) => {
  const part = req.query.part ? parseInt(req.query.part, 10) : undefined;
  if (req.query.part && (!Number.isInteger(part) || part < 1 || part > 7)) {
    return res.status(400).json({ error: 'part phai tu 1 den 7' });
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const search = typeof req.query.search === 'string' && req.query.search.trim()
    ? req.query.search.trim()
    : undefined;
  const testSetId = typeof req.query.testSetId === 'string' && req.query.testSetId.trim()
    ? req.query.testSetId.trim()
    : undefined;
  const { total, items } = db.listQuestions({ part, limit, offset, search, admin: false, testSetId });
  return res.json({ total, limit, offset, items });
});

router.get('/questions/:id', authMiddleware, (req, res) => {
  const q = db.getQuestionById(req.params.id, false);
  if (!q) return res.status(404).json({ error: 'khong tim thay cau hoi' });
  return res.json(q);
});

router.get('/passages/:id', authMiddleware, (req, res) => {
  const p = db.getPassage(req.params.id);
  if (!p) return res.status(404).json({ error: 'khong tim thay doan van' });
  return res.json(p);
});

module.exports = router;
