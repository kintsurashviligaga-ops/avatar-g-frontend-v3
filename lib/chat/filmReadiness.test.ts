import {
  computeEditorReadiness,
  editorVerdict,
  editorSyncInstructions,
} from './filmReadiness';

const SUPABASE_OK = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc-role-key',
};

describe('computeEditorReadiness — stitch path selection', () => {
  it('chooses GPU when RunPod webhook + token are both present', () => {
    const r = computeEditorReadiness({
      RUNPOD_RENDER_WEBHOOK_URL: 'https://pod/render',
      RUNPOD_RENDER_WEBHOOK_TOKEN: 'tok',
      ...SUPABASE_OK,
    });
    expect(r.gpuConfigured).toBe(true);
    expect(r.stitchPath).toBe('gpu-runpod');
  });

  it('accepts RUNPOD_API_TOKEN as the alias token for GPU', () => {
    const r = computeEditorReadiness({
      RUNPOD_RENDER_WEBHOOK_URL: 'https://pod/render',
      RUNPOD_API_TOKEN: 'tok',
    });
    expect(r.gpuConfigured).toBe(true);
    expect(r.stitchPath).toBe('gpu-runpod');
  });

  it('falls back to CPU FFmpeg when the GPU webhook URL is missing its token', () => {
    const r = computeEditorReadiness({ RUNPOD_RENDER_WEBHOOK_URL: 'https://pod/render' });
    expect(r.gpuConfigured).toBe(false);
    expect(r.cpuFallbackAvailable).toBe(true);
    expect(r.stitchPath).toBe('cpu-ffmpeg');
  });

  it('treats whitespace-only env values as absent', () => {
    const r = computeEditorReadiness({
      RUNPOD_RENDER_WEBHOOK_URL: '   ',
      RUNPOD_API_TOKEN: '\t',
    });
    expect(r.gpuConfigured).toBe(false);
  });
});

describe('computeEditorReadiness — master hosting (the make-or-break gate)', () => {
  it('is hostable with NEXT_PUBLIC_SUPABASE_URL + service role key', () => {
    const r = computeEditorReadiness(SUPABASE_OK);
    expect(r.masterHostingConfigured).toBe(true);
    expect(r.canDeliverMaster).toBe(true); // CPU path always available
  });

  it('accepts SUPABASE_URL as the server-side url alias', () => {
    const r = computeEditorReadiness({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'svc',
    });
    expect(r.masterHostingConfigured).toBe(true);
  });

  it('is NOT hostable when only the URL is set (no service role key)', () => {
    const r = computeEditorReadiness({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' });
    expect(r.masterHostingConfigured).toBe(false);
    expect(r.canDeliverMaster).toBe(false);
  });

  it('cannot deliver a master when storage is unset even though a stitch can run', () => {
    const r = computeEditorReadiness({});
    expect(r.stitchPath).toBe('cpu-ffmpeg'); // a stitch CAN run
    expect(r.masterHostingConfigured).toBe(false);
    expect(r.canDeliverMaster).toBe(false); // ...but the output cannot be hosted
  });

  it('cannot deliver when neither a GPU nor the CPU binary is available', () => {
    const r = computeEditorReadiness(SUPABASE_OK, /* cpuBinaryBundled */ false);
    expect(r.cpuFallbackAvailable).toBe(false);
    expect(r.gpuConfigured).toBe(false);
    expect(r.canDeliverMaster).toBe(false);
  });
});

describe('computeEditorReadiness — failover + score rescue', () => {
  it('arms failover when REPLICATE_API_TOKEN is present', () => {
    const r = computeEditorReadiness({ REPLICATE_API_TOKEN: 'r8_xxx', ...SUPABASE_OK });
    expect(r.failoverAndScoreFallback).toBe(true);
  });

  it('reports no failover when the token is absent', () => {
    const r = computeEditorReadiness(SUPABASE_OK);
    expect(r.failoverAndScoreFallback).toBe(false);
  });
});

describe('editorVerdict', () => {
  it('flags an un-hostable master as a delivery blocker', () => {
    const v = editorVerdict(computeEditorReadiness({}));
    expect(v).toMatch(/^BLOCKED/);
    expect(v).toMatch(/master cannot be hosted/i);
  });

  it('flags total encoder loss distinctly', () => {
    const v = editorVerdict(computeEditorReadiness(SUPABASE_OK, false));
    expect(v).toMatch(/no stitch encoder/i);
  });

  it('reports READY with the chosen lane when fully wired', () => {
    const v = editorVerdict(
      computeEditorReadiness({
        RUNPOD_RENDER_WEBHOOK_URL: 'https://pod/render',
        RUNPOD_API_TOKEN: 'tok',
        REPLICATE_API_TOKEN: 'r8',
        ...SUPABASE_OK,
      }),
    );
    expect(v).toMatch(/^READY/);
    expect(v).toMatch(/GPU RunPod/);
    expect(v).toMatch(/rescue armed/);
  });
});

describe('editorSyncInstructions', () => {
  it('is empty when the editor leg is fully production-grade', () => {
    const r = computeEditorReadiness({
      RUNPOD_RENDER_WEBHOOK_URL: 'https://pod/render',
      RUNPOD_API_TOKEN: 'tok',
      REPLICATE_API_TOKEN: 'r8',
      ...SUPABASE_OK,
    });
    expect(editorSyncInstructions(r)).toEqual([]);
  });

  it('prioritizes master-hosting as the first actionable gap', () => {
    const instructions = editorSyncInstructions(computeEditorReadiness({}));
    expect(instructions[0]?.leg).toBe('master-hosting');
    // GPU is only ever an optional upgrade, never a hard blocker.
    expect(instructions.map((i) => i.leg)).toEqual(
      expect.arrayContaining(['master-hosting', 'failover-and-score', 'gpu-stitch']),
    );
  });
});
