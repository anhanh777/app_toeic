// Trang chủ gộp "Trang chủ + Hôm nay" — 1 trang duy nhất cho CẢ 2 kỳ thi.
// Dữ liệu "Hôm nay" từ GET /api/today?exam=<exam> (alias /api/ielts/today
// cho IELTS, fallback khi /api/today lỗi). Thứ tự từ trên xuống:
// hero → 3 thẻ tổng quan → dải nhiệm vụ (chỉ kiểu Sống động) → 4 nút
// nhanh → Đã xong hôm nay + Ngày mệt → 3 khối luyện + ôn từ vựng →
// IELTS-only (đổi gió / Band Compass) → thẻ giới thiệu kỳ thi.
// - TOEIC: 3 khối chỉ LINK vào flow TOEIC sẵn có (/wrong, /practice),
//   KHÔNG dựng lại UI luyện/chấm TOEIC.
// - IELTS: khối ôn lỗi inline, drill dạng yếu, skim/dictation inline.
// Streak + bad-day dùng chung cho cả 2 kỳ thi, 1 streak duy nhất.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, targetScoreOf, type BadDayTask, type ErrorLogEntry, type Question, type StatsOverview, type TodayData, type WeeklyError } from '../api';
import { useAuth } from '../auth';
import { bandLevel, isFillIn, isMultiAnswer, partNameFor, questionTypeName, useExam, wordCount } from '../exam';
import { ErrorBox, LivelyDailyStrip, TierBadge, XpBar, type DailyTaskItem } from '../components';
import { useMenuIcons } from '../menuIcons';
import { LoadingLine, useUiSettings } from '../uiSettings';
import { errorCodeName, fmtClock, useCountdown } from '../ielts-phase1';
import { IeltsAnswerControl } from '../ielts-ui';
import { speak, stopSpeak, ttsSupported } from '../tts';

const TOPICS = ['du lịch', 'công nghệ', 'y học', 'môi trường'];

function doneKey(date: string) { return `today_done_${date}`; }
function readDone(date: string): string[] {
  try { return JSON.parse(localStorage.getItem(doneKey(date)) || '[]') as string[]; } catch { return []; }
}

