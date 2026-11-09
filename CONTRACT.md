# CONTRACT — App TOEIC Phase 1 (shared by backend / frontend / data agents)

Read the plans in ~/workspace/your_files/ke-hoach-chi-tiet-giai-doan-1-toeic.md first.
TOEIC only. No IELTS. UI in Vietnamese, questions in English.

## Repo layout (~/workspace/app_toeic)
```
README.md, .gitignore (must ignore node_modules, backend/data/*.db, backend/.env, frontend/.env)
backend/  package.json, src/index.js, src/db.js, src/scoring.js, src/auth.js, src/routes.js (or split), src/seed.js, .env.example
frontend/ Vite React+TS app (src/App.tsx, src/api.ts, src/pages/*.tsx, public/manifest.webmanifest, public/sw.js)
data/     questions.json, vocabulary.json   (seed files, committed)
docs/     database.md (schema), api.md (endpoints)
```

## Database — SQLite for local/demo, Postgres-ready
- ONE db module only: `backend/src/db.js`. All SQL lives there (or in query helpers it exports). NO raw SQL in routes.
- Standard SQL only, Postgres-compatible schema: use INTEGER / TEXT / REAL / TIMESTAMP types, `SERIAL`-free (use INTEGER PRIMARY KEY AUTOINCREMENT in SQLite — note in docs/database.md the Postgres equivalent is SERIAL/BIGSERIAL), avoid SQLite-only functions (no `strftime` tricks in app logic; store ISO-8601 text timestamps, compute dates in JS).
- DB path from env `DATABASE_PATH`, default `backend/data/app.db`. Never commit the live .db file (gitignore it).
- Backend must create tables on startup if missing and seed from `data/questions.json` + `data/vocabulary.json` when tables are empty, plus demo accounts:
  - admin: demo@toeic.app / admin123 (role admin)
  - user: user@toeic.app / user123 (role user)
- Tables:
  - users(id INTEGER PK AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT, name TEXT, role TEXT DEFAULT 'user', target_score INTEGER DEFAULT 650, google_id TEXT UNIQUE, avatar_url TEXT, hide_on_leaderboard INTEGER DEFAULT 0, created_at TEXT)
  - questions(id TEXT PK, exam TEXT DEFAULT 'toeic', part INTEGER, passage_id TEXT, content TEXT, explanation TEXT, topic TEXT, difficulty TEXT, script TEXT, passage_text TEXT)
  - options(question_id TEXT, label TEXT, content TEXT, is_correct INTEGER, PRIMARY KEY(question_id,label))
  - passages(id TEXT PK, part INTEGER, title TEXT, content TEXT, script TEXT, type TEXT)
  - vocabulary(id TEXT PK, word TEXT, phonetic TEXT, meaning TEXT, example TEXT, topic TEXT)
  - attempts(id INTEGER PK AUTOINCREMENT, user_id INTEGER, mode TEXT, part INTEGER, question_ids TEXT, started_at TEXT, finished_at TEXT, duration_sec INTEGER, listening_correct INTEGER, reading_correct INTEGER, listening_score INTEGER, reading_score INTEGER, total_score INTEGER, xp_earned INTEGER, leaderboard_eligible INTEGER DEFAULT 1)
  - answers(attempt_id INTEGER, question_id TEXT, selected TEXT, is_correct INTEGER, PRIMARY KEY(attempt_id,question_id))
  - wrong_questions(user_id INTEGER, question_id TEXT, wrong_count INTEGER DEFAULT 1, last_wrong_at TEXT, PRIMARY KEY(user_id,question_id))
  - user_vocabulary(user_id INTEGER, vocab_id TEXT, status TEXT DEFAULT 'learning', last_reviewed_at TEXT, PRIMARY KEY(user_id,vocab_id))
  - xp_events(id INTEGER PK AUTOINCREMENT, user_id INTEGER, xp INTEGER, reason TEXT, created_at TEXT)
  - test_results are stored in attempts (no separate table needed; keep attempts as the record).
- XP events (insert rows, never update a counter in place): practice correct +10, mock completed +50, 7-day streak +100 (award once when streak hits 7, check in JS), wrong-question review correct +5.
- Streak: distinct UTC dates with any attempt/answer; compute in JS from attempts/answers dates.

