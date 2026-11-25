// Các khối IELTS của màn Hôm nay — chuyển nguyên vẹn từ app/today.tsx
// khi Trang chủ + Hôm nay gộp thành 1 trang (app/index.tsx dùng lại).
// Không duplicate code: app/index.tsx import các block này từ đây.
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { ApiError, api, type ErrorLogEntry, type Question, type WeeklyError } from '../api';
import { bandLevel, isFillIn, isMultiAnswer, parseSelectedLabels, questionTypeName, toggleSelectedLabel, wordCount } from '../lib';
import { CARD_PADDING, RADIUS, SPACING } from '../layout';
import { themedBarTrack, themedCard, themedChip, themedOption, themedButton, useTextSize, useTheme } from '../theme';
import { errorCodeName } from '../app/errors';
import { fmtClock } from '../app/writing';
import { LoadingLine } from './LoadingLine';

const TFNG_LABELS = ['TRUE', 'FALSE', 'NOT GIVEN'];
const YNNG_LABELS = ['YES', 'NO', 'NOT GIVEN'];

/** Điều khiển trả lời cho drill — bản rút gọn của IeltsAnswerControl
 * (frontend/src/ielts-ui.tsx), giống màn Ôn câu sai. */
export const DrillAnswerControl = memo(function DrillAnswerControl({
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
                themedChip(colors), isRight && { borderColor: colors.success, backgroundColor: colors.surfaceMuted }, isSel && { borderColor: colors.accent, backgroundColor: colors.surfaceMuted },
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
          style={[styles.input, { borderColor: over ? colors.danger : colors.border, color: colors.text, fontSize: scaled(16) }, themedCard(colors, 'compact'), { borderColor: over ? colors.danger : colors.border }]}
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
              themedOption(colors, isRight ? 'correct' : isSel ? 'selected' : 'default'),
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

/* ================= IELTS: khối 1 — hàng đợi ôn lỗi inline ================= */
export function IeltsReviewBlock({ dueCount, onDone }: { dueCount: number; onDone: () => void }) {
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

  if (!items) return <LoadingLine location="table" />;
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
        <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>🎉 Hết lỗi đến hạn rồi!</Text>
      )}
      {items.map((it) => (
        <View key={it.id} style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, themedCard(colors, 'compact')]}>
          <Text style={[styles.panelTitle, { color: colors.text, fontSize: scaled(14) }]}>
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
              style={[styles.smallButton, { backgroundColor: colors.accent, flex: 1 }, themedButton(colors)]}
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
        <Pressable style={[styles.smallButton, { backgroundColor: colors.accent, flex: 1 }, themedButton(colors)]} onPress={onDone}>
          <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Xong khối ôn lỗi</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ================= IELTS: khối 2 — drill dạng yếu nhất ================= */
export function IeltsDrillBlock({
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
          style={[styles.button, { backgroundColor: colors.accent }, themedButton(colors)]}
          onPress={() => router.push('/diagnostic')}
        >
          <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Làm chẩn đoán trước →</Text>
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
          <Pressable style={[styles.button, { backgroundColor: colors.accent, flex: 1 }, themedButton(colors)]} onPress={() => void start()}>
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Luyện 10 câu dạng này →</Text>
          </Pressable>
        </View>
      )}
      {error ? (
        <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
      ) : null}
      {started && !qs && <LoadingLine location="table" />}
      {qs?.map((q, i) => {
        const a = answers[q.id];
        const qType = q.questionType || 'multiple_choice';
        const needsSubmit = isFillIn(qType) || isMultiAnswer(qType);
        const overLimit =
          isFillIn(qType) && q.wordLimit != null && wordCount(selected[q.id] ?? '') > q.wordLimit;
        return (
          <View key={q.id} style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, themedCard(colors, 'compact')]}>
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
                  style={[styles.smallButton, { backgroundColor: colors.accent, opacity: !selected[q.id]?.trim() || overLimit ? 0.6 : 1 }, themedButton(colors)]}
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
        <Pressable style={[styles.button, { backgroundColor: colors.accent }, themedButton(colors)]} onPress={onDone}>
          <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Xong khối luyện dạng yếu</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ================= IELTS: khối 3 — skim + dictation ================= */
export function IeltsActiveBlock({ onDone }: { onDone: () => void }) {
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
          style={[styles.chip, { borderColor: colors.border, backgroundColor: mode === 'skim' ? colors.accent : colors.surface }, themedChip(colors), mode === 'skim' && { backgroundColor: colors.accent, borderColor: colors.accent }]}
          onPress={() => setMode('skim')}
        >
          <Text style={{ color: mode === 'skim' ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
            📖 Skim / scan
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, { borderColor: colors.border, backgroundColor: mode === 'dictation' ? colors.accent : colors.surface }, themedChip(colors), mode === 'dictation' && { backgroundColor: colors.accent, borderColor: colors.accent }]}
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
          {/* Hộp đoạn văn cuộn được (nestedScrollEnabled vì nằm trong
              ScrollView của Trang chủ) — đoạn rất dài không còn bị cắt. */}
          <ScrollView
            style={[styles.passageBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, themedCard(colors, 'compact')]}
            nestedScrollEnabled
          >
            <Text style={[styles.passageText, { color: colors.text, fontSize: scaled(15) }]}>
              {passage || 'Đang tải đoạn văn mẫu (TS-028)…'}
            </Text>
          </ScrollView>
          <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
            ⏱ Còn lại: <Text style={{ fontWeight: '700' }}>{fmtClock(left)}</Text>
          </Text>
          <Pressable
            style={[styles.smallButton, { backgroundColor: colors.accent, opacity: started ? 0.6 : 1 }, themedButton(colors)]}
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
            style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }, themedCard(colors, 'compact')]}
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
            <ScrollView
              style={[styles.passageBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, themedCard(colors, 'compact')]}
              nestedScrollEnabled
            >
              <Text style={[styles.passageText, { color: colors.text, fontSize: scaled(15) }]}>{script}</Text>
            </ScrollView>
          ) : null}
          <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Gõ lại những gì bạn đọc được</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }, themedCard(colors, 'compact')]}
            value={dictation}
            onChangeText={setDictation}
            multiline
          />
        </>
      )}
      <Pressable style={[styles.button, { backgroundColor: colors.accent }, themedButton(colors)]} onPress={onDone}>
        <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Xong khối luyện chủ động</Text>
      </Pressable>
    </View>
  );
}

