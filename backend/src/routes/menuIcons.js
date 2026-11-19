'use strict';

// Bieu tuong menu (menu icons) — 17 muc cua app (12 muc menu chinh +
// Trang chu, Thong ke, nut Doi bai thi, the TOEIC/IELTS — bo sung
// 2026-11-19 sau khi ra soat).
// GET /api/menu-icons doc cong khai (khong can dang nhap) de app hoc vien
// tai ve luc mo app. GET/PUT /api/admin/menu-icons chi admin (auth +
// requireAdmin theo tung route, vi router nay khong dung auth toan cuc).
// Gia tri thieu/sai -> mac dinh trong code (menuIcons.js).

const express = require('express');
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const menuIcons = require('../menuIcons');

const router = express.Router();

/** Tai lieu day du 17 icon (da normalize: thieu/sai -> mac dinh code). */
function readMenuIconsDoc() {
  return menuIcons.normalizeMenuIcons(db.getAllMenuIcons());
}

/** Cac key duoc phep trong body PUT (tai lieu phang). */
const ALLOWED_FIELDS = [...menuIcons.MENU_KEYS];

router.get('/menu-icons', (req, res) => {
  return res.json(readMenuIconsDoc());
});

router.get('/admin/menu-icons', authMiddleware, requireAdmin, (req, res) => {
  return res.json(readMenuIconsDoc());
});

/**
 * PUT /api/admin/menu-icons — luu bieu tuong menu. Nhan tai lieu phang:
 * { today, practice, mock, wrong, vocabulary, leaderboard, settings,
 *   diagnostic, errors, writing, speaking, 'ielts-setup',
 *   home, stats, 'switch-exam', 'exam-toeic', 'exam-ielts' }.
 * Key khong co trong body giu nguyen gia tri dang luu (PUT tung phan
 * duoc); key la -> 400, khong luu gi. Validate tat ca truoc khi luu.
 * Tra ve tai lieu day du sau khi luu.
 */
router.put('/admin/menu-icons', authMiddleware, requireAdmin, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const unknown = Object.keys(body).filter((k) => !ALLOWED_FIELDS.includes(k));
  if (unknown.length > 0) {
    return res.status(400).json({ error: `key khong duoc phep: ${unknown.join(', ')}` });
  }
  const current = readMenuIconsDoc();
  const merged = {};
  for (const field of ALLOWED_FIELDS) {
    merged[field] = Object.prototype.hasOwnProperty.call(body, field) ? body[field] : current[field];
  }
  for (const key of ALLOWED_FIELDS) {
    const err = menuIcons.validateMenuIcon(key, merged[key]);
    if (err) return res.status(400).json({ error: err });
  }
  for (const key of ALLOWED_FIELDS) db.setMenuIcon(key, merged[key]);
  return res.json(readMenuIconsDoc());
});

module.exports = router;
