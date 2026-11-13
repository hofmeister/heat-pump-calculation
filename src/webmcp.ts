/**
 * WebMCP tools (https://webmachinelearning.github.io/webmcp/): let an AI agent
 * running in the user's browser use the calculator through the page itself,
 * with no backend. Everything runs client-side against the same state, data
 * cache and model as the UI, and every change shows up in the UI.
 *
 * Registers through `document.modelContext` (current spec) and falls back to
 * `navigator.modelContext` (earlier browser previews / polyfills). If neither
 * exists this module does nothing.
 */
import { DEFAULT_SPECS } from './defaults';
import type { Results } from './main';
import type { MonthlyAreas, Specs, YearSummary } from './model';
import { CONSUMPTION_BANDS } from './prices';
import { HELP } from './specHelp';
import * as store from './storage';

export interface AppApi {
  getState(): store.AppState;
  applyState(next: store.AppState, statusMsg: string): void;
  /** Fetch data and recalculate; resolves with an error message or null. */
  run(): Promise<string | null>;
  compute(state?: store.AppState): Results | null;
  endDate(): string;
  needsFetch(): boolean;
  weatherInfo(): { from: string; to: string; timezone: string; fetchedAt: string } | null;
  tariffs(): Record<string, { eurPerKwh: number; source: string }>;
  priceSourceInfo(): string;
  setStatus(msg: string, error?: boolean): void;
}

// ------------------------------------------------------------------ schema helpers

/** Every numeric spec with its meaning, used both for the JSON schema and validation. */
const SPEC_DOCS: Record<Exclude<keyof Specs, 'solarAreas' | 'comfortEnabled'>, string> = {
  heatingIndoorTemp: 'Indoor heating setpoint, °C',
  designOutdoorTemp: 'Outdoor design temperature for heating, °C',
  designTransmissionLossW: 'Design transmission heat loss at the design temperature, W',
  designVentilationLossW: 'Design ventilation heat loss at the design temperature, W',
  designHeatLoadOverrideKw: 'Overrides transmission+ventilation as the design heat load, kW (null = use the sum)',
  pumpCount: 'Number of heat pumps used for space heating/cooling',
  heatCapMinus7: 'Heating capacity per pump at −7 °C outdoor, kW',
  heatCapPlus7: 'Heating capacity per pump at +7 °C outdoor, kW',
  copMinus7: 'COP at −7 °C',
  copPlus7: 'COP at +7 °C',
  heatCapFactor: 'Delivered heating capacity factor (1 = datasheet, 0.9 = 10 % less)',
  coolingThreshold: 'Cooling runs when the outdoor period mean exceeds this; also the indoor cooling setpoint, °C',
  hotDayThreshold: 'A "very hot" day has at least one hour at or above this, °C',
  coolTransmissionKwK: 'Transmission coefficient for cooling, kW/K',
  coolVentilationKwK: 'Ventilation coefficient for cooling, kW/K',
  internalGainsKw: 'Internal heat gains during cooling, kW',
  coolCapA35: 'Cooling capacity per pump at A35/W7, kW',
  eerA35: 'EER at A35/W7',
  coolCapLossPerK: 'Cooling capacity loss per °C above 35 °C (fraction, e.g. 0.01)',
  eerLossPerK: 'EER loss per °C above 35 °C (fraction, e.g. 0.02)',
  fanCoilCapKw: 'Total fan-coil cooling capacity (delivery limit), kW',
  coolCapFactor: 'Delivered cooling capacity factor',
  windowSolarFactor: 'Multiplier on solar gains through windows',
  opaqueSolarFactor: 'Multiplier on solar gains through opaque surfaces',
  dehumidFactor: 'Multiplier on the dehumidification (latent) load',
  airflowM3h: 'Ventilation air flow used for the humidity load, m³/h',
  indoorRH: 'Indoor relative humidity reference, 0–1',
  comfortTargetTemp: 'Night comfort cooling target temperature, °C',
  comfortAreaM2: 'Floor area cooled to the night comfort target, m²',
  totalFloorAreaM2: 'Total heated floor area, m²',
  fallbackTariff: 'My current tariff, used for half-years without an override or Eurostat price, €/kWh (null = latest Eurostat price)',
};

