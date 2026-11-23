// Loading theo kieu giao dien — port cua frontend/src/uiSettings.tsx
// (LoadingLine/LoadingEffect/LoadingImage) sang React Native.
// Doc hieu ung/toc do/vi tri/anh/cau cho tu UiSettingsProvider (kieu dang
// chon); chi dung Animated co san cua React Native — khong them dep,
// khong reanimated (can dev build, khong chay trong Expo Go).
// Effect id la -> roi ve spinner (ben web admin co the them effect moi
// ma mobile chua biet, va gia tri luu trong DB co the cu).
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTextSize, useTheme } from '../theme';
import {
  UI_SETTINGS_DEFAULTS,
  activeStyle,
  useUiSettingsOptional,
  type LoadingEffectId,
  type LoadingLocation,
} from '../uiSettings';

type Size = 'sm' | 'md' | 'lg';

/** Toc do lon hon = chay nhanh hon (giong web: --ld-speed = 1/speed). */
function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.max(0.5, Math.min(2, speed));
}

/** Vong lap 1 chieu 0 -> 1 roi nhay ve 0 (xoay, lan toa, thanh chay). */
function useCycle(duration: number, delay = 0): Animated.Value {
  // Khoi tao luoi 1 lan (useState lazy) — khong doc ref trong render.
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay]);
  return v;
}

/** Vong lap di-ve 0 -> 1 -> 0 (nay, dap, nhap nhay). */
function usePingPong(duration: number, delay = 0): Animated.Value {
  // Khoi tao luoi 1 lan (useState lazy) — khong doc ref trong render.
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay]);
  return v;
}

const DOT: Record<Size, number> = { sm: 8, md: 10, lg: 14 };
const RING: Record<Size, number> = { sm: 20, md: 28, lg: 40 };
const TRACK_W: Record<Size, number> = { sm: 100, md: 140, lg: 180 };
const TRACK_H: Record<Size, number> = { sm: 6, md: 8, lg: 10 };
const IMG: Record<Size, number> = { sm: 48, md: 56, lg: 72 };

function Dots({
  count,
  speed,
  size,
  color,
  gap,
  lift,
  stagger,
}: {
  count: number;
  speed: number;
  size: Size;
  color: string;
  gap: number;
  lift: number;
  stagger: number;
}) {
  const d = DOT[size];
  return (
    <View style={{ flexDirection: 'row', gap, alignItems: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <BounceDot key={i} delay={i * stagger} duration={320 / speed} size={d} color={color} lift={lift} />
      ))}
    </View>
  );
}

function BounceDot({
  delay,
  duration,
  size,
  color,
  lift,
}: {
  delay: number;
  duration: number;
  size: number;
  color: string;
  lift: number;
}) {
  const v = usePingPong(duration, delay);
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -lift, 0] }) }],
      }}
    />
  );
}

function RotatingRing({
  duration,
  size,
  borderWidth,
  color,
  reverse,
}: {
  duration: number;
  size: number;
  borderWidth: number;
  color: string;
  reverse?: boolean;
}) {
  const v = useCycle(duration);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth,
        borderColor: 'transparent',
        borderTopColor: color,
        borderRightColor: color,
        transform: [
          {
            rotate: v.interpolate({
              inputRange: [0, 1],
              outputRange: reverse ? ['360deg', '0deg'] : ['0deg', '360deg'],
            }),
          },
        ],
      }}
    />
  );
}

