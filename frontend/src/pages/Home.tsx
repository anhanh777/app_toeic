import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, targetScoreOf, type StatsOverview } from '../api';
import { useAuth } from '../auth';
import { bandLevel, partNameFor, questionTypeName, useExam } from '../exam';
import { ErrorBox, TierBadge, XpBar } from '../components';
import Today from './Today';

export default function Home() {
  const { user } = useAuth();
  const { exam } = useExam();
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.statsOverview(ex).then(setStats).catch(setError);
  }, [ex]);

  const target = targetScoreOf(user);
  const best = stats?.recentScores?.length ? Math.max(...stats.recentScores.map(s => s.totalScore)) : null;
  // IELTS: band tổng cao nhất + band từng kỹ năng lần gần nhất.
  const bestBand = stats?.bandHistory?.length ? Math.max(...stats.bandHistory.map(b => b.overallBand)) : null;
  const latestBand = stats?.bandHistory?.length ? stats.bandHistory[stats.bandHistory.length - 1] : null;

  const hearts = '❤'.repeat(Math.min(7, Math.max(0, stats?.streakDays ?? 0))) || '♡';
  // IELTS: trang chủ chính là màn hình "Hôm nay" (Giai đoạn 1, v3).
  // TOEIC: giữ nguyên trang chủ cũ — người dùng TOEIC vào "Hôm nay"
  // bằng link nav (scope update 2026-11-16). Đặt sau mọi hook để
  // không phá thứ tự hook khi đổi exam.
  if (isIelts) return <Today />;
  return (
    <div>
      <div className="hero">
        <h1>{isIelts ? '🎓 Luyện thi IELTS' : '🌸 Luyện thi TOEIC'}</h1>
        <p className="sub">Chào {user?.name || 'bạn'} — hôm nay mình luyện tiếp nhé.</p>
      </div>
      <ErrorBox error={error} />
      <div className="grid grid3">
        {isIelts ? (
          <div className="card stat-card"><div className="ico">🎯</div><div className="muted">Band tổng cao nhất</div><div className="big">{bestBand != null ? `Band ${bestBand}` : '—'}</div><div className="card-foot"><p className="muted">{bestBand != null ? `Mức: ${bandLevel(bestBand)} (band ước lượng)` : 'Chưa có bài thi thử nào.'}</p>{latestBand && <p className="muted">Gần nhất: Listening {latestBand.listeningBand} • Reading {latestBand.readingBand} (band ước lượng)</p>}</div></div>
        ) : (
          <div className="card stat-card"><div className="ico">🎯</div><div className="muted">Mục tiêu điểm</div><div className="big">{target}</div><div className="card-foot"><p className="muted">{best != null ? `Điểm thi thử cao nhất: ${best} (điểm ước lượng)` : 'Chưa có bài thi thử nào.'}</p>{best != null && <p><TierBadge total={best} /></p>}</div></div>
        )}
        <div className="card stat-card"><div className="ico">📊</div><div className="muted">{isIelts ? 'Section/Passage yếu nhất' : 'Part yếu nhất'}</div><div className="big" style={{ fontSize: '1rem' }}>{stats?.weakestPart ? partNameFor(stats.weakestPart, ex) : '—'}</div><div className="card-foot"><p className="muted">Tỉ lệ đúng chung: {stats ? `${Math.round(stats.accuracy * 100)}%` : '—'}</p>{isIelts && stats?.weakestType && <p className="muted">Dạng yếu nhất: {questionTypeName(stats.weakestType)}</p>}</div></div>
        <div className="card stat-card"><div className="ico">🔥</div><div className="muted">Streak</div><div className="big">{stats?.streakDays ?? 0} ngày</div><div className="card-foot"><div className="hearts" aria-label="streak hearts">{hearts}</div><p className="muted">Tổng XP: {stats?.totalXp ?? 0}</p><XpBar xp={stats?.totalXp ?? 0} /></div></div>
      </div>
      <div className="btn-row">
        <Link className="btn" to="/practice">▶ Luyện tiếp</Link>
        <Link className="btn gold" to="/mock">🏆 Thi thử</Link>
        <Link className="btn secondary" to="/wrong">Ôn câu sai</Link>
        <Link className="btn secondary" to="/vocabulary">Từ vựng</Link>
      </div>
      <div className="card">
        {isIelts ? (
          <>
            <h2>Chọn IELTS Academic</h2>
            <p>Luyện Listening 4 Section + Reading 3 Passage, thang band 0–9. Band hiển thị trong app là <strong>band ước lượng để tham khảo</strong> theo bảng quy đổi tham khảo công khai, không phải band chính thức.</p>
            <p className="muted">Âm thanh nghe trong app được đọc bằng giọng máy (TTS) khi chưa có file audio: “Âm thanh đọc bằng giọng máy (TTS)”.</p>
          </>
        ) : (
          <>
            <h2>Chọn TOEIC</h2>
            <p>Giai đoạn 1 chỉ luyện TOEIC (7 Part, thang điểm ước lượng 10–990). Điểm hiển thị trong app là <strong>điểm ước lượng</strong> theo bảng quy đổi tham khảo công khai, không phải điểm chính thức của ETS.</p>
            <p className="muted">Âm thanh nghe trong app được đọc bằng giọng máy (TTS): “Âm thanh đọc bằng giọng máy (TTS)”.</p>
          </>
        )}
      </div>
    </div>
  );
}
