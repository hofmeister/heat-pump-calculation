import { describe, expect, it } from 'vitest';
import { DEFAULT_SPECS } from '../src/defaults';
import { HELP } from '../src/specHelp';

describe('help texts', () => {
  it('explain every spec (what it is and where to find it)', () => {
    const keys = Object.keys(DEFAULT_SPECS).filter((k) => k !== 'solarAreas');
    for (const k of [...keys, 'winArea', 'opqArea', 'roofArea', 'irLoss', 'band', 'priceOverrides', 'countryCode', 'location', 'period']) {
      expect(HELP[k], k).toBeDefined();
      expect(HELP[k].what.length, `${k}.what`).toBeGreaterThan(20);
      expect(HELP[k].find.length, `${k}.find`).toBeGreaterThan(20);
    }
  });
});
