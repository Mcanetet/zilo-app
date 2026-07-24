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
    florencia: 'Florencia IA',
    'consumo-ia': 'Consumo OpenAI',
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
  socket.emit('aland_join', { admin: true });
  if (window.FundezAlerts) FundezAlerts.ensurePermission();
  socket.on('aland_security_alert', (payload) => {
    const preview = (payload?.preview || '').slice(0, 80);
    if (window.FundezAlerts) {
      FundezAlerts.notify({
        type: 'alert',
        title: `Alerta Aland IA (${payload?.type || 'seguridad'})`,
        body: preview || payload?.conversationId || 'Nueva alerta de seguridad',
        tag: 'fundez-admin-security',
        requireInteraction: true
      });
    } else if (window.FundezNotify) {
      FundezNotify.show(`Alerta Aland IA (${payload?.type || 'seguridad'}): ${preview || payload?.conversationId || ''}`, 'warning');
    }
  });
  socket.on('aland_payment_alert', (payload) => {
    const preview = (payload?.preview || '').slice(0, 60);
    if (window.FundezAlerts) {
      FundezAlerts.notify({
        type: 'payment',
        title: 'Pagos Aland IA',
        body: `${preview || 'Nueva consulta de pagos'} — revisa Mensajes`,
        tag: 'fundez-admin-payment'
      });
    } else if (window.FundezNotify) {
      FundezNotify.show(`Pagos Aland: ${preview || 'Nueva consulta'} — revisa Mensajes`, 'warning');
    }
  });
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

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderAlandKb(items) {
    if (!alandKbList) return;
    const canEdit = alandKbList.dataset.canEdit === '1';
    if (!items?.length) {
      alandKbList.innerHTML = `<p class="text-gray-500 p-2">${ADMIN_JS.noKb || 'Sin entradas.'}</p>`;
      return;
    }
    window.__alandKbItems = items;
    alandKbList.innerHTML = items.map((k) => `
      <div class="p-2 rounded-lg bg-zilo-bg border border-gray-200" data-kb-id="${escapeHtml(k.id)}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <strong class="text-violet-600 uppercase text-[10px]">${escapeHtml(k.sourceType)}</strong>
            <p class="font-medium">${escapeHtml(k.title)}</p>
            <p class="text-gray-500 line-clamp-2">${escapeHtml(k.content)}</p>
          </div>
          ${canEdit ? `<div class="flex flex-col gap-1 shrink-0">
            <button type="button" class="btn-aland-kb-edit text-[10px] px-2 py-1 rounded bg-white border border-gray-200" data-id="${escapeHtml(k.id)}">Editar</button>
            <button type="button" class="btn-aland-kb-del text-[10px] px-2 py-1 rounded bg-red-50 text-red-600 border border-red-100" data-id="${escapeHtml(k.id)}">Eliminar</button>
          </div>` : ''}
        </div>
      </div>
    `).join('');

    alandKbList.querySelectorAll('.btn-aland-kb-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = (window.__alandKbItems || []).find((x) => x.id === btn.dataset.id);
        if (!item || !alandKbForm) return;
        const idEl = document.getElementById('alandKbEditId');
        const titleEl = document.getElementById('alandKbTitle');
        const contentEl = document.getElementById('alandKbContent');
        const submitBtn = document.getElementById('btnAlandAddKb');
        const cancelBtn = document.getElementById('btnAlandKbCancel');
        if (idEl) idEl.value = item.id;
        if (titleEl) titleEl.value = item.title || '';
        if (contentEl) contentEl.value = item.content || '';
        if (submitBtn) submitBtn.textContent = 'Guardar cambios';
        cancelBtn?.classList.remove('hidden');
        alandKbForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    alandKbList.querySelectorAll('.btn-aland-kb-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta entrada de conocimiento?')) return;
        try {
          const res = await fetch(`/aland/admin/knowledge/${encodeURIComponent(btn.dataset.id)}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo eliminar');
          FundezNotify.show('Entrada eliminada', 'success');
          renderAlandKb(data.knowledge || []);
        } catch (err) {
          FundezNotify.show(err.message || 'Error', 'error');
        }
      });
    });
  }

  async function loadAlandAdmin() {
    if (!alandForm && !alandStatus && !alandKbList) return;
    try {
      if (alandForm || alandStatus) {
        const res = await fetch('/aland/admin/config', { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          if (alandStatus) {
            alandStatus.innerHTML = data.openaiConfigured
              ? '<strong class="text-emerald-600">OpenAI conectado</strong> · Agente: Aland IA'
              : '<strong class="text-red-600">Falta OPENAI_API_KEY</strong> en variables de entorno Hostinger';
          }
          if (data.config) setAlandFormValues(data.config);
        } else if (alandStatus) {
          alandStatus.textContent = 'Configuración solo visible con permiso aland.manage';
        }
      }
      if (alandKbList) {
        const kbRes = await fetch('/aland/admin/knowledge', { headers: { Accept: 'application/json' } });
        if (kbRes.ok) {
          const kbData = await kbRes.json();
          renderAlandKb(kbData.knowledge);
        }
      }
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
    e.stopPropagation();
    const errEl = document.getElementById('alandKbFormError');
    if (errEl) {
      errEl.classList.add('hidden');
      errEl.textContent = '';
    }
    const btn = document.getElementById('btnAlandAddKb');
    const cancelBtn = document.getElementById('btnAlandKbCancel');
    const idEl = document.getElementById('alandKbEditId');
    const editId = (idEl?.value || '').trim();
    const fd = new FormData(alandKbForm);
    const title = String(fd.get('title') || '').trim();
    const content = String(fd.get('content') || '').trim();
    const existing = editId ? (window.__alandKbItems || []).find((x) => x.id === editId) : null;
    if (!title || !content) {
      if (errEl) {
        errEl.textContent = 'Completa título y contenido (o una URL pública).';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (btn) btn.disabled = true;
    try {
      const url = editId
        ? `/aland/admin/knowledge/${encodeURIComponent(editId)}`
        : '/aland/admin/knowledge';
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          title,
          content,
          sourceType: existing?.sourceType || 'custom',
          serviceId: existing?.serviceId || null,
          active: true
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `No se pudo guardar (${res.status})`);
      }
      FundezNotify.show(editId ? 'Conocimiento actualizado' : 'Conocimiento agregado', 'success');
      alandKbForm.reset();
      if (idEl) idEl.value = '';
      if (btn) btn.textContent = 'Agregar conocimiento';
      cancelBtn?.classList.add('hidden');
      renderAlandKb(data.knowledge || []);
      if (!data.knowledge) loadAlandAdmin();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Error al guardar';
        errEl.classList.remove('hidden');
      }
      FundezNotify.show(err.message || 'Error al guardar conocimiento', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById('btnAlandKbCancel')?.addEventListener('click', () => {
    alandKbForm?.reset();
    const idEl = document.getElementById('alandKbEditId');
    if (idEl) idEl.value = '';
    const btn = document.getElementById('btnAlandAddKb');
    if (btn) btn.textContent = 'Agregar conocimiento';
    document.getElementById('btnAlandKbCancel')?.classList.add('hidden');
  });

  /* ——— Aland Monitor (tiempo real) ——— */
  const alandMonitor = document.getElementById('alandMonitor');
  const alandMonitorList = document.getElementById('alandMonitorList');
  const alandMonitorThread = document.getElementById('alandMonitorThread');
  const alandMonitorTitle = document.getElementById('alandMonitorChatTitle');
  const alandMonitorAlerts = document.getElementById('alandMonitorAlerts');
  const alandMonitorFilter = document.getElementById('alandMonitorFilter');
  let alandMonitorActiveId = null;
  let alandMonitorConvCache = [];

  function formatTokens(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(v);
  }

  function alandStatusLabel(s) {
    return {
      ai_active: 'Aland IA',
      awaiting_provider: 'Socio',
      awaiting_admin: 'Admin',
      closed: 'Cerrada'
    }[s] || s;
  }

  function renderMonitorMsg(msg) {
    const type = msg.senderType || '';
    const isAlert = Boolean(msg.meta?.securityAlert || msg.meta?.risk === 'injection' || msg.meta?.type === 'prompt_injection');
    const align = type === 'client' ? 'text-left' : 'text-right';
    let bg = 'bg-white border border-gray-200';
    if (type === 'aland') bg = 'bg-violet-50 border border-violet-100';
    if (type === 'admin' || type === 'provider') bg = 'bg-zilo-accent text-white border-transparent';
    if (type === 'system' || isAlert) bg = 'bg-amber-50 border border-amber-200 text-amber-900';
    const usage = msg.meta?.usage?.total_tokens
      ? `<span class="opacity-60"> · ${formatTokens(msg.meta.usage.total_tokens)} tok</span>`
      : '';
    const body = escapeHtml(msg.body || '');
    return `<div class="${align}"><div class="inline-block max-w-[95%] px-2 py-1.5 rounded-lg ${bg}"><span class="block text-[9px] opacity-70">${escapeHtml(msg.senderName || type)}${usage}</span>${body}</div></div>`;
  }

  function renderMonitorStats(stats) {
    const root = document.getElementById('alandMonitorStats');
    if (!root || !stats) return;
    const map = {
      active: stats.active,
      conversations: stats.conversations,
      tokensToday: formatTokens(stats.tokensToday),
      tokensTotal: formatTokens(stats.tokensTotal),
      injections: stats.injections,
      injectionsToday: stats.injectionsToday
    };
    Object.entries(map).forEach(([key, val]) => {
      const el = root.querySelector(`[data-stat="${key}"]`);
      if (el) el.textContent = val;
    });
  }

  function renderMonitorList(items) {
    if (!alandMonitorList) return;
    alandMonitorConvCache = items || [];
    if (!items?.length) {
      alandMonitorList.innerHTML = '<p class="text-gray-500 p-2">Sin conversaciones.</p>';
      return;
    }
    alandMonitorList.innerHTML = items.map((c) => {
      const inj = Number(c.injectionCount) || 0;
      const active = c.id === alandMonitorActiveId ? 'border-violet-400 ring-1 ring-violet-200' : 'border-gray-200';
      return `<button type="button" class="w-full text-left p-2.5 rounded-xl bg-zilo-bg border ${active} hover:border-violet-300 aland-mon-item" data-id="${escapeHtml(c.id)}">
        <div class="flex justify-between gap-2">
          <strong class="truncate">${escapeHtml(c.clientName || 'Cliente')}</strong>
          <span class="text-[10px] text-violet-600 shrink-0">${alandStatusLabel(c.status)}</span>
        </div>
        <p class="text-gray-500 mt-0.5 truncate">${escapeHtml(c.serviceName || '')}</p>
        <div class="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-500">
          <span>${formatTokens(c.tokensTotal)} tok</span>
          ${inj ? `<span class="text-red-600 font-semibold">${inj} injection${inj > 1 ? 's' : ''}</span>` : ''}
        </div>
      </button>`;
    }).join('');
    alandMonitorList.querySelectorAll('.aland-mon-item').forEach((btn) => {
      btn.addEventListener('click', () => openAlandMonitorChat(btn.dataset.id));
    });
  }

  function renderMonitorAlerts(alerts) {
    if (!alandMonitorAlerts) return;
    if (!alerts?.length) {
      alandMonitorAlerts.innerHTML = '<p class="text-gray-500">Sin alertas recientes.</p>';
      return;
    }
    alandMonitorAlerts.innerHTML = alerts.map((a) => {
      const when = a.createdAt ? new Date(a.createdAt).toLocaleString('es-CL') : '';
      const preview = escapeHtml((a.meta?.preview || a.body || '').slice(0, 100));
      return `<button type="button" class="w-full text-left p-2 rounded-lg bg-amber-50 border border-amber-200 hover:border-amber-400 aland-mon-alert" data-id="${escapeHtml(a.conversationId)}">
        <div class="flex justify-between gap-2"><strong>${escapeHtml(a.clientName || 'Cliente')}</strong><span class="text-gray-500">${escapeHtml(when)}</span></div>
        <p class="text-amber-900 mt-0.5">${preview}</p>
      </button>`;
    }).join('');
    alandMonitorAlerts.querySelectorAll('.aland-mon-alert').forEach((btn) => {
      btn.addEventListener('click', () => openAlandMonitorChat(btn.dataset.id));
    });
  }

  async function loadAlandMonitorStats() {
    if (!alandMonitor) return;
    try {
      const res = await fetch('/aland/admin/monitor/stats', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      const data = await res.json();
      if (data.success) renderMonitorStats(data.stats);
    } catch (_) { /* ignore */ }
  }

  async function loadAlandMonitorList() {
    if (!alandMonitorList) return;
    try {
      const filter = alandMonitorFilter?.value || '';
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await fetch(`/aland/admin/monitor/conversations${qs}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      const data = await res.json();
      let items = data.conversations || [];
      if (!filter) {
        items = items.filter((c) => c.status !== 'closed').concat(
          items.filter((c) => c.status === 'closed').slice(0, 10)
        );
      }
      renderMonitorList(items);
    } catch (_) {
      alandMonitorList.innerHTML = '<p class="text-red-600 p-2">Error cargando conversaciones.</p>';
    }
  }

  async function loadAlandMonitorAlerts() {
    if (!alandMonitorAlerts) return;
    try {
      const res = await fetch('/aland/admin/monitor/alerts?limit=40', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (data.success) renderMonitorAlerts(data.alerts || []);
    } catch (_) { /* ignore */ }
  }

  async function openAlandMonitorChat(id) {
    if (!id) return;
    alandMonitorActiveId = id;
    renderMonitorList(alandMonitorConvCache);
    try {
      const res = await fetch(`/aland/admin/monitor/conversations/${encodeURIComponent(id)}/messages`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!data.success) return;
      const c = data.conversation || {};
      if (alandMonitorTitle) {
        alandMonitorTitle.textContent = `${c.clientName || 'Cliente'} · ${c.serviceName || ''} · ${formatTokens(c.tokensTotal)} tok${c.injectionCount ? ` · ${c.injectionCount} inj.` : ''}`;
      }
      if (alandMonitorThread) {
        alandMonitorThread.innerHTML = (data.messages || []).map(renderMonitorMsg).join('');
        alandMonitorThread.scrollTop = alandMonitorThread.scrollHeight;
      }
      if (window.io) {
        socket.emit('aland_join', { conversationId: id, admin: true });
      }
    } catch (_) { /* ignore */ }
  }

  function upsertMonitorConversation(conv) {
    if (!conv?.id) return;
    const idx = alandMonitorConvCache.findIndex((c) => c.id === conv.id);
    if (idx >= 0) alandMonitorConvCache[idx] = { ...alandMonitorConvCache[idx], ...conv };
    else alandMonitorConvCache.unshift(conv);
    const filter = alandMonitorFilter?.value || '';
    let items = alandMonitorConvCache;
    if (filter) items = items.filter((c) => c.status === filter);
    else items = items.filter((c) => c.status !== 'closed').concat(items.filter((c) => c.status === 'closed').slice(0, 10));
    renderMonitorList(items);
  }

  if (alandMonitor) {
    loadAlandMonitorStats();
    loadAlandMonitorList();
    loadAlandMonitorAlerts();
    setInterval(() => {
      loadAlandMonitorStats();
      loadAlandMonitorList();
      loadAlandMonitorAlerts();
    }, 30000);

    alandMonitorFilter?.addEventListener('change', () => loadAlandMonitorList());

    socket.on('aland_monitor_update', (payload) => {
      if (payload?.conversation) upsertMonitorConversation(payload.conversation);
      if (payload?.conversationId === alandMonitorActiveId && payload?.message && alandMonitorThread) {
        alandMonitorThread.insertAdjacentHTML('beforeend', renderMonitorMsg(payload.message));
        alandMonitorThread.scrollTop = alandMonitorThread.scrollHeight;
      }
      if (payload?.usage || payload?.securityAlert) loadAlandMonitorStats();
      if (payload?.securityAlert) loadAlandMonitorAlerts();
    });

    socket.on('aland_security_alert', () => {
      loadAlandMonitorStats();
      loadAlandMonitorAlerts();
      loadAlandMonitorList();
    });

    socket.on('aland_escalated', (payload) => {
      if (payload?.conversation) upsertMonitorConversation(payload.conversation);
      loadAlandMonitorList();
    });

    socket.on('aland_message', (payload) => {
      if (payload?.conversationId === alandMonitorActiveId && payload?.message && alandMonitorThread) {
        alandMonitorThread.insertAdjacentHTML('beforeend', renderMonitorMsg(payload.message));
        alandMonitorThread.scrollTop = alandMonitorThread.scrollHeight;
      }
    });
  }

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
        adminAlandSocket.on('aland_security_alert', (payload) => {
          const preview = (payload?.preview || '').slice(0, 80);
          if (window.FundezNotify) {
            FundezNotify.show(
              `Alerta Aland IA (${payload?.type || 'seguridad'}): ${preview || payload?.conversationId || ''}`,
              'warning'
            );
          }
          loadMensajesList();
        });
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

  if (document.getElementById('alandConfigForm') || document.getElementById('alandMonitor') || document.getElementById('mensajesList')) {
    loadAlandAdmin();
    loadMensajesList();
    setInterval(loadMensajesList, 45000);
  }

  /* ——— Florencia IA ——— */
  const florenciaAgenda = document.getElementById('florenciaAgenda');
  const florenciaForm = document.getElementById('florenciaPlanForm');
  const florenciaFilter = document.getElementById('florenciaStatusFilter');
  const canFlorenciaManage = florenciaAgenda?.dataset.canManage === '1';
  const canFlorenciaApprove = florenciaAgenda?.dataset.canApprove === '1';
  const canFlorenciaPublish = florenciaAgenda?.dataset.canPublish === '1';

  function florenciaDate(value) {
    if (!value) return 'Sin fecha';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Sin fecha' : d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function florenciaStatusLabel(status) {
    return {
      draft: 'Borrador',
      pending_approval: 'Por aprobar',
      approved: 'Aprobado',
      publishing: 'Publicando',
      published: 'Publicado',
      rejected: 'Rechazado',
      failed: 'Error'
    }[status] || status;
  }

  function renderFlorenciaAgenda(items, connections = {}) {
    if (!florenciaAgenda) return;
    const strategyBox = document.getElementById('florenciaStrategy');
    const strategy = items.find((item) => item.content?.strategy)?.content?.strategy;
    if (strategyBox && strategy) {
      const list = (label, values) => Array.isArray(values) && values.length
        ? `<div><p class="text-[10px] uppercase text-gray-500">${label}</p><p class="text-xs">${values.map(escapeHtml).join(' · ')}</p></div>`
        : '';
      strategyBox.innerHTML = `<p class="text-sm font-semibold mb-2">Plan estratégico de Florencia</p>
        ${strategy.positioning ? `<p class="text-xs text-gray-700 mb-3">${escapeHtml(strategy.positioning)}</p>` : ''}
        <div class="grid sm:grid-cols-2 gap-3">
          ${list('Objetivos', strategy.objectives)}
          ${list('Audiencias', strategy.audiences)}
          ${list('Pilares', strategy.pillars)}
          ${list('Indicadores', strategy.kpis)}
        </div>`;
      strategyBox.classList.remove('hidden');
    } else {
      strategyBox?.classList.add('hidden');
    }
    if (!items.length) {
      florenciaAgenda.innerHTML = '<div class="p-5 rounded-2xl border border-dashed border-gray-300 text-center text-xs text-gray-500">Florencia todavía no creó piezas. Genera el primer plan.</div>';
      return;
    }
    florenciaAgenda.innerHTML = items.map((item) => {
      const c = item.content || {};
      const hashtags = (c.hashtags || []).map((h) => `#${String(h).replace(/^#/, '')}`).join(' ');
      const safeTitle = String(item.title || 'florencia').replace(/[^\w\-]+/g, '_').slice(0, 40);
      const image = item.imageUrl
        ? `<a href="${escapeHtml(item.imageUrl)}" target="_blank" rel="noopener" class="block shrink-0" title="Abrir imagen">
             <img src="${escapeHtml(item.imageUrl)}" alt="" class="w-full sm:w-36 h-36 object-cover rounded-xl border border-gray-200">
           </a>`
        : '<div class="w-full sm:w-36 h-24 sm:h-36 rounded-xl bg-gradient-to-br from-fuchsia-100 to-violet-100 flex items-center justify-center text-xs text-fuchsia-700 shrink-0">Imagen pendiente</div>';
      const manage = canFlorenciaManage && item.status !== 'published'
        ? `<button type="button" data-florencia-chat="${item.id}" class="px-2.5 py-1.5 rounded-lg bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-700 text-xs">Hablar con Florencia</button>
           <button type="button" data-florencia-image="${item.id}" class="px-2.5 py-1.5 rounded-lg border border-fuchsia-200 text-fuchsia-700 text-xs">${item.imageUrl ? 'Regenerar imagen' : 'Generar imagen'}</button>
           <button type="button" data-florencia-edit="${item.id}" class="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs">Editar</button>`
        : (canFlorenciaManage
          ? `<button type="button" data-florencia-chat="${item.id}" class="px-2.5 py-1.5 rounded-lg bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-700 text-xs">Hablar con Florencia</button>`
          : '');
      const approve = canFlorenciaApprove && item.status === 'pending_approval'
        ? `<button type="button" data-florencia-approve="${item.id}" class="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs">Aprobar</button>
           <button type="button" data-florencia-reject="${item.id}" class="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs">Rechazar</button>`
        : '';
      const publish = canFlorenciaPublish && item.status === 'approved' && connections[item.channel]
        ? `<button type="button" data-florencia-publish="${item.id}" class="px-2.5 py-1.5 rounded-lg bg-fuchsia-600 text-white text-xs">Publicar ahora</button>`
        : (item.status === 'approved' && !connections[item.channel]
          ? '<span class="text-[10px] text-amber-700 self-center">Aprobada · usa Descargar para publicar a mano o configura la conexión</span>'
          : '');
      const downloads = `
        ${item.imageUrl
          ? `<button type="button" data-florencia-download-image="${item.id}" data-url="${escapeHtml(item.imageUrl)}" data-filename="florencia-${escapeHtml(item.channel)}-${escapeHtml(safeTitle)}.png" class="px-2.5 py-1.5 rounded-lg bg-zilo-accent text-white text-xs font-medium">Descargar imagen</button>`
          : ''}
        <button type="button" data-florencia-download-copy="${item.id}" class="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium">Descargar texto</button>
        <button type="button" data-florencia-copy-clipboard="${item.id}" class="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs">Copiar texto</button>`;
      return `<article class="p-4 rounded-2xl bg-zilo-card border border-gray-200" data-florencia-item="${item.id}">
        <div class="flex flex-col sm:flex-row gap-4">
          ${image}
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap justify-between gap-2 mb-2">
              <div>
                <span class="text-[10px] uppercase font-semibold text-fuchsia-700">${escapeHtml(item.channel)}</span>
                <h4 class="text-sm font-semibold">${escapeHtml(item.title)}</h4>
              </div>
              <div class="text-right">
                <span class="text-[10px] px-2 py-1 rounded-full bg-gray-100">${escapeHtml(florenciaStatusLabel(item.status))}</span>
                <p class="text-[10px] text-gray-500 mt-1">${escapeHtml(florenciaDate(item.scheduledAt))}</p>
              </div>
            </div>
            ${c.subject ? `<p class="text-xs font-semibold mb-1">Asunto: ${escapeHtml(c.subject)}</p>` : ''}
            <p class="text-xs text-gray-700 whitespace-pre-wrap mb-2" data-role="florencia-copy">${escapeHtml(c.copy || '')}</p>
            ${c.cta ? `<p class="text-xs font-semibold text-zilo-accent" data-role="florencia-cta">${escapeHtml(c.cta)}</p>` : ''}
            ${hashtags ? `<p class="text-[11px] text-fuchsia-700 mt-1" data-role="florencia-hashtags">${escapeHtml(hashtags)}</p>` : ''}
            ${item.error ? `<p class="text-[11px] text-red-600 mt-2">${escapeHtml(item.error)}</p>` : ''}
            <div class="flex flex-wrap gap-2 mt-3">${downloads}${manage}${approve}${publish}</div>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  async function loadFlorenciaAgenda() {
    if (!florenciaAgenda) return;
    const status = florenciaFilter?.value || '';
    try {
      const res = await adminFetch(`/florencia/items${status ? `?status=${encodeURIComponent(status)}` : ''}`, {
        headers: { Accept: 'application/json' }
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo cargar');
      renderFlorenciaAgenda(data.items || [], data.connections || {});
    } catch (err) {
      florenciaAgenda.innerHTML = `<p class="text-xs text-red-600">${escapeHtml(err.message)}</p>`;
    }
  }

  florenciaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = florenciaForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Florencia está creando el plan…';
    try {
      const form = new FormData(florenciaForm);
      const payload = Object.fromEntries(form.entries());
      payload.autoImages = form.has('autoImages');
      const res = await adminFetch('/florencia/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo generar');
      FundezNotify.show(`Florencia creó ${data.items?.length || 0} piezas para aprobación`, 'success');
      await loadFlorenciaAgenda();
    } catch (err) {
      FundezNotify.show(err.message || 'Error al generar el plan', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Generar estrategia y agenda';
    }
  });

  florenciaAgenda?.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    async function downloadBlob(url, filename) {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('No se pudo descargar el archivo');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename || 'florencia-asset';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    }

    function buildCopyPack(card) {
      const title = card?.querySelector('h4')?.textContent?.trim() || 'Pieza Florencia';
      const channel = card?.querySelector('.text-fuchsia-700.uppercase')?.textContent?.trim() || '';
      const copy = card?.querySelector('[data-role="florencia-copy"]')?.textContent || '';
      const cta = card?.querySelector('[data-role="florencia-cta"]')?.textContent || '';
      const tags = card?.querySelector('[data-role="florencia-hashtags"]')?.textContent || '';
      return [
        'Florencia IA · Fundez',
        channel ? `Canal: ${channel}` : '',
        `Título: ${title}`,
        '',
        copy,
        cta ? `\nCTA: ${cta}` : '',
        tags ? `\n${tags}` : ''
      ].filter(Boolean).join('\n').trim();
    }

    if (button.dataset.florenciaDownloadImage) {
      button.disabled = true;
      try {
        await downloadBlob(button.dataset.url, button.dataset.filename || 'florencia.png');
        FundezNotify.show('Imagen descargada', 'success');
      } catch (err) {
        FundezNotify.show(err.message || 'No se pudo descargar la imagen', 'error');
      } finally {
        button.disabled = false;
      }
      return;
    }

    if (button.dataset.florenciaDownloadCopy) {
      const card = button.closest('[data-florencia-item]');
      const pack = buildCopyPack(card);
      const blob = new Blob([pack], { type: 'text/plain;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `florencia-${button.dataset.florenciaDownloadCopy}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      FundezNotify.show('Texto descargado', 'success');
      return;
    }

    if (button.dataset.florenciaCopyClipboard) {
      const card = button.closest('[data-florencia-item]');
      const pack = buildCopyPack(card);
      try {
        await navigator.clipboard.writeText(pack);
        FundezNotify.show('Texto copiado al portapapeles', 'success');
      } catch (_) {
        FundezNotify.show('No se pudo copiar. Usa Descargar texto.', 'warning');
      }
      return;
    }

    if (button.dataset.florenciaChat) {
      const card = button.closest('[data-florencia-item]');
      openFlorenciaChat(button.dataset.florenciaChat, card?.querySelector('h4')?.textContent?.trim() || '');
      return;
    }

    const id = button.dataset.florenciaImage
      || button.dataset.florenciaApprove
      || button.dataset.florenciaReject
      || button.dataset.florenciaPublish
      || button.dataset.florenciaEdit;
    if (!id) return;

    if (button.dataset.florenciaEdit) {
      const card = button.closest('[data-florencia-item]');
      const copy = prompt('Edita el texto de la pieza:', card?.querySelector('[data-role="florencia-copy"]')?.textContent || '');
      if (copy == null) return;
      button.disabled = true;
      try {
        const currentRes = await adminFetch(`/florencia/items?id=${encodeURIComponent(id)}`);
        const currentData = await currentRes.json();
        const item = (currentData.items || []).find((x) => x.id === id);
        const res = await adminFetch(`/florencia/items/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: { ...(item?.content || {}), copy } })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo editar');
        await loadFlorenciaAgenda();
      } catch (err) {
        FundezNotify.show(err.message, 'error');
        button.disabled = false;
      }
      return;
    }

    let endpoint;
    if (button.dataset.florenciaImage) endpoint = 'image';
    if (button.dataset.florenciaApprove) endpoint = 'approve';
    if (button.dataset.florenciaReject) endpoint = 'reject';
    if (button.dataset.florenciaPublish) {
      if (!confirm('¿Publicar/enviar esta pieza ahora? Esta acción usa la conexión real configurada.')) return;
      endpoint = 'publish';
    }
    let body = {};
    if (endpoint === 'reject') {
      const reason = prompt('Motivo del rechazo:');
      if (reason == null) return;
      body = { reason };
    }
    button.disabled = true;
    const original = button.textContent;
    button.textContent = endpoint === 'image' ? 'Generando…' : 'Procesando…';
    try {
      const res = await adminFetch(`/florencia/items/${encodeURIComponent(id)}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo completar');
      FundezNotify.show(endpoint === 'publish' ? 'Pieza publicada' : 'Pieza actualizada', 'success');
      await loadFlorenciaAgenda();
    } catch (err) {
      FundezNotify.show(err.message, 'error');
      button.disabled = false;
      button.textContent = original;
    }
  });

  florenciaFilter?.addEventListener('change', loadFlorenciaAgenda);
  document.getElementById('btnFlorenciaReload')?.addEventListener('click', loadFlorenciaAgenda);

  const florenciaChatPanel = document.getElementById('florenciaChatPanel');
  const florenciaChatThread = document.getElementById('florenciaChatThread');
  const florenciaChatForm = document.getElementById('florenciaChatForm');
  const florenciaChatItemId = document.getElementById('florenciaChatItemId');
  const florenciaChatContext = document.getElementById('florenciaChatContext');
  const btnFlorenciaChatClearItem = document.getElementById('btnFlorenciaChatClearItem');
  const canFlorenciaChat = florenciaChatPanel?.dataset.canChat === '1';

  function renderFlorenciaChat(messages = []) {
    if (!florenciaChatThread) return;
    if (!messages.length) {
      florenciaChatThread.innerHTML = '<p class="text-gray-500 text-center py-6">Cuéntale a Florencia qué quieres cambiar en el copy o en la imagen.</p>';
      return;
    }
    florenciaChatThread.innerHTML = messages.map((msg) => {
      const mine = msg.role === 'user';
      const applied = Array.isArray(msg.meta?.applied) && msg.meta.applied.length
        ? `<p class="text-[10px] mt-1 opacity-80">${msg.meta.regenerated ? 'Imagen regenerada · ' : ''}Cambios: ${escapeHtml(msg.meta.applied.map((a) => a.type).join(', '))}</p>`
        : '';
      return `<div class="flex ${mine ? 'justify-end' : 'justify-start'}">
        <div class="max-w-[85%] px-3 py-2 rounded-2xl ${mine ? 'bg-fuchsia-600 text-white' : 'bg-white border border-gray-200 text-gray-800'}">
          <p class="text-[10px] font-semibold mb-0.5 ${mine ? 'text-fuchsia-100' : 'text-fuchsia-700'}">${mine ? 'Tú' : 'Florencia'}</p>
          <p class="whitespace-pre-wrap leading-relaxed">${escapeHtml(msg.body || '')}</p>
          ${applied}
        </div>
      </div>`;
    }).join('');
    florenciaChatThread.scrollTop = florenciaChatThread.scrollHeight;
  }

  async function loadFlorenciaChat() {
    if (!florenciaChatThread) return;
    const itemId = florenciaChatItemId?.value || '';
    try {
      const res = await adminFetch(`/florencia/chat${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ''}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'No se pudo cargar el chat');
      renderFlorenciaChat(data.messages || []);
      if (data.item && florenciaChatContext) {
        florenciaChatContext.textContent = `Pieza: ${data.item.title || data.item.id}`;
      }
    } catch (err) {
      florenciaChatThread.innerHTML = `<p class="text-red-600">${escapeHtml(err.message)}</p>`;
    }
  }

  function openFlorenciaChat(itemId, title = '') {
    if (!florenciaChatPanel) return;
    if (florenciaChatItemId) florenciaChatItemId.value = itemId || '';
    if (florenciaChatContext) {
      florenciaChatContext.textContent = itemId
        ? `Pieza: ${title || itemId}`
        : 'Chat general';
    }
    btnFlorenciaChatClearItem?.classList.toggle('hidden', !itemId);
    florenciaChatPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    loadFlorenciaChat();
    document.getElementById('florenciaChatInput')?.focus();
  }

  btnFlorenciaChatClearItem?.addEventListener('click', () => openFlorenciaChat('', ''));

  florenciaChatForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canFlorenciaChat) return;
    const input = document.getElementById('florenciaChatInput');
    const message = String(input?.value || '').trim();
    if (!message) return;
    const button = florenciaChatForm.querySelector('button[type="submit"]');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Florencia piensa…';
    try {
      const res = await adminFetch('/florencia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          itemId: florenciaChatItemId?.value || null
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'No se pudo enviar');
      input.value = '';
      renderFlorenciaChat(data.messages || []);
      if (data.item || data.regenerated || (data.applied && data.applied.length)) {
        await loadFlorenciaAgenda();
        const bits = [];
        if (data.applied?.length) bits.push('copy/imagen actualizados');
        if (data.regenerated) bits.push('nueva imagen generada');
        FundezNotify.show(bits.length ? `Florencia: ${bits.join(' · ')}` : 'Florencia respondió', 'success');
      }
    } catch (err) {
      FundezNotify.show(err.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  if (florenciaAgenda) {
    loadFlorenciaAgenda();
    loadFlorenciaChat();
    socket.on('florencia_update', loadFlorenciaAgenda);
  }

  /* ——— Consumo OpenAI ——— */
  const openaiUsagePanel = document.querySelector('[data-panel="consumo-ia"]');
  const openaiUsageDays = document.getElementById('openaiUsageDays');

  function formatUsd(n) {
    const value = Number(n) || 0;
    if (value < 0.01 && value > 0) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(2)}`;
  }

  function renderOpenaiUsage(data) {
    const totals = data.totals || {};
    const set = (key, value) => {
      const el = document.querySelector(`[data-usage="${key}"]`);
      if (el) el.textContent = value;
    };
    set('totalTokens', formatTokens(totals.totalTokens));
    set('splitTokens', `${formatTokens(totals.promptTokens)} / ${formatTokens(totals.completionTokens)}`);
    set('images', String(totals.images || 0));
    set('costUsd', formatUsd(totals.costUsd));

    const legacyNote = document.getElementById('openaiUsageLegacyNote');
    if (legacyNote) {
      if (data.legacyNote) {
        legacyNote.textContent = data.legacyNote;
        legacyNote.classList.remove('hidden');
      } else {
        legacyNote.classList.add('hidden');
      }
    }

    const agentsBox = document.getElementById('openaiUsageByAgent');
    if (agentsBox) {
      agentsBox.innerHTML = (data.byAgent || []).map((agent) => {
        const legacy = agent.legacy?.totalTokens
          ? `<p class="text-[10px] text-amber-700 mt-2">Histórico Aland: ${formatTokens(agent.legacy.totalTokens)} tok</p>`
          : '';
        return `<article class="p-4 rounded-2xl bg-zilo-card border border-gray-200">
          <p class="text-sm font-semibold mb-1">${escapeHtml(agent.label || agent.agent)}</p>
          <p class="text-2xl font-bold text-sky-700">${formatTokens(agent.totalTokens)}</p>
          <p class="text-[11px] text-gray-500 mt-1">${agent.requests || 0} llamadas · ${agent.images || 0} img · ${formatUsd(agent.costUsd)}</p>
          <p class="text-[10px] text-gray-500 mt-1">Prompt ${formatTokens(agent.promptTokens)} · Completion ${formatTokens(agent.completionTokens)}</p>
          ${legacy}
        </article>`;
      }).join('') || '<p class="text-xs text-gray-500">Sin consumo en este periodo.</p>';
    }

    const opsBox = document.getElementById('openaiUsageByOperation');
    if (opsBox) {
      opsBox.innerHTML = (data.byOperation || []).length
        ? data.byOperation.map((row) => `<div class="flex justify-between gap-3 py-1.5 border-b border-gray-50">
            <span><span class="font-medium capitalize">${escapeHtml(row.agent)}</span> · ${escapeHtml(row.operation)}</span>
            <span class="text-gray-600">${formatTokens(row.totalTokens)} tok${row.images ? ` · ${row.images} img` : ''}</span>
          </div>`).join('')
        : '<p class="text-gray-500">Sin operaciones registradas.</p>';
    }

    const dayBox = document.getElementById('openaiUsageByDay');
    if (dayBox) {
      const byDay = {};
      for (const row of (data.byDay || [])) {
        if (!byDay[row.day]) byDay[row.day] = { day: row.day, totalTokens: 0, images: 0 };
        byDay[row.day].totalTokens += row.totalTokens || 0;
        byDay[row.day].images += row.images || 0;
      }
      const days = Object.values(byDay).sort((a, b) => String(a.day).localeCompare(String(b.day)));
      const max = Math.max(1, ...days.map((d) => d.totalTokens));
      dayBox.innerHTML = days.length
        ? days.map((d) => {
          const pct = Math.max(4, Math.round((d.totalTokens / max) * 100));
          return `<div>
            <div class="flex justify-between mb-0.5"><span>${escapeHtml(d.day)}</span><span>${formatTokens(d.totalTokens)}</span></div>
            <div class="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full bg-sky-500 rounded-full" style="width:${pct}%"></div></div>
          </div>`;
        }).join('')
        : '<p class="text-gray-500">Sin actividad diaria aún.</p>';
    }

    const recentBody = document.getElementById('openaiUsageRecent');
    if (recentBody) {
      recentBody.innerHTML = (data.recent || []).length
        ? data.recent.map((row) => {
          const when = row.createdAt ? new Date(row.createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
          return `<tr class="border-b border-gray-50">
            <td class="py-2 pr-3 whitespace-nowrap">${escapeHtml(when)}</td>
            <td class="py-2 pr-3">${escapeHtml(row.label || row.agent)}</td>
            <td class="py-2 pr-3">${escapeHtml(row.operation || '—')}</td>
            <td class="py-2 pr-3 font-mono text-[10px]">${escapeHtml(row.model || '—')}${row.estimated ? ' *' : ''}</td>
            <td class="py-2 pr-3 text-right">${formatTokens(row.totalTokens)}</td>
            <td class="py-2 pr-3 text-right">${row.images || 0}</td>
            <td class="py-2 text-right">${formatUsd(row.costUsd)}</td>
          </tr>`;
        }).join('')
        : '<tr><td colspan="7" class="py-4 text-center text-gray-500">Todavía no hay registros. Se empiezan a guardar con cada llamada a OpenAI.</td></tr>';
    }
  }

  async function loadOpenaiUsage() {
    if (!openaiUsagePanel) return;
    try {
      const days = openaiUsageDays?.value || '30';
      const res = await adminFetch(`/openai-usage?days=${encodeURIComponent(days)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'No se pudo cargar el consumo');
      renderOpenaiUsage(data);
    } catch (err) {
      const agentsBox = document.getElementById('openaiUsageByAgent');
      if (agentsBox) agentsBox.innerHTML = `<p class="text-xs text-red-600">${escapeHtml(err.message)}</p>`;
    }
  }

  openaiUsageDays?.addEventListener('change', loadOpenaiUsage);
  document.getElementById('btnOpenaiUsageReload')?.addEventListener('click', loadOpenaiUsage);
  if (openaiUsagePanel) loadOpenaiUsage();

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
