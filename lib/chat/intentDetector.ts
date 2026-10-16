/**
 * lib/chat/intentDetector.ts
 * ==========================
 * Detects user intent from natural-language input.
 * Returns a typed intent + confidence so the orchestrator
 * can route to the correct provider (text LLM vs Replicate).
 */

export type IntentCategory =
  | 'text_chat'
  | 'avatar_generation'
  | 'image_generation'
  | 'photo_edit'
  | 'video_generation'
  | 'music_generation'
  | 'visual_analysis'
  | 'workflow_help'
  | 'business_help'
  | 'prompt_improvement';

export interface DetectedIntent {
  intent: IntentCategory;
  confidence: number; // 0-1
  provider: 'replicate' | 'text-llm';
  serviceHint?: string;
}

// ── Keyword / pattern banks per intent ──────────────────────────────────────

interface IntentRule {
  intent: IntentCategory;
  provider: 'replicate' | 'text-llm';
  /** Patterns tested with .test() — first match wins within the bank */
  patterns: RegExp[];
  /** Base confidence when a pattern matches */
  weight: number;
  /** If the active service context matches these, boost confidence */
  contextBoost?: string[];
}

const RULES: IntentRule[] = [
  // ── Avatar generation ──────────────────────────────────────────────
  {
    intent: 'avatar_generation',
    provider: 'replicate',
    weight: 0.85,
    contextBoost: ['avatar'],
    patterns: [
      /\bavatar\b/i,
      /\b(create|generate|make|render|build)\b.*\b(portrait|headshot|character|profile\s*pic)/i,
      /\b(face|identity)\b.*\b(transfer|swap|morph)/i,
      /\binstant[- ]?id\b/i,
      /\bface[- ]?to[- ]?many\b/i,
      /\bსახე|ავატარ|аватар|портрет/i,
    ],
  },
  // ── Image generation ───────────────────────────────────────────────
  {
    intent: 'image_generation',
    provider: 'replicate',
    weight: 0.82,
    contextBoost: ['image', 'interior'],
    patterns: [
      // ⚠️ `photo` AND `picture` WERE MISSING FROM THIS LIST, which is how "Make the photo of the jungle"
      // — a plain, imperative image request — classified as text_chat and got a chatty essay about what
      // Image Studio *would* do. They are the two commonest words for the thing this service makes.
      /\b(generate|create|make|render|design)\b.*\b(image|photo|picture|pic|poster|thumbnail|banner|illustration|graphic|artwork|wallpaper|portrait)/i,
      /\b(image|poster|thumbnail|banner)\b.*\b(generat|creat|render)/i,
      /\bflux\b/i,
      /\bsdxl\b/i,
      /\bphoto[ -]?real/i,
      /\b3d\s*render/i,
      /\bგამოსახულება|изображени|картинк|фото|плакат|постер|обо[ий]/i,
      // ⚠️ "draw me a cat" HAD NO PATTERN AT ALL. Every rule above needs a media NOUN
      // (image/poster/banner/…), and "cat" is not one — so the most canonical image request in the
      // language classified as text_chat and the user got a conversational reply instead of a picture.
      // For these four verbs the VERB IS the intent; the exclusions are the only common senses that
      // mean something other than "make a picture".
      /\b(draw|sketch|illustrate|paint)\b(?!\s+(a\s+|the\s+|your\s+|my\s+)?(conclusion|comparison|parallel|distinction|analogy|attention|inspiration|line\b))/i,
      // No `\b` — it is ASCII-only and never matches before a Cyrillic letter (see isGenerativeCommand).
      /(нарисуй|изобрази|набросай)/i,
      // Georgian: image/photo/drawing/portrait noun near a generate verb (either order). Catches
      // "გამიკეთე სურათი", "დახატე კატა", "სურათი შემიქმენი". The negative lookahead keeps the GENERIC
      // verbs (გააკეთ/გამიკეთ = "do/make") from hijacking an ANALYSIS/DESCRIPTION request such as
      // "გააკეთე ფოტოს ანალიზი" (do an analysis of the photo) into a paid img2img render — those fall
      // through to visual_analysis (see below) and the vision chat stream instead.
      /(გამიკეთ|გააკეთ|შემიქმენ|შექმენ|დამიხატ|დახატ|დამიგენერირ|დააგენერირ|დაგენერირ|გამოსახ)(?!.{0,40}(ანალიზ|აღწერ)).{0,40}(სურათ|ფოტო|ნახატ|გამოსახ|პორტრეტ|ილუსტრაცი)/,
      /(სურათ|ფოტო|ნახატ|პორტრეტ|ილუსტრაცი).{0,40}(გამიკეთ|გააკეთ|შემიქმენ|შექმენ|დამიხატ|დახატ|დამიგენერირ|დააგენერირ)/,
      // ⚠️ Georgian verbs carry a PREVERB and an OBJECT MARKER, so the real imperative a user types is
      // `დამიხატე` (draw for ME), not the bare `დახატე` this pattern used to hold. `დამიხატე ლამაზი კატა`
      // matched nothing — neither this nor the noun-bearing rules above, whose object list has no "cat".
      /(და)?(მი|გვი)?ხატ(ე|ავ|ო)/,
    ],
  },
  // ── Photo edit / enhancement ───────────────────────────────────────
  {
    intent: 'photo_edit',
    provider: 'replicate',
    weight: 0.88,
    contextBoost: ['photo'],
    patterns: [
      /\b(upscale|enhance|improve|restore|sharpen|denoise)\b/i,
      /\b(remove|delete)\s*(the\s*)?(background|bg)\b/i,
      /\brembg\b/i,
      /\breal[- ]?esrgan\b/i,
      /\bbefore\s*(\/|and)\s*after\b/i,
      /\bretouch/i,
      /\bsuper[- ]?res/i,
      /\bგაუმჯობესება|улучш|масштаб/i,
    ],
  },
  // ── Video generation ───────────────────────────────────────────────
  {
    intent: 'video_generation',
    provider: 'replicate',
    weight: 0.84,
    contextBoost: ['video', 'editing'],
    patterns: [
      /\b(generate|create|make|render)\b.*\bvideo\b/i,
      /\bvideo\b.*\b(generat|creat|render)/i,
      /\b(promo|reel|clip|trailer|short)\b.*\b(video|film|motion)/i,
      /\btext[- ]?to[- ]?video\b/i,
      /\bimg[- ]?to[- ]?vid/i,
      /\banimate\b/i,
      /\b9\s*:\s*16\b.*\b(video|promo|reel)/i,
      /ვიდეო|видео|ролик/i,
      /(გამიკეთ|გააკეთ|შემიქმენ|შექმენ|დააგენერირ|დაგენერირ|გადამიღ|გადაიღ).{0,40}(ვიდეო|რგოლ|კლიპ|ფილმ)/,
      /(ვიდეო|რგოლ|კლიპ|ფილმ).{0,40}(გამიკეთ|გააკეთ|შემიქმენ|შექმენ|დააგენერირ)/,
    ],
  },
  // ── Music generation ───────────────────────────────────────────────
  {
    intent: 'music_generation',
    provider: 'replicate',
    weight: 0.86,
    contextBoost: ['music'],
    patterns: [
      // `write` belongs here: "write me a song about love" is how people ask for a song, and with only
      // generate/create/make/compose it classified as text_chat and got a conversational reply.
      /\b(generate|create|make|compose|write|pen)\b.*\b(music|beat|song|track|soundtrack|melody|instrumental|lyrics)/i,
      /\b(music|beat|song|track|soundtrack)\b.*\b(generat|creat|compos)/i,
      /\bmusicgen\b/i,
      /\b(ambient|cinematic|trap|house|orchestral)\b.*\b(track|beat|music)/i,
      // Stems, not whole words: Russian and Georgian both inflect the object, so `музыка` missed the
    // accusative `музыку` that any real request uses ("сочини музыку для видео") — and the bare `видео`
    // in that same sentence then handed a MUSIC request to the video bank.
    /მუსიკ|მელოდი|სიმღერ|музык|трек|бит|песн|мелоди/i,
      /(გამიკეთ|გააკეთ|შემიქმენ|შექმენ|დააგენერირ|დაგენერირ|დამიწერ|დაწერ).{0,40}(მუსიკა|სიმღერ|მელოდი|ბიტ|ტრეკ)/,
      /(მუსიკა|სიმღერ|მელოდი).{0,40}(გამიკეთ|გააკეთ|შემიქმენ|შექმენ|დააგენერირ)/,
    ],
  },
  // ── Visual analysis ────────────────────────────────────────────────
  {
    intent: 'visual_analysis',
    provider: 'replicate',
    weight: 0.83,
    contextBoost: ['visual-intel', 'visual-ai'],
    patterns: [
      /\b(describe|analyze|caption|explain|score|audit)\b.*\b(image|photo|picture|visual)/i,
      /\b(image|photo|picture)\b.*\b(descri|analyz|caption|explain)/i,
      /\bvisual\s*(analysis|audit|intel)/i,
      /\bblip\b/i,
      /\bbrand\s*audit\b/i,
      // Include the BARE Georgian nouns ანალიზ ("analysis") + დაათვალიერ ("look over/inspect") — not just
      // the verb form გაანალიზ — so a photo-analysis ask outranks the image bank (0.83 > 0.82) and is NOT
      // dispatched to a paid render. `ანალიზ` also subsumes `გაანალიზ`.
      /\banaliz|описа|აღწერ|ანალიზ|დაათვალიერ|გაანალიზ/i,
    ],
  },
  // ── Workflow help ──────────────────────────────────────────────────
  {
    intent: 'workflow_help',
    provider: 'text-llm',
    weight: 0.75,
    contextBoost: ['workflow'],
    patterns: [
      /\b(workflow|pipeline|automat|schedul|trigger|dag)\b/i,
      /\b(build|create|set\s*up)\b.*\b(pipeline|workflow|automation)/i,
      /\bgate|retry|step/i,
    ],
  },
  // ── Business help ──────────────────────────────────────────────────
  {
    intent: 'business_help',
    provider: 'text-llm',
    weight: 0.76,
    contextBoost: ['business'],
    patterns: [
      /\b(business\s*plan|strategy|revenue|market\s*analysis|swot|forecast)/i,
      /\b(investor|pitch|memo|executive\s*summary)/i,
      /\bfinancial|roi|kpi|unit\s*economics/i,
      /\bბიზნეს|სტრატეგ|бизнес|стратег/i,
    ],
  },
  // ── Prompt improvement ─────────────────────────────────────────────
  {
    intent: 'prompt_improvement',
    provider: 'text-llm',
    weight: 0.70,
    contextBoost: ['prompt'],
    patterns: [
      /\b(improve|rewrite|optimize|enhance|refine)\b.*\bprompt\b/i,
      /\bprompt\b.*\b(improve|rewrite|optim|enhance)/i,
      /\bnegative\s*prompt/i,
      /\bprompt\s*(engineer|design)/i,
    ],
  },
];

