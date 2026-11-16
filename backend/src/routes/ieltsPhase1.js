'use strict';

/**
 * ieltsPhase1.js — IELTS Phase 1: first-run setup, man "Hom nay" (DUNG CHUNG
 * cho ca TOEIC lan IELTS), diagnostic, error log / quai, Writing + Speaking
 * baseline. Chi them moi — khong sua route/bang cu.
 *
 * "Hom nay" dung chung, exam-aware (scope update 2026-11-16):
 *  - Cung 1 handler, mount o ca /api/today va /api/ielts/today
 *    (?exam=toeic|ielts; mac dinh: duong /ielts/* -> ielts, /today -> toeic).
 *  - Streak + ngay nghi mien phi + carriedOver KHONG phan biet exam:
 *    sessions cua ca 2 exam deu tinh la hoat dong.
 *  - exam=toeic: review = cau sai cu (bang wrong_questions, CHI DOC),
 *    drill = Part TOEIC yeu nhat, active = luyen TOEIC theo Part yeu nhat.
 *  - exam=ielts: review = loi den han on (error_log), drill = dang cau
 *    IELTS yeu nhat, active = skim (doc luot).
 * Bad-day: TOEIC -> 5 cau Part 5 nhanh; IELTS -> tuyen theo thu trong tuan.
 */

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { awardXp, computeStreakDays } = require('../xp');
const { ieltsBandForSkill, ieltsOverallBand } = require('../scoring');

const router = express.Router();

/* ---------------- error codes (ma loi = quai) ---------------- */

const IELTS_ERROR_CODES = [
  // Listening
  { code: 'L1', skill: 'listening', name: 'Không nhận ra từ (nối âm, nuốt âm)' },
  { code: 'L2', skill: 'listening', name: 'Hiểu nhưng không kịp ghi' },
  { code: 'L3', skill: 'listening', name: 'Mất tập trung/lạc câu' },
  { code: 'L4', skill: 'listening', name: 'Dính bẫy đổi ý / phủ định' },
  { code: 'L5', skill: 'listening', name: 'Sai chính tả / số ít-số nhiều / viết hoa' },
  { code: 'L6', skill: 'listening', name: 'Không hiểu paraphrase' },
  { code: 'L7', skill: 'listening', name: 'Không quen giọng' },
  { code: 'L8', skill: 'listening', name: 'Sai giới hạn số từ / sai dạng từ' },
  { code: 'L9', skill: 'listening', name: 'Sai khi chép sang phiếu' },
  // Reading
  { code: 'R1', skill: 'reading', name: 'Không biết từ' },
  { code: 'R2', skill: 'reading', name: 'Hiểu sai paraphrase' },
  { code: 'R3', skill: 'reading', name: 'Nhầm False và Not Given' },
  { code: 'R4', skill: 'reading', name: 'Bị từ khóa đánh lừa' },
  { code: 'R5', skill: 'reading', name: 'Hết giờ' },
  { code: 'R6', skill: 'reading', name: 'Sai ý chính (Matching Headings)' },
  { code: 'R7', skill: 'reading', name: 'Đọc ẩu/đọc sót yêu cầu' },
  { code: 'R8', skill: 'reading', name: 'Đoán mò' },
  // Writing
  { code: 'W1', skill: 'writing', name: 'Không trả lời đủ mọi phần của đề, lạc đề' },
  { code: 'W2', skill: 'writing', name: 'Ý mỏng, không phát triển' },
  { code: 'W3', skill: 'writing', name: 'Task 1 thiếu overview hoặc chỉ liệt kê số liệu' },
  { code: 'W4', skill: 'writing', name: 'Liên kết sai hoặc lạm dụng linking words' },
  { code: 'W5', skill: 'writing', name: 'Từ vựng lặp, dùng từ sai sắc thái' },
  { code: 'W6', skill: 'writing', name: 'Cấu trúc câu đơn điệu' },
  { code: 'W7', skill: 'writing', name: 'Lỗi ngữ pháp lặp (mạo từ, thì, chủ-vị)' },
  { code: 'W8', skill: 'writing', name: 'Thiếu số từ hoặc hết giờ' },
  // Speaking
  { code: 'S1', skill: 'speaking', name: 'Ngập ngừng dài, lặp từ đệm' },
  { code: 'S2', skill: 'speaking', name: 'Trả lời quá ngắn' },
  { code: 'S3', skill: 'speaking', name: 'Part 2 hết ý trước 1:30' },
  { code: 'S4', skill: 'speaking', name: 'Từ vựng nghèo, lặp' },
  { code: 'S5', skill: 'speaking', name: 'Lỗi ngữ pháp lặp' },
  { code: 'S6', skill: 'speaking', name: 'Sai âm cuối, âm th, s/z' },
  { code: 'S7', skill: 'speaking', name: 'Ngữ điệu phẳng, trọng âm sai' },
  { code: 'S8', skill: 'speaking', name: 'Hiểu sai câu hỏi' },
];

