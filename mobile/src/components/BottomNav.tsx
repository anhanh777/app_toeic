// Thanh điều hướng dưới đáy — 5 mục chính, nút giữa (Luyện tập) nhô cao.
// Chỉ gắn ở 5 màn chính (Trang chủ, Hôm nay, Luyện tập, Thi thử, Cá nhân);
// các màn con (buổi luyện, bài thi, chi tiết...) không có thanh này.
// Chuyển tab bằng router.replace để không xếp chồng route lên stack.
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useExam } from '../exam';
import { useTheme } from '../theme';

// Các tab cần chọn kỳ thi trước mới vào được (theo yêu cầu của YingYing).
const NEEDS_EXAM = new Set(['/today', '/practice', '/mock']);

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

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/settings') return pathname === '/settings' || pathname === '/profile';
  return pathname === href || pathname.startsWith(href + '/');
}

export function BottomNav() {
  const pathname = usePathname();
  const { colors } = useTheme();
  const { exam } = useExam();
  const insets = useSafeAreaInsets();

  const go = (t: (typeof TABS)[number]) => {
    if (isActive(pathname, t.href)) return;
    // Chưa chọn kỳ thi mà bấm vào tab cần kỳ thi → về màn chọn kỳ thi,
    // nhớ sẵn đích đến để chọn xong tự mở đúng tab đó.
    if (NEEDS_EXAM.has(t.href) && !exam) {
      router.replace({ pathname: '/', params: { next: t.href } });
      return;
    }
    router.replace(t.href as never);
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
    >
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        if (t.center) {
          return (
            <Pressable
              key={t.href}
              onPress={() => go(t)}
              accessibilityLabel={t.label}
              accessibilityRole="button"
              style={styles.centerCell}
            >
              <View
                style={[
                  styles.centerCircle,
                  {
                    backgroundColor: colors.accent,
                    shadowColor: colors.accent,
                  },
                ]}
              >
                <Ionicons name={t.icon} size={26} color={colors.onAccent} />
              </View>
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
            <Ionicons
              name={active ? t.iconActive : t.icon}
              size={24}
              color={active ? colors.accent : colors.muted}
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
