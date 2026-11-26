const crypto = require('crypto');

// Escapa texto para meterlo de forma segura dentro de HTML.
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// "Remera Oversize 100% Algodón" -> "remera-oversize-100-algodon"
function slugify(s) {
  const out = String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return out || 'item';
}

function money(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR');
}

// Código corto y legible para los pedidos, por ejemplo ETK7M2QH (sin letras ambiguas).
function genCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'ET';
  for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return s;
}

function digits(s) {
  return String(s == null ? '' : s).replace(/\D/g, '');
}

function waLink(phone, text) {
  return 'https://wa.me/' + digits(phone) + (text ? '?text=' + encodeURIComponent(text) : '');
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Para que los errores de las rutas async lleguen al manejador de errores de Express 4.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : (def === undefined ? 0 : def);
}

function str(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 255);
}

function truncate(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Convierte un celular argentino escrito de cualquier forma al formato que pide wa.me:
// 549 + código de área + número, sin 0 ni 15. Ejemplos de entrada:
//   "3464 15 123456", "03464-15123456", "+54 9 3464 123456", "3464123456"
function arWhatsapp(phone) {
  let d = digits(phone);
  if (!d) return '';
  if (d.startsWith('549')) return d;
  if (d.startsWith('54')) return '549' + d.slice(2).replace(/^9/, '');
  d = d.replace(/^0+/, '');
  if (d.length === 12) {
    // Formato con 15 en el medio (ej.: 3464 15 123456): se saca el 15.
    for (const i of [4, 3, 2]) {
      if (d.slice(i, i + 2) === '15') { d = d.slice(0, i) + d.slice(i + 2); break; }
    }
  }
  return d.length === 10 ? '549' + d : d;
}

module.exports = { esc, slugify, money, genCode, digits, waLink, httpError, wrap, toInt, str, truncate, clamp, arWhatsapp };
