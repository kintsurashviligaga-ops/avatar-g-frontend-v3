import { createClient } from '@supabase/supabase-js';

export type McpPrincipal = { userId: string; token: string };

/**
 * Bootstrap authentication only: validate an explicitly supplied Supabase user
 * access token with Supabase Auth. This is not an MCP OAuth authorization server,
 * and does not establish that the token is audience-restricted to this resource.
 */
export async function authenticateMcp(request: Request): Promise<McpPrincipal | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s,]+)$/i.exec(header);
  const token = match?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  try {
    const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.id) return null;
    return { userId: data.user.id, token };
  } catch {
    return null;
  }
}
