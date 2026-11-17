import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, scoreLevel } from '../api';
import { ErrorBox, partName, TierBadge } from '../components';
import { bandLevel, isFillIn, isMultiAnswer, parseSelectedLabels, partNameFor, realQuestionNumber, stripLeadingNumber } from '../exam';
import { RootCausePicker, skillOfPart } from '../ielts-phase1';
import { LoadingLine, useUiSettings } from '../uiSettings';
import { WordText } from '../wordLookup';

export default function Result() {
  const { id } = useParams();
  const { settings } = useUiSettings();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.testResult>> | null>(null);
  const [error, setError] = useState<unknown>(null);
  // IELTS-only: mã nguyên nhân đã ghi + đánh dấu đoán mò, theo id câu.
  const [causeById, setCauseById] = useState<Record<string, string>>({});
  const [guessedById, setGuessedById] = useState<Record<string, boolean>>({});
  // Bộ lọc danh sách câu ở trang kết quả: tất cả / đúng / sai.
  const [detailFilter, setDetailFilter] = useState<'all' | 'correct' | 'wrong'>('all');

  useEffect(() => {
    if (id) api.testResult(Number(id)).then(setData).catch(setError);
  }, [id]);

  if (error) return <div><ErrorBox error={error} /><Link to="/">Về trang chủ</Link></div>;
  if (!data) return <LoadingLine effect={settings.ui.loading.page} speed={settings.ui.loading.speed} text="Đang tải kết quả…" />;

  const isFull = data.mode === 'full';
  const isIelts = data.exam === 'ielts' || data.overallBand != null;
  const totalCorrect = (data.listening_correct ?? 0) + (data.reading_correct ?? 0);
  // Chi tiết TẤT CẢ câu trong bài (backend trả kèm detail, có flag
  // correct từng câu); bài cũ không có detail thì fallback về danh
  // sách id câu sai như cũ.
  const detailAll = data.detail ?? [];
  const correctCount = detailAll.filter(d => d.correct === true).length;
  const wrongCount = detailAll.length - correctCount;
  // Số câu thật trên đề, tính theo thứ tự trong bài (chung hàm với phòng thi).
  const withinSeen: Record<number, number> = {};
  const detailNumbers = detailAll.map(d => {
    const p = d.part ?? 0;
    withinSeen[p] = (withinSeen[p] ?? 0) + 1;
    return realQuestionNumber(isIelts ? 'ielts' : 'toeic', p, withinSeen[p]);
  });

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
      {detailAll.length ? (
        <div className="card">
          <h2>Chi tiết từng câu ({correctCount}/{detailAll.length} đúng)</h2>
          {wrongCount === 0 && <p>🎉 Không có câu sai!</p>}
          <div className="btn-row" role="group" aria-label="Lọc câu">
            <button type="button" className={detailFilter === 'all' ? 'btn' : 'btn secondary'} onClick={() => setDetailFilter('all')}>Tất cả ({detailAll.length})</button>
            <button type="button" className={detailFilter === 'correct' ? 'btn' : 'btn secondary'} onClick={() => setDetailFilter('correct')}>✓ Đúng ({correctCount})</button>
            <button type="button" className={detailFilter === 'wrong' ? 'btn' : 'btn secondary'} onClick={() => setDetailFilter('wrong')}>✗ Sai ({wrongCount})</button>
          </div>
          {detailAll.map((d, i) => {
            if (detailFilter === 'correct' && d.correct !== true) return null;
            if (detailFilter === 'wrong' && d.correct === true) return null;
            // IELTS-only: cổng đáp án đúng — phải chọn nguyên nhân gốc
            // (POST /api/ielts/error-log) thì mới hiện đáp án đúng của
            // câu đó. TOEIC và câu làm đúng: hiện đáp án đúng như cũ.
            const causeLogged = !!causeById[d.questionId];
            const n = detailNumbers[i];
            const status = d.correct === true ? '✓ Đúng' : d.correct === false ? '✗ Sai' : '— Chưa trả lời';
            // Chi doan van DOC (TOEIC P6/P7, IELTS Reading) moi cho tra tu.
            const isReadingPassage = isIelts ? (d.part ?? 0) >= 5 : (d.part ?? 0) >= 6;
            return (
              <div key={d.questionId} style={{ borderBottom: '1px solid var(--border-soft)', padding: '.5rem 0' }}>
                <p style={{ margin: '.2rem 0' }}><strong>Câu {n} · {status}</strong>{d.content ? <> — {stripLeadingNumber(d.content, n)}</> : null}</p>
                {isIelts && d.correct !== true && !causeLogged ? (
                  <>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontWeight: 500 }}>
                      <input type="checkbox" checked={!!guessedById[d.questionId]}
                        onChange={e => setGuessedById(m => ({ ...m, [d.questionId]: e.target.checked }))} />
                      Câu này mình đoán mò 🤔
                    </label>
                    <RootCausePicker
                      skill={d.part ? skillOfPart(d.part) : ''}
                      questionId={d.questionId}
                      attemptId={id ? Number(id) : undefined}
                      questionType={d.questionType}
                      guessed={!!guessedById[d.questionId]}
                      onLogged={code => setCauseById(m => ({ ...m, [d.questionId]: code }))}
                    />
                  </>
                ) : (
                  <>
                    <p className="muted" style={{ margin: '.2rem 0' }}>
                      {isFillIn(d.questionType) ? 'Đáp án bạn gõ: ' : 'Đáp án bạn chọn: '}
                      {/* list_selection: "A,C" → "A, C" cho dễ đọc. */}
                      <strong>{isMultiAnswer(d.questionType) ? (parseSelectedLabels(d.selected).join(', ') || '—') : (d.selected ?? '—')}</strong>
                      {' • '}Đáp án đúng: <strong>{isMultiAnswer(d.questionType)
                        ? (parseSelectedLabels(d.correctLabel).join(', ') || d.correctText || '—')
                        : (d.correctText ?? d.correctLabel ?? '—')}</strong>
                    </p>
                    {d.explanation ? (
                      <p style={{ margin: '.2rem 0' }}><strong>Giải thích:</strong> {d.explanation}</p>
                    ) : (
                      <p className="muted" style={{ margin: '.2rem 0' }}>Chưa có giải thích chi tiết trong file đáp án.</p>
                    )}
                    {d.script ? (
                      <details style={{ margin: '.2rem 0' }}>
                        <summary>Xem transcript</summary>
                        <p>{d.script}</p>
                      </details>
                    ) : null}
                    {d.passageText ? (
                      <details style={{ margin: '.2rem 0' }}>
                        <summary>Xem đoạn văn</summary>
                        <p>{isReadingPassage ? <WordText text={d.passageText} /> : d.passageText}</p>
                      </details>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
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
