// Đăng nhập email/mật khẩu + Google (expo-auth-session, đã nối dây).
// Bàn phím: KeyboardAvoidingView behavior "height" trên Android để form
// tự đẩy lên mượt khi gõ (trước đây behavior undefined nên form đứng yên).
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { useBrand } from '../brand';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { horizontalPadding, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { livelyCard, raisedButton, useTextSize, useTheme } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors, isLively } = useTheme();
  const { scaled } = useTextSize();
  const { brand } = useBrand();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) {
      setError('Nhập email và mật khẩu để đăng nhập.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Đăng nhập thất bại. Thử lại sau.');
    } finally {
      setBusy(false);
    }
  };

  const pad = horizontalPadding(width);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Vòng tròn trang trí mờ phía sau — chỉ để đẹp, không bấm được. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.deco, styles.decoTop, { backgroundColor: colors.accent }]} />
        <View style={[styles.deco, styles.decoBottom, { backgroundColor: colors.accent }]} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            {isLively ? (
              <Image
                source={require('../../assets/mascot.png')}
                style={{ width: 112, height: 112 }}
                contentFit="contain"
              />
            ) : null}
            <View style={[styles.logo, { backgroundColor: colors.accent }, isLively && { borderWidth: 2, borderColor: colors.borderHard, borderBottomWidth: 4, borderBottomColor: colors.accentDark }]}>
              {brand.logoType === 'image' && brand.logoUrl ? (
                <Image
                  source={{ uri: brand.logoUrl }}
                  style={{ width: 56, height: 56, borderRadius: 28 }}
                  contentFit="contain"
                />
              ) : (
                <Text style={{ fontSize: scaled(36) }}>{brand.logoEmoji}</Text>
              )}
            </View>
            <Text style={[styles.brand, { color: colors.text, fontSize: scaled(26) }]}>{brand.name}</Text>
            {brand.tagline ? (
              <Text style={[styles.tagline, { color: colors.muted, fontSize: scaled(15) }]}>
                {brand.tagline}
              </Text>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, livelyCard(colors, 'hero')]}>
            <Text style={[styles.title, { color: colors.text, fontSize: scaled(22) }]}>
              Đăng nhập
            </Text>
            <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
              Đăng nhập bằng tài khoản của bạn để đồng bộ tiến độ với bản web.
            </Text>

            <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text, fontSize: scaled(16) },
                livelyCard(colors, 'compact'),
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!busy}
            />

            <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Mật khẩu</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text, fontSize: scaled(16) },
                livelyCard(colors, 'compact'),
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="Mật khẩu"
              placeholderTextColor={colors.muted}
              secureTextEntry
              textContentType="password"
              editable={!busy}
              onSubmitEditing={submit}
            />

            {error ? (
              <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
            ) : null}

            <Pressable
              style={[styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.7 : 1 }, raisedButton(colors)]}
              onPress={submit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(16) }]}>
                  Đăng nhập
                </Text>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.muted, fontSize: scaled(13) }]}>hoặc</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <GoogleSignInButton onError={setError} />
            <Text style={[styles.note, { color: colors.muted, fontSize: scaled(13) }]}>
              Đăng nhập Google chỉ chạy trên bản build thật (dev/production), không chạy trong Expo Go.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.lg,
  },
  deco: { position: 'absolute', borderRadius: 999 },
  decoTop: { width: 240, height: 240, top: -70, right: -90, opacity: 0.13 },
  decoBottom: { width: 180, height: 180, bottom: 30, left: -70, opacity: 0.09 },
  hero: { alignItems: 'center', gap: SPACING.sm },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  brand: { fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
  tagline: { textAlign: 'center', flexWrap: 'wrap' },
  card: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.sm,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  title: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  sub: { textAlign: 'center', flexWrap: 'wrap', marginBottom: SPACING.sm },
  label: { fontWeight: '600', marginTop: SPACING.sm },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    width: '100%',
  },
  error: { flexWrap: 'wrap' },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
    minHeight: 48,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { textAlign: 'center' },
  note: { textAlign: 'center', marginTop: SPACING.sm },
});
