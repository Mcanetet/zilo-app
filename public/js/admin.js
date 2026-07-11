(function () {
  const dashboard = document.getElementById('adminDashboard');
  if (!dashboard) return;

  const PANEL_TITLES = {
    resumen: 'Resumen',
    finanzas: 'Finanzas',
    documentos: 'DTE / SII',
    contratos: 'Contratos socios',
    notificaciones: 'Notificaciones',
    modulos: 'Módulos',
    servicios: 'Servicios',
    demo: 'Cuentas demo',
    pagos: 'Pagos',
    proveedores: 'Socios',
    reclamos: 'Reclamos',
    whatsapp: 'WhatsApp',
    datos: 'Datos',
    backups: 'Backups',
    equipo: 'Equipo y permisos',
    seguridad: 'Seguridad'
  };

  const tabs = document.querySelectorAll('.admin-nav-item');
  const panels = document.querySelectorAll('.admin-panel');
  const panelTitle = document.getElementById('adminPanelTitle');
  const sidebar = document.getElementById('adminSidebar');
  const backdrop = document.getElementById('adminSidebarBackdrop');
  const menuBtn = document.getElementById('adminMenuBtn');

  function closeSidebar() {
    sidebar?.classList.remove('is-open');
    backdrop?.classList.remove('is-open');
  }

  function openSidebar() {
    sidebar?.classList.add('is-open');
    backdrop?.classList.add('is-open');
  }

  menuBtn?.addEventListener('click', () => {
    if (sidebar?.classList.contains('is-open')) closeSidebar();
    else openSidebar();
  });
  backdrop?.addEventListener('click', closeSidebar);

  function activateTab(id) {
    tabs.forEach(t => {
      t.classList.toggle('admin-nav-item-active', t.dataset.tab === id);
    });
    panels.forEach(p => p.classList.toggle('hidden', p.dataset.panel !== id));
    if (panelTitle && PANEL_TITLES[id]) panelTitle.textContent = PANEL_TITLES[id];
    closeSidebar();
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.replaceState({}, '', url.pathname + url.search);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });

  const initialTab = new URLSearchParams(window.location.search).get('tab')
    || dashboard.dataset.initialTab
    || null;
  if (initialTab && document.querySelector(`.admin-nav-item[data-tab="${initialTab}"]`)) {
    activateTab(initialTab);
  } else if (tabs.length) {
    activateTab(tabs[0].dataset.tab);
  }

  document.querySelectorAll('.admin-goto-tab').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  /* ——— Equipo admin ——— */
  const profilesScript = document.getElementById('adminProfilesData');
  const teamScript = document.getElementById('adminTeamData');
  const adminProfiles = profilesScript ? JSON.parse(profilesScript.textContent || '[]') : [];
  const adminTeam = teamScript ? JSON.parse(teamScript.textContent || '[]') : [];
  const teamFormWrap = document.getElementById('adminTeamFormWrap');
  const teamForm = document.getElementById('adminTeamForm');
  const profileSelect = document.getElementById('adminFormProfile');
  const superCheckbox = document.getElementById('adminFormSuper');
  const permInputs = document.querySelectorAll('.admin-perm-input');
  const checklist = document.getElementById('adminPermissionsChecklist');

  function applyProfileToChecklist(profileId) {
    const profile = adminProfiles.find(p => p.id === profileId);
    permInputs.forEach(input => {
      input.checked = profile ? profile.permissions.includes(input.value) : false;
    });
  }

  function setChecklistDisabled(disabled) {
    permInputs.forEach(input => { input.disabled = disabled; });
    if (checklist) checklist.classList.toggle('opacity-50', disabled);
  }

  profileSelect?.addEventListener('change', () => {
    if (superCheckbox?.checked) return;
    if (profileSelect.value === 'custom') {
      setChecklistDisabled(false);
      return;
    }
    applyProfileToChecklist(profileSelect.value);
    setChecklistDisabled(false);
  });

  superCheckbox?.addEventListener('change', () => {
    if (superCheckbox.checked) {
      permInputs.forEach(input => { input.checked = true; });
      setChecklistDisabled(true);
    } else {
      setChecklistDisabled(false);
      if (profileSelect?.value && profileSelect.value !== 'custom') {
        applyProfileToChecklist(profileSelect.value);
      }
    }
  });

  function resetTeamForm() {
    teamForm?.reset();
    document.getElementById('adminFormId').value = '';
    document.getElementById('adminFormTitle').textContent = 'Nuevo administrador';
    document.getElementById('adminFormSubmit').textContent = 'Crear administrador';
    document.getElementById('adminFormEmail').disabled = false;
    document.getElementById('adminFormPassword').required = true;
    document.getElementById('adminFormPasswordHint').textContent = '';
    applyProfileToChecklist(profileSelect?.value || 'operaciones');
    setChecklistDisabled(false);
    teamFormWrap?.classList.add('hidden');
  }

  document.getElementById('btnNewAdmin')?.addEventListener('click', () => {
    resetTeamForm();
    teamFormWrap?.classList.remove('hidden');
    applyProfileToChecklist('operaciones');
    teamFormWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('adminFormCancel')?.addEventListener('click', resetTeamForm);

  document.querySelectorAll('.btn-edit-admin').forEach(btn => {
    btn.addEventListener('click', () => {
      const member = adminTeam.find(m => m.id === btn.dataset.id);
      if (!member) return;

      document.getElementById('adminFormId').value = member.id;
      document.getElementById('adminFormTitle').textContent = 'Editar administrador';
      document.getElementById('adminFormSubmit').textContent = 'Guardar cambios';
      document.getElementById('adminFormName').value = member.name || '';
      document.getElementById('adminFormEmail').value = member.email || '';
      document.getElementById('adminFormEmail').disabled = true;
      document.getElementById('adminFormPassword').required = false;
      document.getElementById('adminFormPasswordHint').textContent = 'Deja vacío para mantener la contraseña actual.';

      if (profileSelect) {
        profileSelect.value = member.isSuperAdmin ? 'superadmin' : (member.profileId || 'custom');
      }

      permInputs.forEach(input => {
        input.checked = member.permissions.includes(input.value);
      });

      if (superCheckbox) {
        superCheckbox.checked = Boolean(member.isSuperAdmin);
        setChecklistDisabled(Boolean(member.isSuperAdmin));
      }

      teamFormWrap?.classList.remove('hidden');
      teamFormWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  teamForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const adminId = document.getElementById('adminFormId').value;
    const permissions = [...permInputs].filter(i => i.checked).map(i => i.value);
    const body = {
      name: document.getElementById('adminFormName').value,
      profileId: profileSelect?.value === 'custom' ? 'custom' : profileSelect?.value,
      permissions,
      isSuperAdmin: superCheckbox?.checked || false
    };
    const password = document.getElementById('adminFormPassword').value;
    if (password) body.password = password;

    try {
      let res;
      if (adminId) {
        res = await fetch(`/admin/team/${adminId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } else {
        body.email = document.getElementById('adminFormEmail').value;
        if (!password) {
          FundezNotify.show('La contraseña es obligatoria para nuevos administradores', 'error');
          return;
        }
        res = await fetch('/admin/team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }
      const data = await res.json();
      if (data.success) {
        FundezNotify.show(adminId ? 'Administrador actualizado' : 'Administrador creado', 'success');
        setTimeout(() => location.reload(), 800);
      } else {
        FundezNotify.show(data.error || 'No se pudo guardar', 'error');
      }
    } catch (_) {
      FundezNotify.show('Error de conexión', 'error');
    }
  });

  document.querySelectorAll('.admin-team-toggle').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const id = toggle.dataset.id;
      const active = toggle.checked;
      try {
        const res = await fetch(`/admin/team/${id}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active })
        });
        const data = await res.json();
        if (data.success) {
          FundezNotify.show(`Cuenta ${active ? 'activada' : 'desactivada'}`, active ? 'success' : 'warning');
        } else {
          toggle.checked = !active;
          FundezNotify.show(data.error || 'Error', 'error');
        }
      } catch (_) {
        toggle.checked = !active;
        FundezNotify.show('Error de conexión', 'error');
      }
    });
  });

  if (profileSelect && adminProfiles.length) {
    applyProfileToChecklist(profileSelect.value || 'operaciones');
  }

  async function reviewContract(id, action, extra = {}) {
    const notes = extra.notes ?? prompt(
      action === 'approve' ? 'Notas de aprobación (opcional):' :
      action === 'reject' ? 'Motivo del rechazo:' :
      action === 'needs_info' ? 'Indica qué antecedentes faltan:' :
      'Motivo de suspensión:'
    );
    if (notes === null && action !== 'approve') return;
    const body = { action, notes: notes || '', ...extra };
    if (action === 'reject' && !body.rejectionReason) body.rejectionReason = notes || 'No cumple requisitos legales.';
    try {
      const res = await fetch(`/admin/contratos/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        FundezNotify.show(
          action === 'approve' ? 'Socio aprobado para operar' :
          action === 'reject' ? 'Contrato rechazado' :
          action === 'suspend' ? 'Socio suspendido' : 'Solicitud enviada al socio',
          action === 'approve' ? 'success' : action === 'reject' ? 'warning' : 'info'
        );
        setTimeout(() => location.reload(), 800);
      } else FundezNotify.show(data.error || 'Error', 'error');
    } catch (_) {
      FundezNotify.show('Error de conexión', 'error');
    }
  }

  document.querySelectorAll('.btn-contract-approve').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('¿Aprobar expediente y activar al socio en producción?')) return;
      reviewContract(btn.dataset.id, 'approve', { notes: '' });
    });
  });
  document.querySelectorAll('.btn-contract-reject').forEach((btn) => {
    btn.addEventListener('click', () => reviewContract(btn.dataset.id, 'reject'));
  });
  document.querySelectorAll('.btn-contract-needs-info').forEach((btn) => {
    btn.addEventListener('click', () => reviewContract(btn.dataset.id, 'needs_info'));
  });
  document.querySelectorAll('.btn-contract-suspend').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('¿Suspender operación de este socio?')) return;
      reviewContract(btn.dataset.id, 'suspend');
    });
  });

  document.querySelectorAll('.service-toggle').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const serviceId = toggle.dataset.id;
      const enabled = toggle.checked;
      const item = toggle.closest('.service-toggle-item');
      const statusLabel = item.querySelector('.service-status');

      try {
        const res = await fetch('/admin/toggle-service', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceId, enabled })
        });
        const data = await res.json();
        if (data.success) {
          item.classList.toggle('opacity-50', !enabled);
          statusLabel.textContent = enabled ? 'ON' : 'OFF';
          statusLabel.className = `service-status text-[10px] font-bold uppercase ${enabled ? 'text-emerald-600' : 'text-red-600'}`;
          FundezNotify.show(`${data.service.name} ${enabled ? 'activado' : 'desactivado'}`, enabled ? 'success' : 'warning');
        }
      } catch (_) {
        toggle.checked = !enabled;
        FundezNotify.show('Error al actualizar servicio', 'error');
      }
    });
  });

  document.querySelectorAll('.demo-toggle').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const userId = toggle.dataset.id;
      const active = toggle.checked;
      const item = toggle.closest('.demo-account-item');
      const statusLabel = item.querySelector('.demo-status');

      try {
        const res = await fetch('/admin/toggle-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, active })
        });
        const data = await res.json();
        if (data.success) {
          item.classList.toggle('opacity-50', !active);
          statusLabel.textContent = active ? 'ACTIVA' : 'INACTIVA';
          statusLabel.className = `demo-status text-[10px] font-bold uppercase ${active ? 'text-emerald-600' : 'text-red-600'}`;
          FundezNotify.show(`Cuenta demo ${active ? 'activada' : 'desactivada'}`, active ? 'success' : 'warning');
        } else {
          toggle.checked = !active;
          FundezNotify.show(data.error || 'No se pudo actualizar', 'error');
        }
      } catch (_) {
        toggle.checked = !active;
        FundezNotify.show('Error al actualizar la cuenta', 'error');
      }
    });
  });

  document.querySelectorAll('.module-toggle').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const moduleId = toggle.dataset.id;
      const enabled = toggle.checked;
      const item = toggle.closest('.module-toggle-item');
      const statusLabel = item.querySelector('.module-status');

      try {
        const res = await fetch('/admin/toggle-module', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moduleId, enabled })
        });
        const data = await res.json();
        if (data.success) {
          item.classList.toggle('opacity-50', !enabled);
          statusLabel.textContent = enabled ? 'ON' : 'OFF';
          statusLabel.className = `module-status text-[10px] font-bold uppercase ${enabled ? 'text-emerald-600' : 'text-red-600'}`;
          FundezNotify.show(`${data.module.name} ${enabled ? 'activado' : 'desactivado'}`, enabled ? 'success' : 'warning');
        } else {
          toggle.checked = !enabled;
          FundezNotify.show(data.error || 'No se pudo actualizar', 'error');
        }
      } catch (_) {
        toggle.checked = !enabled;
        FundezNotify.show('Error al actualizar módulo', 'error');
      }
    });
  });

  document.querySelectorAll('.btn-complaint').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await fetch(`/admin/complaint/${btn.dataset.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: btn.dataset.status })
      });
      const data = await res.json();
      if (data.success) {
        FundezNotify.show('Reclamo actualizado', 'success');
        setTimeout(() => location.reload(), 800);
      }
    });
  });

  document.querySelectorAll('.btn-mark-payout').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await fetch(`/admin/payout/${btn.dataset.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        FundezNotify.show('Pago a proveedor registrado', 'success');
        setTimeout(() => location.reload(), 800);
      }
    });
  });

  document.querySelectorAll('.btn-approve-transfer').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await fetch(`/admin/transfer/${btn.dataset.id}/aprobar`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        FundezNotify.show('Transferencia confirmada — servicio activado', 'success');
        setTimeout(() => location.reload(), 800);
      } else {
        FundezNotify.show(data.error || 'No se pudo confirmar', 'error');
      }
    });
  });

  const socket = io();
  socket.on('services_updated', ({ services }) => {
    services.forEach(service => {
      const toggle = document.querySelector(`.service-toggle[data-id="${service.id}"]`);
      if (!toggle) return;
      toggle.checked = service.enabled;
      const item = toggle.closest('.service-toggle-item');
      const statusLabel = item.querySelector('.service-status');
      item.classList.toggle('opacity-50', !service.enabled);
      statusLabel.textContent = service.enabled ? 'ON' : 'OFF';
      statusLabel.className = `service-status text-[10px] font-bold uppercase ${service.enabled ? 'text-emerald-600' : 'text-red-600'}`;
    });
  });

  socket.on('modules_updated', ({ modules }) => {
    modules.forEach(mod => {
      const toggle = document.querySelector(`.module-toggle[data-id="${mod.id}"]`);
      if (!toggle) return;
      toggle.checked = mod.enabled;
      const item = toggle.closest('.module-toggle-item');
      const statusLabel = item.querySelector('.module-status');
      item.classList.toggle('opacity-50', !mod.enabled);
      statusLabel.textContent = mod.enabled ? 'ON' : 'OFF';
      statusLabel.className = `module-status text-[10px] font-bold uppercase ${mod.enabled ? 'text-emerald-600' : 'text-red-600'}`;
    });
  });

  const backupForm = document.getElementById('backupConfigForm');
  if (backupForm) {
    backupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(backupForm);
      const body = {
        enabled: fd.get('enabled') === 'on',
        autoBackup: fd.get('autoBackup') === 'on',
        autoRetention: fd.get('autoRetention') === 'on',
        includeUploads: fd.get('includeUploads') === 'on',
        includeSecurityLogs: fd.get('includeSecurityLogs') === 'on',
        scheduleHour: fd.get('scheduleHour'),
        scheduleMinute: fd.get('scheduleMinute'),
        dailyRetentionDays: fd.get('dailyRetentionDays'),
        weeklyRetentionWeeks: fd.get('weeklyRetentionWeeks'),
        monthlyRetentionMonths: fd.get('monthlyRetentionMonths')
      };
      const res = await fetch('/admin/backups/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        FundezNotify.show('Configuración de backups guardada', 'success');
        setTimeout(() => location.reload(), 900);
      } else FundezNotify.show(data.error || 'Error al guardar', 'error');
    });
  }

  document.getElementById('btnRunBackup')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRunBackup');
    btn.disabled = true;
    btn.textContent = 'Generando...';
    const res = await fetch('/admin/backups/run', { method: 'POST' });
    const data = await res.json();
    btn.disabled = false;
    btn.textContent = 'Generar backup ahora';
    if (data.success) {
      FundezNotify.show(`Backup creado v${data.backup.appVersion || '?'} (${data.backup.stats?.totalBytes ? Math.round(data.backup.stats.totalBytes / 1024) + ' KB' : 'ok'})`, 'success');
      setTimeout(() => location.reload(), 900);
    } else FundezNotify.show(data.error || 'Error al generar backup', 'error');
  });

  document.getElementById('btnApplyRetention')?.addEventListener('click', async () => {
    const res = await fetch('/admin/backups/retention', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      if (data.skipped) {
        FundezNotify.show(data.message || 'El historial se conserva', 'info');
        return;
      }
      FundezNotify.show(data.removed ? `${data.removed} backup(s) antiguo(s) eliminado(s)` : 'No había backups por eliminar', 'info');
      setTimeout(() => location.reload(), 900);
    }
  });

  let pendingImportSnapshot = null;
  const importFileInput = document.getElementById('backupImportFile');
  const importPreview = document.getElementById('backupImportPreview');
  const btnImportHistory = document.getElementById('btnImportBackupHistory');
  const btnImportRestore = document.getElementById('btnImportBackupRestore');

  async function parseJsonResponse(res) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_) {
      throw new Error(res.ok ? 'Respuesta inválida del servidor' : `Error del servidor (${res.status})`);
    }
  }

  function normalizeImportSnapshot(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.snapshot && typeof raw.snapshot === 'object' && !Array.isArray(raw.snapshot)) {
      return raw.snapshot;
    }
    return raw;
  }

  function isValidImportSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (snapshot.app === 'fundez') return true;
    return Array.isArray(snapshot.users)
      || Array.isArray(snapshot.services)
      || Array.isArray(snapshot.requests);
  }

  function setImportButtonsEnabled(enabled) {
    if (btnImportHistory) btnImportHistory.disabled = !enabled;
    if (btnImportRestore) btnImportRestore.disabled = !enabled;
  }

  function showImportPreview(snapshot) {
    if (!importPreview) return;
    const ver = snapshot.appVersion ? `v${snapshot.appVersion}` : 'sin versión';
    const date = snapshot.exportedAt ? new Date(snapshot.exportedAt).toLocaleString('es-CL') : 'fecha desconocida';
    importPreview.textContent = `${ver} · ${date} · ${snapshot.users?.length || 0} usuarios · ${snapshot.requests?.length || 0} solicitudes`;
    importPreview.classList.remove('hidden');
  }

  importFileInput?.addEventListener('change', () => {
    pendingImportSnapshot = null;
    setImportButtonsEnabled(false);
    if (importPreview) {
      importPreview.textContent = '';
      importPreview.classList.add('hidden');
    }

    const file = importFileInput.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      FundezNotify.show('El archivo supera 25 MB', 'error');
      importFileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '').replace(/^\uFEFF/, ''));
        const snapshot = normalizeImportSnapshot(parsed);
        if (!isValidImportSnapshot(snapshot)) {
          throw new Error('No parece un backup de Fundez');
        }
        pendingImportSnapshot = snapshot;
        showImportPreview(snapshot);
        setImportButtonsEnabled(true);
      } catch (err) {
        FundezNotify.show(err.message || 'No se pudo leer el JSON', 'error');
        importFileInput.value = '';
      }
    };
    reader.onerror = () => FundezNotify.show('No se pudo leer el archivo', 'error');
    reader.readAsText(file);
  });

  btnImportHistory?.addEventListener('click', async () => {
    if (!pendingImportSnapshot) return;
    btnImportHistory.disabled = true;
    btnImportHistory.textContent = 'Subiendo…';
    try {
      const res = await fetch('/admin/backups/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ mode: 'history', snapshot: pendingImportSnapshot })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        FundezNotify.show('Backup importado al historial', 'success');
        setTimeout(() => location.reload(), 900);
      } else {
        FundezNotify.show(data.error || 'Error al importar', 'error');
        btnImportHistory.disabled = false;
        btnImportHistory.textContent = 'Agregar al historial';
      }
    } catch (err) {
      FundezNotify.show(err.message || 'Error de conexión', 'error');
      btnImportHistory.disabled = false;
      btnImportHistory.textContent = 'Agregar al historial';
    }
  });

  btnImportRestore?.addEventListener('click', async () => {
    if (!pendingImportSnapshot) return;
    const ver = pendingImportSnapshot.appVersion ? `v${pendingImportSnapshot.appVersion}` : 'sin versión';
    const msg = `¿Restaurar el backup JSON (${ver})?\n\nSe creará una copia de seguridad automática antes de restaurar.\nLos datos actuales serán reemplazados.`;
    if (!confirm(msg)) return;

    const confirmText = prompt('Escribe RESTAURAR para confirmar:');
    if (confirmText !== 'RESTAURAR') {
      FundezNotify.show('Restauración cancelada', 'info');
      return;
    }

    btnImportRestore.disabled = true;
    btnImportRestore.textContent = 'Restaurando…';
    try {
      const res = await fetch('/admin/backups/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ mode: 'restore', confirm: 'RESTAURAR', snapshot: pendingImportSnapshot })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        FundezNotify.show(`Backup restaurado (copia previa: ${data.preRestoreBackupId?.slice(0, 8)}…)`, 'success');
        setTimeout(() => location.reload(), 1200);
      } else {
        FundezNotify.show(data.error || 'Error al restaurar', 'error');
        btnImportRestore.disabled = false;
        btnImportRestore.textContent = 'Importar y restaurar';
      }
    } catch (err) {
      FundezNotify.show(err.message || 'Error de conexión al restaurar', 'error');
      btnImportRestore.disabled = false;
      btnImportRestore.textContent = 'Importar y restaurar';
    }
  });

  document.querySelectorAll('.btn-delete-backup').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este backup?')) return;
      const res = await fetch(`/admin/backups/${btn.dataset.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        btn.closest('.backup-item')?.remove();
        FundezNotify.show('Backup eliminado', 'success');
      }
    });
  });

  document.querySelectorAll('.btn-restore-backup').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ver = btn.dataset.version ? `v${btn.dataset.version}` : 'sin versión';
      const msg = `¿Restaurar backup del ${btn.dataset.date} (${ver})?\n\nSe creará una copia de seguridad automática antes de restaurar.\nLos datos actuales serán reemplazados por los del backup.`;
      if (!confirm(msg)) return;

      const confirmText = prompt('Escribe RESTAURAR para confirmar:');
      if (confirmText !== 'RESTAURAR') {
        FundezNotify.show('Restauración cancelada', 'info');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Restaurando…';
      try {
        const res = await fetch(`/admin/backups/${btn.dataset.id}/restore`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          credentials: 'same-origin',
          body: JSON.stringify({ confirm: 'RESTAURAR', restoreUploads: true })
        });
        const data = await parseJsonResponse(res);
        if (data.success) {
          FundezNotify.show(`Datos restaurados (backup previo: ${data.preRestoreBackupId?.slice(0, 8)}…)`, 'success');
          setTimeout(() => location.reload(), 1200);
        } else {
          FundezNotify.show(data.error || 'Error al restaurar', 'error');
          btn.disabled = false;
          btn.textContent = 'Restaurar';
        }
      } catch (err) {
        FundezNotify.show(err.message || 'Error de conexión al restaurar', 'error');
        btn.disabled = false;
        btn.textContent = 'Restaurar';
      }
    });
  });

  document.querySelectorAll('.btn-retry-dte').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await fetch('/admin/dte/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: btn.dataset.id, phase: btn.dataset.phase })
        });
        const data = await res.json();
        if (data.success) {
          FundezNotify.show('Documento reemitido', 'success');
          setTimeout(() => location.reload(), 800);
        } else {
          FundezNotify.show(data.error || 'Error al emitir', 'error');
          btn.disabled = false;
        }
      } catch (_) {
        FundezNotify.show('Error de conexión', 'error');
        btn.disabled = false;
      }
    });
  });
})();
