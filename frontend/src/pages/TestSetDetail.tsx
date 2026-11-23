import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Attempt, type TestSet } from '../api';
import { ErrorBox, partName } from '../components';
import { attemptStatsFor, listeningReadingProgress, partLabel, partNameFor, questionTypeName, useExam } from '../exam';
import { LoadingLine } from '../uiSettings';

export default function TestSetDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { exam: ctxExam } = useExam();
  const [ts, setTs] = useState<TestSet | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  // Lich su thi thu (de tinh so lan thi + band theo de) + hop thoai chon
  // che do lam bai (IELTS-only, xem nut "Lam ca de" ben duoi).
  const [history, setHistory] = useState<Attempt[]>([]);
  const [modeDialog, setModeDialog] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.testSet(id).then(setTs).catch(setError).finally(() => setLoading(false));
  }, [id]);

  // Lich su thi thu can biet ky thi cua de (chi co sau khi tai xong de).
  useEffect(() => {
    if (!ts) return;
    const ex2 = ts.exam === 'ielts' || ts.exam === 'toeic' ? ts.exam : ctxExam ?? 'toeic';
    api.statsHistory(ex2).then(setHistory).catch(() => undefined);
  }, [ts, ctxExam]);

  // Dong hop thoai chon che do bang phim Escape.
  useEffect(() => {
    if (!modeDialog) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModeDialog(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modeDialog]);

  if (loading) return <LoadingLine location="page" text="Đang tải đề thi…" />;
  if (!ts) return <div><ErrorBox error={error} /><p>Không tìm thấy bộ đề. <Link className="btn secondary btn-sm" to="/practice">Quay lại danh sách đề</Link></p></div>;

  // Kỳ thi của đề (backend trả exam); fallback về kỳ thi đang chọn.
  const ex = (ts.exam === 'ielts' || ts.exam === 'toeic' ? ts.exam : ctxExam) ?? 'toeic';
  const isIelts = ex === 'ielts';
  const fullMinutes = isIelts ? 90 : 120;
  const total = ts.totalQuestions || 0;
  const answered = ts.progress?.answeredTotal || 0;
  const correct = ts.progress?.correctTotal || 0;
  // Mau so tien do la so ROW (progress.total); total la so cau tren de
  // that (IELTS: 80) — dung total lam mau so thi % khong bao gio dat 100%.
  const rowTotal = ts.progress?.total ?? total;
  const pct = rowTotal ? Math.round((answered / rowTotal) * 100) : 0;
  const partProgress = (p: number) => ts.progress?.byPart.find(b => b.part === p);
  // IELTS-only: tien do tach Listening/Reading + thong ke thi thu cua de.
  const lr = isIelts ? listeningReadingProgress(ts) : null;
  const att = isIelts ? attemptStatsFor(history, ts.id) : null;
  const renderPartCard = (p: number) => {
    const info = ts.parts.find(x => x.part === p);
    const n = info?.count || 0;
    const prog = partProgress(p);
    // Mau so tien do la so ROW (answered dem theo row); n la so cau tren
    // de that (de IELTS co cau gop) — chi dung n de hien thi.
    const rowTotal = prog?.total ?? n;
    return (
      <div key={p} className="card part-card">
        <p style={{ margin: 0 }}>
          <strong>{p <= 4 ? '🎧' : '📖'} {isIelts ? partNameFor(p, ex) : partName(p)}</strong>{' '}
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>{n} câu</span>
        </p>
        {prog
          ? <p className="muted" style={{ margin: 0 }}>Đã làm {prog.answered}/{rowTotal} câu · đúng {prog.correct}</p>
          : <p className="muted" style={{ margin: 0 }}>Chưa làm câu nào ở {partLabel(p, ex)} này</p>}
        {prog && rowTotal > 0 && <div className="bar"><i style={{ width: `${Math.round((prog.answered / rowTotal) * 100)}%` }} /></div>}
        <div className="btn-row">
          <button
            className="btn btn-sm"
            disabled={!n}
            onClick={() => nav(`/practice/session?testSetId=${ts.id}&part=${p}&exam=${ex}`)}
          >
            Luyện {partLabel(p, ex)} này
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <p><Link className="btn secondary btn-sm" to="/practice">← Quay lại danh sách đề</Link></p>
      <h1>{ts.title}</h1>
      {ts.description && <p className="muted">{ts.description}</p>}
      {isIelts && ts.title.includes('(Sample)') && (
        <p className="muted">📌 Đề mẫu IELTS — dùng để làm quen với dạng bài thi. Đề mẫu chưa có audio, bạn vẫn làm bài bình thường.</p>
      )}
      <ErrorBox error={error} />
      <div className="card">
        <p><span className="stat-num">{total}</span> câu • Đã làm {answered}/{rowTotal} câu ({pct}%) • Đúng {correct} câu</p>
        <div className="bar green"><i style={{ width: `${pct}%` }} /></div>
        {isIelts && lr && (
          <p className="muted" style={{ marginTop: '.6rem' }}>🎧 Listening {lr.listening.answered}/{lr.listening.total} câu · 📖 Reading {lr.reading.answered}/{lr.reading.total} câu</p>
        )}
        {isIelts && ts.byType && ts.byType.length > 0 && (
          <p className="muted">
            Dạng câu hỏi: {ts.byType.slice(0, 4).map(t => `${questionTypeName(t.questionType)} ${t.count}`).join(' · ')}
            {ts.byType.length > 4 ? ` · +${ts.byType.length - 4} dạng nữa` : ''}
          </p>
        )}
        {isIelts && att && att.count > 0 && (
          <p className="muted">🏆 Đã thi thử {att.count} lần{att.bestBand != null ? <> · Band cao nhất {att.bestBand}</> : ''}{att.lastBand != null ? <> · Gần nhất Band {att.lastBand}</> : ''}</p>
        )}
        {isIelts && (
          <p className="muted">⏱️ Thi thử {fullMinutes} phút · Luyện tập không bấm giờ</p>
        )}
        {ts.missing.length > 0 && (
          <p style={{ color: 'var(--amber)', marginTop: '.6rem' }}>
            ⚠️ Đề chưa đủ câu chuẩn: {ts.missing.map(m => `${partLabel(m.part, ex)} thiếu ${m.missing} câu`).join(', ')}. Bạn vẫn có thể luyện các câu hiện có.
          </p>
        )}
        <div className="btn-row">
          {isIelts ? (
            <button className="btn gold" disabled={!total} onClick={() => setModeDialog(true)}>▶ Làm cả đề ({total} câu)</button>
          ) : (
            <button className="btn gold" disabled={!total} onClick={() => nav(`/mock?testSetId=${ts.id}&exam=${ex}`)}>🏆 Thi thử cả đề ({total} câu · {fullMinutes} phút)</button>
          )}
        </div>
      </div>

      <h2>🎧 Listening — {isIelts ? 'Section 1–4' : 'Part 1–4'}</h2>
      <div className="grid parts-grid">
        {[1, 2, 3, 4].map(renderPartCard)}
      </div>
      <h2>📖 Reading — {isIelts ? 'Passage 1–3' : 'Part 5–7'}</h2>
      <div className="grid parts-grid">
        {[5, 6, 7].map(renderPartCard)}
      </div>

      {/* IELTS-only: hop thoai chon cach lam ca de — Luyen tap (khong bam
          gio, cham + giai thich ngay tung cau) hoac Thi that (90 phut,
          giong thi may). TOEIC giu nut "Thi thu ca de" nhu cu. */}
      {isIelts && modeDialog && (
        <div
          role="dialog" aria-modal="true" aria-label="Chọn cách làm bài"
          onClick={() => setModeDialog(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(30, 25, 20, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 }}
        >
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', margin: 0 }}>
            <h2 style={{ marginTop: 0 }}>Chọn cách làm bài</h2>
            <p className="muted">{ts.title} · {total} câu</p>
            <div
              className="card" role="button" tabIndex={0}
              onClick={() => nav(`/practice/session?testSetId=${ts.id}&part=all&exam=ielts`)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') nav(`/practice/session?testSetId=${ts.id}&part=all&exam=ielts`); }}
              style={{ cursor: 'pointer' }}
            >
              <strong>📝 Luyện tập</strong>
              <p className="muted" style={{ margin: '.2rem 0 0' }}>Không bấm giờ · Chấm + giải thích ngay từng câu · Nghe lại thoải mái</p>
            </div>
            <div
              className="card" role="button" tabIndex={0}
              onClick={() => nav(`/mock?testSetId=${ts.id}&exam=ielts`)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') nav(`/mock?testSetId=${ts.id}&exam=ielts`); }}
              style={{ cursor: 'pointer' }}
            >
              <strong>🏆 Thi thật</strong>
              <p className="muted" style={{ margin: '.2rem 0 0' }}>{fullMinutes} phút · Giống thi máy · Audio mỗi Section chỉ phát 1 lần · Chỉ xem điểm sau khi nộp</p>
            </div>
            <div className="btn-row">
              <button className="btn secondary" onClick={() => setModeDialog(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
