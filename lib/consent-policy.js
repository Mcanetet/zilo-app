/** Política de privacidad y consentimientos — Ley 21.719 (Chile) */
const POLICY_VERSION = '2.0-21719';

const CONSENT_DEFINITIONS = {
  terminos: {
    type: 'terminos',
    required: true,
    legalBasis: 'contrato',
    purpose: 'Aceptación de Términos y Condiciones para usar la plataforma Fundez',
    revocable: false
  },
  privacidad: {
    type: 'privacidad',
    required: true,
    legalBasis: 'consentimiento',
    purpose: 'Aceptación informada de la Política de Privacidad (Ley 21.719)',
    revocable: false
  },
  tratamiento_cuenta: {
    type: 'tratamiento_cuenta',
    required: true,
    legalBasis: 'consentimiento',
    purpose: 'Crear y administrar la cuenta, autenticación, seguridad y soporte',
    revocable: false
  },
  marketing: {
    type: 'marketing',
    required: false,
    legalBasis: 'consentimiento',
    purpose: 'Envío de novedades, promociones y comunicaciones comerciales',
    revocable: true
  },
  cookies_esenciales: {
    type: 'cookies_esenciales',
    required: true,
    legalBasis: 'interes_legitimo',
    purpose: 'Cookies estrictamente necesarias para operar la plataforma de forma segura',
    revocable: false
  },
  cookies_analiticas: {
    type: 'cookies_analiticas',
    required: false,
    legalBasis: 'consentimiento',
    purpose: 'Medición anónima de uso para mejorar la experiencia',
    revocable: true
  },
  geolocalizacion: {
    type: 'geolocalizacion',
    required: false,
    legalBasis: 'consentimiento',
    purpose: 'Compartir ubicación en tiempo real durante servicios en curso',
    revocable: true
  },
  camara: {
    type: 'camara',
    required: true,
    legalBasis: 'consentimiento',
    purpose: 'Uso de la cámara para fotografiar el servicio, verificación de identidad y registro visual del trabajo',
    revocable: true
  },
  microfono: {
    type: 'microfono',
    required: true,
    legalBasis: 'consentimiento',
    purpose: 'Uso del micrófono para comunicación de voz con clientes, socios y equipo durante los servicios',
    revocable: true
  },
  datos_sensibles_kyc: {
    type: 'datos_sensibles_kyc',
    required: false,
    legalBasis: 'consentimiento',
    purpose: 'Verificación de identidad del socio (carnet, biometría facial)',
    revocable: true
  },
  contrato_socio: {
    type: 'contrato_socio',
    required: false,
    legalBasis: 'contrato',
    purpose: 'Contrato de prestación de servicios como socio Fundez',
    revocable: false
  }
};

const REGISTRATION_CONSENT_TYPES = ['terminos', 'privacidad'];

function validateRegistrationConsents(body) {
  const missing = [];
  for (const key of REGISTRATION_CONSENT_TYPES) {
    const field = `consent_${key}`;
    if (!body[field] && body[field] !== 'on') {
      missing.push(key);
    }
  }
  if (missing.length) {
    return { errorKey: 'register.error_consents' };
  }
  return { ok: true };
}

function getRegistrationConsentPayload(body) {
  const out = REGISTRATION_CONSENT_TYPES.map((key) => ({
    type: key,
    granted: true,
    ...CONSENT_DEFINITIONS[key]
  }));

  out.push({
    type: 'tratamiento_cuenta',
    granted: true,
    ...CONSENT_DEFINITIONS.tratamiento_cuenta
  });

  if (body.consent_marketing === 'on' || body.consent_marketing === true) {
    out.push({ type: 'marketing', granted: true, ...CONSENT_DEFINITIONS.marketing });
  } else {
    out.push({ type: 'marketing', granted: false, ...CONSENT_DEFINITIONS.marketing });
  }
  return out;
}

module.exports = {
  POLICY_VERSION,
  CONSENT_DEFINITIONS,
  REGISTRATION_CONSENT_TYPES,
  validateRegistrationConsents,
  getRegistrationConsentPayload
};
