import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type PartInfo, type StatsOverview } from '../api';
import { ErrorBox, partName, sectionOf } from '../components';

export default function Practice() {
  const nav = useNavigate();
  const [parts, setParts] = useState<PartInfo[]>([]);
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [part, setPart] = useState(5);
  const [count, setCount] = useState(10);

  useEffect(() => {
    api.parts().then(setParts).catch(setError);
    api.statsOverview().then(setStats).catch(() => undefined);
  }, []);

  const acc = (p: number) => stats?.byPart.find(b => b.part === p);

  return (
    <div>
      <h1>Luyện theo Part</h1>
      <ErrorBox error={error} />
      <div className="grid">
        {(parts.length ? parts : [1, 2, 3, 4, 5, 6, 7].map(p => ({ part: p, count: 0 }))).map(p => {
          const a = acc(p.part);
          return (
            <div key={p.part} className={`card part-card${part === p.part ? ' selected' : ''}`} onClick={() => setPart(p.part)}>
              <div className="part-ico">{p.part <= 4 ? '🎧' : '📖'} LV.{p.part}</div>
              <strong>{partName(p.part)}</strong> <span className="pill">{sectionOf(p.part)}</span>
              <p className="muted">{p.count ? `${p.count} câu trong ngân hàng` : 'Chưa rõ số câu'}</p>
              {a && <p>Tỉ lệ đúng: {Math.round(a.accuracy * 100)}% ({a.correct}/{a.answered} câu)</p>}
              {a && <div className="bar"><i style={{ width: `${a.accuracy * 100}%` }} /></div>}
            </div>
          );
        })}
      </div>
      <div className="card">
        <label htmlFor="count">Số câu luyện</label>
        <select id="count" value={count} onChange={e => setCount(Number(e.target.value))}>
          {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n} câu</option>)}
        </select>
        <div className="btn-row">
          <button className="btn" onClick={() => nav(`/practice/session?part=${part}&count=${count}`)}>Bắt đầu luyện {partName(part)}</button>
        </div>
      </div>
    </div>
  );
}
