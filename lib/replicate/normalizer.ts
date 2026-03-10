import { ServiceType } from './models';

export interface NormalizedOutput {
  success: boolean;
  service: ServiceType;
  model: string;
  outputType: 'image' | 'video' | 'audio' | 'text';
  url: string | null;
  thumbnailUrl?: string;
  text?: string;
  metadata: {
    predictionId: string;
    durationMs?: number;
    [key: string]: unknown;
  };
  error?: string;
}

export function normalizeOutput(
  service: ServiceType,
  model: string,
  outputType: 'image' | 'video' | 'audio' | 'text',
  predictionId: string,
  status: string,
  output: unknown,
  error?: string | null,
  metrics?: Record<string, unknown>,
): NormalizedOutput {
  if (status === 'failed' || error) {
    return {
      success: false,
      service,
      model,
      outputType,
      url: null,
      metadata: { predictionId },
      error: error || 'Generation failed',
    };
  }

  const url = extractUrl(output, outputType);
  const text = outputType === 'text' ? extractText(output) : undefined;

  return {
    success: !!url || !!text,
    service,
    model,
    outputType,
    url,
    text,
    thumbnailUrl: outputType === 'video' ? undefined : url || undefined,
    metadata: {
      predictionId,
      durationMs: metrics?.predict_time ? Number(metrics.predict_time) * 1000 : undefined,
    },
  };
}

function extractUrl(output: unknown, outputType: string): string | null {
  if (!output) return null;

  // String URL
  if (typeof output === 'string' && output.startsWith('http')) return output;

  // Array of URLs — take the first
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === 'string' && first.startsWith('http')) return first;
    // Some models return array of objects
    if (first && typeof first === 'object' && 'url' in first) return String((first as { url: string }).url);
  }

  // Object with url field
  if (typeof output === 'object' && output !== null) {
    const obj = output as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.audio === 'string') return obj.audio;
    if (typeof obj.output === 'string') return obj.output;
  }

  // For text output, no URL expected
  if (outputType === 'text') return null;

  return null;
}

function extractText(output: unknown): string | undefined {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return output.filter(s => typeof s === 'string').join('\n');
  if (typeof output === 'object' && output !== null) {
    const obj = output as Record<string, unknown>;
    if (typeof obj.caption === 'string') return obj.caption;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.output === 'string') return obj.output;
  }
  return undefined;
}
