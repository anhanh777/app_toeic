// API client — port của frontend/src/api.ts (web) sang React Native.
// Cùng endpoints, types và thông báo lỗi tiếng Việt.
// Khác web: token lưu trong expo-secure-store (không có localStorage trên RN),
// base URL lấy từ EXPO_PUBLIC_API_URL, mặc định backend Render.
import * as SecureStore from 'expo-secure-store';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://app-toeic-backend.onrender.com';

const TOKEN_KEY = 'toeic_token';

// Token giữ trong bộ nhớ để req() đồng bộ dùng được; SecureStore là
// nguồn bền vững (khởi động app → loadStoredToken() nạp lại vào cache).
let cachedToken: string | null = null;

export async function loadStoredToken(): Promise<string | null> {
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export function getCachedToken(): string | null {
  return cachedToken;
}

export async function setToken(t: string | null): Promise<void> {
  cachedToken = t;
  try {
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* SecureStore không dùng được (vd. web) — token vẫn ở trong bộ nhớ */
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const VI_ERRORS: Record<string, string> = {
  google_not_configured: 'Chưa cấu hình Google OAuth trên máy chủ.',
  gemini_not_configured: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ.',
  cloudinary_not_configured: 'Chưa cấu hình Cloudinary trên máy chủ.',
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  user_exists: 'Email này đã được đăng ký.',
  unauthorized: 'Bạn cần đăng nhập lại.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  not_found: 'Không tìm thấy dữ liệu.',
  vuot_gioi_han_tu: 'Quá giới hạn số từ cho câu này. Hãy rút gọn đáp án rồi nộp lại.',
};

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = cachedToken;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    });
  } catch {
    throw new ApiError(
      0,
      'Không kết nối được tới máy chủ. Hãy kiểm tra mạng rồi thử lại.',
    );
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error;
    const msg = (err && VI_ERRORS[err]) || err || `Lỗi máy chủ (${res.status}).`;
    throw new ApiError(res.status, msg, err);
  }
  return data as T;
}

export interface User {
  id: number; email: string; name: string; role: 'user' | 'admin';
  targetScore?: number; target_score?: number; hideOnLeaderboard?: boolean;
  hide_on_leaderboard?: number; avatarUrl?: string; avatar_url?: string;
  googleId?: string | null; createdAt?: string;
}
export interface Option { label: string; content: string; is_correct?: number; }
export interface Question {
  id: string; part: number; passageId?: string | null; passageTitle?: string;
  passageText?: string; script?: string; content: string;
  options: Option[]; topic?: string; difficulty?: string;
  explanation?: string; correct?: string; correctLabel?: string;
  imageUrl?: string | null; audioUrl?: string | null;
  /** IELTS: kỳ thi, dạng câu hỏi, giới hạn số từ (câu điền từ). */
  exam?: string; questionType?: string; wordLimit?: number;
  acceptedAnswers?: string[];
  /** Đáp án đúng dạng text — chỉ có sau khi chấm câu điền từ. */
  correctText?: string | null;
}
export interface ExamInfo {
  id: string; title: string; subtitle: string; scale: string;
  testSetCount: number; questionCount: number;
}
export interface IeltsBandTable {
  listening: [number, number][]; reading: [number, number][]; note?: string;
}
export interface TestResultDetail {
  questionId: string; questionType?: string; wordLimit?: number; part?: number;
  correctText?: string | null; correctLabel?: string | null;
  selected?: string; correct?: boolean; content?: string;
  explanation?: string | null; script?: string | null; passageText?: string | null;
  /** Đã có sẵn trong payload /api/tests/:id/result (để vẽ "Xem trên đề"):
   * phương án, đoạn văn, ảnh câu hỏi. */
  options?: { label: string; content?: string; isCorrect?: boolean }[];
  passageId?: string | null; passageTitle?: string | null; imageUrl?: string | null;
}
export interface PartInfo { part: number; count: number; section?: string; listening?: boolean; reading?: boolean; }
export interface Vocab { id: string; word: string; phonetic?: string; meaning: string; example?: string; topic?: string; }
/** Kết quả tra từ điển: nghĩa tiếng Việt + loại từ + phiên âm + ví dụ. */
export interface DictionaryEntry { word: string; phonetic?: string | null; pos?: string | null; meaning_vi: string; example?: string | null; cached?: boolean; saved?: boolean; id?: number; status?: 'learning' | 'learned' | 'wrong'; }
/** 1 từ trong kho cá nhân "Từ của tôi" (lưu theo user). */
export interface UserWord { id: number; word: string; phonetic?: string | null; pos?: string | null; meaning: string; example?: string | null; context?: string | null; topic?: string | null; status: 'learning' | 'learned' | 'wrong'; createdAt?: string; updatedAt?: string; }
export interface StatsOverview {
  totalAnswered: number; totalCorrect: number; accuracy: number;
  byPart: { part: number; answered: number; correct: number; accuracy: number }[];
  weakestPart?: number | null; streakDays: number; targetScore: number;
  totalXp: number; recentScores: { date: string; totalScore: number }[];
  /** IELTS: tỉ lệ đúng từng dạng câu + band theo thời gian. */
  byType?: { questionType: string; answered: number; correct: number; accuracy: number }[];
  weakestType?: string | null;
  bandHistory?: { date: string; listeningBand: number; readingBand: number; overallBand: number }[];
}
export interface LeaderboardEntry { rank: number; name: string; avatarUrl?: string; score: number; xp: number; answered?: number; }
export interface Attempt {
  id: number; mode: string; part?: number; started_at?: string; finished_at?: string;
  total_score?: number; listening_score?: number; reading_score?: number;
  listening_correct?: number; reading_correct?: number; duration_sec?: number;
  /** IELTS: kỳ thi + band (chỉ bài full IELTS mới có). */
  exam?: string; listeningBand?: number; readingBand?: number; overallBand?: number;
  /** Backend /api/tests/history tra them cac truong nay (camelCase):
   * de thi cua bai lam + moc thoi gian + so cau/thoi gian lam/cau dung. */
  testSetId?: string; startedAt?: string; finishedAt?: string;
  questionCount?: number; durationSec?: number;
  listeningCorrect?: number; readingCorrect?: number;
  totalScore?: number; listeningScore?: number; readingScore?: number;
  xpEarned?: number;
}

