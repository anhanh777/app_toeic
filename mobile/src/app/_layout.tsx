// Root layout: providers (Theme, TextSize, Auth, Exam) + auth guard.
// Safe-area nằm ở gốc: mọi màn hình dùng SafeAreaView, không màn nào
// tự cộng padding notch/gesture bar bằng số cố định.
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth';
import { BrandProvider } from '../brand';
import { ExamProvider } from '../exam';
import { MenuIconsProvider } from '../menuIcons';
import { TextSizeProvider, ThemeProvider, useTheme } from '../theme';
import { UiSettingsProvider } from '../uiSettings';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === 'login';
    if (!user && !inLogin) router.replace('/login');
    else if (user && inLogin) router.replace('/');
  }, [user, loading, segments, router]);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        // Màn thường: trượt từ phải, ~280ms (mặc định ~200ms hơi gắt).
        animation: 'slide_from_right',
        animationDuration: 280,
        gestureEnabled: true,
        // Replace (chuyển tab): màn cũ trượt ra, màn mới đã nằm sẵn bên dưới.
        animationTypeForReplace: 'pop',
      }}
    >
      {/* 5 màn chính (tab): KHÔNG dùng animation native nữa — hiệu ứng
          vào màn (trượt theo hướng tab / zoom từ nút giữa) do TabScreen
          chạy bằng reanimated lúc màn mount. Native 'fade' 200ms cũ bị
          chê "phèn"; còn trượt native thì lộ nền trắng khi replace nên
          không dùng. 'none' + TabScreen = trượt có hướng, nền vẫn là
          màu theme nên không nháy trắng. */}
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="login" />
      <Stack.Screen name="today" options={{ animation: 'none' }} />
      <Stack.Screen name="practice" options={{ animation: 'none' }} />
      <Stack.Screen name="mock" options={{ animation: 'none' }} />
      <Stack.Screen name="settings" options={{ animation: 'none' }} />
      {/* Chi tiết bộ đề: fade nhẹ để hiệu ứng "thẻ bay" (HeroFlight) làm
          nhân vật chính, không bị trượt native giành spotlight. */}
      <Stack.Screen name="test-set/[id]" options={{ animation: 'fade', animationDuration: 220 }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* UiSettingsProvider phải ở ngoài ThemeProvider/TextSizeProvider để
            cấp accent server cho ThemeProvider và fontScale cho
            TextSizeProvider (không copy nesting của web App.tsx). */}
        <UiSettingsProvider>
          <ThemeProvider>
            <TextSizeProvider>
              <AuthProvider>
                <ExamProvider>
                  <BrandProvider>
                    <MenuIconsProvider>
                      <RootLayoutNav />
                    </MenuIconsProvider>
                  </BrandProvider>
                </ExamProvider>
              </AuthProvider>
            </TextSizeProvider>
          </ThemeProvider>
        </UiSettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
