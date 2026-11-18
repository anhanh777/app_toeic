// Luyện tập theo Part — port của frontend/src/pages/PracticeSession.tsx.
// Danh sách liên tục (1 FlatList, render theo cửa sổ): các câu cùng 1
// đoạn văn nhóm thành 1 khối (đoạn chỉ hiện 1 lần); câu Reading trắc
// nghiệm xếp 2 câu 1 hàng khi màn rộng (≥600dp), màn hẹp xếp 1 cột.
// Chấm tức thì từng câu (api.practiceAnswer); Part 1/2 TOEIC ẩn chữ
// trước khi trả lời từng câu; 1 nút nghe duy nhất cho cả Part khi luyện
// trong 1 bộ đề có audio cấp Part.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type Question } from '../api';
import { useExam, type ExamId } from '../exam';
import {
  columnsForWidth,
  horizontalPadding,
  LIST_DEFAULTS_WITH_MEDIA,
  MAX_CONTENT_WIDTH,
  RADIUS,
  SPACING,
} from '../layout';
import {
  isFillIn,
  partLabel,
  realQuestionNumber,
  wordCount,
} from '../lib';
import { useTextSize, useTheme } from '../theme';
import AudioPlayer from '../components/AudioPlayer';
import PassageView, { type BlankState } from '../components/PassageView';
import QuestionView, { isListeningOnly, partName, type AnswerResult } from '../components/QuestionView';

type Block = { key: string; passageText?: string; questions: { q: Question; n: number }[] };
type Row =
  | { key: string; kind: 'cluster'; block: Block }
  | { key: string; kind: 'duo'; items: { q: Question; n: number }[] }
  | { key: string; kind: 'single'; item: { q: Question; n: number } };

/** Nhóm các câu liên tiếp cùng 1 đoạn văn (như web: cùng passageId hoặc
 * cùng passageText) — đoạn chỉ hiện 1 lần. Số n là SỐ THẬT trong đề. */
function groupBlocks(questions: Question[], exam: ExamId): Block[] {
  const blocks: Block[] = [];
  const partCount: Record<number, number> = {};
  questions.forEach((q) => {
    const idx = (partCount[q.part] ?? 0) + 1;
    partCount[q.part] = idx;
    const n = realQuestionNumber(exam, q.part, idx);
    const last = blocks[blocks.length - 1];
    const sameId = !!q.passageId && !!last && last.questions[0]?.q.passageId === q.passageId;
    const sameText = !!q.passageText && !!last && last.passageText === q.passageText;
    if ((sameId || sameText) && last) last.questions.push({ q, n });
    else blocks.push({ key: q.id, passageText: q.passageText, questions: [{ q, n }] });
  });
  return blocks;
}

function isDuoQuestion(q: Question, exam: ExamId): boolean {
  const t = q.questionType || 'multiple_choice';
  return q.part >= 5 && (t === 'multiple_choice' || t === 'choosing_title') && !isListeningOnly(q, exam);
}

/** Chuyển blocks thành các hàng FlatList: khối có đoạn văn giữ nguyên;
 * các câu duo liên tiếp không có đoạn văn gom 2 câu 1 hàng (chỉ khi màn
 * rộng); còn lại mỗi câu 1 hàng. */
