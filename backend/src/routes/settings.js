'use strict';

// Cai dat giao dien dong — doc cong khai (khong can dang nhap) de ca 2 app
// (hoc vien + admin) tai ve luc mo app. Chi tra cac key giao dien trong
// allowlist (mau, co chu, hieu ung loading) — khong co secret, khong co
// du lieu nguoi dung. Gia tri thieu/sai -> mac dinh trong code.

const express = require('express');
const db = require('../db');
const uiSettings = require('../uiSettings');

const router = express.Router();

router.get('/settings', (req, res) => {
  const doc = uiSettings.normalizeSettings(uiSettings.unflattenSettings(db.getAllSettings()));
  return res.json(doc);
});

module.exports = router;
