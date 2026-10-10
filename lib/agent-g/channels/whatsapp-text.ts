/**
 * lib/agent-g/channels/whatsapp-text.ts — the pure half of Agent G on WhatsApp: what a message IS (a link code, a
 * command, talk, an order to make something) and what Agent G answers, in ka · en · ru. No I/O here, so every rule is
 * pinned by whatsapp-text.test.ts.
 */

export type WaLang = 'ka' | 'en' | 'ru';

/** The language to answer in: the script the person wrote in, else the number's country (995 → Georgian), else ka. */
export function waLang(text: string, waId = ''): WaLang {
  if (/[Ⴀ-ჿᲐ-Ჿ]/u.test(text)) return 'ka';
  if (/[Ѐ-ӿ]/u.test(text)) return 'ru';
  if (/[A-Za-z]/.test(text)) return 'en';
  return waId.startsWith('995') ? 'ka' : 'en';
}

/** The connect-code alphabet (buildOneTimeCode in telegram-client.ts): no 0/O, no 1/I. */
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

/**
 * The code in "connect ABCD2345" (also "/connect", "link", Georgian/Russian verbs, ":" or "-" between), or a bare code on
 * its own. Null for anything else. Only an UNLINKED number's message is read this way, so a bare 8-letter word can at
 * worst cost one "code not found" reply.
 */
export function parseConnectCode(text: string): string | null {
  const s = text.trim();
  const m = s.match(/^\/?\s*(?:connect|link|დაკავშირება|დააკავშირე|подключить|привязать)\s*[:\-–—]?\s*([A-Za-z0-9]{6,12})$/iu);
  const candidate = (m ? m[1] ?? '' : s).toUpperCase();
  if (!m && s !== candidate) return null; // a bare code must be typed as shown — "hello123" is not one
  return CODE_RE.test(candidate) ? candidate : null;
}

export type WaCommand = 'unlink' | 'help' | 'alerts_off' | 'alerts_on';

/** A linked number's control words. Exact matches only — "stop the video" is talk, not an opt-out. */
export function parseCommand(text: string): WaCommand | null {
  const s = text.trim().toLowerCase().replace(/[.!]+$/u, '');
  if (/^\/?(unlink|disconnect|გათიშვა|გათიშე|отключить|отвязать)$/u.test(s)) return 'unlink';
  if (/^\/?(help|start|დახმარება|помощь|\?)$/u.test(s)) return 'help';
  if (/^(stop|stop alerts|alerts off|შეჩერება|შეტყობინებების გამორთვა|стоп|отключить уведомления)$/u.test(s)) return 'alerts_off';
  if (/^(alerts on|resume|შეტყობინებების ჩართვა|включить уведомления|возобновить)$/u.test(s)) return 'alerts_on';
  return null;
}

/**
 * Markdown (what the chat model writes) → WhatsApp's own formatting: *bold*, _italic_, ~strike~, ```mono```. Headings
 * become bold lines, links become "text (url)", and a "* " bullet becomes "• " (a lone asterisk would turn the rest of
 * the line bold in WhatsApp).
 */
