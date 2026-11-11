'use strict';

/**
 * aiPrompt.js — Prompt tieng Viet gui Gemini de nhan dien de thi TOEIC
 * tu van ban trich xuat (file .txt/.docx/.pdf) hoac tu anh chup de thi.
 *
 * Quy tac cot loi: Gemini CHI tra ve JSON dung shape da dinh san.
 * Neu khong xac dinh duoc dap an dung thi de "correct": "" va ghi canh bao
 * vao "warnings" — TUYET DOI khong doan bua dap an.
 */

const JSON_SHAPE = `{
  "questions": [
    {
      "part": 1,
      "content": "Noi dung cau hoi (tieng Anh, giu nguyen)",
      "options": [
        { "label": "A", "content": "Phuong an A (tieng Anh, giu nguyen)" },
        { "label": "B", "content": "Phuong an B" },
        { "label": "C", "content": "Phuong an C" },
        { "label": "D", "content": "Phuong an D" }
      ],
      "correct": "A",
      "explanation": "Giai thich ngan bang tieng Viet (neu suy ra duoc, neu khong thi de \\"\\")",
      "script": "Loi thoai / cau noi duoc doc len (Part 1, 2, 3, 4) hoac null",
      "passageTitle": "Tieu de doan van (neu co) hoac null",
      "passageText": "Toan bo doan hoi thoai / bai noi / doan van ma cac cau hoi cung dung chung (Part 3, 4, 6, 7) hoac null"
    }
  ],
  "warnings": ["Canh bao neu co, vi du: khong tim thay dap an cau 12"]
}`;

// Phan huong dan chung, dung cho ca prompt van ban lan prompt anh.
const COMMON_INSTRUCTIONS = `Ban la chuyen gia bien soan de thi TOEIC. Nhiem vu cua ban la doc de thi TOEIC
duoc cung cap va trich xuat TOAN BO cau hoi trong de thanh JSON dung shape ben duoi.
CHI tra ve JSON thuan (khong them giai thich, khong them markdown, khong them \`\`\`json).

Shape JSON bat buoc tra ve:
${JSON_SHAPE}

QUY TAC BAT BUOC — tuan thu dung tung quy tac:

1. Xac dinh Part theo noi dung va so thu tu cau:
   - Part 1: mo ta tranh (cau hoi ve 1 buc tranh, co 4 cau mo ta A-D, chi 1 dap an dung).
   - Part 2: hoi - dap ngan (1 cau hoi noi + 3 cau tra loi A, B, C).
   - Part 3: hoi thoai giua 2-3 nguoi, MOI DOAN co dung 3 cau hoi.
   - Part 4: bai noi cua 1 nguoi (thong bao, quang cao, huong dan...), MOI DOAN co dung 3 cau hoi.
   - Part 5: cau le (dien tu / cum tu vao cho trong, khong co doan van).
   - Part 6: doan van co cho trong, MOI DOAN co dung 4 cau hoi.
   - Part 7: doan van doc hieu, MOI DOAN co 2-3 cau hoi (thuong la 3 cau).
   Neu de thi ghi ro so Part hoac so thu tu cau, hay dung thong tin do de xac dinh Part.

2. Dap an dung:
   - Neu file co phan Answer Key / Dap an o cuoi, HAY DUNG dap an trong do (uu tien cao nhat).
   - Neu khong co answer key, chi dien "correct" khi ban chac chan dua tren noi dung cau hoi.
   - NEU KHONG XAC DINH DUOC DAP AN DUNG: de "correct": "" (chuoi rong) va them mot
     canh bao vao mang "warnings", vi du: "Khong xac dinh duoc dap an cau 12".
     TUYET DOI KHONG DOAN BUA DAP AN. Doan bua dap an sai con te hon de trong.

3. Gom nhom doan van:
   - Cac cau chung 1 doan Part 3 / Part 4 phai gom dung 3 cau, cung "passageText"
     (toan bo loi hoi thoai / bai noi) va cung "passageTitle" neu co.
   - Cac cau chung 1 doan Part 6 phai gom dung 4 cau, cung "passageText".
   - Cac cau chung 1 doan Part 7 phai cung "passageText" (doan van doc hieu).
   - "script": loi thoai duoc doc len. Part 1: cau mo ta tranh dung; Part 2: cau hoi;
     Part 3/4: toan bo loi hoi thoai / bai noi (giong passageText). Part 5/6/7: null.

4. Giu nguyen noi dung tieng Anh cua cau hoi va cac phuong an, KHONG DICH sang tieng Viet.
   Chi "explanation" viet bang tieng Viet, ngan gon (1-2 cau). Neu khong suy ra duoc
   giai thich thi de "explanation": "".

5. Moi cau hoi phai co dung 4 phuong an voi nhan A, B, C, D theo dung thu tu trong de.
   Part 2 chi co 3 phuong an trong de goc (A, B, C): van tao du 4 phuong an, phuong an D
   de "content": "" va ghi canh bao vao "warnings" (vi du: "Cau 8 Part 2 chi co 3 phuong an").

6. Khong bo sot cau hoi nao trong de. Khong tu them cau hoi khong co trong de.
   Giu dung thu tu cau hoi nhu trong de goc.

7. Truong nao khong co thi de null (script, passageTitle, passageText) hoac "" (explanation,
   correct khi khong xac dinh duoc dap an), khong duoc bo truong.`;

