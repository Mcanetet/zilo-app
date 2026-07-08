#!/usr/bin/env node
require('dotenv').config();

const db = require('../lib/db');
const repository = require('../models/repository');

async function main() {
  if (!db.isConfigured()) {
    console.error('❌ Define DATABASE_URL en tu archivo .env');
    console.error('   Ejemplo: DATABASE_URL=mysql://usuario:clave@localhost:3306/u482073296_zilo_bd');
    process.exit(1);
  }

  try {
    console.log('Conectando a MySQL...');
    await db.ping();
    console.log('✓ Conexión OK');

    console.log('Aplicando esquema...');
    await repository.migrate();
    console.log('✓ Esquema listo');

    const seeded = await repository.ensureDemoData();

    const data = await repository.loadAll();
    console.log(`\nResumen:`);
    console.log(`  Usuarios:   ${data.users.length}`);
    data.users.forEach((u) => console.log(`    - ${u.email} (${u.role})`));
    console.log(`  Servicios:  ${data.services.length}`);
    console.log(`  Solicitudes: ${data.requests.length}`);
    if (seeded) {
      console.log('\n✓ Usuarios demo insertados/actualizados');
    }
    console.log('\n✅ Base de datos Fundez configurada correctamente');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
