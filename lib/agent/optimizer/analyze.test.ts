import { aggregateSignals, proposeOptimizations, DEFAULT_MIN_SAMPLES, type FeedbackRow } from './analyze';

const rows = (agent: string, model: string | null, actions: string[]): FeedbackRow[] =>
  actions.map((action) => ({ agent_type: agent, action, model }));

describe('agent optimizer analysis (STEP 5, pure)', () => {
  it('aggregates signal rates per (agent, model)', () => {
    const data = [
      ...rows('video', 'kling', ['share', 'download', 'download', 'discard']),
      ...rows('script', null, ['edit', 'edit']),
    ];
    const sig = aggregateSignals(data);
    const video = sig.find((s) => s.agentType === 'video')!;
    expect(video.samples).toBe(4);
    expect(video.positiveRate).toBe(0.75);
    expect(video.discardRate).toBe(0.25);
    expect(video.model).toBe('kling');
    const script = sig.find((s) => s.agentType === 'script')!;
    expect(script.model).toBeNull();
    expect(script.editRate).toBe(1);
  });

  it('proposes HIGH priority when discard rate is punishing', () => {
    const many = rows('video', 'kling', Array(20).fill('discard'));
    const props = proposeOptimizations(aggregateSignals(many));
    expect(props).toHaveLength(1);
    expect(props[0].priority).toBe('high');
    expect(props[0].kind).toBe('switch_model'); // model present → suggest switching
  });

  it('stays SILENT below the sample floor (no acting on noise)', () => {
    const few = rows('video', 'kling', Array(DEFAULT_MIN_SAMPLES - 1).fill('discard'));
    expect(proposeOptimizations(aggregateSignals(few))).toHaveLength(0);
  });

  it('does NOT propose for healthy agents', () => {
    const healthy = rows('image', 'flux', Array(20).fill('download'));
    expect(proposeOptimizations(aggregateSignals(healthy))).toHaveLength(0);
  });

  it('flags high edit-rate as a low-priority prompt revision', () => {
    // 50% edit, 50% download → score positive, discard 0, editRate 0.5
    const mixed = rows('script', null, [...Array(10).fill('edit'), ...Array(10).fill('download')]);
    const props = proposeOptimizations(aggregateSignals(mixed));
    expect(props).toHaveLength(1);
    expect(props[0].kind).toBe('revise_prompt');
    expect(props[0].priority).toBe('low');
  });

  it('SAFETY INVARIANT: every proposal is status "proposed" — never auto-applied', () => {
    const data = [
      ...rows('video', 'kling', Array(20).fill('discard')),
      ...rows('script', null, [...Array(10).fill('edit'), ...Array(10).fill('download')]),
      ...rows('audio', 'eleven', Array(15).fill('edit')),
    ];
    const props = proposeOptimizations(aggregateSignals(data));
    expect(props.length).toBeGreaterThan(0);
    expect(props.every((p) => p.status === 'proposed')).toBe(true);
    // there is deliberately no 'applied'/'auto' status in the type or output
    expect(props.some((p) => (p as { status: string }).status !== 'proposed')).toBe(false);
  });
});