/** 1 hieu ung loading, ve bang Animated — id la thi ve spinner. */
export function LoadingEffect({
  effect,
  speed = 1,
  size = 'md',
}: {
  effect: LoadingEffectId | string;
  speed?: number;
  size?: Size;
}) {
  const { colors } = useTheme();
  const s = clampSpeed(speed);
  const accent = colors.accent;

  switch (effect) {
    case 'dual-ring': {
      const outer = RING[size];
      const inner = Math.round(outer * 0.55);
      return (
        <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
          <RotatingRing duration={1000 / s} size={outer} borderWidth={3} color={accent} />
          <RotatingRing duration={1600 / s} size={inner} borderWidth={2.5} color={colors.muted} reverse />
        </View>
      );
    }
    case 'bouncing-dots':
      return <Dots count={3} speed={s} size={size} color={accent} gap={size === 'lg' ? 10 : 7} lift={size === 'lg' ? 10 : 7} stagger={160} />;
    case 'skeleton':
      return <Skeleton speed={s} size={size} />;
    case 'progress-bar':
      return <ProgressBar speed={s} size={size} color={accent} />;
    case 'ripple':
      return <Ripple speed={s} size={size} color={accent} />;
    case 'equalizer':
      return <Equalizer speed={s} size={size} color={accent} />;
    case 'orbit':
      return <Orbit speed={s} size={size} color={accent} />;
    case 'pulse':
      return <Pulse speed={s} size={size} color={accent} />;
    case 'wave':
      return <Dots count={5} speed={s} size={size} color={accent} gap={size === 'lg' ? 7 : 5} lift={size === 'lg' ? 9 : 6} stagger={110} />;
    case 'flip':
      return <Flip speed={s} size={size} color={accent} />;
    case 'spinner':
    default:
      return <ActivityIndicator size={size === 'lg' ? 'large' : 'small'} color={accent} />;
  }
}

function Skeleton({ speed, size }: { speed: number; size: Size }) {
  const { colors } = useTheme();
  const w = TRACK_W[size];
  const widths = [w, Math.round(w * 0.75), Math.round(w * 0.55)];
  return (
    <View style={{ gap: 8, alignItems: 'flex-start' }}>
      {widths.map((bw, i) => (
        <SkeletonBar key={i} delay={i * 180} duration={600 / speed} width={bw} height={10} color={colors.surfaceMuted} />
      ))}
    </View>
  );
}

function SkeletonBar({
  delay,
  duration,
  width,
  height,
  color,
}: {
  delay: number;
  duration: number;
  width: number;
  height: number;
  color: string;
}) {
  const v = usePingPong(duration, delay);
  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: 5,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
      }}
    />
  );
}

function ProgressBar({ speed, size, color }: { speed: number; size: Size; color: string }) {
  const { colors } = useTheme();
  const trackW = TRACK_W[size];
  const fillW = Math.round(trackW * 0.4);
  const v = useCycle(1400 / speed);
  return (
    <View
      style={{
        width: trackW,
        height: TRACK_H[size],
        borderRadius: TRACK_H[size] / 2,
        backgroundColor: colors.surfaceMuted,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={{
          width: fillW,
          height: '100%',
          borderRadius: TRACK_H[size] / 2,
          backgroundColor: color,
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-fillW, trackW] }) },
          ],
        }}
      />
    </View>
  );
}

function Ripple({ speed, size, color }: { speed: number; size: Size; color: string }) {
  const outer = RING[size] + 8;
  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      <RippleRing delay={0} duration={1400 / speed} size={outer} color={color} />
      <RippleRing delay={700 / speed} duration={1400 / speed} size={outer} color={color} />
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

function RippleRing({
  delay,
  duration,
  size,
  color,
}: {
  delay: number;
  duration: number;
  size: number;
  color: string;
}) {
  const v = useCycle(duration, delay);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.1] }) }],
      }}
    />
  );
}

function Equalizer({ speed, size, color }: { speed: number; size: Size; color: string }) {
  const heights = size === 'lg' ? [16, 26, 12, 20] : size === 'md' ? [12, 20, 9, 15] : [9, 15, 7, 11];
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end', height: Math.max(...heights) }}>
      {heights.map((h, i) => (
        <EqBar key={i} delay={i * 130} duration={380 / speed} width={5} height={h} color={color} />
      ))}
    </View>
  );
}

