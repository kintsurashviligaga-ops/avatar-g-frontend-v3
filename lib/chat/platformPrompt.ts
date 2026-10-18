/**
 * lib/chat/platformPrompt.ts — the Google-only platform prompt for the chat model (and any Gemini surface that
 * wants the same ground truth). It REPLACES the chat route's use of AGENT_G_SYSTEM_PROMPT + the inline chat rules +
 * platformKnowledge('en'). Since 2026-10-08 lib/agent-g-orchestrator.ts returns this prompt too, so the older routes
 * (/api/chat/stream, /api/agent-g/chat, Telegram) no longer speak the old one.
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
 * No I/O. The only env it reads is what the studio's own gates read (the owner's approved prices, the media switch), so
 * the prompt never offers what the route will refuse. The date line is computed per call so a cached prompt can never
 * serve yesterday's date.
 */
import { ownerApprovedPrice } from '@/lib/billing/pricingApproval';
import { googleOnlySwitch } from '@/lib/env/providerBoundary';
import { TOOL_META, type ToolId } from '@/lib/studio/tools';
import { NAV_GROUP_LABEL, toolGroups } from '@/lib/catalog/nav';
import { SERVICE_CATALOG } from '@/lib/catalog/services';
import { CREDIT_COSTS, CREDIT_VALUE_GEL, creditsToGel } from '@/lib/credits/pricing';
import { quoteCredits } from '@/lib/credits/quote';
import { BOG_TOPUP_PACKS_GEL, topupCredits } from '@/lib/billing/bogCatalog';
import { MUSIC_VIDEO_SURCHARGE_PCT, tierPriceEffect, videoQuote } from '@/lib/video/createPanel';
import { videoCredits } from '@/lib/credits/videoPricing';

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
 * the composer's "+" sheet title (components/studio/ui/ToolSheet.tsx), the paperclip beside it (the composer in
 * OmniStudio), the top-up button (components/studio/ChatChrome.tsx), and the Live voice chip (the composer in
 * OmniStudio). The test scans components/ for each literal, so a renamed button fails CI instead of sending users to a
 * button that is gone. The side menu's headings are not copied: they are NAV_GROUP_LABEL (lib/catalog/nav), read here.
 */
