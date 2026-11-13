import { describe, expect, it } from 'vitest';
import { DEFAULT_SPECS } from '../src/defaults';
import { aggregate, deserializeWeather, serializeWeather, type WeatherData } from '../src/weather';

// A real Open-Meteo archive sample: hourly temperature and south-façade irradiance for one day (+ the next day for the 24:00 boundary).
const T = [5.4,6.0,6.1,6.4,5.1,5.0,3.9,3.4,4.0,5.6,7.1,8.4,8.9,5.0,5.7,5.5,5.7,5.7,6.0,5.7,5.5,5.5,5.8,4.7,
  5.2,2.9,3.4,3.5,3.6,4.5,3.9,4.4,4.8,5.0,5.7,6.5,7.0,5.6,7.0,7.1,6.4,5.9,5.9,6.1,6.2,5.5,5.5,5.7];
const GS = [0,0,0,0,0,0,0,0,0,93.4,62.0,93.2,75.9,63.3,97.3,58.1,31.9,2.4,0,0,0,0,0,0, ...new Array(24).fill(0)];

function weather(): WeatherData {
  const zeros = () => new Float32Array(48);
  return {
    latitude: 0, longitude: 0, timezone: 'Europe/Berlin', start: '2021-01-01', end: '2021-01-02',
    dates: ['2021-01-01', '2021-01-02'], sunrise: [470, 470], sunset: [1006, 1007], fetchedAt: '',
    hourly: { temp: Float32Array.from(T), rh: new Float32Array(48).fill(90), gS: Float32Array.from(GS), gE: zeros(), gW: zeros(), gN: zeros(), gH: zeros() },
  };
}

describe('aggregate', () => {
  it('uses step-weighted day/night means like the spreadsheet', () => {
    // 1 m² of south-facing glass only, so winDay is the mean south irradiance in kW/m².
    const southOnly = { winN: 0, winE: 0, winS: 1, winW: 0, opqN: 0, opqE: 0, opqS: 0, opqW: 0, opqH: 0, irLossKw: 0 };
    const specs = { ...DEFAULT_SPECS, solarAreas: DEFAULT_SPECS.solarAreas.map(() => ({ ...southOnly })) };
    const { days } = aggregate(weather(), specs);
    const d = days[0];
    expect(d.dayHours).toBeCloseTo(8.933333, 5);
    expect(d.nightHours).toBeCloseTo(15.066667, 5);
    expect(d.tDay).toBeCloseTo(6.172015, 4);
    expect(d.tNight).toBeCloseTo(5.373673, 4);
    expect(d.tmin).toBeCloseTo(3.4, 5);
    // Preceding-hour irradiance averaged over the daylight window (64.58 W/m²).
    expect(d.winDay).toBeCloseTo(0.33874522 / 5.245127688172043, 6);
    expect(d.dehDay).toBe(0); // winter air is drier than 26 °C / 50 %
  });

  it('round-trips through compact serialisation', () => {
    const w = weather();
    w.hourly.gE[3] = NaN;
    const back = deserializeWeather(serializeWeather(w))!;
    expect(Array.from(back.hourly.temp)).toEqual(Array.from(w.hourly.temp).map((x) => Math.round(x * 10) / 10).map((x) => Math.fround(x)));
    expect(Number.isNaN(back.hourly.gE[3])).toBe(true);
    expect(back.sunset).toEqual([1006, 1007]);
  });
});