const ERROR_CODE_SET = new Set(IELTS_ERROR_CODES.map((c) => c.code));
const QUIT_REASONS = ['chan', 'met', 'khong_thay_tien_bo'];
const SKILLS = ['listening', 'reading', 'writing', 'speaking'];
const TODAY_BLOCKS = ['review', 'drill', 'active'];
const TODAY_MODULES = ['today-review', 'today-drill', 'today-active'];
const MAX_AUDIO_BASE64 = 4000000;

/* ---------------- helpers ngay gio (UTC, cung quy uoc voi xp.js) ---------------- */

/** Thu 2 dau tuan ISO cua 1 ngay YYYY-MM-DD. */
function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const day = d.getUTCDay(); // 0 = CN, 1 = T2 ... 6 = T7
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function isValidBand(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 9;
}

function resolveExam(req, defaultExam) {
  const q = req.query && req.query.exam;
  if (q === 'toeic' || q === 'ielts') return q;
  const b = req.body && req.body.exam;
  if (b === 'toeic' || b === 'ielts') return b;
  return defaultExam;
}

/* ---------------- profile (first-run setup) ---------------- */

router.get('/ielts/profile', authMiddleware, (req, res) => {
  const profile = db.getIeltsProfile(req.user.id);
  if (!profile) return res.json({ setupDone: false });
  return res.json(profile);
});

router.post('/ielts/profile', authMiddleware, (req, res) => {
  const b = req.body || {};
  if (b.quitReason !== undefined && b.quitReason !== null && !QUIT_REASONS.includes(b.quitReason)) {
    return res.status(400).json({ error: 'quitReason khong hop le' });
  }
  for (const key of ['targetListening', 'targetReading', 'targetWriting', 'targetSpeaking']) {
    if (b[key] !== undefined && b[key] !== null && !isValidBand(b[key])) {
      return res.status(400).json({ error: `${key} phai tu 0 den 9` });
    }
  }
  if (b.examDate !== undefined && b.examDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(b.examDate)) {
    return res.status(400).json({ error: 'examDate phai dang YYYY-MM-DD' });
  }
  const saved = db.setIeltsProfile(req.user.id, {
    examDate: b.examDate !== undefined ? b.examDate : undefined,
    targetListening: b.targetListening !== undefined ? b.targetListening : undefined,
    targetReading: b.targetReading !== undefined ? b.targetReading : undefined,
    targetWriting: b.targetWriting !== undefined ? b.targetWriting : undefined,
    targetSpeaking: b.targetSpeaking !== undefined ? b.targetSpeaking : undefined,
    quitReason: b.quitReason !== undefined ? b.quitReason : undefined,
    setupDone: b.setupDone !== undefined ? !!b.setupDone : undefined,
    skipped: b.skipped !== undefined ? !!b.skipped : undefined,
  });
  return res.json(saved);
});

/* ---------------- "Hom nay" — dung chung TOEIC + IELTS ---------------- */