/* ================= IELTS: Band Compass ================= */
export function BandCompassBlock() {
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
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, themedCard(colors, 'hero')]}>
      <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>🧭 Band Compass — bạn đang ở đâu?</Text>
      {bands ? (
        <Text style={[styles.cardText, { color: colors.text, fontSize: scaled(15) }]}>
          Listening <Text style={{ fontWeight: '700' }}>Band {bands.listening ?? '—'}</Text> · Reading{' '}
          <Text style={{ fontWeight: '700' }}>Band {bands.reading ?? '—'}</Text> · Tổng{' '}
          <Text style={{ fontWeight: '700' }}>Band {bands.overall ?? '—'}</Text>
          {bands.overall != null && <Text style={{ color: colors.muted }}> ({bandLevel(bands.overall)})</Text>}
        </Text>
      ) : (
        <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
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
        <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>Chưa có dữ liệu lỗi theo tuần.</Text>
      )}
      {weekly?.slice(0, 12).map((w, i) => (
        <View key={`${w.week}-${w.code}-${i}`} style={styles.barRow}>
          <Text style={[styles.barLabel, { color: colors.text, fontSize: scaled(13) }]}>{w.week} · {w.code}</Text>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }, themedBarTrack(colors)]}>
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
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.xs,
    width: '100%',
  },
  cardTitle: { fontWeight: '700', flexWrap: 'wrap' },
  cardText: { flexWrap: 'wrap' },
  error: { flexWrap: 'wrap' },
  muted: { flexWrap: 'wrap' },
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
    maxHeight: 280, // Hộp cuộn được (ScrollView) nên đoạn rất dài cuộn xem hết, không bị cắt.
    width: '100%',
  },
  passageText: { flexWrap: 'wrap' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, width: '100%' },
  barLabel: { minWidth: 96, flexShrink: 1 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barCount: { minWidth: 24, textAlign: 'right', fontWeight: '700' },
});
