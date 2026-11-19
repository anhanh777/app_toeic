/**
 * menuIcons.ts — biểu tượng emoji của 19 mục (12 mục menu trang chủ +
 * Trang chủ, Thống kê, nút Đổi bài thi, thẻ TOEIC/IELTS — bổ sung
 * 2026-11-19 — + cờ đánh dấu / đã đánh dấu câu IELTS), sửa được từ web
 * quản trị (bản sao tương tự sẽ có ở app học viên — giữ 2 bản đồng bộ
 * khi sửa).
 *
 * - Tài liệu phẳng: { today, practice, mock, wrong, vocabulary,
 *   leaderboard, settings, diagnostic, errors, writing, speaking,
 *   ielts-setup, home, stats, switch-exam, exam-toeic, exam-ielts,
 *   flag, flagged } — mỗi key là 1 emoji.
 *   Backend trả về ở GET /api/menu-icons (công khai); admin sửa qua
 *   PUT /api/admin/menu-icons (PUT từng phần giữ nguyên các icon khác,
 *   key lạ → 400, icon phải 1–10 code point).
 * - Giá trị thiếu/sai -> mặc định trong code (normalizeMenuIcons),
 *   không bao giờ crash app. Fetch lỗi -> dùng mặc định.
 */

export type MenuIconKey =
  | 'today'
  | 'practice'
  | 'mock'
  | 'wrong'
  | 'vocabulary'
  | 'leaderboard'
  | 'settings'
  | 'diagnostic'
  | 'errors'
  | 'writing'
  | 'speaking'
  | 'ielts-setup'
  | 'home'
  | 'stats'
  | 'switch-exam'
  | 'exam-toeic'
  | 'exam-ielts'
  | 'flag'
  | 'flagged';

export type MenuIconsDoc = Record<MenuIconKey, string>;

export const MENU_ICON_KEYS: MenuIconKey[] = [
  'today',
  'practice',
  'mock',
  'wrong',
  'vocabulary',
  'leaderboard',
  'settings',
  'diagnostic',
  'errors',
  'writing',
  'speaking',
  'ielts-setup',
  'home',
  'stats',
  'switch-exam',
  'exam-toeic',
  'exam-ielts',
  'flag',
  'flagged',
];

/** Nhãn hiển thị trong trang quản trị (khớp menu trang chủ app học viên). */
export const MENU_ICON_LABELS: Record<MenuIconKey, string> = {
  today: 'Hôm nay',
  practice: 'Luyện tập',
  mock: 'Thi thử',
  wrong: 'Ôn câu sai',
  vocabulary: 'Từ vựng',
  leaderboard: 'Xếp hạng',
  settings: 'Hồ sơ & Cài đặt',
  diagnostic: 'Chẩn đoán IELTS',
  errors: 'Sổ lỗi & Quái vật',
  writing: 'Viết (Writing)',
  speaking: 'Nói (Speaking)',
  'ielts-setup': 'Thiết lập IELTS',
  home: 'Trang chủ',
  stats: 'Thống kê',
  'switch-exam': 'Đổi bài thi',
  'exam-toeic': 'Thẻ TOEIC',
  'exam-ielts': 'Thẻ IELTS',
  flag: 'Cờ đánh dấu (chưa đánh dấu)',
  flagged: 'Cờ đánh dấu (đã đánh dấu)',
};

export const MENU_ICON_DEFAULTS: MenuIconsDoc = {
  today: '📅',
  practice: '✏️',
  mock: '⏱️',
  wrong: '❌',
  vocabulary: '📖',
  leaderboard: '🏆',
  settings: '⚙️',
  diagnostic: '🧭',
  errors: '🐉',
  writing: '✍️',
  speaking: '🎤',
  'ielts-setup': '📝',
  home: '🏠',
  stats: '📊',
  'switch-exam': '⇄',
  'exam-toeic': '🌸',
  'exam-ielts': '🎓',
  // Cờ đánh dấu câu (phòng thi IELTS): flag dùng 🏳️ KÈM VS16 để bắt buộc
  // hiện dạng emoji — 🏳 trơn hiện dạng text outline trên 1 số máy.
  flag: '🏳️',
  flagged: '🚩',
};

const MAX_EMOJI = 10;

/** Gộp tài liệu (có thể thiếu/sai) về đầy đủ + hợp lệ, sai chỗ nào về mặc định chỗ đó. */
export function normalizeMenuIcons(input: unknown): MenuIconsDoc {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const doc = { ...MENU_ICON_DEFAULTS };
  for (const key of MENU_ICON_KEYS) {
    const v = src[key];
    if (typeof v === 'string') {
      const len = Array.from(v).length;
      if (len >= 1 && len <= MAX_EMOJI) doc[key] = v;
    }
  }
  return doc;
}