function buildTodayResponse(userId, exam) {
  const today = db.todayStr();
  const diagnostic = db.getLatestMockTest(userId, 'diagnostic');
  const profile = db.getIeltsProfile(userId);

  let blocks;
  if (exam === 'toeic') {
    // (1) Review = cau sai cu (wrong_questions, chi doc).
    const queue = db.getWrongQueue(userId, 'toeic', 10);
    const dueCount = db.countWrongQuestions(userId, 'toeic');
    // (2) Drill = Part TOEIC yeu nhat (do chinh xac thap nhat, da lam > 0 cau).
    const stats = db.getUserAnswerStats(userId, 'toeic');
    let weakestPart = null;
    let weakestAccuracy = null;
    for (const s of stats) {
      if (s.answered <= 0) continue;
      const acc = s.correct / s.answered;
      if (weakestAccuracy === null || acc < weakestAccuracy) {
        weakestAccuracy = acc;
        weakestPart = s.part;
      }
    }
    const countsByPart = db.countByPart('toeic');
    const questionCount = weakestPart != null
      ? (countsByPart.find((c) => c.part === weakestPart) || { count: 0 }).count
      : 0;
    blocks = [
      { id: 'review', dueCount, questionIds: queue.map((q) => q.questionId) },
      {
        id: 'drill',
        weakestPart,
        questionCount,
        ...(weakestPart == null ? { message: 'Lam 1 bai thi thu hoac luyen tap truoc de biet Part yeu nhat' } : {}),
      },
      { id: 'active', kind: 'toeic-practice', part: weakestPart || 5 },
    ];
  } else {
    // (1) Review = loi IELTS den han on.
    const dueCount = db.listDueErrorLog(userId).length;
    // (2) Drill = dang cau IELTS yeu nhat.
    const stats = db.getUserAnswerStatsByType(userId, 'ielts');
    let weakestType = null;
    let weakestAccuracy = null;
    for (const s of stats) {
      if (s.answered <= 0) continue;
      const acc = s.correct / s.answered;
      if (weakestAccuracy === null || acc < weakestAccuracy) {
        weakestAccuracy = acc;
        weakestType = s.questionType;
      }
    }
    const questionCount = weakestType ? db.countQuestionsByType('ielts', weakestType) : 0;
    blocks = [
      { id: 'review', dueCount },
      {
        id: 'drill',
        weakestType,
        questionCount,
        ...(weakestType == null ? { message: 'Lam bai diagnostic truoc de biet dang yeu nhat' } : {}),
      },
      { id: 'active', kind: 'skim' },
    ];
  }

  // Streak dung chung (khong phan biet exam) — dem tu attempts (xp.js).
  const current = computeStreakDays(userId);
  // Ngay nghi mien phi: 1 ngay/tuan ISO. Ngay nghi = ngay da qua trong tuan
  // nay (tu thu 2 den hom qua) ma khong co session nao. Da dung 1 ngay nghi
  // thi het luot (freeRestLeft = 0); chua dung ngay nao thi con 1 luot.
  const monday = mondayOf(today);
  const weekSessions = db.listSessionsByDateRange(userId, monday, today);
  const activeDates = new Set(weekSessions.map((s) => s.date));
  let restUsed = false;
  let cursor = monday;
  while (cursor < today) {
    if (!activeDates.has(cursor)) { restUsed = true; break; }
    cursor = db.addDaysStr(cursor, 1);
  }
  const freeRestLeft = restUsed ? 0 : 1;

  // carriedOver: hom qua lam chua du 3 khoi -> mang toi da 1 khoi chua xong
  // dau tien sang hom nay (tinh chung ca 2 exam).
  const yesterday = db.addDaysStr(today, -1);
  const ySessions = db.listSessionsByDateRange(userId, yesterday, yesterday);
  const doneYesterday = new Set(
    ySessions.filter((s) => s.goalCompleted && TODAY_MODULES.includes(s.module))
      .map((s) => s.module.replace('today-', ''))
  );
  const carriedOver = [];
  if (doneYesterday.size < 3) {
    const firstMissing = TODAY_BLOCKS.find((b) => !doneYesterday.has(b));
    if (firstMissing) carriedOver.push(firstMissing);
  }

  return {
    date: today,
    exam,
    diagnosticDone: !!(diagnostic && diagnostic.valid),
    profile,
    blocks,
    streak: { current, freeRestLeft, freeRestUsed: restUsed ? 1 : 0 },
    badDayAvailable: true,
    carriedOver,
  };
}

function todayHandler(defaultExam) {
  return (req, res) => {
    const exam = resolveExam(req, defaultExam);
    return res.json(buildTodayResponse(req.user.id, exam));
  };
}

