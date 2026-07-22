#!/usr/bin/env node
/**
 * Genera zilo-hostinger.zip listo para subir en hPanel (sin node_modules ni secretos).
 * Uso: node scripts/create-deploy-zip.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'zilo-hostinger.zip');

const excludes = [
  'node_modules/*',
  '.git/*',
  '.env',
  './.env',
  'data/backups/*',
  'data/backup-config.json',
  'zilo-hostinger.zip',
  '.DS_Store',
  'public/uploads/providers/*',
  'public/uploads/requests/*'
];

const args = excludes.map((e) => `-x "${e}"`).join(' ');

process.chdir(root);
if (fs.existsSync(out)) fs.unlinkSync(out);

execSync(`zip -r zilo-hostinger.zip . ${args}`, {
  stdio: 'inherit',
  shell: '/bin/bash'
});

// macOS zip a veces incluye .env aunque esté en -x; forzar exclusión
try {
  execSync('zip -d zilo-hostinger.zip .env ./.env', { stdio: 'ignore', shell: '/bin/bash' });
} catch (_) { /* no estaba */ }

const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`\n✅ Creado: ${out} (${size} MB)`);
console.log('Sube este ZIP en Hostinger → Node.js Web Apps → Upload files');