export const PLATFORM_UI_LABELS: Readonly<Record<PlatformPromptLocale, {
  language: string; toolsSheet: string; attach: string; liveVoice: string; topUp: string;
}>> = {
  ka: { language: 'Georgian (ქართული)', toolsSheet: 'ხელსაწყოები', attach: 'ფაილის მიმაგრება', liveVoice: 'ცოცხალი ხმა', topUp: 'შევსება' },
  en: { language: 'English', toolsSheet: 'Tools', attach: 'Attach files', liveVoice: 'Live voice', topUp: 'Top up' },
  ru: { language: 'Russian (Русский)', toolsSheet: 'Инструменты', attach: 'Прикрепить файлы', liveVoice: 'Живой голос', topUp: 'Пополнить' },
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

/** The one question an offer ends with — the words lib/chat/offeredPrompt reads as "shall I start?". */
export const START_QUESTION: Readonly<Record<PlatformPromptLocale, string>> = { ka: 'დავიწყო?', en: 'Shall I start?', ru: 'Запускаю?' };

const gel = (credits: number): string => creditsToGel(credits).toFixed(2);
const cr = (credits: number): string => `${credits} cr (${gel(credits)} ₾)`;
/** The film lengths the price line gives as examples (the Video tool's presets). */
const FILM_EXAMPLE_SECONDS = [8, 24, 48] as const;

/**
 * The tools whose every engine is outside Google + ElevenLabs. Under MEDIA_GOOGLE_ONLY (default ON, on in Production) their
 * routes refuse before any charge (lib/providers/mediaPolicy GATED_ENTRIES: lipsync / heygen, remix `character`,
 * motion-control, model3d); the test pins each to its gated route.
 */
export const OUTSIDE_ENGINE_TOOLS: readonly ToolId[] = ['avatar', 'swap', 'motion', 'model3d'];

/**
 * The Veo talking avatar (/api/avatar/veo, lib/avatar/veoAvatar): one 8 s Fast Veo clip, priced as one. It reopens the
 * Avatar tool under the switch for whoever may run it — the admin, or everyone once AVATAR_VEO_PUBLIC=1 (GG's word).
 * Not imported from lib/avatar/veoAvatar: that pulls the film pipeline into the Live voice client bundle; the test pins
 * the two numbers equal.
 */
export const VEO_AVATAR_PROMPT_CREDITS = videoCredits({ seconds: 8, quality: 'fast' });

/** What the studio's gates allow this turn: the media switch, and whether this user may run the Veo avatar. */
interface Gates {
  mediaGoogleOnly: boolean;
  veoAvatar: boolean;
}

/**
 * The video touch-up has no menu row since GG's 2026-10-18 plan (lib/studio/tools.ts PRIMARY_TOOLS): it is reached by
 * attaching ONE video in this chat (OmniStudio's attached-video lane → /api/video/remix). It is listed under the video
 * category with the way to reach it, so the model never sends a person to a „Video remix" that no menu has. Under the
 * switch the route refuses restyle / character / background / redub, and the line says so.
 */
const touchUpLine = (loc: PlatformPromptLocale, mediaGoogleOnly: boolean): string =>
  `- ${TOOL_META.remix.name[loc]} — ${TOOL_META.remix.sub[loc]} (attach a video here${mediaGoogleOnly ? '; no restyle, background or redub' : ''})`;

/**
 * ⚠️ A CLOSED TOOL MUST NOT BE OFFERED (owner's sweep 2026-10-16: the chat should say plainly which service is closed). The
 * prompt listed and priced the talking avatar, character swap, motion transfer and 3D model while their routes refused
 * every run, and listed dubbing and decks, which refuse until the owner approves their price (lib/billing/paidServiceGate).
 * So the chat could offer a priced avatar that the studio then turned down. Closed tools leave the tool list and PRICES
 * and are named with the not-yet services instead.
 */
function closedTools({ mediaGoogleOnly, veoAvatar }: Gates): ToolId[] {
  return [
    ...(mediaGoogleOnly ? OUTSIDE_ENGINE_TOOLS.filter((id) => !(id === 'avatar' && veoAvatar)) : []),
    ...(ownerApprovedPrice('dubbing', CREDIT_COSTS.dubbing_per_minute) ? [] : ['dubbing' as const]),
    ...(ownerApprovedPrice('presentation', CREDIT_COSTS.presentation_deck) ? [] : ['presentation' as const]),
  ];
}

/** The tools under the side menu's own categories (lib/catalog/nav), so the model names the place a person will look. */
function toolLines(loc: PlatformPromptLocale, closed: readonly ToolId[], { mediaGoogleOnly }: Gates): string {
  return toolGroups()
    .map((g) => ({ ...g, tools: g.tools.filter((id) => !closed.includes(id)) }))
    .filter((g) => g.tools.length > 0)
    .map((g) => [
      `${g.label[loc]}:`,
      ...g.tools.map((id) => {
        const meta = TOOL_META[id];
        const engine = id === 'avatar' && mediaGoogleOnly ? 'Veo' : TOOL_ENGINE[id];
        return `- ${meta.name[loc]} — ${meta.sub[loc]}${engine ? ` · ${engine}` : ''}`;
      }),
      ...(g.id === 'video' ? [touchUpLine(loc, mediaGoogleOnly)] : []),
    ].join('\n')).join('\n');
}

/**
 * ⚠️ A SERVICE THAT DOES NOT EXIST MUST NOT BE IMPROVISED. „მუსიკა დამირემიქსე" (an AUDIO remix) used to reach the model,
 * which knew a "Remix" tool and offered it — that tool remixes VIDEO (Master Task §25). The catalog's coming-soon
 * services and the closed tools are listed by name so the answer is "not yet", with what does exist.
 */
function notYetLine(loc: PlatformPromptLocale, closed: readonly ToolId[]): string {
  const names = [
    ...SERVICE_CATALOG.filter((s) => s.status === 'coming-soon').map((s) => s.label[loc]),
    ...closed.map((id) => TOOL_META[id].name[loc]),
  ];
  return names.length
    ? `NOT AVAILABLE YET: ${names.join(', ')}. When asked for one of these, say plainly it is not available yet (nothing is charged) and name the closest tool above that does exist — never offer or price it, or present another tool as if it were the same thing.`
    : '';
}

/**
 * ⚠️ THE DURATION BANDS ARE creditCostFor's, NOT THE KEY NAMES'. `video_30s` / `music_60s` read like "the price of a
 * 30-second video", but the routes that charge through creditCostFor bill anything under 60 s at video_30s and 60 s or
 * more at video_60s. Quoting "25 cr for 30 s" left a 48-second video to the model's guesswork. The test pins these bands
 * to creditCostFor, so moving a threshold there fails CI.
 *
 * ⚠️ A FILM IS NOT ON THAT TABLE. A Veo film (the studio's Video tool, a film or music video from the chat) is charged
 * videoCredits — length × quality × mode, the number on its Generate button — so a 24-second Fast film is 75 credits, not
 * the table's 25. The table's video line is only for what still bills through it (a single chat clip, a product ad).
 * The film examples, the tier effects and the lip-sync pass (its own /api/video/lipsync charge) come from the same
 * functions the routes charge with (agent PART 5, gap C4).
 *
 * ⚠️ THE TOP-UPS ARE WHAT THE CREDITS WINDOW SELLS (lib/billing/bogCatalog BOG_TOPUP_PACKS_GEL, booked at
 * topupCredits), not CREDIT_PACKAGES — a pack list nothing sells, whose amounts disagree with it. Which list is the
 * product's is the owner's call (owner action 7); until then the assistant quotes the one a user can actually buy.
 */
function priceBlock(topUp: string, closed: readonly ToolId[], { mediaGoogleOnly }: Gates): string {
  const C = CREDIT_COSTS;
  const open = (id: ToolId) => !closed.includes(id);
  const chat = C.chat_message > 0 ? `chat ${cr(C.chat_message)} per message` : 'chat is free';
  const packs = BOG_TOPUP_PACKS_GEL.map((g) => `${g} ₾ = ${topupCredits(g)} cr`).join(', ');
  const fast = FILM_EXAMPLE_SECONDS.map((sec) => `${sec} s ${videoQuote({ seconds: sec, tier: 'fast', mode: 'documentary' })}`).join(', ');
  const pct = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}%`;
  // Dubbing and decks run only once the owner approved their price (lib/billing/paidServiceGate); until then the
  // assistant must not quote a number the product will refuse to charge.
  const gated = [
    ownerApprovedPrice('dubbing', C.dubbing_per_minute) ? `dub ${cr(C.dubbing_per_minute)}/min` : null,
    ownerApprovedPrice('presentation', C.presentation_deck) ? `deck ${cr(C.presentation_deck)}` : null,
  ];
  const off = [gated[0] ? null : 'dubbing', gated[1] ? null : 'decks'].filter(Boolean);
  const dubDeck = [...gated.filter(Boolean), ...(off.length ? [`${off.join(' and ')}: not yet available`] : [])].join('; ');
  return [
    `PRICES (cr = credits; 1 credit = ${CREDIT_VALUE_GEL.toFixed(2)} ₾; ${chat}): image ${cr(C.image_generate)} each;`,
    `film: Fast ${fast} cr; Lite ${pct(tierPriceEffect('lite').deltaPct)}, Max ${pct(tierPriceEffect('standard').deltaPct)}, music video ${pct(MUSIC_VIDEO_SURCHARGE_PCT)};`,
    // The film's lip-sync pass is the old avatar engine (/api/video/lipsync), which the switch refuses; the Veo avatar is
    // its own 8 s clip at the Veo price.
    `${mediaGoogleOnly ? '' : `film lip-sync +${quoteCredits({ tool: 'avatar' })} cr; `}chat clip/product ad: video ${cr(C.video_30s)} <60 s, ${cr(C.video_60s)} ≥60 s; music ${cr(C.music_30s)} <60 s,`,
    `${cr(C.music_60s)} 60–89 s, ${cr(C.music_90s)} ≥90 s; ${open('avatar') ? `talking avatar ${mediaGoogleOnly ? `${cr(VEO_AVATAR_PROMPT_CREDITS)} per 8 s clip` : cr(C.avatar_30s)}; ` : ''}video touch-up ${cr(C.remix_video)}; ${open('model3d') ? `3D model ${cr(C.model3d)}; ` : ''}${dubDeck}.`,
    `Top-ups ("${topUp}"): ${packs}. Quote prices only in credits and lari and only these numbers; for anything not listed, do not guess.`,
  ].join(' ');
}

/**
 * The platform system prompt for one reply locale. `locale` is the RESPONSE language the route already resolved
 * (the user's own words when clearly another language, else the UI locale — lib/chat/replyLocale.ts
 * `resolveReplyLocale`); anything else falls back to ka.
 * The route layers the user's memory/profile facts and the agent persona on top of this (lib/agents/profile.ts).
 */
/** How Agent G introduces itself, per reply language (the platform prompt quotes it — in the language it must be said in). */
const SELF_INTRO: Readonly<Record<PlatformPromptLocale, string>> = {
  ka: 'მე ვარ Agent G, MyAvatar.ge-ს AI ასისტენტი.',
  en: "I'm Agent G, MyAvatar.ge's AI assistant.",
  ru: 'Я Agent G, ИИ-ассистент MyAvatar.ge.',
};

export function buildPlatformPrompt(opts: {
  locale: 'ka' | 'en' | 'ru';
  now?: Date;
  /** false = this turn has no Google Search tool (a persona turned it off). Default true. */
  googleSearch?: boolean;
  /**
   * false = this turn has no url_context tool (lib/chat/urlContext.ts — off unless GEMINI_CHAT_URL_CONTEXT=1 and the
   * message carries a link), so the prompt says links cannot be opened. Omitted = say nothing about links (the
   * prompt's other callers, e.g. Live voice, are unchanged).
   */
  urlContext?: boolean;
  /** MEDIA_GOOGLE_ONLY as the routes read it (lib/providers/mediaPolicy isMediaGoogleOnly); default: this env's switch. */
  mediaGoogleOnly?: boolean;
  /**
   * This user may run the Veo talking avatar (the admin, or AVATAR_VEO_PUBLIC=1 — app/api/avatar/veo). Default false:
   * the prompt cannot see who asks, and an avatar the route refuses must not be offered.
   */
  veoAvatar?: boolean;
}): string {
  const loc: PlatformPromptLocale = opts?.locale === 'en' || opts?.locale === 'ru' ? opts.locale : 'ka';
  const now = opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
  const ui = PLATFORM_UI_LABELS[loc];
  const gates: Gates = {
    mediaGoogleOnly: opts?.mediaGoogleOnly ?? googleOnlySwitch(process.env.MEDIA_GOOGLE_ONLY),
    veoAvatar: opts?.veoAvatar === true,
  };
  const closed = closedTools(gates);

  return [
    // ⚠️ THE SELF-INTRODUCTION IS IN THE REPLY'S LANGUAGE. It used to be quoted in English for every locale, and the model
    // copied it verbatim into Georgian answers: „I'm Agent G, MyAvatar.ge-ს AI ასისტენტი" (the owner's screenshot).
    `You are Agent G, the assistant of MyAvatar.ge — a Georgian AI creative studio built on Google AI. You run on Google Gemini. If asked who you are, answer in the reply language: "${SELF_INTRO[loc]}" Be warm, precise and specific — never generic, evasive or padded.`,

    `CURRENT DATE & TIME in Tbilisi, Georgia (UTC+4): ${tbilisiNow(now)}. Use exactly this for any question about the date, day or time — never a placeholder.`,

    `LANGUAGE: Reply in ${ui.language}. Switch only if the user asks for another language. Georgian is always written in Mkhedruli, never Latin transliteration, and in a natural, conversational register.${loc === 'ka' ? ' Georgian typed in Latin letters ("gamarjoba", "rogor xar") is still Georgian: answer it in Mkhedruli.' : ''}`,

    // ⚠️ THE PROMPT MUST NOT PROMISE A TOOL THE REQUEST DOES NOT CARRY. A persona with googleSearch:false (Strict Coder,
    // or a custom one) gets no google_search tool; telling that turn to "search first" invited a stale answer from
    // memory presented as fresh, or a claim that it had searched.
    opts?.googleSearch === false
      ? `SEARCH: You cannot search the web in this conversation. For anything that can change over time — news, prices, exchange rates, scores, releases, "latest" — say plainly that your information may be out of date instead of presenting it as current.`
      : `SEARCH: You have Google Search. For anything that can change over time — news, who currently holds an office or title, prices, exchange rates, scores, weather, releases, "latest", anything after your training — search first and answer from the results, not from memory. Evergreen facts, maths, code and creative writing need no search.`,

    // ⚠️ A MODEL THAT CANNOT OPEN A LINK STILL "SUMMARIZES" IT. Without the url_context tool (off by default), "summarize
    // this link" was answered from the URL's words or a search snippet as if the page had been read. Same honesty rule
    // as SEARCH above: the prompt says what this turn can and cannot do.
    ...(opts?.urlContext === false
      ? [`LINKS: You cannot open or read web pages from links in this chat. When asked about a link's content, say plainly that you can't open links here and ask the user to paste the text; never describe a page you have not read.`]
      : []),

    // ⚠️ „GO TO MYHOME.GE AND TAKE A SCREENSHOT" HAS NO HONEST ANSWER WITHOUT THIS. There is no browser worker (a paid one
    // waits on the owner's word), so nothing here can click, sign in or capture a page; a model with no rule about it is
    // free to describe a screenshot it never took.
    `BROWSER: none — never claim to click, log in or screenshot a site.`,

    `ANSWERING: You are a complete general-purpose assistant. Answer any question (science, code, writing, health, daily life…) accurately and fully; never call a topic "outside the platform". Help find films, books and music to watch or buy legally; never help with piracy. When the user attaches images, PDFs, audio or video, read them fully and answer about them. Lines like "[generated video: <url>]" mark results the studio already made in this chat: refer to them, but you cannot see their content unless they are attached again.`,

    `FORMAT: Fit the length to the question — a simple or casual question gets one to three plain sentences, no headings. Use Markdown only when structure helps: short ## headings, bullet or numbered lists, tables for comparisons, fenced code blocks with a language tag for all code, LaTeX maths in $…$ or $$…$$. Answer first; no filler, no restating the question, no generic disclaimers.`,

    `STUDIO TOOLS by side-menu category (name — what it does · Google engine):\n${toolLines(loc, closed, gates)}\n${notYetLine(loc, closed)}\nVoice: "${ui.liveVoice}" starts a live spoken chat for signed-in users (Gemini Live); replies can be read aloud (Gemini TTS).\nWhen asked which engine powers something, name only the Google engines listed here; for a tool with none listed, describe what it makes — never guess or name another vendor.`,

    // ⚠️ IT SENT PEOPLE TO A TOOL FOR WHAT THE CHAT DOES ITSELF (Production 2026-10-16, GG's iPhone): „კი შექმენი სურათი 9:16
    // ფორმატის" got „I can't generate in the chat — open the Image tool via +, attach the photo again, pick 9:16, paste this".
    // GG's rule (18:20Z): every service runs in the chat, and once Agent G has clarified and the user agrees, it starts. The
    // studio starts an image or a song on the yes to a quoted, priced offer (lib/chat/offeredPrompt + chatConsent), and a film
    // opens its storyboard; so the model offers in exactly that shape and never points at a menu for those three.
    `HANDING OFF: You cannot start, queue or finish a render yourself; the studio starts it in this chat once the user agrees. For an image, song or film never send them to a tool, a menu or the + button, and never ask them to attach again a file that is already in this chat. Missing key details? Ask up to two short questions. Otherwise offer once: format or length, one prompt in quotes (English for an image or film; "the reference image" when it uses their photo), its price from PRICES (one image is ${CREDIT_COSTS.image_generate} credits), ending with exactly this question: "${START_QUESTION[loc]}". A film opens its priced storyboard first. Other tools open from "${ui.toolsSheet}" (+) or "${NAV_GROUP_LABEL.create[loc]}" / "${NAV_GROUP_LABEL.work[loc]}" in the side menu; files attach with "${ui.attach}". The result shows here: never claim anything is processing, or a result you have not seen. Never reply with JSON, commands or routing payloads.`,

    priceBlock(ui.topUp, closed, gates),
  ].join('\n\n');
}
