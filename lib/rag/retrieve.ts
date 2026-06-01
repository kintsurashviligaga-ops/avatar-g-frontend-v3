import 'server-only';

import { embed } from '@/lib/memory/embed';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';

/**
 * lib/rag/retrieve.ts
 * ===================
 * Retrieval-Augmented Generation retrieval step, on Supabase pgvector.
 *
 * `retrieveContext` embeds the user query (reusing lib/memory/embed → 1536-d
 * Gemini/OpenAI vectors), runs the `match_rag_documents` similarity RPC, and
 * returns a single localized context block ready to prepend to the system
 * prompt.
 *
 * FAIL-SAFE CONTRACT: this never throws and returns '' whenever RAG is
 * unconfigured, the embedding fails, the DB errors, or nothing clears the
 * similarity threshold. Callers can unconditionally prepend the result — an
 * empty string is a no-op, so the live chat degrades to ungrounded answers
 * instead of breaking.
 */

export interface RetrieveOptions {
  /** Max chunks to inject (default 3). */
  matchCount?: number;
  /** Cosine-similarity floor 0..1 (default 0.5). Weak matches are dropped. */
  threshold?: number;
  /** Restrict to a corpus language ('ka'|'en'|'ru'); undefined = whole corpus. */
  filterLang?: string | null;
  /** Locale used only for the instruction header text (default 'ka'). */
  locale?: string;
}

const HEADER: Record<string, string> = {
  ka: 'ქვემოთ მოცემულია კონტექსტი სანდო ქართული წყაროებიდან. გამოიყენე იგი პასუხისთვის მხოლოდ თუ რელევანტურია; თუ არა — უპასუხე ჩვეულებრივად.',
  en: 'Below is context retrieved from trusted sources. Use it only if relevant to the question; otherwise answer normally.',
  ru: 'Ниже приведён контекст из доверенных источников. Используйте его, только если он релевантен вопросу; иначе отвечайте как обычно.',
};

export function isRagConfigured(): boolean {
  const hasEmbedKey = !!(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.OPENAI_API_KEY
  );
  const hasDb = !!(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
  return hasEmbedKey && hasDb;
}

interface MatchRow {
  id?: string;
  source?: string;
  content?: string;
  similarity?: number;
}

export async function retrieveContext(query: string, opts: RetrieveOptions = {}): Promise<string> {
  const q = (query ?? '').trim();
  if (!q || !isRagConfigured()) return '';

  const matchCount = opts.matchCount ?? 3;
  const threshold = opts.threshold ?? 0.5;
  const filterLang = opts.filterLang ?? null;
  const locale = opts.locale ?? 'ka';

  try {
    const vector = await embed(q);
    if (!vector) return '';

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('match_rag_documents', {
      query_embedding: vector,
      match_count: matchCount,
      similarity_threshold: threshold,
      filter_lang: filterLang,
    });

    if (error) {
      reportError(error, { route: 'lib/rag/retrieve', op: 'match_rag_documents' });
      return '';
    }
    const rows = Array.isArray(data) ? (data as MatchRow[]) : [];
    if (rows.length === 0) return '';

    const body = rows
      .map((row, i) => {
        const text = (row.content ?? '').trim();
        if (!text) return '';
        return `[${i + 1}${row.source ? ` · ${row.source}` : ''}] ${text}`;
      })
      .filter(Boolean)
      .join('\n\n');

    if (!body) return '';
    const header = HEADER[locale] ?? HEADER.ka;
    return `${header}\n\n${body}`;
  } catch (err) {
    reportError(err, { route: 'lib/rag/retrieve' });
    return '';
  }
}
