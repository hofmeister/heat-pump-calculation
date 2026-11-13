/**
 * Turning input changes produced by an AI assistant (or a person) into app state.
 *
 * Accepted formats — all map to the same flat keys documented in llms.txt:
 *  - a link to the app with the inputs in the fragment or query: …/#pumpCount=2&heatCapMinus7=8.4
 *  - key=value pairs separated by "&" or new lines (also "key: value")
 *  - JSON: either flat ({"pumpCount": 2}) or the WebMCP update_inputs shape ({"specs": {...}, "location": {...}})
 *    optionally inside a ```json fenced block
 */
import { DEFAULT_SPECS } from './defaults';
import type { MonthlyAreas, Specs } from './model';
import { CONSUMPTION_BANDS, type BandCode } from './prices';
import * as store from './storage';

export class InputError extends Error {}

/** Structured changes, the shape the WebMCP update_inputs tool accepts. */
export interface Changes {
  specs?: Partial<Record<keyof Specs, unknown>>;
  solarAreasAllMonths?: Partial<Record<keyof MonthlyAreas, number>>;
  fallbackTariff?: number | null;
  priceOverrides?: Record<string, number | null>;
  location?: { name?: string; latitude: number; longitude: number; countryCode: string };
  /** A place name to look up when no coordinates are given. */
  place?: string;
  startDate?: string;
  endDate?: string | null;
  band?: BandCode;
}

export const NUMERIC_SPEC_KEYS = (Object.keys(DEFAULT_SPECS) as (keyof Specs)[]).filter(
  (k) => k !== 'solarAreas' && k !== 'comfortEnabled' && k !== 'fallbackTariff',
) as Exclude<keyof Specs, 'solarAreas' | 'comfortEnabled' | 'fallbackTariff'>[];

export const AREA_KEYS: (keyof MonthlyAreas)[] = ['winN', 'winE', 'winS', 'winW', 'opqN', 'opqE', 'opqS', 'opqW', 'opqH', 'irLossKw'];

/** Flat keys that aren't spec names, with the aliases an AI is likely to use. */
const ALIASES: Record<string, string> = {
  lat: 'lat', latitude: 'lat',
  lon: 'lon', lng: 'lon', longitude: 'lon',
  country: 'country', countrycode: 'country', cc: 'country',
  place: 'place', name: 'place', location: 'place', address: 'place', city: 'place', town: 'place',
  from: 'from', start: 'from', startdate: 'from',
  to: 'to', end: 'to', enddate: 'to',
  band: 'band',
  tariff: 'tariff', fallbacktariff: 'tariff', price: 'tariff', mytariff: 'tariff',
  heatloadkw: 'designHeatLoadOverrideKw', designheatloadkw: 'designHeatLoadOverrideKw',
};

const SPEC_BY_LOWER = new Map<string, string>([
  ...NUMERIC_SPEC_KEYS.map((k) => [k.toLowerCase(), k] as [string, string]),
  ['comfortenabled', 'comfortEnabled'],
  ...AREA_KEYS.map((k) => [k.toLowerCase(), k] as [string, string]),
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEMESTER_RE = /^\d{4}-S[12]$/;

export interface ParseResult {
  changes: Changes;
  /** Problems with individual entries; the rest is still applied. */
  issues: string[];
  /** Number of recognised entries. */
  count: number;
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s/g, '').replace(/,(?=\d+$)/, '.'); // accept a decimal comma
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'off', 'n'].includes(s)) return false;
  return null;
}

