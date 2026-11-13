/** Minimal dependency-free stacked monthly bar chart (heating vs cooling electricity). */
import type { DayResult } from './model';

interface MonthBar { key: string; heat: number; cool: number; cost: number }

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const observers = new WeakMap<HTMLElement, ResizeObserver>();

/** Renders at the container's real pixel width and re-renders when it changes, so text stays legible on phones. */
export function renderMonthlyChart(host: HTMLElement, rows: DayResult[]) {
  observers.get(host)?.disconnect();
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.round(host.clientWidth);
    if (w > 0 && Math.abs(w - lastW) > 4) {
      lastW = w;
      draw(host, rows, w);
    }
  });
  ro.observe(host);
  observers.set(host, ro);
  lastW = Math.round(host.clientWidth) || 900;
  draw(host, rows, lastW);
}

function draw(host: HTMLElement, rows: DayResult[], width: number) {
  const map = new Map<string, MonthBar>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    let m = map.get(key);
    if (!m) map.set(key, (m = { key, heat: 0, cool: 0, cost: 0 }));
    m.heat += r.heatElecDay + r.heatElecNight;
    m.cool += r.coolElecDay + r.coolElecNight;
    m.cost += r.cost;
  }
  const bars = [...map.values()];
  const W = Math.max(280, width), H = W < 600 ? 220 : 260, L = W < 600 ? 40 : 52, R = 8, T = 10, B = 26;
  const compact = W < 600;
  const max = niceMax(Math.max(...bars.map((b) => b.heat + b.cool), 0));
  const bw = (W - L - R) / Math.max(bars.length, 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const gap = Math.min(2, bw * 0.15);
  const barW = Math.max(1, bw - gap);
  const r = Math.min(4, barW / 2);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Monthly heat-pump electricity, heating and cooling stacked">`;
  for (const t of ticks) {
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" />`;
    const label = compact && t >= 1000 ? `${+(t / 1000).toFixed(1)}k` : fmt(t);
    svg += `<text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${label}</text>`;
  }
  bars.forEach((b, i) => {
    const x = L + i * bw + gap / 2;
    const yh = y(b.heat);
    const yt = y(b.heat + b.cool);
    // Heating anchored to the baseline; cooling on top with a 2px surface gap and rounded data end.
    if (b.heat > 0) {
      const top = b.cool > 0 ? 0 : r;
      svg += `<path d="${roundedTop(x, yh, barW, y(0) - yh, top)}" fill="var(--series-heat)" />`;
    }
    if (b.cool > 0) {
      const h = Math.max(0, yh - yt - (b.heat > 0 ? 2 : 0));
      svg += `<path d="${roundedTop(x, yt, barW, h, r)}" fill="var(--series-cool)" />`;
    }
    svg += `<rect data-i="${i}" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" />`;
    const few = bars.length <= (compact ? 7 : 14);
    if (few || (b.key.endsWith('-01') && (!compact || bars.length < 48 || Number(b.key.slice(0, 4)) % 2 === 0))) {
      const label = few ? b.key.slice(5) + '/' + b.key.slice(2, 4) : compact ? `'${b.key.slice(2, 4)}` : b.key.slice(0, 4);
      svg += `<text x="${x}" y="${H - 8}" font-size="11" fill="var(--muted)">${label}</text>`;
    }
  });
  svg += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)" /></svg>`;

  host.innerHTML = `
    <div class="legend"><span><i style="background:var(--series-heat)"></i>Heating</span><span><i style="background:var(--series-cool)"></i>Cooling</span><span>kWh electricity per month</span></div>
    <div class="chart">${svg}<div class="tip" hidden></div></div>`;
  const chart = host.querySelector<HTMLElement>('.chart')!;
  const tip = host.querySelector<HTMLElement>('.tip')!;
  const show = (e: PointerEvent) => {
    const t = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
    const i = t?.getAttribute?.('data-i');
    if (i === null || i === undefined || !t || !chart.contains(t)) { tip.hidden = true; return; }
    const b = bars[Number(i)];
    tip.innerHTML = `<b>${b.key}</b><br>Heating ${fmt(b.heat)} kWh<br>Cooling ${fmt(b.cool)} kWh<br>Cost € ${fmt(b.cost)}`;
    tip.hidden = false;
    const rect = chart.getBoundingClientRect();
    const px = e.clientX - rect.left;
    tip.style.left = `${Math.max(0, Math.min(px + 12, rect.width - tip.offsetWidth - 4))}px`;
    tip.style.top = `${Math.max(0, e.clientY - rect.top - tip.offsetHeight - 10)}px`;
  };
  chart.addEventListener('pointermove', show);
  chart.addEventListener('pointerdown', show);
  chart.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; });
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