// ---- IELTS Giai đoạn 1 (v3): hồ sơ, Hôm nay, chẩn đoán, Viết/Nói,
// sổ lỗi + quái (error codes = monsters). ----
export type QuitReason = 'chan' | 'met' | 'khong_thay_tien_bo';
export interface IeltsProfile {
  examDate?: string | null; targetListening?: number | null; targetReading?: number | null;
  targetWriting?: number | null; targetSpeaking?: number | null;
  quitReason?: QuitReason | null; setupDone?: boolean; skipped?: boolean;
}
export interface TodayBlock {
  id: 'review' | 'drill' | 'active' | string;
  dueCount?: number; dueIds?: string[];
  weakestType?: string | null; weakestPart?: number | null; questionCount?: number;
  kind?: string;
}
export interface TodayData {
  date: string; diagnosticDone: boolean; profile: IeltsProfile | null;
  blocks: TodayBlock[];
  streak: { current: number; freeRestLeft: number; freeRestUsed: number };
  badDayAvailable: boolean; carriedOver: string[];
}
export interface BadDayTask { kind: 'dictation' | 'writing' | 'speaking' | string; title: string; detail: string; }

// Điểm danh hằng ngày (lịch + quà theo mốc): 'checkin' = đã điểm danh,
// 'rest' = ngày nghỉ (bad-day), 'active' = có hoạt động nhưng chưa điểm danh.
export type CheckinDayKind = 'checkin' | 'rest' | 'active';
export interface CheckinMilestone { days: number; title: string; xp: number; achieved: boolean; }
export interface CheckinHistoryItem { date: string; kind: 'checkin' | 'rest'; weekday: string; streakDay: number | null; }
export interface CheckinData {
  today: string; checkedInToday: boolean; restToday: boolean; month: string;
  days: Record<string, CheckinDayKind>;
  streak: { current: number; longest: number };
  totalCheckins: number;
  milestones: CheckinMilestone[];
  nextMilestone: (CheckinMilestone & { remaining: number }) | null;
  history: CheckinHistoryItem[];
  historyHasMore: boolean;
}
export interface CheckinResult {
  ok: boolean; already: boolean; date: string; checkedInToday: boolean;
  xpAwarded: number; streakDays: number; totalCheckins: number;
  milestoneAwarded: (CheckinMilestone & { xpAwarded: number }) | null;
}
export interface DiagnosticMap {
  bySection?: Record<string, { correct: number; total: number }>;
  byPassage?: Record<string, { correct: number; total: number }>;
  byType?: Record<string, { correct: number; total: number }>;
  weakestTypes?: string[]; topErrorGroups?: { code: string; count: number }[];
  bands?: { listening?: number | null; reading?: number | null; overall?: number | null };
  totalCorrect?: number; attemptId?: number; createdAt?: string;
}
export interface WritingTask {
  id: string; type: 'task1' | 'task2'; title: string; prompt: string;
  chartData?: string[][] | { categories: string[]; series: { values: (string | number)[]; year?: number; label?: string }[] } | null; minutes: number; isSample?: boolean;
}
export interface WritingSubmission {
  id: number; taskId: string; content: string; wordCount?: number;
  durationSec?: number | null; selfScores?: Record<string, number> | null;
  isBaseline?: boolean; createdAt?: string;
}
export interface SpeakingPrompt {
  id: string; part: 1 | 2 | 3; topic: string; questions?: string[];
  cueCard?: string; bullets?: string[];
}
export interface SpeakingRecording {
  id: number; promptId: string; part: number; audioData?: string;
  mimeType?: string; durationSec?: number | null; isBaseline?: boolean; createdAt?: string;
}
export interface ErrorLogEntry {
  id: number; questionId?: string | null; attemptId?: number | null;
  skill: 'listening' | 'reading' | 'writing' | 'speaking' | string;
  questionType?: string | null; errorCode: string; evidence?: string | null;
  missedKeyword?: string | null; timeSpentSec?: number | null; guessed?: boolean;
  dueAt?: string | null; reviewCount?: number; createdAt?: string;
}
export interface Monster {
  code: string; skill: string; name: string;
  total: number; resolved: number; hits: number; killed: boolean; hp: number;
}
export interface ErrorCode { code: string; skill: string; name: string; }
export interface WeeklyError { week: string; code: string; count: number; }
export interface TestSetPartCount { part: number; count: number; }
export interface TestSetMissing { part: number; missing: number; }
export interface TestSetProgress {
  byPart: { part: number; answered: number; correct: number }[];
  answeredTotal: number; correctTotal: number;
}
export interface TestSet {
  id: string; title: string; description?: string; totalQuestions: number;
  isPublished: boolean; createdAt: string;
  parts: TestSetPartCount[]; missing: TestSetMissing[];
  progress: TestSetProgress | null;
  exam?: string;
}
export interface ImportQuestion {
  id?: string; part: number; content: string;
  options: { label: string; content: string }[];
  correct: string; explanation?: string; topic?: string; difficulty?: string;
  script?: string; passageId?: string; passageTitle?: string; passageText?: string;
  confidence?: 'high' | 'low';
}
export interface MediaConfig {
  cloudName: string; uploadPreset: string; configured: boolean;
}
export interface AiParseInvalid { index: number; reason: string; }
export interface AiParseStructure {
  mode: 'split' | 'fallback' | 'vision';
  parts: { part: number; startLine: number; questionCount: number }[];
  answerKeyFound: boolean;
  answerKey: Record<string, string> | null;
  warnings: string[];
}

