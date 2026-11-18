// Sổ lỗi IELTS — port từ frontend/src/pages/ErrorLog.tsx.
// (a) hàng đợi ôn đến hạn, (b) toàn bộ lỗi + lọc theo skill/mã,
// (c) lỗi theo tuần (dạng danh sách), (d) quái (monsters) với HP,
// (e) thêm lỗi thủ công (dùng cho Writing/Speaking — ghi tay).
// Luật quái (v3): HP 3 mỗi mã lỗi, ôn đúng liên tiếp 3 lần là diệt.
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { ApiError, api, type ErrorCode, type ErrorLogEntry, type Monster, type WeeklyError } from '../api';
import { horizontalPadding, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { questionTypeName } from '../lib';
import { maybeScheduleDueReminder } from '../notifications';
import { useTextSize, useTheme } from '../theme';
import { BackButton } from '../components/BackButton';

// 33 mã lỗi (IELTS v3) — giống frontend/src/ielts-phase1.tsx; dùng làm
// fallback khi GET /api/ielts/error-codes lỗi, và để lấy tên mã.
export const ERROR_CODES: { code: string; skill: string; name: string }[] = [
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

export const SKILL_LABEL: Record<string, string> = {
  listening: 'Listening',
  reading: 'Reading',
  writing: 'Writing',
  speaking: 'Speaking',
};
export const SKILL_EMOJI: Record<string, string> = {
  listening: '🎧',
  reading: '📖',
  writing: '✍️',
  speaking: '🎤',
};
export function errorCodeName(code: string, codes?: ErrorCode[]): string {
  const c = (codes ?? ERROR_CODES).find((e) => e.code === code);
  return c ? `${c.code} — ${c.name}` : code;
}
export function codesForSkill(skill: string, codes?: ErrorCode[]): { code: string; skill: string; name: string }[] {
  return (codes ?? ERROR_CODES).filter((e) => e.skill === skill);
}

const ErrorItem = memo(function ErrorItem({
  it,
  codes,
  onReview,
}: {
  it: ErrorLogEntry;
  codes: ErrorCode[];
  onReview?: (id: number, correct: boolean) => void;
}) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  return (
    <View style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
      <Text style={[styles.panelTitle, { color: colors.text, fontSize: scaled(15) }]}>
        {errorCodeName(it.errorCode, codes)} · {SKILL_EMOJI[it.skill] ?? ''} {SKILL_LABEL[it.skill] ?? it.skill}
        {it.questionType ? ` · ${questionTypeName(it.questionType)}` : ''}
        {it.guessed ? ' · 🤔 đoán mò' : ''}
      </Text>
      {it.evidence ? (
        <Text style={[styles.panelText, { color: colors.muted, fontSize: scaled(14) }]}>{it.evidence}</Text>
      ) : null}
      {it.missedKeyword ? (
        <Text style={[styles.panelText, { color: colors.muted, fontSize: scaled(14) }]}>
          Từ bỏ lỡ: <Text style={{ fontWeight: '700', color: colors.text }}>{it.missedKeyword}</Text>
        </Text>
      ) : null}
      {it.createdAt ? (
        <Text style={[styles.panelText, { color: colors.muted, fontSize: scaled(13) }]}>
          {new Date(it.createdAt).toLocaleDateString('vi-VN')}
          {it.reviewCount != null ? ` • Đã ôn ${it.reviewCount} lần` : ''}
        </Text>
      ) : null}
      {onReview && (
        <View style={styles.row}>
          <Pressable
            style={[styles.smallButton, { backgroundColor: colors.accent, flex: 1 }]}
            onPress={() => onReview(it.id, true)}
          >
            <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Tôi đã làm đúng ✓</Text>
          </Pressable>
          <Pressable
            style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
            onPress={() => onReview(it.id, false)}
          >
            <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>Vẫn sai ✗</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

const MonsterCard = memo(function MonsterCard({ m }: { m: Monster }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const hp = Math.max(0, Math.min(3, m.hp));
  return (
    <View
      style={[
        styles.monster,
        { backgroundColor: colors.surface, borderColor: m.killed ? colors.success : colors.border },
      ]}
    >
      <Text style={[styles.monsterEmoji, { fontSize: scaled(24) }]}>{SKILL_EMOJI[m.skill] ?? '👹'}</Text>
      <Text style={[styles.monsterName, { color: colors.text, fontSize: scaled(14) }]}>
        {m.code} — {m.name}
      </Text>
      <Text style={[styles.monsterMeta, { color: colors.muted, fontSize: scaled(13) }]}>
        {SKILL_LABEL[m.skill] ?? m.skill} · {m.hits} lần mắc · {m.resolved}/{m.total} lần sửa đúng
      </Text>
      <View style={[styles.hpBar, { backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.hpFill, { width: `${(hp / 3) * 100}%`, backgroundColor: m.killed ? colors.success : colors.danger }]} />
      </View>
      <Text style={[styles.monsterHp, { color: colors.text, fontSize: scaled(13) }]}>
        {m.killed ? '✅ Đã diệt ✓' : `HP: ${m.hp}/3`}
      </Text>
    </View>
  );
});

export default function ErrorLogScreen() {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const [due, setDue] = useState<ErrorLogEntry[]>([]);
  const [all, setAll] = useState<ErrorLogEntry[]>([]);
  const [weekly, setWeekly] = useState<WeeklyError[]>([]);
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [codes, setCodes] = useState<ErrorCode[]>(ERROR_CODES);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [xpNote, setXpNote] = useState('');
  const [filterSkill, setFilterSkill] = useState('');
  const [filterCode, setFilterCode] = useState('');

  // (e) Thêm lỗi thủ công.
  const [meSkill, setMeSkill] = useState('writing');
  const [meCode, setMeCode] = useState('W1');
  const [meEvidence, setMeEvidence] = useState('');
  const [meKeyword, setMeKeyword] = useState('');
  const [meSaving, setMeSaving] = useState(false);
  const [meDone, setMeDone] = useState(false);

  const load = useCallback(() => {
    Promise.allSettled([
      api.errorLogDue().then((d) => {
        setDue(d);
        // Nhắc 1 lần lúc 8:00 sáng mai nếu có câu đến hạn (tối đa 1 lần/ngày).
        void maybeScheduleDueReminder(d.length);
      }),
      api.errorLog().then(setAll),
      api.errorLogWeekly().then(setWeekly),
      api.monsters().then(setMonsters),
      api.errorCodes().then((c) => {
        if (c.length) setCodes(c);
      }),
    ])
      .then((results) => {
        if (results[0].status === 'rejected' || results[1].status === 'rejected') {
          setError('Không tải được sổ lỗi. Thử lại sau.');
        }
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const review = useCallback(async (id: number, correct: boolean) => {
    setError('');
    try {
      const r = await api.reviewError(id, correct);
      setDue((prev) => prev.filter((i) => i.id !== id));
      setXpNote(
        correct
          ? `✅ Ghi nhận đúng!${r.xpAwarded ? ` +${r.xpAwarded} XP` : ''}`
          : 'Đã ghi nhận — lỗi này sẽ được nhắc lại sau.',
      );
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không ghi nhận được lần ôn này.');
    }
  }, [load]);

  const filtered = useMemo(
    () =>
      all.filter(
        (i) =>
          (!filterSkill || i.skill === filterSkill) &&
          (!filterCode || i.errorCode === filterCode),
      ),
    [all, filterSkill, filterCode],
  );
  const killed = monsters.filter((m) => m.killed);
  const maxWeekly = Math.max(1, ...weekly.map((w) => w.count));
  const weekGroups = useMemo(() => {
    const map = new Map<string, number>();
    weekly.forEach((w) => map.set(w.week, (map.get(w.week) ?? 0) + w.count));
    return [...map.entries()].slice(-6);
  }, [weekly]);

  const meCodes = codesForSkill(meSkill, codes);
  const submitManual = useCallback(async () => {
    if (!meCode || meSaving) return;
    setMeSaving(true);
    setMeDone(false);
    setError('');  // (giữ: đây là handler, không phải effect)
    try {
      await api.logError({
        skill: meSkill,
        errorCode: meCode,
        evidence: meEvidence.trim() || undefined,
        missedKeyword: meKeyword.trim() || undefined,
      });
      setMeDone(true);
      setMeEvidence('');
      setMeKeyword('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không ghi được lỗi vào sổ.');
    } finally {
      setMeSaving(false);
    }
  }, [meCode, meSaving, meSkill, meEvidence, meKeyword, load]);

  const pad = horizontalPadding(width);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}>
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={[styles.title, { flex: 1, color: colors.text, fontSize: scaled(24) }]}>📓 Sổ lỗi IELTS</Text>
        </View>
        <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
          Mỗi lỗi là 1 con quái — ôn đúng thì quái mất máu, ôn đủ 3 lần thì quái bị diệt.
        </Text>
        {error ? (
          <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
        ) : null}
        {xpNote ? (
          <Text style={[styles.note, { color: colors.success, fontSize: scaled(14) }]}>{xpNote}</Text>
        ) : null}
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                (a) Ôn lỗi đến hạn ({due.length})
              </Text>
              {!due.length && (
                <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>
                  🎉 Không có lỗi nào đến hạn hôm nay.
                </Text>
              )}
              {due.map((it) => (
                <ErrorItem key={it.id} it={it} codes={codes} onReview={review} />
              ))}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                (b) Tất cả lỗi ({filtered.length}/{all.length})
              </Text>
              <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Kỹ năng</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                <Pressable
                  style={[styles.chip, { borderColor: colors.border, backgroundColor: !filterSkill ? colors.accent : colors.surface }]}
                  onPress={() => { setFilterSkill(''); setFilterCode(''); }}
                >
                  <Text style={{ color: !filterSkill ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>Tất cả</Text>
                </Pressable>
                {Object.entries(SKILL_LABEL).map(([k, v]) => (
                  <Pressable
                    key={k}
                    style={[styles.chip, { borderColor: colors.border, backgroundColor: filterSkill === k ? colors.accent : colors.surface }]}
                    onPress={() => { setFilterSkill(k); setFilterCode(''); }}
                  >
                    <Text style={{ color: filterSkill === k ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
                      {SKILL_EMOJI[k]} {v}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              {filterSkill ? (
                <>
                  <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Mã lỗi</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                    <Pressable
                      style={[styles.chip, { borderColor: colors.border, backgroundColor: !filterCode ? colors.accent : colors.surface }]}
                      onPress={() => setFilterCode('')}
                    >
                      <Text style={{ color: !filterCode ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>Tất cả</Text>
                    </Pressable>
                    {codesForSkill(filterSkill, codes).map((c) => (
                      <Pressable
                        key={c.code}
                        style={[styles.chip, { borderColor: colors.border, backgroundColor: filterCode === c.code ? colors.accent : colors.surface }]}
                        onPress={() => setFilterCode(c.code)}
                      >
                        <Text style={{ color: filterCode === c.code ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
                          {c.code} · {c.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}
              {filtered.slice(0, 50).map((it) => (
                <ErrorItem key={it.id} it={it} codes={codes} />
              ))}
              {filtered.length > 50 && (
                <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>Hiển thị 50 lỗi đầu tiên.</Text>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                (c) Lỗi theo tuần (6 tuần gần nhất)
              </Text>
              {!weekGroups.length && (
                <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>Chưa có dữ liệu lỗi theo tuần.</Text>
              )}
              {weekGroups.map(([week, count]) => (
                <View key={week} style={styles.barRow}>
                  <Text style={[styles.barLabel, { color: colors.text, fontSize: scaled(13) }]}>{week}</Text>
                  <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
                    <View style={[styles.barFill, { width: `${(count / maxWeekly) * 100}%`, backgroundColor: colors.accent }]} />
                  </View>
                  <Text style={[styles.barCount, { color: colors.text, fontSize: scaled(13) }]}>{count}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                (d) Quái — đã diệt {killed.length}/{monsters.length} 👹
              </Text>
              {!monsters.length && (
                <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>
                  Chưa có quái nào — làm sai 1 câu và ghi nguyên nhân là quái xuất hiện.
                </Text>
              )}
              <View style={styles.monsterGrid}>
                {monsters.map((m) => (
                  <MonsterCard key={m.code} m={m} />
                ))}
              </View>
              {killed.length > 0 && (
                <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                  🏆 Bộ sưu tập quái đã diệt ({killed.length}): {killed.map((m) => `${m.code} ${m.name}`).join(' · ')}
                </Text>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>(e) Thêm lỗi thủ công</Text>
              <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
                Dùng khi tự phát hiện lỗi ở Writing/Speaking (hoặc lỗi ngoài bài luyện) — ghi tay vào sổ.
              </Text>
              <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Kỹ năng</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                {Object.entries(SKILL_LABEL).map(([k, v]) => (
                  <Pressable
                    key={k}
                    style={[styles.chip, { borderColor: colors.border, backgroundColor: meSkill === k ? colors.accent : colors.surface }]}
                    onPress={() => {
                      setMeSkill(k);
                      const first = codesForSkill(k, codes)[0]?.code;
                      if (first) setMeCode(first);
                    }}
                  >
                    <Text style={{ color: meSkill === k ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
                      {SKILL_EMOJI[k]} {v}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Mã lỗi</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                {meCodes.map((c) => (
                  <Pressable
                    key={c.code}
                    style={[styles.chip, { borderColor: colors.border, backgroundColor: meCode === c.code ? colors.accent : colors.surface }]}
                    onPress={() => setMeCode(c.code)}
                  >
                    <Text style={{ color: meCode === c.code ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
                      {c.code} · {c.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Bằng chứng (câu/ví dụ cụ thể)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
                value={meEvidence}
                onChangeText={setMeEvidence}
                placeholder="VD: Viết 'more better' trong Task 2…"
                placeholderTextColor={colors.muted}
                multiline
              />
              <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Từ khóa bỏ lỡ (nếu có)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
                value={meKeyword}
                onChangeText={setMeKeyword}
                placeholder="VD: furthermore"
                placeholderTextColor={colors.muted}
              />
              <Pressable
                style={[styles.button, { backgroundColor: colors.accent, opacity: meSaving || !meCode ? 0.6 : 1 }]}
                onPress={() => void submitManual()}
                disabled={meSaving || !meCode}
              >
                <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
                  {meSaving ? 'Đang ghi…' : 'Ghi lỗi vào sổ'}
                </Text>
              </Pressable>
              {meDone && (
                <Text style={[styles.note, { color: colors.success, fontSize: scaled(14) }]}>✅ Đã ghi lỗi vào sổ.</Text>
              )}
            </View>
          </>
        )}
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
  title: { fontWeight: '700', flexWrap: 'wrap' },
  sub: { flexWrap: 'wrap' },
  error: { flexWrap: 'wrap' },
  note: { flexWrap: 'wrap' },
  muted: { flexWrap: 'wrap' },
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.xs,
    width: '100%',
  },
  cardTitle: { fontWeight: '700', flexWrap: 'wrap' },
  label: { fontWeight: '600', marginTop: SPACING.sm },
  // Hàng lọc: trượt ngang 1 hàng, không vỡ thành nhiều hàng lệch.
  filterScroll: { gap: SPACING.sm, paddingRight: SPACING.sm },
  chip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  panel: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    padding: SPACING.sm,
    gap: SPACING.xs,
    width: '100%',
  },
  panelTitle: { fontWeight: '700', flexWrap: 'wrap' },
  panelText: { flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  smallButton: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  outlineButton: { borderWidth: 1, backgroundColor: 'transparent' },
  smallButtonText: { fontWeight: '700', textAlign: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, width: '100%' },
  barLabel: { minWidth: 64 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barCount: { minWidth: 24, textAlign: 'right', fontWeight: '700' },
  monsterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  monster: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 150,
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.sm,
    gap: SPACING.xs,
  },
  monsterEmoji: { textAlign: 'left' },
  monsterName: { fontWeight: '700', flexWrap: 'wrap' },
  monsterMeta: { flexWrap: 'wrap' },
  hpBar: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  hpFill: { height: '100%', borderRadius: 4 },
  monsterHp: { fontWeight: '600', flexWrap: 'wrap' },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    width: '100%',
  },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: SPACING.sm,
  },
  buttonText: { fontWeight: '700', textAlign: 'center' },
});
