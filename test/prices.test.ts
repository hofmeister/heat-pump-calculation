import { describe, expect, it } from 'vitest';
import { buildTariffLookup, semesterOf, semestersBetween, tariffSource } from '../src/prices';
import { withLocation, defaultState } from '../src/storage';

const eurostat = { '2025-S1': 0.3, '2025-S2': 0.28, '2026-S1': 0.29 };

describe('tariffs', () => {
  it('prefers override, then Eurostat, then my tariff, then the latest Eurostat price', () => {
    const latest = buildTariffLookup(eurostat, { '2025-S1': 0.4 }, null);
    expect(latest('2025-03-01')).toBe(0.4);
    expect(latest('2025-08-01')).toBe(0.28);
    expect(latest('2026-11-01')).toBe(0.29);
    expect(buildTariffLookup(eurostat, {}, 0.35)('2026-11-01')).toBe(0.35);
    expect(buildTariffLookup({}, {}, null)('2026-11-01')).toBe(0.3);
    expect(tariffSource(eurostat, {}, null, '2026-S2')).toBe('latestEurostat');
  });

  it('splits semesters', () => {
    expect(semesterOf('2024-06-30')).toBe('2024-S1');
    expect(semesterOf('2024-07-01')).toBe('2024-S2');
    expect(semestersBetween('2024-05-01', '2025-08-01')).toEqual(['2024-S1', '2024-S2', '2025-S1', '2025-S2']);
  });

  it('drops bill-specific overrides when the country changes', () => {
    const s = { ...defaultState(), priceOverrides: { '2026-S1': 0.41 } };
    expect(withLocation(s, { ...s.location, name: 'x' }).state.priceOverrides).toEqual(s.priceOverrides);
    const dk = withLocation(s, { name: 'Vienna', latitude: 48.21, longitude: 16.37, countryCode: 'AT' });
    expect(dk.state.priceOverrides).toEqual({});
    expect(dk.clearedOverrides).toBe(true);
  });
});
