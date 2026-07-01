(function () {
  const page = document.getElementById('invitarPage');
  if (!page) return;

  const shareUrl = page.dataset.shareUrl;
  const code = page.dataset.code;
  const shareText = `¡Prueba Zilo! Servicios del hogar en Santiago. Usa mi código ${code} y ganamos $5.000 cada uno: ${shareUrl}`;

  document.getElementById('btnCopyCode')?.addEventListener('click', () => {
    navigator.clipboard.writeText(code).then(() => ZiloNotify.show('Código copiado', 'success'));
  });

  document.getElementById('btnShare')?.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Zilo — Invitación', text: shareText, url: shareUrl });
      } catch (_) {}
    } else {
      navigator.clipboard.writeText(shareText).then(() => ZiloNotify.show('Enlace copiado para compartir', 'success'));
    }
  });

  document.getElementById('btnApplyCode')?.addEventListener('click', async () => {
    const input = document.getElementById('inputReferralCode');
    const res = await fetch('/cliente/aplicar-codigo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: input.value })
    });
    const data = await res.json();
    if (data.success) {
      ZiloNotify.show(data.message, 'success');
      input.value = '';
    } else ZiloNotify.show(data.error, 'error');
  });
})();
