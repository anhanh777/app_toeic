// Exposure (phuong phap 4b): khi mo phong thi, quet noi dung de de
// tim cac tu trong "Tu cua toi" ma user se gap, roi bao server ghi
// nhan (server tu tang mastery nhe). Chay ngam hoan toan: moi loi
// deu duoc bat lang le, khong bao gio lam hong phong thi.
import { api } from './api';

const MAX_WORDS = 100;
const MIN_LEN = 3;

/** Quet `text` (passage + noi dung cau hoi cua 1 luot vao phong) va
 * ghi nhan cac tu da luu xuat hien duoi dang tu nguyen ven. */
export async function recordExposureForText(text: string): Promise<void> {
  try {
    if (!text || !text.trim()) return;
    const { items } = await api.userWords('', 500);
    if (!items.length) return;
    const lower = text.toLowerCase();
    const ids: number[] = [];
    for (const w of items) {
      const word = w.word.trim().toLowerCase();
      if (word.length < MIN_LEN) continue;
      // Cum tu co khoang trang: khop chuoi con co boundary 2 dau.
      const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${esc}\\b`).test(lower)) ids.push(w.id);
      if (ids.length >= MAX_WORDS) break;
    }
    if (ids.length) await api.recordExposure(ids);
  } catch {
    // Exposure la tinh nang nen — loi thi bo qua lang le.
  }
}
