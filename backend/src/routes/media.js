'use strict';

// Anh + Audio cho phan Nghe (Part 1-4): admin gan URL anh/audio (Cloudinary)
// cho cau hoi / doan van, hoac sinh audio bang Gemini TTS roi upload len
// Cloudinary. Backend KHONG nhan file upload tu client o bat ky endpoint
// nao o day — chi luu URL hoac tu goi Gemini + Cloudinary.
//
// Bao mat: GEMINI_API_KEY chi doc tu process.env, KHONG BAO GIO ghi key
// vao log, file hay response. Cloudinary dung unsigned upload preset
// (chi upload anh/audio cong khai cua de thi, khong dung cho du lieu
// nhay cam); chua cau hinh thi cac endpoint lien quan tra 501.

const express = require('express');
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

const router = express.Router();
// CHI ap dung auth cho cac route media trong file nay. Khong dung
// router.use(authMiddleware) o day: router nay mount tai /api truoc cac
// route cong khai (/api/questions, /api/parts...) nen middleware toan cuc
// se chan ca request khong can dang nhap.
const adminOnly = [authMiddleware, requireAdmin];

const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_TIMEOUT_MS = 60 * 1000; // 60 giay cho 1 call Gemini TTS
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kiem tra URL co phai URL Cloudinary hop le khong (https + host res.cloudinary.com). */
function isCloudinaryUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  let u;
  try {
    u = new URL(value.trim());
  } catch (_) {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return host === 'res.cloudinary.com' || host.endsWith('.res.cloudinary.com');
}

/** Validate 1 URL Cloudinary; tra ve null neu hop le, neu khong tra message tieng Viet. */
function validateCloudinaryUrl(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    return `${label} không hợp lệ`;
  }
  if (!isCloudinaryUrl(value)) {
    return `${label} phải là URL https của Cloudinary (res.cloudinary.com)`;
  }
  return null;
}

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || null;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || null;
  return { cloudName, uploadPreset, configured: Boolean(cloudName && uploadPreset) };
}

router.get('/admin/media/config', ...adminOnly, (req, res) => {
  return res.json(cloudinaryConfig());
});

/* ---------- gan URL media co san (Cloudinary) ---------- */

router.post('/admin/questions/:id/media', ...adminOnly, (req, res) => {
  const body = req.body || {};
  const hasImage = body.imageUrl !== undefined && body.imageUrl !== null;
  const hasAudio = body.audioUrl !== undefined && body.audioUrl !== null;
  if (!hasImage && !hasAudio) {
    return res.status(400).json({ error: 'Cần cung cấp ít nhất một URL ảnh hoặc audio' });
  }
  if (hasImage) {
    const err = validateCloudinaryUrl(body.imageUrl, 'URL ảnh');
    if (err) return res.status(400).json({ error: err });
  }
  if (hasAudio) {
    const err = validateCloudinaryUrl(body.audioUrl, 'URL audio');
    if (err) return res.status(400).json({ error: err });
  }
  const updated = db.updateQuestion(req.params.id, {
    ...(hasImage ? { imageUrl: body.imageUrl } : {}),
    ...(hasAudio ? { audioUrl: body.audioUrl } : {}),
  });
  if (!updated) return res.status(404).json({ error: 'khong tim thay cau hoi' });
  return res.json(updated);
});

router.post('/admin/passages/:id/media', ...adminOnly, (req, res) => {
  const body = req.body || {};
  if (body.audioUrl === undefined || body.audioUrl === null) {
    return res.status(400).json({ error: 'Cần cung cấp URL audio' });
  }
  const err = validateCloudinaryUrl(body.audioUrl, 'URL audio');
  if (err) return res.status(400).json({ error: err });
  const updated = db.updatePassageMedia(req.params.id, { audioUrl: body.audioUrl });
  if (!updated) return res.status(404).json({ error: 'khong tim thay doan van' });
  return res.json(updated);
});

/* ---------- sinh audio bang Gemini TTS + upload Cloudinary ---------- */

/**
 * Goi Gemini TTS 1 lan (co retry loi nhat thoi 429/5xx toi da 3 lan,
 * cach nhau 2s roi 4s — theo dung mau callGemini trong aiParse.js).
 * Tra ve base64 PCM trong response.
 */
