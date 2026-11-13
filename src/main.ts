import './style.css';
import { customLines, fullPrompt, resultsForAi, shortPrompt, SITE_URL } from './aiGuide';
import { renderMonthlyChart } from './chart';
import { applyLang, browserLang, chooseLang, dateTime, eur, fmt, getLang, isAutomatic, L, LANGS, LOCALES, monthName, n0, n1, n2, n4, type Lang } from './i18n';
import { applyChanges, changedKeys, geocodePlace, InputError, parseAiInput } from './importer';
import {
  capacityCheck, comfortShare, computeDay, designHeatLoadKw, summarizeByYear, totals,
  type CapacityCheck, type DayResult, type MonthlyAreas, type Results, type Specs, type YearSummary,
} from './model';
import { buildTariffLookup, CONSUMPTION_BANDS, fetchEurostatPrices, semestersBetween, tariffSource, type BandCode } from './prices';
import * as store from './storage';
import { addDays, aggregate, fetchWeather, todayLocal, type WeatherData } from './weather';
import { registerWebMcpTools } from './webmcp';

// ------------------------------------------------------------------ state

let state: store.AppState = store.loadCurrent();
let weather: WeatherData | null = store.loadWeather();
let eurostat: Record<string, number> = {};
/** Where the prices came from, formatted at render time so it follows the language. */
let priceSource: { ok: true; geo: string; updated: string } | { ok: false; geo: string } | null = null;
let busy = false;
let dailyFilter: 'all' | 'frost' | 'hot' | 'deficit' = 'hot';
let lastRows: DayResult[] = [];
let lastResults: Results | null = null;
let skipped: string[] = [];
/** State before the last AI import, for Undo. */
let undoState: store.AppState | null = null;

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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

function priceInfo(): string {
  if (!priceSource) return L().inputs.pricesIntro;
  return priceSource.ok
    ? fmt(L().inputs.eurostatInfo, { geo: priceSource.geo, date: priceSource.updated.slice(0, 10) })
    : fmt(L().inputs.eurostatFailed, { geo: priceSource.geo });
}

// ------------------------------------------------------------------ field definitions

type NumKey = { [K in keyof Specs]: Specs[K] extends number | null ? K : never }[keyof Specs];
interface FieldDef { key: NumKey; unit?: string; step?: number }

const SECTIONS: { id: keyof ReturnType<typeof L>['sections']; open?: boolean; fields: FieldDef[]; extra?: () => string }[] = [
  {
    id: 'building',
    open: true,
    fields: [
      { key: 'heatingIndoorTemp', unit: '°C', step: 0.5 },
      { key: 'designOutdoorTemp', unit: '°C', step: 0.1 },
      { key: 'designTransmissionLossW', unit: 'W', step: 10 },
      { key: 'designVentilationLossW', unit: 'W', step: 10 },
      { key: 'designHeatLoadOverrideKw', unit: 'kW', step: 0.1 },
    ],
    extra: () => `<p class="help" id="heatload-note">${fmt(esc(L().inputs.heatLoadNote), { kw: `<b>${n2(designHeatLoadKw(state.specs))} kW</b>` })}</p>`,
  },
  {
    id: 'pumps',
    open: true,
    fields: [
      { key: 'pumpCount', step: 1 },
      { key: 'heatCapMinus7', unit: 'kW', step: 0.1 },
      { key: 'heatCapPlus7', unit: 'kW', step: 0.1 },
      { key: 'copMinus7', step: 0.01 },
      { key: 'copPlus7', step: 0.01 },
      { key: 'heatCapFactor', step: 0.05 },
      { key: 'coolCapA35', unit: 'kW', step: 0.1 },
      { key: 'eerA35', step: 0.01 },
      { key: 'coolCapLossPerK', step: 0.005 },
      { key: 'eerLossPerK', step: 0.005 },
      { key: 'fanCoilCapKw', unit: 'kW', step: 0.1 },
      { key: 'coolCapFactor', step: 0.05 },
    ],
  },
  {
    id: 'cooling',
    fields: [
      { key: 'coolingThreshold', unit: '°C', step: 0.5 },
      { key: 'hotDayThreshold', unit: '°C', step: 0.5 },
      { key: 'coolTransmissionKwK', unit: 'kW/K', step: 0.001 },
      { key: 'coolVentilationKwK', unit: 'kW/K', step: 0.001 },
      { key: 'internalGainsKw', unit: 'kW', step: 0.05 },
      { key: 'windowSolarFactor', step: 0.1 },
      { key: 'opaqueSolarFactor', step: 0.1 },
      { key: 'airflowM3h', unit: 'm³/h', step: 1 },
      { key: 'indoorRH', unit: '0–1', step: 0.05 },
      { key: 'dehumidFactor', step: 0.1 },
    ],
  },
  {
    id: 'comfort',
    fields: [
      { key: 'comfortTargetTemp', unit: '°C', step: 0.5 },
      { key: 'comfortAreaM2', unit: 'm²', step: 0.1 },
      { key: 'totalFloorAreaM2', unit: 'm²', step: 0.1 },
    ],
    extra: () => `<div class="lbl check"><label class="row"><input type="checkbox" id="comfortEnabled" ${state.specs.comfortEnabled ? 'checked' : ''} style="flex:0 0 auto"> <span>${esc(L().labels.comfortEnabled)}</span></label>${infoBtn('comfortEnabled', 'comfortEnabled', L().labels.comfortEnabled)}</div>${infoPanel('comfortEnabled', 'comfortEnabled')}
      <p class="help">${esc(fmt(L().inputs.comfortShare, { pct: n1(comfortShare(state.specs) * 100) }))}</p>`,
  },
];

