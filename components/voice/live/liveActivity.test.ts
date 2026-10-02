/**
 * The call screen's activity feed: a search runs then shows its pages, tool steps run → done / failed / cancelled,
 * frames of one answer join one step, and the feed stays short.
 */
import { MAX_ACTIVITY, liveActivityReducer, newestFirst, sourceLabel, type LiveActivityAction, type LiveActivityItem } from './liveActivity';

const run = (actions: LiveActivityAction[], from: LiveActivityItem[] = []) => actions.reduce(liveActivityReducer, from);
const SRC = (n: number) => ({ title: `site${n}.ge`, uri: `https://site${n}.ge/a` });

describe('search', () => {
  test('searchStart → running with its queries; grounding → done with the pages; more frames join the same step', () => {
    let s = run([{ type: 'searchStart', queries: ['weather Tbilisi'] }]);
    expect(s).toEqual([{ id: 'search:1', kind: 'search', state: 'running', queries: ['weather Tbilisi'] }]);
    s = run([
      { type: 'searchStart', queries: ['weather Tbilisi', 'Tbilisi forecast'] },
      { type: 'grounding', queries: ['weather Tbilisi'], sources: [SRC(1)] },
      { type: 'grounding', queries: [], sources: [SRC(1), SRC(2)] },
    ], s);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ state: 'done', queries: ['weather Tbilisi', 'Tbilisi forecast'], sources: [SRC(1), SRC(2)] });
  });

  test('grounding with no searchStart seen is a step that is already done', () => {
    const s = run([{ type: 'grounding', queries: ['q'], sources: [SRC(1)] }]);
    expect(s[0]).toMatchObject({ kind: 'search', state: 'done', queries: ['q'], sources: [SRC(1)] });
  });

  test('the end of an answer closes its step: the next answer’s search is a new step', () => {
    const s = run([
      { type: 'searchStart', queries: ['a'] },
      { type: 'turnEnd' },
      { type: 'grounding', queries: ['b'], sources: [] },
    ]);
    expect(s.map((x) => [x.id, x.state, x.queries])).toEqual([['search:1', 'done', ['a']], ['search:2', 'done', ['b']]]);
  });
});

describe('tools', () => {
  test('running → done / failed; a cancelled call says so; a duplicate start is ignored', () => {
    const s = run([
      { type: 'toolStart', calls: [{ id: 'c1', name: 'prepare_generation' }, { id: 'c2', name: 'show_code' }] },
      { type: 'toolStart', calls: [{ id: 'c1', name: 'prepare_generation' }] },
      { type: 'toolDone', results: [{ id: 'c1', ok: true }] },
      { type: 'toolStart', calls: [{ id: 'c3', name: 'open_studio' }] },
      { type: 'toolCancel', ids: ['c3'] },
      { type: 'toolDone', results: [{ id: 'c2', ok: false }, { id: 'c3', ok: true }] },
    ]);
    expect(s.map((x) => [x.id, x.state])).toEqual([['c1', 'done'], ['c2', 'failed'], ['c3', 'cancelled']]);
  });
});

test('the feed keeps the newest few, newest first for display; reset empties it', () => {
  const s = run(Array.from({ length: MAX_ACTIVITY + 2 }, (_, i) => ({ type: 'toolStart', calls: [{ id: `c${i}`, name: 'show_code' }] }) as LiveActivityAction));
  expect(s).toHaveLength(MAX_ACTIVITY);
  expect(newestFirst(s)[0]!.id).toBe(`c${MAX_ACTIVITY + 1}`);
  expect(liveActivityReducer(s, { type: 'reset' })).toEqual([]);
});

test('a source shows its host, or Google’s title for a grounding redirect', () => {
  expect(sourceLabel({ title: 'x', uri: 'https://www.bbc.com/news/1' })).toBe('bbc.com');
  expect(sourceLabel({ title: 'weather.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc' })).toBe('weather.com');
  expect(sourceLabel({ title: '', uri: 'not a url' })).toBe('source');
});
