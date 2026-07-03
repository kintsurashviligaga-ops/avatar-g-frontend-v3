import { computeNextVersion, buildPromotedConfig, canTransition, rollbackTargetVersion, OPEN_PROPOSAL_STATUS, hasConcreteChange } from './configVersioning';

describe('hasConcreteChange — never promote an empty config (audit HIGH regression)', () => {
  it('false for a diagnostic-only proposal (no params, no prompt) → approve must NOT promote', () => {
    expect(hasConcreteChange(null, null)).toBe(false);
    expect(hasConcreteChange({}, null)).toBe(false);
    expect(hasConcreteChange({}, '   ')).toBe(false);
    expect(hasConcreteChange(undefined, undefined)).toBe(false);
  });
  it('true when a concrete params object OR a non-blank prompt is present', () => {
    expect(hasConcreteChange({ cfg_scale: 0.6 }, null)).toBe(true);
    expect(hasConcreteChange(null, 'cinematic, high detail')).toBe(true);
    expect(hasConcreteChange({ x: 1 }, 'p')).toBe(true);
  });
});

describe('OPEN_PROPOSAL_STATUS — single source (audit regression)', () => {
  it("is 'proposed' (the value the optimizer writes) — approve AND reject must both filter on this", () => {
    // A prior bug: reject filtered 'pending' (never written) → silently no-op'd. Single-sourcing
    // this constant + using it in both approve/reject prevents that divergence.
    expect(OPEN_PROPOSAL_STATUS).toBe('proposed');
    expect(canTransition(OPEN_PROPOSAL_STATUS, 'approved')).toBe(true);
    expect(canTransition(OPEN_PROPOSAL_STATUS, 'rejected')).toBe(true);
  });
});

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