function EqBar({
  delay,
  duration,
  width,
  height,
  color,
}: {
  delay: number;
  duration: number;
  width: number;
  height: number;
  color: string;
}) {
  const v = usePingPong(duration, delay);
  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: 3,
        backgroundColor: color,
        transform: [{ scaleY: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }],
      }}
    />
  );
}

function Orbit({ speed, size, color }: { speed: number; size: Size; color: string }) {
  const outer = RING[size];
  const dot = size === 'lg' ? 11 : 9;
  const v = useCycle(1300 / speed);
  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Animated.View
        style={{
          position: 'absolute',
          width: outer,
          height: outer,
          transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: (outer - dot) / 2,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: color,
          }}
        />
      </Animated.View>
    </View>
  );
}

function Pulse({ speed, size, color }: { speed: number; size: Size; color: string }) {
  const d = DOT[size] + 6;
  const v = usePingPong(700 / speed);
  return (
    <Animated.View
      style={{
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
      }}
    />
  );
}

function Flip({ speed, size, color }: { speed: number; size: Size; color: string }) {
  const d = size === 'lg' ? 28 : size === 'md' ? 22 : 16;
  const v = usePingPong(700 / speed);
  return (
    <Animated.View
      style={{
        width: d,
        height: d,
        borderRadius: 5,
        backgroundColor: color,
        transform: [
          { perspective: 300 },
          { rotateY: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) },
        ],
      }}
    />
  );
}

/** Anh dong hien luc cho (mascot / anh tuy chinh), nhun nhe nhu web (.ld-mascot). */
function LoadingImage({ image, imageUrl, size }: { image: string; imageUrl: string; size: Size }) {
  const v = usePingPong(1200);
  const s = IMG[size];
  const bob = { transform: [{ translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -6, 0] }) }] };
  if (image === 'mascot') {
    return (
      <Animated.View style={bob}>
        <Image source={require('../assets/mascot.png')} style={{ width: s, height: s }} contentFit="contain" />
      </Animated.View>
    );
  }
  if (image === 'custom' && imageUrl) {
    return (
      <Animated.View style={bob}>
        <Image source={{ uri: imageUrl }} style={{ width: s, height: s }} contentFit="contain" />
      </Animated.View>
    );
  }
  return null;
}

/**
 * 1 dong/khoi trang thai dang tai: anh + hieu ung + cau cho — lay theo
 * cau hinh loading cua kieu giao dien dang chon (giong web LoadingLine).
 * `text` la cau theo tung trang; khong truyen thi dung cau cho cua kieu.
 * `page`: khoi cho giua man hinh (position 'center') hoac o tren ('top');
 * `table`: 1 dong nhu cu. Skeleton thi an cau chu nhu web.
 */
export function LoadingLine({ location, text }: { location: LoadingLocation; text?: string }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const ctx = useUiSettingsOptional();
  const settings = ctx?.settings ?? UI_SETTINGS_DEFAULTS;
  const ld = activeStyle(settings).loading;
  const effect = ld[location];
  const label = text ?? ld.text;
  const showText = effect !== 'skeleton' && !!label;

  if (location === 'page') {
    return (
      <View
        style={[
          styles.page,
          ld.position === 'top' ? styles.pageTop : styles.pageCenter,
        ]}
      >
        <LoadingImage image={ld.image} imageUrl={ld.imageUrl} size="lg" />
        <LoadingEffect effect={effect} speed={ld.speed} size="lg" />
        {showText ? (
          <Text style={{ color: colors.muted, fontSize: scaled(15), textAlign: 'center' }}>{label}</Text>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.line}>
      <LoadingEffect effect={effect} speed={ld.speed} size="md" />
      {showText ? (
        <Text style={{ color: colors.muted, fontSize: scaled(15) }}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', gap: 14, paddingHorizontal: 24 },
  pageCenter: { justifyContent: 'center' },
  pageTop: { justifyContent: 'flex-start', paddingTop: 64 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
});
