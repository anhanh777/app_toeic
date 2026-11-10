# API — App TOEIC Phase 1

Base URL mac dinh: `http://localhost:4000`. Moi endpoint `/api/*` (tru `/health`)
tra JSON. Endpoint co `(auth)` can header `Authorization: Bearer <JWT>`.
Endpoint admin can them role `admin` (user thuong bi `403`).

Loi: `{error:"..."}` voi status `400` (validation), `401` (chua dang nhap),
`403` (khong co quyen), `404` (khong tim thay), `501` (`google_not_configured`).

**Bao mat dap an:** cac GET cau hoi (`/api/questions*`, `/api/wrong-questions`)
KHONG BAO GIO tra dap an dung hay giai thich. Dap an chi lo ra sau khi nguoi
dung da tra loi (`POST /practice/answer`, review cau sai, hoac xem ket qua bai
thi da nop), hoac qua endpoint admin.

**Diem thi la diem uoc luong** (bang quy doi tham khao cong khai, khong phai
bang chinh thuc cua ETS) — frontend phai ghi ro "diem uoc luong" khi hien thi.

## Health

| Endpoint | Mo ta |
|---|---|
| `GET /health` | `{ok:true, service:"app_toeic", time:"..."}` (khong co prefix `/api`) |

## Auth

| Endpoint | Body / Ghi chu | Tra ve |
|---|---|---|
| `POST /api/auth/register` | `{name, email, password}` (password >= 6 ky tu) | `{token, user}` (201) |
| `POST /api/auth/login` | `{email, password}` | `{token, user}` |
| `POST /api/auth/google` | `{idToken}` — verify bang `google-auth-library` + `GOOGLE_CLIENT_ID`; neu chua cau hinh tra `501 {error:"google_not_configured"}`; trung email thi lien ket vao tai khoan cu, chua co thi tao moi (khong co password) | `{token, user}` |
| `POST /api/auth/change-password` (auth) | `{currentPassword, newPassword}` | `{ok:true}` |
| `GET /api/auth/me` (auth) | | `{user}` |

`user`: `{id, email, name, role, targetScore, googleId, avatarUrl, hideOnLeaderboard, createdAt}` — khong bao gio co `password_hash`.

## Tai khoan

| Endpoint | Mo ta |
|---|---|
| `PATCH /api/users/me` (auth) | `{name?, targetScore? (10-990), hideOnLeaderboard?}` → `{user}` |

## Cau hoi / doan van (public, khong can auth)

| Endpoint | Mo ta |
|---|---|
| `GET /api/parts` | `[{part, count, section}]`, `section` = `listening` (Part 1-4) hoac `reading` (Part 5-7) |
| `GET /api/questions?part=&limit=50&offset=0&search=` | `{total, limit, offset, items}` — cau hoi **da redact** (khong co dap an/giai thich). Moi item: `{id, part, passageId, passageTitle, passageText, script, content, options:[{label, content}], topic, difficulty}` |
| `GET /api/questions/:id` | 1 cau hoi, da redact |
| `GET /api/passages/:id` | `{id, part, title, content, script, type, questionIds}` |

## Luyen tap

| Endpoint | Mo ta |
|---|---|
| `POST /api/practice/answer` (auth) | `{questionId, selected}` → `{correct, correctLabel, explanation, transcript, xpAwarded}`. Dung +10 XP; sai thi vao danh sach cau sai. `transcript` = script cua cau/doan (chi hien sau khi tra loi). |

## Thi thu

| Endpoint | Mo ta |
|---|---|
| `POST /api/tests` (auth) | `{mode:"mini"\|"full", part?, count?, durationMinutes?}` → `{attemptId, questionIds, durationSec, startedAt}`. Mini: 1 Part, mac dinh 10 cau (toi da = so cau cua Part do), thoi gian mac dinh 30 phut. Full: toan bo ngan hang cau theo thu tu Part 1→7, mac dinh 120 phut (`durationMinutes` chi de smoke-test). |
| `POST /api/tests/:id/answers` (auth) | `{questionId, selected}` — autosave, **chua cham** → `{ok:true}` |
| `POST /api/tests/:id/submit` (auth) | Cham tat ca dap an da luu → `{attemptId, mode, listeningCorrect, readingCorrect, listeningScore, readingScore, totalScore, byPart, wrongQuestionIds, xpAwarded, leaderboardEligible}`. Mini test: `listeningScore/readingScore/totalScore = null` (chi bao correct/total theo Part). Full test: quy doi 10–990 (uoc luong; ti le theo so cau that cua moi phan trong de). +50 XP. Bai full nop duoi 10 phut thi `leaderboardEligible=false`. Nop 2 lan tra lai ket qua cu, khong cong XP 2 lan. |
| `GET /api/tests/:id/result` (auth, chu bai hoac admin) | Nhu submit + `startedAt, finishedAt, durationSec, detail[]` (moi cau kem `selected, correct, correctLabel, explanation, options[]` co `isCorrect`) |
| `GET /api/tests/history` (auth) | Cac attempt `mini`/`full` moi nhat (50) |

