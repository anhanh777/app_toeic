// Trình phát audio cho phần Nghe — port của ListeningAudio (web) sang
// expo-av, KHÔNG có fallback TTS ở v1: chưa có file audio thì hiện khối
// "chưa có audio" như web.
// - Chỉ 1 nút Phát/Tạm dừng/Tiếp tục/Nghe lại duy nhất cho mỗi khối.
// - 1 Sound instance cho mỗi audio source; khi 1 hộp bắt đầu phát, hộp
//   đang phát trước đó tự dừng (module-level activeStop, như web).
// - Thanh tiến trình bấm để tua (tap-to-seek, không thêm dep slider),
//   tốc độ phát 0.5–1.5x (bước 0.25x).
// - playOnce (thi thử IELTS): mỗi Section chỉ phát 1 lần — phát xong
//   nút bị khóa hẳn, chỉ tạm dừng/tiếp tục được trong lần phát đó.
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { RADIUS, SPACING } from '../layout';
import { useTextSize, useTheme } from '../theme';

let activeStop: (() => void) | null = null;
let audioModeSet = false;

const RATES = [0.5, 0.75, 1, 1.25, 1.5];

export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  audioUrl?: string | null;
  /** Đổi giá trị này (vd. chuyển câu) thì dừng audio đang phát. */
  stopKey?: string | number;
  /** Thi thử IELTS: audio mỗi Section chỉ phát 1 lần. */
  playOnce?: boolean;
  /** Gọi 1 lần khi lần phát đầu tiên bắt đầu. */
  onFirstPlay?: () => void;
  onError?: (e: unknown) => void;
}

