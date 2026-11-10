'use strict';

// Nhan dien de thi bang AI (Gemini): admin upload 1 file de thi
// (.txt/.docx/.pdf/.png/.jpg/.jpeg) -> Gemini trich xuat cau hoi -> tra ve
// JSON de admin xem truoc / sua tay, KHONG tu luu vao DB o buoc nay.
// Luu xong: admin goi POST /admin/test-sets/:id/import nhu binh thuong.
//
// Hybrid 3 tang:
//   Tang 1 — Doc file: trich text (txt/docx/pdf co lop chu) hoac gui thang
//     bytes goc cho Gemini vision (anh, PDF scan khong co lop chu).
//     KHONG render PDF o server.
//   Tang 2 — Tach cau truc (chi regex, khong AI): splitStructure() tach
//     tieu de Part, khoi cau hoi, nhom doan van, Answer Key. File scan
//     BO QUA tang 2 vi khong co text de tach.
//   Tang 3 — AI theo khoi: moi block 1 call Gemini (song song), prompt
//     kem dap an tang 2 da tach duoc; neu 1 block loi thi ghi warning
//     va tiep tuc cac block khac.
//
// Bao mat: GEMINI_API_KEY chi doc tu process.env, KHONG BAO GIO ghi key
// vao log, file hay response.

const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const { buildParsePrompt, buildVisionPrompt, buildBlockParsePrompt } = require('../aiPrompt');
const { isScannedText, splitStructure } = require('../structureSplit');

const router = express.Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 60 * 1000; // 60 giay cho 1 call Gemini
const OVERALL_TIMEOUT_MS = 180 * 1000; // 180 giay cho toan bo tang 3 (cac block goi tuan tu)

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

/**
 * Chon cach doc file o tang 1 (ham thuan: khong goi mang, chi doc buffer).
 *  - Anh (.png/.jpg/.jpeg) -> vision, giu mimeType goc.
 *  - PDF -> trich text roi dung isScannedText: neu scan (< 100 ky tu thuc)
 *    thi vision voi mimeType 'application/pdf', nguoc lai thi text.
 *  - .txt/.docx/.doc -> text (khong coi la scan du ngan).
 * @param {Buffer} buffer noi dung file
 * @param {string} mimetype MIME type cua file (multer cung cap)
 * @param {string} filename ten file goc (de lay duoi file)
 * @returns {Promise<{mode: 'vision'|'text', mimeType: string}>}
 */
async function selectParseMode(buffer, mimetype, filename) {
  const ext = extOf(filename);
  const mime = String(mimetype || '').toLowerCase();
  if (IMAGE_EXTS.has(ext) || IMAGE_MIMES.has(mime)) {
    const mimeType = IMAGE_MIMES.has(mime)
      ? mime
      : ext === '.png'
        ? 'image/png'
        : 'image/jpeg';
    return { mode: 'vision', mimeType };
  }
  if (ext === '.pdf' || mime === 'application/pdf') {
    const text = await extractText(buffer, mimetype, filename);
    if (isScannedText(text)) return { mode: 'vision', mimeType: 'application/pdf' };
    return { mode: 'text', mimeType: 'application/pdf' };
  }
  return { mode: 'text', mimeType: mime || 'text/plain' };
}

