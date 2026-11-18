// Bảng xếp hạng — port từ frontend/src/pages/Leaderboard.tsx.
// Bảng XP chung cho cả 2 kỳ thi (không lọc exam); bảng điểm/band lọc
// theo exam. Bảng điểm/band chỉ tính bài thi full đủ điều kiện.
import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, api, type LeaderboardEntry } from '../api';
import { useExam } from '../exam';
import { horizontalPadding, LIST_DEFAULTS, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { useTextSize, useTheme } from '../theme';
import { BackButton } from '../components/BackButton';

type Metric = 'score' | 'xp' | 'band';
type Tab = 'week' | 'month' | 'all';
const MEDALS = ['🥇', '🥈', '🥉'];
const TABS: { id: Tab; label: string }[] = [
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
  { id: 'all', label: 'Mọi lúc' },
];

const EntryRow = memo(function EntryRow({
  e,
  metric,
  fmtValue,
}: {
  e: LeaderboardEntry;
  metric: Metric;
  fmtValue: (e: LeaderboardEntry) => string;
}) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  return (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: e.rank <= 3 ? colors.surfaceMuted : colors.surface }]}>
      <Text style={[styles.rank, { color: colors.text, fontSize: scaled(15) }]}>
        {e.rank <= 3 ? MEDALS[e.rank - 1] : `#${e.rank}`}
      </Text>
      {e.avatarUrl ? (
        <Image source={{ uri: e.avatarUrl }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={{ color: colors.muted, fontSize: scaled(14) }}>{(e.name || '?')[0]?.toUpperCase()}</Text>
        </View>
      )}
      <Text style={[styles.name, { color: colors.text, fontSize: scaled(15) }]} numberOfLines={1}>
        {e.name}
      </Text>
      <Text style={[styles.value, { color: colors.text, fontSize: scaled(15) }]}>{fmtValue(e)}</Text>
      <Text style={[styles.answered, { color: colors.muted, fontSize: scaled(13) }]}>
        {e.answered != null ? `${e.answered} câu` : '—'}
      </Text>
    </View>
  );
});

