/**
 * Client-side authentication utilities
 * SECURE: Uses official Supabase session management instead of localStorage hacks
 */

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * Get Supabase client for client components
 * Uses official auth helpers with proper session management
 */
export function getSupabaseClient() {
  return createClientComponentClient();
}

/**
 * SECURE: Get access token from Supabase session
 * Replaces unsafe localStorage('supabase.auth.token') pattern
 * 
 * @returns Promise<string | null> - Access token or null if not authenticated
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Error getting auth session:', error.message);
      return null;
    }
    
    return session?.access_token || null;
  } catch (error) {
    console.error('Failed to get access token:', error);
    return null;
  }
}

/**
 * Get authenticated fetch headers
 * Automatically includes Authorization Bearer token if user is authenticated
 * 
 * @param additionalHeaders - Optional additional headers to merge
 * @returns Promise<HeadersInit> - Headers with auth token if available
 */
export async function getAuthHeaders(
  additionalHeaders: HeadersInit = {}
): Promise<HeadersInit> {
  const token = await getAccessToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

/**
 * Check if user is currently authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  try {
    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('Error getting user:', error.message);
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('Failed to get current user:', error);
    return null;
  }
}

/**
 * DEPRECATED: Old localStorage method - DO NOT USE
 * Kept for reference only - shows what we're replacing
 */
export function getAccessTokenLegacy_UNSAFE(): string | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem('supabase.auth.token');
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    return parsed.access_token || null;
  } catch {
    return null;
  }
}
