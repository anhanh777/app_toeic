'use strict';

/**
 * uiSettings.js — schema + gia tri mac dinh + validate cho cai dat giao dien
 * dong (scope C): phong cach giao dien + hieu ung loading + co chu co so
 * + mau chu dao, quan tri tu web admin, luu trong bang app_settings, ca 2
 * app (hoc vien + admin) doc dong luc chay — doi cai dat khong can deploy
 * lai code.
 *
 * MO HINH (2026-11-20): moi phong cach giao dien la 1 khoi rieng
 * `ui.styles.<id> = { accent, loading }` — mau chu dao + hieu ung loading
 * rieng tung kieu (hieu ung tung cho, toc do, cau cho, vi tri, anh dong).
 * `ui.style` chon kieu dang dung; app ap mau + loading cua kieu do.
 *
 * REGISTRY (`STYLE_REGISTRY`): 1 cho duy nhat dinh nghia cac kieu giao
 * dien (id, ten, mo ta, mau + loading mac dinh). Them kieu moi sau nay =
 * them 1 entry vao registry (kem 1 khoi token CSS [data-style="<id>"] o
 * web + 1 palette o mobile) — khong sua logic chon/ap/validate/seed.
 *
 * TUONG THICH NGUOC: `ui.accent` + `ui.loading` cu VAN DUOC LUU (fallback
 * cho client cu chua biet `styles`). PUT doc cu (khong co `styles`) thi
 * giu nguyen `styles` trong DB, khong reset. Seed/migrate: `pastel.accent`
 * lay theo `ui.accent` hien co trong DB (mau co ay da luu); loading moi
 * kieu lay theo `ui.loading` chung hien co; `lively.accent` mac dinh
 * #58CC02.
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
 * cham, value = JSON). Vi du: key `ui.styles.pastel.accent`, value `"#5B9E4D"`.
 */

/** Hieu ung loading da cai san trong ca 2 app (CSS o index.css moi app).
 * 6 hieu ung dau luon co san trong luoi chon; 6 hieu ung sau (EXTRA) chi
 * hien khi admin bam "+ Them hieu ung" (luu trong `ui.loading.extraEffects`).
 * 'none' = trong: khong hien hieu ung gi (LoadingLine tra ve null). */
const EFFECTS = Object.freeze({
  none: Object.freeze({ label: 'Trống', locations: ['loginButton', 'page', 'table'] }),
  spinner: Object.freeze({ label: 'Vòng xoay', locations: ['loginButton', 'page', 'table'] }),
  'dual-ring': Object.freeze({ label: 'Vòng kép', locations: ['loginButton', 'page', 'table'] }),
  'bouncing-dots': Object.freeze({ label: 'Ba chấm nảy', locations: ['loginButton', 'page', 'table'] }),
  skeleton: Object.freeze({ label: 'Skeleton (khung mờ)', locations: ['loginButton', 'page', 'table'] }),
  'progress-bar': Object.freeze({ label: 'Thanh tiến trình', locations: ['loginButton', 'page', 'table'] }),
  ripple: Object.freeze({ label: 'Vòng lan tỏa', locations: ['loginButton', 'page', 'table'] }),
  equalizer: Object.freeze({ label: 'Thanh nhảy', locations: ['loginButton', 'page', 'table'] }),
  orbit: Object.freeze({ label: 'Chấm xoay quanh', locations: ['loginButton', 'page', 'table'] }),
  pulse: Object.freeze({ label: 'Chấm đập', locations: ['loginButton', 'page', 'table'] }),
  wave: Object.freeze({ label: 'Sóng chấm', locations: ['loginButton', 'page', 'table'] }),
  flip: Object.freeze({ label: 'Ô vuông lật', locations: ['loginButton', 'page', 'table'] }),
});

const EFFECT_IDS = Object.keys(EFFECTS);