export default function AudioPlayer({ audioUrl, stopKey, playOnce, onFirstPlay, onError }: Props) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused' | 'ended' | 'loading'>('idle');
  const [playedOnce, setPlayedOnce] = useState(false);
  const [progress, setProgress] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [barWidth, setBarWidth] = useState(0);
  const rateRef = useRef(1);
  const statusRef = useRef(status);
  const playedOnceRef = useRef(false);
  // Đồng bộ ref sau render — không ghi ref trong lúc render (React
  // Compiler yêu cầu render thuần).
  useEffect(() => {
    statusRef.current = status;
  });
  useEffect(() => {
    playedOnceRef.current = playedOnce;
  });

  // Khi đổi audioUrl/stopKey: reset trạng thái hiển thị ngay trong lúc
  // render (pattern "adjusting state when props change" của React docs);
  // việc nạp file nằm trong effect bên dưới.
  const audioKey = `${audioUrl ?? ''}|${String(stopKey ?? '')}`;
  const [prevAudioKey, setPrevAudioKey] = useState(audioKey);
  if (prevAudioKey !== audioKey) {
    setPrevAudioKey(audioKey);
    setStatus(audioUrl ? 'loading' : 'idle');
    setPlayedOnce(false);
    setProgress(0);
    setPosition(0);
    setDuration(0);
  }

  const stopSelf = useCallback(async () => {
    const s = soundRef.current;
    if (s) {
      try {
        const st = await s.getStatusAsync();
        if (st.isLoaded && st.isPlaying) await s.pauseAsync();
        if (st.isLoaded) await s.setPositionAsync(0);
      } catch {
        /* bỏ qua */
      }
    }
    setStatus((cur) => (cur === 'loading' ? cur : 'idle'));
    setProgress(0);
    setPosition(0);
  }, []);
  const stopSelfRef = useRef(stopSelf);
  useEffect(() => {
    stopSelfRef.current = stopSelf;
  });

  // Nạp file khi có audioUrl; đổi url/stopKey thì dừng + nạp lại.
  useEffect(() => {
    let cancelled = false;
    if (!audioModeSet) {
      audioModeSet = true;
      Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false }).catch(() => {});
    }
    if (!audioUrl) {
      return undefined;
    }
    Audio.Sound.createAsync(
      { uri: audioUrl },
      { shouldPlay: false, rate: rateRef.current, shouldCorrectPitch: true },
      (st: AVPlaybackStatus) => {
        if (cancelled || !st.isLoaded) return;
        setPosition(st.positionMillis ?? 0);
        setDuration(st.durationMillis ?? 0);
        if (st.durationMillis) setProgress((st.positionMillis ?? 0) / st.durationMillis);
        if (st.didJustFinish) setStatus('ended');
        else if (st.isPlaying) setStatus('playing');
        else setStatus((cur) => (cur === 'playing' ? 'paused' : cur));
      },
    )
      .then(({ sound }) => {
        if (cancelled) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
        setStatus('idle');
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus('idle');
          onError?.(e);
        }
      });
    return () => {
      cancelled = true;
      const s = soundRef.current;
      soundRef.current = null;
      if (s) s.unloadAsync().catch(() => {});
      if (activeStop === stopSelfRef.current) activeStop = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, stopKey]);

  // Unmount: dừng hẳn.
  useEffect(
    () => () => {
      const s = soundRef.current;
      if (s) s.unloadAsync().catch(() => {});
      if (activeStop === stopSelfRef.current) activeStop = null;
    },
    [],
  );

  const markPlayed = useCallback(() => {
    if (playOnce && !playedOnceRef.current) {
      setPlayedOnce(true);
      onFirstPlay?.();
    }
  }, [playOnce, onFirstPlay]);

  const toggle = useCallback(async () => {
    const s = soundRef.current;
    if (!s) return;
    if (playOnce && playedOnceRef.current && statusRef.current !== 'playing' && statusRef.current !== 'paused') return;
    try {
      if (statusRef.current === 'playing') {
        await s.pauseAsync();
        setStatus('paused');
        return;
      }
      if (statusRef.current === 'paused') {
        if (activeStop && activeStop !== stopSelfRef.current) await activeStop();
        activeStop = stopSelfRef.current;
        await s.playAsync();
        setStatus('playing');
        return;
      }
      // idle / ended / loading: phát từ đầu (ended → replay).
      markPlayed();
      if (activeStop && activeStop !== stopSelfRef.current) await activeStop();
      activeStop = stopSelfRef.current;
      if (statusRef.current === 'ended') await s.replayAsync({ rate: rateRef.current, shouldCorrectPitch: true });
      else await s.playAsync();
      setStatus('playing');
    } catch (e) {
      onError?.(e);
    }
  }, [markPlayed, onError, playOnce]);

  const cycleRate = useCallback(async () => {
    const idx = RATES.indexOf(rateRef.current);
    const next = RATES[(idx + 1) % RATES.length];
    rateRef.current = next;
    setRate(next);
    const s = soundRef.current;
    if (s) {
      try {
        const st = await s.getStatusAsync();
        if (st.isLoaded) await s.setRateAsync(next, true);
      } catch {
        /* bỏ qua */
      }
    }
  }, []);

  const seek = useCallback(
    async (x: number) => {
      const s = soundRef.current;
      if (!s || !duration || !barWidth) return;
      const frac = Math.min(1, Math.max(0, x / barWidth));
      try {
        await s.setPositionAsync(frac * duration);
        setProgress(frac);
        setPosition(frac * duration);
        if (statusRef.current === 'ended') setStatus('paused');
      } catch {
        /* bỏ qua */
      }
    },
    [duration, barWidth],
  );

  const playDisabled = !!playOnce && playedOnce && (status === 'ended' || status === 'idle');
  const label =
    playDisabled ? '🔊 Đã nghe 1 lần'
    : status === 'playing' ? '⏸ Tạm dừng'
    : status === 'paused' ? '▶ Tiếp tục'
    : status === 'ended' ? '↻ Nghe lại'
    : status === 'loading' ? 'Đang tải audio…'
    : '🔊 Nghe';

  if (!audioUrl) {
    return (
      <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.button, styles.buttonDisabled, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.buttonText, { color: colors.muted, fontSize: scaled(15) }]}>🔊 Nghe</Text>
        </View>
        <Text style={[styles.note, { color: colors.muted, fontSize: scaled(14) }]}>
          <Text style={{ fontWeight: '700' }}>Chưa có file audio cho Part này.</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.row}>
        <Pressable
          style={[styles.button, { backgroundColor: colors.accent }, playDisabled && styles.buttonDisabled]}
          disabled={playDisabled || status === 'loading'}
          onPress={() => void toggle()}
        >
          {status === 'loading' ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(15) }]}>{label}</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.rateButton, { borderColor: colors.border }]}
          onPress={() => void cycleRate()}
          accessibilityLabel="Đổi tốc độ phát"
        >
          <Text style={{ color: colors.text, fontSize: scaled(14) }}>Tốc độ: {rate.toFixed(2)}x</Text>
        </Pressable>
      </View>
      <View style={styles.seekRow}>
        <Pressable
          style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onPress={(e) => void seek(e.nativeEvent.locationX)}
          accessibilityLabel="Tua tới đoạn cần nghe"
        >
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.accent }]} />
        </Pressable>
        <Text style={[styles.time, { color: colors.muted, fontSize: scaled(13) }]}>
          {fmtTime(position)} / {fmtTime(duration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACING.md,
    gap: SPACING.sm,
    width: '100%',
  },
  row: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', flexWrap: 'wrap' },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    flexGrow: 1,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  rateButton: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  seekRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  bar: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: { height: '100%', borderRadius: 5 },
  time: { fontVariant: ['tabular-nums'] },
  note: { flexWrap: 'wrap' },
});
