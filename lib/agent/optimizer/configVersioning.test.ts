import { computeNextVersion, buildPromotedConfig, canTransition, rollbackTargetVersion } from './configVersioning';

describe('agent_configs versioning (STEP 5 apply-side, pure)', () => {
  it('computeNextVersion = max+1, or 1 when empty', () => {
    expect(computeNextVersion([])).toBe(1);
    expect(computeNextVersion([{ version: 1 }, { version: 3 }, { version: 2 }])).toBe(4);
  });

  it('buildPromotedConfig makes the next version active, carrying params/prompt', () => {
    const row = buildPromotedConfig('kling', [{ version: 1 }, { version: 2 }], { params: { cfg_scale: 0.6 }, prompt: 'cinematic' });
    expect(row).toEqual({ target: 'kling', version: 3, is_active: true, params: { cfg_scale: 0.6 }, prompt: 'cinematic' });
  });

  it('buildPromotedConfig defaults params/prompt safely', () => {
    const row = buildPromotedConfig('elevenlabs', [], {});
    expect(row).toEqual({ target: 'elevenlabs', version: 1, is_active: true, params: {}, prompt: null });
  });

  it('only proposed → approved|rejected is allowed (terminal states are final)', () => {
    expect(canTransition('proposed', 'approved')).toBe(true);
    expect(canTransition('proposed', 'rejected')).toBe(true);
    expect(canTransition('approved', 'rejected')).toBe(false);
    expect(canTransition('rejected', 'approved')).toBe(false);
  });

  it('rollbackTargetVersion returns the currently-active version (the one that stays for rollback)', () => {
    expect(rollbackTargetVersion([{ version: 1, is_active: false }, { version: 2, is_active: true }])).toBe(2);
    expect(rollbackTargetVersion([{ version: 1, is_active: false }])).toBeNull();
  });
});
