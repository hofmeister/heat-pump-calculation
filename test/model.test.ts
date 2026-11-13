import { describe, expect, it } from 'vitest';
import fixture from './fixtures/example-house.json';
import { DEFAULT_SPECS } from '../src/defaults';
import { capacityCheck, computeDay, summarizeByYear, totals, type DayInput } from '../src/model';
import { semesterOf } from '../src/prices';

// Fixture: the original spreadsheet's formulas, recalculated by LibreOffice for the default example house on synthetic weather.
const SHEET_TARIFFS = fixture.tariffs as Record<string, number>;
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
    const c = capacityCheck(DEFAULT_SPECS, rows, null);
    const exp = fixture.capacity as number[];
    expect(c.designHeatLoadKw).toBeCloseTo(exp[0], 9);
    expect(c.pumpsAtDesignKw).toBeCloseTo(exp[1], 9);
    expect(c.maxCoolDemandKw).toBeCloseTo(exp[2], 9);
    expect(c.heatUnmetKwh).toBeCloseTo(exp[3], 6);
    expect(c.coolUnmetKwh).toBeCloseTo(exp[4], 6);
    expect(c.heatUnmetKwh).toBeGreaterThan(0); // the example exercises the deficit paths
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