const AREA_COLS: { key: keyof MonthlyAreas; help: 'winArea' | 'opqArea' | 'roofArea' | 'irLoss' }[] = [
  { key: 'winN', help: 'winArea' }, { key: 'winE', help: 'winArea' }, { key: 'winS', help: 'winArea' }, { key: 'winW', help: 'winArea' },
  { key: 'opqN', help: 'opqArea' }, { key: 'opqE', help: 'opqArea' }, { key: 'opqS', help: 'opqArea' }, { key: 'opqW', help: 'opqArea' },
  { key: 'opqH', help: 'roofArea' }, { key: 'irLossKw', help: 'irLoss' },
];
const AREA_HELP_KEYS = ['winArea', 'opqArea', 'roofArea', 'irLoss'] as const;

/** Translated name for a changed-key id from importer.changedKeys(). */
function keyLabel(k: string): string {
  const labels = L().labels as Record<string, string>;
  if (labels[k]) return labels[k];
  const cols = L().inputs.areaCols as Record<string, string>;
  return cols[k] ?? k;
}

// ------------------------------------------------------------------ static chrome (header, nav, footer)

function renderStatic() {
  const t = L();
  document.title = t.app.title;
  $('#app-title').textContent = t.app.title;
  $('#app-sub').textContent = t.app.sub;
  $('#run').textContent = t.app.run;
  $('#run-mobile').textContent = t.app.runShort;
  $('#nav-specs').textContent = t.app.navSpecs;
  $('#nav-results').textContent = t.app.navResults;
  $('#lang-label').textContent = t.app.language;
  $('#foot-data').textContent = t.app.footerData;
  $('#foot-model').textContent = t.app.footerModel;
  const sel = $<HTMLSelectElement>('#lang');
  const auto = isAutomatic();
  sel.innerHTML = `<option value="auto" ${auto ? 'selected' : ''}>${esc(t.app.automatic)} (${LOCALES[browserLang()].meta.name})</option>`
    + LANGS.map((l) => `<option value="${l}" ${!auto && l === getLang() ? 'selected' : ''}>${LOCALES[l].meta.name}</option>`).join('');
}

// ------------------------------------------------------------------ inputs rendering

/** Info panels the user has opened; kept across re-renders. */
const openInfo = new Set<string>();

/** ⓘ button toggling the help panel `info-<id>` for help entry `key`. */
function infoBtn(key: string, id: string, label: string): string {
  if (!(key in L().help)) return '';
  const open = openInfo.has(id);
  return `<button type="button" class="info" data-info="${id}" aria-expanded="${open}" aria-controls="info-${id}" aria-label="${esc(fmt(L().info.ariaWhatIs, { label }))}" title="${esc(L().info.title)}">i</button>`;
}

function infoPanel(key: string, id: string, heading?: string): string {
  const h = (L().help as Record<string, { what: string; find: string }>)[key];
  if (!h) return '';
  return `<div class="info-panel" id="info-${id}" role="note" ${openInfo.has(id) ? '' : 'hidden'}>
    ${heading ? `<p class="info-head">${esc(heading)}</p>` : ''}
    <p><b>${esc(L().info.what)}</b> ${esc(h.what)}</p><p><b>${esc(L().info.find)}</b> ${esc(h.find)}</p></div>`;
}

/** A labelled input row with its ⓘ button and help panel. */
function row(id: string, helpKey: string, labelHtml: string, plainLabel: string, inputHtml: string): string {
  return `<div class="field"><div class="lbl"><label for="${id}">${labelHtml}</label>${infoBtn(helpKey, id, plainLabel)}</div>${inputHtml}</div>${infoPanel(helpKey, id)}`;
}

function fieldHtml(f: FieldDef): string {
  const v = state.specs[f.key];
  const label = (L().labels as Record<string, string>)[f.key];
  return row(`f-${f.key}`, f.key, `${esc(label)}${f.unit ? ` <span class="unit">${f.unit}</span>` : ''}`, label,
    `<input id="f-${f.key}" data-key="${f.key}" type="number" inputmode="decimal" step="${f.step ?? 'any'}" value="${v ?? ''}">`);
}

function aiCardHtml(): string {
  const t = L().ai;
  const lang = L().meta.name;
  const short = shortPrompt(t.shortPrompt, lang, SITE_URL, state);
  return `<section class="card ai-card" aria-labelledby="ai-title">
      <h2 id="ai-title"><span aria-hidden="true">✨</span> ${esc(t.title)}</h2>
      <p class="help">${esc(t.intro)}</p>
      <div class="ai-actions">
        <a class="btn" href="https://chatgpt.com/?q=${encodeURIComponent(short)}" target="_blank" rel="noopener">${esc(t.openChatGPT)}</a>
        <a class="btn" href="https://claude.ai/new?q=${encodeURIComponent(short)}" target="_blank" rel="noopener">${esc(t.openClaude)}</a>
        <button type="button" id="ai-copy">${esc(t.copyPrompt)}</button>
      </div>
      <textarea id="ai-copy-fallback" class="ai-fallback" rows="4" readonly hidden></textarea>
      <label for="ai-paste" class="ai-paste-label">${esc(t.pasteLabel)}</label>
      <div class="ai-paste-row">
        <textarea id="ai-paste" rows="2" placeholder="${esc(t.pastePlaceholder)}" spellcheck="false" autocomplete="off"></textarea>
        <button type="button" id="ai-apply" class="primary">${esc(t.apply)}</button>
      </div>
    </section>`;
}

