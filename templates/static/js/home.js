(() => {
  const root = document.documentElement;
  const toggle = document.querySelector('[data-theme-toggle]');
  const themePreference = window.matchMedia('(prefers-color-scheme: light)');
  const savedTheme = window.localStorage.getItem('readiness-theme');

  const setTheme = (theme) => {
    root.dataset.theme = theme;
    if (!toggle) return;
    const isDark = theme === 'dark';
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
    toggle.querySelector('.theme-toggle-icon').textContent = isDark ? '☼' : '☾';
    toggle.querySelector('.theme-toggle-label').textContent = isDark ? 'Light theme' : 'Dark theme';
  };

  setTheme(savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : (themePreference.matches ? 'light' : 'dark'));

  toggle?.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem('readiness-theme', nextTheme);
    setTheme(nextTheme);
  });

  themePreference.addEventListener('change', (event) => {
    if (!window.localStorage.getItem('readiness-theme')) {
      setTheme(event.matches ? 'light' : 'dark');
    }
  });

  const header = document.querySelector('.site-header');
  const syncHeaderTransparency = () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  syncHeaderTransparency();
  window.addEventListener('scroll', syncHeaderTransparency, { passive: true });

  const navLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];
  const navSections = navLinks
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  const activateNavLink = (sectionId) => {
    navLinks.forEach((link) => {
      const isActive = link.hash === `#${sectionId}`;
      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  navLinks.forEach((link) => {
    link.addEventListener('click', () => activateNavLink(link.hash.slice(1)));
  });

  if ('IntersectionObserver' in window && navSections.length) {
    const sectionVisibility = new Map();
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => sectionVisibility.set(entry.target.id, entry.intersectionRatio));
      const mostVisible = [...sectionVisibility.entries()]
        .filter(([, ratio]) => ratio > 0)
        .sort((a, b) => b[1] - a[1])[0];
      if (mostVisible) activateNavLink(mostVisible[0]);
    }, { rootMargin: '-20% 0px -45% 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75] });

    navSections.forEach((section) => sectionObserver.observe(section));
  }

  const cards = document.querySelectorAll('.theme-card');
  if (!cards.length || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  cards.forEach((card) => {
    card.style.opacity = '0';
    card.style.translate = '0 14px';
    card.style.transition = 'opacity 500ms ease, translate 500ms ease, transform 300ms ease';
    observer.observe(card);
  });

  document.querySelectorAll('.theme-card').forEach((card) => {
    card.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'opacity' && card.classList.contains('is-visible')) {
        card.style.opacity = '';
        card.style.translate = '';
        card.style.transition = '';
      }
    }, { once: true });
  });

  const style = document.createElement('style');
  style.textContent = '.theme-card.is-visible{opacity:1!important;translate:0 0!important}';
  document.head.append(style);
})();
