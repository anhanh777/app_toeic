'use strict';

/**
 * backup-lib.js — helper dung chung cho 2 script cron backup/restore:
 * doc admin token, goi API backend (co cho Render cold-start), goi
 * hatch_gws_cli de lam viec voi Google Drive.
 *
 * KHONG commit token: token chi doc tu file o runtime (env ADMIN_TOKEN_FILE).
 * KHONG chay truc tiep — duoc require() tu backup-to-drive.js / restore-watch.js.
 *
 * TU LAM MOI TOKEN (2026-11-19): token admin la JWT 7 ngay; het han thi
 * API tra 401. Cac ham *Auto (apiGetBackupAuto / apiPostRestoreAuto) gap
 * 401 thi tu dang nhap lai bang tai khoan demo admin, ghi token moi vao
 * file roi thu lai 1 lan — cron khong can ai cap tay nua. Chi thu lai
 * dung 1 lan de tranh lap vo han khi sai mat khau.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const GWS_CLI = process.env.GWS_CLI || '/opt/hatch/bin/hatch_gws_cli';
const DRIVE_FOLDER_NAME = process.env.DRIVE_FOLDER_NAME || 'app-toeic-backups';
const API_BASE = (process.env.API_BASE || 'https://app-toeic-backend.onrender.com').replace(/\/$/, '');
const TOKEN_FILE =
  process.env.ADMIN_TOKEN_FILE ||
  path.join(os.homedir(), 'workspace', 'drive-ets', 'token-admin.txt');

// Tai khoan dung de tu cap lai token khi het han (tai khoan demo admin
// co san trong seed; chi dung cho 2 script cron nay).
const ADMIN_LOGIN_EMAIL = process.env.BACKUP_ADMIN_EMAIL || 'demo@toeic.app';
const ADMIN_LOGIN_PASSWORD = process.env.BACKUP_ADMIN_PASSWORD || 'admin123';

const DEMO_EMAILS = ['demo@toeic.app', 'user@toeic.app'];

function countUserRows(userData) {
  return Object.values(userData || {}).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0
  );
}

/**
 * Tai khoan co trong backup nhung khong con tren live, va tai khoan that
 * (khong phai demo) dang co tren live.
 */
function findMissingAccounts(liveUserData, backupUserData) {
  const liveEmails = new Set(
    ((liveUserData && liveUserData.users) || []).map((u) => u.email).filter(Boolean)
  );
  const backupEmails = ((backupUserData && backupUserData.users) || [])
    .map((u) => u.email)
    .filter(Boolean);
  const missing = backupEmails.filter((e) => !liveEmails.has(e));
  const liveNonDemo = [...liveEmails].filter((e) => !DEMO_EMAILS.includes(e));
  return { missing, liveNonDemo };
}

/**
 * Live co phai dang "bi xoa mot phan" khong: chi con tai khoan demo,
 * trong khi ban backup van giu tai khoan that (khong phai demo) da bien
 * mat khoi live.
 *
 * Truong hop gap that 2026-11-19: live bi wipe roi co nguoi dung demo
 * luyen tiep (attempts 9->11) nen looksWiped() ket luan "live co du lieu"
 * va tu choi khoi phuc, trong khi tai khoan a@gmail.com da mat. Chi
 * duoc dung de QUYET DINH KHOI PHUC / BO QUA BACKUP — khong thay the
 * looksWiped().
 *
 * An toan: chi tra ve true khi live KHONG con tai khoan that nao. Neu
 * admin xoa 1 tai khoan trong khi van con tai khoan that khac thi khong
 * tu khoi phuc (tranh hoi sinh tai khoan vua xoa co y). Truong hop duy
 * nhat van co the hoi sinh: admin xoa dung tai khoan that duy nhat —
 * nhung xoa chinh minh da bi chan o backend, va truong hop do hiem hon
 * nhieu so voi wipe.
 */
