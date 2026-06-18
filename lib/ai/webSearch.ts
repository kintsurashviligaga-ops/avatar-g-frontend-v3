/**
 * Live web search for the chat (#19) — grounds answers in up-to-date results.
 *
 * Provider: Tavily (https://tavily.com), an LLM-oriented search API.
 * Env-driven: set `TAVILY_API_KEY`. Without a key (or on any failure) every
 * function returns `null`/`false`, so chat is completely unaffected — the
 * feature simply stays dormant until the key is provided.
 */

export type WebSearchResult = { title: string; url: string; content: string };
export type WebSearchResponse = { answer: string | null; results: WebSearchResult[] };

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

/** Run a web search. Returns null when no key is set or the call fails/empties. */
export async function webSearch(
  query: string,
  opts?: { maxResults?: number },
): Promise<WebSearchResponse | null> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  const q = query.trim();
  if (!apiKey || q.length < 3) return null;

  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: q,
        search_depth: 'basic',
        include_answer: true,
        max_results: Math.min(Math.max(opts?.maxResults ?? 5, 1), 10),
      }),
      // Never let a slow search stall the chat stream.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const results: WebSearchResult[] = (data.results ?? [])
      .map((r) => ({ title: (r.title ?? '').trim(), url: (r.url ?? '').trim(), content: (r.content ?? '').trim() }))
      .filter((r) => r.url);

    if (!results.length && !data.answer) return null;
    return { answer: data.answer?.trim() || null, results };
  } catch {
    // Timeout, network, malformed JSON — stay silent, chat continues without grounding.
    return null;
  }
}

// Conservative heuristic: only obvious time-sensitive / factual-lookup queries
// trigger a search, so everyday chat keeps its instant latency and search
// credits aren't burned needlessly.
const LIVE_INFO_EN =
  /\b(latest|current(ly)?|today|tonight|now|recent(ly)?|this (week|month|year)|news|headline|price|cost|stock|crypto|rate|weather|forecast|score|results?|standings?|schedule|release date|when (is|does|will)|who (won|is the current)|how much|2024|2025|2026)\b/i;
const LIVE_INFO_KA =
  /(უახლეს|დღეს|ახლა|ამჟამ|ბოლო ამბ|ახალი ამბ|ამბები|ფას(ი|ები)|ღირ|კურსი|ამინდ|პროგნოზ|შედეგ|ანგარიშ|როდის (არის|გამო|იქნებ)|ვინ (მოიგ|არის)|რამდენ)/;

/** True when the query looks like it needs fresh, up-to-date web information. */
export function likelyNeedsWebSearch(query: string): boolean {
  const q = query.trim();
  if (q.length < 4) return false;
  return LIVE_INFO_EN.test(q) || LIVE_INFO_KA.test(q);
}

/** Format search results as a system preamble the model can cite from. */
export function buildSearchPreamble(search: WebSearchResponse): string {
  const lines: string[] = [
    'LIVE WEB SEARCH RESULTS — use these to answer with current, accurate facts.',
    'Cite every source you rely on inline as a Markdown link, e.g. [1](https://…), and finish with a short "Sources:" list of the links you actually used. If the results do not answer the question, say so plainly.',
  ];
  if (search.answer) lines.push(`Quick summary from search: ${search.answer}`);
  search.results.forEach((r, i) => {
    lines.push(`[${i + 1}] ${r.title || r.url}\n${r.url}\n${r.content.slice(0, 600)}`);
  });
  return lines.join('\n\n');
}
