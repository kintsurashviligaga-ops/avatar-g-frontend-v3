import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { LineChart, BarChart, TopicList, KpiTile } from '@/components/analytics/AnalyticsCharts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics — myavatar.ge' };

interface DayCount { date: string; count: number }
interface SummaryResponse {
  messagesPerDay: DayCount[];
  generationUsage: { image: number; video: number; audio: number; avatar: number; code: number; text: number };
  topTopics: Array<{ topic: string; count: number }>;
  totalMessages: number;
}

type Props = { params: Promise<{ locale: string }> };

export default async function AnalyticsPage({ params }: Props) {
  const { locale } = await params;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Server-side fetch — pass cookie through so RLS sees the user
  const headersList = await headers();
  const cookie = headersList.get('cookie') ?? '';
  const host = headersList.get('host') ?? 'myavatar.ge';
  const proto = headersList.get('x-forwarded-proto') ?? 'https';
  const res = await fetch(`${proto}://${host}/api/analytics/summary`, {
    headers: { cookie },
    cache: 'no-store',
  });

  if (!res.ok) {
    return (
      <main style={{ padding: 48, color: '#fff', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Analytics unavailable</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>
          Please try again in a moment. If the issue persists, your account may be unauthenticated.
        </p>
      </main>
    );
  }

  const summary = (await res.json()) as SummaryResponse;

  const empty = summary.totalMessages < 5;

  return (
    <main style={{
      maxWidth: 1100, margin: '0 auto', padding: '28px 20px 60px', color: '#fff',
      minHeight: '100vh',
    }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Analytics</h1>
        <p style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
          Last 30 days · personal usage · {summary.totalMessages} messages
        </p>
      </header>

      {empty ? (
        <div style={{
          padding: '64px 24px', textAlign: 'center',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18,
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
            Not enough data yet
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', maxWidth: 360, margin: '0 auto' }}>
            Send at least 5 messages or generate a few assets to unlock the dashboard. Insights appear within minutes.
          </p>
          <a
            href={`/${locale}/dashboard`}
            style={{
              display: 'inline-block', marginTop: 18, padding: '10px 18px', borderRadius: 999,
              fontSize: 13, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,#6d28d9,#a855f7)',
              boxShadow: '0 6px 18px -6px rgba(139,92,246,0.5)',
              textDecoration: 'none',
            }}
          >
            Open chat
          </a>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KpiTile label="Total messages" value={summary.totalMessages} accent="#a855f7" />
            <KpiTile label="Images" value={summary.generationUsage.image} accent="#ec4899" />
            <KpiTile label="Videos" value={summary.generationUsage.video} accent="#f97316" />
            <KpiTile label="Audio" value={summary.generationUsage.audio} accent="#06b6d4" />
          </div>

          <section style={{
            padding: 18, borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.02)',
            marginBottom: 16,
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'rgba(255,255,255,0.75)' }}>
              Messages per day · last 30 days
            </h2>
            <LineChart data={summary.messagesPerDay} />
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
            <section style={{
              padding: 18, borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'rgba(255,255,255,0.75)' }}>
                Generation usage
              </h2>
              <BarChart data={[
                { label: 'image', count: summary.generationUsage.image, color: 'linear-gradient(180deg,#ec4899,#be185d)' },
                { label: 'video', count: summary.generationUsage.video, color: 'linear-gradient(180deg,#f97316,#c2410c)' },
                { label: 'audio', count: summary.generationUsage.audio, color: 'linear-gradient(180deg,#06b6d4,#0891b2)' },
                { label: 'avatar', count: summary.generationUsage.avatar, color: 'linear-gradient(180deg,#8b5cf6,#6d28d9)' },
                { label: 'code', count: summary.generationUsage.code, color: 'linear-gradient(180deg,#10b981,#047857)' },
              ]} />
            </section>

            <section style={{
              padding: 18, borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'rgba(255,255,255,0.75)' }}>
                Top topics
              </h2>
              <TopicList topics={summary.topTopics} />
            </section>
          </div>
        </>
      )}
    </main>
  );
}
