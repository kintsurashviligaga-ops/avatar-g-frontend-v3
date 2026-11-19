import { insertSectionTag, sectionsIn } from './lyricsTags';

describe('insertSectionTag', () => {
  it('starts empty lyrics with the tag', () => {
    expect(insertSectionTag('', 'Verse')).toEqual({ text: '[Verse]\n', caret: 8 });
  });
  it('puts the tag after a blank line at the end', () => {
    expect(insertSectionTag('la la la', 'Chorus').text).toBe('la la la\n\n[Chorus]\n');
    expect(insertSectionTag('la la la\n', 'Chorus').text).toBe('la la la\n\n[Chorus]\n');
    expect(insertSectionTag('la la la\n\n', 'Chorus').text).toBe('la la la\n\n[Chorus]\n');
  });
  it('inserts at a caret inside the text and keeps what follows', () => {
    const r = insertSectionTag('one\ntwo', 'Bridge', 4);
    expect(r.text).toBe('one\n\n[Bridge]\ntwo');
    expect(r.text.slice(r.caret)).toBe('two');
  });
  it('clamps an out-of-range caret', () => {
    expect(insertSectionTag('a', 'Outro', 99).text).toBe('a\n\n[Outro]\n');
  });
});

describe('sectionsIn', () => {
  it('reads the tags in order, any case', () => {
    expect(sectionsIn('[verse]\nhi\n\n[CHORUS]\nyo\n[Bridge]')).toEqual(['Verse', 'Chorus', 'Bridge']);
    expect(sectionsIn('no tags [Verse] inline')).toEqual([]);
  });
});
