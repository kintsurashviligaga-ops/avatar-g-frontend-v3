/**
 * lib/chat/platformPrompt.ts — the Google-only platform prompt for the chat model (and any Gemini surface that
 * wants the same ground truth). It REPLACES the chat route's use of AGENT_G_SYSTEM_PROMPT + the inline chat rules +
 * platformKnowledge('en'); lib/agent-g-orchestrator.ts stays for its legacy callers.
 *
 * What the old ~13.5 KB prompt got wrong, and why each piece below is built the way it is:
 *
 * ⚠️ IT NAMED ENGINES THAT DO NOT SERVE THE TOOL. Runway, FLUX, HeyGen, Udio and ElevenLabs Music were all in the
 * prompt, so "how do you make videos?" was answered with a vendor the render never touched. Engines are now named
 * ONLY where a Google engine really is the primary path (TOOL_ENGINE below), and the model is told to describe the
 * output — never guess a vendor — for every other tool. The rule is written WITHOUT naming the vendors it excludes:
 * a "never mention X" line puts X in the context and primes the model to say it.
 *
 * ⚠️ IT QUOTED USD SUBSCRIPTION TIERS ($15 / $99 / $299) THAT MATCHED NOTHING THE WALLET CHARGES. Every number here is
 * read from lib/credits/pricing.ts (credits + GEL), so a price change there is a price change here.
 *
 * ⚠️ IT HAD TWO MARKDOWN RULES THAT DISAGREED ("Markdown: always" vs "match the length"). There is exactly one
 * FORMAT rule now; the test counts it.
 *
 * ⚠️ IT TOLD THE MODEL TO "START THE GENERATION". A text reply cannot start anything — the studio routes clear
 * requests itself (lib/chat/studioIntent.ts, detectIntent, the Agent G editor router) and the user runs tools from
 * the composer. A model that believes it started a render tells the user a video is on its way when nothing is.
 *
 * Pure (no I/O, no env); the date line is computed per call so a cached prompt can never serve yesterday's date.
 */
import { ALL_TOOLS, TOOL_META, type ToolId } from '@/lib/studio/tools';
import { CREDIT_COSTS, CREDIT_PACKAGES, CREDIT_VALUE_GEL, creditsToGel } from '@/lib/credits/pricing';

export type PlatformPromptLocale = 'ka' | 'en' | 'ru';

/**
 * The Google engine that is the PRIMARY path for a tool today. A tool that is absent here gets no engine name.
 *
 * ⚠️ `image` IS DELIBERATELY ABSENT. The Image tool posts to /api/nanobanana/image, whose cascade (a third-party
 * service, then two non-Google backups) has no Gemini leg — see the same lesson in lib/services/serviceCatalogue.ts.
 * Gemini image is real, but only for the film storyboard frames (app/api/film/storyboard → lib/ai/geminiImage.ts),
 * so that is where it is named. Add `image: 'Gemini image'` in the same commit that moves the Image tool onto it.
 */
const TOOL_ENGINE: Partial<Record<ToolId, string>> = {
  video: 'Veo; storyboard frames by Gemini image',
  product: 'Veo',
  music: 'Lyria',
  chat: 'Gemini',
};

/**
 * Button and menu labels the prompt points users at, copied from the UI (they are not exported there):
 * the composer's "+" sheet title (components/studio/ui/ToolSheet.tsx), the side menu's services entry and the top-up
 * button (components/studio/ChatChrome.tsx), and the Live voice chip (the composer in OmniStudio). The test scans
 * components/ for each literal, so a renamed button fails CI instead of sending users to a button that is gone.
 */
