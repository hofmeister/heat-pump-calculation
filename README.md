# Heat Pump Calculator

### ▶ [Open the app: hofmeister.github.io/heat-pump-calculation](https://hofmeister.github.io/heat-pump-calculation/)

[![Deploy to GitHub Pages](https://github.com/hofmeister/heat-pump-calculation/actions/workflows/deploy.yml/badge.svg)](https://github.com/hofmeister/heat-pump-calculation/actions/workflows/deploy.yml)

It runs entirely in your browser and works on phones too. Your inputs are saved only in your browser. Available in English, Italiano, Français and Español.

**Let your AI assistant fill it in.** Press *Open in ChatGPT* / *Open in Claude* (or *Copy prompt for any AI*) in the app. Give the assistant your heat pump datasheet, energy report and electricity bill. It answers with a link that opens the calculator filled in and calculating. AI assistants can read the instructions directly at [`llms.txt`](https://hofmeister.github.io/heat-pump-calculation/llms.txt).

A small browser app (TypeScript + Vite, no backend) that estimates how much electricity and money heat pumps use for heating and cooling a building. It also checks whether the pumps have enough capacity. It is a port of a heating & cooling analysis spreadsheet. The unit tests check the model against that spreadsheet's formulas, evaluated by LibreOffice on a synthetic example house, to 6 decimals. The defaults are a generic example house in Berlin; replace them with your own building's figures.

## Data sources (pulled automatically)

| Data | Source |
|---|---|
| Hourly temperature, humidity, irradiance on N/E/S/W façades and the roof, sunrise and sunset | [Open-Meteo](https://open-meteo.com/) historical archive. The most recent days, which the archive does not have yet, come from the forecast API. |
| Household electricity price per semester (all taxes included, by consumption band) | [Eurostat `nrg_pc204`](https://ec.europa.eu/eurostat/databrowser/view/nrg_pc204/default/table) for the selected country |
| Address search | Open-Meteo geocoding |

The end date defaults to "yesterday", so the period keeps rolling forward. You can override the price for any semester, for example with the rate from your own bill. Semesters that have no Eurostat value use "my current tariff", or the latest Eurostat price if that field is left blank. Overrides are cleared when the country changes, because they belong to a bill from one country.

## Help for every input

Every input has an ⓘ button that explains what the number means and where to find it: which datasheet table, which line of an energy report, how to read it off your bill, or a rule of thumb when you don't have it. The English texts (`src/locales/help.en.ts`) also feed `llms.txt` and the WebMCP `get_inputs` tool.

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

## Filling it in with an AI assistant

Most people will ask ChatGPT, Claude or Gemini to help. Those assistants can't run the calculator, so the app is built for a hand-off:

1. **Prompt:** *Open in ChatGPT* / *Open in Claude* starts a chat that points the assistant at [`llms.txt`](https://hofmeister.github.io/heat-pump-calculation/llms.txt), including anything you've already entered. *Copy prompt for any AI* copies the full instructions instead, for assistants that can't browse.
2. **Link back:** the assistant collects your figures (reading datasheets, reports and bills you upload) and replies with a link such as `…/heat-pump-calculation/#place=Lyon%2C%20France&pumpCount=1&heatCapMinus7=7.9&copPlus7=4.4`. Opening it fills in the inputs, highlights what changed (with **Undo**), looks up the place, and calculates.
3. **Paste instead:** the same `key=value` lines (or JSON) can be pasted into the app's "Paste the AI's answer" box.
4. **Discuss results:** *Copy results for your AI* copies a summary, a per-year table and a link with every input, so the assistant can explain the results and suggest changes as a new link.

The inputs sit in the URL fragment (after `#`), which browsers never send to the server. `llms.txt`, the copied prompt and the WebMCP tools are all generated from the same help texts (`src/locales/help.en.ts`) and parser (`src/importer.ts`).

## Languages

The UI and all help texts are available in English, Italian, French and Spanish (`src/locales/`). The language is detected from the browser (the first of its preferred languages that the app supports, e.g. `es-MX` → Spanish), and anything unsupported falls back to English. Picking a language in the header saves that choice locally; picking *Automatic* goes back to following the browser. English is the source: tests check that every translation has the same keys, placeholders and HTML tags.

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