export const api = {
  health: () => req<{ ok: boolean; service: string; time: string }>('/health'),
  register: (name: string, email: string, password: string) =>
    req<{ token: string; user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) =>
    req<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  googleLogin: (idToken: string) =>
    req<{ token: string; user: User }>('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  // GET /api/auth/me và PATCH /api/users/me đều trả {user: ...} — phải
  // bóc .user ra, nếu không user.name/user.role/user.id đều undefined.
  me: async () => (await req<{ user: User }>('/api/auth/me')).user,
  updateMe: async (patch: { name?: string; targetScore?: number; hideOnLeaderboard?: boolean; avatarUrl?: string | null }) =>
    (await req<{ user: User }>('/api/users/me', { method: 'PATCH', body: JSON.stringify(patch) })).user,

  parts: (exam?: string) => req<PartInfo[]>(exam ? `/api/parts?exam=${encodeURIComponent(exam)}` : '/api/parts'),
  questions: async (part?: number, limit = 50, offset = 0, search = '', testSetId?: string, exam?: string) => {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (part) q.set('part', String(part));
    if (search) q.set('search', search);
    if (testSetId) q.set('testSetId', testSetId);
    if (exam) q.set('exam', exam);
    const data = await req<{ total: number; items: Question[] }>(`/api/questions?${q}`);
    return data.items;
  },
  /** Lấy TOÀN BỘ câu của 1 Part (không giới hạn số lượng): backend giới hạn
   * tối đa 200 câu/cuộc gọi nên phân trang bằng offset tới khi đủ `total`. */
  questionsAll: async (part?: number, testSetId?: string, exam?: string) => {
    const PAGE = 200;
    const all: Question[] = [];
    let total = Infinity;
    let offset = 0;
    while (all.length < total) {
      const q = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (part) q.set('part', String(part));
      if (testSetId) q.set('testSetId', testSetId);
      if (exam) q.set('exam', exam);
      const data = await req<{ total: number; items: Question[] }>(`/api/questions?${q}`);
      total = data.total;
      if (!data.items.length) break;
      all.push(...data.items);
      offset += data.items.length;
    }
    return all;
  },
  question: (id: string) => req<Question>(`/api/questions/${encodeURIComponent(id)}`),
  passage: (id: string) => req<{ id: string; part: number; title?: string; content?: string; script?: string; audioUrl?: string | null }>(`/api/passages/${encodeURIComponent(id)}`),

  exams: () => req<ExamInfo[]>('/api/exams'),
  bandTable: () => req<IeltsBandTable>('/api/ielts/band-table'),

  practiceAnswer: (questionId: string, selected: string) =>
    req<{ correct: boolean; correctLabel: string; correctText?: string; explanation?: string; transcript?: string; xpAwarded?: number }>(
      '/api/practice/answer', { method: 'POST', body: JSON.stringify({ questionId, selected }) }),

  createTest: (mode: 'mini' | 'full', part?: number, durationMinutes = 120, testSetId?: string, exam?: string) =>
    req<{ attemptId: number; testSetId?: string | null; questionIds: string[]; durationSec: number; startedAt: string }>(
      '/api/tests', { method: 'POST', body: JSON.stringify({ mode, part, durationMinutes, ...(testSetId ? { testSetId } : {}), ...(exam ? { exam } : {}) }) }),
  saveTestAnswer: (attemptId: number, questionId: string, selected: string) =>
    req(`/api/tests/${attemptId}/answers`, { method: 'POST', body: JSON.stringify({ questionId, selected }) }),
  submitTest: (attemptId: number) =>
    req<{ listeningCorrect: number; readingCorrect: number; listeningScore?: number; readingScore?: number; totalScore?: number; byPart?: { part: number; correct: number; total: number }[]; wrongQuestionIds?: string[]; xpAwarded?: number; leaderboardEligible?: number; listeningBand?: number; readingBand?: number; overallBand?: number }>(
      `/api/tests/${attemptId}/submit`, { method: 'POST' }),
  // Hủy bài thi chưa nộp (nút Thoát ở MockTest): xóa attempt + đáp án đã lưu.
  abandonTest: (attemptId: number) =>
    req<{ ok: boolean }>(`/api/tests/${attemptId}`, { method: 'DELETE' }),
  testResult: (attemptId: number) => req<Attempt & { byPart?: { part: number; correct: number; total: number }[]; wrongQuestionIds?: string[]; detail?: TestResultDetail[] }>(`/api/tests/${attemptId}/result`),
  testHistory: (exam?: string) => req<Attempt[]>(exam ? `/api/tests/history?exam=${encodeURIComponent(exam)}` : '/api/tests/history'),

  wrongQuestions: (part?: number, exam?: string) => {
    const q = new URLSearchParams();
    if (part) q.set('part', String(part));
    if (exam) q.set('exam', exam);
    const s = q.toString();
    return req<(Question & { wrongCount?: number })[]>(`/api/wrong-questions${s ? `?${s}` : ''}`);
  },
  reviewWrong: (questionId: string, selected: string) =>
    req<{ correct: boolean; correctLabel?: string; correctText?: string; explanation?: string; transcript?: string; xpAwarded?: number }>(
      `/api/wrong-questions/${encodeURIComponent(questionId)}/review`, { method: 'POST', body: JSON.stringify({ selected }) }),

  vocabulary: async (topic = '', limit = 100, exam?: string) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (topic) q.set('topic', topic);
    if (exam) q.set('exam', exam);
    const data = await req<{ total: number; items: Vocab[] }>(`/api/vocabulary?${q}`);
    return data.items;
  },
  markVocab: (id: string, status: 'learning' | 'learned' | 'wrong') =>
    req(`/api/vocabulary/${encodeURIComponent(id)}/mark`, { method: 'POST', body: JSON.stringify({ status }) }),

  // ---- Từ điển + từ vựng cá nhân ("Từ của tôi") ----
  dictionaryLookup: (word: string, context?: string) =>
    req<DictionaryEntry>('/api/dictionary/lookup', { method: 'POST', body: JSON.stringify({ word, context }) }),
  userWords: async (status = '', limit = 500, offset = 0) => {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) q.set('status', status);
    return req<{ total: number; items: UserWord[] }>(`/api/user-words?${q}`);
  },
  createUserWord: (body: { word: string; phonetic?: string; pos?: string; meaning: string; example?: string; context?: string; topic?: string }) =>
    req<UserWord & { existed?: boolean }>('/api/user-words', { method: 'POST', body: JSON.stringify(body) }),
  updateUserWord: (id: number, body: Partial<{ phonetic: string | null; pos: string | null; meaning: string; example: string | null; context: string | null; topic: string | null }>) =>
    req<UserWord>(`/api/user-words/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUserWord: (id: number) =>
    req<{ ok: boolean }>(`/api/user-words/${id}`, { method: 'DELETE' }),
  markUserWord: (id: number, status: 'learning' | 'learned' | 'wrong') =>
    req<UserWord>(`/api/user-words/${id}/mark`, { method: 'POST', body: JSON.stringify({ status }) }),

  statsOverview: (exam?: string) => req<StatsOverview>(exam ? `/api/stats/overview?exam=${encodeURIComponent(exam)}` : '/api/stats/overview'),
  statsHistory: (exam?: string) => req<Attempt[]>(exam ? `/api/stats/history?exam=${encodeURIComponent(exam)}` : '/api/stats/history'),

  leaderboard: (metric: 'score' | 'xp' | 'band' = 'score', tab: 'week' | 'month' | 'all' = 'all', exam?: string) =>
    req<{ entries: LeaderboardEntry[]; me: (LeaderboardEntry & { rank: number }) | null }>(`/api/leaderboard?metric=${metric}&tab=${tab}${exam ? `&exam=${encodeURIComponent(exam)}` : ''}`),

  // Test sets (bộ đề thi)
  testSets: (exam?: string) => req<TestSet[]>(exam ? `/api/test-sets?exam=${encodeURIComponent(exam)}` : '/api/test-sets'),
  testSet: (id: string) => req<TestSet>(`/api/test-sets/${encodeURIComponent(id)}`),
  // Cấu hình upload cho tài khoản thường (đổi ảnh đại diện) — không cần quyền admin.
  mediaConfigPublic: () => req<MediaConfig>('/api/media/config'),
  // Audio cấp Part (Part 1–4): 1 file audio cho cả Part, dùng làm fallback
  // khi câu hỏi/đoạn văn chưa có audio riêng.
  partMedia: (id: string) => req<Record<number, string>>(`/api/test-sets/${encodeURIComponent(id)}/part-media`),

  // ---- IELTS Giai đoạn 1 (v3) ----
  ieltsProfile: () => req<IeltsProfile>('/api/ielts/profile'),
  saveIeltsProfile: (body: Partial<IeltsProfile>) =>
    req<IeltsProfile>('/api/ielts/profile', { method: 'POST', body: JSON.stringify(body) }),

  // "Hôm nay" dùng chung cho cả 2 kỳ thi (alias IELTS mặc định exam=ielts).
  today: (exam?: string) => req<TodayData>(exam ? `/api/today?exam=${encodeURIComponent(exam)}` : '/api/today'),
  ieltsToday: () => req<TodayData>('/api/ielts/today'),
  completeTodayBlock: (blockId: string, minutes: number, exam?: string) =>
    req<{ ok: boolean }>(exam ? `/api/today/complete?exam=${encodeURIComponent(exam)}` : '/api/today/complete', { method: 'POST', body: JSON.stringify({ blockId, minutes }) }),
  todayBadDay: (exam?: string) =>
    req<BadDayTask>(exam ? `/api/today/bad-day?exam=${encodeURIComponent(exam)}` : '/api/today/bad-day', { method: 'POST' }),

  // Điểm danh hằng ngày (lịch + quà theo mốc).
  checkin: (month?: string, before?: string, limit?: number) => {
    const q: string[] = [];
    if (month) q.push(`month=${encodeURIComponent(month)}`);
    if (before) q.push(`before=${encodeURIComponent(before)}`);
    if (limit) q.push(`limit=${limit}`);
    return req<CheckinData>(q.length ? `/api/checkin?${q.join('&')}` : '/api/checkin');
  },
  doCheckin: (date?: string) =>
    req<CheckinResult>('/api/checkin', { method: 'POST', body: JSON.stringify(date ? { date } : {}) }),

  completeDiagnostic: (attemptId: number) =>
    req<DiagnosticMap>('/api/ielts/diagnostic/complete', { method: 'POST', body: JSON.stringify({ attemptId }) }),
  latestDiagnostic: () => req<DiagnosticMap | null>('/api/ielts/diagnostic/latest'),

  writingTasks: () => req<WritingTask[]>('/api/ielts/writing/tasks'),
  writingSubmissions: () => req<WritingSubmission[]>('/api/ielts/writing/submissions'),
  submitWriting: (body: { taskId: string; content: string; durationSec?: number; selfScores?: Record<string, number>; isBaseline?: boolean }) =>
    req<WritingSubmission>('/api/ielts/writing/submissions', { method: 'POST', body: JSON.stringify(body) }),

  speakingPrompts: () => req<SpeakingPrompt[]>('/api/ielts/speaking/prompts'),
  speakingRecordings: () => req<SpeakingRecording[]>('/api/ielts/speaking/recordings'),
  saveSpeakingRecording: (body: { promptId: string; part: number; audioBase64: string; mimeType?: string; durationSec?: number; isBaseline?: boolean }) =>
    req<SpeakingRecording>('/api/ielts/speaking/recordings', { method: 'POST', body: JSON.stringify(body) }),

  logError: (body: { questionId?: string; attemptId?: number; skill: string; questionType?: string; errorCode: string; evidence?: string; missedKeyword?: string; timeSpentSec?: number; guessed?: boolean }) =>
    req<ErrorLogEntry>('/api/ielts/error-log', { method: 'POST', body: JSON.stringify(body) }),
  errorLog: () => req<ErrorLogEntry[]>('/api/ielts/error-log'),
  errorLogDue: () => req<ErrorLogEntry[]>('/api/ielts/error-log/due'),
  reviewError: (id: number, correct: boolean) =>
    req<{ ok: boolean; xpAwarded?: number }>(`/api/ielts/error-log/${id}/review`, { method: 'POST', body: JSON.stringify({ correct }) }),
  errorLogWeekly: () => req<WeeklyError[]>('/api/ielts/error-log/weekly'),
  monsters: () => req<Monster[]>('/api/ielts/monsters'),
  errorCodes: () => req<ErrorCode[]>('/api/ielts/error-codes'),
};

export function targetScoreOf(u: User | null): number {
  if (!u) return 650;
  return u.targetScore ?? u.target_score ?? 650;
}
export function hideOnLbOf(u: User | null): boolean {
  if (!u) return false;
  if (u.hideOnLeaderboard !== undefined) return u.hideOnLeaderboard;
  return u.hide_on_leaderboard === 1;
}
export function scoreLevel(total?: number | null): string {
  if (total == null) return '—';
  if (total < 450) return 'Cơ bản';
  if (total < 600) return 'Trung bình';
  if (total < 750) return 'Khá';
  if (total < 900) return 'Tốt';
  return 'Xuất sắc';
}
