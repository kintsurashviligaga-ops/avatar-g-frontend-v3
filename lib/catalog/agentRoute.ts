/**
 * lib/catalog/agentRoute.ts — Agent G's catalog routing for the chat (Master Task §52): a request typed into the chat
 * for a service whose runtime is a studio PANEL opens that panel, and a request for a service that does not exist yet
 * is told so — instead of the chat guessing a neighbouring tool.
 *
 * What it covers, and what it deliberately leaves alone:
 *   - image · music · video (and music video, its mode) already have chat lanes: Agent G's card, the storyboard. A
 *     catalog hit on those tools returns null so the existing lane keeps them.
 *   - dubbing · avatar · montage · presentation · 3D already route through lib/chat/studioIntent, which carries their
 *     own guards (a text to read aloud is not a video to dub). Null here, so there is one router per tool.
 *   - product ad · character swap · motion transfer · VFX · video remix · interior · photographer had NO sentence path:
 *     „make a product ad for my sneakers" was drawn as a picture, „swap the character in this video" was answered in
 *     prose. These open their tool.
 *   - a coming-soon service („მუსიკა დამირემიქსე" — an AUDIO remix) is reported unavailable with the nearest usable
 *     service; it never opens the video remix in its place (§25 "Remix is not enough").
 *
 * Deterministic and conservative, like studioIntent and for the same reason: every one of these tools spends credits,
 * so a route only OPENS the tool — never runs it — and a question about a service („რა ღირს რეკლამა?") opens nothing.
 *
 * Pure and client-safe.
 */
import type { ToolId } from '@/lib/studio/tools';
import { isServiceQuestion, looksLikeRequest } from '@/lib/chat/studioIntent';
import { resolveService, usableServices, type ServiceDefinition } from './services';

export type AgentRoute =
  | { kind: 'open'; service: ServiceDefinition; tool: ToolId }
  | { kind: 'unavailable'; service: ServiceDefinition; alternative: ServiceDefinition | null };

/** Tools another chat router already owns (see above). */
const ROUTED_ELSEWHERE: ReadonlySet<ToolId> = new Set<ToolId>([
  'chat', 'image', 'music', 'video',
  'dubbing', 'avatar', 'montage', 'presentation', 'model3d',
]);

/** Agent G's catalog verdict for a chat message, or null to leave it to the other routers and the conversation. */
export function routeAgentIntent(text: string | null | undefined): AgentRoute | null {
  const t = String(text ?? '').trim();
  if (!t || isServiceQuestion(t) || !looksLikeRequest(t)) return null;
  const service = resolveService(t);
  if (!service) return null;
  if (service.status === 'coming-soon') {
    const alternative = usableServices().find((s) => s.category === service.category && s.agentCallable) ?? null;
    return { kind: 'unavailable', service, alternative };
  }
  if (!service.agentCallable || !service.tool || ROUTED_ELSEWHERE.has(service.tool)) return null;
  return { kind: 'open', service, tool: service.tool };
}
