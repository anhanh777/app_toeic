// Bối cảnh kỳ thi đang chọn (TOEIC / IELTS Academic) — kế hoạch giai đoạn 2.
// Mọi màn hình IELTS đi sau lựa chọn exam; mặc định TOEIC như cũ.
// Quy ước chung: IELTS Listening Section N → part N (1–4); Reading
// Passage N → part 4+N (5, 6, 7).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, type ExamInfo } from './api';
import { ErrorBox } from './components';

export type ExamId = 'toeic' | 'ielts';

const KEY = 'app_exam';

interface ExamCtx {
  exam: ExamId | null;
  setExam: (e: ExamId) => void;
  clearExam: () => void;
}
const Ctx = createContext<ExamCtx | null>(null);

function readSaved(): ExamId | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'toeic' || v === 'ielts') return v;
  } catch {
    /* localStorage không dùng được thì bắt chọn lại */
  }
  return null;
}

export function ExamProvider({ children }: { children: ReactNode }) {
  const [exam, setExamState] = useState<ExamId | null>(() => readSaved());
  const setExam = (e: ExamId) => {
    try { localStorage.setItem(KEY, e); } catch { /* bỏ qua */ }
    setExamState(e);
  };
  const clearExam = () => {
    try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
    setExamState(null);
  };
  return <Ctx.Provider value={{ exam, setExam, clearExam }}>{children}</Ctx.Provider>;
}

export function useExam(): ExamCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useExam phải dùng trong ExamProvider');
  return c;
}

/**
 * IELTS-only: sau khi chọn exam=ielts, nếu chưa làm thiết lập lần đầu
 * (và chưa bấm "Bỏ qua") thì chuyển sang /ielts/setup 1 lần.
 * Kiểm tra localStorage trước (nhanh, không chặn), rồi xác nhận bằng
 * GET /api/ielts/profile; backend lỗi thì tin bản local. TOEIC không
 * bao giờ bị chuyển. Không chặn người dùng: lỗi nào cũng cho đi tiếp.
 */
export function useIeltsSetupRedirect() {
  const { exam } = useExam();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    if (exam !== 'ielts') return;
    if (loc.pathname === '/ielts/setup') return;
    let done = false;
    try { done = localStorage.getItem('ielts_setup_done') === '1'; } catch { /* bỏ qua */ }
    if (done) return;
    let cancelled = false;
    api.ieltsProfile()
      .then(p => {
        if (cancelled) return;
        if (p.setupDone || p.skipped) return;
        nav('/ielts/setup');
      })
      .catch(() => { /* backend chưa sẵn sàng: tin bản local, không chặn */ });
    return () => { cancelled = true; };
  }, [exam, loc.pathname, nav]);
}

// ---- Cỡ chữ luyện/thi (A- / A+) — lưu localStorage, áp cho đoạn văn,
// chữ câu hỏi và phương án ở màn Luyện tập, Thi thử và Ôn câu sai. ----
const TEXT_SIZE_KEY = 'app_text_size';
export const TEXT_SIZE_LABELS = ['Nhỏ', 'Vừa', 'Lớn', 'Rất lớn'];
// Cỡ chữ dùng chung cả app (context) để nút 🔠 trên thanh nav và các trang
// Luyện tập/Thi thử/Câu sai luôn đồng bộ — đổi ở header thì trang đang mở
// cập nhật ngay, không cần tải lại.
interface TextSizeCtx { level: number; setLevel: (n: number) => void; label: string }
const TextSizeContext = createContext<TextSizeCtx | null>(null);
export function TextSizeProvider({ children }: { children: ReactNode }) {
  const [level, setLevelState] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(TEXT_SIZE_KEY));
      return Number.isInteger(v) && v >= 0 && v <= 3 ? v : 1;
    } catch {
      return 1;
    }
  });
  const setLevel = (n: number) => {
    const v = Math.max(0, Math.min(3, n));
    try { localStorage.setItem(TEXT_SIZE_KEY, String(v)); } catch { /* bỏ qua */ }
    setLevelState(v);
  };
  return (
    <TextSizeContext.Provider value={{ level, setLevel, label: TEXT_SIZE_LABELS[level] }}>
      {children}
    </TextSizeContext.Provider>
  );
}
export function useTextSize(): TextSizeCtx {
  const c = useContext(TextSizeContext);
  if (!c) throw new Error('useTextSize phải dùng trong TextSizeProvider');
  return c;
}

