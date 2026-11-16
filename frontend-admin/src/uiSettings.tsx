import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { API_URL } from './api';

/**
 * uiSettings.ts — cai dat giao dien dong (scope C), dung chung cho web admin
 * (ban sao giong het o app hoc vien — giu 2 ban dong bo khi sua).
 *
 * - Tai lieu cai dat: { ui: { accent, fontScale, loading: { loginButton,
 *   page, table, speed, text } } }. Backend tra ve tai lieu nay o
 *   GET /api/settings (cong khai); admin sua qua PUT /api/admin/settings.
 * - `fontScale` chi la CO CHU CO SO. Co chu hieu dung = fontScale x he so
 *   muc cua nguoi dung (nut 🔠, localStorage `app_text_size`, muc 0-3).
 *   Code nay KHONG BAO GIO doc/ghi/xoa `app_text_size` — lua chon cua
 *   nguoi dung khong bao gio bi cai dat admin ghi de hay reset. Nhan co
 *   chu bang cach dat `font-size` goc (html) = 16px x fontScale; cac
 *   class .ts-N dung rem nen tu nhan theo.
 * - Mau chu dao duoc dan xuat (accent-dark/soft/soft-strong) theo theme
 *   sang/toi hien tai; doi theme thi tu tinh lai (MutationObserver).
 * - Gia tri thieu/sai -> mac dinh trong code (normalizeSettings), khong
 *   bao gio crash app. Fetch loi -> dung mac dinh, thu lai 1 lan sau 6s.
 */

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

/** Gop tai lieu (co the thieu/sai) ve day du + hop le, sai cho nao ve mac dinh cho do. */
export function normalizeSettings(input: unknown): UiSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const ui = (src.ui && typeof src.ui === 'object' ? src.ui : {}) as Record<string, unknown>;
  const loading = (ui.loading && typeof ui.loading === 'object' ? ui.loading : {}) as Record<string, unknown>;
  const d = UI_SETTINGS_DEFAULTS.ui;
  const text = typeof loading.text === 'string' && loading.text.trim() && loading.text.length <= 120
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

/* ---- Mau chu dao: dan xuat cac bien phu thuoc theo theme ---- */

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Tron mau hex voi trang (amount 0-1) hoac den. */
function mix(hex: string, target: 'white' | 'black', amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = target === 'white' ? 255 : 0;
  return toHex(r + (t - r) * amount, g + (t - g) * amount, b + (t - b) * amount);
}

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function deriveAccent(hex: string, theme: 'light' | 'dark') {
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
 * Ap cai dat vao :root: co chu co so (--ui-font-scale) + mau chu dao
 * (--accent, --accent-dark, --accent-soft, --accent-soft-strong).
 * Khong cham gi den lua chon co chu rieng cua nguoi dung.
 */
export function applyUiSettings(settings: UiSettings): void {
  const root = document.documentElement;
  root.style.setProperty('--ui-font-scale', String(settings.ui.fontScale));
  const derived = deriveAccent(settings.ui.accent, currentTheme());
  root.style.setProperty('--accent', derived.accent);
  root.style.setProperty('--accent-dark', derived.accentDark);
  root.style.setProperty('--accent-soft', derived.accentSoft);
  root.style.setProperty('--accent-soft-strong', derived.accentSoftStrong);
}

async function fetchSettings(): Promise<UiSettings> {
  const res = await fetch(`${API_URL}/api/settings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeSettings(await res.json());
}

interface UiSettingsCtx {
  settings: UiSettings;
  loading: boolean;
  /** Ap ngay 1 tai lieu cai dat (dung sau khi luu o trang Cai dat). */
  applySettings: (doc: UiSettings) => void;
  /** Tai lai tu backend (dung khi can dong bo lai). */
  refresh: () => void;
}

const UiSettingsContext = createContext<UiSettingsCtx | null>(null);

/** Tai cai dat giao dien 1 lan luc mo app (khong chan render), ap len :root. */
export function UiSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<UiSettings>(UI_SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);

  const applySettings = (doc: UiSettings) => {
    const normalized = normalizeSettings(doc);
    setSettingsState(normalized);
    applyUiSettings(normalized);
  };

  const refresh = () => {
    setLoading(true);
    fetchSettings()
      .then(applySettings)
      .catch(() => {
        // Backend ngu/chua day (Render free tier): giu mac dinh, thu lai 1 lan.
        window.setTimeout(() => {
          fetchSettings().then(applySettings).catch(() => undefined);
        }, 6000);
      })
      .finally(() => setLoading(false));
  };

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    applyUiSettings(UI_SETTINGS_DEFAULTS);
    refresh();
    // Doi theme sang/toi thi tinh lai mau dan xuat theo theme moi.
    const observer = new MutationObserver(() => applyUiSettings(settingsRef.current));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <UiSettingsContext.Provider value={{ settings, loading, applySettings, refresh }}>
      {children}
    </UiSettingsContext.Provider>
  );
}

export function useUiSettings(): UiSettingsCtx {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) throw new Error('useUiSettings phải dùng trong UiSettingsProvider');
  return ctx;
}

/* ---- Hieu ung loading ve theo id cai dat ---- */

export function LoadingEffect({
  effect,
  speed = 1,
  size = 'md',
  label,
}: {
  effect: LoadingEffectId;
  speed?: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  // Toc do lon hon = chay nhanh hon = thoi gian animation ngan hon.
  const style = {
    '--ld-speed': String(1 / Math.max(0.5, Math.min(2, speed || 1))),
    fontSize: size === 'lg' ? '1.6rem' : size === 'sm' ? '0.8rem' : '1rem',
  } as CSSProperties;
  const wrap = label ? (
    <span className="ld-wrap">
      <LoadingEffectInner effect={effect} style={style} />
      <span>{label}</span>
    </span>
  ) : (
    <LoadingEffectInner effect={effect} style={style} />
  );
  return wrap;
}

function LoadingEffectInner({ effect, style }: { effect: LoadingEffectId; style: CSSProperties }) {
  switch (effect) {
    case 'dual-ring':
      return <span className="ld-dual-ring" style={style} aria-hidden="true" />;
    case 'bouncing-dots':
      return (
        <span className="ld-dots" style={style} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      );
    case 'skeleton':
      return (
        <span className="ld-skeleton" style={style} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      );
    case 'progress-bar':
      return (
        <span className="ld-progress" style={style} aria-hidden="true">
          <i />
        </span>
      );
    case 'spinner':
    default:
      return <span className="ld-spinner" style={style} aria-hidden="true" />;
  }
}

/** 1 dong/hang trang thai dang tai: hieu ung + chu (skeleton thi chi hien khung). */
export function LoadingLine({ effect, speed = 1, text }: { effect: LoadingEffectId; speed?: number; text: string }) {
  return (
    <div className="ld-line">
      <LoadingEffect effect={effect} speed={speed} />
      {effect !== 'skeleton' && <span>{text}</span>}
    </div>
  );
}