function isPartialWipe(liveUserData, backupUserData) {
  if (countUserRows(backupUserData) <= 2) {
    return { partial: false, reason: 'ban backup khong co du lieu nguoi dung that' };
  }
  const { missing, liveNonDemo } = findMissingAccounts(liveUserData, backupUserData);
  const missingReal = missing.filter((e) => !DEMO_EMAILS.includes(e));
  if (!missingReal.length) {
    return { partial: false, reason: 'live khong thieu tai khoan that nao so voi backup' };
  }
  if (liveNonDemo.length) {
    return {
      partial: false,
      reason:
        `live thieu ${missingReal.join(',')} nhung van con tai khoan that khac ` +
        `(${liveNonDemo.join(',')}) — khong tu khoi phuc`,
    };
  }
  return {
    partial: true,
    reason: `live thieu tai khoan that: ${missingReal.join(',')} (chi con demo)`,
  };
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function readAdminToken() {
  const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  if (!token) throw new Error(`admin token rong: ${TOKEN_FILE}`);
  return token;
}

/** Cho backend khoi dong (Render free tier ngu thi mat ~1 phut de day). */
async function waitForBackend({ tries = 30, delayMs = 10000 } = {}) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        log(`backend san sang (${API_BASE}) sau ${i} lan thu.`);
        return;
      }
      log(`cho backend... lan ${i}/${tries} (HTTP ${res.status})`);
    } catch (err) {
      log(`cho backend... lan ${i}/${tries} (${err.message})`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`backend khong phan hoi sau ${tries} lan thu: ${API_BASE}`);
}

async function apiGetBackup(token) {
  const res = await fetch(`${API_BASE}/api/admin/backup`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`GET /api/admin/backup -> HTTP ${res.status}`);
  return res.json();
}

