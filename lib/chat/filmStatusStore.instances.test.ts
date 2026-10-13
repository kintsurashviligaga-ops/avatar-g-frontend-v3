/**
 * @jest-environment node
 *
 * Defect 44 (found 2026-10-13, after the live Production E2E): the up-front payment marker of a film does not reach
 * /api/video/assemble when Redis cannot answer.
 *
 * A film is charged once, when it starts (lib/chat/filmComposite → recordFilmPaid), and /api/video/assemble skips its own
 * charge only when it finds that marker (getFilmPaid → isFilmPaidUpstream). The marker lives in Redis, with a process-local
 * Map as the fallback. On Vercel the chat route and /api/video/assemble are separate functions, so the Map of the one is
 * never the Map of the other. Production's Upstash host does not resolve (ENOTFOUND since 2026-09-25), so every read
 * falls through to the Map, the marker is missing, and a paying user's stitch is billed a second time.
 *
 * Two module registries stand in for the two functions; fetch rejects the way an unresolvable host does. Declared with
 * `it.failing` until the marker has a durable home (Upstash restored, or a database fallback): the day it does, these turn
 * red and `.failing` comes off.
 */
jest.mock('server-only', () => ({}));

type Store = typeof import('./filmStatusStore');

function freshInstance(): Store {
  let mod: Store | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./filmStatusStore') as Store;
  });
  return mod!;
}

const ENV = { ...process.env };
const realFetch = global.fetch;
afterEach(() => { process.env = { ...ENV }; global.fetch = realFetch; });

const PAYER = 'user-payer';
const TOKEN = 'f0123456789abcdef';

describe('defect 44: the film payment marker across two serverless functions', () => {
  it('within one function the marker is found (the case every existing test exercises)', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.KV_REST_API_URL;
    const one = freshInstance();
    await one.recordFilmPaid(TOKEN, { uid: PAYER, credits: 40, ref: 'film-start:1' });
    expect(one.isFilmPaidUpstream(null, await one.getFilmPaid(TOKEN), PAYER)).toBe(true);
  });

  it.failing('Production today: Upstash configured but its host does not resolve — assemble must still see the payment', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://unresolvable-upstash-host.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'not-a-real-token';
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }));
    const chat = freshInstance();
    const assemble = freshInstance();
    await chat.recordFilmPaid(TOKEN, { uid: PAYER, credits: 40, ref: 'film-start:1' });
    expect(assemble.isFilmPaidUpstream(null, await assemble.getFilmPaid(TOKEN), PAYER)).toBe(true);
  });

  it.failing('no Redis configured at all — assemble must still see the payment', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.KV_REST_API_URL;
    const chat = freshInstance();
    const assemble = freshInstance();
    await chat.recordFilmPaid(TOKEN, { uid: PAYER, credits: 40, ref: 'film-start:1' });
    expect(assemble.isFilmPaidUpstream(null, await assemble.getFilmPaid(TOKEN), PAYER)).toBe(true);
  });
});
