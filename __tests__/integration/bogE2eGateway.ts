/**
 * The Supabase stand-in shared by the BOG end-to-end suites (bog-payments.e2e.test.ts, bog-sandbox.e2e.test.ts): a
 * 30-line gateway that maps /rest/v1 to a LOCAL PostgREST and answers /auth/v1/user for test bearer tokens
 * (`e2e-user-<uuid>`), so the routes' real auth path (Bearer → auth.getUser) runs. It listens on 127.0.0.1 only and
 * forwards only to the PostgREST it is given, which the runner scripts start on this machine.
 */
import http from 'node:http';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** A PostgREST JWT (role anon / service_role) signed with the local run's throwaway secret. */
export function hs256(secret: string, payload: Record<string, unknown>): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${b64url(createHmac('sha256', secret).update(`${head}.${body}`).digest())}`;
}

export interface SupabaseGateway {
  url: string;
  close(): Promise<void>;
}

/** `upstream` is the unpatched fetch: the suites wrap globalThis.fetch, and the gateway must not go through that. */
export async function startSupabaseGateway(postgrest: string, upstream: typeof fetch): Promise<SupabaseGateway> {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    if (req.url?.startsWith('/auth/v1/user')) {
      const tok = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
      const id = tok.startsWith('e2e-user-') ? tok.slice('e2e-user-'.length) : null;
      res.writeHead(id ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(id ? { id, aud: 'authenticated', role: 'authenticated', email: `${id}@test.local` } : { msg: 'invalid' }));
      return;
    }
    const target = `${postgrest}${(req.url ?? '').replace(/^\/rest\/v1/, '')}`;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && !['host', 'content-length', 'connection'].includes(k)) headers[k] = v;
    const up = await upstream(target, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const out = Buffer.from(await up.arrayBuffer());
    const outHeaders: Record<string, string> = {};
    up.headers.forEach((v, k) => {
      if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(k)) outHeaders[k] = v;
    });
    res.writeHead(up.status, outHeaders);
    res.end(out);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
