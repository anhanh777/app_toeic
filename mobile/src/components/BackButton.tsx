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
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
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
