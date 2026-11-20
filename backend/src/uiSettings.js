'use strict';

/**
 * uiSettings.js — schema + gia tri mac dinh + validate cho cai dat giao dien
 * dong (scope C): phong cach giao dien + hieu ung loading + co chu co so
 * + mau chu dao, quan tri tu web admin, luu trong bang app_settings, ca 2
 * app (hoc vien + admin) doc dong luc chay — doi cai dat khong can deploy
 * lai code.
 *
 * Phong cach giao dien (`ui.style`): 'pastel' (mac dinh, Pastel nhe nhang)
 * hoac 'lively' (Song dong, kieu Duolingo). Admin doi bang nut gat trong
 * trang Cai dat giao dien; app ap dung theo gia tri nay luc mo app.
 *
 * NGUYEN TAC CO CHU (quan trong):
 * - `ui.fontScale` chi la CO CHU CO SO / mac dinh cua app. Nguoi hoc van
 *   tu chon co chu rieng bang nut 🔠 (localStorage `app_text_size`, muc
 *   0-3 = Nho/Vua/Lon/Rat lon qua `useTextSize`); co chu hieu dung =
 *   fontScale (admin) x he so muc cua nguoi hoc. Code cai dat KHONG BAO GIO
 *   doc/ghi/xoa `app_text_size` — lua chon cua nguoi hoc khong bao gio bi
 *   cai dat admin ghi de hay reset.
 * - Hieu ung chi dung nhung id da co san trong app (xem EFFECTS): khong
 *   tu dat ten hieu ung moi o day neu app chua ve no.
 * - Gia tri khong hop le / thieu -> roi ve mac dinh trong code, khong bao
 *   gio lam app crash. Mac dinh cung nam trong code (seed chi chen vao DB
 *   khi thieu) de Render free-tier reseed van khoi phuc duoc.
 *
 * Luu tru: moi la (leaf) la 1 dong trong app_settings (key = duong dan
 * cham, value = JSON). Vi du: key `ui.accent`, value `"#5FA8A0"`.
 */

const DEFAULTS = Object.freeze({
  ui: Object.freeze({
    style: 'pastel',
    accent: '#5FA8A0',
    fontScale: 1,
    loading: Object.freeze({
      loginButton: 'spinner',
      page: 'spinner',
      table: 'skeleton',
      speed: 1,
      text: 'Máy chủ đang khởi động, chờ một chút nhé…',
    }),
  }),
});

/** Hieu ung loading da cai san trong ca 2 app (CSS o index.css moi app). */
const EFFECTS = Object.freeze({
  spinner: Object.freeze({ label: 'Vòng xoay', locations: ['loginButton', 'page', 'table'] }),
  'dual-ring': Object.freeze({ label: 'Vòng kép', locations: ['loginButton', 'page'] }),
  'bouncing-dots': Object.freeze({ label: 'Ba chấm nảy', locations: ['loginButton', 'page', 'table'] }),
  skeleton: Object.freeze({ label: 'Skeleton (khung mờ)', locations: ['table'] }),
  'progress-bar': Object.freeze({ label: 'Thanh tiến trình', locations: ['page'] }),
});

const EFFECT_IDS = Object.keys(EFFECTS);

