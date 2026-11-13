/** Language selection, string formatting and locale-aware numbers. */
import { en, type Locale } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { it } from './locales/it';

export const LOCALES = { en, it, fr, es } satisfies Record<string, Locale>;
export type Lang = keyof typeof LOCALES;
export const LANGS = Object.keys(LOCALES) as Lang[];

const KEY = 'hpc.lang.v1';
let lang: Lang = detect();

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved in LOCALES) return saved as Lang;
  } catch { /* storage blocked */ }
  for (const l of typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []) {
    const short = l.slice(0, 2).toLowerCase();
    if (short in LOCALES) return short as Lang;
  }
  return 'en';
}

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  document.documentElement.lang = LOCALES[l].meta.htmlLang;
}

/** Current locale's strings. */
export const L = (): Locale => LOCALES[lang];

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
