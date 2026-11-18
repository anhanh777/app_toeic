// Icon menu trang chính — chỉnh được từ admin web. Tài liệu icon lấy từ
// GET /api/menu-icons (công khai, không cần auth); giá trị thiếu/sai ->
// mặc định trong code (normalizeMenuIcons), fetch lỗi -> giữ mặc định,
// thử lại 1 lần sau 6s. Port ý tưởng từ mobile/src/brand.tsx.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_URL } from './api';

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
  | 'ielts-setup';

export type MenuIcons = Record<MenuIconKey, string>;

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
];

export const MENU_ICON_DEFAULTS: MenuIcons = {
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
};

/** Độ dài theo ký tự hiển thị (emoji tính là 1, không phải 2 đơn vị UTF-16). */
function charLength(s: string): number {
  return Array.from(s).length;
}

/** Gộp tài liệu (có thể thiếu/sai) về đầy đủ + hợp lệ, sai chỗ nào về mặc định chỗ đó. */
export function normalizeMenuIcons(input: unknown): MenuIcons {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = MENU_ICON_DEFAULTS;
  const out = { ...d };
  for (const key of MENU_ICON_KEYS) {
    const v = src[key];
    if (
      typeof v === 'string' &&
      charLength(v.trim()) >= 1 &&
      charLength(v.trim()) <= 10
    ) {
      out[key] = v.trim();
    }
  }
  return out;
}

async function fetchMenuIcons(): Promise<MenuIcons> {
  const res = await fetch(`${API_URL}/api/menu-icons`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeMenuIcons(await res.json());
}

interface MenuIconsCtx {
  icons: MenuIcons;
  loading: boolean;
  /** Tải lại từ backend (dùng khi cần đồng bộ lại). */
  refresh: () => void;
}
const MenuIconsContext = createContext<MenuIconsCtx | null>(null);

/** Tải icon menu 1 lần lúc mở app (không chặn render), lỗi thì giữ mặc định. */
export function MenuIconsProvider({ children }: { children: ReactNode }) {
  const [icons, setIcons] = useState<MenuIcons>(MENU_ICON_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tải icon; setState chỉ nằm trong callback của promise (không gọi
  // setState đồng bộ trong effect — theo mẫu BrandProvider).
  const load = useCallback(() => {
    fetchMenuIcons()
      .then((m) => setIcons(m))
      .catch(() => {
        // Backend ngủ/chưa deploy (Render free tier): giữ mặc định, thử lại 1 lần.
        timerRef.current = setTimeout(() => {
          fetchMenuIcons()
            .then((m) => setIcons(m))
            .catch(() => undefined);
        }, 6000);
      })
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    load();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  const value = useMemo<MenuIconsCtx>(() => ({ icons, loading, refresh }), [icons, loading, refresh]);
  return <MenuIconsContext.Provider value={value}>{children}</MenuIconsContext.Provider>;
}

export function useMenuIcons(): MenuIconsCtx {
  const c = useContext(MenuIconsContext);
  if (!c) throw new Error('useMenuIcons phải dùng trong MenuIconsProvider');
  return c;
}
