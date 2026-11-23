'use strict';

/**
 * checkin.js — Diem danh hang ngay (lich + qua theo moc, kieu C).
 *
 * - POST /api/checkin: diem danh 1 lan/ngay, +10 XP (qua awardXp de
 *   streak tu chay). Bam lai trong ngay: idempotent, khong cong XP lan 2.
 * - GET /api/checkin?month=YYYY-MM&before=YYYY-MM-DD&limit=30: lich thang
 *   + streak + tong ngay + moc qua + lich su diem danh (moi nhat truoc).
 *
 * MUI GIO: ngay tinh theo Asia/Saigon (+07). Client gui date theo gio
 * dia phuong; server KHONG doi sang UTC (00:30 +07 la ngay moi).
 * Ngay nghi (bad-day) duoc ghi o routes/ieltsPhase1.js (badDayHandler)
 * vao cung bang checkins voi kind = 'rest'.
 */

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const {
  awardXp,
  computeStreakDays,
  computeLongestStreakDays,
  computeStreakPositions,
} = require('../xp');

const router = express.Router();

const CHECKIN_XP = 10;
const CHECKIN_REASON = 'checkin';

/** Moc qua — tinh theo TONG so ngay da diem danh (khong reset khi dut chuoi). */
const MILESTONES = [
  { days: 3, title: 'Người mới chăm chỉ', xp: 20 },
  { days: 7, title: 'Người chăm chỉ', xp: 50 },
  { days: 14, title: 'Kiên trì', xp: 100 },
  { days: 30, title: 'Thánh siêng năng', xp: 200 },
  { days: 60, title: 'Bậc thầy kỷ luật', xp: 300 },
  { days: 100, title: 'Huyền thoại', xp: 500 },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function isValidDateStr(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const VI_WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function weekdayVi(dateStr) {
  return VI_WEEKDAYS[new Date(dateStr + 'T00:00:00Z').getUTCDay()];
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [from, `${month}-${String(last).padStart(2, '0')}`];
}

router.get('/checkin', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const today = db.saigonTodayStr();
  const month =
    typeof req.query.month === 'string' && MONTH_RE.test(req.query.month)
      ? req.query.month
      : today.slice(0, 7);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const before =
    typeof req.query.before === 'string' && isValidDateStr(req.query.before)
      ? req.query.before
      : today;

  const [from, to] = monthRange(month);
  // Lich thang: diem danh > hoat dong (co attempt nhung chua diem danh) > ngay nghi.
  const days = {};
  for (const r of db.listCheckins(userId, from, to)) {
    days[r.date] = r.kind;
  }
  const activeDates = new Set(
    db.getActivityStartedAt(userId).map((ts) => String(ts).slice(0, 10))
  );
  for (const d of activeDates) {
    if (d >= from && d <= to && !days[d]) days[d] = 'active';
  }

  const total = db.countCheckins(userId);
  const milestones = MILESTONES.map((m) => ({ ...m, achieved: total >= m.days }));
  const next = MILESTONES.find((m) => total < m.days) || null;

  const positions = computeStreakPositions(userId);
  const historyRows = db
    .listCheckins(userId)
    .filter((r) => r.date <= before)
    .reverse()
    .slice(0, limit + 1);
  const historyHasMore = historyRows.length > limit;
  const history = historyRows.slice(0, limit).map((r) => ({
    date: r.date,
    kind: r.kind,
    weekday: weekdayVi(r.date),
    // Ngay diem danh thu may trong chuoi (null voi ngay nghi — chi bac cau).
    streakDay: r.kind === 'checkin' ? (positions[r.date] || null) : null,
  }));

  const todayRow = db.getCheckin(userId, today);
  return res.json({
    today,
    checkedInToday: !!(todayRow && todayRow.kind === 'checkin'),
    restToday: !!(todayRow && todayRow.kind === 'rest'),
    month,
    days,
    streak: {
      current: computeStreakDays(userId),
      longest: computeLongestStreakDays(userId),
    },
    totalCheckins: total,
    milestones,
    nextMilestone: next ? { ...next, remaining: next.days - total } : null,
    history,
    historyHasMore,
  });
});

router.post('/checkin', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const today = db.saigonTodayStr();
  let date = today;
  if (req.body && req.body.date !== undefined) {
    if (!isValidDateStr(req.body.date)) {
      return res.status(400).json({ error: 'date phai la YYYY-MM-DD' });
    }
    date = req.body.date;
    if (date > today) {
      return res.status(400).json({ error: 'khong diem danh cho ngay tuong lai' });
    }
    const diffDays = Math.round(
      (new Date(today + 'T00:00:00Z').getTime() - new Date(date + 'T00:00:00Z').getTime()) / 86400000
    );
    if (diffDays > 365) {
      return res.status(400).json({ error: 'chi diem danh trong vong 365 ngay qua' });
    }
  }

  const existing = db.getCheckin(userId, date);
  if (existing && existing.kind === 'checkin') {
    // Bam lai trong ngay: khong cong XP lan 2.
    return res.json({
      ok: true,
      already: true,
      date,
      checkedInToday: date === today,
      xpAwarded: 0,
      streakDays: computeStreakDays(userId),
      totalCheckins: db.countCheckins(userId),
      milestoneAwarded: null,
    });
  }
  if (existing && existing.kind === 'rest') {
    // Hom nay da chon ngay nghi roi lam bai: nang ngay nghi -> diem danh.
    db.updateCheckinKind(userId, date, 'checkin');
  } else {
    db.addCheckin(userId, date, 'checkin');
  }

  const r = awardXp(userId, CHECKIN_XP, CHECKIN_REASON);
  const total = db.countCheckins(userId);
  let milestoneAwarded = null;
  const m = MILESTONES.find((x) => x.days === total);
  if (m && !db.hasXpReason(userId, `checkin_${m.days}`)) {
    const mr = awardXp(userId, m.xp, `checkin_${m.days}`);
    milestoneAwarded = { ...m, xpAwarded: mr.xpAwarded };
  }
  return res.json({
    ok: true,
    already: false,
    date,
    checkedInToday: date === today,
    xpAwarded: r.xpAwarded + (milestoneAwarded ? milestoneAwarded.xpAwarded : 0),
    streakDays: computeStreakDays(userId),
    totalCheckins: total,
    milestoneAwarded,
  });
});

module.exports = router;