export function toWhatsAppText(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '$2')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => (t === u ? u : `${t} (${u})`))
    .replace(/^#{1,6}\s+(.+?)\s*#*\s*$/gm, '*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '*$1*')
    .replace(/~~(.+?)~~/g, '~$1~')
    .replace(/^(\s*)[*+]\s+/gm, '$1• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** WhatsApp's text limit is 4,096 characters; split on paragraph, then line, then word boundaries under `max`. */
export function chunkForWhatsApp(text: string, max = 4000): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = window.lastIndexOf('\n\n');
    if (cut < max * 0.5) cut = window.lastIndexOf('\n');
    if (cut < max * 0.5) cut = window.lastIndexOf(' ');
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** "+995 ••• ••123" — a linked number on screen or in a log, never in full. */
export function maskNumber(waId: string): string {
  const d = waId.replace(/\D/g, '');
  if (d.length < 6) return '•••';
  return `+${d.slice(0, 3)} ••• ••${d.slice(-3)}`;
}

export type StudioMode = 'image' | 'video' | 'music';

/** The studio, opened on the right tool with the request already typed — nothing runs until the person taps Create. */
export function studioLink(origin: string, lang: WaLang, mode: StudioMode, prompt: string): string {
  const q = new URLSearchParams({ mode, prompt: prompt.trim().slice(0, 500) });
  return `${origin.replace(/\/+$/, '')}/${lang}/dashboard?${q.toString()}`;
}

/** Where the WhatsApp card lives (the settings page renders it at #whatsapp). */
export function linkPage(origin: string, lang: WaLang): string {
  return `${origin.replace(/\/+$/, '')}/${lang}/settings#whatsapp`;
}

const WHAT: Record<StudioMode, Record<WaLang, string>> = {
  image: { ka: 'სურათი', en: 'image', ru: 'изображение' },
  video: { ka: 'ვიდეო', en: 'video', ru: 'видео' },
  music: { ka: 'მუსიკა', en: 'track', ru: 'трек' },
};

/** Everything Agent G says on WhatsApp that is not a model reply. */
export const WA_COPY: Record<WaLang, {
  notLinked: (page: string) => string;
  linked: string;
  codeNotFound: (page: string) => string;
  tooManyTries: string;
  unlinked: string;
  help: string;
  alertsOff: string;
  alertsOn: string;
  notText: string;
  studio: (mode: StudioMode, link: string) => string;
  unavailable: string;
  slowDown: string;
  soon: string;
}> = {
  ka: {
    notLinked: (page) => `გამარჯობა! მე ვარ Agent G, myavatar.ge-ს ასისტენტი 👋\nრომ აქ გესაუბრო, ეს ნომერი დააკავშირე შენს ანგარიშთან:\n1. გახსენი ${page}\n2. WhatsApp-ის ბარათზე დააჭირე „კოდის მიღებას“\n3. აქ გამომიგზავნე: connect კოდი`,
    linked: '✅ ნომერი დაკავშირებულია. ახლა შეგიძლია აქვე მომწერო — ვუპასუხებ და შეგატყობინებ, როცა შენი ვიდეო, სურათი ან მუსიკა მზად იქნება.\nდახმარება: help',
    codeNotFound: (page) => `ეს კოდი ვერ ვიპოვე ან ვადა გაუვიდა. ახალი კოდი აიღე აქ: ${page}`,
    tooManyTries: 'ძალიან ბევრი მცდელობა. სცადე ერთ საათში.',
    unlinked: 'ნომერი გათიშულია. ხელახლა დასაკავშირებლად აიღე ახალი კოდი myavatar.ge-ზე.',
    help: 'მომწერე ნებისმიერი შეკითხვა — გიპასუხებ.\nსურათის, ვიდეოს ან მუსიკის შესაქმნელად მომწერე, რა გინდა, და სტუდიის ბმულს გამოგიგზავნი.\n• stop — შეტყობინებების გამორთვა\n• alerts on — ჩართვა\n• unlink — ნომრის გათიშვა',
    alertsOff: 'შეტყობინებები გამორთულია. ჩასართავად მომწერე: alerts on',
    alertsOn: 'შეტყობინებები ჩართულია 🔔',
    notText: 'აქ ჯერჯერობით მხოლოდ ტექსტს ვკითხულობ. ფოტო, ხმა ან ვიდეო ატვირთე myavatar.ge-ზე.',
    studio: (mode, link) => `${WHAT[mode].ka} სტუდიაში შევქმნათ — მოთხოვნა უკვე ჩაწერილია, ფასს „შექმნის“ ღილაკზე ნახავ:\n${link}`,
    unavailable: 'ბოდიში, ახლა ვერ გიპასუხე. სცადე ცოტა ხანში.',
    slowDown: 'ცოტა შეანელე 🙂 რამდენიმე წუთში ისევ გიპასუხებ.',
    soon: 'Agent G WhatsApp-ზე მალე ჩაირთვება. მანამდე მესაუბრე myavatar.ge-ზე.',
  },
  en: {
    notLinked: (page) => `Hi! I'm Agent G, the myavatar.ge assistant 👋\nTo chat here, link this number to your account:\n1. Open ${page}\n2. On the WhatsApp card tap "Get code"\n3. Send me: connect CODE`,
    linked: '✅ Number linked. You can write to me here now — I will answer, and tell you when your video, image or music is ready.\nHelp: help',
    codeNotFound: (page) => `I couldn't find that code, or it has expired. Get a new one here: ${page}`,
    tooManyTries: 'Too many attempts. Try again in an hour.',
    unlinked: 'Number unlinked. To link it again, get a new code on myavatar.ge.',
    help: 'Ask me anything — I will answer.\nTo create an image, video or music, tell me what you want and I will send you a studio link.\n• stop — turn alerts off\n• alerts on — turn them on\n• unlink — unlink this number',
    alertsOff: 'Alerts are off. To turn them on, send: alerts on',
    alertsOn: 'Alerts are on 🔔',
    notText: 'For now I read text here. Upload photos, voice or video on myavatar.ge.',
    studio: (mode, link) => `Let's make the ${WHAT[mode].en} in the studio — your request is already typed in, and the price is on the Create button:\n${link}`,
    unavailable: "Sorry, I couldn't answer just now. Please try again in a little while.",
    slowDown: 'Easy there 🙂 I will answer again in a few minutes.',
    soon: 'Agent G on WhatsApp is opening soon. Until then, chat with me on myavatar.ge.',
  },
  ru: {
    notLinked: (page) => `Привет! Я Agent G, ассистент myavatar.ge 👋\nЧтобы общаться здесь, привяжи этот номер к своему аккаунту:\n1. Открой ${page}\n2. На карточке WhatsApp нажми «Получить код»\n3. Отправь мне: connect КОД`,
    linked: '✅ Номер привязан. Теперь можешь писать мне здесь — я отвечу и сообщу, когда твоё видео, изображение или музыка будут готовы.\nПомощь: help',
    codeNotFound: (page) => `Не нашла этот код или его срок истёк. Получи новый здесь: ${page}`,
    tooManyTries: 'Слишком много попыток. Попробуй через час.',
    unlinked: 'Номер отвязан. Чтобы привязать снова, получи новый код на myavatar.ge.',
    help: 'Спрашивай что угодно — отвечу.\nЧтобы создать изображение, видео или музыку, напиши, что хочешь, и я пришлю ссылку на студию.\n• stop — выключить уведомления\n• alerts on — включить\n• unlink — отвязать номер',
    alertsOff: 'Уведомления выключены. Чтобы включить, отправь: alerts on',
    alertsOn: 'Уведомления включены 🔔',
    notText: 'Пока я читаю здесь только текст. Фото, голос или видео загрузи на myavatar.ge.',
    studio: (mode, link) => `Давай создадим ${WHAT[mode].ru} в студии — запрос уже введён, цена на кнопке «Создать»:\n${link}`,
    unavailable: 'Извини, сейчас не получилось ответить. Попробуй чуть позже.',
    slowDown: 'Чуть помедленнее 🙂 Отвечу снова через несколько минут.',
    soon: 'Agent G в WhatsApp скоро заработает. А пока пиши мне на myavatar.ge.',
  },
};

/** Where a WhatsApp customer reaches a person (Meta's Business Messaging Policy asks for a clear escalation path). */
export const WHATSAPP_SUPPORT_EMAIL = 'support@myavatar.ge';

/**
 * How Agent G writes on this channel — appended to the product system prompt. Short answers, WhatsApp formatting, the
 * one thing it must never claim (it cannot make or attach media from WhatsApp), and its SCOPE: on WhatsApp Agent G
 * serves this customer's MyAvatar.ge account and orders, not general questions (Meta Terms §4.7, AI Providers, until
 * Meta answers in writing; docs/handoffs/omnichannel/META_SUPPORT_REQUEST.md). The same rule as a WhatsApp call
 * (lib/calls/whatsapp/phoneTools phoneCallRule).
 */
export const WHATSAPP_STYLE_NOTE = [
  'You are answering in a WhatsApp chat.',
  'Here you help this MyAvatar.ge customer only with MyAvatar.ge: their account, credits, prices, orders, tasks and results, and what the studio can make for them.',
  'You are not a general-purpose assistant on WhatsApp and you cannot search the web here: for anything unrelated to MyAvatar.ge, say politely that on WhatsApp you help only with MyAvatar.ge, and that the full assistant is on myavatar.ge.',
  `If they want a person, give the support address ${WHATSAPP_SUPPORT_EMAIL}.`,
  'Keep replies short and conversational (a few sentences; a short list only when it truly helps).',
  'Use WhatsApp formatting only: *bold*, _italic_. No markdown headings, tables or code blocks unless the user asks for code.',
  'You cannot generate, attach or send images, video, music or files in this chat. Never claim you did or will; if asked, say the studio link will come in a separate message.',
  'Answer in the language the user writes in.',
].join(' ');