export default function LeaderboardScreen() {
  const { exam } = useExam();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  // Lựa chọn của người dùng (kèm kỳ thi lúc chọn): đổi kỳ thi mà chưa
  // chọn lại thì về mặc định của kỳ thi đó (band cho IELTS, score cho TOEIC).
  const [metricSel, setMetricSel] = useState<{ exam: string; metric: Metric } | null>(null);
  const metric: Metric =
    metricSel && metricSel.exam === ex ? metricSel.metric : isIelts ? 'band' : 'score';
  const setMetric = (m: Metric) => {
    setMetricSel({ exam: ex, metric: m });
    setLoading(true);
    setError('');
  };
  const [tab, setTab] = useState<Tab>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [me, setMe] = useState<(LeaderboardEntry & { rank: number }) | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .leaderboard(metric, tab, metric === 'xp' ? undefined : ex)
      .then((d) => {
        setEntries(d.entries);
        setMe(d.me);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được bảng xếp hạng.'))
      .finally(() => setLoading(false));
  }, [metric, tab, ex]);

  const value = useCallback(
    (e: LeaderboardEntry) => (metric === 'xp' ? e.xp : e.score),
    [metric],
  );
  const fmtValue = useCallback(
    (e: LeaderboardEntry) =>
      metric === 'band' ? `Band ${value(e)}` : `${value(e)} ${metric === 'score' ? 'điểm' : 'XP'}`,
    [metric, value],
  );
  const keyExtractor = useCallback((e: LeaderboardEntry) => String(e.rank), []);

  const renderItem = useCallback(
    ({ item }: { item: LeaderboardEntry }) => (
      <EntryRow e={item} metric={metric} fmtValue={fmtValue} />
    ),
    [metric, fmtValue],
  );

  const pad = horizontalPadding(width);
  const top3 = entries.slice(0, 3);
  const unit = metric === 'band' ? 'band' : metric === 'score' ? 'điểm' : 'XP';
  const gap =
    me && entries[me.rank - 2]
      ? value(entries[me.rank - 2]) - value(me)
      : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.wrap, { paddingHorizontal: pad }]}>
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={[styles.title, { flex: 1, color: colors.text, fontSize: scaled(24) }]}>🏆 Bảng xếp hạng</Text>
        </View>
        <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
          Xem mình đang đứng ở đâu và cố gắng thêm một chút mỗi ngày nhé.
        </Text>

        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, { borderColor: colors.border, backgroundColor: metric !== 'xp' ? colors.accent : colors.surface }]}
            onPress={() => setMetric(isIelts ? 'band' : 'score')}
          >
            <Text style={{ color: metric !== 'xp' ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
              {isIelts ? '🏆 Bảng band IELTS' : '🏆 Bảng điểm thi thử'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.chip, { borderColor: colors.border, backgroundColor: metric === 'xp' ? colors.accent : colors.surface }]}
            onPress={() => setMetric('xp')}
          >
            <Text style={{ color: metric === 'xp' ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
              ⭐ Bảng XP
            </Text>
          </Pressable>
        </View>
        <View style={styles.chipRow}>
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: tab === t.id ? colors.accent : colors.surface }]}
              onPress={() => {
                setTab(t.id);
                setLoading(true);
                setError('');
              }}
            >
              <Text style={{ color: tab === t.id ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? (
          <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
        ) : null}
        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : (
          <>
            {top3.length >= 3 && (
              <View style={styles.top3}>
                {top3.map((e) => (
                  <View key={e.rank} style={[styles.top3Card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.medal, { fontSize: scaled(20) }]}>{MEDALS[e.rank - 1]}</Text>
                    <Text style={[styles.top3Name, { color: colors.text, fontSize: scaled(14) }]} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text style={[styles.top3Score, { color: colors.text, fontSize: scaled(14) }]}>{fmtValue(e)}</Text>
                  </View>
                ))}
              </View>
            )}
            <FlatList
              data={entries}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              {...LIST_DEFAULTS}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.muted, fontSize: scaled(15) }]}>
                  Chưa có ai trên bảng xếp hạng trong khoảng này.
                </Text>
              }
              contentContainerStyle={styles.list}
            />
          </>
        )}

        {me && (
          <View style={[styles.meCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.meText, { color: colors.text, fontSize: scaled(15) }]}>
              Bạn đang hạng #{me.rank} — {metric === 'xp' ? `XP: ${me.xp}` : fmtValue(me)}
              {gap != null && gap > 0
                ? ` — còn ${metric === 'band' ? gap.toFixed(1) : gap} ${unit} nữa là lên hạng #${me.rank - 1}`
                : ''}
            </Text>
          </View>
        )}
        <Text style={[styles.note, { color: colors.muted, fontSize: scaled(13) }]}>
          Bảng điểm chỉ tính bài thi full đủ điều kiện (làm đủ thời gian tối thiểu). Muốn ẩn tên khỏi bảng
          xếp hạng, vào Cài đặt.
          {metric === 'band' ? ' Band IELTS trong app là band ước lượng để tham khảo.' : ''}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Hàng tiêu đề: nút quay lại + tiêu đề cùng 1 hàng (không để nút lẻ 1 hàng gây thừa khoảng trắng).
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  safe: { flex: 1 },
  wrap: {
    flex: 1,
    paddingVertical: SPACING.lg,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: SPACING.sm,
  },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  sub: { flexWrap: 'wrap' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  chip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  error: { flexWrap: 'wrap' },
  loader: { marginTop: SPACING.lg },
  top3: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  top3Card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.sm,
    alignItems: 'center',
    gap: 2,
  },
  medal: { textAlign: 'center' },
  top3Name: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  top3Score: { textAlign: 'center', flexWrap: 'wrap' },
  list: { gap: SPACING.sm, paddingBottom: SPACING.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    width: '100%',
  },
  rank: { fontWeight: '700', minWidth: 28 },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, flexShrink: 1, fontWeight: '600' },
  value: { fontWeight: '700' },
  answered: { minWidth: 48, textAlign: 'right' },
  empty: { textAlign: 'center', marginTop: SPACING.lg, flexWrap: 'wrap' },
  meCard: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    width: '100%',
  },
  meText: { fontWeight: '600', flexWrap: 'wrap' },
  note: { flexWrap: 'wrap' },
});