/**
 * Detect intent from user message, optionally boosted by service context.
 */
export function detectIntent(
  message: string,
  serviceContext?: string,
): DetectedIntent {
  if (!message.trim()) {
    return { intent: 'text_chat', confidence: 1.0, provider: 'text-llm' };
  }

  let best: DetectedIntent | null = null;

  for (const rule of RULES) {
    const matched = rule.patterns.some((p) => p.test(message));
    if (!matched) continue;

    let confidence = rule.weight;

    // Boost confidence if the current service page matches
    if (serviceContext && rule.contextBoost?.includes(serviceContext)) {
      confidence = Math.min(1.0, confidence + 0.12);
    }

    if (!best || confidence > best.confidence) {
      best = {
        intent: rule.intent,
        confidence,
        provider: rule.provider,
        serviceHint: rule.contextBoost?.[0],
      };
    }
  }

  // If no pattern matched, fall through to context-based defaults
  if (!best) {
    // Service-context default: if on a generative page, hint generation
    if (serviceContext === 'avatar') return { intent: 'avatar_generation', confidence: 0.55, provider: 'replicate', serviceHint: 'avatar' };
    if (serviceContext === 'image') return { intent: 'image_generation', confidence: 0.55, provider: 'replicate', serviceHint: 'image' };
    if (serviceContext === 'interior') return { intent: 'image_generation', confidence: 0.55, provider: 'replicate', serviceHint: 'interior' };
    if (serviceContext === 'photo') return { intent: 'photo_edit', confidence: 0.55, provider: 'replicate', serviceHint: 'photo' };
    if (serviceContext === 'video') return { intent: 'video_generation', confidence: 0.55, provider: 'replicate', serviceHint: 'video' };
    if (serviceContext === 'music') return { intent: 'music_generation', confidence: 0.55, provider: 'replicate', serviceHint: 'music' };
    if (serviceContext === 'visual-ai' || serviceContext === 'visual-intel') return { intent: 'visual_analysis', confidence: 0.55, provider: 'replicate', serviceHint: 'visual-ai' };
    if (serviceContext === 'business') return { intent: 'business_help', confidence: 0.60, provider: 'text-llm', serviceHint: 'business' };
    if (serviceContext === 'workflow') return { intent: 'workflow_help', confidence: 0.60, provider: 'text-llm', serviceHint: 'workflow' };

    return { intent: 'text_chat', confidence: 0.90, provider: 'text-llm' };
  }

  return best;
}

