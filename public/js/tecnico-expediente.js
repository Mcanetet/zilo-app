(function () {
  const page = document.getElementById('dossierPage');
  if (!page) return;

  function fileToDataUrl(input) {
    return new Promise((resolve, reject) => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('Selecciona un archivo'));
      if (file.size > 6 * 1024 * 1024) return reject(new Error('El archivo supera 6 MB'));
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  }

  const saveSpecsBtn = document.getElementById('btnSaveTechSpecialties');
  if (saveSpecsBtn) {
    saveSpecsBtn.addEventListener('click', async () => {
      const specialties = Array.from(document.querySelectorAll('.tech-specialty:checked')).map((el) => el.value);
      saveSpecsBtn.disabled = true;
      try {
        const res = await fetch(`/proveedor/equipo/${page.dataset.techId}/especialidades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ specialties })
        });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.error || 'No se pudo guardar');
        FundezNotify.show('Especialidades actualizadas', 'success');
      } catch (err) {
        FundezNotify.show(err.message || 'No se pudo guardar', 'error');
      } finally {
        saveSpecsBtn.disabled = false;
      }
    });
  }

  document.querySelectorAll('[data-upload]').forEach((button) => {
    button.addEventListener('click', async () => {
      const type = button.dataset.upload;
      const input = document.querySelector(`[data-doc-type="${type}"]`);
      const label = document.querySelector(`[data-label-for="${type}"]`)?.value.trim() || '';
      button.disabled = true;
      try {
        const data = await fileToDataUrl(input);
        const res = await fetch(`/proveedor/equipo/${page.dataset.techId}/expediente/documento`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ type, data, label })
        });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.error || 'No se pudo guardar');
        FundezNotify.show('Documento guardado', 'success');
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        button.disabled = false;
        FundezNotify.show(err.message || 'No se pudo subir', 'error');
      }
    });
  });
})();
