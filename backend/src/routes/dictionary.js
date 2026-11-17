'use strict';

/**
 * dictionary.js — tra tu dien Anh-Viet cho popup tra tu trong doan van.
 * POST /api/dictionary/lookup (can dang nhap).
 *
 * - Tra cache (dictionary_cache) truoc; trung thi khong goi Gemini.
 * - Cache miss: goi Gemini gemini-2.5-flash (chung key voi ai-parse,
 *   doc tu env GEMINI_API_KEY) voi prompt JSON nghiem ngat.
 * - TUYET DOI khong bia nghia: Gemini tra loi khong hop le / khong
 *   xac dinh duoc nghia -> 503, frontend hien "Khong tra duoc".
 */

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { normalizeWordInput, isValidWordInput } = require('../wordUtils');

const router = express.Router();
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 30000;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildLookupPrompt(word, context) {
  const ctx = context && context.trim() ? context.trim().slice(0, 500) : '(không có)';
  return `Bạn là từ điển Anh–Việt. Cho từ/cụm từ tiếng Anh dưới đây và câu ngữ cảnh (nếu có), chỉ trả về JSON thuần đúng shape sau, không thêm markdown hay giải thích:
{"word": "<từ đã cho>", "phonetic": "phiên âm IPA, ví dụ /ˈtiːtʃər/; null nếu không rõ", "pos": "loại từ bằng tiếng Việt: danh từ, động từ, tính từ, trạng từ, giới từ, cụm từ...; null nếu không rõ", "meaning_vi": "nghĩa tiếng Việt phù hợp NHẤT với ngữ cảnh (ngắn gọn, 1 nghĩa chính)", "example": "câu ví dụ tiếng Anh — ưu tiên dùng chính câu ngữ cảnh nếu câu đó chứa từ này; nếu không, tự đặt 1 câu ngắn đơn giản"}
QUY TẮC: Nếu từ không phải từ/cụm từ tiếng Anh hợp lệ, hoặc không xác định được nghĩa, trả về {"error": "unknown"}. TUYỆT ĐỐI không bịa nghĩa, không bịa phiên âm.
Từ: ${word}
Câu ngữ cảnh: ${ctx}`;
}

/** Tach JSON khoi text Gemini tra ve (phong truong hop co ```json fence). */
function extractJsonText(raw) {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1].trim() : text;
}

async function callGeminiLookup(apiKey, word, context) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildLookupPrompt(word, context) }] }],
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
      const json = await res.json();
      const text = json && json.candidates && json.candidates[0] && json.candidates[0].content &&
        Array.isArray(json.candidates[0].content.parts) && json.candidates[0].content.parts[0] &&
        json.candidates[0].content.parts[0].text;
      if (!text) throw new Error('Gemini trả về kết quả trống');
      return JSON.parse(extractJsonText(text));
    } catch (e) {
      lastErr = e;
      const retryable = e.name !== 'AbortError' && (e.status === undefined || TRANSIENT_STATUSES.has(e.status));
      if (!retryable || attempt === 2) throw e;
      await sleep(2000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Kiem tra ket qua Gemini: dung tu, co nghia tieng Viet that. Tra null neu khong dat. */
function validateLookupResult(parsed, word) {
  if (!parsed || typeof parsed !== 'object' || parsed.error) return null;
  if (typeof parsed.word !== 'string' || parsed.word.trim().toLowerCase() !== word) return null;
  if (typeof parsed.meaning_vi !== 'string' || !parsed.meaning_vi.trim()) return null;
  if (parsed.meaning_vi.length > 500) return null;
  const strOrNull = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);
  return {
    word,
    phonetic: strOrNull(parsed.phonetic),
    pos: strOrNull(parsed.pos),
    meaning: parsed.meaning_vi.trim(),
    example: strOrNull(parsed.example),
  };
}

/** DB row (cot meaning) -> API shape (meaning_vi). */
function toApiEntry(row) {
  return { word: row.word, phonetic: row.phonetic, pos: row.pos, meaning_vi: row.meaning, example: row.example };
}

router.post('/dictionary/lookup', authMiddleware, async (req, res) => {
  const word = normalizeWordInput(req.body && req.body.word);
  if (!isValidWordInput(word)) {
    return res.status(400).json({ error: 'tu_khong_hop_le', message: 'Chỉ tra được từ/cụm từ tiếng Anh (tối đa 3 từ).' });
  }
  const cached = db.getDictionaryEntry(word);
  if (cached) return res.json({ ...toApiEntry(cached), cached: true });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'gemini_not_configured', message: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ — không tra được từ mới.' });
  }
  const context = typeof req.body.context === 'string' ? req.body.context : '';
  try {
    const parsed = await callGeminiLookup(apiKey, word, context);
    const entry = validateLookupResult(parsed, word);
    if (!entry) return res.status(503).json({ error: 'lookup_failed', message: 'Không tra được từ này, thử lại sau.' });
    db.setDictionaryEntry(entry);
    return res.json({ ...toApiEntry(entry), cached: false });
  } catch (e) {
    return res.status(503).json({ error: 'lookup_failed', message: 'Không tra được từ này, thử lại sau.' });
  }
});

module.exports = router;
