import { directMontage, directorPrompt, parseDirector, videoMime, type DirectorVideo } from './montageDirector';

const V: DirectorVideo[] = [
  { file: 0, url: 'https://s/p.mp4?t', mime: 'video/mp4', durationSec: 10, name: 'gemini_generated_video.mp4' },
  { file: 1, url: 'https://s/i.mov?t', mime: 'video/quicktime', durationSec: 1.9 },
  { file: 2, url: 'https://s/l.mov?t', mime: 'video/quicktime', durationSec: 2.1 },
];
const GOOD = {
  files: [{ file: 1, kind: 'presenter', summary: 'a man speaks' }, { file: 2, kind: 'intro', summary: 'opening' }, { file: 3, kind: 'logo', summary: 'logo' }],
  edit: 'assembly', intro: 2, body: 1, outro: 3, splitScreen: true, speaker: 1,
  reasoning: ['ინტრო პირველია, ლოგო ბოლოს.'], filled: ['თანმიმდევრობა მე ავირჩიე.'],
};

describe('the montage director (GG 2026-11-05 17:29Z)', () => {
  test('a checked decision: 1-based numbers become the file positions sent', () => {
    const d = parseDirector(JSON.stringify(GOOD), V, 'm')!;
    expect(d.roles).toEqual({ intro: 1, body: 0, outro: 2 });
    expect(d.splitScreen).toBe(true);
    expect(d.speaker).toBe(0);
    expect(d.files.map((f) => f.kind)).toEqual(['presenter', 'intro', 'logo']);
    expect(d.reasoning).toEqual(['ინტრო პირველია, ლოგო ბოლოს.']);
  });

  test('an assembly that leaves a video without a role, or makes the body its own bumper, is no assembly', () => {
    expect(parseDirector({ ...GOOD, outro: 0 }, V, 'm')!.roles).toBeNull();
    expect(parseDirector({ ...GOOD, intro: 1 }, V, 'm')!.roles).toBeNull();
    expect(parseDirector({ ...GOOD, body: 9 }, V, 'm')!.roles).toBeNull();
    // Two videos: one bumper opening and closing.
    expect(parseDirector({ ...GOOD, intro: 2, outro: 2 }, V.slice(0, 2), 'm')!.roles).toEqual({ intro: 1, body: 0, outro: 1 });
  });

  test('no reasoning or no JSON is no decision', () => {
    expect(parseDirector({ ...GOOD, reasoning: [] }, V, 'm')).toBeNull();
    expect(parseDirector('not json', V, 'm')).toBeNull();
    expect(parseDirector('```json\n' + JSON.stringify(GOOD) + '\n```', V, 'm')).not.toBeNull();
  });

  test('the prompt lists the files with their lengths and asks for reasoning in the user language', () => {
    const p = directorPrompt('დაამონტაჟე', V);
    expect(p).toContain('File 1 „gemini_generated_video.mp4“: 10.0 s; File 2: 1.9 s; File 3: 2.1 s');
    expect(p).toContain('IN THE LANGUAGE OF THE USER');
    expect(videoMime('https://x/a.MOV?t=1')).toBe('video/quicktime');
    expect(videoMime('https://x/a.mp4')).toBe('video/mp4');
  });

  test('one call with every video by reference, booked; a refused budget calls nothing', async () => {
    const calls: unknown[] = [];
    const booked: unknown[] = [];
    const deps = {
      model: () => 'gemini-x',
      budgetAllows: async () => true,
      book: async (u: unknown) => { booked.push(u); },
      generate: async (_m: string, body: unknown) => {
        calls.push(body);
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }) } as unknown as Response;
      },
    };
    const r = await directMontage(deps as never, { words: 'x', videos: V, userId: 'u' });
    expect(r.ok && r.decision.roles).toEqual({ intro: 1, body: 0, outro: 2 });
    const parts = (calls[0] as { contents: Array<{ parts: unknown[] }> }).contents[0]!.parts;
    expect(parts.slice(0, 3)).toEqual(V.map((v) => ({ fileData: { mimeType: v.mime, fileUri: v.url } })));
    expect(booked).toEqual([{ model: 'gemini-x', userId: 'u', inputTokens: 10, outputTokens: 5 }]);
    const refused = await directMontage({ ...deps, budgetAllows: async () => false } as never, { words: 'x', videos: V, userId: 'u' });
    expect(refused.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
