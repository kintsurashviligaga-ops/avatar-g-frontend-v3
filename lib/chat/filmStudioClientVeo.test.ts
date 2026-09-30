/** @jest-environment node */
/**
 * driveFilmStudio — the studio's Veo plan survives the trip to the server (docs/VEO_ENGINE.md §2).
 *
 * ⚠️ This is the exact seam that silently lost data before: DriveFilmOptions had no `masterScript` field, so the studio
 * passed the Master Production Script and the dispatch body simply never carried it — the server's master-script
 * casting, dialogue stems and Veo speech delegation were unreachable from the studio, with no error anywhere. The same
 * trap applies to the Veo plan (tier / format / reference mode / per-scene cameras) and to the director's per-scene
 * provenance: if the POST body drops them, the film renders on engine defaults and still "succeeds". And at the stitch,
 * the per-join transitions have to reach the assembler as `globalRender.transitions`, with a soft chain whenever the
 * list mixes cuts and dissolves (the assembler can only render a mixed list on its xfade chain).
 *
 * fetch is a scripted stub; the film is dispatched already `readyToStitch` so no poll interval ever elapses.
 */
import { driveFilmStudio, type DriveFilmOptions, type FilmStudioMatrix, type SceneMetaWire } from './filmStudioClient';
import type { VeoRenderOptions } from '@/lib/video/veoPlan';

const MASTER_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/master.mp4?token=m';

const VEO: VeoRenderOptions = {
  tier: 'fast',
  format: '4:5',
  referenceMode: 'reference',
  generateAudio: false,
  seedLock: false,
  enhancePrompt: true,
  negativePrompt: 'text overlays',
  scenes: [
    { camera: { move: 'push_in', intensity: 6, shot: 'close_up', angle: 'eye_level', lens: 'shallow_focus' }, transitionOut: 'cut' },
    { camera: { move: 'orbit', intensity: 5, shot: 'medium', angle: 'low', lens: 'standard' }, transitionOut: 'dissolve' },
    { camera: { move: 'static', intensity: 5, shot: 'wide', angle: 'high', lens: 'wide_angle' }, transitionOut: 'cut' },
    { camera: { move: 'aerial', intensity: 7, shot: 'extreme_wide', angle: 'birds_eye', lens: 'deep_focus' }, transitionOut: 'cut' },
  ],
};

const SCENE_META: SceneMetaWire[] = [
  { cameraShot: 'slow dolly push-in on her face', mood: 'tense', location: 'lighthouse stairwell', lighting: 'sodium practicals' },
  { cameraShot: 'low orbit around the lamp', mood: 'awe', location: 'lamp room', camera: { move: 'orbit', shot: 'medium', angle: 'low', lens: 'standard' } },
  { mood: 'calm', location: 'cliff top', lighting: 'blue hour' },
  { cameraShot: 'drone rises over the coast', location: 'coastline' },
];

const MASTER_SCRIPT = [
  '00:00–00:08 SCENE 1 — INT. LIGHTHOUSE STAIRWELL — DUSK',
  'NINO climbs the spiral stairs. NINO: "Someone has to keep it burning."',
  '00:08–00:16 SCENE 2 — INT. LAMP ROOM',
].join('\n');

function readyMatrix(): FilmStudioMatrix {
  return {
    sceneCount: 4,
    clipSec: 8,
    seed: 1234,
    storyboard: 'succeeded',
    clips: [1, 2, 3, 4].map((ordinal) => ({ ordinal, status: 'succeeded' as const, url: `https://x.supabase.co/clip-${ordinal}.mp4` })),
    stitch: 'pending',
    audio: 'succeeded',
    audioUrl: 'https://x.supabase.co/score.mp3',
    readyToStitch: true,
    statusTokenId: 'film_tok_1',
  };
}

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  calls = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body });
    if (url === '/api/chat/orchestrate') {
      return jsonResponse({ success: true, predictionId: 'film:union-token', predictionStatus: 'processing', metadata: { film: readyMatrix() } });
    }
    if (url === '/api/video/assemble') return jsonResponse({ url: MASTER_URL, musicUrl: null, scoreFallback: 'lyria' });
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
});

