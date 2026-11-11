'use strict';

// Nhan dien dap an (Answer Key) cho bo de: admin upload 1 file dap an rieng
// (.txt/.docx/.pdf/.png/.jpg/.jpeg) -> tra ve bang dap an JSON de admin
// xem truoc / ap dung vao cac cau da nhan dien, KHONG tu luu vao DB o buoc
// nay (luu bang endpoint /admin/test-sets/:id/import nhu binh thuong).
//
// Luong tiet kiem han muc Gemini (han muc Free de het 429, chi goi AI khi
// that su can):
//   1. File text -> doc bang regex TRUOC (parseAnswerKeyText). Doc du
//      >= 3 cau thi tra luon, KHONG goi Gemini.
//   2. Regex doc < 3 cau, hoac file scan/anh -> goi Gemini 1 lan duy nhat
//      (gemini-2.5-flash, JSON mode) de doc bang dap an.
//   3. Gemini loi (het han muc 429, 5xx, timeout, tra sai dinh dang) ->
//      KHONG tra 502 nhu ai-parse: tra 200 voi ket qua regex (co the rong)
//      + warning, de admin nhap tay thay vi bi chan. Chi thieu
//      GEMINI_API_KEY moi tra 501 (theo dung pattern cua aiParse.js).
//
// Bao mat: GEMINI_API_KEY chi doc tu process.env, KHONG BAO GIO ghi key
// vao log, file hay response. Tai dung extractText / selectParseMode /
// callGemini tu aiParse.js (khong copy lai logic retry).

const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const { parseAnswerKeyText, NO_KEY_WARNING } = require('../answerKey');
const { buildAnswerKeyPrompt } = require('../aiPrompt');
const { extractText, selectParseMode, callGemini } = require('./aiParse');

const router = express.Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (giong aiParse.js)
const ALLOWED_EXTS = ['.txt', '.docx', '.pdf', '.png', '.jpg', '.jpeg'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok = ALLOWED_EXTS.some((ext) => name.endsWith(ext));
    if (!ok) {
      const err = new Error(
        'Định dạng file không hỗ trợ. Chỉ nhận file .txt, .docx, .pdf, .png, .jpg, .jpeg.'
      );
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err);
    }
    return cb(null, true);
  },
});

/** Lay text JSON tu response Gemini, parse thanh object {key, warnings}. */
function parseAnswerKeyJson(geminiJson) {
  const rawText =
    geminiJson &&
    geminiJson.candidates &&
    geminiJson.candidates[0] &&
    geminiJson.candidates[0].content &&
    Array.isArray(geminiJson.candidates[0].content.parts) &&
    geminiJson.candidates[0].content.parts[0] &&
    geminiJson.candidates[0].content.parts[0].text;
  if (!rawText) {
    const err = new Error('Gemini trả về kết quả không đúng định dạng');
    err.kind = 'parse';
    throw err;
  }
  const text = String(rawText).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  try {
    const parsed = JSON.parse(fenced ? fenced[1].trim() : text);
    if (!parsed || typeof parsed.key !== 'object' || Array.isArray(parsed.key)) {
      throw new Error('no key');
    }
    return parsed;
  } catch (_) {
    const err = new Error('Gemini trả về kết quả không đúng định dạng');
    err.kind = 'parse';
    throw err;
  }
}

/**
 * Chuan hoa bang dap an AI tra ve: chi nhan so cau 1-200 va dap an A-D,
 * trung so cau thi giu dap an dau tien.
 * @param {object} rawKey key tho tu Gemini, vd {"1":"A","2":"x"}
 * @returns {{ key: {[n: string]: string}, warnings: string[] }}
 */
function normalizeKey(rawKey) {
  const key = {};
  const warnings = [];
  const warnedDup = new Set();
  if (!rawKey || typeof rawKey !== 'object') return { key, warnings };
  for (const [numStr, ans] of Object.entries(rawKey)) {
    const num = parseInt(numStr, 10);
    if (!Number.isInteger(num) || num < 1 || num > 200) continue;
    const letter = typeof ans === 'string' ? ans.trim().toUpperCase() : '';
    if (!['A', 'B', 'C', 'D'].includes(letter)) continue;
    const n = String(num);
    if (key[n]) {
      if (!warnedDup.has(n)) {
        warnedDup.add(n);
        warnings.push(`Câu ${n} xuất hiện nhiều lần — chỉ giữ đáp án đầu tiên (${key[n]}).`);
      }
      continue;
    }
    key[n] = letter;
  }
  return { key, warnings };
}

