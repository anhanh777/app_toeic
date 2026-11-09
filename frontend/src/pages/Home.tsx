import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, targetScoreOf, type StatsOverview } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, partName } from '../components';

export default function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.statsOverview().then(setStats).catch(setError);
  }, []);

  const target = targetScoreOf(user);
  const best = stats?.recentScores?.length ? Math.max(...stats.recentScores.map(s => s.totalScore)) : null;

  return (
    <div>
      <h1>Chào {user?.name || 'bạn'} 👋</h1>
      <p className="muted">Luyện thi TOEIC — chỉ TOEIC Listening &amp; Reading.</p>
      <ErrorBox error={error} />
      <div className="grid grid3">
        <div className="card"><div className="muted">Mục tiêu điểm</div><div className="big">{target}</div><p className="muted">{best != null ? `Điểm thi thử cao nhất: ${best} (điểm ước lượng)` : 'Chưa có bài thi thử nào.'}</p></div>
        <div className="card"><div className="muted">Part yếu nhất</div><div className="big">{stats?.weakestPart ? partName(stats.weakestPart) : '—'}</div><p className="muted">Tỉ lệ đúng chung: {stats ? `${Math.round(stats.accuracy * 100)}%` : '—'}</p></div>
        <div className="card"><div className="muted">Streak</div><div className="big">{stats?.streakDays ?? 0} ngày 🔥</div><p className="muted">Tổng XP: {stats?.totalXp ?? 0}</p></div>
      </div>
      <div className="btn-row">
        <Link className="btn" to="/practice">Luyện tiếp</Link>
        <Link className="btn secondary" to="/mock">Thi thử</Link>
        <Link className="btn secondary" to="/wrong">Ôn câu sai</Link>
        <Link className="btn secondary" to="/vocabulary">Từ vựng</Link>
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>Chọn TOEIC</h2>
        <p>Giai đoạn 1 chỉ luyện TOEIC (7 Part, thang điểm ước lượng 10–990). Điểm hiển thị trong app là <strong>điểm ước lượng</strong> theo bảng quy đổi tham khảo công khai, không phải điểm chính thức của ETS.</p>
        <p className="muted">Âm thanh nghe trong app được đọc bằng giọng máy (TTS): “Âm thanh đọc bằng giọng máy (TTS)”.</p>
      </div>
    </div>
  );
}
