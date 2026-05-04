import {
  getNanoBananaCreditCost,
  type NanoBananaEndpoint,
  resolveNanoBananaEndpoint,
} from '@/lib/nanobanana/endpoints';

type JsonRecord = Record<string, unknown>;

const DEFAULT_BASE_URL = 'https://api.nanobananaapi.ai';
const DEFAULT_ENDPOINT_PATHS: Record<NanoBananaEndpoint, string> = {
  'task-details': '/api/v1/nanobanana/record-info',
  'text-to-image': '/api/v1/nanobanana/generate-2',
  'pro-1k2k': '/api/v1/nanobanana/generate-pro',
  'pro-4k': '/api/v1/nanobanana/generate-pro',
  'v2-1k': '/api/v1/nanobanana/generate-2',
  'v2-2k': '/api/v1/nanobanana/generate-2',
  'v2-4k': '/api/v1/nanobanana/generate-2',
};

export interface NanoBananaGenerateInput {
  prompt: string;
  endpoint?: unknown;
  aspectRatio?: string;
  style?: string;
  referenceImageDataUrl?: string;
  service?: string;
}

export interface NanoBananaGenerateResult {
  endpoint: NanoBananaEndpoint;
  credits: number;
  url?: string;
  text?: string;
  raw: unknown;
}

interface NanoRequestResult {
  ok: boolean;
  status: number;
  parsed: unknown;
  rawText: string;
}

interface TaskState {
  successFlag?: number;
  resultUrl?: string;
  errorMessage?: string;
}

function compactObject<T extends JsonRecord>(input: T): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveBaseUrl(): string {
  return (process.env.NANOBANANA_API_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, '');
}

function resolveEndpointPath(endpoint: NanoBananaEndpoint): string {
  const endpointPathKey = `NANOBANANA_PATH_${endpoint.toUpperCase().replace(/-/g, '_')}`;
  const configuredPath = process.env[endpointPathKey]?.trim();
  const path = configuredPath || DEFAULT_ENDPOINT_PATHS[endpoint];
  return path.startsWith('/') ? path : `/${path}`;
}

function composeUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith('/')) {
    return `${baseUrl}${path}`;
  }

  return `${baseUrl}/${path}`;
}

function resolveDirectApiUrl(): string | undefined {
  const directUrl = process.env.NANOBANANA_API_URL?.trim();
  return directUrl ? directUrl : undefined;
}

function withQuery(url: string, query: Record<string, string>): string {
  const searchParams = new URLSearchParams(query);
  return `${url}${url.includes('?') ? '&' : '?'}${searchParams.toString()}`;
}

