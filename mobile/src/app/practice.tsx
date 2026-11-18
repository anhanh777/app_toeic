// Luyện tập — port của frontend/src/pages/Practice.tsx.
// 2 tab: luyện theo Bộ đề / luyện theo Part (Section/Passage với IELTS).
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
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
import { api, type PartInfo, type StatsOverview, type TestSet } from '../api';
import { useExam } from '../exam';
import { horizontalPadding, LIST_DEFAULTS, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { useTextSize, useTheme } from '../theme';
import { BottomNav } from '../components/BottomNav';
import { BackButton } from '../components/BackButton';
import { partLabel, partNameFor } from '../lib';
import { partName, sectionOf } from '../components/QuestionView';

export default function PracticeScreen() {
  const { exam } = useExam();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  const [tab, setTab] = useState<'sets' | 'parts'>('sets');

  // Chưa chọn kỳ thi thì không vào được — về màn chọn, nhớ đích đến.
  useEffect(() => {
    if (!exam) router.replace({ pathname: '/', params: { next: '/practice' } });
  }, [exam]);
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [setsError, setSetsError] = useState<string | null>(null);
  const [setsLoading, setSetsLoading] = useState(true);
  const [parts, setParts] = useState<PartInfo[]>([]);
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [partsError, setPartsError] = useState<string | null>(null);
  const [part, setPart] = useState(5);

  // Đổi kỳ thi: reset danh sách ngay trong lúc render (pattern
  // "adjusting state when props change"); việc tải nằm trong effect.
  const [prevEx, setPrevEx] = useState(ex);
  if (prevEx !== ex) {
    setPrevEx(ex);
    setSetsLoading(true);
    setSetsError(null);
    setTestSets([]);
  }

  useEffect(() => {
    api.testSets(ex).then(setTestSets).catch((e) => setSetsError(e instanceof Error ? e.message : String(e))).finally(() => setSetsLoading(false));
    api.parts(ex).then(setParts).catch((e) => setPartsError(e instanceof Error ? e.message : String(e)));
    api.statsOverview(ex).then(setStats).catch(() => undefined);
  }, [ex]);

  const acc = useCallback(
    (p: number) => stats?.byPart.find((b) => b.part === p),
    [stats],
  );
  const partList: PartInfo[] = parts.length ? parts : [1, 2, 3, 4, 5, 6, 7].map((p) => ({ part: p, count: 0 }));
  const pad = horizontalPadding(width);

  const openSet = useCallback((id: string) => {
    router.push({ pathname: '/test-set/[id]', params: { id } });
  }, []);
  const startPart = useCallback(() => {
    router.push({ pathname: '/session', params: { part: String(part), exam: ex } });
  }, [part, ex]);

  const renderSet = useCallback(
    ({ item: ts }: { item: TestSet }) => {
      const total = ts.totalQuestions || 0;
      const answered = ts.progress?.answeredTotal || 0;
      const pct = total ? Math.round((answered / total) * 100) : 0;
      return (
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => openSet(ts.id)}
        >
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(16) }]}>{ts.title}</Text>
            {!ts.isPublished ? (
              <Text style={[styles.pill, { color: colors.muted, fontSize: scaled(12), borderColor: colors.border }]}>NHÁP</Text>
            ) : null}
          </View>
          {ts.description ? (
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>{ts.description}</Text>
          ) : null}
          <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
            <Text style={{ fontWeight: '700' }}>{total}</Text> câu
          </Text>
          <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
            {ts.parts.map((p) => `${partLabel(p.part, ex)} ${p.count}`).join(' · ') || 'Chưa có câu hỏi'}
          </Text>
          {ts.missing.length > 0 ? (
            <Text style={[styles.line, { color: colors.danger, fontSize: scaled(14) }]}>
              ⚠ Chưa đủ câu: {ts.missing.map((m) => `${partLabel(m.part, ex)} thiếu ${m.missing} câu`).join(', ')}
            </Text>
          ) : null}
          {ts.progress ? (
            <View style={styles.progressWrap}>
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(14) }]}>
                Đã làm {answered}/{total} câu ({pct}%)
              </Text>
              <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
                <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.success }]} />
              </View>
            </View>
          ) : (
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>Chưa làm câu nào trong đề này</Text>
          )}
          <View style={[styles.button, { backgroundColor: colors.accent }]}>
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
              {answered > 0 ? '▶ Làm tiếp' : '👁 Xem đề'}
            </Text>
          </View>
        </Pressable>
      );
    },
    [colors, scaled, ex, openSet],
  );

  const renderPartCard = useCallback(
    (p: PartInfo) => {
      const a = acc(p.part);
      const selected = part === p.part;
      return (
        <Pressable
          key={p.part}
          style={[
            styles.card,
            styles.partCard,
            { backgroundColor: colors.surface, borderColor: selected ? colors.accent : colors.border },
          ]}
          onPress={() => setPart(p.part)}
        >
          <Text style={[styles.line, { color: colors.text, fontSize: scaled(14) }]}>
            {p.part <= 4 ? '🎧' : '📖'} {partLabel(p.part, ex)}
          </Text>
          <Text style={[styles.line, { color: colors.text, fontSize: scaled(16), fontWeight: '700' }]}>
            {isIelts ? partNameFor(p.part, ex) : partName(p.part)}
          </Text>
          <Text style={[styles.pill, { color: colors.muted, fontSize: scaled(12), borderColor: colors.border }]}>{sectionOf(p.part)}</Text>
          <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
            {p.count ? `${p.count} câu trong ngân hàng` : 'Chưa rõ số câu'}
          </Text>
          {a ? (
            <>
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(14) }]}>
                Tỉ lệ đúng: {Math.round(a.accuracy * 100)}% ({a.correct}/{a.answered} câu)
              </Text>
              <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
                <View style={[styles.barFill, { width: `${a.accuracy * 100}%`, backgroundColor: colors.accent }]} />
              </View>
            </>
          ) : null}
        </Pressable>
      );
    },
    [acc, colors, ex, isIelts, part, scaled],
  );

  const selectedPartInfo = partList.find((p) => p.part === part);
  const selectedCount = selectedPartInfo?.count || 0;
  const selectedLabel = isIelts ? partNameFor(part, ex) : partName(part);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { paddingHorizontal: pad }]}>
        <View style={styles.header}>
          <BackButton />
          <Text style={[styles.title, { color: colors.text, fontSize: scaled(22) }]}>Luyện tập</Text>
        </View>
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, { borderColor: colors.border }, tab === 'sets' && { backgroundColor: colors.accent }]}
            onPress={() => setTab('sets')}
          >
            <Text style={{ color: tab === 'sets' ? colors.onAccent : colors.text, fontSize: scaled(15), fontWeight: '700' }}>
              📚 Luyện theo Bộ đề
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, { borderColor: colors.border }, tab === 'parts' && { backgroundColor: colors.accent }]}
            onPress={() => setTab('parts')}
          >
            <Text style={{ color: tab === 'parts' ? colors.onAccent : colors.text, fontSize: scaled(15), fontWeight: '700' }}>
              {isIelts ? '🎧 Luyện theo Section/Passage' : '🎧 Luyện theo Part'}
            </Text>
          </Pressable>
        </View>

        {tab === 'sets' ? (
          setsLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <Text style={{ color: colors.muted, fontSize: scaled(15) }}>Đang tải danh sách bộ đề…</Text>
            </View>
          ) : setsError ? (
            <Text style={{ color: colors.danger, fontSize: scaled(15) }}>{setsError}</Text>
          ) : testSets.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: scaled(15) }}>Chưa có bộ đề nào.</Text>
            </View>
          ) : (
            <FlatList
              data={testSets}
              keyExtractor={(ts) => ts.id}
              renderItem={renderSet}
              contentContainerStyle={styles.list}
              {...LIST_DEFAULTS}
            />
          )
        ) : (
          <FlatList
            data={[0]}
            keyExtractor={() => 'parts'}
            renderItem={() => (
              <View style={styles.partsWrap}>
                {partsError ? (
                  <Text style={{ color: colors.danger, fontSize: scaled(15) }}>{partsError}</Text>
                ) : null}
                <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                  Luyện 1 {isIelts ? 'Section/Passage' : 'Part'} gom câu từ ngân hàng chung, không gắn đề cụ thể.
                </Text>
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: scaled(18) }]}>
                  🎧 Listening — {isIelts ? 'Section 1–4' : 'Part 1–4'}
                </Text>
                <View style={styles.partsGrid}>{partList.filter((p) => p.part <= 4).map(renderPartCard)}</View>
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: scaled(18) }]}>
                  📖 Reading — {isIelts ? 'Passage 1–3' : 'Part 5–7'}
                </Text>
                <View style={styles.partsGrid}>{partList.filter((p) => p.part > 4).map(renderPartCard)}</View>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
                    {selectedCount > 0
                      ? `Luyện hết ${selectedCount} câu của ${selectedLabel} — không giới hạn số lượng.`
                      : `Luyện hết tất cả các câu của ${selectedLabel} — không giới hạn số lượng.`}
                  </Text>
                  <Pressable style={[styles.button, { backgroundColor: colors.accent }]} onPress={startPart}>
                    <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
                      Bắt đầu luyện {selectedLabel}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            contentContainerStyle={styles.list}
            {...LIST_DEFAULTS}
          />
        )}
      </View>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingTop: SPACING.md, gap: SPACING.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap' },
  title: { fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  tab: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, flexGrow: 1, alignItems: 'center' },
  list: { gap: SPACING.md, paddingBottom: SPACING.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  card: { borderWidth: 1, borderRadius: RADIUS.card, padding: SPACING.md, gap: SPACING.sm, width: '100%' },
  partCard: { flexGrow: 1, flexBasis: '45%' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm, alignItems: 'flex-start' },
  cardTitle: { fontWeight: '700', flexShrink: 1, flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2, overflow: 'hidden', alignSelf: 'flex-start' },
  line: { flexWrap: 'wrap' },
  progressWrap: { gap: 4 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  barFill: { height: '100%', borderRadius: 4 },
  button: { borderRadius: RADIUS.button, paddingVertical: SPACING.md, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  partsWrap: { gap: SPACING.md },
  partsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  sectionTitle: { fontWeight: '700', flexWrap: 'wrap' },
});