async function apiPostRestore(token, backupDoc) {
  const res = await fetch(`${API_BASE}/api/admin/restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(backupDoc),
    signal: AbortSignal.timeout(120000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`POST /api/admin/restore -> HTTP ${res.status}: ${body.error || 'loi khong ro'}`);
  }
  return body;
}

/** Loi 401 (token het han / khong hop le) co nhan ra tu message khong? */
function isAuthError(err) {
  return err && typeof err.message === 'string' && err.message.includes('HTTP 401');
}

/**
 * Dang nhap lai bang tai khoan demo admin, ghi token moi vao file.
 * Chi ghi file SAU KHI dang nhap thanh cong va co token — dang nhap
 * that bai thi file token cu duoc giu nguyen de nguoi kiem tra sau.
 */
async function loginAdmin() {
  log('token het han — dang nhap lai bang tai khoan demo admin de cap token moi...');
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_LOGIN_EMAIL, password: ADMIN_LOGIN_PASSWORD }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) {
    throw new Error(
      `dang nhap lai admin that bai (HTTP ${res.status}): ${body.error || 'khong co token'}`
    );
  }
  fs.writeFileSync(TOKEN_FILE, `${body.token}\n`, { mode: 0o600 });
  log('da cap token admin moi va ghi vao file.');
  return body.token;
}

/** Doc token hien co; neu file thieu/rong thi tra null de cap moi. */
function getTokenOrNull() {
  try {
    return readAdminToken();
  } catch (err) {
    log(`khong doc duoc token cu (${err.message}) — cap moi.`);
    return null;
  }
}

/** GET /api/admin/backup, tu cap lai token khi gap 401 roi thu lai 1 lan. */
async function apiGetBackupAuto() {
  let token = getTokenOrNull();
  if (!token) token = await loginAdmin();
  try {
    return await apiGetBackup(token);
  } catch (err) {
    if (!isAuthError(err)) throw err;
    log('GET /api/admin/backup -> 401, thu lai voi token moi...');
    return apiGetBackup(await loginAdmin());
  }
}

/** POST /api/admin/restore, tu cap lai token khi gap 401 roi thu lai 1 lan. */
async function apiPostRestoreAuto(backupDoc) {
  let token = getTokenOrNull();
  if (!token) token = await loginAdmin();
  try {
    return await apiPostRestore(token, backupDoc);
  } catch (err) {
    if (!isAuthError(err)) throw err;
    log('POST /api/admin/restore -> 401, thu lai voi token moi...');
    return apiPostRestore(await loginAdmin(), backupDoc);
  }
}

async function apiPutSetting(token, key, value) {
  const res = await fetch(`${API_BASE}/api/admin/settings`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`PUT /api/admin/settings -> HTTP ${res.status}: ${body.error || 'loi khong ro'}`);
  }
  return body;
}

/** PUT /api/admin/settings {key, value}, tu cap lai token khi gap 401 roi thu lai 1 lan. */
async function apiPutSettingAuto(key, value) {
  let token = getTokenOrNull();
  if (!token) token = await loginAdmin();
  try {
    return await apiPutSetting(token, key, value);
  } catch (err) {
    if (!isAuthError(err)) throw err;
    log('PUT /api/admin/settings -> 401, thu lai voi token moi...');
    return apiPutSetting(await loginAdmin(), key, value);
  }
}

/* ---------------- Google Drive (qua hatch_gws_cli) ---------------- */

function drive(args) {
  const out = execFileSync(GWS_CLI, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const text = (out || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Tim thu muc theo ten o Drive root (chi file chua bi xoa). */
function findFolderByName(name) {
  const q =
    `name = '${name.replace(/'/g, "\\'")}'` +
    ` and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = drive([
    'drive',
    'files',
    'list',
    '--params',
    JSON.stringify({ q, fields: 'files(id,name,mimeType,createdTime)' }),
  ]);
  const files = (res && res.files) || [];
  return files[0] || null;
}

function ensureFolder(name) {
  const found = findFolderByName(name);
  if (found) return found;
  log(`chua co thu muc Drive "${name}" — tao moi.`);
  const created = drive([
    'drive',
    'files',
    'create',
    '--json',
    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  ]);
  if (!created || !created.id) {
    throw new Error(`tao thu muc Drive "${name}" that bai: ${JSON.stringify(created)}`);
  }
  return created;
}

function listFolderFiles(folderId) {
  const q = `'${folderId}' in parents and trashed = false`;
  const res = drive([
    'drive',
    'files',
    'list',
    '--params',
    JSON.stringify({ q, fields: 'files(id,name,mimeType,createdTime,size)', pageSize: 100 }),
  ]);
  return (res && res.files) || [];
}

function uploadFile(localPath, name, parentId) {
  const args = ['drive', '+upload', localPath, '--name', name];
  if (parentId) args.push('--parent', parentId);
  const res = drive(args);
  if (!res || !res.id) throw new Error(`upload ${name} that bai: ${JSON.stringify(res)}`);
  return res;
}

/**
 * Tai noi dung 1 file tren Drive ve duong dan dich.
 * Luu y: `files download` cua CLI CHI tra ve downloadUri (can Authorization
 * rieng de GET) — khong dung duoc truc tiep. Cach dung duoc: `files get`
 * voi alt=media, CLI in thang noi dung file ra stdout. CLI chen them key
 * "retrieved_at" vao JSON tra ve — bo di de file tai ve giong file goc.
 * (Chi dung cho file JSON backup.)
 */
function downloadFile(fileId, destPath) {
  const out = execFileSync(
    GWS_CLI,
    ['drive', 'files', 'get', '--params', JSON.stringify({ fileId, alt: 'media' })],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const text = (out || '').trim();
  if (!text) throw new Error(`tai file ${fileId} that bai: noi dung rong`);
  let content = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      delete parsed.retrieved_at;
      content = JSON.stringify(parsed, null, 1);
    }
  } catch {
    /* khong phai JSON — giu nguyen text */
  }
  fs.writeFileSync(destPath, content);
  return destPath;
}

function deleteDriveFile(fileId) {
  drive(['drive', 'files', 'delete', '--params', JSON.stringify({ fileId })]);
}

module.exports = {
  DRIVE_FOLDER_NAME,
  API_BASE,
  DEMO_EMAILS,
  log,
  readAdminToken,
  waitForBackend,
  apiGetBackup,
  apiPostRestore,
  loginAdmin,
  apiGetBackupAuto,
  apiPostRestoreAuto,
  apiPutSettingAuto,
  countUserRows,
  findMissingAccounts,
  isPartialWipe,
  findFolderByName,
  ensureFolder,
  listFolderFiles,
  uploadFile,
  downloadFile,
  deleteDriveFile,
};
