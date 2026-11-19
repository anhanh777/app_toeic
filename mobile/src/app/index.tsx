// Màn hình chính Phase 0: chọn kỳ thi (2 thẻ lớn TOEIC / IELTS Academic)
// rồi màn Home placeholder hiển thị kỳ thi đã chọn + nút đăng xuất.
// Layout flex thuần: màn hẹp xếp dọc, màn rộng (≥600dp) xếp ngang 2 cột.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { api, targetScoreOf, type ExamInfo, type StatsOverview } from '../api';
import { useAuth } from '../auth';
import { useExam, type ExamId } from '../exam';
import { bandLevel, partNameFor, questionTypeName } from '../lib';
import {
  BREAKPOINTS,
  horizontalPadding,
  MAX_CONTENT_WIDTH,
  RADIUS,
  SPACING,
} from '../layout';
import { useTextSize, useTheme } from '../theme';
import { useMenuIcons, type MenuIconKey } from '../menuIcons';
import { BottomNav } from '../components/BottomNav';
import { TabScreen } from '../components/TabScreen';
import { TierBadge, XpBar } from '../components/TierBadge';

const FALLBACK_EXAMS: ExamInfo[] = [
  { id: 'toeic', title: 'TOEIC', subtitle: 'Listening + Reading', scale: '10–990', testSetCount: 25, questionCount: 5000 },
  { id: 'ielts', title: 'IELTS Academic', subtitle: 'Listening + Reading', scale: 'Band 0–9', testSetCount: 12, questionCount: 960 },
];

const EXAM_META: Record<ExamId, { detail: string }> = {
  toeic: { detail: 'Listening + Reading, 7 Part' },
  ielts: { detail: 'Listening 4 Section + Reading 3 Passage' },
};

