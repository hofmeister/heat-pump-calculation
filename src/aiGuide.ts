/**
 * Instructions for AI assistants (ChatGPT, Claude, Gemini…). One source for:
 *  - /llms.txt (generated at build time, see vite.config.ts)
 *  - the "Copy prompt for any AI" button (with the user's current values)
 *  - the "Copy results for your AI" button
 *
 * Must stay free of DOM access so it can run in Node during the build.
 */
import { DEFAULT_SPECS } from './defaults';
import { AREA_KEYS, changedKeys, stateToLines } from './importer';
import type { Results } from './model';
import { en } from './locales/en';
import { help } from './locales/help.en';
import { CONSUMPTION_BANDS } from './prices';
import { defaultState, type AppState } from './storage';

export const SITE_URL = 'https://hofmeister.github.io/heat-pump-calculation/';

const UNITS: Record<string, string> = {
  heatingIndoorTemp: '°C', designOutdoorTemp: '°C', designTransmissionLossW: 'W', designVentilationLossW: 'W', designHeatLoadOverrideKw: 'kW',
  pumpCount: 'count', heatCapMinus7: 'kW', heatCapPlus7: 'kW', copMinus7: '', copPlus7: '', heatCapFactor: 'factor',
  coolCapA35: 'kW', eerA35: '', coolCapLossPerK: 'fraction per °C', eerLossPerK: 'fraction per °C', fanCoilCapKw: 'kW', coolCapFactor: 'factor',
  coolingThreshold: '°C', hotDayThreshold: '°C', coolTransmissionKwK: 'kW/K', coolVentilationKwK: 'kW/K', internalGainsKw: 'kW',
  windowSolarFactor: 'factor', opaqueSolarFactor: 'factor', airflowM3h: 'm³/h', indoorRH: 'fraction 0–1', dehumidFactor: 'factor',
  comfortTargetTemp: '°C', comfortAreaM2: 'm²', totalFloorAreaM2: 'm²',
  winN: 'm²', winE: 'm²', winS: 'm²', winW: 'm²', opqN: 'm²', opqE: 'm²', opqS: 'm²', opqW: 'm²', opqH: 'm²', irLossKw: 'kW',
};
const AREA_HELP: Record<string, keyof typeof help> = {
  winN: 'winArea', winE: 'winArea', winS: 'winArea', winW: 'winArea',
  opqN: 'opqArea', opqE: 'opqArea', opqS: 'opqArea', opqW: 'opqArea', opqH: 'roofArea', irLossKw: 'irLoss',
};
const AREA_LABEL: Record<string, string> = {
  winN: 'Effective window area facing north', winE: 'Effective window area facing east', winS: 'Effective window area facing south', winW: 'Effective window area facing west',
  opqN: 'Effective wall area facing north', opqE: 'Effective wall area facing east', opqS: 'Effective wall area facing south', opqW: 'Effective wall area facing west',
  opqH: 'Effective roof / skylight area', irLossKw: 'Long-wave radiation loss to the sky',
};

const SECTION_KEYS: [string, string[]][] = [
  ['Building – heating', ['heatingIndoorTemp', 'designOutdoorTemp', 'designTransmissionLossW', 'designVentilationLossW', 'designHeatLoadOverrideKw']],
  ['Heat pumps', ['pumpCount', 'heatCapMinus7', 'heatCapPlus7', 'copMinus7', 'copPlus7', 'heatCapFactor', 'coolCapA35', 'eerA35', 'coolCapLossPerK', 'eerLossPerK', 'fanCoilCapKw', 'coolCapFactor']],
  ['Cooling loads', ['coolingThreshold', 'hotDayThreshold', 'coolTransmissionKwK', 'coolVentilationKwK', 'internalGainsKw', 'windowSolarFactor', 'opaqueSolarFactor', 'airflowM3h', 'indoorRH', 'dehumidFactor']],
  ['Night comfort cooling (optional)', ['comfortEnabled', 'comfortTargetTemp', 'comfortAreaM2', 'totalFloorAreaM2']],
  ['Solar areas (applied to all months)', AREA_KEYS as string[]],
];

function keyLine(key: string, value: unknown, valueLabel: string): string {
  const isArea = key in AREA_HELP;
  const h = help[(isArea ? AREA_HELP[key] : key) as keyof typeof help];
  const label = isArea ? AREA_LABEL[key] : (en.labels as Record<string, string>)[key] ?? key;
  const unit = UNITS[key] ? ` [${UNITS[key]}]` : '';
  return `- \`${key}\`${unit} — ${label}. ${valueLabel}: ${value === null || value === '' ? '(empty)' : value}.\n  What: ${h.what}\n  Find: ${h.find}`;
}

