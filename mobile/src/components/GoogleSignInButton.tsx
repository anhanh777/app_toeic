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
//
// EXPO GO: nút này TỰ ẨN trên điện thoại (trả null) vì chưa có
// androidClientId/iosClientId — gọi useAuthRequest mà thiếu client ID
// của nền tảng sẽ throw ngay lúc render ("Client Id property
// `androidClientId` must be defined") và crash cả màn hình đăng nhập.
// Theo tài liệu Expo hiện tại, đăng nhập Google cần development build,
// Expo Go không hỗ trợ. Trong Expo Go dùng đăng nhập email/mật khẩu.
// Khi đã tạo OAuth client Android/iOS (Giai đoạn 3) và điền 2 hằng số
// bên dưới, nút sẽ tự hiện lại trên bản build thật.
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { ResponseType } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../auth';
import { useTextSize, useTheme } from '../theme';

WebBrowser.maybeCompleteAuthSession();

/** Web OAuth client đã có sẵn (dùng chung với bản web) — public ID. */
export const GOOGLE_WEB_CLIENT_ID =
  '1044241378768-g5jk4ffmkcneacjh3kgl6h413mc0tg00.apps.googleusercontent.com';

/** OAuth client Android — CHƯA có (cần tạo trong Google Cloud Console,
 *  Giai đoạn 3: package com.anhanh.toeicielts + SHA-1 của keystore bản
 *  build). Điền client ID vào đây thì nút Google tự hiện trên bản
 *  build thật Android. */
export const GOOGLE_ANDROID_CLIENT_ID: string | undefined = undefined;

/** OAuth client iOS — CHƯA có (như trên). */
export const GOOGLE_IOS_CLIENT_ID: string | undefined = undefined;

/** Redirect URI mà component này gửi cho Google (xem ghi chú đầu file). */
export const GOOGLE_REDIRECT_URI = 'com.anhanh.toeicielts:/oauthredirect';

/**
 * Nút Google: chỉ hiện khi nền tảng hiện tại có client ID tương ứng
 * (web → webClientId, Android → androidClientId, iOS → iosClientId).
 * Chưa có client ID thì trả null — không gọi hook auth, không crash
 * màn hình đăng nhập. Trong Expo Go (chưa có client Android) người
 * dùng đăng nhập bằng email/mật khẩu.
 */
export function GoogleSignInButton({
  onError,
}: {
  onError?: (message: string) => void;
} = {}) {
  const platformClientId =
    Platform.OS === 'android'
      ? GOOGLE_ANDROID_CLIENT_ID
      : Platform.OS === 'ios'
        ? GOOGLE_IOS_CLIENT_ID
        : GOOGLE_WEB_CLIENT_ID;
  if (!platformClientId) return null;
  return <GoogleSignInButtonInner onError={onError} />;
}

function GoogleSignInButtonInner({
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
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
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
