export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'Login required to continue.';
    if (error.status === 404) return 'Requested resource was not found.';
    if (error.status >= 500) return 'Service is temporarily unavailable. Please retry.';
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Request failed. Please retry.';
}

type ApiEnvelope<T> = {
  status?: 'success' | 'error' | 'partial';
  data?: T;
  error?: string;
  code?: string;
};

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (error) {
    throw new ApiClientError('Network error. Check your internet connection and retry.', 0, 'NETWORK_ERROR', error);
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = await response.json() as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiClientError(
      payload?.error || `Request failed (${response.status})`,
      response.status,
      payload?.code,
      payload
    );
  }

  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data as T;
  }

  return (payload as T) ?? ({} as T);
}
