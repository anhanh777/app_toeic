'use strict';

/**
 * Quy doi diem TOEIC (Listening / Reading) — BANG THAM KHAO CONG KHAI, UOC LUONG.
 *
 * Moi phan (Listening Part 1-4, Reading Part 5-7) co toi da 100 cau trong mot
 * de full. So cau dung 0..100 -> diem phan 5..495 theo bang tham khao cong khai
 * (khong phai bang chinh thuc cua ETS — ETS khong cong bo cong thuc quy doi).
 * Tong diem = Listening + Reading, thang 10..990.
 *
 * LUON ghi ro trong app: "diem uoc luong" / "diem uoc luong de tham khao".
 *
 * Vi ngan hang cau giai doan 1 co the khong dung 100 cau/phan, ham
 * scoreFullTest() quy doi ti le (so cau dung / tong so cau cua phan) ve thang
 * 0..100 roi moi noi suy — van chi la uoc luong.
 */

// Bang neo: [so cau dung tren thang 100, diem phan]. Don dieu tang.
// Nguon: bang quy doi TOEIC tham khao cong khai (vi du cac bang tren
// ets.org/toeic va cac trang luyen thi), lam tron ve boi cua 5.
const SCORE_TABLE = [
  [0, 5],
  [5, 15],
  [10, 25],
  [15, 40],
  [20, 55],
  [25, 75],
  [30, 95],
  [35, 115],
  [40, 135],
  [45, 155],
  [50, 180],
  [55, 205],
  [60, 230],
  [65, 255],
  [70, 285],
  [75, 315],
  [80, 345],
  [85, 375],
  [90, 405],
  [95, 445],
  [100, 495],
];

function roundTo5(n) {
  return Math.round(n / 5) * 5;
}

/**
 * Noi suy tuyen tinh so cau dung (tren thang 0..100) -> diem phan 5..495.
 * @param {number} correctOn100 - so cau dung da quy ve thang 100 (co the thap phan)
 * @returns {number} diem phan (boi cua 5)
 */
function scoreSection(correctOn100) {
  const x = Math.max(0, Math.min(100, Number(correctOn100) || 0));
  if (x <= SCORE_TABLE[0][0]) return SCORE_TABLE[0][1];
  for (let i = 1; i < SCORE_TABLE.length; i++) {
    const [x0, y0] = SCORE_TABLE[i - 1];
    const [x1, y1] = SCORE_TABLE[i];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return roundTo5(y0 + t * (y1 - y0));
    }
  }
  return SCORE_TABLE[SCORE_TABLE.length - 1][1];
}

/**
 * Tinh diem cho mot bai thi full.
 * @param {number} listeningCorrect - so cau Listening dung
 * @param {number} listeningTotal - tong so cau Listening trong de
 * @param {number} readingCorrect - so cau Reading dung
 * @param {number} readingTotal - tong so cau Reading trong de
 * @returns {{listeningScore:number, readingScore:number, totalScore:number}}
 */
function scoreFullTest(listeningCorrect, listeningTotal, readingCorrect, readingTotal) {
  const lTotal = Math.max(0, listeningTotal || 0);
  const rTotal = Math.max(0, readingTotal || 0);
  const listeningScore = lTotal > 0
    ? scoreSection((listeningCorrect / lTotal) * 100)
    : 5;
  const readingScore = rTotal > 0
    ? scoreSection((readingCorrect / rTotal) * 100)
    : 5;
  return { listeningScore, readingScore, totalScore: listeningScore + readingScore };
}

/** Muc danh gia goi y (tham khao, khong phai chuan chinh thuc). */
function levelLabel(totalScore) {
  if (totalScore == null) return null;
  if (totalScore < 450) return 'Co ban';
  if (totalScore < 600) return 'Trung binh';
  if (totalScore < 750) return 'Kha';
  if (totalScore < 900) return 'Tot';
  return 'Xuat sac';
}

/* ---------------- IELTS band (Listening + Reading, 0-9) ----------------
 * Bang quy doi tham khao cong khai, band uoc luong de tham khao — moi de
 * that co the lech 1 cau o moc quy doi. Moi bang la danh sach
 * [so cau dung TOI THIEU cho band do, band], sap xep giam dan theo so cau.
 * Nguon: bang quy doi IELTS tham khao cong khai (vi du cac bang tren
 * ielts.org va cac trang luyen thi).
 */
const IELTS_LISTENING_BAND_TABLE = [
  [39, 9.0],
  [37, 8.5],
  [35, 8.0],
  [33, 7.5],
  [30, 7.0],
  [28, 6.5],
  [26, 6.0],
  [23, 5.5],
  [20, 5.0],
  [18, 4.5],
  [16, 4.0],
  [13, 3.5],
  [10, 3.0],
  [8, 2.5],
  [6, 2.0],
  [4, 1.5],
  [0, 1.0],
];

const IELTS_READING_BAND_TABLE = [
  [39, 9.0],
  [37, 8.5],
  [35, 8.0],
  [33, 7.5],
  [31, 7.0],
  [29, 6.5],
  [27, 6.0],
  [25, 5.5],
  [23, 5.0],
  [21, 4.5],
  [19, 4.0],
  [17, 3.5],
  [15, 3.0],
  [13, 2.5],
  [11, 2.0],
  [9, 1.5],
  [0, 1.0],
];

/**
 * So cau dung (0..40) -> band mot ky nang.
 * @param {number} correct - so cau dung
 * @param {'listening'|'reading'} skill
 * @returns {number} band 1.0..9.0
 */
function ieltsBandForSkill(correct, skill) {
  const table = skill === 'reading' ? IELTS_READING_BAND_TABLE : IELTS_LISTENING_BAND_TABLE;
  const c = Math.max(0, Math.min(40, Number(correct) || 0));
  for (const [minCorrect, band] of table) {
    if (c >= minCorrect) return band;
  }
  return 1.0;
}

/**
 * Band tong giai doan 2 (chi Listening + Reading) = trung binh 2 band,
 * lam tron toi 0.5 gan nhat.
 */
function ieltsOverallBand(listeningBand, readingBand) {
  const avg = (Number(listeningBand) + Number(readingBand)) / 2;
  return Math.round(avg * 2) / 2;
}

/** Nhan muc danh gia goi y theo band tong (tham khao, khong phai chuan chinh thuc). */
function ieltsBandLabel(band) {
  if (band == null) return null;
  if (band < 5) return 'Cơ bản';
  if (band < 6) return 'Trung bình';
  if (band < 7) return 'Khá';
  if (band < 8) return 'Tốt';
  return 'Xuất sắc';
}

module.exports = { SCORE_TABLE, scoreSection, scoreFullTest, levelLabel, IELTS_LISTENING_BAND_TABLE, IELTS_READING_BAND_TABLE, ieltsBandForSkill, ieltsOverallBand, ieltsBandLabel };
