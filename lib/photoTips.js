'use strict';

/**
 * Tutoriales opcionales de foto por especialidad (cliente).
 * Se muestran solo si el usuario pide ayuda.
 */

const TIPS = {
  es: {
    electrico: {
      title: 'Cómo fotografiar un problema eléctrico',
      steps: [
        'Enfoca el tablero, enchufe, luminaria o punto exacto con falla.',
        'Si hay una etiqueta o modelo en el equipo, inclúyelo en la foto.',
        'No toques cables ni abras tableros energizados: solo fotografía.'
      ],
      notes: 'En el detalle escribe qué ocurre (saltó el diferencial, no hay luz en una zona, olor a quemado, etc.).'
    },
    gasfiter: {
      title: 'Cómo fotografiar un problema de gásfitería',
      steps: [
        'Saca de cerca la marca del sanitario, llave, flexible o grifería.',
        'Muestra el lugar exacto de la filtración (unión, sello, cañería, piso o muro mojado).',
        'Si hay agua acumulada, incluye un poco de contexto del baño o cocina.'
      ],
      notes: 'En el detalle indica marca, modelo si lo ves, y desde cuándo filtra.'
    },
    cerrajero: {
      title: 'Cómo fotografiar un problema de cerrajería',
      steps: [
        'Fotografía la chapa o cerradura de cerca (cilindro, manilla y frente).',
        'Si puedes, muestra también la puerta completa para ver el marco.',
        'Evita flash fuerte de frente: busca luz natural o lateral.'
      ],
      notes: 'En el detalle escribe el tipo de puerta (madera, metal, vidrio, principal, interior) y si la llave gira, se trabó o se perdió.'
    },
    termos: {
      title: 'Cómo fotografiar un termo',
      steps: [
        'Saca el termo completo y la zona de conexiones.',
        'Incluye la placa o etiqueta con marca y modelo si es visible.',
        'Si filtra, enfoca el punto de agua; si no calienta, muestra el panel o piloto.'
      ],
      notes: 'En el detalle indica si no calienta, filtra, hace ruido o muestra error.'
    },
    lavadora: {
      title: 'Cómo fotografiar una lavadora',
      steps: [
        'Fotografía la marca y el modelo (etiqueta o frente).',
        'Muestra el problema: agua en el piso, display con error, tambor o mangueras.',
        'Si hay código de error en pantalla, que se lea claro.'
      ],
      notes: 'En el detalle escribe la marca, el síntoma y en qué ciclo falla.'
    },
    lavavajillas: {
      title: 'Cómo fotografiar un lavavajillas',
      steps: [
        'Saca la marca/modelo y la puerta abierta o el display.',
        'Si filtra, muestra de dónde sale el agua; si no lava, el interior y aspersores.',
        'Incluye cualquier código de error visible.'
      ],
      notes: 'En el detalle indica marca, síntoma y si queda agua adentro o no termina el ciclo.'
    },
    calderas: {
      title: 'Cómo fotografiar una caldera de edificio',
      steps: [
        'Fotografía la caldera completa y el panel de control.',
        'Si hay luces, alarmas o códigos, que se lean en la imagen.',
        'Muestra válvulas o zona con filtración si aplica.'
      ],
      notes: 'En el detalle indica edificio/ubicación, síntoma y si afecta agua caliente o calefacción.'
    },
    generadores: {
      title: 'Cómo fotografiar un generador',
      steps: [
        'Saca el generador completo y su placa de marca/modelo.',
        'Muestra el panel, arranque o zona con falla visible.',
        'Si hay humo, aceite o cables sueltos, fotografía sin acercarte demasiado.'
      ],
      notes: 'En el detalle indica si no parte, no carga, hace ruido o corta, y las horas de uso si las conoces.'
    },
    default: {
      title: 'Consejos para una buena foto',
      steps: [
        'Foto 1 — problema: enfoca de cerca, con buena luz y sin mover el celular.',
        'Foto 2 — marca: etiqueta, placa o logo del equipo (para repuestos).',
        'Si no hay marca visible, marca la casilla «Sin marca a la vista».'
      ],
      notes: 'En el detalle describe qué ves y qué falla exactamente.'
    }
  },
  en: {
    electrico: {
      title: 'How to photograph an electrical issue',
      steps: [
        'Focus on the panel, outlet, fixture or exact failure point.',
        'If a brand/model label is visible, include it in the photo.',
        'Do not touch wires or open live panels — photo only.'
      ],
      notes: 'In the details, write what happens (breaker trips, no power in one area, burnt smell, etc.).'
    },
    gasfiter: {
      title: 'How to photograph a plumbing issue',
      steps: [
        'Take a close-up of the fixture brand (toilet, faucet, hose).',
        'Show the exact leak point (joint, seal, pipe, wet floor or wall).',
        'If there is standing water, include a bit of room context.'
      ],
      notes: 'In the details, add brand/model if visible and since when it leaks.'
    },
    cerrajero: {
      title: 'How to photograph a locksmith issue',
      steps: [
        'Photograph the lock up close (cylinder, handle and faceplate).',
        'If possible, also show the full door and frame.',
        'Avoid harsh front flash; use natural or side light.'
      ],
      notes: 'In the details, write the door type (wood, metal, glass, main, interior) and whether the key turns, jammed or was lost.'
    },
    termos: {
      title: 'How to photograph a water heater',
      steps: [
        'Show the full heater and connection area.',
        'Include the brand/model plate if visible.',
        'If it leaks, focus on the drip; if it won’t heat, show the panel or pilot.'
      ],
      notes: 'In the details, say if it won’t heat, leaks, makes noise or shows an error.'
    },
    lavadora: {
      title: 'How to photograph a washing machine',
      steps: [
        'Photograph the brand and model (label or front).',
        'Show the issue: water on the floor, error display, drum or hoses.',
        'If there is an error code, make sure it is readable.'
      ],
      notes: 'In the details, write brand, symptom and which cycle fails.'
    },
    lavavajillas: {
      title: 'How to photograph a dishwasher',
      steps: [
        'Show brand/model and the open door or display.',
        'If it leaks, show where water comes from; if it won’t wash, the interior/spray arms.',
        'Include any visible error code.'
      ],
      notes: 'In the details, add brand, symptom and if water remains inside or the cycle won’t finish.'
    },
    calderas: {
      title: 'How to photograph a building boiler',
      steps: [
        'Photograph the full boiler and control panel.',
        'If there are lights, alarms or codes, make them readable.',
        'Show valves or the leak area if relevant.'
      ],
      notes: 'In the details, add location, symptom and whether hot water or heating is affected.'
    },
    generadores: {
      title: 'How to photograph a generator',
      steps: [
        'Show the full generator and brand/model plate.',
        'Photograph the panel, starter or visible fault area.',
        'If there is smoke, oil or loose cables, keep a safe distance.'
      ],
      notes: 'In the details, say if it won’t start, won’t load, is noisy or cuts out, and runtime hours if known.'
    },
    default: {
      title: 'Tips for a good photo',
      steps: [
        'Photo 1 — problem: close-up, good light, steady phone.',
        'Photo 2 — brand: label, plate or logo (for spare parts).',
        'If no brand is visible, check «No brand visible».'
      ],
      notes: 'In the details, describe exactly what you see and what fails.'
    }
  }
};

