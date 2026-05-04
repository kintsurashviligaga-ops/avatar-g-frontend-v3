import Replicate from 'replicate';

let _client: Replicate | null = null;
const _modelVersionCache = new Map<string, string>();

export function getReplicateClient(): Replicate {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN is not configured');
  if (!_client) _client = new Replicate({ auth: token });
  return _client;
}

export interface PredictionResult {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string;
  metrics?: { predict_time?: number };
}

export async function runReplicateModel(
  modelId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const client = getReplicateClient();
  const output = await client.run(modelId as `${string}/${string}:${string}`, { input });
  return output;
}

export async function createPrediction(
  modelId: string,
  input: Record<string, unknown>,
): Promise<PredictionResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN is not configured');

  const version = await resolveModelVersion(modelId, token);
  const body = { version, input };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'respond-async',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      return res.json() as Promise<PredictionResult>;
    }

    const errText = await res.text();
    if (res.status === 429 && attempt === 0) {
      const retryAfterMs = parseRetryAfterMs(errText, res.headers.get('retry-after'));
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      continue;
    }

    throw new Error(`Replicate API ${res.status}: ${errText}`);
  }

  throw new Error('Replicate API 429: retry exhausted');
}

export async function pollPrediction(predictionId: string): Promise<PredictionResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN is not configured');

  const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Replicate poll error ${res.status}`);
  return res.json() as Promise<PredictionResult>;
}

export async function pollUntilDone(
  predictionId: string,
  maxAttempts = 60,
  intervalMs = 2000,
): Promise<PredictionResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await pollPrediction(predictionId);
    if (result.status === 'succeeded' || result.status === 'failed' || result.status === 'canceled') {
      return result;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Prediction timed out');
}

async function resolveModelVersion(modelId: string, token: string): Promise<string> {
  if (modelId.includes(':')) {
    return modelId.split(':')[1] || modelId;
  }

  const cached = _modelVersionCache.get(modelId);
  if (cached) return cached;

  const [owner, name] = modelId.split('/');
  if (!owner || !name) {
    throw new Error(`Invalid Replicate model id: ${modelId}`);
  }

  const modelRes = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!modelRes.ok) {
    const errText = await modelRes.text();
    throw new Error(`Replicate model lookup ${modelRes.status}: ${errText}`);
  }

  const modelData = await modelRes.json() as {
    latest_version?: { id?: string };
  };

  const latest = modelData.latest_version?.id;
  if (!latest) {
    throw new Error(`No latest version for model ${modelId}`);
  }

  _modelVersionCache.set(modelId, latest);
  return latest;
}

function parseRetryAfterMs(errorText: string, retryAfterHeader: string | null): number {
  const fromHeader = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return Math.min(30_000, Math.max(1_000, Math.floor(fromHeader * 1000)));
  }

  const bodyMatch = errorText.match(/"retry_after"\s*:\s*(\d+)/i);
  const fromBody = bodyMatch ? Number(bodyMatch[1]) : NaN;
  if (Number.isFinite(fromBody) && fromBody > 0) {
    return Math.min(30_000, Math.max(1_000, Math.floor(fromBody * 1000)));
  }

  return 5_000;
}
