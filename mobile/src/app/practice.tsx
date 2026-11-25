// Luyện tập — port của frontend/src/pages/Practice.tsx.
// 2 tab: luyện theo Bộ đề / luyện theo Part (Section/Passage với IELTS).
import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { router } from 'expo-router';
import {
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
import { CARD_PADDING, columnsForWidth, horizontalPadding, LIST_DEFAULTS, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { livelyBarTrack, livelyCard, livelyChip, raisedButton, useTextSize, useTheme } from '../theme';
import { BottomNav } from '../components/BottomNav';
import { TabScreen } from '../components/TabScreen';
import { BackButton } from '../components/BackButton';
import { LoadingLine } from '../components/LoadingLine';
import { partLabel, partNameFor } from '../lib';
import { partName } from '../components/QuestionView';

export default function PracticeScreen() {
  const { exam } = useExam();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  // Lưới thẻ đề: màn hẹp 1 cột, màn rộng (≥600dp) 2 cột.
  const columns = columnsForWidth(width);
  const [tab, setTab] = useState<'sets' | 'parts'>('sets');

  // Chưa chọn kỳ thi thì không vào được — về màn chọn, nhớ đích đến.
  useEffect(() => {
    if (!exam) router.replace({ pathname: '/', params: { next: '/practice' } });
  }, [exam]);
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  // TOEIC: API tra de theo ID nhung ID khong khop so de (TS-006 la Test 05,
  // TS-007 la Test 04; ETS 2025 con lon hon) nen sap xep theo ten o day.
  // IELTS giu nguyen thu tu API (trong moi sach, Test 1-4 dung thu tu theo ID).
  const sortedSets = useMemo(
    () => (isIelts ? testSets : [...testSets].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))),
    [testSets, isIelts],
  );
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

  // Ref tới thẻ đề trong FlatList — để đo vị trí cho HeroFlight.
  const cardRefs = useRef(new Map<string, ElementRef<typeof View>>());

  const openSet = useCallback((id: string, title?: string) => {
    // Đo vị trí thẻ đã bấm để màn chi tiết "bay" thẻ từ đúng chỗ đó
    // (HeroFlight) — đo lỗi thì mở thường, không chặn.
    const node = cardRefs.current.get(id);
    if (node) {
      node.measure((x, y, w, h, pageX, pageY) => {
        if (w > 0 && h > 0) {
          router.push({
            pathname: '/test-set/[id]',
            params: { id, hero: JSON.stringify({ x: pageX, y: pageY, w, h, t: Date.now(), title: title ?? '' }) },
          });
        } else {
          router.push({ pathname: '/test-set/[id]', params: { id } });
        }
      });
    } else {
      router.push({ pathname: '/test-set/[id]', params: { id } });
    }
  }, []);
  const openSetPicker = useCallback((p: number) => {
    router.push({ pathname: '/part-sets', params: { part: String(p), exam: ex } });
  }, [ex]);

  const renderSet = useCallback(
    ({ item: ts }: { item: TestSet }) => {
      const total = ts.totalQuestions || 0;
      const answered = ts.progress?.answeredTotal || 0;
      // Mau so tien do la so ROW (progress.total); total la so cau tren de
      // that (IELTS: 80) — dung total lam mau so thi % khong bao gio dat 100%.
      const rowTotal = ts.progress?.total ?? total;
      const pct = rowTotal ? Math.round((answered / rowTotal) * 100) : 0;
      return (
        <Pressable
          ref={(v) => {
            if (v) cardRefs.current.set(ts.id, v);
            else cardRefs.current.delete(ts.id);
          }}
          style={[
            styles.card,
            columns === 2 && styles.cardWide,
            { backgroundColor: colors.surface, borderColor: colors.border },
            livelyCard(colors, 'compact'),
          ]}
          onPress={() => openSet(ts.id, ts.title)}
        >
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(16) }]}>{ts.title}</Text>
            {!ts.isPublished ? (
              <Text style={[styles.pill, { color: colors.muted, fontSize: scaled(12), borderColor: colors.border }]}>NHÁP</Text>
            ) : null}
          </View>
          <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
            <Text style={{ fontWeight: '700' }}>{total}</Text> câu
            {ts.parts.length ? null : (
              <Text style={{ color: colors.muted, fontSize: scaled(14) }}> • Chưa có câu hỏi</Text>
            )}
          </Text>
          {ts.missing.length > 0 ? (
            <View style={[styles.warnBox, { backgroundColor: colors.amberBg }]}>
              <Text style={[styles.line, { color: colors.amber, fontSize: scaled(14) }]}>
                ⚠ Chưa đủ câu: {ts.missing.map((m) => `${partLabel(m.part, ex)} thiếu ${m.missing} câu`).join(', ')}
              </Text>
            </View>
          ) : null}
          {ts.progress ? (
            <View style={styles.progressWrap}>
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(14) }]}>
                Đã làm {answered}/{rowTotal} câu ({pct}%)
              </Text>
              <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }, livelyBarTrack(colors)]}>
                <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.success }]} />
              </View>
            </View>
          ) : (
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>Chưa làm câu nào trong đề này</Text>
          )}
          <View style={[styles.button, { backgroundColor: colors.accent }, raisedButton(colors)]}>
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(14) }]}>
              {answered > 0 ? '▶ Làm tiếp' : '👁 Xem đề'}
            </Text>
          </View>
        </Pressable>
      );
    },
    [colors, scaled, ex, openSet, columns],
  );

  const renderPartCard = useCallback(
    (p: PartInfo) => {
      const a = acc(p.part);
      const selected = part === p.part;
      // Backend đã trả accuracy theo % (1/7 = 14.3) nên KHÔNG nhân 100
      // nữa — tính lại từ correct/answered, làm tròn 1 lần, kẹp 0–100.
      const pct = a && a.answered > 0 ? Math.max(0, Math.min(100, Math.round((a.correct / a.answered) * 100))) : 0;
      // Thẻ là View (không phải Pressable) để nút "Luyện" nằm NGOÀI
      // vùng bấm chọn thẻ — bấm nút không kích hoạt onPress của thẻ.
      return (
        <View
          key={p.part}
          style={[
            styles.card,
            styles.partCard,
            { backgroundColor: colors.surface, borderColor: selected ? colors.accent : colors.border },
            livelyCard(colors, 'card', selected ? colors.accentDark : undefined),
          ]}
        >
          <Pressable onPress={() => setPart(p.part)} accessibilityRole="button">
            {/* Tên Part 16 trong thẻ nửa màn (~165dp) vỡ thành 2–3 dòng nên giảm còn 15 + tăng lineHeight. */}
            <Text style={[styles.line, { color: colors.text, fontSize: scaled(15), fontWeight: '700', lineHeight: scaled(21) }]}>
              {p.part <= 4 ? '🎧' : '📖'} {isIelts ? partNameFor(p.part, ex) : partName(p.part)}
              <Text style={{ color: colors.muted, fontSize: scaled(13), fontWeight: '400' }}>
                {p.count ? ` · ${p.count} câu` : ' · Chưa rõ số câu'}
              </Text>
            </Text>
            {a ? (
              <>
                <Text style={[styles.line, { color: colors.text, fontSize: scaled(14) }]}>
                  Tỉ lệ đúng: {pct}% ({a.correct}/{a.answered} câu)
                </Text>
                <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }, livelyBarTrack(colors)]}>
                  <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
                </View>
              </>
            ) : null}
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent }, raisedButton(colors)]}
            onPress={() => openSetPicker(p.part)}
            accessibilityRole="button"
            accessibilityLabel={`Luyện ${isIelts ? partNameFor(p.part, ex) : partName(p.part)}`}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(14) }]}>▶ Luyện</Text>
          </Pressable>
        </View>
      );
    },
    [acc, colors, ex, isIelts, openSetPicker, part, scaled],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <TabScreen href="/practice">
      <View style={[styles.container, { paddingHorizontal: pad }]}>
        <View style={styles.header}>
          <BackButton />
          <Text style={[styles.title, { color: colors.text, fontSize: scaled(22) }]}>Luyện tập</Text>
        </View>
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, { borderColor: colors.border }, tab === 'sets' && { backgroundColor: colors.accent }, livelyChip(colors)]}
            onPress={() => setTab('sets')}
          >
            <Text style={{ color: tab === 'sets' ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '700', textAlign: 'center' }}>
              📚 Luyện theo Bộ đề
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, { borderColor: colors.border }, tab === 'parts' && { backgroundColor: colors.accent }, livelyChip(colors)]}
            onPress={() => setTab('parts')}
          >
            <Text style={{ color: tab === 'parts' ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '700', textAlign: 'center' }}>
              {isIelts ? '🎧 Luyện theo Section/Passage' : '🎧 Luyện theo Part'}
            </Text>
          </Pressable>
        </View>

        {tab === 'sets' ? (
          setsLoading ? (
            <LoadingLine location="page" text="Đang tải danh sách bộ đề…" />
          ) : setsError ? (
            <Text style={{ color: colors.danger, fontSize: scaled(15) }}>{setsError}</Text>
          ) : testSets.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'card')]}>
              <Text style={{ color: colors.text, fontSize: scaled(15) }}>Chưa có bộ đề nào.</Text>
            </View>
          ) : (
            <FlatList
              data={sortedSets}
              key={`sets-${columns}`}
              keyExtractor={(ts) => ts.id}
              renderItem={renderSet}
              numColumns={columns}
              columnWrapperStyle={columns === 2 ? styles.setsRow : undefined}
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
                  Chọn {isIelts ? 'Section/Passage' : 'Part'} rồi chọn đề để luyện — mỗi buổi là 1 {isIelts ? 'Section/Passage' : 'Part'} của 1 đề.
                </Text>
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: scaled(18) }]}>
                  🎧 Listening — {isIelts ? 'Section 1–4' : 'Part 1–4'}
                </Text>
                <View style={styles.partsGrid}>{partList.filter((p) => p.part <= 4).map(renderPartCard)}</View>
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: scaled(18) }]}>
                  📖 Reading — {isIelts ? 'Passage 1–3' : 'Part 5–7'}
                </Text>
                <View style={styles.partsGrid}>{partList.filter((p) => p.part > 4).map(renderPartCard)}</View>
              </View>
            )}
            contentContainerStyle={styles.list}
            {...LIST_DEFAULTS}
          />
        )}
      </View>
      </TabScreen>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingTop: SPACING.md, gap: SPACING.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap' },
  title: { fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  // 2 tab chia đều nửa màn — trước đây flexGrow theo nội dung nên tab dài lấn tab ngắn.
  tab: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: SPACING.sm, paddingBottom: SPACING.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  card: { borderWidth: 1, borderRadius: RADIUS.card, padding: CARD_PADDING, gap: SPACING.xs, width: '100%' },
  /** Thẻ đề ở lưới 2 cột (màn ≥600dp): chia đều hàng, bỏ width 100%. */
  cardWide: { flex: 1, width: 'auto' },
  setsRow: { gap: SPACING.sm },
  warnBox: { borderRadius: RADIUS.button, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  partCard: { flexGrow: 1, flexBasis: '45%', maxWidth: '48%' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm, alignItems: 'flex-start' },
  cardTitle: { fontWeight: '700', flexShrink: 1, flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2, overflow: 'hidden', alignSelf: 'flex-start' },
  line: { flexWrap: 'wrap' },
  progressWrap: { gap: 4 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  barFill: { height: '100%', borderRadius: 4 },
  button: { borderRadius: RADIUS.button, paddingVertical: SPACING.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  partsWrap: { gap: SPACING.sm },
  partsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  sectionTitle: { fontWeight: '700', flexWrap: 'wrap' },
});
