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

module.exports = { SCORE_TABLE, scoreSection, scoreFullTest, levelLabel };
