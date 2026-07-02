const mysql = require('mysql2/promise');

let pool = null;

function getConfig() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  const user = process.env.DB_USER || process.env.MYSQL_USER;
  const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;
  const password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';

  if (host && user && database) {
    return {
      host,
      port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
      timezone: 'Z'
    };
  }

  return null;
}

function isConfigured() {
  return Boolean(getConfig());
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL || '';
}

function getPool() {
  if (!isConfigured()) {
    throw new Error(
      'Base de datos no configurada. En Hostinger añade DATABASE_URL o DB_HOST, DB_USER, DB_PASSWORD y DB_NAME en Environment Variables.'
    );
  }
  if (!pool) {
    pool = mysql.createPool(getConfig());
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return { rows };
}

async function ping() {
  const result = await query('SELECT 1 AS ok');
  return Number(result.rows[0]?.ok) === 1;
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  query,
  ping,
  close,
  isConfigured,
  getDatabaseUrl
};