function renderInputs() {
  const s = state;
  const t = L();
  const scenarios = store.loadScenarios();
  const sems = semestersBetween(s.startDate, endDate());
  const tariff = buildTariffLookup(eurostat, s.priceOverrides, s.specs.fallbackTariff);
  const bands = t.inputs.bands as Record<string, string>;

  $('#inputs').innerHTML = `
    ${aiCardHtml()}

    <section class="card">
      <div class="lbl"><h2>${esc(t.sections.location)}</h2>${infoBtn('location', 'location', t.labels.location)}</div>${infoPanel('location', 'location')}
      <div class="row"><input id="geo-q" placeholder="${esc(t.inputs.searchPlaceholder)}" value="" autocomplete="off"><button id="geo-go">${esc(t.inputs.search)}</button></div>
      <div class="geo-results" id="geo-results"></div>
      <p class="help">${esc(t.inputs.selected)} <b>${esc(s.location.name)}</b> (${s.location.latitude.toFixed(3)}, ${s.location.longitude.toFixed(3)}, ${esc(s.location.countryCode)})</p>
      <div class="field"><label for="lat">${esc(t.labels.latitude)}</label><input id="lat" type="number" inputmode="decimal" step="0.001" value="${s.location.latitude}"></div>
      <div class="field"><label for="lon">${esc(t.labels.longitude)}</label><input id="lon" type="number" inputmode="decimal" step="0.001" value="${s.location.longitude}"></div>
      ${row('cc', 'countryCode', esc(t.labels.countryCode), t.labels.countryCode, `<input id="cc" maxlength="2" value="${esc(s.location.countryCode)}">`)}
      ${row('start', 'period', esc(t.labels.from), t.labels.period, `<input id="start" type="date" min="1940-01-01" value="${s.startDate}">`)}
      <div class="field"><label for="end">${esc(t.labels.to)}</label><input id="end" type="date" value="${s.endDate ?? ''}"></div>
    </section>

    ${SECTIONS.map((sec) => `<details class="card" data-sec="${sec.id}" ${sec.open ? 'open' : ''}><summary>${esc(t.sections[sec.id])}</summary>
      ${sec.fields.map(fieldHtml).join('')}${sec.extra ? sec.extra() : ''}</details>`).join('')}

    <details class="card" data-sec="areas"><summary>${esc(t.sections.areas)}</summary>
      <p class="help">${esc(t.inputs.areasIntro)}</p>
      <div class="scroll-x"><table class="areas"><thead><tr><th></th>${AREA_COLS.map((c) => `<th><span class="th-info">${esc(t.inputs.areaCols[c.key])}${infoBtn(c.help, `area-${c.help}`, t.inputs.areaHelp[c.help])}</span></th>`).join('')}</tr></thead><tbody>
      ${s.specs.solarAreas.map((a, i) => `<tr><td>${esc(monthName(i))}</td>${AREA_COLS.map((c) => `<td><input type="number" inputmode="decimal" step="any" data-area="${i}" data-col="${c.key}" aria-label="${esc(`${t.inputs.areaCols[c.key]} ${monthName(i)}`)}" value="${+a[c.key].toFixed(4)}"></td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      ${AREA_HELP_KEYS.map((k) => infoPanel(k, `area-${k}`, t.inputs.areaHelp[k])).join('')}
      <div class="row" style="margin-top:6px"><button class="small" id="areas-fill">${esc(t.inputs.areasFill)}</button></div>
    </details>

    <details class="card" data-sec="prices" open><summary>${esc(t.sections.prices)}</summary>
      ${row('band', 'band', esc(t.labels.band), t.labels.band, `<select id="band">
        ${CONSUMPTION_BANDS.map((b) => `<option value="${b.code}" ${b.code === s.band ? 'selected' : ''}>${esc(bands[b.code] ?? b.label)}</option>`).join('')}</select>`)}
      ${fieldHtml({ key: 'fallbackTariff', unit: '€/kWh', step: 0.001 })}
      <p class="help">${esc(priceInfo())} ${esc(t.inputs.pricesOverrideHint)}</p>
      <div class="scroll-x"><table><thead><tr><th>${esc(t.inputs.priceHeads.halfYear)}</th><th>${esc(t.inputs.priceHeads.eurostat)}</th><th><span class="th-info">${esc(t.inputs.priceHeads.override)}${infoBtn('priceOverrides', 'priceOverrides', t.labels.priceOverrides)}</span></th><th>${esc(t.inputs.priceHeads.used)}</th></tr></thead><tbody>
      ${sems.map((sem) => `<tr><td>${sem}</td><td>${eurostat[sem] !== undefined ? n4(eurostat[sem]) : '–'}</td>
        <td><input type="number" inputmode="decimal" step="0.001" data-sem="${sem}" aria-label="${esc(`${t.inputs.priceHeads.override} ${sem}`)}" value="${s.priceOverrides[sem] ?? ''}" style="width:90px"></td>
        <td>${n4(tariff(`${sem.slice(0, 4)}-${sem.endsWith('1') ? '01' : '07'}-01`))}</td></tr>`).join('')}
      </tbody></table></div>
      ${infoPanel('priceOverrides', 'priceOverrides')}
    </details>

    <section class="card">
      <h2>${esc(t.sections.scenarios)}</h2>
      <p class="help">${esc(t.scenarios.intro)}</p>
      <div class="row"><input id="sc-name" placeholder="${esc(t.scenarios.namePlaceholder)}"><button id="sc-save">${esc(t.scenarios.save)}</button></div>
      <div style="margin-top:6px">${scenarios.length ? scenarios.map((sc, i) => `<div class="scenario"><span title="${esc(sc.name)}">${esc(sc.name)} <small>${sc.savedAt.slice(0, 10)}</small></span>
        <button class="small" data-load="${i}">${esc(t.scenarios.load)}</button><button class="small" data-del="${i}">${esc(t.scenarios.delete)}</button></div>`).join('') : `<p class="help">${esc(t.scenarios.none)}</p>`}</div>
      <div class="row" style="margin-top:10px">
        <button class="small" id="export">${esc(t.scenarios.export)}</button>
        <label class="small" style="flex:0 0 auto"><button class="small" id="import-btn" type="button">${esc(t.scenarios.import)}</button><input id="import" type="file" accept="application/json" hidden></label>
        <button class="small" id="reset">${esc(t.scenarios.reset)}</button>
        <button class="small" id="clear">${esc(t.scenarios.clear)}</button>
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
      if (key === 'designHeatLoadOverrideKw' || key === 'fallbackTariff') state.specs[key] = v !== null && v > 0 ? v : null;
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
      case 'lat': state.location.latitude = Number(t.value); state.location.name = L().inputs.customCoordinates; break;
      case 'lon': state.location.longitude = Number(t.value); state.location.name = L().inputs.customCoordinates; break;
      case 'cc': {
        const r = store.withLocation(state, { ...state.location, countryCode: t.value.toUpperCase() });
        state = r.state; eurostat = {}; priceSource = null;
        loadPricesFromCache(); renderInputsKeepFocus();
        if (r.clearedOverrides) setStatus(L().status.countryChanged);
        break;
      }
      case 'start': if (t.value) state.startDate = t.value; renderInputsKeepFocus(); break;
      case 'end': state.endDate = t.value || null; renderInputsKeepFocus(); break;
      case 'band': state.band = t.value as BandCode; eurostat = {}; priceSource = null; loadPricesFromCache(); renderInputsKeepFocus(); recompute(); break;
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
    if (t.dataset.info) {
      const id = t.dataset.info;
      const panel = document.getElementById(`info-${id}`);
      const open = !!panel?.hidden;
      if (panel) panel.hidden = !open;
      if (open) openInfo.add(id); else openInfo.delete(id);
      t.setAttribute('aria-expanded', String(open));
      return;
    }
    if (t.id === 'ai-copy') return copyText(fullPrompt(state, L().meta.name, SITE_URL), L().ai.copied, $<HTMLTextAreaElement>('#ai-copy-fallback'));
    if (t.id === 'ai-apply') {
      const text = $<HTMLTextAreaElement>('#ai-paste').value;
      if (text.trim()) void importFromText(text);
      return;
    }
    if (t.id === 'geo-go') return geocode();
    if (t.dataset.geo) {
      const r = JSON.parse(t.dataset.geo);
      const res = store.withLocation(state, r);
      state = res.state;
      eurostat = {}; priceSource = null;
      loadPricesFromCache();
      persist();
      renderInputsKeepFocus();
      recompute();
      setStatus(fmt(res.clearedOverrides ? L().status.locationSetCleared : L().status.locationSet, { name: r.name }));
      return;
    }
    if (t.id === 'areas-fill') {
      const jul = state.specs.solarAreas[6];
      state.specs.solarAreas = state.specs.solarAreas.map(() => ({ ...jul }));
      persist(); renderInputsKeepFocus(); recompute();
      return;
    }
    if (t.id === 'sc-save') {
      const name = ($<HTMLInputElement>('#sc-name').value || fmt(L().scenarios.defaultName, { date: dateTime(new Date().toISOString()) })).trim();
      const list = store.loadScenarios().filter((s) => s.name !== name);
      list.unshift({ name, savedAt: new Date().toISOString(), state: structuredClone(state) });
      if (!store.saveScenarios(list)) setStatus(L().scenarios.saveFailed, true);
      renderInputsKeepFocus();
      return;
    }
    if (t.dataset.load) {
      const sc = store.loadScenarios()[Number(t.dataset.load)];
      if (sc) applyState(store.normalizeState(sc.state), fmt(L().scenarios.loaded, { name: sc.name }));
      return;
    }
    if (t.dataset.del) {
      const list = store.loadScenarios();
      const [gone] = list.splice(Number(t.dataset.del), 1);
      if (gone && confirm(fmt(L().scenarios.confirmDelete, { name: gone.name }))) { store.saveScenarios(list); renderInputsKeepFocus(); }
      return;
    }
    if (t.id === 'export') return exportJson();
    if (t.id === 'import-btn') return $<HTMLInputElement>('#import').click();
    if (t.id === 'reset') {
      if (confirm(L().scenarios.confirmReset)) applyState(store.defaultState(), L().scenarios.defaultsRestored);
      return;
    }
    if (t.id === 'clear') {
      if (confirm(L().scenarios.confirmClear)) {
        store.clearAll();
        weather = null; eurostat = {}; priceSource = null;
        applyState(store.defaultState(), L().scenarios.cleared);
      }
    }
  });

  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'geo-q' && e.key === 'Enter') geocode();
    if (t.id === 'ai-paste' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $<HTMLButtonElement>('#ai-apply').click();
  });

  // Paste a link or settings straight into the box → apply immediately.
  root.addEventListener('paste', (e) => {
    const t = e.target as HTMLElement;
    if (t.id !== 'ai-paste') return;
    const text = e.clipboardData?.getData('text') ?? '';
    if (parseAiInput(text).count > 0) {
      e.preventDefault();
      (t as HTMLTextAreaElement).value = text;
      void importFromText(text);
    }
  });
}

function renderInputsKeepFocus() {
  const id = document.activeElement?.id;
  const openState = new Map([...document.querySelectorAll<HTMLDetailsElement>('#inputs details[data-sec]')].map((d) => [d.dataset.sec, d.open]));
  const paste = document.getElementById('ai-paste') as HTMLTextAreaElement | null;
  const pasteValue = paste?.value ?? '';
  renderInputs();
  document.querySelectorAll<HTMLDetailsElement>('#inputs details[data-sec]').forEach((d) => {
    const o = openState.get(d.dataset.sec);
    if (o !== undefined) d.open = o;
  });
  if (pasteValue) $<HTMLTextAreaElement>('#ai-paste').value = pasteValue;
  applyHighlight();
  if (id) document.getElementById(id)?.focus();
}

function applyState(s: store.AppState, msg: string) {
  state = s;
  store.saveCurrent(state);
  loadPricesFromCache();
  renderInputsKeepFocus();
  recompute();
  if (msg) setStatus(msg);
}

async function geocode() {
  const q = $<HTMLInputElement>('#geo-q').value.trim();
  if (!q) return;
  const out = $('#geo-results');
  out.textContent = L().inputs.searching;
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: '6', language: L().meta.htmlLang, format: 'json' })}`);
    const json = await res.json();
    const results = (json.results ?? []) as { name: string; latitude: number; longitude: number; country_code: string; admin1?: string; country?: string }[];
    out.innerHTML = results.length
      ? results.map((r) => {
          const loc = { name: [r.name, r.admin1, r.country].filter(Boolean).join(', '), latitude: r.latitude, longitude: r.longitude, countryCode: r.country_code };
          return `<button data-geo='${esc(JSON.stringify(loc))}'>${esc(loc.name)}</button>`;
        }).join('')
      : `<p class="help">${esc(L().inputs.noMatches)}</p>`;
  } catch {
    out.innerHTML = `<p class="help">${esc(L().inputs.searchFailed)}</p>`;
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
    applyState(store.normalizeState(data.current ?? data.state ?? data), fmt(L().scenarios.imported, { file: file.name }));
  } catch {
    setStatus(L().scenarios.importBad, true);
  }
}

