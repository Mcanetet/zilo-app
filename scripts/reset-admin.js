#!/usr/bin/env node
require('dotenv').config();

const db = require('../lib/db');
const repository = require('../models/repository');

async function main() {
  if (!db.isConfigured()) {
    console.error('❌ Define DB_HOST, DB_USER, DB_PASSWORD y DB_NAME en .env');
    process.exit(1);
  }

  const password = process.argv[2] || process.env.ADMIN_PASSWORD || 'admin123';
  const cfg = repository.getAdminSeedConfig();

  try {
    await db.ping();
    await repository.migrate();
    const result = await repository.resetAdminPassword(password);
    console.log(result.created ? '✓ Admin creado' : '✓ Contraseña admin restablecida');
    console.log(`  Email: ${result.email}`);
    console.log(`  Contraseña: ${password}`);
    console.log('\nIngresa en /admin/login');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
