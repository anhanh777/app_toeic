import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type TestSet } from '../api';
import { ErrorBox, partName, sectionOf } from '../components';
import { partLabel, partNameFor, useExam } from '../exam';
import { LoadingLine, useUiSettings } from '../uiSettings';

export default function TestSetDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { exam: ctxExam } = useExam();
  const { settings } = useUiSettings();
  const [ts, setTs] = useState<TestSet | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.testSet(id).then(setTs).catch(setError).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingLine effect={settings.ui.loading.page} speed={settings.ui.loading.speed} text="Đang tải đề thi…" />;
  if (!ts) return <div><ErrorBox error={error} /><p>Không tìm thấy bộ đề. <Link to="/practice">Quay lại danh sách đề</Link></p></div>;

  // Kỳ thi của đề (backend trả exam); fallback về kỳ thi đang chọn.
  const ex = (ts.exam === 'ielts' || ts.exam === 'toeic' ? ts.exam : ctxExam) ?? 'toeic';
  const isIelts = ex === 'ielts';
  const fullMinutes = isIelts ? 90 : 120;
  const total = ts.totalQuestions || 0;
  const answered = ts.progress?.answeredTotal || 0;
  const correct = ts.progress?.correctTotal || 0;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const partProgress = (p: number) => ts.progress?.byPart.find(b => b.part === p);
  const renderPartCard = (p: number) => {
    const info = ts.parts.find(x => x.part === p);
    const n = info?.count || 0;
    const prog = partProgress(p);
    return (
      <div key={p} className="card part-card">
        <div className="part-ico">{p <= 4 ? '🎧' : '📖'} {partLabel(p, ex)}</div>
        <strong>{isIelts ? partNameFor(p, ex) : partName(p)}</strong> <span className="pill">{sectionOf(p)}</span>
        <p className="muted">{n} câu trong đề này</p>
        {prog
          ? <p>Đã làm {prog.answered}/{n} câu · đúng {prog.correct}</p>
          : <p className="muted">Chưa làm câu nào ở {partLabel(p, ex)} này</p>}
        {prog && n > 0 && <div className="bar"><i style={{ width: `${Math.round((prog.answered / n) * 100)}%` }} /></div>}
        <div className="btn-row">
          <button
            className="btn"
            disabled={!n}
            onClick={() => nav(`/practice/session?testSetId=${ts.id}&part=${p}&exam=${ex}`)}
          >
            Luyện {partLabel(p, ex)} này ({n} câu)
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <p><Link to="/practice">← Quay lại danh sách đề</Link></p>
      <h1>{ts.title}</h1>
      {ts.description && <p className="muted">{ts.description}</p>}
      {isIelts && ts.title.includes('(Sample)') && (
        <p className="muted">📌 Đề mẫu IELTS — dùng để làm quen với dạng bài thi. Đề mẫu chưa có audio, bạn vẫn làm bài bình thường.</p>
      )}
      <ErrorBox error={error} />
      <div className="card">
        <p><span className="stat-num">{total}</span> câu • Đã làm {answered}/{total} câu ({pct}%) • Đúng {correct} câu</p>
        <div className="bar green"><i style={{ width: `${pct}%` }} /></div>
        {ts.missing.length > 0 && (
          <p style={{ color: 'var(--amber)', marginTop: '.6rem' }}>
            ⚠ Đề chưa đủ câu chuẩn: {ts.missing.map(m => `${partLabel(m.part, ex)} thiếu ${m.missing} câu`).join(', ')}. Bạn vẫn có thể luyện các câu hiện có.
          </p>
        )}
        <div className="btn-row">
          <button className="btn gold" disabled={!total} onClick={() => nav(`/mock?testSetId=${ts.id}&exam=${ex}`)}>🏆 Thi thử cả đề ({total} câu · {fullMinutes} phút)</button>
        </div>
      </div>

      <h2>🎧 Listening — {isIelts ? 'Section 1–4' : 'Part 1–4'}</h2>
      <div className="grid parts-grid">
        {[1, 2, 3, 4].map(renderPartCard)}
      </div>
      <h2>📖 Reading — {isIelts ? 'Passage 1–3' : 'Part 5–7'}</h2>
      <div className="grid parts-grid">
        {[5, 6, 7].map(renderPartCard)}
      </div>
    </div>
  );
}
