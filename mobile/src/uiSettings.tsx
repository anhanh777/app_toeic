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

export type LoadingEffectId =
  | 'none'
  | 'spinner'
  | 'dual-ring'
  | 'bouncing-dots'
  | 'skeleton'
  | 'progress-bar'
  | 'ripple'
  | 'equalizer'
  | 'orbit'
  | 'pulse'
  | 'wave'
  | 'flip';
export type LoadingLocation = 'loginButton' | 'page' | 'table';
export type LoadingPosition = 'center' | 'top';
export type LoadingImage = 'none' | 'mascot' | 'custom';
export type UiStyleId = 'pastel' | 'lively';

/** 1 khối loading đầy đủ (8 trường): hiệu ứng từng chỗ + tốc độ + câu chờ + vị trí + ảnh động.
 * `extraEffects` (chỉ loading chung `ui.loading` mới dùng, global cho cả 2 kiểu):
 * các hiệu ứng thêm tay đã thêm vào lưới chọn — mặc định rỗng. */
export interface StyleLoading {
  loginButton: LoadingEffectId;
  page: LoadingEffectId;
  table: LoadingEffectId;
  speed: number;
  text: string;
  position: LoadingPosition;
  image: LoadingImage;
  imageUrl: string;
  extraEffects: LoadingEffectId[];
}

/** 1 kiểu giao diện: màu chủ đạo + loading riêng của kiểu đó. */
export interface StyleSettings {
  accent: string;
  loading: StyleLoading;
}

export interface UiSettings {
  ui: {
    /** Màu chủ đạo cũ (fallback cho client cũ chưa biết `styles`). */
    accent: string;
    fontScale: number;
    style: UiStyleId;
    /** Cài đặt riêng từng kiểu, key theo id kiểu. */
    styles: Record<UiStyleId, StyleSettings>;
    /** Loading cũ (fallback); app mới dùng `styles[<kiểu đang chọn>].loading`. */
    loading: StyleLoading;
  };
}

/**
 * Registry các kiểu giao diện — THÊM KIỂU MỚI = thêm 1 entry ở đây (+ 1
 * khối token ở theme/CSS + 1 entry ở backend registry). Trang Cài đặt
 * giao diện render box theo registry này, không hardcode từng kiểu.
 */
export const STYLE_REGISTRY: { id: UiStyleId; name: string; desc: string }[] = [
  { id: 'pastel', name: 'Pastel nhẹ nhàng', desc: 'Giao diện hiện tại: nền kem ấm, thẻ trắng, màu sage dịu.' },
  { id: 'lively', name: 'Sống động', desc: 'Kiểu Duolingo: xanh lá tươi, nút nổi, gamified (streak, xu, nhiệm vụ).' },
];

const DEFAULT_STYLE_LOADING: StyleLoading = {
  loginButton: 'spinner',
  page: 'spinner',
  table: 'skeleton',
  speed: 1,
  text: 'Máy chủ đang khởi động, chờ một chút nhé…',
  position: 'center',
  image: 'none',
  imageUrl: '',
  extraEffects: [],
};

export const UI_SETTINGS_DEFAULTS: UiSettings = {
  ui: {
    accent: '#5FA8A0',
    fontScale: 1,
    style: 'pastel',
    styles: {
      pastel: { accent: '#5FA8A0', loading: { ...DEFAULT_STYLE_LOADING } },
      lively: { accent: '#58CC02', loading: { ...DEFAULT_STYLE_LOADING } },
    },
    loading: { ...DEFAULT_STYLE_LOADING },
  },
};

/** Cài đặt của kiểu đang chọn (màu + loading riêng); thiếu thì rơi về legacy. */
export function activeStyle(settings: UiSettings): StyleSettings {
  const s = settings.ui.styles?.[settings.ui.style];
  if (s) return s;
  return { accent: settings.ui.accent, loading: settings.ui.loading };
}

export const LOADING_EFFECTS: Record<LoadingEffectId, { label: string; locations: LoadingLocation[] }> = {
  none: { label: 'Trống', locations: ['loginButton', 'page', 'table'] },
  spinner: { label: 'Vòng xoay', locations: ['loginButton', 'page', 'table'] },
  'dual-ring': { label: 'Vòng kép', locations: ['loginButton', 'page', 'table'] },
  'bouncing-dots': { label: 'Ba chấm nảy', locations: ['loginButton', 'page', 'table'] },
  skeleton: { label: 'Skeleton (khung mờ)', locations: ['loginButton', 'page', 'table'] },
  'progress-bar': { label: 'Thanh tiến trình', locations: ['loginButton', 'page', 'table'] },
  ripple: { label: 'Vòng lan tỏa', locations: ['loginButton', 'page', 'table'] },
  equalizer: { label: 'Thanh nhảy', locations: ['loginButton', 'page', 'table'] },
  orbit: { label: 'Chấm xoay quanh', locations: ['loginButton', 'page', 'table'] },
  pulse: { label: 'Chấm đập', locations: ['loginButton', 'page', 'table'] },
  wave: { label: 'Sóng chấm', locations: ['loginButton', 'page', 'table'] },
  flip: { label: 'Ô vuông lật', locations: ['loginButton', 'page', 'table'] },
};

