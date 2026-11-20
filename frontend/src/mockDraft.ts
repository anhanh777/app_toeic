// Nhap bai thi thu luu trong localStorage — chong mat bai khi mang chop
// chon / tai lai trang giua bai thi (MockTest). Chi luu trang thai bai
// lam, khong luu thong tin nhay cam. Key gom ky thi + id user de tranh
// lan tai khoan tren may dung chung.
//
// 2 key rieng biet:
// - draft: nho (attempt, dap an, dong ho, co) — ghi moi lan doi dap an.
// - paper: to (toan bo cau hoi) — chi ghi 1 lan khi vua tai de xong, de
//   khoi phuc duoc ca khi mang sut (khong tai lai duoc cau hoi).
import type { Question } from './api';

export interface MockDraft {
  v: 1;
  attemptId: number;
  userId: number;
  exam: 'ielts' | 'toeic';
  mode: 'mini' | 'full';
  part: number | null;
  testSetId: string | null;
  questionIds: string[];
  answers: Record<string, string>;
  secondsLeft: number;
  /** Moc het gio theo dong ho may — dong ho van chay khi tai lai trang,
      ke ca offline (online thi gio server moi la chuan). */
  deadlineAt: number;
  savedAt: number;
  flaggedById: Record<string, boolean>;
  playedSections: Record<number, boolean>;
}

export interface MockPaper {
  v: 1;
  attemptId: number;
  questions: Question[];
}

export const draftKey = (exam: string, userId: number) => `mock-draft-v1:${exam}:${userId}`;
export const paperKey = (exam: string, userId: number) => `mock-paper-v1:${exam}:${userId}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Het dung luong / che do rieng tu: bo qua, server van la luoi an toan.
  }
}

export function readDraft(exam: string, userId: number): MockDraft | null {
  const d = readJson<MockDraft>(draftKey(exam, userId));
  if (!d || d.v !== 1 || !d.attemptId || d.userId !== userId || !Array.isArray(d.questionIds)) return null;
  return d;
}

export function writeDraft(exam: string, userId: number, draft: MockDraft): void {
  writeJson(draftKey(exam, userId), draft);
}

export function clearDraft(exam: string, userId: number): void {
  try {
    localStorage.removeItem(draftKey(exam, userId));
  } catch { /* bo qua */ }
}

export function readPaper(exam: string, userId: number): MockPaper | null {
  const p = readJson<MockPaper>(paperKey(exam, userId));
  if (!p || p.v !== 1 || !p.attemptId || !Array.isArray(p.questions)) return null;
  return p;
}

export function writePaper(exam: string, userId: number, paper: MockPaper): void {
  writeJson(paperKey(exam, userId), paper);
}

export function clearPaper(exam: string, userId: number): void {
  try {
    localStorage.removeItem(paperKey(exam, userId));
  } catch { /* bo qua */ }
}

/** Xoa ca nhap + de cua 1 user (nop bai / thoat / huy bai). */
export function clearMockTest(exam: string, userId: number): void {
  clearDraft(exam, userId);
  clearPaper(exam, userId);
}

/** Trang vua tai lai (F5 / browser reload) chu khong phai dieu huong moi —
    chi truong hop nay moi tu khoi phuc bai; dieu huong thuong thi hien
    the "Tiep tuc bai dang lam do" de user tu chon. */
export function isPageReload(): boolean {
  try {
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return entries[0]?.type === 'reload';
  } catch {
    return false;
  }
}
