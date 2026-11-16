import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type ImportQuestion, type Question, type TestSet, type Vocab } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Modal, Toggle, partName } from '../components';
import { countByPart, normalizeImportFile, splitValid, type QuestionError } from '../testSetUtils';
import { isFillIn, QUESTION_TYPE_NAMES, questionTypeName } from '../exam';

interface UploadPreview {
  title: string; description: string;
  valid: ImportQuestion[]; errors: QuestionError[]; fileName: string;
}

const emptyQ = { id: '', part: 5, content: '', explanation: '', topic: '', difficulty: 'medium', script: '', passageText: '', exam: 'toeic', questionType: 'multiple_choice', wordLimit: '', correctText: '', acceptedAnswers: '' };

export default function Admin() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [vocabs, setVocabs] = useState<Vocab[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const [partFilter, setPartFilter] = useState<number | undefined>(undefined);
  const [examFilter, setExamFilter] = useState<'all' | 'toeic' | 'ielts'>('all');
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [tsForm, setTsForm] = useState({ title: '', description: '', isPublished: false, exam: 'toeic' });
  const [editingSet, setEditingSet] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [form, setForm] = useState(emptyQ);
  const [editing, setEditing] = useState<string | null>(null);
  const [optA, setOptA] = useState(''); const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState(''); const [optD, setOptD] = useState('');
  const [correct, setCorrect] = useState('A');
  const [importText, setImportText] = useState('');
  const [vocabForm, setVocabForm] = useState({ id: '', word: '', phonetic: '', meaning: '', example: '', topic: '' });
  const [vocabImport, setVocabImport] = useState('');

  const load = () => {
    const ex = examFilter === 'all' ? undefined : examFilter;
    api.adminQuestions(partFilter, 50, 0, ex).then(setQuestions).catch(setError);
    api.adminVocabulary().then(setVocabs).catch(() => undefined);
    api.testSets(ex).then(setTestSets).catch(() => undefined);
  };
  useEffect(load, [partFilter, examFilter]);

  const loadTestSets = () => api.testSets(examFilter === 'all' ? undefined : examFilter).then(setTestSets).catch(setError);

  if (user?.role !== 'admin') {
    return <div className="card"><h1>Không có quyền truy cập</h1><p>Trang quản trị chỉ dành cho tài khoản admin. Tài khoản của bạn không có quyền xem trang này.</p></div>;
  }

  const saveQuestion = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg('');
    const fillIn = isFillIn(form.questionType);
    const accepted = form.acceptedAnswers.split('\n').map(s => s.trim()).filter(Boolean);
    const body = {
      id: form.id, part: form.part, content: form.content, explanation: form.explanation,
      topic: form.topic, difficulty: form.difficulty, script: form.script, passageText: form.passageText,
      exam: form.exam, questionType: form.questionType,
      wordLimit: form.wordLimit ? Number(form.wordLimit) : undefined,
      correctText: fillIn ? form.correctText : undefined,
      acceptedAnswers: accepted.length ? accepted : undefined,
      // Câu điền từ không dùng options A–D: đáp án đúng là correctText.
      options: fillIn ? [] : [{ label: 'A', content: optA }, { label: 'B', content: optB }, { label: 'C', content: optC }, { label: 'D', content: optD }],
      correct: fillIn ? form.correctText : correct,
    };
    try {
      if (editing) await api.adminUpdateQuestion(editing, body);
      else await api.adminCreateQuestion(body);
      setMsg('Đã lưu câu hỏi.'); setForm(emptyQ); setEditing(null); setOptA(''); setOptB(''); setOptC(''); setOptD(''); load();
    } catch (err) { setError(err); }
  };

  const editQ = (q: Question) => {
    setEditing(q.id);
    setForm({ id: q.id, part: q.part, content: q.content, explanation: q.explanation || '', topic: q.topic || '', difficulty: q.difficulty || 'medium', script: q.script || '', passageText: q.passageText || '', exam: q.exam || 'toeic', questionType: q.questionType || 'multiple_choice', wordLimit: q.wordLimit != null ? String(q.wordLimit) : '', correctText: q.correctText || '', acceptedAnswers: (q.acceptedAnswers || []).join('\n') });
    const get = (l: string) => q.options.find(o => o.label === l)?.content || '';
    setOptA(get('A')); setOptB(get('B')); setOptC(get('C')); setOptD(get('D'));
    setCorrect(q.correct || q.options.find(o => o.is_correct)?.label || 'A');
  };

  const importQuestions = async () => {
    setError(null); setMsg('');
    try {
      const parsed = JSON.parse(importText);
      const arr = Array.isArray(parsed) ? parsed : parsed.questions;
      const r = await api.adminImportQuestions(arr);
      setMsg(`Đã import ${r.imported} câu. ${r.errors.length ? `Lỗi: ${r.errors.map(e => `#${e.index}: ${e.reason}`).join('; ')}` : ''}`);
      load();
    } catch (err) { setError(err instanceof SyntaxError ? new Error('JSON không hợp lệ. Kiểm tra lại định dạng.') : err); }
  };

  const importFromFile = async (file: File, kind: 'q' | 'v') => {
    const text = await file.text();
    if (kind === 'q') setImportText(text); else setVocabImport(text);
  };

  const saveVocab = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg('');
    try {
      if (vocabs.some(v => v.id === vocabForm.id)) await api.adminUpdateVocab(vocabForm.id, vocabForm);
      else await api.adminCreateVocab(vocabForm);
      setMsg('Đã lưu từ vựng.'); setVocabForm({ id: '', word: '', phonetic: '', meaning: '', example: '', topic: '' }); load();
    } catch (err) { setError(err); }
  };

  const importVocab = async () => {
    setError(null); setMsg('');
    try {
      const parsed = JSON.parse(vocabImport);
      const arr = Array.isArray(parsed) ? parsed : parsed.items;
      const r = await api.adminImportVocab(arr);
      setMsg(`Đã import ${r.imported} từ. ${r.errors.length ? `Lỗi: ${r.errors.map(e => `#${e.index}: ${e.reason}`).join('; ')}` : ''}`);
      load();
    } catch (err) { setError(err instanceof SyntaxError ? new Error('JSON không hợp lệ.') : err); }
  };

  const backup = async () => {
    try {
      const blob = await api.adminBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'toeic-backup.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err); }
  };

  // --- Bộ đề ---
  const saveTestSet = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg('');
    try {
      if (editingSet) {
        await api.adminUpdateTestSet(editingSet, { title: tsForm.title, description: tsForm.description, isPublished: tsForm.isPublished, exam: tsForm.exam });
        setMsg('Đã cập nhật bộ đề.');
      } else {
        await api.adminCreateTestSet({ title: tsForm.title, description: tsForm.description, isPublished: tsForm.isPublished, exam: tsForm.exam });
        setMsg('Đã tạo bộ đề mới.');
      }
      setTsForm({ title: '', description: '', isPublished: false, exam: 'toeic' }); setEditingSet(null);
      loadTestSets();
    } catch (err) { setError(err); }
  };

  const editTestSet = (ts: TestSet) => {
    setEditingSet(ts.id);
    setTsForm({ title: ts.title, description: ts.description || '', isPublished: ts.isPublished, exam: ts.exam || 'toeic' });
  };

  const deleteTestSet = async (ts: TestSet) => {
    if (!confirm(`Xóa bộ đề "${ts.title}" cùng toàn bộ câu hỏi trong đề?`)) return;
    setError(null);
    try { await api.adminDeleteTestSet(ts.id); setMsg(`Đã xóa bộ đề "${ts.title}".`); loadTestSets(); }
    catch (err) { setError(err); }
  };

  const togglePublishSet = async (ts: TestSet) => {
    setError(null);
    setTogglingId(ts.id);
    try {
      await api.adminUpdateTestSet(ts.id, { isPublished: !ts.isPublished });
      setMsg(ts.isPublished ? `Đã chuyển "${ts.title}" về Nháp.` : `Đã phát hành "${ts.title}".`);
      loadTestSets();
    } catch (err) { setError(err); } finally { setTogglingId(null); }
  };

  const onUploadTestSetFile = async (file: File) => {
    setError(null); setMsg(''); setUploadPreview(null);
    try {
      const parsed = JSON.parse(await file.text());
      const norm = normalizeImportFile(parsed);
      const { valid, errors } = splitValid(norm.questions);
      setUploadPreview({
        title: norm.title || 'Đề mới (file upload)',
        description: norm.description || '',
        valid, errors, fileName: file.name,
      });
    } catch (e) {
      setError(e instanceof SyntaxError ? new Error('File JSON không hợp lệ. Kiểm tra lại định dạng.') : e);
    }
  };

  const confirmUploadTestSet = async () => {
    if (!uploadPreview) return;
    setUploadBusy(true); setError(null);
    try {
      const ts = await api.adminCreateTestSet({ title: uploadPreview.title, description: uploadPreview.description, isPublished: false });
      const r = await api.adminImportTestSet(ts.id, uploadPreview.valid);
      setMsg(`Đã tạo đề "${ts.title}" và import ${r.imported} câu. ${r.errors.length ? `Lỗi từ máy chủ: ${r.errors.map(e => `#${e.index}${e.id ? ` (${e.id})` : ''}: ${e.reason}`).join('; ')}` : ''}`);
      setUploadPreview(null);
      loadTestSets();
      nav(`/toeic/test-set/${ts.id}`);
    } catch (e) { setError(e); } finally { setUploadBusy(false); }
  };

  const testSetForm = (
  <form onSubmit={saveTestSet}>
    <label>Tên đề</label>
    <input value={tsForm.title} onChange={e => setTsForm({ ...tsForm, title: e.target.value })} placeholder="VD: ETS 2024 - Test 01" required />
    <label>Mô tả</label>
    <input value={tsForm.description} onChange={e => setTsForm({ ...tsForm, description: e.target.value })} placeholder="Nguồn đề, năm…" />
    <label>Kỳ thi</label>
    <select value={tsForm.exam} onChange={e => setTsForm({ ...tsForm, exam: e.target.value })}>
      <option value="toeic">TOEIC</option>
      <option value="ielts">IELTS Academic</option>
    </select>
    <label><input type="checkbox" checked={tsForm.isPublished} onChange={e => setTsForm({ ...tsForm, isPublished: e.target.checked })} /> Phát hành ngay (người học thấy đề)</label>
    <div className="btn-row">
      <button className="btn btn-block">{editingSet ? 'Cập nhật đề' : '＋ Tạo đề mới'}</button>
      {editingSet && <button type="button" className="btn secondary" onClick={() => { setEditingSet(null); setTsForm({ title: '', description: '', isPublished: false, exam: 'toeic' }); }}>Hủy sửa</button>}
    </div>
  </form>
  );

  const questionForm = (
  <form onSubmit={saveQuestion}>
    <div className="form-grid">
    <div><label>Mã câu (VD: P5-001)</label><input value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} required disabled={!!editing} /></div>
    <div><label>Kỳ thi</label><select value={form.exam} onChange={e => setForm({ ...form, exam: e.target.value })}>
      <option value="toeic">TOEIC</option>
      <option value="ielts">IELTS Academic</option>
    </select></div>
    </div>
    <div className="form-grid">
    <div><label>Dạng câu hỏi</label><select value={form.questionType} onChange={e => setForm({ ...form, questionType: e.target.value })}>
      {Object.entries(QUESTION_TYPE_NAMES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
    </select></div>
    <div><label>Part</label><select value={form.part} onChange={e => setForm({ ...form, part: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>{partName(p)}</option>)}</select></div>
    </div>
    <label>Nội dung câu hỏi (tiếng Anh)</label><textarea rows={3} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} required />
    {isFillIn(form.questionType) ? (
      <>
        <div className="form-grid">
        <div><label>Đáp án đúng (dạng text, câu điền từ)</label><input value={form.correctText} onChange={e => setForm({ ...form, correctText: e.target.value })} required placeholder="VD: library" /></div>
        <div><label>Giới hạn số từ (word_limit — để trống nếu không giới hạn)</label><input type="number" min={1} value={form.wordLimit} onChange={e => setForm({ ...form, wordLimit: e.target.value })} placeholder="VD: 2" /></div>
        </div>
        <label>Đáp án chấp nhận thêm (mỗi dòng 1 đáp án)</label><textarea rows={2} value={form.acceptedAnswers} onChange={e => setForm({ ...form, acceptedAnswers: e.target.value })} placeholder={'the library\nlibraries'} />
      </>
    ) : (
      <>
        <div className="form-grid">
        <div><label>Phương án A</label><input value={optA} onChange={e => setOptA(e.target.value)} required /></div>
        <div><label>Phương án B</label><input value={optB} onChange={e => setOptB(e.target.value)} required /></div>
        </div>
        <div className="form-grid">
        <div><label>Phương án C</label><input value={optC} onChange={e => setOptC(e.target.value)} required /></div>
        <div><label>Phương án D</label><input value={optD} onChange={e => setOptD(e.target.value)} required /></div>
        </div>
        <label>Đáp án đúng</label><select value={correct} onChange={e => setCorrect(e.target.value)}>{['A', 'B', 'C', 'D'].map(l => <option key={l}>{l}</option>)}</select>
      </>
    )}
    <label>Giải thích (tiếng Việt, ngắn)</label><textarea rows={2} value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} />
    <div className="form-grid">
    <div><label>Chủ đề</label><input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} /></div>
    <div><label>Độ khó</label><select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}><option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option></select></div>
    </div>
    <label>Script / transcript (Part 1–4, để đọc TTS)</label><textarea rows={2} value={form.script} onChange={e => setForm({ ...form, script: e.target.value })} />
    <label>Đoạn văn (Part 3/4/6/7)</label><textarea rows={3} value={form.passageText} onChange={e => setForm({ ...form, passageText: e.target.value })} />
    <div className="btn-row"><button className="btn">{editing ? 'Cập nhật' : 'Thêm câu hỏi'}</button>{editing && <button type="button" className="btn secondary" onClick={() => { setEditing(null); setForm(emptyQ); }}>Hủy sửa</button>}</div>
  </form>
  );

  return (
    <div>
      <h1>Quản trị (Admin)</h1>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      <div className="btn-row" style={{ marginBottom: '1rem' }}><button className="btn secondary" onClick={backup}>⬇ Tải bản sao lưu (backup JSON)</button></div>

      <div className="split">
      <div>
      {editingSet == null && (
      <div className="card">
        <h2>📚 Bộ đề</h2>
        {testSetForm}
      </div>
      )}
      {editingSet != null && (
      <Modal title={`Sửa bộ đề — ${tsForm.title || editingSet}`} onClose={() => { setEditingSet(null); setTsForm({ title: '', description: '', isPublished: false, exam: 'toeic' }); }}>
        {testSetForm}
      </Modal>
      )}
      <div className="card">
        <h2>⬆ Nhập đề từ file JSON</h2>
        <label>Upload file đề (.json)</label>
        <div className="btn-row">
          <label className="btn" style={{ cursor: 'pointer' }}>
            ⬆ Chọn file đề (.json)
            <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void onUploadTestSetFile(f); e.target.value = ''; }} />
          </label>
          <a className="btn secondary" href="/mau-de-thi.json" download>Tải file mẫu mau-de-thi.json</a>
        </div>
        <p className="muted">File JSON chấp nhận dạng {'{title, description?, questions: [...]}'} hoặc {'{parts: {"1": [...], ...}}'}. Mỗi câu cần đủ 4 phương án, đúng 1 đáp án, Part 1–7. File Word/PDF/ảnh: tạo đề trước, rồi bấm vào tên đề trong danh sách bên dưới để mở trang chi tiết đề và dùng mục 🤖 Nhận diện bằng AI.</p>
        {uploadPreview && (
          <Modal title={`Xem trước — ${uploadPreview.fileName}`} wide onClose={() => setUploadPreview(null)}>
            <p><strong>{uploadPreview.title}</strong>{uploadPreview.description ? ` — ${uploadPreview.description}` : ''}</p>
            <p>{uploadPreview.valid.length} câu hợp lệ • {uploadPreview.errors.length} câu lỗi (sẽ bị bỏ qua khi import)</p>
            <table><thead><tr><th>Part</th><th>Số câu</th></tr></thead><tbody>
              {countByPart(uploadPreview.valid).map(p => <tr key={p.part}><td>Part {p.part}</td><td>{p.count}</td></tr>)}
              <tr><td><strong>Tổng</strong></td><td><strong>{uploadPreview.valid.length}</strong></td></tr>
            </tbody></table>
            {uploadPreview.errors.length > 0 && (
              <div style={{ marginTop: '.6rem' }}>
                <p style={{ color: 'var(--red-ink)' }}>Câu lỗi:</p>
                <table><thead><tr><th>#</th><th>Lý do</th></tr></thead><tbody>
                  {uploadPreview.errors.map(e => <tr key={e.index}><td>{e.index + 1}{e.id ? ` (${e.id})` : ''}</td><td>{e.reason}</td></tr>)}
                </tbody></table>
              </div>
            )}
            <div className="btn-row">
              <button className="btn" disabled={uploadBusy || !uploadPreview.valid.length} onClick={() => void confirmUploadTestSet()}>
                {uploadBusy ? 'Đang thêm đề…' : `Xác nhận thêm đề (${uploadPreview.valid.length} câu)`}
              </button>
              <button className="btn secondary" onClick={() => setUploadPreview(null)}>Hủy</button>
            </div>
          </Modal>
        )}
      </div>
      </div>
      <div className="card">
        <h2>Danh sách đề ({testSets.length})</h2>
        <div className="table-scroll">
        <table className="tbl-nowrap"><thead><tr><th>Tên đề</th><th>Số câu</th><th>Part</th><th>Thiếu</th><th>Trạng thái</th><th>Ngày tạo</th><th></th></tr></thead><tbody>
          {testSets.map(ts => {
            const missingTotal = (ts.missing || []).reduce((n, m) => n + m.missing, 0);
            return (
            <tr key={ts.id}>
              <td><Link to={`/toeic/test-set/${ts.id}`}><strong>{ts.title}</strong></Link><br /><span className="muted">{ts.id}</span></td>
              <td>{ts.totalQuestions}</td>
              <td>{ts.parts?.length ?? 0} Part</td>
              <td>{missingTotal === 0 ? 'Đủ' : `Thiếu ${missingTotal}`}</td>
              <td><span className="toggle-cell">
                <Toggle checked={ts.isPublished} disabled={togglingId === ts.id}
                  label={ts.isPublished ? `Đã phát hành — bấm để chuyển "${ts.title}" về Nháp` : `Nháp — bấm để phát hành "${ts.title}"`}
                  onChange={() => void togglePublishSet(ts)} />
                <span className={ts.isPublished ? 'toggle-label' : 'toggle-label toggle-label--off'}>{ts.isPublished ? 'Phát hành' : 'Nháp'}</span>
              </span></td>
              <td>{ts.createdAt ? new Date(ts.createdAt).toLocaleDateString('vi-VN') : '—'}</td>
              <td>
                <div className="tbl-actions">
                  <button className="btn ghost" onClick={() => editTestSet(ts)}>Sửa</button>
                  <button className="btn danger" onClick={() => void deleteTestSet(ts)}>Xóa</button>
                </div>
              </td>
            </tr>);
          })}
        </tbody></table>
        </div>
        {!testSets.length && <p className="muted">Chưa có bộ đề nào.</p>}
      </div>
      </div>

      {editing == null ? (
        <div className="card">
          <h2>Thêm câu hỏi</h2>
          {questionForm}
        </div>
      ) : (
        <Modal title={`Sửa câu hỏi ${editing}`} onClose={() => { setEditing(null); setForm(emptyQ); }}>
          {questionForm}
        </Modal>
      )}

      <div className="split">
      <div className="card">
        <h2>Import câu hỏi (JSON)</h2>
        <p className="muted">Định dạng seed: mảng câu hỏi, mỗi câu có id, part, content, options (4 phương án A–D), correct, explanation. Dòng lỗi sẽ bị bỏ qua, không import nửa vời.</p>
        <label>Chọn file JSON</label><input type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; if (f) importFromFile(f, 'q'); }} />
        <label>Hoặc dán JSON vào đây</label><textarea rows={6} value={importText} onChange={e => setImportText(e.target.value)} placeholder='[{"id":"P5-001","part":5,"content":"...","options":[{"label":"A","content":"..."}], "correct":"A","explanation":"..."}]' />
        <div className="btn-row"><button className="btn btn-block" onClick={importQuestions}>Import câu hỏi</button></div>
      </div>

      <div className="card">
        <h2>Danh sách câu hỏi ({questions.length})</h2>
        <div className="form-grid">
        <div><label>Lọc theo kỳ thi</label>
        <select value={examFilter} onChange={e => setExamFilter(e.target.value as 'all' | 'toeic' | 'ielts')}>
          <option value="all">Tất cả</option><option value="toeic">TOEIC</option><option value="ielts">IELTS Academic</option>
        </select></div>
        <div><label>Lọc theo Part</label>
        <select value={partFilter ?? ''} onChange={e => setPartFilter(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Tất cả</option>{[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>{partName(p)}</option>)}
        </select></div>
        </div>
        <div className="table-scroll">
        <table><thead><tr><th>Mã</th><th>Part</th><th>Dạng</th><th>Nội dung</th><th>Đáp án</th><th>Giải thích</th><th>Media</th><th></th></tr></thead><tbody>
          {questions.map(q => <tr key={q.id}><td>{q.id}</td><td>{q.part}</td>
            <td><span className="cell-trunc" title={questionTypeName(q.questionType)}>{questionTypeName(q.questionType)}</span></td>
            <td><span className="cell-trunc cell-trunc--wide" title={q.content}>{q.content}</span></td>
            <td>{q.correctLabel || q.correct || q.correctText || '—'}</td>
            <td>{q.explanation ? '✓' : '—'}</td>
            <td>{q.imageUrl || q.audioUrl ? '✓' : '—'}</td>
            <td><div className="tbl-actions"><button className="btn ghost" onClick={() => editQ(q)}>Sửa</button>
              <button className="btn danger" onClick={async () => { if (confirm(`Xóa câu ${q.id}?`)) { try { await api.adminDeleteQuestion(q.id); load(); } catch (err) { setError(err); } } }}>Xóa</button></div></td></tr>)}
        </tbody></table>
        </div>
        {questions.length === 0 && <p className="muted">Chưa có câu hỏi nào khớp bộ lọc.</p>}
      </div>
      </div>

      <div className="split">
      <div>
      <form className="card" onSubmit={saveVocab}>
        <h2>Thêm / sửa từ vựng</h2>
        <div className="form-grid">
        <div><label>Mã từ (VD: V001)</label><input value={vocabForm.id} onChange={e => setVocabForm({ ...vocabForm, id: e.target.value })} required /></div>
        <div><label>Từ</label><input value={vocabForm.word} onChange={e => setVocabForm({ ...vocabForm, word: e.target.value })} required /></div>
        </div>
        <div className="form-grid">
        <div><label>Phiên âm</label><input value={vocabForm.phonetic} onChange={e => setVocabForm({ ...vocabForm, phonetic: e.target.value })} /></div>
        <div><label>Chủ đề</label><input value={vocabForm.topic} onChange={e => setVocabForm({ ...vocabForm, topic: e.target.value })} /></div>
        </div>
        <label>Nghĩa (tiếng Việt)</label><input value={vocabForm.meaning} onChange={e => setVocabForm({ ...vocabForm, meaning: e.target.value })} required />
        <label>Ví dụ (tiếng Anh)</label><input value={vocabForm.example} onChange={e => setVocabForm({ ...vocabForm, example: e.target.value })} />
        <div className="btn-row"><button className="btn btn-block">Lưu từ vựng</button></div>
      </form>

      <div className="card">
        <h2>Import từ vựng (JSON)</h2>
        <label>Chọn file JSON</label><input type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; if (f) importFromFile(f, 'v'); }} />
        <label>Hoặc dán JSON vào đây</label><textarea rows={4} value={vocabImport} onChange={e => setVocabImport(e.target.value)} placeholder='[{"id":"V001","word":"...","meaning":"..."}]' />
        <div className="btn-row"><button className="btn btn-block" onClick={importVocab}>Import từ vựng</button></div>
      </div>
      </div>

      <div className="card">
        <h2>Danh sách từ vựng ({vocabs.length})</h2>
        <div className="table-scroll">
        <table><thead><tr><th>Từ</th><th>Phiên âm</th><th>Nghĩa</th><th>Chủ đề</th><th></th></tr></thead><tbody>
          {vocabs.map(v => <tr key={v.id}><td><strong>{v.word}</strong></td><td>{v.phonetic || '—'}</td><td>{v.meaning}</td><td>{v.topic || ''}</td>
            <td><button className="btn danger" onClick={async () => { if (confirm(`Xóa từ ${v.word}?`)) { try { await api.adminDeleteVocab(v.id); load(); } catch (err) { setError(err); } } }}>Xóa</button></td></tr>)}
        </tbody></table>
        </div>
        {vocabs.length === 0 && <p className="muted">Chưa có từ vựng nào.</p>}
      </div>
      </div>
    </div>
  );
}