export const PLATFORM_UI_LABELS: Readonly<Record<PlatformPromptLocale, {
  language: string; toolsSheet: string; services: string; liveVoice: string; topUp: string;
}>> = {
  ka: { language: 'Georgian (ქართული)', toolsSheet: 'დამატება და ხელსაწყოები', services: 'სერვისები', liveVoice: 'ცოცხალი ხმა', topUp: 'შევსება' },
  en: { language: 'English', toolsSheet: 'Add and tools', services: 'Services', liveVoice: 'Live voice', topUp: 'Top up' },
  ru: { language: 'Russian (Русский)', toolsSheet: 'Добавить и инструменты', services: 'Сервисы', liveVoice: 'Живой голос', topUp: 'Пополнить' },
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** "Wednesday, 30 September 2026, 12:00" in Tbilisi. Georgia is UTC+4 all year (no DST since 2005); the fixed-offset
 *  branch only runs where Intl has no time-zone data. */
function tbilisiNow(now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tbilisi', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    const out = `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')}`;
    if (get('weekday') && get('year') && get('minute')) return out;
  } catch {
    /* fall through to the fixed offset */
  }
  const t = new Date(now.getTime() + 4 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${WEEKDAYS[t.getUTCDay()]}, ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

const gel = (credits: number): string => creditsToGel(credits).toFixed(2);
const cr = (credits: number): string => `${credits} cr (${gel(credits)} ₾)`;

function toolLines(loc: PlatformPromptLocale): string {
  return ALL_TOOLS.map((id) => {
    const meta = TOOL_META[id];
    const engine = TOOL_ENGINE[id];
    return `- ${meta.name[loc]} — ${meta.sub[loc]}${engine ? ` · ${engine}` : ''}`;
  }).join('\n');
}

/**
 * ⚠️ THE DURATION BANDS ARE creditCostFor's, NOT THE KEY NAMES'. `video_30s` / `music_60s` read like "the price of a
 * 30-second video", but every route charges through creditCostFor, which bills anything under 60 s at video_30s
 * (the studio's 8/24/48 s videos included) and 60 s or more at video_60s. Quoting "25 cr for 30 s" left a 48-second
 * video to the model's guesswork. The test pins these bands to creditCostFor, so moving a threshold there fails CI.
 */
function priceBlock(topUp: string): string {
  const C = CREDIT_COSTS;
  const chat = C.chat_message > 0 ? `chat ${cr(C.chat_message)} per message` : 'chat is free';
  const packs = CREDIT_PACKAGES.map((p) => `${p.gel} ₾ = ${p.credits} cr`).join(', ');
  return [
    `PRICES (cr = credits; 1 credit = ${CREDIT_VALUE_GEL.toFixed(2)} ₾; ${chat}): image ${cr(C.image_generate)} each;`,
    `video ${cr(C.video_30s)} under 60 s, ${cr(C.video_60s)} for 60 s or more; music ${cr(C.music_30s)} under 60 s,`,
    `${cr(C.music_60s)} for 60–89 s, ${cr(C.music_90s)} for 90 s or more; talking avatar ${cr(C.avatar_30s)}; remix ${cr(C.remix_video)}; 3D model ${cr(C.model3d)}.`,
    `Top-ups ("${topUp}"): ${packs}. Quote prices only in credits and lari and only these numbers; for anything not listed, do not guess.`,
  ].join(' ');
}

/**
 * The platform system prompt for one reply locale. `locale` is the RESPONSE language the route already resolved
 * (explicit UI choice, else the latest message's script — lib/chat/replyLocale.ts); anything else falls back to ka.
 * The route layers the user's memory/profile facts and the agent persona on top of this (lib/agents/profile.ts).
 */
export function buildPlatformPrompt(opts: { locale: 'ka' | 'en' | 'ru'; now?: Date; /** false = this turn has no Google Search tool (a persona turned it off). Default true. */ googleSearch?: boolean }): string {
  const loc: PlatformPromptLocale = opts?.locale === 'en' || opts?.locale === 'ru' ? opts.locale : 'ka';
  const now = opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
  const ui = PLATFORM_UI_LABELS[loc];

  return [
    `You are Agent G, the assistant of MyAvatar.ge — a Georgian AI creative studio built on Google AI. You run on Google Gemini. If asked who you are: "I'm Agent G, MyAvatar.ge's AI assistant." Be warm, precise and specific — never generic, evasive or padded.`,

    `CURRENT DATE & TIME in Tbilisi, Georgia (UTC+4): ${tbilisiNow(now)}. Use exactly this for any question about the date, day or time — never a placeholder.`,

    `LANGUAGE: Reply in ${ui.language}. Switch only if the user asks for another language. Georgian is always written in Mkhedruli, never Latin transliteration, and in a natural, conversational register.`,

    // ⚠️ THE PROMPT MUST NOT PROMISE A TOOL THE REQUEST DOES NOT CARRY. A persona with googleSearch:false (Strict Coder,
    // or a custom one) gets no google_search tool; telling that turn to "search first" invited a stale answer from
    // memory presented as fresh, or a claim that it had searched.
    opts?.googleSearch === false
      ? `SEARCH: You cannot search the web in this conversation. For anything that can change over time — news, prices, exchange rates, scores, releases, "latest" — say plainly that your information may be out of date instead of presenting it as current.`
      : `SEARCH: You have Google Search. For anything that can change over time — news, who currently holds an office or title, prices, exchange rates, scores, weather, releases, "latest", anything after your training — search first and answer from the results, not from memory. Evergreen facts, maths, code and creative writing need no search.`,

    `ANSWERING: You are a complete general-purpose assistant. Answer any question — knowledge, science, maths, code, writing, translation, business, health, everyday life — accurately and fully; never call a topic "outside the platform". Help people find films, series, books and music and where to watch or buy them legally; never help with piracy. When the user attaches images, PDFs, audio or video, read them fully and answer about them. Lines like "[generated video: <url>]" mark results the studio already made in this chat: refer to them, but you cannot see their content unless they are attached again.`,

    `FORMAT: Fit the length to the question — a simple or casual question gets one to three plain sentences, no headings. Use Markdown only when structure helps: short ## headings, bullet or numbered lists, tables for comparisons, fenced code blocks with a language tag for all code, LaTeX maths in $…$ or $$…$$. Answer first; no filler, no restating the question, no generic disclaimers.`,

    `STUDIO TOOLS (name — what it does · Google engine):\n${toolLines(loc)}\nVoice: the "${ui.liveVoice}" button starts a live spoken conversation (Gemini Live) for signed-in users, and replies can be read aloud (Gemini TTS).\nWhen asked which engine powers something, name only the Google engines listed here; for a tool with none listed, describe what it makes — never guess or name another vendor.`,

    `HANDING OFF: You cannot start, queue or finish a render from a text reply — the studio runs the tools. A clear request typed in chat (e.g. "make a 30-second video of …") is usually routed to the right tool automatically, and every tool opens from "${ui.toolsSheet}" (the + button) or "${ui.services}" in the side menu. So when someone wants to create or edit media and the request reached you, name the tool and how to open it in one sentence, then offer a ready-to-use prompt. Never say a result exists that you have not seen. Never reply with JSON, commands or routing payloads — plain language only. Bring up tools only when the user wants to make or edit media, or asks about the platform. Creating media needs a signed-in account; paid tools spend credits.`,

    priceBlock(ui.topUp),
  ].join('\n\n');
}
