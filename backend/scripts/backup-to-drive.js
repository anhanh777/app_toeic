'use strict';

/**
 * backup-to-drive.js — backup dinh ky du lieu nguoi dung len Google Drive.
 *
 * Chay bang cron (de xuat: moi gio):
 *   node backend/scripts/backup-to-drive.js
 *
 * Env (khong bat buoc): API_BASE (mac dinh backend Render),
 * ADMIN_TOKEN_FILE (mac dinh ~/workspace/drive-ets/token-admin.txt),
 * DRIVE_FOLDER_NAME (mac dinh app-toeic-backups),
 * RETENTION_DAYS (mac dinh 7).
 *
 * Luong chay:
 *  1. Cho backend day (Render cold-start) roi GET /api/admin/backup.
 *  1b. NEU live vua bi Render xoa (chi con 2 demo moi tao, cac bang
 *      nguoi dung khac rong — cung tieu chi nhu restore-watch.js) thi
 *      BO QUA lan backup nay, KHONG upload: tranh ghi de
 *      backup-latest.json tot bang anh chup cua DB vua bi xoa (da xay
 *      ra that luc 16:07 ngay 17/11: backup chay cung gio voi
 *      restore-watch, chup dung luc DB trong). Restore-watch se khoi
 *      phuc xong trong vong 30 phut, lan backup sau se chup lai du
 *      lieu da khoi phuc.
 *  2. Cat bo phan noi dung (questions/vocabulary/userWords) — chung duoc
 *     seed lai tu git; chi giu version/exportedAt/userData/counts de file
 *     nho (vai chuc KB thay vi ~10 MB).
 *  3. Luu backup-YYYYMMDD-HHmmss.json (gio Asia/Saigon) + upload len
 *     Drive (thu muc app-toeic-backups, rieng tu) + cap nhat
 *     backup-latest.json.
 *  4. Xoa cac ban theo ngay cu hon RETENTION_DAYS ngay (giu lai
 *     backup-latest.json).
 *
 * File backup chua password_hash — chi de trong Drive RIENG TU, khong
 * chia se cong khai.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lib = require('./backup-lib');

const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '7', 10) || 7;
const WORK_DIR = process.env.BACKUP_WORK_DIR || path.join(os.tmpdir(), 'app-toeic-backup');

// Cung tieu chi "DB vua bi xoa" nhu restore-watch.js — giu 2 file dong bo.
const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000;
const DEMO_EMAILS = ['demo@toeic.app', 'user@toeic.app'];

/** Live co phai vua bi Render xoa khong? Tra ve { wiped, reason }. */
function looksWiped(userData, counts) {
  const users = (userData && userData.users) || [];
  if (users.length !== 2) {
    return { wiped: false, reason: `users = ${users.length} (can dung 2 demo)` };
  }
  const emails = users.map((u) => u.email).sort();
  if (emails.join(',') !== [...DEMO_EMAILS].sort().join(',')) {
    return { wiped: false, reason: 'co tai khoan khong phai demo' };
  }
  const now = Date.now();
  for (const u of users) {
    const created = Date.parse(u.created_at || '');
    if (!created || now - created > FRESH_WINDOW_MS) {
      return {
        wiped: false,
        reason: `demo ${u.email} tao da lau (${u.created_at}) — khong phai DB vua seed`,
      };
    }
  }
  for (const [table, c] of Object.entries(counts || {})) {
    // app_settings + brand_settings + menu_icons: seed luon chen gia tri
    // mac dinh khi boot nen co dong ngay ca tren DB vua seed. users: vua
    // kiem tra o tren (chi 2 demo) nen khong tinh o day.
    if (table === 'app_settings' || table === 'brand_settings' || table === 'menu_icons' || table === 'users') continue;
    if (c > 0) {
      return { wiped: false, reason: `bang ${table} con ${c} dong — live co du lieu` };
    }
  }
  return { wiped: true, reason: 'live chi co 2 demo moi tao, cac bang nguoi dung khac deu rong' };
}

function saigonStamp(date = new Date()) {
  // YYYYMMDD-HHmmss theo gio Asia/Saigon (de ten file sap xep dung thu tu).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Saigon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
}

function countUserRows(userData) {
  return Object.values(userData || {}).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0
  );
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const token = lib.readAdminToken();
  await lib.waitForBackend();
  const backup = await lib.apiGetBackup(token);
  if (!backup.userData || typeof backup.userData !== 'object') {
    throw new Error('GET /api/admin/backup khong tra ve userData');
  }
  // Bao ve backup-latest: neu live vua bi xoa thi KHONG upload gi ca.
  // Ghi de ban tot bang anh chup DB trong se lam mat du lieu that ngay
  // khi restore-watch can no nhat (xay ra luc 16:07 ngay 17/11).
  const check = looksWiped(backup.userData, backup.counts);
  if (check.wiped) {
    lib.log(
      `live vua bi xoa (${check.reason}) — BO QUA lan backup nay, ` +
        `khong ghi de backup-latest.json. Restore-watch se khoi phuc truoc.`
    );
    return;
  }
  lib.log(`live co du lieu nguoi dung (${check.reason}) — tien hanh backup.`);
  // Chi giu du lieu nguoi dung — noi dung seed lai tu git.
  const slim = {
    version: backup.version || 1,
    exportedAt: backup.exportedAt || new Date().toISOString(),
    userData: backup.userData,
    counts: backup.counts || {},
  };
  const stamp = saigonStamp();
  const datedName = `backup-${stamp}.json`;
  const datedPath = path.join(WORK_DIR, datedName);
  fs.writeFileSync(datedPath, JSON.stringify(slim, null, 1));
  lib.log(
    `da xuat backup: ${countUserRows(slim.userData)} dong du lieu nguoi dung ` +
      `(${fs.statSync(datedPath).size} bytes).`
  );

  const folder = lib.ensureFolder(lib.DRIVE_FOLDER_NAME);
  lib.log(`thu muc Drive: ${lib.DRIVE_FOLDER_NAME} (${folder.id})`);
  const uploaded = lib.uploadFile(datedPath, datedName, folder.id);
  lib.log(`da upload ${datedName} (id ${uploaded.id}).`);

  // Cap nhat backup-latest.json: xoa ban cu roi upload ban moi.
  const files = lib.listFolderFiles(folder.id);
  for (const f of files.filter((x) => x.name === 'backup-latest.json')) {
    lib.deleteDriveFile(f.id);
    lib.log(`da xoa backup-latest.json cu (${f.id}).`);
  }
  const latest = lib.uploadFile(datedPath, 'backup-latest.json', folder.id);
  lib.log(`da cap nhat backup-latest.json (id ${latest.id}).`);

  // Don dep: xoa ban theo ngay cu hon RETENTION_DAYS (giu latest).
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const f of lib.listFolderFiles(folder.id)) {
    if (f.name === 'backup-latest.json') continue;
    if (!/^backup-\d{8}-\d{6}\.json$/.test(f.name)) continue;
    const created = Date.parse(f.createdTime || '');
    if (created && created < cutoff) {
      lib.deleteDriveFile(f.id);
      pruned += 1;
      lib.log(`da xoa ban cu: ${f.name}.`);
    }
  }
  lib.log(`backup xong: ${datedName} + backup-latest.json; da don ${pruned} ban cu.`);
}

main().catch((err) => {
  console.error(`[backup-to-drive] LOI: ${err.message}`);
  process.exit(1);
});