const AREA_DOCS: Record<keyof MonthlyAreas, string> = {
  winN: 'Effective window solar area, north, m²', winE: 'Effective window solar area, east, m²',
  winS: 'Effective window solar area, south, m²', winW: 'Effective window solar area, west, m²',
  opqN: 'Effective opaque solar area, north, m²', opqE: 'Effective opaque solar area, east, m²',
  opqS: 'Effective opaque solar area, south, m²', opqW: 'Effective opaque solar area, west, m²',
  opqH: 'Effective opaque solar area, roof (horizontal), m²', irLossKw: 'Long-wave radiation loss to the sky, kW',
};

const specsSchema = {
  type: 'object',
  description: 'Building and heat-pump specs to change. Only include the fields you want to change.',
  additionalProperties: false,
  properties: {
    ...Object.fromEntries(
      Object.entries(SPEC_DOCS).filter(([k]) => k !== 'fallbackTariff').map(([k, d]) => [k, k === 'designHeatLoadOverrideKw' ? { type: ['number', 'null'], description: d } : { type: 'number', description: d }]),
    ),
    comfortEnabled: { type: 'boolean', description: 'Include night comfort cooling' },
  },
};

const areasSchema = {
  type: 'object',
  description: 'Effective solar areas applied to all 12 months. Only include the fields you want to change.',
  additionalProperties: false,
  properties: Object.fromEntries(Object.entries(AREA_DOCS).map(([k, d]) => [k, { type: 'number', description: d }])),
};

const SEMESTER = '^\\d{4}-S[12]$';
const DATE = '^\\d{4}-\\d{2}-\\d{2}$';

class InputError extends Error {}

function applyChanges(base: store.AppState, input: Record<string, unknown>): store.AppState {
  let next = structuredClone(base);
  const specs = (input.specs ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(specs)) {
    if (k === 'comfortEnabled') {
      if (typeof v !== 'boolean') throw new InputError('specs.comfortEnabled must be a boolean.');
      next.specs.comfortEnabled = v;
    } else if (k in SPEC_DOCS && k !== 'fallbackTariff') {
      if (k === 'designHeatLoadOverrideKw' && v === null) next.specs.designHeatLoadOverrideKw = null;
      else if (typeof v === 'number' && Number.isFinite(v)) (next.specs as unknown as Record<string, number>)[k] = v;
      else throw new InputError(`specs.${k} must be a number.`);
    } else throw new InputError(`Unknown spec "${k}". Call get_inputs for the list.`);
  }
  if (input.solarAreasAllMonths) {
    for (const [k, v] of Object.entries(input.solarAreasAllMonths as Record<string, unknown>)) {
      if (!(k in AREA_DOCS)) throw new InputError(`Unknown solar area field "${k}".`);
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new InputError(`solarAreasAllMonths.${k} must be a non-negative number.`);
      next.specs.solarAreas.forEach((a) => (a[k as keyof MonthlyAreas] = v));
    }
  }
  if (input.fallbackTariff !== undefined) {
    if (input.fallbackTariff !== null && (typeof input.fallbackTariff !== 'number' || input.fallbackTariff <= 0)) throw new InputError('fallbackTariff must be a positive number (€/kWh) or null.');
    next.specs.fallbackTariff = input.fallbackTariff as number | null;
  }
  if (input.location) {
    const l = input.location as Record<string, unknown>;
    const lat = Number(l.latitude), lon = Number(l.longitude);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) throw new InputError('location needs a valid latitude and longitude.');
    const cc = typeof l.countryCode === 'string' ? l.countryCode.toUpperCase() : next.location.countryCode;
    if (!/^[A-Z]{2}$/.test(cc)) throw new InputError('location.countryCode must be a 2-letter ISO code.');
    // Applied before priceOverrides so overrides given in the same call survive a country change.
    next = store.withLocation(next, { name: typeof l.name === 'string' && l.name ? l.name : `${lat.toFixed(3)}, ${lon.toFixed(3)}`, latitude: lat, longitude: lon, countryCode: cc }).state;
  }
  if (input.priceOverrides) {
    for (const [sem, v] of Object.entries(input.priceOverrides as Record<string, unknown>)) {
      if (!new RegExp(SEMESTER).test(sem)) throw new InputError(`Bad semester "${sem}" (use e.g. 2025-S2).`);
      if (v !== null && (typeof v !== 'number' || v <= 0)) throw new InputError(`priceOverrides.${sem} must be a positive number or null.`);
      next.priceOverrides[sem] = v as number | null;
    }
  }
  if (input.startDate !== undefined) {
    if (typeof input.startDate !== 'string' || !new RegExp(DATE).test(input.startDate) || input.startDate < '1940-01-01') throw new InputError('startDate must be YYYY-MM-DD, from 1940 on.');
    next.startDate = input.startDate;
  }
  if (input.endDate !== undefined) {
    if (input.endDate !== null && (typeof input.endDate !== 'string' || !new RegExp(DATE).test(input.endDate))) throw new InputError('endDate must be YYYY-MM-DD or null (= yesterday).');
    next.endDate = input.endDate as string | null;
  }
  if (input.band !== undefined) {
    if (!CONSUMPTION_BANDS.some((b) => b.code === input.band)) throw new InputError(`band must be one of ${CONSUMPTION_BANDS.map((b) => b.code).join(', ')}.`);
    next.band = input.band as store.AppState['band'];
  }
  return next;
}

