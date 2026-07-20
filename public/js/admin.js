(function () {
  const dashboard = document.getElementById('adminDashboard');
  if (!dashboard) return;

  const PANEL_TITLES = (window.FundezAdminI18n && window.FundezAdminI18n.panels) || {
    resumen: 'Resumen',
    finanzas: 'Finanzas',
    crm: 'CRM socios',
    documentos: 'DTE / SII',
    contratos: 'Contratos socios',
    notificaciones: 'Notificaciones',
    modulos: 'Módulos',
    cobertura: 'Cobertura',
    servicios: 'Servicios',
    demo: 'Cuentas demo',
    pagos: 'Pagos',
    solicitudes: 'Solicitudes',
    proveedores: 'Socios',
    reclamos: 'Reclamos',
    whatsapp: 'WhatsApp',
    aland: 'Aland IA',
    mensajes: 'Mensajes',
    usuarios: 'Clientes y socios',
    datos: 'Datos',
    backups: 'Backups',
    equipo: 'Equipo y permisos',
    seguridad: 'Seguridad'
  };

  const ADMIN_JS = (window.FundezAdminI18n && window.FundezAdminI18n.js) || {};
  const ADMIN_BASE = window.FundezAdminBase || '/admin';
  function adminFetch(path, options) {
    const url = path.startsWith('http') ? path : `${ADMIN_BASE}${path.startsWith('/') ? path : '/' + path}`;
    return fetch(url, options);
  }
  function adminHref(path) {
    return `${ADMIN_BASE}${path.startsWith('/') ? path : '/' + path}`;
  }


  const ADMIN_STATUS = (window.FundezAdminI18n && window.FundezAdminI18n.status) || { on: 'ON', off: 'OFF', active: 'ACTIVA', inactive: 'INACTIVA' };

  function adminMsg(template, vars) {
    if (!template) return '';
    return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => (vars && vars[key] != null ? vars[key] : ''));
  }

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
    const profile = adminProfiles.find(p => p.id === profileSelect.value);
    if (profile?.isFullAccess || profile?.isSuperAdmin || profileSelect.value === 'admin.mod') {
      permInputs.forEach(input => { input.checked = true; });
      setChecklistDisabled(true);
    } else {
      setChecklistDisabled(false);
    }
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
    document.getElementById('adminFormTitle').textContent = ADMIN_JS.newAdmin || 'Nuevo administrador';
    document.getElementById('adminFormSubmit').textContent = ADMIN_JS.createAdmin || 'Crear administrador';
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

  /* ——— Perfiles personalizados ——— */
  const profileFormWrap = document.getElementById('adminProfileFormWrap');
  const profileForm = document.getElementById('adminProfileForm');
  const profilePermInputs = document.querySelectorAll('.profile-perm-input');

  function resetProfileForm() {
    profileForm?.reset();
    document.getElementById('profileFormId').disabled = false;
    document.getElementById('adminProfileFormTitle').textContent = 'Nuevo perfil';
    profilePermInputs.forEach((i) => { i.checked = false; });
    profileFormWrap?.classList.add('hidden');
  }

  document.getElementById('btnNewProfile')?.addEventListener('click', () => {
    resetProfileForm();
    profileFormWrap?.classList.remove('hidden');
    profileFormWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('adminProfileFormCancel')?.addEventListener('click', resetProfileForm);

  document.querySelectorAll('.btn-edit-profile').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('profileFormId').value = btn.dataset.id || '';
      document.getElementById('profileFormId').disabled = true;
      document.getElementById('profileFormName').value = btn.dataset.name || '';
      document.getElementById('profileFormDesc').value = btn.dataset.description || '';
      const perms = String(btn.dataset.permissions || '').split(',').filter(Boolean);
      profilePermInputs.forEach((i) => { i.checked = perms.includes(i.value); });
      document.getElementById('adminProfileFormTitle').textContent = 'Editar perfil';
      profileFormWrap?.classList.remove('hidden');
      profileFormWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      id: document.getElementById('profileFormId').value.trim(),
      name: document.getElementById('profileFormName').value.trim(),
      description: document.getElementById('profileFormDesc').value.trim(),
      permissions: [...profilePermInputs].filter((i) => i.checked).map((i) => i.value)
    };
    try {
      const res = await adminFetch('/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.success) {
        FundezNotify.show(data.error || 'No se pudo guardar el perfil', 'error');
        return;
      }
      FundezNotify.show('Perfil guardado', 'success');
      setTimeout(() => { window.location.href = ADMIN_BASE + '?tab=equipo'; }, 700);
    } catch (_) {
      FundezNotify.show('Error al guardar perfil', 'error');
    }
  });

  document.querySelectorAll('.btn-delete-profile').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este perfil?')) return;
      try {
        const res = await adminFetch(`/profiles/${btn.dataset.id}/delete`, { method: 'POST' });
        const data = await res.json();
        if (!data.success) {
          FundezNotify.show(data.error || 'No se pudo eliminar', 'error');
          return;
        }
        FundezNotify.show('Perfil eliminado', 'success');
        setTimeout(() => { window.location.href = ADMIN_BASE + '?tab=equipo'; }, 700);
      } catch (_) {
        FundezNotify.show('Error al eliminar', 'error');
      }
    });
  });

  /* ——— Intervención clientes/socios ——— */
  async function refreshManagedUsers() {
    const q = document.getElementById('managedUserSearch')?.value || '';
    const role = document.getElementById('managedUserRole')?.value || '';
    const list = document.getElementById('managedUsersList');
    if (!list) return;
    try {
      const res = await adminFetch(`/usuarios?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}&limit=40`);
      const data = await res.json();
      if (!data.success) return;
      if (!data.users.length) {
        list.innerHTML = '<p class="text-sm text-gray-500 text-center py-6">Sin resultados.</p>';
        return;
      }
      list.innerHTML = data.users.map((u) => `
        <div class="p-4 rounded-2xl bg-zilo-card border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-user-id="${u.id}">
          <div class="min-w-0">
            <strong class="text-sm">${u.name || ''}</strong>
            <span class="text-[10px] uppercase ml-2 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">${u.role}</span>
            <p class="text-xs text-gray-500 truncate">${u.email || ''}${u.phone ? ' · ' + u.phone : ''}</p>
            <p class="text-[10px] text-gray-400 mt-1">${u.active ? 'Activo' : 'Inactivo'} · ${u.emailVerified ? 'Email OK' : 'Email pendiente'}</p>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0 items-center">
            <label class="inline-flex items-center gap-1.5 text-xs">
              <input type="checkbox" class="managed-user-active" data-id="${u.id}" ${u.active ? 'checked' : ''}>
              Activo
            </label>
            ${!u.emailVerified ? `<button type="button" class="managed-user-verify text-xs px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-700" data-email="${u.email}">Verificar email</button>` : ''}
          </div>
        </div>
      `).join('');
      bindManagedUserActions();
    } catch (_) { /* noop */ }
  }

  function bindManagedUserActions() {
    document.querySelectorAll('.managed-user-active').forEach((toggle) => {
      toggle.onchange = async () => {
        const res = await adminFetch(`/usuarios/${toggle.dataset.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: toggle.checked })
        });
        const data = await res.json();
        if (!data.success) {
          toggle.checked = !toggle.checked;
          FundezNotify.show(data.error || 'No se pudo actualizar', 'error');
          return;
        }
        FundezNotify.show(toggle.checked ? 'Usuario activado' : 'Usuario desactivado', 'success');
      };
    });
    document.querySelectorAll('.managed-user-verify').forEach((btn) => {
      btn.onclick = async () => {
        document.getElementById('adminVerifyEmail') && (document.getElementById('adminVerifyEmail').value = btn.dataset.email || '');
        const res = await adminFetch('/usuarios/verificar-email/forzar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: btn.dataset.email })
        });
        const data = await res.json();
        if (data.success) {
          FundezNotify.show('Email verificado', 'success');
          refreshManagedUsers();
        } else {
          FundezNotify.show(data.error || 'No se pudo verificar', 'error');
        }
      };
    });
  }

  document.getElementById('btnManagedUserSearch')?.addEventListener('click', refreshManagedUsers);
  document.getElementById('managedUserSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      refreshManagedUsers();
    }
  });
  bindManagedUserActions();

  document.querySelectorAll('.btn-edit-admin').forEach(btn => {
    btn.addEventListener('click', () => {
      const member = adminTeam.find(m => m.id === btn.dataset.id);
      if (!member) return;

      document.getElementById('adminFormId').value = member.id;
      document.getElementById('adminFormTitle').textContent = ADMIN_JS.editAdmin || 'Editar administrador';
      document.getElementById('adminFormSubmit').textContent = ADMIN_JS.saveChanges || 'Guardar cambios';
      document.getElementById('adminFormName').value = member.name || '';
      document.getElementById('adminFormEmail').value = member.email || '';
      document.getElementById('adminFormEmail').disabled = true;
      document.getElementById('adminFormPassword').required = false;
      document.getElementById('adminFormPasswordHint').textContent = ADMIN_JS.passwordHint || '';

      if (profileSelect) {
        profileSelect.value = member.isSuperAdmin ? 'superadmin' : (member.profileId || 'custom');
      }

      permInputs.forEach(input => {
        input.checked = member.permissions.includes(input.value);
      });

      if (superCheckbox) {
        superCheckbox.checked = Boolean(member.isSuperAdmin);
        setChecklistDisabled(Boolean(member.isSuperAdmin || member.isFullAccess));
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
      isSuperAdmin: superCheckbox?.checked || false,
      isFullAccess: profileSelect?.value === 'admin.mod' || Boolean(adminProfiles.find(p => p.id === profileSelect?.value)?.isFullAccess)
    };
    const password = document.getElementById('adminFormPassword').value;
    if (password) body.password = password;

    try {
      let res;
      if (adminId) {
        res = await adminFetch(`/team/${adminId}`, {
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
        res = await adminFetch('/team', {
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
        const res = await adminFetch(`/team/${id}/toggle`, {
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
      const res = await adminFetch(`/contratos/${id}/review`, {
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
        const res = await adminFetch('/toggle-service', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceId, enabled })
        });
        const data = await res.json();
        if (data.success) {
          item.classList.toggle('opacity-50', !enabled);
          statusLabel.textContent = enabled ? ADMIN_STATUS.on : ADMIN_STATUS.off;
          statusLabel.className = `service-status text-[10px] font-bold uppercase ${enabled ? 'text-emerald-600' : 'text-red-600'}`;
          FundezNotify.show(adminMsg(enabled ? ADMIN_JS.serviceEnabled : ADMIN_JS.serviceDisabled, { name: data.service.name }), enabled ? 'success' : 'warning');
        }
      } catch (_) {
        toggle.checked = !enabled;
        FundezNotify.show(ADMIN_JS.updateError, 'error');
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
        const res = await adminFetch('/toggle-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, active })
        });
        const data = await res.json();
        if (data.success) {
          item.classList.toggle('opacity-50', !active);
          statusLabel.textContent = active ? ADMIN_STATUS.active : ADMIN_STATUS.inactive;
          statusLabel.className = `demo-status text-[10px] font-bold uppercase ${active ? 'text-emerald-600' : 'text-red-600'}`;
          FundezNotify.show(active ? ADMIN_JS.demoEnabled : ADMIN_JS.demoDisabled, active ? 'success' : 'warning');
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
        const res = await adminFetch('/toggle-module', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moduleId, enabled })
        });
        const data = await res.json();
        if (data.success) {
          item.classList.toggle('opacity-50', !enabled);
          statusLabel.textContent = enabled ? ADMIN_STATUS.on : ADMIN_STATUS.off;
          statusLabel.className = `module-status text-[10px] font-bold uppercase ${enabled ? 'text-emerald-600' : 'text-red-600'}`;
          FundezNotify.show(adminMsg(enabled ? ADMIN_JS.moduleEnabled : ADMIN_JS.moduleDisabled, { name: data.module.name }), enabled ? 'success' : 'warning');
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

  function resetPromoForm() {
    const form = document.getElementById('promoForm');
    if (!form) return;
    form.reset();
    document.getElementById('promoEditId').value = '';
    document.getElementById('promoColor').value = '#2563EB';
    document.getElementById('promoShowBanner').checked = true;
    document.getElementById('promoCheckout').checked = true;
    document.getElementById('promoEnabled').checked = true;
  }

  document.getElementById('promoFormReset')?.addEventListener('click', resetPromoForm);

  document.getElementById('promoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      id: document.getElementById('promoEditId').value || undefined,
      title: document.getElementById('promoTitle').value.trim(),
      desc: document.getElementById('promoDesc').value.trim(),
      code: document.getElementById('promoCodeInput').value.trim(),
      color: document.getElementById('promoColor').value.trim(),
      discountPercent: document.getElementById('promoDiscount').value,
      showBanner: document.getElementById('promoShowBanner').checked,
      checkoutEnabled: document.getElementById('promoCheckout').checked,
      enabled: document.getElementById('promoEnabled').checked
    };
    try {
      const res = await adminFetch('/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.success) {
        FundezNotify.show(data.error || 'No se pudo guardar', 'error');
        return;
      }
      FundezNotify.show('Promoción guardada', 'success');
      window.location.href = ADMIN_BASE + '?tab=promos';
    } catch (_) {
      FundezNotify.show('Error al guardar promoción', 'error');
    }
  });

  document.querySelectorAll('.promo-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('promoEditId').value = btn.dataset.id || '';
      document.getElementById('promoTitle').value = btn.dataset.title || '';
      document.getElementById('promoDesc').value = btn.dataset.desc || '';
      document.getElementById('promoCodeInput').value = btn.dataset.code || '';
      document.getElementById('promoColor').value = btn.dataset.color || '#2563EB';
      document.getElementById('promoDiscount').value = btn.dataset.discount || '';
      document.getElementById('promoShowBanner').checked = btn.dataset.banner === '1';
      document.getElementById('promoCheckout').checked = btn.dataset.checkout === '1';
      document.getElementById('promoEnabled').checked = btn.dataset.enabled === '1';
      document.getElementById('promoForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  function toDatetimeLocalValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function resetCrmForm() {
    const form = document.getElementById('crmLeadForm');
    if (!form) return;
    form.reset();
    document.getElementById('crmEditId').value = '';
    ['crmTraining', 'crmDocs', 'crmContractSent', 'crmContractSigned'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });
  }

  document.getElementById('crmFormReset')?.addEventListener('click', resetCrmForm);

  document.getElementById('crmLeadForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      id: document.getElementById('crmEditId').value || undefined,
      companyName: document.getElementById('crmCompany').value.trim(),
      contactName: document.getElementById('crmContact').value.trim(),
      email: document.getElementById('crmEmail').value.trim(),
      phone: document.getElementById('crmPhone').value.trim(),
      rut: document.getElementById('crmRut').value.trim(),
      meetingAt: document.getElementById('crmMeetingAt').value || null,
      pipelineStage: document.getElementById('crmStage').value,
      assignedTo: document.getElementById('crmAssigned').value.trim(),
      interestedServices: document.getElementById('crmServices').value.trim(),
      coverageArea: document.getElementById('crmCoverage').value.trim(),
      source: document.getElementById('crmSource').value.trim(),
      nextSteps: document.getElementById('crmNextSteps').value.trim(),
      meetingNotes: document.getElementById('crmMeetingNotes').value.trim(),
      notes: document.getElementById('crmNotes').value.trim(),
      trainingDone: document.getElementById('crmTraining').checked,
      docsReceived: document.getElementById('crmDocs').checked,
      contractSent: document.getElementById('crmContractSent').checked,
      contractSigned: document.getElementById('crmContractSigned').checked
    };
    try {
      const res = await adminFetch('/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.success) {
        FundezNotify.show(data.error || 'No se pudo guardar', 'error');
        return;
      }
      FundezNotify.show(ADMIN_JS.crmSaved || 'Contacto CRM guardado', 'success');
      window.location.href = ADMIN_BASE + '?tab=crm';
    } catch (_) {
      FundezNotify.show('Error al guardar CRM', 'error');
    }
  });

  document.querySelectorAll('.crm-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      let lead = null;
      try {
        lead = JSON.parse(decodeURIComponent(btn.dataset.payload || ''));
      } catch (_) {
        return;
      }
      if (!lead) return;
      document.getElementById('crmEditId').value = lead.id || '';
      document.getElementById('crmCompany').value = lead.companyName || '';
      document.getElementById('crmContact').value = lead.contactName || '';
      document.getElementById('crmEmail').value = lead.email || '';
      document.getElementById('crmPhone').value = lead.phone || '';
      document.getElementById('crmRut').value = lead.rut || '';
      document.getElementById('crmMeetingAt').value = toDatetimeLocalValue(lead.meetingAt);
      document.getElementById('crmStage').value = lead.pipelineStage || 'prospecto';
      document.getElementById('crmAssigned').value = lead.assignedTo || '';
      document.getElementById('crmServices').value = lead.interestedServices || '';
      document.getElementById('crmCoverage').value = lead.coverageArea || '';
      document.getElementById('crmSource').value = lead.source || '';
      document.getElementById('crmNextSteps').value = lead.nextSteps || '';
      document.getElementById('crmMeetingNotes').value = lead.meetingNotes || '';
      document.getElementById('crmNotes').value = lead.notes || '';
      document.getElementById('crmTraining').checked = Boolean(lead.trainingDone);
      document.getElementById('crmDocs').checked = Boolean(lead.docsReceived);
      document.getElementById('crmContractSent').checked = Boolean(lead.contractSent);
      document.getElementById('crmContractSigned').checked = Boolean(lead.contractSigned);
      document.getElementById('crmLeadForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.querySelectorAll('.crm-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(ADMIN_JS.crmDeleteConfirm || '¿Eliminar este contacto del CRM?')) return;
      try {
        const res = await adminFetch(`/crm/${btn.dataset.id}/delete`, { method: 'POST' });
        const data = await res.json();
        if (!data.success) {
          FundezNotify.show(data.error || 'No se pudo eliminar', 'error');
          return;
        }
        FundezNotify.show(ADMIN_JS.crmDeleted || 'Contacto eliminado', 'success');
        window.location.href = ADMIN_BASE + '?tab=crm';
      } catch (_) {
        FundezNotify.show('Error al eliminar', 'error');
      }
    });
  });

  document.querySelectorAll('.promo-toggle').forEach((toggle) => {
    toggle.addEventListener('change', async () => {
      const enabled = toggle.checked;
      try {
        const res = await adminFetch(`/promos/${toggle.dataset.id}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (!data.success) {
          toggle.checked = !enabled;
          FundezNotify.show(data.error || 'No se pudo actualizar', 'error');
          return;
        }
        const item = toggle.closest('.promo-item');
        item?.classList.toggle('opacity-50', !enabled);
        FundezNotify.show(enabled ? 'Promoción activada' : 'Promoción desactivada', enabled ? 'success' : 'warning');
      } catch (_) {
        toggle.checked = !enabled;
        FundezNotify.show('Error al actualizar promoción', 'error');
      }
    });
  });

  document.querySelectorAll('.promo-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta promoción?')) return;
      try {
        const res = await adminFetch(`/promos/${btn.dataset.id}/delete`, { method: 'POST' });
        const data = await res.json();
        if (!data.success) {
          FundezNotify.show(data.error || 'No se pudo eliminar', 'error');
          return;
        }
        FundezNotify.show('Promoción eliminada', 'success');
        window.location.href = ADMIN_BASE + '?tab=promos';
      } catch (_) {
        FundezNotify.show('Error al eliminar promoción', 'error');
      }
    });
  });

  document.querySelectorAll('.coverage-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      e.stopPropagation();
      const regionCode = toggle.dataset.region;
      const communeCode = toggle.dataset.commune;
      const enabled = toggle.checked;
      const item = toggle.closest('.coverage-commune-item');
      const statusLabel = item.querySelector('.coverage-status');
      const regionEl = toggle.closest('.coverage-region');

      try {
        const res = await adminFetch('/toggle-coverage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regionCode, communeCode, enabled })
        });
        const data = await res.json();
        if (data.success) {
          statusLabel.textContent = enabled ? ADMIN_STATUS.on : ADMIN_STATUS.off;
          statusLabel.className = `coverage-status text-[10px] font-bold uppercase shrink-0 ${enabled ? 'text-emerald-600' : 'text-red-600'}`;
          item.classList.toggle('opacity-70', !enabled);
          updateCoverageRegionCount(regionEl);
          updateCoverageStatsLabel(data.stats);
          FundezNotify.show(adminMsg(enabled ? ADMIN_JS.communeEnabled : ADMIN_JS.communeDisabled, { name: data.commune.communeName }), enabled ? 'success' : 'warning');
        } else {
          toggle.checked = !enabled;
          FundezNotify.show(data.error || ADMIN_JS.updateError, 'error');
        }
      } catch (_) {
        toggle.checked = !enabled;
        FundezNotify.show(ADMIN_JS.coverageError, 'error');
      }
    });
  });

  function updateCoverageRegionCount(regionEl) {
    if (!regionEl) return;
    const regionEnabled = regionEl.querySelector('.coverage-region-toggle')?.checked;
    const toggles = [...regionEl.querySelectorAll('.coverage-toggle')];
    const active = toggles.filter((t) => regionEnabled && t.checked).length;
    const countEl = regionEl.querySelector('.coverage-region-count');
    if (countEl) {
      const template = countEl.dataset.template || '{{active}}/{{total}} comunas activas';
      countEl.textContent = template.replace('{{active}}', active).replace('{{total}}', toggles.length);
    }
  }

  function updateCoverageStatsLabel(stats) {
    const el = document.getElementById('coverageStatsLabel');
    if (!el || !stats) return;
    const communesTpl = el.dataset.communesTemplate;
    const regionsTpl = el.dataset.regionsTemplate;
    if (communesTpl && regionsTpl) {
      el.textContent = `${communesTpl.replace('{{active}}', stats.enabled).replace('{{total}}', stats.total)} · ${regionsTpl.replace('{{active}}', stats.regionsActive).replace('{{total}}', stats.regionsTotal)}`;
    }
  }

  function updateCoverageRegionUi(regionEl, enabled) {
    regionEl.classList.toggle('opacity-80', !enabled);
    const status = regionEl.querySelector('.coverage-region-status');
    if (status) {
      status.textContent = enabled ? ADMIN_STATUS.on : ADMIN_STATUS.off;
      status.className = `coverage-region-status text-[10px] font-bold uppercase shrink-0 ${enabled ? 'text-emerald-600' : 'text-red-600'}`;
    }
    const list = regionEl.querySelector('.coverage-communes-list');
    if (list) list.classList.toggle('is-disabled', !enabled);

    regionEl.querySelectorAll('.coverage-toggle').forEach((toggle) => {
      toggle.disabled = !enabled;
      const item = toggle.closest('.coverage-commune-item');
      const statusLabel = item?.querySelector('.coverage-status');
      const operational = enabled && toggle.checked;
      item?.classList.toggle('opacity-70', !operational);
      if (statusLabel) {
        statusLabel.textContent = operational ? ADMIN_STATUS.on : ADMIN_STATUS.off;
        statusLabel.className = `coverage-status text-[10px] font-bold uppercase shrink-0 ${operational ? 'text-emerald-600' : 'text-red-600'}`;
      }
    });

    updateCoverageRegionCount(regionEl);
  }

  document.querySelectorAll('.coverage-region-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      e.stopPropagation();
      const regionCode = toggle.dataset.region;
      const enabled = toggle.checked;
      const regionEl = toggle.closest('.coverage-region');
      if (!regionEl) return;

      try {
        const res = await adminFetch('/toggle-coverage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regionCode, enabled, regionOnly: true })
        });
        const data = await res.json();
        if (!data.success) {
          toggle.checked = !enabled;
          FundezNotify.show(data.error || 'No se pudo actualizar la región', 'error');
          return;
        }

        updateCoverageRegionUi(regionEl, enabled);
        updateCoverageStatsLabel(data.stats);
        FundezNotify.show(adminMsg(enabled ? ADMIN_JS.regionEnabled : ADMIN_JS.regionDisabled, { name: data.region.regionName }), enabled ? 'success' : 'warning');
      } catch (_) {
        toggle.checked = !enabled;
        FundezNotify.show(ADMIN_JS.regionError, 'error');
      }
    });
  });

  document.querySelectorAll('.btn-complaint').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await adminFetch(`/complaint/${btn.dataset.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: btn.dataset.status })
      });
      const data = await res.json();
      if (data.success) {
        FundezNotify.show(ADMIN_JS.complaintUpdated, 'success');
        setTimeout(() => location.reload(), 800);
      }
    });
  });

  document.querySelectorAll('.btn-mark-payout').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await adminFetch(`/payout/${btn.dataset.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        FundezNotify.show(ADMIN_JS.payoutMarked, 'success');
        setTimeout(() => location.reload(), 800);
      }
    });
  });

  const formPurchase = document.getElementById('formPurchaseInvoice');
  if (formPurchase) {
    formPurchase.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(formPurchase);
      const body = Object.fromEntries(fd.entries());
      const res = await adminFetch('/finanzas/compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        FundezNotify.show(ADMIN_JS.purchaseSaved || 'Compra registrada', 'success');
        setTimeout(() => location.reload(), 700);
      } else {
        FundezNotify.show(data.error || 'No se pudo registrar', 'error');
      }
    });
  }

  const formBank = document.getElementById('formBankMovement');
  if (formBank) {
    formBank.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(formBank);
      const body = Object.fromEntries(fd.entries());
      const res = await adminFetch('/finanzas/banco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        FundezNotify.show(ADMIN_JS.bankSaved || 'Movimiento bancario guardado', 'success');
        setTimeout(() => location.reload(), 700);
      } else {
        FundezNotify.show(data.error || 'No se pudo guardar', 'error');
      }
    });
  }

  document.getElementById('btnAutoReconcile')?.addEventListener('click', async () => {
    const res = await adminFetch('/finanzas/conciliar', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      FundezNotify.show(adminMsg(ADMIN_JS.reconciled || 'Conciliados: {{count}}', { count: data.matched }), 'success');
      setTimeout(() => location.reload(), 800);
    } else {
      FundezNotify.show(data.error || 'Sin coincidencias', 'error');
    }
  });

  document.getElementById('btnSiiSync')?.addEventListener('click', async () => {
    const res = await adminFetch('/finanzas/compras/sync-sii', { method: 'POST' });
    const data = await res.json();
    FundezNotify.show(data.error || data.message || (data.success ? 'Sync OK' : 'Sync pendiente de API'), data.success ? 'success' : 'info');
  });

  document.querySelectorAll('.btn-approve-transfer').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await adminFetch(`/transfer/${btn.dataset.id}/aprobar`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        FundezNotify.show(ADMIN_JS.transferConfirmed, 'success');
        setTimeout(() => location.reload(), 800);
      } else {
        FundezNotify.show(data.error || 'No se pudo confirmar', 'error');
      }
    });
  });

  document.querySelectorAll('[data-dispatch-id]').forEach((card) => {
    const providerSelect = card.querySelector('[data-role="provider-select"]');
    const techSelect = card.querySelector('[data-role="tech-select"]');
    if (providerSelect && techSelect) {
      providerSelect.addEventListener('change', () => {
        const option = providerSelect.selectedOptions[0];
        let techs = [];
        try {
          techs = JSON.parse(decodeURIComponent(option?.dataset.techs || '%5B%5D'));
        } catch (_) {
          techs = [];
        }
        techSelect.innerHTML = `<option value="">${ADMIN_JS.pickTech || 'Técnico (opcional)…'}</option>`;
        techs.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.name;
          techSelect.appendChild(opt);
        });
        techSelect.disabled = !techs.length;
      });
    }
  });

  document.querySelectorAll('.btn-admin-dispatch').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-dispatch-id]');
      const providerId = card?.querySelector('[data-role="provider-select"]')?.value;
      const technicianId = card?.querySelector('[data-role="tech-select"]')?.value || null;
      if (!providerId) {
        FundezNotify.show('Selecciona un socio', 'warning');
        return;
      }
      btn.disabled = true;
      try {
        const res = await adminFetch(`/solicitudes/${btn.dataset.id}/asignar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ providerId, technicianId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo canalizar');
        FundezNotify.show(ADMIN_JS.dispatchSuccess || 'Solicitud canalizada al socio', 'success');
        card.remove();
        const queue = document.getElementById('adminDispatchQueue');
        if (queue && !queue.children.length) location.reload();
      } catch (err) {
        btn.disabled = false;
        FundezNotify.show(err.message || 'No se pudo canalizar', 'error');
      }
    });
  });

  const adminVerifyEmail = document.getElementById('adminVerifyEmail');
  const adminVerifyFeedback = document.getElementById('adminVerifyFeedback');
  async function adminVerifyAction(path, successType) {
    const email = (adminVerifyEmail?.value || '').trim();
    if (!email) {
      FundezNotify.show('Ingresa el correo del usuario', 'warning');
      return;
    }
    try {
      const res = await adminFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo completar');
      FundezNotify.show(data.message || 'Listo', successType || 'success');
      if (adminVerifyFeedback) {
        adminVerifyFeedback.textContent = data.message || 'OK';
        adminVerifyFeedback.classList.remove('hidden');
      }
    } catch (err) {
      FundezNotify.show(err.message || 'Error', 'error');
    }
  }
  document.getElementById('btnAdminResendVerify')?.addEventListener('click', () => {
    adminVerifyAction('/usuarios/verificar-email/reenviar', 'success');
  });
  document.getElementById('btnAdminForceVerify')?.addEventListener('click', () => {
    if (!confirm('¿Verificar manualmente este correo sin código?')) return;
    adminVerifyAction('/usuarios/verificar-email/forzar', 'success');
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
      statusLabel.textContent = service.enabled ? ADMIN_STATUS.on : ADMIN_STATUS.off;
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
      statusLabel.textContent = mod.enabled ? ADMIN_STATUS.on : ADMIN_STATUS.off;
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
      const res = await adminFetch('/backups/config', {
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
    btn.textContent = ADMIN_JS.generating || 'Generando...';
    const res = await adminFetch('/backups/run', { method: 'POST' });
    const data = await res.json();
    btn.disabled = false;
    btn.textContent = ADMIN_JS.generateBackup || 'Generar backup ahora';
    if (data.success) {
      FundezNotify.show(`Backup creado v${data.backup.appVersion || '?'} (${data.backup.stats?.totalBytes ? Math.round(data.backup.stats.totalBytes / 1024) + ' KB' : 'ok'})`, 'success');
      setTimeout(() => location.reload(), 900);
    } else FundezNotify.show(data.error || 'Error al generar backup', 'error');
  });

  document.getElementById('btnApplyRetention')?.addEventListener('click', async () => {
    const res = await adminFetch('/backups/retention', { method: 'POST' });
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
      const res = await adminFetch('/backups/import', {
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
      const res = await adminFetch('/backups/import', {
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
      const res = await adminFetch(`/backups/${btn.dataset.id}`, { method: 'DELETE' });
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
        const res = await adminFetch(`/backups/${btn.dataset.id}/restore`, {
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

  /* ——— Aland IA ——— */
  const alandForm = document.getElementById('alandConfigForm');
  const alandStatus = document.getElementById('alandConfigStatus');
  const alandKbList = document.getElementById('alandKnowledgeList');
  const alandKbForm = document.getElementById('alandKnowledgeForm');
  const btnAlandSync = document.getElementById('btnAlandSyncKb');

  function setAlandFormValues(config) {
    if (!alandForm || !config) return;
    const enabledEl = alandForm.querySelector('[name=enabled]');
    if (enabledEl) enabledEl.checked = config.enabled !== false;
    if (alandForm.openaiModel) alandForm.openaiModel.value = config.openaiModel || 'gpt-4o-mini';
    if (alandForm.personality) alandForm.personality.value = config.personality || '';
    if (alandForm.systemInstructions) alandForm.systemInstructions.value = config.systemInstructions || '';
    if (alandForm.greetingMessage) alandForm.greetingMessage.value = config.greetingMessage || '';
    if (alandForm.providerTimeoutMinutes) alandForm.providerTimeoutMinutes.value = config.providerTimeoutMinutes || 5;
    if (alandForm.escalateKeywords) alandForm.escalateKeywords.value = (config.escalateKeywords || []).join('\n');
  }

  function renderAlandKb(items) {
    if (!alandKbList) return;
    if (!items?.length) {
      alandKbList.innerHTML = `<p class="text-gray-500 p-2">${ADMIN_JS.noKb || 'Sin entradas.'}</p>`;
      return;
    }
    alandKbList.innerHTML = items.map((k) => `
      <div class="p-2 rounded-lg bg-zilo-bg border border-gray-200">
        <strong class="text-violet-600 uppercase text-[10px]">${k.sourceType}</strong>
        <p class="font-medium">${k.title}</p>
        <p class="text-gray-500 line-clamp-2">${k.content}</p>
      </div>
    `).join('');
  }

  async function loadAlandAdmin() {
    if (!alandForm && !alandStatus) return;
    try {
      const res = await fetch('/aland/admin/config', { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (alandStatus) {
        alandStatus.innerHTML = data.openaiConfigured
          ? '<strong class="text-emerald-600">OpenAI conectado</strong> · Agente: Aland IA'
          : '<strong class="text-red-600">Falta OPENAI_API_KEY</strong> en variables de entorno Hostinger';
      }
      if (data.config) setAlandFormValues(data.config);
      const kbRes = await fetch('/aland/admin/knowledge', { headers: { Accept: 'application/json' } });
      const kbData = await kbRes.json();
      renderAlandKb(kbData.knowledge);
    } catch (_) {
      if (alandStatus) alandStatus.textContent = ADMIN_JS.alandError || 'Error cargando Aland IA';
    }
  }

  alandForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(alandForm);
    const body = {
      enabled: fd.get('enabled') === 'on',
      openaiModel: fd.get('openaiModel'),
      personality: fd.get('personality'),
      systemInstructions: fd.get('systemInstructions'),
      greetingMessage: fd.get('greetingMessage'),
      providerTimeoutMinutes: parseInt(fd.get('providerTimeoutMinutes'), 10) || 5,
      escalateKeywords: String(fd.get('escalateKeywords') || '').split('\n').map((s) => s.trim()).filter(Boolean)
    };
    const res = await fetch('/aland/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) FundezNotify.show('Aland IA actualizado', 'success');
    else FundezNotify.show(data.error || 'Error', 'error');
  });

  btnAlandSync?.addEventListener('click', async () => {
    btnAlandSync.disabled = true;
    const res = await fetch('/aland/admin/knowledge/sync', { method: 'POST' });
    const data = await res.json();
    btnAlandSync.disabled = false;
    if (data.success) {
      FundezNotify.show(`${data.synced} entradas sincronizadas`, 'success');
      renderAlandKb(data.knowledge);
    } else FundezNotify.show(data.error || 'Error', 'error');
  });

  alandKbForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(alandKbForm);
    const res = await fetch('/aland/admin/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: fd.get('title'), content: fd.get('content'), sourceType: 'custom', active: true })
    });
    const data = await res.json();
    if (data.success) {
      FundezNotify.show('Conocimiento agregado', 'success');
      alandKbForm.reset();
      loadAlandAdmin();
    }
  });

  /* ——— Mensajes ——— */
  const mensajesList = document.getElementById('mensajesList');
  const mensajesThread = document.getElementById('mensajesChatThread');
  const mensajesTitle = document.getElementById('mensajesChatTitle');
  const mensajesReplyForm = document.getElementById('mensajesReplyForm');
  let mensajesActiveId = null;
  let adminAlandSocket = null;

  function mensajesStatusLabel(s) {
    return { ai_active: 'Aland IA', awaiting_provider: 'Esperando socio', awaiting_admin: 'Admin', closed: 'Cerrada' }[s] || s;
  }

  function renderMensajeMsg(msg) {
    const mine = msg.senderType === 'admin';
    const align = mine ? 'text-right' : 'text-left';
    const bg = mine ? 'bg-zilo-accent text-white' : 'bg-zilo-bg border border-gray-200';
    return `<div class="${align}"><div class="inline-block max-w-[95%] px-2 py-1.5 rounded-lg ${bg}"><span class="block text-[9px] opacity-70">${msg.senderName || msg.senderType}</span>${msg.body.replace(/</g, '&lt;')}</div></div>`;
  }

  async function loadMensajesList() {
    if (!mensajesList) return;
    const res = await fetch('/aland/admin/conversations', { headers: { Accept: 'application/json' } });
    const data = await res.json();
    const items = (data.conversations || []).filter((c) => c.status !== 'closed');
    if (!items.length) {
      mensajesList.innerHTML = `<p class="text-xs text-gray-500 p-3 rounded-xl bg-zilo-bg border">${ADMIN_JS.noConversations || 'Sin conversaciones.'}</p>`;
      return;
    }
    mensajesList.innerHTML = items.map((c) => `
      <button type="button" class="w-full text-left p-3 rounded-xl bg-zilo-bg border border-gray-200 hover:border-violet-400 mensajes-item" data-id="${c.id}">
        <div class="flex justify-between"><strong class="text-sm">${c.clientName}</strong><span class="text-[10px] text-violet-600">${mensajesStatusLabel(c.status)}</span></div>
        <p class="text-gray-500 mt-1">${c.serviceName} · ${c.providerName ? c.providerName : 'Sin socio'}</p>
      </button>
    `).join('');
    mensajesList.querySelectorAll('.mensajes-item').forEach((btn) => {
      btn.addEventListener('click', () => openMensajesChat(btn.dataset.id));
    });
  }

  async function openMensajesChat(id) {
    mensajesActiveId = id;
    if (mensajesReplyForm) {
      mensajesReplyForm.classList.remove('hidden');
      mensajesReplyForm.conversationId.value = id;
    }
    const res = await fetch(`/aland/admin/conversations/${id}/messages`, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (!data.success) return;
    if (mensajesTitle) mensajesTitle.textContent = `${data.conversation.clientName} · ${data.conversation.serviceName}`;
    if (mensajesThread) {
      mensajesThread.innerHTML = (data.messages || []).map(renderMensajeMsg).join('');
      mensajesThread.scrollTop = mensajesThread.scrollHeight;
    }
    if (window.io) {
      if (!adminAlandSocket) {
        adminAlandSocket = io();
        adminAlandSocket.emit('aland_join', { admin: true });
        adminAlandSocket.on('aland_message', (payload) => {
          if (payload.conversationId === mensajesActiveId && mensajesThread) {
            mensajesThread.insertAdjacentHTML('beforeend', renderMensajeMsg(payload.message));
            mensajesThread.scrollTop = mensajesThread.scrollHeight;
          }
        });
        adminAlandSocket.on('aland_escalated', () => loadMensajesList());
      }
      adminAlandSocket.emit('aland_join', { conversationId: id, admin: true });
    }
  }

  mensajesReplyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(mensajesReplyForm);
    const id = fd.get('conversationId');
    const text = fd.get('message');
    const res = await fetch(`/aland/admin/conversations/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    if (data.success) {
      mensajesReplyForm.message.value = '';
      if (data.message && mensajesThread) {
        mensajesThread.insertAdjacentHTML('beforeend', renderMensajeMsg(data.message));
        mensajesThread.scrollTop = mensajesThread.scrollHeight;
      }
    } else FundezNotify.show(data.error || 'Error', 'error');
  });

  if (document.getElementById('alandConfigForm') || document.getElementById('mensajesList')) {
    loadAlandAdmin();
    loadMensajesList();
    setInterval(loadMensajesList, 45000);
  }

  document.querySelectorAll('.btn-retry-dte').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await adminFetch('/dte/retry', {
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


  document.querySelectorAll('.btn-set-app-mode').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      if (!confirm('¿Cambiar la plataforma a ' + mode + '? Esto afecta pagos demo vs reales.')) return;
      try {
        const res = await adminFetch('/modo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode })
        });
        const data = await res.json();
        if (!data.success) {
          FundezNotify.show(data.error || 'No se pudo cambiar el modo', 'error');
          return;
        }
        FundezNotify.show('Modo: ' + data.label, 'success');
        setTimeout(() => location.reload(), 700);
      } catch (_) {
        FundezNotify.show('Error al cambiar modo', 'error');
      }
    });
  });