// ─── Georgian orders (2026-10-16) ───────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ GEORGIAN PUTS THE VERB WHERE IT LIKES, AND THE GATE ONLY LOOKED AT THE START. The owner asked the chat for a picture, a
// song and a video in his own words and got a conversation back: „კატის სურათი დამიხატე" (a cat's picture — draw it),
// „მუსიკა შემიქმენი", „სიმღერა დამიწერე სიყვარულზე", the formal „გთხოვთ დამიხატეთ", „შეგიძლია დამიხატო?" (can you draw
// me…?), „მინდა კატის სურათი" (I want a picture of a cat). None LED with a verb, so none was an order, and the chat model —
// which can start nothing — answered in words. Nothing is charged on any of these: the chat shows Agent G's card (its
// questions or its price) and renders only on a tap, so reading an order too readily costs one card, never a credit.

/** Generate verbs as stems: the imperative („დამიხატე"), the formal plural („დამიხატეთ") and the form after „შეგიძლია"
 *  („დამიხატო", „შემიქმნა") all share them. */
const KA_GEN_VERB = 'გამიკეთ|გააკეთ|შემიქმენ|შემიქმნ|შექმენ|დამიხატ|დახატ|დამიგენერირ|დააგენერირ|დაგენერირ|გამომისახ|გამოსახ|დამიმზად|მიმზად|მომიმზად|მოამზად|გადამიღ|გადაიღ|შემიდგინ|დამიწერ|დაწერ|შემითხზ|დამირთ|დამიკომპონ';
/** The make-verbs a video is asked with. Not the writing verbs: „დამიწერე სცენარი ვიდეოზე" asks for a text. */
const KA_VIDEO_VERB = 'გამიკეთ|გააკეთ|შემიქმენ|შემიქმნ|შექმენ|დამიგენერირ|დააგენერირ|დაგენერირ|დამიმზად|მომიმზად|მოამზად|გადამიღ|გადაიღ';
/** Verbs that only ever mean „make me a picture / a clip / a track"; the others (do, prepare, write) need a media noun. */
const KA_MEDIA_ONLY_VERB = /^(?:დამიხატ|დახატ|დამიგენერირ|დააგენერირ|დაგენერირ|გამომისახ|გამოსახ|გადამიღ|გადაიღ|შემითხზ|დამიკომპონ)/;
/** Georgian writing verbs, in the imperative, formal and subjunctive forms („დაწერე", „დამიწერეთ", „დამიწერო"). */
const KA_WRITING_VERB = /^(?:დამიწერ|დაწერ|მომწერ|გადაწერ|გადამიწერ|შემიდგინ)(?:ე|ეთ|ო|ოთ)?(?=[\s,.!?]|$)/;
/** Polite lead-ins: please (informal, formal), if possible, can you, come on. */
const KA_POLITE = '(?:გთხოვთ?|გეთაყვა|თუ\\s+შეიძლება|თუ\\s+შეგიძლიათ?|შეგიძლიათ?|შეძლებთ?|მოდი|აბა|ახლა)[,\\s]+';
const KA_LEAD_ORDER = new RegExp(`^\\s*(?:${KA_POLITE}){0,3}(?:${KA_GEN_VERB})`);
/** What a person asks the studio to make, as noun stems. */
const KA_MEDIA_NOUN = /სურათ|ფოტო|ნახატ|ილუსტრაცი|პორტრეტ|ლოგო|პოსტერ|ბანერ|გამოსახულებ|ვიდეო|კლიპ|ფილმ|რგოლ|რეკლამ|ანიმაცი|მუსიკ|სიმღერ|მელოდი|ტრეკ|საუნდტრეკ/;
/** Words before the verb that make the sentence a question, a complaint, a memory or a refusal, never an order:
 *  „რატომ ვერ გამიკეთე სურათი?", „სურათი ვერ გამიკეთე", „გუშინ რომ ვიდეო გამიკეთე", „ნუ დამიხატავ". */
