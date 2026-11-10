import { useEffect, useState } from 'react';
import { api, type LeaderboardEntry } from '../api';
import { ErrorBox, RankChip } from '../components';

type Metric = 'score' | 'xp';
type Tab = 'week' | 'month' | 'all';
const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const [metric, setMetric] = useState<Metric>('score');
  const [tab, setTab] = useState<Tab>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [me, setMe] = useState<(LeaderboardEntry & { rank: number }) | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.leaderboard(metric, tab).then(d => { setEntries(d.entries); setMe(d.me); }).catch(setError).finally(() => setLoading(false));
  }, [metric, tab]);

  const value = (e: LeaderboardEntry) => (metric === 'score' ? e.score : e.xp);

  return (
    <div>
      <div className="hero">
        <h1>🏆 Bảng xếp hạng</h1>
        <p className="sub">Xem mình đang đứng ở đâu và cố gắng thêm một chút mỗi ngày nhé.</p>
      </div>
      <ErrorBox error={error} />
      <div className="btn-row seg">
        <button className={`btn ${metric === 'score' ? 'gold' : 'secondary'}`} onClick={() => setMetric('score')}>🏆 Bảng điểm thi thử</button>
        <button className={`btn ${metric === 'xp' ? 'gold' : 'secondary'}`} onClick={() => setMetric('xp')}>⭐ Bảng XP</button>
      </div>
      <div className="btn-row seg">
        {(['week', 'month', 'all'] as Tab[]).map(t => (
          <button key={t} className={`btn ${tab === t ? 'neon' : 'secondary'}`} onClick={() => setTab(t)}>
            {t === 'week' ? 'Tuần này' : t === 'month' ? 'Tháng này' : 'Mọi lúc'}
          </button>
        ))}
      </div>
      {loading ? <p>Đang tải…</p> : (
        <>
          {entries.length >= 3 && (
            <div className="top3-list" aria-label="Top 3">
              {entries.slice(0, 3).map((e) => (
                <div key={e.rank} className="top3-place">
                  <div className={`medal medal-${e.rank}`}>{e.rank}</div>
                  <div className="p-name">{MEDALS[e.rank - 1]} {e.name}</div>
                  <div className="p-score">{value(e)} {metric === 'score' ? 'điểm' : 'XP'}</div>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <table><thead><tr><th>Hạng</th><th>Học viên</th><th>{metric === 'score' ? 'Điểm thi thử cao nhất' : 'XP'}</th><th>Câu đã làm</th></tr></thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.rank} className={e.rank <= 3 ? 'top3' : ''}>
                    <td><RankChip rank={e.rank} /> {e.rank <= 3 ? MEDALS[e.rank - 1] : ''}</td>
                    <td className="lb-row-name">{e.avatarUrl ? <img src={e.avatarUrl} alt="" width={28} style={{ verticalAlign: 'middle', marginRight: 6 }} /> : null}{e.name}</td>
                    <td><strong>{value(e)}</strong></td><td>{e.answered ?? '—'}</td>
                  </tr>
                ))}
              </tbody></table>
            {entries.length === 0 && <p className="muted">Chưa có ai trên bảng xếp hạng trong khoảng này.</p>}
          </div>
        </>
      )}
      {me && (
        <div className="card me-row">
          <strong>Bạn đang hạng #{me.rank}</strong> — {metric === 'score' ? `điểm: ${me.score}` : `XP: ${me.xp}`}
          {entries[me.rank - 2] && <span> — còn {value(entries[me.rank - 2]) - value(me)} {metric === 'score' ? 'điểm' : 'XP'} nữa là lên hạng #{me.rank - 1}</span>}
        </div>
      )}
      <p className="muted">Bảng điểm chỉ tính bài thi full đủ điều kiện (làm đủ thời gian tối thiểu). Muốn ẩn tên khỏi bảng xếp hạng, vào Cài đặt.</p>
    </div>
  );
}
