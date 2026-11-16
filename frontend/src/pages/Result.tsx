import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, scoreLevel } from '../api';
import { ErrorBox, partName, TierBadge } from '../components';
import { bandLevel, isFillIn, partNameFor } from '../exam';

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
  const isIelts = data.exam === 'ielts' || data.overallBand != null;
  const totalCorrect = (data.listening_correct ?? 0) + (data.reading_correct ?? 0);
  // Chi tiết câu sai (backend trả kèm detail): ưu tiên detail có flag
  // correct=false; không có thì fallback về danh sách id như cũ.
  const detailWrong = data.detail?.filter(d => d.correct === false) ?? [];

  return (
    <div>
      <h1>Kết quả thi thử</h1>
      {isIelts ? (
        isFull && data.overallBand != null ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted">Band tổng (band ước lượng để tham khảo)</div>
            <div className="band-num">Band {data.overallBand}</div>
            <p>Mức: {bandLevel(data.overallBand)}</p>
            <p className="hearts">{'★'.repeat(data.overallBand >= 8 ? 3 : data.overallBand >= 6.5 ? 2 : 1)}{'☆'.repeat(data.overallBand >= 8 ? 0 : data.overallBand >= 6.5 ? 1 : 2)}</p>
            <div className="grid" style={{ marginTop: '.8rem', textAlign: 'left' }}>
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="muted">🎧 Listening</div>
                <div className="big">Band {data.listeningBand ?? '—'}</div>
                <p className="muted">{data.listening_correct ?? 0}/40 câu đúng</p>
              </div>
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="muted">📖 Reading</div>
                <div className="big">Band {data.readingBand ?? '—'}</div>
                <p className="muted">{data.reading_correct ?? 0}/40 câu đúng</p>
              </div>
            </div>
            <p className="muted">Band ước lượng theo bảng quy đổi tham khảo công khai, không phải band chính thức.</p>
          </div>
        ) : (
          <div className="card">
            <p className="big">{totalCorrect} câu đúng</p>
            <p className="muted">Bài thi mini (1 Section/Passage) chỉ báo số câu đúng/tổng, không có band.</p>
          </div>
        )
      ) : isFull && data.total_score != null ? (
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
          <p className="big">{totalCorrect} câu đúng</p>
          <p className="muted">Bài thi mini (1 Part) chỉ báo số câu đúng/tổng, không có điểm 10–990.</p>
        </div>
      )}
      {data.byPart && (
        <div className="card"><h2>{isIelts ? 'Điểm theo Section/Passage' : 'Điểm theo Part'}</h2>
          {data.byPart.map(b => (
            <div key={b.part} style={{ marginBottom: '.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{isIelts ? partNameFor(b.part, 'ielts') : partName(b.part)}</span><span>{b.correct}/{b.total}</span></div>
              <div className="bar"><i style={{ width: `${b.total ? (b.correct / b.total) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      {detailWrong.length ? (
        <div className="card"><h2>Câu làm sai ({detailWrong.length})</h2>
          {detailWrong.map(d => (
            <div key={d.questionId} style={{ borderBottom: '1px solid var(--border-soft)', padding: '.5rem 0' }}>
              {d.content && <p style={{ margin: '.2rem 0' }}><strong>{d.content}</strong></p>}
              <p className="muted" style={{ margin: '.2rem 0' }}>
                {isFillIn(d.questionType) ? 'Đáp án bạn gõ: ' : 'Đáp án bạn chọn: '}
                <strong>{d.selected ?? '—'}</strong>
                {' • '}Đáp án đúng: <strong>{d.correctText ?? d.correctLabel ?? '—'}</strong>
              </p>
            </div>
          ))}
          <div className="btn-row"><Link className="btn" to="/wrong">Ôn lại câu sai</Link></div>
        </div>
      ) : data.wrongQuestionIds?.length ? (
        <div className="card"><h2>Câu làm sai ({data.wrongQuestionIds.length})</h2><p>{data.wrongQuestionIds.join(', ')}</p>
          <div className="btn-row"><Link className="btn" to="/wrong">Ôn lại câu sai</Link></div></div>
      ) : <div className="card"><p>🎉 Không có câu sai!</p></div>}
      <div className="btn-row"><Link className="btn secondary" to="/mock">Thi thử lại</Link><Link className="btn secondary" to="/">Về trang chủ</Link></div>
    </div>
  );
}