function extractUrl(payload: unknown): string | undefined {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string') {
    return payload.startsWith('http://') || payload.startsWith('https://') || payload.startsWith('data:')
      ? payload
      : undefined;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractUrl(item);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as JsonRecord;
  const candidateKeys = [
    'url',
    'image',
    'image_url',
    'output',
    'output_url',
    'result_url',
    'generated_image',
    'generatedImage',
    'assetUrl',
    'asset_url',
    'resultImageUrl',
    'result_image_url',
    'originImageUrl',
    'origin_image_url',
  ];

  for (const key of candidateKeys) {
    const found = extractUrl(record[key]);
    if (found) {
      return found;
    }
  }

  const nestedKeys = ['data', 'result', 'response', 'prediction'];
  for (const key of nestedKeys) {
    const found = extractUrl(record[key]);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function extractText(payload: unknown): string | undefined {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string') {
    return payload.trim() ? payload : undefined;
  }

  if (Array.isArray(payload)) {
    const chunks = payload
      .map((item) => (typeof item === 'string' ? item : null))
      .filter((item): item is string => Boolean(item && item.trim()));
    return chunks.length > 0 ? chunks.join('\n') : undefined;
  }

  if (typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as JsonRecord;
  const candidateKeys = [
    'text',
    'message',
    'msg',
    'details',
    'task_details',
    'taskDetails',
    'summary',
    'error',
    'errorMessage',
    'error_message',
    'request_id',
    'requestId',
  ];
  for (const key of candidateKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  const nestedKeys = ['data', 'result', 'response'];
  for (const key of nestedKeys) {
    const nested = extractText(record[key]);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function extractTaskId(payload: unknown): string | undefined {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as JsonRecord;
  const directKeys = ['taskId', 'task_id', 'id'];

  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  const nestedKeys = ['data', 'result', 'response'];
  for (const key of nestedKeys) {
    const nested = extractTaskId(record[key]);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function normalizeTaskFlag(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function extractTaskState(payload: unknown): TaskState {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const root = payload as JsonRecord;
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as JsonRecord;

  return {
    successFlag: normalizeTaskFlag(data.successFlag ?? data.success_flag),
    resultUrl: extractUrl(data.response ?? data.result ?? data),
    errorMessage: extractText(data.errorMessage ?? data.error_message ?? data.error),
  };
}

function extractResolution(endpoint: NanoBananaEndpoint): '1K' | '2K' | '4K' | undefined {
  if (endpoint === 'pro-4k' || endpoint === 'v2-4k') return '4K';
  if (endpoint === 'pro-1k2k' || endpoint === 'v2-2k') return '2K';
  if (endpoint === 'text-to-image' || endpoint === 'v2-1k') return '1K';
  return undefined;
}

function extractImageUrls(referenceImageDataUrl?: string): string[] {
  if (!referenceImageDataUrl) {
    return [];
  }

  if (/^https?:\/\//i.test(referenceImageDataUrl)) {
    return [referenceImageDataUrl];
  }

  return [];
}

function taskDetailsSummary(taskId: string, state: TaskState): string {
  if (state.successFlag === 1) {
    return `Task ${taskId} completed successfully.`;
  }

  if (state.successFlag === 0) {
    return `Task ${taskId} is still generating.`;
  }

  if (state.successFlag === 2 || state.successFlag === 3) {
    return `Task ${taskId} failed${state.errorMessage ? `: ${state.errorMessage}` : '.'}`;
  }

  return `Task ${taskId} status is unavailable.`;
}

function extractTaskIdFromPrompt(prompt: string): string | undefined {
  const direct = prompt.trim();
  if (/^[a-zA-Z0-9_-]{6,}$/.test(direct)) {
    return direct;
  }

  const match = prompt.match(/([a-zA-Z0-9_-]{6,})/);
  return match?.[1];
}

async function requestNanoBanana(
  url: string,
  apiKey: string,
  method: 'GET' | 'POST',
  body?: JsonRecord,
): Promise<NanoRequestResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'x-api-key': apiKey,
  };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    cache: 'no-store',
  });

  const rawText = await response.text();
  let parsed: unknown = null;

  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = rawText;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    parsed,
    rawText,
  };
}

function buildRequestError(result: NanoRequestResult): string {
  return extractText(result.parsed)
    || (result.rawText ? result.rawText : undefined)
    || `NanoBanana request failed (${result.status})`;
}

async function pollTaskResult(baseUrl: string, apiKey: string, taskId: string): Promise<{ url?: string; text?: string; raw: unknown }> {
  const pollUrl = composeUrl(baseUrl, resolveEndpointPath('task-details'));
  const maxAttempts = parsePositiveInt(process.env.NANOBANANA_MAX_POLL_ATTEMPTS, 20);
  const pollIntervalMs = parsePositiveInt(process.env.NANOBANANA_POLL_INTERVAL_MS, 1500);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await requestNanoBanana(
      withQuery(pollUrl, { taskId }),
      apiKey,
      'GET',
    );

    if (!result.ok) {
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }
      throw new Error(buildRequestError(result));
    }

    const state = extractTaskState(result.parsed);

    if (state.successFlag === 1) {
      const outputUrl = state.resultUrl || extractUrl(result.parsed);
      const outputText = extractText(result.parsed) || `Task ${taskId} completed successfully.`;

      if (!outputUrl && !outputText) {
        throw new Error('NanoBanana task completed without output data');
      }

      return {
        url: outputUrl,
        text: outputText,
        raw: result.parsed,
      };
    }

    if (state.successFlag === 2 || state.successFlag === 3) {
      throw new Error(state.errorMessage || `NanoBanana task ${taskId} failed`);
    }

    const outputUrl = extractUrl(result.parsed);
    const outputText = extractText(result.parsed);
    if (outputUrl || outputText) {
      return {
        url: outputUrl,
        text: outputText,
        raw: result.parsed,
      };
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  throw new Error(`NanoBanana task ${taskId} timed out`);
}

function buildCreatePayload(endpoint: NanoBananaEndpoint, input: NanoBananaGenerateInput): JsonRecord {
  const imageUrls = extractImageUrls(input.referenceImageDataUrl);
  const resolution = extractResolution(endpoint);

  return compactObject({
    prompt: input.prompt,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    aspectRatio: input.aspectRatio,
    resolution,
    outputFormat: 'jpg',
    style: input.style,
  });
}

export async function generateNanoBananaImage(input: NanoBananaGenerateInput): Promise<NanoBananaGenerateResult> {
  const apiKey = process.env.NANOBANANA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('NANOBANANA_API_KEY is not configured');
  }

  const endpoint = resolveNanoBananaEndpoint(input.endpoint);
  const directUrl = resolveDirectApiUrl();
  const baseUrl = resolveBaseUrl();

  if (endpoint === 'task-details') {
    const taskId = extractTaskIdFromPrompt(input.prompt);
    if (!taskId) {
      return {
        endpoint,
        credits: getNanoBananaCreditCost(endpoint),
        text: 'Task details mode selected. Provide a NanoBanana task ID in your prompt to check status.',
        raw: { mode: 'task-details', taskId: null },
      };
    }

    const detailsUrl = directUrl || composeUrl(baseUrl, resolveEndpointPath('task-details'));
    const detailsResult = await requestNanoBanana(
      withQuery(detailsUrl, { taskId }),
      apiKey,
      'GET',
    );

    if (!detailsResult.ok) {
      throw new Error(buildRequestError(detailsResult));
    }

    const taskState = extractTaskState(detailsResult.parsed);
    const outputUrl = taskState.resultUrl || extractUrl(detailsResult.parsed);
    const outputText = extractText(detailsResult.parsed) || taskDetailsSummary(taskId, taskState);

    return {
      endpoint,
      credits: getNanoBananaCreditCost(endpoint),
      url: outputUrl,
      text: outputText,
      raw: detailsResult.parsed,
    };
  }

  const createUrl = directUrl || composeUrl(baseUrl, resolveEndpointPath(endpoint));
  const createPayload = buildCreatePayload(endpoint, input);
  const createResult = await requestNanoBanana(createUrl, apiKey, 'POST', createPayload);

  if (!createResult.ok) {
    throw new Error(buildRequestError(createResult));
  }

  const taskId = extractTaskId(createResult.parsed);
  const immediateUrl = extractUrl(createResult.parsed);
  const immediateText = extractText(createResult.parsed);

  if (!taskId) {
    if (immediateUrl || immediateText) {
      return {
        endpoint,
        credits: getNanoBananaCreditCost(endpoint),
        url: immediateUrl,
        text: immediateText,
        raw: createResult.parsed,
      };
    }

    throw new Error(extractText(createResult.parsed) || 'No message available');
  }

  const taskResult = await pollTaskResult(baseUrl, apiKey, taskId);

  if (!taskResult.url && !taskResult.text) {
    throw new Error('NanoBanana response did not include output data');
  }

  return {
    endpoint,
    credits: getNanoBananaCreditCost(endpoint),
    url: taskResult.url,
    text: taskResult.text,
    raw: {
      create: createResult.parsed,
      taskId,
      poll: taskResult.raw,
    },
  };
}