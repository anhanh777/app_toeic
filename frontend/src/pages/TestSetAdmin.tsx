import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, type Question, type TestSet, type ImportQuestion, type AiParseResult, type AnswerKeyResult, type MediaConfig } from '../api';
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
  const [akFile, setAkFile] = useState<File | null>(null);
  const [akBusy, setAkBusy] = useState(false);
  const [akResult, setAkResult] = useState<AnswerKeyResult | null>(null);
  const [akApplied, setAkApplied] = useState<{ filled: number; total: number; missing: number[] } | null>(null);
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
    setAkFile(null); setAkResult(null); setAkApplied(null);
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
      setAkFile(null); setAkResult(null); setAkApplied(null);
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  // Số câu bắt đầu chuẩn của mỗi Part trong 1 đề TOEIC 200 câu.
  const PART_STARTS: Record<number, number> = { 1: 1, 2: 7, 3: 32, 4: 71, 5: 101, 6: 131, 7: 147 };

  // Số câu chuẩn TOEIC của câu thứ `index` trong bản xem trước: đếm vị trí
  // của nó trong Part của nó (câu đầu tiên của Part = số bắt đầu của Part,
  // câu tiếp theo +1). Câu Part 1/2 giữ chỗ cũng được tính theo đúng số
  // của chúng. Câu part = 0/không rõ thì lấy số thứ tự toàn cục (index + 1).
  const standardNumber = (questions: ImportQuestion[], index: number): number => {
    const part = Number(questions[index]?.part);
    if (!Number.isInteger(part) || part < 1 || part > 7) return index + 1;
    let pos = 0;
    for (let i = 0; i < index; i++) if (Number(questions[i]?.part) === part) pos++;
    return PART_STARTS[part] + pos;
  };

  // Đọc bảng đáp án từ file (rule hoặc AI, theo backend) — lỗi 501
  // (gemini_not_configured) xử lý giống onAiParse: hiện banner aiKeyMissing.
  const onAnswerKeyParse = async () => {
    if (!akFile) return;
    setAkBusy(true); setError(null); setAkResult(null); setAkApplied(null);
    try {
      const r = await api.parseAnswerKey(ts.id, akFile);
      setAkResult(r);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 501 || e.code === 'gemini_not_configured')) setAiKeyMissing(true);
      else if (e instanceof ApiError && (e.status === 403 || e.code === 'forbidden')) setError(e);
      else setError(e);
    } finally { setAkBusy(false); }
  };

  // Điền đáp án từ bảng đáp án vào bản xem trước theo số câu chuẩn TOEIC.
  // Chỉ điền khi đáp án hợp lệ với Part đó (Part 2 chỉ A–C); câu nào key
  // thiếu (hoặc đáp án không hợp lệ) thì ghi vào danh sách missing để
  // admin chọn tay. aiLiveErrorCount tự tính lại từ aiPreview nên số câu
  // lỗi giảm tương ứng, không cần đếm riêng.
  const applyAnswerKey = () => {
    if (!aiPreview || !akResult) return;
    const questions = aiPreview.questions;
    const expected = (part: number) => (part === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']);
    let filled = 0;
    const missing: number[] = [];
    const next = questions.map((q, i) => {
      const num = standardNumber(questions, i);
      const ans = akResult.key[String(num)];
      if (ans && expected(Number(q.part)).includes(ans)) {
        filled++;
        return { ...q, correct: ans };
      }
      missing.push(num);
      return q;
    });
    setAiPreview({ ...aiPreview, questions: next });
    setAkApplied({ filled, total: questions.length, missing });
  };

  // Số câu AI còn lỗi theo validate hiện tại (giảm dần khi admin sửa đáp án tay).
  const aiLiveErrorCount = aiPreview
    ? aiPreview.questions.filter((q, i) => validateQuestion(q, i)).length
    : 0;

  // Danh sách đáp án rút gọn để hiển thị: "1: A, 2: C, 3: B…", tối đa 20 mục.
  const akEntries = akResult
    ? Object.entries(akResult.key)
      .map(([n, a]) => [Number(n), a] as [number, string])
      .sort((a, b) => a[0] - b[0])
    : [];
  const akPreviewText = akEntries.slice(0, 20).map(([n, a]) => `${n}: ${a}`).join(', ')
    + (akEntries.length > 20 ? ', …' : '');

  const saveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPart == null) return;
    setBusy(true); setError(null); setMsg('');
    try {
      // Câu chỉ-nghe (Part 1/2): không có chữ in — gửi content rỗng và
      // options chỉ có nhãn (Part 1: A–D, Part 2: A–C).
      const listeningOnly = manualPart === 1 || manualPart === 2;
      const options = listeningOnly
        ? (manualPart === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']).map(label => ({ label, content: '' }))
        : [
            { label: 'A', content: manual.optA }, { label: 'B', content: manual.optB },
            { label: 'C', content: manual.optC }, { label: 'D', content: manual.optD },
          ];
      const body: Record<string, unknown> = {
        part: manualPart, content: listeningOnly ? '' : manual.content, explanation: manual.explanation,
        topic: manual.topic, difficulty: manual.difficulty, script: manual.script,
        passageId: manual.passageId, passageTitle: manual.passageTitle, passageText: manual.passageText,
        ...(manual.imageUrl ? { imageUrl: manual.imageUrl } : {}),
        ...(manual.audioUrl ? { audioUrl: manual.audioUrl } : {}),
        options,
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
              onChange={e => { const f = e.target.files?.[0]; if (f) { setAiFile(f); setAiPreview(null); setAiKeyMissing(false); setAkFile(null); setAkResult(null); setAkApplied(null); setError(null); setMsg(''); } e.target.value = ''; }}
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
                            {(q.part === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']).map(l => <option key={l} value={l}>{l}</option>)}
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
              <button className="btn secondary" onClick={() => { setAiPreview(null); setAkFile(null); setAkResult(null); setAkApplied(null); }}>Hủy</button>
            </div>
          </div>
        )}
        {aiPreview && (
          <div className="panel">
            <h3>📋 Nhận diện đáp án</h3>
            <p className="muted">Upload file đáp án (bảng đáp án) để điền đáp án đúng vào bản xem trước phía trên — khớp theo số câu chuẩn của TOEIC.</p>
            <div className="btn-row">
              <label className="btn secondary" style={{ cursor: 'pointer' }}>
                📄 Chọn file đáp án
                <input
                  type="file" accept=".txt,.docx,.pdf,.png,.jpg,.jpeg" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setAkFile(f); setAkResult(null); setAkApplied(null); setError(null); } e.target.value = ''; }}
                />
              </label>
              <button className="btn" disabled={!akFile || akBusy} onClick={() => void onAnswerKeyParse()}>
                {akBusy ? 'Đang đọc đáp án…' : '📋 Nhận diện đáp án'}
              </button>
            </div>
            {akFile && <p className="muted">Đã chọn: {akFile.name}</p>}
            {akBusy && <p>Đang đọc file đáp án…</p>}
            {akResult && (
              <>
                <p>Đã đọc được {akResult.found} đáp án (nguồn: {akResult.source === 'ai' ? 'AI' : 'tự động'})</p>
                {akResult.warnings.length > 0 && (
                  <p style={{ color: '#B98A1D' }}>⚠ {akResult.warnings.join(' ')}</p>
                )}
                {akPreviewText && <p className="muted">{akPreviewText}</p>}
                <div className="btn-row">
                  <button className="btn" onClick={applyAnswerKey}>✅ Áp dụng vào bản xem trước</button>
                </div>
              </>
            )}
            {akApplied && (
              <>
                <p>Đã điền đáp án cho {akApplied.filled}/{akApplied.total} câu.</p>
                {akApplied.missing.length > 0 && (
                  <p style={{ color: '#B98A1D' }}>
                    Chưa có đáp án: câu {akApplied.missing.slice(0, 20).join(', ')}{akApplied.missing.length > 20 ? ', …' : ''} — chọn tay nốt trong bảng xem trước phía trên.
                  </p>
                )}
              </>
            )}
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
              {(p === 1 || p === 2) ? (
                <p className="muted">🎧 Câu chỉ-nghe: đề thi thật không in chữ cho Part này ({p === 1 ? 'chỉ có ảnh + 4 câu nói trong audio' : 'chỉ có câu hỏi + 3 câu trả lời trong audio'}) — chỉ cần ảnh (Part 1), file audio và đáp án đúng.</p>
              ) : (
                <>
                  <label>Nội dung câu hỏi (tiếng Anh)</label>
                  <textarea rows={3} value={manual.content} onChange={e => setManual({ ...manual, content: e.target.value })} required />
                  <label>Phương án A</label><input value={manual.optA} onChange={e => setManual({ ...manual, optA: e.target.value })} required />
                  <label>Phương án B</label><input value={manual.optB} onChange={e => setManual({ ...manual, optB: e.target.value })} required />
                  <label>Phương án C</label><input value={manual.optC} onChange={e => setManual({ ...manual, optC: e.target.value })} required />
                  <label>Phương án D</label><input value={manual.optD} onChange={e => setManual({ ...manual, optD: e.target.value })} required />
                </>
              )}
              <label>Đáp án đúng</label>
              <select value={manual.correct} onChange={e => setManual({ ...manual, correct: e.target.value })}>
                {(p === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']).map(l => <option key={l}>{l}</option>)}
              </select>
              <label>Giải thích (tiếng Việt, ngắn)</label><textarea rows={2} value={manual.explanation} onChange={e => setManual({ ...manual, explanation: e.target.value })} />
              <label>Script / transcript (Part 1–4)</label><textarea rows={2} value={manual.script} onChange={e => setManual({ ...manual, script: e.target.value })} />
              {mediaCfg?.configured ? (
                <>
                  {p === 1 && (
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
              {!(p === 1 || p === 2) && (
                <>
                  <label>ID đoạn (passageId, không bắt buộc)</label><input value={manual.passageId} onChange={e => setManual({ ...manual, passageId: e.target.value })} />
                  <label>Tiêu đề đoạn (passageTitle, không bắt buộc)</label><input value={manual.passageTitle} onChange={e => setManual({ ...manual, passageTitle: e.target.value })} />
                  <label>Đoạn văn (passageText, không bắt buộc)</label><textarea rows={3} value={manual.passageText} onChange={e => setManual({ ...manual, passageText: e.target.value })} />
                </>
              )}
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
