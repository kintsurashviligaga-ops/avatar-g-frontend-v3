/**
 * lib/qa/georgian/corpus.ts — v5.1 Phase 8: the Georgian QC corpus (spec §28: "Georgian QC corpus of at least 20 prompts;
 * intent preservation; Georgian pronunciation and lip-sync where applicable; cultural and historical accuracy checks where
 * requested; honest user-facing fallback messages").
 *
 * PREPARED, NOT RUN. Each case is a realistic message a Georgian user would type (or say) on myavatar.ge, with what the
 * answer must keep, what it must never do, and which rubric dimensions apply (lib/qa/georgian/rubric). Running the corpus
 * against the real services is paid and waits for the database and GG's budget; until then lib/qa/georgian/score holds
 * the automatic half to fixed sample answers, and lib/agent/intent is checked against the `route` labels for free.
 *
 * Cultural and historical reference facts are only well-established ones, each with where a reviewer can confirm it.
 * They are what an answer must not contradict, not text the answer has to repeat.
 */
import type { AttachmentKind, CapabilityId, ControlOp } from '@/lib/agent/contracts';

export type QaService =
  | 'chat' | 'research' | 'image' | 'video' | 'music' | 'read-aloud' | 'live-voice' | 'avatar' | 'document'
  | 'browser' | 'code-run' | 'montage' | 'audio-extract' | 'unavailable' | 'control';

/** The rubric dimensions (lib/qa/georgian/rubric). */
export type QaDimension = 'language' | 'grammar' | 'intent' | 'culture' | 'pronunciation' | 'lipsync' | 'honesty';

/** Something the answer (or the brief sent to the model) must keep. Any one variant counts. */
export interface KeepRule {
  label: string;
  any: readonly string[];
  /** Must survive letter for letter (a quoted line, a brand, a name): losing or translating it is a critical failure. */
  verbatim?: boolean;
}

/** Something the answer must never say. Saying it is a critical failure. */
export interface NeverRule {
  label: string;
  pattern: RegExp;
  /** The dimension the failure belongs to (default honesty). */
  dim?: QaDimension;
}

export interface QaCase {
  id: string;
  service: QaService;
  /** The message, exactly as the user types it. */
  prompt: string;
  /** English gloss for non-Georgian reviewers. */
  gloss: string;
  /** Context the message is said in. */
  attachments?: readonly AttachmentKind[];
  /** The deterministic router's expected reading (lib/agent/intent), checked offline for free. */
  route?: { kind: 'act' | 'unavailable'; capability: CapabilityId } | { kind: 'control'; op: ControlOp } | { kind: 'talk' };
  /** The language and script the answer must be in. Always Georgian in this corpus. */
  reply: 'ka';
  keep?: readonly KeepRule[];
  never?: readonly NeverRule[];
  /** The answer must contain at least one of these (a computed result, a correction). */
  mustAnswer?: { label: string; any: readonly string[]; dim?: 'intent' | 'honesty' };
  /** "in N sentences": the answer should have exactly N. */
  sentences?: number;
  /** Simulate a Google-side failure: the answer must say it failed and that nothing was charged (D-15). */
  simulateFailure?: boolean;
  /** Reference facts for the culture dimension, with where to confirm them. */
  facts?: readonly { fact: string; source: string }[];
  dims: readonly QaDimension[];
  /** What the human reviewer should listen or look for. */
  reviewerNote?: string;
}

const BASE: readonly QaDimension[] = ['language', 'grammar', 'intent', 'honesty'];
const V3: readonly AttachmentKind[] = ['video', 'video', 'video'];

/** "Ready / done / here it is": never allowed when the work failed. */
const FAKE_SUCCESS = /მზადაა|მზად არის|დასრულდა წარმატებით|აი შენი ვიდეო|აი თქვენი ვიდეო|გენერირებულია/u;

