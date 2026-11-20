/**
 * Guards against words typed with a mixed keyboard layout, e.g. „კომიссია" (Georgian + Cyrillic „сс")
 * or „Закрытие" with a Georgian „რ". Such words look right at a glance but read as broken text and
 * never match search or regexes. Scans every user-facing copy file we keep in one place.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const FILES = [
  'messages/ka.json',
  'messages/en.json',
  'messages/ru.json',
  'lib/i18n/LanguageContext.tsx',
  'lib/i18n/translations.ts',
  'lib/service-chat/service-configs.ts',
  'components/services/unified/ServiceCommandBar.tsx',
];
// A Georgian letter directly next to a Cyrillic one, in either order.
const MIXED = /[ა-ჿ][Ѐ-ӿ]|[Ѐ-ӿ][ა-ჿ]/;

describe('copy has no Georgian/Cyrillic mixed-layout words', () => {
  it.each(FILES)('%s', (rel) => {
    const bad = fs
      .readFileSync(path.join(ROOT, rel), 'utf8')
      .split('\n')
      .map((line, i) => ({ line: i + 1, text: line.trim() }))
      .filter(({ text }) => MIXED.test(text));
    expect(bad).toEqual([]);
  });
});
