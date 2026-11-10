import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type TestSet } from '../api';
import { ErrorBox, partName, sectionOf } from '../components';

export default function TestSetDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [ts, setTs] = useState<TestSet | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(10);

  useEffect(() => {
    if (!id) return;
    api.testSet(id).then(setTs).catch(setError).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Đang tải đề thi…</p>;
  if (!ts) return <div><ErrorBox error={error} /><p>Không tìm thấy bộ đề. <Link to="/practice">Quay lại danh sách đề</Link></p></div>;

  const total = ts.totalQuestions || 0;
  const answered = ts.progress?.answeredTotal || 0;
  const correct = ts.progress?.correctTotal || 0;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const partProgress = (p: number) => ts.progress?.byPart.find(b => b.part === p);

  return (
    <div>
      <p><Link to="/practice">← Quay lại danh sách đề</Link></p>
      <h1>{ts.title}</h1>
      {ts.description && <p className="muted">{ts.description}</p>}
      <ErrorBox error={error} />
      <div className="card">
        <p><span className="stat-num">{total}</span> câu • Đã làm {answered}/{total} câu ({pct}%) • Đúng {correct} câu</p>
        <div className="bar green"><i style={{ width: `${pct}%` }} /></div>
        {ts.missing.length > 0 && (
          <p style={{ color: '#ffb800', marginTop: '.6rem' }}>
            ⚠ Đề chưa đủ câu chuẩn: {ts.missing.map(m => `Part ${m.part} thiếu ${m.missing} câu`).join(', ')}. Bạn vẫn có thể luyện các câu hiện có.
          </p>
        )}
        <div className="btn-row">
          <button className="btn gold" disabled={!total} onClick={() => nav(`/mock?testSetId=${ts.id}`)}>🏆 Thi thử cả đề ({total} câu · 120 phút)</button>
        </div>
      </div>

      <div className="grid">
        {[1, 2, 3, 4, 5, 6, 7].map(p => {
          const info = ts.parts.find(x => x.part === p);
          const n = info?.count || 0;
          const prog = partProgress(p);
          return (
            <div key={p} className="card part-card">
              <div className="part-ico">{p <= 4 ? '🎧' : '📖'} LV.{p}</div>
              <strong>{partName(p)}</strong> <span className="pill">{sectionOf(p)}</span>
              <p className="muted">{n} câu trong đề này</p>
              {prog
                ? <p>Đã làm {prog.answered}/{n} câu · đúng {prog.correct}</p>
                : <p className="muted">Chưa làm câu nào ở Part này</p>}
              {prog && n > 0 && <div className="bar"><i style={{ width: `${Math.round((prog.answered / n) * 100)}%` }} /></div>}
              <div className="btn-row">
                <button
                  className="btn"
                  disabled={!n}
                  onClick={() => nav(`/practice/session?testSetId=${ts.id}&part=${p}&count=${Math.min(count, n)}`)}
                >
                  Luyện Part này
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <label htmlFor="ts-count">Số câu mỗi lần luyện Part</label>
        <select id="ts-count" value={count} onChange={e => setCount(Number(e.target.value))}>
          {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n} câu</option>)}
        </select>
      </div>
    </div>
  );
}
