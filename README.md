# App TOEIC — Luyện thi TOEIC (Giai đoạn 1)

Web app luyện thi TOEIC (Listening + Reading), mobile-first, cài được như app (PWA).
Giai đoạn 1 chỉ làm TOEIC. Giai đoạn 2 sẽ thêm IELTS, dùng chung khung này.

## Chức năng chính

- Đăng ký / đăng nhập bằng email + mật khẩu, đổi mật khẩu, phân quyền user/admin
- **Đăng nhập bằng Google** (OAuth 2.0 — xem mục "Google login" dưới đây)
- Luyện tập theo Part (đủ 7 Part), chấm ngay, có giải thích; Part 3/4/7 luyện theo đoạn
- Nghe bằng giọng máy: audio được đọc bằng Web Speech API (TTS) từ script có sẵn — xem "Lưu ý về audio"
- Thi thử mini (1 Part, bấm giờ) và thi thử full (toàn bộ ngân hàng câu hỏi, 120 phút, tự nộp khi hết giờ, lưu đáp án tự động)
- Tính điểm TOEIC 10–990 — **điểm ước lượng** (xem mục "Cách tính điểm")
- Câu đã làm sai: tự lưu, ôn lại theo Part, làm đúng thì gỡ khỏi danh sách
- Từ vựng + flashcard lật thẻ, đánh dấu đã thuộc / chưa thuộc
- Thống kê: tỉ lệ đúng theo Part, điểm theo thời gian, Part yếu nhất, lịch sử, streak, mục tiêu điểm
- Bảng xếp hạng: 2 bảng (điểm thi thử cao nhất + XP), tab Tuần / Tháng / Mọi lúc, top 3 nổi bật, vị trí của mình luôn hiện, có thể ẩn tên
- Admin: CRUD câu hỏi + từ vựng, import JSON, xuất backup JSON

## Ngân hàng câu hỏi (số liệu thật)

- **220 câu hỏi TOEIC**: Part 1: 24, Part 2: 30, Part 3: 36 (12 đoạn × 3 câu), Part 4: 30 (10 đoạn × 3 câu), Part 5: 40, Part 6: 24 (6 đoạn × 4 câu), Part 7: 36 (12 đoạn × 3 câu). Mỗi câu có 4 phương án, 1 đáp án đúng, giải thích tiếng Việt.
- **160 từ vựng** theo 8 chủ đề (mỗi chủ đề 20 từ): office, business, travel, finance, shopping, meetings, email, job/hiring.
- Kế hoạch ban đầu đặt mục tiêu 400 câu + 300 từ; bản này ship **220 câu + 160 từ** (đủ để luyện đủ 7 Part và thi thử full). Thêm câu hỏi bất cứ lúc nào qua trang Admin → Import JSON (định dạng xem `data/questions.json`).
- Thi thử full dùng toàn bộ 220 câu trong ngân hàng (ít hơn 200 câu chuẩn của đề thi thật — vì vậy điểm thi thử full là điểm ước lượng trên ngân hàng hiện có).

## Cách chạy (local)

Yêu cầu: Node.js 24+, npm 10+.

```bash
# 1. Backend
cd backend
cp .env.example .env        # sửa JWT_SECRET trước khi dùng thật
npm install
npm run dev                  # chạy ở http://localhost:4000

# 2. Frontend (mở terminal mới)
cd frontend
cp .env.example .env
npm install
npm run dev                  # chạy ở http://localhost:5173
```

Mở http://localhost:5173 trên trình duyệt.

Tài khoản demo (tự tạo khi chạy lần đầu):
- Admin: `demo@toeic.app` / `admin123`
- Học viên: `user@toeic.app` / `user123`

Build production cho frontend: `cd frontend && npm run build` (ra thư mục `dist/`).

## Cấu trúc repo

```
app_toeic/
├── README.md, CONTRACT.md
├── backend/        # Express + SQLite (node:sqlite)
│   ├── src/        # index.js, db.js (SQL chỉ ở đây), scoring.js, auth.js, xp.js, seed.js, routes/
│   └── .env.example
├── frontend/       # Vite + React + TypeScript, PWA
│   ├── src/        # api.ts, auth.tsx, tts.ts, pages/
│   └── public/     # manifest.webmanifest, sw.js, icon.svg
├── data/           # questions.json, vocabulary.json (seed)
└── docs/           # database.md, api.md
```

## Lưu ý về audio

Không có file audio thu âm sẵn. Phần nghe dùng **Web Speech API (`speechSynthesis`)** của trình duyệt để đọc script (câu hỏi Part 1/2, đoạn hội thoại/bài nói Part 3/4) bằng giọng máy, có nút phát / tạm dừng / nghe lại và chỉnh tốc độ. Trong app, mọi chỗ phát audio đều ghi rõ: **"Âm thanh đọc bằng giọng máy (TTS)"**. Transcript chỉ hiện sau khi bạn trả lời xong.

## Cách tính điểm

