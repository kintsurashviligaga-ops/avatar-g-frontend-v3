import {
  detectIntent, isGenerativeCommand, isKaVerbFinalOrder, isKaWishOrder, isMusicVideoIntent, isVideoIntent, kaNotAnOrder, resolveGenerativeLane,
} from './intentDetector';

/**
 * Pins the STEP-1 autonomous chat dispatch contract (OmniStudio send()). The client dispatches a chat
 * message to a paid generator ONLY when it is an imperative generate COMMAND AND classifies as media:
 *   dispatch(msg) === isGenerativeCommand(msg) && detectIntent(msg).intent ∈ {image,music,video} && conf>=0.7
 * isGenerativeCommand is an ALLOWLIST (must LEAD with a generate verb) so questions, declaratives,
 * complaints, comparisons and deliberations — the false-positive-hijack classes two adversarial
 * reviews surfaced — never auto-spend a credit. Every case below was flagged by those reviews.
 */
const DISPATCHABLE = ['image_generation', 'music_generation', 'video_generation'] as const;
const wouldDispatch = (msg: string): boolean => {
  if (!isGenerativeCommand(msg)) return false; // dispatch-site allowlist
  const d = detectIntent(msg);
  return (DISPATCHABLE as readonly string[]).includes(d.intent) && d.confidence >= 0.7;
};

