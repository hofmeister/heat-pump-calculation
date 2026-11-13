/**
 * Hourly weather from Open-Meteo (https://open-meteo.com), aggregated into
 * daylight / night periods the same way as the spreadsheet:
 *  - temperature and humidity at timestamp hh:00 represent the hour hh → hh+1
 *  - irradiance at hh:00 is the mean of the preceding hour (hh-1 → hh)
 *  - period means are weighted by the overlap of each hour with the period
 */
import type { DayInput, MonthlyAreas, Specs } from './model';
import { specificHumidity } from './model';

/** Hourly fields stored per day (24 slots each). */
export const FIELDS = ['temp', 'rh', 'gS', 'gE', 'gW', 'gN', 'gH'] as const;
export type Field = (typeof FIELDS)[number];

export interface WeatherData {
  latitude: number;
  longitude: number;
  timezone: string;
  /** Inclusive date range (YYYY-MM-DD) */
  start: string;
  end: string;
  dates: string[];
  /** Minutes after local midnight; NaN if unknown */
  sunrise: number[];
  sunset: number[];
  /** Hourly values: index = dayIndex * 24 + hour */
  hourly: Record<Field, Float32Array>;
  fetchedAt: string;
}

// ---------------------------------------------------------------- dates

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function minutesOf(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const t = iso.slice(11, 16);
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

// ---------------------------------------------------------------- fetching

const AZIMUTHS: { field: Field; azimuth: number }[] = [
  { field: 'gS', azimuth: 0 },
  { field: 'gE', azimuth: -90 },
  { field: 'gW', azimuth: 90 },
  { field: 'gN', azimuth: 180 },
];

interface OMResponse {
  timezone: string;
  hourly: Record<string, (number | null)[]> & { time: string[] };
  daily?: { time: string[]; sunrise: (string | null)[]; sunset: (string | null)[] };
}

async function omFetch(base: string, params: Record<string, string>, signal?: AbortSignal): Promise<OMResponse> {
  const url = `${base}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error(`Open-Meteo: ${body?.reason ?? `HTTP ${res.status}`}`);
  }
  return body as OMResponse;
}

function emptyWeather(lat: number, lon: number, start: string, end: string): WeatherData {
  const dates = dateRange(start, end);
  const n = dates.length * 24;
  const hourly = Object.fromEntries(FIELDS.map((f) => [f, new Float32Array(n).fill(NaN)])) as Record<Field, Float32Array>;
  return {
    latitude: lat, longitude: lon, timezone: '', start, end, dates,
    sunrise: new Array(dates.length).fill(NaN), sunset: new Array(dates.length).fill(NaN),
    hourly, fetchedAt: new Date().toISOString(),
  };
}

/** Write one Open-Meteo response into `w`. Only non-null values overwrite. */
function absorb(w: WeatherData, r: OMResponse, map: Record<string, Field>) {
  const dayIdx = new Map(w.dates.map((d, i) => [d, i]));
  const times = r.hourly.time;
  for (const [src, field] of Object.entries(map)) {
    const vals = r.hourly[src];
    if (!vals) continue;
    const arr = w.hourly[field];
    for (let i = 0; i < times.length; i++) {
      const v = vals[i];
      if (v === null || v === undefined) continue;
      const di = dayIdx.get(times[i].slice(0, 10));
      if (di === undefined) continue;
      arr[di * 24 + Number(times[i].slice(11, 13))] = v;
    }
  }
  if (r.daily) {
    r.daily.time.forEach((d, i) => {
      const di = dayIdx.get(d);
      if (di === undefined) return;
      const sr = minutesOf(r.daily!.sunrise[i]);
      const ss = minutesOf(r.daily!.sunset[i]);
      if (!Number.isNaN(sr)) w.sunrise[di] = sr;
      if (!Number.isNaN(ss)) w.sunset[di] = ss;
    });
  }
  if (r.timezone) w.timezone = r.timezone;
}

async function fetchInto(
  w: WeatherData,
  base: string,
  start: string,
  end: string,
  signal?: AbortSignal,
) {
  const common = {
    latitude: String(w.latitude),
    longitude: String(w.longitude),
    start_date: start,
    end_date: end,
    timezone: 'auto',
    tilt: '90',
  };
  const results = await Promise.all(
    AZIMUTHS.map(({ azimuth }, i) =>
      omFetch(
        base,
        i === 0
          ? { ...common, azimuth: String(azimuth), hourly: 'temperature_2m,relative_humidity_2m,shortwave_radiation,global_tilted_irradiance', daily: 'sunrise,sunset' }
          : { ...common, azimuth: String(azimuth), hourly: 'global_tilted_irradiance' },
        signal,
      ),
    ),
  );
  results.forEach((r, i) => {
    const map: Record<string, Field> = { global_tilted_irradiance: AZIMUTHS[i].field };
    if (i === 0) Object.assign(map, { temperature_2m: 'temp', relative_humidity_2m: 'rh', shortwave_radiation: 'gH' });
    absorb(w, r, map);
  });
}

function firstMissingTempDay(w: WeatherData): number {
  for (let di = 0; di < w.dates.length; di++) {
    for (let h = 0; h < 24; h++) if (Number.isNaN(w.hourly.temp[di * 24 + h])) return di;
  }
  return -1;
}

/**
 * Fetch hourly weather for [start, end]. Uses the historical archive and
 * fills the most recent days (not yet in the archive) from the forecast API.
 * Reuses whatever part of `cached` covers the request.
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  start: string,
  end: string,
  cached: WeatherData | null,
  onProgress?: (p: { kind: 'archive' | 'recent'; from: string; to: string }) => void,
  signal?: AbortSignal,
): Promise<WeatherData> {
  const w = emptyWeather(lat, lon, start, end);
  let fetchFrom = start;

  if (cached && cached.latitude === lat && cached.longitude === lon && cached.start <= start) {
    // Copy overlapping days from cache, refetch the last 7 cached days (they may have been preliminary).
    const reuseUntil = addDays(cached.end, -7);
    const cIdx = new Map(cached.dates.map((d, i) => [d, i]));
    w.timezone = cached.timezone;
    w.dates.forEach((d, di) => {
      if (d > reuseUntil) return;
      const ci = cIdx.get(d);
      if (ci === undefined) return;
      w.sunrise[di] = cached.sunrise[ci];
      w.sunset[di] = cached.sunset[ci];
      for (const f of FIELDS) w.hourly[f].set(cached.hourly[f].subarray(ci * 24, ci * 24 + 24), di * 24);
    });
    if (reuseUntil >= start) fetchFrom = addDays(reuseUntil, 1);
  }

  if (fetchFrom <= end) {
    onProgress?.({ kind: 'archive', from: fetchFrom, to: end });
    await fetchInto(w, 'https://archive-api.open-meteo.com/v1/archive', fetchFrom, end, signal);
  }

  // Recent days missing from the archive → forecast API (keeps ~3 months of past data).
  const missing = firstMissingTempDay(w);
  if (missing >= 0) {
    const recentStart = w.dates[missing];
    const earliestForecast = addDays(todayLocal(), -90);
    const from = recentStart < earliestForecast ? earliestForecast : recentStart;
    if (from <= end) {
      onProgress?.({ kind: 'recent', from, to: end });
      await fetchInto(w, 'https://api.open-meteo.com/v1/forecast', from, end, signal);
    }
  }
  w.fetchedAt = new Date().toISOString();
  return w;
}

// ---------------------------------------------------------------- aggregation

/** Mean of hourly values over [a, b] hours (hour k covers k → k+1, or k-1 → k when `lagged`). */
function periodMean(vals: (h: number) => number, a: number, b: number, lagged: boolean): { sum: number; w: number } {
  let sum = 0;
  let w = 0;
  for (let k = 0; k < 24; k++) {
    // Interval [k, k+1]: instantaneous values use timestamp k, lagged (preceding-hour mean) values use k+1.
    const o = Math.max(0, Math.min(b, k + 1) - Math.max(a, k));
    if (o <= 0) continue;
    const v = vals(lagged ? k + 1 : k);
    sum += o * (Number.isNaN(v) ? 0 : v);
    w += o;
  }
  return { sum, w };
}

export interface AggregateResult {
  days: DayInput[];
  maxHourlyTemp: number | null;
  skippedDays: string[];
}

/** Turn hourly weather into per-day inputs for the model using the building's solar areas & humidity settings. */
export function aggregate(w: WeatherData, s: Specs, from?: string, to?: string): AggregateResult {
  const xIn = specificHumidity(s.coolingThreshold, s.indoorRH);
  const airKgPerS = (s.airflowM3h / 3600) * 1.2; // ρ_air ≈ 1.2 kg/m³
  const LATENT = 2501; // kJ/kg
  const H = w.hourly;
  const total = w.dates.length * 24;
  const at = (f: Field, idx: number) => (idx >= 0 && idx < total ? H[f][idx] : NaN);

  const days: DayInput[] = [];
  const skippedDays: string[] = [];
  let maxT = -Infinity;

  w.dates.forEach((date, di) => {
    if ((from && date < from) || (to && date > to)) return;
    const base = di * 24;
    let tmin = Infinity, tmax = -Infinity, missing = false;
    for (let h = 0; h < 24; h++) {
      const t = H.temp[base + h];
      if (Number.isNaN(t)) { missing = true; break; }
      tmin = Math.min(tmin, t);
      tmax = Math.max(tmax, t);
    }
    if (missing) { skippedDays.push(date); return; }
    maxT = Math.max(maxT, tmax);

    let sr = w.sunrise[di] / 60;
    let ss = w.sunset[di] / 60;
    if (Number.isNaN(sr) || Number.isNaN(ss) || ss < sr) { sr = 12; ss = 12; }

    const a: MonthlyAreas = s.solarAreas[Number(date.slice(5, 7)) - 1];
    const tempAt = (h: number) => at('temp', base + h);
    const winAt = (h: number) => {
      const i = base + h;
      const g = (f: Field) => { const v = at(f, i); return Number.isNaN(v) ? 0 : v; };
      return (a.winN * g('gN') + a.winE * g('gE') + a.winS * g('gS') + a.winW * g('gW')) / 1000;
    };
    const opqAt = (h: number) => {
      const i = base + h;
      const g = (f: Field) => { const v = at(f, i); return Number.isNaN(v) ? 0 : v; };
      return (a.opqN * g('gN') + a.opqE * g('gE') + a.opqS * g('gS') + a.opqW * g('gW') + a.opqH * g('gH')) / 1000;
    };
    const dehAt = (h: number) => {
      const t = at('temp', base + h);
      const rh = at('rh', base + h);
      if (Number.isNaN(t) || Number.isNaN(rh)) return 0;
      return airKgPerS * Math.max(0, specificHumidity(t, rh / 100) - xIn) * LATENT;
    };

    const day = (f: (h: number) => number, lagged: boolean) => {
      const m = periodMean(f, sr, ss, lagged);
      return m.w > 0 ? m.sum / m.w : 0;
    };
    const night = (f: (h: number) => number, lagged: boolean) => {
      const m1 = periodMean(f, 0, sr, lagged);
      const m2 = periodMean(f, ss, 24, lagged);
      const wt = m1.w + m2.w;
      return wt > 0 ? (m1.sum + m2.sum) / wt : 0;
    };

    let hoursHot = 0, hoursAboveCool = 0;
    for (let h = 0; h < 24; h++) {
      const t = H.temp[base + h];
      if (t >= s.hotDayThreshold) hoursHot++;
      if (t > s.coolingThreshold) hoursAboveCool++;
    }

    days.push({
      date,
      tmin,
      tmax,
      dayHours: ss - sr,
      nightHours: 24 - (ss - sr),
      tDay: day(tempAt, false),
      tNight: night(tempAt, false),
      winDay: day(winAt, true),
      opqDay: day(opqAt, true),
      dehDay: day(dehAt, false),
      winNight: night(winAt, true),
      opqNight: night(opqAt, true),
      dehNight: night(dehAt, false),
      hoursHot,
      hoursAboveCool,
    });
  });

  return { days, maxHourlyTemp: Number.isFinite(maxT) ? maxT : null, skippedDays };
}

// ---------------------------------------------------------------- compact (de)serialisation for localStorage

const NAN16 = -32768;
const SCALE: Record<Field, number> = { temp: 10, rh: 1, gS: 1, gE: 1, gW: 1, gN: 1, gH: 1 };

function toB64(arr: Float32Array, scale: number): string {
  const i16 = new Int16Array(arr.length);
  for (let i = 0; i < arr.length; i++) i16[i] = Number.isNaN(arr[i]) ? NAN16 : Math.round(arr[i] * scale);
  const bytes = new Uint8Array(i16.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64: string, scale: number): Float32Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] === NAN16 ? NaN : i16[i] / scale;
  return out;
}

export function serializeWeather(w: WeatherData): string {
  return JSON.stringify({
    v: 1,
    latitude: w.latitude, longitude: w.longitude, timezone: w.timezone,
    start: w.start, end: w.end, fetchedAt: w.fetchedAt,
    sunrise: w.sunrise.map((x) => (Number.isNaN(x) ? -1 : x)),
    sunset: w.sunset.map((x) => (Number.isNaN(x) ? -1 : x)),
    hourly: Object.fromEntries(FIELDS.map((f) => [f, toB64(w.hourly[f], SCALE[f])])),
  });
}

export function deserializeWeather(json: string): WeatherData | null {
  try {
    const o = JSON.parse(json);
    if (o.v !== 1) return null;
    return {
      latitude: o.latitude, longitude: o.longitude, timezone: o.timezone,
      start: o.start, end: o.end, fetchedAt: o.fetchedAt,
      dates: dateRange(o.start, o.end),
      sunrise: o.sunrise.map((x: number) => (x < 0 ? NaN : x)),
      sunset: o.sunset.map((x: number) => (x < 0 ? NaN : x)),
      hourly: Object.fromEntries(FIELDS.map((f) => [f, fromB64(o.hourly[f], SCALE[f])])) as Record<Field, Float32Array>,
    };
  } catch {
    return null;
  }
}