export default function Home() {
  const { user } = useAuth();
  const { exam } = useExam();
  const { icons } = useMenuIcons();
  const { settings } = useUiSettings();
  const lively = settings.ui.style === 'lively';
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<string[]>([]);
  const [badDay, setBadDay] = useState<BadDayTask | null>(null);
  const [badDayBusy, setBadDayBusy] = useState(false);
  const [badDayDone, setBadDayDone] = useState(false);
  const [topics, setTopics] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ielts_topics') || '[]') as string[]; } catch { return []; }
  });
  const todayStr = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });

  useEffect(() => {
    api.statsOverview(ex).then(setStats).catch(setError);
  }, [ex]);

  useEffect(() => {
    setLoading(true);
    api.today(ex)
      .catch(() => (isIelts ? api.ieltsToday() : Promise.reject(new Error('Không tải được dữ liệu hôm nay.'))))
      .then(d => { setData(d); setDone(readDone(d.date)); })
      .catch(setError)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex]);

  const markDone = async (blockId: string, minutes: number) => {
    if (!data) return;
    setDone(prev => {
      const next = prev.includes(blockId) ? prev : [...prev, blockId];
      try { localStorage.setItem(doneKey(data.date), JSON.stringify(next)); } catch { /* bỏ qua */ }
      return next;
    });
    try { await api.completeTodayBlock(blockId, minutes, ex); } catch { /* bản local đã ghi, không chặn */ }
  };

  const callBadDay = async () => {
    setBadDayBusy(true); setError(null);
    try { setBadDay(await api.todayBadDay(ex)); } catch (e) { setError(e); } finally { setBadDayBusy(false); }
  };

  const toggleTopic = (t: string) => {
    setTopics(prev => {
      const next = prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t];
      try { localStorage.setItem('ielts_topics', JSON.stringify(next)); } catch { /* bỏ qua */ }
      return next;
    });
  };

  // Chưa có dữ liệu "Hôm nay" thì hiện dòng chờ (chỉ khi đã chọn kỳ thi).
  if (loading && exam) return <LoadingLine location="page" text="Đang tải kế hoạch hôm nay…" />;

  const target = targetScoreOf(user);
  const best = stats?.recentScores?.length ? Math.max(...stats.recentScores.map(s => s.totalScore)) : null;
  // IELTS: band tổng cao nhất + band từng kỹ năng lần gần nhất.
  const bestBand = stats?.bandHistory?.length ? Math.max(...stats.bandHistory.map(b => b.overallBand)) : null;
  const latestBand = stats?.bandHistory?.length ? stats.bandHistory[stats.bandHistory.length - 1] : null;

  const hearts = '❤️'.repeat(Math.min(7, Math.max(0, stats?.streakDays ?? 0))) || '♡';
  const review = data?.blocks.find(b => b.id === 'review');
  const drill = data?.blocks.find(b => b.id === 'drill');
  const vocab = data?.blocks.find(b => b.id === 'vocab');
  const streak = data?.streak;
  const quitReason = data?.profile?.quitReason;
  // Lively-only: nhiem vu hang ngay tu du lieu that (/api/today + o
  // "da xong" localStorage). Thieu du lieu -> hien 0, khong bia so.
  // Pastel khong tinh gi them. IELTS neo trong trang (#today-block-review),
  // TOEIC link sang /wrong.
  const livelyTasks: DailyTaskItem[] = lively ? [
    { id: 'review', label: 'Ôn lỗi đến hạn', meta: `${review?.dueCount ?? 0} câu`, to: isIelts ? '#today-block-review' : '/wrong', done: done.includes('review') },
    { id: 'drill', label: 'Luyện dạng yếu nhất', meta: drill?.weakestType ? questionTypeName(drill.weakestType) : drill?.weakestPart ? partNameFor(drill.weakestPart, ex) : undefined, to: '/practice', done: done.includes('drill') },
    { id: 'active', label: 'Luyện chủ động', meta: '1 Part bất kỳ', to: '/practice', done: done.includes('active') },
    { id: 'vocab', label: 'Ôn từ vựng đến hạn', meta: `${vocab?.dueCount ?? 0} từ`, to: '/vocabulary?review=due', done: (vocab?.dueCount ?? 0) === 0 },
  ] : [];
  return (
    <div>
      <div className="hero">
        <h1>{isIelts ? `${icons['exam-ielts']} Luyện thi IELTS` : `${icons['exam-toeic']} Luyện thi TOEIC`}</h1>
        <p className="sub">Chào {user?.name || 'bạn'} — hôm nay mình luyện tiếp nhé.</p>
      </div>
      {lively && (
        <LivelyDailyStrip streakDays={stats?.streakDays ?? streak?.current ?? 0} totalXp={stats?.totalXp ?? 0} tasks={livelyTasks} />
      )}
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
      {!data && <div className="card"><p>Chưa tải được kế hoạch hôm nay. Bạn vẫn có thể <Link className="btn secondary btn-sm" to="/practice">luyện tập</Link> bình thường.</p></div>}
      {data && (
        <>
          <p className="muted">{todayStr} — làm 3 khối nhỏ là đủ, đừng cố làm hết một lúc.</p>
          <div className="grid">
            <div className="card stat-card">
              <div className="ico">📅</div><div className="muted">Đã xong hôm nay</div>
              <div className="big">{done.length}/3 khối</div>
              <p className="muted">{done.length >= 3 ? '🎉 Xong hết rồi — nghỉ thôi!' : 'Cứ từ từ, từng khối một.'}</p>
            </div>
            <div className="card stat-card">
              <div className="ico">🌧️</div><div className="muted">Ngày mệt?</div>
              <div className="big" style={{ fontSize: '1rem' }}>{data.badDayAvailable ? 'Có chế độ ngày nhẹ' : 'Hôm nay đã dùng ngày nhẹ'}</div>
              <div className="btn-row"><button className="btn secondary btn-sm" disabled={!data.badDayAvailable || badDayBusy} onClick={() => void callBadDay()}>
                {badDayBusy ? 'Đang lấy bài…' : 'Hôm nay mình mệt 😮‍💨'}
              </button></div>
            </div>
          </div>

          {badDay && (
            <div className="card today-bad-day">
              <h2>🌧️ Bài ngày nhẹ (5–10 phút)</h2>
              <p><strong>{badDay.title}</strong></p>
              <p>{badDay.detail}</p>
              {isIelts ? null : <p><Link className="btn secondary btn-sm" to="/practice">Mở luyện tập TOEIC →</Link></p>}
              <div className="btn-row">
                <button className="btn btn-sm" disabled={badDayDone} onClick={() => { setBadDayDone(true); void markDone('bad-day', 10); }}>
                  {badDayDone ? '✓ Đã xong — nghỉ thôi' : 'Xong bài ngày nhẹ'}
                </button>
              </div>
            </div>
          )}

          <div className="btn-row" style={{ marginBottom: '1rem' }}>
            <a className="btn gold" href="#today-block-review">▶ Bắt đầu hôm nay</a>
          </div>

          {data.carriedOver?.length > 0 && (
            <p className="muted">📌 Khối dồn từ hôm qua (tối đa 1): {data.carriedOver.join(', ')}</p>
          )}

          {/* Khối 1 — Ôn lỗi đến hạn */}
          <div className="card" id="today-block-review">
            <h2>1️⃣ Ôn lỗi đến hạn {done.includes('review') ? '✓' : ''}</h2>
            {isIelts ? (
              <IeltsReviewBlock dueCount={review?.dueCount ?? 0} onDone={() => void markDone('review', 15)} />
            ) : (
              <>
                <p>Có <strong>{review?.dueCount ?? 0}</strong> câu sai đến hạn ôn hôm nay.</p>
                {review?.dueIds?.length ? (
                  <ul>{review.dueIds.slice(0, 10).map(id => (
                    <li key={id}><Link className="btn secondary btn-sm" to="/wrong">{id}</Link></li>
                  ))}</ul>
                ) : null}
                <div className="btn-row">
                  <Link className="btn" to="/wrong">Ôn ngay →</Link>
                  <button className="btn secondary btn-sm" onClick={() => void markDone('review', 15)}>Đánh dấu đã ôn</button>
                </div>
              </>
            )}
          </div>

          {/* Khối 2 — Luyện dạng yếu nhất */}
          <div className="card">
            <h2>2️⃣ Luyện dạng yếu nhất {done.includes('drill') ? '✓' : ''}</h2>
            {isIelts ? (
              <IeltsDrillBlock
                diagnosticDone={data.diagnosticDone}
                weakestType={drill?.weakestType ?? null}
                questionCount={drill?.questionCount ?? 0}
                onDone={() => void markDone('drill', 20)}
              />
            ) : (
              <>
                <p>
                  {drill?.weakestPart
                    ? <>Part yếu nhất: <strong>{partNameFor(drill.weakestPart, 'toeic')}</strong>{drill.questionCount ? ` — ${drill.questionCount} câu` : ''}</>
                    : 'Chưa đủ dữ liệu để xác định Part yếu nhất — luyện 1 Part bất kỳ nhé.'}
                </p>
                <p className="muted">Trang Luyện tập hiện chưa nhận sẵn Part từ link, bạn chọn Part ở đó nhé.</p>
                <div className="btn-row">
                  <Link className="btn" to="/practice">Mở luyện tập →</Link>
                  <button className="btn secondary btn-sm" onClick={() => void markDone('drill', 20)}>Đánh dấu đã luyện</button>
                </div>
              </>
            )}
          </div>

          {/* Khối 3 — Luyện chủ động */}
          <div className="card">
            <h2>3️⃣ Luyện chủ động {done.includes('active') ? '✓' : ''}</h2>
            {isIelts ? (
              <IeltsActiveBlock onDone={() => void markDone('active', 15)} />
            ) : (
              <>
                <p>Luyện chủ động: mở 1 Part bất kỳ và làm liền mạch như tờ đề thi thật.</p>
                <div className="btn-row">
                  <Link className="btn" to="/practice">Mở luyện tập →</Link>
                  <button className="btn secondary btn-sm" onClick={() => void markDone('active', 15)}>Đánh dấu đã luyện</button>
                </div>
              </>
            )}
          </div>

          {/* Ôn từ vựng đến hạn — không tính vào 3 khối chính, chỉ nhắc nhiệm vụ ngày */}
          <div className="card vocab-today-card">
            <h2>📖 Ôn từ vựng đến hạn</h2>
            {(vocab?.dueCount ?? 0) > 0 ? (
              <>
                <p><span className="vocab-today-num">{vocab?.dueCount}</span> từ đến hạn ôn hôm nay — mỗi từ ôn đúng +2 XP.</p>
                <div className="btn-row">
                  <Link className="btn" to="/vocabulary?review=due">Ôn ngay →</Link>
                </div>
              </>
            ) : (
              <p>🎉 Hôm nay không có từ đến hạn ôn.</p>
            )}
          </div>

          {/* Ưu tiên theo lý do hay bỏ cuộc (IELTS-only) */}
          {isIelts && quitReason === 'chan' && (
            <div className="card">
              <h2>🎲 Đổi gió theo chủ đề bạn thích</h2>
              <p className="muted">Chọn chủ đề — app sẽ ưu tiên bài đọc/nghe cùng chủ đề khi có.</p>
              <div className="btn-row" style={{ flexWrap: 'wrap' }}>
                {TOPICS.map(t => (
                  <button key={t} type="button" className={`btn btn-sm${topics.includes(t) ? ' gold' : ' secondary'}`} onClick={() => toggleTopic(t)}>
                    {topics.includes(t) ? '✓ ' : ''}{t}
                  </button>
                ))}
              </div>
              <div className="panel" style={{ marginTop: '.8rem' }}>
                <strong>👹 Boss cuối tuần</strong>
                <p className="muted" style={{ margin: '.3rem 0 0' }}>Mini test 20–30 phút, đánh 1 con quái to — sẽ mở ở Giai đoạn 6. Cứ luyện đều mỗi ngày là tới lúc gặp boss thôi.</p>
              </div>
            </div>
          )}
          {isIelts && quitReason === 'khong_thay_tien_bo' && <BandCompassBlock />}
        </>
      )}
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

/* ================= IELTS: khối 1 — hàng đợi ôn lỗi inline ================= */
function IeltsReviewBlock({ dueCount, onDone }: { dueCount: number; onDone: () => void }) {
  const [items, setItems] = useState<ErrorLogEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reviewed, setReviewed] = useState(0);
  useEffect(() => {
    api.errorLogDue().then(setItems).catch(setError);
  }, []);
  const review = async (id: number, correct: boolean) => {
    try {
      const r = await api.reviewError(id, correct);
      setItems(prev => prev?.filter(i => i.id !== id) ?? null);
      setReviewed(n => n + 1);
      if (r.xpAwarded) setError(null);
    } catch (e) { setError(e); }
  };
  if (!items) return <LoadingLine location="table" text="Đang tải câu đến hạn…" />;
  return (
    <div>
      <ErrorBox error={error} />
      <p>Có <strong>{dueCount || items.length}</strong> lỗi đến hạn ôn hôm nay. Đã ôn: {reviewed}.</p>
      {!items.length && <p>🎉 Hết lỗi đến hạn rồi!</p>}
      {items.map(it => (
        <div key={it.id} className="panel" style={{ marginBottom: '.5rem' }}>
          <p style={{ margin: '.1rem 0' }}>
            <strong>{errorCodeName(it.errorCode)}</strong> · {it.skill === 'listening' ? '🎧 Listening' : it.skill === 'reading' ? '📖 Reading' : it.skill === 'writing' ? '✍️ Writing' : '🎤 Speaking'}
            {it.questionType ? ` · ${questionTypeName(it.questionType)}` : ''}
          </p>
          {it.evidence && <p className="muted" style={{ margin: '.1rem 0' }}>{it.evidence}</p>}
          {it.missedKeyword && <p className="muted" style={{ margin: '.1rem 0' }}>Từ bỏ lỡ: <strong>{it.missedKeyword}</strong></p>}
          <div className="btn-row">
            <button className="btn btn-sm" onClick={() => void review(it.id, true)}>Tôi đã làm đúng ✓</button>
            <button className="btn btn-sm secondary" onClick={() => void review(it.id, false)}>Vẫn sai ✗</button>
          </div>
        </div>
      ))}
      <div className="btn-row">
        <Link className="btn secondary btn-sm" to="/ielts/errors">Mở sổ lỗi đầy đủ →</Link>
        <button className="btn btn-sm" onClick={onDone}>Xong khối ôn lỗi</button>
      </div>
    </div>
  );
}