function buildRows(blocks: Block[], columns: 1 | 2, exam: ExamId): { rows: Row[]; rowByQuestionId: Map<string, number> } {
  const rows: Row[] = [];
  const rowByQuestionId = new Map<string, number>();
  let duoRun: { q: Question; n: number }[] = [];
  const flushDuo = (key: string) => {
    if (!duoRun.length) return;
    const idx = rows.length;
    duoRun.forEach(({ q }) => rowByQuestionId.set(q.id, idx));
    rows.push({ key, kind: 'duo', items: duoRun });
    duoRun = [];
  };
  for (const block of blocks) {
    const duoBlock = !block.passageText && block.questions.every(({ q }) => isDuoQuestion(q, exam));
    if (duoBlock && columns === 2) {
      duoRun.push(...block.questions);
      if (duoRun.length >= 2) {
        const pair = duoRun.slice(0, 2);
        duoRun = duoRun.slice(2);
        const idx = rows.length;
        pair.forEach(({ q }) => rowByQuestionId.set(q.id, idx));
        rows.push({ key: `duo-${pair[0].q.id}`, kind: 'duo', items: pair });
      }
      continue;
    }
    flushDuo(`duo-${block.key}`);
    if (block.passageText) {
      const idx = rows.length;
      block.questions.forEach(({ q }) => rowByQuestionId.set(q.id, idx));
      rows.push({ key: block.key, kind: 'cluster', block });
    } else {
      for (const item of block.questions) {
        const idx = rows.length;
        rowByQuestionId.set(item.q.id, idx);
        rows.push({ key: item.q.id, kind: 'single', item });
      }
    }
  }
  flushDuo('duo-last');
  return { rows, rowByQuestionId };
}

