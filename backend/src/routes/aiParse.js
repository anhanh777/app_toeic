'use strict';

// Nhan dien de thi bang AI (Gemini): admin upload 1 file de thi
// (.txt/.docx/.pdf/.png/.jpg/.jpeg) -> Gemini trich xuat cau hoi -> tra ve
// JSON de admin xem truoc / sua tay, KHONG tu luu vao DB o buoc nay.
// Luu xong: admin goi POST /admin/test-sets/:id/import nhu binh thuong.
//
// Bao mat: GEMINI_API_KEY chi doc tu process.env, KHONG BAO GIO ghi key
// vao log, file hay response.

const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const { buildParsePrompt, buildVisionPrompt } = require('../aiPrompt');

const router = express.Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 60 * 1000; // 60 giay

const ALLOWED_EXTS = ['.txt', '.docx', '.doc', '.pdf', '.png', '.jpg', '.jpeg'];
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg']);

function extOf(name) {
  const n = String(name || '').toLowerCase();
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i) : '';
}

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

/**
 * Trich xuat van ban tu buffer file (khong dung cho anh).
 * Quyet dinh theo duoi file truoc (trinh duyet tren Windows doi khi gui
 * mimetype sai, vd .docx gui thanh application/octet-stream), roi moi
 * dung mimetype lam du phong.
 * @param {Buffer} buffer noi dung file
 * @param {string} mimetype MIME type cua file (multer cung cap)
 * @param {string} filename ten file goc (de lay duoi file)
 * @returns {Promise<string>} van ban trich duoc
 */
async function extractText(buffer, mimetype, filename) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Dữ liệu file không hợp lệ');
  const ext = extOf(filename);
  const type = ext || '';
  if (type === '.doc') {
    throw new Error(
      'File .doc (Word cũ) không đọc được. Hãy mở bằng Word rồi lưu thành .docx (File → Save As → Word Document) rồi tải lên lại.'
    );
  }
  if (type === '.txt' || mimetype === 'text/plain') {
    return buffer.toString('utf-8');
  }
  if (
    type === '.docx' ||
    mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }
  if (type === '.pdf' || mimetype === 'application/pdf') {
    // pdf-parse v2: class PDFParse; v1: ham truc tiep. Ho tro ca hai.
    const pdfParse = require('pdf-parse');
    if (typeof pdfParse === 'function') {
      const result = await pdfParse(buffer);
      return result.text || '';
    }
    const { PDFParse } = pdfParse;
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      if (typeof parser.destroy === 'function') await parser.destroy();
    }
  }
  throw new Error('Định dạng file không hỗ trợ trích xuất văn bản');
}

/** Tach JSON khoi text Gemini tra ve (phong truong hop co ```json fence). */
function extractJsonText(raw) {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1].trim() : text;
}

async function callGemini(apiKey, parts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      const err = new Error(`Gemini trả lỗi HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeQuestion(raw) {
  const q = raw && typeof raw === 'object' ? raw : {};
  const part = parseInt(q.part, 10);
  const options = Array.isArray(q.options)
    ? q.options.map((o, i) => ({
        label: ['A', 'B', 'C', 'D'][i] || String((o && o.label) || '').toUpperCase(),
        content: o && typeof o.content === 'string' ? o.content : '',
      }))
    : [];
  const correct =
    typeof q.correct === 'string' && ['A', 'B', 'C', 'D'].includes(q.correct.trim().toUpperCase())
      ? q.correct.trim().toUpperCase()
      : '';
  return {
    part: Number.isInteger(part) ? part : 0,
    content: typeof q.content === 'string' ? q.content : '',
    options,
    correct,
    explanation: typeof q.explanation === 'string' ? q.explanation : '',
    script: typeof q.script === 'string' && q.script ? q.script : null,
    passageTitle:
      typeof q.passageTitle === 'string' && q.passageTitle ? q.passageTitle : null,
    passageText:
      typeof q.passageText === 'string' && q.passageText ? q.passageText : null,
  };
}

router.post('/admin/test-sets/:id/ai-parse', authMiddleware, requireAdmin, (req, res) => {
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
      return res.status(400).json({ error: 'Chưa chọn file đề thi để tải lên' });
    }

    const testSet = db.getTestSet(req.params.id);
    if (!testSet) return res.status(404).json({ error: 'khong tim thay bo de' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(501).json({
        error: 'gemini_not_configured',
        message: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ',
      });
    }

    const isImage =
      IMAGE_EXTS.has(extOf(req.file.originalname)) || IMAGE_MIMES.has(req.file.mimetype);
    let parts;
    try {
      if (isImage) {
        // Anh: khong trich chu o backend, gui thang bytes anh cho Gemini vision.
        parts = [
          {
            inlineData: {
              mimeType: req.file.mimetype,
              data: req.file.buffer.toString('base64'),
            },
          },
          { text: buildVisionPrompt() },
        ];
      } else {
        const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
        if (!text || !text.trim()) {
          return res
            .status(400)
            .json({ error: 'Không trích xuất được nội dung từ file này' });
        }
        parts = [{ text: buildParsePrompt(text) }];
      }
    } catch (e) {
      return res
        .status(400)
        .json({ error: 'Không đọc được file: ' + (e.message || 'lỗi không xác định') });
    }

    let geminiJson;
    try {
      geminiJson = await callGemini(apiKey, parts);
    } catch (e) {
      if (e.name === 'AbortError') {
        return res
          .status(502)
          .json({ error: 'Gemini phản hồi quá chậm (quá 60 giây), vui lòng thử lại' });
      }
      if (e.status === 400 || e.status === 401 || e.status === 403) {
        return res.status(502).json({
          error:
            'Gemini từ chối yêu cầu (mã ' +
            e.status +
            '). Vui lòng kiểm tra lại GEMINI_API_KEY trên máy chủ.',
        });
      }
      return res
        .status(502)
        .json({ error: 'Không gọi được Gemini, vui lòng thử lại sau' });
    }

    let parsed;
    try {
      const rawText =
        geminiJson &&
        geminiJson.candidates &&
        geminiJson.candidates[0] &&
        geminiJson.candidates[0].content &&
        Array.isArray(geminiJson.candidates[0].content.parts) &&
        geminiJson.candidates[0].content.parts[0] &&
        geminiJson.candidates[0].content.parts[0].text;
      if (!rawText) throw new Error('empty');
      parsed = JSON.parse(extractJsonText(rawText));
      if (!parsed || !Array.isArray(parsed.questions)) throw new Error('no questions');
    } catch (_) {
      return res.status(502).json({
        error: 'Gemini trả về kết quả không đúng định dạng, vui lòng thử lại',
      });
    }

    const questions = parsed.questions.map(normalizeQuestion);
    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((w) => typeof w === 'string')
      : [];
    const invalid = [];
    questions.forEach((q, index) => {
      if (q.correct === '') {
        invalid.push({
          index,
          reason: 'Chưa xác định được đáp án đúng — cần chọn tay trước khi import',
        });
        return;
      }
      const reason = db.validateImportQuestion(q, index);
      if (reason) invalid.push({ index, reason });
    });

    return res.json({ questions, invalid, warnings });
  });
});

module.exports = router;
module.exports.extractText = extractText;
