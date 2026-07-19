/**
 * Perfiles y permisos granulares del panel de administración Fundez.
 */

const PERMISSIONS = {
  'resumen.view': { label: 'Ver resumen', group: 'Panel' },
  'finanzas.view': { label: 'Ver finanzas', group: 'Operaciones' },
  'finanzas.export': { label: 'Exportar finanzas', group: 'Operaciones' },
  'pagos.view': { label: 'Ver pagos', group: 'Operaciones' },
  'pagos.manage': { label: 'Gestionar pagos y transferencias', group: 'Operaciones' },
  'solicitudes.view': { label: 'Ver solicitudes en búsqueda', group: 'Operaciones' },
  'solicitudes.manage': { label: 'Canalizar solicitudes a socios', group: 'Operaciones' },
  'proveedores.view': { label: 'Ver socios', group: 'Operaciones' },
  'reclamos.view': { label: 'Ver reclamos', group: 'Operaciones' },
  'reclamos.manage': { label: 'Resolver reclamos', group: 'Operaciones' },
  'modulos.view': { label: 'Ver módulos', group: 'Plataforma' },
  'modulos.manage': { label: 'Activar/desactivar módulos', group: 'Plataforma' },
  'promos.view': { label: 'Ver promociones', group: 'Plataforma' },
  'promos.manage': { label: 'Crear y editar códigos promocionales', group: 'Plataforma' },
  'cobertura.view': { label: 'Ver cobertura territorial', group: 'Plataforma' },
  'cobertura.manage': { label: 'Gestionar cobertura por comuna', group: 'Plataforma' },
  'servicios.view': { label: 'Ver servicios', group: 'Plataforma' },
  'servicios.manage': { label: 'Activar/desactivar servicios', group: 'Plataforma' },
  'demo.view': { label: 'Ver cuentas demo', group: 'Plataforma' },
  'demo.manage': { label: 'Gestionar cuentas demo', group: 'Plataforma' },
  'whatsapp.view': { label: 'Ver WhatsApp', group: 'Plataforma' },
  'documentos.view': { label: 'Ver DTE / SII', group: 'Cumplimiento' },
  'documentos.manage': { label: 'Reemitir documentos', group: 'Cumplimiento' },
  'contratos.view': { label: 'Ver contratos de socios', group: 'Cumplimiento' },
  'contratos.review': { label: 'Revisar y aprobar contratos', group: 'Cumplimiento' },
  'notificaciones.view': { label: 'Ver notificaciones', group: 'Cumplimiento' },
  'datos.view': { label: 'Ver datos y consentimientos', group: 'Sistema' },
  'backups.view': { label: 'Ver backups', group: 'Sistema' },
  'backups.manage': { label: 'Crear y configurar backups', group: 'Sistema' },
  'backups.restore': { label: 'Restaurar backups', group: 'Sistema' },
  'seguridad.view': { label: 'Ver seguridad y auditoría', group: 'Sistema' },
  'seguridad.mfa': { label: 'Configurar MFA propio', group: 'Sistema' },
  'precios.view': { label: 'Ver precios', group: 'Sistema' },
  'precios.manage': { label: 'Editar precios', group: 'Sistema' },
  'equipo.view': { label: 'Ver equipo admin', group: 'Administración' },
  'equipo.manage': { label: 'Crear y editar administradores', group: 'Administración' },
  'aland.view': { label: 'Ver Aland IA', group: 'Plataforma' },
  'aland.manage': { label: 'Configurar Aland IA', group: 'Plataforma' },
  'mensajes.view': { label: 'Ver mensajes', group: 'Operaciones' },
  'mensajes.manage': { label: 'Responder mensajes', group: 'Operaciones' }
};

const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS);

