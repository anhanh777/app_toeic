'use strict';

/**
 * menuIcons.js — schema + gia tri mac dinh + validate cho bieu tuong menu
 * (icon) cua app: moi muc menu chinh co 1 icon emoji do admin chon tu web
 * admin, luu trong bang menu_icons, app hoc vien doc cong khai luc mo app
 * (GET /api/menu-icons) — doi icon khong can deploy lai code.
 *
 * Luu tru: moi key menu la 1 dong trong menu_icons (key = ten muc menu,
 * value = JSON). Vi du: key `today`, value `"📅"`.
 * Cung mau voi brand_settings (xem brandSettings.js).
 */

const DEFAULTS = Object.freeze({
  today: '📅',
  practice: '✏️',
  mock: '⏱️',
  wrong: '❌',
  vocabulary: '📖',
  leaderboard: '🏆',
  settings: '⚙️',
  diagnostic: '🧭',
  errors: '🐉',
  writing: '✍️',
  speaking: '🎤',
  'ielts-setup': '📝',
});

const MENU_KEYS = Object.freeze([
  'today',
  'practice',
  'mock',
  'wrong',
  'vocabulary',
  'leaderboard',
  'settings',
  'diagnostic',
  'errors',
  'writing',
  'speaking',
  'ielts-setup',
]);

/** Nhan hien thi tieng Viet cua tung muc menu (dung o web admin). */
const LABELS = Object.freeze({
  today: 'Hôm nay',
  practice: 'Luyện tập',
  mock: 'Thi thử',
  wrong: 'Ôn câu sai',
  vocabulary: 'Từ vựng',
  leaderboard: 'Xếp hạng',
  settings: 'Hồ sơ & Cài đặt',
  diagnostic: 'Chẩn đoán IELTS',
  errors: 'Sổ lỗi & Quái vật',
  writing: 'Viết',
  speaking: 'Nói',
  'ielts-setup': 'Thiết lập IELTS',
});

function getDefault(key) {
  return DEFAULTS[key];
}

/** Validate 1 icon rieng le. Tra ve null neu hop le, neu khong tra ly do. */
function validateMenuIcon(key, value) {
  if (!MENU_KEYS.includes(key)) {
    return `key khong duoc phep: ${key}`;
  }
  // Dem theo code point (giong logoEmoji): ✏️ la 2 code point (✏ + VS16).
  if (typeof value !== 'string' || [...value].length < 1 || [...value].length > 10) {
    return `menu icon '${key}' phai la 1-10 ky tu`;
  }
  return null;
}

/** Gop 1 tai lieu (co the thieu/sai) ve day du + hop le, sai cho nao ve mac dinh cho do. */
function normalizeMenuIcons(input) {
  const src = input && typeof input === 'object' ? input : {};
  const doc = {};
  for (const key of MENU_KEYS) {
    doc[key] = validateMenuIcon(key, src[key]) === null ? src[key] : DEFAULTS[key];
  }
  return doc;
}

/** Tai lieu mac dinh (dung cho seed). */
function defaultMenuIcons() {
  return { ...DEFAULTS };
}

module.exports = {
  DEFAULTS,
  MENU_KEYS,
  LABELS,
  validateMenuIcon,
  normalizeMenuIcons,
  defaultMenuIcons,
  getDefault,
};
