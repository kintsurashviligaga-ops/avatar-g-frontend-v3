import 'server-only';

const MAX_BODY = 16 * 1024;

/** Read at most 16 KiB even if Content-Length is absent or dishonest. */
export async function formBody(req: Request): Promise<URLSearchParams | null> {
  if (((req.headers.get('content-type') ?? '').split(';', 1)[0] ?? '').trim().toLowerCase() !== 'application/x-www-form-urlencoded') return null;
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) return null;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export function unique(form: URLSearchParams, name: string): string | null {
  const values = form.getAll(name);
  return values.length === 1 && values[0] ? values[0] : null;
}

export function oauthError(error: string, status = 400): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="myavatar-mcp-oauth"' } : {}) } });
}
