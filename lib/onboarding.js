function getClientOnboardingSteps() {
  return [
    {
      target: '[data-tour="welcome"]',
      title: 'Tu espacio en Fundez',
      body: 'Desde aquí ves tu saludo, créditos y acceso rápido a tu perfil. Todo tu hogar, en un solo lugar.'
    },
    {
      target: '[data-tour="passport"]',
      title: 'Pasaporte Hogar',
      body: 'El historial técnico de tu vivienda. Cada servicio suma puntaje de salud y registros de mantenimiento.'
    },
    {
      target: '[data-tour="promos"]',
      title: 'Beneficios y promos',
      body: 'Descuentos de bienvenida, regalar visitas a familiares y otras promociones activas para ti.'
    },
    {
      target: '[data-tour="points"]',
      title: 'Puntos y referidos',
      body: 'Ganas puntos en cada servicio y $5.000 por cada amigo que invites. Canjéalos al pagar.'
    },
    {
      target: '[data-tour="services"]',
      title: 'Solicita un servicio',
      body: 'Elige gásfiter, eléctrico, cerrajero u otro. Ingresa la dirección, paga la visita y sigue al técnico en vivo.'
    },
    {
      target: '[data-tour="nav"]',
      title: 'Navegación principal',
      body: 'Hogar: pasaporte · Invitar: referidos · Historial: servicios pasados · Perfil: tus datos.'
    },
    {
      target: '[data-tour="concierge"]',
      title: 'Concierge WhatsApp',
      body: '¿Necesitas ayuda durante un servicio? Escríbenos por WhatsApp en cualquier momento.'
    }
  ];
}

function getProviderOnboardingSteps({ hasVerificationBanner = false } = {}) {
  const steps = [
    {
      target: '[data-tour="welcome"]',
      title: 'Panel del técnico',
      body: 'Bienvenido a Fundez Pro. Aquí gestionas tu disponibilidad, trabajos y reputación profesional.'
    }
  ];

  if (hasVerificationBanner) {
    steps.push({
      target: '[data-tour="verification"]',
      title: 'Verificación obligatoria',
      body: 'Antes de trabajar debes subir tu carnet, verificar tu rostro y activar la ubicación. Los clientes verán tus sellos de confianza.'
    });
  }

  steps.push(
    {
      target: '[data-tour="online"]',
      title: 'Modo en línea',
      body: 'Activa este interruptor para recibir solicitudes. Tienes 15 segundos para aceptar cada trabajo nuevo.'
    },
    {
      target: '[data-tour="stats"]',
      title: 'Tu reputación',
      body: 'Tu rating y reseñas mejoran tu visibilidad. Mantén un buen servicio para destacar en nuevas asignaciones.'
    },
    {
      target: '[data-tour="specialties"]',
      title: 'Tus especialidades',
      body: 'Solo recibirás trabajos de las categorías que Fundez te asignó. Si necesitas ampliarlas, contacta soporte.'
    },
    {
      target: '[data-tour="history"]',
      title: 'Historial de trabajos',
      body: 'Revisa servicios recientes y su estado. Tras aceptar, actualiza: En camino → Completar.'
    },
    {
      target: '[data-tour="profile"]',
      title: 'Perfil y verificación',
      body: 'Edita teléfono, correo, documentos y verificación facial. Mantén todo actualizado para ir en línea.'
    }
  );

  return steps;
}

module.exports = { getClientOnboardingSteps, getProviderOnboardingSteps };
