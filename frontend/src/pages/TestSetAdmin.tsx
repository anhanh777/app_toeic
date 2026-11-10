import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, type Question, type TestSet, type ImportQuestion, type AiParseResult } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, partName } from '../components';
import { STANDARD_COUNTS, normalizeImportFile, splitValid, validateQuestion, type QuestionError } from '../testSetUtils';

interface AiPreview extends AiParseResult {
  fileName: string;
}

interface PartPreview {
  part: number;
  valid: ImportQuestion[];
  errors: QuestionError[];
  fileName: string;
}

const emptyManual = {
  content: '', optA: '', optB: '', optC: '', optD: '', correct: 'A',
  explanation: '', script: '', passageId: '', passageTitle: '', passageText: '', topic: '', difficulty: 'medium',
};

export default function TestSetAdmin() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [ts, setTs] = useState<TestSet | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PartPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualPart, setManualPart] = useState<number | null>(null);
  const [manual, setManual] = useState(emptyManual);
  const [listPart, setListPart] = useState<number | null>(null);
  const [listQuestions, setListQuestions] = useState<Question[]>([]);
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [aiKeyMissing, setAiKeyMissing] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    api.testSet(id).then(setTs).catch(setError).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  if (user?.role !== 'admin') {
    return <div className="card"><h1>Không có quyền truy cập</h1><p>Bạn không có quyền xem trang này.</p></div>;
  }
  if (loading) return <p>Đang tải đề thi…</p>;
  if (!ts) return <div><ErrorBox error={error} /><p>Không tìm thấy bộ đề. <Link to="/admin">Quay lại trang Quản trị</Link></p></div>;

  const countOf = (p: number) => ts.parts.find(x => x.part === p)?.count || 0;

  const togglePublish = async () => {
    setError(null); setMsg('');
    try {
      const updated = await api.adminUpdateTestSet(ts.id, { isPublished: !ts.isPublished });
      setTs(updated);
      setMsg(updated.isPublished ? 'Đã phát hành đề.' : 'Đã chuyển đề về Nháp.');
    } catch (e) { setError(e); }
  };

  const onPartFile = async (file: File, part: number) => {
    setError(null); setMsg(''); setPreview(null);
    try {
      const parsed = JSON.parse(await file.text());
      const norm = normalizeImportFile(parsed);
      const ofPart = norm.questions.filter(q => (q as { part?: unknown }).part === part || Number((q as { part?: unknown }).part) === part);
      const others = norm.questions.length - ofPart.length;
      const { valid, errors } = splitValid(ofPart);
      if (others > 0) setMsg(`File có ${others} câu không thuộc Part ${part} — đã bỏ qua.`);
      setPreview({ part, valid, errors, fileName: file.name });
    } catch (e) {
      setError(e instanceof SyntaxError ? new Error('File JSON không hợp lệ. Kiểm tra lại định dạng.') : e);
    }
  };

  const confirmPartImport = async () => {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const r = await api.adminImportTestSet(ts.id, preview.valid);
      setMsg(`Đã import ${r.imported} câu vào Part ${preview.part}. ${r.errors.length ? `Lỗi từ máy chủ: ${r.errors.map(e => `#${e.index}${e.id ? ` (${e.id})` : ''}: ${e.reason}`).join('; ')}` : ''}`);
      setPreview(null);
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const onAiParse = async () => {
    if (!aiFile) return;
    setAiBusy(true); setError(null); setMsg(''); setAiKeyMissing(false); setAiPreview(null);
    try {
      const r = await api.aiParseTestSet(ts.id, aiFile);
      setAiPreview({ ...r, fileName: aiFile.name });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 501 || e.code === 'gemini_not_configured')) setAiKeyMissing(true);
      else setError(e);
    } finally { setAiBusy(false); }
  };

  const setAiCorrect = (index: number, correct: string) => {
    setAiPreview(prev => prev ? {
      ...prev,
      questions: prev.questions.map((q, i) => i === index ? { ...q, correct } : q),
    } : prev);
  };

  const confirmAiImport = async () => {
    if (!aiPreview) return;
    const { valid, errors } = splitValid(aiPreview.questions);
    if (errors.length > 0) {
      setError(new Error(`Còn ${errors.length} câu lỗi — hãy chọn đáp án đúng cho các câu bị lỗi trước khi import: ${errors.map(e => `#${e.index + 1}: ${e.reason}`).join('; ')}`));
      return;
    }
    setBusy(true); setError(null);
    try {
      const r = await api.adminImportTestSet(ts.id, valid);
      setMsg(`Đã import ${r.imported} câu từ file AI vào đề. ${r.errors.length ? `Lỗi từ máy chủ: ${r.errors.map(e => `#${e.index}${e.id ? ` (${e.id})` : ''}: ${e.reason}`).join('; ')}` : ''}`);
      setAiPreview(null); setAiFile(null);
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  // Số câu AI còn lỗi theo validate hiện tại (giảm dần khi admin sửa đáp án tay).
  const aiLiveErrorCount = aiPreview
    ? aiPreview.questions.filter((q, i) => validateQuestion(q, i)).length
    : 0;

  const saveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPart == null) return;
    setBusy(true); setError(null); setMsg('');
    try {
      const body: Record<string, unknown> = {
        part: manualPart, content: manual.content, explanation: manual.explanation,
        topic: manual.topic, difficulty: manual.difficulty, script: manual.script,
        passageId: manual.passageId, passageTitle: manual.passageTitle, passageText: manual.passageText,
        options: [
          { label: 'A', content: manual.optA }, { label: 'B', content: manual.optB },
          { label: 'C', content: manual.optC }, { label: 'D', content: manual.optD },
        ],
        correct: manual.correct,
      };
      await api.adminAddTestSetQuestion(ts.id, body);
      setMsg(`Đã thêm câu hỏi vào Part ${manualPart}.`);
      setManual(emptyManual); setManualPart(null);
      load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const toggleList = async (p: number) => {
    if (listPart === p) { setListPart(null); return; }
    setError(null);
    try {
      const items = await api.questions(p, 100, 0, '', ts.id);
      setListQuestions(items); setListPart(p);
    } catch (e) { setError(e); }
  };

  return (
    <div>
      <p><Link to="/admin">← Quay lại trang Quản trị</Link></p>
      <h1>{ts.title}</h1>
      {ts.description && <p className="muted">{ts.description}</p>}
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      <div className="card">
        <p>
          <span className="stat-num">{ts.totalQuestions}</span> / 200 câu •
          {' '}<span className="pill">{ts.isPublished ? 'ĐÃ PHÁT HÀNH' : 'NHÁP'}</span>
          {' '}• Tạo ngày {ts.createdAt ? new Date(ts.createdAt).toLocaleDateString('vi-VN') : '—'}
        </p>
        {ts.missing.length > 0 && (
          <p style={{ color: '#ffb800' }}>⚠ Chưa đủ câu: {ts.missing.map(m => `Part ${m.part} thiếu ${m.missing} câu`).join(', ')}</p>
        )}
        <div className="btn-row">
          <button className="btn gold" onClick={togglePublish}>{ts.isPublished ? '⏸ Bỏ phát hành' : '🚀 Phát hành đề'}</button>
        </div>
      </div>

      <div className="card">
        <h2>🤖 Nhận diện bằng AI</h2>
        <p className="muted">Upload file đề Word/PDF/ảnh, AI sẽ tách thành câu hỏi để bạn kiểm tra trước khi thêm vào đề.</p>
        <div className="btn-row">
          <label className="btn secondary" style={{ cursor: 'pointer' }}>
            📄 Chọn file đề
            <input
              type="file" accept=".txt,.docx,.doc,.pdf,.png,.jpg,.jpeg" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { setAiFile(f); setAiPreview(null); setAiKeyMissing(false); setError(null); setMsg(''); } e.target.value = ''; }}
            />
          </label>
          <button className="btn" disabled={!aiFile || aiBusy} onClick={() => void onAiParse()}>
            {aiBusy ? 'Đang nhận diện…' : '🤖 Nhận diện bằng AI'}
          </button>
        </div>
        {aiFile && <p className="muted">Đã chọn: {aiFile.name}</p>}
        {aiBusy && <p>Đang nhận diện, chờ khoảng 10–60 giây…</p>}
        {aiKeyMissing && (
          <div className="error">
            Chưa cấu hình GEMINI_API_KEY trên máy chủ. Cần thêm GEMINI_API_KEY trong phần Environment của backend trên Render rồi deploy lại.
          </div>
        )}
        {aiPreview && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3>Xem trước AI — {aiPreview.fileName}</h3>
            <p>{aiPreview.questions.length} câu parse được • {aiLiveErrorCount} câu còn lỗi</p>
            {aiPreview.warnings.length > 0 && (
              <p style={{ color: '#ffb800' }}>⚠ {aiPreview.warnings.join(' ')}</p>
            )}
            <table>
              <thead><tr><th>#</th><th>Part</th><th>Nội dung</th><th>Đáp án đúng</th><th>Lý do lỗi</th></tr></thead>
              <tbody>
                {aiPreview.questions.map((q, i) => {
                  const inv = aiPreview.invalid.find(x => x.index === i);
                  const liveErr = validateQuestion(q, i);
                  const needsFix = !q.correct || !!inv;
                  const reason = liveErr ? (inv?.reason || liveErr.reason) : '';
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>Part {q.part}</td>
                      <td>{q.content.length > 120 ? `${q.content.slice(0, 120)}…` : q.content}</td>
                      <td>
                        {needsFix ? (
                          <select value={q.correct || ''} onChange={e => setAiCorrect(i, e.target.value)}>
                            <option value="">— Chọn —</option>
                            {['A', 'B', 'C', 'D'].map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        ) : q.correct}
                      </td>
                      <td>{reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="btn-row">
              <button className="btn" disabled={busy} onClick={() => void confirmAiImport()}>
                {busy ? 'Đang import…' : `✅ Xác nhận thêm vào đề (${aiPreview.questions.length - aiLiveErrorCount} câu)`}
              </button>
              <button className="btn secondary" onClick={() => setAiPreview(null)}>Hủy</button>
            </div>
          </div>
        )}
      </div>

      {[1, 2, 3, 4, 5, 6, 7].map(p => (
        <div key={p} className="card">
          <h2>{partName(p)}</h2>
          <p><span className="stat-num">{countOf(p)}/{STANDARD_COUNTS[p]}</span> câu</p>
          <div className="bar"><i style={{ width: `${Math.min(100, Math.round((countOf(p) / STANDARD_COUNTS[p]) * 100))}%` }} /></div>
          <div className="btn-row">
            <label className="btn secondary" style={{ cursor: 'pointer' }}>
              ⬆ Upload Part này
              <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void onPartFile(f, p); e.target.value = ''; }} />
            </label>
            <button className="btn" onClick={() => { setManualPart(p); setManual(emptyManual); setPreview(null); }}>✏ Thêm câu thủ công</button>
            <button className="btn ghost" onClick={() => void toggleList(p)}>{listPart === p ? 'Ẩn danh sách' : 'Xem danh sách câu'}</button>
          </div>
          <p className="muted">Nút này chỉ nhận file JSON. File Word/PDF/ảnh thì dùng mục 🤖 Nhận diện bằng AI ở phía trên trang này.</p>

          {preview && preview.part === p && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3>Xem trước — {preview.fileName}</h3>
              <p>{preview.valid.length} câu hợp lệ cho Part {p} • {preview.errors.length} câu lỗi (sẽ bị bỏ qua)</p>
              {preview.errors.length > 0 && (
                <table><thead><tr><th>#</th><th>Lý do</th></tr></thead><tbody>
                  {preview.errors.map(e => <tr key={e.index}><td>{e.index + 1}{e.id ? ` (${e.id})` : ''}</td><td>{e.reason}</td></tr>)}
                </tbody></table>
              )}
              <div className="btn-row">
                <button className="btn" disabled={busy || !preview.valid.length} onClick={() => void confirmPartImport()}>{busy ? 'Đang import…' : `Xác nhận import ${preview.valid.length} câu`}</button>
                <button className="btn secondary" onClick={() => setPreview(null)}>Hủy</button>
              </div>
            </div>
          )}

          {manualPart === p && (
            <form className="card" style={{ marginTop: '1rem' }} onSubmit={saveManual}>
              <h3>Thêm câu thủ công — Part {p}</h3>
              <label>Nội dung câu hỏi (tiếng Anh)</label>
              <textarea rows={3} value={manual.content} onChange={e => setManual({ ...manual, content: e.target.value })} required />
              <label>Phương án A</label><input value={manual.optA} onChange={e => setManual({ ...manual, optA: e.target.value })} required />
              <label>Phương án B</label><input value={manual.optB} onChange={e => setManual({ ...manual, optB: e.target.value })} required />
              <label>Phương án C</label><input value={manual.optC} onChange={e => setManual({ ...manual, optC: e.target.value })} required />
              <label>Phương án D</label><input value={manual.optD} onChange={e => setManual({ ...manual, optD: e.target.value })} required />
              <label>Đáp án đúng</label>
              <select value={manual.correct} onChange={e => setManual({ ...manual, correct: e.target.value })}>
                {['A', 'B', 'C', 'D'].map(l => <option key={l}>{l}</option>)}
              </select>
              <label>Giải thích (tiếng Việt, ngắn)</label><textarea rows={2} value={manual.explanation} onChange={e => setManual({ ...manual, explanation: e.target.value })} />
              <label>Script / transcript (Part 1–4)</label><textarea rows={2} value={manual.script} onChange={e => setManual({ ...manual, script: e.target.value })} />
              <label>ID đoạn (passageId, không bắt buộc)</label><input value={manual.passageId} onChange={e => setManual({ ...manual, passageId: e.target.value })} />
              <label>Tiêu đề đoạn (passageTitle, không bắt buộc)</label><input value={manual.passageTitle} onChange={e => setManual({ ...manual, passageTitle: e.target.value })} />
              <label>Đoạn văn (passageText, không bắt buộc)</label><textarea rows={3} value={manual.passageText} onChange={e => setManual({ ...manual, passageText: e.target.value })} />
              <label>Chủ đề</label><input value={manual.topic} onChange={e => setManual({ ...manual, topic: e.target.value })} />
              <label>Độ khó</label>
              <select value={manual.difficulty} onChange={e => setManual({ ...manual, difficulty: e.target.value })}>
                <option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option>
              </select>
              <div className="btn-row">
                <button className="btn" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu câu hỏi'}</button>
                <button type="button" className="btn secondary" onClick={() => setManualPart(null)}>Hủy</button>
              </div>
            </form>
          )}

          {listPart === p && (
            <div style={{ marginTop: '1rem' }}>
              <p className="muted">{listQuestions.length} câu đã tải (tối đa 100).</p>
              <table><thead><tr><th>Mã</th><th>Nội dung</th></tr></thead><tbody>
                {listQuestions.map(q => <tr key={q.id}><td>{q.id}</td><td>{q.content.slice(0, 100)}</td></tr>)}
              </tbody></table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
