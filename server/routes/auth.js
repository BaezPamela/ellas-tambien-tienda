'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { one } = require('../db');
const { wrap, httpError } = require('../lib/util');
const { signToken, setSessionCookie, clearSessionCookie, requireAuth } = require('../lib/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' }
});

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

router.post('/login', loginLimiter, wrap(async function (req, res) {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const user = await one('SELECT id, name, email, role, active, password_hash FROM users WHERE email = ?', [email]);
  const ok = user && user.active && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw httpError(401, 'Correo o contraseña incorrectos');
  setSessionCookie(res, signToken(user));
  res.json({ user: publicUser(user) });
}));

router.post('/logout', function (req, res) {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, function (req, res) {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
