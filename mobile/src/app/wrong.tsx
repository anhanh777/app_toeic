// Câu đã làm sai — port từ frontend/src/pages/WrongQuestions.tsx.
// Làm đúng 1 câu ở đây sẽ gỡ nó khỏi danh sách (+XP).
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, api, type Question } from '../api';
import { useExam } from '../exam';
import {
  horizontalPadding,
  LIST_DEFAULTS,
  MAX_CONTENT_WIDTH,
  RADIUS,
  SPACING,
} from '../layout';
import { isFillIn, isMultiAnswer, parseSelectedLabels, partLabel, questionTypeName, toggleSelectedLabel, wordCount } from '../lib';
import { useTextSize, useTheme } from '../theme';

type Item = Question & { wrongCount?: number };

const TFNG_LABELS = ['TRUE', 'FALSE', 'NOT GIVEN'];
const YNNG_LABELS = ['YES', 'NO', 'NOT GIVEN'];

/** Điều khiển trả lời cho các dạng IELTS — bản rút gọn của
 * frontend/src/ielts-ui.tsx (IeltsAnswerControl) cho mobile. */
const AnswerControl = memo(function AnswerControl({
  q,
  value,
  onChange,
  graded,
}: {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  graded?: { correct: boolean; correctLabel?: string | null; correctText?: string | null } | null;
}) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const type = q.questionType || 'multiple_choice';
  const disabled = !!graded;

  if (type === 'true_false_not_given' || type === 'yes_no_not_given') {
    const labels = type === 'true_false_not_given' ? TFNG_LABELS : YNNG_LABELS;
    return (
      <View style={styles.pillRow}>
        {labels.map((l) => {
          const isSel = value === l;
          const isRight = graded?.correctLabel === l;
          return (
            <Pressable
              key={l}
              disabled={disabled}
              onPress={() => onChange(l)}
              style={[
                styles.pill,
                {
                  borderColor: isRight ? colors.success : isSel ? colors.accent : colors.border,
                  backgroundColor: isRight ? colors.surfaceMuted : isSel ? colors.surfaceMuted : colors.surface,
                },
              ]}
            >
              <Text style={[styles.pillText, { color: colors.text, fontSize: scaled(13) }]}>{l}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (isMultiAnswer(type)) {
    const selected = parseSelectedLabels(value);
    const correctSet = graded?.correctLabel ? parseSelectedLabels(graded.correctLabel) : [];
    return (
      <View style={styles.optList}>
        <Text style={[styles.hint, { color: colors.muted, fontSize: scaled(13) }]}>
          💡 Chọn 2–3 đáp án (đúng hết mới tính điểm).
        </Text>
        {q.options.map((o) => {
          const isSel = selected.includes(o.label);
          const isRight = correctSet.includes(o.label);
          return (
            <Pressable
              key={o.label}
              disabled={disabled}
              onPress={() => onChange(toggleSelectedLabel(value, o.label))}
              style={[
                styles.option,
                {
                  borderColor: isRight ? colors.success : isSel ? colors.accent : colors.border,
                  backgroundColor: isSel || isRight ? colors.surfaceMuted : colors.surface,
                },
              ]}
            >
              <Text style={[styles.optionText, { color: colors.text, fontSize: scaled(15) }]}>
                {isSel ? '☑ ' : '☐ '}{o.label}. {o.content}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (isFillIn(type)) {
    const n = wordCount(value);
    const over = q.wordLimit != null && n > q.wordLimit;
    return (
      <View style={styles.optList}>
        <TextInput
          style={[styles.input, { borderColor: over ? colors.danger : colors.border, color: colors.text, fontSize: scaled(16) }]}
          value={value}
          onChangeText={onChange}
          placeholder={q.wordLimit != null ? `Nhập đáp án (tối đa ${q.wordLimit} từ)` : 'Nhập đáp án'}
          placeholderTextColor={colors.muted}
          editable={!disabled}
        />
        <Text style={[styles.hint, { color: over ? colors.danger : colors.muted, fontSize: scaled(13) }]}>
          {q.wordLimit != null ? `${n}/${q.wordLimit} từ` : `${n} từ`}
          {over ? ' — vượt giới hạn số từ, hãy rút gọn đáp án.' : ''}
        </Text>
      </View>
    );
  }

  // Trắc nghiệm A–D / choosing_title / matching: nút chọn theo options.
  return (
    <View style={styles.optList}>
      {q.options.map((o) => {
        const isSel = value === o.label;
        const isRight = graded?.correctLabel === o.label;
        return (
          <Pressable
            key={o.label}
            disabled={disabled}
            onPress={() => onChange(o.label)}
            style={[
              styles.option,
              {
                borderColor: isRight ? colors.success : isSel ? colors.accent : colors.border,
                backgroundColor: isSel || isRight ? colors.surfaceMuted : colors.surface,
              },
            ]}
          >
            <Text style={[styles.optionText, { color: colors.text, fontSize: scaled(15) }]}>
              <Text style={{ fontWeight: '700' }}>{o.label}.</Text> {o.content}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

export default function WrongQuestionsScreen() {
  const { exam } = useExam();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  const [items, setItems] = useState<Item[]>([]);
  const [part, setPart] = useState<number | undefined>(undefined);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    (p?: number) => {
      api
        .wrongQuestions(p, ex)
        .then(setItems)
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được câu sai.'))
        .finally(() => setLoading(false));
    },
    [ex],
  );
  useEffect(() => {
    load(part);
  }, [load, part]);

  const setSel = useCallback((id: string, v: string) => {
    setSelected((s) => ({ ...s, [id]: v }));
  }, []);

  const review = useCallback(
    async (q: Item) => {
      const sel = selected[q.id];
      if (!sel || busyId) return;
      setBusyId(q.id);
      setError('');
      try {
        const r = await api.reviewWrong(q.id, sel);
        const right = isMultiAnswer(q.questionType)
          ? parseSelectedLabels(r.correctLabel).join(', ') || r.correctText
          : (r.correctText ?? r.correctLabel);
        setFeedback((f) => ({
          ...f,
          [q.id]: r.correct
            ? { ok: true, text: `✅ Đúng! Câu này đã được gỡ khỏi danh sách.${r.xpAwarded ? ` +${r.xpAwarded} XP` : ''}` }
            : { ok: false, text: `❌ Sai. Đáp án đúng: ${right ?? '—'}. ${r.explanation || ''}` },
        }));
        if (r.correct) setItems((list) => list.filter((x) => x.id !== q.id));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Không chấm được câu này.');
      } finally {
        setBusyId(null);
      }
    },
    [selected, busyId],
  );

  const keyExtractor = useCallback((q: Item) => q.id, []);
  const renderItem = useCallback(
    ({ item: q }: { item: Item }) => {
      const sel = selected[q.id] ?? '';
      const fillIn = isFillIn(q.questionType);
      const overLimit =
        fillIn && q.wordLimit != null && wordCount(sel) > q.wordLimit;
      const fb = feedback[q.id];
      return (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.tag, { color: colors.muted, fontSize: scaled(13) }]}>
            {partLabel(q.part, ex)} • Sai {q.wrongCount ?? 1} lần
            {q.questionType ? ` • ${questionTypeName(q.questionType)}` : ''}
          </Text>
          {q.imageUrl ? (
            <Image source={{ uri: q.imageUrl }} style={styles.image} contentFit="contain" />
          ) : null}
          {q.passageText ? (
            <Text style={[styles.passage, { color: colors.text, fontSize: scaled(15) }]}>{q.passageText}</Text>
          ) : null}
          <Text style={[styles.content, { color: colors.text, fontSize: scaled(16) }]}>{q.content}</Text>
          <AnswerControl q={q} value={sel} onChange={(v) => setSel(q.id, v)} />
          {fb ? (
            <Text
              style={[
                styles.feedback,
                { color: fb.ok ? colors.success : colors.danger, fontSize: scaled(15) },
              ]}
            >
              {fb.text}
            </Text>
          ) : null}
          <Pressable
            style={[
              styles.button,
              { backgroundColor: colors.accent, opacity: !sel || overLimit || busyId === q.id ? 0.6 : 1 },
            ]}
            onPress={() => void review(q)}
            disabled={!sel || overLimit || busyId === q.id}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
              {busyId === q.id ? 'Đang chấm…' : 'Kiểm tra'}
            </Text>
          </Pressable>
        </View>
      );
    },
    [selected, feedback, busyId, colors, scaled, ex, setSel, review],
  );

  const pad = horizontalPadding(width);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.wrap, { paddingHorizontal: pad }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: colors.accent, fontSize: scaled(15) }]}>‹ Quay lại</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text, fontSize: scaled(24) }]}>Câu đã làm sai</Text>
        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, { borderColor: colors.border, backgroundColor: part === undefined ? colors.accent : colors.surface }]}
            onPress={() => setPart(undefined)}
          >
            <Text style={{ color: part === undefined ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
              Tất cả
            </Text>
          </Pressable>
          {[1, 2, 3, 4, 5, 6, 7].map((p) => (
            <Pressable
              key={p}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: part === p ? colors.accent : colors.surface }]}
              onPress={() => setPart(p)}
            >
              <Text style={{ color: part === p ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
                {isIelts ? partLabel(p, ex) : `Part ${p}`}
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
          <FlatList
            data={items}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            {...LIST_DEFAULTS}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.muted, fontSize: scaled(15) }]}>
                Chưa có câu sai nào. Làm đúng 1 câu ở đây sẽ gỡ nó khỏi danh sách.
              </Text>
            }
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: {
    flex: 1,
    paddingVertical: SPACING.lg,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: SPACING.sm,
  },
  back: { fontWeight: '600' },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  chip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  error: { flexWrap: 'wrap' },
  loader: { marginTop: SPACING.lg },
  list: { gap: SPACING.md, paddingBottom: SPACING.md },
  empty: { textAlign: 'center', marginTop: SPACING.lg, flexWrap: 'wrap' },
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    gap: SPACING.sm,
    width: '100%',
  },
  tag: { flexWrap: 'wrap' },
  image: { width: '100%', height: 200, borderRadius: RADIUS.button },
  passage: { flexWrap: 'wrap' },
  content: { fontWeight: '600', flexWrap: 'wrap' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  pill: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexGrow: 1,
    alignItems: 'center',
  },
  pillText: { fontWeight: '700', textAlign: 'center' },
  optList: { gap: SPACING.sm, width: '100%' },
  option: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    width: '100%',
  },
  optionText: { flexWrap: 'wrap' },
  hint: { flexWrap: 'wrap' },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    width: '100%',
  },
  feedback: { flexWrap: 'wrap' },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: { fontWeight: '700', textAlign: 'center' },
});