/** 6 hiệu ứng thêm được — không có sẵn trong lưới, admin thêm tay qua nút "＋ Thêm hiệu ứng". */
export const EXTRA_EFFECT_IDS: LoadingEffectId[] = ['ripple', 'equalizer', 'orbit', 'pulse', 'wave', 'flip'];

/** 6 hiệu ứng mặc định, luôn có trong lưới chọn. */
export const DEFAULT_EFFECT_IDS: LoadingEffectId[] = [
  'none',
  'spinner',
  'dual-ring',
  'bouncing-dots',
  'skeleton',
  'progress-bar',
];

export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: 'Xanh sage (mặc định)', value: '#5FA8A0' },
  { name: 'Xanh dương', value: '#4A90D9' },
  { name: 'Tím', value: '#7C6BD9' },
  { name: 'Hồng', value: '#D96B8C' },
  { name: 'Xanh ngọc', value: '#2E9E8F' },
  { name: 'Cam đất', value: '#C98A2E' },
  { name: 'Xanh lá', value: '#5B9E4D' },
  { name: 'Xanh lá tươi (Duolingo)', value: '#58CC02' },
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

/** Lọc danh sách hiệu ứng thêm tay về hợp lệ: chỉ id thêm được, không trùng, tối đa 6. */
function normalizeExtraEffects(v: unknown): LoadingEffectId[] {
  if (!Array.isArray(v)) return [];
  const out: LoadingEffectId[] = [];
  for (const id of v) {
    if (
      typeof id === 'string' &&
      (EXTRA_EFFECT_IDS as string[]).includes(id) &&
      !out.includes(id as LoadingEffectId)
    ) {
      out.push(id as LoadingEffectId);
    }
  }
  return out.slice(0, EXTRA_EFFECT_IDS.length);
}

function normalizeLoading(input: unknown, defaults: StyleLoading): StyleLoading {
  const ld = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const text =
    typeof ld.text === 'string' && ld.text.trim() && ld.text.length <= 120 ? ld.text : defaults.text;
  return {
    loginButton: validEffect(ld.loginButton, 'loginButton') ? ld.loginButton : defaults.loginButton,
    page: validEffect(ld.page, 'page') ? ld.page : defaults.page,
    table: validEffect(ld.table, 'table') ? ld.table : defaults.table,
    speed: isNumberIn(ld.speed, 0.5, 2) ? ld.speed : defaults.speed,
    text,
    position: ld.position === 'center' || ld.position === 'top' ? ld.position : defaults.position,
    image: ld.image === 'none' || ld.image === 'mascot' || ld.image === 'custom' ? ld.image : defaults.image,
    imageUrl:
      typeof ld.imageUrl === 'string' &&
      ld.imageUrl.length <= 500 &&
      (ld.imageUrl === '' || /^https?:\/\/\S+$/.test(ld.imageUrl))
        ? ld.imageUrl
        : defaults.imageUrl,
    extraEffects: normalizeExtraEffects(ld.extraEffects),
  };
}

/** Gộp tài liệu (có thể thiếu/sai) về đầy đủ + hợp lệ, sai chỗ nào về mặc định chỗ đó. */
export function normalizeSettings(input: unknown): UiSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const ui = (src.ui && typeof src.ui === 'object' ? src.ui : {}) as Record<string, unknown>;
  const d = UI_SETTINGS_DEFAULTS.ui;
  const stylesIn = (ui.styles && typeof ui.styles === 'object' ? ui.styles : {}) as Record<string, unknown>;
  const styles = {} as Record<UiStyleId, StyleSettings>;
  for (const s of STYLE_REGISTRY) {
    const st = (
      stylesIn[s.id] && typeof stylesIn[s.id] === 'object' ? stylesIn[s.id] : {}
    ) as Record<string, unknown>;
    const fallback = d.styles[s.id];
    styles[s.id] = {
      accent: isHexColor(st.accent) ? st.accent : fallback.accent,
      loading: normalizeLoading(st.loading, fallback.loading),
    };
  }
  return {
    ui: {
      accent: isHexColor(ui.accent) ? ui.accent : d.accent,
      fontScale: isNumberIn(ui.fontScale, 0.9, 1.15) ? ui.fontScale : d.fontScale,
      style: ui.style === 'pastel' || ui.style === 'lively' ? ui.style : d.style,
      styles,
      loading: normalizeLoading(ui.loading, d.loading),
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

/**
 * Họ màu accent của kiểu Sống động, dẫn xuất từ màu riêng đã lưu của kiểu
 * đó (mặc định #58CC02) — cùng công thức với web. Tỉ lệ trộn được chọn để
 * ở màu mặc định cho ra đúng bộ token Duolingo cũ (accent-dark #46A302).
 */
export function deriveLivelyAccent(hex: string, theme: 'light' | 'dark') {
  if (theme === 'dark') {
    return {
      accent: hex,
      accentDark: mix(hex, 'white', 0.35),
      accentSoft: mix(hex, 'black', 0.72),
      accentSoftStrong: mix(hex, 'black', 0.62),
    };
  }
  return {
    accent: hex,
    accentDark: mix(hex, 'black', 0.2),
    accentSoft: mix(hex, 'white', 0.78),
    accentSoftStrong: mix(hex, 'white', 0.7),
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
