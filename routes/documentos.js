const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const store = require('../models/store');
const { requireRole } = require('../middleware/auth');
const { getVoucherFilePath } = require('../lib/voucher');

const DTE_DIR = path.join(__dirname, '../data/dte');

function canAccessDocument(req, request) {
  if (!request) return false;
  if (req.session.user?.role === 'admin') return true;
  if (req.session.user?.role === 'client' && request.clientId === req.session.user.id) return true;
  if (req.session.user?.role === 'provider' && request.providerId === req.session.user.id) return true;
  if (req.session.user?.role === 'tecnico' && request.technicianId === req.session.user.id) return true;
  return false;
}

router.get('/comprobantes/:voucherId', (req, res) => {
  if (!store.isReady()) {
    return res.status(503).render('error', { title: 'Cargando…', message: 'Espera unos segundos.', code: 503 });
  }

  const voucherId = req.params.voucherId;
  const request = store.getAllRequests().find((r) =>
    Array.isArray(r.vouchers) && r.vouchers.some((v) => v.id === voucherId)
  );
  const doc = request?.vouchers?.find((v) => v.id === voucherId);

  if (!doc || !canAccessDocument(req, request)) {
    return res.status(404).render('error', {
      title: 'Comprobante no encontrado',
      message: 'No tienes acceso a este comprobante de pago.',
      code: 404
    });
  }

  const filePath = getVoucherFilePath(voucherId);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  return res.status(404).render('error', {
    title: 'Archivo no disponible',
    message: 'El comprobante aún no está generado.',
    code: 404
  });
});

router.get('/factura-socio/:requestId', (req, res) => {
  const request = store.getAllRequests().find((item) => item.id === req.params.requestId);
  const invoice = request?.providerInvoicePlan;
  if (!invoice?.filePath || invoice.status !== 'issued' || !canAccessDocument(req, request)) {
    return res.status(404).render('error', {
      title: 'Documento no encontrado',
      message: 'La factura o boleta del socio aún no está disponible.',
      code: 404
    });
  }
  const allowedRoot = path.resolve(path.join(__dirname, '../data/provider-invoices'));
  const filePath = path.resolve(invoice.filePath);
  if (!filePath.startsWith(`${allowedRoot}${path.sep}`) || !fs.existsSync(filePath)) {
    return res.status(404).render('error', {
      title: 'Archivo no disponible',
      message: 'No se encontró el archivo de la factura.',
      code: 404
    });
  }
  res.type(invoice.mimeType || 'application/pdf');
  return res.sendFile(filePath);
});

router.get('/tributarios/:docId', (req, res) => {
  if (!store.isReady()) {
    return res.status(503).render('error', { title: 'Cargando…', message: 'Espera unos segundos.', code: 503 });
  }

  const docId = req.params.docId;
  const request = store.getAllRequests().find((r) =>
    Array.isArray(r.dteDocuments) && r.dteDocuments.some((d) => d.id === docId)
  );
  const doc = request?.dteDocuments?.find((d) => d.id === docId);

  if (!doc || !canAccessDocument(req, request)) {
    return res.status(404).render('error', {
      title: 'Documento no encontrado',
      message: 'No tienes acceso a este documento tributario.',
      code: 404
    });
  }

  const filePath = path.join(DTE_DIR, `${docId}.html`);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  return res.status(404).render('error', {
    title: 'Archivo no disponible',
    message: 'El documento aún no está generado o expiró.',
    code: 404
  });
});

router.get('/solicitud/:requestId', requireRole('client', 'admin'), (req, res) => {
  const request = store.getAllRequests().find((r) => r.id === req.params.requestId);
  if (!request || (req.session.user.role === 'client' && request.clientId !== req.session.user.id)) {
    return res.status(404).render('error', { title: 'No encontrado', message: 'Solicitud no encontrada.', code: 404 });
  }

  res.json({
    documents: request.dteDocuments || []
  });
});

module.exports = router;
