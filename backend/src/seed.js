'use strict';

/**
 * seed.js — seed CSDL tu data/questions.json + data/vocabulary.json
 * (file seed do data agent quan ly) va tao 2 tai khoan demo.
 *
 * - Chiu duoc file seed CHUA TON TAI (in canh bao, bo qua, van tao demo user).
 * - Chay lai duoc (idempotent): chi seed cau hoi/tu vung khi bang dang rong,
 *   chi tao demo user khi email chua ton tai.
 * - Duoc goi tu src/index.js moi lan khoi dong, va chay doc lap bang
 *   `npm run seed`.
 */

const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');

function readJsonArray(file) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    console.warn(`[seed] khong tim thay ${full} — bo qua (data agent se tao sau).`);
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!Array.isArray(parsed)) {
      console.warn(`[seed] ${file} khong phai JSON array — bo qua.`);
      return [];
    }
    return parsed;
  } catch (err) {
    console.warn(`[seed] khong doc duoc ${file}: ${err.message} — bo qua.`);
    return [];
  }
}

function validSeedQuestion(q) {
  return (
    q &&
    typeof q.id === 'string' &&
    Number.isInteger(q.part) &&
    q.part >= 1 &&
    q.part <= 7 &&
    typeof q.content === 'string' &&
    Array.isArray(q.options) &&
    q.options.length === 4 &&
    typeof q.correct === 'string'
  );
}

function seedQuestions() {
  if (db.countQuestions() > 0) {
    console.log(`[seed] questions da co ${db.countQuestions()} cau — bo qua seed cau hoi.`);
    return 0;
  }
  const list = readJsonArray('questions.json').filter(validSeedQuestion);
  let inserted = 0;
  for (const q of list) {
    try {
      db.insertQuestion(q);
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua cau ${q.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} cau hoi.`);
  return inserted;
}

function seedVocabulary() {
  if (db.countVocabulary() > 0) {
    console.log(`[seed] vocabulary da co ${db.countVocabulary()} tu — bo qua seed tu vung.`);
    return 0;
  }
  const list = readJsonArray('vocabulary.json').filter(
    (v) => v && typeof v.id === 'string' && typeof v.word === 'string' && typeof v.meaning === 'string'
  );
  let inserted = 0;
  for (const v of list) {
    try {
      db.insertVocabulary(v);
      inserted += 1;
    } catch (err) {
      console.warn(`[seed] bo qua tu ${v.id}: ${err.message}`);
    }
  }
  console.log(`[seed] da seed ${inserted}/${list.length} tu vung.`);
  return inserted;
}

function seedDemoUsers() {
  const demos = [
    { email: 'demo@toeic.app', password: 'admin123', name: 'Demo Admin', role: 'admin' },
    { email: 'user@toeic.app', password: 'user123', name: 'Demo User', role: 'user' },
  ];
  for (const d of demos) {
    if (!db.findUserByEmail(d.email)) {
      db.createUser({
        email: d.email,
        passwordHash: bcrypt.hashSync(d.password, 10),
        name: d.name,
        role: d.role,
      });
      console.log(`[seed] da tao demo ${d.email} (${d.role}).`);
    }
  }
}

function seedAll() {
  db.initDb();
  seedQuestions();
  seedVocabulary();
  seedDemoUsers();
  console.log(
    `[seed] xong: ${db.countQuestions()} cau hoi, ${db.countVocabulary()} tu vung, ${db.countUsers()} user.`
  );
}

if (require.main === module) {
  seedAll();
}

module.exports = { seedAll, seedQuestions, seedVocabulary, seedDemoUsers };
