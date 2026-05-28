import 'server-only';

type JsonRecord = Record<string, unknown>;

export type WorldLabsOutput = {
  spatialLink: string | null;
  glbUrl: string | null;
  previewImageUrl: string | null;
  taskId: string | null;
  status: string | null;
  message: string | null;
  creditsRemaining: number | null;
  adminAlertTriggered: boolean;
  raw: unknown;
};

function getWorldLabsApiKey(): string {
  const direct = String(process.env.WORLDLABS_API_KEY || '').trim();
  if (direct) {
    return direct;
  }

  throw new Error('WORLDLABS_API_KEY is not configured');
}

const WORLDLABS_GENERATE_PATH = '/v1/worlds/generate';

function getWorldLabsEndpoint(): string {
  const raw = String(process.env.WORLDLABS_API_URL || '').trim();
  if (!raw) return `https://api.worldlabs.ai${WORLDLABS_GENERATE_PATH}`;

  // A common misconfiguration is setting WORLDLABS_API_URL to just the host
  // (e.g. https://api.worldlabs.ai) with no generation route, which yields a
  // provider "no Route matched" error. Append the canonical suffix when the
  // configured value carries no path of its own.
  try {
    const u = new URL(raw);
    if (u.pathname === '' || u.pathname === '/') {
      return `${raw.replace(/\/+$/, '')}${WORLDLABS_GENERATE_PATH}`;
    }
  } catch {
    /* not a full URL — fall through and use as-is */
  }
  return raw;
}

function parseDataUrl(value: string): { mimeType: string; bytes: Buffer } {
  const source = String(value || '').trim();
  const match = source.match(/^data:([^;,]+)?;base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !match[2]) {
    throw new Error('Invalid image payload');
  }

  const mimeType = String(match[1] || 'image/jpeg').trim() || 'image/jpeg';
  const bytes = Buffer.from(match[2], 'base64');
  return { mimeType, bytes };
}

function normalizeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function findFirstStringByKeys(payload: unknown, keys: readonly string[]): string | null {
  const pending: unknown[] = [payload];
  const keySet = new Set(keys.map((key) => key.toLowerCase()));

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        pending.push(item);
      }
      continue;
    }

    for (const [rawKey, rawValue] of Object.entries(current as JsonRecord)) {
      if (keySet.has(rawKey.toLowerCase())) {
        const value = normalizeValue(rawValue);
        if (value) {
          return value;
        }
      }

      if (rawValue && typeof rawValue === 'object') {
        pending.push(rawValue);
      }
    }
  }

  return null;
}

function findFirstUrl(payload: unknown, predicates: Array<(value: string, key: string) => boolean>): string | null {
  const pending: unknown[] = [payload];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        pending.push(item);
      }
      continue;
    }

    for (const [rawKey, rawValue] of Object.entries(current as JsonRecord)) {
      const value = normalizeValue(rawValue);
      if (value.startsWith('http://') || value.startsWith('https://')) {
        for (const predicate of predicates) {
          if (predicate(value, rawKey.toLowerCase())) {
            return value;
          }
        }
      }

      if (rawValue && typeof rawValue === 'object') {
        pending.push(rawValue);
      }
    }
  }

  return null;
}

function findFirstNumberByKeys(payload: unknown, keys: readonly string[]): number | null {
  const raw = findFirstStringByKeys(payload, keys);
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function triggerLowCreditsAlert(input: { creditsRemaining: number; endpoint: string }): Promise<boolean> {
  const threshold = Number(process.env.WORLDLABS_LOW_CREDITS_THRESHOLD || 300);
  const effectiveThreshold = Number.isFinite(threshold) ? Math.max(0, threshold) : 300;
  if (input.creditsRemaining > effectiveThreshold) {
    return false;
  }

  const message = `[worldlabs] low credits: ${input.creditsRemaining} remaining (threshold ${effectiveThreshold})`;
  console.warn(message);

  const webhook = String(process.env.WORLDLABS_ADMIN_ALERT_WEBHOOK_URL || '').trim();
  if (!webhook) {
    return true;
  }

  const response = await fetch(webhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'myavatar.ge',
      channel: 'interior-worldlabs',
      severity: 'warning',
      message,
      creditsRemaining: input.creditsRemaining,
      endpoint: input.endpoint,
      timestamp: new Date().toISOString(),
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`WorldLabs admin alert webhook failed (${response.status})`);
  }

  return true;
}