const KA_NOT_ORDER = /(?:^|[\s,])(?:რატომ|როგორ|რა|რას|რის|რით|სად|როდის|ვინ|ვის|რომელ\S*|რამდენ\S*|ხომ|რომ|არ|ვერ|ნუ|როცა|გუშინ|უკვე|თუ)(?=[\s,?!.]|$)/;
/** „this / my …" right after „მინდა" is about a file that exists („მინდა ეს ფოტო…"), not a new one. */
const KA_EXISTING = /(?:^|[\s,])(?:ეს|ამ|ამის|იმ|ჩემი|ჩემს|ჩემმა|ჩვენი)(?=[\s,?!.]|$)/;
const kaTokens = (s: string): string[] => s.trim().split(/[\s,]+/u).filter(Boolean);

/**
 * „კატის სურათი დამიხატე", „მუსიკა შემიქმენი", „ლოგო დამიხატე ჩემი კაფესთვის": up to four words, then the generate verb.
 * Those words must name what to make (a media noun) unless the verb itself can only mean a picture or a clip („კატა
 * დამიხატე"); „დავალება გამიკეთე" (do my homework) and „ეს გამიკეთე" stay talk.
 */
export function isKaVerbFinalOrder(text: string): boolean {
  const toks = kaTokens(text.replace(new RegExp(`^\\s*(?:${KA_POLITE}){1,3}`), ''));
  for (let i = 1; i <= Math.min(4, toks.length - 1); i += 1) {
    const verb = toks[i]!;
    if (!new RegExp(`^(?:${KA_GEN_VERB})`).test(verb)) continue;
    const before = toks.slice(0, i).join(' ');
    if (KA_NOT_ORDER.test(before)) return false;
    if (/ანალიზ|აღწერ/.test(text)) return false; // „ვიდეოს ანალიზი გამიკეთე" asks about a file
    // A writing verb makes a song, never a picture or a clip: „ვიდეოსთვის სცენარი დაწერე" is a text for a video.
    if (KA_WRITING_VERB.test(verb)) return /სიმღერ|მუსიკ|მელოდი|ტრეკ/.test(before);
    return KA_MEDIA_NOUN.test(before) || KA_MEDIA_ONLY_VERB.test(verb);
  }
  return false;
}

