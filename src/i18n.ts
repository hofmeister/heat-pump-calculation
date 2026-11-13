/** Language selection, string formatting and locale-aware numbers. */
import { en, type Locale } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { it } from './locales/it';

export const LOCALES = { en, it, fr, es } satisfies Record<string, Locale>;
export type Lang = keyof typeof LOCALES;
export const LANGS = Object.keys(LOCALES) as Lang[];

// v1 also stored auto-detected languages; v2 stores only an explicit choice.
const KEY = 'hpc.lang.v2';

const isLang = (l: unknown): l is Lang => typeof l === 'string' && Object.prototype.hasOwnProperty.call(LOCALES, l);

/**
 * Pick the UI language: an explicit choice the user saved wins; otherwise the
 * first of the browser's preferred languages we support (so "da, en, it" gives
 * English); otherwise English.
 */
export function pickLang(saved: string | null | undefined, browserLangs: readonly string[]): Lang {
  if (isLang(saved)) return saved;
  for (const tag of browserLangs) {
    const primary = String(tag).split(/[-_]/)[0].toLowerCase();
    if (isLang(primary)) return primary;
  }
  return 'en';
}

function savedLang(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function browserLangs(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}

/** The language the browser alone would give (shown next to "Automatic"). */
export const browserLang = (): Lang => pickLang(null, browserLangs());
/** True when the user hasn't picked a language, so it follows the browser. */
export const isAutomatic = () => !isLang(savedLang());

let lang: Lang = pickLang(savedLang(), browserLangs());

export const getLang = () => lang;

/** Apply a language for this page view without remembering it. */
export function applyLang(l: Lang) {
  lang = isLang(l) ? l : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = LOCALES[lang].meta.htmlLang;
}

/** The user picked a language (or 'auto' to follow the browser again). */
export function chooseLang(choice: Lang | 'auto') {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch { /* storage blocked: still switch for this visit */ }
  applyLang(choice === 'auto' ? browserLang() : choice);
}

/** Current locale's strings (English if anything is off). */
export const L = (): Locale => LOCALES[lang] ?? LOCALES.en;

/** Fill {placeholders}. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

const nf = (min: number, max: number) => new Intl.NumberFormat(L().meta.numberLocale, { minimumFractionDigits: min, maximumFractionDigits: max });
export const n0 = (v: number) => nf(0, 0).format(Math.round(v));
export const n1 = (v: number) => nf(1, 1).format(v);
export const n2 = (v: number) => nf(2, 2).format(v);
export const n4 = (v: number) => nf(4, 4).format(v);
export const eur = (v: number) => new Intl.NumberFormat(L().meta.numberLocale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(v));
export const monthName = (m: number) => new Intl.DateTimeFormat(L().meta.numberLocale, { month: 'short' }).format(new Date(2021, m, 1));
export const dateTime = (iso: string) => new Date(iso).toLocaleString(L().meta.numberLocale);
