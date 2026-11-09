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
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  user_exists: 'Email này đã được đăng ký.',
  unauthorized: 'Bạn cần đăng nhập lại.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  not_found: 'Không tìm thấy dữ liệu.',
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
}
export interface PartInfo { part: number; count: number; section?: string; listening?: boolean; reading?: boolean; }
export interface Vocab { id: string; word: string; phonetic?: string; meaning: string; example?: string; topic?: string; }
export interface StatsOverview {
  totalAnswered: number; totalCorrect: number; accuracy: number;
  byPart: { part: number; answered: number; correct: number; accuracy: number }[];
  weakestPart?: number | null; streakDays: number; targetScore: number;
  totalXp: number; recentScores: { date: string; totalScore: number }[];
}
export interface LeaderboardEntry { rank: number; name: string; avatarUrl?: string; score: number; xp: number; answered?: number; }
export interface Attempt { id: number; mode: string; part?: number; started_at?: string; finished_at?: string; total_score?: number; listening_score?: number; reading_score?: number; listening_correct?: number; reading_correct?: number; duration_sec?: number; }

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

  parts: () => req<PartInfo[]>('/api/parts'),
  questions: (part?: number, limit = 50, offset = 0, search = '') => {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (part) q.set('part', String(part));
    if (search) q.set('search', search);
    return req<Question[]>(`/api/questions?${q}`);
  },
  question: (id: string) => req<Question>(`/api/questions/${encodeURIComponent(id)}`),
  passage: (id: string) => req<{ id: string; part: number; title?: string; content?: string; script?: string }>(`/api/passages/${encodeURIComponent(id)}`),

  practiceAnswer: (questionId: string, selected: string) =>
    req<{ correct: boolean; correctLabel: string; explanation?: string; transcript?: string; xpAwarded?: number }>(
      '/api/practice/answer', { method: 'POST', body: JSON.stringify({ questionId, selected }) }),

  createTest: (mode: 'mini' | 'full', part?: number, durationMinutes = 120) =>
    req<{ attemptId: number; questionIds: string[]; durationSec: number; startedAt: string }>(
      '/api/tests', { method: 'POST', body: JSON.stringify({ mode, part, durationMinutes }) }),
  saveTestAnswer: (attemptId: number, questionId: string, selected: string) =>
    req(`/api/tests/${attemptId}/answers`, { method: 'POST', body: JSON.stringify({ questionId, selected }) }),
  submitTest: (attemptId: number) =>
    req<{ listeningCorrect: number; readingCorrect: number; listeningScore?: number; readingScore?: number; totalScore?: number; byPart?: { part: number; correct: number; total: number }[]; wrongQuestionIds?: string[]; xpAwarded?: number; leaderboardEligible?: number }>(
      `/api/tests/${attemptId}/submit`, { method: 'POST' }),
  testResult: (attemptId: number) => req<Attempt & { byPart?: { part: number; correct: number; total: number }[]; wrongQuestionIds?: string[] }>(`/api/tests/${attemptId}/result`),
  testHistory: () => req<Attempt[]>('/api/tests/history'),

  wrongQuestions: (part?: number) => {
    const q = part ? `?part=${part}` : '';
    return req<(Question & { wrongCount?: number })[]>(`/api/wrong-questions${q}`);
  },
  reviewWrong: (questionId: string, selected: string) =>
    req<{ correct: boolean; correctLabel?: string; explanation?: string; transcript?: string; xpAwarded?: number }>(
      `/api/wrong-questions/${encodeURIComponent(questionId)}/review`, { method: 'POST', body: JSON.stringify({ selected }) }),

  vocabulary: (topic = '', limit = 100) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (topic) q.set('topic', topic);
    return req<Vocab[]>(`/api/vocabulary?${q}`);
  },
  markVocab: (id: string, status: 'learning' | 'learned' | 'wrong') =>
    req(`/api/vocabulary/${encodeURIComponent(id)}/mark`, { method: 'POST', body: JSON.stringify({ status }) }),

  statsOverview: () => req<StatsOverview>('/api/stats/overview'),
  statsHistory: () => req<Attempt[]>('/api/stats/history'),

  leaderboard: (metric: 'score' | 'xp' = 'score', tab: 'week' | 'month' | 'all' = 'all') =>
    req<{ entries: LeaderboardEntry[]; me: (LeaderboardEntry & { rank: number }) | null }>(`/api/leaderboard?metric=${metric}&tab=${tab}`),

  // Admin
  adminQuestions: (part?: number, limit = 50, offset = 0) => {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (part) q.set('part', String(part));
    return req<Question[]>(`/api/admin/questions?${q}`);
  },
  adminCreateQuestion: (body: Record<string, unknown>) =>
    req<Question>('/api/admin/questions', { method: 'POST', body: JSON.stringify(body) }),
  adminUpdateQuestion: (id: string, body: Record<string, unknown>) =>
    req<Question>(`/api/admin/questions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  adminDeleteQuestion: (id: string) =>
    req(`/api/admin/questions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminImportQuestions: (questions: unknown[]) =>
    req<{ imported: number; errors: { index: number; reason: string }[] }>('/api/admin/questions/import', { method: 'POST', body: JSON.stringify({ questions }) }),
  adminVocabulary: () => req<Vocab[]>('/api/admin/vocabulary'),
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
