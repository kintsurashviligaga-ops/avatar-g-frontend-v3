/**
 * Avatar G Identity System
 * Handles user identification for avatar persistence (authenticated or anonymous)
 * 
 * - If user is authenticated → use Supabase auth user ID
 * - If anonymous → generate and persist UUID in localStorage
 */

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { v4 as uuidv4 } from 'uuid';

const ANON_ID_KEY = 'avatar_g_anon_id';

/**
 * Get the current owner ID (either authenticated user or anonymous UUID)
 * 
 * Flow:
 * 1. Check if user is authenticated via Supabase
 * 2. If yes → return user.id
 * 3. If no → check localStorage for existing anon ID
 * 4. If missing → generate new UUID and store it
 * 5. Return the anon ID
 * 
 * @returns Promise<string> - Owner ID (user.id or anon UUID)
 */
export async function getOwnerId(): Promise<string> {
  try {
    // Step 1: Try to get authenticated user
    const supabase = createClientComponentClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (!error && user && user.id) {
      // User is authenticated
      return user.id;
    }
    
    // Step 2: User not authenticated, check localStorage for anon ID
    if (typeof window !== 'undefined') {
      const existingAnonId = localStorage.getItem(ANON_ID_KEY);
      
      if (existingAnonId) {
        return existingAnonId;
      }
      
      // Step 3: Generate new anon ID
      const newAnonId = uuidv4();
      localStorage.setItem(ANON_ID_KEY, newAnonId);
      
      return newAnonId;
    }
    
    // Fallback (should not reach here)
    return uuidv4();
  } catch (error) {
    console.error('Error getting owner ID:', error);
    // Fallback: generate temporary UUID
    return uuidv4();
  }
}

/**
 * Check if current user is authenticated
 * 
 * @returns Promise<boolean> - True if authenticated, false if anonymous
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const supabase = createClientComponentClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

/**
 * Get current authenticated user (if any)
 * 
 * @returns Promise<{id: string} | null> - User object or null if anonymous
 */
export async function getCurrentUser() {
  try {
    const supabase = createClientComponentClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/**
 * Clear anonymous ID from localStorage
 * Useful when user signs up/signs in
 */
export function clearAnonId(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ANON_ID_KEY);
  }
}

/**
 * Get anonymous ID if it exists
 * 
 * @returns string | null - Anonymous ID or null
 */
export function getAnonIdSync(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(ANON_ID_KEY);
  }
  return null;
}
