// Thi thử — port của frontend/src/pages/MockTest.tsx.
// - Màn setup: thi mini 1 Part/Section/Passage, hoặc thi full (TOEIC 120
//   phút / IELTS L+R 80 câu 90 phút), chọn đề thi khi thi full.
// - Trong bài: danh sách liên tục (FlatList), đồng hồ đếm ngược, hết giờ
//   tự nộp; đáp án lưu tự động sau mỗi câu (api.saveTestAnswer); thoát
//   2 lần bấm → hủy bài (api.abandonTest); nộp → api.submitTest → trang
//   kết quả. Part 1/2 TOEIC ẩn chữ suốt bài thi.
// - IELTS: mỗi Section audio chỉ phát 1 lần (playOnce).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Attempt, type Question, type TestSet } from '../api';
import { useExam, type ExamId } from '../exam';
import {
  CARD_PADDING,
  columnsForWidth,
  horizontalPadding,
  LIST_DEFAULTS_WITH_MEDIA,
  MAX_CONTENT_WIDTH,
  RADIUS,
  SPACING,
} from '../layout';
import { partLabel, partNameFor, realQuestionNumber } from '../lib';
import { livelyCard, livelyChip, raisedButton, useTextSize, useTheme } from '../theme';
import { BottomNav } from '../components/BottomNav';
import { TabScreen } from '../components/TabScreen';
import { BackButton } from '../components/BackButton';
import { LoadingLine } from '../components/LoadingLine';
import AudioPlayer from '../components/AudioPlayer';
import PassageView, { type BlankState } from '../components/PassageView';
import QuestionView, { isListeningOnly, partName } from '../components/QuestionView';

type Block = { key: string; part: number; passageText?: string; questions: { q: Question; n: number }[] };
type Row =
  | { key: string; kind: 'cluster'; block: Block; headerPart?: number }
  | { key: string; kind: 'duo'; items: { q: Question; n: number }[]; headerPart?: number }
  | { key: string; kind: 'single'; item: { q: Question; n: number }; headerPart?: number };

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Ngay nop bai (dd/mm/yyyy HH:mm) + thoi gian lam (mm:ss, hoac hh:mm:ss
// neu tren 1 gio) — dung cho khoi "Lich su thi thu". Dinh dang tay thay
// vi toLocaleDateString('vi-VN') (Hermes khong chac co du lieu locale).
function fmtMockDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDur(s?: number | null): string {
  if (s == null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

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
    else blocks.push({ key: q.id, part: q.part, passageText: q.passageText, questions: [{ q, n }] });
  });
  return blocks;
}

function isDuoQuestion(q: Question, exam: ExamId): boolean {
  const t = q.questionType || 'multiple_choice';
  return q.part >= 5 && (t === 'multiple_choice' || t === 'choosing_title') && !isListeningOnly(q, exam);
}

function buildRows(blocks: Block[], columns: 1 | 2, exam: ExamId): Row[] {
  const rows: Row[] = [];
  let duoRun: { q: Question; n: number }[] = [];
  let prevPart = -1;
  const headerFor = (p: number): number | undefined => {
    if (p === prevPart) return undefined;
    prevPart = p;
    return p;
  };
  const flushDuo = (key: string, headerPart?: number) => {
    if (!duoRun.length) return;
    rows.push({ key, kind: 'duo', items: duoRun, headerPart });
    duoRun = [];
  };
  for (const block of blocks) {
    const duoBlock = !block.passageText && block.questions.every(({ q }) => isDuoQuestion(q, exam));
    if (duoBlock && columns === 2) {
      const headerPart = headerFor(block.part);
      duoRun.push(...block.questions);
      if (duoRun.length >= 2) {
        const pair = duoRun.slice(0, 2);
        duoRun = duoRun.slice(2);
        rows.push({ key: `duo-${pair[0].q.id}`, kind: 'duo', items: pair, headerPart });
      }
      continue;
    }
    const headerPart = headerFor(block.part);
    flushDuo(`duo-${block.key}`);
    if (block.passageText) {
      rows.push({ key: block.key, kind: 'cluster', block, headerPart });
    } else {
      for (const item of block.questions) {
        rows.push({ key: item.q.id, kind: 'single', item, headerPart: item === block.questions[0] ? headerPart : undefined });
      }
    }
  }
  flushDuo('duo-last');
  return rows;
}

