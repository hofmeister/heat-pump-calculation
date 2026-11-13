import type { MonthlyAreas, Specs } from './model';

/** Effective solar apertures of the example house (same every month). */
const AREAS: MonthlyAreas = {
  winN: 1.6, winE: 1.2, winS: 2.8, winW: 1.2,
  opqN: 1.0, opqE: 1.0, opqS: 1.1, opqW: 1.0, opqH: 0,
  irLossKw: 0.35,
};

/**
 * Defaults: a generic, well-insulated ~160 m² detached house with one
 * ~10 kW air-to-water heat pump that also cools via fan coils.
 * Replace with your own building's figures.
 */
export const DEFAULT_SPECS: Specs = {
  heatingIndoorTemp: 20,
  designOutdoorTemp: -12,
  designTransmissionLossW: 7800,
  designVentilationLossW: 2600,
  designHeatLoadOverrideKw: null,

  pumpCount: 1,
  heatCapMinus7: 8.4,
  heatCapPlus7: 11.2,
  copMinus7: 2.6,
  copPlus7: 4.2,
  heatCapFactor: 1,

  coolingThreshold: 26,
  hotDayThreshold: 30,
  coolTransmissionKwK: 0.22,
  coolVentilationKwK: 0.07,
  internalGainsKw: 0.3,
  coolCapA35: 7.5,
  eerA35: 3.1,
  coolCapLossPerK: 0.01,
  eerLossPerK: 0.02,
  fanCoilCapKw: 6,
  coolCapFactor: 1,
  windowSolarFactor: 1,
  opaqueSolarFactor: 1,
  dehumidFactor: 1,

  airflowM3h: 250,
  indoorRH: 0.5,

  solarAreas: Array.from({ length: 12 }, () => ({ ...AREAS })),

  comfortEnabled: true,
  comfortTargetTemp: 23,
  comfortAreaM2: 45,
  totalFloorAreaM2: 160,

  fallbackTariff: null,
};

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
  /** ISO 3166-1 alpha-2 */
  countryCode: string;
}

export const DEFAULT_LOCATION: Location = {
  name: 'Berlin, Germany',
  latitude: 52.52,
  longitude: 13.405,
  countryCode: 'DE',
};

export const DEFAULT_START_DATE = '2021-01-01';
