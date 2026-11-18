'use strict';

/**
 * restore-watch.js — kiem tra live DB co vua bi Render xoa khong; neu co
 * thi khoi phuc tu ban backup moi nhat tren Drive.
 *
 * Chay bang cron (de xuat: moi 30 phut):
 *   node backend/scripts/restore-watch.js
 *
 * Env (khong bat buoc): API_BASE, ADMIN_TOKEN_FILE, DRIVE_FOLDER_NAME
 * (giong backup-to-drive.js).
 *
 * Nguyen tac an toan (bat buoc):
 *  - CHI khoi phuc khi live TRONG NHU VUA BI XOA: chi co dung 2 tai khoan
 *    demo vua duoc tao (created_at trong 12h qua) va moi bang du lieu
 *    nguoi dung khac deu rong. Neu live co bat ky du lieu nguoi dung nao
 *    (tai khoan moi, tu da luu, bai da lam...) thi KHONG khoi phuc — tranh
 *    ghi de du lieu moi bang du lieu cu trong backup.
 *  - CHI khoi phuc khi ban backup co du lieu nguoi dung that (nhieu hon
 *    2 dong demo).
 *  - Sau khi khoi phuc, doi chieu lai so dong tung bang voi ban backup;
 *    lech -> bao loi (exit 1).
 *  - Ghi log moi quyet dinh (cron se luu lai).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lib = require('./backup-lib');

const WORK_DIR = process.env.BACKUP_WORK_DIR || path.join(os.tmpdir(), 'app-toeic-backup');
// Demo user tao trong khoang nay thi coi nhu DB vua duoc seed lai sau khi bi xoa.
const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000;
const DEMO_EMAILS = ['demo@toeic.app', 'user@toeic.app'];

function countUserRows(userData) {
  return Object.values(userData || {}).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0
  );
}

/** Live co phai vua bi xoa khong? Tra ve { wiped, reason }. */
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
    // app_settings + brand_settings: seed luon chen gia tri mac dinh khi
    // boot nen co dong ngay ca tren DB vua seed. users: vua kiem tra o
    // tren (chi 2 demo) nen khong tinh o day.
    if (table === 'app_settings' || table === 'brand_settings' || table === 'users') continue;
    if (c > 0) {
      return { wiped: false, reason: `bang ${table} con ${c} dong — live co du lieu` };
    }
  }
  return { wiped: true, reason: 'live chi co 2 demo moi tao, cac bang nguoi dung khac deu rong' };
}

/** Chon ban backup moi nhat: uu tien backup-latest.json, roi den ban theo
 *  ngay moi nhat (theo createdTime). */
function pickLatestBackup(files) {
  const latest = files.find((f) => f.name === 'backup-latest.json');
  if (latest) return latest;
  const dated = files
    .filter((f) => /^backup-\d{8}-\d{6}\.json$/.test(f.name))
    .sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
  return dated[0] || null;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const token = lib.readAdminToken();
  await lib.waitForBackend();
  const live = await lib.apiGetBackup(token);
  const check = looksWiped(live.userData, live.counts);
  lib.log(`kiem tra live: ${check.reason}.`);
  if (!check.wiped) {
    lib.log('live co du lieu nguoi dung — KHONG khoi phuc (tranh ghi de du lieu moi).');
    return;
  }

  const folder = lib.findFolderByName(lib.DRIVE_FOLDER_NAME);
  if (!folder) {
    lib.log(`khong co thu muc Drive ${lib.DRIVE_FOLDER_NAME} — chua co backup nao, khong khoi phuc duoc.`);
    return;
  }
  const files = lib.listFolderFiles(folder.id);
  const latestFile = pickLatestBackup(files);
  if (!latestFile) {
    lib.log('thu muc backup trong — chua co backup nao, khong khoi phuc duoc.');
    return;
  }
  const localPath = path.join(WORK_DIR, `restore-${latestFile.name}`);
  lib.downloadFile(latestFile.id, localPath);
  const backupDoc = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  if (!backupDoc.userData || countUserRows(backupDoc.userData) <= 2) {
    lib.log(`ban backup ${latestFile.name} khong co du lieu nguoi dung that — khong khoi phuc.`);
    return;
  }
  lib.log(
    `live vua bi xoa — khoi phuc tu ${latestFile.name} ` +
      `(${countUserRows(backupDoc.userData)} dong)...`
  );
  const result = await lib.apiPostRestore(token, backupDoc);

  // Doi chieu lai so dong tung bang voi ban backup.
  const after = await lib.apiGetBackup(token);
  const mismatches = [];
  for (const [table, want] of Object.entries(backupDoc.counts || {})) {
    const got = (after.counts || {})[table];
    if (got !== want) mismatches.push(`${table}: muon ${want}, duoc ${got}`);
  }
  if (mismatches.length) {
    throw new Error(`khoi phuc xong nhung so lieu lech: ${mismatches.join('; ')}`);
  }
  lib.log(`khoi phuc XONG tu ${latestFile.name}: ${JSON.stringify(result.restored)}.`);
}

main().catch((err) => {
  console.error(`[restore-watch] LOI: ${err.message}`);
  process.exit(1);
});