/** Bo warning "khong doc duoc bang" cua buoc regex (se tinh lai theo ket qua cuoi). */
function withoutNoKeyWarning(warnings) {
  return (warnings || []).filter((w) => w !== NO_KEY_WARNING);
}

router.post('/admin/test-sets/:id/answer-key', authMiddleware, requireAdmin, (req, res) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File quá lớn, tối đa 10MB' });
      }
      if (uploadErr.code === 'UNSUPPORTED_FILE_TYPE') {
        return res.status(400).json({ error: uploadErr.message });
      }
      return res.status(400).json({ error: 'Tải file lên thất bại: ' + uploadErr.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Chưa chọn file đáp án để tải lên' });
    }

    const testSet = db.getTestSet(req.params.id);
    if (!testSet) return res.status(404).json({ error: 'khong tim thay bo de' });

    // ---------- Buoc 1: chon cach doc file (text hay scan/anh) ----------
    let modeInfo;
    try {
      modeInfo = await selectParseMode(req.file.buffer, req.file.mimetype, req.file.originalname);
    } catch (e) {
      return res
        .status(400)
        .json({ error: 'Không đọc được file: ' + (e.message || 'lỗi không xác định') });
    }

    // ---------- Buoc 2: file text -> doc bang regex TRUOC ----------
    // Doc du >= 3 cau thi tra luon, KHONG goi Gemini (tiet kiem han muc).
    let rule = { key: {}, found: 0, warnings: [] };
    let text = '';
    if (modeInfo.mode === 'text') {
      try {
        text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
      } catch (e) {
        return res
          .status(400)
          .json({ error: 'Không đọc được file: ' + (e.message || 'lỗi không xác định') });
      }
      if (!text || !text.trim()) {
        // File text rong: khong co gi de AI doc (khong phai anh) -> tra luon.
        return res.json({
          key: {},
          found: 0,
          source: 'rule',
          warnings: [NO_KEY_WARNING, 'File không có nội dung.'],
        });
      }
      rule = parseAnswerKeyText(text);
      if (rule.found >= 3) {
        return res.json({ key: rule.key, found: rule.found, source: 'rule', warnings: rule.warnings });
      }
    }

    // ---------- Buoc 3: can AI (regex < 3 cau, hoac file scan/anh) ----------
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(501).json({
        error: 'gemini_not_configured',
        message: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ',
      });
    }

    const geminiParts =
      modeInfo.mode === 'vision'
        ? [
            {
              inlineData: {
                mimeType: modeInfo.mimeType,
                data: req.file.buffer.toString('base64'),
              },
            },
            { text: buildAnswerKeyPrompt(null) },
          ]
        : [{ text: buildAnswerKeyPrompt(text) }];

    let aiKey = {};
    let aiWarnings = [];
    let aiFailedMsg = null;
    try {
      const geminiJson = await callGemini(apiKey, geminiParts);
      const parsed = parseAnswerKeyJson(geminiJson);
      const norm = normalizeKey(parsed.key);
      aiKey = norm.key;
      aiWarnings = norm.warnings;
      if (Array.isArray(parsed.warnings)) {
        for (const w of parsed.warnings) {
          if (typeof w === 'string' && w.trim()) aiWarnings.push(w);
        }
      }
    } catch (e) {
      aiFailedMsg = (e && e.message) || 'lỗi không xác định';
    }

    if (aiFailedMsg) {
      // Gemini loi: tra ket qua regex (co the rong) + warning, KHONG 502 —
      // admin van nhap tay duoc thay vi bi chan o buoc nay.
      const warnings = [...rule.warnings];
      if (rule.found < 3 && !warnings.includes(NO_KEY_WARNING)) {
        warnings.push(NO_KEY_WARNING);
      }
      warnings.push(
        `Không đọc được đáp án bằng AI (${aiFailedMsg}) — chỉ dùng đáp án đọc được bằng quy tắc, vui lòng nhập tay phần còn thiếu.`
      );
      return res.json({ key: rule.key, found: rule.found, source: 'rule', warnings });
    }

    // Gop: dap an regex thang khi trung so cau (dang "1. A" ro rang),
    // AI dien phan con thieu.
    const merged = { ...aiKey };
    for (const [n, a] of Object.entries(rule.key)) merged[n] = a;
    const aiContributed = Object.keys(aiKey).some((n) => merged[n] === aiKey[n]);
    const found = Object.keys(merged).length;
    const warnings = [...withoutNoKeyWarning(rule.warnings), ...aiWarnings];
    if (found < 3) warnings.push(NO_KEY_WARNING);
    return res.json({
      key: merged,
      found,
      source: aiContributed ? 'ai' : 'rule',
      warnings,
    });
  });
});

module.exports = router;
