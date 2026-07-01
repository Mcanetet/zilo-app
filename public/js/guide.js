(function () {
  const modal = document.getElementById('guideModal');
  if (!modal) return;

  const backdrop = document.getElementById('guideModalBackdrop');
  const closeBtn = document.getElementById('guideModalClose');
  const okBtn = document.getElementById('guideModalOk');

  function open() {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-open-guide]').forEach(btn => {
    btn.addEventListener('click', open);
  });

  backdrop?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);
  okBtn?.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });
})();