// ------------------------------------------------------------------ output helpers

const r0 = (v: number) => Math.round(v);
const r2 = (v: number) => Math.round(v * 100) / 100;

function yearOut(y: YearSummary, comfort: boolean) {
  return {
    year: y.year || undefined,
    days: y.days,
    frostDays: y.frostDays,
    veryHotDays: y.hotDays,
    veryHotHours: y.hotHours,
    heatDeficitDays: y.heatDeficitDays,
    coolDeficitDays: y.coolDeficitDays,
    heatingKwh: r0(y.heatElec),
    coolingKwh: r0(y.coolElec),
    totalKwh: r0(y.elecTotal),
    costEur: r0(y.cost),
    ...(comfort ? { costInclNightComfortEur: r0(y.totalCostInclComfort) } : {}),
  };
}

function summary(api: AppApi, s: store.AppState, r: Results) {
  const full = r.years.filter((y) => y.days >= 365);
  const avg = (f: (y: YearSummary) => number) => (full.length ? r0(full.reduce((a, y) => a + f(y), 0) / full.length) : null);
  const comfort = s.specs.comfortEnabled;
  return {
    location: s.location,
    period: { from: s.startDate, to: s.endDate ?? api.endDate() },
    weather: api.weatherInfo(),
    averagePerFullYear: {
      fullYears: full.length,
      costEur: avg((y) => (comfort ? y.totalCostInclComfort : y.cost)),
      electricityKwh: avg((y) => y.elecTotal),
      costIncludesNightComfort: comfort,
    },
    capacity: {
      designHeatLoadKw: r2(r.cap.designHeatLoadKw),
      pumpsAtDesignTempKw: r2(r.cap.pumpsAtDesignKw),
      heatingCapacityOk: r.cap.pumpsAtDesignKw >= r.cap.designHeatLoadKw,
      maxCoolingDemandKw: r2(r.cap.maxCoolDemandKw),
      heatNotDeliveredKwh: r0(r.cap.heatUnmetKwh),
      coolingNotDeliveredKwh: r0(r.cap.coolUnmetKwh),
      maxHourlyTempC: r.cap.maxHourlyTemp,
    },
    years: r.years.map((y) => ({ ...yearOut(y, comfort), partial: y.days < 365 })),
    totals: yearOut(r.tot, comfort),
    skippedDaysWithoutData: r.skipped.length,
  };
}

function inputsOut(api: AppApi) {
  const s = api.getState();
  return {
    location: s.location,
    startDate: s.startDate,
    endDate: s.endDate,
    effectiveEndDate: api.endDate(),
    band: s.band,
    bands: CONSUMPTION_BANDS,
    specs: Object.fromEntries(Object.entries(s.specs).filter(([k]) => k !== 'solarAreas')),
    specDescriptions: SPEC_DOCS,
    /** What each input means and where a user can find the number (datasheet, energy report, bill…). */
    help: HELP,
    solarAreasByMonth: s.specs.solarAreas.map((a, i) => ({ month: i + 1, ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, r2(v as number)])) })),
    priceOverrides: s.priceOverrides,
    tariffsUsed: api.tariffs(),
    priceSource: api.priceSourceInfo(),
    dataLoadedForInputs: !api.needsFetch(),
  };
}

