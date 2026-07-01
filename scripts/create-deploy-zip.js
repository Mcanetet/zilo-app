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
  'node_modules',
  '.git',
  '.env',
  'data/backups',
  'data/backup-config.json',
  'zilo-hostinger.zip',
  '.DS_Store'
];

const args = excludes.map((e) => `-x "${e}/*"`).join(' ');

process.chdir(root);
if (fs.existsSync(out)) fs.unlinkSync(out);

execSync(`zip -r zilo-hostinger.zip . ${args} -x "public/uploads/providers/*"`, {
  stdio: 'inherit',
  shell: '/bin/bash'
});

const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`\n✅ Creado: ${out} (${size} MB)`);
console.log('Sube este ZIP en Hostinger → Node.js Web Apps → Upload files');
