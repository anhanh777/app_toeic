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

/** @returns {number} so ngay streak hien tai */
function computeStreakDays(userId) {
  const dates = new Set(
    db.getActivityStartedAt(userId).map((ts) => utcDateStr(new Date(ts)))
  );
  if (!dates.size) return 0;
  const today = new Date();
  let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  // Neu hom nay chua co hoat dong thi bat dau dem tu hom qua.
  if (!dates.has(utcDateStr(cursor))) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  let streak = 0;
  while (dates.has(utcDateStr(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
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

module.exports = { computeStreakDays, awardXp, STREAK_BONUS_XP };
