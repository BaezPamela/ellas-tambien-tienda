const cfg = require('../config');
const { query } = require('../db');

let cache = null;
let cachedAt = 0;

// Datos del local: valores por defecto + lo guardado en la base. Se cachea 30 segundos.
async function getSettings(force) {
  if (!force && cache && Date.now() - cachedAt < 30000) return cache;
  const rows = await query('SELECT setting_key AS k, setting_value AS v FROM settings');
  const s = Object.assign({}, cfg.defaultSettings);
  rows.forEach((r) => {
    if (Object.prototype.hasOwnProperty.call(s, r.k)) s[r.k] = r.v == null ? '' : r.v;
  });
  cache = s;
  cachedAt = Date.now();
  return s;
}

async function saveSettings(input) {
  const keys = Object.keys(cfg.defaultSettings);
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(input, k)) continue;
    const v = String(input[k] == null ? '' : input[k]).trim().slice(0, 2000);
    await query(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [k, v]
    );
  }
  return getSettings(true);
}

module.exports = { getSettings, saveSettings };
