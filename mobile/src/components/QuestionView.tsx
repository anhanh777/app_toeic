// 1 câu hỏi — renderer dùng chung cho Practice (chấm tức thì) và Mock
// (chọn thoải mái, nộp 1 lần). React.memo + callback ổn định từ parent
// (nhận id câu, không tạo closure theo câu) để FlatList cuộn không
// re-render tất cả.
// - MC: nút A/B/C/D; TOEIC P1/P2 chỉ-nghe (phương án rỗng) và khi chưa
//   trả lời ở Practice thì chỉ hiện chữ cái (letter-only).
// - IELTS dạng đặc biệt qua IeltsAnswerControl; choosing_title dùng lại
//   nút MC như multiple_choice.
// - Part 6 (TOEIC): câu chỉ còn số + phương án — câu chứa chỗ trống đã
//   nằm trong đoạn văn phía trên.
// - Khối kết quả (Practice): đúng/sai + XP; IELTS sai/đoán mò thì cổng
//   RootCausePicker trước khi hiện giải thích; transcript CHỈ ở Part nghe
//   (P1–4) — Part đọc chỉ hiện giải thích (đoạn văn đã hiện phía trên).
import { memo } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Question } from '../api';
import type { ExamId } from '../exam';
import {
  isFillIn,
  isMultiAnswer,
  parseSelectedLabels,
  stripLeadingNumber,
  wordCount,
} from '../lib';
import { RADIUS, SPACING } from '../layout';
import { useTextSize, useTheme } from '../theme';
import AudioPlayer from './AudioPlayer';
import IeltsAnswerControl from './IeltsAnswerControl';
import RootCausePicker from './RootCausePicker';

export interface AnswerResult {
  correct: boolean;
  correctLabel: string;
  correctText?: string;
  explanation?: string;
  transcript?: string;
  xpAwarded?: number;
}

/** Tên đầy đủ các Part TOEIC (từ components.tsx web). */
export const PART_NAMES: Record<number, string> = {
  1: 'Part 1 — Mô tả tranh',
  2: 'Part 2 — Hỏi & đáp',
  3: 'Part 3 — Hội thoại',
  4: 'Part 4 — Bài nói ngắn',
  5: 'Part 5 — Hoàn thành câu',
  6: 'Part 6 — Hoàn thành đoạn văn',
  7: 'Part 7 — Đọc hiểu',
};
export function partName(p: number): string {
  return PART_NAMES[p] || `Part ${p}`;
}
export function sectionOf(part: number): string {
  return part <= 4 ? 'Listening' : 'Reading';
}

/** Câu chỉ-nghe (TOEIC P1/P2): toàn bộ phương án đều rỗng nội dung. */
export function isListeningOnly(q: Question, exam: ExamId): boolean {
  return (
    exam === 'toeic' &&
    (q.part === 1 || q.part === 2) &&
    q.options.length > 0 &&
    q.options.every((o) => !o.content || !o.content.trim())
  );
}

export type QuestionMode = 'practice' | 'mock';

interface Props {
  q: Question;
  /** Số câu THẬT trong đề (mốc đầu Part + vị trí trong Part). */
  n: number;
  exam: ExamId;
  selected: string;
  onSelect: (questionId: string, value: string) => void;
  /** Gọi khi đáp án "chốt" — Mock dùng để autosave. */
  onCommit?: (questionId: string, value: string) => void;
  mode: QuestionMode;
  /** Practice: kết quả chấm của câu này (null = chưa chấm). */
  result?: AnswerResult | null;
  onSubmit?: (questionId: string) => void;
  /** Nộp tất cả: ẩn nút "Nộp đáp án" từng câu (chấm 1 lần ở cuối). */
  hideSubmitButton?: boolean;
  /** Đã nộp tất cả: khóa mọi ô đáp án, kể cả câu chưa làm. */
  submittedAll?: boolean;
  /** IELTS: đánh dấu đoán mò. */
  guessed?: boolean;
  onGuessedChange?: (questionId: string, guessed: boolean) => void;
  /** IELTS: đã ghi nguyên nhân gốc cho câu này chưa. */
  causeLogged?: boolean;
  onCauseLogged?: (questionId: string, code: string) => void;
  /** Ẩn chữ câu hỏi/phương án (P1/P2 TOEIC: Practice ẩn tới khi chấm,
   * Mock ẩn suốt bài thi). */
  hideText: boolean;
  isListening: boolean;
  /** Có player audio cấp Part ở đầu Part không (có thì không vẽ player
   * từng câu nữa — 1 nút nghe duy nhất mỗi Part). */
  usePartAudio: boolean;
  /** Audio của câu/đoạn (đã gồm fallback audio cấp Part khi không có
   * player cấp Part). */
  audioUrl?: string | null;
  playOnce?: boolean;
  /** Gọi 1 lần khi lần phát đầu tiên của 1 Part bắt đầu (thi thử IELTS:
   * đánh dấu Section đã phát). Nhận số Part của câu hỏi. */
  onFirstPlay?: (part: number) => void;
  onAudioError?: (e: unknown) => void;
  duplicateHeading?: boolean;
}

