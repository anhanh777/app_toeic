import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Question, type TestSet, type MediaConfig } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Modal } from '../components';
import { LoadingLine, useUiSettings } from '../uiSettings';
import { uploadToCloudinary } from '../cloudinary';
import { normalizeImportFile, type QuestionError } from '../testSetUtils';
import { QUESTION_TYPE_NAMES, isFillIn } from '../exam';
import {
  IELTS_PART_LABELS, IELTS_STANDARD_COUNTS, IELTS_TYPED_TYPES,
  expectedIeltsLabels, splitValidIelts, validateIeltsQuestion,
} from '../ieltsAdminUtils';

interface PartPreview {
  part: number;
  valid: Record<string, unknown>[];
  errors: QuestionError[];
  fileName: string;
}

const emptyManual = {
  questionType: 'multiple_choice',
  content: '',
  options: ['', '', '', ''],
  correct: 'A',
  correctMulti: [] as string[],
  correctText: '',
  wordLimit: '',
  acceptedAnswers: '',
  imageUrl: '',
  audioUrl: '',
  explanation: '',
  script: '',
  passageId: '',
  passageTitle: '',
  passageText: '',
  topic: '',
  difficulty: 'medium',
};

/* Quản lý 1 đề IELTS: audio từng Section, câu hỏi từng Part (JSON import
   + thêm tay với đủ 19 dạng câu), xem/xóa câu hỏi.
   KHÔNG có mục AI parse ở đây — backend ai-parse hiện chỉ hiểu cấu trúc
   đề TOEIC, chưa parse được đề IELTS. */
