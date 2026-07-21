const notifications = require('./notifications');
const dte = require('./dte');
const voucher = require('./voucher');
const company = require('../config/company');
const { computeRequestFinancials } = require('./pricing');
const { formatPayDate } = require('./payoutSchedule');

let getStore;

function init(store) {
  getStore = () => store;
  notifications.bindStore(store);
}

function ctx(request) {
  const store = getStore();
  const client = store.getUserById(request.clientId);
  const provider = request.providerId ? store.getUserById(request.providerId) : null;
  return {
    request,
    client,
    provider,
    amount: request.visitPricePaid || request.amountDue || 0
  };
}

function emit(event, request, extra = {}) {
  if (!getStore) return;
  const base = ctx(request);
  notifications.sendEvent(event, { ...base, ...extra }).catch((err) => {
    console.error(`[notifications] ${event}:`, err.message);
  });
}

function attachDteDocument(request, document) {
  if (!request.dteDocuments) request.dteDocuments = [];
  request.dteDocuments.push(document);
  const store = getStore();
  store.repository.persist(() => store.repository.saveRequest(request), `dte ${request.id}`);
}

function attachVoucher(request, doc) {
  if (!request.vouchers) request.vouchers = [];
  request.vouchers.push(doc);
  request.paymentVoucherId = doc.id;
  request.paymentVoucherUrl = doc.url;
  const store = getStore();
  store.repository.persist(() => store.repository.saveRequest(request), `voucher ${request.id}`);
}

/**
 * 1) Comprobante de pago inmediato (voucher) → email al cliente.
 * 2) Boleta/factura electrónica (DTE/SII) → email de facturación (stub o LibreDTE).
 */
async function issuePaymentDocuments(request) {
  const store = getStore();
  if (!store) return;
  const client = store.getUserById(request.clientId);
  const amount = request.visitPricePaid || request.amountDue || 0;

  const vResult = voucher.issuePaymentVoucher({ request, client, amount });
  if (vResult.voucher && !vResult.existing) {
    attachVoucher(request, vResult.voucher);
  }
  if (vResult.voucher) {
    const voucherUrl = `${company.appUrl}${vResult.voucher.url}`;
    await notifications.sendEvent('payment.voucher', {
      request,
      client,
      amount: vResult.voucher.amount,
      voucherCode: vResult.voucher.code,
      voucherUrl,
      to: client?.email || vResult.voucher.clientEmail
    }).catch((err) => console.error('[voucher] email:', err.message));
  } else if (vResult.error) {
    console.error('[voucher]', vResult.error);
  }

  // En modelo split, el DTE se define al cierre: Fundez documenta su margen
  // y el socio emite su parte con su propio RUT.
  if (process.env.SPLIT_INVOICING !== 'false') {
    return { voucher: vResult.voucher || null, dte: { pendingCompletion: true } };
  }

  // Modelo legado: Fundez documenta el cobro completo.
  if (!request.billingSnapshot) {
    console.warn(`[dte] solicitud ${request.id}: sin billingSnapshot; se omite DTE hasta completar facturación`);
    return { voucher: vResult.voucher || null, dte: { error: 'Sin datos de facturación' } };
  }

  const dteResult = await issueDte(request, {
    phase: 'visit',
    amount,
    description: `Visita técnica — ${request.serviceName}`
  });
  return { voucher: vResult.voucher || null, dte: dteResult };
}

async function issueDte(request, { phase, amount, description }) {
  const billing = request.billingSnapshot;
  if (!billing) return { error: 'Sin datos de facturación' };
  const existing = request.dteDocuments?.find((doc) => doc.phase === phase && doc.status === 'issued');
  if (existing) return { document: existing, existing: true };

  const result = await dte.issueDocument({
    request,
    billing,
    amount,
    phase,
    description
  });

  if (result.error) {
    console.error(`[dte] ${phase}:`, result.error);
    return result;
  }

  attachDteDocument(request, result.document);

  const store = getStore();
  const client = store.getUserById(request.clientId);
  const invoiceEmail = billing.invoiceEmail || client?.email;
  notifications.sendEvent('dte.issued', {
    request,
    client,
    docKind: result.document.kind,
    folio: result.document.folio,
    amount: result.document.amount,
    pdfUrl: result.document.pdfUrl,
    to: invoiceEmail
  }).catch(() => {});

  return result;
}

