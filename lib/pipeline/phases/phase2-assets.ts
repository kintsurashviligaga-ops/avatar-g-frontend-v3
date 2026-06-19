// Master Prompt §5 / E.3 — Phase 2 Asset Production (parallel). Wall-clock collapses from
// sum-of-all to ~the longest single task (Udio) because everything independent runs at once.
// Graceful degradation: Promise.allSettled means one provider miss degrades that asset only;
// a Udio miss falls back to an ElevenLabs ambient bed so the film always has an audio track.
import 'server-only';
import type { AgentContext } from '../agents/base-agent';
import { NanoBananaAgent } from '../agents/nano-banana-agent';
import { ElevenLabsVoiceAgent } from '../agents/elevenlabs-voice-agent';
import { ElevenLabsSfxAgent } from '../agents/elevenlabs-sfx-agent';
import { UdioAgent } from '../agents/udio-agent';
import type { OrchestrationOutput } from '../schemas/orchestration-output.schema';
import { logger } from '../utils/logger';

export interface Phase2Assets {
  images: (string | null)[]; // 5 keyframe URLs (index 0 = scene 1)
  voices: (string | null)[]; // 5 dialogue clip URLs
  sfx: (string | null)[]; // 5 foley/SFX URLs (null = degraded to music-only)
  music: string | null; // continuous 30s score (or ambient-bed fallback)
  faceRef: string | null; // IP-Adapter identity anchor (scene-1 image)
}

export class Phase2AssetProducer {
  constructor(
    private readonly nano = new NanoBananaAgent(),
    private readonly voice = new ElevenLabsVoiceAgent(),
    private readonly sfx = new ElevenLabsSfxAgent(),
    private readonly udio = new UdioAgent(),
  ) {}

  async run(ctx: AgentContext, orchestration: OrchestrationOutput): Promise<Phase2Assets> {
    // 1) Pre-fetch the soundtrack (longest task) immediately; do NOT await yet.
    const musicPromise = this.udio
      .generateTrack(ctx, orchestration.globalMusicPrompt)
      .catch(async (err: unknown) => {
        logger.warn({ jobId: ctx.jobId, err: String(err) }, 'udio.fallback.ambient');
        return this.sfx.generateSfx({ ...ctx, sceneNumber: 0 }, `${orchestration.masterTheme}, continuous ambient bed`, 22);
      });

    // 2) Scene-1 image first → derive the IP-Adapter face anchor for the rest.
    const firstScene = orchestration.scenes[0];
    if (!firstScene) throw new Error('orchestration has no scenes');
    const scene1 = await this.nano.generateImage({ ...ctx, sceneNumber: 1 }, firstScene.cinematicPrompt);
    const faceRef = await this.nano.extractFaceEmbedding(ctx, scene1);

    // 3) Parallelize scenes 2-5 images (face-locked) + all 5 voices + all 5 SFX.
    const imageTasks = orchestration.scenes
      .slice(1)
      .map((s) => this.nano.generateImage({ ...ctx, sceneNumber: s.sceneNumber }, s.cinematicPrompt, { faceEmbeddingUrl: faceRef }));
    const voiceTasks = orchestration.scenes.map((s) =>
      this.voice.generateSpeech({ ...ctx, sceneNumber: s.sceneNumber }, s.dialogueScript),
    );
    const sfxTasks = orchestration.scenes.map((s) =>
      this.sfx.generateSfx({ ...ctx, sceneNumber: s.sceneNumber }, s.foleySfxDescription, 6),
    );

    const [restImages, voices, sfx, music] = await Promise.all([
      Promise.allSettled(imageTasks),
      Promise.allSettled(voiceTasks),
      Promise.allSettled(sfxTasks),
      musicPromise,
    ]);

    const images: (string | null)[] = [scene1.url, ...restImages.map((r) => (r.status === 'fulfilled' ? r.value.url : null))];
    const voiceUrls = voices.map((r) => (r.status === 'fulfilled' ? r.value : null));
    const sfxUrls = sfx.map((r) => (r.status === 'fulfilled' ? r.value : null));

    logger.info(
      {
        jobId: ctx.jobId,
        images: images.filter(Boolean).length,
        voices: voiceUrls.filter(Boolean).length,
        sfx: sfxUrls.filter(Boolean).length,
        music: music ? 1 : 0,
      },
      'phase2.complete',
    );

    return { images, voices: voiceUrls, sfx: sfxUrls, music: music ?? null, faceRef };
  }
}
