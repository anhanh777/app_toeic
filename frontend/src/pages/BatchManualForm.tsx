// Form thêm câu hỏi thủ công theo loạt cho 1 bộ đề.
// Mỗi Part nhập theo đúng cấu trúc đề thi thật, số câu chuẩn TOEIC được
// tính từ PART_STARTS (số bắt đầu của Part + vị trí trong Part) để admin
// khỏi nhầm số câu. Lưu 1 lần qua POST /questions/bulk: GỬI TẤT CẢ các câu
// (kể cả câu còn lỗi ở frontend), máy chủ trả { imported, errors } — câu
// hợp lệ vẫn được thêm, câu lỗi hiện theo index máy chủ trả về.
// Các câu gửi đi: KHÔNG gửi id (backend tự sinh), explanation để trống,
// difficulty 'medium', topic ''.
import { useState } from 'react';
import { api, type MediaConfig } from '../api';
import { uploadToCloudinary } from '../cloudinary';
import { STANDARD_COUNTS, splitValid } from '../testSetUtils';

// Số câu bắt đầu chuẩn của mỗi Part trong 1 đề TOEIC 200 câu.
export const PART_STARTS: Record<number, number> = { 1: 1, 2: 7, 3: 32, 4: 71, 5: 101, 6: 131, 7: 147 };

const LABELS_4 = ['A', 'B', 'C', 'D'];

interface OptRow {
  content: string;
  optA: string; optB: string; optC: string; optD: string;
  correct: string;
  imageUrl: string;
}

interface Cluster {
  title: string;
  script: string; // Part 3/4: transcript; Part 6/7: dùng passageText
  passageText: string;
  questions: OptRow[];
}

const emptyOptRow = (): OptRow => ({ content: '', optA: '', optB: '', optC: '', optD: '', correct: 'A', imageUrl: '' });
const makeCluster = (n: number): Cluster => ({ title: '', script: '', passageText: '', questions: Array.from({ length: n }, emptyOptRow) });

function optionsOf(row: OptRow, labels: string[]) {
  const byLabel: Record<string, string> = { A: row.optA, B: row.optB, C: row.optC, D: row.optD };
  return labels.map(label => ({ label, content: byLabel[label] }));
}