export function TextSizeControl({ level, setLevel }: { level: number; setLevel: (n: number) => void }) {
  return (
    <span className="text-size" role="group" aria-label="Cỡ chữ">
      <button type="button" className="btn btn-sm" disabled={level <= 0} onClick={() => setLevel(level - 1)} aria-label="Giảm cỡ chữ">A-</button>
      <input
        type="range" min={0} max={3} step={1} value={level}
        onChange={e => setLevel(Number(e.target.value))}
        className="ts-slider" aria-label="Kéo chọn cỡ chữ"
        title={`Cỡ chữ: ${TEXT_SIZE_LABELS[level]}`}
      />
      <span className="text-size-label" aria-live="polite">{TEXT_SIZE_LABELS[level]}</span>
      <button type="button" className="btn btn-sm" disabled={level >= 3} onClick={() => setLevel(level + 1)} aria-label="Tăng cỡ chữ">A+</button>
    </span>
  );
}

/** Nhãn ngắn cho 1 Part theo kỳ thi: "Part 1" / "Section 1" / "Passage 1". */
export function partLabel(part: number, exam: ExamId | null | undefined): string {
  if (exam === 'ielts') return part <= 4 ? `Section ${part}` : `Passage ${part - 4}`;
  return `Part ${part}`;
}

/** Tên đầy đủ cho 1 Part theo kỳ thi (dùng cho tiêu đề, thẻ chọn, thống kê). */
export function partNameFor(part: number, exam: ExamId | null | undefined): string {
  if (exam === 'ielts') return partLabel(part, exam);
  // TOEIC: tên đầy đủ nằm ở components.tsx (partName) — tránh vòng import.
  return `Part ${part}`;
}

// ---- Dạng câu hỏi IELTS ----

export const QUESTION_TYPE_NAMES: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false_not_given: 'True / False / Not Given',
  yes_no_not_given: 'Yes / No / Not Given',
  matching_headings: 'Nối tiêu đề (Matching Headings)',
  matching_information: 'Nối thông tin (Matching Information)',
  matching_features: 'Nối đặc điểm (Matching Features)',
  matching: 'Nối (Matching)',
  labelling: 'Ghi nhãn (Labelling)',
  form_completion: 'Điền form (Form Completion)',
  sentence_completion: 'Hoàn thành câu (Sentence Completion)',
  summary_completion: 'Hoàn thành tóm tắt (Summary Completion)',
  short_answer: 'Trả lời ngắn (Short Answer)',
  note_completion: 'Điền ghi chú (Note Completion)',
  table_completion: 'Điền bảng (Table Completion)',
  flow_chart_completion: 'Điền sơ đồ quy trình (Flow-chart Completion)',
  diagram_completion: 'Ghi nhãn sơ đồ (Diagram Completion)',
  matching_sentence_endings: 'Nối câu (Matching Sentence Endings)',
  list_selection: 'Chọn từ danh sách (List Selection)',
  choosing_title: 'Chọn tiêu đề (Choosing a Title)',
};
export function questionTypeName(t?: string | null): string {
  return (t && QUESTION_TYPE_NAMES[t]) || 'Trắc nghiệm';
}

/** Dạng điền từ: form/sentence/summary completion + short_answer. */
export const FILL_IN_TYPES = new Set([
  'form_completion', 'sentence_completion', 'summary_completion', 'short_answer',
  'note_completion', 'table_completion', 'flow_chart_completion', 'diagram_completion',
]);
export function isFillIn(t?: string | null): boolean {
  return !!t && FILL_IN_TYPES.has(t);
}
export function isMatching(t?: string | null): boolean {
  return !!t && (
    t === 'matching_headings' || t === 'matching_information' ||
    t === 'matching_features' || t === 'matching' || t === 'labelling' ||
    t === 'matching_sentence_endings'
  );
}

/** Dạng chọn nhiều đáp án: chỉ list_selection — đáp án là chuỗi các nhãn
 * đã chọn, sắp xếp rồi nối bằng dấu phẩy, VD "A,C". Chấm all-or-nothing
 * ở backend (đúng hết mới tính điểm). */
export function isMultiAnswer(t?: string | null): boolean {
  return t === 'list_selection';
}

/** "A,C" / "A, C" → ["A", "C"]; chuỗi rỗng → []. */
export function parseSelectedLabels(value?: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(',').map(s => s.trim()).filter(Boolean))].sort();
}

/** Bật/tắt 1 nhãn trong chuỗi đã chọn: trả về chuỗi đã sắp xếp, không
 * trùng, nối bằng dấu phẩy, VD toggleSelectedLabel("A,C", "B") → "A,B,C". */
