import { simulatePipeline, buildRouting, renderTrace, FOUNDER_VERIFICATION_GEL } from './pipeline-sim';

describe('E2E pipeline simulation — security & financial interception', () => {
  test('authenticated 0.00 ₾ user requesting a video is cleanly halted with a payment prompt', () => {
    const r = simulatePipeline({ prompt: 'make me a 30s cinematic film', action: 'video_film', balanceGel: 0, userEmail: 'user@example.com' });
    // eslint-disable-next-line no-console
    console.log('\n[SIM] 0.00 ₾ user · video_film\n' + renderTrace(r));
    expect(r.halted).toBe(true);
    expect(r.decision).toBe('halt_insufficient_balance');
    expect(r.routing).toBeNull();
    expect(r.paymentPrompt).toContain('2.00 ₾');
  });

  test('founder account exposes the active 275.00 ₾ refill/verification gate and is not halted', () => {
    const r = simulatePipeline({ prompt: 'founder live transaction pass', action: 'video_film', balanceGel: 0, userEmail: 'kintsurashviligaga@gmail.com' });
    // eslint-disable-next-line no-console
    console.log('\n[SIM] founder · video_film (0.00 ₾)\n' + renderTrace(r));
    expect(r.isFounder).toBe(true);
    expect(r.halted).toBe(false);
    expect(r.decision).toBe('founder_gate');
    expect(r.founderGateGel).toBe(275);
    expect(FOUNDER_VERIFICATION_GEL).toBe(275);
    expect(r.routing?.engine).toBe('hardware_gpu_render');
  });

  test('funded user proceeds to routing', () => {
    const r = simulatePipeline({ prompt: 'avatar reply', action: 'avatar', balanceGel: 10, userEmail: 'user@example.com' });
    expect(r.halted).toBe(false);
    expect(r.decision).toBe('proceed');
    expect(r.routing?.engine).toBe('hardware_gpu_render');
  });

  test('free chat (0 ₾ cost) always proceeds with no external engine', () => {
    const r = simulatePipeline({ prompt: 'hello', action: 'chat', balanceGel: 0, userEmail: 'user@example.com' });
    expect(r.halted).toBe(false);
    expect(r.decision).toBe('proceed');
    expect(r.routing).toBeNull();
  });
});

describe('E2E output routing — external agent grids', () => {
  test('video_film → RunPod hardware_gpu_render { prompt, totalDurationSec }', () => {
    const p = buildRouting('video_film', 'a city flythrough');
    expect(p?.engine).toBe('hardware_gpu_render');
    expect(p?.params).toMatchObject({ prompt: 'a city flythrough', totalDurationSec: 30 });
  });

  test('voice_tts → ElevenLabs synthesis_voice_ka { text, locale: ka }', () => {
    const p = buildRouting('voice_tts', 'გამარჯობა');
    expect(p?.engine).toBe('synthesis_voice_ka');
    expect(p?.params).toMatchObject({ text: 'გამარჯობა', locale: 'ka' });
  });

  test('geometry_3d → Agent N 3D spatial estimator', () => {
    const p = buildRouting('geometry_3d', 'estimate this room');
    expect(p?.engine).toBe('agent_n_3d');
    expect(p?.params).toMatchObject({ mode: '3d_spatial_estimate' });
  });
});