## Scoring (backend/src/scoring.js)
- Per section (Listening Parts 1-4 = 100 max in a full test, Reading Parts 5-7 = 100 max): correct count 0..100 -> section score 5..495 via a monotonic reference table with linear interpolation between ~20 anchor points (document as public-reference estimate, NOT official ETS). Total = listening + reading (10..990). Label everywhere "điểm ước lượng".
- For a mini test (single Part), report correct/total per Part and an estimated section score only when the Part set covers a full section — otherwise report raw correct/total and no 10-990 total. Frontend must show that honestly.

## API (base /api, JSON, Bearer JWT; secret JWT_SECRET env, default dev-secret-change-me)
- GET /health -> {ok:true, service:"app_toeic", time:"..."}  (no /api prefix)
- POST /api/auth/register {name,email,password} -> {token,user}
- POST /api/auth/login {email,password} -> {token,user}
- POST /api/auth/google {idToken} -> verify with google-auth-library + GOOGLE_CLIENT_ID env; if GOOGLE_CLIENT_ID unset return 501 {error:"google_not_configured"}; link by email to existing account (set google_id), else create user (no password)
- POST /api/auth/change-password (auth) {currentPassword,newPassword}
- GET /api/auth/me (auth)
- PATCH /api/users/me (auth) {name?,targetScore?,hideOnLeaderboard?}
- GET /api/parts -> [{part, count, listening|reading}]
- GET /api/questions?part=&limit=50&offset=0&search= -> questions WITHOUT correct answer / explanation in the payload (fields: id,part,passageId,passageTitle,passageText,script,content,options[{label,content}],topic,difficulty). Never leak is_correct in list/detail GETs.
- GET /api/questions/:id (same redaction)
- GET /api/passages/:id
- POST /api/practice/answer (auth) {questionId,selected} -> {correct, correctLabel, explanation, transcript, xpAwarded} ; records answer, wrong_questions upsert, XP +10 if correct.
- POST /api/tests (auth) {mode:"mini"|"full", part?, durationMinutes?} -> {attemptId, questionIds:[...], durationSec, startedAt}. mini: questions of one Part (default 10, max = bank size for that Part). full: all bank questions ordered Part 1..7 (seed bank is ~210-260, so full test = whole bank; timer default 7200s; durationMinutes param is for smoke-testing only, frontend always uses 120 min). Store question_ids JSON.
- POST /api/tests/:id/answers (auth) {questionId,selected} -> autosave (upsert answers row; do NOT grade yet)
- POST /api/tests/:id/submit (auth) -> grades all saved answers, fills attempts + test scores, XP +50, leaderboard_eligible = duration_sec >= 600 ? 1 : 0 for full tests (mini tests never count for score board, only XP). Returns {listeningCorrect,readingCorrect,listeningScore,readingScore,totalScore,byPart, wrongQuestionIds, xpAwarded, leaderboardEligible}
- GET /api/tests/:id/result (auth, owner or admin)
- GET /api/tests/history (auth)
- GET /api/wrong-questions?part= (auth) -> questions redacted + wrongCount
- POST /api/wrong-questions/:questionId/review (auth) {selected} -> {correct,...}; if correct delete row + XP +5
- GET /api/vocabulary?topic=&limit=100 (auth)
- POST /api/vocabulary/:id/mark (auth) {status:"learning"|"learned"|"wrong"}
- GET /api/stats/overview (auth) -> {totalAnswered,totalCorrect,accuracy,byPart:[{part,answered,correct,accuracy}],weakestPart,streakDays,targetScore,totalXp,recentScores:[{date,totalScore}]}
- GET /api/stats/history (auth) -> recent attempts
- GET /api/leaderboard?metric=score|xp&tab=week|month|all (auth) -> {entries:[{rank,name,avatarUrl,score,xp,answered}], me:{rank,score,xp}|null}. Score board: best full-test totalScore per user in period, eligible only. XP board: SUM xp_events in period. Hide users with hide_on_leaderboard=1 (show as "Người dùng ẩn danh" only if they are me? Simpler: exclude hidden users from public entries, but me is still returned in `me`). Top 3 flagged by rank in frontend.
- Admin (requireAdmin middleware, 403 for users):
  - GET /api/admin/questions?part=&limit=&offset= (returns WITH correct + explanation for editing)
  - POST /api/admin/questions, PUT /api/admin/questions/:id, DELETE /api/admin/questions/:id
  - POST /api/admin/questions/import {questions:[seed-format objects]} -> validate each (4 options, exactly 1 correct, explanation present); return {imported, errors:[{index,reason}]}; skip invalid rows, never half-insert a bad row.
  - GET/POST/PUT/DELETE /api/admin/vocabulary (same pattern), POST /api/admin/vocabulary/import {items:[...]}
  - GET /api/admin/backup (admin) -> downloads JSON {exportedAt, questions, vocabulary, usersCount, attemptsCount} — the backup export. Do NOT include password hashes in the export.