describe('intentDetector — autonomous chat dispatch classification', () => {
  it('classifies explicit generative asks to the right modality at high confidence (>=0.7)', () => {
    expect(detectIntent('generate a majestic tiger image')).toMatchObject({ intent: 'image_generation' });
    expect(detectIntent('generate a majestic tiger image').confidence).toBeGreaterThanOrEqual(0.7);
    expect(detectIntent('make an epic lofi hip hop beat').intent).toBe('music_generation');
    expect(detectIntent('create a 30 second promo video for my shop').intent).toBe('video_generation');
  });

  it('DISPATCHES imperative generate commands (incl. polite, mid-sentence "how", quality descriptors)', () => {
    for (const m of [
      'generate a majestic tiger image',
      'make an epic lofi hip hop beat',
      'create a 30 second promo video for my shop',
      'compose an ambient cinematic track',
      'render an illustration of a castle at dawn',
      'make a song about how love works',                                  // mid-sentence "how" must NOT block
      'can you make me a tiger image?',                                     // polite generate + '?' still dispatches
      'please generate a poster for my cafe',
      'make a poster that looks better',                                    // fresh generate + quality descriptor
      'generate an image of a cat but make it look better than the last one', // iterating on a prior result
    ]) {
      expect(wouldDispatch(m)).toBe(true);
    }
  });

  it('does NOT hijack questions / declaratives / complaints / comparisons / mixing', () => {
    for (const q of [
      // review round 1 — verb-then-noun interrogatives
      'how do I create an image in Photoshop?',
      "what's the best way to render an image?",
      'should I make a poster or a banner?',
      'explain how flux works',
      'make my song sound better',                                         // edit of an EXISTING asset
      'can you explain how to compose a track?',
      // review round 2 — declaratives / complaints / comparisons / deliberation / bare keywords
      'is flux better than sdxl for portraits',
      'my client asked for a music video',
      'the app wont let me generate a video',
      "i cant decide whether to generate a poster or a banner",
      // plain non-generative chat
      "what's a good image editing app?",
      'tell me about the history of jazz music',
      'hello, how are you today?',
      'summarize this document for me',
    ]) {
      expect(wouldDispatch(q)).toBe(false);
    }
  });

  it('empty / whitespace → text_chat (safe default, streams normally)', () => {
    expect(detectIntent('').intent).toBe('text_chat');
    expect(wouldDispatch('   ')).toBe(false);
  });

  // Georgian generative commands used to silently fall through to plain chat (no Georgian verbs in
  // isGenerativeCommand + \b-prefixed media nouns that don't match Georgian script), producing a dry
  // "sending to the agent" reply and NO generation. These lock the fix in.
  it('DISPATCHES Georgian generate commands to the right modality', () => {
    expect(detectIntent('გამიკეთე სურათი ცხენი ანიმეს სტილში').intent).toBe('image_generation');
    expect(detectIntent('დახატე კატა').intent).toBe('image_generation');
    expect(detectIntent('შემიქმენი ვიდეო ზღვაზე').intent).toBe('video_generation');
    expect(detectIntent('დააგენერირე მუსიკა ჯაზი').intent).toBe('music_generation');
    for (const m of ['გამიკეთე სურათი მთის', 'დახატე ლომი', 'შემიქმენი ვიდეო ცხენზე', 'დააგენერირე სიმღერა']) {
      expect(wouldDispatch(m)).toBe(true);
    }
  });

  it('does NOT dispatch a Georgian QUESTION about media (no false-positive charge)', () => {
    for (const q of ['რა არის საუკეთესო სურათი?', 'როგორ გავაკეთო ვიდეო?', 'რომელი მუსიკაა კარგი?']) {
      expect(wouldDispatch(q)).toBe(false);
    }
  });

  // A photo-ANALYSIS ask that leads with the GENERIC verb გააკეთ ("do/make") used to match the image bank
  // (0.82) — the visual_analysis bank missed the bare noun ანალიზი — so an attached photo was fed into a
  // PAID img2img render instead of a vision description. These lock the classification + no-dispatch fix.
  it('classifies Georgian photo-analysis as visual_analysis (never a paid image render)', () => {
    expect(detectIntent('გააკეთე ფოტოს ანალიზი').intent).toBe('visual_analysis');
    expect(detectIntent('გააკეთე ამ სურათის ანალიზი').intent).toBe('visual_analysis');
    expect(detectIntent('აღწერე ეს ფოტო').intent).toBe('visual_analysis');
    for (const q of ['გააკეთე ფოტოს ანალიზი', 'გააკეთე ამ სურათის ანალიზი', 'აღწერე ეს ფოტო']) {
      expect(wouldDispatch(q)).toBe(false); // must NOT auto-spend a credit
    }
    // …while genuine Georgian generate commands are untouched by the analysis guard
    expect(detectIntent('გამიკეთე სურათი მთის').intent).toBe('image_generation');
    expect(detectIntent('დახატე ლომი').intent).toBe('image_generation');
    expect(wouldDispatch('გამიკეთე სურათი მთის')).toBe(true);
  });

  // ⚠️ 2026-10-16: the owner asked the chat for a picture, a song and a video in the owner's own words and got a conversation
  // back. Georgian puts the verb where it likes, says „please" formally, and asks with „შეგიძლია …?" and „მინდა …"; the
  // gate only knew a verb at the start. Nothing here charges: the chat shows Agent G's card and renders only on a tap.
  const laneOf = (m: string) => (isGenerativeCommand(m) ? resolveGenerativeLane(m, detectIntent(m)) : null);

  it('reads Georgian orders whatever the word order, the politeness or the mood', () => {
    const cases: Array<[string, string]> = [
      ['კატის სურათი დამიხატე', 'image_generation'],
      ['სურათი დამიხატე კატის', 'image_generation'],
      ['კატა დამიხატე', 'image_generation'],
      ['ლოგო დამიხატე ჩემი კაფესთვის', 'image_generation'],
      ['ფოტო გამიკეთე სტუდიურ განათებაში', 'image_generation'],
      ['გთხოვთ დამიხატეთ კატა ბაღში', 'image_generation'],
      ['გთხოვ, დამიხატე კატა ბაღში', 'image_generation'],
      ['შეგიძლია დამიხატო კატა?', 'image_generation'],
      ['შეგიძლია სურათი გამიკეთო ზღვაზე?', 'image_generation'],
      ['მინდა კატის სურათი', 'image_generation'],
      ['მინდა სურათი ზღვაზე მზის ჩასვლისას', 'image_generation'],
      ['მჭირდება ლოგო ჩემი კაფესთვის', 'image_generation'],
      ['მინდა რომ დამიხატო ზღვა', 'image_generation'],
      ['მუსიკა შემიქმენი', 'music_generation'],
      ['შემიქმნი მუსიკა მშვიდი', 'music_generation'],
      ['სიმღერა დამიწერე სიყვარულზე', 'music_generation'],
      ['გთხოვთ შემიქმენით სიმღერა', 'music_generation'],
      ['შეგიძლია მუსიკა შემიქმნა?', 'music_generation'],
      ['მინდა მშვიდი მუსიკა', 'music_generation'],
      ['ვიდეოსთვის მუსიკა შემიქმენი', 'music_generation'],
      ['ვიდეო გამიკეთე ზღვაზე', 'video_generation'],
      ['მომიმზადე ვიდეო ზღვაზე', 'video_generation'],
      ['შეგიძლია ვიდეო გამიკეთო ზღვაზე?', 'video_generation'],
      ['можешь нарисовать кота?', 'image_generation'],
    ];
    for (const [m, lane] of cases) expect([m, laneOf(m)]).toEqual([m, lane]);
  });

  it('leaves Georgian questions, refusals, memories, homework and edits of an existing file in the chat', () => {
    for (const m of [
      'ვიდეო როგორ გავაკეთო?', 'რატომ ვერ გამიკეთე სურათი?', 'სურათი ვერ გამიკეთე', 'გუშინ რომ ვიდეო გამიკეთე, მომეწონა',
      'რა შეგიძლია?', 'დავალება გამიკეთე მათემატიკაში', 'ეს გამიკეთე', 'მინდა გკითხო სურათზე', 'მინდა ეს ფოტო წავშალო',
      'მინდა ჩემი ფოტო გავაუმჯობესო', 'მინდა ვიცოდე როგორ კეთდება ვიდეო', 'ვიდეოს ანალიზი გამიკეთე', 'მინდა დავისვენო',
      'სურათი ლამაზია', 'მუსიკა მიყვარს', 'წერილი დამიწერე მეგობარს', 'მჭირდება რჩევა მუსიკალური კლიპისთვის',
      'მინდა იდეები ვიდეოსთვის',
    ]) {
      expect([m, laneOf(m)]).toEqual([m, null]);
    }
  });

  it('a text ABOUT a video or a picture is written, never rendered', () => {
    expect(laneOf('დამიწერე სცენარი ვიდეოზე')).toBeNull();
    expect(laneOf('write a script for my video')).toBeNull();
    expect(laneOf('ვიდეოსთვის სცენარი დაწერე')).toBeNull();
    expect(laneOf('სურათზე ტექსტი დამიწერე')).toBeNull();
    expect(laneOf('დამიწერე სიმღერა სიყვარულზე')).toBe('music_generation'); // a song is still written AND sung
  });

  it('the Georgian helpers, one by one', () => {
    expect(isKaVerbFinalOrder('კატის სურათი დამიხატე')).toBe(true);
    expect(isKaVerbFinalOrder('დავალება გამიკეთე')).toBe(false); // a generic verb needs a media noun
    expect(isKaVerbFinalOrder('ერთი ორი სამი ოთხი ხუთი დამიხატე')).toBe(false); // the verb must come early
    expect(isKaWishOrder('მინდა კატის სურათი')).toBe(true);
    expect(isKaWishOrder('მინდა კატის სურათი?')).toBe(false);
    expect(kaNotAnOrder('გუშინ რომ ვიდეო გამიკეთე, მომეწონა')).toBe(true);
    expect(kaNotAnOrder('ერთწუთიანი ვიდეო გამიკეთე ზღვაზე')).toBe(false);
  });
});

