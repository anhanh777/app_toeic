# Web Quản trị riêng — app TOEIC/IELTS

Web quản trị tách riêng khỏi app học viên (Option A: chỉ tách frontend,
dùng chung backend + SQLite DB). App học viên không còn chứa code admin.

## Chạy local

```bash
cd frontend-admin
npm install
npm run dev        # mặc định gọi backend local http://localhost:4000
# Muốn gọi backend Render: VITE_API_URL=https://app-toeic-backend.onrender.com npm run dev
```

Đăng nhập bằng tài khoản admin (demo: `demo@toeic.app` / `admin123`).
Tài khoản học viên (`user@toeic.app`) vào sẽ thấy "Không có quyền truy cập".

## Các mục

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Dashboard: 3 mục chính |
| `/toeic` | Quản lý đề TOEIC (test sets, câu hỏi, từ vựng, sao lưu) |
| `/toeic/test-set/:id` | Chi tiết đề TOEIC: AI parse, nhận diện đáp án, audio từng Part, nhập tay theo loạt |
| `/ielts` | Quản lý đề IELTS Academic — RIÊNG với TOEIC |
| `/ielts/test-set/:id` | Chi tiết đề IELTS: 19 dạng câu, đáp án gõ tay + giới hạn số từ, ảnh bản đồ, audio từng Section |
| `/users` | Quản lý tài khoản: thêm/sửa/xóa, đặt lại mật khẩu (chỉ mật khẩu, không reset tiến độ học) |

Lưu ý: nhận diện bằng AI (ai-parse) hiện chỉ hiểu đề TOEIC, chưa hỗ trợ IELTS.

## Deploy lên Vercel (tạo project mới)

Làm trên dashboard Vercel (không làm được bằng CLI trong môi trường này):

1. Vercel → **Add New → Project** → **Import Git Repository** → chọn repo
   `anhanh777/app_toeic`.
2. **Root Directory:** `frontend-admin` (bắt buộc — repo chứa cả app học viên).
3. **Framework Preset:** Vite (tự nhận; `vercel.json` trong thư mục đã có sẵn
   build command `npm run build`, output `dist`, rewrite SPA về `index.html`).
4. **Environment Variables** — thêm 1 biến:
   - Key: `VITE_API_URL`
   - Value: `https://app-toeic-backend.onrender.com`
5. Bấm **Deploy**. Vercel cấp domain dạng `https://app-toeic-admin.vercel.app`
   (tên có thể khác nếu trùng — ghi lại domain thật nhận được).
6. Từ đó về sau, mỗi lần push lên `main` Vercel tự deploy lại cả 2 project
   (app học viên và web admin dùng chung repo).

## Thêm domain admin vào backend (Render) — bắt buộc, nếu không sẽ bị chặn CORS

Backend chỉ cho phép origin trong `FRONTEND_URL` / `CORS_ORIGIN`
(xem `backend/src/index.js`).

1. Render → service `app-toeic-backend` → **Environment**.
2. Sửa biến `FRONTEND_URL`, **giữ nguyên URL app học viên**, thêm domain admin
   mới, cách nhau bằng dấu phẩy, không có khoảng trắng thừa. Ví dụ
   (thay domain admin bằng domain thật ở bước Vercel):
   ```
   https://app-toeic-three.vercel.app,https://app-toeic-admin.vercel.app
   ```
3. **Save Changes** — Render tự redeploy backend (~2–3 phút). Lưu ý: backend
   free tier khi redeploy sẽ seed lại DB từ code đã deploy; dữ liệu bền
   nằm trong seed git nên không mất. Đừng deploy khi còn commit local
   chưa push.
4. Kiểm tra: mở domain admin → đăng nhập `demo@toeic.app` → các mục
   `/toeic`, `/ielts`, `/users` đều mở được; đăng nhập bằng tài khoản
   học viên `user@toeic.app` phải thấy "Không có quyền truy cập".
   App học viên `https://app-toeic-three.vercel.app` vẫn đăng nhập
   và luyện/thi bình thường.
