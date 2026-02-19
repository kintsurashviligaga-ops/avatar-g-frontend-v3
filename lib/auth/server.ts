/**
 * Server-side authentication utilities
 * Use for API routes and server components
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export { createSupabaseServerClient };

export interface AccessToken {
  sub: string; // User ID
  email?: string;
  role?: string;
}

/**
 * Get access token from server-side request
 */
export async function getAccessToken(): Promise<AccessToken | null> {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }

    return  {
      sub: user.id,
      email: user.email,
      role: user.user_metadata?.role || 'user',
    };
  } catch (error) {
    console.error('Failed to get access token:', error);
    return null;
  }
}

/**
 * Require authentication (throws if not authenticated)
 */
export async function requireAuth(): Promise<AccessToken> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Unauthorized');
  }
  return token;
}

/**
 * Get auth headers for server-side fetch requests
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('sb-access-token');
  
  if (!authCookie) {
    return {};
  }

  return {
    'Authorization': `Bearer ${authCookie.value}`,
  };
}
