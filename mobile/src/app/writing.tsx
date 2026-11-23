// Luyện Writing IELTS — port từ frontend/src/pages/Writing.tsx.
// Đề mẫu (Task 1/Task 2), editor + đếm giờ + đếm từ, tự chấm (4 tiêu
// chí 0–9, tùy chọn), nộp bài, xem lại bài đã nộp. Chưa chấm AI — sẽ
// có ở Giai đoạn 2.
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ApiError, api, type WritingSubmission, type WritingTask } from '../api';
import { CARD_PADDING, horizontalPadding, LIST_DEFAULTS, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { wordCount } from '../lib';
import { livelyCard, raisedButton, useTextSize, useTheme } from '../theme';
import { BackButton } from '../components/BackButton';
import { LoadingLine } from '../components/LoadingLine';

export function fmtClock(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Số liệu biểu đồ của đề Task 1 — hiển thị dạng text đơn giản
 * (bản web dùng <table>; mobile vẽ bảng bằng các dòng text). */
const ChartText = memo(function ChartText({ data }: { data: NonNullable<WritingTask['chartData']> }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const lines: string[] = [];
  if (Array.isArray(data)) {
    data.forEach((row) => lines.push(row.join('  |  ')));
  } else {
    const cats = data.categories ?? [];
    const series = data.series ?? [];
    if (cats.length && series.length) {
      lines.push(['', ...cats].join('  |  '));
      series.forEach((s) => {
        lines.push([s.label ?? (s.year != null ? String(s.year) : ''), ...(s.values ?? []).map(String)].join('  |  '));
      });
    }
  }
  if (!lines.length) return null;
  return (
    <View style={[styles.chart, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, livelyCard(colors, 'compact')]}>
      {lines.map((l, i) => (
        <Text key={i} style={[styles.chartLine, { color: colors.text, fontSize: scaled(14) }]}>{l}</Text>
      ))}
    </View>
  );
});

const SELF_SCORE_KEYS = [
  ['task', 'Task Achievement'],
  ['coherence', 'Coherence'],
  ['lexical', 'Lexical'],
  ['grammar', 'Grammar'],
] as const;
type SelfScoreKey = (typeof SELF_SCORE_KEYS)[number][0];

export default function WritingScreen() {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  // Chẩn đoán: màn Diagnostic mở kèm baseline=1 thì bài nộp là bài mẫu.
  const { baseline } = useLocalSearchParams<{ baseline?: string }>();
  const { width } = useWindowDimensions();
  const [tasks, setTasks] = useState<WritingTask[]>([]);
  const [subs, setSubs] = useState<WritingSubmission[]>([]);
  const [task, setTask] = useState<WritingTask | null>(null);
  const [content, setContent] = useState('');
  const [selfScores, setSelfScores] = useState<Record<SelfScoreKey, string>>({
    task: '',
    coherence: '',
    lexical: '',
    grammar: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const [expandedSub, setExpandedSub] = useState<number | null>(null);
  const startedAtRef = useRef<number | null>(null);


  // Đếm ngược khi đang làm bài; hết giờ thì dừng (không tự nộp).
  useEffect(() => {
    if (!running || left <= 0) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running, left]);

  const loadSubs = useCallback(() => {
    api.writingSubmissions().then(setSubs).catch(() => undefined);
  }, []);
  useEffect(() => {
    api
      .writingTasks()
      .then(setTasks)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được đề Writing.'))
      .finally(() => setLoading(false));
    loadSubs();
  }, [loadSubs]);

  const pick = useCallback((t: WritingTask) => {
    setTask(t);
    setLeft(t.minutes * 60);
    setContent('');
    setSelfScores({ task: '', coherence: '', lexical: '', grammar: '' });
    setSubmitted(false);
    setRunning(false);
    startedAtRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    setLeft((task?.minutes ?? 20) * 60);
    startedAtRef.current = Date.now();
    setRunning(true);
  }, [task]);

  const submit = useCallback(async () => {
    if (!task || !content.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const scores: Record<string, number> = {};
      (Object.keys(selfScores) as SelfScoreKey[]).forEach((k) => {
        const n = Number(selfScores[k]);
        if (selfScores[k].trim() !== '' && !Number.isNaN(n)) {
          scores[k] = Math.max(0, Math.min(9, n));
        }
      });
      await api.submitWriting({
        taskId: task.id,
        content,
        durationSec: startedAtRef.current
          ? Math.round((Date.now() - startedAtRef.current) / 1000)
          : (task.minutes * 60 - left),
        ...(Object.keys(scores).length ? { selfScores: scores } : {}),
        isBaseline: baseline === '1',
      });
      setSubmitted(true);
      setRunning(false);
      loadSubs();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không nộp được bài.');
    } finally {
      setSaving(false);
    }
  }, [task, content, saving, selfScores, left, baseline, loadSubs]);

  const minWords = task?.type === 'task1' ? 150 : 250;
  const words = wordCount(content);
  const pad = horizontalPadding(width);

  const keyExtractor = useCallback((t: WritingTask) => t.id, []);
  const renderTask = useCallback(
    ({ item: t }: { item: WritingTask }) => {
      const selected = task?.id === t.id;
      return (
        <Pressable
          style={[
            styles.taskCard,
            {
              borderColor: selected ? colors.accent : colors.border,
              backgroundColor: selected ? colors.surfaceMuted : colors.surface,
            },
            livelyCard(colors, 'card', selected ? colors.accentDark : undefined),
          ]}
          onPress={() => pick(t)}
        >
          <Text style={[styles.pill, { color: colors.accent, fontSize: scaled(13) }]}>
            {t.type === 'task1' ? 'Task 1' : 'Task 2'}
            {t.isSample ? ' • Đề mẫu' : ''}
          </Text>
          <Text style={[styles.taskTitle, { color: colors.text, fontSize: scaled(15) }]}>{t.title}</Text>
          <Text style={[styles.taskMeta, { color: colors.muted, fontSize: scaled(14) }]}>{t.minutes} phút</Text>
        </Pressable>
      );
    },
    [task, colors, scaled, pick],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}>
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={[styles.title, { flex: 1, color: colors.text, fontSize: scaled(24) }]}>✍️ Luyện Writing IELTS</Text>
        </View>
        <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
          Task 1 (20 phút, tối thiểu 150 từ) · Task 2 (40 phút, tối thiểu 250 từ). Đề mẫu — nội dung tự
          soạn, chưa phải đề thi thật.
        </Text>
        {error ? (
          <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
        ) : null}
        {loading ? (
          <LoadingLine location="table" />
        ) : (
          <>
            <Text style={[styles.section, { color: colors.text, fontSize: scaled(18) }]}>Chọn đề</Text>
            {!tasks.length && (
              <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>Chưa có đề Writing mẫu.</Text>
            )}
            <FlatList
              data={tasks}
              keyExtractor={keyExtractor}
              renderItem={renderTask}
              {...LIST_DEFAULTS}
              scrollEnabled={false}
              contentContainerStyle={styles.taskList}
            />

            {task && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                  {task.title} <Text style={{ color: colors.accent }}>· {task.type === 'task1' ? 'Task 1' : 'Task 2'}</Text>
                </Text>
                <Text style={[styles.prompt, { color: colors.text, fontSize: scaled(15) }]}>{task.prompt}</Text>
                {task.chartData ? <ChartText data={task.chartData} /> : null}
                <Text style={[styles.timer, { color: colors.text, fontSize: scaled(15) }]}>
                  ⏱ Còn lại: <Text style={{ fontWeight: '700' }}>{fmtClock(left)}</Text> · {words} từ (tối thiểu {minWords})
                </Text>
                <Pressable
                  style={[styles.smallButton, { backgroundColor: colors.accent, opacity: running ? 0.6 : 1 }]}
                  onPress={startTimer}
                  disabled={running}
                >
                  <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
                    {running ? 'Đang làm bài…' : 'Bắt đầu làm bài'}
                  </Text>
                </Pressable>
                <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Bài viết của bạn</Text>
                <TextInput
                  style={[styles.editor, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }, livelyCard(colors, 'compact')]}
                  value={content}
                  onChangeText={setContent}
                  placeholder="Viết bài của bạn ở đây…"
                  placeholderTextColor={colors.muted}
                  multiline
                  textAlignVertical="top"
                />
                <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                  {words} từ · Tối thiểu Task 1: 150 từ, Task 2: 250 từ.
                </Text>
                <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>
                  Tự chấm (tùy chọn, 0–9)
                </Text>
                <View style={styles.scoreGrid}>
                  {SELF_SCORE_KEYS.map(([k, label]) => (
                    <View key={k} style={styles.scoreCell}>
                      <Text style={[styles.scoreLabel, { color: colors.muted, fontSize: scaled(13) }]} numberOfLines={1}>
                        {label}
                      </Text>
                      <TextInput
                        style={[styles.scoreInput, { borderColor: colors.border, color: colors.text, fontSize: scaled(15) }]}
                        value={selfScores[k]}
                        onChangeText={(v) =>
                          setSelfScores((s) => ({ ...s, [k]: v.replace(/[^0-9.]/g, '') }))
                        }
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                  ))}
                </View>
                <Pressable
                  style={[styles.button, { backgroundColor: colors.accent, opacity: !content.trim() || saving ? 0.6 : 1 }, raisedButton(colors)]}
                  onPress={() => void submit()}
                  disabled={!content.trim() || saving}
                >
                  <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(16) }]}>
                    {saving ? 'Đang nộp…' : 'Nộp bài'}
                  </Text>
                </Pressable>
                {submitted && (
                  <Text style={[styles.note, { color: colors.success, fontSize: scaled(15) }]}>
                    ✅ Đã nộp bài. Chưa chấm AI — tính năng này sẽ có sau.
                  </Text>
                )}
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>Bài đã nộp ({subs.length})</Text>
              {!subs.length && (
                <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>Chưa có bài nộp nào.</Text>
              )}
              {subs.map((s) => {
                const expanded = expandedSub === s.id;
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.subItem, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                    onPress={() => setExpandedSub(expanded ? null : s.id)}
                  >
                    <Text style={[styles.subTitle, { color: colors.text, fontSize: scaled(15) }]}>
                      {s.taskId} · {s.wordCount ?? wordCount(s.content)} từ
                      {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleDateString('vi-VN')}` : ''}
                      {s.isBaseline ? ' · Bài mẫu chẩn đoán' : ''}
                    </Text>
                    <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                      Chưa chấm AI — tính năng này sẽ có sau. {expanded ? '▲ Ẩn bài viết' : '▼ Xem bài viết'}
                    </Text>
                    {s.selfScores ? (
                      <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                        Tự chấm: {Object.entries(s.selfScores).map(([k, v]) => `${k} ${v}`).join(' · ')}
                      </Text>
                    ) : null}
                    {expanded && (
                      <Text style={[styles.subContent, { color: colors.text, fontSize: scaled(15) }]}>{s.content}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Hàng tiêu đề: nút quay lại + tiêu đề cùng 1 hàng (không để nút lẻ 1 hàng gây thừa khoảng trắng).
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingVertical: SPACING.md,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: SPACING.sm,
  },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  sub: { flexWrap: 'wrap' },
  error: { flexWrap: 'wrap' },
  note: { flexWrap: 'wrap' },
  muted: { flexWrap: 'wrap' },
  section: { fontWeight: '700', flexWrap: 'wrap' },
  taskList: { gap: SPACING.sm, width: '100%' },
  taskCard: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: CARD_PADDING,
    gap: SPACING.xs,
    width: '100%',
  },
  pill: { fontWeight: '700' },
  taskTitle: { fontWeight: '700', flexWrap: 'wrap' },
  taskMeta: { flexWrap: 'wrap' },
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.xs,
    width: '100%',
  },
  cardTitle: { fontWeight: '700', flexWrap: 'wrap' },
  prompt: { flexWrap: 'wrap' },
  chart: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    padding: CARD_PADDING,
    gap: SPACING.xs,
    width: '100%',
  },
  chartLine: { flexWrap: 'wrap' },
  timer: { flexWrap: 'wrap' },
  smallButton: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.lg,
  },
  smallButtonText: { fontWeight: '700', textAlign: 'center' },
  label: { fontWeight: '600', marginTop: SPACING.sm },
  editor: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    width: '100%',
    minHeight: 220,
  },
  scoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  scoreCell: { flexGrow: 1, flexBasis: '45%', maxWidth: '48%', minWidth: 140, gap: SPACING.xs },
  scoreLabel: { flexWrap: 'wrap' },
  scoreInput: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    width: '100%',
  },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: SPACING.sm,
  },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  subItem: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    padding: CARD_PADDING,
    gap: SPACING.xs,
    width: '100%',
  },
  subTitle: { fontWeight: '700', flexWrap: 'wrap' },
  subContent: { flexWrap: 'wrap' },
});