/**
 * „მინდა კატის სურათი", „მჭირდება ლოგო ჩემი კაფესთვის", „მინდა რომ დამიხატო ზღვა": a wish for something the studio makes.
 * Not a wish to know, ask, learn, see, change or delete („მინდა გკითხო სურათზე", „მინდა ეს ფოტო წავშალო"), and not a
 * question.
 */
export function isKaWishOrder(text: string): boolean {
  const m = new RegExp(`^\\s*(?:${KA_POLITE}){0,2}(?:მინდა|მჭირდება|მინდოდა)(?:\\s+რომ)?[,\\s]+(.*)$`, 's').exec(text);
  if (!m) return false;
  const rest = m[1]!;
  if (/[?？]\s*$/u.test(text)) return false;
  if (/(?:^|\s)(?:ვიცოდე|გავიგო|გკითხო|გკითხოთ|ვკითხო|ვისწავლო|ვნახო|შევცვალო|წავშალო|ავტვირთო|გადმოვწერო|ვიყიდო|გავაუმჯობესო|ვთქვა|გითხრა|გაჩვენო)(?=[\s,.!]|$)/.test(rest)) return false;
  const head = kaTokens(rest).slice(0, 5);
  if (KA_NOT_ORDER.test(head.join(' '))) return false;
  // Advice, ideas, an opinion or a text ABOUT a picture or a clip is talk: „მჭირდება რჩევა მუსიკალური კლიპისთვის".
  if (head.some((t) => /^(?:რჩევ|იდე|აზრ|ინფორმაცი|დახმარებ|ახსნ|პასუხ|ტექსტ|სცენარ|წერილ|გეგმ|სია|ანალიზ|აღწერ)/.test(t))) return false;
  // „მინდა ეს ფოტო…", „მინდა ჩემი სურათი…": the file that exists. („მჭირდება ლოგო ჩემი კაფესთვის" is a new logo.)
  if (head[0] && (KA_EXISTING.test(head[0]) && (!/^ჩემ|^ჩვენ/.test(head[0]) || KA_MEDIA_NOUN.test(head[1] ?? '')))) return false;
  return head.some((t) => KA_MEDIA_NOUN.test(t) || new RegExp(`^(?:${KA_GEN_VERB})`).test(t));
}

/**
 * The words before the first Georgian make-verb make it a question, a refusal or a memory („გუშინ რომ ვიდეო გამიკეთე,
 * მომეწონა" — the video you made me yesterday, I liked it). For readers that accept the make-verb anywhere in the sentence
 * (lib/agent/intent's Georgian video lane).
 */
