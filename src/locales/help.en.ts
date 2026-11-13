/**
 * Plain-language help for every input: what it means and where to find the number.
 * Shown behind the ⓘ buttons in the UI, and (in English) given to AI assistants
 * via llms.txt, the copied prompt and the WebMCP get_inputs tool.
 *
 * This English file is the source; help.<lang>.ts must have exactly the same keys.
 */
export interface HelpEntry {
  what: string;
  find: string;
}

export const help = {
  // ---------------------------------------------------------------- location & period
  location: {
    what: 'Where the building is. Hourly weather and sun data are downloaded for these coordinates.',
    find: 'Tap “Use my location” (your browser asks first), or search for your town or address. Or copy coordinates from a map (in Google Maps, right-click the house and click the numbers).',
  },
  countryCode: {
    what: 'Two-letter country code (e.g. DE, DK, IT) used to fetch household electricity prices from Eurostat.',
    find: 'Filled in automatically when you pick a search result. Eurostat covers EU/EEA countries and a few neighbours; elsewhere, enter your own tariff under Electricity prices.',
  },
  period: {
    what: 'The days to simulate. Longer periods average out unusual winters and summers.',
    find: 'Five or more full years gives a fair picture. Leave “To” blank to always run up to yesterday.',
  },

  // ---------------------------------------------------------------- building – heating
  heatingIndoorTemp: {
    what: 'The temperature you keep indoors in winter.',
    find: 'Your thermostat setting; 20–21 °C is typical. Each extra degree adds roughly 6 % to heating energy.',
  },
  designOutdoorTemp: {
    what: 'The coldest outdoor temperature the heating is sized for (the “design temperature”). The heat losses below are given at this temperature.',
    find: 'Stated in your heat-loss calculation or energy report (EN 12831). Otherwise use your national standard’s table for your town, or ask an installer. It is roughly the coldest temperature reached on a few days a year, e.g. −12 to −16 °C in Central Europe.',
  },
  designTransmissionLossW: {
    what: 'Heat lost through walls, roof, floor and windows when it is design-temperature cold outside.',
    find: 'The total “transmission heat loss” (Φ_T) in a room-by-room heat-loss calculation from an installer or energy consultant. If you only know the total heat load, use the override field instead.',
  },
  designVentilationLossW: {
    what: 'Heat lost warming up the outdoor air that comes in through ventilation and draughts, at the design temperature.',
    find: 'The “ventilation heat loss” (Φ_V) in the same report. Rough estimate: 0.34 × air changes per hour × house volume in m³ × (indoor − design temperature), in W. Heat-recovery ventilation makes it much smaller.',
  },
  designHeatLoadOverrideKw: {
    what: 'The building’s total heat load at the design temperature, if you only have one number. Leave blank to use transmission + ventilation.',
    find: 'From a heat-loss report or the heat-pump sizing in an installer quote (without any reheat allowance). Estimate from past use: yearly heating energy in kWh (gas m³ × ~10 × boiler efficiency ~0.9, or oil litres × ~10) ÷ 2,000 full-load hours. Or floor area × W/m²: ~30–40 new build, ~50–70 renovated, 100+ uninsulated.',
  },

  // ---------------------------------------------------------------- heat pumps
  pumpCount: {
    what: 'How many identical heat pumps heat and cool the house.',
    find: 'Count the outdoor units used for space heating. Leave out any unit used only for hot water.',
  },
  heatCapMinus7: {
    what: 'Heat output of one heat pump at −7 °C outside, at your system’s flow temperature. Below −7 °C the model keeps this value.',
    find: 'In the heat pump’s datasheet or data book, under the capacity table at “A-7/W35”, “A-7/W45” or “A-7/W55”. Choose the W value closest to your flow temperature (underfloor ≈ 35 °C, radiators 45–55 °C). Use the maximum output, not the nominal one.',
  },
  heatCapPlus7: {
    what: 'Heat output of one heat pump at +7 °C outside. Between −7 and +7 °C the model draws a straight line.',
    find: 'Same datasheet table, at “A7/W35”, “A7/W45” or “A7/W55”. A7/W35 is usually the headline rating.',
  },
  copMinus7: {
    what: 'COP (heat out ÷ electricity in) at −7 °C outside. Higher is better.',
    find: 'Same datasheet table as the −7 °C capacity, same flow temperature (EN 14511 test points). Real-world winter COP is often 5–10 % lower because of defrosting.',
  },
  copPlus7: {
    what: 'COP at +7 °C outside.',
    find: 'Datasheet, at A7 and your flow temperature. For a rough check: a SCOP of 4 at 35 °C usually means a COP of about 4.5–5 at A7/W35.',
  },
  heatCapFactor: {
    what: 'Scales the heating output up or down to test what happens with less capacity.',
    find: '1 = the datasheet values. Use 0.9 to allow for defrosting, ageing or a safety margin.',
  },
  coolCapA35: {
    what: 'Cooling output of one heat pump at 35 °C outside with 7 °C chilled water (A35/W7).',
    find: 'Datasheet cooling table at “A35/W7”. If you cool with underfloor or chilled ceilings (water at ~18 °C), use the A35/W18 figure instead; it is higher.',
  },
  eerA35: {
    what: 'EER (cooling out ÷ electricity in) at A35/W7. Higher is better.',
    find: 'Same datasheet cooling table (EN 14511). Use A35/W18 if you cool with underfloor heating.',
  },
  coolCapLossPerK: {
    what: 'How much cooling output drops for each °C above 35 °C outside (0.01 = 1 % per °C).',
    find: 'If the datasheet lists A40 or A43: (1 − capacity at A40 ÷ capacity at A35) ÷ 5. Otherwise keep 0.01.',
  },
  eerLossPerK: {
    what: 'How much the EER drops for each °C above 35 °C outside (0.02 = 2 % per °C).',
    find: 'Same method as the capacity loss, using the EER columns. Otherwise keep 0.02.',
  },
  fanCoilCapKw: {
    what: 'The most cooling your indoor units can deliver into the rooms, whatever the heat pump could make. The model never cools more than this.',
    find: 'Add up the rated total cooling capacity of all fan coils at your water temperature (e.g. 7/12 °C), from their datasheets. For underfloor or ceiling cooling use about 20–40 W per m² of cooled floor.',
  },
  coolCapFactor: {
    what: 'Scales the deliverable cooling up or down to test what happens with less capacity.',
    find: '1 = as specified. Use 0.8 to see the effect of 20 % less cooling.',
  },

  // ---------------------------------------------------------------- cooling loads
  coolingThreshold: {
    what: 'Cooling switches on when the day or night average outdoor temperature is above this, and holds the house at this temperature. Between the heating setpoint and this value the system is off.',
    find: 'Your summer thermostat setting; 24–26 °C is common.',
  },
  hotDayThreshold: {
    what: 'Only for the statistics: a “very hot” day has at least one hour at or above this temperature.',
    find: 'Pick a temperature that matters to you, e.g. 30 °C or your area’s summer design temperature.',
  },
  coolTransmissionKwK: {
    what: 'Heat that comes in through the walls, roof and windows for each °C it is warmer outside than inside (kW per kelvin).',
    find: 'The transmission coefficient H_T (W/K) in an energy report, ÷ 1000. Or estimate it: design transmission loss in W ÷ (indoor − design temperature) ÷ 1000; e.g. 7,800 ÷ 32 ÷ 1000 ≈ 0.24.',
  },
  coolVentilationKwK: {
    what: 'Heat brought in by outdoor air for each °C it is warmer outside (kW per kelvin).',
    find: 'H_V (W/K) from an energy report, ÷ 1000. Or estimate it: 0.34 × air changes per hour × volume in m³ ÷ 1000, or design ventilation loss ÷ (indoor − design temperature) ÷ 1000.',
  },
  internalGainsKw: {
    what: 'Average heat given off inside by people, appliances and lights.',
    find: 'Typically 2–5 W per m² of floor, so about 0.3–0.8 kW for a family house.',
  },
  windowSolarFactor: {
    what: 'Scales the sunshine coming through windows.',
    find: '1 = the solar areas as entered. Try 1.5 for more sun than expected (e.g. blinds left open) or 0.5 for good external shading.',
  },
  opaqueSolarFactor: {
    what: 'Scales the heat the sun puts into walls and roof.',
    find: '1 = as entered. Raise it for dark, poorly insulated roofs.',
  },
  airflowM3h: {
    what: 'Outdoor air entering the house per hour (ventilation plus draughts). Used to work out how much moisture has to be removed in summer.',
    find: 'The setting of your ventilation unit, or about 0.3–0.5 × the house volume in m³ for natural ventilation.',
  },
  indoorRH: {
    what: 'Indoor relative humidity you aim for in summer, as a fraction (0.5 = 50 %). Moister outdoor air than this adds a dehumidification load.',
    find: '0.5 is typical for comfort. Raise it if you don’t mind it a bit muggier.',
  },
  dehumidFactor: {
    what: 'Scales the energy spent removing moisture from incoming air.',
    find: '1 = fan coils that dehumidify. Use 0 for underfloor or ceiling cooling, which runs above the dew point and doesn’t dehumidify.',
  },

  // ---------------------------------------------------------------- night comfort
  comfortEnabled: {
    what: 'Adds extra night-time cooling for part of the house (typically bedrooms) to a lower temperature, as a separate cost.',
    find: 'Turn on if you cool bedrooms at night below the normal cooling setpoint.',
  },
  comfortTargetTemp: {
    what: 'The night temperature you want in those rooms.',
    find: 'Your bedroom thermostat setting at night, e.g. 22–23 °C.',
  },
  comfortAreaM2: {
    what: 'Floor area of the rooms cooled to the night target.',
    find: 'Add up the bedroom floor areas from the floor plan.',
  },
  totalFloorAreaM2: {
    what: 'Total heated floor area. The night comfort load is this area’s share of the whole house’s cooling load.',
    find: 'From the floor plan, energy certificate or property listing (heated living area).',
  },

  // ---------------------------------------------------------------- solar areas (table columns)
  winArea: {
    what: 'Effective window area for sunshine in each direction: how many m² of “fully open” sun-catching surface the windows are equivalent to.',
    find: 'Glass area × g-value × shading factor. The g-value is on the window spec (≈ 0.5–0.6 for double or triple glazing). Shading factor: 1 for none, ~0.5 for overhangs, ~0.2–0.3 for closed external blinds. E.g. 6 m² south glass × 0.55 × 0.85 ≈ 2.8.',
  },
  opqArea: {
    what: 'Effective area for sun heating the walls and roof in each direction. It is small, because insulation lets little of that heat through.',
    find: 'Area × U-value × surface absorptance (≈ 0.6, more for dark surfaces) × 0.04. E.g. 60 m² wall × 0.25 × 0.6 × 0.04 ≈ 0.36. Your energy report may list it as an effective solar collecting area.',
  },
  roofArea: {
    what: 'Effective sun-catching area of the roof or skylights (horizontal surfaces).',
    find: 'Skylights: glass area × g-value × shading. Roof: area × U × absorptance × 0.04, using the same method as walls.',
  },
  irLoss: {
    what: 'Heat the house radiates to the cold sky (kW). It slightly reduces the cooling load.',
    find: 'Usually 0–0.5 kW for a house. Leave it as is if you don’t know it.',
  },

  // ---------------------------------------------------------------- prices
  band: {
    what: 'Eurostat publishes household prices per yearly consumption band. Bigger users pay a lower price per kWh.',
    find: 'Pick the band matching your whole household’s yearly use including the heat pump (on your bill). Heat-pump homes are usually 5,000–14,999 kWh or ≥15,000 kWh.',
  },
  fallbackTariff: {
    what: 'Your current price per kWh, all-in. It is used for half-years with no Eurostat price yet, or for every half-year if your country has no Eurostat data. Blank = the latest Eurostat price.',
    find: 'From your bill: total of all per-kWh charges (energy + network + taxes and levies) ÷ kWh used. Leave out fixed monthly fees. For a dynamic or spot tariff, use your average.',
  },
  priceOverrides: {
    what: 'Replace the price for a single half-year, e.g. with what you actually paid.',
    find: 'From your bills for that half-year: per-kWh charges ÷ kWh. Leave blank to use Eurostat.',
  },
} satisfies Record<string, HelpEntry>;

export type HelpKey = keyof typeof help;
export type Help = Record<HelpKey, HelpEntry>;
