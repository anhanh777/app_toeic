'use strict';

// Cai dat thuong hieu (brand) — ten, tagline, logo (emoji hoac anh).
// GET /api/brand doc cong khai (khong can dang nhap) de app hoc vien tai
// ve luc mo app. GET/PUT /api/admin/brand chi admin (auth + requireAdmin
// theo tung route, vi router nay khong dung auth toan cuc).
// Gia tri thieu/sai -> mac dinh trong code (brandSettings.js).

const express = require('express');
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const brandSettings = require('../brandSettings');

const router = express.Router();

/** Doc day du thuong hieu (da normalize: thieu/sai -> mac dinh code). */
function readBrandDoc() {
  return brandSettings.normalizeBrand(brandSettings.unflattenBrand(db.getAllBrandSettings()));
}

/** Cac field duoc phep trong body PUT (tai lieu phang). */
const ALLOWED_FIELDS = ['name', 'tagline', 'logoType', 'logoEmoji', 'logoUrl'];

router.get('/brand', (req, res) => {
  return res.json(readBrandDoc());
});

router.get('/admin/brand', authMiddleware, requireAdmin, (req, res) => {
  return res.json(readBrandDoc());
});

/**
 * PUT /api/admin/brand — luu cai dat thuong hieu. Nhan tai lieu phang:
 * { name, tagline, logoType, logoEmoji, logoUrl }.
 * Field khong co trong body giu nguyen gia tri dang luu; field la ->
 * 400, khong luu gi. Validate tat ca truoc khi luu. Tra ve tai lieu
 * day du sau khi luu.
 */
router.put('/admin/brand', authMiddleware, requireAdmin, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const unknown = Object.keys(body).filter((k) => !ALLOWED_FIELDS.includes(k));
  if (unknown.length > 0) {
    return res.status(400).json({ error: `field khong duoc phep: ${unknown.join(', ')}` });
  }
  const current = readBrandDoc();
  const merged = {};
  for (const field of ALLOWED_FIELDS) {
    merged[field] = Object.prototype.hasOwnProperty.call(body, field) ? body[field] : current[field];
  }
  const flat = brandSettings.flattenBrand(merged);
  for (const key of brandSettings.BRAND_KEYS) {
    const err = brandSettings.validateBrandSetting(key, flat[key]);
    if (err) return res.status(400).json({ error: err });
  }
  for (const key of brandSettings.BRAND_KEYS) db.setBrandSetting(key, flat[key]);
  return res.json(readBrandDoc());
});

module.exports = router;
