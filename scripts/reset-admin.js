#!/usr/bin/env node
require('dotenv').config();

const db = require('../lib/db');
const repository = require('../models/repository');
const appMode = require('../lib/appMode');

async function main() {
  if (!db.isConfigured()) {
    console.error('❌ Define DB_HOST, DB_USER, DB_PASSWORD y DB_NAME en .env');
    process.exit(1);
  }

  const password = process.argv[2] || process.env.ADMIN_PASSWORD || 'admin123';

  try {
    await db.ping();
    await repository.migrate();
    const result = await repository.resetAdminPassword(password);
    console.log(result.created ? '✓ Admin creado' : '✓ Contraseña admin restablecida');
    console.log(`  Email: ${result.email}`);
    console.log(`  Contraseña: ${password}`);
    const base = appMode.getAdminBasePath();
    const site = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    console.log(`\nIngresa en ${site}${base}/login`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