const PROFILES = {
  superadmin: {
    id: 'superadmin',
    name: 'Superadministrador',
    description: 'Acceso total al panel, incluyendo equipo y restauración de backups.',
    permissions: ALL_PERMISSION_KEYS,
    isSuperAdmin: true
  },
  operaciones: {
    id: 'operaciones',
    name: 'Operaciones',
    description: 'Finanzas, pagos, socios, reclamos y comunicación.',
    permissions: [
      'resumen.view', 'finanzas.view', 'finanzas.export', 'pagos.view', 'pagos.manage',
      'solicitudes.view', 'solicitudes.manage',
      'proveedores.view', 'reclamos.view', 'reclamos.manage', 'whatsapp.view',
      'modulos.view', 'servicios.view', 'demo.view', 'notificaciones.view',
      'cobertura.view', 'cobertura.manage', 'promos.view', 'promos.manage',
      'contratos.view', 'contratos.review', 'aland.view', 'mensajes.view', 'mensajes.manage'
    ]
  },
  finanzas: {
    id: 'finanzas',
    name: 'Finanzas',
    description: 'Centro financiero, pagos y documentos tributarios.',
    permissions: [
      'resumen.view', 'finanzas.view', 'finanzas.export', 'pagos.view', 'pagos.manage',
      'documentos.view', 'documentos.manage', 'proveedores.view',
      'contratos.view', 'contratos.review'
    ]
  },
  soporte: {
    id: 'soporte',
    name: 'Soporte',
    description: 'Reclamos, WhatsApp y cuentas demo.',
    permissions: [
      'resumen.view', 'reclamos.view', 'reclamos.manage', 'whatsapp.view',
      'demo.view', 'notificaciones.view', 'datos.view', 'contratos.view',
      'solicitudes.view', 'solicitudes.manage',
      'aland.view', 'mensajes.view', 'mensajes.manage'
    ]
  },
  auditor: {
    id: 'auditor',
    name: 'Auditor (solo lectura)',
    description: 'Consulta sin modificar configuración ni datos sensibles.',
    permissions: ALL_PERMISSION_KEYS.filter((k) => k.endsWith('.view') && k !== 'equipo.view')
  }
};

/** Navegación lateral agrupada — id coincide con data-panel del dashboard */
const ADMIN_NAV = [
  {
    group: 'Panel',
    groupKey: 'panel',
    items: [
      { id: 'resumen', label: 'Resumen', perm: 'resumen.view', icon: 'grid' }
    ]
  },
  {
    group: 'Operaciones',
    groupKey: 'operations',
    items: [
      { id: 'finanzas', label: 'Finanzas', perm: 'finanzas.view', icon: 'chart' },
      { id: 'pagos', label: 'Pagos', perm: 'pagos.view', icon: 'card' },
      { id: 'solicitudes', label: 'Solicitudes', perm: 'solicitudes.view', icon: 'wrench' },
      { id: 'proveedores', label: 'Socios', perm: 'proveedores.view', icon: 'users' },
      { id: 'reclamos', label: 'Reclamos', perm: 'reclamos.view', icon: 'alert' },
      { id: 'mensajes', label: 'Mensajes', perm: 'mensajes.view', icon: 'inbox' }
    ]
  },
  {
    group: 'Plataforma',
    groupKey: 'platform',
    items: [
      { id: 'modulos', label: 'Módulos', perm: 'modulos.view', icon: 'blocks' },
      { id: 'promos', label: 'Promociones', perm: 'promos.view', icon: 'chart' },
      { id: 'cobertura', label: 'Cobertura', perm: 'cobertura.view', icon: 'map' },
      { id: 'servicios', label: 'Servicios', perm: 'servicios.view', icon: 'wrench' },
      { id: 'demo', label: 'Cuentas demo', perm: 'demo.view', icon: 'flask' },
      { id: 'whatsapp', label: 'WhatsApp', perm: 'whatsapp.view', icon: 'chat' },
      { id: 'aland', label: 'Aland IA', perm: 'aland.view', icon: 'blocks' }
    ]
  },
  {
    group: 'Cumplimiento',
    groupKey: 'compliance',
    items: [
      { id: 'documentos', label: 'DTE / SII', perm: 'documentos.view', icon: 'doc' },
      { id: 'contratos', label: 'Contratos socios', perm: 'contratos.view', icon: 'shield' },
      { id: 'notificaciones', label: 'Notificaciones', perm: 'notificaciones.view', icon: 'bell' }
    ]
  },
  {
    group: 'Sistema',
    groupKey: 'system',
    items: [
      { id: 'datos', label: 'Datos', perm: 'datos.view', icon: 'database' },
      { id: 'backups', label: 'Backups', perm: 'backups.view', icon: 'archive' }
    ]
  },
  {
    group: 'Administración',
    groupKey: 'administration',
    items: [
      { id: 'equipo', label: 'Equipo y permisos', perm: 'equipo.view', icon: 'shield' },
      { id: 'seguridad', label: 'Seguridad', perm: 'seguridad.view', icon: 'lock' }
    ]
  }
];

