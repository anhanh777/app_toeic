import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, targetScoreOf, type Attempt, type StatsOverview, type TestSet } from '../api';
import { useAuth } from '../auth';
import { bandLevel, partLabel, partNameFor, questionTypeName, useExam } from '../exam';
import { ErrorBox, partName, TierBadge, XpBar } from '../components';

/** Ngay lam bai dang dd/mm/yyyy — backend tra camelCase (finishedAt) nhung
 * giu fallback snake_case (finished_at) neu co. */
function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('vi-VN');
}

export default function Stats() {
  const { user } = useAuth();
  const { exam } = useExam();
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [history, setHistory] = useState<Attempt[]>([]);
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.statsOverview(ex).then(setStats).catch(setError);
    api.statsHistory(ex).then(setHistory).catch(() => undefined);
    api.testSets(ex).then(setTestSets).catch(() => undefined);
  }, [ex]);

  const target = targetScoreOf(user);
  const best = stats?.recentScores?.length ? Math.max(...stats.recentScores.map(s => s.totalScore)) : 0;
  const bestBand = stats?.bandHistory?.length ? Math.max(...stats.bandHistory.map(b => b.overallBand)) : 0;
  // Tên đề theo testSetId — để lịch sử hiện tên đề thay vì chỉ mã đề.
  const testSetTitleById = new Map(testSets.map(t => [t.id, t.title]));

  return (
    <div>
      <h1>Thống kê</h1>
      <ErrorBox error={error} />
      {stats && (
        <>
          <div className="grid grid3">
            <div className="card"><div className="muted">Tổng câu đã làm</div><div className="stat-num">{stats.totalAnswered}</div></div>
            <div className="card"><div className="muted">Tỉ lệ đúng</div><div className="stat-num">{Math.round(stats.accuracy * 100)}%</div></div>
            <div className="card"><div className="muted">Streak</div><div className="stat-num">{stats.streakDays} ngày 🔥</div></div>
            <div className="card stat-card"><div className="ico">⭐</div><div className="muted">Tổng XP</div><div className="stat-num">{stats.totalXp}</div><div className="card-foot"><XpBar xp={stats.totalXp} gold /></div></div>
            {isIelts ? (
              <div className="card stat-card"><div className="ico">🎯</div><div className="muted">Band tổng cao nhất</div><div className="stat-num">{bestBand ? `Band ${bestBand}` : '—'}</div><div className="card-foot"><p className="muted">{bestBand ? `Mức: ${bandLevel(bestBand)} (band ước lượng)` : 'Chưa có bài thi thử nào.'}</p></div></div>
            ) : (
              <div className="card stat-card"><div className="ico">🎯</div><div className="muted">Mục tiêu điểm</div><div className="stat-num">{target}</div><div className="card-foot"><p className="muted">Còn cách mục tiêu: {Math.max(0, target - best)} điểm (điểm cao nhất: {best || '—'})</p>{best > 0 && <p><TierBadge total={best} /></p>}</div></div>
            )}
            <div className="card"><div className="muted">{isIelts ? 'Section/Passage yếu nhất' : 'Part yếu nhất'}</div><div className="stat-num">{stats.weakestPart ? (isIelts ? partNameFor(stats.weakestPart, ex) : partName(stats.weakestPart)) : '—'}</div>{isIelts && stats.weakestType && <p className="muted" style={{ marginTop: '.3rem' }}>Dạng yếu nhất: {questionTypeName(stats.weakestType)}</p>}</div>
          </div>
          {/* Ý 5 (IELTS-only): gợi ý luyện tiếp — dạng yếu nhất + Section/
              Passage yếu nhất, vào thẳng buổi luyện đã lọc sẵn dạng đó. */}
          {isIelts && stats.weakestType && (
            <div className="card">
              <h2>💡 Gợi ý luyện tiếp</h2>
              <p>
                Dạng yếu nhất của bạn là <strong>{questionTypeName(stats.weakestType)}</strong>
                {stats.weakestPart ? <> ở <strong>{partNameFor(stats.weakestPart, ex)}</strong></> : ''}.
                Luyện riêng dạng này để cải thiện nhanh nhất.
              </p>
              <div className="btn-row">
                {stats.weakestPart ? (
                  <Link className="btn" to={`/practice/part/${stats.weakestPart}?exam=ielts&questionType=${stats.weakestType}`}>
                    ▶ Luyện {questionTypeName(stats.weakestType)}
                  </Link>
                ) : (
                  <Link className="btn" to="/practice">▶ Vào trang Luyện tập</Link>
                )}
                <Link className="btn secondary" to={`/wrong?questionType=${stats.weakestType}`}>
                  Ôn câu sai dạng này
                </Link>
              </div>
            </div>
          )}
          <div className="card"><h2>{isIelts ? 'Tỉ lệ đúng theo Section/Passage' : 'Tỉ lệ đúng theo Part'}</h2>
            {stats.byPart.map(b => (
              <div key={b.part} style={{ marginBottom: '.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{isIelts ? partNameFor(b.part, ex) : partName(b.part)}</span><span>{Math.round(b.accuracy * 100)}% ({b.correct}/{b.answered})</span></div>
                <div className="bar"><i style={{ width: `${b.accuracy * 100}%` }} /></div>
              </div>
            ))}
          </div>
          {isIelts && stats.byType && stats.byType.length > 0 && (
            <div className="card"><h2>Tỉ lệ đúng theo dạng câu hỏi</h2>
              {stats.byType.map(b => (
                <div key={b.questionType} style={{ marginBottom: '.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{questionTypeName(b.questionType)}</span><span>{Math.round(b.accuracy * 100)}% ({b.correct}/{b.answered})</span></div>
                  <div className="bar"><i style={{ width: `${b.accuracy * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
          {isIelts ? (
            <div className="card"><h2>Band thi thử theo thời gian (band ước lượng)</h2>
              {!stats.bandHistory?.length ? <p className="muted">Chưa có bài thi thử nào.</p> : (
                <div>
                  {stats.bandHistory.map((b, i) => (
                    <div key={i} style={{ marginBottom: '.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{b.date}</span>
                        <span>Band {b.overallBand} <span className="muted">(L {b.listeningBand} • R {b.readingBand})</span></span>
                      </div>
                      <div className="bar"><i style={{ width: `${(b.overallBand / 9) * 100}%` }} /></div>
                    </div>
                  ))}
                  <p className="muted">Band tổng cao nhất: {bestBand} ({bandLevel(bestBand)}) — band ước lượng để tham khảo.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="card"><h2>Điểm thi thử theo thời gian (điểm ước lượng)</h2>
              {stats.recentScores.length === 0 ? <p className="muted">Chưa có bài thi thử nào.</p> : (
                <table><thead><tr><th>Ngày</th><th>Điểm</th></tr></thead><tbody>
                  {stats.recentScores.map((s, i) => <tr key={i}><td>{s.date}</td><td>{s.totalScore}</td></tr>)}
                </tbody></table>
              )}
            </div>
          )}
        </>
      )}
      <div className="card"><h2>Lịch sử làm bài</h2>
        {history.length === 0 ? <p className="muted">Chưa có lịch sử.</p> : (
          <table><thead><tr><th>Ngày</th><th>Đề</th><th>Chế độ</th><th>{isIelts ? 'Band' : 'Điểm'}</th><th></th></tr></thead><tbody>
            {history.map(a => (
              <tr key={a.id}><td>{fmtDate(a.finishedAt || a.finished_at || a.startedAt || a.started_at)}</td><td>{a.testSetId ? (testSetTitleById.get(a.testSetId) ?? a.testSetId) : '—'}</td><td>{a.mode}{a.part ? ` — ${isIelts ? partLabel(a.part, ex) : `Part ${a.part}`}` : ''}</td><td>{isIelts ? (a.overallBand != null ? `Band ${a.overallBand}` : '—') : (a.total_score ?? '—')}</td>
                <td>{a.mode !== 'practice' ? <Link to={`/result/${a.id}`}>Xem lại</Link> : ''}</td></tr>
            ))}
          </tbody></table>
        )}
      </div>
    </div>
  );
}