module.exports = {
  init,
  onPaymentApproved(request) {
    emit('payment.approved', request);
    issuePaymentDocuments(request).catch((err) => {
      console.error('[payment-docs]', err.message);
    });
  },
  onTransferPending(request) {
    emit('payment.transfer_pending', request);
  },
  onServiceSearching(request) {
    const store = getStore();
    const providers = store.getOnlineProviders(request.serviceId);
    providers.forEach((provider) => {
      notifications.sendEvent('service.searching', {
        request,
        client: store.getUserById(request.clientId),
        provider,
        amount: request.visitPricePaid || request.amountDue || 0,
        to: provider.email,
        phone: provider.phone
      }).catch(() => {});
    });
  },
  onProviderAssigned(request) {
    emit('service.assigned', request);
    const store = getStore();
    const provider = request.providerId ? store.getUserById(request.providerId) : null;
    if (provider?.email) {
      notifications.sendEvent('provider.job_assigned', {
        ...ctx(request),
        to: provider.email,
        phone: provider.phone
      }).catch(() => {});
    }
  },
  onTechnicianAssigned(request) {
    emit('technician.assigned', request);
    const store = getStore();
    const technician = request.technicianId ? store.getUserById(request.technicianId) : null;
    if (technician?.email) {
      notifications.sendEvent('technician.job_assigned', {
        ...ctx(request),
        to: technician.email,
        phone: technician.phone
      }).catch(() => {});
    }
  },
  onTechnicianEnRoute(request) {
    emit('technician.en_route', request);
  },
  onTechnicianArrived(request) {
    emit('technician.arrived', request);
  },
  onTechnicianOnSite(request) {
    emit('technician.on_site', request);
  },
  onBudgetSent(request, amount) {
    emit('budget.sent', request, { amount });
  },
  onBudgetResponded(request, { approved, amount, pendingPayment = false } = {}) {
    const store = getStore();
    const provider = request.providerId ? store.getUserById(request.providerId) : null;
    const technician = request.technicianId ? store.getUserById(request.technicianId) : null;
    const recipients = [provider, technician].filter((u) => u?.email);
    const event = approved ? 'budget.approved' : 'budget.rejected';
    recipients.forEach((user) => {
      notifications.sendEvent(event, {
        ...ctx(request),
        amount,
        pendingPayment,
        to: user.email,
        phone: user.phone
      }).catch(() => {});
    });
    if (!approved) {
      emit('budget.rejected_client', request, { amount });
    }
  },
  onActivityChangeProposed(request, change) {
    emit('activity.change_proposed', request, {
      amount: change?.proposedTotal,
      activityName: change?.toActivityName,
      fromActivityName: change?.fromActivityName
    });
  },
  onActivityChangeResolved(request, change, { approved, pendingPayment = false } = {}) {
    const store = getStore();
    const provider = request.providerId ? store.getUserById(request.providerId) : null;
    const technician = request.technicianId ? store.getUserById(request.technicianId) : null;
    [provider, technician].filter((u) => u?.email).forEach((user) => {
      notifications.sendEvent('activity.change_resolved', {
        ...ctx(request),
        approved,
        pendingPayment,
        amount: change?.proposedTotal,
        activityName: change?.toActivityName,
        fromActivityName: change?.fromActivityName,
        to: user.email,
        phone: user.phone
      }).catch(() => {});
    });
  },
  onAdditionalPaymentApproved(request, charge) {
    const store = getStore();
    const provider = request.providerId ? store.getUserById(request.providerId) : null;
    const technician = request.technicianId ? store.getUserById(request.technicianId) : null;
    emit('payment.additional_approved', request, {
      amount: charge?.amountDue || 0,
      description: charge?.description
    });
    [provider, technician].filter((u) => u?.email).forEach((user) => {
      notifications.sendEvent('payment.additional_provider', {
        ...ctx(request),
        amount: charge?.amountDue || 0,
        description: charge?.description,
        to: user.email,
        phone: user.phone
      }).catch(() => {});
    });
  },
  onMaterialAdded(request, material) {
    emit('material.added', request, {
      amount: material?.amount || 0,
      description: material?.description
    });
  },
  onRefundRequested(request) {
    emit('service.cancelled_refund', request, {
      amount: request.visitPricePaid || request.amountDue || 0,
      refundDate: request.refundScheduledDate
    });
  },
  onKeepSearching(request) {
    emit('service.keep_searching', request);
  },
  onPayoutPaid(request) {
    const store = getStore();
    const provider = request.providerId ? store.getUserById(request.providerId) : null;
    const fin = request.financials || computeRequestFinancials(request, store.getPricingConfig());
    if (provider?.email) {
      notifications.sendEvent('payout.paid', {
        request,
        provider,
        amount: fin.providerTotal || 0,
        paidAtLabel: new Date(request.payoutPaidAt || Date.now()).toLocaleDateString('es-CL'),
        to: provider.email
      }).catch(() => {});
    }
  },
  onServiceCompleted(request) {
    emit('service.completed', request);
    const store = getStore();
    const fin = request.financials || computeRequestFinancials(request, store.getPricingConfig());
    const client = store.getUserById(request.clientId);
    const provider = request.providerId ? store.getUserById(request.providerId) : null;

    const jobVoucher = voucher.issueJobVoucher({ request, client, provider, financials: fin });
    if (jobVoucher.voucher && !jobVoucher.existing) {
      attachVoucher(request, jobVoucher.voucher);
    }
    if (jobVoucher.voucher) {
      const voucherUrl = `${company.appUrl}${jobVoucher.voucher.url}`;
      [client?.email, provider?.email].filter(Boolean).forEach((to) => {
        notifications.sendEvent('service.job_voucher', {
          request,
          client,
          provider,
          amount: fin.grandTotal,
          voucherCode: jobVoucher.voucher.code,
          voucherUrl,
          to
        }).catch(() => {});
      });
    }

    if (provider && request.payoutScheduledDate && !request.payoutNotifiedAt) {
      request.payoutNotifiedAt = new Date().toISOString();
      store.repository.persist(() => store.repository.saveRequest(request), `aviso pago ${request.id}`);
      notifications.sendEvent('payout.scheduled', {
        request,
        provider,
        amount: fin.providerTotal,
        payDateLabel: formatPayDate(request.payoutScheduledDate),
        to: provider.email
      }).catch(() => {});
    }

    const splitInvoicing = process.env.SPLIT_INVOICING !== 'false';
    const dteAmount = splitInvoicing
      ? fin.appTotal
      : (fin?.serviceAmount || 0) + (fin?.materialsTotal || 0);
    if (dteAmount > 0) {
      issueDte(request, {
        phase: splitInvoicing ? 'fundez_margin' : 'completion',
        amount: dteAmount,
        description: splitInvoicing
          ? `Intermediación y cargos Fundez — ${request.serviceName}`
          : `Servicio y materiales — ${request.serviceName}`
      }).catch(() => {});
    }
  },
  issuePaymentDocuments,
  retryDte(requestId, phase) {
    const store = getStore();
    const request = store.getAllRequests().find((r) => r.id === requestId);
    if (!request) return { error: 'Solicitud no encontrada' };
    const fin = request.financials || computeRequestFinancials(request, store.getPricingConfig());
    let amount;
    let description;
    if (phase === 'visit') {
      amount = request.visitPricePaid || request.amountDue || 0;
      description = `Visita técnica — ${request.serviceName}`;
    } else if (phase === 'fundez_margin') {
      amount = fin.appTotal || 0;
      description = `Intermediación y cargos Fundez — ${request.serviceName}`;
    } else {
      amount = (fin.serviceAmount || 0) + (fin.materialsTotal || 0);
      description = `Servicio y materiales — ${request.serviceName}`;
    }
    return issueDte(request, { phase, amount, description });
  },
  getDteStatus: dte.getProviderStatus
};
