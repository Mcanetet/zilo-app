#!/usr/bin/env node
/**
 * Imprime la URL de ingreso al admin según ADMIN_PATH del .env
 * Uso: node scripts/print-admin-url.js
 *      node scripts/print-admin-url.js --suggest
 */
require('dotenv').config();
const appMode = require('../lib/appMode');

const site = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const base = appMode.getAdminBasePath();

if (process.argv.includes('--suggest')) {
  const suggested = appMode.suggestAdminPath();
  console.log('Sugerencia para .env / Hostinger:\n');
  console.log(`ADMIN_PATH=${suggested}`);
  console.log(`\nLogin: ${site}${suggested}/login`);
  console.log('\nGuarda este enlace solo en tu gestor de contraseñas. No lo publiques ni lo enlaces desde la web.');
  process.exit(0);
}

console.log(`ADMIN_PATH actual: ${base}`);
console.log(`Login: ${site}${base}/login`);
if (base === '/admin') {
  console.log('\n⚠ /admin es predecible. Genera uno secreto con:');
  console.log('  node scripts/print-admin-url.js --suggest');
}