/** Turn any accepted text into flat key/value entries. */
function toEntries(text: string): [string, unknown][] {
  let s = text.trim();
  const fence = s.match(/```(?:json|text|ini|txt)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  if (s.startsWith('{')) {
    const obj = JSON.parse(s) as Record<string, unknown>;
    const out: [string, unknown][] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'specs' || k === 'solarAreasAllMonths') {
        for (const [k2, v2] of Object.entries((v ?? {}) as Record<string, unknown>)) out.push([k2, v2]);
      } else if (k === 'location' && v && typeof v === 'object') {
        const l = v as Record<string, unknown>;
        if (l.latitude !== undefined) out.push(['lat', l.latitude]);
        if (l.longitude !== undefined) out.push(['lon', l.longitude]);
        if (l.countryCode !== undefined) out.push(['country', l.countryCode]);
        if (l.name !== undefined) out.push(['place', l.name]);
      } else if (k === 'priceOverrides' && v && typeof v === 'object') {
        for (const [sem, p] of Object.entries(v as Record<string, unknown>)) out.push([`price.${sem}`, p]);
      } else out.push([k, v]);
    }
    return out;
  }

  // A link: take the fragment, or else the query string.
  const url = s.match(/https?:\/\/\S+/)?.[0];
  if (url) {
    try {
      const u = new URL(url);
      s = u.hash.length > 1 ? u.hash.slice(1) : u.search.slice(1);
    } catch { /* fall through and parse as text */ }
  }
  if (s.startsWith('#') || s.startsWith('?')) s = s.slice(1);

  const parts = s.includes('\n') ? s.split(/\r?\n/) : s.split('&');
  const out: [string, unknown][] = [];
  for (let p of parts) {
    p = p.trim().replace(/^[-*•]\s*/, '').replace(/[,;]$/, '');
    if (!p || p.startsWith('#') || p.startsWith('//')) continue;
    const m = p.match(/^([^=:]+?)\s*[=:]\s*(.*)$/);
    if (!m) continue;
    let key = m[1].trim();
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    try { key = decodeURIComponent(key.replace(/\+/g, ' ')); val = decodeURIComponent(val.replace(/\+/g, ' ')); } catch { /* keep raw */ }
    out.push([key, val]);
  }
  return out;
}

/** Parse AI/user text into changes. Unknown keys and bad values become issues; nothing throws except unparseable JSON. */
export function parseAiInput(text: string): ParseResult {
  const changes: Changes = {};
  const issues: string[] = [];
  let count = 0;
  let lat: number | null = null, lon: number | null = null, country: string | null = null, place: string | null = null;

  let entries: [string, unknown][];
  try {
    entries = toEntries(text);
  } catch {
    return { changes, issues: ['Could not read this as JSON.'], count: 0 };
  }

  for (const [rawKey, v] of entries) {
    const lower = rawKey.trim().toLowerCase().replace(/[\s_-]/g, '');
    const priceMatch = rawKey.trim().match(/^(?:price|override)[._\s]?(\d{4}-S[12])$/i);
    if (priceMatch) {
      const sem = priceMatch[1].toUpperCase();
      const n = String(v).trim() === '' || String(v).toLowerCase() === 'null' ? null : num(v);
      if (n !== null && n <= 0) { issues.push(`${rawKey}: must be a positive price in €/kWh.`); continue; }
      if (!SEMESTER_RE.test(sem)) { issues.push(`${rawKey}: unknown half-year.`); continue; }
      (changes.priceOverrides ??= {})[sem] = n;
      count++;
      continue;
    }
    const alias = ALIASES[lower];
    const spec = alias && alias !== 'designHeatLoadOverrideKw' ? undefined : SPEC_BY_LOWER.get(alias ? alias.toLowerCase() : lower);
    if (spec) {
      if (spec === 'comfortEnabled') {
        const b = bool(v);
        if (b === null) { issues.push(`${rawKey}: use true or false.`); continue; }
        (changes.specs ??= {}).comfortEnabled = b;
      } else if ((AREA_KEYS as string[]).includes(spec)) {
        const n = num(v);
        if (n === null || n < 0) { issues.push(`${rawKey}: must be a number ≥ 0.`); continue; }
        (changes.solarAreasAllMonths ??= {})[spec as keyof MonthlyAreas] = n;
      } else if (spec === 'designHeatLoadOverrideKw') {
        const blank = v === null || String(v).trim() === '' || String(v).toLowerCase() === 'null';
        const n = blank ? null : num(v);
        if (!blank && (n === null || n <= 0)) { issues.push(`${rawKey}: must be a positive number of kW, or empty.`); continue; }
        (changes.specs ??= {}).designHeatLoadOverrideKw = n;
      } else {
        const n = num(v);
        if (n === null) { issues.push(`${rawKey}: “${String(v)}” is not a number.`); continue; }
        (changes.specs ??= {})[spec as keyof Specs] = n;
      }
      count++;
      continue;
    }
    switch (alias) {
      case 'lat': lat = num(v); if (lat === null || Math.abs(lat) > 90) { issues.push(`${rawKey}: invalid latitude.`); lat = null; } else count++; break;
      case 'lon': lon = num(v); if (lon === null || Math.abs(lon) > 180) { issues.push(`${rawKey}: invalid longitude.`); lon = null; } else count++; break;
      case 'country': {
        const c = String(v).trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(c)) { country = c; count++; } else issues.push(`${rawKey}: use a 2-letter country code like DE.`);
        break;
      }
      case 'place': if (String(v).trim()) { place = String(v).trim(); count++; } break;
      case 'from': {
        const d = String(v).trim();
        if (DATE_RE.test(d) && d >= '1940-01-01') { changes.startDate = d; count++; } else issues.push(`${rawKey}: use a date like 2021-01-01.`);
        break;
      }
      case 'to': {
        const d = String(v ?? '').trim().toLowerCase();
        if (d === '' || d === 'null' || d === 'yesterday' || d === 'today') { changes.endDate = null; count++; }
        else if (DATE_RE.test(d)) { changes.endDate = d; count++; }
        else issues.push(`${rawKey}: use a date like 2025-12-31, or leave empty for yesterday.`);
        break;
      }
      case 'band': {
        const b = String(v).trim();
        const hit = CONSUMPTION_BANDS.find((x) => x.code.toLowerCase() === b.toLowerCase());
        if (hit) { changes.band = hit.code; count++; } else issues.push(`${rawKey}: use one of ${CONSUMPTION_BANDS.map((x) => x.code).join(', ')}.`);
        break;
      }
      case 'tariff': {
        const s = String(v ?? '').trim().toLowerCase();
        if (s === '' || s === 'null' || s === 'latest' || s === 'eurostat') { changes.fallbackTariff = null; count++; break; }
        const n = num(v);
        if (n === null || n <= 0) issues.push(`${rawKey}: must be a price in €/kWh, e.g. 0.31.`);
        else if (n > 5) issues.push(`${rawKey}: ${n} looks like cents — use €/kWh, e.g. 0.31.`);
        else { changes.fallbackTariff = n; count++; }
        break;
      }
      default:
        issues.push(`Unknown setting “${rawKey}” was ignored.`);
    }
  }

  if (lat !== null && lon !== null) {
    changes.location = { latitude: lat, longitude: lon, countryCode: country ?? '', ...(place ? { name: place } : {}) };
  } else if (place) {
    changes.place = place;
    if (country) changes.place += `|${country}`;
  } else if (lat !== null || lon !== null) {
    issues.push('Location needs both lat and lon (or a place name).');
  } else if (country) {
    issues.push('A country on its own was ignored — give a place name or lat/lon too.');
  }
  return { changes, issues, count };
}

// ------------------------------------------------------------------ applying

/** Apply structured changes to a state. Throws InputError on invalid values (used by WebMCP). */
export function applyChanges(base: store.AppState, input: Changes | Record<string, unknown>): store.AppState {
  const c = input as Changes;
  let next = structuredClone(base);
  for (const [k, v] of Object.entries(c.specs ?? {})) {
    if (k === 'comfortEnabled') {
      if (typeof v !== 'boolean') throw new InputError('specs.comfortEnabled must be a boolean.');
      next.specs.comfortEnabled = v;
    } else if ((NUMERIC_SPEC_KEYS as string[]).includes(k)) {
      if (k === 'designHeatLoadOverrideKw' && v === null) next.specs.designHeatLoadOverrideKw = null;
      else if (typeof v === 'number' && Number.isFinite(v)) (next.specs as unknown as Record<string, number>)[k] = v;
      else throw new InputError(`specs.${k} must be a number.`);
    } else throw new InputError(`Unknown spec "${k}".`);
  }
  for (const [k, v] of Object.entries(c.solarAreasAllMonths ?? {})) {
    if (!(AREA_KEYS as string[]).includes(k)) throw new InputError(`Unknown solar area field "${k}".`);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new InputError(`solarAreasAllMonths.${k} must be a non-negative number.`);
    next.specs.solarAreas.forEach((a) => (a[k as keyof MonthlyAreas] = v));
  }
  if (c.fallbackTariff !== undefined) {
    if (c.fallbackTariff !== null && (typeof c.fallbackTariff !== 'number' || c.fallbackTariff <= 0)) throw new InputError('fallbackTariff must be a positive number (€/kWh) or null.');
    next.specs.fallbackTariff = c.fallbackTariff;
  }
  if (c.location) {
    const l = c.location;
    const lat = Number(l.latitude), lon = Number(l.longitude);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) throw new InputError('location needs a valid latitude and longitude.');
    const cc = typeof l.countryCode === 'string' && l.countryCode ? l.countryCode.toUpperCase() : next.location.countryCode;
    if (!/^[A-Z]{2}$/.test(cc)) throw new InputError('location.countryCode must be a 2-letter ISO code.');
    // Applied before priceOverrides so overrides given in the same call survive a country change.
    next = store.withLocation(next, { name: l.name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, latitude: lat, longitude: lon, countryCode: cc }).state;
  }
  if (c.priceOverrides) {
    for (const [sem, v] of Object.entries(c.priceOverrides)) {
      if (!SEMESTER_RE.test(sem)) throw new InputError(`Bad half-year "${sem}" (use e.g. 2025-S2).`);
      if (v !== null && (typeof v !== 'number' || v <= 0)) throw new InputError(`priceOverrides.${sem} must be a positive number or null.`);
      next.priceOverrides[sem] = v;
    }
  }
  if (c.startDate !== undefined) {
    if (typeof c.startDate !== 'string' || !DATE_RE.test(c.startDate) || c.startDate < '1940-01-01') throw new InputError('startDate must be YYYY-MM-DD, from 1940 on.');
    next.startDate = c.startDate;
  }
  if (c.endDate !== undefined) {
    if (c.endDate !== null && (typeof c.endDate !== 'string' || !DATE_RE.test(c.endDate))) throw new InputError('endDate must be YYYY-MM-DD or null (= yesterday).');
    next.endDate = c.endDate;
  }
  if (c.band !== undefined) {
    if (!CONSUMPTION_BANDS.some((b) => b.code === c.band)) throw new InputError(`band must be one of ${CONSUMPTION_BANDS.map((b) => b.code).join(', ')}.`);
    next.band = c.band;
  }
  return next;
}

/** Look up a place name (optionally "name|CC") with Open-Meteo geocoding. */
export async function geocodePlace(place: string, language = 'en'): Promise<{ name: string; latitude: number; longitude: number; countryCode: string } | null> {
  const [name, cc] = place.split('|');
  const params = new URLSearchParams({ name: name.split(',')[0].trim(), count: '10', language, format: 'json' });
  if (cc) params.set('countryCode', cc);
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  const json = await res.json();
  type R = { name: string; latitude: number; longitude: number; country_code: string; admin1?: string; country?: string };
  const results = (json.results ?? []) as R[];
  // Prefer a result whose region/country appears in the rest of the text ("Lyon, France").
  const rest = name.split(',').slice(1).join(' ').toLowerCase();
  const best = results.find((r) => rest && [r.admin1, r.country, r.country_code].some((x) => x && rest.includes(x.toLowerCase()))) ?? results[0];
  return best
    ? { name: [best.name, best.admin1, best.country].filter(Boolean).join(', '), latitude: best.latitude, longitude: best.longitude, countryCode: best.country_code }
    : null;
}

/** Keys whose values differ between two states, as flat keys (for "what changed" lists). */
export function changedKeys(a: store.AppState, b: store.AppState): string[] {
  const out: string[] = [];
  for (const k of [...NUMERIC_SPEC_KEYS, 'comfortEnabled', 'fallbackTariff'] as (keyof Specs)[]) {
    if (a.specs[k] !== b.specs[k]) out.push(k);
  }
  for (const k of AREA_KEYS) if (a.specs.solarAreas.some((x, i) => x[k] !== b.specs.solarAreas[i][k])) out.push(k);
  if (a.location.latitude !== b.location.latitude || a.location.longitude !== b.location.longitude) out.push('location');
  if (a.startDate !== b.startDate || a.endDate !== b.endDate) out.push('period');
  if (a.band !== b.band) out.push('band');
  if (JSON.stringify(a.priceOverrides) !== JSON.stringify(b.priceOverrides)) out.push('priceOverrides');
  return out;
}

/** Flat key=value lines describing a state — the same format the importer accepts. */
export function stateToLines(s: store.AppState): string[] {
  const lines = [
    `place=${s.location.name}`, `lat=${s.location.latitude}`, `lon=${s.location.longitude}`, `country=${s.location.countryCode}`,
    `from=${s.startDate}`, `to=${s.endDate ?? ''}`, `band=${s.band}`, `tariff=${s.specs.fallbackTariff ?? ''}`,
  ];
  for (const k of NUMERIC_SPEC_KEYS) lines.push(`${k}=${s.specs[k] ?? ''}`);
  lines.push(`comfortEnabled=${s.specs.comfortEnabled}`);
  const first = s.specs.solarAreas[0];
  const uniform = s.specs.solarAreas.every((a) => AREA_KEYS.every((k) => a[k] === first[k]));
  for (const k of AREA_KEYS) lines.push(`${k}=${uniform ? first[k] : s.specs.solarAreas[6][k]}`);
  for (const [sem, v] of Object.entries(s.priceOverrides)) if (v !== null) lines.push(`price.${sem}=${v}`);
  return lines;
}
