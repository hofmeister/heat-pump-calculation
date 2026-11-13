import { describe, expect, it } from 'vitest';
import { LOCALES } from '../src/i18n';

type Tree = { [k: string]: string | Tree };
function flatten(t: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === 'string') out[prefix + k] = v;
    else Object.assign(out, flatten(v, `${prefix}${k}.`));
  }
  return out;
}
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
const tags = (s: string) => (s.match(/<\/?\w+>/g) ?? []).sort();

const en = flatten(LOCALES.en as unknown as Tree);

describe.each(Object.keys(LOCALES).filter((l) => l !== 'en'))('locale %s', (lang) => {
  const loc = flatten(LOCALES[lang as keyof typeof LOCALES] as unknown as Tree);
  it('has exactly the English keys', () => {
    expect(Object.keys(loc).sort()).toEqual(Object.keys(en).sort());
  });
  it('keeps every {placeholder} and HTML tag', () => {
    for (const k of Object.keys(en)) {
      expect(placeholders(loc[k]), k).toEqual(placeholders(en[k]));
      expect(tags(loc[k]), k).toEqual(tags(en[k]));
    }
  });
  it('translates (most strings differ from English)', () => {
    const same = Object.keys(en).filter((k) => loc[k] === en[k] && en[k].length > 12 && !k.startsWith('inputs.bands'));
    expect(same.length, same.join(', ')).toBeLessThan(5);
  });
});

import { pickLang } from '../src/i18n';

describe('pickLang', () => {
  it('follows the browser, matching regional variants', () => {
    expect(pickLang(null, ['it-IT', 'en-US'])).toBe('it');
    expect(pickLang(null, ['es-MX'])).toBe('es');
    expect(pickLang(null, ['fr_CA'])).toBe('fr');
  });
  it('prefers the most specific supported language over English, wherever English is in the list', () => {
    expect(pickLang(null, ['en', 'da', 'it'])).toBe('it');
    expect(pickLang(null, ['en-US', 'es-ES'])).toBe('es');
    expect(pickLang(null, ['da-DK', 'en-GB', 'it'])).toBe('it');
    expect(pickLang(null, ['de-DE', 'fr-FR'])).toBe('fr');
  });
  it('among several supported languages, keeps the browser’s order', () => {
    expect(pickLang(null, ['en', 'fr', 'it'])).toBe('fr');
    expect(pickLang(null, ['it-IT', 'fr-FR', 'en'])).toBe('it');
  });
  it('falls back to English', () => {
    expect(pickLang(null, ['da-DK', 'de'])).toBe('en');
    expect(pickLang(null, [])).toBe('en');
    expect(pickLang('xx', ['zz'])).toBe('en');
  });
  it('an explicit saved choice wins over the browser', () => {
    expect(pickLang('es', ['it-IT'])).toBe('es');
  });
});
