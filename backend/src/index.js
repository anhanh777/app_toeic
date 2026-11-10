'use strict';

/**
 * index.js — entrypoint backend Phase 1 TOEIC.
 *
 * Khoi dong: tao bang neu chua co, seed cau hoi/tu vung (neu file seed co san)
 * + 2 tai khoan demo, roi mo HTTP server.
 *
 * Env (xem .env.example):
 *   PORT (mac dinh 4000; Render tu dat PORT), JWT_SECRET, DATABASE_PATH,
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *   FRONTEND_URL (URL frontend khi deploy, vd https://app-toeic.vercel.app;
 *     co the ghi nhieu URL, cach nhau bang dau phay),
 *   CORS_ORIGIN (tuong tu FRONTEND_URL, de tuong thich nguoc).
 * CORS cho phep: http://localhost:5173 + http://127.0.0.1:5173 (dev)
 *   + cac URL trong FRONTEND_URL / CORS_ORIGIN (prod).
 */

const express = require('express');
const cors = require('cors');
const { seedAll } = require('./seed');

const PORT = parseInt(process.env.PORT, 10) || 4000;

const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
for (const v of [process.env.FRONTEND_URL, process.env.CORS_ORIGIN]) {
  if (v) {
    for (const o of v.split(',')) {
      const origin = o.trim();
      if (origin) allowedOrigins.add(origin);
    }
  }
}

const app = express();
app.use(
  cors({
    origin: (origin, cb) => {
      // Request khong co Origin (curl, Postman, health check) thi cho qua.
      if (!origin || allowedOrigins.has(origin)) cb(null, true);
      else cb(null, false);
    },
  })
);
app.use(express.json({ limit: '5mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'app_toeic', time: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api', require('./routes/testsets'));
app.use('/api', require('./routes/aiParse'));
app.use('/api', require('./routes/media'));
app.use('/api', require('./routes/questions'));
app.use('/api', require('./routes/practice'));
app.use('/api', require('./routes/tests'));
app.use('/api', require('./routes/wrong'));
app.use('/api', require('./routes/vocab'));
app.use('/api', require('./routes/stats'));
app.use('/api', require('./routes/leaderboard'));
app.use('/api', require('./routes/admin'));

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

// Seed truoc khi lang nghe (tao bang + demo user; file seed co the chua co).
try {
  seedAll();
} catch (err) {
  console.error('[startup] seed loi:', err.message);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`app_toeic backend listening on 0.0.0.0:${PORT}`);
});

module.exports = app;
