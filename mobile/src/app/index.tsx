// Màn hình chính Phase 0: chọn kỳ thi (2 thẻ lớn TOEIC / IELTS Academic)
// rồi màn Home — Trang chủ + Hôm nay gộp thành 1 trang duy nhất
// (trước đây Hôm nay là màn riêng /today, giờ redirect về đây).
// Layout flex thuần: màn hẹp xếp dọc, màn rộng (≥600dp) xếp ngang 2 cột.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState, type ElementRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { ApiError, api, targetScoreOf, type BadDayTask, type ExamInfo, type StatsOverview, type TodayData } from '../api';
import { useAuth } from '../auth';
import { useExam, type ExamId } from '../exam';
import { bandLevel, partLabel, partNameFor, questionTypeName } from '../lib';
import {
  BREAKPOINTS,
  CARD_PADDING,
  horizontalPadding,
  MAX_CONTENT_WIDTH,
  RADIUS,
  SPACING,
} from '../layout';
import { livelyCard, livelyChip, raisedButton, useTextSize, useTheme } from '../theme';
import { useMenuIcons, type MenuIconKey } from '../menuIcons';
import { useUiSettings } from '../uiSettings';
import { BottomNav } from '../components/BottomNav';
import { TabScreen } from '../components/TabScreen';
import { TierBadge, XpBar } from '../components/TierBadge';
import { BandCompassBlock, IeltsActiveBlock, IeltsDrillBlock, IeltsReviewBlock } from '../components/TodayBlocks';
import { CheckinSection } from '../components/CheckinSection';
import { LoadingLine } from '../components/LoadingLine';