// ------------------------------------------------------------------ AI import / export

async function copyText(text: string, okMsg: string, fallback?: HTMLTextAreaElement) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(okMsg);
    if (fallback) fallback.hidden = true;
  } catch {
    if (fallback) {
      fallback.value = text;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
    }
    setStatus(L().ai.copyFailed, true);
  }
}

/** Apply settings produced by an AI (link, key=value text or JSON), show what changed, and calculate. */
async function importFromText(text: string) {
  const t = L().ai;
  const parsed = parseAiInput(text);
  if (parsed.count === 0) {
    showBanner([], parsed.issues.length ? parsed.issues : [t.nothingFound]);
    return;
  }
  const issues = [...parsed.issues];
  const changes = parsed.changes;
  if (changes.place && !changes.location) {
    const [placeName] = changes.place.split('|');
    setStatus(fmt(t.lookingUp, { place: placeName }));
    try {
      const hit = await geocodePlace(changes.place, L().meta.htmlLang);
      if (hit) changes.location = hit;
      else issues.push(fmt(t.placeNotFound, { place: placeName }));
    } catch {
      issues.push(fmt(t.placeNotFound, { place: placeName }));
    }
  }
  if (changes.location && !changes.location.countryCode) changes.location.countryCode = state.location.countryCode;

  const before = structuredClone(state);
  let next: store.AppState;
  try {
    next = applyChanges(state, changes);
  } catch (err) {
    showBanner([], [err instanceof InputError ? err.message : String(err)]);
    return;
  }
  const changed = changedKeys(before, next);
  undoState = before;
  if (changes.location && changes.location.countryCode !== before.location.countryCode) { eurostat = {}; priceSource = null; }
  applyState(next, '');
  const paste = document.getElementById('ai-paste') as HTMLTextAreaElement | null;
  if (paste) paste.value = '';
  showBanner(changed, issues);
  setView('results');
  if (needsFetch()) await run();
}

