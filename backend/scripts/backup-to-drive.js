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