function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function isNumberIn(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

/** Validate 1 key rieng le. Tra ve null neu hop le, neu khong tra ly do. */
function validateSetting(key, value) {
  switch (key) {
    case 'ui.style':
      if (value !== 'pastel' && value !== 'lively') return "ui.style phai la 'pastel' hoac 'lively'";
      return null;
    case 'ui.accent':
      if (!isHexColor(value)) return 'ui.accent phai la mau hex dang #RRGGBB';
      return null;
    case 'ui.fontScale':
      if (!isNumberIn(value, 0.9, 1.15)) return 'ui.fontScale phai la so tu 0.9 den 1.15';
      return null;
    case 'ui.loading.loginButton':
      if (!EFFECTS[value] || !EFFECTS[value].locations.includes('loginButton')) {
        return 'ui.loading.loginButton phai la mot trong: spinner, dual-ring, bouncing-dots';
      }
      return null;
    case 'ui.loading.page':
      if (!EFFECTS[value] || !EFFECTS[value].locations.includes('page')) {
        return 'ui.loading.page phai la mot trong: spinner, dual-ring, bouncing-dots, progress-bar';
      }
      return null;
    case 'ui.loading.table':
      if (!EFFECTS[value] || !EFFECTS[value].locations.includes('table')) {
        return 'ui.loading.table phai la mot trong: skeleton, spinner, bouncing-dots';
      }
      return null;
    case 'ui.loading.speed':
      if (!isNumberIn(value, 0.5, 2)) return 'ui.loading.speed phai la so tu 0.5 den 2';
      return null;
    case 'ui.loading.text':
      if (typeof value !== 'string' || !value.trim() || value.length > 120) {
        return 'ui.loading.text phai la chuoi 1-120 ky tu';
      }
      return null;
    default:
      return `key khong duoc phep: ${key}`;
  }
}

const SETTING_KEYS = Object.freeze([
  'ui.style',
  'ui.accent',
  'ui.fontScale',
  'ui.loading.loginButton',
  'ui.loading.page',
  'ui.loading.table',
  'ui.loading.speed',
  'ui.loading.text',
]);

function getDefault(key) {
  const parts = key.split('.');
  let cur = DEFAULTS;
  for (const p of parts) cur = cur[p];
  return cur;
}

/** Gop 1 tai lieu (co the thieu/sai) ve day du + hop le, sai cho nao ve mac dinh cho do. */
function normalizeSettings(input) {
  const src = input && typeof input === 'object' ? input : {};
  const ui = src.ui && typeof src.ui === 'object' ? src.ui : {};
  const loading = ui.loading && typeof ui.loading === 'object' ? ui.loading : {};
  const doc = {
    ui: {
      style: ui.style,
      accent: ui.accent,
      fontScale: ui.fontScale,
      loading: {
        loginButton: loading.loginButton,
        page: loading.page,
        table: loading.table,
        speed: loading.speed,
        text: loading.text,
      },
    },
  };
  const flat = flattenSettings(doc);
  for (const key of SETTING_KEYS) {
    if (validateSetting(key, flat[key]) !== null) flat[key] = getDefault(key);
  }
  return unflattenSettings(flat);
}

/** Tai lieu long -> map phang {key: value}. */
function flattenSettings(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const ui = d.ui && typeof d.ui === 'object' ? d.ui : {};
  const loading = ui.loading && typeof ui.loading === 'object' ? ui.loading : {};
  return {
    'ui.style': ui.style,
    'ui.accent': ui.accent,
    'ui.fontScale': ui.fontScale,
    'ui.loading.loginButton': loading.loginButton,
    'ui.loading.page': loading.page,
    'ui.loading.table': loading.table,
    'ui.loading.speed': loading.speed,
    'ui.loading.text': loading.text,
  };
}

function unflattenSettings(flat) {
  return {
    ui: {
      style: flat['ui.style'],
      accent: flat['ui.accent'],
      fontScale: flat['ui.fontScale'],
      loading: {
        loginButton: flat['ui.loading.loginButton'],
        page: flat['ui.loading.page'],
        table: flat['ui.loading.table'],
        speed: flat['ui.loading.speed'],
        text: flat['ui.loading.text'],
      },
    },
  };
}

/** Map phang mac dinh (dung cho seed). */
function defaultFlatSettings() {
  const out = {};
  for (const key of SETTING_KEYS) out[key] = getDefault(key);
  return out;
}

module.exports = {
  DEFAULTS,
  EFFECTS,
  EFFECT_IDS,
  SETTING_KEYS,
  validateSetting,
  normalizeSettings,
  flattenSettings,
  unflattenSettings,
  defaultFlatSettings,
  getDefault,
};
