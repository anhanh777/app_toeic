import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, scoreLevel } from '../api';
import { ErrorBox, partName, TierBadge } from '../components';

export default function Result() {
  const { id } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.testResult>> | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (id) api.testResult(Number(id)).then(setData).catch(setError);
  }, [id]);

  if (error) return <div><ErrorBox error={error} /><Link to="/">Về trang chủ</Link></div>;
  if (!data) return <p>Đang tải kết quả…</p>;

  const isFull = data.mode === 'full';
  return (
    <div>
      <h1>Kết quả thi thử</h1>
      {isFull && data.total_score != null ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="muted">Tổng điểm (điểm ước lượng)</div>
          <div className="big">{data.total_score} / 990</div>
          <p><TierBadge total={data.total_score} /></p>
          <p className="hearts">{'★'.repeat(data.total_score >= 900 ? 3 : data.total_score >= 600 ? 2 : 1)}{'☆'.repeat(data.total_score >= 900 ? 0 : data.total_score >= 600 ? 1 : 2)}</p>
          <p>Mức: {scoreLevel(data.total_score)}</p>
          <p>Listening: {data.listening_score ?? '—'} ({data.listening_correct ?? 0} câu đúng) • Reading: {data.reading_score ?? '—'} ({data.reading_correct ?? 0} câu đúng)</p>
          <p className="muted">Điểm ước lượng theo bảng quy đổi tham khảo công khai, không phải điểm chính thức của ETS.</p>
        </div>
      ) : (
        <div className="card">
          <p className="big">{(data.listening_correct ?? 0) + (data.reading_correct ?? 0)} câu đúng</p>
          <p className="muted">Bài thi mini (1 Part) chỉ báo số câu đúng/tổng, không có điểm 10–990.</p>
        </div>
      )}
      {data.byPart && (
        <div className="card"><h2>Điểm theo Part</h2>
          {data.byPart.map(b => (
            <div key={b.part} style={{ marginBottom: '.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{partName(b.part)}</span><span>{b.correct}/{b.total}</span></div>
              <div className="bar"><i style={{ width: `${b.total ? (b.correct / b.total) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      {data.wrongQuestionIds?.length ? (
        <div className="card"><h2>Câu làm sai ({data.wrongQuestionIds.length})</h2><p>{data.wrongQuestionIds.join(', ')}</p>
          <div className="btn-row"><Link className="btn" to="/wrong">Ôn lại câu sai</Link></div></div>
      ) : <div className="card"><p>🎉 Không có câu sai!</p></div>}
      <div className="btn-row"><Link className="btn secondary" to="/mock">Thi thử lại</Link><Link className="btn secondary" to="/">Về trang chủ</Link></div>
    </div>
  );
}
