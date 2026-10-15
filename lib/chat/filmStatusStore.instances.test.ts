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
 * red and `.failing` comes off. The fix GG chose (2026-10-13 15:26Z) is a new Upstash store from Vercel → Storage, whose
 * KV_REST_API_* pair the code now prefers (lib/platform/upstashEnv); the passing test below pins that path.
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

  it('Upstash replaced through Vercel → Storage: the new KV_REST_API pair answers and the dead pair is ignored', async () => {
    // Production after the owner's 2026-10-13 choice: the dead hand-entered pair is still set, the Marketplace store adds
    // KV_REST_API_URL/TOKEN. One shared fake database stands in for the store both functions reach (lib/platform/upstashEnv).
    process.env.UPSTASH_REDIS_REST_URL = 'https://unresolvable-upstash-host.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'not-a-real-token';
    process.env.KV_REST_API_URL = 'https://new-store.upstash.test';
    process.env.KV_REST_API_TOKEN = 'kv-test-token';
    const db = new Map<string, string>();
    const hosts: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      hosts.push(new URL(url).host);
      if (!url.startsWith('https://new-store.upstash.test')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      // The client batches commands (POST /pipeline, an array of commands, an array of { result }) and asks for base64.
      const base64 = new Headers(init?.headers).get('upstash-encoding') === 'base64';
      const exec = ([cmd, key, value]: string[]) => {
        let result: string | null = 'OK';
        if (cmd.toLowerCase() === 'set') db.set(key, String(value));
        else if (cmd.toLowerCase() === 'get') result = db.get(key) ?? null;
        return { result: base64 && result !== null ? Buffer.from(result).toString('base64') : result };
      };
      const sent = JSON.parse(String(init?.body)) as string[] | string[][];
      const body = Array.isArray(sent[0]) ? (sent as string[][]).map(exec) : exec(sent as string[]);
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const chat = freshInstance();
    const assemble = freshInstance();
    await chat.recordFilmPaid(TOKEN, { uid: PAYER, credits: 40, ref: 'film-start:1' });
    expect(assemble.isFilmPaidUpstream(null, await assemble.getFilmPaid(TOKEN), PAYER)).toBe(true);
    expect(new Set(hosts)).toEqual(new Set(['new-store.upstash.test']));
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
