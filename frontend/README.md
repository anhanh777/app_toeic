# Frontend — App TOEIC (Giai đoạn 1, TOEIC only)

Vite + React + TypeScript, mobile-first, plain CSS. UI tiếng Việt, câu hỏi tiếng Anh.

## Chạy

```bash
cd frontend
cp .env.example .env   # sửa VITE_API_URL / VITE_GOOGLE_CLIENT_ID nếu cần
npm install
npm run dev            # http://localhost:5173
npm run build          # kiểm tra build
```

Backend chạy ở `VITE_API_URL` (mặc định `http://localhost:4000`). Nếu backend chưa chạy, app vẫn mở được trang đăng nhập nhưng mọi API sẽ báo lỗi tiếng Việt "Không kết nối được tới máy chủ…".

## Tài khoản demo (do backend seed)

- User: `user@toeic.app` / `user123`
- Admin: `demo@toeic.app` / `admin123`

## Google OAuth

- Tạo OAuth Client ID (Web) trong Google Cloud Console, thêm origin `http://localhost:5173` (và domain demo khi deploy).
- Đặt `VITE_GOOGLE_CLIENT_ID=<client id>` trong `frontend/.env` (không commit file `.env` thật).
- Nếu chưa cấu hình, nút Google hiện ở trạng thái disabled với ghi chú "Chưa cấu hình Google OAuth — xem README". Khi đã cấu hình, frontend gửi ID token (`credential`) về `POST /api/auth/google`.

## TTS

Âm thanh nghe dùng `window.speechSynthesis`, `lang: en-US`, có điều chỉnh tốc độ (0.5x–1.5x), phát / tạm dừng / nghe lại. Nhãn hiển thị: "Âm thanh đọc bằng giọng máy (TTS)". Part 1/2 đọc script của câu, Part 3/4 đọc script của đoạn. Transcript chỉ hiện sau khi nộp đáp án (luyện tập) — trong thi thử không hiện đáp án/giải thích cho tới khi nộp bài.

## Điểm số

Điểm thi thử là **điểm ước lượng** (thang 10–990, theo bảng quy đổi tham khảo công khai, không phải điểm chính thức của ETS). Bài thi mini (1 Part) chỉ báo số câu đúng/tổng, không có điểm 10–990.

## PWA

`public/manifest.webmanifest` + `public/sw.js` (cache app shell, không cache `/api`), service worker được đăng ký trong `src/main.tsx`. Icon: `public/icon.svg`.

## Cấu trúc

- `src/api.ts` — API client (token trong localStorage, base URL từ `VITE_API_URL`)
- `src/auth.tsx` — Auth context (login/register/Google/logout, `GET /api/auth/me`)
- `src/tts.ts` — helpers speechSynthesis
- `src/pages/` — Login, Home, Practice, PracticeSession, MockTest, Result, WrongQuestions, Vocabulary, Stats, Leaderboard, Admin, Settings
- `src/components.tsx` — ErrorBox, tên Part, helpers dùng chung
