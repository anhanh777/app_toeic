// Thiết lập lần đầu cho IELTS — port từ frontend/src/pages/IeltsSetup.tsx.
// Lưu lên backend (POST /api/ielts/profile, setupDone=true) VÀ mirror
// AsyncStorage (ielts_setup_done + ielts_profile) như bản web: backend
// lỗi thì vẫn giữ bản local và cho đi tiếp, không chặn người học.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { ApiError, api, type QuitReason } from '../api';
import { horizontalPadding, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { useTextSize, useTheme } from '../theme';
import { BackButton } from '../components/BackButton';

const REASONS: { id: QuitReason; label: string; note: string }[] = [
  { id: 'chan', label: 'Chán', note: 'App sẽ ưu tiên đổi chủ đề thường xuyên và thêm thử thách ngắn.' },
  { id: 'met', label: 'Mệt', note: 'App sẽ ưu tiên chế độ ngày nhẹ (bad-day) và bài ngắn 5–10 phút.' },
  { id: 'khong_thay_tien_bo', label: 'Không thấy tiến bộ', note: 'App sẽ ưu tiên cho bạn thấy Band Compass và biểu đồ lỗi theo tuần.' },
];

const BAND_KEYS = [
  ['listening', '🎧 Listening'],
  ['reading', '📖 Reading'],
  ['writing', '✍️ Writing'],
  ['speaking', '🎤 Speaking'],
] as const;
type BandKey = (typeof BAND_KEYS)[number][0];

export default function IeltsSetupScreen() {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const [examDate, setExamDate] = useState('');
  const [bands, setBands] = useState<Record<BandKey, string>>({
    listening: '6.5',
    reading: '6.5',
    writing: '6.5',
    speaking: '6.5',
  });
  const [quitReason, setQuitReason] = useState<QuitReason | ''>('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .ieltsProfile()
      .then((p) => {
        if (p.examDate) setExamDate(p.examDate.slice(0, 10));
        setBands({
          listening: p.targetListening != null ? String(p.targetListening) : '6.5',
          reading: p.targetReading != null ? String(p.targetReading) : '6.5',
          writing: p.targetWriting != null ? String(p.targetWriting) : '6.5',
          speaking: p.targetSpeaking != null ? String(p.targetSpeaking) : '6.5',
        });
        if (p.quitReason) setQuitReason(p.quitReason);
      })
      .catch(() => {
        /* chưa có hồ sơ — dùng mặc định */
      })
      .finally(() => setLoading(false));
  }, []);

  const setBand = (k: BandKey, v: string) => {
    const n = Number(v);
    if (v === '' || !Number.isNaN(n)) {
      setBands((b) => ({ ...b, [k]: v }));
    }
  };
  const bandNum = (k: BandKey): number => {
    const n = Number(bands[k]);
    if (Number.isNaN(n)) return 6.5;
    return Math.max(0, Math.min(9, n));
  };

  const submit = async (skip: boolean) => {
    if (saving) return;
    setSaving(true);
    setError('');
    const profile = skip
      ? { skipped: true, setupDone: true }
      : {
          examDate: examDate.trim() || undefined,
          targetListening: bandNum('listening'),
          targetReading: bandNum('reading'),
          targetWriting: bandNum('writing'),
          targetSpeaking: bandNum('speaking'),
          quitReason: quitReason || undefined,
          setupDone: true,
        };
    try {
      await AsyncStorage.setItem('ielts_setup_done', '1');
      await AsyncStorage.setItem('ielts_profile', JSON.stringify(profile));
    } catch {
      /* mirror local lỗi thì vẫn đi tiếp */
    }
    try {
      await api.saveIeltsProfile(profile);
    } catch (e) {
      // Bản web: backend lỗi vẫn cho đi tiếp bằng bản local.
      setError(e instanceof ApiError ? e.message : 'Không lưu được lên máy chủ — đã lưu trên máy, vào Hôm nay nhé.');
    } finally {
      setSaving(false);
    }
    router.replace('/today');
  };

  const pad = horizontalPadding(width);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}>
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={[styles.title, { flex: 1, color: colors.text, fontSize: scaled(24) }]}>🎓 Thiết lập IELTS của bạn</Text>
        </View>
        <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
          Mất chưa tới 1 phút — app sẽ cá nhân hoá lộ trình theo mục tiêu và lý do bạn hay bỏ cuộc.
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Ngày thi dự kiến</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
              value={examDate}
              onChangeText={setExamDate}
              placeholder="VD: 2027-03-15 (năm-tháng-ngày)"
              placeholderTextColor={colors.muted}
            />
            <Text style={[styles.section, { color: colors.text, fontSize: scaled(16) }]}>Band mục tiêu (0–9)</Text>
            <View style={styles.bandGrid}>
              {BAND_KEYS.map(([k, label]) => (
                <View key={k} style={styles.bandCell}>
                  <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>{label}</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
                    value={bands[k]}
                    onChangeText={(v) => setBand(k, v)}
                    keyboardType="decimal-pad"
                    placeholder="6.5"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              ))}
            </View>
            <Text style={[styles.section, { color: colors.text, fontSize: scaled(16) }]}>
              Vì sao bạn hay bỏ cuộc khi luyện thi?
            </Text>
            {REASONS.map((r) => {
              const selected = quitReason === r.id;
              return (
                <Pressable
                  key={r.id}
                  style={[
                    styles.reason,
                    {
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: selected ? colors.surfaceMuted : colors.surface,
                    },
                  ]}
                  onPress={() => setQuitReason(selected ? '' : r.id)}
                >
                  <Text style={[styles.reasonLabel, { color: colors.text, fontSize: scaled(15) }]}>
                    {selected ? '✓ ' : ''}{r.label}
                  </Text>
                  <Text style={[styles.reasonNote, { color: colors.muted, fontSize: scaled(14) }]}>{r.note}</Text>
                </Pressable>
              );
            })}
            {error ? (
              <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
            ) : null}
            <View style={styles.row}>
              <Pressable
                style={[styles.button, { backgroundColor: colors.accent, flex: 1, opacity: saving ? 0.7 : 1 }]}
                onPress={() => void submit(false)}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(16) }]}>Lưu và bắt đầu</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.button, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
                onPress={() => void submit(true)}
                disabled={saving}
              >
                <Text style={[styles.buttonText, { color: colors.text, fontSize: scaled(16) }]}>Bỏ qua</Text>
              </Pressable>
            </View>
            <Text style={[styles.note, { color: colors.muted, fontSize: scaled(13) }]}>
              Đổi được bất cứ lúc nào ở trang Cài đặt.
            </Text>
          </View>
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
    paddingVertical: SPACING.lg,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: SPACING.md,
  },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  sub: { flexWrap: 'wrap' },
  card: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.sm,
    width: '100%',
  },
  label: { fontWeight: '600', marginTop: SPACING.sm },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    width: '100%',
  },
  section: { fontWeight: '700', marginTop: SPACING.md },
  bandGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, width: '100%' },
  bandCell: { flexGrow: 1, flexBasis: '45%', maxWidth: '48%', minWidth: 140, gap: SPACING.xs },
  reason: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    padding: SPACING.md,
    gap: SPACING.xs,
    width: '100%',
  },
  reasonLabel: { fontWeight: '700', flexWrap: 'wrap' },
  reasonNote: { flexWrap: 'wrap' },
  error: { flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: SPACING.md, width: '100%', marginTop: SPACING.sm },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  outlineButton: { borderWidth: 1, backgroundColor: 'transparent' },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  note: { textAlign: 'center', marginTop: SPACING.sm },
});
