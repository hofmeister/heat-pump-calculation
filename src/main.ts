import './style.css';
import { renderMonthlyChart } from './chart';
import {
  capacityCheck, comfortShare, computeDay, designHeatLoadKw, summarizeByYear, totals,
  type DayResult, type MonthlyAreas, type Specs, type YearSummary,
} from './model';
import { buildTariffLookup, CONSUMPTION_BANDS, fetchEurostatPrices, semestersBetween, type BandCode } from './prices';
import * as store from './storage';
import { addDays, aggregate, fetchWeather, todayLocal, type WeatherData } from './weather';

// ------------------------------------------------------------------ state

let state: store.AppState = store.loadCurrent();
let weather: WeatherData | null = store.loadWeather();
let eurostat: Record<string, number> = {};
let eurostatInfo = '';
let busy = false;
let dailyFilter: 'all' | 'frost' | 'hot' | 'deficit' = 'hot';
let lastRows: DayResult[] = [];
let skipped: string[] = [];

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const n1 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = (v: number) => `€ ${n0(v)}`;

const endDate = () => state.endDate ?? addDays(todayLocal(), -1);

function setStatus(msg: string, error = false) {
  const el = $('#status');
  el.textContent = msg;
  el.classList.toggle('error', error);
}

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => store.saveCurrent(state), 250);
}

// ------------------------------------------------------------------ field definitions

type NumKey = { [K in keyof Specs]: Specs[K] extends number | null ? K : never }[keyof Specs];
interface FieldDef { key: NumKey; label: string; unit?: string; step?: number; help?: string; pct?: boolean }

const SECTIONS: { title: string; open?: boolean; fields: FieldDef[]; extra?: () => string }[] = [
  {
    title: 'Building – heating',
    open: true,
    fields: [
      { key: 'heatingIndoorTemp', label: 'Indoor temperature', unit: '°C', step: 0.5 },
      { key: 'designOutdoorTemp', label: 'Design outdoor temperature', unit: '°C', step: 0.1 },
      { key: 'designTransmissionLossW', label: 'Design transmission loss', unit: 'W', step: 10 },
      { key: 'designVentilationLossW', label: 'Design ventilation loss', unit: 'W', step: 10 },
      { key: 'designHeatLoadOverrideKw', label: 'Override design heat load (blank = sum above)', unit: 'kW', step: 0.1 },
    ],
    extra: () => `<p class="help" id="heatload-note">Design heat load used: <b>${n2(designHeatLoadKw(state.specs))} kW</b>. Demand scales linearly between indoor and design temperature; solar and occupant gains are ignored.</p>`,
  },
  {
    title: 'Heat pumps',
    open: true,
    fields: [
      { key: 'pumpCount', label: 'Number of pumps (space heating/cooling)', step: 1 },
      { key: 'heatCapMinus7', label: 'Heating capacity per pump at −7 °C', unit: 'kW', step: 0.1 },
      { key: 'heatCapPlus7', label: 'Heating capacity per pump at +7 °C', unit: 'kW', step: 0.1 },
      { key: 'copMinus7', label: 'COP at −7 °C', step: 0.01 },
      { key: 'copPlus7', label: 'COP at +7 °C', step: 0.01 },
      { key: 'heatCapFactor', label: 'Delivered heating capacity factor', step: 0.05, help: '0.9 simulates 10 % less capacity (e.g. defrost).' },
      { key: 'coolCapA35', label: 'Cooling capacity per pump at A35/W7', unit: 'kW', step: 0.1 },
      { key: 'eerA35', label: 'EER at A35/W7', step: 0.01 },
      { key: 'coolCapLossPerK', label: 'Cooling capacity loss per °C above 35', step: 0.005 },
      { key: 'eerLossPerK', label: 'EER loss per °C above 35', step: 0.005 },
      { key: 'fanCoilCapKw', label: 'Total fan-coil cooling capacity (delivery limit)', unit: 'kW', step: 0.1 },
      { key: 'coolCapFactor', label: 'Delivered cooling capacity factor', step: 0.05 },
    ],
  },
  {
    title: 'Cooling loads',
    fields: [
      { key: 'coolingThreshold', label: 'Cooling on above / indoor setpoint', unit: '°C', step: 0.5, help: 'Heating and cooling are both off between the heating setpoint and this temperature (outdoor period mean).' },
      { key: 'hotDayThreshold', label: '“Very hot” day: an hour ≥', unit: '°C', step: 0.5 },
      { key: 'coolTransmissionKwK', label: 'Transmission coefficient', unit: 'kW/K', step: 0.001 },
      { key: 'coolVentilationKwK', label: 'Ventilation coefficient', unit: 'kW/K', step: 0.001 },
      { key: 'internalGainsKw', label: 'Internal gains', unit: 'kW', step: 0.05 },
      { key: 'windowSolarFactor', label: 'Window solar gain factor', step: 0.1 },
      { key: 'opaqueSolarFactor', label: 'Opaque solar gain factor', step: 0.1 },
      { key: 'airflowM3h', label: 'Air flow for humidity load', unit: 'm³/h', step: 1 },
      { key: 'indoorRH', label: 'Indoor relative humidity', unit: '0–1', step: 0.05 },
      { key: 'dehumidFactor', label: 'Dehumidification factor', step: 0.1 },
    ],
  },
  {
    title: 'Night comfort cooling',
    fields: [
      { key: 'comfortTargetTemp', label: 'Night target temperature', unit: '°C', step: 0.5 },
      { key: 'comfortAreaM2', label: 'Area cooled to the night target', unit: 'm²', step: 0.1 },
      { key: 'totalFloorAreaM2', label: 'Total heated floor area', unit: 'm²', step: 0.1 },
    ],
    extra: () => `<label class="row"><input type="checkbox" id="comfortEnabled" ${state.specs.comfortEnabled ? 'checked' : ''} style="flex:0 0 auto"> <span>Include night comfort cooling (bedrooms etc.)</span></label>
      <p class="help">Share of cooling load: ${n1(comfortShare(state.specs) * 100)} %. Extra cost counts only the part not already cooled at the normal setpoint.</p>`,
  },
];