const NEEDS_CALC = { ok: false, error: 'No results yet for the current location/period. Call the "calculate" tool first.' };

// ------------------------------------------------------------------ tools

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean; consequentialHint?: boolean };
  execute(input: Record<string, unknown>): Promise<unknown> | unknown;
}

function tools(api: AppApi): ToolDef[] {
  const changeProps = {
    specs: specsSchema,
    solarAreasAllMonths: areasSchema,
    fallbackTariff: { type: ['number', 'null'], description: SPEC_DOCS.fallbackTariff },
    priceOverrides: {
      type: 'object',
      description: 'Per-semester tariff overrides in €/kWh (e.g. {"2026-S1": 0.31}); null removes an override. Overrides are cleared when the country changes.',
      propertyNames: { pattern: SEMESTER },
      additionalProperties: { type: ['number', 'null'] },
    },
  };

  return [
    {
      name: 'get_inputs',
      title: 'Get calculator inputs',
      description: 'Returns the current location, period, electricity price settings and all building/heat-pump specs (with units and meaning), the tariff used per half-year, and help texts explaining where to find each number (datasheet, energy report, bill). Use the help to guide the user in gathering their figures.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => inputsOut(api),
    },
    {
      name: 'update_inputs',
      title: 'Change calculator inputs',
      description:
        'Changes the user\'s inputs in the calculator UI (saved in their browser). Only the given fields change. Changing location or dates requires "calculate" afterwards to download weather; spec and price changes recalculate immediately. Use "search_location" to find coordinates for a place name.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ...changeProps,
          location: {
            type: 'object',
            additionalProperties: false,
            required: ['latitude', 'longitude', 'countryCode'],
            properties: {
              name: { type: 'string' },
              latitude: { type: 'number' },
              longitude: { type: 'number' },
              countryCode: { type: 'string', description: 'ISO 3166-1 alpha-2, used for Eurostat prices' },
            },
          },
          startDate: { type: 'string', pattern: DATE, description: 'First day, YYYY-MM-DD' },
          endDate: { type: ['string', 'null'], pattern: DATE, description: 'Last day, YYYY-MM-DD; null = yesterday (rolling)' },
          band: { type: 'string', enum: CONSUMPTION_BANDS.map((b) => b.code), description: 'Eurostat household consumption band for prices' },
        },
      },
      execute: (input) => {
        const next = applyChanges(api.getState(), input);
        api.applyState(next, `Inputs updated by an AI agent (${Object.keys(input).join(', ')}).`);
        const needsFetch = api.needsFetch();
        const r = needsFetch ? null : api.compute();
        return {
          ok: true,
          needsCalculate: needsFetch,
          ...(r ? { results: summary(api, api.getState(), r) } : { note: 'Call "calculate" to download weather for the new location/period.' }),
        };
      },
    },
    {
      name: 'search_location',
      title: 'Search location',
      description: 'Looks up a town or address with Open-Meteo geocoding and returns candidate coordinates and country codes. Does not change anything; pass a result to update_inputs.location.',
      inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 2 } } },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input) => {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: String(input.query), count: '6', language: 'en', format: 'json' })}`);
        const json = await res.json();
        return {
          results: ((json.results ?? []) as { name: string; latitude: number; longitude: number; country_code: string; admin1?: string; country?: string }[]).map((r) => ({
            name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
            latitude: r.latitude,
            longitude: r.longitude,
            countryCode: r.country_code,
          })),
        };
      },
    },
    {
      name: 'calculate',
      title: 'Fetch data and calculate',
      description:
        'Downloads hourly weather (Open-Meteo) and household electricity prices (Eurostat) for the current inputs if needed, recalculates, and returns per-year electricity, cost, frost/very-hot days, capacity deficits and the capacity check. Can take ~10–30 s the first time.',
      inputSchema: { type: 'object', properties: { refreshData: { type: 'boolean', description: 'Re-download recent data even if cached' } } },
      execute: async (input) => {
        if (input.refreshData || api.needsFetch()) {
          const err = await api.run();
          if (err) return { ok: false, error: err };
        }
        const r = api.compute();
        return r ? { ok: true, ...summary(api, api.getState(), r) } : NEEDS_CALC;
      },
    },
    {
      name: 'get_results',
      title: 'Get results',
      description: 'Returns the current calculation results (per year, totals, capacity check) without downloading anything.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const r = api.compute();
        return r ? summary(api, api.getState(), r) : NEEDS_CALC;
      },
    },
    {
      name: 'get_days',
      title: 'Get daily results',
      description: 'Returns per-day weather and results (newest first), optionally filtered to very hot days, frost days or days with a capacity deficit.',
      inputSchema: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['all', 'veryHot', 'frost', 'deficit'], default: 'all' },
          from: { type: 'string', pattern: DATE },
          to: { type: 'string', pattern: DATE },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 60 },
        },
      },
      annotations: { readOnlyHint: true },
      execute: (input) => {
        const r = api.compute();
        if (!r) return NEEDS_CALC;
        const f = (input.filter as string) ?? 'all';
        const rows = r.rows.filter((d) =>
          (!input.from || d.date >= (input.from as string)) && (!input.to || d.date <= (input.to as string)) &&
          (f === 'all' || (f === 'frost' && d.frost) || (f === 'veryHot' && d.hoursHot > 0) ||
            (f === 'deficit' && d.heatDeficitDay + d.heatDeficitNight + d.coolDeficitDay + d.coolDeficitNight > 0)));
        const limit = Math.min(500, Math.max(1, Number(input.limit ?? 60)));
        return {
          matchingDays: rows.length,
          days: rows.slice(-limit).reverse().map((d) => ({
            date: d.date,
            minC: r2(d.input.tmin), maxC: r2(d.input.tmax),
            dayMeanC: r2(d.input.tDay), nightMeanC: r2(d.input.tNight), daylightHours: r2(d.input.dayHours),
            heatPeakKw: r2(d.heatPeakKw), heatReserveKw: r2(d.heatReserveKw),
            coolPeakKw: r2(d.coolPeakKw), coolReserveKw: r2(d.coolReserveKw),
            heatingKwh: r2(d.heatElecDay + d.heatElecNight), coolingKwh: r2(d.coolElecDay + d.coolElecNight),
            tariffEurPerKwh: d.tariff, costEur: r2(d.cost), nightComfortEur: r2(d.comfortCost),
            veryHotHours: d.hoursHot,
            heatDeficit: d.heatDeficitDay + d.heatDeficitNight > 0, coolDeficit: d.coolDeficitDay + d.coolDeficitNight > 0,
          })),
        };
      },
    },
    {
      name: 'what_if',
      title: 'What-if comparison',
      description:
        'Recalculates with hypothetical spec or price changes WITHOUT changing the user\'s inputs, and returns the result next to the current baseline (e.g. "what if we had 2 pumps", "what if electricity cost 0.30 €/kWh"). Uses already-downloaded weather.',
      inputSchema: { type: 'object', additionalProperties: false, properties: changeProps },
      annotations: { readOnlyHint: true },
      execute: (input) => {
        const base = api.compute();
        if (!base) return NEEDS_CALC;
        const alt = api.compute(applyChanges(api.getState(), input));
        if (!alt) return NEEDS_CALC;
        const b = summary(api, api.getState(), base);
        const a = summary(api, applyChanges(api.getState(), input), alt);
        const d = (x: number | null, y: number | null) => (x === null || y === null ? null : y - x);
        return {
          baseline: { averagePerFullYear: b.averagePerFullYear, capacity: b.capacity, totals: b.totals },
          scenario: { averagePerFullYear: a.averagePerFullYear, capacity: a.capacity, totals: a.totals, years: a.years },
          difference: {
            avgCostEurPerYear: d(b.averagePerFullYear.costEur, a.averagePerFullYear.costEur),
            avgElectricityKwhPerYear: d(b.averagePerFullYear.electricityKwh, a.averagePerFullYear.electricityKwh),
            heatDeficitDays: a.totals.heatDeficitDays - b.totals.heatDeficitDays,
            coolDeficitDays: a.totals.coolDeficitDays - b.totals.coolDeficitDays,
          },
        };
      },
    },
    {
      name: 'list_scenarios',
      title: 'List saved scenarios',
      description: 'Lists the scenarios the user has saved in this browser.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => ({ scenarios: store.loadScenarios().map((s) => ({ name: s.name, savedAt: s.savedAt, location: s.state.location.name })) }),
    },
    {
      name: 'save_scenario',
      title: 'Save scenario',
      description: 'Saves the current inputs as a named scenario in the browser (replaces one with the same name).',
      inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 } } },
      execute: (input) => {
        const name = String(input.name).trim();
        const list = store.loadScenarios().filter((s) => s.name !== name);
        list.unshift({ name, savedAt: new Date().toISOString(), state: api.getState() });
        if (!store.saveScenarios(list)) return { ok: false, error: 'Browser storage is full or blocked.' };
        api.applyState(api.getState(), `Scenario “${name}” saved by an AI agent.`);
        return { ok: true, name };
      },
    },
    {
      name: 'load_scenario',
      title: 'Load scenario',
      description: 'Replaces the current inputs with a saved scenario. Save the current inputs first if they should be kept.',
      inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      execute: (input) => {
        const sc = store.loadScenarios().find((s) => s.name === input.name);
        if (!sc) return { ok: false, error: `No scenario named "${input.name}".` };
        api.applyState(store.normalizeState(sc.state), `Scenario “${sc.name}” loaded by an AI agent.`);
        return { ok: true, needsCalculate: api.needsFetch(), inputs: inputsOut(api) };
      },
    },
    {
      name: 'delete_scenario',
      title: 'Delete scenario',
      description: 'Permanently deletes a saved scenario from this browser.',
      inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      annotations: { consequentialHint: true },
      execute: (input) => {
        const list = store.loadScenarios();
        const i = list.findIndex((s) => s.name === input.name);
        if (i < 0) return { ok: false, error: `No scenario named "${input.name}".` };
        list.splice(i, 1);
        store.saveScenarios(list);
        api.applyState(api.getState(), `Scenario “${input.name}” deleted by an AI agent.`);
        return { ok: true };
      },
    },
    {
      name: 'reset_inputs',
      title: 'Reset inputs to defaults',
      description: 'Resets all inputs to the built-in example house (Berlin). Saved scenarios are kept.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { consequentialHint: true },
      execute: () => {
        api.applyState(store.defaultState(), 'Inputs reset to defaults by an AI agent.');
        return { ok: true, defaults: { specs: DEFAULT_SPECS } };
      },
    },
  ];
}

// ------------------------------------------------------------------ registration

interface ModelContextLike {
  registerTool(tool: object, options?: { signal?: AbortSignal }): unknown;
}

export function registerWebMcpTools(api: AppApi): (() => void) | null {
  const doc = (document as unknown as { modelContext?: ModelContextLike }).modelContext;
  const nav = (navigator as unknown as { modelContext?: ModelContextLike }).modelContext;
  const mc = doc ?? nav;
  if (!mc || typeof mc.registerTool !== 'function') return null;
  // Earlier previews (navigator.modelContext) expected MCP-style results; the spec serialises any value to JSON.
  const legacy = !doc;

  const controller = new AbortController();
  const handles: { unregister?: () => void }[] = [];
  for (const t of tools(api)) {
    const execute = async (input: Record<string, unknown>) => {
      let result: unknown;
      try {
        result = await t.execute(input ?? {});
      } catch (err) {
        result = { ok: false, error: err instanceof InputError ? err.message : `Failed: ${(err as Error).message}` };
      }
      return legacy ? { content: [{ type: 'text', text: JSON.stringify(result) }] } : result;
    };
    try {
      const h = mc.registerTool(
        { name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations ?? {}, execute },
        { signal: controller.signal },
      );
      if (h && typeof (h as Promise<unknown>).catch === 'function') (h as Promise<unknown>).catch((e) => console.warn(`WebMCP: could not register ${t.name}`, e));
      else if (h && typeof h === 'object') handles.push(h as { unregister?: () => void });
    } catch (e) {
      console.warn(`WebMCP: could not register ${t.name}`, e);
    }
  }
  return () => {
    controller.abort();
    handles.forEach((h) => h.unregister?.());
  };
}

/** Exposed for tests. */
export const __test = { tools, applyChanges, InputError };
