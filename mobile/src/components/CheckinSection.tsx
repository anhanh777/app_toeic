// Điểm danh hằng ngày — lịch tháng + quà theo mốc + lịch sử điểm danh.
// Bản mobile của frontend/src/checkin.tsx (web). Dùng chung cho cả 2 kỳ
// thi (1 streak duy nhất, như Home). Ngày theo Asia/Saigon: server trả
// `today` (+07), client chỉ định dạng chuỗi YYYY-MM-DD để hiển thị.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, api, type CheckinData, type CheckinHistoryItem } from '../api';
import { CARD_PADDING, RADIUS, SPACING } from '../layout';
import { livelyCard, raisedButton, useTextSize, useTheme } from '../theme';
import { LoadingLine } from './LoadingLine';
import { maybeRescheduleCheckinReminder } from '../notifications';

const WEEKDAY_HEADS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** '2026-11-23' -> '23/11/2026' (tách chuỗi, không qua Date). */
function fmtCheckinDate(dateStr: string): string {
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

export function CheckinSection({ onCheckedIn }: { onCheckedIn?: () => void }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const [data, setData] = useState<CheckinData | null>(null);
  // Tháng hiện tại lấy từ server (+07) khi dữ liệu về; khởi tạo bằng tháng local.
  const [month, setMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<CheckinHistoryItem[] | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);

  const loadMonth = useCallback(async (m: string, resetHistory: boolean) => {
    setError('');
    try {
      const d = await api.checkin(m);
      setData(d);
      if (resetHistory) {
        setHistory(d.history);
        setHistoryHasMore(d.historyHasMore);
      }
      // Nhắc 20:00 thêm dòng điểm danh nếu hôm nay chưa điểm danh
      // (chỉ lên lịch lại khi trạng thái đổi, tôn trọng nút tắt nhắc).
      void maybeRescheduleCheckinReminder(d.checkedInToday);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được điểm danh.');
    }
  }, []);

  useEffect(() => {
    // Fetch trong async IIFE (khong setState dong bo trong than effect).
    void (async () => {
      await loadMonth(month, true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMonth]);

  const goMonth = (delta: number) => {
    if (!month) return;
    const next = shiftMonth(month, delta);
    setMonth(next);
    void loadMonth(next, false);
  };

  const doCheckin = async () => {
    setBusy(true);
    setError('');
    setMsg('');
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
      setError(e instanceof ApiError ? e.message : 'Điểm danh thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const loadMoreHistory = async () => {
    if (!history?.length || historyBusy) return;
    setHistoryBusy(true);
    setError('');
    try {
      const before = prevDay(history[history.length - 1].date);
      const d = await api.checkin(undefined, before, 30);
      setHistory((prev) => [...(prev ?? []), ...d.history]);
      setHistoryHasMore(d.historyHasMore);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải thêm được lịch sử.');
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
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        livelyCard(colors, 'card'),
      ]}
    >
      <Text style={[styles.title, { color: colors.text, fontSize: scaled(18) }]}>📅 Điểm danh hằng ngày</Text>
      {error ? (
        <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
      ) : null}

      {data ? (
        <>
          <Pressable
            disabled={busy || data.checkedInToday}
            onPress={() => void doCheckin()}
            style={[
              styles.checkinBtn,
              { backgroundColor: data.checkedInToday ? colors.surfaceMuted : colors.accent },
              raisedButton(colors),
            ]}
          >
            <Text style={[styles.checkinBtnText, { color: data.checkedInToday ? colors.text : colors.onAccent, fontSize: scaled(14) }]}>
              {busy ? 'Đang điểm danh…' : data.checkedInToday ? '✓ Đã điểm danh hôm nay' : '📅 Điểm danh hôm nay (+10 XP)'}
            </Text>
          </Pressable>
          {data.restToday && !data.checkedInToday ? (
            <Text style={[styles.note, { color: colors.muted, fontSize: scaled(13) }]}>
              Hôm nay bạn đã chọn ngày nghỉ 😴 — điểm danh vẫn được tính nhé.
            </Text>
          ) : null}
          {msg ? (
            <Text style={[styles.note, { color: colors.text, fontSize: scaled(14) }]}>{msg}</Text>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>Chuỗi hiện tại</Text>
              <Text style={[styles.statValue, { color: colors.text, fontSize: scaled(16) }]}>🔥 {data.streak.current} ngày</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>Chuỗi dài nhất</Text>
              <Text style={[styles.statValue, { color: colors.text, fontSize: scaled(16) }]}>{data.streak.longest} ngày</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>Tổng ngày điểm danh</Text>
              <Text style={[styles.statValue, { color: colors.text, fontSize: scaled(16) }]}>{data.totalCheckins} ngày</Text>
            </View>
          </View>

          {next ? (
            <View style={styles.milestone}>
              <Text style={[styles.note, { color: colors.text, fontSize: scaled(14) }]}>
                Mốc tiếp theo: <Text style={{ fontWeight: '700' }}>{next.title}</Text> ({next.days} ngày, +{next.xp} XP) — còn{' '}
                <Text style={{ fontWeight: '700' }}>{next.remaining} ngày</Text> nữa
              </Text>
              <View style={[styles.bar, { backgroundColor: colors.border }]}>
                <View style={[styles.barFill, { width: `${progress}%`, backgroundColor: colors.accent }]} />
              </View>
            </View>
          ) : (
            <Text style={[styles.note, { color: colors.text, fontSize: scaled(14) }]}>
              🎉 Bạn đã đạt hết các mốc điểm danh — Huyền thoại!
            </Text>
          )}
          {data.milestones.some((m) => m.achieved) ? (
            <Text style={[styles.note, { color: colors.muted, fontSize: scaled(13) }]}>
              Danh hiệu đã đạt: {data.milestones.filter((m) => m.achieved).map((m) => `${m.title} (${m.days} ngày)`).join(' · ')}
            </Text>
          ) : null}

          <View style={styles.calHead}>
            <Pressable onPress={() => goMonth(-1)} style={[styles.navBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: scaled(13) }}>‹ Tháng trước</Text>
            </Pressable>
            <Text style={[styles.calTitle, { color: colors.text, fontSize: scaled(14) }]}>{monthLabel(viewMonth)}</Text>
            <Pressable onPress={() => goMonth(1)} style={[styles.navBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: scaled(13) }}>Tháng sau ›</Text>
            </Pressable>
          </View>
          <View style={styles.calGrid}>
            {WEEKDAY_HEADS.map((h) => (
              <View key={h} style={styles.calCell}>
                <Text style={[styles.calHeadText, { color: colors.muted, fontSize: scaled(12) }]}>{h}</Text>
              </View>
            ))}
            {cells.map((c, i) => {
              const kind = c.date ? data.days[c.date] : undefined;
              const isToday = c.date === data.today;
              return (
                <View
                  key={c.date ?? `blank-${i}`}
                  style={[
                    styles.calCell,
                    styles.dayCell,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    !c.inMonth && styles.dayDim,
                    isToday && { borderColor: colors.accent, borderWidth: 2 },
                    kind === 'checkin' && { backgroundColor: colors.greenBg },
                    kind === 'active' && { backgroundColor: colors.accentSoft },
                    kind === 'rest' && { backgroundColor: colors.surfaceMuted },
                  ]}
                >
                  <Text style={[styles.dayNum, { color: colors.text, fontSize: scaled(13) }]}>
                    {c.date ? Number(c.date.slice(8, 10)) : ''}
                  </Text>
                  <Text style={{ fontSize: scaled(11) }}>{dayStatusIcon(kind)}</Text>
                </View>
              );
            })}
          </View>
          <Text style={[styles.note, { color: colors.muted, fontSize: scaled(12) }]}>
            ✓ đã điểm danh · 🔥 có luyện tập (chưa điểm danh) · 😴 ngày nghỉ · ô viền đậm là hôm nay
          </Text>

          <Text style={[styles.subTitle, { color: colors.text, fontSize: scaled(16) }]}>🕘 Lịch sử điểm danh</Text>
          {!history?.length ? (
            <Text style={[styles.note, { color: colors.muted, fontSize: scaled(14) }]}>
              Chưa có ngày điểm danh nào — điểm danh hôm nay để bắt đầu chuỗi nhé.
            </Text>
          ) : (
            history.map((h) => (
              <View key={`${h.date}-${h.kind}`} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.historyDate, { color: colors.text, fontSize: scaled(13) }]}>
                  <Text style={{ fontWeight: '700' }}>{fmtCheckinDate(h.date)}</Text> · {h.weekday}
                </Text>
                <Text style={[styles.historyStatus, { color: colors.muted, fontSize: scaled(13) }]}>
                  {h.kind === 'checkin' ? '✓ Đã điểm danh' : '😴 Ngày nghỉ'}
                  {h.kind === 'checkin' && h.streakDay ? ` · ngày thứ ${h.streakDay} liên tiếp` : ''}
                </Text>
              </View>
            ))
          )}
          {historyHasMore ? (
            <Pressable
              disabled={historyBusy}
              onPress={() => void loadMoreHistory()}
              style={[styles.moreBtn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text, fontSize: scaled(14) }}>
                {historyBusy ? 'Đang tải…' : 'Xem thêm'}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: CARD_PADDING,
    marginBottom: SPACING.md,
  },
  title: { fontWeight: '800', marginBottom: 8 },
  error: { marginBottom: 8 },
  checkinBtn: {
    borderRadius: RADIUS.button,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  checkinBtnText: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  note: { marginTop: 4, lineHeight: 22 }, // Chữ 14 ở Rất lớn (~17.5) bị chật với lineHeight 20
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  stat: { minWidth: 100 },
  statLabel: { marginBottom: 2 },
  statValue: { fontWeight: '700' },
  milestone: { marginTop: 10 },
  bar: { height: 8, borderRadius: 999, overflow: 'hidden', marginTop: 6 },
  barFill: { height: '100%', borderRadius: 999 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 },
  navBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  calTitle: { fontWeight: '700', flexShrink: 1, textAlign: 'center' }, // Hàng tháng: 2 nút + tiêu đề tràn ở Rất lớn nếu tiêu đề không co lại
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  calHeadText: { fontWeight: '700' },
  dayCell: { borderWidth: 1, borderRadius: 8, minHeight: 44, marginVertical: 2 },
  dayDim: { opacity: 0.35 },
  dayNum: { fontWeight: '600' },
  subTitle: { fontWeight: '800', marginTop: 14, marginBottom: 4 },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  historyDate: { flexShrink: 0 },
  historyStatus: { textAlign: 'right', flexShrink: 1 },
  moreBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 10 },
});
