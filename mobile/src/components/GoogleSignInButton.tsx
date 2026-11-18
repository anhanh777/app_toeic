// Đăng nhập Google trên mobile (Giai đoạn 2) — expo-auth-session.
//
// CÁCH NỐI VÀO MÀN HÌNH ĐĂNG NHẬP (coordinator nối dây, KHÔNG sửa file
// này để nối — chỉ thêm 3 dòng vào mobile/src/app/login.tsx):
//   1. import { GoogleSignInButton } from '../components/GoogleSignInButton';
//   2. Thay nút Google placeholder bị vô hiệu hóa bằng:
//        <GoogleSignInButton />
//   3. (Không bắt buộc) Xóa dòng ghi chú "Đăng nhập Google sẽ có ở
//      Giai đoạn 2." ngay dưới nút đó.
//
// LUỒNG: Google.useAuthRequest với responseType IdToken → Google trả
// id_token thẳng trong redirect (không đổi code, KHÔNG cần client secret
// — giống hệt luồng web: backend POST /api/auth/google {idToken}).
//
// REDIRECT URI — NGƯỜI DÙNG PHẢI THÊM TRONG GOOGLE CLOUD CONSOLE
// (APIs & Services → Credentials → OAuth client
// 1044241378768-g5jk4ffmkcneacjh3kgl6h413mc0tg00 → Authorized redirect
// URIs), thêm đúng 1 dòng này:
//   com.anhanh.toeicielts:/oauthredirect
// Đây là redirect mặc định mà expo-auth-session gửi trên bản native:
// `${Application.applicationId}:/oauthredirect`, với applicationId =
// package Android trong app.json (com.anhanh.toeicielts). KHÔNG dùng
// proxy https://auth.expo.io/... nữa: SDK 58 đã bỏ AuthSession proxy
// (không còn tùy chọn useProxy), nên URL proxy cũ không dùng được.
// Lưu ý: nút này CHỈ chạy trên development build / bản production
// (EAS build) — Expo Go không hỗ trợ OAuth redirect về app, và Google
// có thể từ chối redirect URI không phải https nếu Console siết chặt:
// khi đó cần tạo thêm 1 OAuth client Android trong cùng project Google
// (package com.anhanh.toeicielts + SHA-1) rồi truyền vào prop
// androidClientId — việc đó thuộc Giai đoạn 3, không làm ở đây.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { ResponseType } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../auth';
import { useTextSize, useTheme } from '../theme';

WebBrowser.maybeCompleteAuthSession();

/** Web OAuth client đã có sẵn (dùng chung với bản web) — public ID. */
export const GOOGLE_WEB_CLIENT_ID =
  '1044241378768-g5jk4ffmkcneacjh3kgl6h413mc0tg00.apps.googleusercontent.com';

/** Redirect URI mà component này gửi cho Google (xem ghi chú đầu file). */
export const GOOGLE_REDIRECT_URI = 'com.anhanh.toeicielts:/oauthredirect';

export function GoogleSignInButton({
  onError,
}: {
  onError?: (message: string) => void;
} = {}) {
  const { googleLogin } = useAuth();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const [request, , promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    // Lấy id_token trực tiếp (implicit flow): backend chỉ cần idToken,
    // không cần đổi code và không cần client secret.
    responseType: ResponseType.IdToken,
    scopes: ['openid', 'profile', 'email'],
  });

  // Xử lý kết quả ngay trong lời hứa promptAsync() trả về (không dùng
  // useEffect theo dõi response — tránh setState trong effect).
  const signIn = async () => {
    if (!request || busy) return;
    setLocalError('');
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type === 'success') {
        const idToken = result.params?.id_token;
        if (!idToken) {
          const msg = 'Google không trả về id_token. Thử lại sau.';
          setLocalError(msg);
          onError?.(msg);
          return;
        }
        await googleLogin(idToken);
      } else if (result.type === 'error') {
        const msg = 'Đăng nhập Google thất bại. Thử lại sau.';
        setLocalError(msg);
        onError?.(msg);
      }
      // 'dismiss' / 'cancel': người dùng tự đóng trình duyệt — không báo lỗi.
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Đăng nhập Google thất bại. Thử lại sau.';
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !request;

  return (
    <>
      <Pressable
        style={[
          styles.button,
          { borderColor: colors.border, opacity: disabled ? 0.6 : 1 },
        ]}
        onPress={() => void signIn()}
        disabled={disabled}
      >
        {busy ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={[styles.buttonText, { color: colors.text, fontSize: scaled(16) }]}>
            Đăng nhập bằng Google
          </Text>
        )}
      </Pressable>
      {localError ? (
        <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>
          {localError}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 48,
    backgroundColor: 'transparent',
  },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  error: { flexWrap: 'wrap', textAlign: 'center', marginTop: 8 },
});
