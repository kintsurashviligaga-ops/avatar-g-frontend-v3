import Replicate from 'replicate';

let _client: Replicate | null = null;

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

  // Models with a ':' have an explicit version hash (owner/name:sha256).
  // Models without ':' are owner/name — use the `model` field instead.
  const hasVersion = modelId.includes(':');
  const body = hasVersion
    ? { version: modelId.split(':')[1], input }
    : { model: modelId, input };

  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'respond-async',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Replicate API ${res.status}: ${errText}`);
  }

  return res.json() as Promise<PredictionResult>;
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
