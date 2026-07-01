(function () {
  const profilePage = document.getElementById('providerProfilePage');
  if (!profilePage) return;

  const providerId = profilePage.dataset.providerId;

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadDocument(type, file, label) {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      ZiloNotify.show('El archivo no puede superar 6 MB', 'warning');
      return;
    }
    const data = await fileToBase64(file);
    const res = await fetch('/proveedor/verificacion/documento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data, label })
    });
    const json = await res.json();
    if (json.success) {
      ZiloNotify.show('Documento guardado', 'success');
      updateVerificationUI(json.verification);
      if (json.url && json.url !== 'demo') previewDoc(type, json.url);
    } else ZiloNotify.show(json.error || 'Error al subir', 'error');
  }

  function previewDoc(type, url) {
    const el = document.getElementById(`preview-${type}`);
    if (!el || url === 'demo') return;
    if (url.endsWith('.pdf')) {
      el.innerHTML = `<a href="${url}" target="_blank" class="text-xs text-zilo-accent underline">Ver PDF</a>`;
    } else {
      el.innerHTML = `<img src="${url}" alt="" class="mt-2 rounded-lg max-h-24 border border-zilo-border">`;
    }
  }

  ['idFront', 'idBack'].forEach(type => {
    document.getElementById(`input-${type}`)?.addEventListener('change', async (e) => {
      await uploadDocument(type, e.target.files[0]);
    });
  });

  document.getElementById('input-certificate')?.addEventListener('change', async (e) => {
    const label = document.getElementById('certLabel')?.value || 'Certificado';
    await uploadDocument('certificate', e.target.files[0], label);
    e.target.value = '';
  });

  function updateVerificationUI(v) {
    if (!v) return;
    const badge = document.getElementById('verificationStatusBadge');
    if (badge) {
      const labels = { verified: 'Verificado', pending: 'En revisión', incomplete: 'Incompleto' };
      badge.textContent = labels[v.status] || v.status;
      badge.className = `zilo-badge ${v.status === 'verified' ? 'zilo-badge-success' : ''}`;
    }
    document.getElementById('check-idFront')?.classList.toggle('text-zilo-success', !!v.idCardFront);
    document.getElementById('check-idBack')?.classList.toggle('text-zilo-success', !!v.idCardBack);
    document.getElementById('check-face')?.classList.toggle('text-zilo-success', !!v.faceVerified);
    if (v.faceVerified && document.getElementById('faceScore')) {
      document.getElementById('faceScore').textContent = `Puntaje: ${v.faceScore}%`;
    }
  }

  // ——— Cámara / verificación facial ———
  const faceModal = document.getElementById('faceModal');
  const faceVideo = document.getElementById('faceVideo');
  const faceCanvas = document.getElementById('faceCanvas');
  let faceStream = null;

  function cameraErrorMessage(err) {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Permiso de cámara denegado. En Chrome: candado → Cámara → Permitir, y recarga la página.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No se detectó ninguna cámara en este dispositivo.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'La cámara está en uso por otra app (Zoom, Meet, etc.). Ciérrala e intenta de nuevo.';
    }
    if (name === 'SecurityError') {
      return 'La cámara solo funciona en localhost o HTTPS. Usa http://localhost:3000';
    }
    if (name === 'OverconstrainedError') {
      return 'No se pudo usar la cámara frontal. Prueba subir una foto.';
    }
    return 'No se pudo acceder a la cámara. Prueba subir una foto o recarga la página.';
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
    }
    const attempts = [
      { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
      { video: true, audio: false }
    ];
    let lastErr;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  async function openFaceModal() {
    faceModal?.classList.remove('hidden');
    const statusEl = document.getElementById('faceCameraStatus');
    if (statusEl) statusEl.textContent = 'Solicitando acceso a la cámara...';
    try {
      faceStream = await startCamera();
      if (faceVideo) {
        faceVideo.srcObject = faceStream;
        await faceVideo.play();
        if (statusEl) statusEl.textContent = '';
      }
    } catch (err) {
      console.warn('Camera error:', err?.name, err?.message);
      ZiloNotify.show(cameraErrorMessage(err), 'error');
      if (statusEl) statusEl.textContent = '';
      closeFaceModal();
    }
  }

  function closeFaceModal() {
    faceModal?.classList.add('hidden');
    if (faceStream) {
      faceStream.getTracks().forEach(t => t.stop());
      faceStream = null;
    }
  }

  document.getElementById('btnOpenFace')?.addEventListener('click', openFaceModal);
  document.getElementById('faceModalClose')?.addEventListener('click', closeFaceModal);
  document.getElementById('faceModalBackdrop')?.addEventListener('click', closeFaceModal);

  document.getElementById('btnCaptureFace')?.addEventListener('click', async () => {
    if (!faceVideo || !faceCanvas) return;
    if (!faceVideo.videoWidth) {
      ZiloNotify.show('Espera a que la cámara cargue o sube una foto', 'warning');
      return;
    }
    const ctx = faceCanvas.getContext('2d');
    faceCanvas.width = faceVideo.videoWidth;
    faceCanvas.height = faceVideo.videoHeight;
    ctx.drawImage(faceVideo, 0, 0);
    await submitSelfie(faceCanvas.toDataURL('image/jpeg', 0.85));
  });

  async function submitSelfie(data) {
    const btn = document.getElementById('btnCaptureFace');
    if (btn) btn.disabled = true;
    const res = await fetch('/proveedor/verificacion/selfie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    });
    const json = await res.json();
    if (btn) btn.disabled = false;

    if (json.success) {
      ZiloNotify.show(json.faceResult?.message || 'Identidad verificada', 'success');
      updateVerificationUI(json.verification);
      const preview = document.getElementById('preview-selfie');
      if (preview && json.url) {
        preview.innerHTML = `<img src="${json.url}" alt="" class="rounded-xl max-h-32 border border-zilo-border">`;
      }
      closeFaceModal();
    } else {
      ZiloNotify.show(json.error || 'Verificación fallida', 'error');
    }
  }

  document.getElementById('input-selfieFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      ZiloNotify.show('La foto no puede superar 6 MB', 'warning');
      return;
    }
    const data = await fileToBase64(file);
    await submitSelfie(data);
    e.target.value = '';
  });

  // ——— Ubicación ———
  document.getElementById('btnLocationConsent')?.addEventListener('click', async () => {
    if (!navigator.geolocation) {
      ZiloNotify.show('Tu navegador no soporta geolocalización', 'error');
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const res = await fetch('/proveedor/verificacion/ubicacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true })
      });
      const json = await res.json();
      if (json.success) {
        await fetch('/proveedor/ubicacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        });
        document.getElementById('locationStatus').textContent = 'Ubicación activa — los clientes verán tu recorrido';
        document.getElementById('check-location')?.classList.add('text-zilo-success');
        ZiloNotify.show('Permiso de ubicación concedido', 'success');
        updateVerificationUI(json.verification);
      }
    }, () => {
      ZiloNotify.show('Debes permitir la ubicación para trabajar con Zilo', 'warning');
    }, { enableHighAccuracy: true, timeout: 15000 });
  });

  document.getElementById('btnRevokeLocation')?.addEventListener('click', async () => {
    const res = await fetch('/proveedor/verificacion/ubicacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: false })
    });
    const json = await res.json();
    if (json.success) {
      document.getElementById('locationStatus').textContent = 'Ubicación desactivada';
      document.getElementById('check-location')?.classList.remove('text-zilo-success');
      ZiloNotify.show('Ubicación desactivada', 'info');
      updateVerificationUI(json.verification);
    }
  });
})();
