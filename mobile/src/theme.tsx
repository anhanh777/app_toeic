// Theme Pastel + cỡ chữ — port ý tưởng từ frontend/src/theme.ts
// (web) sang React Native. Màu giữ nguyên bản web "Pastel nhẹ nhàng":
// nền #FDF8F3, thẻ trắng bo 20, sage #5FA8A0; dark = warm charcoal.
// Bảng màu bám sát frontend/src/index.css (:root + [data-theme="dark"])
// để các worker khác dùng chung token camelCase với web.
// Accent + fontScale server (UiSettingsProvider, nếu có phía trên) ghi đè
// lên bảng tĩnh: họ màu accent dẫn xuất theo deriveAccent của web,
// fontScale nhân thêm lên hệ số mức chữ của người dùng.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme, type ViewStyle } from 'react-native';
import { deriveAccent, deriveLivelyAccent, useUiSettingsOptional } from './uiSettings';

export type Theme = 'light' | 'dark';

export interface Palette {
  /** Phong cách giao diện đang áp: 'pastel' mặc định, 'lively' = Sống động (Duolingo). */
  style: 'pastel' | 'lively';
  /** Cam streak 🔥 + vàng xu 🪙 + xanh dương Duolingo (lively dùng #FF9600/#FFC800/#1CB0F6). */
  streak: string;
  coin: string;
  duoBlue: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  muted: string;
  border: string;
  /** Màu viền dưới cứng kiểu Duolingo (đậm hơn border) — chỉ lively dùng. */
  borderHard: string;
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
  style: 'pastel',
  streak: '#F5821F',
  coin: '#E9B949',
  duoBlue: '#0B5CAD',
  background: '#FDF8F3',
  surface: '#FFFFFF',
  surfaceMuted: '#FBF6F0',
  text: '#3D3A36',
  muted: '#8A837B',
  border: '#EFE6DB',
  borderHard: '#E3D9CC',
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
  style: 'pastel',
  streak: '#F59A4D',
  coin: '#E9B949',
  duoBlue: '#6FB3F2',
  background: '#211E1B',
  surface: '#2B2723',
  surfaceMuted: '#332E28',
  text: '#F2EEE7',
  muted: '#C4BBB0',
  border: '#453E35',
  borderHard: '#332E28',
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

// ---- Phong cách "Sống động" (Duolingo) — chỉ áp khi ui.style === 'lively'.
// Token khớp bản web: accent #58CC02, accent-dark/bóng đổ #46A302,
// accent-soft #DFF3C2, nền #F8FDF0, thẻ trắng viền 2px #E5E5E5,
// cam streak #FF9600, vàng xu #FFC800, xanh dương #1CB0F6.
// Khi lively, accent #58CC02 này ÁT accent đã lưu của người dùng;
// quay về Pastel thì dùng lại accent đã lưu như cũ (xem ThemeProvider). ----
export const LIVELY_LIGHT: Palette = {
  style: 'lively',
  streak: '#FF9600',
  coin: '#FFC800',
  duoBlue: '#1CB0F6',
  background: '#F8FDF0',
  surface: '#FFFFFF',
  surfaceMuted: '#EFF7DF',
  text: '#3C3C3C',
  muted: '#8A837B',
  border: '#E5E5E5',
  borderHard: '#CFCFCF',
  accent: '#58CC02',
  onAccent: '#FFFFFF',
  danger: '#FF4B4B',
  success: '#58CC02',
  inkSoft: '#5C564F',
  borderSoft: '#EFEFEF',
  accentDark: '#46A302',
  accentSoft: '#DFF3C2',
  accentSoftStrong: '#C9E9A8',
  green: '#58CC02',
  greenBg: '#DFF3C2',
  greenInk: '#3E7A02',
  greenSoft: '#DFF3C2',
  greenBorder: '#BEE89A',
  red: '#FF4B4B',
  redBg: '#FFEDED',
  redInk: '#D33131',
  redSoft: '#FFD9D9',
  redBorder: '#FFC2C2',
  amber: '#FFC800',
  amberBg: '#FFF6CC',
  gold: '#FFC800',
  goldInk: '#8A6D1F',
  silver: '#B9C2D4',
  bronze: '#D89B6A',
  examBlue: '#1CB0F6',
  examOrange: '#FF9600',
  track: '#E5E5E5',
  warnBg: '#FFF6CC',
  warnBorder: '#FFC800',
  mint: '#DFF3C2',
  pink: '#FBDCE2',
  cream: '#FFF6CC',
  creamStrong: '#FFEEB0',
  sky: '#DDF4FF',
  lavender: '#E8DEF8',
  lavenderBorder: '#DCCDF5',
};

export const LIVELY_DARK: Palette = {
  style: 'lively',
  streak: '#FF9600',
  coin: '#FFC800',
  duoBlue: '#1CB0F6',
  background: '#20291A',
  surface: '#2A3620',
  surfaceMuted: '#33402A',
  text: '#F2F7E8',
  muted: '#B9C4A8',
  border: '#42522F',
  borderHard: '#22301A',
  accent: '#58CC02',
  onAccent: '#FFFFFF',
  danger: '#FF6B6B',
  success: '#7ED321',
  inkSoft: '#D5DCC8',
  borderSoft: '#38452C',
  accentDark: '#7ED321',
  accentSoft: '#2E4A1A',
  accentSoftStrong: '#3A5C22',
  green: '#7ED321',
  greenBg: '#24391A',
  greenInk: '#A8E063',
  greenSoft: '#2A4A32',
  greenBorder: '#3E5C2A',
  red: '#FF6B6B',
  redBg: '#3A2323',
  redInk: '#F2A8A8',
  redSoft: '#4A2A2A',
  redBorder: '#5A3434',
  amber: '#FFC800',
  amberBg: '#3A2F18',
  gold: '#FFC800',
  goldInk: '#E8C86A',
  silver: '#9AA3B8',
  bronze: '#D89B6A',
  examBlue: '#1CB0F6',
  examOrange: '#FF9600',
  track: '#33402A',
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
  /** Phong cách giao diện từ settings (mặc định 'pastel'). */
  style: 'pastel' | 'lively';
  /** true khi style === 'lively' — các màn chỉ thêm điểm nhấn khi này. */
  isLively: boolean;
  /** 'system' = theo hệ thống; đặt 'light'/'dark' để khóa. */
  setTheme: (t: Theme | 'system') => void;
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeCtx | null>(null);

export type LivelyCardSize = 'hero' | 'card' | 'compact';

/** Nút chính kiểu Duolingo khi lively: bo 16 + "nổi" nhờ viền dưới dày
 * màu đậm hơn (mặc định accent-dark); pastel trả về {} (giữ nguyên nút
 * hiện tại). Đặt CUỐI mảng style của Pressable để ghi đè bo góc tĩnh.
 * bottomColor: màu viền dưới riêng cho nút không dùng accent (vd. nút
 * vàng #FFC800 thì viền dưới vàng đậm). */
export function raisedButton(colors: Palette, bottomColor?: string): ViewStyle {
  if (colors.style !== 'lively') return {};
  return { borderBottomWidth: 4, borderBottomColor: bottomColor ?? colors.accentDark, borderRadius: 16 };
}

/** Thẻ kiểu Duolingo khi lively: viền 2px + viền dưới CỨNG dày màu đậm
 * hơn (borderHard) thay cho shadow mờ, bo tròn lớn, padding rộng.
 * pastel trả về {} (giữ nguyên thẻ hiện tại).
 * - 'hero': màn chính/Hôm nay — bo 20, padding 18, viền dưới 4.
 * - 'card': thẻ nội dung thường — bo 18, padding 16, viền dưới 4.
 * - 'compact': danh sách dài — bo 14, viền dưới 3, KHÔNG đổi padding.
 * KHÔNG ghi đè borderColor: màu viền inline (vd. thẻ đang chọn viền
 * accent) được giữ nguyên; bottomColor mặc định borderHard, truyền
 * riêng khi thẻ đã có viền màu (vd. accentDark cho thẻ viền accent).
 * Đặt CUỐI mảng style để ghi đè bo góc/padding tĩnh. */
export function livelyCard(colors: Palette, size: LivelyCardSize = 'card', bottomColor?: string): ViewStyle {
  if (colors.style !== 'lively') return {};
  const base: ViewStyle = {
    borderWidth: 2,
    borderBottomWidth: 4,
    borderBottomColor: bottomColor ?? colors.borderHard,
  };
  if (size === 'hero') return { ...base, borderRadius: 20, padding: 18 };
  if (size === 'compact') return { ...base, borderRadius: 14, borderBottomWidth: 3 };
  return { ...base, borderRadius: 18, padding: 16 };
}

/** Chip/pill kiểu Duolingo khi lively: viền 2px + viền dưới cứng 3px.
 * pastel trả về {}. Đặt CUỐI mảng style. */
export function livelyChip(colors: Palette): ViewStyle {
  if (colors.style !== 'lively') return {};
  return { borderWidth: 2, borderBottomWidth: 3, borderBottomColor: colors.borderHard, borderRadius: 999 };
}

/** Track thanh tiến độ/XP kiểu Duolingo khi lively: dày 14, bo tròn,
 * viền 2px rõ. pastel trả về {}. Đặt CUỐI mảng style của track. */
export function livelyBarTrack(colors: Palette): ViewStyle {
  if (colors.style !== 'lively') return {};
  return { height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.border, overflow: 'hidden' };
}

/** Ô đáp án kiểu Duolingo khi lively: bo 14, viền 2px + viền dưới cứng
 * 3px; chọn thì nền xanh nhạt + viền xanh đậm, đúng thì xanh lá,
 * sai thì đỏ. pastel trả về {}. Đặt CUỐI mảng style của ô đáp án. */
export function livelyOption(
  colors: Palette,
  state: 'default' | 'selected' | 'correct' | 'wrong' = 'default',
): ViewStyle {
  if (colors.style !== 'lively') return {};
  const base: ViewStyle = { borderWidth: 2, borderBottomWidth: 3, borderRadius: 14 };
  if (state === 'selected')
    return { ...base, borderColor: colors.accent, backgroundColor: colors.accentSoft, borderBottomColor: colors.accentDark };
  if (state === 'correct')
    return { ...base, borderColor: colors.success, backgroundColor: colors.greenBg, borderBottomColor: colors.greenInk };
  if (state === 'wrong')
    return { ...base, borderColor: colors.danger, backgroundColor: colors.redBg, borderBottomColor: colors.redInk };
  return { ...base, borderColor: colors.border, backgroundColor: colors.surface, borderBottomColor: colors.borderHard };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [saved, setSaved] = useState<Theme | 'system'>('system');
  // Accent server (UiSettingsProvider, nếu có phía trên): ghi đè họ màu
  // accent theo đúng cách web dẫn xuất (deriveAccent) theo theme hiện tại.
  // Không có UiSettingsProvider phía trên thì dùng bảng tĩnh LIGHT/DARK.
  const ui = useUiSettingsOptional();
  // Mau chu dao theo kieu dang chon (`styles[<kieu>].accent`); thieu thi
  // roi ve mau cu `ui.accent`. Pastel dung mau Pastel da luu (vd. #5B9E4D),
  // Song dong dung mau lively da luu (mac dinh #58CC02).
  const styleAccent =
    ui?.settings.ui.styles?.[ui.settings.ui.style]?.accent ?? ui?.settings.ui.accent;
  // Phong cach tu settings (mac dinh 'pastel'). Khi lively: dung bang
  // LIVELY_* lam nen, nhung ho mau accent dan xuat tu mau lively da luu
  // (deriveLivelyAccent) thay vi co dinh #58CC02 nhu truoc; khi pastel:
  // giu nguyen hanh vi cu (deriveAccent tu mau Pastel da luu).

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

  const style = ui?.settings.ui.style ?? 'pastel';
  const isLively = style === 'lively';

  const colors = useMemo<Palette>(() => {
    if (isLively) {
      const base = theme === 'dark' ? LIVELY_DARK : LIVELY_LIGHT;
      const t = deriveLivelyAccent(styleAccent ?? '#58CC02', theme);
      return {
        ...base,
        accent: t.accent,
        accentDark: t.accentDark,
        accentSoft: t.accentSoft,
        accentSoftStrong: t.accentSoftStrong,
        green: t.accent,
        greenBg: t.accentSoft,
        greenSoft: t.accentSoft,
        greenBorder: t.accentSoftStrong,
        greenInk: t.accentDark,
      };
    }
    const base = theme === 'dark' ? DARK : LIGHT;
    if (!styleAccent) return base;
    const d = deriveAccent(styleAccent, theme);
    return {
      ...base,
      accent: d.accent,
      accentDark: d.accentDark,
      accentSoft: d.accentSoft,
      accentSoftStrong: d.accentSoftStrong,
    };
  }, [theme, styleAccent, isLively]);

  // Nền native (root view) theo theme: mỗi lần chuyển tab bằng
  // router.replace, màn cũ unmount rồi màn mới mới paint frame đầu —
  // khoảng giữa đó container trong suốt sẽ lộ nền root view. Mặc định
  // Expo là trắng #ffffff nên mới nháy trắng (dark mode càng lộ).
  // expo-system-ui đã có sẵn trong Expo Go, gọi động để nền native
  // bám theo theme sáng/tối thay vì 1 màu cố định trong app.json.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const value = useMemo<ThemeCtx>(
    () => ({ theme, colors, style, isLively, setTheme, toggleTheme }),
    [theme, colors, style, isLively, setTheme, toggleTheme],
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
