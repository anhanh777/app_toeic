import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { API_URL } from './api';

/**
 * brand.tsx — ten & logo thuong hieu, dung chung cho web admin
 * (ban sao tuong tu se co o app hoc vien — giu 2 ban dong bo khi sua).
 *
 * - Tai lieu thuong hieu (phang): { name, tagline, logoType, logoEmoji, logoUrl }.
 *   Backend tra ve o GET /api/brand (cong khai); admin sua qua
 *   PUT /api/admin/brand.
 * - Gia tri thieu/sai -> mac dinh trong code (normalizeBrand), khong
 *   bao gio crash app. Fetch loi -> dung mac dinh, thu lai 1 lan sau 6s.
 * - applyBrand: dat document.title + favicon (khi logo la anh).
 */

export interface BrandSettings {
  name: string;
  tagline: string;
  logoType: 'emoji' | 'image';
  logoEmoji: string;
  logoUrl: string;
}

export const BRAND_DEFAULTS: BrandSettings = {
  name: 'ANHANH',
  tagline: 'Luyện TOEIC • IELTS mỗi ngày',
  logoType: 'emoji',
  logoEmoji: '🌸',
  logoUrl: '',
};

const MAX_NAME = 30;
const MAX_TAGLINE = 80;
const MAX_EMOJI = 10;
const MAX_URL = 500;

function isHttpUrl(v: string): boolean {
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
  const name = typeof src.name === 'string' ? src.name.trim() : '';
  const tagline = typeof src.tagline === 'string' ? src.tagline.trim() : '';
  const logoEmoji = typeof src.logoEmoji === 'string' ? src.logoEmoji : '';
  const logoUrl = typeof src.logoUrl === 'string' ? src.logoUrl.trim() : '';
  return {
    name: name.length >= 1 && name.length <= MAX_NAME ? name : d.name,
    tagline: tagline.length <= MAX_TAGLINE ? tagline : d.tagline,
    logoType: src.logoType === 'emoji' || src.logoType === 'image' ? src.logoType : d.logoType,
    logoEmoji:
      Array.from(logoEmoji).length >= 1 && Array.from(logoEmoji).length <= MAX_EMOJI ? logoEmoji : d.logoEmoji,
    logoUrl: logoUrl === '' || (logoUrl.length <= MAX_URL && isHttpUrl(logoUrl)) ? logoUrl : '',
  };
}

/* ---- document.title + favicon ---- */

// Favicon mac dinh cua app, ghi lai o lan ap dau tien de khoi phuc khi
// logo doi ve emoji (hoac khong con anh).
let defaultFavicon: string | null = null;

/** Ap thuong hieu vao trang admin: tieu de tab + favicon (chi khi logo la anh). */
export function applyBrand(brand: BrandSettings): void {
  document.title = `${brand.name} — Quản trị`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (defaultFavicon === null) defaultFavicon = link.href;
  if (brand.logoType === 'image' && brand.logoUrl && isHttpUrl(brand.logoUrl)) {
    link.href = brand.logoUrl;
  } else if (defaultFavicon) {
    link.href = defaultFavicon;
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
  /** Ap ngay 1 tai lieu thuong hieu (dung sau khi luu o trang Ten & Logo). */
  applyBrand: (doc: BrandSettings) => void;
  /** Tai lai tu backend (dung khi can dong bo lai). */
  refresh: () => void;
}

const BrandContext = createContext<BrandCtx | null>(null);

/** Tai thuong hieu 1 lan luc mo app (khong chan render), ap len tieu de + favicon. */
export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrandState] = useState<BrandSettings>(BRAND_DEFAULTS);
  const [loading, setLoading] = useState(true);

  const applyBrandState = (doc: BrandSettings) => {
    const normalized = normalizeBrand(doc);
    setBrandState(normalized);
    applyBrand(normalized);
  };

  const refresh = () => {
    setLoading(true);
    fetchBrand()
      .then(applyBrandState)
      .catch(() => {
        // Backend ngu/chua day (Render free tier): giu mac dinh, thu lai 1 lan.
        window.setTimeout(() => {
          fetchBrand().then(applyBrandState).catch(() => undefined);
        }, 6000);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    applyBrand(BRAND_DEFAULTS);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BrandContext.Provider value={{ brand, loading, applyBrand: applyBrandState, refresh }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand(): BrandCtx {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand phải dùng trong BrandProvider');
  return ctx;
}
