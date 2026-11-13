# Heat Pump Calculator

A small browser app (TypeScript + Vite, no backend) that estimates how much electricity and money heat pumps use for heating and cooling a building. It also checks whether the pumps have enough capacity. It is based on the Villa Visione heating & cooling analysis spreadsheet (translated from Italian): the defaults reproduce that spreadsheet, and the unit tests check the result to 6 decimals.

## Data sources (pulled automatically)

| Data | Source |
|---|---|
| Hourly temperature, humidity, irradiance on N/E/S/W façades and the roof, sunrise and sunset | [Open-Meteo](https://open-meteo.com/) historical archive. The most recent days, which the archive does not have yet, come from the forecast API. |
| Household electricity price per semester (all taxes included, by consumption band) | [Eurostat `nrg_pc204`](https://ec.europa.eu/eurostat/databrowser/view/nrg_pc204/default/table) for the selected country |
| Address search | Open-Meteo geocoding |

The end date defaults to "yesterday", so the period keeps rolling forward. You can override the price for any semester, for example with the rate from your own bill. Semesters that have no Eurostat value use "my current tariff", or the latest Eurostat price if that field is left blank. Overrides are cleared when the country changes, because they belong to a bill from one country.

## Storage

Everything is stored in the browser's `localStorage` and nothing is sent to a server:

- the current inputs, saved automatically
- named scenarios, which you can save, load, delete and export or import as JSON
- the hourly weather for the most recent location, stored compactly (about 1 MB for 6 years)
- the Eurostat prices, refreshed once a day

## Model

The model is a straight port of the spreadsheet (`src/model.ts`). Each day is split into a daylight period and a night period, and each period uses its time-weighted mean outdoor temperature.

- **Heating:** demand scales linearly with the design heat load. Capacity and COP are interpolated between the −7 °C and +7 °C ratings, and are held at those values beyond that range.
- **Cooling:** a steady-state balance of transmission, ventilation, solar gains through windows and opaque parts, internal gains, long-wave IR losses and latent dehumidification load. Cooling capacity and EER are derated above 35 °C, and cooling is capped at the fan-coil capacity.
- **Optional night comfort cooling:** part of the floor area is cooled to a lower night setpoint.

Not modelled: thermal mass, how load is distributed between rooms, domestic hot water, standing charges.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # model + aggregation tests (incl. reproduction of the spreadsheet)
npm run build    # static site in dist/ (relative paths, host anywhere)
```

## AI agent tools (WebMCP)

The page registers [WebMCP](https://webmachinelearning.github.io/webmcp/) tools, so an AI agent running in your browser can use the calculator directly. There is no backend: the tools call the same in-page code, local storage and public APIs as the UI, and every change they make shows up on screen with a status message. The tools are registered on `document.modelContext` (the current spec), with a fallback to `navigator.modelContext` (earlier previews and polyfills). In a browser without WebMCP the code does nothing.

| Tool | What it does |
|---|---|
| `get_inputs` | Current location, period, prices and all specs, with units and meanings (read-only) |
| `update_inputs` | Change any inputs; recalculates immediately when the data is already loaded |
| `search_location` | Find coordinates and country for a place name (read-only) |
| `calculate` | Download weather and prices if needed and return the results |
| `get_results` / `get_days` | Yearly summary and capacity check, or per-day rows filtered to very hot, frost or deficit days (read-only) |
| `what_if` | Recalculate with hypothetical changes **without** touching your inputs, and return the difference (read-only) |
| `list_scenarios` / `save_scenario` / `load_scenario` / `delete_scenario` / `reset_inputs` | Manage scenarios saved in the browser |

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` tests, builds and deploys the app on every push to `master`. You can also run it by hand from the Actions tab. Before the first run, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

## Mobile

On screens up to 900 px wide the app shows one panel at a time (Specs or Results), switched from a bottom bar that also holds the Calculate button. Tables scroll sideways with the first column fixed. The chart redraws at the screen's width and shows values when you tap a bar.
