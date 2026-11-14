/** @jest-environment node */
/** translateScene: the action/looks/sound go to English for the engine; lines never; music is never added. */
jest.mock('server-only', () => ({}));
jest.mock('../../admin/guard', () => ({ isAdminUser: jest.fn(() => false) }));
import { emptyScene, type DwProject } from './index';
import { translateScene } from './server';

const p: DwProject = {
  id: 'p', title: 't', logline: 'l', aspect: '9:16', resolution: '720p',
  characters: [{ id: 'n', name: 'ნინო', look: 'ქალი, წითელი პალტო', voice: 'female' }],
  scenes: [{ ...emptyScene('s1'), order: 1, action: 'ნინო შედის კაფეში', characterIds: ['n'], firstFrame: 'none', audio: { lines: [{ characterId: 'n', text: 'გამარჯობა!' }], ambience: '', effects: [], music: null } }],
  status: 'draft', version: 1,
};

it('English cards need no call', async () => {
  const llm = jest.fn();
  const en = { ...p, characters: [{ ...p.characters[0]!, name: 'Nino', look: 'woman, red coat' }], scenes: [{ ...p.scenes[0]!, action: 'Nino walks in', audio: { ...p.scenes[0]!.audio, lines: [] } }] };
  expect(await translateScene(en, en.scenes[0]!, llm)).toEqual({});
  expect(llm).not.toHaveBeenCalled();
});

it('translates action and looks, never sends the lines, and never adds music the card did not ask for', async () => {
  const llm = jest.fn(async () => JSON.stringify({ action: 'Nino walks into a café', camera: '', looks: { n: 'woman, red coat' }, ambience: '', effects: [], music: 'epic score' }));
  const out = await translateScene(p, p.scenes[0]!, llm);
  expect(out).toMatchObject({ action: 'Nino walks into a café', looks: { n: 'woman, red coat' } });
  expect(out.music).toBeUndefined();
  expect((llm.mock.calls[0] as unknown as [string])[0]).not.toContain('გამარჯობა!');
});

it('a miss or junk falls back to the user\'s own words', async () => {
  expect(await translateScene(p, p.scenes[0]!, async () => null)).toEqual({});
  expect(await translateScene(p, p.scenes[0]!, async () => 'not json')).toEqual({});
});
