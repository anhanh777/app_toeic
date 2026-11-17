'use strict';

/**
 * userWords.js — tu vung ca nhan ("Tu cua toi"): tu nguoi hoc luu khi
 * tra tu trong doan van, hoac tu them tay. Tat ca endpoint can dang
 * nhap va chi thao tac tren tu cua chinh user do (owner-only).
 */

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { normalizeWordInput, isValidWordInput } = require('../wordUtils');

const router = express.Router();
const STATUSES = new Set(['learning', 'learned', 'wrong']);
const MAX_LEN = { phonetic: 100, pos: 50, meaning: 500, example: 1000, context: 1000, topic: 100 };

/** Chuoi tuy chon: undefined neu khong gui, null neu sai dinh dang, chuoi (co the rong = xoa) neu hop le. */
function optStr(v, max) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') return null;
  if (v.trim().length > max) return null;
  return v.trim();
}

function loadOwned(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'khong tim thay tu' });
    return null;
  }
  const row = db.getUserWordByIdAndUser(id, req.user.id);
  if (!row) {
    res.status(404).json({ error: 'khong tim thay tu' });
    return null;
  }
  return row;
}

router.get('/user-words', authMiddleware, (req, res) => {
  const status = STATUSES.has(req.query.status) ? req.query.status : undefined;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  return res.json(db.listUserWords(req.user.id, { status, limit, offset }));
});

router.post('/user-words', authMiddleware, (req, res) => {
  const body = req.body || {};
  const word = normalizeWordInput(body.word);
  if (!isValidWordInput(word)) {
    return res.status(400).json({ error: 'tu_khong_hop_le', message: 'Từ không hợp lệ (từ/cụm từ tiếng Anh, tối đa 3 từ).' });
  }
  const meaning = optStr(body.meaning, MAX_LEN.meaning);
  if (!meaning) {
    return res.status(400).json({ error: 'thieu_nghia', message: 'Từ cần có nghĩa tiếng Việt.' });
  }
  const fields = {
    phonetic: optStr(body.phonetic, MAX_LEN.phonetic),
    pos: optStr(body.pos, MAX_LEN.pos),
    example: optStr(body.example, MAX_LEN.example),
    context: optStr(body.context, MAX_LEN.context),
    topic: optStr(body.topic, MAX_LEN.topic),
  };
  if (Object.values(fields).includes(null)) {
    return res.status(400).json({ error: 'truong_khong_hop_le', message: 'Có trường vượt quá độ dài cho phép.' });
  }
  const existing = db.getUserWordByWord(req.user.id, word);
  if (existing) return res.json({ ...existing, existed: true });
  const row = db.insertUserWord(req.user.id, { word, meaning, ...fields });
  return res.status(201).json(row);
});

router.put('/user-words/:id', authMiddleware, (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  const body = req.body || {};
  const fields = {
    phonetic: optStr(body.phonetic, MAX_LEN.phonetic),
    pos: optStr(body.pos, MAX_LEN.pos),
    meaning: optStr(body.meaning, MAX_LEN.meaning),
    example: optStr(body.example, MAX_LEN.example),
    context: optStr(body.context, MAX_LEN.context),
    topic: optStr(body.topic, MAX_LEN.topic),
  };
  if (Object.values(fields).includes(null)) {
    return res.status(400).json({ error: 'truong_khong_hop_le', message: 'Có trường vượt quá độ dài cho phép.' });
  }
  if (fields.meaning !== undefined && !fields.meaning) {
    return res.status(400).json({ error: 'thieu_nghia', message: 'Nghĩa không được để trống.' });
  }
  const patch = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) patch[k] = v === '' ? null : v;
  return res.json(db.updateUserWord(row.id, patch));
});

router.delete('/user-words/:id', authMiddleware, (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  db.deleteUserWord(row.id);
  return res.json({ ok: true });
});

router.post('/user-words/:id/mark', authMiddleware, (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  const status = req.body && req.body.status;
  if (!STATUSES.has(status)) {
    return res.status(400).json({ error: 'status phai la learning, learned hoac wrong' });
  }
  return res.json(db.markUserWord(row.id, status));
});

module.exports = router;