const AREA_COLS: { key: keyof MonthlyAreas; label: string }[] = [
  { key: 'winN', label: 'Win N' }, { key: 'winE', label: 'Win E' }, { key: 'winS', label: 'Win S' }, { key: 'winW', label: 'Win W' },
  { key: 'opqN', label: 'Opq N' }, { key: 'opqE', label: 'Opq E' }, { key: 'opqS', label: 'Opq S' }, { key: 'opqW', label: 'Opq W' },
  { key: 'opqH', label: 'Roof' }, { key: 'irLossKw', label: 'IR loss kW' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ------------------------------------------------------------------ inputs rendering

function fieldHtml(f: FieldDef): string {
  const v = state.specs[f.key];
  return `<div class="field"><label for="f-${f.key}">${f.label}${f.unit ? ` <span class="unit">${f.unit}</span>` : ''}</label>
    <input id="f-${f.key}" data-key="${f.key}" type="number" step="${f.step ?? 'any'}" value="${v ?? ''}"></div>
    ${f.help ? `<p class="help">${f.help}</p>` : ''}`;
}

function renderInputs() {
  const s = state;
  const scenarios = store.loadScenarios();
  const sems = semestersBetween(s.startDate, endDate());
  const tariff = buildTariffLookup(eurostat, s.priceOverrides, s.specs.fallbackTariff);

  $('#inputs').innerHTML = `
    <section class="card">
      <h2>Location &amp; period</h2>
      <div class="row"><input id="geo-q" placeholder="Search town or address…" value=""><button id="geo-go">Search</button></div>
      <div class="geo-results" id="geo-results"></div>
      <p class="help">Selected: <b>${esc(s.location.name)}</b> (${s.location.latitude.toFixed(3)}, ${s.location.longitude.toFixed(3)}, ${esc(s.location.countryCode)})</p>
      <div class="field"><label for="lat">Latitude</label><input id="lat" type="number" step="0.001" value="${s.location.latitude}"></div>
      <div class="field"><label for="lon">Longitude</label><input id="lon" type="number" step="0.001" value="${s.location.longitude}"></div>
      <div class="field"><label for="cc">Country code (prices)</label><input id="cc" maxlength="2" value="${esc(s.location.countryCode)}"></div>
      <div class="field"><label for="start">From</label><input id="start" type="date" min="1940-01-01" value="${s.startDate}"></div>
      <div class="field"><label for="end">To (blank = yesterday)</label><input id="end" type="date" value="${s.endDate ?? ''}"></div>
    </section>

    ${SECTIONS.map((sec) => `<details class="card" ${sec.open ? 'open' : ''}><summary>${sec.title}</summary>
      ${sec.fields.map(fieldHtml).join('')}${sec.extra ? sec.extra() : ''}</details>`).join('')}

    <details class="card"><summary>Effective solar areas by month</summary>
      <p class="help">Effective solar aperture (m²) per orientation — glass area × g-value × shading, and for opaque parts U × α × Rse × area. “IR loss” is long-wave radiation to the sky (kW). Irradiance on vertical N/E/S/W and horizontal surfaces comes from Open-Meteo.</p>
      <div class="scroll-x"><table class="areas"><thead><tr><th></th>${AREA_COLS.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>
      ${s.specs.solarAreas.map((a, i) => `<tr><td>${MONTHS[i]}</td>${AREA_COLS.map((c) => `<td><input type="number" step="any" data-area="${i}" data-col="${c.key}" value="${+a[c.key].toFixed(4)}"></td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:6px"><button class="small" id="areas-fill">Copy July to all months</button></div>
    </details>

    <details class="card" open><summary>Electricity prices</summary>
      <div class="field"><label for="band">Eurostat consumption band</label><select id="band">
        ${CONSUMPTION_BANDS.map((b) => `<option value="${b.code}" ${b.code === s.band ? 'selected' : ''}>${b.label}</option>`).join('')}</select></div>
      ${fieldHtml({ key: 'fallbackTariff', label: 'My current tariff (used where no price)', unit: '€/kWh', step: 0.001 })}
      <p class="help">${eurostatInfo || 'Household prices incl. all taxes, fetched from Eurostat for the selected country on calculate.'} Type in a value to override a semester (e.g. from your own bill).</p>
      <div class="scroll-x"><table><thead><tr><th>Semester</th><th>Eurostat €/kWh</th><th>Override</th><th>Used</th></tr></thead><tbody>
      ${sems.map((sem) => `<tr><td>${sem}</td><td>${eurostat[sem] !== undefined ? eurostat[sem].toFixed(4) : '–'}</td>
        <td><input type="number" step="0.001" data-sem="${sem}" value="${s.priceOverrides[sem] ?? ''}" style="width:80px"></td>
        <td>${tariff(`${sem.slice(0, 4)}-${sem.endsWith('1') ? '01' : '07'}-01`).toFixed(4)}</td></tr>`).join('')}
      </tbody></table></div>
    </details>

    <section class="card">
      <h2>Saved scenarios</h2>
      <p class="help">Stored in this browser’s local storage only.</p>
      <div class="row"><input id="sc-name" placeholder="Scenario name"><button id="sc-save">Save</button></div>
      <div style="margin-top:6px">${scenarios.length ? scenarios.map((sc, i) => `<div class="scenario"><span title="${esc(sc.name)}">${esc(sc.name)} <small>${sc.savedAt.slice(0, 10)}</small></span>
        <button class="small" data-load="${i}">Load</button><button class="small" data-del="${i}">Delete</button></div>`).join('') : '<p class="help">No saved scenarios yet.</p>'}</div>
      <div class="row" style="margin-top:10px">
        <button class="small" id="export">Export JSON</button>
        <label class="small" style="flex:0 0 auto"><button class="small" id="import-btn" type="button">Import JSON</button><input id="import" type="file" accept="application/json" hidden></label>
        <button class="small" id="reset">Reset to defaults</button>
        <button class="small" id="clear">Clear all stored data</button>
      </div>
    </section>`;
}

// ------------------------------------------------------------------ input events

function bindInputs() {
  const root = $('#inputs');

  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.key) {
      const key = t.dataset.key as NumKey;
      const v = t.value === '' ? null : Number(t.value);
      if (key === 'designHeatLoadOverrideKw') state.specs.designHeatLoadOverrideKw = v;
      else if (v !== null && Number.isFinite(v)) (state.specs[key] as number | null) = v;
      if (key === 'designTransmissionLossW' || key === 'designVentilationLossW' || key === 'designHeatLoadOverrideKw') {
        const note = document.getElementById('heatload-note');
        if (note) note.querySelector('b')!.textContent = `${n2(designHeatLoadKw(state.specs))} kW`;
      }
      scheduleRecompute();
    } else if (t.dataset.area !== undefined) {
      const v = Number(t.value);
      if (Number.isFinite(v)) state.specs.solarAreas[Number(t.dataset.area)][t.dataset.col as keyof MonthlyAreas] = v;
      scheduleRecompute();
    } else if (t.dataset.sem) {
      state.priceOverrides[t.dataset.sem] = t.value === '' ? null : Number(t.value);
      scheduleRecompute();
    }
    persist();
  });

  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    switch (t.id) {
      case 'lat': state.location.latitude = Number(t.value); state.location.name = 'Custom coordinates'; break;
      case 'lon': state.location.longitude = Number(t.value); state.location.name = 'Custom coordinates'; break;
      case 'cc': state.location.countryCode = t.value.toUpperCase(); eurostat = {}; eurostatInfo = ''; break;
      case 'start': if (t.value) state.startDate = t.value; renderInputs(); break;
      case 'end': state.endDate = t.value || null; renderInputs(); break;
      case 'band': state.band = t.value as BandCode; eurostat = {}; eurostatInfo = ''; loadPricesFromCache(); renderInputs(); recompute(); break;
      case 'comfortEnabled': state.specs.comfortEnabled = t.checked; recompute(); break;
      case 'import': importFile(t); break;
      default:
        if (t.dataset.sem || t.dataset.key === 'fallbackTariff') renderInputsKeepFocus();
    }
    persist();
  });

  root.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.id === 'geo-go') return geocode();
    if (t.dataset.geo) {
      const r = JSON.parse(t.dataset.geo);
      state.location = r;
      eurostat = {}; eurostatInfo = '';
      persist();
      renderInputs();
      setStatus(`Location set to ${r.name}. Press “Fetch data & calculate”.`);
      return;
    }
    if (t.id === 'areas-fill') {
      const jul = state.specs.solarAreas[6];
      state.specs.solarAreas = state.specs.solarAreas.map(() => ({ ...jul }));
      persist(); renderInputs(); recompute();
      return;
    }
    if (t.id === 'sc-save') {
      const name = ($<HTMLInputElement>('#sc-name').value || `Scenario ${new Date().toLocaleString()}`).trim();
      const list = store.loadScenarios().filter((s) => s.name !== name);
      list.unshift({ name, savedAt: new Date().toISOString(), state: structuredClone(state) });
      if (!store.saveScenarios(list)) setStatus('Could not save — local storage is full or blocked.', true);
      renderInputs();
      return;
    }
    if (t.dataset.load) {
      const sc = store.loadScenarios()[Number(t.dataset.load)];
      if (sc) applyState(store.normalizeState(sc.state), `Loaded “${sc.name}”.`);
      return;
    }
    if (t.dataset.del) {
      const list = store.loadScenarios();
      const [gone] = list.splice(Number(t.dataset.del), 1);
      if (gone && confirm(`Delete scenario “${gone.name}”?`)) { store.saveScenarios(list); renderInputs(); }
      return;
    }
    if (t.id === 'export') return exportJson();
    if (t.id === 'import-btn') return $<HTMLInputElement>('#import').click();
    if (t.id === 'reset') {
      if (confirm('Reset all specs to the defaults (Villa Visione example)? Saved scenarios are kept.')) applyState(store.defaultState(), 'Defaults restored.');
      return;
    }
    if (t.id === 'clear') {
      if (confirm('Delete everything this app stored in your browser (specs, scenarios, cached weather & prices)?')) {
        store.clearAll();
        weather = null; eurostat = {}; eurostatInfo = '';
        applyState(store.defaultState(), 'All stored data cleared.');
      }
    }
  });

  root.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).id === 'geo-q' && e.key === 'Enter') geocode();
  });
}

