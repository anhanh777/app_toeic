import { useEffect, useState } from 'react';
import { api, type LeaderboardEntry } from '../api';
import { ErrorBox, RankChip } from '../components';
import { useExam } from '../exam';
import { LoadingLine } from '../uiSettings';

type Metric = 'score' | 'xp' | 'band';
type Tab = 'week' | 'month' | 'all';
const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const { exam } = useExam();
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  const [metric, setMetric] = useState<Metric>(isIelts ? 'band' : 'score');
  const [tab, setTab] = useState<Tab>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [me, setMe] = useState<(LeaderboardEntry & { rank: number }) | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  // Đổi kỳ thi thì đổi mặc định sang bảng của kỳ thi đó.
  useEffect(() => {
    setMetric(isIelts ? 'band' : 'score');
  }, [isIelts]);

  useEffect(() => {
    setLoading(true);
    // Bảng XP chung cho cả 2 kỳ thi (không lọc exam); bảng điểm/band lọc theo exam.
    api.leaderboard(metric, tab, metric === 'xp' ? undefined : ex).then(d => { setEntries(d.entries); setMe(d.me); }).catch(setError).finally(() => setLoading(false));
  }, [metric, tab, ex]);

  const value = (e: LeaderboardEntry) => (metric === 'xp' ? e.xp : e.score);
  const fmtValue = (e: LeaderboardEntry) => (metric === 'band' ? `Band ${value(e)}` : `${value(e)} ${metric === 'score' ? 'điểm' : 'XP'}`);
  const unit = metric === 'band' ? 'band' : metric === 'score' ? 'điểm' : 'XP';
  const fmtDiff = (d: number) => (metric === 'band' ? d.toFixed(1) : String(d));

  return (
    <div>
      <div className="hero">
        <h1>🏆 Bảng xếp hạng</h1>
        <p className="sub">Xem mình đang đứng ở đâu và cố gắng thêm một chút mỗi ngày nhé.</p>
      </div>
      <ErrorBox error={error} />
      <div className="btn-row seg">
        <button className={`btn ${metric !== 'xp' ? 'gold' : 'secondary'}`} onClick={() => setMetric(isIelts ? 'band' : 'score')}>{isIelts ? '🏆 Bảng band IELTS' : '🏆 Bảng điểm thi thử'}</button>
        <button className={`btn ${metric === 'xp' ? 'gold' : 'secondary'}`} onClick={() => setMetric('xp')}>⭐ Bảng XP</button>
      </div>
      <div className="btn-row seg">
        {(['week', 'month', 'all'] as Tab[]).map(t => (
          <button key={t} className={`btn ${tab === t ? 'neon' : 'secondary'}`} onClick={() => setTab(t)}>
            {t === 'week' ? 'Tuần này' : t === 'month' ? 'Tháng này' : 'Mọi lúc'}
          </button>
        ))}
      </div>
      {loading ? <LoadingLine location="table" text="Đang tải…" /> : (
        <>
          {entries.length >= 3 && (
            <div className="top3-list" aria-label="Top 3">
              {entries.slice(0, 3).map((e) => (
                <div key={e.rank} className="top3-place">
                  <div className={`medal medal-${e.rank}`}>{e.rank}</div>
                  <div className="p-name">{MEDALS[e.rank - 1]} {e.name}</div>
                  <div className="p-score">{fmtValue(e)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <table><thead><tr><th>Hạng</th><th>Học viên</th><th>{metric === 'xp' ? 'XP' : metric === 'band' ? 'Band tổng cao nhất' : 'Điểm thi thử cao nhất'}</th><th>Câu đã làm</th></tr></thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.rank} className={e.rank <= 3 ? 'top3' : ''}>
                    <td><RankChip rank={e.rank} /> {e.rank <= 3 ? MEDALS[e.rank - 1] : ''}</td>
                    <td className="lb-row-name">{e.avatarUrl ? <img src={e.avatarUrl} alt="" width={28} style={{ verticalAlign: 'middle', marginRight: 6 }} /> : null}{e.name}</td>
                    <td><strong>{fmtValue(e)}</strong></td><td>{e.answered ?? '—'}</td>
                  </tr>
                ))}
              </tbody></table>
            {entries.length === 0 && <p className="muted">Chưa có ai trên bảng xếp hạng trong khoảng này.</p>}
          </div>
        </>
      )}
      {me && (
        <div className="card me-row">
          <strong>Bạn đang hạng #{me.rank}</strong> — {metric === 'xp' ? `XP: ${me.xp}` : fmtValue(me)}
          {entries[me.rank - 2] && <span> — còn {fmtDiff(value(entries[me.rank - 2]) - value(me))} {unit} nữa là lên hạng #{me.rank - 1}</span>}
        </div>
      )}
      <p className="muted">Bảng điểm chỉ tính bài thi full đủ điều kiện (làm đủ thời gian tối thiểu). Muốn ẩn tên khỏi bảng xếp hạng, vào Cài đặt.{metric === 'band' ? ' Band IELTS trong app là band ước lượng để tham khảo.' : ''}</p>
    </div>
  );
}
