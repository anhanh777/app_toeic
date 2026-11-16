import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type TestSet } from '../api';
import { useAuth } from '../auth';
import { ErrorBox } from '../components';
import { normalizeImportFile, type QuestionError } from '../testSetUtils';
import { splitValidIelts } from '../ieltsAdminUtils';

/* Quản lý đề IELTS Academic — mục riêng, tách khỏi đề TOEIC.
   Đề IELTS: Listening 4 Section + Reading 3 Passage = 80 câu/đề.
   Tạo đề ở đây luôn gắn exam='ielts'; câu hỏi IELTS được quản lý
   ở trang chi tiết từng đề (IeltsTestSetAdmin). */
export default function IeltsAdmin() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const [tsForm, setTsForm] = useState({ title: '', description: '', isPublished: false });
  const [editingSet, setEditingSet] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<{
    title: string; description: string; valid: Record<string, unknown>[]; errors: QuestionError[]; fileName: string;
  } | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const loadTestSets = () => api.testSets('ielts').then(setTestSets).catch(setError);
  useEffect(() => { void loadTestSets(); }, []);

  if (user?.role !== 'admin') {
    return <div className="card"><h1>Không có quyền truy cập</h1><p>Trang quản trị chỉ dành cho tài khoản admin. Tài khoản của bạn không có quyền xem trang này.</p></div>;
  }

  const saveTestSet = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg('');
    try {
      if (editingSet) {
        await api.adminUpdateTestSet(editingSet, { title: tsForm.title, description: tsForm.description, isPublished: tsForm.isPublished, exam: 'ielts' });
        setMsg('Đã cập nhật bộ đề IELTS.');
      } else {
        await api.adminCreateTestSet({ title: tsForm.title, description: tsForm.description, isPublished: tsForm.isPublished, exam: 'ielts' });
        setMsg('Đã tạo bộ đề IELTS mới.');
      }
      setTsForm({ title: '', description: '', isPublished: false }); setEditingSet(null);
      loadTestSets();
    } catch (err) { setError(err); }
  };

  const editTestSet = (ts: TestSet) => {
    setEditingSet(ts.id);
    setTsForm({ title: ts.title, description: ts.description || '', isPublished: ts.isPublished });
    window.scrollTo({ top: 0 });
  };

  const deleteTestSet = async (ts: TestSet) => {
    if (!confirm(`Xóa bộ đề "${ts.title}" cùng toàn bộ câu hỏi trong đề?`)) return;
    setError(null);
    try { await api.adminDeleteTestSet(ts.id); setMsg(`Đã xóa bộ đề "${ts.title}".`); loadTestSets(); }
    catch (err) { setError(err); }
  };

  const togglePublishSet = async (ts: TestSet) => {
    setError(null);
    try {
      await api.adminUpdateTestSet(ts.id, { isPublished: !ts.isPublished });
      setMsg(ts.isPublished ? `Đã chuyển "${ts.title}" về Nháp.` : `Đã phát hành "${ts.title}".`);
      loadTestSets();
    } catch (err) { setError(err); }
  };

  // Upload cả 1 đề IELTS từ file JSON (câu hỏi phải có exam='ielts'
  // và đúng 19 dạng câu IELTS — kiểm tra ngay ở bước xem trước).
  const onUploadTestSetFile = async (file: File) => {
    setError(null); setMsg(''); setUploadPreview(null);
    try {
      const parsed = JSON.parse(await file.text());
      const norm = normalizeImportFile(parsed);
      const withExam = norm.questions.map(q => ({ ...(q as Record<string, unknown>), exam: 'ielts' }));
      const { valid, errors } = splitValidIelts(withExam);
      setUploadPreview({
        title: norm.title || 'Đề IELTS mới (file upload)',
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
      const ts = await api.adminCreateTestSet({ title: uploadPreview.title, description: uploadPreview.description, isPublished: false, exam: 'ielts' });
      const r = await api.adminImportTestSet(ts.id, uploadPreview.valid);
      setMsg(`Đã tạo đề "${ts.title}" và import ${r.imported} câu. ${r.errors.length ? `Lỗi từ máy chủ: ${r.errors.map(e => `#${e.index}${e.id ? ` (${e.id})` : ''}: ${e.reason}`).join('; ')}` : ''}`);
      setUploadPreview(null);
      loadTestSets();
      nav(`/ielts/test-set/${ts.id}`);
    } catch (e) { setError(e); } finally { setUploadBusy(false); }
  };

  return (
    <div>
      <h1>🎧 Quản lý đề IELTS</h1>
      <p className="muted">IELTS Academic — Listening 4 Section + Reading 3 Passage = 80 câu/đề. Đề TOEIC quản lý ở mục riêng.</p>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}

      <div className="card">
        <h2>{editingSet ? 'Sửa bộ đề IELTS' : 'Tạo bộ đề IELTS mới'}</h2>
        <form onSubmit={saveTestSet}>
          <label>Tên đề</label>
          <input value={tsForm.title} onChange={e => setTsForm({ ...tsForm, title: e.target.value })} required placeholder="VD: Cambridge IELTS 21 — Test 1" />
          <label>Mô tả</label>
          <input value={tsForm.description} onChange={e => setTsForm({ ...tsForm, description: e.target.value })} />
          <label><input type="checkbox" checked={tsForm.isPublished} onChange={e => setTsForm({ ...tsForm, isPublished: e.target.checked })} /> Phát hành (học viên nhìn thấy)</label>
          <div className="btn-row">
            <button className="btn" type="submit">{editingSet ? 'Lưu thay đổi' : 'Tạo đề'}</button>
            {editingSet && <button type="button" className="btn secondary" onClick={() => { setEditingSet(null); setTsForm({ title: '', description: '', isPublished: false }); }}>Hủy</button>}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>⬆ Tạo đề từ file JSON</h2>
        <p className="muted">File JSON chứa mảng câu hỏi IELTS (mỗi câu có part 1–7, questionType trong 19 dạng, đáp án đúng). Câu sai định dạng sẽ hiện ở bước xem trước.</p>
        <label className="btn secondary" style={{ cursor: 'pointer' }}>
          Chọn file JSON
          <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void onUploadTestSetFile(f); e.target.value = ''; }} />
        </label>
        {uploadPreview && (
          <>
            <h3>Xem trước — {uploadPreview.fileName}</h3>
            <p>{uploadPreview.valid.length} câu hợp lệ • {uploadPreview.errors.length} câu lỗi (sẽ bị bỏ qua)</p>
            {uploadPreview.errors.length > 0 && (
              <table><thead><tr><th>#</th><th>Lý do</th></tr></thead><tbody>
                {uploadPreview.errors.map(e => <tr key={e.index}><td>{e.index + 1}{e.id ? ` (${e.id})` : ''}</td><td>{e.reason}</td></tr>)}
              </tbody></table>
            )}
            <div className="btn-row">
              <button className="btn" disabled={uploadBusy || !uploadPreview.valid.length} onClick={() => void confirmUploadTestSet()}>{uploadBusy ? 'Đang tạo…' : `Tạo đề "${uploadPreview.title}" + import ${uploadPreview.valid.length} câu`}</button>
              <button className="btn secondary" onClick={() => setUploadPreview(null)}>Hủy</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Danh sách đề IELTS ({testSets.length})</h2>
        <div className="table-scroll">
        <table><thead><tr><th>Tên đề</th><th>Số câu</th><th>Part</th><th>Thiếu</th><th>Trạng thái</th><th>Ngày tạo</th><th></th></tr></thead><tbody>
          {testSets.map(ts => {
            const missingTotal = (ts.missing || []).reduce((n, m) => n + m.missing, 0);
            return (
            <tr key={ts.id}>
              <td><Link to={`/ielts/test-set/${ts.id}`}><strong>{ts.title}</strong></Link><br /><span className="muted">{ts.id}</span></td>
              <td>{ts.totalQuestions ?? 0}</td>
              <td>{ts.parts?.length ?? 0} Part</td>
              <td>{missingTotal === 0 ? 'Đủ' : `Thiếu ${missingTotal}`}</td>
              <td>{ts.isPublished ? <span className="pill pill--live">ĐÃ PHÁT HÀNH</span> : <span className="pill pill--draft">NHÁP</span>}</td>
              <td>{ts.createdAt ? new Date(ts.createdAt).toLocaleDateString('vi-VN') : ''}</td>
              <td>
                <div className="tbl-actions">
                  <button className="btn secondary" onClick={() => togglePublishSet(ts)}>{ts.isPublished ? 'Về Nháp' : 'Phát hành'}</button>
                  <button className="btn secondary" onClick={() => editTestSet(ts)}>Sửa</button>
                  <button className="btn danger" onClick={() => void deleteTestSet(ts)}>Xóa</button>
                </div>
              </td>
            </tr>);
          })}
        </tbody></table>
        </div>
        {testSets.length === 0 && <p className="muted">Chưa có đề IELTS nào. Tạo đề mới ở trên hoặc tải lên từ file JSON.</p>}
      </div>
    </div>
  );
}
