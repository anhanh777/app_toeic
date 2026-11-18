// Root layout: providers (Theme, TextSize, Auth, Exam) + auth guard.
// Safe-area nằm ở gốc: mọi màn hình dùng SafeAreaView, không màn nào
// tự cộng padding notch/gesture bar bằng số cố định.
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth';
import { BrandProvider } from '../brand';
import { ExamProvider } from '../exam';
import { MenuIconsProvider } from '../menuIcons';
import { TextSizeProvider, ThemeProvider, useTheme } from '../theme';

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
      {/* 5 màn chính (tab) chuyển bằng fade nhanh thay vì trượt: trượt khi
          replace vẫn lộ nền trắng vì màn mới chưa kịp vẽ xong; fade chồng
          2 màn lên nhau nên không bao giờ thấy nền trắng. */}
      <Stack.Screen name="index" options={{ animation: 'fade', animationDuration: 200 }} />
      <Stack.Screen name="login" />
      <Stack.Screen name="today" options={{ animation: 'fade', animationDuration: 200 }} />
      <Stack.Screen name="practice" options={{ animation: 'fade', animationDuration: 200 }} />
      <Stack.Screen name="mock" options={{ animation: 'fade', animationDuration: 200 }} />
      <Stack.Screen name="settings" options={{ animation: 'fade', animationDuration: 200 }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