export function kaNotAnOrder(text: string): boolean {
  const m = new RegExp(`(?:${KA_GEN_VERB})`).exec(text);
  return !!m && KA_NOT_ORDER.test(text.slice(0, m.index));
}

/**
 * Dispatch-only ALLOWLIST for the AUTONOMOUS chat dispatch (OmniStudio send()). detectIntent's regex
 * banks are deliberately loose — bare model keywords ("flux"/"sdxl"), and `verb .* media-noun` — so a
 * QUESTION ("is flux better than sdxl?"), a DECLARATIVE ("my client asked for a music video"), a
 * COMPLAINT ("the app won't let me generate a video"), or a DELIBERATION ("i can't decide whether to
 * generate a poster") all classify as a generation intent. Auto-firing a PAID render for those is a
 * false-positive hijack, and a blocklist can't enumerate every non-command phrasing. So this returns
 * true ONLY for an IMPERATIVE generate COMMAND — the message must LEAD with a generate verb (optionally
 * a polite "can you …" prefix). Everything else (questions/declaratives/complaints/comparisons) falls
 * through to the text stream. Bias: over-block (a real command not phrased imperatively falls to chat =
 * safe) over over-fire (a wrong charge). NEVER changes detectIntent's classification — other callers
 * keep the raw intent; this only decides whether the message is imperative enough to auto-spend a credit.
 */
export function isGenerativeCommand(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  // Must LEAD with a generate verb, allowing a short chain of polite lead-ins first ("please generate
  // …", "can you make …", "could you please generate …"). The polite set is specific, so a question
  // that starts with how/what/is/should/which (not in the set) can't reach the verb → it isn't a command.
  // ⚠️ `\b` IS ASCII-ONLY AND SILENTLY KILLED EVERY RUSSIAN COMMAND. JavaScript defines the word
  // boundary against `\w` = [A-Za-z0-9_], so no Cyrillic letter is ever a "word character": in
  // `нарисуй кота` both sides of the intended boundary (`й` and the space) are non-`\w`, there is no
  // transition, and `\b` does not match. Every Russian verb in this alternation was therefore dead on
  // arrival — `нарисуй кота`, `сделай видео`, `сочини музыку` all fell through to plain chat while
  // their English equivalents dispatched. The product ships a `ru` locale, so this was the whole
  // generative surface for those users. Unicode-aware end-of-token lookahead instead, `u` flag.
  // (lib/chat/studioIntent.ts documents this same trap in its own header — it was fixed there and not
  // here, which is why Russian worked through the studio panels but never through generation.)
  const leadsLatin = /^\s*((please|can|could|would|will|you|u|kindly|пожалуйста|можешь|можете|ты|мне)\s+){0,3}(make|create|generate|render|compose|design|draw|sketch|illustrate|produce|animate|paint|write|напиши|сделай|создай|сгенерируй|нарисуй|изобрази|набросай|сочини|придумай|собери|нарисовать|сделать|создать|сгенерировать|сочинить|снять|сними)(?![\p{L}\p{N}])/iu.test(s);
  // Georgian imperative generate verbs (stems, so conjugations like -ე/-ავ/-ე match), optionally after a
  // polite "გთხოვ" / "თუ შეიძლება". Georgian script isn't \w, so this leads at ^ without \b. Covers the
  // common phrasings that were silently falling through to plain chat ("გამიკეთე სურათი", "დახატე …",
  // "შემიქმენი ვიდეო", "დააგენერირე …").
  // `დამიწერ`/`დაწერ` ("write me …") was missing, so `დამიწერე სიმღერა სიყვარულზე` — a plain request for
  // a song — never reached the music bank that already recognised it.
  const leadsKa = KA_LEAD_ORDER.test(s);
  if (!leadsLatin && !leadsKa && !isKaVerbFinalOrder(s) && !isKaWishOrder(s)) return false;
  // EXCLUDE a Georgian ANALYSIS/DESCRIPTION request that only leads with a GENERIC verb (გააკეთ/გამიკეთ =
  // "do/make"): "გააკეთე ფოტოს ანალიზი" / "აღწერე ეს ფოტო" must go to the vision chat stream, never a paid
  // render. A message carrying an analysis noun (ანალიზ/აღწერ) with NO generation-specific verb
  // (დახატ/დააგენერირ/შემიქმენ/გამოსახ) is not a generate command.
  if (leadsKa && /(ანალიზ|აღწერ)/.test(s) && !/(დახატ|დამიხატ|დააგენერირ|დაგენერირ|დამიგენერირ|შემიქმენ|შექმენ|გამოსახ|გამომისახ)/.test(s)) return false;
  // EXCLUDE an EDIT of an EXISTING asset ("make MY/THIS song sound better") — a mixing request with no
  // source in chat → falls to chat. A FRESH generate with a quality descriptor ("make A poster that
  // looks better", "…make it look better than the last one") uses an article/pronoun, not a possessive,
  // so it is NOT excluded and still dispatches.
  if (/^\s*make\s+(my|this|that|the)\b[^?]*\b(sounds?|looks?)\s+(better|good|nicer|louder|clearer|worse|sharper|cleaner)\b/i.test(s)) return false;
  return true;
}

