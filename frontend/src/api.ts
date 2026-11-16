// API client — code against CONTRACT.md shapes. Backend may not be running;
// every call throws ApiError with a Vietnamese-friendly message on failure.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getToken(): string | null {
  return localStorage.getItem('toeic_token');
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem('toeic_token', t);
  else localStorage.removeItem('toeic_token');
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
  const token = getToken();
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
    throw new ApiError(0, 'Không kết nối được tới máy chủ. Hãy kiểm tra backend có đang chạy không (mặc định http://localhost:4000).');
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty body */ }
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
}
export interface Option { label: string; content: string; is_correct?: number; }
export interface Question {
  id: string; part: number; passageId?: string | null; passageTitle?: string;
  passageText?: string; script?: string; content: string;
  options: Option[]; topic?: string; difficulty?: string;
  explanation?: string; correct?: string; correctLabel?: string;
  imageUrl?: string | null; audioUrl?: string | null;
  /** IELTS (giai đoạn 2): kỳ thi, dạng câu hỏi, giới hạn số từ (câu điền từ). */
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
  questionId: string; questionType?: string; wordLimit?: number;
  correctText?: string | null; correctLabel?: string | null;
  selected?: string; correct?: boolean; content?: string;
}
export interface PartInfo { part: number; count: number; section?: string; listening?: boolean; reading?: boolean; }
export interface Vocab { id: string; word: string; phonetic?: string; meaning: string; example?: string; topic?: string; }
export interface StatsOverview {
  totalAnswered: number; totalCorrect: number; accuracy: number;
  byPart: { part: number; answered: number; correct: number; accuracy: number }[];
  weakestPart?: number | null; streakDays: number; targetScore: number;
  totalXp: number; recentScores: { date: string; totalScore: number }[];
  /** IELTS (giai đoạn 2): tỉ lệ đúng từng dạng câu + band theo thời gian. */
  byType?: { questionType: string; answered: number; correct: number; accuracy: number }[];
  weakestType?: string | null;
  bandHistory?: { date: string; listeningBand: number; readingBand: number; overallBand: number }[];
}
export interface LeaderboardEntry { rank: number; name: string; avatarUrl?: string; score: number; xp: number; answered?: number; }
export interface Attempt {
  id: number; mode: string; part?: number; started_at?: string; finished_at?: string;
  total_score?: number; listening_score?: number; reading_score?: number;
  listening_correct?: number; reading_correct?: number; duration_sec?: number;
  /** IELTS (giai đoạn 2): kỳ thi + band (chỉ bài full IELTS mới có). */
  exam?: string; listeningBand?: number; readingBand?: number; overallBand?: number;
}
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
export interface GeneratedAudio {
  audioUrl: string; level: string;
}

// Ảnh + audio cho phần Nghe: cấu hình Cloudinary, lưu media thủ công,
// sinh audio bằng AI (Gemini TTS). Lỗi 501 (gemini/cloudinary chưa cấu
// hình) được req() dịch sang tiếng Việt qua VI_ERRORS.
export interface AiParseInvalid { index: number; reason: string; }
export interface AiParseStructure {
  mode: 'split' | 'fallback' | 'vision';
  parts: { part: number; startLine: number; questionCount: number }[];
  answerKeyFound: boolean;
  answerKey: Record<string, string> | null;
  warnings: string[];
}
export interface AiParseResult {
  questions: ImportQuestion[];
  invalid: AiParseInvalid[];
  warnings: string[];
  structure?: AiParseStructure | null;
}

// Kết quả đọc bảng đáp án: key là số câu chuẩn TOEIC → đáp án A–D.
// source "rule" = đọc bằng quy tắc (không tốn Gemini), "ai" = đọc bằng AI.
export interface AnswerKeyResult {
  key: Record<string, string>;
  found: number;
  source: 'rule' | 'ai';
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
  me: () => req<User>('/api/auth/me'),
  updateMe: (patch: { name?: string; targetScore?: number; hideOnLeaderboard?: boolean }) =>
    req<User>('/api/users/me', { method: 'PATCH', body: JSON.stringify(patch) }),

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
   * tối đa 200 câu/cuộc gọi nên phân trang bằng offset tới khi đủ `total`
   * mà backend trả về. Dùng cho màn Luyện tập theo Part. */
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
    req<{ attemptId: number; questionIds: string[]; durationSec: number; startedAt: string }>(
      '/api/tests', { method: 'POST', body: JSON.stringify({ mode, part, durationMinutes, ...(testSetId ? { testSetId } : {}), ...(exam ? { exam } : {}) }) }),
  saveTestAnswer: (attemptId: number, questionId: string, selected: string) =>
    req(`/api/tests/${attemptId}/answers`, { method: 'POST', body: JSON.stringify({ questionId, selected }) }),
  submitTest: (attemptId: number) =>
    req<{ listeningCorrect: number; readingCorrect: number; listeningScore?: number; readingScore?: number; totalScore?: number; byPart?: { part: number; correct: number; total: number }[]; wrongQuestionIds?: string[]; xpAwarded?: number; leaderboardEligible?: number; listeningBand?: number; readingBand?: number; overallBand?: number }>(
      `/api/tests/${attemptId}/submit`, { method: 'POST' }),
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

