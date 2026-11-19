// Theme Pastel + cỡ chữ — port ý tưởng từ frontend/src/theme.ts
// (web) sang React Native. Màu giữ nguyên bản web "Pastel nhẹ nhàng":
// nền #FDF8F3, thẻ trắng bo 20, sage #5FA8A0; dark = warm charcoal.
// Bảng màu bám sát frontend/src/index.css (:root + [data-theme="dark"])
// để các worker khác dùng chung token camelCase với web.
// Accent + fontScale server (UiSettingsProvider, nếu có phía trên) ghi đè
// lên bảng tĩnh: họ màu accent dẫn xuất theo deriveAccent của web,
// fontScale nhân thêm lên hệ số mức chữ của người dùng.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { deriveAccent, useUiSettingsOptional } from './uiSettings';

export type Theme = 'light' | 'dark';

export interface Palette {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  onAccent: string;
  danger: string;
  success: string;
  /** Màu chữ phụ đậm hơn muted (web --ink-soft). */
  inkSoft: string;
  /** Viền nhạt (web --border-soft). */
  borderSoft: string;
  /** Accent đậm / nhạt (web --accent-dark/--accent-soft/--accent-soft-strong). */
  accentDark: string;
  accentSoft: string;
  accentSoftStrong: string;
  /** Xanh lá + nền/chữ/soft/viền (web --green*). */
  green: string;
  greenBg: string;
  greenInk: string;
  greenSoft: string;
  greenBorder: string;
  /** Đỏ + nền/chữ/soft/viền (web --red*). */
  red: string;
  redBg: string;
  redInk: string;
  redSoft: string;
  redBorder: string;
  /** Vàng hổ phách + nền (web --amber/--amber-bg). */
  amber: string;
  amberBg: string;
  /** Hạng vàng/bạc/đồng (web --gold/--gold-ink/--silver/--bronze). */
  gold: string;
  goldInk: string;
  silver: string;
  bronze: string;
  /** Màu kỳ thi (web --exam-blue/--exam-orange). */
  examBlue: string;
  examOrange: string;
  /** Nền track thanh tiến trình (web --track). */
  track: string;
  /** Cảnh báo (web --warn-bg/--warn-border). */
  warnBg: string;
  warnBorder: string;
  /** Pastel phụ (web --mint/--pink/--cream/--sky/--lavender). */
  mint: string;
  pink: string;
  cream: string;
  creamStrong: string;
  sky: string;
  lavender: string;
  lavenderBorder: string;
}

export const LIGHT: Palette = {
  background: '#FDF8F3',
  surface: '#FFFFFF',
  surfaceMuted: '#FBF6F0',
  text: '#3D3A36',
  muted: '#8A837B',
  border: '#EFE6DB',
  accent: '#5FA8A0',
  onAccent: '#FFFFFF',
  danger: '#C4574E',
  success: '#4E8A5A',
  inkSoft: '#5C564F',
  borderSoft: '#F5EEE5',
  accentDark: '#4A8A83',
  accentSoft: '#DCEFEA',
  accentSoftStrong: '#CDE8E2',
  green: '#5E9E6E',
  greenBg: '#E4F3E6',
  greenInk: '#3E6B4A',
  greenSoft: '#CFE6D4',
  greenBorder: '#CFE6D4',
  red: '#D96C6C',
  redBg: '#FBEAEA',
  redInk: '#A84A4A',
  redSoft: '#F0D3D3',
  redBorder: '#F0D3D3',
  amber: '#B98A1D',
  amberBg: '#FCF3D9',
  gold: '#E9B949',
  goldInk: '#8A6D1F',
  silver: '#B9C2D4',
  bronze: '#D89B6A',
  examBlue: '#0B5CAD',
  examOrange: '#F5821F',
  track: '#F1EAE1',
  warnBg: '#FFF7E6',
  warnBorder: '#D8A24A',
  mint: '#D9F2E6',
  pink: '#FBDCE2',
  cream: '#FCEFC7',
  creamStrong: '#F8E7AC',
  sky: '#DCE9FB',
  lavender: '#E8DEF8',
  lavenderBorder: '#DCCDF5',
};

export const DARK: Palette = {
  background: '#211E1B',
  surface: '#2B2723',
  surfaceMuted: '#332E28',
  text: '#F2EEE7',
  muted: '#C4BBB0',
  border: '#453E35',
  accent: '#6FBFB6',
  onAccent: '#1D2B29',
  danger: '#E08A80',
  success: '#7FB98A',
  inkSoft: '#CFC8BC',
  borderSoft: '#38322B',
  accentDark: '#8FD0C7',
  accentSoft: '#234642',
  accentSoftStrong: '#2E5750',
  green: '#7FBF8E',
  greenBg: '#1E3325',
  greenInk: '#9AD6A8',
  greenSoft: '#2A4A32',
  greenBorder: '#33573D',
  red: '#E88F8F',
  redBg: '#3A2323',
  redInk: '#F2A8A8',
  redSoft: '#4A2A2A',
  redBorder: '#5A3434',
  amber: '#E3B93E',
  amberBg: '#3A2F18',
  gold: '#E9B949',
  goldInk: '#E8C86A',
  silver: '#9AA3B8',
  bronze: '#D89B6A',
  examBlue: '#6FB3F2',
  examOrange: '#F59A4D',
  track: '#3A342C',
  warnBg: '#3A2F18',
  warnBorder: '#8A6D2B',
  mint: '#1E3A2C',
  pink: '#3D2A30',
  cream: '#3A3220',
  creamStrong: '#453A24',
  sky: '#22334A',
  lavender: '#2E2842',
  lavenderBorder: '#453D63',
};