- Errors: JSON {error:"..."} with proper status codes (400 validation, 401 unauth, 403 forbidden, 404 not found, 501 google_not_configured).

## Seed data format (data/questions.json, data/vocabulary.json)
- Question: {id:"P5-001", part:5, passageId:null| "P3-01", passageTitle?, passageText?, script?, content:"...", options:[{label:"A",content:"..."},...4 items], correct:"A", explanation:"... (tiếng Việt, ngắn)", topic:"...", difficulty:"easy|medium|hard"}
- Part 1: content = description of a picture in words, e.g. "Mô tả tranh: ..." + script = the spoken sentence to be read by TTS. Part 2: content = question text, script = same as content (spoken). Part 3/4: passageText = conversation/talk script (also used as script for TTS), 3 questions share passageId. Part 6: passageText = paragraph with blanks marked ____ (n). Part 7: passageText = reading passage, 2-3 questions share passageId.
- Vocabulary: {id:"V001", word, phonetic, meaning (tiếng Việt), example (English sentence), topic}
- Counts target: >=210 questions, >=20 per Part, >=150 vocabulary. Real correct English only, no duplicated questions with changed numbers.

## Frontend (frontend/, Vite React+TS)
- Pages (simple routing, react-router-dom ok): Login/Register, Home, Practice (choose Part + count), PracticeSession (1 question at a time, TTS play/pause/replay via window.speechSynthesis, rate control, submit -> show correct/explanation/transcript only after answering), MockTest (mini/full, timer countdown, autosave on each answer, submit once, auto-submit on timeout), Result, WrongQuestions, Vocabulary (list by topic + flashcards flip + mark learned/wrong), Stats, Leaderboard (2 boards, Week/Month/All-time tabs, top 3 highlighted, own rank pinned), Admin (questions/vocab CRUD + JSON import textarea/file), Settings (target score, hide on leaderboard, change password).
- Google login: @react-oauth/google GoogleLogin button, VITE_GOOGLE_CLIENT_ID env; if unset, show button disabled with note "Chưa cấu hình Google OAuth — xem README". Send credential (idToken) to POST /api/auth/google.
- TTS: use speechSynthesis, lang en-US, label everywhere "Âm thanh đọc bằng giọng máy (TTS)". Play the question script (Part 1/2) or passage script (Part 3/4). Stop on unmount / next question.
- API client: src/api.ts with token in localStorage, base URL from VITE_API_URL (default http://localhost:4000).
- PWA: public/manifest.webmanifest + public/sw.js (cache app shell), register in main.tsx; icons: generate a simple SVG icon (no external assets needed).
- Mobile-first CSS (no heavy UI lib needed; plain CSS is fine, keep it clean).
- Vite proxy or CORS: backend must enable CORS for the Vite dev origin (http://localhost:5173).

## Env examples
- backend/.env.example: PORT=4000, JWT_SECRET=change-me, DATABASE_PATH=./data/app.db, GOOGLE_CLIENT_ID=, GOOGLE_CLIENT_SECRET=
- frontend/.env.example: VITE_API_URL=http://localhost:4000, VITE_GOOGLE_CLIENT_ID=

## README (root)
Must include: how to run (exact commands), demo accounts, seed counts (filled in at the end, honest), TTS note, Google OAuth setup steps, scoring = estimate note, Deploy section (see task follow-up: SQLite limits, persistent disk, VPS/Render/Fly.io, frontend on Vercel, Postgres migration path via DATABASE_URL as future step, backup via admin export endpoint + copying the .db file).