/** 6 hieu ung them duoc (khong co san trong luoi — admin them tay). */
const EXTRA_EFFECT_IDS = Object.freeze(['ripple', 'equalizer', 'orbit', 'pulse', 'wave', 'flip']);

/** 6 hieu ung mac dinh, luon co trong luoi chon. */
const DEFAULT_EFFECT_IDS = Object.freeze(['none', 'spinner', 'dual-ring', 'bouncing-dots', 'skeleton', 'progress-bar']);

/** Cac truong cua 1 khoi loading (chung + rieng tung kieu). */
const LOADING_FIELDS = Object.freeze([
  'loginButton',
  'page',
  'table',
  'speed',
  'text',
  'position',
  'image',
  'imageUrl',
]);

/** Loading mac dinh cua 1 kieu (cung la mac dinh cua `ui.loading` cu).
 * `extraEffects` la danh sach global (dung chung ca 2 kieu): cac hieu ung
 * them tay da them vao luoi chon — mac dinh rong. */
const DEFAULT_LOADING = Object.freeze({
  loginButton: 'spinner',
  page: 'spinner',
  table: 'skeleton',
  speed: 1,
  text: 'Máy chủ đang khởi động, chờ một chút nhé…',
  position: 'center',
  image: 'none',
  imageUrl: '',
  extraEffects: Object.freeze([]),
});

/**
 * Registry cac kieu giao dien — THEM KIEU MOI = them 1 entry o day.
 * `defaultLoading` dung chung 1 khoi mac dinh cho moi kieu; neu kieu moi
 * muon loading mac dinh khac thi truyen object rieng o day.
 */
const STYLE_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'pastel',
    name: 'Pastel nhẹ nhàng',
    desc: 'Giao diện hiện tại: nền kem ấm, thẻ trắng, màu sage dịu.',
    defaultAccent: '#5FA8A0',
    defaultLoading: DEFAULT_LOADING,
  }),
  Object.freeze({
    id: 'lively',
    name: 'Sống động',
    desc: 'Kiểu Duolingo: xanh lá tươi, nút nổi, gamified (streak, xu, nhiệm vụ).',
    defaultAccent: '#58CC02',
    defaultLoading: DEFAULT_LOADING,
  }),
]);

const STYLE_IDS = Object.freeze(STYLE_REGISTRY.map((s) => s.id));

/** Tin nhan mac dinh khi app bao tri (admin sua duoc o trang Cai dat giao dien). */
const DEFAULT_MAINTENANCE_MESSAGE = 'App đang bảo trì, quay lại sau ít phút nhé!';

const DEFAULTS = Object.freeze({
  ui: Object.freeze({
    style: 'pastel',
    accent: '#5FA8A0',
    fontScale: 1,
    loading: DEFAULT_LOADING,
    styles: Object.freeze(
      Object.fromEntries(
        STYLE_REGISTRY.map((s) =>
          [s.id, Object.freeze({ accent: s.defaultAccent, loading: s.defaultLoading })]
        ),
      ),
    ),
  }),
  /** Bao tri: app hoc vien hien man hinh bao tri thay vi du lieu khi bat.
   * `enabled` — bat/tat; `message` — cau hien cho nguoi hoc; `auto` —
   * true khi he thong tu bat sau khi DB bi xoa va dang nap lai (de phan
   * biet voi admin bat tay). Mac dinh tat. */
  maintenance: Object.freeze({
    enabled: false,
    message: DEFAULT_MAINTENANCE_MESSAGE,
    auto: false,
  }),
});

