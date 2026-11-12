import type { MonthlyAreas, Specs } from './model';

/** Effective solar areas from the energy report (July values; June has its own). */
const JULY: MonthlyAreas = {
  winN: 10.17878388164701, winE: 3.5300912253068186, winS: 5.245127688172043, winW: 3.7997637330183105,
  opqN: 4.750090523484379, opqE: 4.333686093062938, opqS: 4.796516577060932, opqW: 4.594638052109994, opqH: 0,
  irLossKw: 1.462138,
};
const JUNE: MonthlyAreas = {
  winN: 10.1759768009768, winE: 3.563282051282051, winS: 5.755065639269407, winW: 4.176923076923077,
  opqN: 4.748626373626374, opqE: 4.33374358974359, opqS: 4.797802511415525, opqW: 4.594820512820512, opqH: 0,
  irLossKw: 1.250421,
};

/** Defaults reproduce the "Villa Visione" spreadsheet (Sasso Marconi, Italy). */
export const DEFAULT_SPECS: Specs = {
  heatingIndoorTemp: 20,
  designOutdoorTemp: -5.4,
  designTransmissionLossW: 33065.52,
  designVentilationLossW: 10953.05,
  designHeatLoadOverrideKw: null,

  pumpCount: 3,
  heatCapMinus7: 15.8,
  heatCapPlus7: 23.7,
  copMinus7: 2.3511904762,
  copPlus7: 3.52,
  heatCapFactor: 1,

  coolingThreshold: 26,
  hotDayThreshold: 33,
  coolTransmissionKwK: 1.184238,
  coolVentilationKwK: 0.258734,
  internalGainsKw: 0.45,
  coolCapA35: 19.8,
  eerA35: 2.84,
  coolCapLossPerK: 0.01,
  eerLossPerK: 0.02,
  fanCoilCapKw: 54.4,
  coolCapFactor: 1,
  windowSolarFactor: 1,
  opaqueSolarFactor: 1,
  dehumidFactor: 1,

  airflowM3h: 1293.669,
  indoorRH: 0.5,

  solarAreas: Array.from({ length: 12 }, (_, i) => ({ ...(i === 5 ? JUNE : JULY) })),

  comfortEnabled: true,
  comfortTargetTemp: 23,
  // 2nd floor (179.10 m²) − 45 m² excluded + four 1st-floor bedrooms (72.22 m²)
  comfortAreaM2: 206.32,
  totalFloorAreaM2: 663.1,

  fallbackTariff: 0.399,
};

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
  /** ISO 3166-1 alpha-2 */
  countryCode: string;
}

export const DEFAULT_LOCATION: Location = {
  name: 'Sasso Marconi, Italy',
  latitude: 44.4,
  longitude: 11.28,
  countryCode: 'IT',
};

export const DEFAULT_START_DATE = '2021-01-01';
