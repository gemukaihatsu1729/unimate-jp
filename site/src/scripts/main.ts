import '../styles/main.css';

function setupMobileNav(): void {
  const toggleBtn = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const nav = document.querySelector<HTMLElement>('[data-nav-menu]');
  if (!toggleBtn || !nav) return;

  toggleBtn.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
    toggleBtn.textContent = isOpen ? '✕' : '☰';
  });
}

function setupCategoryFilter(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-category]'));
  if (buttons.length === 0 || items.length === 0) return;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.filter || 'all';
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));

      items.forEach((item) => {
        const categories = (item.dataset.category || '').split(/\s+/).filter(Boolean);
        const match = target === 'all' || categories.includes(target);
        item.classList.toggle('is-hidden', !match);
      });
    });
  });
}

setupMobileNav();
setupCategoryFilter();
