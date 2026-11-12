import { describe, expect, it } from 'vitest';
import fixture from './fixtures/villa-visione.json';
import { DEFAULT_SPECS } from '../src/defaults';
import { capacityCheck, computeDay, summarizeByYear, totals, type DayInput } from '../src/model';
import { semesterOf } from '../src/prices';

// Tariffs used in the spreadsheet (Eurostat nrg_pc204 IT ≥15 000 kWh, then Hera 0.399).
const SHEET_TARIFFS: Record<string, number> = {
  '2021-S1': 0.1958, '2021-S2': 0.2147, '2022-S1': 0.2901, '2022-S2': 0.355,
  '2023-S1': 0.3441, '2023-S2': 0.2483, '2024-S1': 0.2787, '2024-S2': 0.2675,
  '2025-S1': 0.2979, '2025-S2': 0.2808, '2026-S1': 0.399, '2026-S2': 0.399,
};
const tariff = (date: string) => SHEET_TARIFFS[semesterOf(date)];

const days: DayInput[] = (fixture.days as (string | number)[][]).map((r) => {
  const o: Record<string, string | number> = {};
  fixture.columns.forEach((c, i) => (o[c] = r[i]));
  return o as unknown as DayInput;
});

const rows = days.map((d) => computeDay(d, DEFAULT_SPECS, tariff));

describe('model reproduces the spreadsheet', () => {
  it('yearly summary matches Riepilogo', () => {
    const years = summarizeByYear(rows);
    const all = [...years, totals(years)];
    expect(all).toHaveLength(fixture.summary.length);
    all.forEach((y, i) => {
      const exp = fixture.summary[i] as number[];
      const got = [y.days, y.frostDays, y.hotDays, y.hotHours, y.heatDeficitDays, y.heatDeficitPeriods,
        y.coolDeficitDays, y.coolDeficitPeriods, y.heatElec, y.coolElec, y.elecTotal, y.cost,
        y.coolCostInclComfort, y.totalCostInclComfort];
      got.forEach((g, j) => expect(g, `row ${i} col ${j + 1}`).toBeCloseTo(exp[j + 1], 6));
    });
  });

  it('capacity check matches', () => {
    const c = capacityCheck(DEFAULT_SPECS, rows, 38.4);
    const exp = fixture.capacity as number[];
    expect(c.designHeatLoadKw).toBeCloseTo(exp[0], 9);
    expect(c.pumpsAtDesignKw).toBeCloseTo(exp[1], 9);
    expect(c.maxCoolDemandKw).toBeCloseTo(exp[2], 9);
    expect(c.heatUnmetKwh).toBe(0);
    expect(c.coolUnmetKwh).toBe(0);
  });

  it('sample daily rows match column by column', () => {
    const map: Record<string, keyof (typeof rows)[number]> = {
      K: 'heatKwhDay', L: 'heatKwhNight', M: 'heatPeakKw', N: 'heatReserveKw', Q: 'heatUnmetKwh',
      R: 'heatElecDay', S: 'heatElecNight', T: 'coolKwhDay', U: 'coolKwhNight', V: 'coolPeakKw',
      W: 'coolReserveKw', Z: 'coolUnmetKwh', AA: 'coolElecDay', AB: 'coolElecNight', AC: 'elecTotal',
      AE: 'cost', AO: 'comfortKwh', AP: 'comfortCost',
    };
    for (const [date, exp] of Object.entries(fixture.sampleRows as Record<string, Record<string, number>>)) {
      const r = rows.find((x) => x.date === date)!;
      for (const [col, key] of Object.entries(map)) {
        expect(r[key] as number, `${date} ${col}`).toBeCloseTo(exp[col], 8);
      }
    }
  });
});