function QuestionViewInner({
  q, n, exam, selected, onSelect, onCommit, mode, result, onSubmit,
  hideSubmitButton, submittedAll,
  guessed, onGuessedChange, causeLogged, onCauseLogged,
  hideText, isListening, usePartAudio, audioUrl, playOnce, onFirstPlay,
  onAudioError, duplicateHeading,
}: Props) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const isIelts = exam === 'ielts';
  const listeningOnly = isListeningOnly(q, exam);
  const letterOnly = listeningOnly || hideText;
  const qType = q.questionType || 'multiple_choice';
  const isIeltsSpecial = isIelts && qType !== 'multiple_choice' && qType !== 'choosing_title';
  const isP6 = exam === 'toeic' && q.part === 6;
  const showContent = !!q.content && !hideText && !isP6;
  const overLimit = isFillIn(qType) && q.wordLimit != null && wordCount(selected) > q.wordLimit;
  // Audio từng câu: khi không có player cấp Part. TOEIC luôn vẽ (chưa có
  // file thì AudioPlayer hiện khối "chưa có audio"); IELTS chỉ vẽ khi có
  // file audio thật (không dùng TTS — đọc trước thì lộ nội dung bài nghe).
  const showAudio = isListening && !usePartAudio && (exam === 'toeic' || !!audioUrl);

  const correctAnswerText = isMultiAnswer(qType)
    ? parseSelectedLabels(result?.correctLabel).join(', ') || result?.correctText || ''
    : result?.correctLabel ?? result?.correctText ?? '';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {hideText && q.part === 2 && listeningOnly ? (
        <Text style={[styles.line, { color: colors.text, fontSize: scaled(15), fontWeight: '700' }]}>
          🎧 Nghe và chọn đáp án đúng
        </Text>
      ) : null}
      {q.imageUrl ? (
        <Image
          source={{ uri: q.imageUrl }}
          style={styles.image}
          contentFit="contain"
          transition={150}
          accessibilityLabel="Ảnh minh họa"
        />
      ) : null}
      {listeningOnly && q.part === 1 && !q.imageUrl ? (
        <Text style={[styles.line, { color: colors.muted, fontSize: scaled(14) }]}>🖼 Chưa có ảnh minh họa cho câu này.</Text>
      ) : null}
      {showAudio ? (
        <AudioPlayer
          audioUrl={audioUrl ?? null}
          stopKey={q.id}
          playOnce={playOnce}
          onFirstPlay={onFirstPlay ? () => onFirstPlay(q.part) : undefined}
          onError={onAudioError}
        />
      ) : null}
      {showContent ? (
        <Text style={[styles.content, { color: colors.text, fontSize: scaled(16) }]}>
          <Text style={{ fontWeight: '700' }}>{n}. </Text>
          {stripLeadingNumber(q.content, n)}
        </Text>
      ) : null}
      {!isIeltsSpecial && (letterOnly || isP6) ? (
        <Text style={[styles.num, { color: colors.text, fontSize: scaled(16) }]}>{n}.</Text>
      ) : null}
      {isIeltsSpecial ? (
        <IeltsAnswerControl
          q={q}
          value={selected}
          onChange={(v) => onSelect(q.id, v)}
          onCommit={onCommit ? (v) => onCommit(q.id, v) : undefined}
          graded={result ?? null}
          disabled={!!submittedAll}
          duplicateHeading={duplicateHeading}
        />
      ) : (
        <View style={styles.options}>
          {q.options.map((o) => {
            const isSel = selected === o.label;
            const isCorrect = !!result && o.label === result.correctLabel;
            const isWrong = !!result && isSel && !result.correct;
            return (
              <Pressable
                key={o.label}
                style={[
                  styles.option,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  isSel && { borderColor: colors.accent, backgroundColor: colors.surfaceMuted },
                  isCorrect && { borderColor: colors.success, backgroundColor: colors.surfaceMuted },
                  isWrong && { borderColor: colors.danger, backgroundColor: colors.surfaceMuted },
                ]}
                disabled={mode === 'practice' && (!!result || !!submittedAll)}
                onPress={() => {
                  onSelect(q.id, o.label);
                  onCommit?.(q.id, o.label);
                }}
              >
                <Text
                  style={{
                    color: isCorrect ? colors.success : isWrong ? colors.danger : colors.text,
                    fontSize: scaled(15),
                    fontWeight: '700',
                  }}
                >
                  {o.label}
                </Text>
                {!letterOnly && o.content ? (
                  <Text
                    style={{
                      color: isCorrect ? colors.success : isWrong ? colors.danger : colors.text,
                      fontSize: scaled(15),
                      flexShrink: 1,
                      flexWrap: 'wrap',
                    }}
                  >
                    {o.content}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
      {mode === 'practice' && !result && (!hideSubmitButton || isIelts) ? (
        <View style={styles.submitRow}>
          {!hideSubmitButton ? (
            <Pressable
              style={[styles.submitButton, { backgroundColor: colors.accent }, (!selected || overLimit) && styles.disabled]}
              disabled={!selected || overLimit}
              onPress={() => onSubmit?.(q.id)}
            >
              <Text style={[styles.submitText, { color: colors.onAccent, fontSize: scaled(15) }]}>Nộp đáp án</Text>
            </Pressable>
          ) : null}
          {isIelts ? (
            <Pressable
              style={styles.guessRow}
              onPress={() => onGuessedChange?.(q.id, !guessed)}
              accessibilityLabel="Đánh dấu đoán mò"
            >
              <Text style={{ color: colors.text, fontSize: scaled(15) }}>{guessed ? '☑' : '☐'} Đoán mò 🤔</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {mode === 'practice' && !result && submittedAll ? (
        <Text style={{ color: colors.danger, fontSize: scaled(15), fontWeight: '700', flexWrap: 'wrap' }}>
          ❌ Chưa làm — tính là sai
        </Text>
      ) : null}
      {mode === 'practice' && result ? (
        <View style={[styles.result, { borderTopColor: colors.border }]}>
          <Text
            style={{
              color: result.correct ? colors.success : colors.danger,
              fontSize: scaled(15),
              fontWeight: '700',
              flexWrap: 'wrap',
            }}
          >
            {result.correct
              ? '✅ Đúng rồi!'
              : `❌ Sai rồi. Đáp án đúng: ${correctAnswerText}`}
            {result.xpAwarded ? ` (+${result.xpAwarded} XP)` : ''}
          </Text>
          {(() => {
            // IELTS: cổng giải thích — câu sai HOẶC đoán mò thì ẨN giải
            // thích cho tới khi ghi xong nguyên nhân gốc.
            const needsCause = isIelts && (!result.correct || !!guessed);
            if (needsCause && !causeLogged) {
              return (
                <RootCausePicker
                  skill={q.part <= 4 ? 'listening' : 'reading'}
                  questionId={q.id}
                  questionType={q.questionType}
                  guessed={!!guessed}
                  onLogged={(code) => onCauseLogged?.(q.id, code)}
                />
              );
            }
            return (
              <>
                {result.explanation ? (
                  <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
                    <Text style={{ fontWeight: '700' }}>Giải thích: </Text>
                    {result.explanation}
                  </Text>
                ) : null}
                {isListening && result.transcript ? (
                  <Text style={[styles.line, { color: colors.text, fontSize: scaled(15) }]}>
                    <Text style={{ fontWeight: '700' }}>Transcript: </Text>
                    {result.transcript}
                  </Text>
                ) : null}
              </>
            );
          })()}
        </View>
      ) : null}
    </View>
  );
}

const QuestionView = memo(QuestionViewInner);
export default QuestionView;

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.sm,
    width: '100%',
  },
  line: { flexWrap: 'wrap' },
  image: { width: '100%', height: 220, borderRadius: 12 },
  content: { flexWrap: 'wrap', lineHeight: 24 },
  num: { fontWeight: '700' },
  options: { gap: SPACING.sm, width: '100%' },
  option: {
    flexDirection: 'row',
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    alignItems: 'flex-start',
    width: '100%',
  },
  submitRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center', flexWrap: 'wrap' },
  submitButton: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitText: { fontWeight: '700', textAlign: 'center' },
  guessRow: { paddingVertical: SPACING.sm },
  disabled: { opacity: 0.6 },
  result: { borderTopWidth: 1, paddingTop: SPACING.sm, gap: SPACING.sm },
});
