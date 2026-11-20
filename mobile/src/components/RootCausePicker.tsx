// Picker chọn nguyên nhân gốc cho 1 câu IELTS sai/đoán mò — port của
// RootCausePicker trong frontend/src/ielts-phase1.tsx.
// Giải thích bị ẨN cho tới khi ghi xong nguyên nhân (POST
// /api/ielts/error-log). Nếu backend lỗi thì vẫn mở giải thích, không
// chặn người học (hành vi web).
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { RADIUS, SPACING } from '../layout';
import { livelyCard, livelyChip, raisedButton, useTextSize, useTheme } from '../theme';

export interface ErrorCodeInfo {
  code: string;
  skill: 'listening' | 'reading' | 'writing' | 'speaking';
  name: string;
}

/** 33 mã lỗi v3 (error codes = monsters), như web. */
export const ERROR_CODES: ErrorCodeInfo[] = [
  { code: 'L1', skill: 'listening', name: 'Không nhận ra từ' },
  { code: 'L2', skill: 'listening', name: 'Hiểu nhưng không kịp ghi' },
  { code: 'L3', skill: 'listening', name: 'Mất tập trung/lạc câu' },
  { code: 'L4', skill: 'listening', name: 'Dính bẫy đổi ý / phủ định' },
  { code: 'L5', skill: 'listening', name: 'Sai chính tả / số ít-số nhiều / viết hoa' },
  { code: 'L6', skill: 'listening', name: 'Không hiểu paraphrase' },
  { code: 'L7', skill: 'listening', name: 'Không quen giọng' },
  { code: 'L8', skill: 'listening', name: 'Sai giới hạn số từ / sai dạng từ' },
  { code: 'L9', skill: 'listening', name: 'Sai khi chép sang phiếu' },
  { code: 'R1', skill: 'reading', name: 'Không biết từ' },
  { code: 'R2', skill: 'reading', name: 'Hiểu sai paraphrase' },
  { code: 'R3', skill: 'reading', name: 'Nhầm False và Not Given' },
  { code: 'R4', skill: 'reading', name: 'Bị từ khóa đánh lừa' },
  { code: 'R5', skill: 'reading', name: 'Hết giờ' },
  { code: 'R6', skill: 'reading', name: 'Sai ý chính' },
  { code: 'R7', skill: 'reading', name: 'Đọc ẩu/đọc sót yêu cầu' },
  { code: 'R8', skill: 'reading', name: 'Đoán mò' },
  { code: 'W1', skill: 'writing', name: 'Lạc đề / thiếu phần' },
  { code: 'W2', skill: 'writing', name: 'Ý mỏng, không phát triển' },
  { code: 'W3', skill: 'writing', name: 'Task 1 thiếu overview' },
  { code: 'W4', skill: 'writing', name: 'Liên kết sai / lạm dụng linking words' },
  { code: 'W5', skill: 'writing', name: 'Từ vựng lặp, sai sắc thái' },
  { code: 'W6', skill: 'writing', name: 'Cấu trúc câu đơn điệu' },
  { code: 'W7', skill: 'writing', name: 'Lỗi ngữ pháp lặp' },
  { code: 'W8', skill: 'writing', name: 'Thiếu số từ hoặc hết giờ' },
  { code: 'S1', skill: 'speaking', name: 'Ngập ngừng dài, lặp từ đệm' },
  { code: 'S2', skill: 'speaking', name: 'Trả lời quá ngắn' },
  { code: 'S3', skill: 'speaking', name: 'Part 2 hết ý trước 1:30' },
  { code: 'S4', skill: 'speaking', name: 'Từ vựng nghèo, lặp' },
  { code: 'S5', skill: 'speaking', name: 'Lỗi ngữ pháp lặp' },
  { code: 'S6', skill: 'speaking', name: 'Sai âm cuối, âm th, s/z' },
  { code: 'S7', skill: 'speaking', name: 'Ngữ điệu phẳng, trọng âm sai' },
  { code: 'S8', skill: 'speaking', name: 'Hiểu sai câu hỏi' },
];

