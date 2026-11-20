// "Hôm nay" — port từ frontend/src/pages/Today.tsx. Dùng chung cho CẢ 2
// kỳ thi (GET /api/today?exam=<exam>, alias /api/ielts/today cho IELTS).
// - TOEIC: khối 1 link vào /wrong; khối 2/3 link vào màn Luyện tập
//   Phase 1 (/practice) + nút đánh dấu đã luyện.
// - IELTS: khối ôn lỗi inline, drill dạng yếu, skim/dictation inline.
// Streak + bad-day dùng chung cho cả 2 kỳ thi, 1 streak duy nhất.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState, type ElementRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, api, type BadDayTask, type ErrorLogEntry, type Question, type TodayData, type WeeklyError } from '../api';
import { useExam } from '../exam';
import { CARD_PADDING, horizontalPadding, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { bandLevel, isFillIn, isMultiAnswer, parseSelectedLabels, partLabel, questionTypeName, toggleSelectedLabel, wordCount } from '../lib';
import { raisedButton, useTextSize, useTheme } from '../theme';
import { BottomNav } from '../components/BottomNav';
import { TabScreen } from '../components/TabScreen';
import { BackButton } from '../components/BackButton';
import { errorCodeName } from './errors';
import { fmtClock } from './writing';

const TOPICS = ['du lịch', 'công nghệ', 'y học', 'môi trường'];

function doneKey(date: string): string {
  return `today_done_${date}`;
}

const TFNG_LABELS = ['TRUE', 'FALSE', 'NOT GIVEN'];
const YNNG_LABELS = ['YES', 'NO', 'NOT GIVEN'];

/** Điều khiển trả lời cho drill — bản rút gọn của IeltsAnswerControl
 * (frontend/src/ielts-ui.tsx), giống màn Ôn câu sai. */
const DrillAnswerControl = memo(function DrillAnswerControl({
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
                  backgroundColor: isRight || isSel ? colors.surfaceMuted : colors.surface,
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
        </Text>
      </View>
    );
  }
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

export default function TodayScreen() {
  const { exam } = useExam();
  const { colors, isLively } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  const [data, setData] = useState<TodayData | null>(null);

  // Chưa chọn kỳ thi thì không vào được — về màn chọn, nhớ đích đến.
  useEffect(() => {
    if (!exam) router.replace({ pathname: '/', params: { next: '/today' } });
  }, [exam]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<string[]>([]);
  const [badDay, setBadDay] = useState<BadDayTask | null>(null);
  const [badDayBusy, setBadDayBusy] = useState(false);
  const [badDayDone, setBadDayDone] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const todayStr = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
  // "▶ Bắt đầu hôm nay": cuộn tới khối 1 (ôn lỗi đến hạn).
  const scrollRef = useRef<ElementRef<typeof ScrollView>>(null);
  const reviewY = useRef(0);

  useEffect(() => {
    api
      .today(ex)
      .catch(() => (isIelts ? api.ieltsToday() : Promise.reject(new Error('Không tải được dữ liệu hôm nay.'))))
      .then((d) => {
        setData(d);
        AsyncStorage.getItem(doneKey(d.date))
          .then((v) => {
            try {
              setDone(v ? (JSON.parse(v) as string[]) : []);
            } catch {
              setDone([]);
            }
          })
          .catch(() => undefined);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được kế hoạch hôm nay.'))
      .finally(() => setLoading(false));
    AsyncStorage.getItem('ielts_topics')
      .then((v) => {
        try {
          setTopics(v ? (JSON.parse(v) as string[]) : []);
        } catch {
          setTopics([]);
        }
      })
      .catch(() => undefined);
  }, [ex, isIelts]);

  const markDone = useCallback(
    async (blockId: string, minutes: number) => {
      if (!data) return;
      setDone((prev) => {
        const next = prev.includes(blockId) ? prev : [...prev, blockId];
        AsyncStorage.setItem(doneKey(data.date), JSON.stringify(next)).catch(() => undefined);
        return next;
      });
      try {
        await api.completeTodayBlock(blockId, minutes, ex);
      } catch {
        /* bản local đã ghi, không chặn */
      }
    },
    [data, ex],
  );

  const callBadDay = useCallback(async () => {
    setBadDayBusy(true);
    setError('');
    try {
      setBadDay(await api.todayBadDay(ex));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lấy được bài ngày nhẹ.');
    } finally {
      setBadDayBusy(false);
    }
  }, [ex]);

  const toggleTopic = useCallback((t: string) => {
    setTopics((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      AsyncStorage.setItem('ielts_topics', JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const review = data?.blocks.find((b) => b.id === 'review');
  const drill = data?.blocks.find((b) => b.id === 'drill');
  const streak = data?.streak;
  const quitReason = data?.profile?.quitReason;
  const pad = horizontalPadding(width);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <TabScreen href="/today">
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}>
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={[styles.title, { flex: 1, color: colors.text, fontSize: scaled(24) }]}>☀️ Hôm nay</Text>
        </View>
        <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
          {todayStr} — làm 3 khối nhỏ là đủ, đừng cố làm hết một lúc.
        </Text>
        {error ? (
          <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
        ) : null}
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : !data ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
              Chưa tải được kế hoạch hôm nay.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.statRow}>
              <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statEmoji, { fontSize: scaled(20) }]}>🔥</Text>
                <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>Streak</Text>
                <Text style={[styles.statBig, { color: isLively ? colors.streak : colors.text, fontSize: scaled(16) }]}>{streak?.current ?? 0} ngày</Text>
                <Text style={[styles.statNote, { color: colors.muted, fontSize: scaled(12) }]}>
                  {(streak?.freeRestLeft ?? 1) > 0 ? 'Còn 1 ngày nghỉ miễn phí tuần này' : 'Đã dùng ngày nghỉ tuần này'}
                </Text>
              </View>
              <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statEmoji, { fontSize: scaled(20) }]}>📅</Text>
                <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>Đã xong hôm nay</Text>
                <Text style={[styles.statBig, { color: colors.text, fontSize: scaled(16) }]}>{done.length}/3 khối</Text>
                <Text style={[styles.statNote, { color: colors.muted, fontSize: scaled(12) }]}>
                  {done.length >= 3 ? '🎉 Xong hết rồi — nghỉ thôi!' : 'Cứ từ từ, từng khối một.'}
                </Text>
              </View>
              <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statEmoji, { fontSize: scaled(20) }]}>🌧️</Text>
                <Text style={[styles.statLabel, { color: colors.muted, fontSize: scaled(13) }]}>Ngày mệt?</Text>
                <Text style={[styles.statBig, { color: colors.text, fontSize: scaled(15) }]}>
                  {data.badDayAvailable ? 'Có chế độ ngày nhẹ' : 'Hôm nay đã dùng ngày nhẹ'}
                </Text>
                <Pressable
                  style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, opacity: !data.badDayAvailable || badDayBusy ? 0.6 : 1 }]}
                  disabled={!data.badDayAvailable || badDayBusy}
                  onPress={() => void callBadDay()}
                >
                  <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(13) }]}>
                    {badDayBusy ? 'Đang lấy bài…' : 'Hôm nay mình mệt 😮‍💨'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {badDay && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>🌧️ Bài ngày nhẹ (5–10 phút)</Text>
                <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>{badDay.title}</Text>
                <Text style={[styles.cardText, { color: colors.muted, fontSize: scaled(15) }]}>{badDay.detail}</Text>
                {!isIelts && (
                  <Pressable onPress={() => router.push('/practice')}>
                    <Text style={[styles.link, { color: colors.accent, fontSize: scaled(15) }]}>Mở luyện tập TOEIC →</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.button, { backgroundColor: colors.accent, opacity: badDayDone ? 0.6 : 1 }]}
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
              style={[styles.button, { backgroundColor: colors.gold }]}
              onPress={() => scrollRef.current?.scrollTo({ y: reviewY.current, animated: true })}
            >
              <Text style={[styles.buttonText, { color: colors.goldInk, fontSize: scaled(15) }]}>▶ Bắt đầu hôm nay</Text>
            </Pressable>

            {data.carriedOver?.length > 0 && (
              <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                📌 Khối dồn từ hôm qua (tối đa 1): {data.carriedOver.join(', ')}
              </Text>
            )}

            <View
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onLayout={(e) => {
                reviewY.current = e.nativeEvent.layout.y;
              }}
            >
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                1️⃣ Ôn lỗi đến hạn {done.includes('review') ? '✓' : ''}
              </Text>
              {isIelts ? (
                <IeltsReviewBlock dueCount={review?.dueCount ?? 0} onDone={() => void markDone('review', 15)} />
              ) : (
                <>
                  <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
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

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                2️⃣ Luyện dạng yếu nhất {done.includes('drill') ? '✓' : ''}
              </Text>
              {isIelts ? (
                <IeltsDrillBlock
                  diagnosticDone={data.diagnosticDone}
                  weakestType={drill?.weakestType ?? null}
                  questionCount={drill?.questionCount ?? 0}
                  onDone={() => void markDone('drill', 20)}
                />
              ) : (
                <>
                  <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
                    {drill?.weakestPart
                      ? `Part yếu nhất: ${partLabel(drill.weakestPart, 'toeic')}${drill.questionCount ? ` — ${drill.questionCount} câu` : ''}`
                      : 'Chưa đủ dữ liệu để xác định Part yếu nhất — luyện 1 Part bất kỳ nhé.'}
                  </Text>
                  <Text style={[styles.cardText, { color: colors.muted, fontSize: scaled(14) }]}>
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

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                3️⃣ Luyện chủ động {done.includes('active') ? '✓' : ''}
              </Text>
              {isIelts ? (
                <IeltsActiveBlock onDone={() => void markDone('active', 15)} />
              ) : (
                <>
                  <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
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

            {isIelts && quitReason === 'chan' && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>🎲 Đổi gió theo chủ đề bạn thích</Text>
                <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                  Chọn chủ đề — app sẽ ưu tiên bài đọc/nghe cùng chủ đề khi có.
                </Text>
                <View style={styles.chipRow}>
                  {TOPICS.map((t) => {
                    const selected = topics.includes(t);
                    return (
                      <Pressable
                        key={t}
                        style={[styles.chip, { borderColor: colors.border, backgroundColor: selected ? colors.accent : colors.surface }]}
                        onPress={() => toggleTopic(t)}
                      >
                        <Text style={{ color: selected ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
                          {selected ? '✓ ' : ''}{t}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
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
        )}
      </ScrollView>
      </TabScreen>
      <BottomNav />
    </SafeAreaView>
  );
}

/* ================= IELTS: khối 1 — hàng đợi ôn lỗi inline ================= */
function IeltsReviewBlock({ dueCount, onDone }: { dueCount: number; onDone: () => void }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const [items, setItems] = useState<ErrorLogEntry[] | null>(null);
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(0);

  useEffect(() => {
    api
      .errorLogDue()
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được câu đến hạn.'));
  }, []);

  const review = useCallback(async (id: number, correct: boolean) => {
    try {
      await api.reviewError(id, correct);
      setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
      setReviewed((n) => n + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không ghi nhận được lần ôn này.');
    }
  }, []);

  if (!items) return <ActivityIndicator color={colors.accent} />;
  return (
    <View style={styles.blockGap}>
      {error ? (
        <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
      ) : null}
      <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
        Có <Text style={{ fontWeight: '700' }}>{dueCount || items.length}</Text> lỗi đến hạn ôn hôm nay.
        Đã ôn: {reviewed}.
      </Text>
      {!items.length && (
        <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>🎉 Hết lỗi đến hạn rồi!</Text>
      )}
      {items.map((it) => (
        <View key={it.id} style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.text, fontSize: scaled(15) }]}>
            {errorCodeName(it.errorCode)} ·{' '}
            {it.skill === 'listening' ? '🎧 Listening' : it.skill === 'reading' ? '📖 Reading' : it.skill === 'writing' ? '✍️ Writing' : '🎤 Speaking'}
            {it.questionType ? ` · ${questionTypeName(it.questionType)}` : ''}
          </Text>
          {it.evidence ? (
            <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>{it.evidence}</Text>
          ) : null}
          {it.missedKeyword ? (
            <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
              Từ bỏ lỡ: <Text style={{ fontWeight: '700', color: colors.text }}>{it.missedKeyword}</Text>
            </Text>
          ) : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.smallButton, { backgroundColor: colors.accent, flex: 1 }]}
              onPress={() => void review(it.id, true)}
            >
              <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Tôi đã làm đúng ✓</Text>
            </Pressable>
            <Pressable
              style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
              onPress={() => void review(it.id, false)}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>Vẫn sai ✗</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <View style={styles.row}>
        <Pressable
          style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
          onPress={() => router.push('/errors')}
        >
          <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>Mở sổ lỗi đầy đủ →</Text>
        </Pressable>
        <Pressable style={[styles.smallButton, { backgroundColor: colors.accent, flex: 1 }]} onPress={onDone}>
          <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Xong khối ôn lỗi</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ================= IELTS: khối 2 — drill dạng yếu nhất ================= */
function IeltsDrillBlock({
  diagnosticDone,
  weakestType,
  questionCount,
  onDone,
}: {
  diagnosticDone: boolean;
  weakestType: string | null;
  questionCount: number;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const [qs, setQs] = useState<Question[] | null>(null);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, { ok: boolean; correctLabel?: string; correctText?: string }>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [started, setStarted] = useState(false);
  const answeringRef = useRef<Set<string>>(new Set());

  if (!diagnosticDone) {
    return (
      <View style={styles.blockGap}>
        <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
          Chưa có kết quả chẩn đoán nên chưa biết dạng nào yếu nhất.
        </Text>
        <Pressable
          style={[styles.button, { backgroundColor: colors.accent }]}
          onPress={() => router.push('/diagnostic')}
        >
          <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Làm chẩn đoán trước →</Text>
        </Pressable>
      </View>
    );
  }

  const start = async () => {
    setStarted(true);
    setError('');
    try {
      const all = await api.questionsAll(undefined, undefined, 'ielts');
      const filtered = weakestType ? all.filter((q) => q.questionType === weakestType) : all;
      setQs(filtered.slice(0, 10));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được câu hỏi.');
    }
  };

  const answer = async (q: Question, value: string) => {
    if (answers[q.id] || answeringRef.current.has(q.id) || !value.trim()) return;
    answeringRef.current.add(q.id);
    try {
      const r = await api.practiceAnswer(q.id, value);
      setAnswers((m) => ({ ...m, [q.id]: { ok: r.correct, correctLabel: r.correctLabel, correctText: r.correctText } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không chấm được câu này.');
    } finally {
      answeringRef.current.delete(q.id);
    }
  };

  return (
    <View style={styles.blockGap}>
      <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
        Dạng yếu nhất: <Text style={{ fontWeight: '700' }}>{weakestType ? questionTypeName(weakestType) : '—'}</Text>
        {questionCount ? ` — ${questionCount} câu` : ''}
      </Text>
      {!started && (
        <View style={styles.row}>
          <Pressable style={[styles.button, { backgroundColor: colors.accent, flex: 1 }, raisedButton(colors)]} onPress={() => void start()}>
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Luyện 10 câu dạng này →</Text>
          </Pressable>
        </View>
      )}
      {error ? (
        <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
      ) : null}
      {started && !qs && <ActivityIndicator color={colors.accent} />}
      {qs?.map((q, i) => {
        const a = answers[q.id];
        const qType = q.questionType || 'multiple_choice';
        const needsSubmit = isFillIn(qType) || isMultiAnswer(qType);
        const overLimit =
          isFillIn(qType) && q.wordLimit != null && wordCount(selected[q.id] ?? '') > q.wordLimit;
        return (
          <View key={q.id} style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <Text style={[styles.panelTitle, { color: colors.text, fontSize: scaled(15) }]}>
              {i + 1}. {q.content}
            </Text>
            <DrillAnswerControl
              q={q}
              value={selected[q.id] ?? ''}
              onChange={(v) => {
                setSelected((m) => ({ ...m, [q.id]: v }));
                // Trắc nghiệm / TFNG / matching: chọn là chấm ngay (như
                // bản web). Điền từ / chọn nhiều đáp án: chấm bằng nút
                // "Kiểm tra" bên dưới.
                if (!needsSubmit) void answer(q, v);
              }}
              graded={a ? { correct: a.ok, correctLabel: a.correctLabel, correctText: a.correctText } : undefined}
            />
            {needsSubmit && !a && (
              <View style={styles.row}>
                <Pressable
                  style={[styles.smallButton, { backgroundColor: colors.accent, opacity: !selected[q.id]?.trim() || overLimit ? 0.6 : 1 }]}
                  disabled={!selected[q.id]?.trim() || overLimit}
                  onPress={() => void answer(q, selected[q.id] ?? '')}
                >
                  <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Kiểm tra</Text>
                </Pressable>
                {overLimit && (
                  <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(13) }]}>Vượt giới hạn số từ — rút gọn đáp án nhé.</Text>
                )}
              </View>
            )}
            {a && (
              <Text style={[styles.feedback, { color: a.ok ? colors.success : colors.danger, fontSize: scaled(15) }]}>
                {a.ok ? '✅ Đúng rồi!' : `❌ Sai rồi — đáp án đúng: ${a.correctText ?? a.correctLabel ?? ''}`}
              </Text>
            )}
          </View>
        );
      })}
      {qs && (
        <Pressable style={[styles.button, { backgroundColor: colors.accent }]} onPress={onDone}>
          <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Xong khối luyện dạng yếu</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ================= IELTS: khối 3 — skim + dictation ================= */
function IeltsActiveBlock({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const [passage, setPassage] = useState('');
  const [script, setScript] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [mode, setMode] = useState<'skim' | 'dictation'>('skim');
  const [dictation, setDictation] = useState('');
  const [showScript, setShowScript] = useState(false);
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(90);

  useEffect(() => {
    // Đoạn Reading đầu tiên của TS-028 (part 5–7) + 1 đoạn script
    // Listening (part 1–4) để đọc chính tả.
    api
      .questions(5, 50, 0, '', 'TS-028', 'ielts')
      .then((items) => {
        const withText = items.find((q) => q.passageText);
        if (withText?.passageText) setPassage(withText.passageText);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được đoạn văn mẫu.'));
    api
      .questions(1, 50, 0, '', 'TS-028', 'ielts')
      .then((items) => {
        const withScript = items.find((q) => q.script);
        if (withScript?.script) setScript(withScript.script);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!started || left <= 0) return;
    const t = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) setStarted(false);
        return Math.max(0, s - 1);
      });
    }, 1000);
    return () => clearInterval(t);
  }, [started, left]);

  const words = summary.trim() ? summary.trim().split(/\s+/).length : 0;

  return (
    <View style={styles.blockGap}>
      {error ? (
        <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
      ) : null}
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, { borderColor: colors.border, backgroundColor: mode === 'skim' ? colors.accent : colors.surface }]}
          onPress={() => setMode('skim')}
        >
          <Text style={{ color: mode === 'skim' ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
            📖 Skim / scan
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, { borderColor: colors.border, backgroundColor: mode === 'dictation' ? colors.accent : colors.surface }]}
          onPress={() => setMode('dictation')}
        >
          <Text style={{ color: mode === 'dictation' ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
            🎧 Dictation (chép chính tả)
          </Text>
        </Pressable>
      </View>
      {mode === 'skim' ? (
        <>
          <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
            Đọc lướt đoạn văn dưới đây trong <Text style={{ fontWeight: '700' }}>90 giây</Text>, rồi tóm tắt
            mỗi đoạn bằng <Text style={{ fontWeight: '700' }}>5–8 từ</Text>.
          </Text>
          <View style={[styles.passageBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <Text style={[styles.passageText, { color: colors.text, fontSize: scaled(15) }]}>
              {passage || 'Đang tải đoạn văn mẫu (TS-028)…'}
            </Text>
          </View>
          <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
            ⏱ Còn lại: <Text style={{ fontWeight: '700' }}>{fmtClock(left)}</Text>
          </Text>
          <Pressable
            style={[styles.smallButton, { backgroundColor: colors.accent, opacity: started ? 0.6 : 1 }]}
            disabled={started}
            onPress={() => {
              setLeft(90);
              setStarted(true);
            }}
          >
            <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Bắt đầu 90 giây</Text>
          </Pressable>
          <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Tóm tắt mỗi đoạn 5–8 từ</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
            value={summary}
            onChangeText={setSummary}
            placeholder="VD: Đoạn 1: … (5–8 từ). Đoạn 2: …"
            placeholderTextColor={colors.muted}
            multiline
          />
          <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>{words} từ đã gõ.</Text>
        </>
      ) : (
        <>
          <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
            Đọc đoạn script mẫu rồi gõ lại những gì bạn đọc được. Mobile chưa có giọng đọc máy như bản
            web — dùng script text để tập chép chính tả.
          </Text>
          <Pressable
            style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border }]}
            onPress={() => setShowScript((v) => !v)}
          >
            <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>
              {showScript ? '▲ Ẩn script gốc' : '▼ Hiện script gốc để đối chiếu'}
            </Text>
          </Pressable>
          {showScript && script ? (
            <View style={[styles.passageBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
              <Text style={[styles.passageText, { color: colors.text, fontSize: scaled(15) }]}>{script}</Text>
            </View>
          ) : null}
          <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Gõ lại những gì bạn đọc được</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
            value={dictation}
            onChangeText={setDictation}
            multiline
          />
        </>
      )}
      <Pressable style={[styles.button, { backgroundColor: colors.accent }]} onPress={onDone}>
        <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>Xong khối luyện chủ động</Text>
      </Pressable>
    </View>
  );
}

/* ================= IELTS: Band Compass ================= */
function BandCompassBlock() {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const [bands, setBands] = useState<{ listening?: number | null; reading?: number | null; overall?: number | null } | null>(null);
  const [weekly, setWeekly] = useState<WeeklyError[] | null>(null);

  useEffect(() => {
    api.latestDiagnostic().then((d) => setBands(d?.bands ?? null)).catch(() => undefined);
    api.errorLogWeekly().then(setWeekly).catch(() => undefined);
  }, []);

  const max = Math.max(1, ...(weekly ?? []).map((w) => w.count));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>🧭 Band Compass — bạn đang ở đâu?</Text>
      {bands ? (
        <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
          Listening <Text style={{ fontWeight: '700' }}>Band {bands.listening ?? '—'}</Text> · Reading{' '}
          <Text style={{ fontWeight: '700' }}>Band {bands.reading ?? '—'}</Text> · Tổng{' '}
          <Text style={{ fontWeight: '700' }}>Band {bands.overall ?? '—'}</Text>
          {bands.overall != null && <Text style={{ color: colors.muted }}> ({bandLevel(bands.overall)})</Text>}
        </Text>
      ) : (
        <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>
          Chưa có chẩn đoán — làm chẩn đoán để xem Band Compass.
        </Text>
      )}
      <Pressable
        style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border }]}
        onPress={() => router.push('/diagnostic')}
      >
        <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>Làm chẩn đoán →</Text>
      </Pressable>
      <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(16) }]}>Lỗi theo tuần</Text>
      {!weekly?.length && (
        <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>Chưa có dữ liệu lỗi theo tuần.</Text>
      )}
      {weekly?.slice(0, 12).map((w, i) => (
        <View key={`${w.week}-${w.code}-${i}`} style={styles.barRow}>
          <Text style={[styles.barLabel, { color: colors.text, fontSize: scaled(13) }]}>{w.week} · {w.code}</Text>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
            <View style={[styles.barFill, { width: `${(w.count / max) * 100}%`, backgroundColor: colors.accent }]} />
          </View>
          <Text style={[styles.barCount, { color: colors.text, fontSize: scaled(13) }]}>{w.count}</Text>
        </View>
      ))}
      <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
        Số lỗi giảm dần theo tuần = bạn đang tiến bộ, dù band chưa nhảy ngay.
      </Text>
    </View>
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
  link: { fontWeight: '700', flexWrap: 'wrap' },
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
  statLabel: { textAlign: 'center', flexWrap: 'wrap' },
  statBig: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  statNote: { textAlign: 'center', flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  blockGap: { gap: SPACING.sm, width: '100%' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  chip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
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
  label: { fontWeight: '600', marginTop: SPACING.sm },
  passageBox: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    padding: SPACING.md,
    maxHeight: 220,
    width: '100%',
  },
  passageText: { flexWrap: 'wrap' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, width: '100%' },
  barLabel: { minWidth: 96 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barCount: { minWidth: 24, textAlign: 'right', fontWeight: '700' },
});
