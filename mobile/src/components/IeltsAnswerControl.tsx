// Điều khiển trả lời cho các dạng câu IELTS — port của
// frontend/src/ielts-ui.tsx (IeltsAnswerControl).
// - T/F/NG, Y/N/NG: hàng nút pill ngang (flex, không ô tròn A/B/C/D).
// - matching / labelling: danh sách nút chọn (RN không có <select>).
// - điền từ (form/sentence/summary/note/table/flow-chart/diagram +
//   short_answer): TextInput + đếm từ trực tiếp + cảnh báo vượt giới hạn.
// - list_selection: checkbox nhiều đáp án, lưu chuỗi nhãn đã sắp xếp
//   nối bằng dấu phẩy, VD "A,C".
// Trắc nghiệm A–D (multiple_choice, choosing_title) KHÔNG nằm ở đây —
// màn hình dùng lại nút .option như TOEIC (xem QuestionView).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Question } from '../api';
import {
  isFillIn,
  isMatching,
  isMultiAnswer,
  parseSelectedLabels,
  toggleSelectedLabel,
  wordCount,
} from '../lib';
import { RADIUS, SPACING } from '../layout';
import { livelyCard, livelyChip, livelyOption, useTextSize, useTheme } from '../theme';

export interface AnswerResultLike {
  correct: boolean;
  correctLabel?: string | null;
  correctText?: string | null;
  explanation?: string;
  transcript?: string;
  xpAwarded?: number;
}

interface Props {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  /** Gọi khi đáp án "chốt" (chọn nút, hoặc blur khỏi ô nhập) —
   * Mock dùng để autosave, Practice không cần. */
  onCommit?: (v: string) => void;
  disabled?: boolean;
  graded?: AnswerResultLike | null;
  duplicateHeading?: boolean;
}

const TFNG_LABELS = ['TRUE', 'FALSE', 'NOT GIVEN'];
const YNNG_LABELS = ['YES', 'NO', 'NOT GIVEN'];

const FILL_IN_PLACEHOLDERS: Record<string, string> = {
  note_completion: 'Nhập đáp án cho ghi chú',
  table_completion: 'Nhập đáp án cho ô trong bảng',
  flow_chart_completion: 'Nhập đáp án cho bước trong sơ đồ',
  diagram_completion: 'Nhập nhãn cho sơ đồ',
};

