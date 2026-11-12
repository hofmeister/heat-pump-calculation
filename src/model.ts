/**
 * Day/night heating & cooling model, ported 1:1 from the
 * "Villa Visione – Analisi climatizzazione" spreadsheet.
 *
 * Every day is split into a daylight period (sunrise → sunset) and a night
 * period (the rest of the calendar day). Demand, delivered energy, electricity
 * and deficits are evaluated at the time-weighted mean temperature of each
 * period.
 */

export interface Specs {
  /** Indoor heating setpoint, °C */
  heatingIndoorTemp: number;
  /** Outdoor design temperature, °C */
  designOutdoorTemp: number;
  /** Design transmission loss, W */
  designTransmissionLossW: number;
  /** Design ventilation loss, W */
  designVentilationLossW: number;
  /** If set (>0), overrides transmission+ventilation as the design heat load, kW */
  designHeatLoadOverrideKw: number | null;

  /** Number of heat pumps used for space heating/cooling */
  pumpCount: number;
  /** Heating capacity per pump at −7 °C outdoor, kW */
  heatCapMinus7: number;
  /** Heating capacity per pump at +7 °C outdoor, kW */
  heatCapPlus7: number;
  /** COP at −7 °C */
  copMinus7: number;
  /** COP at +7 °C */
  copPlus7: number;
  /** Delivered heating capacity factor (1 = datasheet curve) */
  heatCapFactor: number;

  /** Outdoor threshold above which cooling runs; also indoor cooling setpoint, °C */
  coolingThreshold: number;
  /** A "very hot" day has at least one hour ≥ this, °C */
  hotDayThreshold: number;
  /** Transmission coefficient for cooling, kW/K */
  coolTransmissionKwK: number;
  /** Ventilation coefficient for cooling, kW/K */
  coolVentilationKwK: number;
  /** Internal gains, kW */
  internalGainsKw: number;
  /** Cooling capacity per pump at A35/W7, kW */
  coolCapA35: number;
  /** EER at A35/W7 */
  eerA35: number;
  /** Capacity loss per °C above 35 °C (fraction) */
  coolCapLossPerK: number;
  /** EER loss per °C above 35 °C (fraction) */
  eerLossPerK: number;
  /** Total nominal fan-coil cooling capacity (delivery limit), kW */
  fanCoilCapKw: number;
  /** Delivered cooling capacity factor */
  coolCapFactor: number;
  /** Window solar gain multiplier */
  windowSolarFactor: number;
  /** Opaque surface solar gain multiplier */
  opaqueSolarFactor: number;
  /** Dehumidification multiplier */
  dehumidFactor: number;

  /** Ventilation air flow used for latent load, m³/h */
  airflowM3h: number;
  /** Indoor relative humidity reference (0–1) */
  indoorRH: number;

  /** Effective solar areas per month (index 0 = Jan), m² */
  solarAreas: MonthlyAreas[];

  /** Night comfort cooling */
  comfortEnabled: boolean;
  comfortTargetTemp: number;
  comfortAreaM2: number;
  totalFloorAreaM2: number;

  /** Fallback tariff used for periods without a price, €/kWh */
  fallbackTariff: number;
}

export interface MonthlyAreas {
  winN: number; winE: number; winS: number; winW: number;
  opqN: number; opqE: number; opqS: number; opqW: number; opqH: number;
  /** Long-wave (IR) losses to the sky, kW */
  irLossKw: number;
}

/** Aggregated weather for one day — produced by weather.ts, consumed here. */
export interface DayInput {
  date: string; // YYYY-MM-DD
  tmin: number;
  tmax: number;
  dayHours: number;
  nightHours: number;
  tDay: number;
  tNight: number;
  /** Mean solar gain through windows during day / night, kW (area-weighted, before factors) */
  winDay: number;
  opqDay: number;
  /** Mean latent (dehumidification) load during day / night, kW */
  dehDay: number;
  winNight: number;
  opqNight: number;
  dehNight: number;
  hoursHot: number;
  hoursAboveCool: number;
}