function renderInputsKeepFocus() {
  const id = document.activeElement?.id;
  const openState = [...document.querySelectorAll<HTMLDetailsElement>('#inputs details')].map((d) => d.open);
  renderInputs();
  document.querySelectorAll<HTMLDetailsElement>('#inputs details').forEach((d, i) => (d.open = openState[i] ?? d.open));
  if (id) document.getElementById(id)?.focus();
}

function applyState(s: store.AppState, msg: string) {
  state = s;
  store.saveCurrent(state);
  loadPricesFromCache();
  renderInputs();
  recompute();
  setStatus(msg);
}

async function geocode() {
  const q = $<HTMLInputElement>('#geo-q').value.trim();
  if (!q) return;
  const out = $('#geo-results');
  out.textContent = 'Searching…';
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' })}`);
    const json = await res.json();
    const results = (json.results ?? []) as { name: string; latitude: number; longitude: number; country_code: string; admin1?: string; country?: string }[];
    out.innerHTML = results.length
      ? results.map((r) => {
          const loc = { name: [r.name, r.admin1, r.country].filter(Boolean).join(', '), latitude: r.latitude, longitude: r.longitude, countryCode: r.country_code };
          return `<button data-geo='${esc(JSON.stringify(loc))}'>${esc(loc.name)}</button>`;
        }).join('')
      : '<p class="help">No matches. Enter latitude/longitude manually.</p>';
  } catch {
    out.innerHTML = '<p class="help">Search failed. Enter latitude/longitude manually.</p>';
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify({ current: state, scenarios: store.loadScenarios() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'heat-pump-scenarios.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importFile(input: HTMLInputElement) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (Array.isArray(data.scenarios)) {
      const existing = store.loadScenarios();
      const names = new Set(existing.map((s) => s.name));
      store.saveScenarios([...existing, ...data.scenarios.filter((s: store.Scenario) => s?.name && !names.has(s.name))]);
    }
    applyState(store.normalizeState(data.current ?? data.state ?? data), `Imported ${file.name}.`);
  } catch {
    setStatus('That file is not a valid export.', true);
  }
}

