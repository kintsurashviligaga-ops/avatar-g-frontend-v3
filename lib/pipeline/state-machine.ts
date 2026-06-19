// Master Prompt §8 — durable state machine. Adapted to this stack: persistence uses the
// app's Upstash REST client (getRedisClient) instead of a long-lived ioredis socket, so it
// works on Vercel serverless. Every transition is validated and published for SSE/polling.
import 'server-only';
import { getRedisClient } from '@/lib/platform/redis';
import { logger } from './utils/logger';

export enum PipelineState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  DIRECTING = 'DIRECTING',
  PRODUCING_ASSETS = 'PRODUCING_ASSETS',
  GENERATING_VIDEO = 'GENERATING_VIDEO',
  SYNCING_LIPSYNC = 'SYNCING_LIPSYNC',
  QUALITY_CHECK = 'QUALITY_CHECK',
  COMPOSITING = 'COMPOSITING',
  DELIVERING = 'DELIVERING',
  COMPLETE = 'COMPLETE',
  RETRY_SCENE = 'RETRY_SCENE',
  FALLBACK = 'FALLBACK',
  FAILED = 'FAILED',
}

const VALID_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  [PipelineState.IDLE]: [PipelineState.ANALYZING],
  [PipelineState.ANALYZING]: [PipelineState.DIRECTING, PipelineState.FAILED],
  [PipelineState.DIRECTING]: [PipelineState.PRODUCING_ASSETS, PipelineState.FAILED],
  [PipelineState.PRODUCING_ASSETS]: [PipelineState.GENERATING_VIDEO, PipelineState.FAILED],
  [PipelineState.GENERATING_VIDEO]: [PipelineState.SYNCING_LIPSYNC, PipelineState.FAILED],
  [PipelineState.SYNCING_LIPSYNC]: [PipelineState.QUALITY_CHECK, PipelineState.FALLBACK, PipelineState.FAILED],
  [PipelineState.QUALITY_CHECK]: [PipelineState.COMPOSITING, PipelineState.RETRY_SCENE, PipelineState.FAILED],
  [PipelineState.RETRY_SCENE]: [PipelineState.GENERATING_VIDEO, PipelineState.SYNCING_LIPSYNC, PipelineState.FAILED],
  [PipelineState.FALLBACK]: [PipelineState.COMPOSITING, PipelineState.FAILED],
  [PipelineState.COMPOSITING]: [PipelineState.DELIVERING, PipelineState.FAILED],
  [PipelineState.DELIVERING]: [PipelineState.COMPLETE, PipelineState.FAILED],
  [PipelineState.COMPLETE]: [],
  [PipelineState.FAILED]: [],
};

export const PIPELINE_UPDATES_CHANNEL = 'pipeline_updates';

export class PipelineStateMachine {
  /** Validate + persist a transition, then publish for listeners. No-ops safely if Redis is absent. */
  async transition(jobId: string, newState: PipelineState, payload?: unknown): Promise<void> {
    const redis = getRedisClient();
    const current = redis ? await redis.hget<string>(`job:${jobId}`, 'state') : null;

    if (current && !this.isValidTransition(current as PipelineState, newState)) {
      throw new Error(`Invalid state transition from ${current} to ${newState}`);
    }

    const data: Record<string, string> = { state: newState, updatedAt: new Date().toISOString() };
    if (payload !== undefined) data.payload = JSON.stringify(payload);

    if (redis) {
      await redis.hset(`job:${jobId}`, data);
      await redis.expire(`job:${jobId}`, 60 * 60 * 24); // 24h TTL
      await redis.publish(PIPELINE_UPDATES_CHANNEL, JSON.stringify({ jobId, state: newState }));
    }
    logger.info({ jobId, state: newState }, 'pipeline.transition');
  }

  async getState(jobId: string): Promise<PipelineState | null> {
    const redis = getRedisClient();
    if (!redis) return null;
    const s = await redis.hget<string>(`job:${jobId}`, 'state');
    return (s as PipelineState) ?? null;
  }

  private isValidTransition(current: PipelineState, next: PipelineState): boolean {
    return VALID_TRANSITIONS[current]?.includes(next) ?? false;
  }
}