export interface DayResult {
  date: string;
  year: number;
  frost: boolean;
  heatKwDay: number;
  heatKwNight: number;
  heatKwhDay: number;
  heatKwhNight: number;
  heatPeakKw: number;
  heatReserveKw: number;
  heatDeficitDay: 0 | 1;
  heatDeficitNight: 0 | 1;
  heatUnmetKwh: number;
  heatElecDay: number;
  heatElecNight: number;
  coolKwDay: number;
  coolKwNight: number;
  coolKwhDay: number;
  coolKwhNight: number;
  coolPeakKw: number;
  coolReserveKw: number;
  coolDeficitDay: 0 | 1;
  coolDeficitNight: 0 | 1;
  coolUnmetKwh: number;
  coolElecDay: number;
  coolElecNight: number;
  elecTotal: number;
  tariff: number;
  cost: number;
  hoursHot: number;
  hoursAboveCool: number;
  comfortKwh: number;
  comfortCost: number;
  input: DayInput;
}

export interface YearSummary {
  year: number;
  days: number;
  frostDays: number;
  hotDays: number;
  hotHours: number;
  heatDeficitDays: number;
  heatDeficitPeriods: number;
  coolDeficitDays: number;
  coolDeficitPeriods: number;
  heatElec: number;
  coolElec: number;
  elecTotal: number;
  cost: number;
  coolCostInclComfort: number;
  totalCostInclComfort: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function designHeatLoadKw(s: Specs): number {
  if (s.designHeatLoadOverrideKw && s.designHeatLoadOverrideKw > 0) return s.designHeatLoadOverrideKw;
  return (s.designTransmissionLossW + s.designVentilationLossW) / 1000;
}

/** Saturation-based specific humidity (kg/kg) at 101 325 Pa, Magnus formula as in the sheet. */
export function specificHumidity(tempC: number, rh: number): number {
  const pv = rh * 610.94 * Math.exp((17.625 * tempC) / (tempC + 243.04));
  return (0.62198 * pv) / (101325 - pv);
}

/** Total heat-pump heating capacity at outdoor temperature t (linear between −7 and +7, clamped). */
export function heatCapacity(s: Specs, t: number): number {
  const x = (clamp(t, -7, 7) + 7) / 14;
  return s.pumpCount * (s.heatCapMinus7 + (s.heatCapPlus7 - s.heatCapMinus7) * x) * s.heatCapFactor;
}

export function cop(s: Specs, t: number): number {
  const x = (clamp(t, -7, 7) + 7) / 14;
  return s.copMinus7 + (s.copPlus7 - s.copMinus7) * x;
}

/** Deliverable cooling capacity at outdoor temperature t. */
export function coolCapacity(s: Specs, t: number): number {
  const pumps = s.pumpCount * s.coolCapA35 * clamp(1 - s.coolCapLossPerK * (t - 35), 0.7, 1.2);
  return Math.min(s.fanCoilCapKw, pumps) * s.coolCapFactor;
}

export function eer(s: Specs, t: number): number {
  return clamp(s.eerA35 * (1 - s.eerLossPerK * (t - 35)), 1.8, 3.4);
}

function heatDemand(s: Specs, t: number): number {
  const load = designHeatLoadKw(s);
  return Math.max(0, (load * (s.heatingIndoorTemp - t)) / (s.heatingIndoorTemp - s.designOutdoorTemp));
}

function sensibleCoolLoad(s: Specs, t: number, setpoint: number, win: number, opq: number, irLoss: number): number {
  return Math.max(
    0,
    (s.coolTransmissionKwK + s.coolVentilationKwK) * (t - setpoint) +
      win * s.windowSolarFactor +
      opq * s.opaqueSolarFactor +
      s.internalGainsKw -
      irLoss,
  );
}

export function comfortShare(s: Specs): number {
  return s.totalFloorAreaM2 > 0 ? s.comfortAreaM2 / s.totalFloorAreaM2 : 0;
}

export type TariffLookup = (date: string) => number;

export function computeDay(d: DayInput, s: Specs, tariffFor: TariffLookup): DayResult {
  const month = Number(d.date.slice(5, 7));
  const year = Number(d.date.slice(0, 4));
  const irLoss = s.solarAreas[month - 1]?.irLossKw ?? 0;

  // Heating
  const heatKwDay = heatDemand(s, d.tDay);
  const heatKwNight = heatDemand(s, d.tNight);
  const capDay = heatCapacity(s, d.tDay);
  const capNight = heatCapacity(s, d.tNight);
  const heatElecDay = (Math.min(heatKwDay, capDay) * d.dayHours) / cop(s, d.tDay);
  const heatElecNight = (Math.min(heatKwNight, capNight) * d.nightHours) / cop(s, d.tNight);

  // Cooling
  const coolKwDay =
    d.tDay > s.coolingThreshold
      ? sensibleCoolLoad(s, d.tDay, s.coolingThreshold, d.winDay, d.opqDay, irLoss) + d.dehDay * s.dehumidFactor
      : 0;
  const coolKwNight =
    d.tNight > s.coolingThreshold
      ? sensibleCoolLoad(s, d.tNight, s.coolingThreshold, d.winNight, d.opqNight, irLoss) + d.dehNight * s.dehumidFactor
      : 0;
  const cCapDay = coolCapacity(s, d.tDay);
  const cCapNight = coolCapacity(s, d.tNight);
  const coolPeakKw = Math.max(coolKwDay, coolKwNight);
  const coolReserveKw =
    coolPeakKw === 0
      ? 0
      : Math.min(coolKwDay > 0 ? cCapDay - coolKwDay : 1e6, coolKwNight > 0 ? cCapNight - coolKwNight : 1e6);
  const coolElecDay = (Math.min(coolKwDay, cCapDay) * d.dayHours) / eer(s, d.tDay);
  const coolElecNight = (Math.min(coolKwNight, cCapNight) * d.nightHours) / eer(s, d.tNight);

  const tariff = tariffFor(d.date);
  const elecTotal = heatElecDay + heatElecNight + coolElecDay + coolElecNight;

  // Night comfort cooling (extra share of floor area cooled to a lower target at night)
  let comfortKwh = 0;
  let comfortCost = 0;
  if (s.comfortEnabled) {
    const share = comfortShare(s);
    comfortKwh =
      d.tNight > s.comfortTargetTemp
        ? sensibleCoolLoad(s, d.tNight, s.comfortTargetTemp, d.winNight, d.opqNight, irLoss) * d.nightHours * share
        : 0;
    const alreadyCooled = Math.max(0, coolKwNight - d.dehNight * s.dehumidFactor) * d.nightHours * share;
    comfortCost = (Math.max(0, comfortKwh - alreadyCooled) / eer(s, d.tNight)) * tariff;
  }

  const heatDeficitDay = heatKwDay > capDay ? 1 : 0;
  const heatDeficitNight = heatKwNight > capNight ? 1 : 0;
  const coolDeficitDay = coolKwDay > cCapDay ? 1 : 0;
  const coolDeficitNight = coolKwNight > cCapNight ? 1 : 0;

  return {
    date: d.date,
    year,
    frost: d.tmin < 0,
    heatKwDay,
    heatKwNight,
    heatKwhDay: heatKwDay * d.dayHours,
    heatKwhNight: heatKwNight * d.nightHours,
    heatPeakKw: Math.max(heatKwDay, heatKwNight),
    heatReserveKw: Math.min(capDay - heatKwDay, capNight - heatKwNight),
    heatDeficitDay,
    heatDeficitNight,
    heatUnmetKwh: Math.max(0, heatKwDay - capDay) * d.dayHours + Math.max(0, heatKwNight - capNight) * d.nightHours,
    heatElecDay,
    heatElecNight,
    coolKwDay,
    coolKwNight,
    coolKwhDay: coolKwDay * d.dayHours,
    coolKwhNight: coolKwNight * d.nightHours,
    coolPeakKw,
    coolReserveKw,
    coolDeficitDay,
    coolDeficitNight,
    coolUnmetKwh:
      Math.max(0, coolKwDay - cCapDay) * d.dayHours + Math.max(0, coolKwNight - cCapNight) * d.nightHours,
    coolElecDay,
    coolElecNight,
    elecTotal,
    tariff,
    cost: elecTotal * tariff,
    hoursHot: d.hoursHot,
    hoursAboveCool: d.hoursAboveCool,
    comfortKwh,
    comfortCost,
    input: d,
  };
}

export function summarizeByYear(rows: DayResult[]): YearSummary[] {
  const map = new Map<number, YearSummary>();
  for (const r of rows) {
    let y = map.get(r.year);
    if (!y) {
      y = {
        year: r.year, days: 0, frostDays: 0, hotDays: 0, hotHours: 0,
        heatDeficitDays: 0, heatDeficitPeriods: 0, coolDeficitDays: 0, coolDeficitPeriods: 0,
        heatElec: 0, coolElec: 0, elecTotal: 0, cost: 0, coolCostInclComfort: 0, totalCostInclComfort: 0,
      };
      map.set(r.year, y);
    }
    y.days++;
    if (r.frost) y.frostDays++;
    if (r.hoursHot > 0) y.hotDays++;
    y.hotHours += r.hoursHot;
    y.heatDeficitDays += Math.max(r.heatDeficitDay, r.heatDeficitNight);
    y.heatDeficitPeriods += r.heatDeficitDay + r.heatDeficitNight;
    y.coolDeficitDays += Math.max(r.coolDeficitDay, r.coolDeficitNight);
    y.coolDeficitPeriods += r.coolDeficitDay + r.coolDeficitNight;
    y.heatElec += r.heatElecDay + r.heatElecNight;
    y.coolElec += r.coolElecDay + r.coolElecNight;
    y.elecTotal += r.elecTotal;
    y.cost += r.cost;
    y.coolCostInclComfort += (r.coolElecDay + r.coolElecNight) * r.tariff + r.comfortCost;
    y.totalCostInclComfort += r.cost + r.comfortCost;
  }
  return [...map.values()].sort((a, b) => a.year - b.year);
}

export function totals(years: YearSummary[]): YearSummary {
  const t: YearSummary = {
    year: 0, days: 0, frostDays: 0, hotDays: 0, hotHours: 0,
    heatDeficitDays: 0, heatDeficitPeriods: 0, coolDeficitDays: 0, coolDeficitPeriods: 0,
    heatElec: 0, coolElec: 0, elecTotal: 0, cost: 0, coolCostInclComfort: 0, totalCostInclComfort: 0,
  };
  for (const y of years) {
    for (const k of Object.keys(t) as (keyof YearSummary)[]) if (k !== 'year') t[k] += y[k];
  }
  return t;
}

export interface CapacityCheck {
  designHeatLoadKw: number;
  pumpsAtDesignKw: number;
  maxCoolDemandKw: number;
  heatUnmetKwh: number;
  coolUnmetKwh: number;
  maxHourlyTemp: number | null;
}

export function capacityCheck(s: Specs, rows: DayResult[], maxHourlyTemp: number | null): CapacityCheck {
  // Note: the sheet does not clamp the design temperature here (only in the daily rows).
  const pumpsAtDesignKw =
    s.pumpCount *
    (s.heatCapMinus7 + ((s.designOutdoorTemp + 7) * (s.heatCapPlus7 - s.heatCapMinus7)) / 14) *
    s.heatCapFactor;
  let maxCool = 0, hu = 0, cu = 0;
  for (const r of rows) {
    maxCool = Math.max(maxCool, r.coolPeakKw);
    hu += r.heatUnmetKwh;
    cu += r.coolUnmetKwh;
  }
  return {
    designHeatLoadKw: designHeatLoadKw(s),
    pumpsAtDesignKw,
    maxCoolDemandKw: maxCool,
    heatUnmetKwh: hu,
    coolUnmetKwh: cu,
    maxHourlyTemp,
  };
}
