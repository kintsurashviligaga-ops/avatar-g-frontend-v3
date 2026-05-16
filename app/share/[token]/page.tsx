/**
 * Public Share Page — /share/:token
 * Server component wrapper for metadata + data fetch.
 * Renders <SharePageClient> for all UI.
 */
import type { Metadata } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/server';
import SharePageClient from './SharePageClient';

export const dynamic = 'force-dynamic';

type Kind = 'image' | 'video' | 'audio' | 'avatar' | 'text' | 'code';

export interface Creation {
  id: string;
  kind: Kind;
  service: string;
  title: string | null;
  prompt: string | null;
  url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  credits_used: number;
  is_public: boolean;
  share_token: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

type PageProps = { params: { token: string } };

async function getCreation(token: string): Promise<Creation | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('user_creations')
    .select('id, kind, service, title, prompt, url, thumbnail_url, duration_seconds, credits_used, is_public, share_token, created_at, metadata')
    .eq('share_token', token)
    .eq('is_public', true)
    .maybeSingle();
  if (error || !data) return null;
  return data as Creation;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const c = await getCreation(params.token);
  if (!c) return { title: 'Creation Not Found | Avatar G' };

  const title = c.title ?? `AI ${c.kind} by Avatar G`;
  const description = c.prompt
    ? c.prompt.slice(0, 155) + (c.prompt.length > 155 ? '…' : '')
    : `A ${c.kind} created with Avatar G AI.`;
  const images = c.thumbnail_url
    ? [{ url: c.thumbnail_url, width: 1200, height: 630, alt: title }]
    : [];

  return {
    title: `${title} | Avatar G`,
    description,
    openGraph: {
      title, description,
      url: `https://myavatar.ge/share/${c.share_token}`,
      siteName: 'Avatar G',
      images, type: 'website',
    },
    twitter: {
      card: c.thumbnail_url ? 'summary_large_image' : 'summary',
      title, description,
      images: c.thumbnail_url ? [c.thumbnail_url] : undefined,
    },
  };
}

export default async function SharePage({ params }: PageProps) {
  const creation = await getCreation(params.token);
  return <SharePageClient creation={creation} />;
}
