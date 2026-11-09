'use strict';

/**
 * index.js — entrypoint backend Phase 1 TOEIC.
 *
 * Khoi dong: tao bang neu chua co, seed cau hoi/tu vung (neu file seed co san)
 * + 2 tai khoan demo, roi mo HTTP server.
 *
 * Env (xem .env.example):
 *   PORT (mac dinh 4000), JWT_SECRET, DATABASE_PATH, GOOGLE_CLIENT_ID,
 *   GOOGLE_CLIENT_SECRET, CORS_ORIGIN (mac dinh http://localhost:5173)
 */

const express = require('express');
const cors = require('cors');
const { seedAll } = require('./seed');

const PORT = parseInt(process.env.PORT, 10) || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '5mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'app_toeic', time: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
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

app.listen(PORT, () => {
  console.log(`app_toeic backend listening on http://localhost:${PORT}`);
});

module.exports = app;
