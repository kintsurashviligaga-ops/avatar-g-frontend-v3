/**
 * lib/speech/bootMark.ts — when the read-aloud route's code began to load on this server instance.
 *
 * app/api/tts/gemini/route.ts imports this FIRST, so it is evaluated before the route's other imports (modules are
 * evaluated in import order). The time from here to the route's first request on the instance is what loading the route
 * cost there: the cold start the listening trial's card shows (lib/speech/timing `cold`). It is a lower bound, since the
 * platform starting the process itself comes before it. GG's card (2026-11-06) put 1.5–3.1 s of each chunk outside
 * our route and Google ("network"); this says how much of that a cold instance was.
 */
export const SPEECH_ROUTE_LOADING_AT = Date.now();