// Cung 1 handler, 2 duong dan: /api/today (mac dinh toeic) va
// /api/ielts/today (mac dinh ielts). Ca 2 deu nhan ?exam=toeic|ielts.
router.get('/today', authMiddleware, todayHandler('toeic'));
router.get('/ielts/today', authMiddleware, todayHandler('ielts'));

function todayCompleteHandler(defaultExam) {
  return (req, res) => {
    const b = req.body || {};
    if (!TODAY_BLOCKS.includes(b.blockId)) {
      return res.status(400).json({ error: 'blockId phai la review, drill hoac active' });
    }
    const minutes = b.minutes !== undefined && b.minutes !== null ? parseInt(b.minutes, 10) : null;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0)) {
      return res.status(400).json({ error: 'minutes phai la so nguyen >= 0' });
    }
    const exam = resolveExam(req, defaultExam);
    const session = db.createSession(req.user.id, {
      date: db.todayStr(),
      minutes,
      module: `today-${b.blockId}`,
      goalCompleted: true,
      exam,
    });
    return res.json({ ok: true, session });
  };
}

router.post('/today/complete', authMiddleware, todayCompleteHandler('toeic'));
router.post('/ielts/today/complete', authMiddleware, todayCompleteHandler('ielts'));

function badDayTaskIelts() {
  const dow = new Date().getUTCDay(); // 0 = CN ... 6 = T7
  if (dow === 1 || dow === 3 || dow === 5) {
    // T2/T4/T6: dictation — trich doan script Section 1 cua de mau TS-024.
    let excerpt = null;
    const passage = db.getPassage('IELTS-L-S1');
    if (passage && passage.script) excerpt = passage.script.slice(0, 600);
    if (!excerpt) {
      excerpt = 'Good morning, Central Library. How can I help you? Hello, I would like to book a place on the guided tour next Saturday, please. Of course. The tour starts at 9.30 in the morning and lasts about two hours.';
    }
    return {
      kind: 'dictation',
      title: 'Nghe — chép chính tả 5 phút',
      detail: 'Nghe và chép lại đoạn hội thoại dưới đây (nghe 2–3 lần, không nhìn trước đáp án): ' + excerpt,
    };
  }
  if (dow === 2 || dow === 4) {
    // T3/T5: viet 1 doan van theo de Task 2 mau (luan phien WT-1/WT-2).
    const tasks = db.listWritingTasks().filter((t) => t.taskType === 'task2');
    const task = tasks.length ? tasks[(dow === 2 ? 0 : 1) % tasks.length] : null;
    return {
      kind: 'writing',
      title: 'Viết 1 đoạn văn 5–10 phút',
      detail: task
        ? `Viết 1 đoạn thân bài (khoảng 80–100 từ) cho đề sau: ${task.prompt}`
        : 'Viết 1 đoạn thân bài (khoảng 80–100 từ) về chủ đề: Some people believe that university education should be free for all students.',
    };
  }
  // T7/CN: noi Part 1.
  const prompts = db.listSpeakingPrompts().filter((p) => p.part === 1);
  const prompt = prompts.length ? prompts[new Date().getUTCDate() % prompts.length] : null;
  return {
    kind: 'speaking',
    title: 'Nói Part 1 — 5 phút',
    detail: prompt
      ? `${prompt.prompt} ${Array.isArray(prompt.cueCard) ? prompt.cueCard.join(' ') : ''}`
      : 'Trả lời to thành tiếng 2–3 câu: What do you like to do in your free time?',
  };
}

function badDayHandler(defaultExam) {
  return (req, res) => {
    const exam = resolveExam(req, defaultExam);
    if (exam === 'toeic') {
      return res.json({
        kind: 'toeic-drill',
        title: 'Luyện nhanh 5 câu Part 5',
        detail: 'Hôm nay mệt thì chỉ cần làm 5 câu Part 5 (khoảng 5–10 phút) — mở phần luyện Part 5 của TOEIC và làm 5 câu đầu tiên.',
        part: 5,
        questionCount: 5,
      });
    }
    return res.json(badDayTaskIelts());
  };
}

router.post('/today/bad-day', authMiddleware, badDayHandler('toeic'));
router.post('/ielts/today/bad-day', authMiddleware, badDayHandler('ielts'));

/* ---------------- diagnostic (dung lai flow mock TS-024) ---------------- */

