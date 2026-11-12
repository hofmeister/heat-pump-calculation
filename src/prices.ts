/**
 * Household electricity prices from Eurostat (dataset nrg_pc204, bi-annual,
 * all taxes and levies included, EUR/kWh).
 * https://ec.europa.eu/eurostat/databrowser/view/nrg_pc204/default/table
 */

export const CONSUMPTION_BANDS = [
  { code: 'KWH_LT1000', label: '< 1 000 kWh/yr (DA)' },
  { code: 'KWH1000-2499', label: '1 000–2 499 kWh/yr (DB)' },
  { code: 'KWH2500-4999', label: '2 500–4 999 kWh/yr (DC)' },
  { code: 'KWH5000-14999', label: '5 000–14 999 kWh/yr (DD)' },
  { code: 'KWH_GE15000', label: '≥ 15 000 kWh/yr (DE)' },
] as const;

export type BandCode = (typeof CONSUMPTION_BANDS)[number]['code'];

/** Semester key, e.g. "2024-S2". */
export function semesterOf(date: string): string {
  const month = Number(date.slice(5, 7));
  return `${date.slice(0, 4)}-S${month <= 6 ? 1 : 2}`;
}

export function semestersBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let h = Number(start.slice(5, 7)) <= 6 ? 1 : 2;
  const last = semesterOf(end);
  for (;;) {
    const key = `${y}-S${h}`;
    out.push(key);
    if (key === last || out.length > 400) break;
    if (h === 1) h = 2;
    else { h = 1; y++; }
  }
  return out;
}

/** Eurostat uses EL for Greece and UK for the United Kingdom. */
function eurostatGeo(iso2: string): string {
  const c = iso2.toUpperCase();
  if (c === 'GR') return 'EL';
  if (c === 'GB') return 'UK';
  return c;
}

export interface EurostatPrices {
  geo: string;
  band: BandCode;
  updated: string;
  prices: Record<string, number>;
}

export async function fetchEurostatPrices(countryIso2: string, band: BandCode, since: string): Promise<EurostatPrices> {
  const geo = eurostatGeo(countryIso2);
  const params = new URLSearchParams({
    geo,
    nrg_cons: band,
    tax: 'I_TAX',
    currency: 'EUR',
    unit: 'KWH',
    sinceTimePeriod: since,
  });
  const res = await fetch(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/NRG_PC_204?${params}`);
  if (!res.ok) throw new Error(`Eurostat has no household electricity prices for "${geo}" (HTTP ${res.status}).`);
  const json = await res.json();
  const timeIndex: Record<string, number> = json.dimension?.time?.category?.index ?? {};
  const values: Record<string, number> = json.value ?? {};
  const prices: Record<string, number> = {};
  // All other dimensions are filtered to size 1, so the flat index equals the time index.
  for (const [period, idx] of Object.entries(timeIndex)) {
    const v = values[String(idx)];
    if (typeof v === 'number') prices[period] = v;
  }
  return { geo, band, updated: json.updated ?? '', prices };
}

/**
 * Resolve the tariff for each semester: user override → Eurostat → fallback.
 */
export function buildTariffLookup(
  eurostat: Record<string, number>,
  overrides: Record<string, number | null>,
  fallback: number,
): (date: string) => number {
  const cache = new Map<string, number>();
  return (date: string) => {
    const sem = semesterOf(date);
    let v = cache.get(sem);
    if (v === undefined) {
      const o = overrides[sem];
      v = typeof o === 'number' && o > 0 ? o : eurostat[sem] ?? fallback;
      cache.set(sem, v);
    }
    return v;
  };
}