export default function PracticeSessionScreen() {
  const params = useLocalSearchParams<{ part?: string; testSetId?: string; exam?: string }>();
  const { exam: ctxExam } = useExam();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const columns = columnsForWidth(width);

  const part = Number(params.part || 5);
  const qExam = params.exam;
  const exam: ExamId = qExam === 'ielts' || qExam === 'toeic' ? qExam : ctxExam ?? 'toeic';
  const isIelts = exam === 'ielts';
  const testSetId = params.testSetId || undefined;

  const [testSetTitle, setTestSetTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedById, setSelectedById] = useState<Record<string, string>>({});
  const [resultById, setResultById] = useState<Record<string, AnswerResult>>({});
  const [guessedById, setGuessedById] = useState<Record<string, boolean>>({});
  const [causeById, setCauseById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState({ correct: 0, done: 0 });
  const [finished, setFinished] = useState(false);
  const [partMedia, setPartMedia] = useState<Record<number, string>>({});
  const [partMediaLoaded, setPartMediaLoaded] = useState(false);
  const listRef = useRef<FlatList<Row> | null>(null);

  // Đổi Part/đề/kỳ thi: reset toàn bộ state của buổi luyện ngay trong
  // lúc render (pattern "adjusting state when props change"); việc tải
  // câu hỏi nằm trong effect bên dưới.
  const sessionKey = `${part}|${testSetId ?? ''}|${exam}`;
  const [prevSessionKey, setPrevSessionKey] = useState(sessionKey);
  if (prevSessionKey !== sessionKey) {
    setPrevSessionKey(sessionKey);
    setLoading(true);
    // Part đọc (5–7) không có audio cấp Part nên coi như đã tải xong.
    setPartMediaLoaded(part > 4);
    setQuestions([]);
    setSelectedById({});
    setResultById({});
    setGuessedById({});
    setCauseById({});
    setScore({ correct: 0, done: 0 });
    setFinished(false);
    setError(null);
    setTestSetTitle('');
  }

  useEffect(() => {
    if (testSetId) api.testSet(testSetId).then((t) => setTestSetTitle(t.title)).catch(() => undefined);
    if (part <= 4) {
      (testSetId ? api.partMedia(testSetId) : Promise.resolve<Record<number, string>>({}))
        .then(setPartMedia)
        .catch(() => setPartMedia({}))
        .finally(() => setPartMediaLoaded(true));
    }
    api
      .questionsAll(part, testSetId, exam)
      .then(setQuestions)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [part, testSetId, exam]);

  const isListening = part <= 4;
  const usePartAudio = isListening && !!testSetId && !!partMedia[part];
  const ieltsNoAudio =
    isIelts && isListening && partMediaLoaded && !partMedia[part] && !questions.some((q) => q.audioUrl);

  const blocks = useMemo(() => groupBlocks(questions, exam), [questions, exam]);
  const { rows, rowByQuestionId } = useMemo(() => buildRows(blocks, columns, exam), [blocks, columns, exam]);

  // Đếm số lần mỗi tiêu đề được chọn (matching_headings) để cảnh báo khi
  // 2 câu trong cùng 1 passage chọn trùng 1 tiêu đề.
  const headingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach((q) => {
      if (q.questionType === 'matching_headings') {
        const v = selectedById[q.id];
        if (v) counts[v] = (counts[v] ?? 0) + 1;
      }
    });
    return counts;
  }, [questions, selectedById]);

  // Số câu theo số thật (cho chip Part 6 bấm để tới câu hỏi).
  const idByNum = useMemo(() => {
    const map: Record<number, string> = {};
    blocks.forEach((b) => b.questions.forEach(({ q, n }) => {
      map[n] = q.id;
    }));
    return map;
  }, [blocks]);

  // Callback ổn định (dùng ref đọc state mới nhất) để QuestionView memo
  // không bị phá mỗi lần parent re-render.
  const stateRef = useRef({ selectedById, resultById, questions });
  useEffect(() => {
    stateRef.current = { selectedById, resultById, questions };
  });

  const handleSelect = useCallback((id: string, v: string) => {
    setSelectedById((m) => ({ ...m, [id]: v }));
  }, []);
  const handleGuessedChange = useCallback((id: string, b: boolean) => {
    setGuessedById((m) => ({ ...m, [id]: b }));
  }, []);
  const handleCauseLogged = useCallback((id: string, code: string) => {
    setCauseById((m) => ({ ...m, [id]: code }));
  }, []);
  const handleAudioError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const handleSubmit = useCallback(
    async (id: string) => {
      const { selectedById: sel, resultById: res, questions: qs } = stateRef.current;
      const q = qs.find((x) => x.id === id);
      const selected = sel[id];
      if (!q || !selected || res[id]) return;
      if (isFillIn(q.questionType) && q.wordLimit != null && wordCount(selected) > q.wordLimit) {
        setError(`Quá giới hạn số từ cho câu này (tối đa ${q.wordLimit} từ). Hãy rút gọn đáp án rồi nộp lại.`);
        return;
      }
      try {
        const r = await api.practiceAnswer(q.id, selected);
        setResultById((m) => ({ ...m, [q.id]: r }));
        setScore((s) => ({ correct: s.correct + (r.correct ? 1 : 0), done: s.done + 1 }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const scrollToQuestion = useCallback(
    (num: number) => {
      const qid = idByNum[num];
      if (!qid) return;
      const idx = rowByQuestionId.get(qid);
      if (idx == null) return;
      try {
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5 });
      } catch {
        /* FlatList chưa render tới hàng đó — bỏ qua */
      }
    },
    [idByNum, rowByQuestionId],
  );

  const exit = useCallback(() => {
    if (testSetId) router.push({ pathname: '/test-set/[id]', params: { id: testSetId } });
    else router.push('/practice');
  }, [testSetId]);

  const renderQuestion = useCallback(
    (q: Question, n: number) => {
      const result = resultById[q.id] ?? null;
      // Part 1/2 TOEIC: ẩn chữ trước khi trả lời từng câu, trả lời xong
      // mới hiện lại đầy đủ.
      const hideText = exam === 'toeic' && (q.part === 1 || q.part === 2) && !result;
      return (
        <QuestionView
          q={q}
          n={n}
          exam={exam}
          selected={selectedById[q.id] ?? ''}
          onSelect={handleSelect}
          mode="practice"
          result={result}
          onSubmit={handleSubmit}
          guessed={!!guessedById[q.id]}
          onGuessedChange={handleGuessedChange}
          causeLogged={!!causeById[q.id]}
          onCauseLogged={handleCauseLogged}
          hideText={hideText}
          isListening={isListening}
          usePartAudio={usePartAudio}
          audioUrl={q.audioUrl || partMedia[q.part]}
          onAudioError={handleAudioError}
          duplicateHeading={
            q.questionType === 'matching_headings' && !!selectedById[q.id] && (headingCounts[selectedById[q.id]] ?? 0) > 1
          }
        />
      );
    },
    [
      exam, selectedById, resultById, guessedById, causeById, headingCounts,
      handleSelect, handleSubmit, handleGuessedChange, handleCauseLogged,
      handleAudioError, isListening, usePartAudio, partMedia,
    ],
  );

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'cluster') {
        const block = item.block;
        const bPart = block.questions[0]?.q.part ?? 0;
        const isReading = exam === 'toeic' ? bPart >= 6 : bPart >= 5;
        const isP6Block = exam === 'toeic' && bPart === 6;
        const blanks: Record<number, BlankState> = {};
        if (isP6Block) {
          for (const { q, n } of block.questions) {
            const sel = selectedById[q.id] ?? '';
            const res = resultById[q.id];
            if (sel || res) blanks[n] = { selected: sel || undefined, graded: res ? res.correct : null };
          }
        }
        const allDuo = block.questions.every(({ q }) => isDuoQuestion(q, exam));
        const qs = block.questions;
        const duoPairs: { q: Question; n: number }[][] = [];
        if (allDuo && columns === 2) {
          for (let i = 0; i < qs.length; i += 2) duoPairs.push(qs.slice(i, i + 2));
        }
        return (
          <View style={styles.cluster}>
            {block.passageText ? (
              <View style={[styles.passage, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <PassageView
                  text={block.passageText}
                  isP6={isP6Block}
                  blanks={blanks}
                  onBlankClick={scrollToQuestion}
                  wordLookup={isReading}
                />
              </View>
            ) : null}
            {duoPairs.length ? (
              duoPairs.map((pair) => (
                <View key={pair[0].q.id} style={styles.duoRow}>
                  {pair.map(({ q, n }) => (
                    <View key={q.id} style={styles.duoCell}>
                      {renderQuestion(q, n)}
                    </View>
                  ))}
                  {pair.length === 1 ? <View style={styles.duoCell} /> : null}
                </View>
              ))
            ) : (
              qs.map(({ q, n }) => <View key={q.id}>{renderQuestion(q, n)}</View>)
            )}
          </View>
        );
      }
      if (item.kind === 'duo') {
        return (
          <View style={styles.duoRow}>
            {item.items.map(({ q, n }) => (
              <View key={q.id} style={styles.duoCell}>
                {renderQuestion(q, n)}
              </View>
            ))}
            {item.items.length === 1 ? <View style={styles.duoCell} /> : null}
          </View>
        );
      }
      return renderQuestion(item.item.q, item.item.n);
    },
    [colors, columns, exam, renderQuestion, resultById, scrollToQuestion, selectedById],
  );

  const pad = horizontalPadding(width);

  if (loading || (isListening && !!testSetId && !partMediaLoaded)) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{ color: colors.muted, fontSize: scaled(15) }}>Đang tải câu hỏi…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!questions.length) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.center, { paddingHorizontal: pad }]}>
          {error ? <Text style={{ color: colors.danger, fontSize: scaled(15) }}>{error}</Text> : null}
          <Text style={{ color: colors.text, fontSize: scaled(16), textAlign: 'center' }}>
            Chưa có câu hỏi cho {isIelts ? partLabel(part, exam) : `Part ${part}`} này.
          </Text>
          <Pressable style={[styles.button, { backgroundColor: colors.accent }]} onPress={exit}>
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Quay lại</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (finished) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.center, { paddingHorizontal: pad }]}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text, fontSize: scaled(22) }]}>Hoàn thành!</Text>
            {testSetTitle ? (
              <Text style={[styles.line, { color: colors.muted, fontSize: scaled(15) }]}>📚 {testSetTitle}</Text>
            ) : null}
            <Text style={[styles.big, { color: colors.text, fontSize: scaled(28) }]}>
              {score.correct}/{score.done} câu đúng
            </Text>
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(15) }]}>
              {score.done ? `Tỉ lệ đúng: ${Math.round((score.correct / score.done) * 100)}%` : ''}
            </Text>
            <View style={styles.btnRow}>
              <Pressable style={[styles.button, styles.flexButton, { backgroundColor: colors.accent }]} onPress={exit}>
                <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
                  {testSetId ? 'Quay lại đề thi' : 'Luyện Part khác'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.flexButton, { backgroundColor: colors.surfaceMuted }]}
                onPress={() => router.push('/')}
              >
                <Text style={[styles.buttonText, { color: colors.text, fontSize: scaled(15) }]}>Về trang chủ</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { paddingHorizontal: pad }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            {testSetTitle ? (
              <Text style={[styles.tag, { color: colors.muted, fontSize: scaled(13) }]}>📚 {testSetTitle}</Text>
            ) : null}
            <Text style={[styles.title, { color: colors.text, fontSize: scaled(20) }]}>
              {isIelts
                ? `${partLabel(part, exam)} — ${part <= 4 ? 'Listening' : 'Reading'}`
                : partName(part)}
            </Text>
          </View>
          <Text style={[styles.badge, { color: colors.text, fontSize: scaled(14), borderColor: colors.border }]}>
            Đã làm {score.done}/{questions.length}
          </Text>
        </View>
        {error ? <Text style={{ color: colors.danger, fontSize: scaled(14) }}>{error}</Text> : null}
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          onScrollToIndexFailed={() => {
            /* hàng chưa render — bỏ qua, người dùng tự cuộn */
          }}
          ListHeaderComponent={
            usePartAudio || ieltsNoAudio ? (
              <View style={styles.listHead}>
                {usePartAudio ? (
                  <>
                    <AudioPlayer audioUrl={partMedia[part]} stopKey={`part-${part}`} onError={handleAudioError} />
                    <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                      🎧 Nghe cả {isIelts ? `Section ${part}` : `Part ${part}`} — bấm 1 lần rồi làm hết các câu của{' '}
                      {isIelts ? 'Section' : 'Part'} trong lúc nghe.
                    </Text>
                  </>
                ) : null}
                {ieltsNoAudio ? (
                  <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                    📌 Bộ đề mẫu chưa có audio — bạn vẫn làm bài bình thường.
                  </Text>
                ) : null}
              </View>
            ) : undefined
          }
          {...LIST_DEFAULTS_WITH_MEDIA}
        />
        <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Text style={[styles.progress, { color: colors.text, fontSize: scaled(14) }]}>
            Đã làm {score.done}/{questions.length} • Đúng {score.correct}
          </Text>
          <Pressable style={[styles.barButton, { borderColor: colors.border }]} onPress={exit}>
            <Text style={{ color: colors.text, fontSize: scaled(15) }}>🚪 Thoát</Text>
          </Pressable>
          <Pressable style={[styles.barButton, { backgroundColor: colors.accent }]} onPress={() => setFinished(true)}>
            <Text style={{ color: colors.onAccent, fontSize: scaled(15), fontWeight: '700' }}>Xem kết quả</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingTop: SPACING.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap', marginBottom: SPACING.sm },
  headerText: { flexShrink: 1, gap: 2 },
  tag: { flexWrap: 'wrap' },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  badge: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  list: { gap: SPACING.md, paddingBottom: SPACING.md },
  listHead: { gap: SPACING.sm },
  cluster: { gap: SPACING.md },
  passage: { borderWidth: 1, borderRadius: RADIUS.card, padding: SPACING.md },
  duoRow: { flexDirection: 'row', gap: SPACING.md, width: '100%' },
  duoCell: { flex: 1, minWidth: 0 },
  line: { flexWrap: 'wrap' },
  big: { fontWeight: '700', textAlign: 'center' },
  card: { borderWidth: 1, borderRadius: RADIUS.card, padding: SPACING.lg, gap: SPACING.md, width: '100%', alignItems: 'center' },
  btnRow: { flexDirection: 'row', gap: SPACING.md, width: '100%' },
  button: { borderRadius: RADIUS.button, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  flexButton: { flex: 1 },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  bottomBar: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: SPACING.sm,
    flexWrap: 'wrap',
  },
  progress: { flexGrow: 1, flexShrink: 1, flexWrap: 'wrap' },
  barButton: { borderWidth: 1, borderRadius: RADIUS.button, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, minHeight: 44, justifyContent: 'center' },
});