function buildParsePrompt(text) {
  return `${COMMON_INSTRUCTIONS}

DE THI CAN TRICH XUAT (van ban trich tu file):
---
${text}
---
Hay trich xuat toan bo cau hoi trong de thi tren thanh JSON dung shape da cho.`;
}

function buildVisionPrompt() {
  return `${COMMON_INSTRUCTIONS}

DE THI CAN TRICH XUAT: anh chup / anh scan de thi TOEIC dinh kem theo prompt nay.
Hay doc ky toan bo noi dung trong anh (ke ca phan answer key o cuoi neu co trong anh)
va trich xuat toan bo cau hoi thanh JSON dung shape da cho.
CHI tra ve JSON thuan dung shape ben tren (giong nhu prompt van ban),
khong them giai thich, khong them markdown, khong them \`\`\`json.`;
}

/**
 * Prompt cho TANG 3 (Hybrid 3 tang): trich xuat 1 KHOI de (1 Part, hoac 1 doan
 * van + cac cau cua no trong Part 3/4/6/7) thay vi ca file. Dung chung
 * COMMON_INSTRUCTIONS va JSON_SHAPE voi buildParsePrompt, chi them ngu canh
 * cua khoi: so Part, so thu tu cau ky vong, passageText, va bang dap an da
 * tach duoc o tang 2 cho dung cac cau do (uu tien dung bang nay).
 * @param {{part:number, text:string, expectedQuestions:number[], passageText:string|null}} block khoi de da tach o tang 2
 * @param {{[n:number]: string}} answerKeyForBlock dap an tang 2 tach duoc cho cac cau trong khoi, vd {3:'A', 4:'A'}
 * @returns {string} prompt gui Gemini cho khoi nay
 */