export default function IeltsTestSetAdmin() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { settings } = useUiSettings();
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
  const [mediaCfg, setMediaCfg] = useState<MediaConfig | null>(null);
  const [imgUploading, setImgUploading] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [manualAudioName, setManualAudioName] = useState('');
  const [partMedia, setPartMedia] = useState<Record<number, string>>({});
  const [pendingPartAudio, setPendingPartAudio] = useState<Record<number, string>>({});
  const [partAudioUploading, setPartAudioUploading] = useState<number | null>(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    api.testSet(id).then(setTs).catch(setError).finally(() => setLoading(false));
  };
  useEffect(load, [id]);
  useEffect(() => {
    api.mediaConfig().then(setMediaCfg).catch(() => setMediaCfg(null));
  }, []);
  useEffect(() => {
    if (!id) return;
    api.partMedia(id).then(setPartMedia).catch(() => setPartMedia({}));
  }, [id]);

  if (user?.role !== 'admin') {
    return <div className="card"><h1>Không có quyền truy cập</h1><p>Bạn không có quyền xem trang này.</p></div>;
  }
  if (loading) return <LoadingLine effect={settings.ui.loading.page} speed={settings.ui.loading.speed} text="Đang tải đề thi…" />;
  if (!ts) return <div><ErrorBox error={error} /><p>Không tìm thấy bộ đề. <Link to="/ielts">Quay lại quản lý đề IELTS</Link></p></div>;

  const countOf = (p: number) => ts.parts.find(x => x.part === p)?.count || 0;

  const togglePublish = async () => {
    setError(null); setMsg('');
    try {
      const updated = await api.adminUpdateTestSet(ts.id, { isPublished: !ts.isPublished });
      setTs(updated);
      setMsg(updated.isPublished ? 'Đã phát hành đề.' : 'Đã chuyển đề về Nháp.');
    } catch (e) { setError(e); }
  };

  // --- Audio cả Section (Section 1–4): 1 file audio cho cả Section. ---
  const onPartAudioFile = async (file: File, p: number) => {
    if (!mediaCfg?.configured) { setError(new Error('Chưa cấu hình Cloudinary — xem README')); return; }
    setPartAudioUploading(p); setError(null);
    try {
      const url = await uploadToCloudinary(file, 'ielts/audio', mediaCfg);
      setPendingPartAudio(d => ({ ...d, [p]: url }));
    } catch (e) { setError(e); } finally { setPartAudioUploading(null); }
  };
  const savePartAudio = async (p: number) => {
    const url = pendingPartAudio[p];
    if (!url) return;
    setBusy(true); setError(null); setMsg('');
    try {
      const r = await api.savePartMedia(ts.id, p, url);
      setPartMedia(d => ({ ...d, [r.part]: r.audioUrl }));
      setPendingPartAudio(d => { const n = { ...d }; delete n[p]; return n; });
      setMsg(`Đã lưu audio cho ${IELTS_PART_LABELS[p]}.`);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  // --- Import JSON theo Part (validator IELTS, không dùng validator TOEIC). ---
  const onPartFile = async (file: File, part: number) => {
    setError(null); setMsg(''); setPreview(null);
    try {
      const parsed = JSON.parse(await file.text());
      const norm = normalizeImportFile(parsed);
      const ofPart = norm.questions.filter(q => Number((q as { part?: unknown }).part) === part);
      const others = norm.questions.length - ofPart.length;
      const withExam = ofPart.map(q => ({ ...(q as Record<string, unknown>), exam: 'ielts' }));
      const { valid, errors } = splitValidIelts(withExam);
      if (others > 0) setMsg(`File có ${others} câu không thuộc ${IELTS_PART_LABELS[part]} — đã bỏ qua.`);
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
      setMsg(`Đã import ${r.imported} câu vào ${IELTS_PART_LABELS[preview.part]}. ${r.errors.length ? `Lỗi từ máy chủ: ${r.errors.map(e => `#${e.index}${e.id ? ` (${e.id})` : ''}: ${e.reason}`).join('; ')}` : ''}`);
      setPreview(null);
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  // --- Danh sách câu hỏi 1 Part. ---
  const refreshList = async (p: number) => {
    try {
      const items = await api.questions(p, 100, 0, '', ts.id, 'ielts');
      setListQuestions(items);
    } catch (e) { setError(e); }
  };
  const toggleList = async (p: number) => {
    if (listPart === p) { setListPart(null); return; }
    setError(null);
    await refreshList(p);
    setListPart(p);
  };
  const deleteQuestion = async (q: Question) => {
    if (!confirm(`Xóa câu hỏi ${q.id}?`)) return;
    setError(null);
    try {
      await api.adminDeleteQuestion(q.id);
      setMsg(`Đã xóa câu hỏi ${q.id}.`);
      if (listPart != null) await refreshList(listPart);
      load();
    } catch (e) { setError(e); }
  };

  // --- Thêm câu thủ công (đủ 19 dạng IELTS). ---
  const isTyped = IELTS_TYPED_TYPES.has(manual.questionType);
  const isListSelection = manual.questionType === 'list_selection';
  const isFixed3 = manual.questionType === 'true_false_not_given' || manual.questionType === 'yes_no_not_given';
  const optionLabels = isTyped ? [] : isFixed3
    ? expectedIeltsLabels(manual.questionType, 3)
    : expectedIeltsLabels(manual.questionType, manual.options.length);

  const setOptionCount = (n: number) => {
    setManual(m => {
      const opts = [...m.options];
      while (opts.length < n) opts.push('');
      while (opts.length > n) opts.pop();
      return { ...m, options: opts, correct: 'A', correctMulti: [] };
    });
  };

  const onManualImage = async (file: File) => {
    if (!mediaCfg?.configured) { setError(new Error('Chưa cấu hình Cloudinary — xem README')); return; }
    setImgUploading(true); setError(null);
    try {
      const url = await uploadToCloudinary(file, 'ielts/images', mediaCfg);
      setManual(m => ({ ...m, imageUrl: url }));
    } catch (e) { setError(e); } finally { setImgUploading(false); }
  };
  const onManualAudio = async (file: File) => {
    if (!mediaCfg?.configured) { setError(new Error('Chưa cấu hình Cloudinary — xem README')); return; }
    setAudioUploading(true); setError(null);
    try {
      const url = await uploadToCloudinary(file, 'ielts/audio', mediaCfg);
      setManual(m => ({ ...m, audioUrl: url }));
      setManualAudioName(file.name);
    } catch (e) { setError(e); } finally { setAudioUploading(false); }
  };

  const saveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPart == null) return;
    setBusy(true); setError(null); setMsg('');
    try {
      // Backend bắt buộc mỗi câu phải có id duy nhất (form thủ công TOEIC
      // cũ không gửi id nên luôn lỗi 'Thiếu ID câu hỏi' — đã sửa ở đây
      // bằng id sinh theo thời gian).
      const body: Record<string, unknown> = {
        id: `${ts.id}-P${manualPart}-${Date.now().toString(36)}`,
        exam: 'ielts',
        part: manualPart,
        questionType: manual.questionType,
        content: manual.content,
        explanation: manual.explanation,
        topic: manual.topic,
        difficulty: manual.difficulty,
        script: manual.script,
        passageId: manual.passageId,
        passageTitle: manual.passageTitle,
        passageText: manual.passageText,
        ...(manual.imageUrl ? { imageUrl: manual.imageUrl } : {}),
        ...(manual.audioUrl ? { audioUrl: manual.audioUrl } : {}),
      };
      if (isTyped) {
        body.options = [];
        body.correctText = manual.correctText.trim();
        if (manual.wordLimit.trim()) body.wordLimit = Number(manual.wordLimit);
        body.acceptedAnswers = manual.acceptedAnswers.split('\n').map(s => s.trim()).filter(Boolean);
      } else if (isListSelection) {
        body.options = manual.options.map((c, i) => ({ label: String.fromCharCode(65 + i), content: c }));
        body.correct = manual.correctMulti;
      } else {
        body.options = manual.options.map((c, i) => ({ label: optionLabels[i], content: c }));
        body.correct = manual.correct;
      }
      const err = validateIeltsQuestion(body, 0);
      if (err) throw new Error(err.reason);
      await api.adminAddTestSetQuestion(ts.id, body);
      setMsg(`Đã thêm câu hỏi vào ${IELTS_PART_LABELS[manualPart]}.`);
      setManual(emptyManual); setManualAudioName(''); setManualPart(null);
      load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div>
      <p><Link to="/ielts">← Quay lại quản lý đề IELTS</Link></p>
      <h1>{ts.title}</h1>
      <p className="muted">{ts.id} • IELTS Academic • <span className={`pill ${ts.isPublished ? 'pill--live' : 'pill--draft'}`}>{ts.isPublished ? 'ĐÃ PHÁT HÀNH' : 'NHÁP'}</span></p>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      <div className="btn-row">
        <button className="btn secondary" onClick={() => void togglePublish()}>{ts.isPublished ? 'Chuyển về Nháp' : 'Phát hành đề'}</button>
      </div>

      <div className="card">
        <h2>🎧 Audio cả Section</h2>
        <p className="muted">1 file audio cho cả Section (Section 1–4). Khi luyện/thi, câu nào chưa có audio riêng sẽ phát audio này. Chọn file mp3 để upload lên Cloudinary rồi bấm Lưu.</p>
        {mediaCfg?.configured ? (
          <div className="audio-grid">
          {[1, 2, 3, 4].map(p => {
            const savedUrl = partMedia[p];
            const pendingUrl = pendingPartAudio[p];
            const url = pendingUrl || savedUrl;
            return (
              <div key={p} className="panel">
                <h3>{IELTS_PART_LABELS[p]}</h3>
                <div className="btn-row">
                  <label className="btn secondary" style={{ cursor: 'pointer' }}>
                    🎵 Chọn file audio (.mp3, ≤ 10MB)
                    <input type="file" accept=".mp3" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void onPartAudioFile(f, p); e.target.value = ''; }} />
                  </label>
                  <button className="btn" disabled={!pendingUrl || busy} onClick={() => void savePartAudio(p)}>
                    {busy && pendingUrl ? 'Đang lưu…' : '💾 Lưu audio'}
                  </button>
                </div>
                {partAudioUploading === p && <p className="muted">Đang tải audio lên Cloudinary…</p>}
                {pendingUrl && <p className="muted">Đã upload, chưa lưu — bấm “Lưu audio” để áp dụng.</p>}
                {url && <audio controls src={url} preload="metadata" style={{ width: '100%' }} />}
                {!url && <p className="muted">Chưa có audio cho {IELTS_PART_LABELS[p]}.</p>}
              </div>
            );
          })}
          </div>
        ) : (
          <p className="muted">Chưa cấu hình Cloudinary — xem README</p>
        )}
      </div>

      {[1, 2, 3, 4, 5, 6, 7].map(p => (
        <div key={p} className="card">
          <h2>{IELTS_PART_LABELS[p]}</h2>
          <p><span className="stat-num">{countOf(p)}/{IELTS_STANDARD_COUNTS[p]}</span> câu</p>
          <div className="bar"><i style={{ width: `${Math.min(100, Math.round((countOf(p) / IELTS_STANDARD_COUNTS[p]) * 100))}%` }} /></div>
          <div className="btn-row">
            <label className="btn secondary" style={{ cursor: 'pointer' }}>
              ⬆ Upload {IELTS_PART_LABELS[p]}
              <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void onPartFile(f, p); e.target.value = ''; }} />
            </label>
            <button className="btn" onClick={() => { setManualPart(p); setManual(emptyManual); setPreview(null); }}>✏️ Thêm câu thủ công</button>
            <button className="btn ghost" onClick={() => void toggleList(p)}>{listPart === p ? 'Ẩn danh sách' : 'Xem danh sách câu'}</button>
          </div>
          <p className="muted">Nút này chỉ nhận file JSON câu hỏi IELTS (part {p}, đúng 19 dạng). Nhận diện bằng AI hiện chưa hỗ trợ đề IELTS.</p>

          {preview && preview.part === p && (
            <Modal title={`Xem trước — ${preview.fileName}`} wide onClose={() => setPreview(null)}>
              <p>{preview.valid.length} câu hợp lệ cho {IELTS_PART_LABELS[p]} • {preview.errors.length} câu lỗi (sẽ bị bỏ qua)</p>
              {preview.errors.length > 0 && (
                <table><thead><tr><th>#</th><th>Lý do</th></tr></thead><tbody>
                  {preview.errors.map(e => <tr key={e.index}><td>{e.index + 1}{e.id ? ` (${e.id})` : ''}</td><td>{e.reason}</td></tr>)}
                </tbody></table>
              )}
              <div className="btn-row">
                <button className="btn" disabled={busy || !preview.valid.length} onClick={() => void confirmPartImport()}>{busy ? 'Đang import…' : `Xác nhận import ${preview.valid.length} câu`}</button>
                <button className="btn secondary" onClick={() => setPreview(null)}>Hủy</button>
              </div>
            </Modal>
          )}

          {manualPart === p && (
            <Modal title={`Thêm câu thủ công — ${IELTS_PART_LABELS[p]}`} onClose={() => setManualPart(null)}>
              <form onSubmit={saveManual}>
              <label>Dạng câu hỏi</label>
              <select value={manual.questionType} onChange={e => {
                const t = e.target.value;
                setManual(m => ({
                  ...m, questionType: t, correct: 'A', correctMulti: [],
                  options: t === 'true_false_not_given' || t === 'yes_no_not_given' ? ['', '', ''] : ['', '', '', ''],
                }));
              }}>
                {Object.entries(QUESTION_TYPE_NAMES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>

              {(p === 1 || p === 2) ? (
                <p className="muted">🎧 Section nghe: câu hỏi thường chỉ có trong audio — nội dung chữ có thể để trống, chỉ cần đáp án đúng.</p>
              ) : (
                <>
                  <label>Nội dung câu hỏi (tiếng Anh)</label>
                  <textarea rows={3} value={manual.content} onChange={e => setManual({ ...manual, content: e.target.value })} required />
                </>
              )}

              {isTyped ? (
                <>
                  <label>Đáp án đúng (gõ tay)</label>
                  <input value={manual.correctText} onChange={e => setManual({ ...manual, correctText: e.target.value })} required placeholder="VD: Smith" />
                  <label>Giới hạn số từ (word limit, không bắt buộc)</label>
                  <input type="number" min={1} value={manual.wordLimit} onChange={e => setManual({ ...manual, wordLimit: e.target.value })} placeholder="VD: 2 (NO MORE THAN TWO WORDS)" />
                  <label>Đáp án chấp nhận thêm (mỗi dòng 1 đáp án, không bắt buộc)</label>
                  <textarea rows={2} value={manual.acceptedAnswers} onChange={e => setManual({ ...manual, acceptedAnswers: e.target.value })} />
                </>
              ) : isListSelection ? (
                <>
                  <label>Phương án (5–7 phương án, chọn 2–3 đáp án đúng)</label>
                  {manual.options.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.4rem' }}>
                      <label style={{ display: 'flex', gap: '.3rem', alignItems: 'center', minWidth: '7rem' }}>
                        <input type="checkbox" checked={manual.correctMulti.includes(String.fromCharCode(65 + i))}
                          onChange={e => setManual(m => ({
                            ...m,
                            correctMulti: e.target.checked
                              ? [...m.correctMulti, String.fromCharCode(65 + i)]
                              : m.correctMulti.filter(x => x !== String.fromCharCode(65 + i)),
                          }))} />
                        {String.fromCharCode(65 + i)} (đúng)
                      </label>
                      <input style={{ flex: 1 }} value={c} onChange={e => setManual(m => ({ ...m, options: m.options.map((x, j) => (j === i ? e.target.value : x)) }))} required />
                    </div>
                  ))}
                  <div className="btn-row">
                    <button type="button" className="btn secondary" disabled={manual.options.length >= 7} onClick={() => setOptionCount(manual.options.length + 1)}>＋ Thêm phương án</button>
                    <button type="button" className="btn secondary" disabled={manual.options.length <= 5} onClick={() => setOptionCount(manual.options.length - 1)}>－ Bớt phương án</button>
                  </div>
                </>
              ) : (
                <>
                  <label>Phương án</label>
                  {manual.options.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.4rem' }}>
                      <span style={{ minWidth: '5.5rem', fontWeight: 700 }}>{optionLabels[i] ?? ''}</span>
                      <input style={{ flex: 1 }} value={c} onChange={e => setManual(m => ({ ...m, options: m.options.map((x, j) => (j === i ? e.target.value : x)) }))} required />
                    </div>
                  ))}
                  {!isFixed3 && (
                    <div className="btn-row">
                      <button type="button" className="btn secondary" disabled={manual.options.length >= 7} onClick={() => setOptionCount(manual.options.length + 1)}>＋ Thêm phương án</button>
                      <button type="button" className="btn secondary" disabled={manual.options.length <= 2} onClick={() => setOptionCount(manual.options.length - 1)}>－ Bớt phương án</button>
                    </div>
                  )}
                  <label>Đáp án đúng</label>
                  <select value={manual.correct} onChange={e => setManual({ ...manual, correct: e.target.value })}>
                    {optionLabels.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </>
              )}

              <label>Giải thích (tiếng Anh hoặc tiếng Việt, ngắn)</label>
              <textarea rows={2} value={manual.explanation} onChange={e => setManual({ ...manual, explanation: e.target.value })} />
              {p <= 4 && (
                <>
                  <label>Script / transcript (Section nghe)</label>
                  <textarea rows={2} value={manual.script} onChange={e => setManual({ ...manual, script: e.target.value })} />
                </>
              )}
              {mediaCfg?.configured ? (
                <>
                  <label>Ảnh minh họa — bản đồ, sơ đồ, biểu đồ (không bắt buộc)</label>
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
                  {p <= 4 && (
                    <>
                      <label>File audio riêng cho câu này (.mp3, không bắt buộc)</label>
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
                  )}
                </>
              ) : (
                <p className="muted">Chưa cấu hình Cloudinary — xem README</p>
              )}
              {p >= 5 && (
                <>
                  <label>ID đoạn (passageId, không bắt buộc)</label>
                  <input value={manual.passageId} onChange={e => setManual({ ...manual, passageId: e.target.value })} />
                  <label>Tiêu đề đoạn (passageTitle, không bắt buộc)</label>
                  <input value={manual.passageTitle} onChange={e => setManual({ ...manual, passageTitle: e.target.value })} />
                  <label>Đoạn văn (passageText, không bắt buộc)</label>
                  <textarea rows={3} value={manual.passageText} onChange={e => setManual({ ...manual, passageText: e.target.value })} />
                </>
              )}
              <label>Chủ đề</label>
              <input value={manual.topic} onChange={e => setManual({ ...manual, topic: e.target.value })} />
              <label>Độ khó</label>
              <select value={manual.difficulty} onChange={e => setManual({ ...manual, difficulty: e.target.value })}>
                <option value="easy">Dễ</option>
                <option value="medium">Trung bình</option>
                <option value="hard">Khó</option>
              </select>
              <div className="btn-row">
                <button className="btn" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu câu hỏi'}</button>
                <button type="button" className="btn secondary" onClick={() => setManualPart(null)}>Hủy</button>
              </div>
              </form>
            </Modal>
          )}

          {listPart === p && (
            <Modal title={`Danh sách câu — ${IELTS_PART_LABELS[p]}`} wide onClose={() => setListPart(null)}>
              <p className="muted">{listQuestions.length} câu đã tải (tối đa 100).</p>
              <div className="table-scroll">
              <table><thead><tr><th>Mã</th><th>Dạng</th><th>Nội dung</th><th>Đáp án</th><th>Giải thích</th><th>Media</th><th></th></tr></thead><tbody>
                {listQuestions.map(q => (
                  <tr key={q.id}>
                    <td>{q.id}</td>
                    <td><span className="cell-trunc" title={QUESTION_TYPE_NAMES[q.questionType || 'multiple_choice'] || q.questionType}>{QUESTION_TYPE_NAMES[q.questionType || 'multiple_choice'] || q.questionType}</span></td>
                    <td><span className="cell-trunc cell-trunc--wide" title={q.content || ''}>{q.content || ''}</span></td>
                    <td>{isFillIn(q.questionType) ? (q.correctText || '') : (q.correctLabel || (q as unknown as { correct?: string }).correct || '')}</td>
                    <td>{q.explanation ? '✓' : '—'}</td>
                    <td>{(q.audioUrl || q.imageUrl) ? '✓' : '—'}</td>
                    <td><button className="btn danger" onClick={() => void deleteQuestion(q)}>Xóa</button></td>
                  </tr>
                ))}
              </tbody></table>
              </div>
              {listQuestions.length === 0 && <p className="muted">Chưa có câu hỏi nào trong phần này.</p>}
            </Modal>
          )}
        </div>
      ))}
    </div>
  );
}