/**
 * Maps intent category to the Replicate service type
 * used by the /api/replicate/* routes.
 */
export function intentToReplicateService(intent: IntentCategory): string | null {
  switch (intent) {
    case 'avatar_generation': return 'avatar';
    case 'image_generation': return 'image';
    case 'photo_edit': return 'photo';
    case 'video_generation': return 'video';
    case 'music_generation': return 'music';
    case 'visual_analysis': return 'visual-ai';
    default: return null;
  }
}

/**
 * Deliverables that are TEXT. A generate command aimed at one of these belongs in the chat stream, not
 * in an image render — "make me a list of ideas" is a request to write, not to draw.
 *
 * ⚠️ A WRITING VERB IS ITSELF A TEXT DELIVERABLE. "დაწერე გრძელი პასუხი" (write a long answer) passed the
 * imperative gate, named no noun from the old Georgian list, and was DRAWN — a paid image nobody asked for.
 * "Write …" can never mean a picture, in any of the three languages, so the verb alone vetoes the render.
 */
const TEXT_DELIVERABLE = new RegExp([
  // English — nouns, then writing verbs.
  String.raw`\b(list|plan|summary|essay|email|letter|article|blog|post|caption|script|story|poem|code|table|recipe|schedule|itinerary|outline|report|translation|joke|ideas?|names?|slogans?|description|explanation|answer|reply|message|lyrics|paragraph|sentence)\b`,
  String.raw`\b(write|rewrite|translate|summari[sz]e|explain|paraphrase|proofread)\b`,
  // Georgian — nouns (stems), then writing verbs (დაწერე / დამიწერე / მომწერე / გადაწერე, თარგმნე, ახსენი).
  'სია|გეგმა|წერილ|სტატი|ტექსტ|კოდ|იდეა|სახელ|რეცეპტ|პასუხ|ლექს|მოთხრობ|ესსე|სცენარ|ცხრილ|განრიგ|შეჯამ|რეზიუმე|პოსტ|ბლოგ|იმეილ|მეილ|შეტყობინებ|სლოგან|ანეკდოტ|ხუმრობ|აბზაც|წინადადებ',
  'დაწერ|დამიწერ|მომწერ|გადაწერ|გადამიწერ|თარგმნ|მითარგმნ|ახსენ|ამიხსენ|შეაჯამ',
  // Russian — nouns (stems), then writing verbs.
  'список|план|письмо|стать|текст|код|иде[яю]|рецепт|ответ|стих|рассказ|сценари|таблиц|расписани|резюме|пост|слоган|шутк|анекдот|абзац',
  'напиши|написать|перепиши|переведи|объясни|перескажи',
].join('|'), 'i');

/** A writing verb leads the message (ka · en · ru). */
const WRITING_LEAD = /^\s*(?:(?:please|გთხოვთ?|пожалуйста)[,\s]+)?(?:write|rewrite|draft|translate|summari[sz]e|explain|paraphrase|proofread|დაწერ|დამიწერ|მომწერ|გადაწერ|გადამიწერ|თარგმნ|მითარგმნ|ახსენ|ამიხსენ|შეაჯამ|напиши|перепиши|переведи|объясни|перескажи)/iu;

/**
 * The lane an imperative generate command belongs to, or null to leave it in the chat stream.
 *
 * ⚠️ WHY A DEFAULT EXISTS AT ALL. Every bank above needs the user to name a MEDIA NOUN — image, photo,
 * video, song. Real requests do not: "make a jungle scene with a lion", "generate a lion in the jungle",
 * "create something cyberpunk" name a SUBJECT and expect a picture. Those all scored text_chat, so the
 * model answered with an essay describing what it *would* generate — which is the single worst outcome
 * available, because the user asked for a thing and got a description of the thing.
 *
 * `isGenerativeCommand` has ALREADY established that this is an imperative order to MAKE something (it
 * requires a leading generate verb and rejects questions, complaints and declaratives). Once past that
 * gate, "we could not tell which service, so here is some prose" is never the right answer. Image is the
 * default because it is the cheapest deliverable, the fastest, and by far the most common — and because
 * a wrong image costs one credit and a retry, where a wrong video costs many times that.
 *
 * The veto keeps written work written: an imperative aimed at a TEXT deliverable stays in the chat.
 */
