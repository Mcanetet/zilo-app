(function () {
  const PAD = 10;
  let steps = [];
  let current = 0;
  let overlay = null;
  let spotlight = null;
  let card = null;
  let completeUrl = '';
  let active = false;
  let resizeHandler = null;

  function buildOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'ziloOnboarding';
    overlay.className = 'zilo-onboarding';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="zilo-onboarding-backdrop"></div>
      <div class="zilo-onboarding-spotlight" aria-hidden="true"></div>
      <div class="zilo-onboarding-card">
        <div class="zilo-onboarding-progress"><div class="zilo-onboarding-progress-fill"></div></div>
        <p class="zilo-onboarding-step-label zilo-label !text-[9px]"></p>
        <h3 class="zilo-onboarding-title zilo-display text-xl mb-2"></h3>
        <p class="zilo-onboarding-body text-sm text-zilo-muted leading-relaxed"></p>
        <div class="zilo-onboarding-actions">
          <button type="button" class="zilo-onboarding-skip">Omitir tour</button>
          <div class="zilo-onboarding-nav">
            <button type="button" class="zilo-onboarding-back zilo-btn-ghost !py-2.5 !text-xs !px-4">Atrás</button>
            <button type="button" class="zilo-onboarding-next zilo-btn-primary !py-2.5 !text-sm !px-5">Siguiente</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    spotlight = overlay.querySelector('.zilo-onboarding-spotlight');
    card = overlay.querySelector('.zilo-onboarding-card');

    overlay.querySelector('.zilo-onboarding-skip').addEventListener('click', () => finish(true));
    overlay.querySelector('.zilo-onboarding-back').addEventListener('click', () => go(-1));
    overlay.querySelector('.zilo-onboarding-next').addEventListener('click', () => go(1));
    overlay.querySelector('.zilo-onboarding-backdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) finish(true);
    });
  }

  function findTarget(selector) {
    if (!selector) return null;
    return document.querySelector(selector);
  }

  function positionUI(el) {
    if (!el || !spotlight || !card) return;
    const rect = el.getBoundingClientRect();
    const pad = PAD;

    spotlight.style.display = 'block';
    spotlight.style.top = `${Math.max(0, rect.top - pad)}px`;
    spotlight.style.left = `${Math.max(0, rect.left - pad)}px`;
    spotlight.style.width = `${rect.width + pad * 2}px`;
    spotlight.style.height = `${rect.height + pad * 2}px`;

    const radius = parseFloat(getComputedStyle(el).borderRadius) || 12;
    spotlight.style.borderRadius = `${Math.min(radius + 4, 24)}px`;

    el.classList.add('zilo-onboarding-highlight');
    document.querySelectorAll('.zilo-onboarding-highlight').forEach(node => {
      if (node !== el) node.classList.remove('zilo-onboarding-highlight');
    });

    requestAnimationFrame(() => {
      const cardH = card.offsetHeight;
      const cardW = card.offsetWidth;
      const margin = 16;
      let top = rect.bottom + margin;
      if (top + cardH > window.innerHeight - margin) {
        top = rect.top - cardH - margin;
      }
      if (top < margin) top = margin;

      let left = rect.left + rect.width / 2 - cardW / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));

      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
    });
  }

  function updateCard(step, index) {
    const total = steps.length;
    const progress = overlay.querySelector('.zilo-onboarding-progress-fill');
    const label = overlay.querySelector('.zilo-onboarding-step-label');
    const title = overlay.querySelector('.zilo-onboarding-title');
    const body = overlay.querySelector('.zilo-onboarding-body');
    const backBtn = overlay.querySelector('.zilo-onboarding-back');
    const nextBtn = overlay.querySelector('.zilo-onboarding-next');

    progress.style.width = `${((index + 1) / total) * 100}%`;
    label.textContent = `Paso ${index + 1} de ${total}`;
    title.textContent = step.title;
    body.textContent = step.body;
    backBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = index === total - 1 ? '¡Listo!' : 'Siguiente';
  }

  function showStep(index) {
    if (index < 0 || index >= steps.length) return;
    current = index;
    const step = steps[index];
    let el = findTarget(step.target);

    if (!el) {
      if (index < steps.length - 1) return showStep(index + 1);
      return finish(false);
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    setTimeout(() => {
      el = findTarget(step.target);
      if (!el) return showStep(index + 1);
      updateCard(step, index);
      positionUI(el);
    }, step.noScroll ? 0 : 400);
  }

  function go(delta) {
    const next = current + delta;
    if (next >= steps.length) return finish(false);
    if (next < 0) return;
    showStep(next);
  }

  let keyHandler = null;

  async function teardown(skipped) {
    if (!active) return;
    active = false;
    document.body.style.overflow = '';
    document.querySelectorAll('.zilo-onboarding-highlight').forEach(n => n.classList.remove('zilo-onboarding-highlight'));
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('scroll', resizeHandler, true);
      resizeHandler = null;
    }
    overlay?.classList.add('zilo-onboarding-out');
    setTimeout(() => {
      overlay?.remove();
      overlay = null;
      spotlight = null;
      card = null;
    }, 280);

    if (completeUrl) {
      try {
        await fetch(completeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skipped: !!skipped })
        });
      } catch (_) {}
    }

    if (!skipped) {
      FundezNotify?.show('¡Tour completado! Ya conoces Fundez', 'success');
    }
  }

  function finish(skipped) {
    teardown(skipped);
  }

  function bindReposition() {
    resizeHandler = () => {
      const step = steps[current];
      const el = step ? findTarget(step.target) : null;
      if (el) positionUI(el);
    };
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('scroll', resizeHandler, true);
  }

  function start(config) {
    if (!config?.steps?.length) return;
    steps = config.steps.filter(s => !s.optional || findTarget(s.target));
    completeUrl = config.completeUrl || '';
    if (!steps.length) return;

    buildOverlay();
    active = true;
    overlay.classList.remove('zilo-onboarding-out');
    document.body.style.overflow = 'hidden';
    bindReposition();
    showStep(0);

    keyHandler = (e) => {
      if (!active) return;
      if (e.key === 'Escape') finish(true);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', keyHandler);
  }

  window.FundezOnboarding = { start };

  document.addEventListener('DOMContentLoaded', () => {
    const cfgEl = document.getElementById('ziloOnboardingConfig');
    if (!cfgEl) return;
    try {
      const config = JSON.parse(cfgEl.textContent);
      document.querySelectorAll('[data-restart-tour]').forEach(btn => {
        btn.addEventListener('click', () => FundezOnboarding.start({ ...config, autoStart: false }));
      });
      if (config.autoStart) {
        setTimeout(() => FundezOnboarding.start(config), 700);
      }
    } catch (_) {}
  });
})();