export function toggleSelectedLabel(value: string, label: string): string {
  const set = new Set(parseSelectedLabels(value));
  if (set.has(label)) set.delete(label);
  else set.add(label);
  return [...set].sort().join(',');
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Nhãn mức cho band IELTS (chỉ để tham khảo). */
export function bandLevel(band?: number | null): string {
  if (band == null) return '—';
  if (band < 5) return 'Cơ bản';
  if (band < 6) return 'Trung bình';
  if (band < 7) return 'Khá';
  if (band < 8) return 'Tốt';
  return 'Xuất sắc';
}

// Số câu THẬT trong đề. Luyện riêng 1 Part/Section thì danh sách chỉ chứa
// câu của Part đó nên số thứ tự trong danh sách (1–39) không phải số thật
// (32–70) — cộng thêm mốc đầu Part: TOEIC P1=1, P2=7, P3=32, P4=71,
// P5=101, P6=131, P7=147; IELTS Listening S1=1, S2=11, S3=21, S4=31,
// Reading P1=41, P2=54, P3=67 (part 5/6/7).
export const QUESTION_NUMBER_OFFSETS: Record<string, Record<number, number>> = {
  toeic: { 1: 1, 2: 7, 3: 32, 4: 71, 5: 101, 6: 131, 7: 147 },
  ielts: { 1: 1, 2: 11, 3: 21, 4: 31, 5: 41, 6: 54, 7: 67 },
};
export function realQuestionNumber(exam: string | null | undefined, part: number, indexWithinPart: number): number {
  const offsets = QUESTION_NUMBER_OFFSETS[exam || 'toeic'] || QUESTION_NUMBER_OFFSETS.toeic;
  return (offsets[part] ?? 1) + indexWithinPart - 1;
}

// Nội dung câu hỏi đôi khi đã chứa số câu ở đầu ("147. Where is...") do
// dữ liệu gốc giữ lại số — khi hiển thị số inline thì bỏ số đó đi để khỏi
// lặp "147. 147. ...". Chỉ bỏ khi số đầu câu đúng bằng số đang hiển thị.
export function stripLeadingNumber(content: string, n: number): string {
  return content.replace(new RegExp(`^${n}\\.\\s*`), '');
}

// ---- Màn hình chọn kỳ thi (hiện sau đăng nhập khi chưa chọn exam) ----

const FALLBACK_EXAMS: ExamInfo[] = [
  { id: 'toeic', title: 'TOEIC', subtitle: 'Listening + Reading', scale: '10–990', testSetCount: 20, questionCount: 4000 },
  { id: 'ielts', title: 'IELTS Academic', subtitle: 'Listening + Reading', scale: 'Band 0–9', testSetCount: 1, questionCount: 80 },
];

export function ExamPicker() {
  const { setExam } = useExam();
  const nav = useNavigate();
  const [exams, setExams] = useState<ExamInfo[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.exams().then(setExams).catch(setError);
  }, []);

  const list = exams?.length ? exams : FALLBACK_EXAMS;
  const pick = (id: string) => {
    if (id !== 'toeic' && id !== 'ielts') return;
    setExam(id);
    nav('/');
  };

  return (
    <div>
      <div className="hero">
        <h1>📚 Chọn kỳ thi</h1>
        <p className="sub">Chọn kỳ thi bạn muốn luyện — lần sau mở app sẽ vào thẳng kỳ thi này. Đổi được bất cứ lúc nào bằng nút “Đổi bài thi”.</p>
      </div>
      <ErrorBox error={error} />
      <div className="exam-pick">
        {list.map(e => (
          <div key={e.id} className="card" role="button" tabIndex={0} onClick={() => pick(e.id)}
            onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') pick(e.id); }}>
            <div style={{ fontSize: '1.6rem' }}>{e.id === 'ielts' ? '🎓' : '🌸'}</div>
            <h2 style={{ fontSize: '1.15rem', marginBottom: '.3rem' }}>{e.title}</h2>
            <p className="muted">{e.subtitle}</p>
            <p>
              {e.id === 'ielts'
                ? 'Listening 4 Section + Reading 3 Passage'
                : 'Listening + Reading, 7 Part'}
            </p>
            <p><span className="stat-num">{e.testSetCount}</span> đề • <span className="stat-num">{e.questionCount}</span> câu</p>
            <p>Thang điểm: <strong>{e.scale}</strong>{e.id === 'ielts' ? ' (band ước lượng để tham khảo)' : ' (điểm ước lượng)'}</p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <span className="btn">Chọn {e.title}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
