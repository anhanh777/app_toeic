// Chẩn đoán IELTS — port từ frontend/src/pages/Diagnostic.tsx.
// (a) Listening+Reading: làm mock full TS-028 (90 phút) ngay trong màn
// này (màn Thi thử Phase 1 chưa có trong bản build này nên bài chẩn
// đoán tự vẽ tờ đề rút gọn: FlatList + windowing, audio từng câu) rồi
// lưu 1 attempt làm chẩn đoán; (b) bản đồ năng lực từ diagnostic/latest;
// (c) baseline Writing; (d) baseline Speaking (link sang 2 màn riêng,
// kèm param baseline=1 để màn đó nộp với isBaseline: true như web).
// Tất cả baseline đều ghi rõ "Bài mẫu — nội dung tự soạn, chưa phải đề
// thi thật" và "Chưa chấm AI — sẽ có ở Giai đoạn 2".
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ApiError, api, type Attempt, type DiagnosticMap, type Question } from '../api';
import { CARD_PADDING, horizontalPadding, LIST_DEFAULTS, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { bandLevel, isFillIn, isMultiAnswer, paperNumbersFor, parseSelectedLabels, partLabel, partNameFor, questionTypeName, toggleSelectedLabel, wordCount } from '../lib';
import { livelyBarTrack, livelyCard, livelyChip, livelyOption, raisedButton, useTextSize, useTheme } from '../theme';
import AudioPlayer from '../components/AudioPlayer';
import { BackButton } from '../components/BackButton';
import { useConfirm } from '../components/ConfirmDialog';
import { LoadingLine } from '../components/LoadingLine';
import { fmtClock } from './writing';

const SAMPLE_NOTE = 'Bài mẫu — nội dung tự soạn, chưa phải đề thi thật.';
const NO_AI_NOTE = 'Chưa chấm AI — tính năng này sẽ có sau.';
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
              livelyChip(colors),
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
    // Số nhãn phải chọn = số câu trên đề mà row này gộp (2–3); dữ liệu cũ
    // chưa có paperSpan thì giữ gợi ý chung "2–3".
    const need = q.paperSpan && q.paperSpan > 1 ? q.paperSpan : null;
    return (
      <View style={styles.optList}>
        <Text style={[styles.hint, { color: colors.muted, fontSize: scaled(13) }]}>
          {need ? `💡 Chọn ${need} đáp án — mỗi đáp án đúng tính 1 điểm.` : '💡 Chọn 2–3 đáp án — mỗi đáp án đúng tính 1 điểm.'}
        </Text>
        {q.options.map((o) => {
          const isSel = selected.includes(o.label);
          return (
            <Pressable
              key={o.label}
              onPress={() => {
                // Chặn chọn quá số nhãn cần: đã đủ thì không bật thêm.
                if (!isSel && need && selected.length >= need) return;
                onChange(toggleSelectedLabel(value, o.label));
              }}
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
          style={[styles.input, { borderColor: over ? colors.danger : colors.border, color: colors.text, fontSize: scaled(16) }, livelyCard(colors, 'compact')]}
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
              livelyOption(colors, isSel ? 'selected' : 'default'),
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
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }, livelyBarTrack(colors)]}>
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
  const confirm = useConfirm();
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
  // Thi thử IELTS: audio mỗi câu chỉ phát 1 lần (như Mock — playOnce):
  // đã bắt đầu phát thì ghi nhận, vẫn tạm dừng/tiếp tục được trong lần
  // phát đó; phát xong thì nút bị vô hiệu, không nghe lại được.
  const [playedQids, setPlayedQids] = useState<Record<string, boolean>>({});
  const [pausedQid, setPausedQid] = useState<string | null>(null);
  // Audio cấp Section cho phần Listening (TS-028 có đủ Part 1–4 trong
  // data/part-media.json): 1 AudioPlayer mỗi Section ở đầu Section,
  // playOnce như màn Thi thử (mock.tsx). 0 câu trong seed có audioUrl
  // nên trước đây Listening chẩn đoán không nghe được gì.
  const [partMedia, setPartMedia] = useState<Record<number, string>>({});
  const [playedSections, setPlayedSections] = useState<Record<number, boolean>>({});
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
    if (diagStatus.didJustFinish) {
      setPlayingQid(null);
      setPausedQid(null);
    }
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
      // Audio cấp Section (TS-028, Cam 21 Test 1): tải 1 lần khi bắt đầu,
      // lỗi thì coi như không có audio (vẫn làm bài được).
      try {
        setPartMedia(await api.partMedia(DIAGNOSTIC_SET));
      } catch {
        setPartMedia({});
      }
      setPlayedSections({});
      const all = await api.questionsAll(undefined, DIAGNOSTIC_SET, 'ielts');
      // Giữ đúng thứ tự questionIds mà backend đã tạo attempt.
      const byId = new Map(all.map((q) => [q.id, q]));
      const ordered = created.questionIds.map((id) => byId.get(id)).filter((q): q is Question => !!q);
      if (!ordered.length) throw new Error('Không tải được câu hỏi của đề TS-028.');
      setAttemptId(created.attemptId);
      setPaperQuestions(ordered);
      setPaperAnswers({});
      setPlayedQids({});
      setPausedQid(null);
      setPlayingQid(null);
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

  const abandonPaper = useCallback(async () => {
    const ok = await confirm({
      title: 'Thoát bài chẩn đoán?',
      message: 'Bài làm chưa nộp sẽ bị hủy.',
      confirmText: 'Thoát',
      cancelText: 'Ở lại',
      danger: true,
    });
    if (!ok) return;
    if (attemptId) void api.abandonTest(attemptId).catch(() => undefined);
    diagPlayer.pause();
    setPlayingQid(null);
    setPausedQid(null);
    setPaperActive(false);
    setAttemptId(null);
  }, [attemptId, diagPlayer, confirm]);

  const markPlayed = useCallback((p: number) => {
    setPlayedSections((m) => ({ ...m, [p]: true }));
  }, []);

  const handleAudioError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const playAudio = useCallback((qid: string, url: string) => {
    try {
      // Đang phát câu này → tạm dừng (vẫn tiếp tục được trong lần phát đó).
      if (playingQid === qid) {
        diagPlayer.pause();
        setPlayingQid(null);
        setPausedQid(qid);
        return;
      }
      // Đang tạm dừng câu này → tiếp tục nghe hết lần phát duy nhất.
      if (pausedQid === qid) {
        diagPlayer.play();
        setPlayingQid(qid);
        setPausedQid(null);
        return;
      }
      // Đã phát xong 1 lần rồi → không phát lại.
      if (playedQids[qid]) return;
      diagPlayer.replace(url);
      diagPlayer.play();
      setPlayingQid(qid);
      setPlayedQids((m) => ({ ...m, [qid]: true }));
    } catch {
      setPlayingQid(null);
    }
  }, [playingQid, pausedQid, playedQids, diagPlayer]);

  const setAnswer = useCallback((id: string, v: string) => {
    setPaperAnswers((m) => ({ ...m, [id]: v }));
  }, []);

  const answeredCount = paperQuestions.filter((q) => paperAnswers[q.id]?.trim()).length;
  // Số câu thật trên đề: câu gộp list_selection chiếm 2–3 số (label
  // "11–12") nên các câu sau vẫn giữ đúng số, dù danh sách chỉ còn
  // 77 row (TS-028 gộp 3 cặp) thay vì 80.
  const paperNumbers = useMemo(() => paperNumbersFor('ielts', paperQuestions), [paperQuestions]);
  const keyExtractor = useCallback((q: Question) => q.id, []);
  const renderPaperItem = useCallback(
    ({ item: q, index }: { item: Question; index: number }) => {
      const prev = index > 0 ? paperQuestions[index - 1] : null;
      const paperLabel = paperNumbers.get(q.id)?.label ?? `${index + 1}`;
      const showPassage = !!q.passageText && q.passageId !== prev?.passageId;
      const value = paperAnswers[q.id] ?? '';
      // Đầu mỗi Section Listening: 1 AudioPlayer cấp Section (mẫu
      // mock.tsx) — câu đầu tiên của Section mới là mốc. Không lộ
      // transcript (script không render ở đây, như trước).
      const isFirstOfSection = q.part <= 4 && (index === 0 || prev?.part !== q.part);
      const sectionAudio = q.part <= 4 ? partMedia[q.part] : undefined;
      const sectionNoAudio =
        q.part <= 4 && !sectionAudio && !paperQuestions.some((x) => x.part === q.part && x.audioUrl);
      return (
        <>
          {isFirstOfSection ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(16) }]}>
                {partNameFor(q.part, 'ielts')} — Listening
              </Text>
              {sectionAudio ? (
                <>
                  <AudioPlayer
                    audioUrl={sectionAudio}
                    stopKey={`section-${q.part}`}
                    playOnce
                    onFirstPlay={() => markPlayed(q.part)}
                    onError={handleAudioError}
                  />
                  <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                    🎧 Nghe cả Section {q.part} — thi thử: audio mỗi Section chỉ phát 1 lần, bấm 1 lần rồi làm hết
                    các câu của Section trong lúc nghe.
                  </Text>
                  {playedSections[q.part] ? (
                    <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                      ✓ Đã phát Section này (thi thử chỉ phát 1 lần).
                    </Text>
                  ) : null}
                </>
              ) : null}
              {sectionNoAudio ? (
                <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                  📌 Bộ đề mẫu chưa có audio — bạn vẫn làm bài bình thường.
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
          <Text style={[styles.tag, { color: colors.muted, fontSize: scaled(13) }]}>
            Câu {paperLabel}/80 · {partLabel(q.part, 'ielts')}
            {q.questionType ? ` · ${questionTypeName(q.questionType)}` : ''}
          </Text>
          {showPassage && (
            <Text style={[styles.passage, { color: colors.text, fontSize: scaled(15) }]}>{q.passageText}</Text>
          )}
          {/* Transcript (script) KHÔNG hiện trong lúc làm bài — nếu đề có
              script thì bài nghe thành bài đọc. Chỉ xem ở màn kết quả
              sau khi chấm (như web: transcript ở trang Result). */}
          {/* Nút nghe từng câu chỉ khi KHÔNG có audio cấp Section: 2
              nguồn phát cùng 1 Section sẽ chồng tiếng (AudioPlayer chỉ
              tự dừng các AudioPlayer khác qua activeStop, còn nút này
              dùng diagPlayer riêng). Trong seed 0 câu có audioUrl nên
              nhánh này thực tế không hiện với TS-028. */}
          {q.audioUrl && !partMedia[q.part] ? (
            <Pressable
              style={[
                styles.smallButton,
                styles.outlineButton,
                { borderColor: colors.border, opacity: playedQids[q.id] && playingQid !== q.id && pausedQid !== q.id ? 0.6 : 1 },
              ]}
              disabled={!!playedQids[q.id] && playingQid !== q.id && pausedQid !== q.id}
              onPress={() => void playAudio(q.id, q.audioUrl as string)}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>
                {playingQid === q.id
                  ? '⏸ Dừng audio'
                  : pausedQid === q.id
                    ? '▶ Tiếp tục'
                    : playedQids[q.id]
                      ? '✓ Đã nghe 1 lần'
                      : '▶ Nghe audio câu này (1 lần)'}
              </Text>
            </Pressable>
          ) : null}
          <Text style={[styles.content, { color: colors.text, fontSize: scaled(16) }]}>{q.content}</Text>
          <PaperAnswerControl q={q} value={value} onChange={(v) => setAnswer(q.id, v)} />
          </View>
        </>
      );
    },
    [paperQuestions, paperNumbers, paperAnswers, colors, scaled, playingQid, pausedQid, playedQids, playAudio, setAnswer, partMedia, playedSections, markPlayed, handleAudioError],
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
              Đã trả lời {answeredCount}/{paperQuestions.length} · Nghe 1 lần (audio từng Section)
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
              style={[styles.button, { backgroundColor: colors.accent, flex: 2, opacity: submitting ? 0.6 : 1 }, raisedButton(colors)]}
              onPress={() => {
                void (async () => {
                  const ok = await confirm({
                    title: 'Nộp bài chẩn đoán?',
                    message: `Bạn đã trả lời ${answeredCount}/${paperQuestions.length} câu. Nộp xong sẽ lưu làm chẩn đoán.`,
                    confirmText: 'Nộp bài',
                    cancelText: 'Chưa',
                  });
                  if (ok) void submitPaper();
                })();
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
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={[styles.title, { flex: 1, color: colors.text, fontSize: scaled(24) }]}>🧭 Chẩn đoán IELTS</Text>
        </View>
        <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
          Biết mình đang ở đâu trước khi luyện — gồm Listening + Reading và bài mẫu Writing/Speaking.
        </Text>
        {error ? (
          <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
        ) : null}
        <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>{SAMPLE_NOTE}</Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
            (a) Listening + Reading — thi thử full 90 phút
          </Text>
          <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
            Làm bài thi thử đầy đủ (TS-028, 80 câu, 90 phút, nghe 1 lần) rồi lưu làm chẩn đoán.
          </Text>
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent, opacity: paperLoading ? 0.6 : 1 }, raisedButton(colors)]}
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
                <View key={a.id} style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, livelyCard(colors, 'compact')]}>
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

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>(b) Bản đồ năng lực</Text>
          {loading ? (
            <LoadingLine location="table" />
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

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>(c) Baseline Writing</Text>
          <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
            {SAMPLE_NOTE} {NO_AI_NOTE}
          </Text>
          <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
            Bài nộp từ đây được đánh dấu là bài mẫu chẩn đoán.
          </Text>
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent }, raisedButton(colors)]}
            onPress={() => router.push({ pathname: '/writing', params: { baseline: '1' } })}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Mở màn Writing để nộp bài mẫu →</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>(d) Baseline Speaking</Text>
          <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
            {SAMPLE_NOTE} {NO_AI_NOTE}
          </Text>
          <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
            Bản ghi lưu từ đây được đánh dấu là bài mẫu chẩn đoán.
          </Text>
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent }, raisedButton(colors)]}
            onPress={() => router.push({ pathname: '/speaking', params: { baseline: '1' } })}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Mở màn Speaking để ghi âm bài mẫu →</Text>
          </Pressable>
        </View>
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
  wrap: {
    flex: 1,
    paddingVertical: SPACING.md,
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
    padding: SPACING.md,
    gap: SPACING.xs,
    width: '100%',
  },
  cardTitle: { fontWeight: '700', flexWrap: 'wrap' },
  cardText: { flexWrap: 'wrap' },
  blockGap: { gap: SPACING.sm, width: '100%' },
  panel: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    padding: CARD_PADDING,
    gap: SPACING.xs,
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
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
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
  list: { gap: SPACING.sm, paddingBottom: SPACING.md },
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
