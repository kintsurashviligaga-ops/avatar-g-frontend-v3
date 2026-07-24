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
// Only clearly time-sensitive / live-fact lookups trigger a search. Bare "how much" / "რამდენ" were
// REMOVED: they fire on ordinary math and quantity questions ("2+2 რამდენია?", "how much is a cup") that
// need NO web — the cost/price words below still catch genuine "how much does X cost" queries.
const LIVE_INFO_EN =
  /\b(latest|current(ly)?|today|tonight|recent(ly)?|this (week|month|year)|news|headline|stock price|crypto|exchange rate|weather|forecast|standings?|match (score|result)|release date|when (is|does|will)|who (won|is the current)|2024|2025|2026)\b/i;
const LIVE_INFO_KA =
  /(უახლეს|დღეს|ამჟამ|ბოლო ამბ|ახალი ამბ|ამბები|ფას(ი|ები)|რა ღირს|კურსი|ამინდ|პროგნოზ|(მატჩ|თამაშ|ჩემპიონატ).{0,20}(შედეგ|ანგარიშ)|როდის (არის|გამო|იქნებ)|ვინ (მოიგ|არის მოქმედი))/;

// Pure arithmetic / equations — never a web lookup ("2+2", "15% of 200", "3*4=?").
const PURE_MATH = /^[\d\s+\-*/=×÷.,()²³%^]+\??$/;

/** True when the query looks like it needs fresh, up-to-date web information. */
export function likelyNeedsWebSearch(query: string): boolean {
  const q = query.trim();
  if (q.length < 4) return false;
  if (PURE_MATH.test(q)) return false;
  return LIVE_INFO_EN.test(q) || LIVE_INFO_KA.test(q);
}

/** Format search results as a system preamble. The results are BACKGROUND CONTEXT the model reads
 *  silently — it must answer in clean, natural prose, NOT dump the links. Users kept seeing an ugly
 *  "Sources: [1] https://…" wall (and even "2+2" got a "[1]"), which reads as nonsense in a chat/voice
 *  assistant. So the instruction is the opposite of before: use the facts, cite NOTHING. */
export function buildSearchPreamble(search: WebSearchResponse): string {
  const lines: string[] = [
    'BACKGROUND CONTEXT (live web search, for your reference only — the user does NOT see this):',
    'Use these facts to answer with current, accurate information, in clean natural prose. Do NOT print a "Sources:" list, do NOT paste raw URLs, and do NOT add bracketed citation markers like [1] or [1](https://…). Just answer directly and conversationally, as if you already knew the facts. If the results do not answer the question, answer from your own knowledge without mentioning the search.',
  ];
  if (search.answer) lines.push(`Summary: ${search.answer}`);
  search.results.forEach((r, i) => {
    lines.push(`(${i + 1}) ${r.title || r.url}\n${r.content.slice(0, 600)}`);
  });
  return lines.join('\n\n');
}