/** The full guide. `values` are the current inputs (defaults for llms.txt). */
export function buildGuide(opts: { siteUrl?: string; state?: AppState; language?: string } = {}): string {
  const url = opts.siteUrl ?? SITE_URL;
  const s = opts.state;
  const specs = s?.specs ?? DEFAULT_SPECS;
  const current = (k: string): unknown =>
    k in AREA_HELP ? (specs.solarAreas[6] as unknown as Record<string, number>)[k] : (specs as unknown as Record<string, unknown>)[k];

  const out: string[] = [];
  out.push(`# Heat Pump Calculator — instructions for AI assistants

> A free, browser-only calculator (${url}) that estimates a building's heat pump electricity use, running cost and capacity deficits for heating and cooling, using real hourly historical weather (Open-Meteo) and household electricity prices (Eurostat, EU countries). There is no backend and no API: the calculation runs in the user's browser. You fill it in by giving the user a link.

## Your job
1. ${opts.language ? `Talk to the user in ${opts.language}.` : 'Talk to the user in their language.'} Ask for the figures below, a few at a time, starting with location and heat pump model. Invite them to upload or photograph documents: heat pump datasheet/data book, energy performance certificate or heat-loss calculation, floor plan, electricity bill. Read the numbers from those documents yourself.
2. If the user names a heat pump model, look up its datasheet values if you can (capacity and COP at A-7 and A7 at their flow temperature; cooling capacity and EER at A35/W7).
3. When a value is unknown, estimate it with the rules of thumb in "Find" and tell the user which values are estimates. Leave out keys you have no basis for; the calculator keeps its current value.
4. Give the user ONE clickable link to the calculator with the values in the URL fragment (after #), formatted as described below. Also give the same values as a \`key=value\` block they can paste into the app's "Paste the AI's answer" box if the link doesn't open.
5. After the user presses Calculate, they can press "Copy results for your AI" and paste the results back to you. Then help them interpret the results (running cost, whether the heat pump is big enough, deficit days) and suggest changes as a new link.

## Link format
${url}#key=value&key=value&…
- Use the keys exactly as listed below. Decimal separator is a dot. URL-encode spaces and commas in place names (%20, %2C).
- Location: \`place\` (e.g. \`place=Lyon%2C%20France\`) is looked up automatically. Add \`lat\`, \`lon\` and \`country\` (ISO 3166-1 alpha-2, used for Eurostat prices) if you know them.
- Period: \`from=YYYY-MM-DD\` (default ${s?.startDate ?? '2021-01-01'}), \`to=YYYY-MM-DD\` or empty for "up to yesterday". 5+ full years is best.
- Prices: \`tariff\` = the user's all-in price in €/kWh (empty = latest Eurostat price); \`price.2025-S2=0.31\` overrides one half-year; \`band\` = Eurostat consumption band, one of ${CONSUMPTION_BANDS.map((b) => `\`${b.code}\` (${b.label})`).join(', ')}.
- Example: ${url}#place=Lyon%2C%20France&country=FR&pumpCount=1&heatCapMinus7=7.9&heatCapPlus7=10.9&copMinus7=2.7&copPlus7=4.4&designTransmissionLossW=6500&designVentilationLossW=2100&designOutdoorTemp=-7&tariff=0.25

## Inputs`);

  out.push(`\n### Location, period and prices
- \`place\`, \`lat\`, \`lon\`, \`country\` — ${help.location.what} ${help.location.find}${s ? ` Current: ${s.location.name} (${s.location.latitude}, ${s.location.longitude}, ${s.location.countryCode}).` : ''}
- \`from\`, \`to\` — ${help.period.what} ${help.period.find}
- \`band\` — ${help.band.what} ${help.band.find}${s ? ` Current: ${s.band}.` : ''}
- \`tariff\` [€/kWh] — ${help.fallbackTariff.what} ${help.fallbackTariff.find}${s ? ` Current: ${s.specs.fallbackTariff ?? '(latest Eurostat)'}.` : ''}
- \`price.YYYY-S1|S2\` [€/kWh] — ${help.priceOverrides.what} ${help.priceOverrides.find}`);

  for (const [title, keys] of SECTION_KEYS) {
    out.push(`\n### ${title}`);
    for (const k of keys) out.push(keyLine(k, current(k), s ? 'Current' : 'Default'));
  }

  out.push(`\n## How the model works (so you can explain results)
- Each day is split into daylight and night; demand is evaluated at each period's mean outdoor temperature.
- Heating demand = design heat load × (indoor − outdoor) / (indoor − design temperature). Heat pump capacity and COP are interpolated linearly between −7 °C and +7 °C (held constant outside). Electricity = delivered heat / COP. If demand exceeds capacity, the period is a "heat deficit".
- Cooling runs when the period mean exceeds the cooling setpoint: transmission + ventilation × ΔT + solar gains + internal gains − sky radiation + dehumidification. Capacity and EER are derated above 35 °C and capped by the fan-coil capacity.
- Cost = electricity × the tariff for that half-year. Not included: hot water, standing charges, thermal mass, per-room distribution. Results are indicative.

## Privacy
Everything the user enters stays in their browser (localStorage). The link fragment (after #) is never sent to the website's server.
`);
  return out.join('\n');
}