const PANEL_DEFAULT_PERM = {
  resumen: 'resumen.view',
  finanzas: 'finanzas.view',
  documentos: 'documentos.view',
  contratos: 'contratos.view',
  notificaciones: 'notificaciones.view',
  modulos: 'modulos.view',
  promos: 'promos.view',
  cobertura: 'cobertura.view',
  servicios: 'servicios.view',
  demo: 'demo.view',
  pagos: 'pagos.view',
  solicitudes: 'solicitudes.view',
  proveedores: 'proveedores.view',
  reclamos: 'reclamos.view',
  mensajes: 'mensajes.view',
  whatsapp: 'whatsapp.view',
  aland: 'aland.view',
  datos: 'datos.view',
  backups: 'backups.view',
  seguridad: 'seguridad.view',
  equipo: 'equipo.view'
};

function normalizeAdminAccess(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const profileId = raw.profileId || raw.profile || 'custom';
  const profile = PROFILES[profileId];
  const isSuperAdmin = Boolean(raw.isSuperAdmin || profile?.isSuperAdmin);
  let permissions = Array.isArray(raw.permissions) ? [...raw.permissions] : [];

  if (isSuperAdmin) {
    permissions = [...ALL_PERMISSION_KEYS];
  } else if (permissions.length === 0 && profile) {
    permissions = [...profile.permissions];
  }

  permissions = [...new Set(permissions.filter((p) => PERMISSIONS[p]))];
  return {
    profileId: isSuperAdmin ? 'superadmin' : profileId,
    permissions,
    isSuperAdmin
  };
}

function resolveAdminAccess(user) {
  if (!user || user.role !== 'admin') {
    return { profileId: null, permissions: [], isSuperAdmin: false };
  }

  const normalized = normalizeAdminAccess(user.adminAccess);
  if (normalized) return normalized;

  // Compatibilidad: admin existente sin perfil = superadmin
  if (user.id === 'admin-1' || user.email === 'admin@fundez.cl') {
    return normalizeAdminAccess({ profileId: 'superadmin', isSuperAdmin: true });
  }

  return normalizeAdminAccess({ profileId: 'operaciones' });
}

function hasPermission(access, permission) {
  if (!access) return false;
  if (access.isSuperAdmin) return true;
  return access.permissions.includes(permission);
}

function hasAnyPermission(access, permissions) {
  return permissions.some((p) => hasPermission(access, p));
}

function trOr(tr, key, fallback) {
  const v = tr(key);
  return !v || v === key ? fallback : v;
}

function getNavForAccess(access, t) {
  const tr = typeof t === 'function' ? t : (key) => key;
  return ADMIN_NAV.map((section) => ({
    group: trOr(tr, `admin.nav.group.${section.groupKey}`, section.group),
    items: section.items
      .filter((item) => hasPermission(access, item.perm))
      .map((item) => ({
        ...item,
        label: trOr(tr, `admin.nav.${item.id}`, item.label)
      }))
  })).filter((section) => section.items.length > 0);
}

function getPermissionGroups() {
  const groups = {};
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    if (!groups[meta.group]) groups[meta.group] = [];
    groups[meta.group].push({ key, label: meta.label });
  }
  return groups;
}

function getProfilesList() {
  return Object.values(PROFILES).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    permissions: p.permissions
  }));
}

function permissionsFromBody(body) {
  const raw = body.permissions;
  if (Array.isArray(raw)) return raw.filter((p) => PERMISSIONS[p]);
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map((s) => s.trim()).filter((p) => PERMISSIONS[p]);
  }
  const profileId = body.profileId || body.profile;
  if (profileId && PROFILES[profileId]) return [...PROFILES[profileId].permissions];
  return [];
}

function canAccessPanel(access, panelId) {
  const perm = PANEL_DEFAULT_PERM[panelId];
  return perm ? hasPermission(access, perm) : false;
}

function getFirstAccessiblePanel(access) {
  for (const section of ADMIN_NAV) {
    for (const item of section.items) {
      if (hasPermission(access, item.perm)) return item.id;
    }
  }
  return 'resumen';
}

module.exports = {
  PERMISSIONS,
  ALL_PERMISSION_KEYS,
  PROFILES,
  ADMIN_NAV,
  PANEL_DEFAULT_PERM,
  normalizeAdminAccess,
  resolveAdminAccess,
  hasPermission,
  hasAnyPermission,
  getNavForAccess,
  getPermissionGroups,
  getProfilesList,
  permissionsFromBody,
  canAccessPanel,
  getFirstAccessiblePanel
};
