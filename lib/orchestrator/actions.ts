import type { Locale, PipelineContext, ServiceResponse, SuggestedAction } from './types';

/**
 * Proactive orchestration core. Given the last agent response and the
 * pipeline context, produce 3-5 next-step buttons. The chat UI renders
 * these under the latest reply.
 *
 * Strategy:
 *   - On error → always offer Retry + Stop. Never leave the user stuck.
 *   - On success → suggest the most likely next creative move based on
 *     the asset kind that was just produced (image → animate / variants;
 *     video → add segment / assemble; audio → add to video; code → publish).
 */
export function buildSuggestedActions(
  response: ServiceResponse | null,
  context: PipelineContext,
): SuggestedAction[] {
  const t = translatorFor(context.locale);

  if (response && !response.ok) {
    return [
      { label: t('სცადე თავიდან', 'Try again', 'Повторить'), action: 'RETRY_LAST', primary: true },
      { label: t('გასუფთავება', 'Clear chat', 'Очистить'),  action: 'CLEAR' },
    ];
  }

  const asset = response?.asset;
  if (!asset) {
    // No new asset (e.g. chat-only reply). Show light follow-up chips.
    return [
      { label: t('ვრცლად მითხარი', 'Tell me more',     'Подробнее'),                action: 'RUN_AGENT', payload: { agent: 'chat',  prompt: t('ვრცლად მითხარი', 'Tell me more', 'Расскажи подробнее') } },
      { label: t('სურათად აქციე',  'Make it an image', 'Сделай изображение'),        action: 'RUN_AGENT', payload: { agent: 'image', prompt: pluck(context, 'last_user_prompt') ?? '' } },
      { label: t('ვიდეოდ აქციე',   'Make it a video',  'Сделай видео'),              action: 'RUN_AGENT', payload: { agent: 'video', prompt: pluck(context, 'last_user_prompt') ?? '' } },
    ];
  }

  // Always offer Open in Preview when there's an asset.
  const base: SuggestedAction[] = [
    { label: t('გადახედვა', 'Open in preview', 'Открыть превью'), action: 'OPEN_PREVIEW', payload: { assetId: asset.id }, primary: true },
    { label: t('ჩამოტვირთვა', 'Download', 'Скачать'),                 action: 'DOWNLOAD',     payload: { assetId: asset.id } },
    { label: t('გაზიარება',    'Share',     'Поделиться'),             action: 'SHARE',        payload: { assetId: asset.id, target: 'native' } },
  ];

  switch (asset.kind) {
    case 'image': {
      // Image → animate it, generate variants, regenerate
      return [
        ...base,
        { label: t('ანიმაცია', 'Animate', 'Анимировать'),
          action: 'RUN_AGENT', payload: { agent: 'video', prompt: asset.prompt ?? '', inputs: [asset] } },
        { label: t('სხვა ვარიანტი', 'Another variant', 'Другой вариант'),
          action: 'RUN_AGENT', payload: { agent: 'image', prompt: asset.prompt ?? '' } },
      ];
    }
    case 'video': {
      // Video → camera-motion presets (one-tap variants) + 6s editor controls
      // + audio layers. Camera-motion chips emit ADD_VIDEO_SEGMENT with a
      // prompt suffix so the UI handler doesn't need to know motion strings.
      const basePrompt = (asset.prompt ?? '').trim();
      const motion = (suffix: string) => basePrompt ? `${basePrompt}, ${suffix}` : suffix;
      const out: SuggestedAction[] = [...base];
      out.push(
        { label: t('კამერა: Zoom In', 'Camera: Zoom In', 'Камера: Zoom In'),
          action: 'ADD_VIDEO_SEGMENT', payload: { prompt: motion('slow cinematic zoom in') } },
        { label: t('კამერა: Pan',     'Camera: Pan',     'Камера: Pan'),
          action: 'ADD_VIDEO_SEGMENT', payload: { prompt: motion('smooth horizontal pan') } },
        { label: t('კამერა: Static',  'Camera: Static',  'Камера: Static'),
          action: 'ADD_VIDEO_SEGMENT', payload: { prompt: motion('locked-off static camera') } },
      );
      const segCount = context.composition?.segments.length ?? 0;
      if (segCount >= 2) {
        out.push({
          label: t(`აწყობა (${segCount} კლიპი)`, `Assemble (${segCount} clips)`, `Собрать (${segCount})`),
          action: 'ASSEMBLE_VIDEO', primary: true,
        });
      }
      out.push(
        { label: t('მუსიკის დადება', 'Add music',     'Музыка'),
          action: 'ADD_MUSIC',     payload: { prompt: t('ფონური მუსიკა', 'Background music', 'Фоновая музыка') } },
        { label: t('ვოის-ოვერი',     'Add voiceover', 'Озвучка'),
          action: 'ADD_VOICEOVER', payload: { text: basePrompt } },
      );
      return out;
    }
    case 'audio': {
      // Audio → attach to current video / new video / regen
      return [
        ...base,
        { label: t('ვიდეო ფონს დაუმატე', 'Attach to video', 'К видео'),
          action: 'ADD_MUSIC', payload: { url: asset.url } },
        { label: t('ხელახლა',   'Regenerate',    'Перегенерировать'),
          action: 'RUN_AGENT',  payload: { agent: 'voice', prompt: asset.prompt ?? '' } },
      ];
    }
    case 'code': {
      // App Builder output → preview, share-as-app, refine, deploy
      return [
        ...base,
        { label: t('ფუნქციის დამატება', 'Add a feature', 'Добавить функцию'),
          action: 'RUN_AGENT', payload: { agent: 'app', prompt: t('დაუმატე ფუნქცია', 'Add a feature to:', 'Добавь функцию:') } },
        { label: t('თემის შეცვლა', 'Change theme', 'Сменить тему'),
          action: 'RUN_AGENT', payload: { agent: 'app', prompt: t('სხვა ფერი/თემა', 'Different colour theme', 'Другая цветовая тема') } },
      ];
    }
    default:
      return base;
  }
}

// ── small helpers ──

function translatorFor(locale: Locale) {
  return (ka: string, en: string, ru: string): string =>
    locale === 'ka' ? ka : locale === 'ru' ? ru : en;
}

function pluck(ctx: PipelineContext, key: string): string | undefined {
  if (!ctx.notes) return undefined;
  // Notes use a simple `key=value;` shape; orchestrator writes
  // `last_user_prompt=...;` to thread the last text through.
  const m = ctx.notes.match(new RegExp(`(?:^|;)\\s*${key}=([^;]+)`));
  return m?.[1]?.trim();
}
