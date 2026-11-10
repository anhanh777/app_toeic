import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, type Question, type TestSet, type ImportQuestion, type AiParseResult, type MediaConfig } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, partName } from '../components';
import { uploadToCloudinary } from '../cloudinary';
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
  imageUrl: '', audioUrl: '',
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
  const [mediaCfg, setMediaCfg] = useState<MediaConfig | null>(null);
  const [imgUploading, setImgUploading] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [manualAudioName, setManualAudioName] = useState('');
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [genDone, setGenDone] = useState<Record<string, string>>({});

  const load = () => {
    if (!id) return;
    setLoading(true);
    api.testSet(id).then(setTs).catch(setError).finally(() => setLoading(false));
  };
  useEffect(load, [id]);
  // Cấu hình Cloudinary lấy 1 lần khi mở trang (chỉ admin gọi được).
  useEffect(() => {
    api.mediaConfig().then(setMediaCfg).catch(() => setMediaCfg(null));
  }, []);

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
      // 403/forbidden: api.ts đã dịch thành message tiếng Việt rõ ràng,
      // hiện qua ErrorBox — không hiện chữ "forbidden" thô cho người dùng.
      else if (e instanceof ApiError && (e.status === 403 || e.code === 'forbidden')) setError(e);
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
        ...(manual.imageUrl ? { imageUrl: manual.imageUrl } : {}),
        ...(manual.audioUrl ? { audioUrl: manual.audioUrl } : {}),
        options: [
          { label: 'A', content: manual.optA }, { label: 'B', content: manual.optB },
          { label: 'C', content: manual.optC }, { label: 'D', content: manual.optD },
        ],
        correct: manual.correct,
      };
      await api.adminAddTestSetQuestion(ts.id, body);
      setMsg(`Đã thêm câu hỏi vào Part ${manualPart}.`);
      setManual(emptyManual); setManualAudioName(''); setManualPart(null);
      load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  // Upload ảnh/audio cho form thêm câu thủ công: chọn file là upload ngay
  // lên Cloudinary, chỉ lưu URL vào câu khi bấm "Lưu câu hỏi".
  const onManualImage = async (file: File) => {
    if (!mediaCfg?.configured) { setError(new Error('Chưa cấu hình Cloudinary — xem README')); return; }
    setImgUploading(true); setError(null);
    try {
      const url = await uploadToCloudinary(file, 'toeic/images', mediaCfg);
      setManual(m => ({ ...m, imageUrl: url }));
    } catch (e) { setError(e); } finally { setImgUploading(false); }
  };
  const onManualAudio = async (file: File) => {
    if (!mediaCfg?.configured) { setError(new Error('Chưa cấu hình Cloudinary — xem README')); return; }
    setAudioUploading(true); setError(null);
    try {
      const url = await uploadToCloudinary(file, 'toeic/audio', mediaCfg);
      setManual(m => ({ ...m, audioUrl: url }));
      setManualAudioName(file.name);
    } catch (e) { setError(e); } finally { setAudioUploading(false); }
  };

  // Tải lại danh sách câu của 1 Part sau khi sinh audio (không load() lại
  // toàn trang để khỏi mất trạng thái đang mở).
  const refreshList = async (p: number) => {
    if (!ts) return;
    try {
      const items = await api.questions(p, 100, 0, '', ts.id);
      setListQuestions(items);
    } catch (e) { setError(e); }
  };

  // Sinh audio bằng AI: Part 1–2 theo từng câu, Part 3/4 theo đoạn văn.
  // Lỗi 501 (gemini/cloudinary chưa cấu hình) đã được api.ts dịch sang
  // tiếng Việt, hiện qua ErrorBox.
  const onGenerateAudio = async (key: string, kind: 'question' | 'passage', targetId: string) => {
    setGenBusy(key); setError(null); setMsg('');
    try {
      const r = kind === 'question'
        ? await api.generateQuestionAudio(targetId)
        : await api.generatePassageAudio(targetId);
      setGenDone(d => ({ ...d, [key]: r.audioUrl }));
      setMsg(`Đã sinh audio AI (${r.level}) và lưu vào ${kind === 'question' ? 'câu hỏi' : 'đoạn văn'}.`);
      if (listPart != null) await refreshList(listPart);
    } catch (e) { setError(e); } finally { setGenBusy(null); }
  };

  // Ô nút "AI đọc audio" + player nghe thử trong danh sách câu.
  const audioGenCell = (key: string, kind: 'question' | 'passage', targetId: string, existingUrl?: string | null) => {
    const url = genDone[key] || existingUrl || undefined;
    return (
      <div>
        <button className="btn secondary" disabled={genBusy === key} onClick={() => void onGenerateAudio(key, kind, targetId)}>
          {genBusy === key ? '⏳ Đang sinh audio… (10–30 giây)' : '🔊 AI đọc audio'}
        </button>
        {url && <audio controls src={url} preload="metadata" style={{ width: 180, marginTop: '.4rem' }} />}
      </div>
    );
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
          <p style={{ color: '#B98A1D' }}>⚠ Chưa đủ câu: {ts.missing.map(m => `Part ${m.part} thiếu ${m.missing} câu`).join(', ')}</p>
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
          <div className="panel">
            <h3>Xem trước AI — {aiPreview.fileName}</h3>
            <p>{aiPreview.questions.length} câu parse được • {aiLiveErrorCount} câu còn lỗi</p>
            {aiPreview.warnings.length > 0 && (
              <p style={{ color: '#B98A1D' }}>⚠ {aiPreview.warnings.join(' ')}</p>
            )}
            {aiPreview.structure?.mode === 'split' && (
              <>
                <p className="muted">
                  Đã nhận diện cấu trúc
                  {(aiPreview.structure.parts ?? []).length > 0 && (
                    <>: {(aiPreview.structure.parts ?? []).map(p => `Part ${p.part} (${p.questionCount} câu)`).join(' · ')}</>
                  )}
                  {' · '}{aiPreview.structure.answerKeyFound ? 'Đã thấy bảng đáp án' : 'Chưa thấy bảng đáp án'}
                </p>
                {(aiPreview.structure.warnings ?? []).length > 0 && (
                  <p style={{ color: '#B98A1D' }}>⚠ {(aiPreview.structure.warnings ?? []).join(' ')}</p>
                )}
              </>
            )}
            {aiPreview.structure?.mode === 'fallback' && (
              <p className="muted">Không tách được cấu trúc — đã dùng AI đọc toàn bộ file.</p>
            )}
            {aiPreview.structure?.mode === 'vision' && (
              <p className="muted">File scan/ảnh — AI đã đọc trực tiếp từ ảnh, không tách cấu trúc được.</p>
            )}
            <table>
              <thead><tr><th>#</th><th>Part</th><th>Nội dung</th><th>Đáp án đúng</th><th>AI chưa chắc</th><th>Lý do lỗi</th></tr></thead>
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
                      <td>
                        {q.confidence === 'low' && (
                          <span style={{ color: '#B98A1D', fontSize: '0.85rem' }}>⚠ Kiểm tra lại</span>
                        )}
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
            <div className="panel">
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
            <form className="panel" onSubmit={saveManual}>
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
              {mediaCfg?.configured ? (
                <>
                  <label>Ảnh minh họa (Part 1)</label>
                  <div className="btn-row">
                    <label className="btn secondary" style={{ cursor: 'pointer' }}>
                      🖼 Chọn ảnh (.png/.jpg/.jpeg, ≤ 5MB)
                      <input type="file" accept=".png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void onManualImage(f); e.target.value = ''; }} />
                    </label>
                  </div>
                  {imgUploading && <p className="muted">Đang tải ảnh lên Cloudinary…</p>}
                  {manual.imageUrl && (
                    <>
                      <img src={manual.imageUrl} alt="Ảnh minh họa" style={{ maxWidth: '100%', borderRadius: 12 }} />
                      <p className="muted">Đã upload ảnh.</p>
                    </>
                  )}
                  <label>File audio (Part 1–4, .mp3)</label>
                  <div className="btn-row">
                    <label className="btn secondary" style={{ cursor: 'pointer' }}>
                      🎵 Chọn file audio (.mp3, ≤ 10MB)
                      <input type="file" accept=".mp3" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void onManualAudio(f); e.target.value = ''; }} />
                    </label>
                  </div>
                  {audioUploading && <p className="muted">Đang tải audio lên Cloudinary…</p>}
                  {manual.audioUrl && (
                    <>
                      <p className="muted">Đã upload: {manualAudioName || 'file audio'}</p>
                      <audio controls src={manual.audioUrl} style={{ width: '100%' }} />
                    </>
                  )}
                </>
              ) : (
                <p className="muted">Chưa cấu hình Cloudinary — xem README</p>
              )}
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
              <table><thead><tr><th>Mã</th><th>Nội dung</th><th>Audio AI</th></tr></thead><tbody>
                {(() => {
                  // Part 3/4: nút sinh audio nằm ở cấp đoạn văn — mỗi passageId
                  // chỉ hiện nút 1 lần (các câu chung đoạn không lặp nút).
                  const seenPassages = new Set<string>();
                  return listQuestions.map(q => {
                    let audioCell: React.ReactNode = <span className="muted">—</span>;
                    if (p === 1 || p === 2) {
                      audioCell = audioGenCell(`q:${q.id}`, 'question', q.id, q.audioUrl);
                    } else if (p === 3 || p === 4) {
                      if (q.passageId) {
                        if (seenPassages.has(q.passageId)) {
                          audioCell = q.audioUrl
                            ? <audio controls src={q.audioUrl} preload="metadata" style={{ width: 180 }} />
                            : <span className="muted">↳ chung đoạn trên</span>;
                        } else {
                          seenPassages.add(q.passageId);
                          audioCell = audioGenCell(`p:${q.passageId}`, 'passage', q.passageId, q.audioUrl);
                        }
                      } else {
                        // Câu Part 3/4 không gắn đoạn: sinh audio theo từng câu.
                        audioCell = audioGenCell(`q:${q.id}`, 'question', q.id, q.audioUrl);
                      }
                    }
                    return <tr key={q.id}><td>{q.id}</td><td>{q.content.slice(0, 100)}</td><td>{audioCell}</td></tr>;
                  });
                })()}
              </tbody></table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