/** Tach JSON khoi text Gemini tra ve (phong truong hop co ```json fence). */
function extractJsonText(raw) {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1].trim() : text;
}

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(apiKey, parts) {
  // Gemini thi thoang tra 429/5xx nhat thoi (dac biet khi doc PDF scan) —
  // thu lai toi da 3 lan. Rieng 429 la het han muc theo phut cua goi Free
  // nen doi lau hon (5s roi 10s); loi 5xx khac doi 2s roi 4s.
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
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
    } catch (e) {
      lastErr = e;
      const retryable =
        e.name !== 'AbortError' &&
        (e.status === undefined || TRANSIENT_STATUSES.has(e.status));
      if (!retryable || attempt === 3) throw e;
      const isRateLimit = e.status === 429;
      await sleep(isRateLimit ? (attempt === 1 ? 5000 : 10000) : (attempt === 1 ? 2000 : 4000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Lay text JSON tu response Gemini, parse thanh object {questions, warnings}. */
function parseGeminiJson(geminiJson) {
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
  try {
    const parsed = JSON.parse(extractJsonText(rawText));
    if (!parsed || !Array.isArray(parsed.questions)) throw new Error('no questions');
    return parsed;
  } catch (_) {
    const err = new Error('Gemini trả về kết quả không đúng định dạng');
    err.kind = 'parse';
    throw err;
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

/**
 * Cau giu cho cho Part 1/2 chi-nghe: khi AI tra ve it cau hon so cau ky
 * vong (expected — so cau theo thu tu trong de), tao cau giu cho cho cac
 * so con thieu (tinh tu so cau AI da tra ve, vi AI tra theo dung thu tu).
 * Part 1: 4 phuong an rong (A–D); Part 2: 3 phuong an rong (A–C); ca hai
 * deu content rong, correct rong, confidence "low". Cau giu cho di qua
 * dung luong `invalid` hien co (dap an trong -> invalid), khong luu DB.
 * @returns {{ placeholders: object[], warnings: string[] }}
 */
function fillListeningPlaceholders(part, expected, gotCount) {
  const labels = part === 1 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C'];
  const placeholders = [];
  const warnings = [];
  const missing = (expected || []).length - (gotCount || 0);
  for (let m = 0; m < missing; m++) {
    const num = expected[gotCount + m];
    placeholders.push({
      part,
      content: '',
      options: labels.map((label) => ({ label, content: '' })),
      correct: '',
      explanation: '',
      script: null,
      passageTitle: null,
      passageText: null,
      confidence: 'low',
    });
    warnings.push(
      part === 1
        ? `Câu ${num} Part 1 chỉ có audio — cần gắn ảnh, file audio và chọn đáp án tay trước khi import`
        : `Câu ${num} Part 2 chỉ có audio — cần gắn file audio và chọn đáp án tay trước khi import`
    );
  }
  return { placeholders, warnings };
}

/** Prompt cho 1 block o tang 3 (khong dung cho nhom vision — vision co prompt rieng). */
function blockPrompt(block, structure) {
  if (structure.mode === 'fallback') return buildParsePrompt(block.text);
  const keyForBlock = {};
  if (structure.answerKey) {
    for (const n of block.expectedQuestions || []) {
      if (structure.answerKey[String(n)]) keyForBlock[n] = structure.answerKey[String(n)];
    }
  }
  return buildBlockParsePrompt(block, keyForBlock);
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

    // ---------- Tang 1: chon cach doc file ----------
    let modeInfo;
    try {
      modeInfo = await selectParseMode(req.file.buffer, req.file.mimetype, req.file.originalname);
    } catch (e) {
      return res
        .status(400)
        .json({ error: 'Không đọc được file: ' + (e.message || 'lỗi không xác định') });
    }

    // ---------- Tang 2: tach cau truc (chi ap dung cho nhom text) ----------
    // File scan/anh BO QUA tang 2 vi khong co text de tach — gui thang bytes
    // goc cho Gemini vision o tang 3.
    let blocks; // [{part, text, expectedQuestions, passageText, warnings, vision?}]
    let structure; // {mode, parts, answerKeyFound, answerKey, warnings}
    let visionParts = null; // parts gui Gemini khi mode = 'vision'
    let fullText = ''; // toan bo text trich xuat (chi co o nhom text)
    try {
      if (modeInfo.mode === 'vision') {
        visionParts = [
          {
            inlineData: {
              mimeType: modeInfo.mimeType,
              data: req.file.buffer.toString('base64'),
            },
          },
          { text: buildVisionPrompt() },
        ];
        blocks = [
          {
            part: 0,
            text: '',
            expectedQuestions: [],
            passageText: null,
            warnings: [],
            vision: true,
          },
        ];
        structure = {
          mode: 'vision',
          parts: [],
          answerKeyFound: false,
          answerKey: null,
          warnings: ['File scan/ảnh — AI đã đọc trực tiếp từ ảnh, không tách cấu trúc được.'],
        };
      } else {
        const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
        fullText = text || '';
        if (!text || !text.trim()) {
          return res
            .status(400)
            .json({ error: 'Không trích xuất được nội dung từ file này' });
        }
        const split = splitStructure(text);
        if (split.parts.length === 0) {
          // Fallback: khong tach duoc cau truc -> 1 block duy nhat, AI doc toan bo file.
          blocks = [
            {
              part: 0,
              text,
              expectedQuestions: [],
              passageText: null,
              warnings: [],
            },
          ];
          structure = {
            mode: 'fallback',
            parts: [],
            answerKeyFound: split.answerKeyFound,
            answerKey: split.answerKey,
            warnings: [...split.warnings, 'Không tách được cấu trúc — đã dùng AI đọc toàn bộ file.'],
          };
        } else {
          blocks = split.blocks;
          structure = {
            mode: 'split',
            parts: split.parts,
            answerKeyFound: split.answerKeyFound,
            answerKey: split.answerKey,
            warnings: split.warnings,
          };
        }
      }
    } catch (e) {
      return res
        .status(400)
        .json({ error: 'Không đọc được file: ' + (e.message || 'lỗi không xác định') });
    }

    // ---------- Tang 3: goi Gemini ----------
    // File text NHO (<= 25.000 ky tu): goi 1 call duy nhat cho ca file thay
    // vi goi tung block — goi Gemini Free gioi han so request/phut rat
    // thap, goi 4-5 block lien tiep de bi 429 (da gap voi de thi that).
    // File lon hon van goi tuan tu tung block nhu cu.
    const SINGLE_CALL_MAX_CHARS = 25000;
    const useSingleCall =
      modeInfo.mode === 'text' &&
      structure.mode === 'split' &&
      fullText.length > 0 &&
      fullText.length <= SINGLE_CALL_MAX_CHARS;
    let blockResults;
    try {
      blockResults = await Promise.race([
        (async () => {
          if (useSingleCall) {
            try {
              const geminiJson = await callGemini(apiKey, [{ text: buildParsePrompt(fullText) }]);
              const expectedAll = blocks.flatMap((b) => b.expectedQuestions || []);
              // Giu so cau ky vong theo tung Part de bu cau giu cho chi-nghe
              // o buoc gop (Part 1/2 co the khong co cau nao trong ket qua).
              const expectedByPart = {};
              for (const b of blocks) {
                if (b.part === 1 || b.part === 2) {
                  expectedByPart[b.part] = b.expectedQuestions || [];
                }
              }
              return [
                {
                  ok: true,
                  parsed: parseGeminiJson(geminiJson),
                  block: {
                    part: 0,
                    expectedQuestions: expectedAll,
                    expectedByPart,
                    warnings: [],
                  },
                },
              ];
            } catch (e) {
              return [
                {
                  ok: false,
                  error: e,
                  block: {
                    part: 0,
                    expectedQuestions: [],
                    expectedByPart: blocks.reduce((acc, b) => {
                      if (b.part === 1 || b.part === 2) acc[b.part] = b.expectedQuestions || [];
                      return acc;
                    }, {}),
                    warnings: [],
                  },
                },
              ];
            }
          }
          const results = [];
          for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            if (i > 0) await sleep(1500);
            try {
              const geminiParts = block.vision
                ? visionParts
                : [{ text: blockPrompt(block, structure) }];
              const geminiJson = await callGemini(apiKey, geminiParts);
              results.push({ ok: true, parsed: parseGeminiJson(geminiJson), block });
            } catch (e) {
              // 1 block loi khong fail ca request — ghi warning, tiep tuc block khac.
              results.push({ ok: false, error: e, block });
            }
          }
          return results;
        })(),
        new Promise((_, reject) =>
          setTimeout(() => {
            const err = new Error('Gemini phản hồi quá chậm (quá 180 giây), vui lòng thử lại');
            err.code = 'OVERALL_TIMEOUT';
            reject(err);
          }, OVERALL_TIMEOUT_MS)
        ),
      ]);
    } catch (e) {
      if (e && e.code === 'OVERALL_TIMEOUT') {
        return res.status(502).json({ error: e.message });
      }
      throw e;
    }

    const failed = blockResults.filter((r) => !r.ok);
    if (failed.length === blockResults.length) {
      // TAT CA block deu loi -> 502 nhu cu.
      const first = failed[0].error;
      if (first && first.name === 'AbortError') {
        return res
          .status(502)
          .json({ error: 'Gemini phản hồi quá chậm (quá 60 giây), vui lòng thử lại' });
      }
      if (first && (first.status === 400 || first.status === 401 || first.status === 403)) {
        return res.status(502).json({
          error:
            'Gemini từ chối yêu cầu (mã ' +
            first.status +
            '). Vui lòng kiểm tra lại GEMINI_API_KEY trên máy chủ.',
        });
      }
      if (first && (first.status === 429 || first.status === 500 || first.status === 502 || first.status === 503)) {
        return res.status(502).json({
          error:
            'Gemini đang bận (mã ' + first.status + '), vui lòng thử lại sau ít phút.',
        });
      }
      if (first && first.kind === 'parse') {
        return res.status(502).json({
          error: 'Gemini trả về kết quả không đúng định dạng, vui lòng thử lại',
        });
      }
      return res
        .status(502)
        .json({ error: 'Không gọi được Gemini, vui lòng thử lại sau' });
    }

    // ---------- Gop ket qua cac block theo dung thu tu block ----------
    const questions = [];
    const warnings = [...structure.warnings];
    blockResults.forEach((r) => {
      const block = r.block;
      if (!r.ok) {
        const partLabel = block.part ? `Part ${block.part}` : 'khối toàn bộ file';
        warnings.push(
          `Không nhận diện được khối ${partLabel} (${r.error.message || 'lỗi không xác định'})`
        );
        // Block Part 1/2 loi hoan toan (vd Gemini 429): van tao cau giu cho
        // de admin dien tay thay vi mat trang ca Part.
        if (block.part === 1 || block.part === 2) {
          const { placeholders, warnings: pw } = fillListeningPlaceholders(
            block.part,
            block.expectedQuestions || [],
            0
          );
          questions.push(...placeholders);
          warnings.push(...pw);
        } else if (block.part === 0 && block.expectedByPart) {
          for (const part of [1, 2]) {
            const exp = block.expectedByPart[part] || [];
            if (!exp.length) continue;
            const { placeholders, warnings: pw } = fillListeningPlaceholders(part, exp, 0);
            questions.push(...placeholders);
            warnings.push(...pw);
          }
        }
        return;
      }
      const parsed = r.parsed;
      if (Array.isArray(parsed.warnings)) {
        for (const w of parsed.warnings) {
          if (typeof w === 'string') warnings.push(w);
        }
      }
      const rawQs = parsed.questions.map(normalizeQuestion);
      const expected = block.expectedQuestions || [];
      const countMismatch = expected.length > 0 && rawQs.length !== expected.length;
      const blockHasWarning =
        Array.isArray(block.warnings) && block.warnings.length > 0;
      rawQs.forEach((q, k) => {
        // confidence: "low" khi chua co dap an, khi block co warning, khi so
        // cau tra ve lech so ky vong, hoac khi dap an AI khong khop answer
        // key tang 2 da tach (cau tra ve thu k ung voi expectedQuestions[k]).
        let confidence = 'high';
        if (!q.correct) {
          confidence = 'low';
        } else if (countMismatch || blockHasWarning) {
          confidence = 'low';
        } else if (expected.length > 0 && structure.answerKey) {
          const expectedNum = expected[k];
          const keyAns =
            expectedNum != null ? structure.answerKey[String(expectedNum)] : undefined;
          if (keyAns && q.correct !== keyAns) confidence = 'low';
        }
        questions.push({ ...q, confidence });
      });
      // Part 1/2 chi-nghe: AI tra ve it cau hon so ky vong thi bu cau giu
      // cho cho cac so con thieu (di qua luong `invalid` nhu cau thuong).
      if (block.part === 1 || block.part === 2) {
        const { placeholders, warnings: pw } = fillListeningPlaceholders(
          block.part,
          expected,
          rawQs.length
        );
        questions.push(...placeholders);
        warnings.push(...pw);
      } else if (block.part === 0 && block.expectedByPart) {
        // Nhom single-call (1 call cho ca file): dem cau AI tra ve theo
        // tung Part 1/2 roi bu giu cho cho phan thieu.
        for (const part of [1, 2]) {
          const exp = block.expectedByPart[part] || [];
          if (!exp.length) continue;
          const got = rawQs.filter((q) => q.part === part).length;
          const { placeholders, warnings: pw } = fillListeningPlaceholders(part, exp, got);
          questions.push(...placeholders);
          warnings.push(...pw);
        }
      }
    });

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

    return res.json({ questions, invalid, warnings, structure });
  });
});

module.exports = router;
module.exports.extractText = extractText;
module.exports.selectParseMode = selectParseMode;
module.exports.fillListeningPlaceholders = fillListeningPlaceholders;
