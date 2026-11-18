'use strict';

/**
 * brandSettings.js — schema + gia tri mac dinh + validate cho cai dat
 * thuong hieu (brand) cua app: ten, tagline, logo (emoji hoac anh).
 * Quan tri tu web admin, luu trong bang brand_settings, app hoc vien doc
 * cong khai luc mo app (GET /api/brand) — doi thuong hieu khong can
 * deploy lai code.
 *
 * Luu tru: moi la (leaf) la 1 dong trong brand_settings (key = duong dan
 * cham, value = JSON). Vi du: key `brand.name`, value `"ANHANH"`.
 * Cung mau voi app_settings (xem uiSettings.js).
 */

const DEFAULTS = Object.freeze({
  name: 'ANHANH',
  tagline: 'Luyện TOEIC • IELTS mỗi ngày',
  logoType: 'emoji',
  logoEmoji: '🌸',
  logoUrl: '',
});

const BRAND_KEYS = Object.freeze([
  'brand.name',
  'brand.tagline',
  'brand.logoType',
  'brand.logoEmoji',
  'brand.logoUrl',
]);

function getDefault(key) {
  const field = key.startsWith('brand.') ? key.slice('brand.'.length) : key;
  return DEFAULTS[field];
}

function isValidUrl(v) {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Validate 1 key rieng le. Tra ve null neu hop le, neu khong tra ly do. */
function validateBrandSetting(key, value) {
  switch (key) {
    case 'brand.name':
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 30) {
        return 'brand.name phai la chuoi 1-30 ky tu (khong duoc de trong)';
      }
      return null;
    case 'brand.tagline':
      if (typeof value !== 'string' || value.length > 80) {
        return 'brand.tagline phai la chuoi 0-80 ky tu';
      }
      return null;
    case 'brand.logoType':
      if (value !== 'emoji' && value !== 'image') {
        return "brand.logoType phai la 'emoji' hoac 'image'";
      }
      return null;
    case 'brand.logoEmoji':
      if (typeof value !== 'string' || [...value].length < 1 || [...value].length > 10) {
        return 'brand.logoEmoji phai la 1-10 ky tu';
      }
      return null;
    case 'brand.logoUrl':
      if (typeof value !== 'string' || value.length > 500 || (value !== '' && !isValidUrl(value))) {
        return 'brand.logoUrl phai de trong hoac la URL http(s) hop le, toi da 500 ky tu';
      }
      return null;
    default:
      return `key khong duoc phep: ${key}`;
  }
}

/** Gop 1 tai lieu (co the thieu/sai) ve day du + hop le, sai cho nao ve mac dinh cho do. */
function normalizeBrand(input) {
  const src = input && typeof input === 'object' ? input : {};
  const doc = {
    name: src.name,
    tagline: src.tagline,
    logoType: src.logoType,
    logoEmoji: src.logoEmoji,
    logoUrl: src.logoUrl,
  };
  const flat = flattenBrand(doc);
  for (const key of BRAND_KEYS) {
    if (validateBrandSetting(key, flat[key]) !== null) flat[key] = getDefault(key);
  }
  return unflattenBrand(flat);
}

/** Tai lieu long -> map phang {key: value}. */
function flattenBrand(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  return {
    'brand.name': d.name,
    'brand.tagline': d.tagline,
    'brand.logoType': d.logoType,
    'brand.logoEmoji': d.logoEmoji,
    'brand.logoUrl': d.logoUrl,
  };
}

function unflattenBrand(flat) {
  const f = flat && typeof flat === 'object' ? flat : {};
  return {
    name: f['brand.name'],
    tagline: f['brand.tagline'],
    logoType: f['brand.logoType'],
    logoEmoji: f['brand.logoEmoji'],
    logoUrl: f['brand.logoUrl'],
  };
}

/** Map phang mac dinh (dung cho seed). */
function defaultFlatBrand() {
  const out = {};
  for (const key of BRAND_KEYS) out[key] = getDefault(key);
  return out;
}

module.exports = {
  DEFAULTS,
  BRAND_KEYS,
  validateBrandSetting,
  normalizeBrand,
  flattenBrand,
  unflattenBrand,
  defaultFlatBrand,
  getDefault,
};
