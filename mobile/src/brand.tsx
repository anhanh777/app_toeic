// Brand (tên app, tagline, logo) — port ý tưởng từ frontend/src/uiSettings.tsx
// (web) sang React Native. Tài liệu brand lấy từ GET /api/brand (công khai,
// không cần auth); giá trị thiếu/sai -> mặc định trong code (normalizeBrand),
// fetch lỗi -> giữ mặc định, thử lại 1 lần sau 6s.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_URL } from './api';

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

/** Độ dài theo ký tự hiển thị (emoji tính là 1, không phải 2 đơn vị UTF-16). */
function charLength(s: string): number {
  return Array.from(s).length;
}

function validLogoUrl(v: unknown): v is string {
  if (typeof v !== 'string' || !v) return false;
  if (v.length > 500) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Gộp tài liệu (có thể thiếu/sai) về đầy đủ + hợp lệ, sai chỗ nào về mặc định chỗ đó. */
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
    typeof src.logoEmoji === 'string' &&
    charLength(src.logoEmoji.trim()) >= 1 &&
    charLength(src.logoEmoji.trim()) <= 10
      ? src.logoEmoji.trim()
      : d.logoEmoji;
  const logoUrl = validLogoUrl(src.logoUrl) ? (src.logoUrl as string) : d.logoUrl;
  return { name, tagline, logoType, logoEmoji, logoUrl };
}

async function fetchBrand(): Promise<BrandSettings> {
  const res = await fetch(`${API_URL}/api/brand`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeBrand(await res.json());
}

interface BrandCtx {
  brand: BrandSettings;
  loading: boolean;
  /** Tải lại từ backend (dùng khi cần đồng bộ lại). */
  refresh: () => void;
}
const BrandContext = createContext<BrandCtx | null>(null);

/** Tải brand 1 lần lúc mở app (không chặn render), lỗi thì giữ mặc định. */
export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandSettings>(BRAND_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tải brand; setState chỉ nằm trong callback của promise (không gọi
  // setState đồng bộ trong effect — theo mẫu AuthProvider).
  const load = useCallback(() => {
    fetchBrand()
      .then((b) => setBrand(b))
      .catch(() => {
        // Backend ngủ/chưa deploy (Render free tier): giữ mặc định, thử lại 1 lần.
        timerRef.current = setTimeout(() => {
          fetchBrand()
            .then((b) => setBrand(b))
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

  const value = useMemo<BrandCtx>(() => ({ brand, loading, refresh }), [brand, loading, refresh]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandCtx {
  const c = useContext(BrandContext);
  if (!c) throw new Error('useBrand phải dùng trong BrandProvider');
  return c;
}
