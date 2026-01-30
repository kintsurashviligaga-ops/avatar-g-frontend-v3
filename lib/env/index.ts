/**
 * ENVIRONMENT VARIABLES ENTRY POINT
 * 
 * USAGE GUIDE:
 * - Server Components/Actions/API Routes: Import from '@/lib/env/server'
 * - Client Components: Import from '@/lib/env/public'
 * - Both: Import from '@/lib/env/public'
 */

// Public env - safe for both client and server
export { getPublicEnv, validatePublicEnv, type PublicEnvKey } from './public';

// Server-only env - CANNOT be used in client components
// Import will fail at build time if used in 'use client' files
export { getServerEnv, validateServerEnv, type ServerEnvKey } from './server';
