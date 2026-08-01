/** @jest-environment node */
import { requireAuthForGeneration, AUTH_REQUIRED_CODE } from './requireAuthForGeneration';

describe('no session, no generation', () => {
  it.each([[null], [undefined], ['']])('blocks %p with a 401', async (uid) => {
    const g = requireAuthForGeneration(uid as string | null);
    expect(g.userId).toBeNull();
    expect(g.response).not.toBeNull();
    expect(g.response!.status).toBe(401);
    const body = await g.response!.json();
    expect(body.code).toBe(AUTH_REQUIRED_CODE);
  });

  it('the message is human-readable, not a machine code — it can reach the screen', async () => {
    const body = await requireAuthForGeneration(null).response!.json();
    expect(body.message).toMatch(/sign in/i);
    expect(body.message).not.toBe(AUTH_REQUIRED_CODE);
  });
});

describe('a real session passes through untouched', () => {
  it('returns the id and no response, so the route continues', () => {
    const g = requireAuthForGeneration('user-123');
    expect(g.userId).toBe('user-123');
    expect(g.response).toBeNull();
  });
});