// ------------------------------------------------------------------ data fetching

function loadPricesFromCache() {
  const cached = store.loadPrices(state.location.countryCode.toUpperCase(), state.band);
  if (cached) {
    eurostat = cached.prices;
    eurostatInfo = `Eurostat ${cached.geo}, updated ${cached.updated.slice(0, 10)}.`;
  }
}

async function refreshPrices() {
  const cc = state.location.countryCode.toUpperCase();
  const cached = store.loadPrices(cc, state.band);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < 24 * 3600e3) {
    loadPricesFromCache();
    return;
  }
  try {
    const p = await fetchEurostatPrices(cc, state.band, '2007-S1');
    store.savePrices(p, cc);
    eurostat = p.prices;
    eurostatInfo = `Eurostat ${p.geo}, updated ${p.updated.slice(0, 10)}.`;
  } catch (err) {
    eurostat = {};
    eurostatInfo = `${(err as Error).message} Using your tariff / overrides.`;
  }
}

async function run() {
  if (busy) return;
  busy = true;
  const btns = [$<HTMLButtonElement>('#run'), $<HTMLButtonElement>('#run-mobile')];
  btns.forEach((b) => (b.disabled = true));
  try {
    const { latitude, longitude } = state.location;
    const end = endDate();
    if (state.startDate > end) throw new Error('Start date is after end date.');
    setStatus('Fetching electricity prices…');
    const pricesP = refreshPrices();
    const w = await fetchWeather(latitude, longitude, state.startDate, end, weather, (m) => setStatus(m));
    await pricesP;
    weather = w;
    const ok = store.saveWeather(w);
    renderInputsKeepFocus();
    recompute();
    setView('results');
    setStatus(`Weather ${w.start} → ${w.end} (${w.timezone}) fetched ${new Date(w.fetchedAt).toLocaleString()}.${ok ? '' : ' (Too large to cache locally — it will be downloaded again next time.)'}`);
  } catch (err) {
    setStatus((err as Error).message, true);
  } finally {
    busy = false;
    btns.forEach((b) => (b.disabled = false));
  }
}

