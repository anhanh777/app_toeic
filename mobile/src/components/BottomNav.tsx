// Thanh điều hướng dưới đáy — 5 mục chính, nút giữa (Luyện tập) nhô cao.
// Chỉ gắn ở 5 màn chính (Trang chủ, Hôm nay, Luyện tập, Thi thử, Cá nhân);
// các màn con (buổi luyện, bài thi, chi tiết...) không có thanh này.
// Chuyển tab bằng router.replace để không xếp chồng route lên stack.
//
// Hiệu ứng (Phương án B):
//  - Chỉ báo "giọt nước": viên pill nằm sau tab đang chọn, bay sang tab
//    mới bằng lò xo reanimated và giãn ngang (scaleX) giữa đường bay rồi
//    co lại — như giọt nước kéo giãn. Khi tab giữa đang chọn thì ẩn
//    (nút tròn accent đã đủ nổi).
//  - Icon tab đang chọn nảy nhẹ (scale lò xo); nút tròn giữa lún xuống
//    khi bấm và nảy lại khi thả, đồng thời đặt cờ zoom để màn Luyện tập
//    phóng to từ chính nút đó ra (xem TabScreen).
//  - Icon lấy từ useMenuIcons (đừng phá hệ icon) — riêng icon tab vẫn
//    dùng Ionicons như cũ; hướng chuyển tab + exam guard nằm ở tabNav.goToTab.
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useExam } from '../exam';
import { useTheme } from '../theme';
import { goToTab, tabIndex, type TabHref } from '../tabNav';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: {
  label: string;
  href: string;
  icon: IconName;
  iconActive: IconName;
  center?: boolean;
}[] = [
  { label: 'Trang chủ', href: '/', icon: 'home-outline', iconActive: 'home' },
  { label: 'Hôm nay', href: '/today', icon: 'calendar-outline', iconActive: 'calendar' },
  { label: 'Luyện tập', href: '/practice', icon: 'pencil', iconActive: 'pencil', center: true },
  { label: 'Thi thử', href: '/mock', icon: 'timer-outline', iconActive: 'timer' },
  { label: 'Cá nhân', href: '/settings', icon: 'person-outline', iconActive: 'person' },
];

const BLOB_W = 60;
const BLOB_H = 56;

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/settings') return pathname === '/settings' || pathname === '/profile';
  return pathname === href || pathname.startsWith(href + '/');
}

/** Icon 1 tab — nảy nhẹ khi vừa được chọn. */
function TabIcon({ name, color, size, active }: { name: IconName; color: string; size: number; active: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withSpring(active ? 1.18 : 1, { stiffness: 320, damping: 13 });
  }, [active, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { colors } = useTheme();
  const { exam } = useExam();
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const activeIndex = Math.max(0, tabIndex(pathname));

  // Chỉ báo giọt nước: bay bằng lò xo + giãn ngang giữa đường bay.
  const blobX = useSharedValue(0);
  const blobScaleX = useSharedValue(1);
  const blobOpacity = useSharedValue(0.14);
  const measuredRef = useRef(false);
  const centerScale = useSharedValue(1);

  useEffect(() => {
    if (barWidth <= 0) return;
    const cellW = barWidth / TABS.length;
    const target = (activeIndex + 0.5) * cellW - BLOB_W / 2;
    if (!measuredRef.current) {
      // Lần đo đầu: đặt ngay, không bay.
      measuredRef.current = true;
      blobX.value = target;
      return;
    }
    blobX.value = withSpring(target, { stiffness: 260, damping: 21 });
    blobScaleX.value = withSequence(
      withTiming(1.45, { duration: 130 }),
      withSpring(1, { stiffness: 220, damping: 13 }),
    );
    // Tab giữa đã có nút tròn accent nên ẩn viên pill.
    blobOpacity.value = withTiming(TABS[activeIndex]?.center ? 0 : 0.14, { duration: 160 });
  }, [activeIndex, barWidth, blobOpacity, blobScaleX, blobX]);

  const blobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: blobX.value }, { scaleX: blobScaleX.value }],
    opacity: blobOpacity.value,
  }));
  const centerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: centerScale.value }],
  }));

  const go = (t: (typeof TABS)[number]) => {
    // Bấm nút giữa -> màn Luyện tập zoom từ nút đó ra (TabScreen đọc cờ).
    goToTab(t.href as TabHref, pathname, !!exam, t.center === true);
  };

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 6),
        },
      ]}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.blob, { backgroundColor: colors.accent }, blobStyle]} />
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        if (t.center) {
          return (
            <Pressable
              key={t.href}
              onPress={() => go(t)}
              onPressIn={() => {
                centerScale.value = withSpring(0.86, { stiffness: 400, damping: 15 });
              }}
              onPressOut={() => {
                centerScale.value = withSpring(1, { stiffness: 300, damping: 11 });
              }}
              accessibilityLabel={t.label}
              accessibilityRole="button"
              style={styles.centerCell}
            >
              <Animated.View
                style={[
                  styles.centerCircle,
                  {
                    backgroundColor: colors.accent,
                    shadowColor: colors.accent,
                  },
                  centerStyle,
                ]}
              >
                <Ionicons name={t.icon} size={26} color={colors.onAccent} />
              </Animated.View>
              <Text
                style={[
                  styles.label,
                  { color: active ? colors.accent : colors.muted },
                  active && styles.labelActive,
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={t.href}
            onPress={() => go(t)}
            accessibilityLabel={t.label}
            accessibilityRole="button"
            style={styles.cell}
          >
            <TabIcon
              name={active ? t.iconActive : t.icon}
              size={24}
              color={active ? colors.accent : colors.muted}
              active={active}
            />
            <Text
              style={[
                styles.label,
                { color: active ? colors.accent : colors.muted },
                active && styles.labelActive,
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    paddingTop: 6,
  },
  blob: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: BLOB_W,
    height: BLOB_H,
    borderRadius: BLOB_H / 2,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    paddingVertical: 4,
    minHeight: 48,
  },
  centerCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    paddingVertical: 4,
    minHeight: 48,
  },
  centerCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  label: { fontSize: 11, textAlign: 'center' },
  labelActive: { fontWeight: '700' },
});
