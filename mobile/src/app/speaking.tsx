// Luyện Speaking IELTS — port từ frontend/src/pages/Speaking.tsx.
// Đề theo Part (Part 1 chủ đề, Part 2 cue card + chuẩn bị 1 phút,
// Part 3 theo bộ). Ghi âm bằng expo-audio (useAudioRecorder), nghe lại,
// lưu lên server (base64). Micro bị từ chối thì báo rõ + nút thử lại,
// KHÔNG giả lập bản ghi.
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import { ApiError, api, type SpeakingPrompt, type SpeakingRecording } from '../api';
import { horizontalPadding, LIST_DEFAULTS, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { useTextSize, useTheme } from '../theme';
import { fmtClock } from './writing';

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  // btoa có sẵn trên React Native (Hermes) — không cần thêm thư viện.
  return globalThis.btoa(binary);
}

function mimeTypeOf(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'm4a') return 'audio/m4a';
  if (ext === 'mp4') return 'audio/mp4';
  if (ext === 'caf') return 'audio/x-caf';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'aac') return 'audio/aac';
  return 'audio/m4a';
}

type Row =
  | { kind: 'header'; part: 1 | 2 | 3 }
  | { kind: 'prompt'; prompt: SpeakingPrompt };

const PART_TITLES: Record<number, string> = {
  1: 'Part 1 — Hỏi đáp',
  2: 'Part 2 — Nói dài (cue card)',
  3: 'Part 3 — Thảo luận',
};

