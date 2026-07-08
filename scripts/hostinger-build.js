const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '../data'),
  path.join(__dirname, '../data/backups'),
  path.join(__dirname, '../public/uploads/providers')
];

dirs.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
console.log('Fundez build OK — carpetas de datos listas');