## Cau sai

| Endpoint | Mo ta |
|---|---|
| `GET /api/wrong-questions?part=` (auth) | Cau hoi da redact + `wrongCount, lastWrongAt` |
| `POST /api/wrong-questions/:questionId/review` (auth) | `{selected}` → `{correct, correctLabel, explanation, transcript, xpAwarded}`. Tra loi dung thi xoa khoi danh sach +5 XP. |

## Tu vung

| Endpoint | Mo ta |
|---|---|
| `GET /api/vocabulary?topic=&limit=100&offset=0` (auth) | `{total, limit, offset, items}` — moi tu co them `status` cua user (`learning` mac dinh) |
| `POST /api/vocabulary/:id/mark` (auth) | `{status:"learning"\|"learned"\|"wrong"}` → `{ok:true, id, status}` |

## Thong ke

| Endpoint | Mo ta |
|---|---|
| `GET /api/stats/overview` (auth) | `{totalAnswered, totalCorrect, accuracy, byPart:[{part, answered, correct, accuracy}], weakestPart, streakDays, targetScore, totalXp, recentScores:[{date, totalScore}]}` |
| `GET /api/stats/history` (auth) | Cac attempt moi nhat (gom ca `practice`) |

## Bang xep hang

| Endpoint | Mo ta |
|---|---|
| `GET /api/leaderboard?metric=score\|xp&tab=week\|month\|all` (auth) | `{metric, tab, entries:[{rank, userId, name, avatarUrl, score, xp, answered}], me:{rank, score, xp}\|null}`. Bang diem: diem full-test cao nhat cua moi user trong khoang, chi bai hop le (`leaderboard_eligible=1`). Bang XP: tong `xp_events` trong khoang. `week` = tu thu Hai tuan nay (UTC), `month` = tu dau thang (UTC). User an ten khong co trong `entries` nhung `me` van tra ve. |

## Admin (can role `admin`)

| Endpoint | Mo ta |
|---|---|
| `GET /api/admin/questions?part=&limit=&offset=&search=` | Danh sach **kem dap an dung + giai thich** (de sua) |
| `POST /api/admin/questions` | Tao cau hoi dang seed-format → 201, tra cau hoi dang admin |
| `PUT /api/admin/questions/:id` | Sua cau hoi (validate lai toan bo) |
| `DELETE /api/admin/questions/:id` | → `{ok:true}` |
| `POST /api/admin/questions/import` | `{questions:[...]}` → `{imported, errors:[{index, reason}]}`. Validate moi dong: du 4 options A–D, dung 1 dap an dung, co `explanation`; dong loi bi bo qua, khong chen nua voi. |
| `POST /api/admin/test-sets/:id/ai-parse` | **Nhan dien de thi bang AI (Gemini).** Upload 1 file de thi (multipart, field `file`: `.txt`, `.docx`, `.pdf`, `.png`, `.jpg`, `.jpeg`, toi da 10MB) → tra ve `{questions:[...], invalid:[{index, reason}], warnings:[...]}` de admin xem truoc / sua tay, **KHONG tu luu vao DB** (luu bang endpoint `/admin/test-sets/:id/import` nhu binh thuong). Cau nao khong xac dinh duoc dap an thi `correct: ""` va `invalid` ghi ly do "Chưa xác định được đáp án đúng — cần chọn tay trước khi import" (AI khong doan bua dap an). Chua cau hinh `GEMINI_API_KEY` thi tra `501 {error:"gemini_not_configured"}`; Gemini loi/timeout thi tra `502`. File mau: `data/ai-parse-sample.txt`. |
| `GET /api/admin/vocabulary?topic=&limit=&offset=` | Danh sach tu vung |
| `POST /api/admin/vocabulary` | Tao tu `{id, word, phonetic?, meaning, example?, topic?}` |
| `PUT /api/admin/vocabulary/:id` | Sua tu |
| `DELETE /api/admin/vocabulary/:id` | → `{ok:true}` |
| `POST /api/admin/vocabulary/import` | `{items:[...]}` → `{imported, errors:[{index, reason}]}` |
| `GET /api/admin/backup` | `{exportedAt, questions, vocabulary, usersCount, attemptsCount}` — **khong co password hash** |

## Cau hinh

Xem `backend/.env.example`: `PORT=4000`, `JWT_SECRET`, `DATABASE_PATH`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY` (key Gemini de
nhan dien de thi bang AI; chua co thi endpoint ai-parse tra `501`), `CORS_ORIGIN` (mac dinh
`http://localhost:5173`).

## Chay

```bash
cd backend
npm install
npm run dev    # node --watch src/index.js (PORT 4000)
npm start      # chay binh thuong
npm run seed   # seed thu cong (idempotent)
```
