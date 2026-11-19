# Backup / khôi phục dữ liệu người dùng (file lên Google Drive)

Render free tier xóa file SQLite mỗi lần redeploy / ngủ dậy / restart tay.
Đề thi thì seed lại được từ git, nhưng dữ liệu người dùng (avatar, từ đã
lưu, lịch sử làm bài, XP, hồ sơ IELTS...) thì mất. Cơ chế backup file:

- **Backup định kỳ** (cron, đề xuất mỗi giờ): gọi `GET /api/admin/backup`,
  chỉ giữ phần dữ liệu người dùng, upload lên thư mục Drive riêng tư
  `app-toeic-backups` (1 bản theo ngày `backup-YYYYMMDD-HHmmss.json` +
  1 bản `backup-latest.json`).
- **Khôi phục tự động** (cron, mỗi 5 phút từ 2026-11-19): `restore-watch.js`
  phát hiện live DB vừa bị xóa thì tải bản backup mới nhất về và gọi
  `POST /api/admin/restore`.

Không cần thẻ, không cần Cloudflare R2, không cần Docker (phương án
Litestream + R2 đã bỏ ngày 2026-11-17).

## Backup những gì

**Chỉ các bảng dữ liệu người dùng** (17 bảng):

`users`, `user_words`, `user_vocabulary`, `attempts`, `answers`,
`wrong_questions`, `xp_events`, `ielts_profiles`, `error_log`,
`monster_state`, `sessions`, `mock_tests`, `plan`, `writing_submissions`,
`speaking_recordings`, `dictionary_cache`, `app_settings`.

**Không backup** các bảng nội dung (`test_sets`, `questions`, `options`,
`passages`, `part_media`, `vocabulary`, `writing_tasks`,
`speaking_prompts`) — chúng được seed lại từ git mỗi lần boot.
Endpoint `GET /api/admin/backup` vẫn trả kèm `questions` /
`vocabulary` / `userWords` để tương thích với nút "Sao lưu dữ liệu"
trên web Admin, nhưng script backup sẽ cắt bỏ phần đó trước khi upload
để file nhỏ (vài chục KB thay vì ~10 MB).

## API

- `GET /api/admin/backup` (admin) — trả `{ version, exportedAt,
  questions, vocabulary, userWords, usersCount, attemptsCount, userData,
  counts }`. `userData` là `{ ten_bang: [row, ...] }`, gồm cả
  `password_hash` ở bảng `users` (cần để đăng nhập lại sau khi khôi phục).
- `POST /api/admin/restore` (admin) — nhận file backup `.json` qua
  multipart field `file`, hoặc JSON body (tài liệu backup hoặc riêng
  `{ userData }`). Chỉ khôi phục các bảng dữ liệu người dùng, trong 1
  transaction, theo thứ tự an toàn với khóa ngoại; sửa lại
  `sqlite_sequence` cho các bảng AUTOINCREMENT. File sai định dạng → 400,
  không thay đổi gì. Idempotent: khôi phục 2 lần cho cùng kết quả.
  Trả `{ ok: true, restored: { bang: so_dong }, counts }`.

## Script

Ở `backend/scripts/`:

- `backup-lib.js` — helper dùng chung (đọc admin token, gọi API có chờ
  Render cold-start, gọi `hatch_gws_cli` làm việc với Drive).
- `backup-to-drive.js` — chạy backup 1 lần: chờ backend → GET backup →
  cắt phần nội dung → upload bản theo ngày + cập nhật `backup-latest.json`
  → xóa bản theo ngày cũ hơn 7 ngày.
- `restore-watch.js` — chạy kiểm tra 1 lần: phát hiện live vừa bị xóa
  thì khôi phục từ bản backup mới nhất, rồi đối chiếu lại số dòng.

Biến môi trường (không bắt buộc): `API_BASE` (mặc định backend Render),
`ADMIN_TOKEN_FILE` (mặc định `~/workspace/drive-ets/token-admin.txt`),
`DRIVE_FOLDER_NAME` (mặc định `app-toeic-backups`), `RETENTION_DAYS`
(mặc định 7), `BACKUP_WORK_DIR` (mặc định thư mục tạm của hệ thống).
`BACKUP_ADMIN_EMAIL` / `BACKUP_ADMIN_PASSWORD` (mặc định tài khoản demo
admin `demo@toeic.app` / `admin123` — chỉ dùng để tự cấp lại token).

### Token admin tự làm mới (thêm 2026-11-19)

Token admin là JWT 7 ngày, lưu ở `~/workspace/drive-ets/token-admin.txt`.
Hết hạn thì API trả 401 — trước đây cron backup + restore-watch lỗi
401 cho tới khi có người đăng nhập tay để cấp lại (đã xảy ra 2026-11-19
lúc 12:48). Từ nay `backup-lib.js` tự xử lý: các hàm `apiGetBackupAuto`
/ `apiPostRestoreAuto` gặp 401 thì tự đăng nhập lại bằng tài khoản demo
admin (`POST /api/auth/login`), ghi token mới vào file (quyền 0600) rồi
thử lại **đúng 1 lần**. Đăng nhập thất bại thì báo lỗi (exit 1) để cron
báo cáo, file token cũ được giữ nguyên. Đã kiểm chứng bằng token hỏng
cố ý: script tự cấp token mới và backup thành công (197 dòng). Không
cần nhắc cấp lại tay vào ngày hết hạn nữa.

