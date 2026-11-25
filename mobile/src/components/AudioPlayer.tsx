// Trình phát audio cho phần Nghe — port của ListeningAudio (web) sang
// expo-audio (expo-av đã bị loại khỏi Expo Go từ SDK 55, import nó là
// crash "Cannot find native module 'ExponentAV'"), KHÔNG có fallback
// TTS ở v1: chưa có file audio thì hiện khối "chưa có audio" như web.
// - Chỉ 1 nút Phát/Tạm dừng/Tiếp tục/Nghe lại duy nhất cho mỗi khối.
// - 1 AudioPlayer cho mỗi audio source (useAudioPlayer tự tạo mới khi
//   source đổi); khi 1 hộp bắt đầu phát, hộp đang phát trước đó tự dừng
//   (module-level activeStop, như web).
// - Thanh tiến trình bấm để tua (tap-to-seek, không thêm dep slider),
//   tốc độ phát 0.5–1.5x (bước 0.25x), tua lùi/tiến 5 giây (kiểu
//   YouPass, như web) + thanh trượt âm lượng (tap-to-set, cùng kiểu
//   với thanh tiến trình — không thêm dep slider).
// - playOnce (thi thử IELTS): mỗi Section chỉ phát 1 lần — phát xong
//   nút bị khóa hẳn, chỉ tạm dừng/tiếp tục được trong lần phát đó.
// - Thời gian của expo-audio tính bằng GIÂY (expo-av dùng mili-giây).
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { RADIUS, SPACING } from '../layout';
import { themedBarTrack, themedCard, themedChip, themedButton, useTextSize, useTheme } from '../theme';

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
  // useAudioPlayer tự tạo player mới khi source đổi (và tự release khi
  // unmount); updateInterval 200ms cho thanh tiến trình mượt.
  const player = useAudioPlayer(audioUrl ?? undefined, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  // player là SharedObject do hook trả về — React Compiler coi giá trị
  // hook trả về là bất biến nên không được gán thuộc tính trực tiếp
  // (player.playbackRate = ...); mọi thao tác lệnh (play/pause/seek)
  // vẫn gọi trực tiếp, chỉ riêng việc gán thuộc tính đi qua ref.
  // LƯU Ý: trên native, `playbackRate` của expo-audio CHỈ có getter
  // (gán trực tiếp sẽ throw "Cannot assign to property 'playbackRate'
  // which has only a getter") — đổi tốc độ phải gọi phương thức
  // setPlaybackRate(rate); tương tự, không gán shouldCorrectPitch.
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  });
  const [uiStatus, setUiStatus] = useState<'idle' | 'playing' | 'paused' | 'ended' | 'loading'>('idle');
  const [playedOnce, setPlayedOnce] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const [rate, setRate] = useState(1);
  const rateRef = useRef(1);
  // Âm lượng 0–1 (mặc định 1) — chỉ áp cho file audio, như web.
  const [volume, setVolume] = useState(1);
  const volumeRef = useRef(1);
  const [volWidth, setVolWidth] = useState(0);
  const uiStatusRef = useRef(uiStatus);
  const playedOnceRef = useRef(false);
  const positionMs = Math.round(status.currentTime * 1000);
  const durationMs = Math.round(status.duration * 1000);
  const progress = durationMs ? positionMs / durationMs : 0;
  // Đồng bộ ref sau render — không ghi ref trong lúc render (React
  // Compiler yêu cầu render thuần).
  useEffect(() => {
    uiStatusRef.current = uiStatus;
  });
  useEffect(() => {
    playedOnceRef.current = playedOnce;
  });

  // Đổi audioUrl/stopKey: reset trạng thái hiển thị ngay trong lúc
  // render (pattern "adjusting state when props change" của React docs).
  const audioKey = `${audioUrl ?? ''}|${String(stopKey ?? '')}`;
  const [prevAudioKey, setPrevAudioKey] = useState(audioKey);
  if (prevAudioKey !== audioKey) {
    setPrevAudioKey(audioKey);
    setUiStatus(audioUrl ? 'loading' : 'idle');
    setPlayedOnce(false);
  }

  // Tốc độ phát phải gán lại mỗi khi player mới được tạo (đổi source).
  // Bọc try/catch: setPlaybackRate có thể throw nếu player chưa nạp
  // xong source (lỗi trong effect sẽ crash màn hình).
  useEffect(() => {
    try {
      playerRef.current.setPlaybackRate(rateRef.current);
    } catch {
      /* thử lại khi bấm phát */
    }
  }, [player]);

  // Âm lượng cũng gán lại mỗi khi player mới được tạo (đổi source) —
  // đi qua ref như tốc độ (không gán thuộc tính trực tiếp lên giá trị
  // hook trả về); bọc try/catch như trên.
  useEffect(() => {
    try {
      playerRef.current.volume = volumeRef.current;
    } catch {
      /* thử lại khi đổi âm lượng / bấm phát */
    }
  }, [player]);

  // Nạp xong → idle; phát xong → ended.
  useEffect(() => {
    if (status.isLoaded && uiStatusRef.current === 'loading') setUiStatus('idle');
  }, [status.isLoaded]);
  useEffect(() => {
    if (status.didJustFinish && uiStatusRef.current === 'playing') setUiStatus('ended');
  }, [status.didJustFinish]);

  // Chế độ audio (nghe được cả khi điện thoại ở chế độ im lặng).
  useEffect(() => {
    if (!audioModeSet) {
      audioModeSet = true;
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    }
  }, []);

  // Đổi stopKey (vd. chuyển câu) mà url không đổi: dừng + tua về đầu.
  const prevStopKeyRef = useRef(stopKey);
  useEffect(() => {
    if (prevStopKeyRef.current !== stopKey) {
      prevStopKeyRef.current = stopKey;
      player.pause();
      player.seekTo(0).catch(() => {});
      setUiStatus((cur) => (cur === 'loading' ? cur : 'idle'));
    }
  }, [stopKey, player]);

  const stopSelf = useCallback(() => {
    player.pause();
    player.seekTo(0).catch(() => {});
    setUiStatus((cur) => (cur === 'loading' ? cur : 'idle'));
  }, [player]);
  const stopSelfRef = useRef(stopSelf);
  useEffect(() => {
    stopSelfRef.current = stopSelf;
  });

  // Unmount: dừng hẳn + gỡ khỏi activeStop.
  useEffect(
    () => () => {
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

  const toggle = useCallback(() => {
    if (playOnce && playedOnceRef.current && uiStatusRef.current !== 'playing' && uiStatusRef.current !== 'paused') return;
    try {
      if (uiStatusRef.current === 'playing') {
        player.pause();
        setUiStatus('paused');
        return;
      }
      if (uiStatusRef.current === 'paused') {
        if (activeStop && activeStop !== stopSelfRef.current) activeStop();
        activeStop = stopSelfRef.current;
        player.play();
        setUiStatus('playing');
        return;
      }
      // idle / ended / loading: phát từ đầu (ended → tua về 0 rồi phát).
      markPlayed();
      if (activeStop && activeStop !== stopSelfRef.current) activeStop();
      activeStop = stopSelfRef.current;
      if (uiStatusRef.current === 'ended') player.seekTo(0).catch(() => {});
      // Áp lại tốc độ + âm lượng lúc bắt đầu phát (phòng khi effect gán
      // lúc player chưa nạp xong đã throw và bỏ qua) — qua ref, không
      // gán thuộc tính trực tiếp lên giá trị hook trả về.
      try {
        player.setPlaybackRate(rateRef.current);
        playerRef.current.volume = volumeRef.current;
      } catch {
        /* phát ở tốc độ / âm lượng mặc định */
      }
      player.play();
      setUiStatus('playing');
    } catch (e) {
      onError?.(e);
    }
  }, [markPlayed, onError, playOnce, player]);

  const cycleRate = useCallback(() => {
    const idx = RATES.indexOf(rateRef.current);
    const next = RATES[(idx + 1) % RATES.length];
    rateRef.current = next;
    setRate(next);
    try {
      playerRef.current.setPlaybackRate(next);
    } catch {
      /* tốc độ sẽ áp lại khi đổi source / bấm phát */
    }
  }, []);

  const seek = useCallback(
    (x: number) => {
      if (!durationMs || !barWidth) return;
      const frac = Math.min(1, Math.max(0, x / barWidth));
      try {
        player.seekTo((frac * durationMs) / 1000).catch(() => {});
        if (uiStatusRef.current === 'ended') setUiStatus('paused');
      } catch {
        /* bỏ qua */
      }
    },
    [durationMs, barWidth, player],
  );

  // Tua lùi/tiến 5 giây (kiểu YouPass, như web) — vẫn trong cùng 1 lượt
  // phát nên không vi phạm chế độ phát 1 lần của thi thử.
  const seekBy = useCallback(
    (sec: number) => {
      if (!durationMs) return;
      const next = Math.min(Math.max(0, positionMs / 1000 + sec), durationMs / 1000);
      try {
        player.seekTo(next).catch(() => {});
        if (uiStatusRef.current === 'ended') setUiStatus('paused');
      } catch {
        /* bỏ qua */
      }
    },
    [durationMs, positionMs, player],
  );

  // Đổi âm lượng: áp ngay lên player (qua ref) + giữ lại cho player
  // mới khi đổi source (effect ở trên).
  const changeVolume = useCallback((v: number) => {
    const next = Math.min(1, Math.max(0, v));
    volumeRef.current = next;
    setVolume(next);
    try {
      playerRef.current.volume = next;
    } catch {
      /* âm lượng sẽ áp lại khi đổi source / bấm phát */
    }
  }, []);

  const setVolumeFromX = useCallback(
    (x: number) => {
      if (!volWidth) return;
      changeVolume(Math.min(1, Math.max(0, x / volWidth)));
    },
    [volWidth, changeVolume],
  );

  const playDisabled = !!playOnce && playedOnce && (uiStatus === 'ended' || uiStatus === 'idle');
  const label =
    playDisabled ? '🔊 Đã nghe 1 lần'
    : uiStatus === 'playing' ? '⏸ Tạm dừng'
    : uiStatus === 'paused' ? '▶ Tiếp tục'
    : uiStatus === 'ended' ? '↻ Nghe lại'
    : uiStatus === 'loading' ? 'Đang tải audio…'
    : '🔊 Nghe';

  if (!audioUrl) {
    return (
      <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }, themedCard(colors, 'card')]}>
        <View style={[styles.button, styles.buttonDisabled, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.buttonText, { color: colors.muted, fontSize: scaled(14) }]}>🔊 Nghe</Text>
        </View>
        <Text style={[styles.note, { color: colors.muted, fontSize: scaled(14) }]}>
          <Text style={{ fontWeight: '700' }}>Chưa có file audio cho Part này.</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }, themedCard(colors, 'card')]}>
      <View style={styles.row}>
        <Pressable
          style={[styles.button, { backgroundColor: colors.accent }, playDisabled && styles.buttonDisabled, themedButton(colors)]}
          disabled={playDisabled || uiStatus === 'loading'}
          onPress={() => toggle()}
        >
          {uiStatus === 'loading' ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(14) }]}>{label}</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.rateButton, { borderColor: colors.border }, themedChip(colors)]}
          onPress={() => cycleRate()}
          accessibilityLabel="Đổi tốc độ phát"
        >
          <Text style={{ color: colors.text, fontSize: scaled(14) }}>Tốc độ: {rate.toFixed(2)}x</Text>
        </Pressable>
      </View>
      <View style={styles.seekRow}>
        <Pressable
          style={[styles.bar, { backgroundColor: colors.surfaceMuted }, themedBarTrack(colors)]}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onPress={(e) => seek(e.nativeEvent.locationX)}
          accessibilityLabel="Tua tới đoạn cần nghe"
        >
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.accent }]} />
        </Pressable>
        <Text style={[styles.time, { color: colors.muted, fontSize: scaled(13) }]} numberOfLines={1}>
          {fmtTime(positionMs)} / {fmtTime(durationMs)}
        </Text>
      </View>
      <View style={styles.controlsRow}>
        <Pressable
          style={[styles.skipButton, { borderColor: colors.border }, themedChip(colors)]}
          onPress={() => seekBy(-5)}
          accessibilityLabel="Tua lùi 5 giây"
        >
          <Text style={{ color: colors.text, fontSize: scaled(14), fontWeight: '700' }}>⏪ 5s</Text>
        </Pressable>
        <Pressable
          style={[styles.skipButton, { borderColor: colors.border }, themedChip(colors)]}
          onPress={() => seekBy(5)}
          accessibilityLabel="Tua tới 5 giây"
        >
          <Text style={{ color: colors.text, fontSize: scaled(14), fontWeight: '700' }}>5s ⏩</Text>
        </Pressable>
        <View style={styles.volumeWrap}>
          <Text style={{ color: colors.text, fontSize: scaled(14) }} accessibilityLabel="Âm lượng">🔊</Text>
          <Pressable
            style={[styles.bar, { backgroundColor: colors.surfaceMuted }, themedBarTrack(colors)]}
            onLayout={(e) => setVolWidth(e.nativeEvent.layout.width)}
            onPress={(e) => setVolumeFromX(e.nativeEvent.locationX)}
            accessibilityLabel="Âm lượng"
            accessibilityRole="adjustable"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(volume * 100) }}
          >
            <View style={[styles.fill, { width: `${Math.round(volume * 100)}%`, backgroundColor: colors.accent }]} />
          </Pressable>
          <Text style={[styles.time, { color: colors.muted, fontSize: scaled(13) }]} numberOfLines={1}>{Math.round(volume * 100)}%</Text>
        </View>
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
    // Nút phát co lại được để nút tốc độ không bị đẩy tràn hàng khi chữ to.
    flexShrink: 1,
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
  controlsRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', flexWrap: 'wrap' },
  skipButton: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeWrap: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', flexGrow: 1, flexShrink: 1, minWidth: 140 },
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
