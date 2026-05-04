import { setTimeout as delay } from 'timers/promises';

export type UdioTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface UdioGenerationInput {
  prompt: string;
  lyrics?: string;
  style?: string;
  title?: string;
  genre?: string;
  mood?: string;
  styleTags?: string[];
  negativeTags?: string[];
  model?: string;
  makeInstrumental?: boolean;
  callbackUrl?: string;
}

export interface UdioStartResult {
  workId: string;
  model: string;
  raw: unknown;
}

export interface UdioStatusResult {
  workId: string;
  status: UdioTaskStatus;
  audioUrl?: string;
  imageUrl?: string;
  message?: string;
  rawStatus?: string;
  raw: unknown;
}

interface WaitOptions {
  maxAttempts?: number;
  pollIntervalMs?: number;
}

const DEFAULT_UDIO_BASE_URL = 'https://udioapi.pro';
const DEFAULT_UDIO_GENERATE_PATH = '/api/v2/generate';
const DEFAULT_UDIO_FEED_PATH = '/api/v2/feed';
const DEFAULT_UDIO_MODEL = 'chirp-v4-5';

function getUdioApiKey(): string {
  const key = process.env.UDIO_API_KEY?.trim();
  if (!key) {
    throw new Error('UDIO_API_KEY is not configured');
  }
  return key;
}