const THEME_KEY = 'toeic_theme';

interface ThemeCtx {
  theme: Theme;
  colors: Palette;
  /** 'system' = theo hệ thống; đặt 'light'/'dark' để khóa. */
  setTheme: (t: Theme | 'system') => void;
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [saved, setSaved] = useState<Theme | 'system'>('system');
  // Accent server (UiSettingsProvider, nếu có phía trên): ghi đè họ màu
  // accent theo đúng cách web dẫn xuất (deriveAccent) theo theme hiện tại.
  // Không có UiSettingsProvider phía trên thì dùng bảng tĩnh LIGHT/DARK.
  const ui = useUiSettingsOptional();
  const serverAccent = ui?.settings.ui.accent;

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setSaved(v);
      })
      .catch(() => {
        /* bỏ qua */
      });
  }, []);

  const theme: Theme = saved === 'system' ? (system === 'dark' ? 'dark' : 'light') : saved;
  const setTheme = useCallback((t: Theme | 'system') => {
    setSaved(t);
    AsyncStorage.setItem(THEME_KEY, t).catch(() => {
      /* bỏ qua */
    });
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const colors = useMemo<Palette>(() => {
    const base = theme === 'dark' ? DARK : LIGHT;
    if (!serverAccent) return base;
    const d = deriveAccent(serverAccent, theme);
    return {
      ...base,
      accent: d.accent,
      accentDark: d.accentDark,
      accentSoft: d.accentSoft,
      accentSoftStrong: d.accentSoftStrong,
    };
  }, [theme, serverAccent]);

  const value = useMemo<ThemeCtx>(
    () => ({ theme, colors, setTheme, toggleTheme }),
    [theme, colors, setTheme, toggleTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(ThemeContext);
  if (!c) throw new Error('useTheme phải dùng trong ThemeProvider');
  return c;
}

// ---- Cỡ chữ (A- / A+) — 4 mức như web (Nhỏ/Vừa/Lớn/Rất lớn),
// lưu AsyncStorage, áp bằng fontScale nhân với cỡ chữ gốc.
// KHÔNG dùng số tuyệt đối lớn cố định: mọi Text trong app lấy cỡ qua
// scaled() hoặc nhân fontScale, nên tăng cỡ chữ không vỡ layout.
// fontScale server (UiSettings, mặc định 1) nhân thêm lên trên hệ số
// mức của người dùng — đúng như web: cỡ chữ hiệu dụng = fontScale
// server × hệ số mức (không bao giờ ghi đè lựa chọn mức của user). ----
const TEXT_SIZE_KEY = 'app_text_size';
export const TEXT_SIZE_LABELS = ['Nhỏ', 'Vừa', 'Lớn', 'Rất lớn'];
/** Hệ số nhân cỡ chữ cho từng mức. Mức lớn nhất chỉ 1.25x để layout
 * flex không bị tràn trên màn hình hẹp. */
export const TEXT_SIZE_SCALES = [0.9, 1, 1.12, 1.25];

interface TextSizeCtx {
  level: number;
  setLevel: (n: number) => void;
  label: string;
  /** Hệ số nhân cỡ chữ hiện tại (đã gồm fontScale server nếu có). */
  fontScale: number;
  /** Nhân cỡ chữ gốc với fontScale hiện tại. */
  scaled: (base: number) => number;
}
const TextSizeContext = createContext<TextSizeCtx | null>(null);

export function TextSizeProvider({ children }: { children: ReactNode }) {
  const [level, setLevelState] = useState(1);
  const ui = useUiSettingsOptional();
  const serverFontScale = ui?.settings.ui.fontScale ?? 1;
  useEffect(() => {
    AsyncStorage.getItem(TEXT_SIZE_KEY)
      .then((v) => {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0 && n <= 3) setLevelState(n);
      })
      .catch(() => {
        /* bỏ qua */
      });
  }, []);
  const setLevel = useCallback((n: number) => {
    const v = Math.max(0, Math.min(3, n));
    setLevelState(v);
    AsyncStorage.setItem(TEXT_SIZE_KEY, String(v)).catch(() => {
      /* bỏ qua */
    });
  }, []);
  const value = useMemo<TextSizeCtx>(() => {
    const fontScale = TEXT_SIZE_SCALES[level] * serverFontScale;
    return {
      level,
      setLevel,
      label: TEXT_SIZE_LABELS[level],
      fontScale,
      scaled: (base: number) => Math.round(base * fontScale),
    };
  }, [level, setLevel, serverFontScale]);
  return <TextSizeContext.Provider value={value}>{children}</TextSizeContext.Provider>;
}

export function useTextSize(): TextSizeCtx {
  const c = useContext(TextSizeContext);
  if (!c) throw new Error('useTextSize phải dùng trong TextSizeProvider');
  return c;
}