function parseWorldLabsResponse(payload: unknown): Omit<WorldLabsOutput, 'adminAlertTriggered'> {
  const spatialLink = findFirstStringByKeys(payload, [
    'spatial_link',
    'interactive_3d_web_link',
    'world_link',
    'world_url',
    'viewer_url',
    'embed_url',
  ]) || findFirstUrl(payload, [
    (value, key) => key.includes('spatial') || key.includes('viewer') || key.includes('world') || key.includes('embed'),
  ]);

  const glbUrl = findFirstStringByKeys(payload, [
    'glb_mesh',
    'glb_url',
    'mesh_url',
    'model_url',
    'download_url',
  ]) || findFirstUrl(payload, [
    (value, key) => key.includes('glb') || key.includes('mesh') || value.toLowerCase().includes('.glb'),
  ]);

  const previewImageUrl = findFirstStringByKeys(payload, [
    'preview_image',
    'preview_image_url',
    'thumbnail_url',
    'image_url',
  ]) || findFirstUrl(payload, [
    (value, key) => key.includes('thumbnail') || key.includes('preview') || /\.(png|jpe?g|webp)(\?|$)/i.test(value),
  ]);

  const taskId = findFirstStringByKeys(payload, ['task_id', 'id', 'job_id', 'generation_id']);
  const status = findFirstStringByKeys(payload, ['status', 'state']);
  const message = findFirstStringByKeys(payload, ['message', 'detail', 'error', 'reason']);
  const creditsRemaining = findFirstNumberByKeys(payload, [
    'credits_remaining',
    'remaining_credits',
    'credits',
    'balance',
  ]);

  return {
    spatialLink,
    glbUrl,
    previewImageUrl,
    taskId,
    status,
    message,
    creditsRemaining,
    raw: payload,
  };
}

export async function generateWorldLabsInterior(input: {
  imageDataUrl: string;
  prompt: string;
  filename?: string;
}): Promise<WorldLabsOutput> {
  const apiKey = getWorldLabsApiKey();
  const endpoint = getWorldLabsEndpoint();
  const { mimeType, bytes } = parseDataUrl(input.imageDataUrl);
  const binary = Uint8Array.from(bytes);

  const formData = new FormData();
  formData.append('input_image', new Blob([binary.buffer], { type: mimeType }), input.filename || 'interior-input.jpg');
  formData.append('prompt', String(input.prompt || '').trim());
  formData.append('output_type', 'interactive_3d_web_link');
  formData.append('output_type', 'glb_mesh');
  formData.append('output_types', JSON.stringify(['interactive_3d_web_link', 'glb_mesh']));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    cache: 'no-store',
  });

  const rawText = await response.text();
  let payload: unknown = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as unknown;
    } catch {
      payload = { message: rawText };
    }
  }

  if (!response.ok) {
    const errorMessage = parseWorldLabsResponse(payload).message || `World Labs request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  const parsed = parseWorldLabsResponse(payload);
  if (!parsed.spatialLink && !parsed.glbUrl) {
    throw new Error('World Labs response did not include spatial_link or glb_mesh URL');
  }

  let adminAlertTriggered = false;
  if (typeof parsed.creditsRemaining === 'number') {
    adminAlertTriggered = await triggerLowCreditsAlert({
      creditsRemaining: parsed.creditsRemaining,
      endpoint,
    });
  }

  return {
    ...parsed,
    adminAlertTriggered,
  };
}
