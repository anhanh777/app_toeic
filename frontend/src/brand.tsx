import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { API_URL } from './api';

/**
 * brand.tsx — thong tin thuong hieu (ten app, tagline, logo), dung chung
 * cho web hoc vien (ban sao giong het o app admin + mobile — giu cac ban
 * dong bo khi sua).
 *
 * - Tai lieu thuong hieu (flat JSON): { name, tagline, logoType, logoEmoji,
 *   logoUrl }. Backend tra ve tai lieu nay o GET /api/brand (cong khai);
 *   admin sua qua PUT /api/admin/brand.
 * - Gia tri thieu/sai -> mac dinh trong code (normalizeBrand), khong bao
 *   gio crash app. Fetch loi -> dung mac dinh, thu lai 1 lan sau 6s.
 * - applyBrand dat document.title + favicon theo logo (anh thi dung
 *   logoUrl, khong thi ve /icon.svg mac dinh).
 */

export type BrandSettings = {
  name: string;
  tagline: string;
  logoType: 'emoji' | 'image';
  logoEmoji: string;
  logoUrl: string;
};

export const BRAND_DEFAULTS: BrandSettings = {
  name: 'ANHANH',
  tagline: 'Luyện TOEIC • IELTS mỗi ngày',
  logoType: 'emoji',
  logoEmoji: '🌸',
  logoUrl: '',
};

function isValidHttpUrl(v: unknown): v is string {
  if (typeof v !== 'string' || !v || v.length > 500) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Gop tai lieu (co the thieu/sai) ve day du + hop le, sai cho nao ve mac dinh cho do. */
export function normalizeBrand(input: unknown): BrandSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = BRAND_DEFAULTS;
  const name =
    typeof src.name === 'string' && src.name.trim().length >= 1 && src.name.trim().length <= 30
      ? src.name.trim()
      : d.name;
  const tagline =
    typeof src.tagline === 'string' && src.tagline.trim().length <= 80 ? src.tagline.trim() : d.tagline;
  const logoType = src.logoType === 'image' || src.logoType === 'emoji' ? src.logoType : d.logoType;
  const logoEmoji =
    typeof src.logoEmoji === 'string' && [...src.logoEmoji].length >= 1 && [...src.logoEmoji].length <= 10
      ? src.logoEmoji
      : d.logoEmoji;
  const logoUrl = isValidHttpUrl(src.logoUrl) ? (src.logoUrl as string) : d.logoUrl;
  return { name, tagline, logoType, logoEmoji, logoUrl };
}

/**
 * Ap thuong hieu vao trinh duyet: tieu de tab + favicon theo logo.
 * Logo anh thi dung logoUrl, khong thi ve /icon.svg mac dinh.
 */
export function applyBrand(brand: BrandSettings): void {
  document.title = `${brand.name} — Luyện thi TOEIC · IELTS`;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) {
    link.href = brand.logoType === 'image' && brand.logoUrl ? brand.logoUrl : '/icon.svg';
  }
}

async function fetchBrand(): Promise<BrandSettings> {
  const res = await fetch(`${API_URL}/api/brand`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeBrand(await res.json());
}

interface BrandCtx {
  brand: BrandSettings;
  loading: boolean;
  /** Ap ngay 1 tai lieu thuong hieu (dung sau khi luu o trang Cai dat). */
  applyBrand: (doc: BrandSettings) => void;
  /** Tai lai tu backend (dung khi can dong bo lai). */
  refresh: () => void;
}

const BrandContext = createContext<BrandCtx | null>(null);

/** Tai thuong hieu 1 lan luc mo app (khong chan render), ap len title + favicon. */
export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrandState] = useState<BrandSettings>(BRAND_DEFAULTS);
  const [loading, setLoading] = useState(true);

  const applyBrandDoc = (doc: BrandSettings) => {
    const normalized = normalizeBrand(doc);
    setBrandState(normalized);
    applyBrand(normalized);
  };

  const refresh = () => {
    setLoading(true);
    fetchBrand()
      .then(applyBrandDoc)
      .catch(() => {
        // Backend ngu/chua day (Render free tier): giu mac dinh, thu lai 1 lan.
        window.setTimeout(() => {
          fetchBrand().then(applyBrandDoc).catch(() => undefined);
        }, 6000);
      })
      .finally(() => setLoading(false));
  };

  const brandRef = useRef(brand);
  brandRef.current = brand;

  useEffect(() => {
    applyBrand(BRAND_DEFAULTS);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BrandContext.Provider value={{ brand, loading, applyBrand: applyBrandDoc, refresh }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand(): BrandCtx {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand phải dùng trong BrandProvider');
  return ctx;
}