Mỗi phần Listening (Part 1–4) và Reading (Part 5–7) chấm riêng: số câu đúng → điểm phần (5–495) theo **bảng quy đổi tham khảo công khai** (nội suy tuyến tính giữa các mốc, xem `backend/src/scoring.js`). Tổng điểm = Listening + Reading (thang 10–990). Đây là **điểm ước lượng để tham khảo**, không phải điểm chính thức của ETS. Bài thi mini (1 Part) chỉ báo số câu đúng, không quy đổi ra điểm 10–990.

## Google login

Đăng nhập Google được code đầy đủ (frontend lấy ID token → backend xác thực bằng `google-auth-library`, liên kết theo email với tài khoản đã có). Nhưng nó chỉ chạy khi bạn cấu hình:

1. Tạo project trên [Google Cloud Console](https://console.cloud.google.com/), bật Google Identity, tạo OAuth Client ID (Web application).
2. Thêm Authorized JavaScript origin: `http://localhost:5173` (và domain thật khi deploy).
3. Backend: đặt `GOOGLE_CLIENT_ID` (và `GOOGLE_CLIENT_SECRET` nếu dùng code flow) trong `backend/.env`.
4. Frontend: đặt `VITE_GOOGLE_CLIENT_ID` (cùng Client ID) trong `frontend/.env`.

Chưa cấu hình thì nút Google hiện mờ kèm ghi chú "Chưa cấu hình Google OAuth — xem README", và API trả về `501 google_not_configured`. **Không bao giờ commit Client Secret hay file `.env` lên git.**

## XP và bảng xếp hạng

- Làm đúng 1 câu luyện tập: +10 XP. Hoàn thành 1 bài thi thử: +50 XP. Ôn lại câu sai và trả lời đúng: +5 XP. Đạt streak 7 ngày: +100 XP (một lần).
- Bảng điểm thi thử xếp theo điểm thi thử full cao nhất; bảng XP xếp theo XP tích lũy. Tab Tuần / Tháng / Mọi lúc.
- Chống gian lận (đơn giản): bài thi full nộp trong dưới 10 phút không được tính vào bảng điểm thi thử.

## Deploy

### SQLite có giới hạn gì khi deploy không?

Ngắn gọn: **SQLite đủ dùng cho app cá nhân / ít người dùng.** Giới hạn lý thuyết của SQLite là hàng trăm TB — ngân hàng 220 câu + đáp án của người dùng còn lâu mới chạm tới. Giới hạn thật sự chỉ có 2 cái:

1. **Chỉ 1 writer tại 1 thời điểm** — nhiều người ghi cùng lúc sẽ phải chờ nhau. Với app luyện thi cá nhân / vài chục người dùng cùng lúc thì không thành vấn đề; với hàng nghìn người làm bài cùng lúc thì mới cần Postgres.
2. **File `.db` phải nằm trên ổ đĩa bền (persistent disk)** — dữ liệu sống trong file `backend/data/app.db`. Nếu deploy backend lên môi trường **serverless / ephemeral** (ví dụ Vercel Functions, hoặc container không có persistent disk), file `.db` sẽ **bị xóa mỗi lần redeploy / khởi động lại** và mất hết tài khoản, bài làm, điểm số.

### Cách deploy khuyên dùng

- **Backend:** deploy trên VPS, hoặc Render / Fly.io **kèm persistent disk** (gắn disk vào thư mục chứa file `.db`, đặt `DATABASE_PATH` trỏ tới đó). Không deploy backend lên Vercel Functions.
- **Frontend:** deploy tĩnh lên Vercel / Netlify (build `frontend/dist`), đặt `VITE_API_URL` trỏ về URL backend.
- Biến môi trường khi deploy: `PORT`, `JWT_SECRET` (đổi thành chuỗi dài ngẫu nhiên), `DATABASE_PATH`, `GOOGLE_CLIENT_ID`, `CORS_ORIGIN` (domain frontend).

### Lộ trình chuyển sang Postgres (khi cần)

SQL của app đã viết theo chuẩn tương thích Postgres (xem `docs/database.md` — bảng tương đương kiểu dữ liệu), và toàn bộ SQL chỉ nằm trong `backend/src/db.js`, nên việc chuyển đổi chỉ cần:

1. Tạo database Postgres miễn phí (Supabase / Neon free tier).
2. Đặt `DATABASE_URL` trong biến môi trường; thay `db.js` bằng client Postgres (`pg`) giữ nguyên tên hàm truy vấn.
3. Chuyển dữ liệu: xuất backup JSON từ endpoint admin (`GET /api/admin/backup`) rồi import lại, hoặc dùng `pgloader`.

Không cần chuyển ngay — chỉ chuyển khi người dùng đông lên hoặc cần ghi đồng thời nhiều.

### Backup

- Sao lưu file `backend/data/app.db` định kỳ (copy file khi backend đang dừng, hoặc dùng SQLite backup).
- Hoặc vào trang Admin → **Xuất backup JSON** (`GET /api/admin/backup`): tải về file JSON gồm câu hỏi, từ vựng, số lượng tài khoản/bài làm (không chứa mật khẩu).

## Không làm trong Giai đoạn 1

- IELTS (Giai đoạn 2), Speaking/Writing của TOEIC, thanh toán, audio thu âm thật.
