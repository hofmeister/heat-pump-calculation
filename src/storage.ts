/** Everything is persisted in the browser's localStorage only — nothing leaves the device. */
import { DEFAULT_LOCATION, DEFAULT_SPECS, DEFAULT_START_DATE, type Location } from './defaults';
import type { Specs } from './model';
import type { BandCode, EurostatPrices } from './prices';
import { deserializeWeather, serializeWeather, type WeatherData } from './weather';

export interface AppState {
  specs: Specs;
  location: Location;
  startDate: string;
  /** null = up to yesterday (rolls forward automatically) */
  endDate: string | null;
  band: BandCode;
  /** Per-semester tariff overrides, €/kWh */
  priceOverrides: Record<string, number | null>;
}

export interface Scenario {
  name: string;
  savedAt: string;
  state: AppState;
}

const K = {
  current: 'hpc.current.v1',
  scenarios: 'hpc.scenarios.v1',
  weather: 'hpc.weather.v1',
  prices: 'hpc.prices.v1',
};

export function defaultState(): AppState {
  return {
    specs: structuredClone(DEFAULT_SPECS),
    location: { ...DEFAULT_LOCATION },
    startDate: DEFAULT_START_DATE,
    endDate: null,
    band: 'KWH_GE15000',
    // The spreadsheet used the supplier bill (0.399 €/kWh) for 2026 instead of Eurostat.
    priceOverrides: { '2026-S1': 0.399, '2026-S2': 0.399 },
  };
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Merge a possibly-old saved state onto current defaults so new fields get sane values. */
export function normalizeState(s: Partial<AppState> | null): AppState {
  const d = defaultState();
  if (!s) return d;
  const specs = { ...d.specs, ...(s.specs ?? {}) };
  if (!Array.isArray(specs.solarAreas) || specs.solarAreas.length !== 12) specs.solarAreas = d.specs.solarAreas;
  return {
    specs,
    location: { ...d.location, ...(s.location ?? {}) },
    startDate: s.startDate ?? d.startDate,
    endDate: s.endDate ?? null,
    band: s.band ?? d.band,
    priceOverrides: s.priceOverrides ?? d.priceOverrides,
  };
}

export const loadCurrent = () => normalizeState(read<AppState>(K.current));
export const saveCurrent = (s: AppState) => write(K.current, s);

export const loadScenarios = () => read<Scenario[]>(K.scenarios) ?? [];
export const saveScenarios = (list: Scenario[]) => write(K.scenarios, list);

export function loadWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem(K.weather);
    return raw ? deserializeWeather(raw) : null;
  } catch {
    return null;
  }
}

/** Only the most recent location is cached (≈1 MB for 6 years of hourly data). */
export function saveWeather(w: WeatherData): boolean {
  try {
    localStorage.removeItem(K.weather);
  } catch {
    /* ignore */
  }
  return write(K.weather, serializeWeather(w));
}

type PriceCache = Record<string, EurostatPrices & { fetchedAt: string }>;
export function loadPrices(geo: string, band: string) {
  return read<PriceCache>(K.prices)?.[`${geo}|${band}`] ?? null;
}
export function savePrices(p: EurostatPrices, countryIso2: string) {
  const all = read<PriceCache>(K.prices) ?? {};
  all[`${countryIso2.toUpperCase()}|${p.band}`] = { ...p, fetchedAt: new Date().toISOString() };
  write(K.prices, all);
}

export function clearAll() {
  for (const k of Object.values(K)) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}
