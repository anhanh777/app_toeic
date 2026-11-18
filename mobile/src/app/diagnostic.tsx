// Chẩn đoán IELTS — port từ frontend/src/pages/Diagnostic.tsx.
// (a) Listening+Reading: làm mock full TS-028 (90 phút) ngay trong màn
// này (màn Thi thử Phase 1 chưa có trong bản build này nên bài chẩn
// đoán tự vẽ tờ đề rút gọn: FlatList + windowing, audio từng câu) rồi
// lưu 1 attempt làm chẩn đoán; (b) bản đồ năng lực từ diagnostic/latest;
// (c) baseline Writing; (d) baseline Speaking (link sang 2 màn riêng).
// Tất cả baseline đều ghi rõ "Bài mẫu — nội dung tự soạn, chưa phải đề
// thi thật" và "Chưa chấm AI — sẽ có ở Giai đoạn 2".
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ApiError, api, type Attempt, type DiagnosticMap, type Question } from '../api';
import { horizontalPadding, LIST_DEFAULTS, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { bandLevel, isFillIn, isMultiAnswer, parseSelectedLabels, partLabel, questionTypeName, toggleSelectedLabel, wordCount } from '../lib';
import { useTextSize, useTheme } from '../theme';
import { BackButton } from '../components/BackButton';
import { fmtClock } from './writing';

const SAMPLE_NOTE = 'Bài mẫu — nội dung tự soạn, chưa phải đề thi thật.';
const NO_AI_NOTE = 'Chưa chấm AI — sẽ có ở Giai đoạn 2.';
const DIAGNOSTIC_SET = 'TS-028';
const DIAGNOSTIC_MINUTES = 90;

const TFNG_LABELS = ['TRUE', 'FALSE', 'NOT GIVEN'];
const YNNG_LABELS = ['YES', 'NO', 'NOT GIVEN'];

/** Điều khiển trả lời cho tờ đề chẩn đoán (chỉ ghi đáp án, chưa chấm —
 * chấm 1 lần khi nộp bài). */
const PaperAnswerControl = memo(function PaperAnswerControl({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: string;
  onChange: (v: string) => void;
}) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const type = q.questionType || 'multiple_choice';

  if (type === 'true_false_not_given' || type === 'yes_no_not_given') {
    const labels = type === 'true_false_not_given' ? TFNG_LABELS : YNNG_LABELS;
    return (
      <View style={styles.pillRow}>
        {labels.map((l) => (
          <Pressable
            key={l}
            onPress={() => onChange(l)}
            style={[
              styles.pill,
              {
                borderColor: value === l ? colors.accent : colors.border,
                backgroundColor: value === l ? colors.surfaceMuted : colors.surface,
              },
            ]}
          >
            <Text style={[styles.pillText, { color: colors.text, fontSize: scaled(13) }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  if (isMultiAnswer(type)) {
    const selected = parseSelectedLabels(value);
    return (
      <View style={styles.optList}>
        <Text style={[styles.hint, { color: colors.muted, fontSize: scaled(13) }]}>
          💡 Chọn 2–3 đáp án (đúng hết mới tính điểm).
        </Text>
        {q.options.map((o) => {
          const isSel = selected.includes(o.label);
          return (
            <Pressable
              key={o.label}
              onPress={() => onChange(toggleSelectedLabel(value, o.label))}
              style={[
                styles.option,
                {
                  borderColor: isSel ? colors.accent : colors.border,
                  backgroundColor: isSel ? colors.surfaceMuted : colors.surface,
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
        />
        <Text style={[styles.hint, { color: over ? colors.danger : colors.muted, fontSize: scaled(13) }]}>
          {q.wordLimit != null ? `${n}/${q.wordLimit} từ` : `${n} từ`}
          {over ? ' — vượt giới hạn số từ, hãy rút gọn đáp án.' : ''}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.optList}>
      {q.options.map((o) => {
        const isSel = value === o.label;
        return (
          <Pressable
            key={o.label}
            onPress={() => onChange(o.label)}
            style={[
              styles.option,
              {
                borderColor: isSel ? colors.accent : colors.border,
                backgroundColor: isSel ? colors.surfaceMuted : colors.surface,
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

function ScoreTable({
  title,
  data,
}: {
  title: string;
  data: Record<string, { correct: number; total: number }>;
}) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  return (
    <View style={styles.blockGap}>
      <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(16) }]}>{title}</Text>
      {Object.entries(data).map(([k, v]) => (
        <View key={k} style={styles.blockGap}>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreLabel, { color: colors.text, fontSize: scaled(14) }]}>{k}</Text>
            <Text style={[styles.scoreValue, { color: colors.text, fontSize: scaled(14) }]}>
              {v.correct}/{v.total}
            </Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
            <View
              style={[
                styles.barFill,
                { width: `${v.total ? (v.correct / v.total) * 100 : 0}%`, backgroundColor: colors.accent },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function DiagnosticScreen() {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const [diag, setDiag] = useState<DiagnosticMap | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  // --- Trạng thái tờ đề chẩn đoán (in-file paper) ---
  const [paperActive, setPaperActive] = useState(false);
  const [paperLoading, setPaperLoading] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [paperQuestions, setPaperQuestions] = useState<Question[]>([]);
  const [paperAnswers, setPaperAnswers] = useState<Record<string, string>>({});
  const [paperLeft, setPaperLeft] = useState(DIAGNOSTIC_MINUTES * 60);
  const [submitting, setSubmitting] = useState(false);
  const [playingQid, setPlayingQid] = useState<string | null>(null);
  // expo-audio: 1 player cho audio từng câu (tự release khi unmount).
  const diagPlayer = useAudioPlayer();
  const diagStatus = useAudioPlayerStatus(diagPlayer);
  const autoSubmittedRef = useRef(false);

  const load = useCallback(() => {
    api
      .latestDiagnostic()
      .then(setDiag)
      .catch(() => undefined);
    api
      .testHistory('ielts')
      .then((a) => setAttempts(a.filter((x) => x.mode === 'full')))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được lịch sử thi thử.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(
    () => () => {
      diagPlayer.pause();
    },
    [diagPlayer],
  );

  // Nghe xong 1 câu → tắt trạng thái đang phát câu đó. Dùng pattern
  // "điều chỉnh state trong lúc render" (như prevAudioKey ở
  // AudioPlayer) thay vì setState trong effect, vì rule react-hooks
  // cấm setState trực tiếp trong effect.
  const [prevDidJustFinish, setPrevDidJustFinish] = useState(false);
  if (diagStatus.didJustFinish !== prevDidJustFinish) {
    setPrevDidJustFinish(diagStatus.didJustFinish);
    if (diagStatus.didJustFinish) setPlayingQid(null);
  }

  // Đếm ngược 90 phút khi đang làm bài; hết giờ thì tự nộp (1 lần).
  useEffect(() => {
    if (!paperActive || paperLeft <= 0) return;
    const t = setInterval(() => setPaperLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [paperActive, paperLeft]);

  const saveAsDiagnostic = useCallback(async (id: number) => {
    setSaving(id);
    setError('');
    try {
      setDiag(await api.completeDiagnostic(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được làm chẩn đoán.');
    } finally {
      setSaving(null);
    }
  }, []);

  const startPaper = useCallback(async () => {
    setPaperLoading(true);
    setError('');
    try {
      const created = await api.createTest('full', undefined, DIAGNOSTIC_MINUTES, DIAGNOSTIC_SET, 'ielts');
      const all = await api.questionsAll(undefined, DIAGNOSTIC_SET, 'ielts');
      // Giữ đúng thứ tự questionIds mà backend đã tạo attempt.
      const byId = new Map(all.map((q) => [q.id, q]));
      const ordered = created.questionIds.map((id) => byId.get(id)).filter((q): q is Question => !!q);
      if (!ordered.length) throw new Error('Không tải được câu hỏi của đề TS-028.');
      setAttemptId(created.attemptId);
      setPaperQuestions(ordered);
      setPaperAnswers({});
      setPaperLeft(DIAGNOSTIC_MINUTES * 60);
      autoSubmittedRef.current = false;
      setPaperActive(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không bắt đầu được bài chẩn đoán.');
    } finally {
      setPaperLoading(false);
    }
  }, []);

  const submitPaper = useCallback(async () => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      // Lưu đáp án đã trả lời rồi mới nộp (giống màn Thi thử).
      for (const q of paperQuestions) {
        const v = paperAnswers[q.id];
        if (v && v.trim()) {
          await api.saveTestAnswer(attemptId, q.id, v);
        }
      }
      await api.submitTest(attemptId);
      setDiag(await api.completeDiagnostic(attemptId));
      setPaperActive(false);
      setAttemptId(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không nộp được bài chẩn đoán.');
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, submitting, paperQuestions, paperAnswers, load]);

  // Hết giờ → tự nộp 1 lần.
  useEffect(() => {
    if (paperActive && paperLeft <= 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      void submitPaper();
    }
  }, [paperActive, paperLeft, submitPaper]);

  const abandonPaper = useCallback(() => {
    Alert.alert('Thoát bài chẩn đoán?', 'Bài làm chưa nộp sẽ bị hủy.', [
      { text: 'Ở lại', style: 'cancel' },
      {
        text: 'Thoát',
        style: 'destructive',
        onPress: () => {
          if (attemptId) void api.abandonTest(attemptId).catch(() => undefined);
          diagPlayer.pause();
          setPlayingQid(null);
          setPaperActive(false);
          setAttemptId(null);
        },
      },
    ]);
  }, [attemptId, diagPlayer]);

  const playAudio = useCallback((qid: string, url: string) => {
    try {
      if (playingQid === qid) {
        diagPlayer.pause();
        setPlayingQid(null);
        return;
      }
      diagPlayer.replace(url);
      diagPlayer.play();
      setPlayingQid(qid);
    } catch {
      setPlayingQid(null);
    }
  }, [playingQid, diagPlayer]);

  const setAnswer = useCallback((id: string, v: string) => {
    setPaperAnswers((m) => ({ ...m, [id]: v }));
  }, []);

  const answeredCount = paperQuestions.filter((q) => paperAnswers[q.id]?.trim()).length;
  const keyExtractor = useCallback((q: Question) => q.id, []);
  const renderPaperItem = useCallback(
    ({ item: q, index }: { item: Question; index: number }) => {
      const prev = index > 0 ? paperQuestions[index - 1] : null;
      const showPassage = !!q.passageText && q.passageId !== prev?.passageId;
      const value = paperAnswers[q.id] ?? '';
      return (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.tag, { color: colors.muted, fontSize: scaled(13) }]}>
            Câu {index + 1}/80 · {partLabel(q.part, 'ielts')}
            {q.questionType ? ` · ${questionTypeName(q.questionType)}` : ''}
          </Text>
          {showPassage && (
            <Text style={[styles.passage, { color: colors.text, fontSize: scaled(15) }]}>{q.passageText}</Text>
          )}
          {q.script ? (
            <Text style={[styles.script, { color: colors.muted, fontSize: scaled(14) }]}>{q.script}</Text>
          ) : null}
          {q.audioUrl ? (
            <Pressable
              style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border }]}
              onPress={() => void playAudio(q.id, q.audioUrl as string)}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>
                {playingQid === q.id ? '⏸ Dừng audio' : '▶ Nghe audio câu này'}
              </Text>
            </Pressable>
          ) : null}
          <Text style={[styles.content, { color: colors.text, fontSize: scaled(16) }]}>{q.content}</Text>
          <PaperAnswerControl q={q} value={value} onChange={(v) => setAnswer(q.id, v)} />
        </View>
      );
    },
    [paperQuestions, paperAnswers, colors, scaled, playingQid, playAudio, setAnswer],
  );

  const pad = horizontalPadding(width);

  /* ================= TỜ ĐỀ CHẨN ĐOÁN ================= */
  if (paperActive) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.wrap, { paddingHorizontal: pad }]}>
          <View style={styles.paperHeader}>
            <Text style={[styles.paperTitle, { color: colors.text, fontSize: scaled(17) }]}>
              Chẩn đoán TS-028 · ⏱ {fmtClock(paperLeft)}
            </Text>
            <Text style={[styles.paperSub, { color: colors.muted, fontSize: scaled(14) }]}>
              Đã trả lời {answeredCount}/{paperQuestions.length} · Nghe 1 lần (audio từng câu)
            </Text>
          </View>
          {error ? (
            <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
          ) : null}
          <FlatList
            data={paperQuestions}
            keyExtractor={keyExtractor}
            renderItem={renderPaperItem}
            {...LIST_DEFAULTS}
            contentContainerStyle={styles.list}
          />
          <View style={styles.row}>
            <Pressable
              style={[styles.button, styles.outlineButton, { borderColor: colors.danger, flex: 1 }]}
              onPress={abandonPaper}
              disabled={submitting}
            >
              <Text style={[styles.buttonText, { color: colors.danger, fontSize: scaled(15) }]}>Thoát (hủy bài)</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: colors.accent, flex: 2, opacity: submitting ? 0.6 : 1 }]}
              onPress={() => {
                Alert.alert(
                  'Nộp bài chẩn đoán?',
                  `Bạn đã trả lời ${answeredCount}/${paperQuestions.length} câu. Nộp xong sẽ lưu làm chẩn đoán.`,
                  [
                    { text: 'Chưa', style: 'cancel' },
                    { text: 'Nộp bài', onPress: () => void submitPaper() },
                  ],
                );
              }}
              disabled={submitting}
            >
              <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(16) }]}>
                {submitting ? 'Đang nộp…' : 'Nộp bài'}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* ================= MÀN CHẨN ĐOÁN ================= */
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}>
        <BackButton />
        <Text style={[styles.title, { color: colors.text, fontSize: scaled(24) }]}>🧭 Chẩn đoán IELTS</Text>
        <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
          Biết mình đang ở đâu trước khi luyện — gồm Listening + Reading và bài mẫu Writing/Speaking.
        </Text>
        {error ? (
          <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
        ) : null}
        <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>{SAMPLE_NOTE}</Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
            (a) Listening + Reading — thi thử full 90 phút
          </Text>
          <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
            Làm bài thi thử đầy đủ (TS-028, 80 câu, 90 phút, nghe 1 lần) rồi lưu làm chẩn đoán.
          </Text>
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent, opacity: paperLoading ? 0.6 : 1 }]}
            onPress={() => void startPaper()}
            disabled={paperLoading}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(16) }]}>
              {paperLoading ? 'Đang chuẩn bị đề…' : '▶ Làm bài chẩn đoán (TS-028)'}
            </Text>
          </Pressable>
          {attempts.length > 0 && (
            <>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(16) }]}>Bài thi thử full gần đây</Text>
              {attempts.slice(0, 5).map((a) => (
                <View key={a.id} style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                  <Text style={[styles.panelText, { color: colors.text, fontSize: scaled(15) }]}>
                    #{a.id} · {a.finished_at ? new Date(a.finished_at).toLocaleDateString('vi-VN') : ''} · Band{' '}
                    {a.overallBand ?? '—'} (L {a.listeningBand ?? '—'} · R {a.readingBand ?? '—'})
                  </Text>
                  <Pressable
                    style={[styles.smallButton, { backgroundColor: colors.accent, opacity: saving === a.id ? 0.6 : 1 }]}
                    disabled={saving === a.id}
                    onPress={() => void saveAsDiagnostic(a.id)}
                  >
                    <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>
                      {saving === a.id ? 'Đang lưu…' : 'Lưu làm chẩn đoán'}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>(b) Bản đồ năng lực</Text>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : !diag ? (
            <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>
              Chưa có chẩn đoán. Làm bài thi thử full rồi lưu làm chẩn đoán để xem bản đồ năng lực.
            </Text>
          ) : (
            <View style={styles.blockGap}>
              <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
                Band ước lượng: Listening <Text style={{ fontWeight: '700' }}>{diag.bands?.listening ?? '—'}</Text> ·
                Reading <Text style={{ fontWeight: '700' }}>{diag.bands?.reading ?? '—'}</Text> · Tổng{' '}
                <Text style={{ fontWeight: '700' }}>Band {diag.bands?.overall ?? '—'}</Text>
                {diag.bands?.overall != null && (
                  <Text style={{ color: colors.muted }}> ({bandLevel(diag.bands.overall)})</Text>
                )}
                {diag.totalCorrect != null && <Text style={{ color: colors.muted }}> · {diag.totalCorrect} câu đúng</Text>}
              </Text>
              {diag.bySection && <ScoreTable title="Theo Section" data={diag.bySection} />}
              {diag.byPassage && <ScoreTable title="Theo Passage" data={diag.byPassage} />}
              {diag.byType && (
                <View style={styles.blockGap}>
                  <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(16) }]}>Theo dạng câu</Text>
                  {Object.entries(diag.byType).map(([t, v]) => (
                    <View key={t} style={styles.scoreRow}>
                      <Text style={[styles.scoreLabel, { color: colors.text, fontSize: scaled(14) }]}>
                        {questionTypeName(t)}
                      </Text>
                      <Text style={[styles.scoreValue, { color: colors.text, fontSize: scaled(14) }]}>
                        {v.correct}/{v.total} · {v.total ? `${Math.round((v.correct / v.total) * 100)}%` : '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {diag.weakestTypes?.length ? (
                <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
                  <Text style={{ fontWeight: '700' }}>3 dạng yếu nhất:</Text>{' '}
                  {diag.weakestTypes.slice(0, 3).map(questionTypeName).join(' · ')}
                </Text>
              ) : null}
              <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                Nên làm lại chẩn đoán rút gọn mỗi 2 tuần để thấy tiến bộ.
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>(c) Baseline Writing</Text>
          <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
            {SAMPLE_NOTE} {NO_AI_NOTE}
          </Text>
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={() => router.push('/writing')}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Mở màn Writing để nộp bài mẫu →</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>(d) Baseline Speaking</Text>
          <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
            {SAMPLE_NOTE} {NO_AI_NOTE}
          </Text>
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={() => router.push('/speaking')}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Mở màn Speaking để ghi âm bài mẫu →</Text>
          </Pressable>
        </View>
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
    gap: SPACING.md,
  },
  wrap: {
    flex: 1,
    paddingVertical: SPACING.lg,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: SPACING.sm,
  },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  sub: { flexWrap: 'wrap' },
  error: { flexWrap: 'wrap' },
  muted: { flexWrap: 'wrap' },
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    gap: SPACING.sm,
    width: '100%',
  },
  cardTitle: { fontWeight: '700', flexWrap: 'wrap' },
  cardText: { flexWrap: 'wrap' },
  blockGap: { gap: SPACING.sm, width: '100%' },
  panel: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    padding: SPACING.md,
    gap: SPACING.sm,
    width: '100%',
  },
  panelText: { flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  smallButton: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    alignSelf: 'flex-start',
  },
  outlineButton: { borderWidth: 1, backgroundColor: 'transparent' },
  smallButtonText: { fontWeight: '700', textAlign: 'center' },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm, width: '100%' },
  scoreLabel: { flex: 1, flexWrap: 'wrap' },
  scoreValue: { fontWeight: '700' },
  barTrack: { height: 10, borderRadius: 5, overflow: 'hidden', width: '100%' },
  barFill: { height: '100%', borderRadius: 5 },
  paperHeader: { gap: 2, width: '100%' },
  paperTitle: { fontWeight: '700', flexWrap: 'wrap' },
  paperSub: { flexWrap: 'wrap' },
  list: { gap: SPACING.md, paddingBottom: SPACING.md },
  tag: { flexWrap: 'wrap' },
  passage: { flexWrap: 'wrap' },
  script: { flexWrap: 'wrap' },
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
});