// ------------------------------------------------------------------ results

let recomputeTimer = 0;
function scheduleRecompute() {
  clearTimeout(recomputeTimer);
  recomputeTimer = window.setTimeout(recompute, 200);
}

function weatherCovers(w: WeatherData | null): boolean {
  return !!w && w.latitude === state.location.latitude && w.longitude === state.location.longitude && w.start <= state.startDate;
}

function recompute() {
  const host = $('#results');
  if (!weatherCovers(weather)) {
    lastRows = [];
    host.innerHTML = `<div class="card empty">Press <b>Fetch data &amp; calculate</b> to download hourly weather for ${esc(state.location.name)} and compute results.</div>`;
    return;
  }
  const w = weather!;
  const tariff = buildTariffLookup(eurostat, state.priceOverrides, state.specs.fallbackTariff);
  const agg = aggregate(w, state.specs, state.startDate, endDate());
  skipped = agg.skippedDays;
  lastRows = agg.days.map((d) => computeDay(d, state.specs, tariff));
  const years = summarizeByYear(lastRows);
  const tot = totals(years);
  const cap = capacityCheck(state.specs, lastRows, agg.maxHourlyTemp);
  renderResults(host, years, tot, cap, w);
}

function renderResults(host: HTMLElement, years: YearSummary[], tot: YearSummary, cap: ReturnType<typeof capacityCheck>, w: WeatherData) {
  const full = years.filter((y) => y.days >= 365);
  const avgCost = full.length ? full.reduce((a, y) => a + y.totalCostInclComfort, 0) / full.length : null;
  const avgKwh = full.length ? full.reduce((a, y) => a + y.elecTotal, 0) / full.length : null;
  const heatOk = cap.pumpsAtDesignKw >= cap.designHeatLoadKw;
  const deficits = tot.heatDeficitDays + tot.coolDeficitDays;
  const coversEnd = w.end >= endDate();

  const cols: [string, (y: YearSummary) => string, (y: YearSummary) => boolean][] = [
    ['Days', (y) => n0(y.days), () => false],
    ['Frost days', (y) => n0(y.frostDays), () => false],
    [`Days ≥${state.specs.hotDayThreshold} °C`, (y) => n0(y.hotDays), () => false],
    [`Hours ≥${state.specs.hotDayThreshold} °C`, (y) => n0(y.hotHours), () => false],
    ['Heat deficit days', (y) => n0(y.heatDeficitDays), (y) => y.heatDeficitDays > 0],
    ['Heat deficit periods', (y) => n0(y.heatDeficitPeriods), (y) => y.heatDeficitPeriods > 0],
    ['Cool deficit days', (y) => n0(y.coolDeficitDays), (y) => y.coolDeficitDays > 0],
    ['Cool deficit periods', (y) => n0(y.coolDeficitPeriods), (y) => y.coolDeficitPeriods > 0],
    ['Heating kWh', (y) => n0(y.heatElec), () => false],
    ['Cooling kWh', (y) => n0(y.coolElec), () => false],
    ['Total kWh', (y) => n0(y.elecTotal), () => false],
    ['Cost €', (y) => n0(y.cost), () => false],
    ...(state.specs.comfortEnabled
      ? ([
          ['Cooling incl. comfort €', (y: YearSummary) => n0(y.coolCostInclComfort), () => false],
          ['Total incl. comfort €', (y: YearSummary) => n0(y.totalCostInclComfort), () => false],
        ] as [string, (y: YearSummary) => string, (y: YearSummary) => boolean][])
      : []),
  ];

  host.innerHTML = `
    ${skipped.length ? `<div class="notice">${skipped.length} day(s) without complete temperature data were skipped (${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}).</div>` : ''}
    ${!coversEnd ? `<div class="notice">Cached weather ends ${w.end}. Press “Fetch data &amp; calculate” to update to ${endDate()}.</div>` : ''}
    <div class="kpis">
      <div class="kpi"><div class="label">Average cost per full year</div><div class="value">${avgCost !== null ? eur(avgCost) : '–'}</div><div class="note">${full.length} full year(s)${state.specs.comfortEnabled ? ', incl. comfort' : ''}</div></div>
      <div class="kpi"><div class="label">Average electricity per full year</div><div class="value">${avgKwh !== null ? `${n0(avgKwh)} kWh` : '–'}</div><div class="note">heating + cooling</div></div>
      <div class="kpi"><div class="label">Heating at design temp.</div><div class="value" style="color:var(${heatOk ? '--good-ink' : '--bad-ink'})">${heatOk ? '✓' : '✗'} ${n1(cap.pumpsAtDesignKw)} / ${n1(cap.designHeatLoadKw)} kW</div><div class="note">pump capacity / demand at ${state.specs.designOutdoorTemp} °C</div></div>
      <div class="kpi"><div class="label">Days with a capacity deficit</div><div class="value" style="color:var(${deficits ? '--bad-ink' : '--good-ink'})">${deficits ? '✗' : '✓'} ${n0(deficits)}</div><div class="note">heating ${n0(tot.heatDeficitDays)} · cooling ${n0(tot.coolDeficitDays)}</div></div>
    </div>

    <section class="card"><h2>Per year</h2><div class="scroll-x"><table>
      <thead><tr><th>Year</th>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr></thead>
      <tbody>${years.map((y) => `<tr><td>${y.year}${y.days < 365 ? ' <small>(partial)</small>' : ''}</td>${cols.map((c) => `<td class="${c[2](y) ? 'bad' : ''}">${c[1](y)}</td>`).join('')}</tr>`).join('')}
      <tr class="total"><td>Total</td>${cols.map((c) => `<td>${c[1](tot)}</td>`).join('')}</tr></tbody>
    </table></div></section>

    <section class="card"><h2>Monthly electricity</h2><div id="chart"></div></section>

    <section class="card"><h2>Capacity check</h2><div class="scroll-x"><table>
      <thead><tr><th>Item</th><th>Value</th><th style="text-align:left">Meaning</th></tr></thead><tbody>
      <tr><td>Heating demand at ${state.specs.designOutdoorTemp} °C</td><td>${n2(cap.designHeatLoadKw)} kW</td><td class="wrap">Steady-state loss, excluding reheat boost.</td></tr>
      <tr><td>${state.specs.pumpCount} pumps at ${state.specs.designOutdoorTemp} °C</td><td class="${heatOk ? '' : 'bad'}">${n2(cap.pumpsAtDesignKw)} kW</td><td class="wrap">Interpolated capacity × capacity factor.</td></tr>
      <tr><td>Max cooling demand (period mean)</td><td>${n2(cap.maxCoolDemandKw)} kW</td><td class="wrap">Incl. solar, ventilation and dehumidification.</td></tr>
      <tr><td>Heat not delivered</td><td class="${cap.heatUnmetKwh > 0 ? 'bad' : ''}">${n0(cap.heatUnmetKwh)} kWh</td><td class="wrap">Shortfall vs. demand at the indoor setpoint.</td></tr>
      <tr><td>Cooling not delivered</td><td class="${cap.coolUnmetKwh > 0 ? 'bad' : ''}">${n0(cap.coolUnmetKwh)} kWh</td><td class="wrap">Shortfall during cooling periods.</td></tr>
      <tr><td>Highest hourly temperature</td><td>${cap.maxHourlyTemp !== null ? n1(cap.maxHourlyTemp) : '–'} °C</td><td class="wrap">From the weather model, not a station.</td></tr>
    </tbody></table></div></section>

    <section class="card"><h2>Days</h2>
      <div class="tabs" id="day-tabs">
        ${(['hot', 'frost', 'deficit', 'all'] as const).map((k) => `<button data-filter="${k}" aria-pressed="${dailyFilter === k}">${{ hot: `Very hot (≥${state.specs.hotDayThreshold} °C)`, frost: 'Frost days', deficit: 'Deficit days', all: 'All days' }[k]}</button>`).join('')}
        <button id="csv" style="margin-left:auto">Download CSV (all days)</button>
      </div>
      <div id="days"></div>
    </section>`;

  renderMonthlyChart($('#chart', host), lastRows);
  renderDays();
  $('#day-tabs', host).addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.id === 'csv') return downloadCsv();
    dailyFilter = b.dataset.filter as typeof dailyFilter;
    host.querySelectorAll('#day-tabs [data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderDays();
  });
}

