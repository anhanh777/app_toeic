// Chi tiết bộ đề — port của frontend/src/pages/TestSetDetail.tsx.
// Các Part với số câu + tiến độ; bấm 1 Part → màn luyện của Part đó;
// nút "Thi thử cả đề" → màn thi thử của đề đó.
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type TestSet } from '../../api';
import { useExam } from '../../exam';
import { partLabel, partNameFor } from '../../lib';
import { horizontalPadding, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../../layout';
import { useTextSize, useTheme } from '../../theme';
import { BackButton } from '../../components/BackButton';
import { partName, sectionOf } from '../../components/QuestionView';

export default function TestSetDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { exam: ctxExam } = useExam();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const [ts, setTs] = useState<TestSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api
      .testSet(id)
      .then(setTs)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const ex = (ts?.exam === 'ielts' || ts?.exam === 'toeic' ? ts.exam : ctxExam) ?? 'toeic';
  const isIelts = ex === 'ielts';
  const fullMinutes = isIelts ? 90 : 120;
  const pad = horizontalPadding(width);

  const goPractice = useCallback(
    (p: number) => {
      if (!ts) return;
      router.push({ pathname: '/session', params: { testSetId: ts.id, part: String(p), exam: ex } });
    },
    [ts, ex],
  );
  const goMock = useCallback(() => {
    if (!ts) return;
    router.push({ pathname: '/mock', params: { testSetId: ts.id, exam: ex } });
  }, [ts, ex]);

  const renderPartCard = useCallback(
    (p: number) => {
      if (!ts) return null;
      const info = ts.parts.find((x) => x.part === p);
      const n = info?.count || 0;
      const prog = ts.progress?.byPart.find((b) => b.part === p);
      return (
        <View key={p} style={[styles.card, styles.partCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.line, { color: colors.text, fontSize: scaled(14) }]}>
            {p <= 4 ? '🎧' : '📖'} {partLabel(p, ex)} · {n} câu
          </Text>
          <Text style={[styles.line, { color: colors.text, fontSize: scaled(16), fontWeight: '700' }]}>
            {isIelts ? partNameFor(p, ex) : partName(p)}
          </Text>
          <Text style={[styles.pill, { color: colors.muted, fontSize: scaled(12), borderColor: colors.border }]}>{sectionOf(p)}</Text>
          {prog ? (
            <>
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(14) }]}>
                Đã làm {prog.answered}/{n} câu · đúng {prog.correct}
              </Text>
              {n > 0 ? (
                <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
                  <View style={[styles.barFill, { width: `${Math.round((prog.answered / n) * 100)}%`, backgroundColor: colors.accent }]} />
                </View>
              ) : null}
            </>
          ) : (
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>Chưa làm câu nào ở {partLabel(p, ex)} này</Text>
          )}
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent }, !n && styles.disabled]}
            disabled={!n}
            onPress={() => goPractice(p)}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
              Luyện {partLabel(p, ex)} này ({n} câu)
            </Text>
          </Pressable>
        </View>
      );
    },
    [ts, colors, ex, goPractice, isIelts, scaled],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}>
        <View style={styles.headerRow}>
          <BackButton />
          {ts ? (
            <Text style={[styles.title, { flex: 1, color: colors.text, fontSize: scaled(22) }]}>{ts.title}</Text>
          ) : null}
        </View>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.muted, fontSize: scaled(15) }}>Đang tải đề thi…</Text>
          </View>
        ) : !ts ? (
          <View>
            {error ? <Text style={{ color: colors.danger, fontSize: scaled(15) }}>{error}</Text> : null}
            <Text style={{ color: colors.text, fontSize: scaled(15) }}>Không tìm thấy bộ đề.</Text>
          </View>
        ) : (
          <View style={styles.wrap}>
            {ts.description ? (
              <Text style={[styles.line, { color: colors.muted, fontSize: scaled(15) }]}>{ts.description}</Text>
            ) : null}
            {isIelts && ts.title.includes('(Sample)') ? (
              <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                📌 Đề mẫu IELTS — dùng để làm quen với dạng bài thi. Đề mẫu chưa có audio, bạn vẫn làm bài bình thường.
              </Text>
            ) : null}
            {error ? <Text style={{ color: colors.danger, fontSize: scaled(15) }}>{error}</Text> : null}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
                <Text style={{ fontWeight: '700', fontSize: scaled(18) }}>{ts.totalQuestions || 0}</Text> câu • Đã làm{' '}
                {ts.progress?.answeredTotal || 0}/{ts.totalQuestions || 0} câu (
                {ts.totalQuestions ? Math.round(((ts.progress?.answeredTotal || 0) / ts.totalQuestions) * 100) : 0}%) • Đúng{' '}
                {ts.progress?.correctTotal || 0} câu
              </Text>
              <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${ts.totalQuestions ? Math.round(((ts.progress?.answeredTotal || 0) / ts.totalQuestions) * 100) : 0}%`,
                      backgroundColor: colors.success,
                    },
                  ]}
                />
              </View>
              {ts.missing.length > 0 ? (
                <Text style={[styles.line, { color: colors.danger, fontSize: scaled(14) }]}>
                  ⚠ Đề chưa đủ câu chuẩn: {ts.missing.map((m) => `${partLabel(m.part, ex)} thiếu ${m.missing} câu`).join(', ')}. Bạn vẫn có
                  thể luyện các câu hiện có.
                </Text>
              ) : null}
              <Pressable
                style={[styles.button, { backgroundColor: colors.accent }, !ts.totalQuestions && styles.disabled]}
                disabled={!ts.totalQuestions}
                onPress={goMock}
              >
                <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
                  🏆 Thi thử cả đề ({ts.totalQuestions} câu · {fullMinutes} phút)
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: scaled(18) }]}>
              🎧 Listening — {isIelts ? 'Section 1–4' : 'Part 1–4'}
            </Text>
            <View style={styles.grid}>{[1, 2, 3, 4].map(renderPartCard)}</View>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: scaled(18) }]}>
              📖 Reading — {isIelts ? 'Passage 1–3' : 'Part 5–7'}
            </Text>
            <View style={styles.grid}>{[5, 6, 7].map(renderPartCard)}</View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Hàng tiêu đề: nút quay lại + tiêu đề cùng 1 hàng (không để nút lẻ 1 hàng gây thừa khoảng trắng).
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingVertical: SPACING.md, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, paddingVertical: SPACING.xl },
  wrap: { gap: SPACING.sm, paddingTop: SPACING.sm },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  line: { flexWrap: 'wrap' },
  card: { borderWidth: 1, borderRadius: RADIUS.card, padding: SPACING.sm, gap: SPACING.xs, width: '100%' },
  partCard: { flexGrow: 1, flexBasis: '45%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  pill: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2, overflow: 'hidden', alignSelf: 'flex-start' },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  barFill: { height: '100%', borderRadius: 4 },
  button: { borderRadius: RADIUS.button, paddingVertical: SPACING.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.6 },
  sectionTitle: { fontWeight: '700', flexWrap: 'wrap' },
});
