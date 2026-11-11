'use strict';

// answerKey.js — Doc bang dap an (Answer Key) bang regex, KHONG goi AI,
// KHONG goi mang. Dung cho endpoint POST /api/admin/test-sets/:id/answer-key:
// admin upload file dap an rieng (txt/docx/pdf co lop chu) thi doc ngay
// bang quy tac; chi goi Gemini khi regex doc duoc it hon 3 cau (vd file
// scan/anh) hoac khi file la anh/scan.
//
// Cac dang dap an ho tro (so cau 1-200, dap an A-D):
//   "1. A" | "1 - B" | "1) C" | "1: D" | "1 | A" | "1. (A)" |
//   "Câu 1: D" | "Question 2: A" | "Q3 B" | "1A" (dang gon) |
//   liet ke theo hang "1.A 2.B 3.C" (nhieu cap tren 1 dong) |
//   cot doc: moi dong chi co 1 chu cai A-D (vd dong "A", dong "(B)") thi
//     hieu la dap an cua cau tiep theo theo thu tu (bat dau tu cau 1).
// Dong chi co 1 chu cai moi duoc tinh la dap an cot doc — chu cai nam
// trong cau van (vd "dap an A la...") KHONG duoc tinh, tranh doc nham.
//
// Quy uoc:
//   - So cau xuat hien 2 lan: giu dap an dau tien, ghi warning.
//   - So cau ngoai 1-200 hoac dap an ngoai A-D: bo qua.
//   - Doc duoc it hon 3 cau: van tra ket qua do, kem warning
//     "Không đọc được bảng đáp án" (de endpoint biet can goi AI).

// Cap "so cau + dap an" co danh dau ro rang. Thu tu uu tien:
//   1. co nhan: "Câu 1: D", "Question 2: A", "Q3 B"
//   2. co dau phan cach: "1. A", "1 - B", "1) C", "1: D", "1 | A", "1. (A)"
//   3. dang gon: "1A", "2B" (token dung mot minh)
// Chu cai dap an phai KHONG dung truoc mot chu cai khac (ke ca chu tieng
// Viet co dau, vd "c" trong "câu"), tranh doc nham "100 câu" thanh cau 100 = C.
const NUMBERED_RE =
  /\b(?:câu|question|q)\s*(\d{1,3})\s*[:.\-)]?\s*\(?\s*([A-Da-d])(?![A-Za-z\u00C0-\u01FF])\)?|\b(\d{1,3})\s*[.\-:)|]\s*\(?\s*([A-Da-d])(?![A-Za-z\u00C0-\u01FF])\)?|\b(\d{1,3})([A-Da-d])(?![A-Za-z\u00C0-\u01FF])/gi;

// Dong cot doc: chi co 1 chu cai A-D, co the kem ngoac don.
const LONE_LETTER_RE = /^\(?\s*([A-Da-d])\s*\)?$/;

const NO_KEY_WARNING = 'Không đọc được bảng đáp án';

/**
 * Doc bang dap an tu van ban thuan.
 * @param {string} text van ban trich tu file dap an
 * @returns {{ key: {[n: string]: string}, found: number, warnings: string[] }}
 *   key: dap an theo so cau, vd {"1":"A","2":"C"}; found: so cau doc duoc;
 *   warnings: canh bao (trung so cau, hoac khong doc duoc bang dap an).
 */
function parseAnswerKeyText(text) {
  const key = {};
  const warnings = [];
  const warnedDup = new Set();
  let nextSeq = 1; // so cau tiep theo cho dang cot doc

  function add(num, letter) {
    if (!Number.isInteger(num) || num < 1 || num > 200) return;
    const n = String(num);
    const ans = String(letter || '').toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(ans)) return;
    if (key[n]) {
      if (!warnedDup.has(n)) {
        warnedDup.add(n);
        warnings.push(`Câu ${n} xuất hiện nhiều lần — chỉ giữ đáp án đầu tiên (${key[n]}).`);
      }
      return;
    }
    key[n] = ans;
    if (num + 1 > nextSeq) nextSeq = num + 1;
  }

  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    let matchedNumbered = false;
    NUMBERED_RE.lastIndex = 0;
    let m;
    while ((m = NUMBERED_RE.exec(line)) !== null) {
      // Nhom 1-2: dang co nhan; 3-4: dang co dau phan cach; 5-6: dang gon.
      const numStr = m[1] !== undefined ? m[1] : m[3] !== undefined ? m[3] : m[5];
      const letter = m[2] !== undefined ? m[2] : m[4] !== undefined ? m[4] : m[6];
      if (numStr === undefined || letter === undefined) continue;
      matchedNumbered = true;
      add(parseInt(numStr, 10), letter);
      // Phong regex global khop rong (khong xay ra voi pattern nay, nhung
      // tranh vong lap vo han neu pattern thay doi sau nay).
      if (m[0].length === 0) NUMBERED_RE.lastIndex++;
    }
    if (matchedNumbered) continue;
    // Cot doc: dong chi co dung 1 chu cai A-D.
    const lone = line.trim().match(LONE_LETTER_RE);
    if (lone) add(nextSeq, lone[1]);
  }

  const found = Object.keys(key).length;
  if (found < 3) warnings.push(NO_KEY_WARNING);
  return { key, found, warnings };
}

module.exports = { parseAnswerKeyText, NO_KEY_WARNING };
