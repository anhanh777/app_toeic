// Cài đặt giao diện động (scope C) — port từ frontend/src/uiSettings.tsx
// (web) sang React Native. Tài liệu cài đặt lấy từ GET /api/settings
// (công khai, không cần auth); giá trị thiếu/sai -> mặc định trong code
// (normalizeSettings), fetch lỗi -> giữ mặc định, thử lại 1 lần sau 6s.
//
// Khác web: web áp cài đặt bằng cách ghi CSS var lên :root
// (applyUiSettings) — React Native không có :root nên "áp" ở đây nghĩa là
// ThemeProvider/TextSizeProvider (theme.tsx) đọc context này và dẫn xuất
// họ màu accent + fontScale từ settings. deriveAccent port nguyên công
// thức mix() của web để màu dẫn xuất khớp web theo theme sáng/tối.
// LoadingEffect/LoadingLine của web là DOM nên không port sang mobile.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { API_URL } from './api';

export type LoadingEffectId = 'spinner' | 'dual-ring' | 'bouncing-dots' | 'skeleton' | 'progress-bar';
export type LoadingLocation = 'loginButton' | 'page' | 'table';

export interface UiSettings {
  ui: {
    accent: string;
    fontScale: number;
    loading: {
      loginButton: LoadingEffectId;
      page: LoadingEffectId;
      table: LoadingEffectId;
      speed: number;
      text: string;
    };
  };
}

export const UI_SETTINGS_DEFAULTS: UiSettings = {
  ui: {
    accent: '#5FA8A0',
    fontScale: 1,
    loading: {
      loginButton: 'spinner',
      page: 'spinner',
      table: 'skeleton',
      speed: 1,
      text: 'Máy chủ đang khởi động, chờ một chút nhé…',
    },
  },
};

export const LOADING_EFFECTS: Record<LoadingEffectId, { label: string; locations: LoadingLocation[] }> = {
  spinner: { label: 'Vòng xoay', locations: ['loginButton', 'page', 'table'] },
  'dual-ring': { label: 'Vòng kép', locations: ['loginButton', 'page'] },
  'bouncing-dots': { label: 'Ba chấm nảy', locations: ['loginButton', 'page', 'table'] },
  skeleton: { label: 'Skeleton (khung mờ)', locations: ['table'] },
  'progress-bar': { label: 'Thanh tiến trình', locations: ['page'] },
};

export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: 'Xanh sage (mặc định)', value: '#5FA8A0' },
  { name: 'Xanh dương', value: '#4A90D9' },
  { name: 'Tím', value: '#7C6BD9' },
  { name: 'Hồng', value: '#D96B8C' },
  { name: 'Xanh ngọc', value: '#2E9E8F' },
  { name: 'Cam đất', value: '#C98A2E' },
  { name: 'Xanh lá', value: '#5B9E4D' },
];

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function isNumberIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

function validEffect(v: unknown, location: LoadingLocation): v is LoadingEffectId {
  return (
    typeof v === 'string' &&
    (Object.keys(LOADING_EFFECTS) as LoadingEffectId[]).includes(v as LoadingEffectId) &&
    LOADING_EFFECTS[v as LoadingEffectId].locations.includes(location)
  );
}

/** Gộp tài liệu (có thể thiếu/sai) về đầy đủ + hợp lệ, sai chỗ nào về mặc định chỗ đó. */
export function normalizeSettings(input: unknown): UiSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const ui = (src.ui && typeof src.ui === 'object' ? src.ui : {}) as Record<string, unknown>;
  const loading = (ui.loading && typeof ui.loading === 'object' ? ui.loading : {}) as Record<string, unknown>;
  const d = UI_SETTINGS_DEFAULTS.ui;
  const text =
    typeof loading.text === 'string' && loading.text.trim() && loading.text.length <= 120
      ? loading.text
      : d.loading.text;
  return {
    ui: {
      accent: isHexColor(ui.accent) ? ui.accent : d.accent,
      fontScale: isNumberIn(ui.fontScale, 0.9, 1.15) ? ui.fontScale : d.fontScale,
      loading: {
        loginButton: validEffect(loading.loginButton, 'loginButton') ? loading.loginButton : d.loading.loginButton,
        page: validEffect(loading.page, 'page') ? loading.page : d.loading.page,
        table: validEffect(loading.table, 'table') ? loading.table : d.loading.table,
        speed: isNumberIn(loading.speed, 0.5, 2) ? loading.speed : d.loading.speed,
        text,
      },
    },
  };
}