## Cron cần tạo (sau khi deploy)

Chạy trên máy Muse (repo ở `~/workspace/app_toeic`):

```bash
# Backup moi gio (lay so lieu moi nhat, toi da mat ~1 gio du lieu neu server sap)
node ~/workspace/app_toeic/backend/scripts/backup-to-drive.js

# Kiem tra + khoi phuc moi 30 phut
node ~/workspace/app_toeic/backend/scripts/restore-watch.js
```

Khoảng mất dữ liệu = thời gian từ lần backup cuối tới lúc server bị xóa
(tối đa ~1 giờ với backup mỗi giờ).

## Khi nào restore-watch khôi phục

Chỉ khi TẤT CẢ các điều kiện sau đúng:

1. Live chỉ có đúng 2 tài khoản demo (`demo@toeic.app`,
   `user@toeic.app`), không có tài khoản nào khác.
2. 2 tài khoản demo vừa được tạo (created_at trong 12 giờ qua) — tức là
   DB vừa được seed lại sau khi bị xóa.
3. Mọi bảng dữ liệu người dùng khác đều rỗng (trừ `app_settings`,
   `brand_settings`, `menu_icons`, vì seed luôn chèn giá trị mặc định
   khi boot).
4. Bản backup mới nhất có dữ liệu người dùng thật (nhiều hơn 2 dòng demo).

Nếu live có bất kỳ dữ liệu người dùng nào (tài khoản mới, từ đã lưu, bài
đã làm...) thì **không khôi phục** — tránh ghi đè dữ liệu mới bằng dữ
liệu cũ trong backup. Trường hợp này phải khôi phục thủ công (xem dưới).

### Ngoại lệ: "bị xóa một phần" (thêm 2026-11-19)

Ngày 2026-11-19 gặp trường hợp: live bị xóa rồi có người dùng demo
luyện tiếp (attempts 9→11), nên điều kiện 3 sai và restore-watch từ
chối khôi phục — trong khi tài khoản thật `a@gmail.com` đã biến mất.
Từ đó, trước khi từ chối, restore-watch **đối chiếu tài khoản với bản
backup mới nhất**: nếu live **không còn tài khoản thật nào** (chỉ còn
demo) mà backup vẫn giữ tài khoản thật đã mất thì **khôi phục tự động**
(`lib.isPartialWipe`). Chỉ tự khôi phục khi live không còn tài khoản
thật nào — nếu admin xóa 1 tài khoản trong khi vẫn còn tài khoản thật
khác thì không tự khôi phục (tránh hồi sinh tài khoản vừa xóa có ý).

Tương tự, `backup-to-drive.js` cũng đối chiếu trước khi upload: nếu
live đang thiếu tài khoản thật so với `backup-latest.json` thì **báo
lỗi và bỏ qua lần backup đó** (exit 1 để cron báo cáo), tránh ghi đè
bản backup tốt bằng ảnh chụp thiếu tài khoản.

## Khôi phục thủ công

```bash
# 1. Tai ban backup moi nhat ve (thay FILE_ID bang id tren Drive)
 /opt/hatch/bin/hatch_gws_cli drive files download \
   --params '{"fileId": "FILE_ID"}' -o /tmp/backup-latest.json

# 2. Goi restore (token doc tu file, khong in ra man hinh)
TOKEN=$(cat ~/workspace/drive-ets/token-admin.txt)
curl -s -X POST https://app-toeic-backend.onrender.com/api/admin/restore \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data @/tmp/backup-latest.json

# Hoac upload file truc tiep (multipart):
curl -s -X POST https://app-toeic-backend.onrender.com/api/admin/restore \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file=@/tmp/backup-latest.json'
```

Cũng có thể khôi phục từ web Admin sau này (chưa có nút bấm — endpoint
đã sẵn, chỉ cần thêm form upload file vào trang "Sao lưu dữ liệu").

## Seed sau khi sửa (quan trọng)

Trước đây `seedQuestions()` / `seedVocabulary()` bỏ qua toàn bộ bảng khi
`count > 0`. Từ khi có backup, DB tồn tại qua các lần deploy, nên bộ đề
mới đẩy lên sau đó sẽ không bao giờ được seed nếu giữ kiểu cũ. Đã sửa
thành **seed tăng dần theo id**: chỉ chèn câu/từ chưa có, bỏ qua id đã
tồn tại. Bộ đề IELTS theo từng Test đã làm đúng kiểu này từ trước nên
không cần sửa.

Hệ quả cần nhớ: **sửa nội dung câu hỏi/từ vựng ĐÃ CÓ trong file seed vẫn
cần PUT qua API như hiện nay** — seed không cập nhật dòng đã tồn tại
(để không ghi đè sửa đổi của admin trên web). Chỉ có câu/từ/bộ đề MỚI
mới được seed tự động.

## Bảo mật

File backup chứa `password_hash` của toàn bộ tài khoản. Chỉ để trong
thư mục Drive riêng tư `app-toeic-backups`, **không chia sẻ công khai,
không chia sẻ link, không commit vào git**. Thư mục này chỉ có chủ tài
khoản Drive xem được. Khi dọn dẹp bản cũ, dùng `files delete` (xóa hẳn)
chứ không chỉ chuyển vào thùng rác.
