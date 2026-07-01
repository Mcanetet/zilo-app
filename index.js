/**
 * Punto de entrada Hostinger — debe importar express aquí para detección automática.
 */
require('dotenv').config();

const express = require('express');
if (!express) {
  throw new Error('Express no disponible');
}

require('./app.js');
