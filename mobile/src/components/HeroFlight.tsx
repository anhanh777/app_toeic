// Hiệu ứng "thẻ bay" cho chi tiết bộ đề — bản tương thích Expo Go.
//
// Reanimated Shared Element Transition thật cần bật flag
// ENABLE_SHARED_ELEMENT_TRANSITIONS trong package.json + build dev
// (không chạy trong Expo Go) nên ở đây làm thủ công: màn nguồn đo vị
// trí thẻ đã bấm, truyền qua params; màn đích vẽ 1 thẻ giả tại đúng vị
// trí đó rồi bay (timing) về vị trí thẻ thật, xong thì hiện thẻ thật.
// Cùng hiệu ứng nhìn thấy, không cần dev build.
//
// An toàn: nếu không đo được đích (vd tải đề lỗi) thì thẻ giả tự biến
// sau tối đa 1.2s — không bao giờ kẹt màn hình.
import { useEffect, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTextSize } from '../theme';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export type HeroRect = { x: number; y: number; w: number; h: number };

export function HeroFlight({
  from,
  to,
  title,
  surface,
  border,
  text,
  onDone,
}: {
  from: HeroRect;
  to: HeroRect | null;
  title: string;
  surface: string;
  border: string;
  text: string;
  onDone: () => void;
}) {
  const { scaled } = useTextSize();
  const x = useSharedValue(from.x);
  const y = useSharedValue(from.y);
  const w = useSharedValue(from.w);
  const h = useSharedValue(from.h);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  const finishJS = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  };

  // Bay khi đã biết đích; chưa biết đích thì đứng chờ ở vị trí cũ.
  useEffect(() => {
    if (!to) return;
    x.value = withTiming(to.x, { duration: 380, easing: Easing.out(Easing.cubic) });
    y.value = withTiming(to.y, { duration: 380, easing: Easing.out(Easing.cubic) });
    w.value = withTiming(to.w, { duration: 380, easing: Easing.out(Easing.cubic) });
    h.value = withTiming(to.h, { duration: 380, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(finishJS)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  // An toàn: không bao giờ kẹt quá 1.2s.
  useEffect(() => {
    const t = setTimeout(finishJS, 1200);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
  }));

  return (
    <Animated.View
      style={[styles.card, { backgroundColor: surface, borderColor: border }, style]}
      pointerEvents="none"
    >
      <Text style={[styles.title, { color: text, fontSize: scaled(16) }]} numberOfLines={2}>
        {title}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'center',
  },
  title: { fontWeight: '700', flexWrap: 'wrap' }, // fontSize qua scaled(16) ở trên để theo cỡ chữ người dùng
});