describe('isVideoIntent / isMusicVideoIntent — a video is not a track', () => {
  it('a Georgian music video by either name goes to the Video tool in music-video mode', () => {
    for (const m of ['გააკეთე მუსიკალური კლიპი', 'მუსიკალური კლიპი გამიკეთე სიყვარულზე', 'გამიკეთე მუსიკალური ვიდეო', 'ვიდეო კლიპი შემიქმენი']) {
      expect([m, isVideoIntent(m), isMusicVideoIntent(m)]).toEqual([m, true, true]);
    }
  });

  it('a Georgian video asked either way round is a video; music FOR a video is music', () => {
    expect(isVideoIntent('ვიდეო გამიკეთე ზღვაზე')).toBe(true);
    expect(isVideoIntent('გამიკეთე ვიდეო ზღვაზე')).toBe(true);
    expect(isVideoIntent('მომიმზადე ვიდეო ზღვაზე')).toBe(true);
    expect(isVideoIntent('ვიდეოსთვის მუსიკა შემიქმენი')).toBe(false);
    expect(isVideoIntent('გამიკეთე სიმღერა ჩემი ვიდეოსთვის')).toBe(false);
    expect(isVideoIntent('დამიწერე სცენარი ვიდეოზე')).toBe(false);
  });

  it('keeps the English and Russian cues it had', () => {
    expect(isVideoIntent('make a music video about summer')).toBe(true);
    expect(isVideoIntent('a 30 second clip of the beach')).toBe(true);
    expect(isVideoIntent('сделай видео про море')).toBe(true);
    expect(isVideoIntent('my client asked for a song')).toBe(false);
    expect(isMusicVideoIntent('make a music video')).toBe(true);
    expect(isMusicVideoIntent('make a video of the sea')).toBe(false);
  });
});