  statsOverview: (exam?: string) => req<StatsOverview>(exam ? `/api/stats/overview?exam=${encodeURIComponent(exam)}` : '/api/stats/overview'),
  statsHistory: (exam?: string) => req<Attempt[]>(exam ? `/api/stats/history?exam=${encodeURIComponent(exam)}` : '/api/stats/history'),

  leaderboard: (metric: 'score' | 'xp' | 'band' = 'score', tab: 'week' | 'month' | 'all' = 'all', exam?: string) =>
    req<{ entries: LeaderboardEntry[]; me: (LeaderboardEntry & { rank: number }) | null }>(`/api/leaderboard?metric=${metric}&tab=${tab}${exam ? `&exam=${encodeURIComponent(exam)}` : ''}`),

  // Test sets (bộ đề thi)
  testSets: (exam?: string) => req<TestSet[]>(exam ? `/api/test-sets?exam=${encodeURIComponent(exam)}` : '/api/test-sets'),
  testSet: (id: string) => req<TestSet>(`/api/test-sets/${encodeURIComponent(id)}`),
  adminCreateTestSet: (body: { title: string; description?: string; isPublished?: boolean; exam?: string }) =>
    req<TestSet>('/api/admin/test-sets', { method: 'POST', body: JSON.stringify(body) }),
  adminUpdateTestSet: (id: string, body: { title?: string; description?: string; isPublished?: boolean; exam?: string }) =>
    req<TestSet>(`/api/admin/test-sets/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  adminDeleteTestSet: (id: string) =>
    req<{ ok: boolean }>(`/api/admin/test-sets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminImportTestSet: (id: string, questions: unknown[]) =>
    req<{ imported: number; errors: { index: number; id?: string; reason: string }[] }>(
      `/api/admin/test-sets/${encodeURIComponent(id)}/import`, { method: 'POST', body: JSON.stringify({ questions }) }),
  adminAddTestSetQuestion: (id: string, question: Record<string, unknown>) =>
    req<Question>(`/api/admin/test-sets/${encodeURIComponent(id)}/questions`, { method: 'POST', body: JSON.stringify(question) }),
  // Nhận diện đề bằng AI: upload 1 file (.txt/.docx/.pdf/.png/.jpg/.jpeg),
  // backend parse thành câu hỏi (KHÔNG tự lưu DB). Dùng fetch + FormData
  // trực tiếp vì helper req() đặt Content-Type application/json.
  aiParseTestSet: async (id: string, file: File): Promise<AiParseResult> => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/admin/test-sets/${encodeURIComponent(id)}/ai-parse`, {
        method: 'POST',
        body: form,
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      });
    } catch {
      throw new ApiError(0, 'Không kết nối được tới máy chủ. Hãy kiểm tra backend có đang chạy không (mặc định http://localhost:4000).');
    }
    let data: unknown = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = (data as { error?: string })?.error;
      if (err === 'gemini_not_configured') {
        throw new ApiError(501, 'Chưa cấu hình GEMINI_API_KEY trên máy chủ.', err);
      }
      if (res.status === 403 || err === 'forbidden') {
        throw new ApiError(403, 'Tính năng này chỉ dành cho tài khoản admin. Hãy đăng nhập bằng tài khoản demo@toeic.app.', err || 'forbidden');
      }
      const msg = (data as { message?: string })?.message
        || (err && VI_ERRORS[err]) || err || `Lỗi máy chủ (${res.status}).`;
      throw new ApiError(res.status, msg, err);
    }
    return data as AiParseResult;
  },

  // Nhận diện bảng đáp án: upload 1 file (.txt/.docx/.pdf/.png/.jpg/.jpeg),
  // backend đọc thành { số câu: đáp án } (KHÔNG tự lưu DB). Cùng pattern
  // FormData + dịch lỗi như aiParseTestSet.
  parseAnswerKey: async (id: string, file: File): Promise<AnswerKeyResult> => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/admin/test-sets/${encodeURIComponent(id)}/answer-key`, {
        method: 'POST',
        body: form,
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      });
    } catch {
      throw new ApiError(0, 'Không kết nối được tới máy chủ. Hãy kiểm tra backend có đang chạy không (mặc định http://localhost:4000).');
    }
    let data: unknown = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = (data as { error?: string })?.error;
      if (err === 'gemini_not_configured') {
        throw new ApiError(501, 'Chưa cấu hình GEMINI_API_KEY trên máy chủ.', err);
      }
      if (res.status === 403 || err === 'forbidden') {
        throw new ApiError(403, 'Tính năng này chỉ dành cho tài khoản admin. Hãy đăng nhập bằng tài khoản demo@toeic.app.', err || 'forbidden');
      }
      const msg = (data as { message?: string })?.message
        || (err && VI_ERRORS[err]) || err || `Lỗi máy chủ (${res.status}).`;
      throw new ApiError(res.status, msg, err);
    }
    return data as AnswerKeyResult;
  },

  // Media cho phần Nghe (ảnh + audio)
  mediaConfig: () => req<MediaConfig>('/api/admin/media/config'),
  saveQuestionMedia: (id: string, body: { imageUrl?: string; audioUrl?: string }) =>
    req<Question>(`/api/admin/questions/${encodeURIComponent(id)}/media`, { method: 'POST', body: JSON.stringify(body) }),
  savePassageMedia: (id: string, body: { audioUrl: string }) =>
    req<{ id: string; part: number; title?: string; content?: string; script?: string; audioUrl?: string | null }>(
      `/api/admin/passages/${encodeURIComponent(id)}/media`, { method: 'POST', body: JSON.stringify(body) }),
  generateQuestionAudio: (id: string) =>
    req<GeneratedAudio>(`/api/admin/questions/${encodeURIComponent(id)}/generate-audio`, { method: 'POST' }),
  generatePassageAudio: (id: string) =>
    req<GeneratedAudio>(`/api/admin/passages/${encodeURIComponent(id)}/generate-audio`, { method: 'POST' }),

  // Audio cấp Part (Part 1–4): 1 file audio cho cả Part, dùng làm fallback
  // khi câu hỏi/đoạn văn chưa có audio riêng (xem PracticeSession/MockTest).
  partMedia: (id: string) => req<Record<number, string>>(`/api/test-sets/${encodeURIComponent(id)}/part-media`),
  savePartMedia: (id: string, part: number, audioUrl: string) =>
    req<{ part: number; audioUrl: string }>(`/api/admin/test-sets/${encodeURIComponent(id)}/parts/${part}/media`, { method: 'POST', body: JSON.stringify({ audioUrl }) }),
  // Thêm nhiều câu thủ công theo loạt (tối đa 200 câu/lần). Backend tự sinh
  // id cho câu chưa có id; câu lỗi được trả về trong errors, câu hợp lệ
  // vẫn được thêm.
  adminBulkAddTestSetQuestions: (id: string, questions: unknown[]) =>
    req<{ imported: number; errors: { index: number; reason: string }[] }>(
      `/api/admin/test-sets/${encodeURIComponent(id)}/questions/bulk`, { method: 'POST', body: JSON.stringify({ questions }) }),

  // Admin
  adminQuestions: async (part?: number, limit = 50, offset = 0, exam?: string) => {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (part) q.set('part', String(part));
    if (exam) q.set('exam', exam);
    const data = await req<{ total: number; items: Question[] }>(`/api/admin/questions?${q}`);
    return data.items;
  },
  adminCreateQuestion: (body: Record<string, unknown>) =>
    req<Question>('/api/admin/questions', { method: 'POST', body: JSON.stringify(body) }),
  adminUpdateQuestion: (id: string, body: Record<string, unknown>) =>
    req<Question>(`/api/admin/questions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  adminDeleteQuestion: (id: string) =>
    req(`/api/admin/questions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminImportQuestions: (questions: unknown[]) =>
    req<{ imported: number; errors: { index: number; reason: string }[] }>('/api/admin/questions/import', { method: 'POST', body: JSON.stringify({ questions }) }),
  adminVocabulary: async () => {
    const data = await req<{ total: number; items: Vocab[] }>('/api/admin/vocabulary');
    return data.items;
  },
  adminCreateVocab: (body: Record<string, unknown>) =>
    req<Vocab>('/api/admin/vocabulary', { method: 'POST', body: JSON.stringify(body) }),
  adminUpdateVocab: (id: string, body: Record<string, unknown>) =>
    req<Vocab>(`/api/admin/vocabulary/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  adminDeleteVocab: (id: string) =>
    req(`/api/admin/vocabulary/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminImportVocab: (items: unknown[]) =>
    req<{ imported: number; errors: { index: number; reason: string }[] }>('/api/admin/vocabulary/import', { method: 'POST', body: JSON.stringify({ items }) }),
  adminBackup: async () => {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/admin/backup`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, 'Không tải được bản sao lưu.');
    return res.blob();
  },
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