function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function isNumberIn(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

function isHttpUrl(v) {
  return typeof v === 'string' && v.length <= 500 && (v === '' || /^https?:\/\/\S+$/.test(v));
}

/** Validate 1 truong loading. Tra ve null neu hop le, neu khong tra ly do. */
function validateLoadingField(field, value) {
  const effectList = EFFECT_IDS.join(', ');
  switch (field) {
    case 'loginButton':
      if (!EFFECTS[value] || !EFFECTS[value].locations.includes('loginButton')) {
        return `loginButton phai la mot trong: ${effectList}`;
      }
      return null;
    case 'page':
      if (!EFFECTS[value] || !EFFECTS[value].locations.includes('page')) {
        return `page phai la mot trong: ${effectList}`;
      }
      return null;
    case 'table':
      if (!EFFECTS[value] || !EFFECTS[value].locations.includes('table')) {
        return `table phai la mot trong: ${effectList}`;
      }
      return null;
    case 'extraEffects':
      if (!Array.isArray(value)) return 'extraEffects phai la mot mang';
      if (value.length > EXTRA_EFFECT_IDS.length) {
        return `extraEffects toi da ${EXTRA_EFFECT_IDS.length} hieu ung`;
      }
      if (new Set(value).size !== value.length) return 'extraEffects khong duoc trung nhau';
      if (value.some((id) => !EXTRA_EFFECT_IDS.includes(id))) {
        return `extraEffects chi duoc chua: ${EXTRA_EFFECT_IDS.join(', ')}`;
      }
      return null;
    case 'speed':
      if (!isNumberIn(value, 0.5, 2)) return 'speed phai la so tu 0.5 den 2';
      return null;
    case 'text':
      if (typeof value !== 'string' || !value.trim() || value.length > 120) {
        return 'text phai la chuoi 1-120 ky tu';
      }
      return null;
    case 'position':
      if (value !== 'center' && value !== 'top') return "position phai la 'center' hoac 'top'";
      return null;
    case 'image':
      if (value !== 'none' && value !== 'mascot' && value !== 'custom') {
        return "image phai la 'none', 'mascot' hoac 'custom'";
      }
      return null;
    case 'imageUrl':
      if (!isHttpUrl(value)) return "imageUrl phai la '' hoac URL http(s) toi da 500 ky tu";
      return null;
    default:
      return `truong loading khong duoc phep: ${field}`;
  }
}

/** Validate 1 key rieng le. Tra ve null neu hop le, neu khong tra ly do. */
function validateSetting(key, value) {
  switch (key) {
    case 'maintenance.enabled':
      if (typeof value !== 'boolean') return 'maintenance.enabled phai la boolean';
      return null;
    case 'maintenance.auto':
      if (typeof value !== 'boolean') return 'maintenance.auto phai la boolean';
      return null;
    case 'maintenance.message':
      if (typeof value !== 'string' || !value.trim() || value.length > 200) {
        return 'maintenance.message phai la chuoi 1-200 ky tu';
      }
      return null;
    case 'ui.style':
      if (!STYLE_IDS.includes(value)) return `ui.style phai la mot trong: ${STYLE_IDS.join(', ')}`;
      return null;
    case 'ui.accent':
      if (!isHexColor(value)) return 'ui.accent phai la mau hex dang #RRGGBB';
      return null;
    case 'ui.fontScale':
      if (!isNumberIn(value, 0.9, 1.15)) return 'ui.fontScale phai la so tu 0.9 den 1.15';
      return null;
    default: {
      // Loading cu (chi 5 key cu duoc luu o DB; position/image/imageUrl cua
      // `ui.loading` khong co dong rieng — doc ve mac dinh khi thieu).
      // `ui.loading.extraEffects` la key rieng: danh sach hieu ung them tay.
      if (key.startsWith('ui.loading.')) {
        const field = key.slice('ui.loading.'.length);
        if (!['loginButton', 'page', 'table', 'speed', 'text', 'extraEffects'].includes(field)) {
          return `key khong duoc phep: ${key}`;
        }
        return validateLoadingField(field, value);
      }
      // Loading + accent rieng tung kieu: ui.styles.<id>.accent / .loading.<field>
      const m = key.match(/^ui\.styles\.([A-Za-z0-9_-]+)\.(.+)$/);
      if (m) {
        const [, id, rest] = m;
        if (!STYLE_IDS.includes(id)) return `kieu giao dien khong co: ${id}`;
        if (rest === 'accent') {
          if (!isHexColor(value)) return `ui.styles.${id}.accent phai la mau hex dang #RRGGBB`;
          return null;
        }
        if (rest.startsWith('loading.')) {
          return validateLoadingField(rest.slice('loading.'.length), value);
        }
        return `key khong duoc phep: ${key}`;
      }
      return `key khong duoc phep: ${key}`;
    }
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
  'ui.loading.extraEffects',
  'maintenance.enabled',
  'maintenance.message',
  'maintenance.auto',
  ...STYLE_REGISTRY.flatMap((s) => [
    `ui.styles.${s.id}.accent`,
    ...LOADING_FIELDS.map((f) => `ui.styles.${s.id}.loading.${f}`),
  ]),
]);

function getDefault(key) {
  const parts = key.split('.');
  let cur = DEFAULTS;
  for (const p of parts) cur = cur[p];
  return cur;
}

function validEffectFor(v, location) {
  return typeof v === 'string' && EFFECTS[v] && EFFECTS[v].locations.includes(location);
}

/** Loc danh sach hieu ung them tay ve hop le: chi id them duoc, khong
 * trung, toi da 6. Gia tri sai/thieu -> mang rong. */
function normalizeExtraEffects(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const id of v) {
    if (typeof id === 'string' && EXTRA_EFFECT_IDS.includes(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, EXTRA_EFFECT_IDS.length);
}

/** Gop 1 khoi loading (co the thieu/sai) ve day du + hop le. */
function normalizeLoading(ld, defaults) {
  const src = ld && typeof ld === 'object' ? ld : {};
  const text =
    typeof src.text === 'string' && src.text.trim() && src.text.length <= 120
      ? src.text
      : defaults.text;
  return {
    loginButton: validEffectFor(src.loginButton, 'loginButton') ? src.loginButton : defaults.loginButton,
    page: validEffectFor(src.page, 'page') ? src.page : defaults.page,
    table: validEffectFor(src.table, 'table') ? src.table : defaults.table,
    speed: isNumberIn(src.speed, 0.5, 2) ? src.speed : defaults.speed,
    text,
    position: src.position === 'center' || src.position === 'top' ? src.position : defaults.position,
    image:
      src.image === 'none' || src.image === 'mascot' || src.image === 'custom'
        ? src.image
        : defaults.image,
    imageUrl: isHttpUrl(src.imageUrl) ? src.imageUrl : defaults.imageUrl,
    extraEffects: normalizeExtraEffects(src.extraEffects),
  };
}

/** Gop 1 khoi bao tri (co the thieu/sai) ve day du + hop le. */
function normalizeMaintenance(input) {
  const src = input && typeof input === 'object' ? input : {};
  const message =
    typeof src.message === 'string' && src.message.trim() && src.message.length <= 200
      ? src.message
      : DEFAULT_MAINTENANCE_MESSAGE;
  return {
    enabled: src.enabled === true,
    message,
    auto: src.auto === true,
  };
}

/** Gop 1 tai lieu (co the thieu/sai) ve day du + hop le, sai cho nao ve mac dinh cho do. */
function normalizeSettings(input) {
  const src = input && typeof input === 'object' ? input : {};
  const ui = src.ui && typeof src.ui === 'object' ? src.ui : {};
  const loading = ui.loading && typeof ui.loading === 'object' ? ui.loading : {};
  const stylesIn = ui.styles && typeof ui.styles === 'object' ? ui.styles : {};
  const styles = {};
  for (const s of STYLE_REGISTRY) {
    const st = stylesIn[s.id] && typeof stylesIn[s.id] === 'object' ? stylesIn[s.id] : {};
    styles[s.id] = {
      accent: isHexColor(st.accent) ? st.accent : s.defaultAccent,
      loading: normalizeLoading(st.loading, s.defaultLoading),
    };
  }
  const doc = {
    ui: {
      style: ui.style,
      accent: ui.accent,
      fontScale: ui.fontScale,
      loading: normalizeLoading(loading, DEFAULT_LOADING),
      styles,
    },
    maintenance: normalizeMaintenance(src.maintenance),
  };
  const flat = flattenSettings(doc);
  for (const key of SETTING_KEYS) {
    if (validateSetting(key, flat[key]) !== null) flat[key] = getDefault(key);
  }
  return unflattenSettings(flat);
}

/**
 * Tai lieu long -> map phang {key: value}.
 * `styles` chi ghi key cua kieu CO TRONG doc — doc cu (khong co styles)
 * PUT len thi khong dong den `styles` trong DB.
 */
function flattenSettings(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const ui = d.ui && typeof d.ui === 'object' ? d.ui : {};
  const loading = ui.loading && typeof ui.loading === 'object' ? ui.loading : {};
  const flat = {
    'ui.style': ui.style,
    'ui.accent': ui.accent,
    'ui.fontScale': ui.fontScale,
    'ui.loading.loginButton': loading.loginButton,
    'ui.loading.page': loading.page,
    'ui.loading.table': loading.table,
    'ui.loading.speed': loading.speed,
    'ui.loading.text': loading.text,
    'ui.loading.extraEffects': loading.extraEffects,
  };
  const styles = ui.styles && typeof ui.styles === 'object' ? ui.styles : {};
  for (const s of STYLE_REGISTRY) {
    const st = styles[s.id];
    if (!st || typeof st !== 'object') continue;
    flat[`ui.styles.${s.id}.accent`] = st.accent;
    const ld = st.loading && typeof st.loading === 'object' ? st.loading : {};
    for (const f of LOADING_FIELDS) flat[`ui.styles.${s.id}.loading.${f}`] = ld[f];
  }
  // Bao tri: chi ghi key khi doc co khoi maintenance — doc cu (khong co
  // maintenance) PUT len thi khong dong den maintenance trong DB.
  const mt = d.maintenance && typeof d.maintenance === 'object' ? d.maintenance : null;
  if (mt) {
    flat['maintenance.enabled'] = mt.enabled;
    flat['maintenance.message'] = mt.message;
    flat['maintenance.auto'] = mt.auto;
  }
  return flat;
}

function unflattenSettings(flat) {
  const f = flat && typeof flat === 'object' ? flat : {};
  const styles = {};
  for (const s of STYLE_REGISTRY) {
    const ld = {};
    for (const fld of LOADING_FIELDS) ld[fld] = f[`ui.styles.${s.id}.loading.${fld}`];
    styles[s.id] = { accent: f[`ui.styles.${s.id}.accent`], loading: ld };
  }
  return {
    ui: {
      style: f['ui.style'],
      accent: f['ui.accent'],
      fontScale: f['ui.fontScale'],
      loading: {
        loginButton: f['ui.loading.loginButton'],
        page: f['ui.loading.page'],
        table: f['ui.loading.table'],
        speed: f['ui.loading.speed'],
        text: f['ui.loading.text'],
        position: f['ui.loading.position'],
        image: f['ui.loading.image'],
        imageUrl: f['ui.loading.imageUrl'],
        extraEffects: f['ui.loading.extraEffects'],
      },
      styles,
    },
    maintenance: {
      enabled: f['maintenance.enabled'],
      message: f['maintenance.message'],
      auto: f['maintenance.auto'],
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
  DEFAULT_MAINTENANCE_MESSAGE,
  EFFECTS,
  EFFECT_IDS,
  EXTRA_EFFECT_IDS,
  DEFAULT_EFFECT_IDS,
  LOADING_FIELDS,
  STYLE_REGISTRY,
  STYLE_IDS,
  SETTING_KEYS,
  validateSetting,
  normalizeSettings,
  flattenSettings,
  unflattenSettings,
  defaultFlatSettings,
  getDefault,
};
