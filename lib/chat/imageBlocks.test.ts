import { parseImageBlocks, hasImageBlocks } from './imageBlocks';

describe('parseImageBlocks', () => {
  it('extracts a URL-less [Image: …] placeholder as a prompt and strips it from the prose', () => {
    const r = parseImageBlocks('Here you go:\n[Image: A photorealistic image of a donkey in a field]');
    expect(r.prompts).toEqual(['A photorealistic image of a donkey in a field']);
    expect(r.urls).toEqual([]);
    expect(r.text).toBe('Here you go:');
    expect(r.text).not.toContain('[Image');
  });

  it('extracts a real URL inside [Image: url] as an image url', () => {
    const r = parseImageBlocks('Done [Image: https://cdn.myavatar.ge/x/y.png] enjoy');
    expect(r.urls).toEqual(['https://cdn.myavatar.ge/x/y.png']);
    expect(r.prompts).toEqual([]);
    expect(r.text).toBe('Done  enjoy'.replace(/\s{2,}/g, ' '));
  });

  it('renders a markdown image as a url', () => {
    const r = parseImageBlocks('look: ![a cat](https://x.io/cat.jpg)');
    expect(r.urls).toEqual(['https://x.io/cat.jpg']);
    expect(r.text).toBe('look:');
  });

  it('leaves BARE urls (image-ext or not) as links in the prose — never a broken <img>', () => {
    const r = parseImageBlocks('pic https://s.io/p.webp and site https://example.com/page');
    expect(r.urls).toEqual([]);
    expect(r.text).toContain('https://s.io/p.webp');       // bare image-ext URL stays a link
    expect(r.text).toContain('https://example.com/page');  // ordinary link stays a link
  });

  it('does NOT break a markdown LINK whose href ends in an image extension', () => {
    const r = parseImageBlocks("Here's [my photo](https://cdn.site.com/me.jpg) from yesterday.");
    expect(r.urls).toEqual([]);
    expect(r.text).toContain('[my photo](https://cdn.site.com/me.jpg)'); // link intact, not [my photo]()
  });

  it('does NOT strip a Wikipedia File: page that ends in .png', () => {
    const r = parseImageBlocks('See https://en.wikipedia.org/wiki/File:Example.png please');
    expect(r.urls).toEqual([]);
    expect(r.text).toContain('https://en.wikipedia.org/wiki/File:Example.png');
  });

  it('is ReDoS-safe: a truncated [image: with a huge whitespace run returns instantly', () => {
    const start = process.hrtime.bigint();
    const r = parseImageBlocks('[image:' + ' '.repeat(20000));
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(r.urls).toEqual([]);
    expect(ms).toBeLessThan(200); // bounded regex → linear, not tens of seconds
  });

  it('georgian / russian image markers', () => {
    expect(parseImageBlocks('[სურათი: ლამაზი მთა]').prompts).toEqual(['ლამაზი მთა']);
    expect(parseImageBlocks('[изображение: красивая гора]').prompts).toEqual(['красивая гора']);
  });

  it('dedupes repeated urls, preserves order', () => {
    const r = parseImageBlocks('a ![](https://x/1.png) b ![](https://x/1.png) c ![](https://x/2.png)');
    expect(r.urls).toEqual(['https://x/1.png', 'https://x/2.png']);
  });

  it('leaves plain prose untouched', () => {
    const r = parseImageBlocks('Just a normal answer with no images.');
    expect(r).toEqual({ text: 'Just a normal answer with no images.', urls: [], prompts: [], audioUrls: [] });
  });

  it('handles empty / non-string input safely', () => {
    expect(parseImageBlocks('')).toEqual({ text: '', urls: [], prompts: [], audioUrls: [] });
    // @ts-expect-error runtime guard for non-string
    expect(parseImageBlocks(null)).toEqual({ text: '', urls: [], prompts: [], audioUrls: [] });
  });

  it('extracts [Audio: url] / [Music: url] markers into audioUrls', () => {
    const r = parseImageBlocks('Your track is ready: [Audio: https://cdn.myavatar.ge/t/song.mp3]');
    expect(r.audioUrls).toEqual(['https://cdn.myavatar.ge/t/song.mp3']);
    expect(r.text).toBe('Your track is ready:');
    expect(parseImageBlocks('[Music: https://x.io/beat.wav]').audioUrls).toEqual(['https://x.io/beat.wav']);
    expect(hasImageBlocks('[Audio: https://x/y.mp3]')).toBe(true);
  });

  it('leaves a URL-less [music: …] description in the prose (never deletes legit text)', () => {
    const r = parseImageBlocks('My favorite [music: jazz classics] this year');
    expect(r.audioUrls).toEqual([]);
    expect(r.text).toContain('[music: jazz classics]');
  });

  it('a markdown IMAGE whose alt starts with an audio keyword is rendered, not corrupted', () => {
    const r = parseImageBlocks('![Music: album cover](https://x/cover.png)');
    expect(r.urls).toEqual(['https://x/cover.png']); // extracted as an image, not stripped to "!"
    expect(r.audioUrls).toEqual([]);
    expect(r.text).not.toContain('!(');
  });

  it('a markdown LINK whose text starts with an audio keyword stays intact', () => {
    const r = parseImageBlocks('[Music: my jam](https://x/page)');
    expect(r.audioUrls).toEqual([]);
    expect(r.text).toBe('[Music: my jam](https://x/page)');
  });
});

describe('hasImageBlocks', () => {
  it('true for explicit placeholders and markdown images', () => {
    expect(hasImageBlocks('[Image: x]')).toBe(true);
    expect(hasImageBlocks('![a](https://x/y.png)')).toBe(true);
  });
  it('false for plain prose, bare urls, and markdown links', () => {
    expect(hasImageBlocks('hello there')).toBe(false);
    expect(hasImageBlocks('see https://x/y.jpg')).toBe(false);        // bare URL is a link, not a block
    expect(hasImageBlocks('[my photo](https://x/y.jpg)')).toBe(false); // markdown LINK, not an image
    expect(hasImageBlocks('visit https://example.com/page')).toBe(false);
    expect(hasImageBlocks('')).toBe(false);
  });
});