const IMAGE_BY_SERVICE = {
  electrico: '/img/photo-tips/photo-tip-electrico.jpg',
  gasfiter: '/img/photo-tips/photo-tip-gasfiter.jpg',
  cerrajero: '/img/photo-tips/photo-tip-cerrajero.jpg',
  termos: '/img/photo-tips/photo-tip-termos.jpg',
  lavadora: '/img/photo-tips/photo-tip-lavadora.jpg',
  lavavajillas: '/img/photo-tips/photo-tip-lavavajillas.jpg',
  calderas: '/img/photo-tips/photo-tip-calderas.jpg',
  generadores: '/img/photo-tips/photo-tip-generadores.jpg'
};

function getPhotoTips(serviceId, locale = 'es') {
  const lang = locale === 'en' ? 'en' : 'es';
  const pack = TIPS[lang] || TIPS.es;
  const tip = pack[serviceId] || pack.default;
  const brandStep = lang === 'en'
    ? 'Upload a separate brand photo (label/logo), or check «No brand visible».'
    : 'Sube aparte la foto de la marca (etiqueta/logo), o marca «Sin marca a la vista».';
  const steps = [...(tip.steps || [])];
  if (!steps.some((s) => /marca|brand|Sin marca|No brand/i.test(s))) {
    steps.push(brandStep);
  }
  return {
    ...tip,
    steps,
    imageUrl: IMAGE_BY_SERVICE[serviceId] || null,
    imageAlt: tip.title
  };
}

module.exports = { getPhotoTips, TIPS, IMAGE_BY_SERVICE };
