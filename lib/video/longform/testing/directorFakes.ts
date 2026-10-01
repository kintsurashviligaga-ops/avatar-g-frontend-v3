/**
 * lib/video/longform/testing/directorFakes.ts — TEST-ONLY: well-formed Director replies and a scripted generator,
 * shared by the rows round-trip test, the create-route tests and the end-to-end test. No LLM, no network.
 */
import type { DirectorCallOptions, DirectorGenerate } from '../director';
import { planActs } from '../plan';

export const ANA = 'a 30-year-old Georgian woman with shoulder-length black hair, hazel eyes, a red wool coat and gold hoop earrings';
export const GIO = 'a 35-year-old man with a short brown beard, round glasses, a navy denim jacket and a grey scarf';

export const bibleJson = (acts: number, extra: Record<string, unknown> = {}) => ({
  title: 'The Long Way Home',
  logline: 'Two old friends cross Georgia to reach a wedding on time.',
  characters: [
    { id: 'ana', name: 'Ana', role: 'lead', description: ANA },
    { id: 'gio', name: 'Gio', role: 'friend', description: GIO },
  ],
  look: { colorGrade: 'neutral filmic grade', lighting: 'soft natural daylight', cameraStyle: 'handheld documentary', palette: ['red', 'slate', 'gold'], negativePrompt: 'no lens flare, crowds' },
  arc: Array.from({ length: acts }, (_, i) => ({ title: `Part ${i + 1}`, summary: `Summary of part ${i + 1}`, beat: 'hope', closingImage: `Closing image ${i + 1}` })),
  music: { genre: 'folk', mood: 'warm', tempoBpm: 96, instrumentation: 'panduri and strings', direction: 'builds to a full ensemble' },
  ...extra,
});

/** n scenes for act `act`, numbered from `first` (1-based). */
export const actJson = (act: number, first: number, n: number) => ({
  scenes: Array.from({ length: n }, (_, i) => ({
    sceneNumber: first + i,
    characters: i % 3 === 2 ? ['gio'] : ['ana', 'gio'],
    location: `Road ${first + i}`,
    action: `scene ${first + i} action of act ${act}`,
    cameraShot: 'medium tracking',
    camera: { move: 'push_in', shot: 'medium', angle: 'eye_level', lens: 'standard' },
    lighting: 'golden hour',
    mood: 'tender',
    imagePrompt: `A woman in a red coat on road ${first + i}.`,
    sfxPrompt: 'wind, distant cars',
    dialogue: [],
    endState: `end of scene ${first + i}`,
  })),
});

export interface DirectorCall {
  prompt: string;
  opts: DirectorCallOptions;
}

/** A scripted generator: replies are consumed in order; each is a string, an object (JSON-encoded), null or an Error. */
export function fakeGenerator(replies: Array<unknown | ((p: string) => unknown)>): { generate: DirectorGenerate; calls: DirectorCall[] } {
  const calls: DirectorCall[] = [];
  const queue = [...replies];
  const generate: DirectorGenerate = async (prompt, opts) => {
    calls.push({ prompt, opts });
    const next = queue.shift();
    const value = typeof next === 'function' ? (next as (p: string) => unknown)(prompt) : next;
    if (value instanceof Error) throw value;
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
  };
  return { generate, calls };
}

/** Every reply a whole film of `seconds` needs: the bible, then one act per planActs entry. */
export function filmReplies(seconds: number): unknown[] {
  const acts = planActs(seconds / 8);
  return [bibleJson(acts.length), ...acts.map((a) => actJson(a.index, a.firstOrdinal + 1, a.sceneCount))];
}