const FALLBACK_EXAMS: ExamInfo[] = [
  { id: 'toeic', title: 'TOEIC', subtitle: 'Listening + Reading', scale: '10–990', testSetCount: 28, questionCount: 5600 },
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

// Nhãn nhiệm vụ hằng ngày theo id block của GET /api/today (không có
// title trong API nên map cố định theo id — khớp khối Hôm nay đã gộp).
const TODAY_TASK_LABEL: Record<string, string> = {
  review: 'Ôn câu sai đến hạn',
  drill: 'Luyện dạng yếu nhất',
  active: 'Luyện chủ động',
};

const TOPICS = ['du lịch', 'công nghệ', 'y học', 'môi trường'];

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { exam, setExam, clearExam } = useExam();
  const { colors, theme, toggleTheme, isLively } = useTheme();
  const { scaled } = useTextSize();
  const { icons } = useMenuIcons();
  const { width } = useWindowDimensions();
  const [exams, setExams] = useState<ExamInfo[] | null>(null);
  const [loadingExams, setLoadingExams] = useState(true);
  // Thống kê tổng quan cho khối stat-card (port Home.tsx:37-51).
  const [stats, setStats] = useState<StatsOverview | null>(null);
  // Kế hoạch hôm nay (thật, GET /api/today) + số khối đã xong
  // (cùng key AsyncStorage `today_done_<date>` màn Hôm nay cũ ghi).
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [todayDone, setTodayDone] = useState<string[]>([]);
  const [todayError, setTodayError] = useState('');
  const [todayLoading, setTodayLoading] = useState(false);
  const [badDay, setBadDay] = useState<BadDayTask | null>(null);
  const [badDayBusy, setBadDayBusy] = useState(false);
  const [badDayDone, setBadDayDone] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  // "▶ Bắt đầu hôm nay": cuộn tới khối 1 (ôn lỗi đến hạn).
  const scrollRef = useRef<ElementRef<typeof ScrollView>>(null);
  const reviewY = useRef(0);

  // Đích đến đang chờ: bấm tab cần kỳ thi khi chưa chọn → về đây chọn,
  // chọn xong tự mở đúng tab đó. Chỉ nhận 2 tab cần kỳ thi.
  const { next } = useLocalSearchParams<{ next?: string }>();
  const nextRoute =
    next === '/practice' || next === '/mock' ? next : undefined;
  const nextLabel = nextRoute === '/practice' ? 'Luyện tập' : 'Thi thử';

  const { refresh: refreshSettings } = useUiSettings();
  // Số đề/câu lấy ĐỘNG từ GET /api/exams (28 đề / 5600 câu) — trước đây
  // effect chỉ chạy khi chưa chọn kỳ thi (`if (exam) return`) nên app mở
  // lên với kỳ thi đã lưu thì không bao giờ tải, rớt về fallback hardcode
  // cũ "25 đề • 5000 câu". Giờ tải luôn, bất kể đã chọn kỳ thi hay chưa.
  const loadExams = useCallback(() => {
    api
      .exams()
      .then(setExams)
      .catch(() => {
        /* dùng số fallback */
      })
      .finally(() => setLoadingExams(false));
  }, []);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // Về Trang chủ là tải lại cài đặt giao diện + số đề/câu: gạt nút phong
  // cách ở admin hay thêm đề mới đều hiện ngay — trước đây settings chỉ
  // fetch 1 lần lúc mở app nên gạt sang Sống động xong mà app đang mở
  // thì Trang chủ vẫn Pastel (không mascot, không nhiệm vụ) cho tới khi
  // mở lại app.
  useFocusEffect(
    useCallback(() => {
      refreshSettings();
      loadExams();
    }, [refreshSettings, loadExams]),
  );

  // Điểm danh xong thì streak/XP trên thẻ tổng quan phải cập nhật ngay.
  const loadStats = useCallback(() => {
    if (!exam) return;
    api
      .statsOverview(exam)
      .then(setStats)
      .catch(() => {
        /* không có thống kê thì ẩn khối stat, vẫn hiện menu */
      });
  }, [exam]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Kế hoạch hôm nay: tải khi đã chọn kỳ thi, ở CẢ 2 kiểu giao diện
  // (không chỉ lively) — cả 2 kiểu đều cần 3 khối + trạng thái xong.
  // Không tải được thì chỉ ẩn các khối Hôm nay, vẫn hiện streak/XP.
  useEffect(() => {
    if (!exam) return;
    const ex = exam;
    // Fetch trong async IIFE (không setState đồng bộ trong thân effect).
    void (async () => {
      setTodayLoading(true);
      setTodayError('');
      try {
        const d = await api
          .today(ex)
          .catch(() => (ex === 'ielts' ? api.ieltsToday() : Promise.reject(new Error('Không tải được dữ liệu hôm nay.'))));
        setTodayData(d);
        AsyncStorage.getItem(`today_done_${d.date}`)
          .then((v) => {
            try {
              setTodayDone(v ? (JSON.parse(v) as string[]) : []);
            } catch {
              setTodayDone([]);
            }
          })
          .catch(() => undefined);
      } catch (e) {
        setTodayError(e instanceof ApiError ? e.message : 'Không tải được kế hoạch hôm nay.');
      } finally {
        setTodayLoading(false);
      }
    })();
    AsyncStorage.getItem('ielts_topics')
      .then((v) => {
        try {
          setTopics(v ? (JSON.parse(v) as string[]) : []);
        } catch {
          setTopics([]);
        }
      })
      .catch(() => undefined);
  }, [exam]);

  const markDone = useCallback(
    async (blockId: string, minutes: number) => {
      if (!todayData || !exam) return;
      setTodayDone((prev) => {
        const next = prev.includes(blockId) ? prev : [...prev, blockId];
        AsyncStorage.setItem(`today_done_${todayData.date}`, JSON.stringify(next)).catch(() => undefined);
        return next;
      });
      try {
        await api.completeTodayBlock(blockId, minutes, exam);
      } catch {
        /* bản local đã ghi, không chặn */
      }
    },
    [todayData, exam],
  );

  const callBadDay = useCallback(async () => {
    if (!exam) return;
    setBadDayBusy(true);
    setTodayError('');
    try {
      setBadDay(await api.todayBadDay(exam));
    } catch (e) {
      setTodayError(e instanceof ApiError ? e.message : 'Không lấy được bài ngày nhẹ.');
    } finally {
      setBadDayBusy(false);
    }
  }, [exam]);

  const toggleTopic = useCallback((t: string) => {
    setTopics((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      AsyncStorage.setItem('ielts_topics', JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

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

  // Các khối của GET /api/today.
  const review = todayData?.blocks.find((b) => b.id === 'review');
  const drill = todayData?.blocks.find((b) => b.id === 'drill');
  const vocabBlock = todayData?.blocks.find((b) => b.id === 'vocab');
  const quitReason = todayData?.profile?.quitReason;

  const scrollToReview = () => {
    scrollRef.current?.scrollTo({ y: reviewY.current, animated: true });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <TabScreen href="/">
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}>
        <View style={styles.header}>
          <Text style={[styles.hello, { color: colors.text, fontSize: scaled(20) }]}>
            Xin chào, {user?.name || user?.email || 'bạn'} 👋
          </Text>
          <Pressable onPress={toggleTheme} style={[styles.chip, { borderColor: colors.border }, livelyChip(colors)]}>
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
            {loadingExams ? <LoadingLine location="table" text="Đang tải kỳ thi…" /> : null}
            <View style={[styles.cards, wide && styles.cardsRow]}>
              {list.map((e) => (
                <Pressable
                  key={e.id}
                  style={[
                    styles.card,
                    wide && styles.cardHalf,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    livelyCard(colors, 'hero'),
                  ]}
                  onPress={() => pick(e.id)}
                >
                  <Text style={[styles.emoji, { fontSize: scaled(isLively ? 36 : 28) }]}>
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
                  <View style={[styles.pickButton, { backgroundColor: colors.accent }, raisedButton(colors)]}>
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
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}
            >
              <Text style={[styles.emoji, { fontSize: scaled(isLively ? 36 : 28) }]}>
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
                <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'card')]}>
                  <View style={[styles.statIcoBox, { backgroundColor: colors.greenBg }]}>
                    <Text style={{ fontSize: scaled(isLively ? 30 : 26) }}>🎯</Text>
                  </View>
                  <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>
                    {isIelts ? 'Band tổng cao nhất' : 'Mục tiêu điểm'}
                  </Text>
                  <Text style={[styles.statBig, { color: colors.green, fontSize: scaled(22) }]}>
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
                <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'card')]}>
                  <View style={[styles.statIcoBox, { backgroundColor: colors.sky }]}>
                    <Text style={{ fontSize: scaled(isLively ? 30 : 26) }}>📊</Text>
                  </View>
                  <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>
                    {isIelts ? 'Section/Passage yếu nhất' : 'Part yếu nhất'}
                  </Text>
                  <Text style={[styles.statBig, { color: colors.duoBlue, fontSize: scaled(20) }]}>
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
                <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'card')]}>
                  <View style={[styles.statIcoBox, { backgroundColor: colors.amberBg }]}>
                    <Text style={{ fontSize: scaled(isLively ? 30 : 26) }}>🔥</Text>
                  </View>
                  <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>Streak</Text>
                  <Text style={[styles.statBig, { color: colors.streak, fontSize: scaled(22) }]}>
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

            {/* Hàng nút hành động nhanh 2x2: Luyện tiếp / Thi thử /
                Ôn câu sai / Từ vựng — 4 nút to ngay dưới thẻ thống kê
                (menu lưới bên dưới vẫn giữ). */}
            <View style={styles.quickRow}>
              <Pressable
                style={[styles.quickBtn, { backgroundColor: colors.accent }, raisedButton(colors)]}
                onPress={() => router.push('/practice')}
              >
                <Text style={[styles.quickBtnText, { color: colors.onAccent, fontSize: scaled(16) }]}>▶ Luyện tiếp</Text>
              </Pressable>
              <Pressable
                style={[styles.quickBtn, { backgroundColor: colors.gold }, raisedButton(colors, colors.goldInk)]}
                onPress={() => router.push('/mock')}
              >
                <Text style={[styles.quickBtnText, { color: colors.goldInk, fontSize: scaled(16) }]}>⏱ Thi thử</Text>
              </Pressable>
              <Pressable
                style={[styles.quickBtn, styles.quickBtnOutline, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push('/wrong')}
              >
                <Text style={[styles.quickBtnText, { color: colors.text, fontSize: scaled(16) }]}>❌ Ôn câu sai</Text>
              </Pressable>
              <Pressable
                style={[styles.quickBtn, styles.quickBtnOutline, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push('/vocabulary')}
              >
                <Text style={[styles.quickBtnText, { color: colors.text, fontSize: scaled(16) }]}>📚 Từ vựng</Text>
              </Pressable>
            </View>

            {/* Điểm danh hằng ngày (lịch + quà theo mốc + lịch sử) — chung
                cho cả 2 kỳ thi, hiện ở cả 2 kiểu giao diện. */}
            <CheckinSection onCheckedIn={loadStats} />

            {/* Sống động: hàng streak/XP + mascot + nhiệm vụ hằng ngày.
                Chỉ hiện khi lively. Số liệu thật: streak/XP từ statsOverview,
                nhiệm vụ từ GET /api/today, trạng thái xong từ AsyncStorage.
                Bấm thẻ nhiệm vụ thì cuộn tới khối 1 (không còn màn /today). */}
            {isLively ? (
              <View style={[styles.livelyHero, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
                <Image
                  source={require('../../assets/mascot.png')}
                  style={{ width: 96, height: 96 }}
                  contentFit="contain"
                />
                <View style={styles.livelyHeroText}>
                  <Text style={[styles.livelyHeroTitle, { color: colors.text, fontSize: scaled(18) }]}>
                    Học tiếp nào! 💪
                  </Text>
                  <View style={styles.livelyChips}>
                    <View style={[styles.livelyChip, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.livelyChipText, { color: colors.streak, fontSize: scaled(15) }]}>
                        🔥 {stats?.streakDays ?? todayData?.streak.current ?? 0} ngày
                      </Text>
                    </View>
                    <View style={[styles.livelyChip, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.livelyChipText, { color: colors.coin, fontSize: scaled(15) }]}>
                        🪙 {stats?.totalXp ?? 0} XP
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
            {isLively && todayData ? (
              <Pressable
                style={[styles.card, styles.livelyTasks, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}
                onPress={scrollToReview}
              >
                <Text style={[styles.livelyTasksTitle, { color: colors.text, fontSize: scaled(16) }]}>
                  🎯 Nhiệm vụ hôm nay · {todayDone.length}/{todayData.blocks.length} xong
                </Text>
                {todayData.blocks.map((b) => {
                  const done = todayDone.includes(b.id);
                  const count = b.dueCount ?? b.questionCount;
                  return (
                    <View key={b.id} style={styles.livelyTaskRow}>
                      <Text style={[styles.livelyTaskCheck, { color: done ? colors.success : colors.muted, fontSize: scaled(16) }]}>
                        {done ? '✅' : '⭕'}
                      </Text>
                      <Text style={[styles.livelyTaskLabel, { color: colors.text, fontSize: scaled(15) }]}>
                        {TODAY_TASK_LABEL[b.id] ?? b.id}
                        {count != null ? ` · ${count} câu` : ''}
                      </Text>
                    </View>
                  );
                })}
                <Text style={[styles.livelyTasksMore, { color: colors.accent, fontSize: scaled(14) }]}>
                  Bắt đầu hôm nay →
                </Text>
              </Pressable>
            ) : null}

            {/* ===== Khối Hôm nay (gộp từ màn /today cũ) ===== */}
            {todayLoading && !todayData ? <LoadingLine location="table" text="Đang tải kế hoạch hôm nay…" /> : null}
            {todayError ? (
              <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{todayError}</Text>
            ) : null}
            {todayData ? (
              <>
                {/* Hàng 2 thẻ: Đã xong hôm nay + Ngày mệt? (thẻ Streak
                    không vẽ lại ở đây vì đã có ở stat-card phía trên). */}
                <View style={styles.statRow}>
                  <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'card')]}>
                    <Text style={[styles.statEmoji, { fontSize: scaled(isLively ? 26 : 20) }]}>📅</Text>
                    <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>Đã xong hôm nay</Text>
                    <Text style={[styles.statBig, { color: colors.text, fontSize: scaled(16) }]}>{todayDone.length}/3 khối</Text>
                    <Text style={[styles.statNote, { color: colors.muted, fontSize: scaled(12) }]}>
                      {todayDone.length >= 3 ? '🎉 Xong hết rồi — nghỉ thôi!' : 'Cứ từ từ, từng khối một.'}
                    </Text>
                  </View>
                  <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'card')]}>
                    <Text style={[styles.statEmoji, { fontSize: scaled(isLively ? 26 : 20) }]}>🌧️</Text>
                    <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>Ngày mệt?</Text>
                    <Text style={[styles.statBig, { color: colors.text, fontSize: scaled(15) }]}>
                      {todayData.badDayAvailable ? 'Có chế độ ngày nhẹ' : 'Hôm nay đã dùng ngày nhẹ'}
                    </Text>
                    <Pressable
                      style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, opacity: !todayData.badDayAvailable || badDayBusy ? 0.6 : 1 }]}
                      disabled={!todayData.badDayAvailable || badDayBusy}
                      onPress={() => void callBadDay()}
                    >
                      <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(13) }]}>
                        {badDayBusy ? 'Đang lấy bài…' : 'Hôm nay mình mệt 😮‍💨'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {badDay && (
                  <View style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
                    <Text style={[styles.todayCardTitle, { color: colors.text, fontSize: scaled(18) }]}>🌧️ Bài ngày nhẹ (5–10 phút)</Text>
                    <Text style={[styles.todayCardText, { color: colors.text, fontSize: scaled(15) }]}>{badDay.title}</Text>
                    <Text style={[styles.todayCardText, { color: colors.muted, fontSize: scaled(15) }]}>{badDay.detail}</Text>
                    {!isIelts && (
                      <Pressable onPress={() => router.push('/practice')}>
                        <Text style={[styles.link, { color: colors.accent, fontSize: scaled(15) }]}>Mở luyện tập TOEIC →</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.button, { backgroundColor: colors.accent, opacity: badDayDone ? 0.6 : 1 }, raisedButton(colors)]}
                      disabled={badDayDone}
                      onPress={() => {
                        setBadDayDone(true);
                        void markDone('bad-day', 10);
                      }}
                    >
                      <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
                        {badDayDone ? '✓ Đã xong — nghỉ thôi' : 'Xong bài ngày nhẹ'}
                      </Text>
                    </Pressable>
                  </View>
                )}

                {/* Chuẩn web Today.tsx — nút cuộn tới khối 1. */}
                <Pressable
                  style={[styles.button, { backgroundColor: colors.gold }, raisedButton(colors, '#D9A400')]}
                  onPress={scrollToReview}
                >
                  <Text style={[styles.buttonText, { color: colors.goldInk, fontSize: scaled(15) }]}>▶ Bắt đầu hôm nay</Text>
                </Pressable>

                {todayData.carriedOver?.length > 0 && (
                  <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                    📌 Khối dồn từ hôm qua (tối đa 1): {todayData.carriedOver.join(', ')}
                  </Text>
                )}

                <View
                  style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}
                  onLayout={(e) => {
                    reviewY.current = e.nativeEvent.layout.y;
                  }}
                >
                  <Text style={[styles.todayCardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                    1️⃣ Ôn lỗi đến hạn {todayDone.includes('review') ? '✓' : ''}
                  </Text>
                  {isIelts ? (
                    <IeltsReviewBlock dueCount={review?.dueCount ?? 0} onDone={() => void markDone('review', 15)} />
                  ) : (
                    <>
                      <Text style={[styles.todayCardText, { color: colors.text, fontSize: scaled(15) }]}>
                        Có <Text style={{ fontWeight: '700' }}>{review?.dueCount ?? 0}</Text> câu sai đến hạn ôn hôm nay.
                      </Text>
                      {review?.dueIds?.length ? (
                        <View style={styles.dueList}>
                          {review.dueIds.slice(0, 10).map((qid) => (
                            <Pressable key={qid} onPress={() => router.push('/wrong')}>
                              <Text style={[styles.dueId, { color: colors.accent, fontSize: scaled(15) }]}>{qid}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                      <View style={styles.row}>
                        <Pressable
                          style={[styles.button, { backgroundColor: colors.accent, flex: 1 }, raisedButton(colors)]}
                          onPress={() => router.push('/wrong')}
                        >
                          <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Ôn ngay →</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.button, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
                          onPress={() => void markDone('review', 15)}
                        >
                          <Text style={[styles.buttonText, { color: colors.text, fontSize: scaled(15) }]}>Đánh dấu đã ôn</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>

                <View style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
                  <Text style={[styles.todayCardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                    2️⃣ Luyện dạng yếu nhất {todayDone.includes('drill') ? '✓' : ''}
                  </Text>
                  {isIelts ? (
                    <IeltsDrillBlock
                      diagnosticDone={todayData.diagnosticDone}
                      weakestType={drill?.weakestType ?? null}
                      questionCount={drill?.questionCount ?? 0}
                      onDone={() => void markDone('drill', 20)}
                    />
                  ) : (
                    <>
                      <Text style={[styles.todayCardText, { color: colors.text, fontSize: scaled(15) }]}>
                        {drill?.weakestPart
                          ? `Part yếu nhất: ${partLabel(drill.weakestPart, 'toeic')}${drill.questionCount ? ` — ${drill.questionCount} câu` : ''}`
                          : 'Chưa đủ dữ liệu để xác định Part yếu nhất — luyện 1 Part bất kỳ nhé.'}
                      </Text>
                      <Text style={[styles.todayCardText, { color: colors.muted, fontSize: scaled(14) }]}>
                        Trang Luyện tập hiện chưa nhận sẵn Part từ link, bạn chọn Part ở đó nhé.
                      </Text>
                      <View style={styles.row}>
                        <Pressable
                          style={[styles.button, { backgroundColor: colors.accent, flex: 1 }, raisedButton(colors)]}
                          onPress={() => router.push('/practice')}
                        >
                          <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Mở luyện tập →</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.button, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
                          onPress={() => void markDone('drill', 20)}
                        >
                          <Text style={[styles.buttonText, { color: colors.text, fontSize: scaled(15) }]}>Đánh dấu đã luyện</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>

                <View style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
                  <Text style={[styles.todayCardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                    3️⃣ Luyện chủ động {todayDone.includes('active') ? '✓' : ''}
                  </Text>
                  {isIelts ? (
                    <IeltsActiveBlock onDone={() => void markDone('active', 15)} />
                  ) : (
                    <>
                      <Text style={[styles.todayCardText, { color: colors.text, fontSize: scaled(15) }]}>
                        Luyện chủ động: mở 1 Part bất kỳ và làm liền mạch như tờ đề thi thật.
                      </Text>
                      <View style={styles.row}>
                        <Pressable
                          style={[styles.button, { backgroundColor: colors.accent, flex: 1 }, raisedButton(colors)]}
                          onPress={() => router.push('/practice')}
                        >
                          <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Mở luyện tập →</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.button, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
                          onPress={() => void markDone('active', 15)}
                        >
                          <Text style={[styles.buttonText, { color: colors.text, fontSize: scaled(15) }]}>Đánh dấu đã luyện</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>

                <View style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
                  <Text style={[styles.todayCardTitle, { color: colors.text, fontSize: scaled(18) }]}>📚 Ôn từ vựng đến hạn</Text>
                  {(vocabBlock?.dueCount ?? 0) > 0 ? (
                    <>
                      <Text style={[styles.todayCardText, { color: colors.text, fontSize: scaled(15) }]}>
                        Có <Text style={{ fontWeight: '700' }}>{vocabBlock?.dueCount}</Text> từ đến hạn ôn hôm nay — mỗi từ ôn đúng +2 XP.
                      </Text>
                      <Pressable
                        style={[styles.button, { backgroundColor: colors.accent }, raisedButton(colors)]}
                        onPress={() => router.push('/vocabulary')}
                      >
                        <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Ôn ngay →</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={[styles.todayCardText, { color: colors.muted, fontSize: scaled(15) }]}>🎉 Hôm nay không có từ đến hạn ôn.</Text>
                  )}
                </View>

                {isIelts && quitReason === 'chan' && (
                  <View style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
                    <Text style={[styles.todayCardTitle, { color: colors.text, fontSize: scaled(18) }]}>🎲 Đổi gió theo chủ đề bạn thích</Text>
                    <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                      Chọn chủ đề — app sẽ ưu tiên bài đọc/nghe cùng chủ đề khi có.
                    </Text>
                    <View style={styles.chipRow}>
                      {TOPICS.map((t) => {
                        const selected = topics.includes(t);
                        return (
                          <Pressable
                            key={t}
                            style={[styles.chip, { borderColor: colors.border, backgroundColor: selected ? colors.accent : colors.surface }, livelyChip(colors)]}
                            onPress={() => toggleTopic(t)}
                          >
                            <Text style={{ color: selected ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
                              {selected ? '✓ ' : ''}{t}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, livelyCard(colors, 'compact')]}>
                      <Text style={[styles.panelTitle, { color: colors.text, fontSize: scaled(15) }]}>👹 Boss cuối tuần</Text>
                      <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                        Mini test 20–30 phút, đánh 1 con quái to — sẽ mở ở Giai đoạn 6. Cứ luyện đều mỗi ngày
                        là tới lúc gặp boss thôi.
                      </Text>
                    </View>
                  </View>
                )}
                {isIelts && quitReason === 'khong_thay_tien_bo' && <BandCompassBlock />}
              </>
            ) : null}

            <View style={styles.menu}>
              {[...MENU_COMMON, ...(exam === 'ielts' ? MENU_IELTS : [])].map((m) => (
                <Pressable
                  key={m.href}
                  style={[
                    styles.menuItem,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    livelyCard(colors, 'compact'),
                  ]}
                  onPress={() => router.push(m.href as never)}
                >
                  <Text style={[styles.menuEmoji, { fontSize: scaled(isLively ? 28 : 24) }]}>{icons[m.icon]}</Text>
                  <Text style={[styles.menuLabel, { color: colors.text, fontSize: scaled(15) }]}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.menu}>
              <Pressable
                style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'compact')]}
                onPress={clearExam}
              >
                <Text style={[styles.menuEmoji, { fontSize: scaled(isLively ? 28 : 24) }]}>{icons['switch-exam']}</Text>
                <Text style={[styles.menuLabel, { color: colors.text, fontSize: scaled(15) }]}>
                  Đổi bài thi
                </Text>
              </Pressable>
              <Pressable
                style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'compact')]}
                onPress={logout}
              >
                <Text style={[styles.menuEmoji, { fontSize: scaled(isLively ? 28 : 24) }]}>🚪</Text>
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
  // Sống động (chỉ render khi lively): hero mascot + chip streak/XP,
  // thẻ nhiệm vụ hằng ngày.
  livelyHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACING.md,
    width: '100%',
  },
  livelyHeroText: { flex: 1, gap: SPACING.sm, flexShrink: 1 },
  livelyHeroTitle: { fontWeight: '800', flexWrap: 'wrap' },
  livelyChips: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  livelyChip: { borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  livelyChipText: { fontWeight: '800' },
  livelyTasks: { alignItems: 'flex-start', gap: SPACING.sm },
  livelyTasksTitle: { fontWeight: '800', flexWrap: 'wrap' },
  livelyTaskRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  livelyTaskCheck: {},
  livelyTaskLabel: { fontWeight: '600', flexWrap: 'wrap', flexShrink: 1 },
  livelyTasksMore: { fontWeight: '700' },
  // 3 stat-card phía trên hub menu — xếp dọc 1 cột trên mobile hẹp.
  stats: { gap: SPACING.sm, width: '100%' },
  statCard: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACING.md,
    gap: 2,
    width: '100%',
  },
  // Ô icon màu riêng từng thẻ: mục tiêu xanh lá, Part yếu xanh dương,
  // streak cam — số liệu to đậm cùng màu ô icon.
  statIcoBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  // Hàng nút hành động nhanh 2x2 dưới thẻ thống kê.
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  quickBtn: {
    width: '48%',
    flexGrow: 1,
    maxWidth: '48%',
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBtnOutline: { borderWidth: 1 },
  quickBtnText: { fontWeight: '800', textAlign: 'center' },
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
    // Ô lẻ cuối hàng (vd. "Hồ sơ & Cài đặt" ở chế độ TOEIC) không được
    // giãn full-width — giữ đúng 1 cột như lưới web.
    maxWidth: '48%',
    minHeight: 72,
  },
  menuEmoji: { textAlign: 'center' },
  menuLabel: { fontWeight: '600', textAlign: 'center', flexWrap: 'wrap' },
  note: { textAlign: 'center', flexWrap: 'wrap', marginTop: SPACING.sm },
  // --- Khối Hôm nay gộp từ màn /today cũ (kiểu của today.tsx) ---
  error: { flexWrap: 'wrap' },
  muted: { flexWrap: 'wrap' },
  link: { fontWeight: '700', flexWrap: 'wrap' },
  todayCard: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.xs,
    width: '100%',
  },
  todayCardTitle: { fontWeight: '700', flexWrap: 'wrap' },
  todayCardText: { flexWrap: 'wrap' },
  dueList: { gap: 2, width: '100%' },
  dueId: { fontWeight: '600', flexWrap: 'wrap' },
  statRow: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: CARD_PADDING,
    gap: 2,
    alignItems: 'center',
  },
  statEmoji: { textAlign: 'center' },
  statNote: { textAlign: 'center', flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  panel: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    padding: CARD_PADDING,
    gap: SPACING.xs,
    width: '100%',
  },
  panelTitle: { fontWeight: '700', flexWrap: 'wrap' },
  smallButton: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: SPACING.md,
  },
  outlineButton: { borderWidth: 1, backgroundColor: 'transparent' },
  smallButtonText: { fontWeight: '700', textAlign: 'center' },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonText: { fontWeight: '700', textAlign: 'center' },
});
