// Đăng nhập email/mật khẩu. Nút Google chỉ là placeholder bị vô hiệu hóa —
// luồng Google thật (expo-auth-session + OAuth client Android) làm ở
// Giai đoạn 2, chưa nối dây ở đây.
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { horizontalPadding, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { useTextSize, useTheme } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text, fontSize: scaled(24) }]}>
              ANHANH — Luyện TOEIC IELTS
            </Text>
            <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
              Đăng nhập bằng tài khoản của bạn để đồng bộ tiến độ với bản web.
            </Text>

            <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Email</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
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
              style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
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
              style={[styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.7 : 1 }]}
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

            <Pressable
              style={[styles.button, styles.googleButton, { borderColor: colors.border, opacity: 0.6 }]}
              disabled
            >
              <Text style={[styles.buttonText, { color: colors.muted, fontSize: scaled(16) }]}>
                Đăng nhập bằng Google
              </Text>
            </Pressable>
            <Text style={[styles.note, { color: colors.muted, fontSize: scaled(13) }]}>
              Đăng nhập Google sẽ có ở Giai đoạn 2.
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
  },
  card: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.sm,
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
  },
  googleButton: { borderWidth: 1, backgroundColor: 'transparent' },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  note: { textAlign: 'center', marginTop: SPACING.sm },
});