function buildBlockParsePrompt(block, answerKeyForBlock) {
  const partLabel =
    block.part && block.part >= 1 && block.part <= 7
      ? `Part ${block.part}`
      : 'Part chưa xác định (file không ghi rõ Part)';
  const contextLines = [`KHOI DE CAN TRICH XUAT: ${partLabel}.`];
  if (Array.isArray(block.expectedQuestions) && block.expectedQuestions.length > 0) {
    contextLines.push(
      `Cac cau trong khoi nay (theo thu tu trong de): ${block.expectedQuestions.join(', ')}.`
    );
  }
  if (block.part === 1 || block.part === 2) {
    contextLines.push(
      'LUU Y — Part 1/2 la cau CHI-NGHE: de thi that KHONG in noi dung cau hoi va phuong an ' +
        '(Part 1 chi co anh + 4 cau noi trong audio, Part 2 chi co cau hoi + 3 cau tra loi trong audio). ' +
        'KHONG bia noi dung cau hoi hay phuong an. Neu khoi nay khong trich duoc cau nao co noi dung ' +
        'that thi tra ve mang questions rong — he thong se tu tao cau giu cho.'
    );
  }
  if (block.passageText) {
    contextLines.push(
      `Doan van chung cua khoi (passageText — cac cau trong khoi deu dung chung doan nay):\n${block.passageText}`
    );
  }
  const keyEntries =
    answerKeyForBlock && typeof answerKeyForBlock === 'object'
      ? Object.keys(answerKeyForBlock)
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isInteger(n))
          .sort((a, b) => a - b)
          .map((n) => `Câu ${n}: ${answerKeyForBlock[n]}`)
      : [];
  if (keyEntries.length > 0) {
    contextLines.push(
      `BANG DAP AN DA TACH DUOC O BUOC TRUOC CHO DUNG CAC CAU NAY — UU TIEN DUNG BANG DAP AN NAY, khong doan dap an khac:\n${keyEntries.join('\n')}`
    );
  } else {
    contextLines.push(
      'Khong co bang dap an tach san cho khoi nay — chi dien "correct" khi chac chan dua tren noi dung cau hoi, neu khong de "".'
    );
  }

  return `${COMMON_INSTRUCTIONS}

${contextLines.join('\n\n')}

NOI DUNG KHOI DE (van ban trich tu file):
---
${block.text}
---
Hay trich xuat toan bo cau hoi trong khoi tren thanh JSON dung shape da cho.
Chi trich xuat cac cau thuoc khoi nay, khong them cau cua khoi khac.`;
}

/**
 * Prompt doc BANG DAP AN rieng (endpoint answer-key): Gemini CHI doc so cau
 * va dap an A-D, khong trich cau hoi. Dung cho ca 2 dang dau vao:
 *   - text: van ban trich tu file dap an go tay (.txt/.docx/.pdf co lop chu)
 *   - vision: anh chup / anh scan trang dap an (textOrVision = null, anh
 *     dinh kem theo prompt nhu buildVisionPrompt).
 * @param {string|null} textOrVision van ban bang dap an, hoac null khi la anh
 * @returns {string} prompt gui Gemini
 */
function buildAnswerKeyPrompt(textOrVision) {
  const source =
    typeof textOrVision === 'string' && textOrVision.trim()
      ? `BANG DAP AN CAN DOC (van ban trich tu file):\n---\n${textOrVision}\n---`
      : 'BANG DAP AN CAN DOC: anh chup / anh scan trang dap an dinh kem theo prompt nay. Hay doc ky toan bo bang dap an trong anh.';
  return `Ban la chuyen gia bien soan de thi TOEIC. Nhiem vu cua ban la doc BANG DAP AN
TOEIC duoc cung cap va tra ve dung JSON shape ben duoi. CHI tra ve JSON thuan
(khong them giai thich, khong them markdown, khong them \`\`\`json).

Shape JSON bat buoc tra ve:
{
  "key": { "1": "A", "2": "C" },
  "warnings": ["Canh bao neu co, vi du: khong doc duoc dap an cau 12"]
}

QUY TAC BAT BUOC:
1. "key" chi chua so cau 1-200 va dap an A, B, C, D (chu hoa). So cau la chuoi,
   vi du "1", "2", ..., "200".
2. Chi ghi dap an khi ban DOC RO trong bang (chu in hoac chu viet ro rang).
   NEU KHONG DOC DUOC dap an cua mot cau: BO QUA so cau do (khong dua vao
   "key") va them mot canh bao vao "warnings". TUYET DOI KHONG DOAN BUA DAP AN.
   Doan bua dap an sai con te hon de trong.
3. Khong tu them cau khong co trong bang. Giu dung so cau nhu trong bang goc.
4. Neu bang chi co cot chu cai ma khong ghi so cau (moi dong 1 chu cai A-D),
   hieu cac chu cai theo dung thu tu tu tren xuong duoi, bat dau tu cau 1.

${source}

Hay doc bang dap an tren va tra ve JSON dung shape da cho.`;
}

module.exports = { buildParsePrompt, buildVisionPrompt, buildBlockParsePrompt, buildAnswerKeyPrompt };
