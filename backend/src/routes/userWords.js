'use strict';

/**
 * userWords.js — tu vung ca nhan ("Tu cua toi"): tu nguoi hoc luu khi
 * tra tu trong doan van, hoac tu them tay. Tat ca endpoint can dang
 * nhap va chi thao tac tren tu cua chinh user do (owner-only).
 */

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { awardXp } = require('../xp');
const { normalizeWordInput, isValidWordInput } = require('../wordUtils');

const router = express.Router();
const STATUSES = new Set(['learning', 'learned', 'wrong']);
const VOCAB_REVIEW_XP = 2;
const VOCAB_XP_DAILY_CAP = 20;
const VOCAB_REVIEW_REASON = 'vocab_review';
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

/** Hang doi on tap hom nay: cac tu den han (total = tat ca, items = trang dau). */
router.get('/user-words/due', authMiddleware, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  return res.json({
    total: db.countDueUserWords(req.user.id),
    items: db.listDueUserWords(req.user.id, limit),
  });
});

/** Dot A — exposure: client goi nen khi user gap lai cac tu trong bai
 * luyen. Moi tu +2 mastery, toi da 1 lan/ngay. Body sai/rong tra ket
 * qua rong (khong loi) vi day la cuoc goi nen. */
router.post('/user-words/exposure', authMiddleware, (req, res) => {
  const wordIds = req.body && req.body.wordIds;
  if (!Array.isArray(wordIds) || wordIds.length === 0) {
    return res.json({ updated: [], skipped: [] });
  }
  return res.json(db.applyExposure(req.user.id, wordIds));
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
  // Danh dau tay cung la 1 buoc on tap (khong cong XP):
  // "Da thuoc" = on dung (len bac, trang thai theo y nguoi hoc),
  // "Chua thuoc" = on sai (ve 1 ngay). "Dang hoc" chi doi trang thai.
  if (status === 'learned') return res.json(db.reviewUserWord(row.id, true, 'learned'));
  if (status === 'wrong') return res.json(db.reviewUserWord(row.id, false));
  return res.json(db.markUserWord(row.id, status));
});

/** Nop 1 luot on tap tu phien kiem tra: dung +5 diem / +2 XP (tran 20 XP/ngay). */
router.post('/user-words/:id/review', authMiddleware, (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  const correct = req.body && req.body.correct;
  if (typeof correct !== 'boolean') {
    return res.status(400).json({ error: 'correct phai la true hoac false' });
  }
  const updated = db.reviewUserWord(row.id, correct);
  let xpAwarded = 0;
  let xpCapped = false;
  if (correct) {
    const todayXp = db.sumXpTodayByReason(req.user.id, VOCAB_REVIEW_REASON);
    if (todayXp + VOCAB_REVIEW_XP <= VOCAB_XP_DAILY_CAP) {
      const r = awardXp(req.user.id, VOCAB_REVIEW_XP, VOCAB_REVIEW_REASON);
      xpAwarded = r.xpAwarded;
    } else {
      xpCapped = true;
    }
  }
  return res.json({ word: updated, xpAwarded, xpCapped });
});

/* ---------------- Dot A: cau tu dat (user_word_sentences) ---------------- */

/** Lay cau tu dat cua 1 tu, moi nhat truoc. */
router.get('/user-words/:id/sentences', authMiddleware, (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  return res.json({ items: db.listWordSentences(row.id) });
});

/** Viet 1 cau dung tu do. Cau phai chua tu (kiem tra long: chuoi con,
 * khong phan biet hoa/thuong), toi da 1000 ky tu. */
router.post('/user-words/:id/sentences', authMiddleware, (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  const sentence = typeof (req.body && req.body.sentence) === 'string' ? req.body.sentence.trim() : '';
  if (!sentence || sentence.length > 1000) {
    return res.status(400).json({ error: 'cau_khong_hop_le', message: 'Câu không được để trống và tối đa 1000 ký tự.' });
  }
  if (!sentence.toLowerCase().includes(row.word.toLowerCase())) {
    return res.status(400).json({ error: 'cau_chua_co_tu', message: `Câu của bạn chưa có từ "${row.word}".` });
  }
  return res.status(201).json(db.insertWordSentence(req.user.id, row.id, sentence));
});

/** Lay 1 cau cua chinh user nay va thuoc ve tu :id (404 neu khong dung). */
function loadOwnedSentence(req, res, wordId) {
  const sentenceId = parseInt(req.params.sentenceId, 10);
  if (!Number.isInteger(sentenceId)) {
    res.status(404).json({ error: 'khong tim thay cau' });
    return null;
  }
  const sentence = db.getWordSentenceByIdAndUser(sentenceId, req.user.id);
  if (!sentence || sentence.wordId !== wordId) {
    res.status(404).json({ error: 'khong tim thay cau' });
    return null;
  }
  return sentence;
}

/** Tu danh gia cau: 'good' cong +5 mastery cho tu (chi 1 lan/cau),
 * 'not_yet' chi doi nhan. */
router.post('/user-words/:id/sentences/:sentenceId/mark', authMiddleware, (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  const sentence = loadOwnedSentence(req, res, row.id);
  if (!sentence) return;
  const mark = req.body && req.body.mark;
  if (mark !== 'good' && mark !== 'not_yet') {
    return res.status(400).json({ error: 'mark phai la good hoac not_yet' });
  }
  return res.json(db.markWordSentence(sentence.id, mark));
});

router.delete('/user-words/:id/sentences/:sentenceId', authMiddleware, (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  const sentence = loadOwnedSentence(req, res, row.id);
  if (!sentence) return;
  db.deleteWordSentence(sentence.id);
  return res.json({ ok: true });
});

module.exports = router;
