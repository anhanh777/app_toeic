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
import { router } from 'expo-router';
import { api, type ExamInfo } from '../api';
import { useAuth } from '../auth';
import { useExam, type ExamId } from '../exam';
import {
  BREAKPOINTS,
  horizontalPadding,
  MAX_CONTENT_WIDTH,
  RADIUS,
  SPACING,
} from '../layout';
import { useTextSize, useTheme } from '../theme';

const FALLBACK_EXAMS: ExamInfo[] = [
  { id: 'toeic', title: 'TOEIC', subtitle: 'Listening + Reading', scale: '10–990', testSetCount: 25, questionCount: 5000 },
  { id: 'ielts', title: 'IELTS Academic', subtitle: 'Listening + Reading', scale: 'Band 0–9', testSetCount: 12, questionCount: 960 },
];

const EXAM_META: Record<ExamId, { emoji: string; detail: string }> = {
  toeic: { emoji: '🌸', detail: 'Listening + Reading, 7 Part' },
  ielts: { emoji: '🎓', detail: 'Listening 4 Section + Reading 3 Passage' },
};

// Menu trang chính — mục IELTS chỉ hiện khi đang chọn kỳ thi IELTS
// (giống bản web: mục riêng của IELTS bị ẩn ở chế độ TOEIC).
const MENU_COMMON: { emoji: string; label: string; href: string }[] = [
  { emoji: '📅', label: 'Hôm nay', href: '/today' },
  { emoji: '✏️', label: 'Luyện tập', href: '/practice' },
  { emoji: '⏱️', label: 'Thi thử', href: '/mock' },
  { emoji: '❌', label: 'Ôn câu sai', href: '/wrong' },
  { emoji: '📖', label: 'Từ vựng', href: '/vocabulary' },
  { emoji: '🏆', label: 'Xếp hạng', href: '/leaderboard' },
  { emoji: '⚙️', label: 'Hồ sơ & Cài đặt', href: '/settings' },
];
const MENU_IELTS: { emoji: string; label: string; href: string }[] = [
  { emoji: '🧭', label: 'Chẩn đoán IELTS', href: '/diagnostic' },
  { emoji: '🐉', label: 'Sổ lỗi & Quái vật', href: '/errors' },
  { emoji: '✍️', label: 'Viết (Writing)', href: '/writing' },
  { emoji: '🎤', label: 'Nói (Speaking)', href: '/speaking' },
  { emoji: '📝', label: 'Thiết lập IELTS', href: '/ielts-setup' },
];

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { exam, setExam, clearExam } = useExam();
  const { colors, theme, toggleTheme } = useTheme();
  const { scaled, label: textSizeLabel, level: textSizeLevel, setLevel: setTextSizeLevel } = useTextSize();
  const { width } = useWindowDimensions();
  const [exams, setExams] = useState<ExamInfo[] | null>(null);
  const [loadingExams, setLoadingExams] = useState(true);

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

  const pick = useCallback(
    (id: string) => {
      if (id !== 'toeic' && id !== 'ielts') return;
      setExam(id);
    },
    [setExam],
  );

  const pad = horizontalPadding(width);
  const wide = width >= BREAKPOINTS.wide;
  const list = exams?.length ? exams : FALLBACK_EXAMS;
  const chosen = exam ? list.find((e) => e.id === exam) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}>
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
                  <Text style={[styles.emoji, { fontSize: scaled(32) }]}>
                    {EXAM_META[e.id as ExamId]?.emoji ?? '📚'}
                  </Text>
                  <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(20) }]}>
                    {e.title}
                  </Text>
                  <Text style={[styles.cardText, { color: colors.muted, fontSize: scaled(14) }]}>
                    {e.subtitle}
                  </Text>
                  <Text style={[styles.cardText, { color: colors.muted, fontSize: scaled(14) }]}>
                    {EXAM_META[e.id as ExamId]?.detail ?? ''}
                  </Text>
                  <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
                    {e.testSetCount} đề • {e.questionCount} câu
                  </Text>
                  <Text style={[styles.cardText, { color: colors.muted, fontSize: scaled(14) }]}>
                    Thang điểm: {e.scale}
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
          <View style={styles.homeWrap}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.emoji, { fontSize: scaled(32) }]}>
                {EXAM_META[exam]?.emoji ?? '📚'}
              </Text>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(20) }]}>
                {chosen?.title ?? exam.toUpperCase()}
              </Text>
              <Text style={[styles.cardText, { color: colors.muted, fontSize: scaled(15) }]}>
                {chosen?.subtitle ?? ''} • Thang điểm: {chosen?.scale ?? ''}
              </Text>
              <Text style={[styles.cardText, { color: colors.muted, fontSize: scaled(15) }]}>
                {chosen?.testSetCount ?? '—'} đề • {chosen?.questionCount ?? '—'} câu
              </Text>
            </View>

            <View style={[styles.menu, wide && styles.menuRow]}>
              {[...MENU_COMMON, ...(exam === 'ielts' ? MENU_IELTS : [])].map((m) => (
                <Pressable
                  key={m.href}
                  style={[
                    styles.menuItem,
                    wide && styles.menuItemHalf,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => router.push(m.href as never)}
                >
                  <Text style={[styles.menuEmoji, { fontSize: scaled(22) }]}>{m.emoji}</Text>
                  <Text style={[styles.menuLabel, { color: colors.text, fontSize: scaled(15) }]}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <Pressable
                style={[styles.button, { backgroundColor: colors.accent, flex: 1 }]}
                onPress={clearExam}
              >
                <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
                  ⇄ Đổi bài thi
                </Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
                onPress={logout}
              >
                <Text style={[styles.buttonText, { color: colors.text, fontSize: scaled(15) }]}>
                  Đăng xuất
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.chip, styles.textSizeChip, { borderColor: colors.border }]}
              onPress={() => setTextSizeLevel(textSizeLevel >= 3 ? 0 : textSizeLevel + 1)}
            >
              <Text style={{ color: colors.text, fontSize: scaled(14) }}>
                🔠 Cỡ chữ: {textSizeLabel}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingVertical: SPACING.lg,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
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
  cards: { gap: SPACING.md, width: '100%' },
  cardsRow: { flexDirection: 'row', alignItems: 'stretch' },
  card: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.sm,
    alignItems: 'center',
    width: '100%',
  },
  cardHalf: { flex: 1 },
  emoji: { textAlign: 'center' },
  cardTitle: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  cardText: { textAlign: 'center', flexWrap: 'wrap' },
  pickButton: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  pickButtonText: { fontWeight: '700' },
  homeWrap: { gap: SPACING.md, width: '100%' },
  menu: { gap: SPACING.sm, width: '100%' },
  menuRow: { flexDirection: 'row', flexWrap: 'wrap' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    width: '100%',
    minHeight: 52,
  },
  menuItemHalf: { width: '48%', flexGrow: 1 },
  menuEmoji: { textAlign: 'center' },
  menuLabel: { fontWeight: '600', flexShrink: 1, flexWrap: 'wrap' },
  note: { textAlign: 'center', flexWrap: 'wrap', marginTop: SPACING.sm },
  row: { flexDirection: 'row', gap: SPACING.md, width: '100%' },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  outlineButton: { borderWidth: 1, backgroundColor: 'transparent' },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  textSizeChip: { alignSelf: 'center' },
});
