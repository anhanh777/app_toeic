// Bọc nội dung 1 màn tab chính: hiệu ứng vào màn + vuốt ngang chuyển tab.
//
// Hiệu ứng vào màn (thay fade 200ms "phèn"):
//  - Trượt theo hướng tab (sang tab sau: trượt vào từ phải; về tab trước:
//    từ trái) kèm thu phóng nhẹ (scale 0.97 -> 1), 280ms.
//  - Bấm nút Luyện tập tròn ở giữa: zoom từ nút đó ra (scale 0.9 -> 1 +
//    mờ dần), không trượt ngang.
//  - Màn tab mới mount lúc replace nên animation chạy trên UI thread
//    bằng reanimated; nền màn đã là màu theme (contentStyle trong
//    _layout + SafeAreaView) nên không nháy nền trắng như kiểu trượt
//    native ngày xưa.
//  - Màn mở lần đầu (không có hướng) thì hiện ngay, không animation.
//
// Vuốt chuyển tab (chỉ 5 màn tab chính):
//  - Vuốt sang trái -> tab kế tiếp, sang phải -> tab trước; tới tab
//    đầu/cuối thì dừng (không vòng). Chỉ kích hoạt khi đã đi ngang rõ
//    (24px) hoặc vuốt nhanh; lệch dọc thì fail ngay để nhường cuộn dọc.
//  - Không phá nội dung bên trong: 5 màn tab không có ScrollView ngang
//    hay slider nào, thanh tua audio nằm ở màn buổi luyện (không bọc).
import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { usePathname } from 'expo-router';
import { useExam } from '../exam';
import {
  consumeTabTransition,
  goToTab,
  nextTabHref,
  peekTabTransition,
  prevTabHref,
  setLastTab,
  type TabHref,
} from '../tabNav';

const ENTER_MS = 280;
const ENTER_X = 48;
const SWIPE_MIN_DX = 60;
const SWIPE_MIN_VX = 400;

export function TabScreen({ href, children }: { href: TabHref; children: ReactNode }) {
  const pathname = usePathname();
  const { exam } = useExam();
  const { direction, zoom } = peekTabTransition();
  const shouldAnimate = direction !== 'none' || zoom;
  const tx = useSharedValue(direction === 'forward' ? ENTER_X : direction === 'back' ? -ENTER_X : 0);
  const scale = useSharedValue(zoom ? 0.9 : shouldAnimate ? 0.97 : 1);
  const opacity = useSharedValue(zoom ? 0 : 1);

  useEffect(() => {
    setLastTab(href);
    if (shouldAnimate) {
      tx.value = withTiming(0, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) });
      scale.value = withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) });
      if (zoom) opacity.value = withTiming(1, { duration: ENTER_MS });
    }
    consumeTabTransition();
    // Chỉ chạy 1 lần lúc mount — màn tab mount mới sau mỗi lần replace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const swipe = usePanGesture({
    activeOffsetX: [-24, 24],
    failOffsetY: [-16, 16],
    // onDeactivate (không phải onFinalize): chỉ nó mới có translationX /
    // velocityX (PanExtendedHandlerData) khi vuốt kết thúc.
    onDeactivate: (e) => {
      const far = Math.abs(e.translationX) > SWIPE_MIN_DX;
      const fast = Math.abs(e.velocityX) > SWIPE_MIN_VX;
      if (!far && !fast) return;
      const target = e.translationX < 0 ? nextTabHref(pathname) : prevTabHref(pathname);
      if (target) runOnJS(goToTab)(target, pathname, !!exam, false);
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View style={[styles.fill, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
