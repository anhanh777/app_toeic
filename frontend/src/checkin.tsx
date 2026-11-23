// Điểm danh hằng ngày — lịch tháng + quà theo mốc + lịch sử điểm danh.
// Dùng chung cho cả 2 kỳ thi (1 streak duy nhất, như Home).
// Ngày tính theo Asia/Saigon: server trả `today` (+07), client chỉ định
// dạng chuỗi YYYY-MM-DD để hiển thị (không parse qua Date giờ địa phương).
import { useCallback, useEffect, useState } from 'react';
import { api, type CheckinData, type CheckinHistoryItem } from './api';
import { ErrorBox } from './components';
import { LoadingLine } from './uiSettings';

const WEEKDAY_HEADS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** '2026-11-23' -> '23/11/2026' (tách chuỗi, không qua Date). */
export function fmtCheckinDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function prevDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `Tháng ${m}/${y}`;
}

/** Các ô của lưới lịch: { date: 'YYYY-MM-DD' | null (ô trống/ngày tháng khác), inMonth: boolean }. */
function monthCells(month: string): { date: string | null; inMonth: boolean }[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // T2 = 0
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: { date: string | null; inMonth: boolean }[] = [];
  for (let i = 0; i < offset; i++) cells.push({ date: null, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${month}-${String(d).padStart(2, '0')}`, inMonth: true });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, inMonth: false });
  return cells;
}

function dayStatusIcon(kind: string | undefined): string {
  if (kind === 'checkin') return '✓';
  if (kind === 'active') return '🔥';
  if (kind === 'rest') return '😴';
  return '';
}

export default function CheckinSection({ onCheckedIn }: { onCheckedIn?: () => void }) {
  const [data, setData] = useState<CheckinData | null>(null);
  // Tháng hiện tại lấy từ server (+07) khi dữ liệu về; khởi tạo bằng tháng local.
  const [month, setMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<CheckinHistoryItem[] | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);

  const loadMonth = useCallback(async (m: string, resetHistory: boolean) => {
    setError(null);
    try {
      const d = await api.checkin(m);
      setData(d);
      if (resetHistory) {
        setHistory(d.history);
        setHistoryHasMore(d.historyHasMore);
      }
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void loadMonth(month, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMonth]);

  const goMonth = (delta: number) => {
    if (!month) return;
    const next = shiftMonth(month, delta);
    setMonth(next);
    void loadMonth(next, false);
  };

  const doCheckin = async () => {
    setBusy(true); setError(null); setMsg('');
    try {
      const r = await api.doCheckin();
      if (r.already) {
        setMsg('Hôm nay bạn đã điểm danh rồi nhé.');
      } else {
        setMsg(
          r.milestoneAwarded
            ? `🎉 Đạt mốc ${r.milestoneAwarded.days} ngày — ${r.milestoneAwarded.title}! +${r.milestoneAwarded.xp} XP`
            : `✓ Điểm danh xong! +${r.xpAwarded} XP · Chuỗi ${r.streakDays} ngày.`
        );
        onCheckedIn?.();
      }
      if (month) await loadMonth(month, true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const loadMoreHistory = async () => {
    if (!history?.length || historyBusy) return;
    setHistoryBusy(true); setError(null);
    try {
      const before = prevDay(history[history.length - 1].date);
      const d = await api.checkin(undefined, before, 30);
      setHistory(prev => [...(prev ?? []), ...d.history]);
      setHistoryHasMore(d.historyHasMore);
    } catch (e) {
      setError(e);
    } finally {
      setHistoryBusy(false);
    }
  };

  if (!data && !error) return <LoadingLine location="table" text="Đang tải điểm danh…" />;

  const viewMonth = month ?? data?.month ?? '';
  const cells = viewMonth ? monthCells(viewMonth) : [];
  const next = data?.nextMilestone;
  const progress = next ? Math.min(100, Math.round(((data?.totalCheckins ?? 0) / next.days) * 100)) : 100;

  return (
    <div className="card" id="checkin">
      <h2>📅 Điểm danh hằng ngày</h2>
      <ErrorBox error={error} />
      {data && (
        <>
          <div className="btn-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn gold" disabled={busy || data.checkedInToday} onClick={() => void doCheckin()}>
              {busy ? 'Đang điểm danh…' : data.checkedInToday ? '✓ Đã điểm danh hôm nay' : '📅 Điểm danh hôm nay (+10 XP)'}
            </button>
            {data.restToday && !data.checkedInToday && (
              <span className="muted">Hôm nay bạn đã chọn ngày nghỉ 😴 — điểm danh vẫn được tính nhé.</span>
            )}
          </div>
          {msg && <p style={{ margin: '.5rem 0 0' }}>{msg}</p>}

          <div className="checkin-stats">
            <div><div className="muted">Chuỗi hiện tại</div><strong>🔥 {data.streak.current} ngày</strong></div>
            <div><div className="muted">Chuỗi dài nhất</div><strong>{data.streak.longest} ngày</strong></div>
            <div><div className="muted">Tổng ngày điểm danh</div><strong>{data.totalCheckins} ngày</strong></div>
          </div>

          {next ? (
            <div style={{ marginTop: '.6rem' }}>
              <p style={{ margin: '.2rem 0' }}>
                Mốc tiếp theo: <strong>{next.title}</strong> ({next.days} ngày, +{next.xp} XP) — còn <strong>{next.remaining} ngày</strong> nữa
              </p>
              <div className="bar"><i style={{ width: `${progress}%` }} /></div>
            </div>
          ) : (
            <p style={{ marginTop: '.6rem' }}>🎉 Bạn đã đạt hết các mốc điểm danh — Huyền thoại!</p>
          )}
          {data.milestones.some(m => m.achieved) && (
            <p className="muted" style={{ margin: '.4rem 0 0' }}>
              Danh hiệu đã đạt: {data.milestones.filter(m => m.achieved).map(m => `${m.title} (${m.days} ngày)`).join(' · ')}
            </p>
          )}

          <div className="checkin-cal-head">
            <button type="button" className="btn btn-sm secondary" onClick={() => goMonth(-1)}>‹ Tháng trước</button>
            <strong>{monthLabel(viewMonth)}</strong>
            <button type="button" className="btn btn-sm secondary" onClick={() => goMonth(1)}>Tháng sau ›</button>
          </div>
          <div className="checkin-cal">
            {WEEKDAY_HEADS.map(h => (
              <div key={h} className="checkin-cal-h">{h}</div>
            ))}
            {cells.map((c, i) => {
              const kind = c.date ? data.days[c.date] : undefined;
              const isToday = c.date === data.today;
              return (
                <div
                  key={c.date ?? `blank-${i}`}
                  className={`checkin-day${c.inMonth ? '' : ' checkin-day--dim'}${isToday ? ' checkin-day--today' : ''}${kind ? ` checkin-day--${kind}` : ''}`}
                  title={c.date ? `${fmtCheckinDate(c.date)}${kind === 'checkin' ? ' — đã điểm danh' : kind === 'active' ? ' — có luyện tập' : kind === 'rest' ? ' — ngày nghỉ' : ''}` : ''}
                >
                  <span className="checkin-day-num">{c.date ? Number(c.date.slice(8, 10)) : ''}</span>
                  <span className="checkin-day-ico">{dayStatusIcon(kind)}</span>
                </div>
              );
            })}
          </div>
          <p className="muted" style={{ margin: '.4rem 0 0' }}>✓ đã điểm danh · 🔥 có luyện tập (chưa điểm danh) · 😴 ngày nghỉ · ô viền đậm là hôm nay</p>

          <h3 style={{ marginTop: '1rem' }}>🕘 Lịch sử điểm danh</h3>
          {!history?.length && <p className="muted">Chưa có ngày điểm danh nào — điểm danh hôm nay để bắt đầu chuỗi nhé.</p>}
          {history && history.length > 0 && (
            <ul className="checkin-history">
              {history.map(h => (
                <li key={`${h.date}-${h.kind}`}>
                  <span><strong>{fmtCheckinDate(h.date)}</strong> · {h.weekday}</span>
                  <span>
                    {h.kind === 'checkin' ? '✓ Đã điểm danh' : '😴 Ngày nghỉ'}
                    {h.kind === 'checkin' && h.streakDay ? ` · ngày thứ ${h.streakDay} liên tiếp` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {historyHasMore && (
            <div className="btn-row">
              <button className="btn secondary btn-sm" disabled={historyBusy} onClick={() => void loadMoreHistory()}>
                {historyBusy ? 'Đang tải…' : 'Xem thêm'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
