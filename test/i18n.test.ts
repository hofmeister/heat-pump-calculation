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
