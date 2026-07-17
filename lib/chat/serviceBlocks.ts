/**
 * serviceBlocks — intercept a "service routing" JSON the chat model sometimes HALLUCINATES.
 *
 * When a user asks for an image/music/etc. and the deterministic intent router (lib/chat/intentDetector) misses the
 * phrasing, the request falls through to the chat LLM, which occasionally answers with a raw routing payload like
 *   ```json
 *   { "service": "image", "prompt": "a red fox in snow" }
 *   ```
 * That is NOT a format we ever asked for (the system prompt tells it to reply in natural language), so nothing
 * consumes it and it leaks as an ugly raw JSON code block while the real generation never fires. This lifts that
 * block OUT of the prose so the UI can (a) never render the raw JSON and (b) offer a ONE-TAP Generate action wired
 * to the correct backend. The UI only ACTS when the block DOMINATES the reply (short residual prose) — a long
 * explanation that merely contains an example JSON is left fully intact, and nothing is ever auto-charged.
 *
 * Pure + deterministic (unit-tested); no DOM, no network. Every quantifier is BOUNDED (no ReDoS).
 */

export type ChatService = 'image' | 'music' | 'video' | 'avatar';

export interface ParsedServiceBlock {
  /** the prose with the service-routing JSON removed + whitespace tidied */
  text: string;
  /** which backend the model tried to route to, or null when there is no service block */
  service: ChatService | null;
  /** the subject/prompt the model wanted generated (from prompt/description/query/subject/text/caption), or null */
  prompt: string | null;
}

const SERVICES = /(image|music|video|avatar)/;

// A WHOLE fenced block ```json … "service":"image" … ``` — matched END-TO-END so the ENTIRE fence (comments, extra
// fields, nested objects and all) is removed as one unit; surgically deleting only an inner object would leave a
// broken half-empty fence behind. BOUNDED → linear. Group 1 = the service name.
// The leading span is TEMPERED — `(?:(?!```)[\s\S])` can't cross a ``` — so the opening fence must be the SAME one
// that contains "service"; otherwise a match could start at an EARLIER unrelated ```js block and swallow it whole.
const FENCED_SERVICE = /```(?:json)?(?:(?!```)[\s\S]){0,4000}?"service"\s{0,4}:\s{0,4}"(image|music|video|avatar)"[\s\S]{0,4000}?```/i;
// A BARE (unfenced) FLAT object carrying "service":"…". `[^{}]` keeps it to a single flat object; used only when
// there is no fenced service block, so it never surgically guts a fenced example. Group 1 = object, group 2 = name.
const BARE_SERVICE = /(\{[^{}]{0,1000}?"service"\s{0,4}:\s{0,4}"(image|music|video|avatar)"[^{}]{0,1000}?\})/i;
// A DANGLING opening still streaming in (```json { … "service": …  with NO closing brace yet) — display-only, so a
// partial routing block never FLASHES as raw JSON before it completes into a clean strip. EVERY char from the `{` to
// end-of-string is `[^{}]`, so this matches ONLY a genuinely UNCLOSED trailing fragment: a COMPLETE `{…}` object
// (media OR not — e.g. a k8s/config JSON whose key happens to be "service") contains a `}`, can never match, and is
// therefore never deleted. A non-media partial is hidden only WHILE streaming; once it closes it renders normally.
const DANGLING_SERVICE = /(?:```(?:json)?\s{0,4})?\{[^{}]{0,200}?"service"\s{0,4}:[^{}]{0,200}$/i;
// The subject to generate, from any of the field names a model tends to use.
const PROMPT_FIELD = /"(?:prompt|description|query|subject|text|caption)"\s{0,4}:\s{0,4}"([^"]{1,600})"/i;

/**
 * Pull a hallucinated `{ "service": … }` routing block out of an assistant reply.
 * Returns the cleaned prose plus the detected service + prompt (both null when there is no COMPLETE such block).
 */
export function parseServiceBlock(raw: string): ParsedServiceBlock {
  const s = typeof raw === 'string' ? raw : '';
  const fenced = s.match(FENCED_SERVICE);
  const bare = fenced ? null : s.match(BARE_SERVICE);
  const whole = fenced ? fenced[0] : bare ? bare[0] : '';
  const name = (fenced ? fenced[1] : bare ? bare[2] : '') || '';
  if (!whole || !SERVICES.test(name)) return { text: s, service: null, prompt: null };
  const pm = whole.match(PROMPT_FIELD);
  const prompt = pm && pm[1] ? pm[1].trim() : null;
  const text = s.replace(whole, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, service: name.toLowerCase() as ChatService, prompt };
}

/** Cheap bounded pre-check: does this reply carry a COMPLETE `"service": "<one of ours>"` routing token? */
export function hasServiceBlock(raw: string): boolean {
  return typeof raw === 'string' && /"service"\s{0,4}:\s{0,4}"(?:image|music|video|avatar)"/i.test(raw);
}

/**
 * Display-only strip. When a COMPLETE routing block DOMINATES the reply (short residual prose) it is removed; a long
 * explanation that merely contains an example is left intact; and a still-streaming PARTIAL opening at the end is
 * hidden so raw JSON never flashes mid-stream. Used for rendering; the Generate chip uses parseServiceBlock directly.
 */
export function stripDanglingServiceBlock(raw: string): string {
  const s = typeof raw === 'string' ? raw : '';
  const parsed = parseServiceBlock(s);
  if (parsed.service) return parsed.text.length < 200 ? parsed.text : s;
  // no COMPLETE block — hide a genuinely UNCLOSED opening still streaming at the end. DANGLING_SERVICE can only match
  // an unclosed `{…}` (no closing brace), so a complete non-media `{ … "service": … }` config object is never touched.
  return DANGLING_SERVICE.test(s) ? s.replace(DANGLING_SERVICE, '').trimEnd() : s;
}