const DAY_COLS: [string, (r: DayResult) => string | number][] = [
  ['Date', (r) => r.date],
  ['Min °C', (r) => r.input.tmin.toFixed(1)],
  ['Max °C', (r) => r.input.tmax.toFixed(1)],
  ['Day h', (r) => r.input.dayHours.toFixed(2)],
  ['Day mean °C', (r) => r.input.tDay.toFixed(1)],
  ['Night mean °C', (r) => r.input.tNight.toFixed(1)],
  ['Heat peak kW', (r) => r.heatPeakKw.toFixed(1)],
  ['Heat reserve kW', (r) => r.heatReserveKw.toFixed(1)],
  ['Cool peak kW', (r) => r.coolPeakKw.toFixed(1)],
  ['Cool reserve kW', (r) => r.coolReserveKw.toFixed(1)],
  ['Heating kWh el.', (r) => (r.heatElecDay + r.heatElecNight).toFixed(1)],
  ['Cooling kWh el.', (r) => (r.coolElecDay + r.coolElecNight).toFixed(1)],
  ['€/kWh', (r) => r.tariff.toFixed(4)],
  ['Cost €', (r) => r.cost.toFixed(2)],
  ['Comfort €', (r) => r.comfortCost.toFixed(2)],
  ['Hours ≥ hot', (r) => r.hoursHot],
  ['Hours > cool', (r) => r.hoursAboveCool],
  ['Deficit', (r) => [r.heatDeficitDay || r.heatDeficitNight ? 'heat' : '', r.coolDeficitDay || r.coolDeficitNight ? 'cool' : ''].filter(Boolean).join('+')],
];

