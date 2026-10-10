/**
 * handleInbound — what Agent G answers to ONE message that arrived on WhatsApp (the only caller:
 * whatsapp-processor.ts). The decision, in order:
 *
 *   tables missing        → "opening soon" (fixed text, at most once per half hour per number)
 *   number not linked     → a link code ("connect ABCD2345") binds it; anything else gets the how-to-link text
 *                           (fixed text, at most once per 10 min) — an unknown number never reaches a model
 *   linked                → control words (help / stop / alerts on / unlink), then
 *                           an order to MAKE something → a studio link with the request typed in (nothing renders here)
 *                           anything else → Agent G answers in words, with this number's recent conversation as context,
 *                           about MyAvatar.ge only (WHATSAPP_STYLE_NOTE) and without web search
 *
 * ⚠️ NOTHING ON THIS DOOR SPENDS A CREDIT. The old version planned non-chat messages into the task orchestrator, which
 * fanned out to paid generation routes with no confirmation, and fell into it even for a "hello" whenever the chat
 * model failed. A render needs a price on a button and a tap (the focus gate's rule, lib/chat/focusGate.ts); WhatsApp
 * has neither, so it only ever hands over a link to the studio, where the gate and the price are.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { detectIntent, isGenerativeCommand, resolveGenerativeLane } from '@/lib/chat/intentDetector';
import { generateChannelReply } from '@/lib/ai/channelBridge';
import {
  appendTurn,
  consumeConnectCode,
  findLinkByNumber,
  patchLinkMeta,
  recentTurns,
  unlink,
} from '@/lib/agent-g/channels/whatsapp-link';
import {
  WA_COPY,
  WHATSAPP_STYLE_NOTE,
  linkPage,
  parseCommand,
  parseConnectCode,
  studioLink,
  toWhatsAppText,
  waLang,
  type StudioMode,
} from '@/lib/agent-g/channels/whatsapp-text';

export type InboundChannel = 'whatsapp';

export type HandleInboundInput = {
  channel: InboundChannel;
  /** The sender's WhatsApp id (international digits). */
  externalId: string;
  text: string;
  /** 'media' = a photo/voice/video/file/sticker/location: not read on this channel yet. */
  kind?: 'text' | 'media';
  messageId?: string;
  profileName?: string;
  origin?: string;
};

export type InboundOutcome =
  | 'soon' | 'linked' | 'code_not_found' | 'not_linked' | 'command' | 'studio' | 'talk' | 'not_text'
  | 'rate_limited' | 'silent';

export type HandleInboundOutput = {
  replyMessages: string[];
  outcome: InboundOutcome;
  userId?: string;
};

const MIN = 60_000;

/** True when this key has used up its window — the limiter's 429 response is the signal. */
async function limited(key: string, maxRequests: number, windowMs: number, keyPrefix: string): Promise<boolean> {
  try {
    return (await checkRateLimitByKey(key, { maxRequests, windowMs, keyPrefix })) !== null;
  } catch {
    return false;
  }
}

function laneMode(text: string): StudioMode | null {
  if (!isGenerativeCommand(text)) return null;
  const lane = resolveGenerativeLane(text, detectIntent(text));
  if (lane === 'video_generation') return 'video';
  if (lane === 'music_generation') return 'music';
  if (lane === 'image_generation' || lane === 'avatar_generation') return 'image';
  return null;
}

export async function handleInbound(input: HandleInboundInput): Promise<HandleInboundOutput> {
  const waId = input.externalId.replace(/\D/g, '');
  const text = input.text.trim();
  const lang = waLang(text, waId);
  const copy = WA_COPY[lang];
  const origin = (input.origin || process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://myavatar.ge').replace(/\/+$/, '');
  if (!waId) return { replyMessages: [], outcome: 'silent' };

  const sb = createServiceRoleClient();
  const lookup = await findLinkByNumber(sb, waId);

  if (lookup.state === 'unavailable') {
    if (await limited(waId, 1, 30 * MIN, 'wa:soon')) return { replyMessages: [], outcome: 'silent' };
    return { replyMessages: [copy.soon], outcome: 'soon' };
  }

  if (lookup.state === 'unlinked') {
    const code = input.kind === 'media' ? null : parseConnectCode(text);
    if (code) {
      if (await limited(waId, 5, 60 * MIN, 'wa:link')) return { replyMessages: [copy.tooManyTries], outcome: 'rate_limited' };
      const bound = await consumeConnectCode(sb, code, waId, { locale: lang, profile_name: input.profileName });
      if (bound === 'unavailable') return { replyMessages: [copy.soon], outcome: 'soon' };
      if (bound === 'not_found') return { replyMessages: [copy.codeNotFound(linkPage(origin, lang))], outcome: 'code_not_found' };
      return { replyMessages: [copy.linked], outcome: 'linked', userId: bound.userId };
    }
    if (await limited(waId, 1, 10 * MIN, 'wa:howto')) return { replyMessages: [], outcome: 'silent' };
    return { replyMessages: [copy.notLinked(linkPage(origin, lang))], outcome: 'not_linked' };
  }

  const userId = lookup.link.userId;
  // The 24 h customer-service window opens with every message FROM the user (sendWhatsAppAlert reads it).
  const touched = { last_inbound_at: new Date().toISOString(), locale: lang };
  await patchLinkMeta(sb, lookup.link, touched);
  const link = { ...lookup.link, meta: { ...lookup.link.meta, ...touched } };

  if (input.kind === 'media' || !text) return { replyMessages: [copy.notText], outcome: 'not_text', userId };

  const command = parseCommand(text);
  if (command === 'unlink') {
    await unlink(sb, link.id);
    return { replyMessages: [copy.unlinked], outcome: 'command', userId };
  }
  if (command === 'help') return { replyMessages: [copy.help], outcome: 'command', userId };
  if (command === 'alerts_off' || command === 'alerts_on') {
    await patchLinkMeta(sb, link, { alerts: command === 'alerts_on' });
    return { replyMessages: [command === 'alerts_on' ? copy.alertsOn : copy.alertsOff], outcome: 'command', userId };
  }

  // A brake on a runaway loop (another bot answering us) and on spend: 20 answers per 10 minutes per number.
  if (await limited(waId, 20, 10 * MIN, 'wa:talk')) {
    if (await limited(waId, 1, 10 * MIN, 'wa:slow')) return { replyMessages: [], outcome: 'silent', userId };
    return { replyMessages: [copy.slowDown], outcome: 'rate_limited', userId };
  }

  const mode = laneMode(text);
  if (mode) {
    const reply = copy.studio(mode, studioLink(origin, lang, mode, text));
    await appendTurn(sb, link, 'user', text, input.messageId);
    await appendTurn(sb, link, 'assistant', reply);
    return { replyMessages: [reply], outcome: 'studio', userId };
  }

  const history = await recentTurns(sb, link);
  const ai = await generateChannelReply({
    channel: 'whatsapp',
    userId,
    externalId: waId,
    text,
    locale: lang,
    history,
    systemNote: WHATSAPP_STYLE_NOTE,
    // A service channel, not a general assistant (Meta Terms §4.7 until Meta answers in writing): no web search.
    googleSearch: false,
  });
  if (!ai.answered) return { replyMessages: [copy.unavailable], outcome: 'talk', userId };
  const reply = toWhatsAppText(ai.reply);
  await appendTurn(sb, link, 'user', text, input.messageId);
  await appendTurn(sb, link, 'assistant', reply);
  return { replyMessages: [reply], outcome: 'talk', userId };
}
