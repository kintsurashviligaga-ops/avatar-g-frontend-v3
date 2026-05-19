import type { PipelineContext, ServiceId } from './types';

/**
 * Slash-command lookup. Power-user shortcut: text starting with `/agent`
 * locks the next dispatch to that agent regardless of natural-language
 * cues. Returned `rest` is the prompt with the slash stripped.
 */
const SLASH_TO_AGENT: Record<string, ServiceId> = {
  '/image':    'image',
  '/img':      'image',
  '/photo':    'image',
  '/video':    'video',
  '/vid':      'video',
  '/music':    'music',
  '/song':     'music',
  '/voice':    'voice',
  '/tts':      'voice',
  '/avatar':   'avatar',
  '/interior': 'interior',
  '/app':      'app',
  '/code':     'app',
  '/chat':     'chat',
  '/ask':      'chat',
};

export function parseSlash(text: string): { agent: ServiceId; rest: string } | null {
  const m = text.match(/^\s*(\/[a-z]+)\s*(.*)$/i);
  if (!m) return null;
  const cmd = m[1]?.toLowerCase() ?? '';
  const agent = SLASH_TO_AGENT[cmd];
  return agent ? { agent, rest: (m[2] ?? '').trim() } : null;
}

/**
 * Natural-language intent detection. Trilingual (KA/EN/RU) keyword
 * matching with two passes:
 *   1. Imagine mode — biased toward generation, defaults to `image`.
 *   2. Ask mode — broader: image / video / music / voice / avatar /
 *      interior / app, falling back to `chat`.
 *
 * `context` is consulted for soft routing: when the user replies with
 * a short follow-up like "longer" right after a video, we stay in the
 * video agent rather than re-classifying from scratch.
 */
export function detectIntent(
  text: string,
  mode: 'ask' | 'imagine',
  context?: PipelineContext,
): ServiceId {
  const slash = parseSlash(text);
  if (slash) return slash.agent;

  // Soft routing — short conversational follow-ups inherit the last intent.
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount <= 4 && context?.lastIntent && context.lastIntent !== 'chat') {
    const followUpHints = /\b(again|more|longer|better|sxva|სცადე|იგივე|ещё|еще)\b/i;
    if (followUpHints.test(text)) return context.lastIntent;
  }

  if (mode === 'imagine') {
    if (/\b(video|ვიდეო|видео|movie|clip)\b/i.test(text)) return 'video';
    if (/\b(music|song|track|მუსიკ|музык|სიმღერა|песн)\b/i.test(text)) return 'music';
    if (/\b(avatar|talking|ავატარ|аватар)\b/i.test(text)) return 'avatar';
    return 'image';
  }
  if (/\b(draw|paint|render|image|picture|photo|სურათ|ფოტო|დახატე|нарисуй|изобрази|фото|картинк)\b/i.test(text)) return 'image';
  if (/\b(video|clip|animate|movie|ვიდეო|видео|анимаци)\b/i.test(text)) return 'video';
  if (/\b(music|song|track|tune|compose|მუსიკ|სიმღერა|музык|песн)\b/i.test(text)) return 'music';
  if (/\b(avatar|talking head|spokesperson|ავატარ|аватар)\b/i.test(text)) return 'avatar';
  if (/\b(speak|read aloud|say this|voice|text to speech|tts|წაიკითხე|ხმოვა|ხმა გააკეთე|прочитай|озвучь)\b/i.test(text)) return 'voice';
  if (/\b(interior|room|bedroom|living room|kitchen|design my room|ინტერიერ|ოთახ|интерьер|комнат|дизайн комнаты)\b/i.test(text)) return 'interior';
  if (/\b(app|application|website|landing page|html|webapp|build me a|build me an|აპლიკაცი|ვებგვერდ|ვებსაიტ|приложение|сайт|лендинг)\b/i.test(text)) return 'app';
  return 'chat';
}