function showBanner(changed: string[], issues: string[]) {
  const t = L().ai;
  const host = $('#ai-banner');
  const list = changed.map(keyLabel);
  host.innerHTML = `<div class="ai-banner" role="status">
    <div>
      ${changed.length ? `<p>${esc(fmt(t.banner, { n: changed.length, list: list.slice(0, 8).join(', ') + (list.length > 8 ? '…' : '') }))}</p>` : issues.length ? '' : `<p>${esc(t.bannerNone)}</p>`}
      ${issues.length ? `<p class="ai-issues">${esc(fmt(t.bannerIssues, { list: '' }))}</p><ul>${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="ai-banner-actions">
      ${changed.length && undoState ? `<button type="button" id="ai-undo">${esc(t.undo)}</button>` : ''}
      <button type="button" id="ai-dismiss" aria-label="${esc(t.dismiss)}">×</button>
    </div></div>`;
  highlightChanged(changed);
}

/** Inputs changed by the last AI import; re-applied after every re-render. */
let highlighted: string[] = [];
function highlightChanged(changed: string[]) {
  highlighted = changed;
  applyHighlight();
}
function applyHighlight() {
  document.querySelectorAll('.ai-changed').forEach((e) => e.classList.remove('ai-changed'));
  for (const k of highlighted) {
    document.getElementById(`f-${k}`)?.classList.add('ai-changed');
    document.querySelectorAll(`[data-col="${k}"]`).forEach((e) => e.classList.add('ai-changed'));
  }
}

$('#ai-banner').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.id === 'ai-undo' && undoState) {
    const prev = undoState;
    undoState = null;
    eurostat = {}; priceSource = null;
    applyState(prev, L().ai.undone);
    $('#ai-banner').innerHTML = '';
    if (needsFetch()) void run();
  }
  if (b.id === 'ai-dismiss') {
    $('#ai-banner').innerHTML = '';
    highlightChanged([]);
  }
});

/** Inputs in the address (from an AI link): apply them once, then clean the address bar. */
function importFromUrl(): boolean {
  const raw = location.hash.length > 1 ? location.hash.slice(1) : location.search.slice(1);
  if (!raw || parseAiInput(raw).count === 0) return false;
  history.replaceState(null, '', location.pathname);
  void importFromText(raw);
  return true;
}
window.addEventListener('hashchange', () => importFromUrl());

// ------------------------------------------------------------------ data fetching

function loadPricesFromCache() {
  const cached = store.loadPrices(state.location.countryCode.toUpperCase(), state.band);
  if (cached) {
    eurostat = cached.prices;
    priceSource = { ok: true, geo: cached.geo, updated: cached.updated };
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
    priceSource = { ok: true, geo: p.geo, updated: p.updated };
  } catch {
    eurostat = {};
    priceSource = { ok: false, geo: cc };
  }
}

const needsFetch = () => !weatherCovers(weather) || weather!.end < endDate();

/** Fetch weather + prices and recalculate. Resolves with an error message, or null on success. */
async function run(): Promise<string | null> {
  if (busy) return L().status.busy;
  busy = true;
  const btns = [$<HTMLButtonElement>('#run'), $<HTMLButtonElement>('#run-mobile')];
  btns.forEach((b) => (b.disabled = true));
  try {
    const { latitude, longitude } = state.location;
    const end = endDate();
    if (state.startDate > end) throw new Error(L().status.startAfterEnd);
    setStatus(L().status.fetchingPrices);
    const pricesP = refreshPrices();
    const w = await fetchWeather(latitude, longitude, state.startDate, end, weather, (p) =>
      setStatus(fmt(p.kind === 'archive' ? L().status.downloadingArchive : L().status.fillingRecent, { from: p.from, to: p.to })));
    await pricesP;
    weather = w;
    const ok = store.saveWeather(w);
    renderInputsKeepFocus();
    recompute();
    setView('results');
    setStatus(`${fmt(L().status.weatherFetched, { from: w.start, to: w.end, tz: w.timezone, when: dateTime(w.fetchedAt) })}${ok ? '' : ` ${L().status.tooLarge}`}`);
    return null;
  } catch (err) {
    setStatus((err as Error).message, true);
    return (err as Error).message;
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
    lastResults = null;
    host.innerHTML = `<div class="card empty">${fmt(L().results.empty, { run: esc(L().app.run), place: esc(state.location.name) })}</div>`;
    return;
  }
  const r = computeResults(state)!;
  skipped = r.skipped;
  lastRows = r.rows;
  lastResults = r;
  renderResults(host, r.years, r.tot, r.cap, weather!);
}

/** Pure calculation for a given state against the loaded weather; null when weather isn't loaded for it. */
function computeResults(s: store.AppState): Results | null {
  if (!weather || weather.latitude !== s.location.latitude || weather.longitude !== s.location.longitude || weather.start > s.startDate) return null;
  const tariff = buildTariffLookup(eurostat, s.priceOverrides, s.specs.fallbackTariff);
  const agg = aggregate(weather, s.specs, s.startDate, s.endDate ?? addDays(todayLocal(), -1));
  const rows = agg.days.map((d) => computeDay(d, s.specs, tariff));
  const years = summarizeByYear(rows);
  return { rows, years, tot: totals(years), cap: capacityCheck(s.specs, rows, agg.maxHourlyTemp), skipped: agg.skippedDays };
}

function renderResults(host: HTMLElement, years: YearSummary[], tot: YearSummary, cap: CapacityCheck, w: WeatherData) {
  const t = L().results;
  const T = state.specs.hotDayThreshold;
  const full = years.filter((y) => y.days >= 365);
  const avgCost = full.length ? full.reduce((a, y) => a + (state.specs.comfortEnabled ? y.totalCostInclComfort : y.cost), 0) / full.length : null;
  const avgKwh = full.length ? full.reduce((a, y) => a + y.elecTotal, 0) / full.length : null;
  const heatOk = cap.pumpsAtDesignKw >= cap.designHeatLoadKw;
  const deficits = tot.heatDeficitDays + tot.coolDeficitDays;
  const coversEnd = w.end >= endDate();
  const dt = state.specs.designOutdoorTemp;

  type Col = [string, (y: YearSummary) => string, (y: YearSummary) => boolean];
  const c = t.cols;
  const cols: Col[] = [
    [c.days, (y) => n0(y.days), () => false],
    [c.frostDays, (y) => n0(y.frostDays), () => false],
    [fmt(c.hotDays, { t: T }), (y) => n0(y.hotDays), () => false],
    [fmt(c.hotHours, { t: T }), (y) => n0(y.hotHours), () => false],
    [c.heatDefDays, (y) => n0(y.heatDeficitDays), (y) => y.heatDeficitDays > 0],
    [c.heatDefPeriods, (y) => n0(y.heatDeficitPeriods), (y) => y.heatDeficitPeriods > 0],
    [c.coolDefDays, (y) => n0(y.coolDeficitDays), (y) => y.coolDeficitDays > 0],
    [c.coolDefPeriods, (y) => n0(y.coolDeficitPeriods), (y) => y.coolDeficitPeriods > 0],
    [c.heatKwh, (y) => n0(y.heatElec), () => false],
    [c.coolKwh, (y) => n0(y.coolElec), () => false],
    [c.totalKwh, (y) => n0(y.elecTotal), () => false],
    [c.cost, (y) => n0(y.cost), () => false],
    ...(state.specs.comfortEnabled
      ? ([[c.coolInclComfort, (y) => n0(y.coolCostInclComfort), () => false], [c.totalInclComfort, (y) => n0(y.totalCostInclComfort), () => false]] as Col[])
      : []),
  ];

  host.innerHTML = `
    ${skipped.length ? `<div class="notice">${esc(fmt(t.skipped, { n: skipped.length, list: skipped.slice(0, 3).join(', ') + (skipped.length > 3 ? '…' : '') }))}</div>` : ''}
    ${!coversEnd ? `<div class="notice">${esc(fmt(t.stale, { end: w.end, run: L().app.run, to: endDate() }))}</div>` : ''}
    <div class="results-tools"><button type="button" id="ai-results"><span aria-hidden="true">✨</span> ${esc(L().ai.copyResults)}</button></div>
    <textarea id="ai-results-fallback" class="ai-fallback" rows="4" readonly hidden></textarea>
    <div class="kpis">
      <div class="kpi"><div class="label">${esc(t.kpiAvgCost)}</div><div class="value">${avgCost !== null ? eur(avgCost) : '–'}</div><div class="note">${esc(fmt(t.kpiAvgCostNote, { n: full.length }))}${state.specs.comfortEnabled ? esc(t.kpiInclComfort) : ''}</div></div>
      <div class="kpi"><div class="label">${esc(t.kpiAvgKwh)}</div><div class="value">${avgKwh !== null ? `${n0(avgKwh)} kWh` : '–'}</div><div class="note">${esc(t.kpiAvgKwhNote)}</div></div>
      <div class="kpi"><div class="label">${esc(t.kpiHeat)}</div><div class="value" style="color:var(${heatOk ? '--good-ink' : '--bad-ink'})">${heatOk ? '✓' : '✗'} ${n1(cap.pumpsAtDesignKw)} / ${n1(cap.designHeatLoadKw)} kW</div><div class="note">${esc(fmt(t.kpiHeatNote, { t: dt }))}</div></div>
      <div class="kpi"><div class="label">${esc(t.kpiDeficit)}</div><div class="value" style="color:var(${deficits ? '--bad-ink' : '--good-ink'})">${deficits ? '✗' : '✓'} ${n0(deficits)}</div><div class="note">${esc(fmt(t.kpiDeficitNote, { h: n0(tot.heatDeficitDays), c: n0(tot.coolDeficitDays) }))}</div></div>
    </div>

    <section class="card"><h2>${esc(t.perYear)}</h2><div class="scroll-x"><table>
      <thead><tr><th>${esc(t.year)}</th>${cols.map((col) => `<th>${esc(col[0])}</th>`).join('')}</tr></thead>
      <tbody>${years.map((y) => `<tr><td>${y.year}${y.days < 365 ? ` <small>${esc(t.partial)}</small>` : ''}</td>${cols.map((col) => `<td class="${col[2](y) ? 'bad' : ''}">${col[1](y)}</td>`).join('')}</tr>`).join('')}
      <tr class="total"><td>${esc(t.total)}</td>${cols.map((col) => `<td>${col[1](tot)}</td>`).join('')}</tr></tbody>
    </table></div></section>

    <section class="card"><h2>${esc(t.monthly)}</h2><div id="chart"></div></section>

    <section class="card"><h2>${esc(t.capacity)}</h2><div class="scroll-x"><table>
      <thead><tr><th>${esc(t.capHeads.item)}</th><th>${esc(t.capHeads.value)}</th><th style="text-align:left">${esc(t.capHeads.meaning)}</th></tr></thead><tbody>
      <tr><td>${esc(fmt(t.capRows.demand, { t: dt }))}</td><td>${n2(cap.designHeatLoadKw)} kW</td><td class="wrap">${esc(t.capRows.demandMeaning)}</td></tr>
      <tr><td>${esc(fmt(t.capRows.pumps, { n: state.specs.pumpCount, t: dt }))}</td><td class="${heatOk ? '' : 'bad'}">${n2(cap.pumpsAtDesignKw)} kW</td><td class="wrap">${esc(t.capRows.pumpsMeaning)}</td></tr>
      <tr><td>${esc(t.capRows.maxCool)}</td><td>${n2(cap.maxCoolDemandKw)} kW</td><td class="wrap">${esc(t.capRows.maxCoolMeaning)}</td></tr>
      <tr><td>${esc(t.capRows.heatUnmet)}</td><td class="${cap.heatUnmetKwh > 0 ? 'bad' : ''}">${n0(cap.heatUnmetKwh)} kWh</td><td class="wrap">${esc(t.capRows.heatUnmetMeaning)}</td></tr>
      <tr><td>${esc(t.capRows.coolUnmet)}</td><td class="${cap.coolUnmetKwh > 0 ? 'bad' : ''}">${n0(cap.coolUnmetKwh)} kWh</td><td class="wrap">${esc(t.capRows.coolUnmetMeaning)}</td></tr>
      <tr><td>${esc(t.capRows.maxTemp)}</td><td>${cap.maxHourlyTemp !== null ? n1(cap.maxHourlyTemp) : '–'} °C</td><td class="wrap">${esc(t.capRows.maxTempMeaning)}</td></tr>
    </tbody></table></div></section>

    <section class="card"><h2>${esc(t.days)}</h2>
      <div class="tabs" id="day-tabs">
        ${(['hot', 'frost', 'deficit', 'all'] as const).map((k) => `<button data-filter="${k}" aria-pressed="${dailyFilter === k}">${esc(fmt(t.tabs[k], { t: T }))}</button>`).join('')}
        <button id="csv" style="margin-left:auto">${esc(t.csv)}</button>
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
  $('#ai-results', host).addEventListener('click', () => {
    if (lastResults) void copyText(resultsForAi(state, lastResults, SITE_URL), L().ai.resultsCopied, $<HTMLTextAreaElement>('#ai-results-fallback', host));
  });
}

function dayCols(): [string, (r: DayResult) => string | number][] {
  const c = L().results.dayCols;
  return [
    [c.date, (r) => r.date],
    [c.min, (r) => n1(r.input.tmin)],
    [c.max, (r) => n1(r.input.tmax)],
    [c.dayH, (r) => n2(r.input.dayHours)],
    [c.dayMean, (r) => n1(r.input.tDay)],
    [c.nightMean, (r) => n1(r.input.tNight)],
    [c.heatPeak, (r) => n1(r.heatPeakKw)],
    [c.heatReserve, (r) => n1(r.heatReserveKw)],
    [c.coolPeak, (r) => n1(r.coolPeakKw)],
    [c.coolReserve, (r) => n1(r.coolReserveKw)],
    [c.heatKwh, (r) => n1(r.heatElecDay + r.heatElecNight)],
    [c.coolKwh, (r) => n1(r.coolElecDay + r.coolElecNight)],
    [c.tariff, (r) => n4(r.tariff)],
    [c.cost, (r) => n2(r.cost)],
    [c.comfort, (r) => n2(r.comfortCost)],
    [c.hotHours, (r) => r.hoursHot],
    [c.coolHours, (r) => r.hoursAboveCool],
    [c.deficit, (r) => [r.heatDeficitDay || r.heatDeficitNight ? L().results.deficitHeat : '', r.coolDeficitDay || r.coolDeficitNight ? L().results.deficitCool : ''].filter(Boolean).join('+')],
  ];
}

function renderDays() {
  const host = document.getElementById('days');
  if (!host) return;
  const t = L().results;
  const cols = dayCols();
  const rows = lastRows.filter((r) =>
    dailyFilter === 'all' ? true
      : dailyFilter === 'frost' ? r.frost
      : dailyFilter === 'hot' ? r.hoursHot > 0
      : r.heatDeficitDay + r.heatDeficitNight + r.coolDeficitDay + r.coolDeficitNight > 0,
  );
  const LIMIT = 500;
  const shown = rows.slice(-LIMIT).reverse();
  host.innerHTML = rows.length
    ? `<p class="help">${esc(fmt(t.dayCount, { n: rows.length }))} ${rows.length > LIMIT ? esc(fmt(t.showingLatest, { n: LIMIT })) : ''} ${esc(t.csvHint)}</p>
      <div class="scroll-x" style="max-height:480px;overflow-y:auto"><table><thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join('')}</tr></thead>
      <tbody>${shown.map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : `<p class="help">${esc(t.noDays)}</p>`;
}

/** CSV stays machine-readable: English headers, dot decimals. */
function downloadCsv() {
  const head = ['date', 'min_c', 'max_c', 'daylight_h', 'day_mean_c', 'night_mean_c', 'heat_peak_kw', 'heat_reserve_kw', 'cool_peak_kw', 'cool_reserve_kw',
    'heating_kwh', 'cooling_kwh', 'tariff_eur_kwh', 'cost_eur', 'comfort_eur', 'hours_hot', 'hours_above_cool', 'heat_deficit', 'cool_deficit'];
  const lines = [head.join(',')];
  for (const r of lastRows) {
    lines.push([r.date, r.input.tmin, r.input.tmax, r.input.dayHours.toFixed(3), r.input.tDay.toFixed(2), r.input.tNight.toFixed(2), r.heatPeakKw.toFixed(2),
      r.heatReserveKw.toFixed(2), r.coolPeakKw.toFixed(2), r.coolReserveKw.toFixed(2), (r.heatElecDay + r.heatElecNight).toFixed(2),
      (r.coolElecDay + r.coolElecNight).toFixed(2), r.tariff, r.cost.toFixed(2), r.comfortCost.toFixed(2), r.hoursHot, r.hoursAboveCool,
      r.heatDeficitDay || r.heatDeficitNight ? 1 : 0, r.coolDeficitDay || r.coolDeficitNight ? 1 : 0].join(','));
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = `heat-pump-days-${state.startDate}-${endDate()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ------------------------------------------------------------------ boot

applyLang(getLang());
renderStatic();
loadPricesFromCache();
renderInputs();
bindInputs();
$('#run').addEventListener('click', () => void run());
$('#run-mobile').addEventListener('click', () => void run());
$<HTMLSelectElement>('#lang').addEventListener('change', (e) => {
  chooseLang((e.target as HTMLSelectElement).value as Lang | 'auto');
  renderStatic();
  renderInputsKeepFocus();
  recompute();
  setStatus('');
  $('#ai-banner').innerHTML = '';
});

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

// WebMCP: let in-browser AI agents use the calculator (no-op where the browser has no WebMCP support).
registerWebMcpTools({
  getState: () => structuredClone(state),
  applyState: (next, msg) => applyState(store.normalizeState(next), msg),
  run,
  compute: (s) => computeResults(s ?? state),
  endDate,
  needsFetch,
  weatherInfo: () => (weather ? { from: weather.start, to: weather.end, timezone: weather.timezone, fetchedAt: weather.fetchedAt } : null),
  tariffs: () => {
    const lookup = buildTariffLookup(eurostat, state.priceOverrides, state.specs.fallbackTariff);
    return Object.fromEntries(semestersBetween(state.startDate, endDate()).map((sem) => {
      const source = tariffSource(eurostat, state.priceOverrides, state.specs.fallbackTariff, sem);
      return [sem, { eurPerKwh: lookup(`${sem.slice(0, 4)}-${sem.endsWith('1') ? '01' : '07'}-01`), source }];
    }));
  },
  priceSourceInfo: () => (priceSource ? (priceSource.ok ? `Eurostat ${priceSource.geo}, updated ${priceSource.updated.slice(0, 10)}` : `No Eurostat data for ${priceSource.geo}`) : ''),
  setStatus,
});

// A link from an AI assistant takes priority; it calculates on its own.
const importing = importFromUrl();

// First visit without results: start on the specs panel.
if (!importing && !weatherCovers(weather)) setView('inputs');
recompute();

// Pull fresh data automatically when the cache is missing, stale or doesn't cover the range.
if (!importing && (needsFetch() || Date.now() - Date.parse(weather!.fetchedAt) > 12 * 3600e3)) {
  void run();
}