export default function IeltsAnswerControl({ q, value, onChange, onCommit, disabled, graded, duplicateHeading }: Props) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const type = q.questionType || 'multiple_choice';

  // --- True / False / Not Given & Yes / No / Not Given ---
  if (type === 'true_false_not_given' || type === 'yes_no_not_given') {
    const labels = type === 'true_false_not_given' ? TFNG_LABELS : YNNG_LABELS;
    const opts = labels.map((l) => q.options.find((o) => o.label === l) || { label: l, content: l });
    return (
      <View style={styles.wrap}>
        <Text style={[styles.hint, { color: colors.muted, fontSize: scaled(13) }]}>
          {type === 'true_false_not_given'
            ? '💡 FALSE = bài nói ngược lại, NOT GIVEN = bài không nhắc tới.'
            : '💡 NO = tác giả phản đối, NOT GIVEN = bài không nhắc tới.'}
        </Text>
        <View style={styles.pillRow}>
          {opts.map((o) => {
            const isSel = value === o.label;
            const isCorrect = graded && o.label === graded.correctLabel;
            const isWrong = graded && isSel && !graded.correct;
            return (
              <Pressable
                key={o.label}
                style={[
                  styles.pill,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  isSel && { borderColor: colors.accent, backgroundColor: colors.surfaceMuted },
                  isCorrect && { borderColor: colors.success, backgroundColor: colors.surfaceMuted },
                  isWrong && { borderColor: colors.danger, backgroundColor: colors.surfaceMuted },
                  livelyChip(colors),
                ]}
                disabled={disabled || !!graded}
                onPress={() => {
                  onChange(o.label);
                  onCommit?.(o.label);
                }}
              >
                <Text
                  style={{
                    color: isCorrect ? colors.success : isWrong ? colors.danger : colors.text,
                    fontSize: scaled(13),
                    fontWeight: '700',
                    textAlign: 'center',
                  }}
                >
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  // --- List Selection: chọn 2–3 đáp án, đúng hết mới tính điểm. ---
  if (isMultiAnswer(type)) {
    const selected = parseSelectedLabels(value);
    const correctSet = graded?.correctLabel ? parseSelectedLabels(graded.correctLabel) : [];
    return (
      <View style={styles.wrap}>
        <Text style={[styles.hint, { color: colors.muted, fontSize: scaled(13) }]}>
          💡 Chọn 2–3 đáp án (đúng hết mới tính điểm).
        </Text>
        {q.options.map((o) => {
          const isSel = selected.includes(o.label);
          const isCorrect = graded && correctSet.includes(o.label);
          const isWrong = graded && isSel && !isCorrect;
          return (
            <Pressable
              key={o.label}
              style={[
                styles.option,
                { borderColor: colors.border, backgroundColor: colors.surface },
                isSel && { borderColor: colors.accent, backgroundColor: colors.surfaceMuted },
                isCorrect && { borderColor: colors.success, backgroundColor: colors.surfaceMuted },
                isWrong && { borderColor: colors.danger, backgroundColor: colors.surfaceMuted },
                livelyOption(colors, isCorrect ? 'correct' : isWrong ? 'wrong' : isSel ? 'selected' : 'default'),
              ]}
              disabled={disabled || !!graded}
              onPress={() => {
                const next = toggleSelectedLabel(value, o.label);
                onChange(next);
                onCommit?.(next);
              }}
            >
              <Text style={{ color: colors.text, fontSize: scaled(15), fontWeight: '700' }}>
                {isSel ? '☑' : '☐'} {o.label}
              </Text>
              {o.content ? (
                <Text style={{ color: colors.text, fontSize: scaled(15), flexShrink: 1, flexWrap: 'wrap' }}>{o.content}</Text>
              ) : null}
            </Pressable>
          );
        })}
        {graded && graded.correctLabel ? (
          <Text style={[styles.answerLine, { color: colors.text, fontSize: scaled(14) }]}>
            Đáp án đúng: <Text style={{ fontWeight: '700' }}>{correctSet.join(', ') || graded.correctLabel}</Text>
          </Text>
        ) : null}
      </View>
    );
  }

  // --- Matching / Labelling: danh sách nút chọn (thay <select> của web). ---
  if (isMatching(type)) {
    return (
      <View style={styles.wrap}>
        {q.options.map((o) => {
          const isSel = value === o.label;
          const isCorrect = graded && o.label === graded.correctLabel;
          const isWrong = graded && isSel && !graded.correct;
          return (
            <Pressable
              key={o.label}
              style={[
                styles.option,
                { borderColor: colors.border, backgroundColor: colors.surface },
                isSel && { borderColor: colors.accent, backgroundColor: colors.surfaceMuted },
                isCorrect && { borderColor: colors.success, backgroundColor: colors.surfaceMuted },
                isWrong && { borderColor: colors.danger, backgroundColor: colors.surfaceMuted },
                livelyOption(colors, isCorrect ? 'correct' : isWrong ? 'wrong' : isSel ? 'selected' : 'default'),
              ]}
              disabled={disabled || !!graded}
              onPress={() => {
                onChange(o.label);
                onCommit?.(o.label);
              }}
            >
              <Text style={{ color: colors.text, fontSize: scaled(15), fontWeight: '700' }}>{o.label}</Text>
              {o.content ? (
                <Text style={{ color: colors.text, fontSize: scaled(15), flexShrink: 1, flexWrap: 'wrap' }}>
                  {o.content}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {type === 'matching_headings' && duplicateHeading ? (
          <View style={[styles.warnBox, { backgroundColor: colors.amberBg }]}>
            <Text style={{ color: colors.amber, fontSize: scaled(14), flexWrap: 'wrap' }}>
              ⚠ Thi thật được dùng lại 1 tiêu đề, nhưng 2 đoạn cùng 1 tiêu đề thường là 1 câu sai — kiểm tra lại nhé.
            </Text>
          </View>
        ) : null}
        {graded && graded.correctLabel ? (
          <Text style={[styles.answerLine, { color: colors.text, fontSize: scaled(14) }]}>
            Đáp án đúng: <Text style={{ fontWeight: '700' }}>{graded.correctLabel}</Text>
          </Text>
        ) : null}
      </View>
    );
  }

  // --- Điền từ: ô nhập text + đếm số từ trực tiếp. ---
  if (isFillIn(type)) {
    return <FillInInput q={q} value={value} onChange={onChange} onCommit={onCommit} graded={graded} disabled={disabled} />;
  }

  // multiple_choice / choosing_title: màn hình tự vẽ nút .option.
  return null;
}

function FillInInput({
  q, value, onChange, onCommit, graded, disabled,
}: {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void;
  graded?: AnswerResultLike | null;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const [focused, setFocused] = useState(false);
  const n = wordCount(value);
  const over = q.wordLimit != null && n > q.wordLimit;
  const base = FILL_IN_PLACEHOLDERS[q.questionType || ''] ?? 'Nhập đáp án';
  const placeholder = q.wordLimit != null ? `${base} (tối đa ${q.wordLimit} từ)` : base;
  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        editable={!disabled && !graded}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        onChangeText={onChange}
        onBlur={() => {
          setFocused(false);
          onCommit?.(value);
        }}
        onFocus={() => setFocused(true)}
        style={[
          styles.input,
          {
            borderColor: over ? colors.danger : focused ? colors.accent : colors.border,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: scaled(15),
          },
          livelyCard(colors, 'compact'),
        ]}
      />
      <Text style={[styles.wordCount, { color: over ? colors.danger : colors.muted, fontSize: scaled(13) }]}>
        {q.wordLimit != null ? `${n}/${q.wordLimit} từ` : `${n} từ`}
        {over ? ' — vượt giới hạn số từ, hãy rút gọn đáp án.' : ''}
      </Text>
      {graded && graded.correctText != null ? (
        <Text style={[styles.answerLine, { color: colors.text, fontSize: scaled(14) }]}>
          Đáp án đúng: <Text style={{ fontWeight: '700' }}>{graded.correctText}</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm, width: '100%' },
  hint: { flexWrap: 'wrap' },
  pillRow: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
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
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    width: '100%',
  },
  wordCount: { flexWrap: 'wrap' },
  answerLine: { flexWrap: 'wrap' },
  warnBox: { borderRadius: RADIUS.button, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
});