/** Short prompt for chat links (chatgpt.com/?q=…, claude.ai/new?q=…). */
export function shortPrompt(template: string, language: string, siteUrl = SITE_URL, state?: AppState): string {
  let p = template.replace('{url}', siteUrl).replace('{guide}', `${siteUrl}llms.txt`).replace('{language}', language);
  const mine = state ? customLines(state) : [];
  if (mine.length) p += `\n\nWhat I've entered so far: ${mine.join('&')}`;
  return p;
}

/** key=value lines for only the inputs the user has changed from the example defaults. */
export function customLines(state: AppState): string[] {
  const changed = new Set(changedKeys(defaultState(), state));
  const keep = (line: string) => {
    const k = line.slice(0, line.indexOf('='));
    if (['place', 'lat', 'lon', 'country'].includes(k)) return changed.has('location');
    if (k === 'from' || k === 'to') return changed.has('period');
    if (k === 'tariff') return changed.has('fallbackTariff');
    if (k.startsWith('price.')) return changed.has('priceOverrides');
    return changed.has(k);
  };
  return stateToLines(state).filter(keep);
}

const r0 = (v: number) => Math.round(v).toLocaleString('en-US');

/** Plain-text results to paste back into an AI chat. Always English: the AI replies in the user's language. */
export function resultsForAi(state: AppState, r: Results, siteUrl = SITE_URL): string {
  const comfort = state.specs.comfortEnabled;
  const full = r.years.filter((y) => y.days >= 365);
  const avg = (f: (y: Results['years'][number]) => number) => (full.length ? r0(full.reduce((a, y) => a + f(y), 0) / full.length) : 'n/a (no full year)');
  const c = r.cap;
  const lines = [
    `My heat pump calculator results (${siteUrl}):`,
    `Location: ${state.location.name} (${state.location.latitude}, ${state.location.longitude}). Period: ${state.startDate} → ${state.endDate ?? 'yesterday'}.`,
    '',
    `Average per full year (${full.length} full years): cost € ${avg((y) => (comfort ? y.totalCostInclComfort : y.cost))}${comfort ? ' incl. night comfort cooling' : ''}; electricity ${avg((y) => y.elecTotal)} kWh (heating ${avg((y) => y.heatElec)}, cooling ${avg((y) => y.coolElec)}).`,
    `Heating capacity at the design temperature (${state.specs.designOutdoorTemp} °C): heat pumps ${c.pumpsAtDesignKw.toFixed(2)} kW vs. demand ${c.designHeatLoadKw.toFixed(2)} kW → ${c.pumpsAtDesignKw >= c.designHeatLoadKw ? 'enough' : 'NOT enough'}.`,
    `Deficit days over the whole period: heating ${r.tot.heatDeficitDays}, cooling ${r.tot.coolDeficitDays}. Heat not delivered ${r0(c.heatUnmetKwh)} kWh, cooling not delivered ${r0(c.coolUnmetKwh)} kWh. Max cooling demand ${c.maxCoolDemandKw.toFixed(2)} kW. Highest hourly temperature ${c.maxHourlyTemp ?? 'n/a'} °C.`,
    '',
    `| Year | Days | Frost days | Days ≥${state.specs.hotDayThreshold} °C | Heating kWh | Cooling kWh | Total kWh | Cost € | Heat deficit days | Cool deficit days |`,
    '|---|---|---|---|---|---|---|---|---|---|',
    ...r.years.map((y) => `| ${y.year}${y.days < 365 ? ' (partial)' : ''} | ${y.days} | ${y.frostDays} | ${y.hotDays} | ${r0(y.heatElec)} | ${r0(y.coolElec)} | ${r0(y.elecTotal)} | ${r0(comfort ? y.totalCostInclComfort : y.cost)} | ${y.heatDeficitDays} | ${y.coolDeficitDays} |`),
    '',
    'Inputs used (to try changes, give me a new link in this format — see the instructions at ' + `${siteUrl}llms.txt):`,
    `${siteUrl}#${stateToLines(state).map((l) => { const i = l.indexOf('='); return `${l.slice(0, i)}=${encodeURIComponent(l.slice(i + 1))}`; }).join('&')}`,
    '',
    'Please explain what these results mean for me, whether the heat pump is sized right, and what I could change.',
  ];
  return lines.join('\n');
}

/** Full prompt for assistants without web access: guide + the user's current inputs. */
export function fullPrompt(state: AppState, language: string, siteUrl = SITE_URL): string {
  return `I want to estimate my heat pump's running cost with a free calculator. Please follow these instructions.\n\n${buildGuide({ siteUrl, state, language })}`;
}

