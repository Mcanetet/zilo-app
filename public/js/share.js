(function () {
  const page = document.getElementById('invitarPage');
  if (!page) return;

  const shareUrl = page.dataset.shareUrl;
  const code = page.dataset.code;
  const shareText = `¡Prueba Fundez! Servicios del hogar en Santiago. Usa mi código ${code} y ganamos $5.000 cada uno: ${shareUrl}`;

  document.getElementById('btnCopyCode')?.addEventListener('click', () => {
    navigator.clipboard.writeText(code).then(() => FundezNotify.show('Código copiado', 'success'));
  });

  document.getElementById('btnShare')?.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Fundez — Invitación', text: shareText, url: shareUrl });
      } catch (_) {}
    } else {
      navigator.clipboard.writeText(shareText).then(() => FundezNotify.show('Enlace copiado para compartir', 'success'));
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
      FundezNotify.show(data.message, 'success');
      input.value = '';
    } else FundezNotify.show(data.error, 'error');
  });
})();
