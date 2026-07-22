const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '../data'),
  path.join(__dirname, '../data/backups'),
  path.join(__dirname, '../public/uploads/providers'),
  path.join(__dirname, '../public/uploads/requests'),
  path.join(__dirname, '../public/uploads/marketing')
];

dirs.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
console.log('Fundez build OK — carpetas de datos listas');