/* ================= IELTS: khối 2 — drill dạng yếu nhất ================= */
function IeltsDrillBlock({ diagnosticDone, weakestType, questionCount, onDone }: {
  diagnosticDone: boolean; weakestType: string | null; questionCount: number; onDone: () => void;
}) {
  const [qs, setQs] = useState<Question[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [answers, setAnswers] = useState<Record<string, { ok: boolean; correctLabel?: string; correctText?: string }>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [started, setStarted] = useState(false);
  const answeringRef = useRef<Set<string>>(new Set());
  if (!diagnosticDone) {
    return (
      <div>
        <p>Chưa có kết quả chẩn đoán nên chưa biết dạng nào yếu nhất.</p>
        <div className="btn-row"><Link className="btn" to="/ielts/diagnostic">Làm chẩn đoán trước →</Link></div>
      </div>
    );
  }
  const start = async () => {
    setStarted(true); setError(null);
    try {
      const all = await api.questionsAll(undefined, undefined, 'ielts');
      const filtered = weakestType ? all.filter(q => q.questionType === weakestType) : all;
      setQs(filtered.slice(0, 10));
    } catch (e) { setError(e); }
  };
  const answer = async (q: Question, value: string) => {
    if (answers[q.id] || answeringRef.current.has(q.id) || !value.trim()) return;
    answeringRef.current.add(q.id);
    try {
      const r = await api.practiceAnswer(q.id, value);
      setAnswers(m => ({ ...m, [q.id]: { ok: r.correct, correctLabel: r.correctLabel, correctText: r.correctText } }));
    } catch (e) { setError(e); } finally { answeringRef.current.delete(q.id); }
  };
  return (
    <div>
      <p>Dạng yếu nhất: <strong>{weakestType ? questionTypeName(weakestType) : '—'}</strong>{questionCount ? ` — ${questionCount} câu` : ''}</p>
      {!started && (
        <div className="btn-row">
          <button className="btn" onClick={() => void start()}>Luyện 10 câu dạng này →</button>
          <Link className="btn secondary" to="/practice?exam=ielts">Mở luyện tập →</Link>
        </div>
      )}
      <ErrorBox error={error} />
      {started && !qs && <LoadingLine location="table" text="Đang tải câu hỏi…" />}
      {qs?.map((q, i) => {
        const a = answers[q.id];
        const qType = q.questionType || 'multiple_choice';
        // Dạng IELTS đặc biệt (điền từ, TFNG, matching, list_selection…)
        // dùng chung IeltsAnswerControl như màn Luyện tập — trước đây chỉ
        // vẽ nút phương án nên câu điền từ không có chỗ nhập đáp án.
        const special = qType !== 'multiple_choice' && qType !== 'choosing_title';
        // Điền từ + chọn nhiều đáp án: KHÔNG nộp ngay khi bấm/blur (người
        // học cần gõ xong hoặc tick đủ 2–3 đáp án) — nộp bằng nút Kiểm tra.
        // TFNG/matching: 1 lựa chọn là xong nên nộp ngay khi chọn.
        const needsSubmit = isFillIn(qType) || isMultiAnswer(qType);
        const overLimit = isFillIn(qType) && q.wordLimit != null && wordCount(selected[q.id] ?? '') > q.wordLimit;
        return (
          <div key={q.id} className="panel" style={{ marginBottom: '.5rem' }}>
            <p style={{ margin: '.1rem 0' }}><strong>{i + 1}. {q.content}</strong></p>
            {special ? (
              <>
                <IeltsAnswerControl
                  q={q}
                  value={selected[q.id] ?? ''}
                  onChange={v => setSelected(m => ({ ...m, [q.id]: v }))}
                  onCommit={needsSubmit ? undefined : (v => void answer(q, v))}
                  disabled={!!a}
                  graded={a ? { correct: a.ok, correctLabel: a.correctLabel, correctText: a.correctText } : undefined}
                />
                {needsSubmit && !a && (
                  <div className="btn-row" style={{ marginTop: '.5rem' }}>
                    <button className="btn btn-sm" disabled={!selected[q.id]?.trim() || overLimit}
                      onClick={() => void answer(q, selected[q.id] ?? '')}>
                      Kiểm tra
                    </button>
                    {overLimit && <span className="muted">Vượt giới hạn số từ — rút gọn đáp án nhé.</span>}
                  </div>
                )}
              </>
            ) : (
              <div className="btn-row" style={{ flexWrap: 'wrap' }}>
                {q.options.map(o => (
                  <button key={o.label} type="button" className="btn btn-sm secondary"
                    disabled={!!a} onClick={() => void answer(q, o.label)}>
                    {o.label}{o.content ? `. ${o.content}` : ''}
                  </button>
                ))}
              </div>
            )}
            {a && <p style={{ margin: '.4rem 0 0', color: a.ok ? 'var(--green-ink)' : 'var(--red-ink)' }}>
              {a.ok ? '✅ Đúng rồi!' : `❌ Sai rồi — đáp án đúng: ${a.correctText ?? a.correctLabel ?? ''}`}
            </p>}
          </div>
        );
      })}
      {qs && <div className="btn-row"><button className="btn btn-sm" onClick={onDone}>Xong khối luyện dạng yếu</button></div>}
    </div>
  );
}

/* ================= IELTS: khối 3 — skim + dictation ================= */
function IeltsActiveBlock({ onDone }: { onDone: () => void }) {
  const [passage, setPassage] = useState('');
  const [script, setScript] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [summary, setSummary] = useState('');
  const [mode, setMode] = useState<'skim' | 'dictation'>('skim');
  const [dictation, setDictation] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [started, setStarted] = useState(false);
  const { left, reset } = useCountdown(90, started && mode === 'skim', () => setStarted(false));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Đoạn Reading đầu tiên của TS-028 (part 5–7) + 1 đoạn script
    // Listening (part 1–4) để đọc chính tả.
    api.questions(5, 50, 0, '', 'TS-028', 'ielts')
      .then(items => {
        const withText = items.find(q => q.passageText);
        if (withText?.passageText) setPassage(withText.passageText);
      })
      .catch(setError);
    api.questions(1, 50, 0, '', 'TS-028', 'ielts')
      .then(items => {
        const withScript = items.find(q => q.script);
        if (withScript?.script) setScript(withScript.script);
      })
      .catch(() => undefined);
    return () => { stopSpeak(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const startSkim = () => { reset(); setStarted(true); };
  const readDictation = () => {
    if (!ttsSupported()) { setError(new Error('Trình duyệt của bạn không hỗ trợ đọc giọng máy.')); return; }
    setSpeaking(true);
    speak(script, 0.85, () => setSpeaking(false));
  };
  const words = summary.trim() ? summary.trim().split(/\s+/).length : 0;

  return (
    <div>
      <ErrorBox error={error} />
      <div className="btn-row" style={{ marginBottom: '.6rem' }}>
        <button type="button" className={`btn btn-sm${mode === 'skim' ? ' gold' : ' secondary'}`} onClick={() => setMode('skim')}>📖 Skim / scan</button>
        <button type="button" className={`btn btn-sm${mode === 'dictation' ? ' gold' : ' secondary'}`} onClick={() => setMode('dictation')}>🎧 Dictation (chép chính tả)</button>
      </div>
      {mode === 'skim' ? (
        <>
          <p>Đọc lướt đoạn văn dưới đây trong <strong>90 giây</strong>, rồi tóm tắt mỗi đoạn bằng <strong>5–8 từ</strong>.</p>
          <div className="passage" style={{ maxHeight: '220px', overflow: 'auto' }}>{passage || 'Đang tải đoạn văn mẫu (TS-028)…'}</div>
          <p>⏱️ Còn lại: <strong>{fmtClock(left)}</strong></p>
          <div className="btn-row">
            <button className="btn btn-sm" disabled={started} onClick={startSkim}>Bắt đầu 90 giây</button>
          </div>
          <label htmlFor="skim-summary">Tóm tắt mỗi đoạn 5–8 từ</label>
          <textarea id="skim-summary" rows={3} value={summary} onChange={e => setSummary(e.target.value)}
            placeholder="VD: Đoạn 1: … (5–8 từ). Đoạn 2: …" />
          <p className="muted">{words} từ đã gõ.</p>
        </>
      ) : (
        <>
          <p>Nghe đoạn script mẫu rồi gõ lại những gì nghe được. Giọng đọc là <strong>Giọng máy trình duyệt (tạm thời)</strong> — chưa phải audio đề thi thật.</p>
          <div className="btn-row">
            <button className="btn btn-sm" disabled={!script || speaking} onClick={readDictation}>
              {speaking ? '🔊 Đang đọc…' : '🔊 Nghe đoạn mẫu'}
            </button>
            <button className="btn btn-sm secondary" onClick={() => stopSpeak()}>Dừng</button>
          </div>
          <label htmlFor="dictation-text">Gõ lại những gì bạn nghe được</label>
          <textarea id="dictation-text" rows={4} value={dictation} onChange={e => setDictation(e.target.value)} />
          {script && dictation.trim() && (
            <details><summary>Xem script gốc để đối chiếu</summary><p>{script}</p></details>
          )}
        </>
      )}
      <div className="btn-row"><button className="btn btn-sm" onClick={onDone}>Xong khối luyện chủ động</button></div>
    </div>
  );
}

/* ================= IELTS: Band Compass (lý do "không thấy tiến bộ") ================= */
function BandCompassBlock() {
  const [bands, setBands] = useState<{ listening?: number | null; reading?: number | null; overall?: number | null } | null>(null);
  const [weekly, setWeekly] = useState<WeeklyError[] | null>(null);
  useEffect(() => {
    api.latestDiagnostic().then(d => setBands(d?.bands ?? null)).catch(() => undefined);
    api.errorLogWeekly().then(setWeekly).catch(() => undefined);
  }, []);
  const max = Math.max(1, ...(weekly ?? []).map(w => w.count));
  return (
    <div className="card">
      <h2>🧭 Band Compass — bạn đang ở đâu?</h2>
      {bands ? (
        <p>Listening <strong>Band {bands.listening ?? '—'}</strong> · Reading <strong>Band {bands.reading ?? '—'}</strong> · Tổng <strong>Band {bands.overall ?? '—'}</strong> {bands.overall != null && <span className="muted">({bandLevel(bands.overall)})</span>}</p>
      ) : (
        <p className="muted">Chưa có chẩn đoán — làm chẩn đoán để xem Band Compass. <Link className="btn secondary btn-sm" to="/ielts/diagnostic">Làm chẩn đoán →</Link></p>
      )}
      <h3>Lỗi theo tuần</h3>
      {!weekly?.length && <p className="muted">Chưa có dữ liệu lỗi theo tuần.</p>}
      {weekly?.slice(0, 12).map((w, i) => (
        <div key={`${w.week}-${w.code}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.3rem' }}>
          <span style={{ minWidth: '7rem' }}>{w.week} · {w.code}</span>
          <div className="bar" style={{ flex: 1 }}><i style={{ width: `${(w.count / max) * 100}%` }} /></div>
          <span>{w.count}</span>
        </div>
      ))}
      <p className="muted">Số lỗi giảm dần theo tuần = bạn đang tiến bộ, dù band chưa nhảy ngay.</p>
    </div>
  );
}
