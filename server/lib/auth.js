const jwt = require('jsonwebtoken');
const cfg = require('../config');
const { one } = require('../db');

const COOKIE = 'et_token';

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, cfg.jwtSecret, { expiresIn: '12h' });
}

// La sesión viaja en una cookie httpOnly (el JavaScript de la página no puede leerla).
// SameSite=Lax evita que otro sitio dispare acciones del panel con tu sesión.
function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.isProd,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE];
    if (!token) return res.status(401).json({ error: 'No iniciaste sesión' });
    const payload = jwt.verify(token, cfg.jwtSecret);
    const user = await one('SELECT id, name, email, role, active FROM users WHERE id = ?', [payload.id]);
    if (!user || !user.active) return res.status(401).json({ error: 'Usuario inactivo' });
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ error: 'La sesión venció. Iniciá sesión de nuevo.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tenés permiso para hacer esto' });
    }
    next();
  };
}

// Bloquea las rutas de funciones que no están en el paquete contratado.
function requireFeature(name) {
  return (req, res, next) => {
    if (!cfg.features[name]) {
      return res.status(404).json({ error: 'Esta función no está incluida en el paquete contratado' });
    }
    next();
  };
}

module.exports = { signToken, setSessionCookie, clearSessionCookie, requireAuth, requireRole, requireFeature };
