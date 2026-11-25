// Root layout: providers (Theme, TextSize, Auth, Exam) + auth guard.
// Safe-area nằm ở gốc: mọi màn hình dùng SafeAreaView, không màn nào
// tự cộng padding notch/gesture bar bằng số cố định.
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth';
import { BrandProvider } from '../brand';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { LoadingLine } from '../components/LoadingLine';
import { ExamProvider } from '../exam';
import { MenuIconsProvider } from '../menuIcons';
import { TextSizeProvider, ThemeProvider, useTextSize, useTheme } from '../theme';
import { UiSettingsProvider, useUiSettings } from '../uiSettings';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const { settings, loading: uiLoading } = useUiSettings();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  // Chi chan man hinh loading o LAN TAI DAU TIEN: khi auth + settings da
  // tai xong 1 lan thi khong bao gio hien lai. Neu khong, refreshSettings()
  // o Trang chu (goi moi khi ve focus) se dat uiLoading=true -> go ca Stack
  // xuong -> Trang chu unmount -> focus effect chay lai -> refresh nua ->
  // Trang chu reload vo han (loi that 2026-11-23 sau commit bao tri 3b68569:
  // truoc do gate chi doi auth loading nen refresh settings vo hinh).
  // Sau khi boot xong, cai dat moi chi cap nhat ngam; bao tri bat/tat van
  // doi ngay vi gate ben duoi doc settings truc tiep.
  const [booted, setBooted] = useState(false);
  // Dieu chinh state trong luc render (mau React khuyen dung thay cho
  // setState trong effect): lan dau auth + settings deu xong thi bat co
  // booted, React render lai ngay truoc khi commit — khong loop vi co
  // dieu kien !booted.
  if (!loading && !uiLoading && !booted) {
    setBooted(true);
  }

  useEffect(() => {
    if (!booted) return;
    // Bao tri: khong chuyen man hinh khi dang bao tri — man hinh bao tri
    // thay the toan bo Stack ben duoi.
    if (settings.maintenance.enabled) return;
    const inLogin = segments[0] === 'login';
    if (!user && !inLogin) router.replace('/login');
    else if (user && inLogin) router.replace('/');
  }, [user, booted, settings, segments, router]);

  useEffect(() => {
    if (booted) SplashScreen.hideAsync().catch(() => {});
  }, [booted]);

  if (!booted) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <LoadingLine location="page" />
      </View>
    );
  }

  // Bao tri: hien man hinh bao tri thay vi Stack (login/trang chu) —
  // tranh hien du lieu trong/sai trong luc backend nap lai sau khi bi xoa.
  if (settings.maintenance.enabled) {
    return <MaintenanceScreen />;
  }

  // Lớp nền theme bao quanh Stack: container của navigator trong suốt,
  // lúc replace tab (màn cũ đã gỡ, màn mới chưa paint) khoảng trống sẽ
  // hiện màu theme thay vì nền trắng của root view. Cùng với nền native
  // (SystemUI trong theme.tsx + backgroundColor trong app.json) thì mọi
  // lớp dưới màn hình đều là màu theme, không còn khung trắng nào lộ ra.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
          không dùng. 'none' + TabScreen = trượt có hướng; nhưng 'none'
          vẫn nháy trắng lúc replace (màn cũ gỡ rồi màn mới mới paint,
          contentStyle/SafeAreaView chưa kịp lên) nên phải chặn bằng lớp
          nền theme quanh Stack + nền native theo theme (theme.tsx dùng
          SystemUI, app.json backgroundColor). Xem theme.tsx. */}
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
    </View>
  );
}

/* Man hinh bao tri: hien thay cho toan bo Stack khi maintenance.enabled.
   Nut "Thu lai" tai lai cai dat; neu bao tri da tat thi app mo lai binh thuong. */
function MaintenanceScreen() {
  const { settings, refresh } = useUiSettings();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const [checking, setChecking] = useState(false);
  const retry = () => {
    setChecking(true);
    refresh();
    setTimeout(() => setChecking(false), 2000);
  };
  return (
    <View style={[styles.maintenance, { backgroundColor: colors.background }]}>
      <Text style={[styles.maintenanceEmoji, { fontSize: scaled(48) }]}>🔧</Text>
      <Text style={[styles.maintenanceTitle, { color: colors.text, fontSize: scaled(20) }]}>App đang bảo trì</Text>
      <Text style={[styles.maintenanceMsg, { color: colors.text, fontSize: scaled(15) }]}>{settings.maintenance.message}</Text>
      <Text style={[styles.maintenanceSub, { color: colors.muted, fontSize: scaled(14) }]}>
        Dữ liệu đang được nạp lại — quay lại sau ít phút nhé.
      </Text>
      <Pressable
        style={[styles.maintenanceButton, { backgroundColor: colors.accent, opacity: checking ? 0.7 : 1 }]}
        onPress={retry}
        disabled={checking}
      >
        <Text style={[styles.maintenanceButtonText, { color: colors.onAccent, fontSize: scaled(15) }]}>
          {checking ? 'Đang kiểm tra…' : 'Thử lại'}
        </Text>
      </Pressable>
    </View>
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
                      <ConfirmProvider>
                        <RootLayoutNav />
                      </ConfirmProvider>
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
  maintenance: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // Màn bảo trì trước đây dùng fontSize thô trong StyleSheet nên không theo
  // cỡ chữ người dùng đã chọn — cỡ chữ giờ đặt bằng scaled() ở JSX bên trên.
  maintenanceEmoji: { marginBottom: 12 },
  maintenanceTitle: { fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  maintenanceMsg: { fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  maintenanceSub: { textAlign: 'center', marginBottom: 24 },
  maintenanceButton: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  maintenanceButtonText: { fontWeight: '700' },
});