const PromptRow = memo(function PromptRow({
  p,
  selected,
  onPrep,
  onSelect,
}: {
  p: SpeakingPrompt;
  selected: boolean;
  onPrep: (p: SpeakingPrompt) => void;
  onSelect: (p: SpeakingPrompt) => void;
}) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  return (
    <View
      style={[
        styles.promptCard,
        {
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: selected ? colors.surfaceMuted : colors.surface,
        },
      ]}
    >
      <Text style={[styles.promptTopic, { color: colors.text, fontSize: scaled(15) }]}>{p.topic}</Text>
      {p.cueCard ? (
        <Text style={[styles.promptText, { color: colors.text, fontSize: scaled(15) }]}>{p.cueCard}</Text>
      ) : null}
      {p.bullets?.length
        ? p.bullets.map((b, i) => (
            <Text key={i} style={[styles.promptText, { color: colors.muted, fontSize: scaled(14) }]}>• {b}</Text>
          ))
        : null}
      {p.questions?.length
        ? p.questions.map((q, i) => (
            <Text key={i} style={[styles.promptText, { color: colors.muted, fontSize: scaled(14) }]}>• {q}</Text>
          ))
        : null}
      <View style={styles.row}>
        {p.part === 2 && (
          <Pressable
            style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
            onPress={() => onPrep(p)}
          >
            <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>Chuẩn bị 1 phút</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.smallButton, { backgroundColor: colors.accent, flex: 1 }]}
          onPress={() => onSelect(p)}
        >
          <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>
            {selected ? '✓ Đang chọn đề này' : 'Chọn đề này'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

export default function SpeakingScreen() {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const [prompts, setPrompts] = useState<SpeakingPrompt[]>([]);
  const [recs, setRecs] = useState<SpeakingRecording[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [micError, setMicError] = useState('');
  const [active, setActive] = useState<SpeakingPrompt | null>(null);
  const [prepLeft, setPrepLeft] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  // expo-audio: recorder + player nghe lại (tự release khi unmount).
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const playPlayer = useAudioPlayer();
  const playStatus = useAudioPlayerStatus(playPlayer);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRecs = useCallback(() => {
    api.speakingRecordings().then(setRecs).catch(() => undefined);
  }, []);
  useEffect(() => {
    api
      .speakingPrompts()
      .then(setPrompts)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được đề Speaking.'))
      .finally(() => setLoading(false));
    loadRecs();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (prepRef.current) clearInterval(prepRef.current);
      recorder.stop().catch(() => undefined);
      playPlayer.pause();
    };
  }, [loadRecs, recorder, playPlayer]);

  // Nghe lại xong → tắt trạng thái đang phát. Dùng pattern "điều
  // chỉnh state trong lúc render" (như prevAudioKey ở AudioPlayer)
  // thay vì setState trong effect, vì rule react-hooks cấm setState
  // trực tiếp trong effect.
  const [prevDidJustFinish, setPrevDidJustFinish] = useState(false);
  if (playStatus.didJustFinish !== prevDidJustFinish) {
    setPrevDidJustFinish(playStatus.didJustFinish);
    if (playStatus.didJustFinish) setPlayingUri(null);
  }

  const startPrep = useCallback((p: SpeakingPrompt) => {
    setActive(p);
    setPrepLeft(60);
    if (prepRef.current) clearInterval(prepRef.current);
    prepRef.current = setInterval(() => {
      setPrepLeft((s) => {
        if (s <= 1 && prepRef.current) clearInterval(prepRef.current);
        return Math.max(0, s - 1);
      });
    }, 1000);
  }, []);

  const startRec = useCallback(async () => {
    if (!active || recording) return;
    setMicError('');
    setSaved(false);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setMicError('Không có quyền micro. Hãy cho phép quyền micro trong cài đặt rồi bấm "thử lại".');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setElapsed(0);
      setAudioUri(null);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setMicError('Không truy cập được micro. Hãy cho phép quyền micro rồi bấm "thử lại".');
    }
  }, [active, recording, recorder]);

  const stopRec = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      setAudioUri(recorder.uri);
    } catch {
      /* đã dừng rồi */
    }
  }, [recorder]);

  const playUri = useCallback((uri: string) => {
    try {
      if (playingUri === uri) {
        playPlayer.pause();
        setPlayingUri(null);
        return;
      }
      playPlayer.replace(uri);
      playPlayer.play();
      setPlayingUri(uri);
    } catch {
      setPlayingUri(null);
    }
  }, [playingUri, playPlayer]);

  const saveRec = useCallback(async () => {
    if (!audioUri || !active || saving) return;
    setSaving(true);
    setError('');
    try {
      const file = new FileSystem.File(audioUri);
      const base64 = arrayBufferToBase64(await file.arrayBuffer());
      await api.saveSpeakingRecording({
        promptId: active.id,
        part: active.part,
        audioBase64: base64,
        mimeType: mimeTypeOf(audioUri),
        durationSec: elapsed,
      });
      setSaved(true);
      loadRecs();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được bản ghi.');
    } finally {
      setSaving(false);
    }
  }, [audioUri, active, saving, elapsed, loadRecs]);

  const rows: Row[] = ([1, 2, 3] as const).flatMap((n) => [
    { kind: 'header', part: n } as Row,
    ...prompts
      .filter((p) => p.part === n)
      .map((p) => ({ kind: 'prompt', prompt: p }) as Row),
  ]);

  const keyExtractor = useCallback((r: Row) => {
    if (r.kind === 'header') return `header-${r.part}`;
    return r.prompt.id;
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'header') {
        return (
          <Text style={[styles.partTitle, { color: colors.text, fontSize: scaled(18) }]}>
            {PART_TITLES[item.part]}
          </Text>
        );
      }
      return (
        <PromptRow
          p={item.prompt}
          selected={active?.id === item.prompt.id}
          onPrep={startPrep}
          onSelect={(p) => {
            setActive(p);
            setSaved(false);
            setAudioUri(null);
          }}
        />
      );
    },
    [active, colors, scaled, startPrep],
  );

  const pad = horizontalPadding(width);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.wrap, { paddingHorizontal: pad }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: colors.accent, fontSize: scaled(15) }]}>‹ Quay lại</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text, fontSize: scaled(24) }]}>🎤 Luyện Speaking IELTS</Text>
        <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
          Part 1 hỏi đáp · Part 2 nói 1:30–2:00 · Part 3 thảo luận. Đề mẫu — nội dung tự soạn, chưa phải đề
          thi thật.
        </Text>
        {error ? (
          <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
        ) : null}
        {micError ? (
          <View style={[styles.micError, { backgroundColor: colors.surfaceMuted, borderColor: colors.danger }]}>
            <Text style={[styles.micErrorText, { color: colors.danger, fontSize: scaled(14) }]}>{micError}</Text>
            <Pressable
              style={[styles.smallButton, { backgroundColor: colors.accent }]}
              onPress={() => void startRec()}
            >
              <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Thử lại</Text>
            </Pressable>
          </View>
        ) : null}

        {active && (
          <View style={[styles.activeCard, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
            <Text style={[styles.activeTitle, { color: colors.text, fontSize: scaled(16) }]}>
              🎙️ Đang luyện: {active.topic} (Part {active.part})
            </Text>
            {active.part === 2 && prepLeft > 0 && (
              <Text style={[styles.activeText, { color: colors.text, fontSize: scaled(15) }]}>
                ⏱ Chuẩn bị: còn <Text style={{ fontWeight: '700' }}>{fmtClock(prepLeft)}</Text>
              </Text>
            )}
            {active.part === 2 && (
              <Text style={[styles.activeText, { color: colors.muted, fontSize: scaled(14) }]}>
                Nói 1:30–2:00. Nếu dừng quá 5 giây, hít một hơi rồi nói tiếp — đừng bỏ dở.
              </Text>
            )}
            <Text style={[styles.activeText, { color: colors.text, fontSize: scaled(15) }]}>
              ⏱ Đã nói: <Text style={{ fontWeight: '700' }}>{fmtClock(elapsed)}</Text>
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: recording ? colors.danger : colors.accent }]}
              onPress={() => void (recording ? stopRec() : startRec())}
            >
              <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(16) }]}>
                {recording ? '■ Dừng ghi âm' : '● Bắt đầu ghi âm'}
              </Text>
            </Pressable>
            {audioUri && (
              <>
                <Pressable
                  style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border }]}
                  onPress={() => void playUri(audioUri)}
                >
                  <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(15) }]}>
                    {playingUri === audioUri ? '⏸ Dừng nghe lại' : '▶ Nghe lại bản ghi'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.button, { backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }]}
                  onPress={() => void saveRec()}
                  disabled={saving}
                >
                  <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(16) }]}>
                    {saving ? 'Đang lưu…' : 'Lưu bản ghi'}
                  </Text>
                </Pressable>
              </>
            )}
            {saved && (
              <Text style={[styles.note, { color: colors.success, fontSize: scaled(15) }]}>
                ✅ Đã lưu bản ghi. Chưa chấm AI — sẽ có ở Giai đoạn 2.
              </Text>
            )}
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            {...LIST_DEFAULTS}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.muted, fontSize: scaled(15) }]}>Chưa có đề Speaking mẫu.</Text>
            }
            ListFooterComponent={
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>
                  Bản ghi của tôi ({recs.length})
                </Text>
                {!recs.length && (
                  <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>Chưa có bản ghi nào.</Text>
                )}
                {recs.map((r) => (
                  <View key={r.id} style={[styles.recItem, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                    <Text style={[styles.recText, { color: colors.text, fontSize: scaled(15) }]}>
                      Part {r.part} · {r.promptId}
                      {r.durationSec != null ? ` · ${fmtClock(r.durationSec)}` : ''}
                      {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString('vi-VN')}` : ''}
                      {r.isBaseline ? ' · Bài mẫu chẩn đoán' : ''}
                    </Text>
                    {r.audioData ? (
                      <Pressable
                        style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border }]}
                        onPress={() => void playUri(r.audioData as string)}
                      >
                        <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>
                          {playingUri === r.audioData ? '⏸ Dừng' : '▶ Nghe lại'}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>Không có file audio.</Text>
                    )}
                  </View>
                ))}
              </View>
            }
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: {
    flex: 1,
    paddingVertical: SPACING.lg,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: SPACING.sm,
  },
  back: { fontWeight: '600' },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  sub: { flexWrap: 'wrap' },
  error: { flexWrap: 'wrap' },
  note: { flexWrap: 'wrap' },
  muted: { flexWrap: 'wrap' },
  loader: { marginTop: SPACING.lg },
  list: { gap: SPACING.sm, paddingBottom: SPACING.md },
  empty: { textAlign: 'center', marginTop: SPACING.lg, flexWrap: 'wrap' },
  partTitle: { fontWeight: '700', flexWrap: 'wrap', marginTop: SPACING.sm },
  promptCard: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.xs,
    width: '100%',
  },
  promptTopic: { fontWeight: '700', flexWrap: 'wrap' },
  promptText: { flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
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
  activeCard: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    gap: SPACING.sm,
    width: '100%',
  },
  activeTitle: { fontWeight: '700', flexWrap: 'wrap' },
  activeText: { flexWrap: 'wrap' },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  micError: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.sm,
    width: '100%',
  },
  micErrorText: { flexWrap: 'wrap' },
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    gap: SPACING.sm,
    width: '100%',
    marginTop: SPACING.sm,
  },
  cardTitle: { fontWeight: '700', flexWrap: 'wrap' },
  recItem: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    padding: SPACING.md,
    gap: SPACING.xs,
    width: '100%',
  },
  recText: { fontWeight: '600', flexWrap: 'wrap' },
});
