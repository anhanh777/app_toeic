'use strict';

// IELTS: bang quy doi raw -> band (tham khao cong khai, band uoc luong).

const express = require('express');
const { IELTS_LISTENING_BAND_TABLE, IELTS_READING_BAND_TABLE } = require('../scoring');
const { authMiddleware } = require('../auth');

const router = express.Router();

router.get('/ielts/band-table', authMiddleware, (req, res) => {
  return res.json({
    listening: IELTS_LISTENING_BAND_TABLE,
    reading: IELTS_READING_BAND_TABLE,
    note: 'Bảng quy đổi tham khảo công khai — band trong app là band ước lượng để tham khảo.',
  });
});

module.exports = router;