export function resolveGenerativeLane(
  text: string,
  detected: DetectedIntent,
): 'image_generation' | 'video_generation' | 'music_generation' | 'avatar_generation' | null {
  // „დამიწერე სცენარი ვიდეოზე", "write a script for the video", «напиши пост про фото»: a text ABOUT a picture or a video is
  // written, never rendered (the video bank matches the bare noun). A song stays the music lane's ("write me a song").
  const writes = WRITING_LEAD.test(text) || text.split(/[\s,]+/u).some((w) => KA_WRITING_VERB.test(w));
  if (detected.confidence >= 0.7) {
    if (detected.intent === 'image_generation' && !writes) return 'image_generation';
    if (detected.intent === 'video_generation' && !writes) return 'video_generation';
    if (detected.intent === 'music_generation') return 'music_generation';
    if (detected.intent === 'avatar_generation') return 'avatar_generation';
  }
  // Only text_chat falls through to the default — a confident business/workflow/analysis verdict is a
  // real classification and must be respected, not overridden into a render.
  if (detected.intent !== 'text_chat') return null;
  if (TEXT_DELIVERABLE.test(text)) return null;
  return 'image_generation';
}

/**
 * Chat-mode video intent (moved from components/studio/OmniStudio.tsx so it can be tested). A strong video brief in plain
 * chat goes to the Video tool; a bare "video" mention does not — it needs a production cue (make a video, a music video, a
 * short film, a 30-second clip), in en / ka / ru. It also keeps a music video out of the music lane: the music bank
 * matches „მუსიკ" and would otherwise answer „მუსიკალური კლიპი გამიკეთე" with an audio-only track.
 */
export function isVideoIntent(s: string): boolean {
  const raw = s || '';
  const b = raw.toLowerCase();
  if (/\b(music\s*video|video\s*clip|short\s*film|mini[\s-]?(movie|film))\b/.test(b)) return true;
  if (/\b(make|create|generate|produce|render|build|do)\b[\s\S]{0,48}\bvideo\b/.test(b)) return true;
  if (/\b(30|thirty)[\s-]?(second|sec|s)\b[\s\S]{0,40}\b(video|film|clip)\b/.test(b)) return true;
  // Georgian: a music video by either name („მუსიკალური ვიდეო", „მუსიკალური კლიპი"), a generate verb then the video, or
  // „ვიდეო / კლიპი" first with the verb after it („ვიდეო გამიკეთე ზღვაზე"). Never „ვიდეოსთვის" (FOR a video): „ვიდეოსთვის
  // მუსიკა შემიქმენი" asks for the music.
  if (/მუსიკალურ\S*\s*(?:ვიდეო|კლიპ)|ვიდეო\s*კლიპ|ფილმ/.test(raw)) return true;
  if (new RegExp(`(?:${KA_VIDEO_VERB})[\\s\\S]{0,40}(?:ვიდეო|კლიპ)(?!\\S*თვის)`).test(raw)) return true;
  if (new RegExp(`^\\s*(?:${KA_POLITE}){0,3}(?:\\S+\\s+){0,3}(?:ვიდეო|კლიპ)(?!\\S*თვის)\\S*\\s+(?:\\S+\\s+)?(?:${KA_VIDEO_VERB})`).test(raw)) return true;
  if (/музыкальн\w*\s*клип|видеоклип|сними[\s\S]{0,30}видео|сделай[\s\S]{0,30}видео/.test(b)) return true;
  return false;
}

/** A video whose point is a song: the Video tool opens in music-video mode. */
export function isMusicVideoIntent(s: string): boolean {
  const b = (s || '').toLowerCase();
  return /\bmusic\s*video\b|\br&b\b|\brnb\b|\bsong\b|\bsinger\b|\bvocal|\blyric/.test(b)
    || /მუსიკალურ\S*\s*(?:ვიდეო|კლიპ)|სიმღერ|მომღერ|ვოკალ|ვიდეო\s*კლიპ/.test(s || '')
    || /музыкальн\w*\s*клип|видеоклип|песн\w|вокал|певиц/.test(b);
}
