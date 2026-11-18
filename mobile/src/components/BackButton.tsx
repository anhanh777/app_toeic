// Nút quay lại dùng chung cho mọi màn hình — nút tròn có icon chevron
// (thay cho chữ "‹ Quay lại" thô trước đây).
//
// Dùng: <BackButton /> ở đầu màn hình. Mặc định gọi router.back();
// truyền onPress để đổi hành vi khi cần.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export function BackButton({ onPress }: { onPress?: () => void } = {}) {
  const { colors } = useTheme();
  const goBack = () => {
    if (onPress) {
      onPress();
      return;
    }
    // Màn gốc (tab): stack chỉ còn 1 màn nên router.back() sẽ báo lỗi
    // "GO_BACK was not handled" — về Trang chủ thay vì báo lỗi.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <Pressable
      onPress={goBack}
      accessibilityLabel="Quay lại"
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name="chevron-back" size={24} color={colors.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
