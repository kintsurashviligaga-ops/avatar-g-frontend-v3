/**
 * Avatar G - Unified AI Orchestration Layer
 * Handles service → provider → job lifecycle with consistent error handling
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAgent } from '@/lib/agents/registry';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface JobConfig {
  agentId: string;
  action: string;
  input: Record<string, unknown>;
  userId: string;
  costCredits: number;
}

export interface JobResult {
  jobId: string;
  status: JobStatus;
  output?: Record<string, unknown>;
  error?: string;
}

export interface ProviderConfig {
  name: string;
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  retryable: boolean;
  maxRetries: number;
}

/**
 * Create a new job in the database
 */
export async function createJob(config: JobConfig): Promise<string> {
  const supabase = createSupabaseServerClient();
  
  const agent = getAgent(config.agentId);
  if (!agent) {
    throw new OrchestrationError(`Unknown agent: ${config.agentId}`, 'UNKNOWN_AGENT');
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      owner_id: config.userId,
      agent_id: config.agentId,
      action: config.action,
      input: config.input,
      status: 'queued',
      cost_credits: config.costCredits,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Job creation error:', error);
    throw new OrchestrationError('Failed to create job', 'JOB_CREATE_FAILED');
  }

  return data.id;
}

/**
 * Update job status and output
 */
export async function updateJob(
  jobId: string,
  updates: {
    status?: JobStatus;
    output?: Record<string, unknown> | null;
    error?: string | null;
  }
): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from('jobs')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    console.error('Job update error:', error);
    throw new OrchestrationError('Failed to update job', 'JOB_UPDATE_FAILED');
  }
}

/**
 * Execute job with provider and retry logic
 */
export async function executeJob(
  jobId: string,
  provider: ProviderConfig,
  input: Record<string, unknown>
): Promise<JobResult> {
  let lastError: Error | null = null;
  let attempts = 0;
  const maxAttempts = provider.retryable ? provider.maxRetries + 1 : 1;

  // Mark as processing
  await updateJob(jobId, { status: 'processing' });

  while (attempts < maxAttempts) {
    attempts++;

    try {
      // Execute with timeout
      const output = await executeWithTimeout(
        () => provider.execute(input),
        120000 // 2 minute timeout
      );

      // Success
      await updateJob(jobId, {
        status: 'done',
        output,
        error: null,
      });

      return {
        jobId,
        status: 'done',
        output,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Job ${jobId} attempt ${attempts} failed:`, lastError);

      // If not retryable or last attempt, mark as error
      if (!provider.retryable || attempts >= maxAttempts) {
        await updateJob(jobId, {
          status: 'error',
          error: lastError.message,
        });

        return {
          jobId,
          status: 'error',
          error: lastError.message,
        };
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempts), 10000)));
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    jobId,
    status: 'error',
    error: lastError?.message || 'Unknown error',
  };
}

/**
 * Execute function with timeout
 */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    ),
  ]);
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<JobResult> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('jobs')
    .select('id, status, output, error')
    .eq('id', jobId)
    .single();

  if (error || !data) {
    throw new OrchestrationError('Job not found', 'JOB_NOT_FOUND');
  }

  return {
    jobId: data.id,
    status: data.status as JobStatus,
    output: data.output || undefined,
    error: data.error || undefined,
  };
}

/**
 * Custom orchestration error
 */
export class OrchestrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OrchestrationError';
  }
}

/**
 * Provider Registry
 * Maps agent actions to provider implementations
 */
export const PROVIDER_REGISTRY: Record<string, Record<string, ProviderConfig>> = {
  'music-studio': {
    generate: {
      name: 'Suno Music Generator',
      execute: async (input) => {
        // TODO: Implement actual Suno API call
        return {
          trackId: 'demo-track-id',
          status: 'completed',
          audioUrl: 'https://example.com/track.mp3',
        };
      },
      retryable: true,
      maxRetries: 2,
    },
  },
  'video-studio': {
    generate: {
      name: 'Runway Video Generator',
      execute: async (input) => {
        // TODO: Implement actual video generation API
        return {
          videoId: 'demo-video-id',
          status: 'completed',
          videoUrl: 'https://example.com/video.mp4',
        };
      },
      retryable: true,
      maxRetries: 2,
    },
  },
  'image-creator': {
    generate: {
      name: 'DALL-E Image Generator',
      execute: async (input) => {
        // TODO: Implement actual image generation API
        return {
          imageId: 'demo-image-id',
          status: 'completed',
          imageUrl: 'https://example.com/image.png',
        };
      },
      retryable: true,
      maxRetries: 3,
    },
  },
  'voice-lab': {
    clone: {
      name: 'ElevenLabs Voice Cloner',
      execute: async (input) => {
        // TODO: Implement actual voice cloning API
        return {
          voiceId: 'demo-voice-id',
          status: 'completed',
        };
      },
      retryable: false, // Voice cloning is expensive, don't retry
      maxRetries: 0,
    },
    synthesize: {
      name: 'ElevenLabs TTS',
      execute: async (input) => {
        // TODO: Implement actual TTS API
        return {
          audioId: 'demo-audio-id',
          status: 'completed',
          audioUrl: 'https://example.com/speech.mp3',
        };
      },
      retryable: true,
      maxRetries: 2,
    },
  },
  'chat': {
    message: {
      name: 'OpenAI Chat',
      execute: async (input) => {
        // TODO: Implement actual chat API
        return {
          messageId: 'demo-message-id',
          response: 'This is a demo response',
        };
      },
      retryable: true,
      maxRetries: 2,
    },
  },
};

/**
 * Get provider for agent action
 */
export function getProvider(agentId: string, action: string): ProviderConfig | null {
  return PROVIDER_REGISTRY[agentId]?.[action] || null;
}

/**
 * Orchestrate full job lifecycle
 */
export async function orchestrateJob(config: JobConfig): Promise<JobResult> {
  // Create job
  const jobId = await createJob(config);

  // Get provider
  const provider = getProvider(config.agentId, config.action);
  if (!provider) {
    await updateJob(jobId, {
      status: 'error',
      error: `No provider found for ${config.agentId}.${config.action}`,
    });
    throw new OrchestrationError(
      `No provider configured for ${config.agentId}.${config.action}`,
      'PROVIDER_NOT_FOUND'
    );
  }

  // Execute
  return executeJob(jobId, provider, config.input);
}
