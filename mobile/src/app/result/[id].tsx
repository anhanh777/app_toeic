// Kết quả thi thử — port của frontend/src/pages/Result.tsx.
// GET /api/tests/:id/result: hiện TẤT CẢ câu (không chỉ câu sai), lọc
// Tất cả / ✓ Đúng / ✗ Sai + số lượng, số câu thật, badge trạng thái,
// giải thích/transcript/đoạn văn. IELTS câu sai/chưa trả lời bị cổng
// sau RootCausePicker (phải ghi nguyên nhân gốc mới hiện đáp án đúng).
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { api, scoreLevel, type TestResultDetail } from '../../api';
import { bandLevel, isFillIn, isMultiAnswer, parseSelectedLabels, partNameFor, realQuestionNumber, stripLeadingNumber } from '../../lib';
import { horizontalPadding, LIST_DEFAULTS, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../../layout';
import { useTextSize, useTheme } from '../../theme';
import RootCausePicker, { skillOfPart } from '../../components/RootCausePicker';
import { TierBadge } from '../../components/TierBadge';
import { WordText } from '../../components/WordLookup';
import { partName } from '../../components/QuestionView';

type Filter = 'all' | 'correct' | 'wrong';

interface DetailRow {
  d: TestResultDetail;
  n: number;
}

export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.testResult>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [causeById, setCauseById] = useState<Record<string, string>>({});
  const [guessedById, setGuessedById] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!id) return;
    api
      .testResult(Number(id))
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const handleCauseLogged = useCallback((qid: string, code: string) => {
    setCauseById((m) => ({ ...m, [qid]: code }));
  }, []);
  const toggleExpanded = useCallback((qid: string) => {
    setExpanded((m) => ({ ...m, [qid]: !m[qid] }));
  }, []);

  const pad = horizontalPadding(width);
  const attemptId = id ? Number(id) : undefined;

  const detailRows: DetailRow[] = useMemo(() => {
    if (!data) return [];
    const isIelts = data.exam === 'ielts' || data.overallBand != null;
    const withinSeen: Record<number, number> = {};
    return (data.detail ?? []).map((d) => {
      const p = d.part ?? 0;
      withinSeen[p] = (withinSeen[p] ?? 0) + 1;
      return { d, n: realQuestionNumber(isIelts ? 'ielts' : 'toeic', p, withinSeen[p]) };
    });
  }, [data]);

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.center, { paddingHorizontal: pad }]}>
          <Text style={{ color: colors.danger, fontSize: scaled(15) }}>{error}</Text>
          <Pressable style={[styles.button, { backgroundColor: colors.accent }]} onPress={() => router.push('/')}>
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Về trang chủ</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
  if (!data) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{ color: colors.muted, fontSize: scaled(15) }}>Đang tải kết quả…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const mode = (data as { mode?: string }).mode;
  const isFull = mode === 'full';
  const isIelts = data.exam === 'ielts' || data.overallBand != null;
  const totalCorrect = (data.listening_correct ?? 0) + (data.reading_correct ?? 0);
  const detailAll = data.detail ?? [];
  const correctCount = detailAll.filter((d) => d.correct === true).length;
  const wrongCount = detailAll.length - correctCount;
  const filtered =
    filter === 'correct'
      ? detailRows.filter((r) => r.d.correct === true)
      : filter === 'wrong'
        ? detailRows.filter((r) => r.d.correct !== true)
        : detailRows;

  const renderRow = ({ item }: { item: DetailRow }) => {
    const { d, n } = item;
    const causeLogged = !!causeById[d.questionId];
    const status = d.correct === true ? '✓ Đúng' : d.correct === false ? '✗ Sai' : '— Chưa trả lời';
    const statusColor = d.correct === true ? colors.success : d.correct === false ? colors.danger : colors.muted;
    const isReadingPassage = isIelts ? (d.part ?? 0) >= 5 : (d.part ?? 0) >= 6;
    const showTranscript = expanded[`t-${d.questionId}`];
    const showPassage = expanded[`p-${d.questionId}`];
    return (
      <View style={[styles.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
          <Text style={{ fontWeight: '700' }}>
            Câu {n} · <Text style={{ color: statusColor }}>{status}</Text>
          </Text>
          {d.content ? <> — {stripLeadingNumber(d.content, n)}</> : null}
        </Text>
        {isIelts && d.correct !== true && !causeLogged ? (
          <View style={styles.gate}>
            <Pressable onPress={() => setGuessedById((m) => ({ ...m, [d.questionId]: !m[d.questionId] }))}>
              <Text style={{ color: colors.text, fontSize: scaled(15) }}>
                {guessedById[d.questionId] ? '☑' : '☐'} Câu này mình đoán mò 🤔
              </Text>
            </Pressable>
            <RootCausePicker
              skill={d.part ? skillOfPart(d.part) : ''}
              questionId={d.questionId}
              attemptId={attemptId}
              questionType={d.questionType}
              guessed={!!guessedById[d.questionId]}
              onLogged={(code) => handleCauseLogged(d.questionId, code)}
            />
          </View>
        ) : (
          <>
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
              {isFillIn(d.questionType) ? 'Đáp án bạn gõ: ' : 'Đáp án bạn chọn: '}
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {isMultiAnswer(d.questionType) ? parseSelectedLabels(d.selected).join(', ') || '—' : d.selected ?? '—'}
              </Text>
              {' • '}Đáp án đúng:{' '}
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {isMultiAnswer(d.questionType)
                  ? parseSelectedLabels(d.correctLabel).join(', ') || d.correctText || '—'
                  : d.correctText ?? d.correctLabel ?? '—'}
              </Text>
            </Text>
            {d.explanation ? (
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
                <Text style={{ fontWeight: '700' }}>Giải thích: </Text>
                {d.explanation}
              </Text>
            ) : (
              <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>Chưa có giải thích chi tiết trong file đáp án.</Text>
            )}
            {d.script ? (
              <View style={styles.detailBlock}>
                <Pressable onPress={() => toggleExpanded(`t-${d.questionId}`)}>
                  <Text style={{ color: colors.accent, fontSize: scaled(14), fontWeight: '700' }}>
                    {showTranscript ? '▾ Ẩn transcript' : '▸ Xem transcript'}
                  </Text>
                </Pressable>
                {showTranscript ? <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>{d.script}</Text> : null}
              </View>
            ) : null}
            {d.passageText ? (
              <View style={styles.detailBlock}>
                <Pressable onPress={() => toggleExpanded(`p-${d.questionId}`)}>
                  <Text style={{ color: colors.accent, fontSize: scaled(14), fontWeight: '700' }}>
                    {showPassage ? '▾ Ẩn đoạn văn' : '▸ Xem đoạn văn'}
                  </Text>
                </Pressable>
                {showPassage ? (
                  isReadingPassage ? (
                    <WordText text={d.passageText} />
                  ) : (
                    <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>{d.passageText}</Text>
                  )
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { paddingHorizontal: pad }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: scaled(22) }]}>Kết quả thi thử</Text>
        {isIelts ? (
          isFull && data.overallBand != null ? (
            <View style={[styles.card, styles.centerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>Band tổng (band ước lượng để tham khảo)</Text>
              <Text style={[styles.big, { color: colors.text, fontSize: scaled(32) }]}>Band {data.overallBand}</Text>
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>Mức: {bandLevel(data.overallBand)}</Text>
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
                {'★'.repeat(data.overallBand >= 8 ? 3 : data.overallBand >= 6.5 ? 2 : 1)}
                {'☆'.repeat(data.overallBand >= 8 ? 0 : data.overallBand >= 6.5 ? 1 : 2)}
              </Text>
              <View style={styles.scoreRow}>
                <View style={[styles.scoreBox, { backgroundColor: colors.surfaceMuted }]}>
                  <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>🎧 Listening</Text>
                  <Text style={[styles.big, { color: colors.text, fontSize: scaled(20) }]}>Band {data.listeningBand ?? '—'}</Text>
                  <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>{data.listening_correct ?? 0}/40 câu đúng</Text>
                </View>
                <View style={[styles.scoreBox, { backgroundColor: colors.surfaceMuted }]}>
                  <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>📖 Reading</Text>
                  <Text style={[styles.big, { color: colors.text, fontSize: scaled(20) }]}>Band {data.readingBand ?? '—'}</Text>
                  <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>{data.reading_correct ?? 0}/40 câu đúng</Text>
                </View>
              </View>
              <Text style={[styles.line, { color: colors.muted, fontSize: scaled(13) }]}>
                Band ước lượng theo bảng quy đổi tham khảo công khai, không phải band chính thức.
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.big, { color: colors.text, fontSize: scaled(22) }]}>{totalCorrect} câu đúng</Text>
              <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                Bài thi mini (1 Section/Passage) chỉ báo số câu đúng/tổng, không có band.
              </Text>
            </View>
          )
        ) : isFull && data.total_score != null ? (
          <View style={[styles.card, styles.centerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>Tổng điểm (điểm ước lượng)</Text>
            <Text style={[styles.big, { color: colors.text, fontSize: scaled(32) }]}>{data.total_score} / 990</Text>
            <TierBadge total={data.total_score} />
            <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>Mức: {scoreLevel(data.total_score)}</Text>
            <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
              {'★'.repeat(data.total_score >= 900 ? 3 : data.total_score >= 600 ? 2 : 1)}
              {'☆'.repeat(data.total_score >= 900 ? 0 : data.total_score >= 600 ? 1 : 2)}
            </Text>
            <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
              Listening: {data.listening_score ?? '—'} ({data.listening_correct ?? 0} câu đúng) • Reading: {data.reading_score ?? '—'} (
              {data.reading_correct ?? 0} câu đúng)
            </Text>
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(13) }]}>
              Điểm ước lượng theo bảng quy đổi tham khảo công khai, không phải điểm chính thức của ETS.
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.big, { color: colors.text, fontSize: scaled(22) }]}>{totalCorrect} câu đúng</Text>
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
              Bài thi mini (1 Part) chỉ báo số câu đúng/tổng, không có điểm 10–990.
            </Text>
          </View>
        )}
        {data.byPart ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: scaled(18) }]}>
              {isIelts ? 'Điểm theo Section/Passage' : 'Điểm theo Part'}
            </Text>
            {data.byPart.map((b) => (
              <View key={b.part} style={styles.byPartRow}>
                <View style={styles.byPartHead}>
                  <Text style={{ color: colors.text, fontSize: scaled(15) }}>{isIelts ? partNameFor(b.part, 'ielts') : partName(b.part)}</Text>
                  <Text style={{ color: colors.text, fontSize: scaled(15) }}>
                    {b.correct}/{b.total}
                  </Text>
                </View>
                <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
                  <View style={[styles.barFill, { width: `${b.total ? (b.correct / b.total) * 100 : 0}%`, backgroundColor: colors.accent }]} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
        {detailAll.length ? (
          <View style={styles.detailWrap}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: scaled(18) }]}>
              Chi tiết từng câu ({correctCount}/{detailAll.length} đúng)
            </Text>
            {wrongCount === 0 ? (
              <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>🎉 Không có câu sai!</Text>
            ) : null}
            <View style={styles.tabs}>
              {(
                [
                  ['all', `Tất cả (${detailAll.length})`],
                  ['correct', `✓ Đúng (${correctCount})`],
                  ['wrong', `✗ Sai (${wrongCount})`],
                ] as [Filter, string][]
              ).map(([f, label]) => (
                <Pressable
                  key={f}
                  style={[styles.tab, { borderColor: colors.border }, filter === f && { backgroundColor: colors.accent }]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={{ color: filter === f ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '700' }}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(r) => r.d.questionId}
              renderItem={renderRow}
              contentContainerStyle={styles.list}
              {...LIST_DEFAULTS}
            />
            {/* Chuẩn web Result.tsx:194-204 — nút ôn lại câu sai cuối khối chi tiết. */}
            <Pressable
              style={[styles.button, { backgroundColor: colors.accent }]}
              onPress={() => router.push('/wrong')}
            >
              <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Ôn lại câu sai</Text>
            </Pressable>
          </View>
        ) : data.wrongQuestionIds?.length ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: scaled(18) }]}>Câu làm sai ({data.wrongQuestionIds.length})</Text>
            <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>{data.wrongQuestionIds.join(', ')}</Text>
            <Pressable
              style={[styles.button, { backgroundColor: colors.accent }]}
              onPress={() => router.push('/wrong')}
            >
              <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Ôn lại câu sai</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>🎉 Không có câu sai!</Text>
          </View>
        )}
        <View style={styles.btnRow}>
          <Pressable style={[styles.button, styles.flexButton, { backgroundColor: colors.accent }]} onPress={() => router.push('/mock')}>
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Thi thử lại</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.flexButton, { backgroundColor: colors.surfaceMuted }]} onPress={() => router.push('/')}>
            <Text style={[styles.buttonText, { color: colors.text, fontSize: scaled(15) }]}>Về trang chủ</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingTop: SPACING.md, gap: SPACING.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  card: { borderWidth: 1, borderRadius: RADIUS.card, padding: SPACING.sm, gap: SPACING.xs, width: '100%' },
  centerCard: { alignItems: 'center' },
  big: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  line: { flexWrap: 'wrap' },
  sectionTitle: { fontWeight: '700', flexWrap: 'wrap' },
  scoreRow: { flexDirection: 'row', gap: SPACING.md, width: '100%' },
  scoreBox: { flex: 1, borderRadius: RADIUS.card, padding: SPACING.sm, gap: SPACING.xs, alignItems: 'center' },
  byPartRow: { gap: 4 },
  byPartHead: { flexDirection: 'row', justifyContent: 'space-between' },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  barFill: { height: '100%', borderRadius: 4 },
  detailWrap: { flex: 1, gap: SPACING.sm },
  tabs: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  tab: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  list: { gap: SPACING.sm, paddingBottom: SPACING.md },
  rowCard: { borderWidth: 1, borderRadius: RADIUS.card, padding: SPACING.sm, gap: SPACING.xs, width: '100%' },
  gate: { gap: SPACING.sm },
  detailBlock: { gap: SPACING.xs },
  btnRow: { flexDirection: 'row', gap: SPACING.md, width: '100%', paddingBottom: SPACING.sm },
  button: { borderRadius: RADIUS.button, paddingVertical: SPACING.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  flexButton: { flex: 1 },
  buttonText: { fontWeight: '700', textAlign: 'center' },
});
