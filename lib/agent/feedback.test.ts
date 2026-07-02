import { toFeedbackRow } from './feedback-schema';

const UID = '11111111-1111-1111-1111-111111111111';
const AID = '22222222-2222-2222-2222-222222222222';

describe('agent feedback row mapping (STEP 3.5, pure)', () => {
  it('maps a valid payload to snake_case columns with null defaults', () => {
    const r = toFeedbackRow({ userId: UID, agentType: 'video', action: 'download' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      user_id: UID,
      asset_id: null,
      agent_type: 'video',
      action: 'download',
      params_snapshot: {},
      prompt_snapshot: null,
    });
  });

  it('carries through optional signal columns', () => {
    const r = toFeedbackRow({
      userId: UID, assetId: AID, agentType: 'script', action: 'remix',
      model: 'kling-v1.6-standard', latencyMs: 4200, costUsd: 0.35, success: true,
      paramsSnapshot: { aspect: '9:16' }, promptSnapshot: 'a hook',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({ asset_id: AID, model: 'kling-v1.6-standard', latency_ms: 4200, cost_usd: 0.35, success: true, params_snapshot: { aspect: '9:16' }, prompt_snapshot: 'a hook' });
  });

  it('rejects an unknown action / bad uuid without throwing', () => {
    expect(toFeedbackRow({ userId: UID, agentType: 'video', action: 'like' }).ok).toBe(false);
    expect(toFeedbackRow({ userId: 'nope', agentType: 'video', action: 'download' }).ok).toBe(false);
    expect(toFeedbackRow({ userId: UID, agentType: 'hologram', action: 'download' }).ok).toBe(false);
  });
});
