// Chọn bộ đề để luyện 1 Part — bước 2 của flow Luyện theo Part:
// Practice (chọn Part) → /part-sets (chọn 1 đề) → /session
// (1 Part của 1 đề). Buổi luyện có đúng 1 file audio cấp Part nên
// nút "Nghe cả Part" trong session hoạt động.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type TestSet } from '../api';
import { useExam, type ExamId } from '../exam';
import { CARD_PADDING, horizontalPadding, LIST_DEFAULTS, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { livelyCard, raisedButton, useTextSize, useTheme } from '../theme';
import { BottomNav } from '../components/BottomNav';
import { BackButton } from '../components/BackButton';
import { LoadingLine } from '../components/LoadingLine';
import { partLabel, partNameFor } from '../lib';
import { partName, sectionOf } from '../components/QuestionView';

/** Mới nhất trước: createdAt giảm dần, dự phòng id giảm dần. */
function sortNewestFirst(sets: TestSet[]): TestSet[] {
  return [...sets].sort((a, b) => {
    const ta = Date.parse(a.createdAt || '');
    const tb = Date.parse(b.createdAt || '');
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}

export default function PartSetsScreen() {
  const params = useLocalSearchParams<{ part?: string; exam?: string }>();
  const { exam: ctxExam } = useExam();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();

  const paramExam = params.exam === 'ielts' || params.exam === 'toeic' ? (params.exam as ExamId) : null;
  const ex: ExamId = paramExam ?? ctxExam ?? 'toeic';
  const hasExam = !!paramExam || !!ctxExam;
  const isIelts = ex === 'ielts';
  const part = Number(params.part || 5);
  // Part không hợp lệ thì hiện card lỗi (như web) thay vì kẹp ngầm về
  // Part 5 như trước.
  const partValid = Number.isInteger(part) && part >= 1 && part <= 7;
  const partNum = partValid ? part : 5;
  const partTitle = isIelts ? `${partLabel(partNum, ex)} — ${sectionOf(partNum)}` : partName(partNum);

  // Chưa chọn kỳ thi thì không vào được — về màn chọn, nhớ đích đến.
  useEffect(() => {
    if (!hasExam) router.replace({ pathname: '/', params: { next: '/part-sets' } });
  }, [hasExam]);

  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [prevEx, setPrevEx] = useState(ex);
  if (prevEx !== ex) {
    setPrevEx(ex);
    setLoading(true);
    setError(null);
    setTestSets([]);
  }

  useEffect(() => {
    if (!hasExam || !partValid) return;
    api.testSets(ex).then(setTestSets).catch((e) => setError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false));
  }, [ex, hasExam, partValid]);

  const sortedSets = useMemo(() => sortNewestFirst(testSets), [testSets]);
  const pad = horizontalPadding(width);

  const openSession = useCallback((ts: TestSet) => {
    router.push({ pathname: '/session', params: { part: String(partNum), testSetId: ts.id, exam: ex } });
  }, [partNum, ex]);

  const renderSet = useCallback(
    ({ item: ts }: { item: TestSet }) => {
      const partCount = ts.parts.find((p) => p.part === partNum)?.count ?? 0;
      const total = ts.totalQuestions || 0;
      const disabled = partCount === 0;
      return (
        <Pressable
          disabled={disabled}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.55 : 1 },
            livelyCard(colors, 'compact'),
          ]}
          onPress={() => openSession(ts)}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
        >
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(16) }]}>{ts.title}</Text>
            {!ts.isPublished ? (
              <Text style={[styles.pill, { color: colors.muted, fontSize: scaled(12), borderColor: colors.border }]}>NHÁP</Text>
            ) : null}
          </View>
          <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
            <Text style={{ fontWeight: '700' }}>{partCount}</Text> câu {partLabel(partNum, ex)} trong đề này
            {' • '}
            {total} câu cả đề
          </Text>
          {disabled ? (
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>Chưa có câu</Text>
          ) : (
            <View style={[styles.button, { backgroundColor: colors.accent }, raisedButton(colors)]}>
              <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(14) }]}>
                ▶ Luyện {isIelts ? partNameFor(partNum, ex) : partName(partNum)}
              </Text>
            </View>
          )}
        </Pressable>
      );
    },
    [colors, ex, isIelts, openSession, partNum, scaled],
  );

  // Part không hợp lệ: card lỗi + nút quay lại (như web), không tải
  // danh sách đề, không kẹp về Part 5.
  if (!partValid) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.container, { paddingHorizontal: pad }]}>
          <View style={styles.header}>
            <BackButton />
            <Text style={[styles.title, { color: colors.text, fontSize: scaled(20) }]}>Part không hợp lệ</Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'card')]}>
            <Text style={{ color: colors.text, fontSize: scaled(15) }}>Part không hợp lệ.</Text>
          </View>
        </View>
        <BottomNav />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { paddingHorizontal: pad }]}>
        <View style={styles.header}>
          <BackButton />
          {/* Tiêu đề 22 vỡ thành 2 dòng với tên Part dài (vd "Part 5: Incomplete Sentences") nên giảm còn 20. */}
          <Text style={[styles.title, { color: colors.text, fontSize: scaled(20) }]}>{partTitle}</Text>
        </View>
        <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
          Chọn 1 đề để luyện {partTitle} — mỗi buổi là 1 {isIelts ? 'Section/Passage' : 'Part'} của 1 đề.
        </Text>
        {loading ? (
          <LoadingLine location="page" text="Đang tải danh sách bộ đề…" />
        ) : error ? (
          <Text style={{ color: colors.danger, fontSize: scaled(15) }}>{error}</Text>
        ) : sortedSets.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'card')]}>
            <Text style={{ color: colors.text, fontSize: scaled(15) }}>Chưa có bộ đề nào.</Text>
          </View>
        ) : (
          <FlatList
            data={sortedSets}
            keyExtractor={(ts) => ts.id}
            renderItem={renderSet}
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
  container: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingTop: SPACING.md, gap: SPACING.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap' },
  title: { fontWeight: '700', flexShrink: 1, flexWrap: 'wrap' },
  list: { gap: SPACING.sm, paddingBottom: SPACING.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  card: { borderWidth: 1, borderRadius: RADIUS.card, padding: CARD_PADDING, gap: SPACING.xs, width: '100%' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm, alignItems: 'flex-start' },
  cardTitle: { fontWeight: '700', flexShrink: 1, flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2, overflow: 'hidden', alignSelf: 'flex-start' },
  line: { flexWrap: 'wrap' },
  button: { borderRadius: RADIUS.button, paddingVertical: SPACING.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  buttonText: { fontWeight: '700', textAlign: 'center' },
});