router.post('/ielts/diagnostic/complete', authMiddleware, (req, res) => {
  const attemptId = parseInt((req.body || {}).attemptId, 10);
  if (!Number.isInteger(attemptId)) {
    return res.status(400).json({ error: 'thieu attemptId' });
  }
  const attempt = db.getAttempt(attemptId);
  if (!attempt) return res.status(404).json({ error: 'khong tim thay bai thi' });
  if (attempt.userId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (attempt.exam !== 'ielts' || attempt.mode !== 'full') {
    return res.status(400).json({ error: 'chi ap dung cho bai thi full IELTS' });
  }
  if (!attempt.finishedAt) {
    return res.status(400).json({ error: 'bai thi chua nop' });
  }

  const answers = db.getAnswersByAttempt(attempt.id);
  const ansMap = new Map(answers.map((a) => [a.questionId, a]));

  const bySection = [1, 2, 3, 4].map((part) => ({ part, correct: 0, total: 0 }));
  const passageMap = new Map();
  const typeMap = new Map();
  let listeningCorrect = 0;
  let readingCorrect = 0;
  for (const qid of attempt.questionIds || []) {
    const q = db.getQuestionRowById(qid);
    if (!q) continue;
    const ans = ansMap.get(qid);
    const correct = ans && ans.isCorrect === true;
    const answered = !!ans && ans.isCorrect != null;
    const type = q.question_type || 'multiple_choice';
    if (q.part >= 1 && q.part <= 4) {
      bySection[q.part - 1].total += 1;
      if (correct) { bySection[q.part - 1].correct += 1; listeningCorrect += 1; }
    } else if (q.part >= 5 && q.part <= 7) {
      const pid = q.passage_id || 'no-passage';
      if (!passageMap.has(pid)) passageMap.set(pid, { passageId: pid, correct: 0, total: 0 });
      const p = passageMap.get(pid);
      p.total += 1;
      if (correct) { p.correct += 1; readingCorrect += 1; }
    }
    if (!typeMap.has(type)) typeMap.set(type, { questionType: type, correct: 0, total: 0, answered: 0 });
    const t = typeMap.get(type);
    t.total += 1;
    if (answered) t.answered += 1;
    if (correct) t.correct += 1;
  }
  const byPassage = [...passageMap.values()];
  const byType = [...typeMap.values()].map((t) => ({
    ...t,
    accuracy: t.answered > 0 ? Math.round((t.correct / t.answered) * 1000) / 10 : null,
  }));
  const weakestTypes = byType
    .filter((t) => t.answered >= 1)
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100))
    .slice(0, 3)
    .map((t) => t.questionType);
  // Chua co ma loi (error code) cho cac cau nay: nhom cau sai theo dang cau
  // hoi de thay the, ghi ro nhan de frontend khong hieu nham la ma loi that.
  const wrongByType = new Map();
  for (const a of answers) {
    if (a.isCorrect !== false) continue;
    const q = db.getQuestionRowById(a.questionId);
    const type = (q && q.question_type) || 'multiple_choice';
    wrongByType.set(type, (wrongByType.get(type) || 0) + 1);
  }
  const topErrorGroups = [...wrongByType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([questionType, count]) => ({
      questionType,
      count,
      note: 'Nhóm theo dạng câu hỏi — chưa có mã lỗi (error code) cho các câu này',
    }));

  const listeningBand = ieltsBandForSkill(listeningCorrect, 'listening');
  const readingBand = ieltsBandForSkill(readingCorrect, 'reading');
  const overallBand = ieltsOverallBand(listeningBand, readingBand);
  const totalCorrect = listeningCorrect + readingCorrect;

  const stored = db.createMockTest({
    userId: req.user.id,
    kind: 'diagnostic',
    exam: 'ielts',
    testSetId: attempt.testSetId,
    attemptId: attempt.id,
    listeningCorrect,
    readingCorrect,
    listeningBand,
    readingBand,
    overallBand,
    durationSec: attempt.durationSec,
    abilityMap: {
      bySection,
      byPassage,
      byType,
      weakestTypes,
      topErrorGroups,
      bands: { listening: listeningBand, reading: readingBand, overall: overallBand },
      totalCorrect,
      totalQuestions: (attempt.questionIds || []).length,
    },
  });
  return res.json(stored);
});

