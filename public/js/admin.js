(function () {
  const dashboard = document.getElementById('adminDashboard');
  if (!dashboard) return;

  const tabs = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.admin-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;
      tabs.forEach(t => {
        t.className = 'admin-tab';
      });
      tab.className = 'admin-tab admin-tab-active';
      panels.forEach(p => p.classList.toggle('hidden', p.dataset.panel !== id));
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
          statusLabel.className = `service-status text-[10px] font-bold uppercase ${enabled ? 'text-emerald-400' : 'text-red-400'}`;
          ZiloNotify.show(`${data.service.name} ${enabled ? 'activado' : 'desactivado'}`, enabled ? 'success' : 'warning');
        }
      } catch (_) {
        toggle.checked = !enabled;
        ZiloNotify.show('Error al actualizar servicio', 'error');
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
        ZiloNotify.show('Reclamo actualizado', 'success');
        setTimeout(() => location.reload(), 800);
      }
    });
  });

  document.querySelectorAll('.btn-mark-payout').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await fetch(`/admin/payout/${btn.dataset.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        ZiloNotify.show('Pago a proveedor registrado', 'success');
        setTimeout(() => location.reload(), 800);
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
      statusLabel.className = `service-status text-[10px] font-bold uppercase ${service.enabled ? 'text-emerald-400' : 'text-red-400'}`;
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
        ZiloNotify.show('Configuración de backups guardada', 'success');
        setTimeout(() => location.reload(), 900);
      } else ZiloNotify.show(data.error || 'Error al guardar', 'error');
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
      ZiloNotify.show(`Backup creado (${data.backup.stats?.totalBytes ? Math.round(data.backup.stats.totalBytes / 1024) + ' KB' : 'ok'})`, 'success');
      setTimeout(() => location.reload(), 900);
    } else ZiloNotify.show(data.error || 'Error al generar backup', 'error');
  });

  document.getElementById('btnApplyRetention')?.addEventListener('click', async () => {
    const res = await fetch('/admin/backups/retention', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      ZiloNotify.show(data.removed ? `${data.removed} backup(s) antiguo(s) eliminado(s)` : 'No había backups por eliminar', 'info');
      setTimeout(() => location.reload(), 900);
    }
  });

  document.querySelectorAll('.btn-delete-backup').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este backup?')) return;
      const res = await fetch(`/admin/backups/${btn.dataset.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        btn.closest('.backup-item')?.remove();
        ZiloNotify.show('Backup eliminado', 'success');
      }
    });
  });
})();
