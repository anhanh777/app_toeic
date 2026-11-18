# App mobile — Luyện TOEIC & IELTS (React Native + Expo)

Bản mobile của app web luyện thi (cùng backend, cùng tài khoản, cùng nội
dung: 37 bộ đề / 5.960 câu — 25 TOEIC + 12 IELTS). Android trước, iOS sau.

## Chạy thử trên điện thoại (Expo Go)

Yêu cầu: Node 20+ (máy này đang dùng Node 24), điện thoại Android đã cài
app **Expo Go** (CH Play, miễn phí).

```bash
cd mobile
npm install
npx expo start
```

Quét mã QR bằng app Expo Go → app mở trên điện thoại. Đăng nhập bằng tài
khoản đã có trên web (VD tài khoản của bạn) hoặc tài khoản demo learner
`user@toeic.app` / `user123`. Máy tính và điện thoại phải chung mạng Wi-Fi
(nếu Expo Go không kết nối được, thử `npx expo start --tunnel`).

Lưu ý: tất cả dữ liệu (đề thi, câu hỏi, audio, ảnh) đều tải từ máy chủ qua
mạng — **cài xong cần có mạng mới dùng được**, app chưa có chế độ offline
(tải đề về máy để làm không cần mạng là tính năng làm sau).

## Cấu trúc

- `src/app/` — các màn hình (Expo Router, mỗi file là 1 route):
  `index` (chọn kỳ thi + trang chính), `login`, `practice`, `test-set/[id]`,
  `session`, `mock`, `result/[id]`, `today`, `diagnostic`, `errors`,
  `writing`, `speaking`, `vocabulary`, `wrong`, `leaderboard`, `settings`,
  `ielts-setup`.
- `src/api.ts` — API client (port từ `frontend/src/api.ts`), token lưu bằng
  `expo-secure-store`. API base URL: biến `EXPO_PUBLIC_API_URL`, mặc định
  `https://app-toeic-backend.onrender.com`.
- `src/components/` — `AudioPlayer` (expo-av), `QuestionView`,
  `IeltsAnswerControl`, `RootCausePicker`, `PassageView`, `WordLookup`,
  `GoogleSignInButton`.
- `src/theme.tsx` (Pastel + dark mode + cỡ chữ), `src/exam.tsx`,
  `src/auth.tsx`, `src/lib.ts` (số câu thật, bỏ số đầu câu...),
  `src/layout.ts` (breakpoint, `columnsForWidth()`, `LIST_DEFAULTS` cho
  FlatList), `src/notifications.ts` (nhắc ôn tập).
- `app.json` — tên app, scheme `app-toeic-ielts`, package Android
  `com.anhanh.toeicielts`. `eas.json` — profile build EAS.

## Build file APK / đăng Play Store (cần tài khoản Expo)

```bash
npx eas-cli@latest login          # tài khoản Expo của bạn
npx eas-cli@latest build --profile preview --platform android   # file APK thử
npx eas-cli@latest build --profile production --platform android # file AAB đăng Store
```

Google Play: phí đăng ký nhà phát triển $25 một lần. iOS làm sau (Apple
Developer $99/năm; build bằng EAS cloud, không cần máy Mac).

## Đăng nhập Google trên mobile

Nút Google trên màn hình đăng nhập dùng `expo-auth-session` với Web OAuth
client đã có sẵn (cùng client với bản web). Cần 2 việc:

1. Thêm redirect URI này vào Google Cloud Console → OAuth client
   `1044241378768-…` → Authorized redirect URIs:
   `com.anhanh.toeicielts:/oauthredirect`
2. Nút Google **chỉ chạy trên bản build thật** (development/production
   build qua EAS), **không chạy trong Expo Go** (Expo Go không redirect
   OAuth về app được).

Nếu Console từ chối redirect URI không phải https, phương án dự phòng là
tạo thêm 1 OAuth client **Android** trong cùng project Google (package
`com.anhanh.toeicielts` + SHA-1 lấy từ keystore của bản EAS build) rồi
truyền vào prop `androidClientId` của `GoogleSignInButton`.

## Thông báo nhắc ôn tập (local, Giai đoạn 3)

- Bật/tắt nhắc hằng ngày lúc 20:00 trong Hồ sơ → Nhắc nhở.
- Có câu đến hạn trong Sổ lỗi → app nhắc 1 lần lúc 8:00 sáng hôm sau (mở
  màn Sổ lỗi mới lên lịch, tối đa 1 lần/ngày).
- Chỉ là local notification (lên lịch trên máy). Remote push qua
  Firebase/APNs chưa làm — cần dev build + Firebase, để sau khi phát hành.

## Kiểm tra chất lượng

```bash
npx tsc --noEmit        # typecheck (bắt buộc sạch)
npx expo lint           # lint (npx expo lint bị lỗi wrapper — dùng npx eslint src/ nếu cần)
npx expo export --platform android   # kiểm tra bundle Android
```

## Hạn chế đã biết (giống bản web, sửa chung sau)

- Cặp "Choose TWO letters" chấm theo thứ tự (đổi thứ tự là sai) — chưa có
  pair-grading.
- Giải thích IELTS bằng tiếng Anh.
- Không có TTS đọc transcript khi thiếu file audio (hiện ghi chú như bản web).
- Màn Chẩn đoán dùng tờ đề viết riêng trong file, chưa dùng chung màn Thi thử.
- Không có màn quản trị trên mobile — admin vẫn dùng web.
- Chưa test trên máy thật ở 2 cỡ màn hình (~360×640 và ~390×844) và độ mượt
  cuộn khi làm đề dài — cần test bằng Expo Go trên điện thoại Android trước
  khi phát hành.
