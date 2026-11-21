import type { TermDisplay } from '../types';

export function renderTermInto(container: HTMLElement, term: TermDisplay, inBlankGap: boolean): void {
  if (inBlankGap) {
    container.classList.add('is-blank');
    return;
  }

  container.classList.remove('is-blank');
  container.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.className = 'math-term';

  const maxLen =
    term.kind === 'plain'
      ? (term.text ?? '').length
      : Math.max((term.numerator ?? '').length, (term.denominator ?? '').length);

  if (maxLen >= 14) {
    wrapper.classList.add('scale-xxs');
  } else if (maxLen >= 10) {
    wrapper.classList.add('scale-xs');
  } else if (maxLen >= 7) {
    wrapper.classList.add('scale-sm');
  } else if (maxLen >= 5) {
    wrapper.classList.add('scale-md');
  }

  if (term.sign) {
    const signEl = document.createElement('span');
    signEl.className = term.sign === '-' ? 'math-sign is-minus' : 'math-sign is-plus';
    signEl.textContent = term.sign;
    wrapper.appendChild(signEl);
  }

  if (term.kind === 'plain') {
    const plainEl = document.createElement('span');
    plainEl.className = 'math-plain';
    plainEl.textContent = term.text ?? '';
    wrapper.appendChild(plainEl);
  } else {
    const fracEl = document.createElement('span');
    fracEl.className = 'math-frac';

    const numEl = document.createElement('span');
    numEl.className = 'math-num';
    numEl.textContent = term.numerator ?? '';

    const barEl = document.createElement('span');
    barEl.className = 'math-bar';

    const denEl = document.createElement('span');
    denEl.className = 'math-den';
    denEl.textContent = term.denominator ?? '';

    fracEl.append(numEl, barEl, denEl);
    wrapper.appendChild(fracEl);
  }

  container.appendChild(wrapper);
}