async function callGeminiTts(apiKey, text, voiceName) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Read aloud naturally: ' + text }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
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
    } catch (e) {
      lastErr = e;
      const retryable =
        e.name !== 'AbortError' &&
        (e.status === undefined || TRANSIENT_STATUSES.has(e.status));
      if (!retryable || attempt === 3) throw e;
      await sleep(attempt === 1 ? 2000 : 4000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Goi TTS; neu loi 400 (giong khong hop le) thi thu lai 1 lan voi giong Aoede. */
async function generateTtsAudio(apiKey, text) {
  try {
    return await callGeminiTts(apiKey, text, 'Kore');
  } catch (e) {
    if (e && e.status === 400) {
      return await callGeminiTts(apiKey, text, 'Aoede');
    }
    throw e;
  }
}

function extractPcmBase64(geminiJson) {
  return (
    geminiJson &&
    geminiJson.candidates &&
    geminiJson.candidates[0] &&
    geminiJson.candidates[0].content &&
    Array.isArray(geminiJson.candidates[0].content.parts) &&
    geminiJson.candidates[0].content.parts[0] &&
    geminiJson.candidates[0].content.parts[0].inlineData &&
    geminiJson.candidates[0].content.parts[0].inlineData.data
  ) || null;
}

/** Them WAV header 44 bytes (PCM 16-bit mono 24000Hz) vao PCM tho. */
function pcmToWav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // do dai khoi fmt
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(24000, 24); // sample rate
  header.writeUInt32LE(24000 * 2, 28); // byte rate (24000 * 1 kenh * 2 byte)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Upload file WAV len Cloudinary bang unsigned upload preset. Tra ve secure_url. */
async function uploadToCloudinary(cloudName, uploadPreset, wavBuffer) {
  const form = new FormData();
  form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
  form.append('upload_preset', uploadPreset);
  form.append('folder', 'toeic/audio');
  form.append('resource_type', 'auto');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = new Error(`Cloudinary trả lỗi HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  if (!json || !json.secure_url) {
    throw new Error('Cloudinary không trả về URL file');
  }
  return json.secure_url;
}

/**
 * Sinh audio cho 1 doan text: Gemini TTS -> WAV -> upload Cloudinary.
 * Tra ve secure_url. Loi Gemini/Cloudinary thi throw Error co .status (neu co).
 */
async function synthesizeAndUpload(apiKey, cloudName, uploadPreset, text) {
  const geminiJson = await generateTtsAudio(apiKey, text);
  const base64 = extractPcmBase64(geminiJson);
  if (!base64) {
    const err = new Error('Gemini trả về kết quả không đúng định dạng');
    err.kind = 'parse';
    throw err;
  }
  const wav = pcmToWav(Buffer.from(base64, 'base64'));
  return uploadToCloudinary(cloudName, uploadPreset, wav);
}

/** Kiem tra cau hinh truoc khi sinh audio; tra ve {apiKey, cloudName, uploadPreset} hoac gui loi 501 va tra null. */
function checkGenerateConfig(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(501).json({
      error: 'gemini_not_configured',
      message: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ',
    });
    return null;
  }
  const { cloudName, uploadPreset, configured } = cloudinaryConfig();
  if (!configured) {
    res.status(501).json({
      error: 'cloudinary_not_configured',
      message:
        'Chưa cấu hình Cloudinary trên máy chủ (CLOUDINARY_CLOUD_NAME / CLOUDINARY_UPLOAD_PRESET).',
    });
    return null;
  }
  return { apiKey, cloudName, uploadPreset };
}

/** Map loi Gemini/Cloudinary thanh response 502 tieng Viet (giong aiParse.js). */
function handleGenerateError(res, e) {
  if (e && e.name === 'AbortError') {
    return res
      .status(502)
      .json({ error: 'Gemini phản hồi quá chậm (quá 60 giây), vui lòng thử lại' });
  }
  if (e && (e.status === 400 || e.status === 401 || e.status === 403)) {
    return res.status(502).json({
      error:
        'Gemini từ chối yêu cầu (mã ' +
        e.status +
        '). Vui lòng kiểm tra lại GEMINI_API_KEY trên máy chủ.',
    });
  }
  if (e && TRANSIENT_STATUSES.has(e.status)) {
    return res.status(502).json({
      error: 'Gemini đang bận (mã ' + e.status + '), vui lòng thử lại sau ít phút.',
    });
  }
  if (e && e.kind === 'parse') {
    return res.status(502).json({
      error: 'Gemini trả về kết quả không đúng định dạng, vui lòng thử lại',
    });
  }
  return res.status(502).json({ error: 'Không tạo được audio, vui lòng thử lại sau' });
}

router.post('/admin/questions/:id/generate-audio', ...adminOnly, async (req, res) => {
  const cfg = checkGenerateConfig(req, res);
  if (!cfg) return;
  const q = db.getQuestionById(req.params.id, true);
  if (!q) return res.status(404).json({ error: 'khong tim thay cau hoi' });

  // Part 3/4 co doan chung: sinh audio theo doan (luu vao passage),
  // cac Part khac sinh theo tung cau.
  let passage = null;
  let text = null;
  let level = 'question';
  if ((q.part === 3 || q.part === 4) && q.passageId) {
    passage = db.getPassage(q.passageId);
    if (passage) {
      text = passage.script || passage.content || q.script || null;
      level = 'passage';
    }
  }
  if (!text) {
    text = q.script || q.content || null;
    level = 'question';
  }
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Câu hỏi này không có nội dung để đọc thành audio' });
  }

  let audioUrl;
  try {
    audioUrl = await synthesizeAndUpload(cfg.apiKey, cfg.cloudName, cfg.uploadPreset, text);
  } catch (e) {
    return handleGenerateError(res, e);
  }
  if (level === 'passage') {
    db.updatePassageMedia(passage.id, { audioUrl });
  } else {
    db.updateQuestion(q.id, { audioUrl });
  }
  return res.json({ audioUrl, level });
});

router.post('/admin/passages/:id/generate-audio', ...adminOnly, async (req, res) => {
  const cfg = checkGenerateConfig(req, res);
  if (!cfg) return;
  const passage = db.getPassage(req.params.id);
  if (!passage) return res.status(404).json({ error: 'khong tim thay doan van' });
  const text = passage.script || passage.content || null;
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Đoạn văn này không có nội dung để đọc thành audio' });
  }
  let audioUrl;
  try {
    audioUrl = await synthesizeAndUpload(cfg.apiKey, cfg.cloudName, cfg.uploadPreset, text);
  } catch (e) {
    return handleGenerateError(res, e);
  }
  db.updatePassageMedia(passage.id, { audioUrl });
  return res.json({ audioUrl, level: 'passage' });
});

module.exports = router;