// Menu trang chính — mục IELTS chỉ hiện khi đang chọn kỳ thi IELTS
// (giống bản web: mục riêng của IELTS bị ẩn ở chế độ TOEIC).
// Icon lấy từ MenuIconsProvider (admin chỉnh được, GET /api/menu-icons);
// key -> emoji trong MENU_ICON_DEFAULTS khi fetch chưa về / lỗi.
const MENU_COMMON: { icon: MenuIconKey; label: string; href: string }[] = [
  { icon: 'today', label: 'Hôm nay', href: '/today' },
  { icon: 'practice', label: 'Luyện tập', href: '/practice' },
  { icon: 'mock', label: 'Thi thử', href: '/mock' },
  { icon: 'wrong', label: 'Ôn câu sai', href: '/wrong' },
  { icon: 'vocabulary', label: 'Từ vựng', href: '/vocabulary' },
  { icon: 'leaderboard', label: 'Xếp hạng', href: '/leaderboard' },
  { icon: 'settings', label: 'Hồ sơ & Cài đặt', href: '/settings' },
];
const MENU_IELTS: { icon: MenuIconKey; label: string; href: string }[] = [
  { icon: 'diagnostic', label: 'Chẩn đoán IELTS', href: '/diagnostic' },
  { icon: 'errors', label: 'Sổ lỗi & Quái vật', href: '/errors' },
  { icon: 'writing', label: 'Viết (Writing)', href: '/writing' },
  { icon: 'speaking', label: 'Nói (Speaking)', href: '/speaking' },
  { icon: 'ielts-setup', label: 'Thiết lập IELTS', href: '/ielts-setup' },
];

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { exam, setExam, clearExam } = useExam();
  const { colors, theme, toggleTheme } = useTheme();
  const { scaled } = useTextSize();
  const { icons } = useMenuIcons();
  const { width } = useWindowDimensions();
  const [exams, setExams] = useState<ExamInfo[] | null>(null);
  const [loadingExams, setLoadingExams] = useState(true);
  // Thống kê tổng quan cho khối stat-card (port Home.tsx:37-51).
  const [stats, setStats] = useState<StatsOverview | null>(null);

  // Đích đến đang chờ: bấm tab cần kỳ thi khi chưa chọn → về đây chọn,
  // chọn xong tự mở đúng tab đó. Chỉ nhận 3 tab cần kỳ thi.
  const { next } = useLocalSearchParams<{ next?: string }>();
  const nextRoute =
    next === '/today' || next === '/practice' || next === '/mock' ? next : undefined;
  const nextLabel = nextRoute === '/today' ? 'Hôm nay' : nextRoute === '/practice' ? 'Luyện tập' : 'Thi thử';

  useEffect(() => {
    if (exam) return;
    api
      .exams()
      .then(setExams)
      .catch(() => {
        /* dùng số fallback */
      })
      .finally(() => setLoadingExams(false));
  }, [exam]);

  useEffect(() => {
    if (!exam) return;
    api
      .statsOverview(exam)
      .then(setStats)
      .catch(() => {
        /* không có thống kê thì ẩn khối stat, vẫn hiện menu */
      });
  }, [exam]);

  const pick = useCallback(
    (id: string) => {
      if (id !== 'toeic' && id !== 'ielts') return;
      setExam(id);
      if (nextRoute) router.replace(nextRoute as never);
    },
    [setExam, nextRoute],
  );

  const pad = horizontalPadding(width);
  const wide = width >= BREAKPOINTS.wide;
  const list = exams?.length ? exams : FALLBACK_EXAMS;
  const chosen = exam ? list.find((e) => e.id === exam) : null;

  // Khối stat-card (chuẩn web Home.tsx:37-51).
  const isIelts = exam === 'ielts';
  const target = targetScoreOf(user);
  const best = stats?.recentScores?.length
    ? Math.max(...stats.recentScores.map((s) => s.totalScore))
    : null;
  const bestBand = stats?.bandHistory?.length
    ? Math.max(...stats.bandHistory.map((b) => b.overallBand))
    : null;
  const latestBand = stats?.bandHistory?.length
    ? stats.bandHistory[stats.bandHistory.length - 1]
    : null;
  const hearts = '❤️'.repeat(Math.min(7, Math.max(0, stats?.streakDays ?? 0))) || '♡';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <TabScreen href="/">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}>
        <View style={styles.header}>
          <Text style={[styles.hello, { color: colors.text, fontSize: scaled(20) }]}>
            Xin chào, {user?.name || user?.email || 'bạn'} 👋
          </Text>
          <Pressable onPress={toggleTheme} style={[styles.chip, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontSize: scaled(14) }}>
              {theme === 'dark' ? '☀️ Sáng' : '🌙 Tối'}
            </Text>
          </Pressable>
        </View>

        {!exam ? (
          <View style={styles.pickerWrap}>
            <Text style={[styles.title, { color: colors.text, fontSize: scaled(24) }]}>
              Chọn kỳ thi
            </Text>
            <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
              Chọn kỳ thi bạn muốn luyện — lần sau mở app sẽ vào thẳng kỳ thi này.
              Đổi được bất cứ lúc nào bằng nút “Đổi bài thi”.
            </Text>
            {nextRoute ? (
              <Text style={[styles.hint, { color: colors.accent, fontSize: scaled(15) }]}>
                Chọn kỳ thi trước để vào {nextLabel} nhé.
              </Text>
            ) : null}
            {loadingExams ? <ActivityIndicator color={colors.accent} /> : null}
            <View style={[styles.cards, wide && styles.cardsRow]}>
              {list.map((e) => (
                <Pressable
                  key={e.id}
                  style={[
                    styles.card,
                    wide && styles.cardHalf,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => pick(e.id)}
                >
                  <Text style={[styles.emoji, { fontSize: scaled(28) }]}>
                    {e.id === 'ielts' ? icons['exam-ielts'] : icons['exam-toeic']}
                  </Text>
                  <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(20) }]}>
                    {e.title}
                  </Text>
                  <Text style={[styles.cardText, { color: colors.muted, fontSize: scaled(14) }]}>
                    {EXAM_META[e.id as ExamId]?.detail ?? e.subtitle}
                  </Text>
                  <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
                    {e.testSetCount} đề • {e.questionCount} câu • Thang điểm: {e.scale}
                  </Text>
                  <View style={[styles.pickButton, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.pickButtonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
                      Chọn {e.title}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(280)} style={styles.homeWrap}>
            <Animated.View
              entering={ZoomIn.duration(320)}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.emoji, { fontSize: scaled(28) }]}>
                {exam === 'ielts' ? icons['exam-ielts'] : icons['exam-toeic']}
              </Text>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(20) }]}>
                {chosen?.title ?? exam.toUpperCase()}
              </Text>
              <Text style={[styles.cardText, { color: colors.muted, fontSize: scaled(15) }]}>
                {chosen?.subtitle ?? ''} • {chosen?.testSetCount ?? '—'} đề • {chosen?.questionCount ?? '—'} câu • Thang điểm: {chosen?.scale ?? ''}
              </Text>
            </Animated.View>

            {/* 3 stat-card phía trên hub menu (chuẩn web Home.tsx:37-51). */}
            {stats ? (
              <View style={styles.stats}>
                <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.statIco, { fontSize: scaled(20) }]}>🎯</Text>
                  <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>
                    {isIelts ? 'Band tổng cao nhất' : 'Mục tiêu điểm'}
                  </Text>
                  <Text style={[styles.statBig, { color: colors.text, fontSize: scaled(20) }]}>
                    {isIelts ? (bestBand != null ? `Band ${bestBand}` : '—') : target}
                  </Text>
                  {isIelts ? (
                    <>
                      <Text style={[styles.statFoot, { color: colors.muted, fontSize: scaled(13) }]}>
                        {bestBand != null
                          ? `Mức: ${bandLevel(bestBand)} (band ước lượng)`
                          : 'Chưa có bài thi thử nào.'}
                      </Text>
                      {latestBand ? (
                        <Text style={[styles.statFoot, { color: colors.muted, fontSize: scaled(13) }]}>
                          Gần nhất: Listening {latestBand.listeningBand} • Reading {latestBand.readingBand} (band ước lượng)
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Text style={[styles.statFoot, { color: colors.muted, fontSize: scaled(13) }]}>
                        {best != null
                          ? `Điểm thi thử cao nhất: ${best} (điểm ước lượng)`
                          : 'Chưa có bài thi thử nào.'}
                      </Text>
                      {best != null ? <TierBadge total={best} /> : null}
                    </>
                  )}
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.statIco, { fontSize: scaled(20) }]}>📊</Text>
                  <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>
                    {isIelts ? 'Section/Passage yếu nhất' : 'Part yếu nhất'}
                  </Text>
                  <Text style={[styles.statBig, { color: colors.text, fontSize: scaled(18) }]}>
                    {stats.weakestPart != null ? partNameFor(stats.weakestPart, exam) : '—'}
                  </Text>
                  <Text style={[styles.statFoot, { color: colors.muted, fontSize: scaled(13) }]}>
                    Tỉ lệ đúng chung: {`${Math.round(stats.accuracy * 100)}%`}
                  </Text>
                  {isIelts && stats.weakestType ? (
                    <Text style={[styles.statFoot, { color: colors.muted, fontSize: scaled(13) }]}>
                      Dạng yếu nhất: {questionTypeName(stats.weakestType)}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.statIco, { fontSize: scaled(20) }]}>🔥</Text>
                  <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>Streak</Text>
                  <Text style={[styles.statBig, { color: colors.text, fontSize: scaled(20) }]}>
                    {stats.streakDays ?? 0} ngày
                  </Text>
                  <Text style={[styles.statFoot, { color: colors.muted, fontSize: scaled(13) }]}>{hearts}</Text>
                  <Text style={[styles.statFoot, { color: colors.muted, fontSize: scaled(13) }]}>
                    Tổng XP: {stats.totalXp ?? 0}
                  </Text>
                  <XpBar xp={stats.totalXp ?? 0} />
                </View>
              </View>
            ) : null}

            <View style={styles.menu}>
              {[...MENU_COMMON, ...(exam === 'ielts' ? MENU_IELTS : [])].map((m) => (
                <Pressable
                  key={m.href}
                  style={[
                    styles.menuItem,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => router.push(m.href as never)}
                >
                  <Text style={[styles.menuEmoji, { fontSize: scaled(24) }]}>{icons[m.icon]}</Text>
                  <Text style={[styles.menuLabel, { color: colors.text, fontSize: scaled(15) }]}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.menu}>
              <Pressable
                style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={clearExam}
              >
                <Text style={[styles.menuEmoji, { fontSize: scaled(24) }]}>{icons['switch-exam']}</Text>
                <Text style={[styles.menuLabel, { color: colors.text, fontSize: scaled(15) }]}>
                  Đổi bài thi
                </Text>
              </Pressable>
              <Pressable
                style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={logout}
              >
                <Text style={[styles.menuEmoji, { fontSize: scaled(24) }]}>🚪</Text>
                <Text style={[styles.menuLabel, { color: colors.text, fontSize: scaled(15) }]}>
                  Đăng xuất
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </ScrollView>
      </TabScreen>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingVertical: SPACING.md,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
  },
  hello: { fontWeight: '700', flexShrink: 1, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  pickerWrap: { gap: SPACING.md, width: '100%' },
  title: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  sub: { textAlign: 'center', flexWrap: 'wrap' },
  hint: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  cards: { gap: SPACING.md, width: '100%' },
  cardsRow: { flexDirection: 'row', alignItems: 'stretch' },
  card: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACING.md,
    gap: SPACING.xs,
    alignItems: 'center',
    width: '100%',
  },
  cardHalf: { flex: 1 },
  emoji: { textAlign: 'center' },
  cardTitle: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  cardText: { textAlign: 'center', flexWrap: 'wrap' },
  pickButton: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  pickButtonText: { fontWeight: '700' },
  homeWrap: { gap: SPACING.sm, width: '100%' },
  // 3 stat-card phía trên hub menu — xếp dọc 1 cột trên mobile hẹp.
  stats: { gap: SPACING.sm, width: '100%' },
  statCard: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACING.md,
    gap: 2,
    width: '100%',
  },
  statIco: {},
  statLabel: {},
  statBig: { fontWeight: '700', flexWrap: 'wrap' },
  statFoot: { flexWrap: 'wrap' },
  // Menu chính: lưới 2 cột ô vuông (icon trên, nhãn dưới) — luôn 2 cột
  // kể cả màn hẹp, không còn danh sách dọc 1 cột.
  menu: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  menuItem: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    width: '48%',
    flexGrow: 1,
    minHeight: 72,
  },
  menuEmoji: { textAlign: 'center' },
  menuLabel: { fontWeight: '600', textAlign: 'center', flexWrap: 'wrap' },
  note: { textAlign: 'center', flexWrap: 'wrap', marginTop: SPACING.sm },
});
