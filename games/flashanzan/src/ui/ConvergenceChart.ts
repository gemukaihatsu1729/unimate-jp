import type { SeriesProblem } from '../types';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createConvergenceChartSvg(problem: SeriesProblem): string {
  const width = 320;
  const height = 112;
  const padLeft = 18;
  const padRight = 56;
  const padTop = 18;
  const padBottom = 18;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const sampleCount = 12;
  const sums: number[] = [];
  let running = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const term = problem.getNumericTerm(i);
    running += Number.isFinite(term) ? term : 0;
    sums.push(running);
  }

  let minY = Math.min(0, ...sums);
  let maxY = Math.max(...sums);
  if (problem.expected.kind === 'finite') {
    minY = Math.min(minY, problem.expected.value);
    maxY = Math.max(maxY, problem.expected.value);
  }

  const span = Math.max(0.25, maxY - minY);
  const yLow = minY - span * 0.14;
  const yHigh = maxY + span * 0.16;
  const yRange = yHigh - yLow;

  const toX = (idx: number): number =>
    padLeft + (idx / Math.max(1, sampleCount - 1)) * plotW;
  const toY = (val: number): number =>
    padTop + (1 - (val - yLow) / yRange) * plotH;

  const points = sums.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  const zeroY = toY(0);
  const zeroLine =
    zeroY >= padTop && zeroY <= height - padBottom
      ? `<line x1="${padLeft}" y1="${zeroY.toFixed(1)}" x2="${width - padRight}" y2="${zeroY.toFixed(1)}" stroke="rgba(148,163,184,0.22)" stroke-width="1" />`
      : '';

  let targetOverlay = '';
  if (problem.expected.kind === 'finite') {
    const limY = toY(problem.expected.value);
    const labelText = `L=${problem.expected.display}`;
    targetOverlay = `
      <line x1="${padLeft}" y1="${limY.toFixed(1)}" x2="${width - padRight + 6}" y2="${limY.toFixed(1)}"
            stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="4 3" />
      <text x="${width - padRight + 10}" y="${(limY + 4).toFixed(1)}"
            fill="#fde68a" font-size="11" font-weight="700" font-family="ui-monospace, SFMono-Regular, monospace">${escapeXml(labelText)}</text>
    `;
  } else {
    const lastX = toX(sampleCount - 1);
    const lastY = toY(sums[sampleCount - 1]);
    targetOverlay = `
      <path d="M ${lastX.toFixed(1)} ${lastY.toFixed(1)} L ${(lastX + 16).toFixed(1)} ${Math.max(10, lastY - 14).toFixed(1)}"
            stroke="#fb7185" stroke-width="2" stroke-dasharray="3 2" fill="none" />
      <text x="${width - padRight + 10}" y="${Math.max(20, lastY - 8).toFixed(1)}"
            fill="#fda4af" font-size="13" font-weight="800" font-family="ui-monospace, SFMono-Regular, monospace">→ ∞</text>
    `;
  }

  const dots = sums
    .map((v, i) => {
      const cx = toX(i).toFixed(1);
      const cy = toY(v).toFixed(1);
      const r = i === sampleCount - 1 ? 3.5 : 2.5;
      const fill = problem.expected.kind === 'finite' ? '#34d399' : '#fb7185';
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`;
    })
    .join('');

  const lineColor = problem.expected.kind === 'finite' ? '#10b981' : '#f43f5e';

  return `
    <svg class="convergence-svg" viewBox="0 0 ${width} ${height}" width="100%" height="112" role="img" aria-label="部分和の収束グラフ">
      <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="#040b08" stroke="rgba(52,211,153,0.22)" />
      ${zeroLine}
      ${targetOverlay}
      <polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
      <text x="${padLeft}" y="${height - 5}" fill="rgba(148,163,184,0.72)" font-size="9" font-family="ui-monospace, monospace">n=1</text>
      <text x="${(width - padRight - 20).toFixed(1)}" y="${height - 5}" fill="rgba(148,163,184,0.72)" font-size="9" font-family="ui-monospace, monospace">n=${sampleCount}</text>
    </svg>
  `.trim();
}
