const mysql = require('mysql2/promise');

let pool = null;

function getConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
      timezone: 'Z'
    };
  }

  const user = process.env.MYSQL_USER;
  const database = process.env.MYSQL_DATABASE;
  if (!user || !database) return null;

  return {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user,
    password: process.env.MYSQL_PASSWORD || '',
    database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    timezone: 'Z'
  };
}

function isConfigured() {
  return Boolean(getConfig());
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL || '';
}

function getPool() {
  if (!isConfigured()) {
    throw new Error('DATABASE_URL o MYSQL_USER/MYSQL_DATABASE no están configurados');
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
