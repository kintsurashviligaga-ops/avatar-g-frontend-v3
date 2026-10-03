/** @jest-environment node */
/**
 * lib/services/workspaceForms.ts — what each /{lang}/services/<slug> page offers.
 *
 * The option VALUES are what the routes read (the pipeline writes „Duration: <value> days" into its prompt), so they are
 * pinned here exactly as the page sent them before its labels were localised. The labels must exist in ka · en · ru, and
 * a Georgian label must be Georgian — „Full Itinerary" in the Georgian UI was the bug.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isToolId } from '@/lib/studio/tools';
import {
  SERVICE_FORMS,
  SERVICE_STUDIO_TOOL,
  apiErrorMessage,
  buildGenerateRequest,
  extractOutputText,
  extractOutputUrl,
  formDefaults,
  isAuthRequired,
  servicePlan,
  studioToolHref,
  unwrapApiData,
} from './workspaceForms';

const GEORGIAN = /[Ⴀ-ჿ]/;
const CYRILLIC = /[Ѐ-ӿ]/;

/** Every select's values, exactly as ServiceWorkspaceView sent them before 2026-10-03. */
const PINNED_VALUES: Record<string, Record<string, string[]>> = {
  tourism: {
    type: ['itinerary', 'guide', 'budget', 'hidden_gems', 'weekend'],
    duration: ['1', '3', '5', '7', '14'],
    style: ['cultural', 'adventure', 'luxury', 'backpacker', 'family', 'food'],
  },
  'content-writer': {
    type: ['article', 'seo', 'social', 'email', 'ad', 'product'],
    tone: ['professional', 'casual', 'persuasive', 'educational', 'creative'],
    language: ['ka', 'en', 'ru'],
  },
  podcast: {
    format: ['interview', 'solo', 'panel', 'storytelling', 'educational'],
    duration: ['5', '15', '30', '60'],
    tone: ['conversational', 'professional', 'entertaining', 'investigative'],
  },
  character: {
    archetype: ['hero', 'villain', 'mentor', 'trickster', 'npc', 'ai'],
    world: ['fantasy', 'scifi', 'modern', 'historical', 'post_apocalyptic', 'georgian'],
    depth: ['brief', 'standard', 'deep'],
  },
  event: {
    type: ['conference', 'wedding', 'concert', 'corporate', 'launch', 'birthday', 'gala'],
    output: ['program', 'mc_script', 'invitation', 'promo', 'full'],
  },
  terminal: {
    language: ['typescript', 'python', 'javascript', 'react', 'swift', 'kotlin', 'go', 'rust', 'bash', 'sql'],
    style: ['production', 'minimal', 'commented', 'tests'],
  },
  game: {
    genre: ['puzzle', 'rpg', 'arcade', 'simulation', 'platformer', 'strategy', 'shooter', 'horror', 'adventure', 'fighting'],
    platform: ['mobile', 'pc', 'web', 'console', 'cross'],
    art_style: ['pixel', 'cartoon', 'realistic', 'low_poly', 'stylized', 'anime'],
  },
  'prompt-builder': {
    target: ['gpt4', 'claude', 'gemini', 'flux', 'midjourney', 'dalle', 'kling', 'sora'],
    style: ['detailed', 'concise', 'creative', 'technical', 'cinematic'],
  },
  voice: {
    voice_style: ['neutral', 'warm', 'professional', 'dramatic', 'calm'],
    language: ['ka', 'en', 'ru'],
  },
  software: { language: ['typescript', 'python', 'react', 'swift'] },
  business: { type: ['market', 'pitch', 'financial', 'competitor'] },
};

