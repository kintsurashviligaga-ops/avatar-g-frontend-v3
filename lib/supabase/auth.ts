import 'server-only';

import { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';

export const createAuthenticatedServerClient = createServerClient;

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice(7).trim() || null;
}

export async function getAuthenticatedUser(request?: NextRequest): Promise<User | null> {
  if (request) {
    const token = getBearerToken(request);
    if (token) {
      const adminSupabase = createServiceRoleClient();
      const { data, error } = await adminSupabase.auth.getUser(token);
      if (error || !data.user) {
        return null;
      }
      return data.user;
    }
  }

  const supabase = createAuthenticatedServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function requireAuthenticatedUser(request?: NextRequest): Promise<User> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }

  return user;
}
