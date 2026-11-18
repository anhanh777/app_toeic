// Root layout: providers (Theme, TextSize, Auth, Exam) + auth guard.
// Safe-area nằm ở gốc: mọi màn hình dùng SafeAreaView, không màn nào
// tự cộng padding notch/gesture bar bằng số cố định.
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth';
import { ExamProvider } from '../exam';
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
        // Chuyển màn trượt mượt: slide từ phải, ~280ms (mặc định ~200ms hơi gắt).
        animation: 'slide_from_right',
        animationDuration: 280,
        gestureEnabled: true,
        // Mặc định của expo-router là 'push': màn mới trượt vào trên nền
        // trắng (màn cũ bị gỡ) nên chuyển tab bị chớp trắng + cứng.
        // 'pop': màn cũ trượt ra, màn mới đã nằm sẵn bên dưới — mượt, không chớp.
        animationTypeForReplace: 'pop',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
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
              <RootLayoutNav />
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