export default function BatchManualForm({
  testSetId, mediaCfg, partMedia, onSaved,
}: {
  testSetId: string;
  mediaCfg: MediaConfig | null;
  partMedia: Record<number, string>;
  onSaved: () => void;
}) {
  const [part, setPart] = useState(1);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const [serverErrors, setServerErrors] = useState<{ index: number; reason: string }[]>([]);
  const [uploading, setUploading] = useState<string>('');

  // Part 1: đúng 6 dòng cố định (câu 1–6). Part 2: đúng 25 dòng (câu 7–31).
  const [p1Rows, setP1Rows] = useState(() => Array.from({ length: 6 }, () => ({ correct: 'A', imageUrl: '' })));
  const [p2Rows, setP2Rows] = useState(() => Array.from({ length: 25 }, () => ({ correct: 'A' })));
  // Part 3/4: cụm hội thoại/bài nói, đúng 3 câu/cụm.
  const [p3Clusters, setP3Clusters] = useState<Cluster[]>(() => [makeCluster(3)]);
  const [p4Clusters, setP4Clusters] = useState<Cluster[]>(() => [makeCluster(3)]);
  // Part 5: dòng câu hỏi, mặc định 30 dòng, thêm/bớt được.
  const [p5Rows, setP5Rows] = useState<OptRow[]>(() => Array.from({ length: 30 }, emptyOptRow));
  // Part 6: cụm bài đọc, đúng 4 câu/cụm. Part 7: cụm bài đọc, 3 câu/cụm,
  // thêm/bớt dòng trong cụm được.
  const [p6Clusters, setP6Clusters] = useState<Cluster[]>(() => [makeCluster(4)]);
  const [p7Clusters, setP7Clusters] = useState<Cluster[]>(() => [makeCluster(3)]);

  const resetPart = (p: number) => {
    if (p === 1) setP1Rows(Array.from({ length: 6 }, () => ({ correct: 'A', imageUrl: '' })));
    if (p === 2) setP2Rows(Array.from({ length: 25 }, () => ({ correct: 'A' })));
    if (p === 3) setP3Clusters([makeCluster(3)]);
    if (p === 4) setP4Clusters([makeCluster(3)]);
    if (p === 5) setP5Rows(Array.from({ length: 30 }, emptyOptRow));
    if (p === 6) setP6Clusters([makeCluster(4)]);
    if (p === 7) setP7Clusters([makeCluster(3)]);
  };

  const changePart = (p: number) => {
    setPart(p); setError(null); setMsg(''); setLocalErrors([]); setServerErrors([]);
  };

  // Số câu chuẩn TOEIC của câu thứ `flatIndex` (đếm liên tiếp trong Part).
  const stdNum = (p: number, flatIndex: number) => PART_STARTS[p] + flatIndex;

  // Vị trí bắt đầu của cụm thứ clusterIdx trong Part (cộng dồn số câu
  // của các cụm trước nó).
  const clusterStart = (clusters: Cluster[], clusterIdx: number) => {
    let n = 0;
    for (let i = 0; i < clusterIdx; i++) n += clusters[i].questions.length;
    return n;
  };

  const base = (p: number): Record<string, unknown> => ({
    part: p, explanation: '', topic: '', difficulty: 'medium',
  });

  // Dựng toàn bộ câu sẽ gửi + số câu chuẩn tương ứng (để báo lỗi theo số câu).
  const buildQuestions = (): { questions: unknown[]; numbers: number[] } => {
    const questions: unknown[] = [];
    const numbers: number[] = [];
    const push = (q: Record<string, unknown>, num: number) => { questions.push(q); numbers.push(num); };

    if (part === 1) {
      // Câu chỉ-nghe: không có chữ in — gửi content '' và 4 phương án chỉ
      // có nhãn rỗng. Ảnh minh họa (nếu có) gửi kèm imageUrl.
      p1Rows.forEach((row, i) => push({
        ...base(1), content: '',
        options: LABELS_4.map(label => ({ label, content: '' })),
        correct: row.correct,
        ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
      }, stdNum(1, i)));
    } else if (part === 2) {
      // QUYẾT ĐỊNH ĐÃ CHỐT: đáp án Part 2 chỉ A/B/C theo đề thi thật và
      // validator hiện có (validateQuestion yêu cầu đúng 3 phương án A–C),
      // KHÔNG thêm D. Gửi content '' và 3 phương án chỉ có nhãn rỗng.
      p2Rows.forEach((row, i) => push({
        ...base(2), content: '',
        options: ['A', 'B', 'C'].map(label => ({ label, content: '' })),
        correct: row.correct,
      }, stdNum(2, i)));
    } else if (part === 3 || part === 4) {
      const clusters = part === 3 ? p3Clusters : p4Clusters;
      clusters.forEach((cl, ci) => {
        const passageId = `${testSetId}-P${part}-${Date.now().toString(36)}-${ci}`;
        cl.questions.forEach((row, qi) => push({
          ...base(part), content: row.content,
          options: optionsOf(row, LABELS_4), correct: row.correct,
          passageId, passageTitle: cl.title, script: cl.script, passageText: cl.script,
          ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
        }, stdNum(part, clusterStart(clusters, ci) + qi)));
      });
    } else if (part === 5) {
      p5Rows.forEach((row, i) => push({
        ...base(5), content: row.content,
        options: optionsOf(row, LABELS_4), correct: row.correct,
      }, stdNum(5, i)));
    } else if (part === 6) {
      p6Clusters.forEach((cl, ci) => {
        const passageId = `${testSetId}-P6-${Date.now().toString(36)}-${ci}`;
        cl.questions.forEach((row, qi) => {
          const num = stdNum(6, clusterStart(p6Clusters, ci) + qi);
          // Ô nội dung câu hỏi không bắt buộc vì chỗ trống đã nằm trong
          // đoạn văn — nhưng validator Part 6 yêu cầu content, nên khi ô
          // trống thì tự điền placeholder `Câu hỏi ${số câu}` để qua
          // validator. Placeholder này KHÔNG hiện cho admin như nội dung
          // thật (chỉ nằm trong dữ liệu gửi đi).
          push({
            ...base(6), content: row.content.trim() ? row.content : `Câu hỏi ${num}`,
            options: optionsOf(row, LABELS_4), correct: row.correct,
            passageId, passageTitle: cl.title, passageText: cl.passageText,
          }, num);
        });
      });
    } else {
      p7Clusters.forEach((cl, ci) => {
        const passageId = `${testSetId}-P7-${Date.now().toString(36)}-${ci}`;
        cl.questions.forEach((row, qi) => push({
          ...base(7), content: row.content,
          options: optionsOf(row, LABELS_4), correct: row.correct,
          passageId, passageTitle: cl.title, passageText: cl.passageText,
          ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
        }, stdNum(7, clusterStart(p7Clusters, ci) + qi)));
      });
    }
    return { questions, numbers };
  };

  const saveAll = async () => {
    setBusy(true); setError(null); setMsg(''); setServerErrors([]);
    try {
      const { questions, numbers } = buildQuestions();
      if (!questions.length) { setError(new Error('Chưa có câu hỏi nào để lưu.')); return; }
      // Báo lỗi từng dòng TRƯỚC khi lưu (theo số câu chuẩn), nhưng vẫn
      // GỬI TẤT CẢ qua bulk như đã chốt — máy chủ trả lỗi theo index, câu
      // hợp lệ vẫn được thêm.
      const { errors } = splitValid(questions);
      setLocalErrors(errors.map(e => `Câu ${numbers[e.index] ?? e.index + 1}: ${e.reason}`));
      const r = await api.adminBulkAddTestSetQuestions(testSetId, questions);
      setServerErrors(r.errors.map(e => ({ ...e, index: e.index })));
      setMsg(`Đã thêm ${r.imported} câu vào Part ${part}.${r.errors.length ? ` ${r.errors.length} câu lỗi (xem danh sách bên dưới).` : ''}`);
      if (r.imported > 0) { resetPart(part); onSaved(); }
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  // Upload ảnh cho 1 dòng/câu: chọn file là upload ngay lên Cloudinary,
  // chỉ lưu URL vào câu khi bấm "💾 Lưu tất cả".
  const onImage = async (file: File, key: string, setUrl: (url: string) => void) => {
    if (!mediaCfg?.configured) { setError(new Error('Chưa cấu hình Cloudinary — xem README')); return; }
    setUploading(key); setError(null);
    try {
      const url = await uploadToCloudinary(file, 'toeic/images', mediaCfg);
      setUrl(url);
    } catch (e) { setError(e); } finally { setUploading(''); }
  };

  const fileInput = (key: string, onFile: (f: File) => void) => (
    <label className="btn secondary" style={{ cursor: 'pointer' }}>
      🖼 Chọn ảnh (.png/.jpg/.jpeg, ≤ 5MB)
      <input type="file" accept=".png,.jpg,.jpeg" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
      {uploading === key && <span className="muted"> Đang tải ảnh…</span>}
    </label>
  );

  // Hàng radio/pill chọn đáp án đúng (A–D, hoặc A–C cho Part 2) — gọn
  // trong 1 dòng cùng chữ "Đáp án:", thay cho ô <select> chiếm cả khối.
  const correctPills = (value: string, onChange: (v: string) => void, name: string, labels: string[] = LABELS_4) => (
    <span className="radio-pills">
      {labels.map(l => (
        <label key={l} className="radio-pill">
          <input type="radio" name={name} value={l} checked={value === l} onChange={() => onChange(l)} />{l}
        </label>
      ))}
    </span>
  );

  // 1 dòng câu hỏi có nội dung + 4 phương án + đáp án (dùng cho Part 5/7,
  // và trong cụm Part 3/4/6 — Part 6 có thể để trống nội dung).
  // Bố cục tờ đề: số câu in đậm ở đầu, nội dung, 4 phương án lưới 2 cột,
  // hàng "Đáp án:" + pill radio cùng 1 dòng — không còn hộp panel riêng.
  const optRowFields = (
    row: OptRow, setRow: (r: OptRow) => void, num: number,
    opts: { withImage?: boolean; imageKey?: string; onImage?: (f: File) => void; contentOptional?: boolean } = {},
  ) => (
    <div className="paper-q" key={num}>
      <label><span className="q-num">{num}.</span>Nội dung câu hỏi{opts.contentOptional ? ' (không bắt buộc — chỗ trống đã nằm trong đoạn văn)' : ''}</label>
      <textarea rows={2} value={row.content} onChange={e => setRow({ ...row, content: e.target.value })} />
      <div className="paper-opts">
        {(['A', 'B', 'C', 'D'] as const).map(l => (
          <div key={l}>
            <label>Phương án {l}</label>
            <input value={row[`opt${l}` as 'optA' | 'optB' | 'optC' | 'optD']} onChange={e => setRow({ ...row, [`opt${l}`]: e.target.value } as OptRow)} />
          </div>
        ))}
      </div>
      <div className="answer-line">
        <label>Đáp án:</label>
        {correctPills(row.correct, v => setRow({ ...row, correct: v }), `q-${num}`)}
      </div>
      {opts.withImage && (
        <>
          <label>Ảnh minh họa (không bắt buộc)</label>
          <div className="btn-row">
            {opts.imageKey && opts.onImage && fileInput(opts.imageKey, opts.onImage)}
          </div>
          {row.imageUrl && <img src={row.imageUrl} alt="Ảnh minh họa" style={{ maxWidth: 280, borderRadius: 10 }} />}
        </>
      )}
    </div>
  );

  const clusterFields = (
    cl: Cluster, setCl: (c: Cluster) => void, clusterIdx: number, clusters: Cluster[],
    opts: { scriptLabel: string; passageLabel: string; withImage: boolean; fixedCount: number | null },
  ) => {
    const start = clusterStart(clusters, clusterIdx);
    return (
      <div className="paper-cluster" key={clusterIdx}>
        <h4>{part === 3 ? 'Đoạn hội thoại' : part === 4 ? 'Bài nói' : 'Bài đọc'} {clusterIdx + 1}
          {' '}— câu {stdNum(part, start)}–{stdNum(part, start + cl.questions.length - 1)}
        </h4>
        <label>Tên đoạn (không bắt buộc)</label>
        <input value={cl.title} onChange={e => setCl({ ...cl, title: e.target.value })} />
        {part === 3 || part === 4 ? (
          <>
            <label>{opts.scriptLabel} (không bắt buộc)</label>
            <textarea rows={4} value={cl.script} onChange={e => setCl({ ...cl, script: e.target.value })} />
          </>
        ) : (
          <>
            <label>{opts.passageLabel}</label>
            <textarea rows={5} value={cl.passageText} onChange={e => setCl({ ...cl, passageText: e.target.value })}
              placeholder={part === 6 ? 'Gõ đoạn văn kèm chỗ trống, vd: 131._______' : 'Gõ đoạn văn…'} />
          </>
        )}
        {cl.questions.map((row, qi) => {
          const num = stdNum(part, start + qi);
          const setRow = (r: OptRow) => setCl({ ...cl, questions: cl.questions.map((q, i) => i === qi ? r : q) });
          const key = `p${part}-${clusterIdx}-${qi}`;
          return optRowFields(row, setRow, num, {
            withImage: opts.withImage,
            imageKey: key,
            onImage: f => void onImage(f, key, url => setRow({ ...row, imageUrl: url })),
            contentOptional: part === 6,
          });
        })}
        {opts.fixedCount === null && (
          <div className="btn-row">
            <button type="button" className="btn secondary" onClick={() => setCl({ ...cl, questions: [...cl.questions, emptyOptRow()] })}>＋ Thêm câu hỏi</button>
            <button type="button" className="btn ghost" disabled={cl.questions.length <= 1}
              onClick={() => setCl({ ...cl, questions: cl.questions.slice(0, -1) })}>− Bớt câu cuối</button>
          </div>
        )}
      </div>
    );
  };

  const clusterList = (
    clusters: Cluster[], setClusters: (cs: Cluster[]) => void,
    opts: { scriptLabel: string; passageLabel: string; withImage: boolean; fixedCount: number | null; addLabel: string },
  ) => (
    <>
      {clusters.map((cl, ci) => clusterFields(cl, c => setClusters(clusters.map((x, i) => i === ci ? c : x)), ci, clusters, opts))}
      <div className="btn-row">
        <button type="button" className="btn secondary" onClick={() => setClusters([...clusters, makeCluster(opts.fixedCount ?? 3)])}>{opts.addLabel}</button>
        {clusters.length > 1 && (
          <button type="button" className="btn ghost" onClick={() => setClusters(clusters.slice(0, -1))}>− Bớt cụm cuối</button>
        )}
      </div>
    </>
  );

  const totalRows = part === 1 ? 6 : part === 2 ? 25 : part === 5 ? p5Rows.length
    : part === 3 ? p3Clusters.reduce((n, c) => n + c.questions.length, 0)
    : part === 4 ? p4Clusters.reduce((n, c) => n + c.questions.length, 0)
    : part === 6 ? p6Clusters.reduce((n, c) => n + c.questions.length, 0)
    : p7Clusters.reduce((n, c) => n + c.questions.length, 0);

  return (
    <div className="card">
      <h2>✍️ Thêm thủ công theo loạt</h2>
      <p className="muted">Nhập nhiều câu cùng lúc rồi lưu 1 lần. Số câu hiện theo chuẩn TOEIC (Part {part}: câu {PART_STARTS[part]}–{PART_STARTS[part] + STANDARD_COUNTS[part] - 1}, chuẩn {STANDARD_COUNTS[part]} câu).</p>
      <label>Chọn Part</label>
      <select value={part} onChange={e => changePart(Number(e.target.value))}>
        {[1, 2, 3, 4, 5, 6, 7].map(p => (
          <option key={p} value={p}>Part {p} — {totalRows && p === part ? `${totalRows} câu đang nhập` : `${STANDARD_COUNTS[p]} câu chuẩn`} (câu {PART_STARTS[p]}–{PART_STARTS[p] + STANDARD_COUNTS[p] - 1})</option>
        ))}
      </select>
      {part <= 4 && (
        <p className="muted">🎧 Audio cả Part {part}: {partMedia[part] ? 'đã có ✅' : 'chưa có'} (upload ở mục 🎧 Audio cả Part phía trên). Form này không cần ô audio riêng từng câu/cụm.</p>
      )}
      {error ? <div className="error">{error instanceof Error ? error.message : 'Đã xảy ra lỗi.'}</div> : null}
      {msg && <div className="success">{msg}</div>}
      {localErrors.length > 0 && (
        <div className="panel">
          <h4>⚠ Câu chưa hợp lệ (kiểm tra trước khi lưu — vẫn gửi tất cả, máy chủ sẽ báo lại)</h4>
          <ul>{localErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {serverErrors.length > 0 && (
        <div className="panel">
          <h4>⚠ Lỗi máy chủ trả về</h4>
          <ul>{serverErrors.map((e, i) => <li key={i}>Câu {e.index + 1} trong đợt gửi: {e.reason}</li>)}</ul>
        </div>
      )}

      {/* Tờ đề thi: toàn bộ câu của 1 Part nằm trong 1 khối giấy duy nhất,
          các câu nối tiếp nhau bằng đường kẻ mảnh, không hộp lồng nhau. */}
      <div className="paper">
      {part === 1 && (
        <>
          <p className="muted">Part 1: đúng 6 dòng cố định (câu 1–6). Mỗi câu chỉ có ảnh + đáp án đúng — không có ô nội dung/phương án.</p>
          <div className="p1-grid">
          {p1Rows.map((row, i) => {
            const key = `p1-${i}`;
            return (
              <div className="p1-cell" key={i}>
                <span className="q-num">Câu {stdNum(1, i)}</span>
                <label>Ảnh minh họa</label>
                <div className="btn-row">{fileInput(key, f => void onImage(f, key, url => setP1Rows(p1Rows.map((r, j) => j === i ? { ...r, imageUrl: url } : r))))}</div>
                {row.imageUrl && <img src={row.imageUrl} alt="Ảnh minh họa" />}
                <div className="answer-line">
                  <label>Đáp án:</label>
                  {correctPills(row.correct, v => setP1Rows(p1Rows.map((r, j) => j === i ? { ...r, correct: v } : r)), `p1-${i}`)}
                </div>
              </div>
            );
          })}
          </div>
        </>
      )}

      {part === 2 && (
        <>
          <p className="muted">Part 2: đúng 25 dòng cố định (câu 7–31). Mỗi câu chỉ chọn đáp án đúng (A/B/C) — không có ô nội dung.</p>
          <div className="p2-list">
          {p2Rows.map((row, i) => (
            <div className="p2-row" key={i}>
              <span className="q-num">{stdNum(2, i)}.</span>
              {/* Đáp án Part 2 chỉ A/B/C theo đề thi thật và validator hiện có, KHÔNG thêm D. */}
              {correctPills(row.correct, v => setP2Rows(p2Rows.map((r, j) => j === i ? { ...r, correct: v } : r)), `p2-${i}`, ['A', 'B', 'C'])}
            </div>
          ))}
          </div>
        </>
      )}

      {part === 3 && clusterList(p3Clusters, setP3Clusters, { scriptLabel: 'Script / transcript đoạn hội thoại', passageLabel: '', withImage: true, fixedCount: 3, addLabel: '＋ Thêm đoạn hội thoại' })}
      {part === 4 && clusterList(p4Clusters, setP4Clusters, { scriptLabel: 'Script / transcript bài nói', passageLabel: '', withImage: true, fixedCount: 3, addLabel: '＋ Thêm bài nói' })}

      {part === 5 && (
        <>
          <p className="muted">Part 5: mỗi dòng là 1 câu hỏi (mặc định 30 dòng, thêm/bớt được).</p>
          {p5Rows.map((row, i) => optRowFields(row, r => setP5Rows(p5Rows.map((x, j) => j === i ? r : x)), stdNum(5, i)))}
          <div className="btn-row">
            <button type="button" className="btn secondary" onClick={() => setP5Rows([...p5Rows, emptyOptRow()])}>＋ Thêm dòng</button>
            <button type="button" className="btn ghost" disabled={p5Rows.length <= 1} onClick={() => setP5Rows(p5Rows.slice(0, -1))}>− Bớt dòng cuối</button>
          </div>
        </>
      )}

      {part === 6 && clusterList(p6Clusters, setP6Clusters, { scriptLabel: '', passageLabel: 'Bài đọc (gõ đoạn văn kèm chỗ trống dạng "131._______")', withImage: false, fixedCount: 4, addLabel: '＋ Thêm bài đọc' })}
      {part === 7 && clusterList(p7Clusters, setP7Clusters, { scriptLabel: '', passageLabel: 'Bài đọc', withImage: true, fixedCount: null, addLabel: '＋ Thêm bài đọc' })}
      </div>

      {/* Thanh lưu dính cuối form: nút Lưu luôn thấy được khi cuộn. */}
      <div className="paper-savebar">
        <button type="button" className="btn" disabled={busy} onClick={() => void saveAll()}>
          {busy ? 'Đang lưu…' : `💾 Lưu tất cả (${totalRows} câu — Part ${part})`}
        </button>
      </div>
    </div>
  );
}