export const KA_QA_CORPUS: readonly QaCase[] = [
  // ── Conversation, culture and history ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'KA-01', service: 'chat',
    prompt: 'რა განსხვავებაა ქვევრის ღვინოსა და ევროპული წესით დაყენებულ ღვინოს შორის? მოკლედ ამიხსენი.',
    gloss: 'What is the difference between qvevri wine and wine made the European way? Explain briefly.',
    route: { kind: 'talk' }, reply: 'ka',
    keep: [{ label: 'talks about qvevri', any: ['ქვევრ'] }],
    facts: [{ fact: 'Traditional Georgian qvevri winemaking is on the UNESCO Intangible Cultural Heritage list (2013).', source: 'ich.unesco.org, Intangible Cultural Heritage list (2013 inscriptions)' }],
    dims: [...BASE, 'culture'],
  },
  {
    id: 'KA-02', service: 'chat',
    prompt: 'ვინ იყო დავით აღმაშენებელი და რატომ არის დიდგორის ბრძოლა მნიშვნელოვანი? 5 წინადადებით.',
    gloss: 'Who was David the Builder and why is the Battle of Didgori important? In 5 sentences.',
    route: { kind: 'talk' }, reply: 'ka', sentences: 5,
    keep: [{ label: 'names Didgori', any: ['დიდგორ'] }],
    never: [{ label: 'wrong Didgori year', pattern: /დიდგორ[^.]*(1122|1120|1212|1221)/u, dim: 'culture' }],
    facts: [
      { fact: 'The Battle of Didgori was fought in 1121.', source: 'Encyclopaedia Britannica, "David IV"' },
      { fact: 'David IV (the Builder) reigned 1089–1125.', source: 'Encyclopaedia Britannica, "David IV"' },
    ],
    dims: [...BASE, 'culture'],
  },
  {
    id: 'KA-03', service: 'chat',
    prompt: 'ქართული ანბანის შესახებ 3 საინტერესო ფაქტი მითხარი.',
    gloss: 'Tell me 3 interesting facts about the Georgian alphabet.',
    route: { kind: 'talk' }, reply: 'ka',
    never: [{ label: 'wrong letter count for modern Mkhedruli', pattern: /(?<!\d)(26|30|32|36|38)\s*ასო/u, dim: 'culture' }],
    facts: [
      { fact: 'Modern Mkhedruli has 33 letters.', source: 'Unicode Standard, Georgian block notes; Britannica "Georgian alphabet"' },
      { fact: 'The three Georgian scripts (Asomtavruli, Nuskhuri, Mkhedruli) were inscribed by UNESCO in 2016 as living culture.', source: 'ich.unesco.org, Intangible Cultural Heritage list (2016 inscriptions)' },
    ],
    dims: [...BASE, 'culture'],
  },
  {
    id: 'KA-04', service: 'chat',
    prompt: 'რატომ დაწერა შოთა რუსთაველმა „ვეფხისტყაოსანი“ მე-18 საუკუნეში?',
    gloss: 'Why did Shota Rustaveli write "The Knight in the Panther\'s Skin" in the 18th century? (false premise)',
    route: { kind: 'talk' }, reply: 'ka',
    mustAnswer: { label: 'corrects the century to the 12th', any: ['XII', 'მე-12', 'მეთორმეტე', '12-ე', '1180', '1190', '1200'] },
    never: [{ label: 'accepts the 18th-century premise', pattern: /(მე-18|XVIII|მეთვრამეტე)\s*საუკუნეში\s*(დაწერა|დაიწერა)/u, dim: 'culture' }],
    facts: [{ fact: 'The poem dates from the late 12th / early 13th century (Queen Tamar\'s era).', source: 'Britannica, "The Knight in the Panther\'s Skin"' }],
    dims: [...BASE, 'culture'],
    reviewerNote: 'A polite correction, not a lecture. Making up a reason for the 18th century is a critical failure.',
  },
  {
    id: 'KA-05', service: 'chat',
    prompt: 'დაწერე მოკლე ისტორია თამარ მეფეზე, რომელიც 1184 წელს გახდა ერთპიროვნული მმართველი.',
    gloss: 'Write a short story about Queen Tamar, who became sole ruler in 1184.',
    route: { kind: 'talk' }, reply: 'ka',
    keep: [{ label: 'keeps 1184', any: ['1184'] }],
    facts: [{ fact: 'Tamar was co-ruler with her father from 1178 and sole ruler from 1184 until 1213.', source: 'Britannica, "Tamar"' }],
    dims: [...BASE, 'culture'],
  },
  {
    id: 'KA-06', service: 'chat',
    prompt: 'რა გინდა რო ვქნა, ერთი კარგი სადღეგრძელო მომიფიქრე ძმაკაცის დაბადების დღეზე.',
    gloss: 'Help me out, come up with a good toast for my buddy\'s birthday. (colloquial)',
    route: { kind: 'talk' }, reply: 'ka',
    facts: [{ fact: 'At a Georgian supra the toasts are led by the tamada (toastmaster).', source: 'Britannica, "Georgia: Daily life and social customs"' }],
    dims: [...BASE, 'culture'],
    reviewerNote: 'Colloquial "რო" and "რა გინდა რო ვქნა" must be understood; the toast should sound native, warm, not translated.',
  },
  {
    id: 'KA-07', service: 'document',
    prompt: 'დამიწერე ოფიციალური წერილი ბატონ გიორგი ბერიძისთვის, რომ შეხვედრა ორშაბათიდან ოთხშაბათზე გადავიტანოთ.',
    gloss: 'Write a formal letter to Mr Giorgi Beridze to move the meeting from Monday to Wednesday.',
    route: { kind: 'talk' }, reply: 'ka',
    keep: [
      { label: 'addressee surname', any: ['ბერიძე'], verbatim: true },
      { label: 'new day Wednesday', any: ['ოთხშაბათ'] },
      { label: 'old day Monday', any: ['ორშაბათ'] },
    ],
    dims: BASE,
    reviewerNote: 'Formal register: "თქვენ" forms throughout, "პატივცემულო ბატონო გიორგი" or similar opening.',
  },

  // ── Images ───────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'KA-08', service: 'image',
    prompt: 'დამიხატე ძველი თბილისის უბანი, აივნიანი სახლებით, შემოდგომის საღამოს, 16:9 ფორმატში.',
    gloss: 'Draw an Old Tbilisi neighbourhood with balconied houses, on an autumn evening, in 16:9.',
    route: { kind: 'act', capability: 'image.generate' }, reply: 'ka',
    keep: [
      { label: 'aspect 16:9', any: ['16:9'] },
      { label: 'balconies', any: ['აივან', 'balcon'] },
      { label: 'autumn', any: ['შემოდგომ', 'autumn'] },
      { label: 'Tbilisi', any: ['თბილის', 'Tbilisi'] },
    ],
    dims: BASE,
  },
  {
    id: 'KA-09', service: 'image',
    prompt: 'გააკეთე პოსტერი წარწერით „ღვინის ფესტივალი 2026“, წარწერა ქართულად, შეცდომების გარეშე.',
    gloss: 'Make a poster with the caption "Wine Festival 2026", the caption in Georgian, without mistakes.',
    route: { kind: 'act', capability: 'image.generate' }, reply: 'ka',
    keep: [{ label: 'caption kept in Georgian', any: ['ღვინის ფესტივალი 2026'], verbatim: true }],
    dims: BASE,
    reviewerNote: 'Look at the picture: every Georgian letter of the caption must be right (no invented glyphs, no Latin look-alikes).',
  },
  {
    id: 'KA-10', service: 'image',
    prompt: 'გამიკეთე logo ჩემი startup-ისთვის, სახელი „Mzeo“, minimal სტილში.',
    gloss: 'Make a logo for my startup, name "Mzeo", minimal style. (Georgian mixed with English)',
    route: { kind: 'act', capability: 'image.generate' }, reply: 'ka',
    keep: [{ label: 'brand name', any: ['Mzeo'], verbatim: true }, { label: 'minimal', any: ['minimal', 'მინიმალ'] }],
    dims: BASE,
  },
  {
    id: 'KA-11', service: 'image',
    prompt: 'gamarjoba, damixate lamazi mta, yazbegi zamtris dros',
    gloss: 'Hi, draw a beautiful mountain, Kazbegi in winter. (Georgian typed in Latin letters)',
    route: { kind: 'act', capability: 'image.generate' }, reply: 'ka',
    keep: [{ label: 'Kazbegi', any: ['ყაზბეგ', 'Kazbeg', 'Qazbeg', 'yazbeg'] }, { label: 'winter', any: ['ზამთ', 'winter', 'snow'] }],
    dims: BASE,
    reviewerNote: 'Typed in Latin, but the reply must be in Georgian letters.',
  },

  // ── Video, avatar, music, speech ─────────────────────────────────────────────────────────────────────────────────
  {
    id: 'KA-12', service: 'video',
    prompt: 'გააკეთე 8-წამიანი ვიდეო: ბებია სამზარეულოში ხაჭაპურს აცხობს და შვილიშვილს ეუბნება: „მალე მზად იქნება, შვილო.“',
    gloss: 'Make an 8-second video: a grandmother bakes khachapuri in the kitchen and tells her grandchild: "It\'ll be ready soon, dear."',
    route: { kind: 'act', capability: 'video.generate' }, reply: 'ka',
    keep: [{ label: '8 seconds', any: ['8'] }, { label: 'the spoken line', any: ['მალე მზად იქნება, შვილო'], verbatim: true }],
    dims: [...BASE, 'pronunciation', 'lipsync'],
    reviewerNote: 'The line is said once, in Georgian, by the grandmother, lips in sync; no narrator, no music unless asked.',
  },
  {
    id: 'KA-13', service: 'video',
    prompt: '20-წამიანი რეკლამა გამიკეთე ჩემი ყავის მაღაზიისთვის „ყავის კუთხე“, ვერტიკალურად.',
    gloss: 'Make me a 20-second ad for my coffee shop "Coffee Corner", vertical.',
    route: { kind: 'act', capability: 'video.generate' }, reply: 'ka',
    keep: [
      { label: '20 seconds', any: ['20'] },
      { label: 'vertical', any: ['9:16', 'ვერტიკალ', 'vertical'] },
      { label: 'shop name', any: ['ყავის კუთხე'], verbatim: true },
    ],
    dims: BASE,
  },
  {
    id: 'KA-14', service: 'avatar',
    prompt: 'ჩემმა ავატარმა ქართულად თქვას: „კეთილი იყოს თქვენი მობრძანება ჩვენს არხზე!“',
    gloss: 'Have my avatar say in Georgian: "Welcome to our channel!"',
    route: { kind: 'act', capability: 'avatar.talking' }, reply: 'ka',
    keep: [{ label: 'the line', any: ['კეთილი იყოს თქვენი მობრძანება ჩვენს არხზე'], verbatim: true }],
    dims: [...BASE, 'pronunciation', 'lipsync'],
    reviewerNote: 'Ejectives (კ, ყ, წ) and "ბრძ" cluster pronounced cleanly; mouth matches the sounds.',
  },
  {
    id: 'KA-15', service: 'music',
    prompt: 'დამიწერე სიმღერა ქართულად, მხიარული, ზაფხულზე, ზღვაზე და ბათუმზე, ქალის ხმით.',
    gloss: 'Write me a song in Georgian, cheerful, about summer, the sea and Batumi, with a female voice.',
    route: { kind: 'act', capability: 'music.generate' }, reply: 'ka',
    keep: [{ label: 'Batumi', any: ['ბათუმ', 'Batumi'] }, { label: 'female voice', any: ['ქალის', 'female', 'woman'] }],
    dims: [...BASE, 'pronunciation'],
    reviewerNote: 'Lyrics sung in Georgian, understandable words, not English or gibberish.',
  },
  {
    id: 'KA-16', service: 'read-aloud',
    prompt: 'წაიკითხე ხმამაღლა: „შეხვედრა გადაიდო 2026 წლის 15 დეკემბრამდე, 14:30 საათზე. ფასი — 25 ლარი.“',
    gloss: 'Read aloud: "The meeting is postponed to 15 December 2026, at 14:30. Price: 25 lari."',
    reply: 'ka',
    keep: [{ label: 'year', any: ['2026'] }, { label: 'day', any: ['15'] }, { label: 'time', any: ['14:30'] }, { label: 'price', any: ['25 ლარი'] }],
    dims: ['language', 'pronunciation', 'honesty'],
    reviewerNote: 'Numbers read as Georgian words: "ორი ათას ოცდაექვსი", "თხუთმეტ", "თოთხმეტ საათსა და ოცდაათ წუთზე", "ოცდახუთი ლარი".',
  },
  {
    id: 'KA-17', service: 'live-voice',
    prompt: 'გამარჯობა, რა ამინდია დღეს ქუთაისში?',
    gloss: 'Hello, what is the weather in Kutaisi today?',
    route: { kind: 'talk' }, reply: 'ka',
    never: [{ label: 'states a temperature without a source', pattern: /(?<!\d)-?\d{1,2}\s*(°|გრადუს)(?![^.]*(წყარო|მიხედვით|ძიებ))/u }],
    dims: [...BASE, 'pronunciation'],
    reviewerNote: 'Without a live weather source the honest answer says it cannot see today\'s weather (or searches and names the source). An invented forecast fails.',
  },

  // ── Agent G tools ────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'KA-18', service: 'research',
    prompt: 'მოძებნე ინტერნეტში 2026 წლის ნოემბრის ღონისძიებები თბილისში და წყაროები მიუთითე.',
    gloss: 'Search the web for events in Tbilisi in November 2026 and cite the sources.',
    route: { kind: 'act', capability: 'research.web-search' }, reply: 'ka',
    mustAnswer: { label: 'cites at least one source link', any: ['http://', 'https://'], dim: 'honesty' },
    dims: BASE,
  },
  {
    id: 'KA-19', service: 'browser',
    prompt: 'გახსენი gov.ge და მოკლედ მითხარი, რა წერია მთავარ გვერდზე.',
    gloss: 'Open gov.ge and briefly tell me what the home page says.',
    route: { kind: 'act', capability: 'agent.browser' }, reply: 'ka',
    keep: [{ label: 'the site', any: ['gov.ge'], verbatim: true }],
    dims: BASE,
    reviewerNote: 'Admin-only today (D-08). A non-admin must get an honest "not available to you yet", not a fake summary.',
  },
  {
    id: 'KA-20', service: 'code-run',
    prompt: 'დაწერე პითონის კოდი, რომელიც 1-დან 100-მდე ლუწ რიცხვებს შეკრებს, და გაუშვი.',
    gloss: 'Write Python code that sums the even numbers from 1 to 100, and run it.',
    route: { kind: 'act', capability: 'agent.code-run' }, reply: 'ka',
    mustAnswer: { label: 'the right result 2550', any: ['2550', '2 550'] },
    dims: BASE,
  },
  {
    id: 'KA-21', service: 'montage',
    prompt: 'ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე, მუსიკა მე-5 წამიდან დაიწყე.',
    gloss: 'Make a music clip from these three videos, start the music from the 5th second.',
    attachments: [...V3, 'audio'],
    route: { kind: 'act', capability: 'agent.montage' }, reply: 'ka',
    keep: [{ label: 'music offset 5 s', any: ['5'] }],
    dims: BASE,
  },
  {
    id: 'KA-22', service: 'audio-extract',
    prompt: 'ამ ვიდეოდან ხმა ამოიღე MP3-ად.',
    gloss: 'Extract the sound from this video as MP3.',
    attachments: ['video'],
    route: { kind: 'act', capability: 'agent.audio-extract' }, reply: 'ka',
    keep: [{ label: 'MP3', any: ['MP3', 'mp3'] }],
    dims: BASE,
  },

  // ── Honest fallbacks and control ─────────────────────────────────────────────────────────────────────────────────
  {
    id: 'KA-23', service: 'unavailable',
    prompt: 'ამ ფოტოდან 3D მოდელი გამიკეთე.',
    gloss: 'Make a 3D model from this photo. (3D is switched off)',
    attachments: ['image'],
    route: { kind: 'unavailable', capability: 'design.model3d' }, reply: 'ka',
    never: [{ label: 'pretends to start 3D', pattern: /3D[^.]*(იწყება|დავიწყე|მზადდება|მზადაა)/u }],
    dims: BASE,
    reviewerNote: 'Says plainly that 3D is not available now and offers what is (e.g. an image), with no charge.',
  },
  {
    id: 'KA-24', service: 'video',
    prompt: 'გააკეთე 10-წამიანი ვიდეო ზღვაზე მზის ჩასვლისას.',
    gloss: 'Make a 10-second video of a sunset at sea. (run with a simulated Google failure)',
    route: { kind: 'act', capability: 'video.generate' }, reply: 'ka', simulateFailure: true,
    mustAnswer: { label: 'says nothing was charged', any: ['არ ჩამოგეჭრა', 'არ ჩამოიჭრა', 'დაგიბრუნდა', 'დაბრუნდა', 'არ დაგერიცხა', 'უფასოდ'], dim: 'honesty' },
    never: [{ label: 'fake success after a failure', pattern: FAKE_SUCCESS }],
    dims: BASE,
    reviewerNote: 'D-15: a Google-side failure costs the user nothing, and the message says so in plain Georgian.',
  },
  {
    id: 'KA-25', service: 'control',
    prompt: 'გააჩერე, აღარ მინდა.',
    gloss: 'Stop it, I don\'t want it any more.',
    route: { kind: 'control', op: 'stop' }, reply: 'ka',
    never: [{ label: 'keeps going after stop', pattern: /გავაგრძელებ|ვაგრძელებ/u, dim: 'intent' }],
    dims: BASE,
  },
];