function renderDays() {
  const host = document.getElementById('days');
  if (!host) return;
  const rows = lastRows.filter((r) =>
    dailyFilter === 'all' ? true
      : dailyFilter === 'frost' ? r.frost
      : dailyFilter === 'hot' ? r.hoursHot > 0
      : r.heatDeficitDay + r.heatDeficitNight + r.coolDeficitDay + r.coolDeficitNight > 0,
  );
  const LIMIT = 500;
  const shown = rows.slice(-LIMIT).reverse();
  host.innerHTML = rows.length
    ? `<p class="help">${rows.length} day(s)${rows.length > LIMIT ? `, showing the latest ${LIMIT}` : ''}. Download the CSV for everything.</p>
      <div class="scroll-x" style="max-height:480px;overflow-y:auto"><table><thead><tr>${DAY_COLS.map((c) => `<th>${c[0]}</th>`).join('')}</tr></thead>
      <tbody>${shown.map((r) => `<tr>${DAY_COLS.map((c) => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '<p class="help">No days match.</p>';
}

function downloadCsv() {
  const lines = [DAY_COLS.map((c) => c[0]).join(',')];
  for (const r of lastRows) lines.push(DAY_COLS.map((c) => `"${String(c[1](r)).replace(/"/g, '""')}"`).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = `heat-pump-days-${state.startDate}-${endDate()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ------------------------------------------------------------------ boot

loadPricesFromCache();
renderInputs();
bindInputs();
$('#run').addEventListener('click', run);
$('#run-mobile').addEventListener('click', run);

// Mobile: one panel at a time, switched from the bottom bar.
function setView(view: 'inputs' | 'results') {
  if (document.body.dataset.view === view) return;
  document.body.dataset.view = view;
  document.querySelectorAll('.mobile-nav [data-view]').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.view === view)));
  if (window.matchMedia('(max-width: 900px)').matches) window.scrollTo({ top: 0 });
}
$('.mobile-nav').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-view]');
  if (b) setView(b.dataset.view as 'inputs' | 'results');
});
// First visit without results: start on the specs panel.
if (!weatherCovers(weather)) setView('inputs');
recompute();

// Pull fresh data automatically when the cache is missing, stale or doesn't cover the range.
if (!weatherCovers(weather) || weather!.end < endDate() || Date.now() - Date.parse(weather!.fetchedAt) > 12 * 3600e3) {
  void run();
}