function resolveBaseUrl(): string {
  const raw = (process.env.UDIO_API_URL || process.env.UDIO_API_BASE_URL || DEFAULT_UDIO_BASE_URL).trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

function resolvePath(raw: string | undefined, fallback: string): string {
  const value = (raw || fallback).trim();
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function toUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return `${resolveBaseUrl()}${pathOrUrl}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractMessage(payload: unknown): string | undefined {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (Array.isArray(payload)) {
    const messages = payload
      .map((item) => extractMessage(item))
      .filter((item): item is string => Boolean(item && item.trim()));
    return messages.length ? messages.join('\n') : undefined;
  }

  const record = asRecord(payload);
  if (!record) {
    return undefined;
  }

  const directKeys = ['message', 'msg', 'error', 'error_message', 'fail_message', 'detail'];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  const nestedKeys = ['data', 'result', 'response'];
  for (const key of nestedKeys) {
    const nested = extractMessage(record[key]);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function joinParts(parts: Array<string | undefined>): string | undefined {
  const normalized = parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0);

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.join(', ');
}

function normalizeTagList(value: string[] | undefined): string | undefined {
  const normalized = (value || [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized.join(', ') : undefined;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }
  return false;
}

function extractWorkId(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;

  const direct = record.workId;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  const data = asRecord(record.data);
  if (!data) return null;

  const candidates = [data.task_id, data.workId, data.work_id, data.id];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function extractAudioUrl(payload: unknown): string | undefined {
  const record = asRecord(payload);
  if (!record) return undefined;

  const direct = record.audio_url;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  return undefined;
}

function extractImageUrl(payload: unknown): string | undefined {
  const record = asRecord(payload);
  if (!record) return undefined;

  const direct = record.image_url ?? record.image_large_url;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  return undefined;
}

function parseFeed(payload: unknown, workId: string): UdioStatusResult {
  const root = asRecord(payload) || {};
  const data = asRecord(root.data) || root;
  const responseData = Array.isArray(data.response_data)
    ? data.response_data.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];

  const firstAudio = responseData
    .map((item) => extractAudioUrl(item))
    .find((item): item is string => Boolean(item));

  const firstImage = responseData
    .map((item) => extractImageUrl(item))
    .find((item): item is string => Boolean(item));

  const rawStatus = responseData
    .map((item) => (typeof item.status === 'string' ? item.status : ''))
    .find((item) => item.length > 0);

  const failMessage = responseData
    .map((item) => extractMessage(item.fail_message ?? item.error_message ?? item.error))
    .find((item): item is string => Boolean(item));

  const topLevelFailure = extractMessage(root.error ?? root.error_message ?? root.fail_message);
  const failure = failMessage || topLevelFailure;

  if (failure) {
    return {
      workId,
      status: 'failed',
      message: failure,
      rawStatus,
      raw: payload,
    };
  }

  if (firstAudio) {
    return {
      workId,
      status: 'succeeded',
      audioUrl: firstAudio,
      imageUrl: firstImage,
      message: 'Music generation completed successfully.',
      rawStatus,
      raw: payload,
    };
  }

  const info = extractMessage(data.extra_message ?? root.message);

  return {
    workId,
    status: 'processing',
    message: info || 'Music generation is still processing.',
    rawStatus,
    raw: payload,
  };
}

function buildGenerateBody(input: UdioGenerationInput): Record<string, unknown> {
  const model = (input.model || process.env.UDIO_MODEL || DEFAULT_UDIO_MODEL).trim();
  const makeInstrumental = toBoolean(input.makeInstrumental);

  const style = joinParts([
    input.style,
    input.genre,
    input.mood,
    ...(input.styleTags || []),
  ]);

  const body: Record<string, unknown> = {
    model,
    make_instrumental: makeInstrumental,
  };

  if (input.callbackUrl?.trim()) {
    body.callback_url = input.callbackUrl.trim();
  } else if (process.env.UDIO_CALLBACK_URL?.trim()) {
    body.callback_url = process.env.UDIO_CALLBACK_URL.trim();
  }

  const customPrompt = input.lyrics?.trim() || (input.prompt?.trim() || '');

  if (input.lyrics?.trim()) {
    body.prompt = customPrompt;
  } else {
    body.gpt_description_prompt = customPrompt;
  }

  if (style) {
    body.style = style;
  }

  const title = input.title?.trim();
  if (title) {
    body.title = title;
  }

  const negativeTags = normalizeTagList(input.negativeTags);
  if (negativeTags) {
    body.tags = negativeTags;
  }

  return body;
}

export async function startUdioGeneration(input: UdioGenerationInput): Promise<UdioStartResult> {
  const apiKey = getUdioApiKey();
  const path = resolvePath(process.env.UDIO_GENERATE_PATH, DEFAULT_UDIO_GENERATE_PATH);
  const url = toUrl(path);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildGenerateBody(input)),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractMessage(payload) || `Udio generation failed (${response.status})`);
  }

  const workId = extractWorkId(payload);
  if (!workId) {
    throw new Error('Udio did not return workId/task_id');
  }

  return {
    workId,
    model: (input.model || process.env.UDIO_MODEL || DEFAULT_UDIO_MODEL).trim(),
    raw: payload,
  };
}

export async function getUdioGenerationStatus(workId: string): Promise<UdioStatusResult> {
  const apiKey = getUdioApiKey();
  const path = resolvePath(process.env.UDIO_FEED_PATH, DEFAULT_UDIO_FEED_PATH);
  const baseUrl = toUrl(path);
  const separator = baseUrl.includes('?') ? '&' : '?';
  const url = `${baseUrl}${separator}workId=${encodeURIComponent(workId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = extractMessage(payload) || `Udio feed failed (${response.status})`;
    return {
      workId,
      status: 'failed',
      message,
      raw: payload,
    };
  }

  return parseFeed(payload, workId);
}

export async function waitForUdioGeneration(
  workId: string,
  options: WaitOptions = {},
): Promise<UdioStatusResult> {
  const configuredMaxAttempts = Number.parseInt(process.env.UDIO_MAX_POLL_ATTEMPTS || '', 10);
  const configuredPollInterval = Number.parseInt(process.env.UDIO_POLL_INTERVAL_MS || '', 10);

  const maxAttempts = options.maxAttempts
    ?? (Number.isFinite(configuredMaxAttempts) && configuredMaxAttempts > 0 ? configuredMaxAttempts : 40);
  const pollIntervalMs = options.pollIntervalMs
    ?? (Number.isFinite(configuredPollInterval) && configuredPollInterval > 0 ? configuredPollInterval : 5000);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await getUdioGenerationStatus(workId);

    if (status.status === 'succeeded' || status.status === 'failed') {
      return status;
    }

    if (attempt < maxAttempts - 1) {
      await delay(pollIntervalMs);
    }
  }

  return {
    workId,
    status: 'failed',
    message: 'Udio generation timed out',
    raw: null,
  };
}

export async function generateUdioTrack(
  input: UdioGenerationInput,
  options: WaitOptions = {},
): Promise<UdioStatusResult> {
  const started = await startUdioGeneration(input);
  return waitForUdioGeneration(started.workId, options);
}
