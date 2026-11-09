import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, targetScoreOf, type Attempt, type StatsOverview } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, partName, TierBadge, XpBar } from '../components';

export default function Stats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [history, setHistory] = useState<Attempt[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.statsOverview().then(setStats).catch(setError);
    api.statsHistory().then(setHistory).catch(() => undefined);
  }, []);

  const target = targetScoreOf(user);
  const best = stats?.recentScores?.length ? Math.max(...stats.recentScores.map(s => s.totalScore)) : 0;

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
            <div className="card stat-card"><div className="ico">⭐</div><div className="muted">Tổng XP</div><div className="stat-num">{stats.totalXp}</div><XpBar xp={stats.totalXp} gold /></div>
            <div className="card stat-card"><div className="ico">🎯</div><div className="muted">Mục tiêu điểm</div><div className="stat-num">{target}</div><p className="muted">Còn cách mục tiêu: {Math.max(0, target - best)} điểm (điểm cao nhất: {best || '—'})</p>{best > 0 && <p><TierBadge total={best} /></p>}</div>
            <div className="card"><div className="muted">Part yếu nhất</div><div className="stat-num">{stats.weakestPart ? partName(stats.weakestPart) : '—'}</div></div>
          </div>
          <div className="card"><h2>Tỉ lệ đúng theo Part</h2>
            {stats.byPart.map(b => (
              <div key={b.part} style={{ marginBottom: '.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{partName(b.part)}</span><span>{Math.round(b.accuracy * 100)}% ({b.correct}/{b.answered})</span></div>
                <div className="bar"><i style={{ width: `${b.accuracy * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="card"><h2>Điểm thi thử theo thời gian (điểm ước lượng)</h2>
            {stats.recentScores.length === 0 ? <p className="muted">Chưa có bài thi thử nào.</p> : (
              <table><thead><tr><th>Ngày</th><th>Điểm</th></tr></thead><tbody>
                {stats.recentScores.map((s, i) => <tr key={i}><td>{s.date}</td><td>{s.totalScore}</td></tr>)}
              </tbody></table>
            )}
          </div>
        </>
      )}
      <div className="card"><h2>Lịch sử làm bài</h2>
        {history.length === 0 ? <p className="muted">Chưa có lịch sử.</p> : (
          <table><thead><tr><th>Ngày</th><th>Chế độ</th><th>Điểm</th><th></th></tr></thead><tbody>
            {history.map(a => (
              <tr key={a.id}><td>{(a.finished_at || a.started_at || '').slice(0, 10)}</td><td>{a.mode}{a.part ? ` — Part ${a.part}` : ''}</td><td>{a.total_score ?? '—'}</td>
                <td>{a.mode !== 'practice' ? <Link to={`/result/${a.id}`}>Xem lại</Link> : ''}</td></tr>
            ))}
          </tbody></table>
        )}
      </div>
    </div>
  );
}