export function errorCodeName(code: string): string {
  const c = ERROR_CODES.find((e) => e.code === code);
  return c ? `${c.code} — ${c.name}` : code;
}

export function codesForSkill(skill: string): ErrorCodeInfo[] {
  return ERROR_CODES.filter((e) => e.skill === skill);
}

/** Skill của 1 câu theo Part: part 1–4 → Listening, 5–7 → Reading. */
export function skillOfPart(part: number): 'listening' | 'reading' {
  return part <= 4 ? 'listening' : 'reading';
}

interface Props {
  skill: string;
  questionId?: string;
  attemptId?: number;
  questionType?: string;
  guessed?: boolean;
  timeSpentSec?: number;
  onLogged: (code: string) => void;
}

export default function RootCausePicker({
  skill, questionId, attemptId, questionType, guessed, timeSpentSec, onLogged,
}: Props) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverCodes, setServerCodes] = useState<{ code: string; skill: string; name: string }[] | null>(null);

  useEffect(() => {
    api.errorCodes().then(setServerCodes).catch(() => undefined);
  }, []);

  const list: ErrorCodeInfo[] = serverCodes?.length
    ? serverCodes
        .filter((c) => !skill || c.skill === skill)
        .map((c) => ({ code: c.code, skill: c.skill as ErrorCodeInfo['skill'], name: c.name }))
    : skill
      ? codesForSkill(skill)
      : ERROR_CODES.filter((e) => e.skill === 'listening' || e.skill === 'reading');

  const save = useCallback(async () => {
    if (!code) return;
    setSaving(true);
    setError(null);
    try {
      await api.logError({ questionId, attemptId, skill, questionType, errorCode: code, guessed, timeSpentSec });
      onLogged(code);
    } catch (e) {
      // Backend chưa sẵn sàng thì vẫn mở giải thích, không chặn người học.
      setError(e instanceof Error ? e.message : String(e));
      onLogged(code);
    } finally {
      setSaving(false);
    }
  }, [code, questionId, attemptId, skill, questionType, guessed, timeSpentSec, onLogged]);

  return (
    <View style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, livelyCard(colors, 'compact')]}>
      <Text style={[styles.title, { color: colors.text, fontSize: scaled(15) }]}>
        🔍 Vì sao mình sai câu này?{guessed ? ' (bạn đã đánh dấu đoán mò 🤔)' : ''} Chọn 1 nguyên nhân để ghi vào sổ lỗi — giải thích sẽ hiện sau khi bạn chọn.
      </Text>
      {error ? (
        <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
      ) : null}
      <View style={styles.chips}>
        {list.map((c) => {
          const selected = code === c.code;
          return (
            <Pressable
              key={c.code}
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: colors.surface },
                selected && { borderColor: colors.accent, backgroundColor: colors.accent },
                livelyChip(colors),
              ]}
              onPress={() => setCode(c.code)}
            >
              <Text
                style={{
                  color: selected ? colors.onAccent : colors.text,
                  fontSize: scaled(14),
                  fontWeight: selected ? '700' : '400',
                }}
              >
                {c.code} · {c.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        style={[styles.saveButton, { backgroundColor: colors.accent }, (!code || saving) && styles.disabled, raisedButton(colors)]}
        disabled={!code || saving}
        onPress={() => void save()}
      >
        <Text style={[styles.saveText, { color: colors.onAccent, fontSize: scaled(15) }]}>
          {saving ? 'Đang ghi…' : 'Ghi nguyên nhân & xem giải thích'}
        </Text>
      </Pressable>
      <Text style={[styles.note, { color: colors.muted, fontSize: scaled(13) }]}>
        Ghi đúng nguyên nhân giúp app nhắc ôn đúng lỗi — quái tương ứng sẽ mất máu.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    width: '100%',
  },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  error: { flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  saveButton: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveText: { fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.6 },
  note: { flexWrap: 'wrap' },
});