router.get('/ielts/diagnostic/latest', authMiddleware, (req, res) => {
  const row = db.getLatestMockTest(req.user.id, 'diagnostic');
  return res.json(row || null);
});

/* ---------------- error codes / error log / quai ---------------- */

router.get('/ielts/error-codes', authMiddleware, (req, res) => {
  return res.json(IELTS_ERROR_CODES);
});

router.post('/ielts/error-log', authMiddleware, (req, res) => {
  const b = req.body || {};
  if (!SKILLS.includes(b.skill)) {
    return res.status(400).json({ error: 'skill phai la listening, reading, writing hoac speaking' });
  }
  if (!b.errorCode || !ERROR_CODE_SET.has(b.errorCode)) {
    return res.status(400).json({ error: 'errorCode khong hop le' });
  }
  if (b.attemptId !== undefined && b.attemptId !== null) {
    const attempt = db.getAttempt(parseInt(b.attemptId, 10));
    if (!attempt) return res.status(404).json({ error: 'khong tim thay bai thi' });
    if (attempt.userId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  }
  const row = db.createErrorLog({
    userId: req.user.id,
    questionId: b.questionId || null,
    attemptId: b.attemptId !== undefined && b.attemptId !== null ? parseInt(b.attemptId, 10) : null,
    skill: b.skill,
    questionType: b.questionType || null,
    errorCode: b.errorCode,
    evidence: b.evidence || null,
    missedKeyword: b.missedKeyword || null,
    timeSpentSec: b.timeSpentSec !== undefined && b.timeSpentSec !== null ? parseInt(b.timeSpentSec, 10) : null,
    guessed: !!b.guessed,
  });
  return res.status(201).json(row);
});

router.get('/ielts/error-log', authMiddleware, (req, res) => {
  const { skill, code, resolved } = req.query || {};
  if (skill && !SKILLS.includes(skill)) {
    return res.status(400).json({ error: 'skill khong hop le' });
  }
  if (code && !ERROR_CODE_SET.has(code)) {
    return res.status(400).json({ error: 'errorCode khong hop le' });
  }
  let resolvedBool;
  if (resolved === 'true') resolvedBool = true;
  else if (resolved === 'false') resolvedBool = false;
  else if (resolved !== undefined) {
    return res.status(400).json({ error: 'resolved phai la true hoac false' });
  }
  return res.json(db.listErrorLog(req.user.id, { skill, code, resolved: resolvedBool }));
});

router.get('/ielts/error-log/due', authMiddleware, (req, res) => {
  return res.json(db.listDueErrorLog(req.user.id));
});

router.get('/ielts/error-log/weekly', authMiddleware, (req, res) => {
  // So loi theo ma, theo tuan ISO (bat dau thu 2), 6 tuan gan nhat.
  const monday = mondayOf(db.todayStr());
  const since = db.addDaysStr(monday, -7 * 5);
  const rows = db.listErrorLog(req.user.id, {});
  const counts = new Map();
  for (const r of rows) {
    if (!r.createdAt) continue;
    const day = r.createdAt.slice(0, 10);
    if (day < since) continue;
    const week = mondayOf(day);
    const key = `${week}|${r.errorCode}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const out = [...counts.entries()]
    .map(([key, count]) => {
      const [week, code] = key.split('|');
      return { week, code, count };
    })
    .sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : b.count - a.count));
  return res.json(out);
});

router.post('/ielts/error-log/:id/review', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  if (typeof b.correct !== 'boolean') {
    return res.status(400).json({ error: 'correct phai la true hoac false' });
  }
  const cur = db.getErrorLogById(id);
  if (!cur || cur.userId !== req.user.id) {
    return res.status(404).json({ error: 'khong tim thay loi' });
  }
  const updated = db.reviewErrorLog(id, b.correct);
  let monster = null;
  let xpAwarded = 0;
  if (b.correct) {
    monster = db.bumpMonsterHit(req.user.id, cur.errorCode);
    const r = awardXp(req.user.id, 15, 'ielts_error_review');
    xpAwarded = r.xpAwarded;
  }
  return res.json({ errorLog: updated, monster, xpAwarded });
});

router.get('/ielts/monsters', authMiddleware, (req, res) => {
  const counts = new Map(db.getErrorLogCountsByCode(req.user.id).map((c) => [c.code, c]));
  const states = new Map(db.listMonsterStates(req.user.id).map((s) => [s.errorCode, s]));
  return res.json(
    IELTS_ERROR_CODES.map((c) => {
      const count = counts.get(c.code) || { total: 0, resolved: 0 };
      const state = states.get(c.code);
      const hits = state ? state.hits : 0;
      return {
        code: c.code,
        skill: c.skill,
        name: c.name,
        total: count.total,
        resolved: count.resolved,
        hits,
        killed: state ? state.killed : false,
        hp: 3 - hits,
      };
    })
  );
});

/* ---------------- Writing ---------------- */

router.get('/ielts/writing/tasks', authMiddleware, (req, res) => {
  return res.json(db.listWritingTasks());
});

router.post('/ielts/writing/submissions', authMiddleware, (req, res) => {
  const b = req.body || {};
  if (!b.taskId || typeof b.taskId !== 'string') {
    return res.status(400).json({ error: 'thieu taskId' });
  }
  const task = db.getWritingTask(b.taskId);
  if (!task) return res.status(404).json({ error: 'khong tim thay de viet' });
  if (!b.content || typeof b.content !== 'string' || !b.content.trim()) {
    return res.status(400).json({ error: 'thieu noi dung bai viet' });
  }
  const wordCount = b.content.trim().split(/\s+/).length;
  const submission = db.createWritingSubmission({
    userId: req.user.id,
    taskId: b.taskId,
    content: b.content,
    wordCount,
    durationSec: b.durationSec !== undefined && b.durationSec !== null ? parseInt(b.durationSec, 10) : null,
    selfScores: b.selfScores && typeof b.selfScores === 'object' ? b.selfScores : null,
    isBaseline: !!b.isBaseline,
  });
  const { xpAwarded } = awardXp(req.user.id, 20, 'ielts_writing_submit');
  return res.status(201).json({ submission, xpAwarded });
});

router.get('/ielts/writing/submissions', authMiddleware, (req, res) => {
  return res.json(db.listWritingSubmissions(req.user.id));
});

/* ---------------- Speaking ---------------- */

router.get('/ielts/speaking/prompts', authMiddleware, (req, res) => {
  const all = db.listSpeakingPrompts();
  return res.json({
    part1: all.filter((p) => p.part === 1),
    part2: all.filter((p) => p.part === 2),
    part3: all.filter((p) => p.part === 3),
  });
});

router.post('/ielts/speaking/recordings', authMiddleware, (req, res) => {
  const b = req.body || {};
  if (!b.promptId || typeof b.promptId !== 'string') {
    return res.status(400).json({ error: 'thieu promptId' });
  }
  const prompt = db.getSpeakingPrompt(b.promptId);
  if (!prompt) return res.status(404).json({ error: 'khong tim thay prompt' });
  const part = parseInt(b.part, 10);
  if (!Number.isInteger(part) || part < 1 || part > 3) {
    return res.status(400).json({ error: 'part phai tu 1 den 3' });
  }
  if (!b.audioBase64 || typeof b.audioBase64 !== 'string') {
    return res.status(400).json({ error: 'thieu audioBase64' });
  }
  if (b.audioBase64.length > MAX_AUDIO_BASE64) {
    return res.status(413).json({ error: 'audio_too_large' });
  }
  const recording = db.createSpeakingRecording({
    userId: req.user.id,
    promptId: b.promptId,
    part,
    audioData: b.audioBase64,
    mimeType: b.mimeType || 'audio/webm',
    durationSec: b.durationSec !== undefined && b.durationSec !== null ? parseInt(b.durationSec, 10) : null,
    isBaseline: !!b.isBaseline,
  });
  const { xpAwarded } = awardXp(req.user.id, 10, 'ielts_speaking_record');
  return res.status(201).json({ recording, xpAwarded });
});

router.get('/ielts/speaking/recordings', authMiddleware, (req, res) => {
  return res.json(db.listSpeakingRecordings(req.user.id));
});

module.exports = router;
module.exports.IELTS_ERROR_CODES = IELTS_ERROR_CODES;
module.exports.QUIT_REASONS = QUIT_REASONS;
