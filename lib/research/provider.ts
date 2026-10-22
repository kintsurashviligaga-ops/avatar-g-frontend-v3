/**
 * lib/research/provider.ts — what serves Deep Research. Under MASTER TASK v3.1, nothing, so researchProvider() is null.
 *
 * The Deep Research agent exists only on the Gemini Developer API's Interactions API (lib/research/interactionsClient),
 * billed to the AI Studio key, and v3.1 refuses the Developer API outright. Vertex AI has no Interactions API. So:
 *   · getResearchCapabilities answers `no_transport` (the composer shows "opening soon", routes answer 503);
 *   · the runtime builds the client with no credential, so start / poll / cancel refuse before any I/O.
 * An AI Studio key in the environment changes nothing. Turning Deep Research back on is a reviewed code change here
 * (an owner-approved transport), never an environment variable.
 */
import 'server-only';
import type { InteractionsClientOptions } from './interactionsClient';

export type ResearchProvider = Required<Pick<InteractionsClientOptions, 'apiKey'>>;

export function researchProvider(): ResearchProvider | null {
  return null;
}
