const mysql = require('mysql2/promise');

let pool = null;

function buildPoolConfig(base) {
  return {
    ...base,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    timezone: 'Z',
    connectTimeout: 15000
  };
}

function getConfig() {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      return buildPoolConfig({
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, '')
      });
    } catch {
      return buildPoolConfig({ uri: process.env.DATABASE_URL });
    }
  }

  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  const user = process.env.DB_USER || process.env.MYSQL_USER;
  const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;
  const password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';

  if (host && user && database) {
    return buildPoolConfig({
      host,
      port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
      user,
      password,
      database
    });
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
      'Base de datos no configurada. En Hostinger añade DB_HOST, DB_USER, DB_PASSWORD y DB_NAME.'
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

// Protocolo de texto (no preparado). Necesario para DDL como CREATE/ALTER
// con llaves foráneas, que algunos servidores rechazan vía execute().
async function raw(sql) {
  const [rows] = await getPool().query(sql);
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
  raw,
  ping,
  close,
  isConfigured,
  getDatabaseUrl
};
