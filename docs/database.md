# Database — App TOEIC Phase 1

## Engine

- **SQLite** (file `.db`) qua `node:sqlite` (`DatabaseSync`, co san tu Node 22.5+/24,
  khong can native module). Duong dan lay tu env `DATABASE_PATH`, mac dinh
  `backend/data/app.db`. File `.db` KHONG commit (xem `backend/.gitignore`).
- **Tat ca SQL chi nam trong `backend/src/db.js`** (routes khong viet SQL truc tiep).
- Backend tu tao bang khi khoi dong (`initDb`) va seed khi bang rong (xem `src/seed.js`).

## Quy tac tuong thich Postgres

Schema dung SQL chuan de sau nay chuyen sang Postgres duoc de dang:

| Van de | SQLite (hien tai) | Postgres (tuong lai) |
|---|---|---|
| Khoa chinh tu tang | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL` / `BIGSERIAL` |
| Kieu du lieu | `INTEGER` / `TEXT` / `REAL` / `TIMESTAMP` | giong het |
| Timestamp | text ISO-8601 (`2026-11-09T08:31:50.091Z`) | `TIMESTAMP` / `timestamptz`, cung dang ISO-8601 |
| Ngay gio | tinh bang **JS** (khong dung ham SQLite nhu `strftime`, `date()`) | cung logic JS, khong doi |
| Upsert | `ON CONFLICT(...) DO UPDATE` | cung cu phap |
| JSON | `question_ids` luu dang text JSON, parse bang JS | co the doi sang `JSONB` |

## Schema

```sql
users(id INTEGER PK AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
  password_hash TEXT,               -- NULL neu chi dang nhap Google
  name TEXT, role TEXT DEFAULT 'user', target_score INTEGER DEFAULT 650,
  google_id TEXT UNIQUE, avatar_url TEXT,
  hide_on_leaderboard INTEGER DEFAULT 0, created_at TEXT)

questions(id TEXT PK, exam TEXT DEFAULT 'toeic', part INTEGER,
  passage_id TEXT, content TEXT, explanation TEXT, topic TEXT,
  difficulty TEXT,                  -- easy | medium | hard
  script TEXT,                      -- cau noi de TTS (Part 1/2) hoac script doan
  passage_text TEXT)

options(question_id TEXT, label TEXT, content TEXT, is_correct INTEGER,
  PRIMARY KEY(question_id, label))

passages(id TEXT PK, part INTEGER, title TEXT, content TEXT, script TEXT,
  type TEXT)                        -- listening | reading

vocabulary(id TEXT PK, word TEXT, phonetic TEXT, meaning TEXT,
  example TEXT, topic TEXT)

attempts(id INTEGER PK AUTOINCREMENT, user_id INTEGER, mode TEXT,
  -- mode: practice | mini | full
  part INTEGER,                     -- chi co voi mini/practice
  question_ids TEXT,                -- JSON array
  started_at TEXT, finished_at TEXT, duration_sec INTEGER,
  listening_correct INTEGER, reading_correct INTEGER,
  listening_score INTEGER, reading_score INTEGER, total_score INTEGER,
  xp_earned INTEGER, leaderboard_eligible INTEGER DEFAULT 1)

answers(attempt_id INTEGER, question_id TEXT, selected TEXT,
  is_correct INTEGER,               -- NULL = moi autosave, chua cham
  PRIMARY KEY(attempt_id, question_id))

wrong_questions(user_id INTEGER, question_id TEXT,
  wrong_count INTEGER DEFAULT 1, last_wrong_at TEXT,
  PRIMARY KEY(user_id, question_id))

user_vocabulary(user_id INTEGER, vocab_id TEXT,
  status TEXT DEFAULT 'learning',   -- learning | learned | wrong
  last_reviewed_at TEXT, PRIMARY KEY(user_id, vocab_id))

xp_events(id INTEGER PK AUTOINCREMENT, user_id INTEGER, xp INTEGER,
  reason TEXT, created_at TEXT)
-- reason: practice_correct | mock_completed | wrong_review_correct | streak_7
```

Khong co bang `test_results` rieng — ket qua thi luu trong `attempts`.

## Seed

- `data/questions.json` + `data/vocabulary.json` (do data agent tao) duoc seed khi
  bang tuong ung dang rong; chay lai khong trung lap. Neu file chua co, backend
  van chay binh thuong (chi canh bao trong log) va se seed o lan khoi dong sau
  khi file xuat hien (neu bang van rong).
- Tai khoan demo (tao neu chua co):
  - `demo@toeic.app` / `admin123` (role `admin`)
  - `user@toeic.app` / `user123` (role `user`)

## XP & streak

- XP chi **insert** dong `xp_events`, khong update counter tai cho.
  - Luyen tap dung 1 cau: `+10` (`practice_correct`)
  - Hoan thanh 1 bai thi thu: `+50` (`mock_completed`)
  - On cau sai dung: `+5` (`wrong_review_correct`)
  - Streak 7 ngay: `+100` (`streak_7`, chi 1 lan — khi streak vua cham 7 va
    chua tung nhan thuong nay)
- Streak: so ngay UTC lien tiep (tinh nguoc tu hom nay, neu hom nay chua hoc thi
  tu hom qua) ma user co it nhat 1 attempt. Tinh bang JS tu `attempts.started_at`.

## Chong gian lan bang xep hang

- Bang diem chi tinh bai thi **full** co `leaderboard_eligible = 1`, tuc la
  `duration_sec >= 600` (nop duoi 10 phut thi khong tinh). Mini test khong bao
  gio len bang diem.
- XP chi cong khi lam bai qua API.
- User bat `hide_on_leaderboard = 1` thi khong xuat hien trong `entries` (nhung
  `me` van tra ve cho chinh ho).
