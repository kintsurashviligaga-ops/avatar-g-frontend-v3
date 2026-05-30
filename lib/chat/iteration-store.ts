import 'server-only';

type IterationState = {
  sessionId: string;
  serviceContext: string;
  prompt: string;
  imageUrl?: string;
  selectedOptions: Record<string, string>;
  updatedAt: number;
};

const STORE = new Map<string, IterationState>();
const MAX_PROMPT_LENGTH = 8000;
const TTL_MS = 1000 * 60 * 30;

/**
 * PHASE 39 §2 — Avatar payload sanitization & engine purge.
 *
 * The avatar engine must treat EVERY prompt as a brand-new, standalone render
 * request. The iterative store was silently merging short avatar prompts under
 * the previously-stored prompt and accumulating selectedOptions across calls,
 * which made the engine "ignore unique prompt overrides" — it kept replaying a
 * stale, cached config. For avatar contexts we therefore bypass the store
 * entirely: no read, no write, no merge, no option accumulation. The prompt
 * maps 1:1 to the current active user input bubble.
 */
const NON_ITERATIVE_CONTEXTS = new Set<string>([
  'avatar',
  'avatar_generation',
]);

function isNonIterativeContext(serviceContext: string): boolean {
  return NON_ITERATIVE_CONTEXTS.has(serviceContext.trim().toLowerCase());
}

function makeKey(sessionId: string, serviceContext: string): string {
  return `${sessionId}::${serviceContext}`;
}

function prune(): void {
  const now = Date.now();
  for (const [key, value] of STORE.entries()) {
    if (now - value.updatedAt > TTL_MS) {
      STORE.delete(key);
    }
  }
}

function isRefinementInstruction(value: string): boolean {
  const text = value.toLowerCase();
  return /(^|\b)(add|change|update|make|refine|tweak|increase|decrease|more|less|faster|slower|warmer|colder|brighter|darker|retry|again)(\b|$)/i.test(text);
}

function normalizePrompt(value: string): string {
  const text = value.trim();
  if (text.length <= MAX_PROMPT_LENGTH) {
    return text;
  }
  return text.slice(text.length - MAX_PROMPT_LENGTH);
}

export function buildIterativePrompt(input: {
  sessionId: string;
  serviceContext: string;
  message: string;
  selectedOptions?: Record<string, string>;
  imageUrl?: string;
}): {
  prompt: string;
  iteration: number;
  hasPreviousContext: boolean;
} {
  prune();

  const sessionId = String(input.sessionId || '').trim();
  const serviceContext = String(input.serviceContext || 'global').trim();
  const message = String(input.message || '').trim();
  const selectedOptions = input.selectedOptions || {};

  // PHASE 39 §2 — Avatar (and other non-iterative) contexts NEVER persist or
  // merge prompt state. Return the current message verbatim with zero caching so
  // every avatar render reflects exactly what the user just typed. This also
  // guarantees no payload bleed across separate sessions or prompt iterations.
  if (isNonIterativeContext(serviceContext)) {
    return {
      prompt: normalizePrompt(message),
      iteration: 1,
      hasPreviousContext: false,
    };
  }

  const key = makeKey(sessionId, serviceContext);
  const previous = STORE.get(key);

  let nextPrompt = message;
  let iteration = 1;
  if (previous) {
    iteration = 2;
    const shouldMerge = isRefinementInstruction(message) || message.length <= 180;
    if (shouldMerge) {
      nextPrompt = `${previous.prompt}\n\nRefinement request: ${message}`;
    }
  }

  const mergedOptions = previous
    ? { ...previous.selectedOptions, ...selectedOptions }
    : selectedOptions;

  STORE.set(key, {
    sessionId,
    serviceContext,
    prompt: normalizePrompt(nextPrompt),
    imageUrl: input.imageUrl || previous?.imageUrl,
    selectedOptions: mergedOptions,
    updatedAt: Date.now(),
  });

  return {
    prompt: normalizePrompt(nextPrompt),
    iteration,
    hasPreviousContext: Boolean(previous),
  };
}

export function getIterationState(sessionId: string, serviceContext: string): IterationState | null {
  prune();
  return STORE.get(makeKey(sessionId, serviceContext)) || null;
}
