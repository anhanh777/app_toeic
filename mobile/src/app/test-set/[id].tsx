// Chi tiết bộ đề — port của frontend/src/pages/TestSetDetail.tsx.
// Các Part với số câu + tiến độ; bấm 1 Part → màn luyện của Part đó;
// nút "Thi thử cả đề" → màn thi thử của đề đó.
import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type TestSet } from '../../api';
import { useExam } from '../../exam';
import { partLabel, partNameFor } from '../../lib';
import { CARD_PADDING, horizontalPadding, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../../layout';
import { livelyBarTrack, livelyCard, livelyChip, raisedButton, useTextSize, useTheme } from '../../theme';
import { BackButton } from '../../components/BackButton';
import { HeroFlight, type HeroRect } from '../../components/HeroFlight';
import { partName, sectionOf } from '../../components/QuestionView';

export default function TestSetDetailScreen() {
  const { id, hero } = useLocalSearchParams<{ id?: string; hero?: string }>();
  // Vị trí thẻ đã bấm ở màn Luyện tập (truyền qua params). Hero param
  // chỉ sinh ra khi bấm thẻ trong app nên luôn tươi; param lỗi thì mở
  // thường. (Không kiểm tra tuổi bằng Date.now() ở đây — impure lúc
  // render; thẻ giả có timeout 1.2s tự biến nếu đo đích thất bại.)
  const heroRect = useMemo(() => {
    try {
      const r = hero ? JSON.parse(hero) : null;
      if (!r || typeof r.x !== 'number' || typeof r.w !== 'number' || r.w <= 0 || r.h <= 0) return null;
      return { x: r.x, y: r.y, w: r.w, h: r.h, title: typeof r.title === 'string' ? r.title : '' };
    } catch {
      return null;
    }
  }, [hero]);
  const [flightDone, setFlightDone] = useState(!heroRect);
  // Thẻ thật mờ đi trong lúc thẻ giả bay tới; bay xong thì hiện dần
  // (mờ được mở trong onDone của HeroFlight — event handler, không
  // gán shared value trong effect).
  const [targetRect, setTargetRect] = useState<HeroRect | null>(null);
  const summaryRef = useRef<ElementRef<typeof View>>(null);
  const targetRef = useRef<HeroRect | null>(null);
  // Thẻ thật mờ đi trong lúc thẻ giả bay tới; bay xong thì hiện dần
  // trong onDone của HeroFlight.
  const cardOpacity = useSharedValue(heroRect ? 0 : 1);
  const cardOpacityStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value }));
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
  // IELTS-only: tiến độ tách Listening/Reading (như web
  // listeningReadingProgress — tính từ progress.byPart + parts).
  const lr = useMemo(() => {
    if (!isIelts || !ts) return null;
    const totalFor = (pred: (p: number) => boolean) =>
      ts.parts.filter((p) => pred(p.part)).reduce((s, p) => s + p.count, 0);
    const answeredFor = (pred: (p: number) => boolean) =>
      (ts.progress?.byPart ?? []).filter((b) => pred(b.part)).reduce((s, b) => s + b.answered, 0);
    return {
      listening: { answered: answeredFor((p) => p <= 4), total: totalFor((p) => p <= 4) },
      reading: { answered: answeredFor((p) => p >= 5), total: totalFor((p) => p >= 5) },
    };
  }, [isIelts, ts]);
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
        <View key={p} style={[styles.card, styles.partCard, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'compact')]}>
          <Text style={[styles.line, { color: colors.text, fontSize: scaled(14) }]}>
            {p <= 4 ? '🎧' : '📖'} {partLabel(p, ex)} · {n} câu
          </Text>
          <Text style={[styles.line, { color: colors.text, fontSize: scaled(16), fontWeight: '700' }]}>
            {isIelts ? partNameFor(p, ex) : partName(p)}
          </Text>
          <Text style={[styles.pill, { color: colors.muted, fontSize: scaled(12), borderColor: colors.border }, livelyChip(colors)]}>{sectionOf(p)}</Text>
          {prog ? (
            <>
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(14) }]}>
                Đã làm {prog.answered}/{n} câu · đúng {prog.correct}
              </Text>
              {n > 0 ? (
                <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }, livelyBarTrack(colors)]}>
                  <View style={[styles.barFill, { width: `${Math.round((prog.answered / n) * 100)}%`, backgroundColor: colors.accent }]} />
                </View>
              ) : null}
            </>
          ) : (
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>Chưa làm câu nào ở {partLabel(p, ex)} này</Text>
          )}
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent }, !n && styles.disabled, raisedButton(colors)]}
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
    <View style={styles.root}>
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
            <Animated.View
              ref={summaryRef}
              onLayout={() => {
                // Đo vị trí thẻ thật để HeroFlight biết bay về đâu.
                summaryRef.current?.measure((x, y, w, h, pageX, pageY) => {
                  if (w > 0 && h > 0) {
                    const next = { x: pageX, y: pageY, w, h };
                    const prev = targetRef.current;
                    if (!prev || prev.x !== next.x || prev.y !== next.y || prev.w !== next.w || prev.h !== next.h) {
                      targetRef.current = next;
                      setTargetRect(next);
                    }
                  }
                });
              }}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardOpacityStyle]}
            >
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
                <Text style={{ fontWeight: '700', fontSize: scaled(18) }}>{ts.totalQuestions || 0}</Text> câu • Đã làm{' '}
                {ts.progress?.answeredTotal || 0}/{ts.totalQuestions || 0} câu (
                {ts.totalQuestions ? Math.round(((ts.progress?.answeredTotal || 0) / ts.totalQuestions) * 100) : 0}%) • Đúng{' '}
                {ts.progress?.correctTotal || 0} câu
              </Text>
              <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }, livelyBarTrack(colors)]}>
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
              {isIelts && lr ? (
                <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                  🎧 Listening {lr.listening.answered}/{lr.listening.total} câu · 📖 Reading {lr.reading.answered}/
                  {lr.reading.total} câu
                </Text>
              ) : null}
              {isIelts ? (
                <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                  ⏱️ Thi thử {fullMinutes} phút · Luyện tập không bấm giờ
                </Text>
              ) : null}
              {ts.missing.length > 0 ? (
                <View style={[styles.warnBox, { backgroundColor: colors.amberBg }]}>
                  <Text style={[styles.line, { color: colors.amber, fontSize: scaled(14) }]}>
                    ⚠ Đề chưa đủ câu chuẩn: {ts.missing.map((m) => `${partLabel(m.part, ex)} thiếu ${m.missing} câu`).join(', ')}. Bạn vẫn có
                    thể luyện các câu hiện có.
                  </Text>
                </View>
              ) : null}
              <Pressable
                style={[styles.button, { backgroundColor: colors.accent }, !ts.totalQuestions && styles.disabled, raisedButton(colors)]}
                disabled={!ts.totalQuestions}
                onPress={goMock}
              >
                <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
                  🏆 Thi thử cả đề ({ts.totalQuestions} câu · {fullMinutes} phút)
                </Text>
              </Pressable>
            </Animated.View>
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
      {heroRect && !flightDone ? (
        <HeroFlight
          from={{ x: heroRect.x, y: heroRect.y, w: heroRect.w, h: heroRect.h }}
          to={targetRect}
          title={heroRect.title || ts?.title || ''}
          surface={colors.surface}
          border={colors.border}
          text={colors.text}
          onDone={() => {
            setFlightDone(true);
            // Reanimated shared value vốn mutable theo thiết kế (.value
            // là API chuẩn để chạy animation); rule react-hooks/immutability
            // không mô hình hoá được shared value có giá trị khởi tạo phụ
            // thuộc route param nên báo false positive ở đây — các file
            // TabScreen/BottomNav cũng gán .value theo cùng pattern.
            // eslint-disable-next-line react-hooks/immutability
            cardOpacity.value = withTiming(1, { duration: 180 });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Hàng tiêu đề: nút quay lại + tiêu đề cùng 1 hàng (không để nút lẻ 1 hàng gây thừa khoảng trắng).
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingVertical: SPACING.md, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, paddingVertical: SPACING.xl },
  wrap: { gap: SPACING.sm, paddingTop: SPACING.sm },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  line: { flexWrap: 'wrap' },
  card: { borderWidth: 1, borderRadius: RADIUS.card, padding: CARD_PADDING, gap: SPACING.xs, width: '100%' },
  partCard: { flexGrow: 1, flexBasis: '45%', maxWidth: '48%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  pill: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2, overflow: 'hidden', alignSelf: 'flex-start' },
  warnBox: { borderRadius: RADIUS.button, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  barFill: { height: '100%', borderRadius: 4 },
  button: { borderRadius: RADIUS.button, paddingVertical: SPACING.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.6 },
  sectionTitle: { fontWeight: '700', flexWrap: 'wrap' },
});
