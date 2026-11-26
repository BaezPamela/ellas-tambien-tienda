const mysql = require('mysql2/promise');
const cfg = require('./config');

const base = {
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true
};

const pool = mysql.createPool(Object.assign({}, cfg.db, base));

// Argentina no usa horario de verano: se fija -03:00 en cada conexión para que NOW(), CURDATE()
// y las fechas guardadas coincidan con la hora local aunque el servidor (Railway) esté en UTC.
if (pool.pool && typeof pool.pool.on === 'function') {
  pool.pool.on('connection', function (conn) { conn.query("SET time_zone = '-03:00'"); });
}

// Devuelve todas las filas (o el resultado de un INSERT/UPDATE).
async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Devuelve la primera fila o null.
async function one(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Ejecuta varias consultas en una transacción. Si algo falla, se deshace todo.
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignorar */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, tx };
