/**
 * pipeline-stages tests — the pure reducer that turns EventBroker topics
 * into the Swarm Status Panel's display rows.
 */
import { initialProgress, applyEvent, STAGE_ORDER, stageLabel } from './pipeline-stages';
import { makeEvent } from './events';

describe('pipeline-stages reducer', () => {
  test('initial state: all six stages idle', () => {
    const s = initialProgress();
    expect(STAGE_ORDER).toHaveLength(6);
    expect(STAGE_ORDER.every(id => s.stages[id].status === 'idle')).toBe(true);
    expect(s.completed).toBe(false);
    expect(s.failed).toBe(false);
  });

  test('initiated → sanitize active', () => {
    const s = applyEvent(initialProgress('p1'), makeEvent('media.pipeline.initiated', 'p1', {}));
    expect(s.stages.sanitize.status).toBe('active');
  });

  test('forward chain marks prior done + next active', () => {
    let s = initialProgress('p1');
    s = applyEvent(s, makeEvent('media.pipeline.initiated', 'p1', {}));
    s = applyEvent(s, makeEvent('data.sanitized', 'p1', {}));
    expect(s.stages.sanitize.status).toBe('done');
    expect(s.stages.orchestrate.status).toBe('active');
    s = applyEvent(s, makeEvent('asset.layout.ready', 'p1', {}));
    expect(s.stages.orchestrate.status).toBe('done');
    expect(s.stages.script.status).toBe('active');
  });

  test('video.segments.ready carries fractional visual progress via scenesDone', () => {
    let s = initialProgress('p1');
    s = applyEvent(s, makeEvent('audio.segments.ready', 'p1', {})); // visual becomes active
    s = applyEvent(s, makeEvent('video.segments.ready', 'p1', { scenesDone: 3 }));
    // video.segments.ready marks visual done AND assemble active
    expect(s.stages.visual.status).toBe('done');
    expect(s.stages.assemble.status).toBe('active');
  });

  test('completed marks every stage done', () => {
    let s = initialProgress('p1');
    s = applyEvent(s, makeEvent('media.pipeline.initiated', 'p1', {}));
    s = applyEvent(s, makeEvent('pipeline.completed', 'p1', {}));
    expect(s.completed).toBe(true);
    expect(STAGE_ORDER.every(id => s.stages[id].status === 'done')).toBe(true);
  });

  test('failed marks the active stage failed', () => {
    let s = initialProgress('p1');
    s = applyEvent(s, makeEvent('media.pipeline.initiated', 'p1', {})); // sanitize active
    s = applyEvent(s, makeEvent('pipeline.failed', 'p1', {}));
    expect(s.failed).toBe(true);
    expect(s.stages.sanitize.status).toBe('failed');
  });

  test('labels localize', () => {
    expect(stageLabel('assemble', 'en')).toMatch(/Assemble/);
    expect(stageLabel('assemble', 'ka')).toMatch(/აწყობა/);
  });
});
