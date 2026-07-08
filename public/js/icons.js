window.FundezIcons = {
  svg(icon, size = 24) {
    const icons = {
      electrico: '<path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/><path d="M8 20L5 17" opacity="0.5"/>',
      gasfiter: '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
      cerrajero: '<circle cx="8" cy="16" r="4"/><path d="M12 16V4l6 4-6 4"/><path d="M18 8h2a2 2 0 012 2v1"/>',
      termos: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 3V1h6v2"/><path d="M9 14h6"/><path d="M10 18h4"/><path d="M12 7v3" stroke-width="2"/>',
      lavavajillas: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M7 14h.01M11 14h.01M15 14h.01"/><path d="M7 6V3M12 6V3M17 6V3"/>',
      lavadora: '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="13" r="5"/><circle cx="12" cy="13" r="2"/><path d="M8 6h.01M11 6h.01"/>'
    };
    const paths = icons[icon] || '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>';
    return `<svg class="zilo-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  },

  wrap(icon, color, sizeClass = 'w-14 h-14', iconSize = 32) {
    return `<span class="zilo-icon-wrap ${sizeClass} rounded-2xl flex items-center justify-center shrink-0" style="--icon-accent:${color}">${this.svg(icon, iconSize)}</span>`;
  }
};