/** The slugs app/[locale]/services/[slug]/page.tsx pre-renders. */
function pageSlugs(): string[] {
  const page = readFileSync(join(process.cwd(), 'app/[locale]/services/[slug]/page.tsx'), 'utf8');
  return [...(page.match(/const SHORT_SLUGS = \[([\s\S]*?)\] as const/)?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!);
}

describe('option values — what the routes receive — are unchanged', () => {
  test.each(Object.entries(PINNED_VALUES))('%s', (slug, fields) => {
    const form = SERVICE_FORMS[slug]!;
    expect(form).toBeDefined();
    const selects = Object.fromEntries(form.fields.filter((f) => f.type === 'select').map((f) => [f.id, f.options!.map((o) => o.value)]));
    expect(selects).toEqual(fields);
    // Every default is one of its own options.
    for (const f of form.fields) if (f.type === 'select') expect(f.options!.map((o) => o.value)).toContain(f.defaultValue);
  });

  test('the two prompt pages are one form, and `prompt` posts as the real prompt builder', () => {
    expect(SERVICE_FORMS.prompt).toBe(SERVICE_FORMS['prompt-builder']);
    expect(SERVICE_FORMS.prompt!.route).toEqual({ kind: 'pipeline', serviceId: 'prompt-builder', output: 'text' });
  });
});

describe('every label exists in ka · en · ru, and the Georgian one is Georgian', () => {
  const all = Object.entries(SERVICE_FORMS).flatMap(([slug, form]) => [
    ...form.fields.flatMap((f) => [
      { where: `${slug}.${f.id} label`, l: f.label },
      ...(f.placeholder ? [{ where: `${slug}.${f.id} placeholder`, l: f.placeholder }] : []),
      ...(f.options ?? []).map((o) => ({ where: `${slug}.${f.id}=${o.value}`, l: o.label })),
    ]),
    { where: `${slug} action`, l: form.actionLabel },
    { where: `${slug} hint`, l: form.previewHint },
  ]);

  test.each(all)('$where', ({ l }) => {
    for (const lang of ['ka', 'en', 'ru'] as const) expect(l[lang].trim().length).toBeGreaterThan(0);
    // A name (TypeScript, RPG, English) reads the same everywhere; anything else is translated.
    if (l.ka === l.en && l.en === l.ru) return;
    expect(l.ka).toMatch(GEORGIAN);
    expect(l.ru).toMatch(CYRILLIC);
  });
});

describe('servicePlan — a studio tool, or the page\'s own form', () => {
  test('services the studio has a tool for open that tool', () => {
    expect(servicePlan('video')).toEqual({ kind: 'studio', tool: 'video' });
    expect(servicePlan('image')).toEqual({ kind: 'studio', tool: 'image' });
    expect(servicePlan('music')).toEqual({ kind: 'studio', tool: 'music' });
    expect(servicePlan('avatar')).toEqual({ kind: 'studio', tool: 'avatar' });
    expect(servicePlan('interior')).toEqual({ kind: 'studio', tool: 'interior' });
    expect(servicePlan('photo')).toEqual({ kind: 'studio', tool: 'photoshoot' });
    expect(servicePlan('editing')).toEqual({ kind: 'studio', tool: 'montage' });
  });

  test('services that never had a working generator here open the chat — so does anything unknown', () => {
    for (const slug of ['agent-g', 'text', 'media', 'visual-intel', 'shop', 'workflow', 'next', 'nope', 'constructor', '__proto__']) {
      expect(servicePlan(slug)).toEqual({ kind: 'studio', tool: 'chat' });
    }
  });

  test('text services keep their own form', () => {
    for (const slug of ['tourism', 'game', 'prompt', 'prompt-builder', 'terminal', 'content-writer', 'podcast', 'character', 'event', 'voice', 'software', 'business']) {
      expect(servicePlan(slug).kind).toBe('form');
    }
  });

  test('every pre-rendered slug has a plan, every mapped tool is a real studio tool, and no slug is both', () => {
    const slugs = pageSlugs();
    expect(slugs.length).toBeGreaterThanOrEqual(25);
    for (const slug of slugs) {
      const plan = servicePlan(slug);
      if (plan.kind === 'studio') expect(isToolId(plan.tool)).toBe(true);
    }
    for (const tool of Object.values(SERVICE_STUDIO_TOOL)) expect(isToolId(tool)).toBe(true);
    for (const slug of Object.keys(SERVICE_FORMS)) expect(SERVICE_STUDIO_TOOL[slug]).toBeUndefined();
  });

  test('studioToolHref opens the studio on the tool, in a known language', () => {
    expect(studioToolHref('ka', 'video')).toBe('/ka/dashboard?tool=video');
    expect(studioToolHref('en', 'photoshoot')).toBe('/en/dashboard?tool=photoshoot');
    expect(studioToolHref('ru', 'chat')).toBe('/ru/dashboard?tool=chat');
    expect(studioToolHref('xx', 'music')).toBe('/ka/dashboard?tool=music');
  });
});

describe('buildGenerateRequest — the same route and body as before', () => {
  const opts = { sessionId: 'workspace_s', locale: 'en' as const };

  test('a pipeline service: every non-prompt field as an answer, the defaults when untouched, and the page language', () => {
    const form = SERVICE_FORMS.tourism!;
    const req = buildGenerateRequest(form, { ...formDefaults(form), prompt: '  Kazbegi in May  ' }, opts);
    expect(req).toEqual({
      path: '/api/pipeline',
      body: {
        action: 'generate',
        serviceId: 'tourism',
        sessionId: 'workspace_s',
        userInput: 'Kazbegi in May',
        answers: { type: 'itinerary', duration: '5', style: 'cultural' },
        locale: 'en',
      },
    });
  });

  test('prompt posts as prompt-builder; voice as voice', () => {
    expect(buildGenerateRequest(SERVICE_FORMS.prompt!, { prompt: 'x', target: 'flux' }, opts).body).toMatchObject({ serviceId: 'prompt-builder', answers: { target: 'flux' } });
    expect(buildGenerateRequest(SERVICE_FORMS.voice!, { prompt: 'x', voice_style: 'calm', language: 'ka' }, opts).body).toMatchObject({ serviceId: 'voice', answers: { voice_style: 'calm', language: 'ka' } });
  });

  test('software → /api/orbit/code-generation; business → /api/chat with the report type in the message', () => {
    expect(buildGenerateRequest(SERVICE_FORMS.software!, { prompt: 'a CLI', language: 'python' }, opts)).toEqual({
      path: '/api/orbit/code-generation',
      body: { prompt: 'a CLI', language: 'python', framework: 'MyAvatar workspace' },
    });
    const biz = buildGenerateRequest(SERVICE_FORMS.business!, { prompt: 'Coffee in Tbilisi', type: 'competitor' }, { sessionId: 's', locale: 'ka' });
    expect(biz.path).toBe('/api/chat');
    expect(biz.body).toEqual({
      message: 'Coffee in Tbilisi\n\nReport type: competitor. Return an executive summary, key findings, risks, and concrete next actions.',
      context: 'business',
      serviceId: 'business',
      language: 'ka',
      locale: 'ka',
    });
  });
});

describe('reading the answers', () => {
  test('a snake_case error is a code — its message is the sentence', () => {
    expect(apiErrorMessage({ success: false, error: 'auth_required', authRequired: true, message: 'შედი' })).toBe('შედი');
    expect(apiErrorMessage({ error: 'Too many requests' })).toBe('Too many requests');
    expect(apiErrorMessage({ data: { message: 'nested' } })).toBe('nested');
    expect(apiErrorMessage(null)).toBeNull();
    expect(apiErrorMessage({})).toBeNull();
  });

  test('a 401, or a body that says authRequired, asks for sign-in', () => {
    expect(isAuthRequired(401, null)).toBe(true);
    expect(isAuthRequired(403, { authRequired: true })).toBe(true);
    expect(isAuthRequired(500, { error: 'boom' })).toBe(false);
  });

  test('text and urls, from bare and enveloped bodies', () => {
    expect(extractOutputText(unwrapApiData({ success: true, data: { response: 'hi' } }))).toBe('hi');
    expect(extractOutputText({ output: 'code', detail: 'TypeScript output' })).toBe('code');
    expect(extractOutputText({ result: '   ' })).toBeNull();
    expect(extractOutputUrl({ result_url: 'https://x/a.mp3' })).toBe('https://x/a.mp3');
    expect(extractOutputUrl({ normalized: { audio: 'data:audio/mpeg;base64,AA' } })).toBe('data:audio/mpeg;base64,AA');
    expect(extractOutputUrl({ url: 'javascript:alert(1)' })).toBeNull();
  });
});