export default function MockTestScreen() {
  const params = useLocalSearchParams<{ testSetId?: string; exam?: string }>();
  const { exam: ctxExam } = useExam();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const columns = columnsForWidth(width);

  const paramTestSetId = params.testSetId || undefined;
  const [testSet, setTestSet] = useState<TestSet | null>(null);
  const qExam = params.exam;
  const exam: ExamId =
    qExam === 'ielts' || qExam === 'toeic'
      ? qExam
      : testSet?.exam === 'ielts' || testSet?.exam === 'toeic'
        ? testSet.exam
        : ctxExam ?? 'toeic';
  const isIelts = exam === 'ielts';

  const [mode, setMode] = useState<'mini' | 'full'>('mini');
  const [part, setPart] = useState(5);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  // Menu ⋮ (Phương án A): Nộp/Thoát dời khỏi thanh dưới vào bottom-sheet
  // mở từ icon ⋮ ở thanh tiêu đề. Nộp bài 1 lần bấm như cũ; chỉ Thoát
  // giữ 2 lần bấm để xác nhận. Đóng sheet thì hủy trạng thái "bấm lại"
  // của Thoát để lần mở sau phải xác nhận lại từ đầu.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setConfirmExit(false);
  }, []);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [partMedia, setPartMedia] = useState<Record<number, string>>({});
  const [playedSections, setPlayedSections] = useState<Record<number, boolean>>({});
  // Đề thật đang thi — mini không kèm đề thì backend chọn ngẫu nhiên 1
  // đề và trả testSetId của đề đó (xem start()); full thì là đề đã chọn
  // (param/selected). Dùng để biết Part nào có audio cấp Part: chỉ
  // render 1 AudioPlayer cấp Part, không vẽ player riêng từng câu.
  const [resolvedTestSetId, setResolvedTestSetId] = useState<string | undefined>(undefined);
  const submittedRef = useRef(false);

  // IELTS full: 80 câu, 90 phút. Mini IELTS: 1 Section Listening 30 phút,
  // 1 Passage Reading 20 phút. TOEIC: full/mini đều 120 phút (như web).
  const fullMinutes = isIelts ? 90 : 120;
  const miniMinutes = isIelts ? (part <= 4 ? 30 : 20) : 120;

  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [selectedTestSetId, setSelectedTestSetId] = useState('');
  // Lich su thi thu DA NOP (GET /api/tests/history: chi mini/full, toi
  // da 50) — hien o khoi "Lich su thi thu" duoi form chon de. API tra ca
  // bai dang lam do (chua co finishedAt) nen loc lai khi render.
  const [mockHistory, setMockHistory] = useState<Attempt[]>([]);

  // Chưa chọn kỳ thi thì không vào được — về màn chọn, nhớ đích đến.
  // (Không áp khi đang thi, hoặc khi link mang sẵn ?exam=.)
  useEffect(() => {
    if (!attemptId && !ctxExam && !qExam) {
      router.replace({ pathname: '/', params: { next: '/mock' } });
    }
  }, [attemptId, ctxExam, qExam]);

  useEffect(() => {
    if (paramTestSetId) api.testSet(paramTestSetId).then(setTestSet).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [paramTestSetId]);

  useEffect(() => {
    if (!paramTestSetId) {
      api.testSets(exam).then(setTestSets).catch(() => undefined);
      api.testHistory(exam).then(setMockHistory).catch(() => undefined);
    }
  }, [exam, paramTestSetId]);

  const markPlayed = useCallback((p: number) => {
    setPlayedSections((m) => ({ ...m, [p]: true }));
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const tsId = paramTestSetId || selectedTestSetId || undefined;
      try {
        setPartMedia(tsId ? await api.partMedia(tsId) : {});
      } catch {
        setPartMedia({});
      }
      const minutes = paramTestSetId ? fullMinutes : mode === 'mini' ? miniMinutes : fullMinutes;
      const t = paramTestSetId
        ? await api.createTest('full', undefined, fullMinutes, paramTestSetId, exam)
        : await api.createTest(mode, mode === 'mini' ? part : undefined, minutes, tsId, exam);
      // Mini không kèm đề: backend chọn ngẫu nhiên 1 đề và trả về testSetId
      // của đề đó — tải audio theo đề được chọn để nghe đúng file audio.
      // Khớp web (38cb1c6). Nếu đã tải theo đề đã chọn thì bỏ qua.
      if (t.testSetId && t.testSetId !== tsId) {
        try { setPartMedia(await api.partMedia(t.testSetId)); } catch { /* giữ {} */ }
      }
      // Lưu đề thật đang thi (fallback về đề đã chọn): mini không kèm đề
      // thì đây là đề backend chọn ngẫu nhiên; partAudioAvailable dùng
      // nó để bật AudioPlayer cấp Part thay vì player riêng từng câu.
      // Full "Toàn bộ ngân hàng": backend trả testSetId = null nên giữ
      // undefined — giới hạn thiết kế, không có audio cấp Part.
      setResolvedTestSetId(t.testSetId || tsId);
      setAttemptId(t.attemptId);
      setSecondsLeft(t.durationSec || minutes * 60);
      setLoadingQuestions(true);
      // Tải từng câu theo id — theo lô 10 câu song song để nhanh hơn
      // vòng lặp tuần tự của web (thứ tự câu giữ nguyên).
      const qs: Question[] = [];
      for (let i = 0; i < t.questionIds.length; i += 10) {
        const batch = await Promise.all(
          t.questionIds.slice(i, i + 10).map((id) => api.question(id).catch(() => null)),
        );
        for (const q of batch) if (q) qs.push(q);
      }
      setQuestions(qs);
      setAnswers({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setLoadingQuestions(false);
    }
  }, [paramTestSetId, selectedTestSetId, fullMinutes, miniMinutes, mode, part, exam]);

  const submit = useCallback(async () => {
    if (!attemptId || submittedRef.current) return;
    submittedRef.current = true;
    try {
      await api.submitTest(attemptId);
      router.replace({ pathname: '/result/[id]', params: { id: String(attemptId) } });
    } catch (e) {
      submittedRef.current = false;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [attemptId]);

  const timerRunning = attemptId != null && secondsLeft > 0;
  useEffect(() => {
    if (!timerRunning) return;
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [timerRunning]);

  useEffect(() => {
    if (attemptId && secondsLeft <= 0 && !submittedRef.current) void submit();
  }, [secondsLeft, attemptId, submit]);

  const saveAnswer = useCallback(async (questionId: string, value: string) => {
    if (!attemptId) return;
    try {
      await api.saveTestAnswer(attemptId, questionId, value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [attemptId]);

  // Callback ổn định cho QuestionView (memo): chỉ đổi đáp án local ở
  // onSelect, autosave ở onCommit.
  const handleSelect = useCallback((id: string, v: string) => {
    setAnswers((a) => ({ ...a, [id]: v }));
  }, []);
  const handleCommit = useCallback(
    (id: string, v: string) => {
      void saveAnswer(id, v);
    },
    [saveAnswer],
  );
  const handleAudioError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const exitTest = useCallback(async () => {
    if (!confirmExit) {
      setConfirmExit(true);
      return;
    }
    if (attemptId) {
      try {
        await api.abandonTest(attemptId);
      } catch {
        /* vẫn thoát */
      }
    }
    router.replace('/');
  }, [confirmExit, attemptId]);

  // Nộp bài từ sheet ⋮: 1 lần bấm như cũ — nộp 1 lần duy nhất
  // (submittedRef trong submit()); hết giờ vẫn tự nộp, không qua sheet.
  const submitFromMenu = useCallback(() => {
    closeMenu();
    void submit();
  }, [closeMenu, submit]);

  // ---- Khoi "Lich su thi thu" (man chon de): chi bai DA NOP (co
  // finishedAt); bai dang lam do khong hien o day. "Lam lai" chi chon san
  // dung de + dung che do, KHONG tu bat dau thi. Mini khong kem de nen chi
  // can chon dung Part; full toan ngan hang thi chi can chon che do full.
  const testSetTitleById = useMemo(() => new Map(testSets.map((t) => [t.id, t.title])), [testSets]);
  const submittedHistory = useMemo(
    () => mockHistory.filter((a) => a.finishedAt || a.finished_at),
    [mockHistory],
  );
  const redoAttempt = useCallback(
    (a: Attempt) => {
      if (a.mode === 'mini') {
        setMode('mini');
        if (a.part) setPart(a.part);
      } else if (a.testSetId) {
        router.push({ pathname: '/mock', params: { testSetId: a.testSetId, exam } });
      } else {
        setMode('full');
        setSelectedTestSetId('');
      }
    },
    [exam],
  );

  const blocks = useMemo(() => groupBlocks(questions, exam), [questions, exam]);
  const rows = useMemo(() => buildRows(blocks, columns, exam), [blocks, columns, exam]);
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;
  const partAudioAvailable = useCallback((p: number) => p <= 4 && !!resolvedTestSetId && !!partMedia[p], [resolvedTestSetId, partMedia]);

  const renderQuestion = useCallback(
    (q: Question, n: number) => {
      // Part 1/2 TOEIC: trong bài thi chỉ hiện tranh + audio + nút
      // A/B/C/D, KHÔNG hiện chữ câu hỏi/phương án suốt bài thi.
      const hideText = exam === 'toeic' && (q.part === 1 || q.part === 2);
      return (
        <QuestionView
          q={q}
          n={n}
          exam={exam}
          selected={answers[q.id] ?? ''}
          onSelect={handleSelect}
          onCommit={handleCommit}
          mode="mock"
          hideText={hideText}
          isListening={q.part <= 4}
          usePartAudio={partAudioAvailable(q.part)}
          audioUrl={q.audioUrl || partMedia[q.part]}
          playOnce={isIelts}
          onFirstPlay={markPlayed}
          onAudioError={handleAudioError}
        />
      );
    },
    [exam, answers, handleSelect, handleCommit, partAudioAvailable, partMedia, isIelts, markPlayed, handleAudioError],
  );

  const renderPartHeader = useCallback(
    (p: number) => {
      const partAudio = partAudioAvailable(p);
      // Part nghe không có audio: chỉ 1 thông báo ở đầu Part, không vẽ
      // hộp "chưa có audio" trong từng câu (QuestionView chỉ vẽ player
      // khi có file thật). IELTS giữ thông báo cũ cả khi thi full ngân
      // hàng; TOEIC chỉ báo khi đã biết rõ đề (resolvedTestSetId) — thi
      // full "Toàn bộ ngân hàng" không biết audio của từng đề nên không
      // kết luận.
      const noAudio =
        p <= 4 && !partMedia[p] && !questions.some((q) => q.part === p && q.audioUrl) &&
        (isIelts || !!resolvedTestSetId);
      return (
        <View style={styles.partHeader}>
          <Text style={[styles.partTitle, { color: colors.text, fontSize: scaled(18) }]}>
            {isIelts ? partNameFor(p, exam) : partName(p)}
          </Text>
          {partAudio ? (
            <>
              <AudioPlayer
                audioUrl={partMedia[p]}
                stopKey={`part-${p}`}
                playOnce={isIelts}
                onFirstPlay={() => markPlayed(p)}
                onError={handleAudioError}
              />
              <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                🎧 Nghe cả {isIelts ? `Section ${p}` : `Part ${p}`} —{' '}
                {isIelts
                  ? 'thi thử: audio mỗi Section chỉ phát 1 lần, bấm 1 lần rồi làm hết các câu của Section trong lúc nghe.'
                  : 'bấm 1 lần rồi làm hết các câu của Part trong lúc nghe.'}
              </Text>
              {isIelts && playedSections[p] ? (
                <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>✓ Đã phát Section này (thi thử chỉ phát 1 lần).</Text>
              ) : null}
            </>
          ) : null}
          {noAudio ? (
            <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
              {isIelts
                ? '📌 Bộ đề mẫu chưa có audio — bạn vẫn làm bài bình thường.'
                : '📌 Part này chưa có file audio — bạn vẫn làm bài bình thường.'}
            </Text>
          ) : null}
        </View>
      );
    },
    [colors, exam, handleAudioError, isIelts, markPlayed, partMedia, playedSections, questions, scaled, partAudioAvailable, resolvedTestSetId],
  );

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      const header = item.headerPart != null ? renderPartHeader(item.headerPart) : null;
      if (item.kind === 'cluster') {
        const block = item.block;
        const bPart = block.questions[0]?.q.part ?? 0;
        const isReading = exam === 'toeic' ? bPart >= 6 : bPart >= 5;
        const isP6Block = exam === 'toeic' && bPart === 6;
        const blanks: Record<number, BlankState> = {};
        if (isP6Block) {
          for (const { q, n } of block.questions) {
            const sel = answers[q.id] ?? '';
            if (sel) blanks[n] = { selected: sel };
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
            {header}
            {block.passageText ? (
              <View style={[styles.passage, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, livelyCard(colors, 'card')]}>
                <PassageView text={block.passageText} isP6={isP6Block} blanks={blanks} wordLookup={isReading} />
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
          <View style={styles.cluster}>
            {header}
            <View style={styles.duoRow}>
              {item.items.map(({ q, n }) => (
                <View key={q.id} style={styles.duoCell}>
                  {renderQuestion(q, n)}
                </View>
              ))}
              {item.items.length === 1 ? <View style={styles.duoCell} /> : null}
            </View>
          </View>
        );
      }
      return (
        <View style={styles.cluster}>
          {header}
          {renderQuestion(item.item.q, item.item.n)}
        </View>
      );
    },
    [colors, columns, exam, renderPartHeader, renderQuestion, answers],
  );

  const pad = horizontalPadding(width);
  // Khoảng cách trên cùng: inset tường minh thay vì chỉ trông vào
  // SafeAreaView — trên máy cô ấy header từng vẽ lấn lên status bar
  // (tiêu đề bị cắt nửa + dải tối ở trên khi mở sheet ⋮). Lấy max của
  // inset hệ thống và chiều cao status bar Android để chắc chắn header
  // nằm gọn dưới notch/status bar trên mọi máy.
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, StatusBar.currentHeight ?? 0) + SPACING.md;

  // ---------- Màn setup (chưa bắt đầu) ----------
  if (!attemptId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <TabScreen href="/mock">
        {/* Màn setup phải cuộn được: thi full liệt kê 28 đề nên nút
          "Bắt đầu thi" nằm dưới đáy màn hình nhỏ — trước đây dùng View
          thường nên không lướt xuống được. */}
        <ScrollView
          style={styles.setupScroll}
          contentContainerStyle={[styles.setupContent, { paddingHorizontal: pad }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <BackButton />
            <Text style={[styles.title, { color: colors.text, fontSize: scaled(22) }]}>Thi thử</Text>
          </View>
          {error ? <Text style={{ color: colors.danger, fontSize: scaled(15) }}>{error}</Text> : null}
          {paramTestSetId ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
              <Text style={[styles.title, { color: colors.text, fontSize: scaled(18) }]}>Thi thử cả đề</Text>
              {testSet ? (
                <>
                  <Text style={[styles.line, { color: colors.text, fontSize: scaled(16), fontWeight: '700' }]}>{testSet.title}</Text>
                  {testSet.description ? (
                    <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>{testSet.description}</Text>
                  ) : null}
                  <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
                    <Text style={{ fontWeight: '700' }}>{testSet.totalQuestions}</Text> câu • {fullMinutes} phút
                  </Text>
                  <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                    {testSet.parts.map((p) => `${partLabel(p.part, exam)} ${p.count}`).join(' · ')}
                  </Text>
                  {testSet.missing.length > 0 ? (
                    <Text style={[styles.line, { color: colors.danger, fontSize: scaled(14) }]}>
                      ⚠ Đề chưa đủ câu chuẩn: {testSet.missing.map((m) => `${partLabel(m.part, exam)} thiếu ${m.missing} câu`).join(', ')}.
                    </Text>
                  ) : null}
                </>
              ) : (
                <LoadingLine location="table" />
              )}
              <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                Làm đủ {testSet?.totalQuestions || ''} câu, hết giờ tự nộp. Đáp án được lưu tự động sau mỗi câu.{' '}
                {isIelts ? (
                  <>
                    Band thi thử là <Text style={{ fontWeight: '700' }}>band ước lượng để tham khảo</Text> (thang 0–9).
                  </>
                ) : (
                  <>
                    Điểm thi thử là <Text style={{ fontWeight: '700' }}>điểm ước lượng</Text> (thang 10–990).
                  </>
                )}
              </Text>
              {isIelts ? (
                <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                  🎧 Thi thử: audio mỗi Section chỉ phát 1 lần — bấm nghe khi đã sẵn sàng làm các câu của Section đó.
                </Text>
              ) : null}
              <Pressable
                style={[styles.button, { backgroundColor: colors.accent }, (busy || !testSet || !testSet.totalQuestions) && styles.disabled, raisedButton(colors)]}
                disabled={busy || !testSet || !testSet.totalQuestions}
                onPress={() => void start()}
              >
                <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>{busy ? 'Đang tạo đề…' : 'Bắt đầu thi'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
              <Text style={[styles.label, { color: colors.text, fontSize: scaled(15) }]}>Loại bài thi</Text>
              <View style={styles.tabs}>
                <Pressable
                  style={[styles.tab, { borderColor: colors.border }, mode === 'mini' && { backgroundColor: colors.accent }, livelyChip(colors)]}
                  onPress={() => setMode('mini')}
                >
                  <Text style={{ color: mode === 'mini' ? colors.onAccent : colors.text, fontSize: scaled(15), fontWeight: '700' }}>
                    {isIelts ? 'Thi mini — 1 Section/Passage' : 'Thi mini — 1 Part'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, { borderColor: colors.border }, mode === 'full' && { backgroundColor: colors.accent }, livelyChip(colors)]}
                  onPress={() => setMode('full')}
                >
                  <Text style={{ color: mode === 'full' ? colors.onAccent : colors.text, fontSize: scaled(15), fontWeight: '700' }}>
                    {isIelts ? 'Thi full — Listening + Reading (80 câu, 90 phút)' : 'Thi full — toàn bộ ngân hàng, 120 phút'}
                  </Text>
                </Pressable>
              </View>
              {mode === 'mini' ? (
                <>
                  <Text style={[styles.label, { color: colors.text, fontSize: scaled(15) }]}>
                    {isIelts ? 'Chọn Section/Passage' : 'Chọn Part'}
                  </Text>
                  <View style={styles.partGrid}>
                    {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                      <Pressable
                        key={p}
                        style={[styles.partChip, { borderColor: part === p ? colors.accent : colors.border, backgroundColor: part === p ? colors.surfaceMuted : colors.surface }, livelyChip(colors)]}
                        onPress={() => setPart(p)}
                      >
                        <Text style={{ color: colors.text, fontSize: scaled(14), textAlign: 'center' }}>
                          {isIelts ? `${partNameFor(p, exam)} — ${p <= 4 ? 'Listening' : 'Reading'}` : partName(p)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.label, { color: colors.text, fontSize: scaled(15) }]}>Chọn đề thi</Text>
                  <View style={styles.setList}>
                    <Pressable
                      style={[styles.setRow, { borderColor: selectedTestSetId === '' ? colors.accent : colors.border, backgroundColor: selectedTestSetId === '' ? colors.surfaceMuted : colors.surface }, livelyCard(colors, 'compact')]}
                      onPress={() => setSelectedTestSetId('')}
                    >
                      <Text style={{ color: colors.text, fontSize: scaled(15) }}>Toàn bộ ngân hàng</Text>
                    </Pressable>
                    {testSets.map((s) => (
                      <Pressable
                        key={s.id}
                        style={[styles.setRow, { borderColor: selectedTestSetId === s.id ? colors.accent : colors.border, backgroundColor: selectedTestSetId === s.id ? colors.surfaceMuted : colors.surface }, livelyCard(colors, 'compact')]}
                        onPress={() => setSelectedTestSetId(s.id)}
                      >
                        <Text style={{ color: colors.text, fontSize: scaled(15) }}>
                          {s.title} ({s.totalQuestions} câu)
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                    Chọn một đề để thi thử cả đề đó; để nguyên “Toàn bộ ngân hàng” để thi từ tất cả các đề.
                  </Text>
                </>
              )}
              <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                Thi full: làm đủ {fullMinutes} phút, hết giờ tự nộp. Đáp án được lưu tự động sau mỗi câu.{' '}
                {isIelts ? (
                  <>
                    Band thi thử là <Text style={{ fontWeight: '700' }}>band ước lượng để tham khảo</Text> (thang 0–9). Bài mini chỉ báo số
                    câu đúng/tổng, không có band.
                  </>
                ) : (
                  <>
                    Điểm thi thử là <Text style={{ fontWeight: '700' }}>điểm ước lượng</Text> (thang 10–990). Bài mini chỉ báo số câu
                    đúng/tổng, không có điểm 10–990.
                  </>
                )}
              </Text>
              {isIelts ? (
                <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                  🎧 Thi thử: audio mỗi Section chỉ phát 1 lần — bấm nghe khi đã sẵn sàng làm các câu của Section đó.
                </Text>
              ) : null}
              <Pressable style={[styles.button, { backgroundColor: colors.accent }, busy && styles.disabled, raisedButton(colors)]} disabled={busy} onPress={() => void start()}>
                <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>{busy ? 'Đang tạo đề…' : 'Bắt đầu thi'}</Text>
              </Pressable>
            </View>
          )}
          {!paramTestSetId ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'card')]}>
              <Text style={[styles.label, { color: colors.text, fontSize: scaled(16) }]}>📜 Lịch sử thi thử</Text>
              {submittedHistory.length === 0 ? (
                <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>Chưa có bài thi thử nào — làm 1 bài để xem lịch sử nhé.</Text>
              ) : (
                submittedHistory.map((a) => {
                  const correct = (a.listeningCorrect ?? a.listening_correct ?? 0) + (a.readingCorrect ?? a.reading_correct ?? 0);
                  const total = a.questionCount ?? 0;
                  const score = isIelts
                    ? a.overallBand != null
                      ? `Band ${a.overallBand} (L ${a.listeningBand ?? '—'} • R ${a.readingBand ?? '—'})`
                      : '—'
                    : (a.totalScore ?? a.total_score) != null
                      ? `${a.totalScore ?? a.total_score} điểm`
                      : '—';
                  return (
                    <View
                      key={a.id}
                      style={[styles.histRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }, livelyCard(colors, 'compact')]}
                    >
                      <Text style={[styles.line, { color: colors.text, fontSize: scaled(15), fontWeight: '700' }]}>
                        {a.testSetId ? (testSetTitleById.get(a.testSetId) ?? a.testSetId) : 'Toàn bộ ngân hàng'}
                      </Text>
                      <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>
                        {fmtMockDate(a.finishedAt || a.finished_at)} •{' '}
                        {a.mode === 'mini' ? (a.part ? `Mini — ${partLabel(a.part, exam)}` : 'Mini') : 'Full'}
                      </Text>
                      <Text style={[styles.line, { color: colors.text, fontSize: scaled(14) }]}>
                        {score} • {fmtDur(a.durationSec ?? a.duration_sec)} • Đúng {total ? `${correct}/${total}` : `${correct}`} câu
                      </Text>
                      <View style={styles.histBtns}>
                        <Pressable
                          style={[styles.histBtn, { borderColor: colors.border }, livelyChip(colors)]}
                          onPress={() => router.push({ pathname: '/result/[id]', params: { id: String(a.id) } })}
                          accessibilityRole="button"
                        >
                          <Text style={{ color: colors.accent, fontSize: scaled(14), fontWeight: '700' }}>Xem lại</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.histBtn, { borderColor: colors.border }, livelyChip(colors)]}
                          onPress={() => redoAttempt(a)}
                          accessibilityRole="button"
                        >
                          <Text style={{ color: colors.text, fontSize: scaled(14), fontWeight: '700' }}>Làm lại</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}
        </ScrollView>
        </TabScreen>
        <BottomNav />
      </SafeAreaView>
    );
  }

  // ---------- Đang thi ----------
  if (!questions.length || loadingQuestions) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <LoadingLine location="page" text="Đang tải đề thi…" />
        {error ? (
          <Text style={{ color: colors.danger, fontSize: scaled(15), textAlign: 'center', padding: 16 }}>{error}</Text>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { paddingHorizontal: pad, paddingTop: topPad }]}>
        {/* Thanh tiêu đề (Phương án A): tiêu đề + đồng hồ + icon ⋮.
            Số câu đã trả lời + Nộp/Thoát dời vào bottom-sheet của ⋮. */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontSize: scaled(18) }, styles.headerTitle]}>
            {testSet ? testSet.title : 'Thi thử'}
          </Text>
          <Text
            style={[
              styles.timer,
              { color: secondsLeft < 300 ? colors.danger : colors.text, fontSize: scaled(16), borderColor: colors.border },
              livelyChip(colors),
            ]}
          >
            ⏱ {fmt(secondsLeft)}
          </Text>
          <Pressable
            style={[styles.menuBtn, { borderColor: colors.border }, livelyChip(colors)]}
            onPress={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            accessibilityLabel="Mở menu thi thử"
            accessibilityRole="button"
          >
            <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
          </Pressable>
        </View>
        {error ? <Text style={{ color: colors.danger, fontSize: scaled(14) }}>{error}</Text> : null}
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          {...LIST_DEFAULTS_WITH_MEDIA}
        />
        <Text style={[styles.line, { color: colors.muted, fontSize: scaled(13) }]}>Nộp bài chỉ 1 lần. Hết giờ hệ thống tự nộp.</Text>
      </View>
      {/* statusBarTranslucent={false}: sheet không vẽ lấn lên vùng status
          bar — nền mờ chỉ phủ phần nội dung, không tạo dải tối ở trên. */}
      <Modal visible={menuOpen} transparent animationType="slide" statusBarTranslucent={false} onRequestClose={closeMenu}>
        <Pressable style={styles.sheetBackdrop} onPress={closeMenu}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
              colors.style === 'lively' && styles.sheetLively,
              { paddingBottom: Math.max(insets.bottom, SPACING.lg) },
            ]}
            onPress={() => {
              /* bấm trong sheet không đóng modal */
            }}
          >
            <Text style={[styles.sheetHead, { color: colors.text, fontSize: scaled(16) }]}>
              Đã trả lời {answeredCount}/{questions.length} câu
            </Text>
            <Pressable
              style={[styles.sheetRow, { borderColor: colors.border }, livelyCard(colors, 'compact')]}
              onPress={submitFromMenu}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetRowText, { color: colors.accent, fontSize: scaled(16) }]}>
                {`✅ Nộp bài · ${answeredCount}/${questions.length} câu (còn ${unansweredCount} câu chưa làm)`}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.sheetRow, { borderColor: colors.border }, livelyCard(colors, 'compact')]}
              onPress={() => void exitTest()}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetRowText, { color: colors.danger, fontSize: scaled(16) }]}>
                {confirmExit ? '⚠️ Bấm lại để thoát (sẽ hủy bài thi này)' : '🚪 Thoát (sẽ hủy bài thi này)'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.sheetRow, { borderColor: colors.border }, livelyCard(colors, 'compact')]}
              onPress={closeMenu}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetRowText, { color: colors.muted, fontSize: scaled(16) }]}>Đóng</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingTop: SPACING.md },
  // Màn setup: ScrollView cuộn (xem ghi chú ở TabScreen) — nội dung căn
  // giữa tối đa 720dp như các màn khác, đáy chừa 12dp khỏi BottomNav.
  setupScroll: { flex: 1, width: '100%' },
  setupContent: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingTop: SPACING.md, paddingBottom: SPACING.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap', marginBottom: SPACING.sm },
  headerTitle: { flex: 1, flexShrink: 1, flexWrap: 'wrap' },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  timer: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontWeight: '700', fontVariant: ['tabular-nums'] },
  // Nút ⋮ mở menu thi thử (Phương án A): tròn, viền 1px; lively thêm
  // viền 2px + bóng cứng dưới qua livelyChip (đặt cuối mảng style).
  menuBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // Bottom-sheet menu ⋮ — mẫu theo WordLookupModal: nền mờ bấm ngoài
  // để đóng, sheet trượt từ dưới lên, bo góc trên.
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: MAX_CONTENT_WIDTH,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  sheetLively: { borderWidth: 2, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHead: { fontWeight: '700', flexWrap: 'wrap' },
  sheetRow: { borderWidth: 1, borderRadius: RADIUS.button, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, minHeight: 48, justifyContent: 'center' },
  sheetRowText: { fontWeight: '700', flexWrap: 'wrap' },
  list: { gap: SPACING.sm, paddingBottom: SPACING.md },
  cluster: { gap: SPACING.sm },
  passage: { borderWidth: 1, borderRadius: RADIUS.card, padding: CARD_PADDING },
  duoRow: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  duoCell: { flex: 1, minWidth: 0 },
  partHeader: { gap: SPACING.sm },
  partTitle: { fontWeight: '700', flexWrap: 'wrap' },
  line: { flexWrap: 'wrap' },
  card: { borderWidth: 1, borderRadius: RADIUS.card, padding: SPACING.md, gap: SPACING.sm, width: '100%' },
  label: { fontWeight: '700', flexWrap: 'wrap' },
  tabs: { gap: SPACING.sm },
  tab: { borderWidth: 1, borderRadius: RADIUS.button, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, alignItems: 'center' },
  partGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  partChip: { borderWidth: 1, borderRadius: RADIUS.button, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, flexGrow: 1, flexBasis: '45%', maxWidth: '48%', justifyContent: 'center' },
  setList: { gap: SPACING.sm },
  setRow: { borderWidth: 1, borderRadius: RADIUS.button, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  // Khoi "Lich su thi thu": 1 dong / 1 lan thi (tieu de + ngay/che do +
  // diem/thoi gian/cau dung + 2 nut Xem lai / Lam lai).
  histRow: { borderWidth: 1, borderRadius: RADIUS.button, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, gap: 2 },
  histBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  histBtn: { borderWidth: 1, borderRadius: RADIUS.button, paddingVertical: 6, paddingHorizontal: SPACING.md, alignItems: 'center' },
  button: { borderRadius: RADIUS.button, paddingVertical: SPACING.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.6 },
});