function run(extra: Partial<DriveFilmOptions> = {}) {
  return driveFilmStudio({
    prompt: 'A lighthouse keeper keeps the lamp burning through a storm',
    locale: 'en',
    pollIntervalMs: 1,
    veo: VEO,
    sceneMeta: SCENE_META,
    masterScript: `  ${MASTER_SCRIPT}  `,
    ...extra,
  });
}

const dispatchBody = () => calls.find((c) => c.url === '/api/chat/orchestrate')!.body;
const assembleBody = () => calls.find((c) => c.url === '/api/video/assemble')!.body;

describe('dispatch — POST /api/chat/orchestrate carries the Veo plan', () => {
  it('sends veo, sceneMeta and the (trimmed) masterScript verbatim', async () => {
    const res = await run();
    expect(res.ok).toBe(true);
    expect(res.masterUrl).toBe(MASTER_URL);

    const body = dispatchBody();
    expect(body.veo).toEqual(VEO);
    expect(body.sceneMeta).toEqual(SCENE_META);
    expect(body.masterScript).toBe(MASTER_SCRIPT);
    expect(body.serviceContext).toBe('video');
  });

  it('caps a runaway masterScript at 20 000 characters instead of 400-ing the whole render', async () => {
    await run({ masterScript: 'x'.repeat(25_000) });
    expect((dispatchBody().masterScript as string).length).toBe(20_000);
  });

  it('omits what the studio did not supply (no empty sceneMeta, no blank script, no veo key)', async () => {
    await run({ veo: undefined, sceneMeta: [], masterScript: '   ' });
    const body = dispatchBody();
    expect(body).not.toHaveProperty('veo');
    expect(body).not.toHaveProperty('sceneMeta');
    expect(body).not.toHaveProperty('masterScript');
  });
});

describe('assemble — per-join transitions reach the assembler as globalRender.transitions', () => {
  it('a mixed list travels comma-separated and switches the chain to the soft (xfade) join', async () => {
    await run({ joinTransitions: ['cut', 'dissolve', 'cut'] });
    const globalRender = assembleBody().globalRender as Record<string, unknown>;
    expect(globalRender.transitions).toBe('cut,dissolve,cut');
    // The assembler renders each 'cut' in a soft chain as a one-frame join; a hard 'cut' chain cannot dissolve at all.
    expect(globalRender.transition).toBe('crossfade');
  });

  it('a mixed list upgrades an explicit hard "cut" to the soft chain too', async () => {
    await run({ transition: 'cut', joinTransitions: ['fade_black', 'cut', 'cut'] });
    const globalRender = assembleBody().globalRender as Record<string, unknown>;
    expect(globalRender.transitions).toBe('fade_black,cut,cut');
    expect(globalRender.transition).toBe('crossfade');
  });

  it('an explicit soft transition is kept as the chain for a mixed list', async () => {
    await run({ transition: 'dissolve', joinTransitions: ['cut', 'dissolve', 'cut'] });
    const globalRender = assembleBody().globalRender as Record<string, unknown>;
    expect(globalRender.transitions).toBe('cut,dissolve,cut');
    expect(globalRender.transition).toBe('dissolve');
  });

  it('an all-cut list stays a hard cut chain', async () => {
    await run({ joinTransitions: ['cut', 'cut', 'cut'] });
    const globalRender = assembleBody().globalRender as Record<string, unknown>;
    expect(globalRender.transitions).toBe('cut,cut,cut');
    expect(globalRender.transition).toBe('cut');
  });

  it('no per-join list → no transitions key (the route keeps its film default)', async () => {
    await run();
    expect(assembleBody()).not.toHaveProperty('globalRender');
  });

  it('segments carry the film’s own clip length and the status token rides along (no double charge on a re-stitch)', async () => {
    await run({ joinTransitions: ['cut', 'dissolve', 'cut'] });
    const body = assembleBody();
    expect(body.segments).toEqual(readyMatrix().clips.map((c) => ({ url: c.url, durationSec: 8 })));
    expect(body.filmTokenId).toBe('film_tok_1');
  });
});
