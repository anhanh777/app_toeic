// Theme Pastel + cỡ chữ — port ý tưởng từ frontend/src/theme.ts
// (web) sang React Native. Màu giữ nguyên bản web "Pastel nhẹ nhàng":
// nền #FDF8F3, thẻ trắng bo 16, sage #5FA8A0; dark = warm charcoal.
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
}

export const LIGHT: Palette = {
  background: '#FDF8F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F6EFE7',
  text: '#2B2622',
  muted: '#7A6F66',
  border: '#EADFD3',
  accent: '#5FA8A0',
  onAccent: '#FFFFFF',
  danger: '#C4574E',
  success: '#4E8A5A',
};

export const DARK: Palette = {
  background: '#211E1B',
  surface: '#2E2925',
  surfaceMuted: '#38322D',
  text: '#F3EDE6',
  muted: '#B8ACA0',
  border: '#453E37',
  accent: '#7CC4BB',
  onAccent: '#1D2B29',
  danger: '#E08A80',
  success: '#7FB98A',
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

  const value = useMemo<ThemeCtx>(
    () => ({ theme, colors: theme === 'dark' ? DARK : LIGHT, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
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
// scaled() hoặc nhân fontScale, nên tăng cỡ chữ không vỡ layout. ----
const TEXT_SIZE_KEY = 'app_text_size';
export const TEXT_SIZE_LABELS = ['Nhỏ', 'Vừa', 'Lớn', 'Rất lớn'];
/** Hệ số nhân cỡ chữ cho từng mức. Mức lớn nhất chỉ 1.3x để layout
 * flex không bị tràn trên màn hình hẹp. */
export const TEXT_SIZE_SCALES = [0.9, 1, 1.15, 1.3];

interface TextSizeCtx {
  level: number;
  setLevel: (n: number) => void;
  label: string;
  /** Hệ số nhân cỡ chữ hiện tại. */
  fontScale: number;
  /** Nhân cỡ chữ gốc với fontScale hiện tại. */
  scaled: (base: number) => number;
}
const TextSizeContext = createContext<TextSizeCtx | null>(null);

export function TextSizeProvider({ children }: { children: ReactNode }) {
  const [level, setLevelState] = useState(1);
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
  const value = useMemo<TextSizeCtx>(
    () => ({
      level,
      setLevel,
      label: TEXT_SIZE_LABELS[level],
      fontScale: TEXT_SIZE_SCALES[level],
      scaled: (base: number) => Math.round(base * TEXT_SIZE_SCALES[level]),
    }),
    [level, setLevel],
  );
  return <TextSizeContext.Provider value={value}>{children}</TextSizeContext.Provider>;
}

export function useTextSize(): TextSizeCtx {
  const c = useContext(TextSizeContext);
  if (!c) throw new Error('useTextSize phải dùng trong TextSizeProvider');
  return c;
}