/* ---- Màu chủ đạo: dẫn xuất các biến phụ thuộc theo theme (port y hệt web) ---- */

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Trộn màu hex với trắng (amount 0-1) hoặc đen. */
function mix(hex: string, target: 'white' | 'black', amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = target === 'white' ? 255 : 0;
  return toHex(r + (t - r) * amount, g + (t - g) * amount, b + (t - b) * amount);
}

/** Dẫn xuất họ màu accent theo theme — cùng công thức với web. */
export function deriveAccent(hex: string, theme: 'light' | 'dark') {
  if (theme === 'dark') {
    return {
      accent: mix(hex, 'white', 0.25),
      accentDark: mix(hex, 'white', 0.45),
      accentSoft: mix(hex, 'black', 0.72),
      accentSoftStrong: mix(hex, 'black', 0.62),
    };
  }
  return {
    accent: hex,
    accentDark: mix(hex, 'black', 0.18),
    accentSoft: mix(hex, 'white', 0.86),
    accentSoftStrong: mix(hex, 'white', 0.78),
  };
}

async function fetchSettings(): Promise<UiSettings> {
  const res = await fetch(`${API_URL}/api/settings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeSettings(await res.json());
}

interface UiSettingsCtx {
  settings: UiSettings;
  loading: boolean;
  /** Áp ngay 1 tài liệu cài đặt (dùng sau khi lưu ở trang Cài đặt). */
  applySettings: (doc: UiSettings) => void;
  /** Tải lại từ backend (dùng khi cần đồng bộ lại). */
  refresh: () => void;
}

const UiSettingsContext = createContext<UiSettingsCtx | null>(null);

/** Tải cài đặt giao diện 1 lần lúc mở app (không chặn render — children
 * render ngay với mặc định), lỗi thì giữ mặc định, thử lại 1 lần sau 6s. */
export function UiSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<UiSettings>(UI_SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySettings = useCallback((doc: UiSettings) => {
    setSettingsState(normalizeSettings(doc));
  }, []);

  // Tải settings; setState chỉ nằm trong callback của promise (không gọi
  // setState đồng bộ trong effect — theo mẫu BrandProvider).
  const load = useCallback(() => {
    fetchSettings()
      .then((doc) => setSettingsState(normalizeSettings(doc)))
      .catch(() => {
        // Backend ngủ/chưa deploy (Render free tier): giữ mặc định, thử lại 1 lần.
        timerRef.current = setTimeout(() => {
          fetchSettings()
            .then((doc) => setSettingsState(normalizeSettings(doc)))
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

  const value = useMemo<UiSettingsCtx>(
    () => ({ settings, loading, applySettings, refresh }),
    [settings, loading, applySettings, refresh],
  );
  return <UiSettingsContext.Provider value={value}>{children}</UiSettingsContext.Provider>;
}

export function useUiSettings(): UiSettingsCtx {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) throw new Error('useUiSettings phải dùng trong UiSettingsProvider');
  return ctx;
}

/** Đọc settings khi không chắc đã nằm trong UiSettingsProvider (vd.
 * ThemeProvider/TextSizeProvider dùng độc lập): trả null thay vì throw,
 * để caller dùng bảng tĩnh / mặc định. */
export function useUiSettingsOptional(): UiSettingsCtx | null {
  return useContext(UiSettingsContext);
}
