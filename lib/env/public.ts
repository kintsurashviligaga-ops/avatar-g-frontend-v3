export type PublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_BACKEND_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_AUTH_REDIRECT_URL?: string;
  NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_FRONTEND_ORIGIN?: string;
  NEXT_PUBLIC_PENTAGON_API_URL?: string;
  NEXT_PUBLIC_MOCK_MODE?: string;
};

const requiredPublicKeys: Array<keyof PublicEnv> = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

export const publicEnv: PublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_AUTH_REDIRECT_URL: process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL,
  NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED: process.env.NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_FRONTEND_ORIGIN: process.env.NEXT_PUBLIC_FRONTEND_ORIGIN,
  NEXT_PUBLIC_PENTAGON_API_URL: process.env.NEXT_PUBLIC_PENTAGON_API_URL,
  NEXT_PUBLIC_MOCK_MODE: process.env.NEXT_PUBLIC_MOCK_MODE,
};

if (typeof window !== 'undefined') {
  const missing = requiredPublicKeys.filter((key) => !publicEnv[key]);
  if (missing.length > 0) {
    console.warn(
      `[env] missing required public env vars: ${missing.join(', ')}`
    );
  }
}
