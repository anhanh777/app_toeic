import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { API_URL } from './api';

/**
 * menuIcons.tsx — biểu tượng emoji của 19 mục (12 mục menu trang chủ +
 * Trang chủ, Thống kê, nút Đổi bài thi, thẻ TOEIC/IELTS — bổ sung
 * 2026-11-19 — + cờ đánh dấu / đã đánh dấu câu IELTS), sửa được từ web
 * quản trị (bản sao tương tự có ở app admin — giữ 2 bản đồng bộ khi sửa).
 * Mirror brand.tsx: fetch 1 lần lúc mở app, lỗi thì dùng mặc định, thử
 * lại 1 lần sau 6s.
 *
 * - Tài liệu phẳng: { today, practice, mock, wrong, vocabulary,
 *   leaderboard, settings, diagnostic, errors, writing, speaking,
 *   ielts-setup, home, stats, switch-exam, exam-toeic, exam-ielts,
 *   flag, flagged } — mỗi key là 1 emoji.
 *   Backend trả về ở GET /api/menu-icons (công khai); admin sửa qua
 *   PUT /api/admin/menu-icons.
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

async function fetchMenuIcons(): Promise<MenuIconsDoc> {
  const res = await fetch(`${API_URL}/api/menu-icons`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeMenuIcons(await res.json());
}

interface MenuIconsCtx {
  icons: MenuIconsDoc;
  loading: boolean;
  /** Áp ngay 1 tài liệu icon (dùng sau khi lưu ở trang quản trị). */
  applyIcons: (doc: MenuIconsDoc) => void;
  /** Tải lại từ backend (dùng khi cần đồng bộ lại). */
  refresh: () => void;
}

const MenuIconsContext = createContext<MenuIconsCtx | null>(null);

/** Tải icon menu 1 lần lúc mở app (không chặn render). */
export function MenuIconsProvider({ children }: { children: ReactNode }) {
  const [icons, setIcons] = useState<MenuIconsDoc>(MENU_ICON_DEFAULTS);
  const [loading, setLoading] = useState(true);

  const applyIconsDoc = (doc: MenuIconsDoc) => {
    setIcons(normalizeMenuIcons(doc));
  };

  const refresh = () => {
    setLoading(true);
    fetchMenuIcons()
      .then(applyIconsDoc)
      .catch(() => {
        // Backend ngủ/chưa đẩy (Render free tier): giữ mặc định, thử lại 1 lần.
        window.setTimeout(() => {
          fetchMenuIcons().then(applyIconsDoc).catch(() => undefined);
        }, 6000);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MenuIconsContext.Provider value={{ icons, loading, applyIcons: applyIconsDoc, refresh }}>
      {children}
    </MenuIconsContext.Provider>
  );
}

export function useMenuIcons(): MenuIconsCtx {
  const ctx = useContext(MenuIconsContext);
  if (!ctx) throw new Error('useMenuIcons phải dùng trong MenuIconsProvider');
  return ctx;
}
