/**
 * lib/calls/whatsapp/bridgeApi.ts — the five requests the media bridge makes back to the app during one call, as one
 * testable handler (the route app/api/calls/bridge/[op]/route.ts only reads the request and calls this).
 *
 *   answer   { sdp }                      our SDP answer → Meta pre_accept + accept. Media may flow after ok.
 *   session  { resumptionHandle? }        a locked Gemini Live token for this call (bounded per call).
 *   heard    { text, at }                 one thing the CALLER said (input transcription), the evidence for any yes.
 *   tool     { name, args }               one function call from Gemini, executed for the ticket's user.
 *   event    { type: active|metrics|end } lifecycle and measurements; `end` hangs up at Meta.
 *
 * Every request carries the call's ticket (Authorization: Bearer). The user, the call and the limits come FROM THE
 * TICKET, never from the body; a ticket whose call is over is refused (409).
 */
import { answerCall, authorizeBridge, bridgeEvent, parseBridgeEvent, takeLiveMint, type CallServiceDeps } from './callService';
import { appendHeard } from './callStore';
import { runPhoneTool, type PhoneToolDeps } from './phoneTools';
import type { CallSession } from './liveSession';
import type { CallTicket } from './ticket';

export const BRIDGE_OPS = ['answer', 'session', 'heard', 'tool', 'event'] as const;
export type BridgeOp = (typeof BRIDGE_OPS)[number];
export const BRIDGE_BODY_MAX_BYTES = 32_768;
const HEARD_MAX_CHARS = 500;

export interface BridgeApiDeps {
  call: CallServiceDeps;
  tools: PhoneToolDeps;
  session(ticket: CallTicket, resumptionHandle: string | null): Promise<CallSession>;
}

export interface BridgeReply { status: number; body: Record<string, unknown> }

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

export async function handleBridgeRequest(deps: BridgeApiDeps, op: unknown, token: string | null, rawBody: unknown): Promise<BridgeReply> {
  if (typeof op !== 'string' || !(BRIDGE_OPS as readonly string[]).includes(op)) return { status: 404, body: { error: 'unknown_op' } };
  const auth = await authorizeBridge(deps.call, token);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const body = rec(rawBody);
  const { ticket, record } = auth;

  switch (op as BridgeOp) {
    case 'answer': {
      const r = await answerCall(deps.call, auth, body.sdp);
      return r.ok ? { status: 200, body: { ok: true, maxSeconds: ticket.maxSeconds } } : { status: 409, body: { error: r.error } };
    }
    case 'session': {
      if (record.state !== 'answered' && record.state !== 'active') return { status: 409, body: { error: 'not_answered' } };
      if (!(await takeLiveMint(deps.call, record))) return { status: 429, body: { error: 'too_many_sessions' } };
      const handle = typeof body.resumptionHandle === 'string' && body.resumptionHandle.length <= 4096 ? body.resumptionHandle : null;
      const s = await deps.session(ticket, handle);
      return s.ok
        ? { status: 200, body: { token: s.token, setupMessage: s.setupMessage, expiresAt: s.expiresAt } }
        : { status: 503, body: { error: s.error } };
    }
    case 'heard': {
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, HEARD_MAX_CHARS) : '';
      const at = Number(body.at);
      const now = deps.call.now();
      // When it was said must be inside this call and not in the future: a forged early timestamp could make a later
      // question look already answered.
      if (!text || !Number.isFinite(at) || at < record.createdAt || at > now + 5000) return { status: 400, body: { error: 'bad_utterance' } };
      await appendHeard(deps.call.kv, ticket.callId, { text, at: Math.min(at, now) });
      return { status: 200, body: { ok: true } };
    }
    case 'tool': {
      if (record.state !== 'active' && record.state !== 'answered') return { status: 409, body: { error: 'not_live' } };
      const response = await runPhoneTool(deps.tools, ticket, body.name, body.args);
      return { status: 200, body: { response } };
    }
    case 'event': {
      const ev = parseBridgeEvent(body);
      if (!ev) return { status: 400, body: { error: 'bad_event' } };
      await bridgeEvent(deps.call, auth, ev);
      return { status: 200, body: { ok: true } };
    }
  }
  return { status: 404, body: { error: 'unknown_op' } };
}
