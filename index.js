require('dotenv').config();

console.log('=== Fundez arrancando ===');
console.log('Node:', process.version);
console.log('PORT:', process.env.PORT || '(default 3000)');
console.log('DB_HOST:', process.env.DB_HOST || '(no definido)');
console.log('DB_NAME:', process.env.DB_NAME || '(no definido)');

require('./app.js');
