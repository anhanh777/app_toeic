import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Attempt, type PartInfo, type StatsOverview, type TestSet } from '../api';
import { ErrorBox, partName, sectionOf } from '../components';
import { attemptStatsFor, groupTestSetsByBook, listeningReadingProgress, partLabel, partNameFor, questionTypeName, testSetStatus, useExam, type SetStatus } from '../exam';
import { LoadingLine } from '../uiSettings';

export default function Practice() {
  const nav = useNavigate();
  const { exam } = useExam();
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  const [tab, setTab] = useState<'sets' | 'parts'>('sets');
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [setsError, setSetsError] = useState<unknown>(null);
  const [setsLoading, setSetsLoading] = useState(true);
  const [parts, setParts] = useState<PartInfo[]>([]);
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [part, setPart] = useState(5);
  // Lich su thi thu — de tinh so lan thi + band theo tung de (IELTS).
  const [history, setHistory] = useState<Attempt[]>([]);
  // Ý 2 (IELTS-only): tìm kiếm theo tên đề + lọc theo trạng thái làm đề.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SetStatus>('all');

  useEffect(() => {
    api.testSets(ex).then(setTestSets).catch(setSetsError).finally(() => setSetsLoading(false));
    api.parts(ex).then(setParts).catch(setError);
    api.statsOverview(ex).then(setStats).catch(() => undefined);
    api.statsHistory(ex).then(setHistory).catch(() => undefined);
  }, [ex]);

  const acc = (p: number) => stats?.byPart.find(b => b.part === p);

  // Thẻ 1 bộ đề — dùng chung cho danh sách phẳng (TOEIC) và từng nhóm
  // sách Cambridge (IELTS).
  const renderSetCard = (ts: TestSet) => {
    const total = ts.totalQuestions || 0;
    const answered = ts.progress?.answeredTotal || 0;
    const pct = total ? Math.round((answered / total) * 100) : 0;
    // IELTS-only: tien do tach Listening/Reading + thong ke thi thu.
    const lr = isIelts ? listeningReadingProgress(ts) : null;
    const att = isIelts ? attemptStatsFor(history, ts.id) : null;
    return (
      <div key={ts.id} className="card part-card" onClick={() => nav(`/practice/test-set/${ts.id}`)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
          <strong>{ts.title} <span className="muted" style={{ fontWeight: 500 }}>· {total} câu</span></strong>
          {!ts.isPublished && <span className="pill">NHÁP</span>}
        </div>
        <p className="muted parts-line">
          {ts.parts.map(p => `${partLabel(p.part, ex)} ${p.count}`).join(' · ') || 'Chưa có câu hỏi'}
        </p>
        {isIelts && lr && (
          <p className="muted" style={{ margin: 0 }}>🎧 {lr.listening.answered}/{lr.listening.total} · 📖 {lr.reading.answered}/{lr.reading.total} · ⏱️ 90 phút thi thử</p>
        )}
        {isIelts && ts.byType && ts.byType.length > 0 && (
          <p className="muted" style={{ margin: 0 }}>
            {ts.byType.slice(0, 3).map(t => `${questionTypeName(t.questionType)} ${t.count}`).join(' · ')}
            {ts.byType.length > 3 ? ` · +${ts.byType.length - 3} dạng nữa` : ''}
          </p>
        )}
        {isIelts && att && att.count > 0 && (
          <p className="muted" style={{ margin: 0 }}>🏆 Thi thử {att.count} lần{att.bestBand != null ? <> · Band cao nhất {att.bestBand}</> : ''}{att.lastBand != null ? <> · Gần nhất Band {att.lastBand}</> : ''}</p>
        )}
        {ts.missing.length > 0 && (
          <p style={{ color: 'var(--amber)' }}>⚠️ Chưa đủ câu: {ts.missing.map(m => `${partLabel(m.part, ex)} thiếu ${m.missing} câu`).join(', ')}</p>
        )}
        {ts.progress ? (
          <div>
            <p className="muted">Đã làm {answered}/{total} câu ({pct}%)</p>
            <div className="bar green"><i style={{ width: `${pct}%` }} /></div>
          </div>
        ) : (
          <p className="muted">Chưa làm câu nào trong đề này</p>
        )}
        <div className="btn-row">
          <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(`/practice/test-set/${ts.id}`); }}>
            {answered > 0 ? '▶ Làm tiếp' : '👁 Xem đề'}
          </button>
        </div>
      </div>
    );
  };

  // Ý 2 (IELTS-only): lọc theo tên đề + trạng thái, rồi gom nhóm theo sách.
  // TOEIC giữ nguyên danh sách phẳng, không lọc.
  const q = search.trim().toLowerCase();
  const filteredSets = !isIelts ? testSets : testSets.filter(ts =>
    (!q || ts.title.toLowerCase().includes(q))
    && (statusFilter === 'all' || testSetStatus(ts) === statusFilter));
  const bookGroups = isIelts ? groupTestSetsByBook(filteredSets) : [];
  const partList: PartInfo[] = parts.length ? parts : [1, 2, 3, 4, 5, 6, 7].map(p => ({ part: p, count: 0 }));
  const renderPartCard = (p: PartInfo) => {
    const a = acc(p.part);
    // Backend đã trả accuracy theo % (0–100, VD 1/7 → 14.3) nên KHÔNG
    // nhân 100 nữa — tính thẳng từ correct/answered, thanh bar kẹp 0–100.
    const pct = a && a.answered > 0 ? Math.round((a.correct / a.answered) * 100) : 0;
    return (
      <div key={p.part} className={`card part-card${part === p.part ? ' selected' : ''}`} onClick={() => setPart(p.part)}>
        <div className="part-ico">{p.part <= 4 ? '🎧' : '📖'} {partLabel(p.part, ex)}</div>
        <p style={{ margin: 0 }}>
          <strong>{isIelts ? partNameFor(p.part, ex) : partName(p.part)}</strong> <span className="pill">{sectionOf(p.part)}</span>{' '}
          <span className="muted">{p.count ? `${p.count} câu` : 'Chưa rõ số câu'}</span>
        </p>
        {a && <p className="muted" style={{ margin: 0 }}>Tỉ lệ đúng: {pct}% ({a.correct}/{a.answered} câu)</p>}
        {a && <div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>}
        <div className="btn-row">
          <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(`/practice/part/${p.part}?exam=${ex}`); }}>
            ▶ Luyện
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h1>Luyện tập</h1>
      <div className="seg" style={{ marginBottom: '1rem' }}>
        <button className={`btn${tab === 'sets' ? ' gold' : ' secondary'}`} onClick={() => setTab('sets')}>📚 Luyện theo Bộ đề</button>
        <button className={`btn${tab === 'parts' ? ' gold' : ' secondary'}`} onClick={() => setTab('parts')}>{isIelts ? '🎧 Luyện theo Section/Passage' : '🎧 Luyện theo Part'}</button>
      </div>

      {tab === 'sets' && (
        <div>
          <ErrorBox error={setsError} />
          {setsLoading && <LoadingLine location="table" text="Đang tải danh sách bộ đề…" />}
          {!setsLoading && !testSets.length && !setsError && (
            <div className="card"><p>Chưa có bộ đề nào.</p></div>
          )}
          {isIelts && testSets.length > 0 && (
            <div className="btn-row" style={{ marginBottom: '1rem' }}>
              <input
                type="search"
                placeholder="🔍 Tìm đề theo tên… (VD: Cambridge 21)"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: '1 1 16rem' }}
                aria-label="Tìm đề theo tên"
              />
              <span role="group" aria-label="Lọc theo trạng thái làm đề" className="seg" style={{ marginBottom: 0 }}>
                {([['all', 'Tất cả'], ['todo', 'Chưa làm'], ['doing', 'Đang làm dở'], ['done', 'Đã hoàn thành']] as const).map(([v, label]) => (
                  <button key={v} type="button" className={`btn btn-sm${statusFilter === v ? ' gold' : ' secondary'}`} aria-pressed={statusFilter === v} onClick={() => setStatusFilter(v)}>
                    {label}
                  </button>
                ))}
              </span>
            </div>
          )}
          {!setsLoading && isIelts && testSets.length > 0 && !filteredSets.length && (
            <div className="card"><p>Không có đề nào khớp bộ lọc. <button className="btn btn-sm secondary" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Xóa bộ lọc</button></p></div>
          )}
          {isIelts ? (
            bookGroups.map(g => (
              <details className="book-group" key={g.label} open>
                <summary>{g.label} <span className="muted">({g.sets.length} đề)</span></summary>
                <div className="grid" style={{ marginTop: '.5rem' }}>
                  {g.sets.map(renderSetCard)}
                </div>
              </details>
            ))
          ) : (
            <div className="grid">
              {testSets.map(renderSetCard)}
            </div>
          )}
        </div>
      )}

      {tab === 'parts' && (
        <div>
          <h2>{isIelts ? 'Luyện theo Section/Passage' : 'Luyện theo Part'}</h2>
          <p className="muted">Chọn {isIelts ? 'Section/Passage' : 'Part'} rồi chọn đề để luyện — mỗi buổi là 1 {isIelts ? 'Section/Passage' : 'Part'} của 1 đề, có đủ audio.</p>
          <ErrorBox error={error} />
          <h2>🎧 Listening — {isIelts ? 'Section 1–4' : 'Part 1–4'}</h2>
          <div className="grid parts-grid">
            {partList.filter(p => p.part <= 4).map(renderPartCard)}
          </div>
          <h2>📖 Reading — {isIelts ? 'Passage 1–3' : 'Part 5–7'}</h2>
          <div className="grid parts-grid">
            {partList.filter(p => p.part > 4).map(renderPartCard)}
          </div>
        </div>
      )}
    </div>
  );
}
