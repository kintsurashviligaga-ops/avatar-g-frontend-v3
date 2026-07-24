import { parseImageBlocks, hasImageBlocks, stripRawAudioTags } from './imageBlocks';

describe('stripRawAudioTags — audio-only strip for react-markdown surfaces (MyAvatarChatV2 /chat)', () => {
  it('strips the EXACT screenshot leak "<audio controls> <source src=… type=audio/mpeg></audio>" and extracts the url', () => {
    const raw = 'Here is your song:\n<audio controls> <source src="https://cdn.myavatar.ge/gen/generated_spanish_upbeat_song_2.mp3" type="audio/mpeg"></audio>\nEnjoy!';
    const r = stripRawAudioTags(raw);
    expect(r.audioUrls).toEqual(['https://cdn.myavatar.ge/gen/generated_spanish_upbeat_song_2.mp3']);
    expect(r.text).not.toMatch(/<audio|<source|controls|audio\/mpeg/i); // no raw markup survives to react-markdown
    expect(r.text).toContain('Here is your song:');
    expect(r.text).toContain('Enjoy!');
  });

  it('hides a still-streaming unclosed <audio…> partial (no </audio> yet)', () => {
    expect(stripRawAudioTags('Track: <audio controls><source src="https://x/y.mp').text).toBe('Track:');
  });

  it('leaves markdown images and ordinary prose untouched (audio-only — never touches images)', () => {
    const md = 'Look: ![a cat](https://x/cat.png) and read more.';
    const r = stripRawAudioTags(md);
    expect(r.text).toBe(md);          // markdown image is preserved for react-markdown to render
    expect(r.audioUrls).toEqual([]);
  });

  it('does NOT touch a [Audio: url] marker (that is parseImageBlocks territory) or a fenced example', () => {
    expect(stripRawAudioTags('[Audio: https://x/y.mp3]').text).toBe('[Audio: https://x/y.mp3]');
    const fenced = 'Example:\n```html\n<audio controls><source src="https://x/z.mp3"></audio>\n```';
    expect(stripRawAudioTags(fenced).audioUrls).toEqual([]); // fenced tutorial preserved
  });

  it('returns an audio-free message VERBATIM (never alters markdown trailing-space hard-breaks / indent)', () => {
    const md = 'line one  \nline two\n\n    indented block';   // 2 trailing spaces = a markdown hard break
    expect(stripRawAudioTags(md)).toEqual({ text: md, audioUrls: [] });
  });

  it('NEVER truncates a COMPLETED message that merely MENTIONS the <audio> HTML element (review fix)', () => {
    // the dangling strip must only hit an UNTERMINATED trailing tag, never a complete <audio> with a `>` + prose after
    for (const s of [
      'To embed sound, use the <audio> element with a controls attribute.',
      'The HTML <audio controls> tag plays media in the browser.',
      'Compare <video> and <audio> tags when building players.',
      'The <audio> tag is the standard way to embed sound.',
    ]) {
      expect(stripRawAudioTags(s)).toEqual({ text: s, audioUrls: [] });
    }
  });

  it('does not corrupt a CLOSED code fence whose <audio> lacks a </audio> (review fix)', () => {
    const src = "Here's the tag:\n```html\n<audio src=\"clip.mp3\" controls>\n```\nThat's it.";
    const r = stripRawAudioTags(src);
    expect(r.text).toContain('```html');   // fence intact
    expect(r.text).toContain("That's it."); // trailing prose intact
    expect(r.text).toContain('<audio src="clip.mp3"'); // the example survives
  });
});

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
    expect(ms).toBeLessThan(2000); // bounded regex → linear; a ReDoS regression is tens of seconds/hangs. Relaxed from 200ms so a loaded CI runner's jitter can't flake this perf guard.
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

  it('strips a raw <audio><source> HTML block and lifts the track URL into audioUrls (VECTOR 4)', () => {
    const r = parseImageBlocks('Here is your song: <audio controls><source src="https://cdn.myavatar.ge/t/song.mp3" type="audio/mpeg"></audio> enjoy!');
    expect(r.audioUrls).toEqual(['https://cdn.myavatar.ge/t/song.mp3']);
    expect(r.text).not.toMatch(/<audio|<source|<\/audio>/i); // no raw markup leaks into the bubble
    expect(r.text).toContain('Here is your song:');
    expect(r.text).toContain('enjoy!');
  });

  it('handles a self-closing <audio src …/> and an <audio src=…> attribute form', () => {
    expect(parseImageBlocks('<audio src="https://x.io/a.mp3" controls />').audioUrls).toEqual(['https://x.io/a.mp3']);
    const r = parseImageBlocks('<audio controls src="https://x.io/b.wav"></audio>');
    expect(r.audioUrls).toEqual(['https://x.io/b.wav']);
    expect(r.text).toBe('');
  });

  it('hasImageBlocks fires on a raw <audio> tag so the parse+strip path runs', () => {
    expect(hasImageBlocks('<audio controls><source src="https://x/y.mp3"></audio>')).toBe(true);
    expect(hasImageBlocks('<source src="https://x/y.mp3">')).toBe(true);
  });

  it('handles a LONG signed CDN URL in the audio tag (tag bound must exceed the URL bound — review fix)', () => {
    const longUrl = 'https://proj.supabase.co/storage/v1/object/sign/audio/track.mp3?token=' + 'e'.repeat(340);
    const r = parseImageBlocks(`Here you go: <audio src="${longUrl}" controls />`);
    expect(r.audioUrls).toEqual([longUrl]);
    expect(r.text).not.toMatch(/<audio/i); // the long-URL tag is stripped, not leaked
  });

  it('KEEPS a URL-less <audio> example (relative src / code) verbatim — never deletes legit prose (review fix)', () => {
    const r = parseImageBlocks('To embed audio use: <audio controls><source src="song.mp3" type="audio/mpeg"></audio> and it plays.');
    expect(r.audioUrls).toEqual([]);                 // no real https track → not a player
    expect(r.text).toContain('<audio controls>');    // the example markup is preserved
    expect(r.text).toContain('<source src="song.mp3"');
  });

  it('does NOT strip an <audio>/<source> example inside a fenced code block (review fix)', () => {
    const src = 'To embed audio:\n\n```html\n<audio controls>\n  <source src="https://cdn.x/song.mp3" type="audio/mpeg">\n</audio>\n```\n\nThat plays it.';
    const r = parseImageBlocks(src);
    expect(r.audioUrls).toEqual([]);                 // fenced code is a tutorial, not a real player
    expect(r.text).toContain('<audio controls>');    // the fenced example survives intact
    expect(r.text).toContain('```html');
  });

  it('hides a still-STREAMING unclosed <audio…> partial so raw markup never flashes mid-stream (P75)', () => {
    // the exact leak: tokens arrive before </audio> does
    expect(parseImageBlocks('Your track: <audio controls><source src="https://cdn.x/song.mp').text).toBe('Your track:');
    expect(parseImageBlocks('here <audio').text).toBe('here');
    // a COMPLETE block earlier is untouched by the dangling strip; only the trailing unclosed one is hidden
    const mixed = parseImageBlocks('a <audio src="https://x/a.mp3"></audio> b <audio controls><source src="https://x/b.mp');
    expect(mixed.audioUrls).toEqual(['https://x/a.mp3']); // the complete one became a player
    expect(mixed.text).not.toMatch(/<audio controls>/);   // the trailing partial is hidden
  });

  it('does NOT treat a non-tag word like "<audiobook" as a streaming audio tag', () => {
    expect(parseImageBlocks('I read an <audiobook chapter today').text).toBe('I read an <audiobook chapter today');
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
