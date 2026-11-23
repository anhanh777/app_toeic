'use strict';

/**
 * xp.js — logic XP + streak (tinh bang JS, khong dung ham ngay cua SQLite).
 *
 * XP (chi insert xp_events, khong update counter tai cho):
 *  - luyen tap dung 1 cau: +10
 *  - hoan thanh 1 bai thi thu: +50
 *  - on cau sai dung: +5
 *  - streak 7 ngay: +100 (chi 1 lan — khi streak vua cham 7 va chua tung nhan)
 *
 * Streak: so ngay UTC lien tiep (tinh nguoc tu hom nay; neu hom nay chua hoc
 * thi tinh tu hom qua) ma user co it nhat 1 attempt (luyen tap hoac thi).
 */

const db = require('./db');

const STREAK_BONUS_REASON = 'streak_7';
const STREAK_BONUS_XP = 100;

function utcDateStr(date) {
  return date.toISOString().slice(0, 10);
}

/** Khoa tuan ISO (YYYY-Www) cua 1 ngay YYYY-MM-DD — dung de gioi han
 *  ngay nghi bac cau: toi da 1 ngay nghi / tuan ISO. */
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7; // 0 = Thu 2
  const thursday = new Date(d.getTime() + (3 - day) * 24 * 60 * 60 * 1000);
  const year = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Ngay co hoat dong + ngay nghi cua user.
 * - dates: ngay co it nhat 1 attempt (tinh theo UTC, nhu cu) HOAC 1 lan
 *   diem danh (ngay YYYY-MM-DD theo +07 do client gui).
 * - rests: ngay nghi (bad-day, kind = 'rest' trong checkins).
 */
function getStreakData(userId) {
  const dates = new Set(
    db.getActivityStartedAt(userId).map((ts) => utcDateStr(new Date(ts)))
  );
  const rests = new Set();
  for (const row of db.listCheckins(userId)) {
    if (row.kind === 'rest') rests.add(row.date);
    else dates.add(row.date);
  }
  return { dates, rests };
}

/** @returns {number} so ngay streak hien tai */
function computeStreakDays(userId) {
  const { dates, rests } = getStreakData(userId);
  if (!dates.size) return 0;
  const today = new Date();
  let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  // Neu hom nay chua co hoat dong thi bat dau dem tu hom qua.
  if (!dates.has(utcDateStr(cursor))) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  // Ngay nghi bac cau chuoi (khong cong vao so ngay), toi da 1 ngay / tuan ISO.
  const usedRestWeeks = new Set();
  let streak = 0;
  for (;;) {
    const s = utcDateStr(cursor);
    if (dates.has(s)) {
      streak += 1;
    } else if (rests.has(s) && !usedRestWeeks.has(isoWeekKey(s))) {
      usedRestWeeks.add(isoWeekKey(s));
    } else {
      break;
    }
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}

/**
 * Vi tri cua moi ngay hoat dong trong chuoi cua no (1 = ngay dau chuoi):
 * { 'YYYY-MM-DD': so ngay lien tiep tinh den ngay do }. Ngay nghi chi bac
 * cau, khong tang so dem — cung quy tac nhu computeStreakDays.
 */
function computeStreakPositions(userId) {
  const { dates, rests } = getStreakData(userId);
  const map = {};
  if (!dates.size) return map;
  const sorted = [...dates].sort();
  let run = 0;
  let prev = null;
  let usedRestWeeks = new Set();
  for (const s of sorted) {
    if (prev === null) {
      run = 1;
    } else {
      const diff = Math.round(
        (new Date(s + 'T00:00:00Z').getTime() - new Date(prev + 'T00:00:00Z').getTime()) / 86400000
      );
      if (diff === 1) {
        run += 1;
      } else if (diff === 2) {
        const mid = utcDateStr(new Date(new Date(s + 'T00:00:00Z').getTime() - 24 * 60 * 60 * 1000));
        if (rests.has(mid) && !usedRestWeeks.has(isoWeekKey(mid))) {
          usedRestWeeks.add(isoWeekKey(mid));
          run += 1;
        } else {
          run = 1;
          usedRestWeeks = new Set();
        }
      } else {
        run = 1;
        usedRestWeeks = new Set();
      }
    }
    map[s] = run;
    prev = s;
  }
  return map;
}

/** @returns {number} chuoi dai nhat tu truoc den nay (tinh nhu streak). */
function computeLongestStreakDays(userId) {
  const positions = computeStreakPositions(userId);
  let best = 0;
  for (const v of Object.values(positions)) {
    if (v > best) best = v;
  }
  return best;
}

/**
 * Cong XP va kiem tra thuong streak. Tra ve {xpAwarded, streakDays, streakBonus}.
 * @param {number} userId
 * @param {number} baseXp - XP cua hanh dong vua thuc hien (0 neu khong co)
 * @param {string} baseReason - reason cho baseXp (null neu baseXp = 0)
 */
function awardXp(userId, baseXp, baseReason) {
  let xpAwarded = 0;
  if (baseXp > 0) {
    db.addXpEvent(userId, baseXp, baseReason);
    xpAwarded += baseXp;
  }
  const streakDays = computeStreakDays(userId);
  let streakBonus = 0;
  if (streakDays === 7 && !db.hasXpReason(userId, STREAK_BONUS_REASON)) {
    db.addXpEvent(userId, STREAK_BONUS_XP, STREAK_BONUS_REASON);
    streakBonus = STREAK_BONUS_XP;
    xpAwarded += streakBonus;
  }
  return { xpAwarded, streakDays, streakBonus };
}

module.exports = { computeStreakDays, computeLongestStreakDays, computeStreakPositions, awardXp, STREAK_BONUS_XP };
