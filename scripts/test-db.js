/**
 * Prueba de conexión a MySQL. Uso: node scripts/test-db.js
 * Intenta conectar con DB_HOST, 127.0.0.1 y localhost, e informa cuál funciona.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const base = {
    user: process.env.DB_USER || process.env.MYSQL_USER,
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE,
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    connectTimeout: 8000
  };

  console.log('=== Prueba de conexión MySQL (Fundez) ===');
  console.log('Usuario :', base.user || '(no definido)');
  console.log('Base    :', base.database || '(no definido)');
  console.log('Puerto  :', base.port);
  console.log('Clave   :', base.password ? '(definida)' : '(vacía)');
  console.log('DB_HOST :', process.env.DB_HOST || '(no definido)');
  console.log('-----------------------------------------');

  const hosts = [process.env.DB_HOST, '127.0.0.1', 'localhost']
    .filter((h, i, arr) => h && arr.indexOf(h) === i);

  let exito = null;
  for (const host of hosts) {
    const started = Date.now();
    try {
      const conn = await mysql.createConnection({ ...base, host });
      await conn.query('SELECT 1');
      let usuarios = 'n/a';
      try {
        const [rows] = await conn.query('SELECT COUNT(*) AS c FROM users');
        usuarios = rows[0].c;
      } catch (e) {
        usuarios = `sin tabla users (${e.code})`;
      }
      await conn.end();
      console.log(`✅ host "${host}" OK en ${Date.now() - started}ms — usuarios: ${usuarios}`);
      if (!exito) exito = host;
    } catch (err) {
      console.log(`❌ host "${host}" falló en ${Date.now() - started}ms — ${err.code || ''} ${err.message}`);
    }
  }

  console.log('-----------------------------------------');
  if (exito) {
    console.log(`➡️  Usa DB_HOST=${exito} en las variables de entorno y redeploya.`);
    process.exit(0);
  } else {
    console.log('➡️  Ningún host conectó. Verifica usuario, contraseña y nombre de la base.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
