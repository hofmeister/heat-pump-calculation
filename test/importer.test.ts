import { describe, expect, it } from 'vitest';
import { applyChanges, changedKeys, parseAiInput, stateToLines } from '../src/importer';
import { defaultState } from '../src/storage';

describe('parseAiInput', () => {
  it('reads a link with inputs in the fragment', () => {
    const r = parseAiInput('Here you go: https://example.org/app/#pumpCount=2&heatCapMinus7=8.4&lat=45.76&lon=4.84&country=FR&place=Lyon%2C%20France&tariff=0.25');
    expect(r.issues).toEqual([]);
    expect(r.changes.specs).toEqual({ pumpCount: 2, heatCapMinus7: 8.4 });
    expect(r.changes.location).toEqual({ latitude: 45.76, longitude: 4.84, countryCode: 'FR', name: 'Lyon, France' });
    expect(r.changes.fallbackTariff).toBe(0.25);
  });

  it('reads key=value lines in a fenced block, with comments, bullets, decimal commas and loose key spelling', () => {
    const r = parseAiInput([
      'Sure! Paste this:', '```', '# heat pump', '- heat_cap_minus_7: 7,5', 'COPplus7 = 4.6', 'winS=3.2', 'comfortEnabled=no', 'price.2025-S2=0.31', 'to=yesterday', '```',
    ].join('\n'));
    expect(r.issues).toEqual([]);
    expect(r.changes.specs).toEqual({ heatCapMinus7: 7.5, copPlus7: 4.6, comfortEnabled: false });
    expect(r.changes.solarAreasAllMonths).toEqual({ winS: 3.2 });
    expect(r.changes.priceOverrides).toEqual({ '2025-S2': 0.31 });
    expect(r.changes.endDate).toBeNull();
  });

  it('reads flat JSON and the WebMCP shape', () => {
    expect(parseAiInput('{"pumpCount": 2, "band": "KWH_GE15000"}').changes).toEqual({ specs: { pumpCount: 2 }, band: 'KWH_GE15000' });
    const r = parseAiInput('```json\n{"specs":{"eerA35":3.3},"location":{"latitude":40.4,"longitude":-3.7,"countryCode":"ES","name":"Madrid"}}\n```');
    expect(r.changes.specs).toEqual({ eerA35: 3.3 });
    expect(r.changes.location?.countryCode).toBe('ES');
  });

  it('keeps a place name for geocoding when there are no coordinates', () => {
    expect(parseAiInput('place=Bologna, Italy&country=IT').changes.place).toBe('Bologna, Italy|IT');
  });

  it('reports problems but applies the rest', () => {
    const r = parseAiInput('pumpCount=two&copPlus7=4.1&tariff=31&colour=blue&lat=91');
    expect(r.changes.specs).toEqual({ copPlus7: 4.1 });
    expect(r.issues).toHaveLength(4);
    expect(r.issues.join(' ')).toMatch(/cents/);
  });
});

describe('applyChanges / round trip', () => {
  it('applies parsed changes and reports what changed', () => {
    const base = defaultState();
    const next = applyChanges(base, parseAiInput('pumpCount=2&winS=3&lat=48.85&lon=2.35&country=FR').changes);
    expect(next.specs.pumpCount).toBe(2);
    expect(next.specs.solarAreas.every((a) => a.winS === 3)).toBe(true);
    expect(changedKeys(base, next).sort()).toEqual(['location', 'pumpCount', 'winS'].sort());
  });

  it('stateToLines can be parsed back into the same state', () => {
    const s = defaultState();
    s.specs.pumpCount = 3;
    s.priceOverrides = { '2024-S1': 0.33 };
    const back = applyChanges(defaultState(), parseAiInput(stateToLines(s).join('\n')).changes);
    expect(changedKeys(s, back)).toEqual([]);
  });
});
