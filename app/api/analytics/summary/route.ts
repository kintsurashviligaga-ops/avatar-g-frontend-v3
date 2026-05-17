/**
 * GET /api/analytics/summary
 *
 * Returns aggregated usage analytics for the current user:
 *   - messagesPerDay: last 30 days
 *   - generationUsage: counts per media kind (image/video/audio/avatar)
 *   - topTopics: top 5 keywords from recent assistant messages (simple JS)
 *   - totalMessages
 *
 * Auth-gated. Returns empty zeroed shape when user has no data yet so the
 * UI can render an "empty state" without 4xx.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

interface DayCount {
  date: string;
  count: number;
}

interface SummaryResponse {
  messagesPerDay: DayCount[];
  generationUsage: { image: number; video: number; audio: number; avatar: number; code: number; text: number };
  topTopics: Array<{ topic: string; count: number }>;
  totalMessages: number;
}

const STOPWORDS = new Set([
  // EN
  'the', 'and', 'or', 'but', 'for', 'with', 'this', 'that', 'these', 'those', 'have', 'has', 'had',
  'are', 'was', 'were', 'been', 'being', 'will', 'would', 'could', 'should', 'can', 'may', 'might',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
  'their', 'our', 'its', 'a', 'an', 'is', 'be', 'as', 'at', 'by', 'in', 'of', 'on', 'to', 'from',
  'so', 'if', 'no', 'not', 'do', 'does', 'did', 'just', 'like', 'about', 'into', 'than', 'then',
  // KA (common particles)
  'და', 'რომ', 'არ', 'არის', 'ეს', 'ის', 'მე', 'შენ', 'ჩვენ', 'მაგრამ', 'ან', 'თუ', 'რა', 'ვინ',
  'ხო', 'ხო,', 'კი', 'არა',
  // RU
  'и', 'в', 'на', 'с', 'не', 'что', 'это', 'как', 'но', 'или', 'для', 'из', 'по', 'к', 'у', 'же',
]);

function extractTopics(texts: string[], k = 5): Array<{ topic: string; count: number }> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const tokens = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 4 && !STOPWORDS.has(t));
    for (const t of tokens) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([topic, count]) => ({ topic, count }));
}

function buildDayBuckets(rows: Array<{ created_at: string }>): DayCount[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const buckets = new Map<string, number>();
  // Seed 30 days at zero so the chart line is continuous
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const key = new Date(r.created_at).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    const sinceISO = since.toISOString();

    // Messages — joined via conversations (RLS already filters to the user's own)
    const { data: convoRows } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', user.id);
    const convoIds = (convoRows ?? []).map(r => r.id);

    let messages: Array<{ content: string; created_at: string; role: string }> = [];
    if (convoIds.length > 0) {
      const { data } = await supabase
        .from('messages')
        .select('content, created_at, role')
        .in('conversation_id', convoIds)
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: false })
        .limit(1000);
      messages = data ?? [];
    }

    // Generation usage from user_creations
    const { data: creations } = await supabase
      .from('user_creations')
      .select('kind, created_at')
      .eq('user_id', user.id)
      .gte('created_at', sinceISO);

    const usage = { image: 0, video: 0, audio: 0, avatar: 0, code: 0, text: 0 };
    for (const c of creations ?? []) {
      const k = c.kind as keyof typeof usage;
      if (k in usage) usage[k] += 1;
    }

    const summary: SummaryResponse = {
      messagesPerDay: buildDayBuckets(messages),
      generationUsage: usage,
      topTopics: extractTopics(messages.filter(m => m.role === 'assistant').map(m => m.content)),
      totalMessages: messages.length,
    };

    return NextResponse.json(summary);
  } catch (err) {
    reportError(err, { route: '/api/analytics/summary' });
    return NextResponse.json({ error: 'analytics failed' }, { status: 500 });
  }
}
