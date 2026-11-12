import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type PartInfo, type StatsOverview, type TestSet } from '../api';
import { ErrorBox, partName, sectionOf } from '../components';

export default function Practice() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'sets' | 'parts'>('sets');
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [setsError, setSetsError] = useState<unknown>(null);
  const [setsLoading, setSetsLoading] = useState(true);
  const [parts, setParts] = useState<PartInfo[]>([]);
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [part, setPart] = useState(5);

  useEffect(() => {
    api.testSets().then(setTestSets).catch(setSetsError).finally(() => setSetsLoading(false));
    api.parts().then(setParts).catch(setError);
    api.statsOverview().then(setStats).catch(() => undefined);
  }, []);

  const acc = (p: number) => stats?.byPart.find(b => b.part === p);
  const partList: PartInfo[] = parts.length ? parts : [1, 2, 3, 4, 5, 6, 7].map(p => ({ part: p, count: 0 }));
  const renderPartCard = (p: PartInfo) => {
    const a = acc(p.part);
    return (
      <div key={p.part} className={`card part-card${part === p.part ? ' selected' : ''}`} onClick={() => setPart(p.part)}>
        <div className="part-ico">{p.part <= 4 ? '🎧' : '📖'} Part {p.part}</div>
        <strong>{partName(p.part)}</strong> <span className="pill">{sectionOf(p.part)}</span>
        <p className="muted">{p.count ? `${p.count} câu trong ngân hàng` : 'Chưa rõ số câu'}</p>
        {a && <p>Tỉ lệ đúng: {Math.round(a.accuracy * 100)}% ({a.correct}/{a.answered} câu)</p>}
        {a && <div className="bar"><i style={{ width: `${a.accuracy * 100}%` }} /></div>}
      </div>
    );
  };

  return (
    <div>
      <h1>Luyện tập</h1>
      <div className="seg" style={{ marginBottom: '1rem' }}>
        <button className={`btn${tab === 'sets' ? ' gold' : ' secondary'}`} onClick={() => setTab('sets')}>📚 Luyện theo Bộ đề</button>
        <button className={`btn${tab === 'parts' ? ' gold' : ' secondary'}`} onClick={() => setTab('parts')}>🎧 Luyện theo Part</button>
      </div>

      {tab === 'sets' && (
        <div>
          <ErrorBox error={setsError} />
          {setsLoading && <p>Đang tải danh sách bộ đề…</p>}
          {!setsLoading && !testSets.length && !setsError && (
            <div className="card"><p>Chưa có bộ đề nào. Admin có thể tạo đề mới ở trang Quản trị.</p></div>
          )}
          <div className="grid">
            {testSets.map(ts => {
              const total = ts.totalQuestions || 0;
              const answered = ts.progress?.answeredTotal || 0;
              const pct = total ? Math.round((answered / total) * 100) : 0;
              return (
                <div key={ts.id} className="card part-card" onClick={() => nav(`/practice/test-set/${ts.id}`)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
                    <strong>{ts.title}</strong>
                    {!ts.isPublished && <span className="pill">NHÁP</span>}
                  </div>
                  {ts.description && <p className="muted">{ts.description}</p>}
                  <p><span className="stat-num">{total}</span> câu</p>
                  <p className="muted">
                    {ts.parts.map(p => `P${p.part} ${p.count}`).join(' · ') || 'Chưa có câu hỏi'}
                  </p>
                  {ts.missing.length > 0 && (
                    <p style={{ color: '#B98A1D' }}>⚠ Chưa đủ câu: {ts.missing.map(m => `Part ${m.part} thiếu ${m.missing} câu`).join(', ')}</p>
                  )}
                  {ts.progress ? (
                    <div>
                      <p>Đã làm {answered}/{total} câu ({pct}%)</p>
                      <div className="bar green"><i style={{ width: `${pct}%` }} /></div>
                    </div>
                  ) : (
                    <p className="muted">Chưa làm câu nào trong đề này</p>
                  )}
                  <div className="btn-row">
                    <button className="btn" onClick={e => { e.stopPropagation(); nav(`/practice/test-set/${ts.id}`); }}>
                      {answered > 0 ? '▶ Làm tiếp' : '👁 Xem đề'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'parts' && (
        <div>
          <h2>Luyện theo Part</h2>
          <p className="muted">Luyện 1 Part gom câu từ ngân hàng chung, không gắn đề cụ thể.</p>
          <ErrorBox error={error} />
          <h2>🎧 Listening — Part 1–4</h2>
          <div className="grid parts-grid">
            {partList.filter(p => p.part <= 4).map(renderPartCard)}
          </div>
          <h2>📖 Reading — Part 5–7</h2>
          <div className="grid parts-grid">
            {partList.filter(p => p.part > 4).map(renderPartCard)}
          </div>
          <div className="card">
            <p style={{ margin: 0 }}>
              {(() => {
                const n = partList.find(p => p.part === part)?.count || 0;
                return n > 0
                  ? `Luyện hết ${n} câu của ${partName(part)} — không giới hạn số lượng.`
                  : `Luyện hết tất cả các câu của ${partName(part)} — không giới hạn số lượng.`;
              })()}
            </p>
            <div className="btn-row">
              <button className="btn" onClick={() => nav(`/practice/session?part=${part}`)}>Bắt đầu luyện {partName(part)}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
