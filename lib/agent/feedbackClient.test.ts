import { agentTypeForKind } from './feedbackClient';

describe('agentTypeForKind (STEP 3.5, pure)', () => {
  it('maps UI media kinds to optimizer agent_type buckets', () => {
    expect(agentTypeForKind('image')).toBe('image');
    expect(agentTypeForKind('video')).toBe('video');
    expect(agentTypeForKind('audio')).toBe('audio');
    expect(agentTypeForKind('avatar')).toBe('video'); // avatar renders are videos
    expect(agentTypeForKind('text')).toBe('script'); // text = the script agent
  });
});
