/**
 * Phase 8.25 — Russian for the v8 pricing page. lib/billing/margin keeps ka + en only (its rows are pinned by many tests),
 * so the page overlays Russian here, keyed by plan id, the perk's English text and the price row id. PricingV8.test holds
 * every visible plan, perk and row to a Russian entry, so a new row cannot ship to /ru in English.
 */
export const RU_PLAN_NAME: Record<string, string> = {
  free: 'Бесплатный',
  start: 'Старт',
  creator: 'Креатор',
  pro: 'Про',
  business: 'Бизнес',
};

export const RU_PERK: Record<string, string> = {
  '50 credits when you sign up': '50 кредитов при регистрации',
  'Chat with a daily limit': 'Чат с дневным лимитом',
  'Live avatar: 1 minute a day': 'Живой аватар: 1 минута в день',
  'No watermark': 'Без водяного знака',
  'Commercial use': 'Коммерческое использование',
  '1080p video': 'Видео 1080p',
  'Priority queue': 'Приоритетная очередь',
  'Full Agent G access': 'Полный доступ к Agent G',
  'Long films (48 s+)': 'Длинные фильмы (48 с+)',
  'Lowest price per credit': 'Самая низкая цена за кредит',
  'Company invoice': 'Счёт на компанию',
};

export const RU_ROW: Record<string, string> = {
  'video.omni.720p.4s': 'Видео 4 с, 720p (с грузинской речью)',
  'video.omni.720p.6s': 'Видео 6 с, 720p (с грузинской речью)',
  'video.omni.720p.8s': 'Видео 8 с, 720p (с грузинской речью)',
  'video.omni.720p.10s': 'Видео 10 с, 720p (с грузинской речью)',
  'video.omni.1080p.4s': 'Видео 4 с, 1080p (с грузинской речью)',
  'video.omni.1080p.6s': 'Видео 6 с, 1080p (с грузинской речью)',
  'video.omni.1080p.8s': 'Видео 8 с, 1080p (с грузинской речью)',
  'video.omni.1080p.10s': 'Видео 10 с, 1080p (с грузинской речью)',
  'video.omni.edit.720p.4s': 'Правка / продление видео 4 с, 720p',
  'video.omni.edit.720p.6s': 'Правка / продление видео 6 с, 720p',
  'video.omni.edit.720p.8s': 'Правка / продление видео 8 с, 720p',
  'video.omni.edit.720p.10s': 'Правка / продление видео 10 с, 720p',
  'video.veo.lite.720p.8s': 'Veo 3.1 lite 720p со звуком, 8 с',
  'video.veo.fast.1080p.8s': 'Veo 3.1 fast 1080p со звуком, 8 с',
  'image.1k': 'Изображение 1K',
  'image.2k': 'Изображение 2K',
  'image.4k': 'Изображение 4K',
  'image.edit.1k': 'Правка изображения 1K',
  'music.clip': 'Музыка, 30 секунд',
  'music.song': 'Полная песня (~3 мин)',
  'voice.tts.minute': 'Озвучка текста, 1 минута',
  'voice.stt.minute': 'Речь в текст (Chirp 3), 1 минута',
  'live.voice.minute': 'Живой голосовой звонок, 1 минута',
  'live.avatar.minute': 'Живой говорящий аватар (видео + голос), 1 минута',
};

export const RU_UNIT: Record<string, string> = {
  '1 clip': '1 клип',
  '8-second clip': 'клип 8 секунд',
  '1 image': '1 изображение',
  '1 track': '1 трек',
  '1 song': '1 песня',
  '1 minute of audio': '1 минута аудио',
  '1 minute': '1 минута',
};

export const RU_SERVICE: Record<string, string> = {
  video: 'Видео',
  image: 'Изображения',
  music: 'Музыка',
  voice: 'Голос',
  live: 'Живой аватар',
  chat: 'Чат',
};
