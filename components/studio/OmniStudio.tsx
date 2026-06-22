'use client';

/**
 * OmniStudio (Service Hub — Card B). MyAvatar Smart Assistant (multimodal).
 *
 * A continuous conversational grid wired to POST /api/chat/gemini (the funded
 * Gemini key; streams `data: {"text"}` deltas). Three input modes, per the
 * blueprint: a live MIC node (records a clip → /api/voice/transcribe → drops the
 * text into the prompt), an asset attachment broker (images sent natively as
 * Gemini image parts), and the director's text box. Strict skin — black · white ·
 * #00D2FF. Fail-soft throughout.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, Mic, Square, Plus, X, Loader2, Sparkles, Film, Music2, FileText, Image as ImageIcon, Download, Upload, MessageSquare, Wand2, Volume2, Copy, Check, ChevronDown, RotateCcw, History, Trash2, MessageSquarePlus, Pencil, Share2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { driveFilmStudio } from '@/lib/chat/filmStudioClient';
import FilmDirectorConsole from './FilmDirectorConsole';
import { deriveFilmRoster, deriveFilmLog, type FilmAgentVM, type FilmLogLine } from '@/lib/chat/filmAgentRoster';
import { VoiceTrainer } from '@/components/voice/VoiceTrainer';
import { TrackPlayer } from './TrackPlayer';
import { Markdown } from './Markdown';
import { createBrowserClient } from '@/lib/supabase/browser';

type Lang = 'ka' | 'en' | 'ru';

// Upload a (possibly large) file straight to Supabase via a signed upload URL —
// browser → Supabase, BYPASSING Vercel's ~4.5MB function-body limit (a real song
// otherwise returns FUNCTION_PAYLOAD_TOO_LARGE). Returns a readable https URL or null.
async function uploadBigFile(dataUrl: string, mimeType: string): Promise<string | null> {
  try {
    const signRes = await fetch('/api/upload/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ contentType: mimeType }),
    });
    const sign = (await signRes.json().catch(() => ({}))) as { bucket?: string; path?: string; token?: string };
    if (!signRes.ok || !sign.path || !sign.token) return null;
    const blob = await (await fetch(dataUrl)).blob();
    const sb = createBrowserClient();
    const { error } = await sb.storage.from(sign.bucket || 'uploads').uploadToSignedUrl(sign.path, sign.token, blob, { contentType: mimeType });
    if (error) return null;
    // Return the storage PATH — the consumer route signs a readable URL once the
    // object exists (it can't be signed before the upload lands).
    return sign.path ?? null;
  } catch {
    return null;
  }
}

const COPY: Record<Lang, {
  title: string; subtitle: string; placeholder: string; empty: string; thinking: string; recording: string; micHint: string;
  modeChat: string; modeImage: string; imgPlaceholder: string; generatingImage: string; imageFailed: string; imgDownload: string; editImage: string; share: string; linkCopied: string; remix: string; remixPlaceholder: string; remixGenerating: string;
  magicHint: string;
  modeMusic: string; musicPlaceholder: string; generatingMusic: string; musicFailed: string; lyricsBlocked: string;
  modeVideo: string; videoPlaceholder: string; generatingVideo: string; videoFailed: string; generatingMyVoice: string; myVoiceCreate: string; myVoiceLyricsPh: string; myVoiceReady: string; writeLyricsBtn: string; upscaleBtn: string; upscaling: string; upscaleFailed: string;
  modeLipsync: string; lipsyncPlaceholder: string; generatingLipsync: string; lipsyncFailed: string; lipsyncNeedFiles: string; lipsyncAuth: string; lipAudioLabel: string;
  stop: string; stopped: string; scrollDown: string; regenerate: string; elapsedHint: string; greeting: string; attachHint: string;
  instrumental: string; withVocals: string; lyricsPlaceholder: string; coverMode: string; voiceMode: string; voiceLyricsPlaceholder: string; voiceSecTitle: string; voiceRec: string; voiceUp: string; voiceReady: string; voiceRecHint: string; need15: string;
  narration: string; narrationCue: string; transCrossfade: string; transCut: string;
  sbTitle: string; sbReview: string; sbGenerate: string; sbRegen: string; sbCancel: string; sbCreating: string; sbFailed: string; sbScene: string; sbEditHint: string; sbReroll: string; sbFrames: string;
  charPhoto: string; charPhotoOn: string;
  historyTitle: string; historyEmpty: string; historyNew: string; deleteLabel: string;
}> = {
  ka: {
    title: 'ჭკვიანი ასისტენტი', subtitle: 'ინტელექტუალური მულტიმოდალური ასისტენტი',
    placeholder: 'დაწერე, ჩაწერე ხმა, ან მიამაგრე სურათი…', empty: 'ჰკითხე ნებისმიერი რამ, შექმენი სურათი ან მუსიკა — ტექსტით, ხმით ან ფაილით.',
    thinking: 'ფიქრობს…', recording: 'იწერება…', micHint: 'ხმის ჩაწერა',
    modeChat: 'ჩატი', modeImage: 'სურათი', imgPlaceholder: 'აღწერე სურათი, რომ დაგიხატო…',
    generatingImage: 'სურათი იქმნება…', imageFailed: 'სურათის გენერაცია ვერ მოხერხდა. სცადე თავიდან.', imgDownload: 'ჩამოტვირთვა', editImage: 'რედაქტირება', share: 'გაზიარება', linkCopied: 'ბმული დაკოპირდა', remix: 'რემიქსი', remixPlaceholder: 'შეცვალე სცენა — მაგ. „გახადე მე-2 სცენა უფრო თბილი და ნათელი“…', remixGenerating: 'რემიქსი მუშავდება — მხოლოდ შეცვლილი სცენა გადაირენდერება…',
    magicHint: 'AI-ით პრომპტის გაუმჯობესება',
    modeMusic: 'მუსიკა', musicPlaceholder: 'აღწერე მუსიკა (მაგ. ეპიკური კინო-სცენა)…',
    generatingMusic: 'მუსიკა იქმნება… (1–3 წუთი)', musicFailed: 'მუსიკის გენერაცია ვერ მოხერხდა. სცადე თავიდან.', lyricsBlocked: '⚠️ ლირიკა დაიბლოკა (საავტორო უფლებები). შეცვალე სიტყვები ან დააჭირე „✨ ლირიკა დამიწერე".',
    modeVideo: 'ვიდეო', videoPlaceholder: 'აღწერე 30-წამიანი ვიდეო (ფოტო — პერსონაჟისთვის)…',
    generatingVideo: 'ვიდეო იქმნება… 6 სცენა + მონტაჟი (~5–7 წუთი, დაელოდე)', videoFailed: 'ვიდეოს გენერაცია ვერ მოხერხდა — შესაძლოა სერვისი დროებით დატვირთულია. სცადე თავიდან რამდენიმე წუთში.', generatingMyVoice: '🎵 სიმღერა იქმნება შენი ხმით… (~2–3 წუთი, დაელოდე)', myVoiceCreate: 'ჩემი ხმით შექმნა', myVoiceLyricsPh: 'დაწერე ლირიკა — რას იმღერებს შენი ხმა', myVoiceReady: 'დაწერე ლირიკა და შექმენი', writeLyricsBtn: '✨ ლირიკა დამიწერე', upscaleBtn: '⬆ HD გადიდება', upscaling: '🔍 ვადიდებ HD-მდე…', upscaleFailed: 'გადიდება ვერ მოხერხდა.',
    modeLipsync: 'ავატარი', lipsyncPlaceholder: 'ჩაწერე ტექსტი — AI წამყვანი ალაპარაკდება შენი ხმით (ან მიამაგრე ფოტო, რომ ის ალაპარაკდეს)…',
    generatingLipsync: 'ავატარი იქმნება…', lipsyncFailed: 'ავატარი ვერ შეიქმნა.', lipsyncNeedFiles: 'მიამაგრე ფოტო და ტექსტი (ან აუდიო).', lipsyncAuth: 'ავატარისთვის ჯერ გაიარე ავტორიზაცია.', lipAudioLabel: 'აუდიო',
    stop: 'შეჩერება', stopped: 'შეჩერდა', scrollDown: 'ბოლოში გადასვლა', regenerate: 'თავიდან გენერაცია', elapsedHint: 'გავიდა', greeting: 'რით დაგეხმარო?', attachHint: 'დამატება',
    instrumental: 'ინსტრუმენტალი', withVocals: 'ვოკალით', lyricsPlaceholder: 'ლირიკა (არჩევითი) — შენი ტექსტი; ცარიელი = ავტომატური', coverMode: '🎵 ქავერი', voiceMode: '🎤 ჩემი ხმით', voiceLyricsPlaceholder: 'ლირიკა — რას იმღერებს შენი ხმა (ატვირთე ≥15წმ ხმა)', voiceSecTitle: '🎤 შენი ხმა', voiceRec: 'ჩაწერა', voiceUp: 'ატვირთვა', voiceReady: 'ხმა მზადაა — აირჩიე „ჩემი ხმით"', voiceRecHint: 'ჩაიწერე ან ატვირთე ≥15წმ ხმა — სიმღერა შენი ვოკალით შეიქმნება', need15: '≥15წმ',
    narration: 'ნარაცია', narrationCue: ' (პროფესიონალი კომენტატორის ხმოვანი ნარაციით)', transCrossfade: 'გადადნობა', transCut: 'კვეთა',
    sbTitle: 'სტორიბორდი', sbReview: 'გადახედე 6 სცენას — შეცვალე ტექსტი ან თავიდან დააგენერირე კადრი, შემდეგ გაუშვი ვიდეო', sbGenerate: 'ვიდეოს გენერაცია', sbRegen: 'თავიდან', sbCancel: 'გაუქმება', sbCreating: 'სცენარი და 6 კადრი იქმნება…', sbFailed: 'სტორიბორდი ვერ შეიქმნა. სცადე თავიდან.', sbScene: 'სცენა', sbEditHint: 'შეცვალე ამ კადრის აღწერა…', sbReroll: 'კადრის თავიდან დაგენერირება', sbFrames: 'კადრი',
    charPhoto: 'პერსონაჟის ფოტო', charPhotoOn: 'პერსონაჟი ✓',
    historyTitle: 'ისტორია', historyEmpty: 'ჯერ საუბრები არ არის', historyNew: 'ახალი ჩატი', deleteLabel: 'წაშლა',
  },
  en: {
    title: 'Smart Assistant', subtitle: 'Intelligent multimodal assistant',
    placeholder: 'Type, record your voice, or attach an image…', empty: 'Ask anything, or generate an image or music — by text, voice or file.',
    thinking: 'Thinking…', recording: 'Recording…', micHint: 'Record voice',
    modeChat: 'Chat', modeImage: 'Image', imgPlaceholder: 'Describe an image to generate…',
    generatingImage: 'Generating image…', imageFailed: 'Image generation failed. Try again.', imgDownload: 'Download', editImage: 'Edit', share: 'Share', linkCopied: 'Link copied', remix: 'Remix', remixPlaceholder: 'Edit a scene — e.g. “make scene 2 warmer and brighter”…', remixGenerating: 'Remixing — re-rendering only the edited scene…',
    magicHint: 'Enhance prompt with AI',
    modeMusic: 'Music', musicPlaceholder: 'Describe the music (e.g. epic cinematic scene)…',
    generatingMusic: 'Composing music… (1–3 min)', musicFailed: 'Music generation failed. Try again.', lyricsBlocked: '⚠️ Lyrics were blocked (copyright). Change the words or tap "✨ Write lyrics".',
    modeVideo: 'Video', videoPlaceholder: 'Describe a 30-second video (attach a photo for the character)…',
    generatingVideo: 'Producing video… 6 scenes + montage (~5–7 min, please wait)', videoFailed: 'Video generation failed — the service may be busy. Please try again in a few minutes.', generatingMyVoice: '🎵 Creating a song in your voice… (~2–3 min, please wait)', myVoiceCreate: 'Create with my voice', myVoiceLyricsPh: 'Write lyrics — what your voice will sing', myVoiceReady: 'Write lyrics & create', writeLyricsBtn: '✨ Write lyrics', upscaleBtn: '⬆ HD upscale', upscaling: '🔍 Upscaling to HD…', upscaleFailed: 'Upscale failed.',
    modeLipsync: 'Avatar', lipsyncPlaceholder: 'Type a script — an AI presenter speaks it in your voice (or attach a photo to make it talk)…',
    generatingLipsync: 'Creating your Avatar…', lipsyncFailed: 'Avatar creation failed.', lipsyncNeedFiles: 'Attach a photo and a script (or audio).', lipsyncAuth: 'Sign in first to use Avatar.', lipAudioLabel: 'Audio',
    stop: 'Stop', stopped: 'Stopped', scrollDown: 'Scroll to bottom', regenerate: 'Regenerate', elapsedHint: 'elapsed', greeting: 'How can I help?', attachHint: 'Add',
    instrumental: 'Instrumental', withVocals: 'Vocals', lyricsPlaceholder: 'Lyrics (optional) — your words; empty = auto-written', coverMode: '🎵 Cover', voiceMode: '🎤 My voice', voiceLyricsPlaceholder: 'Lyrics — what your voice will sing (upload ≥15s of voice)', voiceSecTitle: '🎤 Your voice', voiceRec: 'Record', voiceUp: 'Upload', voiceReady: 'Voice ready — pick “My voice”', voiceRecHint: 'Record or upload ≥15s of voice — the song is sung in your voice', need15: '≥15s',
    narration: 'Narration', narrationCue: ' (with professional spoken voice-over narration)', transCrossfade: 'Crossfade', transCut: 'Cut',
    sbTitle: 'Storyboard', sbReview: 'Review the 6 scenes — edit a description or re-roll a frame, then generate', sbGenerate: 'Generate Video', sbRegen: 'Regenerate', sbCancel: 'Cancel', sbCreating: 'Creating storyboard & 6 frames…', sbFailed: 'Storyboard failed. Try again.', sbScene: 'Scene', sbEditHint: 'Edit this shot…', sbReroll: 'Re-roll this frame', sbFrames: 'frames',
    charPhoto: 'Character photo', charPhotoOn: 'Character ✓',
    historyTitle: 'History', historyEmpty: 'No chats yet', historyNew: 'New chat', deleteLabel: 'Delete',
  },
  ru: {
    title: 'Умный ассистент', subtitle: 'Интеллектуальный мультимодальный ассистент',
    placeholder: 'Напишите, запишите голос или прикрепите изображение…', empty: 'Спросите что угодно или создайте изображение или музыку — текстом, голосом или файлом.',
    thinking: 'Думает…', recording: 'Запись…', micHint: 'Записать голос',
    modeChat: 'Чат', modeImage: 'Изображение', imgPlaceholder: 'Опишите изображение для генерации…',
    generatingImage: 'Генерирую изображение…', imageFailed: 'Не удалось сгенерировать изображение. Попробуйте снова.', imgDownload: 'Скачать', editImage: 'Изменить', share: 'Поделиться', linkCopied: 'Ссылка скопирована', remix: 'Ремикс', remixPlaceholder: 'Измените сцену — напр. «сделай 2-ю сцену теплее и ярче»…', remixGenerating: 'Ремикс — перерисовывается только изменённая сцена…',
    magicHint: 'Улучшить промпт с AI',
    modeMusic: 'Музыка', musicPlaceholder: 'Опишите музыку (напр. эпичная кино-сцена)…',
    generatingMusic: 'Создаю музыку… (1–3 мин)', musicFailed: 'Не удалось создать музыку. Попробуйте снова.', lyricsBlocked: '⚠️ Текст заблокирован (авторские права). Измените слова или нажмите «✨ Написать текст».',
    modeVideo: 'Видео', videoPlaceholder: 'Опишите 30-секундное видео (фото — для персонажа)…',
    generatingVideo: 'Создаю видео… 6 сцен + монтаж (~5–7 мин, подождите)', videoFailed: 'Не удалось создать видео — сервис может быть загружен. Попробуйте через несколько минут.', generatingMyVoice: '🎵 Создаю песню вашим голосом… (~2–3 мин, подождите)', myVoiceCreate: 'Создать моим голосом', myVoiceLyricsPh: 'Напишите текст — что споёт ваш голос', myVoiceReady: 'Напишите текст и создайте', writeLyricsBtn: '✨ Написать текст', upscaleBtn: '⬆ HD увеличить', upscaling: '🔍 Увеличиваю до HD…', upscaleFailed: 'Не удалось увеличить.',
    modeLipsync: 'Аватар', lipsyncPlaceholder: 'Введите текст — AI-ведущий озвучит его вашим голосом (или прикрепите фото, чтобы оно заговорило)…',
    generatingLipsync: 'Создаю аватар…', lipsyncFailed: 'Не удалось создать аватар.', lipsyncNeedFiles: 'Прикрепите фото и текст (или аудио).', lipsyncAuth: 'Войдите, чтобы использовать Аватар.', lipAudioLabel: 'Аудио',
    stop: 'Стоп', stopped: 'Остановлено', scrollDown: 'Вниз', regenerate: 'Заново', elapsedHint: 'прошло', greeting: 'Чем помочь?', attachHint: 'Добавить',
    instrumental: 'Инструментал', withVocals: 'Вокал', lyricsPlaceholder: 'Текст (необязательно) — ваши слова; пусто = авто', coverMode: '🎵 Кавер', voiceMode: '🎤 Мой голос', voiceLyricsPlaceholder: 'Текст — что споёт ваш голос (загрузите ≥15с голоса)', voiceSecTitle: '🎤 Ваш голос', voiceRec: 'Запись', voiceUp: 'Загрузить', voiceReady: 'Голос готов — выберите «Мой голос»', voiceRecHint: 'Запишите или загрузите ≥15с голоса — песня будет спета вашим голосом', need15: '≥15с',
    narration: 'Озвучка', narrationCue: ' (с профессиональной голосовой озвучкой)', transCrossfade: 'Плавно', transCut: 'Резко',
    sbTitle: 'Раскадровка', sbReview: 'Просмотрите 6 сцен — измените описание или кадр, затем сгенерируйте', sbGenerate: 'Сгенерировать видео', sbRegen: 'Заново', sbCancel: 'Отмена', sbCreating: 'Создаю раскадровку и 6 кадров…', sbFailed: 'Не удалось создать раскадровку. Попробуйте снова.', sbScene: 'Сцена', sbEditHint: 'Измените этот кадр…', sbReroll: 'Пересоздать кадр', sbFrames: 'кадры',
    charPhoto: 'Фото персонажа', charPhotoOn: 'Персонаж ✓',
    historyTitle: 'История', historyEmpty: 'Пока нет чатов', historyNew: 'Новый чат', deleteLabel: 'Удалить',
  },
};

// Staged process labels for the live progress card. The engines don't emit a real
// percentage, so we narrate the work as human-legible stages while an eased,
// time-based bar advances — the "loading process" a modern chatbot shows. (Video
// already streams its own live status from the pipeline, which overrides these.)
const STAGES: Record<Lang, Record<'image' | 'music' | 'video' | 'lipsync', string[]>> = {
  ka: {
    image: ['აღწერას ვიაზრებ…', 'კადრს ვხატავ…', 'დეტალებს ვამატებ…', 'ვასრულებ…'],
    music: ['იდეას ვამუშავებ…', 'მელოდიას ვაკომპონებ…', 'ხმებს ვურევ…', 'ვასრულებ…'],
    video: ['სცენარს ვშლი…', 'კადრებს ვქმნი…', 'ხმასა და მუსიკას ვამატებ…', 'ვაერთიანებ…'],
    lipsync: ['ფოტოს ვამზადებ…', 'ავატარი ცოცხლდება…', 'ვასრულებ…'],
  },
  en: {
    image: ['Reading your prompt…', 'Painting the frame…', 'Adding details…', 'Finishing up…'],
    music: ['Shaping the idea…', 'Composing the melody…', 'Mixing the voices…', 'Finishing up…'],
    video: ['Breaking down the script…', 'Generating the shots…', 'Adding voice & music…', 'Stitching together…'],
    lipsync: ['Preparing the photo…', 'Bringing the avatar to life…', 'Finishing up…'],
  },
  ru: {
    image: ['Читаю запрос…', 'Рисую кадр…', 'Добавляю детали…', 'Завершаю…'],
    music: ['Формирую идею…', 'Сочиняю мелодию…', 'Свожу голоса…', 'Завершаю…'],
    video: ['Разбираю сценарий…', 'Создаю кадры…', 'Добавляю голос и музыку…', 'Собираю воедино…'],
    lipsync: ['Готовлю фото…', 'Оживляю аватар…', 'Завершаю…'],
  },
};

// Rough wall-clock targets (seconds) that drive the eased progress bar toward ~95%
// without ever claiming completion before the asset actually returns.
const PROGRESS_TARGET: Record<'image' | 'music' | 'video' | 'lipsync', number> = {
  // Pace each bar to the REAL wall-clock so it never hits 95% then sits frozen
  // (which read as "broken / not generating"). The 30s film is the big one: six
  // LTX clips (~4–5 min) + the FFmpeg montage (~3 min) ≈ 7–8 min end-to-end —
  // measured live — so the bar must crawl across ~7 min, not finish at ~2 min.
  image: 65, music: 150, video: 440, lipsync: 70,
};

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * GenerationProgress — the live "loading process" card shown in the pending
 * assistant bubble for image / music / video / lip-sync. An eased, time-based bar
 * (never a fake 100%) + narrated stage labels + an elapsed clock. For video the
 * pipeline's own streamed status (`status`) takes over the headline line.
 */
function GenerationProgress({ kind, elapsed, status, locale, targetSec }: {
  kind: 'image' | 'music' | 'video' | 'lipsync';
  elapsed: number;
  status?: string;
  locale: Lang;
  /** Override the eased-bar target (s) — e.g. per image resolution tier. */
  targetSec?: number;
}) {
  const stages = STAGES[locale][kind];
  const target = targetSec ?? PROGRESS_TARGET[kind];
  // Eased growth — fast at first, asymptotic toward 95% so it never "finishes"
  // ahead of the real asset. Completes only when the bubble swaps to media.
  const pct = Math.min(95, Math.round((1 - Math.exp(-elapsed / (target / 2.4))) * 100));
  const stageIdx = Math.min(stages.length - 1, Math.floor((pct / 100) * stages.length));
  const headline = status && status.trim() ? status.trim() : stages[stageIdx];
  const remaining = Math.max(0, Math.round(target - elapsed));
  const remLabel = locale === 'en' ? 'remaining' : locale === 'ru' ? 'осталось' : 'დარჩა';
  return (
    <div className="w-[min(86vw,440px)] space-y-3 rounded-2xl border border-app-border/12 bg-app-elevated/50 p-4 shadow-[0_10px_34px_rgba(0,0,0,0.20)]">
      {/* Big live % + current stage + estimated time remaining — legible at a glance. */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[34px] font-bold leading-none tabular-nums text-app-text">{pct}</span>
            <span className="text-[17px] font-semibold text-app-muted">%</span>
          </div>
          <span className="mt-1.5 inline-flex min-w-0 max-w-full items-center gap-1.5 text-[12.5px] font-medium text-app-accent">
            <Loader2 size={13} className="shrink-0 animate-spin" />
            <span className="truncate">{headline}</span>
          </span>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted/70">{remLabel}</p>
          <p className="text-[15px] font-semibold tabular-nums text-app-text">{remaining > 0 ? `~${fmtClock(remaining)}` : '…'}</p>
        </div>
      </div>
      {/* Thicker gradient progress bar — never a fake 100% before the asset returns. */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-app-border/12">
        <div className="h-full rounded-full bg-gradient-to-r from-app-accent/75 to-app-accent transition-[width] duration-700 ease-out" style={{ width: `${Math.max(6, pct)}%` }} />
      </div>
      {/* Stage checklist — done ✓ · active ⟳ · pending ○ — in soft icon badges. */}
      <ul className="space-y-1.5 pt-0.5">
        {stages.map((s, i) => {
          const state = i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending';
          return (
            <li key={i} className={`flex items-center gap-2.5 text-[12.5px] ${state === 'pending' ? 'text-app-muted/45' : state === 'active' ? 'font-medium text-app-text' : 'text-app-muted'}`}>
              {state === 'done' ? (
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-app-accent/15"><Check size={12} className="text-app-accent" /></span>
              ) : state === 'active' ? (
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-app-accent/15"><Loader2 size={12} className="animate-spin text-app-accent" /></span>
              ) : (
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center"><span className="h-[13px] w-[13px] rounded-full border border-app-border/30" /></span>
              )}
              <span className="truncate">{s}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * StoryboardFrame — one scene tile's media. Shows a spinner WHILE the frame image
 * loads, the image once it paints (fade-in), and a graceful icon — never a broken-
 * image glyph — when the URL is missing or fails to load (e.g. a CSP-blocked or
 * expired provider URL). Fixes the "all six slots show a broken placeholder" report.
 */
function StoryboardFrame({ url, label, onZoom }: { url: string | null; label: string; onZoom: (u: string) => void }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(url ? 'loading' : 'error');
  useEffect(() => { setState(url ? 'loading' : 'error'); }, [url]);
  if (!url) {
    return <div className="flex h-full w-full items-center justify-center text-app-muted/40"><ImageIcon size={15} /></div>;
  }
  return (
    <>
      {state !== 'loaded' && (
        <div className="absolute inset-0 flex items-center justify-center bg-app-border/5">
          {state === 'loading'
            ? <Loader2 size={15} className="animate-spin text-app-muted/60" />
            : <ImageIcon size={15} className="text-app-muted/40" />}
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        loading="lazy"
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
        onClick={() => state === 'loaded' && onZoom(url)}
        className={`h-full w-full object-cover transition-opacity duration-300 ${state === 'loaded' ? 'cursor-zoom-in opacity-100' : 'opacity-0'}`}
      />
    </>
  );
}

// Animated three-dot "typing" indicator for the chat-mode pending bubble.
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="…">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-app-muted animate-bounce" style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1s' }} />
      ))}
    </span>
  );
}

// The five generative modes — declared once, rendered as a clean borderless chip
// row (no bordered container, no dividers — minimalist, Grok-style).
const MODES = [
  { id: 'chat', Icon: MessageSquare, key: 'modeChat' },
  { id: 'image', Icon: ImageIcon, key: 'modeImage' },
  { id: 'music', Icon: Music2, key: 'modeMusic' },
  { id: 'video', Icon: Film, key: 'modeVideo' },
  { id: 'lipsync', Icon: Volume2, key: 'modeLipsync' },
] as const;

// ── Per-service options (real backend capabilities) ──────────────────────────
const IMG_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:2', '2:3'] as const;
type ImgAspect = (typeof IMG_ASPECTS)[number];
const IMG_QUALITIES = [['standard', '1K'], ['high', '2K'], ['ultra', '4K']] as const;
type ImgQuality = (typeof IMG_QUALITIES)[number][0];
const IMG_STYLES = ['Auto', 'Photorealistic', 'Cinematic', 'Digital Art', 'Anime', '3D Render', 'Oil Painting', 'Watercolor', 'Cyberpunk', 'Fantasy', 'Minimalist', 'Line Art', 'Pixel Art'] as const;
const MUSIC_GENRES = ['cinematic', 'pop', 'electronic', 'lo-fi', 'rock', 'hip-hop', 'classical', 'ambient', 'jazz', 'folk', 'orchestral', 'trap', 'r&b', 'funk', 'reggae'] as const;
const VIDEO_STYLES = ['Cinematic', 'Documentary', 'Anime', 'Vintage', 'Neon', 'Nature', 'Cyberpunk', 'Noir', 'Fantasy', 'Aerial'] as const;

// A small, theme-tokenised option chip used by the per-service options bar.
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${active ? 'bg-app-accent/15 text-app-accent' : 'bg-app-elevated text-app-muted hover:text-app-text'}`}
    >
      {children}
    </button>
  );
}

// First-run examples — tappable cards that make the assistant self-explanatory.
// Tapping pre-fills the composer (and switches to Image mode for a draw example)
// WITHOUT auto-sending, so the user reviews + presses send (never an accidental
// spend). `icon` maps to a lucide glyph in the render.
type StarterIcon = 'chat' | 'image' | 'spark' | 'music' | 'film';
const STARTERS: Record<Lang, { label: string; prompt: string; mode: 'chat' | 'image' | 'music' | 'video'; icon: StarterIcon }[]> = {
  ka: [
    { label: 'დახატე ნეონის ქალაქი წვიმაში', prompt: 'ნეონის ქალაქი წვიმაში ღამით, კინემატოგრაფიული, ანარეკლები ასფალტზე', mode: 'image', icon: 'image' },
    { label: 'შექმენი 30-წამიანი კინო', prompt: 'ზღვისპირა ქალაქი მზის ჩასვლისას, მარტოხელა მოგზაური დადის ნაპირზე — კინემატოგრაფიული, თბილი ფერები', mode: 'video', icon: 'film' },
    { label: 'შექმენი ეპიკური კინო-მუსიკა', prompt: 'ეპიკური ორკესტრული კინო-მუსიკა, დრამატული, გმირული განწყობა', mode: 'music', icon: 'music' },
    { label: 'მომეცი იდეები ვიდეოსთვის', prompt: 'მომეცი 3 კრეატიული იდეა 30-წამიანი კინო-კლიპისთვის ქართულ ბუნებაზე', mode: 'chat', icon: 'spark' },
  ],
  en: [
    { label: 'Draw a neon city in the rain', prompt: 'A neon city in the rain at night, cinematic, reflections on the wet asphalt', mode: 'image', icon: 'image' },
    { label: 'Make a 30-second film', prompt: 'A seaside town at sunset, a lone traveller walking along the shore — cinematic, warm tones', mode: 'video', icon: 'film' },
    { label: 'Compose epic cinematic music', prompt: 'Epic orchestral cinematic score, dramatic, heroic mood', mode: 'music', icon: 'music' },
    { label: 'Give me ideas for a video', prompt: 'Give me 3 creative ideas for a 30-second cinematic clip about Georgian nature', mode: 'chat', icon: 'spark' },
  ],
  ru: [
    { label: 'Нарисуй неоновый город под дождём', prompt: 'Неоновый город под дождём ночью, кинематографично, отражения на мокром асфальте', mode: 'image', icon: 'image' },
    { label: 'Сделай 30-секундный фильм', prompt: 'Приморский город на закате, одинокий путник идёт по берегу — кинематографично, тёплые тона', mode: 'video', icon: 'film' },
    { label: 'Создай эпичную кино-музыку', prompt: 'Эпичная оркестровая кино-музыка, драматичная, героическое настроение', mode: 'music', icon: 'music' },
    { label: 'Идеи для видео', prompt: 'Дай 3 креативные идеи для 30-секундного кинороликa о природе Грузии', mode: 'chat', icon: 'spark' },
  ],
};

// Downscale a data: image (longest side ≤ maxDim, JPEG) so an attached photo used as
// an img2img reference stays well under the ~4.5MB function-body limit — a full-res
// phone photo would otherwise 413. The output image is still generated at full tier;
// the reference only guides identity/composition. Fail-open → the original.
async function downscaleDataUrl(dataUrl: string, maxDim = 1280): Promise<string> {
  if (typeof document === 'undefined' || !dataUrl.startsWith('data:')) return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale >= 1 && dataUrl.length < 3_000_000) return dataUrl; // already small enough
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return dataUrl;
  }
}

// Minimal Web Speech API shapes (not in the standard TS DOM lib) — enough to drive
// LIVE dictation: interim + finalized transcripts stream in as the user speaks.
interface SRAlternative { readonly transcript: string }
interface SRResult { readonly isFinal: boolean; readonly length: number; readonly [i: number]: SRAlternative }
interface SREvent { readonly resultIndex: number; readonly results: { readonly length: number; readonly [i: number]: SRResult } }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface Media { dataUrl: string; mimeType: string }
// A one-click re-roll spec: enough to re-run the EXACT image/music generation that
// produced a result (same prompt + settings → a fresh variation). Persisted with the
// message so the Regenerate button survives reloads.
type ImageRegenSpec = { kind: 'image'; prompt: string; quality: ImgQuality; aspect: ImgAspect; style: string; referenceImage?: string };
type MusicRegenSpec = { kind: 'music'; prompt: string; genre: string; instrumental: boolean; lyrics?: string };
type RegenSpec = ImageRegenSpec | MusicRegenSpec;
// A grid of N image variations generated together (the ×2 / ×4 batch). Each tile
// fills in independently as its own parallel generation lands.
interface BatchTile { status: 'pending' | 'done' | 'failed'; url?: string }
interface ImageBatch { spec: ImageRegenSpec; tiles: BatchTile[] }
interface Msg { role: 'user' | 'assistant'; text: string; medias?: Media[]; imageUrl?: string; audioUrl?: string; coverUrl?: string; videoUrl?: string; videoProgress?: number; storyboard?: { ordinal: number; beat?: string; frameUrl: string | null }[]; filmRoster?: FilmAgentVM[]; filmLog?: FilmLogLine[]; genKind?: 'image' | 'music' | 'video' | 'lipsync'; regen?: RegenSpec; batch?: ImageBatch;
  /** Completed-film remix anchors: the per-scene landed clips + original brief, so the
   *  film bubble can offer a "remix" box (re-render only the edited scenes). */
  filmClips?: { ordinal: number; url: string }[]; filmPrompt?: string }

// Up to this many files/images (or one video) can ride along with a single message.
const MAX_ATTACHMENTS = 5;

const isImage = (m: string) => m.startsWith('image/');
const isAudio = (m: string) => m.startsWith('audio/');
const isVideo = (m: string) => m.startsWith('video/');

// ── Multi-conversation chat history (localStorage) ───────────────────────────
// A real chat history like ChatGPT/Grok: every conversation is saved (id + title
// + lean messages + updatedAt), survives reloads, can be resumed/renamed/deleted,
// and "New Chat" starts a fresh one while the previous stays in the list. We store
// a LEAN copy — text + remote result URLs — and DROP base64 `medias` uploads (they
// would blow the ~5 MB quota). `OMNI_CURRENT_ID_KEY` tracks the active chat so a
// reload or "New Chat" (see ServiceHub) resumes/forks correctly.
export const OMNI_CONVERSATIONS_KEY = 'myavatar-omni-conversations';
export const OMNI_CURRENT_ID_KEY = 'myavatar-omni-current';
const HISTORY_MAX = 80;  // max turns kept per conversation
const CONV_MAX = 40;     // max conversations kept overall

interface Conversation { id: string; title: string; messages: Msg[]; updatedAt: number }

function newConversationId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OMNI_CONVERSATIONS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is Conversation => !!c && typeof (c as Conversation).id === 'string' && Array.isArray((c as Conversation).messages))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  } catch { return []; }
}
function saveConversations(list: Conversation[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(OMNI_CONVERSATIONS_KEY, JSON.stringify(list.slice(0, CONV_MAX))); } catch { /* quota */ }
}
function currentConversationId(): string {
  if (typeof window === 'undefined') return newConversationId();
  try {
    const id = window.localStorage.getItem(OMNI_CURRENT_ID_KEY);
    if (id) return id;
    const fresh = newConversationId();
    window.localStorage.setItem(OMNI_CURRENT_ID_KEY, fresh);
    return fresh;
  } catch { return newConversationId(); }
}
function setCurrentConversationId(id: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(OMNI_CURRENT_ID_KEY, id); } catch { /* */ }
}
// Drop a (potentially multi-MB data:) reference image before persisting a spec to
// localStorage — keeps the chat-history quota safe; the img2img source is re-supplied
// live, so a reload simply regenerates text-to-image.
function dropRef(spec: RegenSpec): RegenSpec {
  if (spec.kind === 'image' && spec.referenceImage) {
    const { referenceImage: _omit, ...rest } = spec;
    void _omit;
    return rest;
  }
  return spec;
}
function leanMessages(messages: Msg[]): Msg[] {
  return messages
    .filter((m, i) => !(i === messages.length - 1 && m.role === 'assistant' && !m.text && !m.imageUrl && !m.audioUrl && !m.videoUrl))
    .slice(-HISTORY_MAX)
    .map((m) => ({
      role: m.role,
      text: m.text,
      ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
      ...(m.audioUrl ? { audioUrl: m.audioUrl } : {}),
      ...(m.coverUrl ? { coverUrl: m.coverUrl } : {}),
      ...(m.videoUrl ? { videoUrl: m.videoUrl } : {}),
      ...(m.regen ? { regen: dropRef(m.regen) } : {}),
      ...(m.batch ? { batch: { tiles: m.batch.tiles, spec: dropRef(m.batch.spec) as ImageRegenSpec } } : {}),
    }));
}
function conversationTitle(messages: Msg[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.text.trim());
  const t = (firstUser?.text ?? '').trim().replace(/\s+/g, ' ');
  return t ? (t.length > 52 ? `${t.slice(0, 52)}…` : t) : 'New chat';
}
function loadConversationMessages(id: string): Msg[] {
  return loadConversations().find((c) => c.id === id)?.messages ?? [];
}
/** Save/update the active conversation; an emptied conversation is removed. */
function upsertConversation(id: string, messages: Msg[]): void {
  const lean = leanMessages(messages);
  const list = loadConversations();
  const idx = list.findIndex((c) => c.id === id);
  if (lean.length === 0) {
    if (idx >= 0) { list.splice(idx, 1); saveConversations(list); }
    return;
  }
  const conv: Conversation = { id, title: conversationTitle(lean), messages: lean, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = conv; else list.unshift(conv);
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  saveConversations(list);
}
function deleteConversation(id: string): void {
  saveConversations(loadConversations().filter((c) => c.id !== id));
}

// ── Storyboard preview (Video mode) ───────────────────────────────────────────
interface StoryboardScene { ordinal: number; beat: string; prompt: string; frameUrl: string | null; edited?: boolean }
interface StoryboardState {
  filmPrompt: string;
  refs: string[];
  orientation: 'landscape' | 'vertical';
  seed: number;
  scenes: StoryboardScene[];
  /** LLM story scenes (one per scene) — threaded to the render so clips match. */
  sceneScripts?: string[] | null;
  /** Per-scene frame-prompt for the streaming single-scene frame calls. */
  framePrompts?: Record<number, string>;
  /** Scene ordinals whose frame is still being generated (drives the N/M counter
   *  + per-tile spinner). Empty/undefined once every frame has settled. */
  pending?: number[];
}

// Full-screen review surface: the six planned scenes + a frame each. The user
// approves (→ render the film anchored to these frames), regenerates, or cancels.
function StoryboardOverlay({ sb, t, busy, regenningOrdinal, onGenerate, onRegenerate, onRegenScene, onEditScene, onView, onCancel }: {
  sb: StoryboardState;
  t: (typeof COPY)[Lang];
  busy: boolean;
  /** The scene ordinal currently re-rolling its frame (null = none). */
  regenningOrdinal: number | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  onRegenScene: (ordinal: number) => void;
  onEditScene: (ordinal: number, text: string) => void;
  onView: (url: string) => void;
  onCancel: () => void;
}) {
  const portrait = sb.orientation === 'vertical';
  const pending = sb.pending ?? [];
  const total = sb.scenes.length;
  const loaded = sb.scenes.filter((s) => s.frameUrl).length;
  const streaming = pending.length > 0; // frames are still arriving
  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-app-bg/95 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="mx-auto flex h-full w-full max-w-3xl flex-col">
        <div className="flex items-start justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-app-text">📋 {t.sbTitle}</h2>
            {streaming ? (
              <p className="flex items-center gap-1.5 text-[12px] text-app-accent">
                <Loader2 size={12} className="animate-spin" />
                <span className="tabular-nums">{loaded}/{total}</span> {t.sbFrames}…
              </p>
            ) : (
              <p className="truncate text-[12px] text-app-muted">{t.sbReview}</p>
            )}
          </div>
          <button type="button" onClick={onCancel} aria-label={t.sbCancel} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
            <X size={18} />
          </button>
        </div>
        {/* Live frame-load progress — fills as each scene's frame streams in. */}
        {streaming && (
          <div className="mx-4 mb-2 h-1 overflow-hidden rounded-full bg-app-border/15">
            <div className="h-full rounded-full bg-app-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.max(5, Math.round((loaded / Math.max(1, total)) * 100))}%` }} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sb.scenes.map((s) => (
              <div key={s.ordinal} className="flex flex-col overflow-hidden rounded-xl border border-app-border/12 bg-app-elevated shadow-[0_4px_16px_rgba(0,0,0,0.13)]">
                <div className={`relative ${portrait ? 'aspect-[9/16]' : 'aspect-video'} bg-app-surface`}>
                  {s.frameUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.frameUrl} alt={`${t.sbScene} ${s.ordinal}`} onClick={() => s.frameUrl && onView(s.frameUrl)} className="h-full w-full cursor-zoom-in object-cover opacity-0 transition-opacity duration-500 hover:opacity-90" onLoad={(e) => { e.currentTarget.style.opacity = '1'; }} />
                  ) : pending.includes(s.ordinal) ? (
                    // Generating — a pulsing skeleton with a spinner + the scene number,
                    // so it reads as "creating scene N", never a broken-image box.
                    <div className="flex h-full w-full animate-pulse flex-col items-center justify-center gap-2 bg-gradient-to-br from-app-elevated to-app-surface">
                      <Loader2 size={18} className="animate-spin text-app-accent/70" />
                      <span className="text-[10px] font-medium text-app-muted/70">{t.sbScene} {s.ordinal}</span>
                    </div>
                  ) : (
                    // Frame settled with no image (provider miss) — graceful icon + a
                    // re-roll hint, never an endless spinner or broken-image glyph.
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-app-surface text-app-muted/40">
                      <ImageIcon size={18} />
                      <RotateCcw size={12} className="opacity-70" />
                    </div>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{t.sbScene} {s.ordinal}</span>
                  <button type="button" onClick={() => onRegenScene(s.ordinal)} disabled={regenningOrdinal !== null || busy} aria-label={t.sbReroll} title={t.sbReroll} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-app-accent hover:text-app-bg disabled:opacity-40">
                    <RotateCcw size={13} />
                  </button>
                  {regenningOrdinal === s.ordinal && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55"><Loader2 size={20} className="animate-spin text-white" /><span className="text-[10px] font-medium text-white/85">{t.sbRegen}…</span></div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-2">
                  <p className="text-[11.5px] font-semibold leading-snug text-app-text">{s.beat}</p>
                  {/* Editable shot description — bordered + placeholder so it's obviously
                      a field you can type into; your words drive the re-roll + the render. */}
                  <textarea
                    value={s.prompt}
                    onChange={(e) => onEditScene(s.ordinal, e.target.value)}
                    rows={4}
                    placeholder={t.sbEditHint}
                    aria-label={`${t.sbScene} ${s.ordinal}`}
                    className="min-h-[72px] w-full flex-1 resize-y rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[12px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted/45 focus:border-app-accent/60 focus:bg-app-bg/70 focus:ring-2 focus:ring-app-accent/25"
                  />
                  <button type="button" onClick={() => onRegenScene(s.ordinal)} disabled={regenningOrdinal !== null || busy} className="inline-flex items-center justify-center gap-1 rounded-md bg-app-bg/40 px-2 py-1 text-[10.5px] font-medium text-app-muted transition-colors hover:bg-app-accent/15 hover:text-app-accent disabled:opacity-40">
                    <RotateCcw size={11} /> {t.sbRegen}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-app-border/10 px-4 py-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <button type="button" onClick={onRegenerate} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-4 py-2.5 text-[13px] font-medium text-app-text transition-colors hover:bg-app-border/10 disabled:opacity-50">
            <RotateCcw size={15} /> {t.sbRegen}
          </button>
          <button type="button" onClick={onGenerate} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-app-accent px-4 py-2.5 text-[13.5px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-50">
            <Film size={16} /> {t.sbGenerate}
          </button>
        </div>
      </div>
    </div>
  );
}

// Renders children into document.body so fixed overlays (lightbox · storyboard ·
// history) escape the chat shell's stacking context and paint ABOVE root-level
// chrome like the cookie banner. SSR-safe via a mounted flag (no hydration flash).
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export default function OmniStudio({ locale = 'ka' }: { locale?: Lang }) {
  const t = COPY[locale] ?? COPY.ka;
  // The active conversation id + its messages (resumed from the saved history).
  const [conversationId, setConversationId] = useState<string>(currentConversationId);
  const [messages, setMessages] = useState<Msg[]>(() => loadConversationMessages(conversationId));
  // Chat-history panel (list of past conversations) open state.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<Conversation[]>([]);
  const [input, setInput] = useState('');
  // Up to MAX_ATTACHMENTS files (images / video / audio / pdf) ride with a message.
  const [attachments, setAttachments] = useState<Media[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  // Composer mode: 'chat' → multimodal answer; 'image' → NanoBanana image;
  // 'music' → Udio track; 'video' → the 30-second film pipeline. Every generative
  // service lives in this ONE chatbox — the prompt becomes a brand-new asset
  // (image / track / film) rendered inline in the feed.
  const [mode, setMode] = useState<'chat' | 'image' | 'music' | 'video' | 'lipsync'>('chat');
  // Full-screen image lightbox — holds the URL of the tapped picture (generated or
  // attached). null = closed. Tap a chat image to open; backdrop / X / Esc closes.
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Magic Wand — true while the prompt is being AI-enhanced in place.
  const [enhancing, setEnhancing] = useState(false);
  // Per-message actions: which assistant reply was just copied / is being read aloud.
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  // Per-message thumbs feedback (#9): message index → 'up' | 'down' for the session.
  const [ratedIdx, setRatedIdx] = useState<Record<number, 'up' | 'down'>>({});
  // Mobile: the service-option panels collapse behind a toggle so they never cover the
  // chat (the cards are tall). Default collapsed on mobile; on desktop (sm:) always open.
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Transient toast (e.g. "link copied") shown after a share falls back to clipboard.
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  // Read-aloud phase for the speaking bubble — 'loading' while eleven_v3 synthesises
  // (a few seconds), 'playing' once audio starts. Drives the dynamic listen button.
  const [speakPhase, setSpeakPhase] = useState<'loading' | 'playing' | null>(null);
  // Remix: per-film-bubble edit draft + which film is currently remixing.
  const [remixDrafts, setRemixDrafts] = useState<Record<number, string>>({});
  const [remixBusyIdx, setRemixBusyIdx] = useState<number | null>(null);
  // Inline edit-&-resend of a user turn: which message is being edited + its draft.
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  // Monotonic token so a tap that cancels (or supersedes) an in-flight read-aloud
  // doesn't let the orphaned fetch start playing after the user moved on.
  const ttsTokenRef = useRef(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Voice-SAMPLE recorder (music "my voice") — kept fully separate from the chat
  // dictation recorder above so the two never collide.
  const voiceFileRef = useRef<HTMLInputElement | null>(null);
  const voiceRecRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Live speech-to-text (Web Speech API): the active recognizer + the text composed
  // so far (base = input when dictation started; final = accumulated finalized text).
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sttBaseRef = useRef('');
  const sttFinalRef = useRef('');
  const feedRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Stop / cancel plumbing. `abortRef` aborts the in-flight fetch; `genIdRef` is a
  // monotonic generation token — every finalizer checks it so a STOPPED or
  // superseded request can never clobber a newer message (or re-clear `busy`).
  const abortRef = useRef<AbortController | null>(null);
  const genIdRef = useRef(0);
  // Abort handle for the (non-streaming) storyboard request, so Cancel can stop it.
  const storyboardAbortRef = useRef<AbortController | null>(null);
  // Live elapsed seconds during a generation — drives the progress clock + bar.
  const [elapsed, setElapsed] = useState(0);
  const genStartRef = useRef(0);
  // Scroll-to-bottom affordance — shown only when the user scrolled up.
  const [showJump, setShowJump] = useState(false);
  // Inline mode selector popover (the Gemini "Flash ⌄" analog).
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  // Per-service generation options.
  const [imgAspect, setImgAspect] = useState<ImgAspect>('1:1');
  // Default to the 2K tier for sharper, higher-fidelity output. The wider provider
  // poll window now makes 2K reliable (~33s live) without the old timeouts; users can
  // drop to 1K for speed or pick 4K for maximum detail.
  const [imgQuality, setImgQuality] = useState<ImgQuality>('high');
  const [imgStyle, setImgStyle] = useState<string>('Auto');
  // ×1 / ×2 / ×4 — how many image variations to generate at once (the batch grid).
  const [imgCount, setImgCount] = useState<1 | 2 | 4>(1);
  const [musicInstrumental, setMusicInstrumental] = useState(true);
  const [musicGenre, setMusicGenre] = useState<string>('cinematic');
  // Custom lyrics for vocal tracks — empty means Udio writes the lyrics from the prompt.
  const [musicLyrics, setMusicLyrics] = useState('');
  // With an audio attached in Music mode: 'cover' remixes its melody (MusicGen);
  // 'voice' clones the uploaded VOICE and sings the lyrics in it (MiniMax music-01).
  const [musicAudioMode, setMusicAudioMode] = useState<'cover' | 'voice'>('cover');
  // In-app voice-sample recorder for "sing in my voice" — separate from the chat
  // dictation mic. Captures ≥15s of audio → added as the music voice reference.
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceRecSec, setVoiceRecSec] = useState(0);
  // Trained RVC voice (faithful) — set by the in-chat VoiceTrainer once a model is ready,
  // and a toggle to sing with it instead of a one-shot upload.
  const [hasTrainedVoice, setHasTrainedVoice] = useState(false);
  const [useMyVoice, setUseMyVoice] = useState(false);
  // Auto-write lyrics from a theme (removes the "I don't have lyrics" friction).
  const [writingLyrics, setWritingLyrics] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState<'landscape' | 'vertical'>('landscape');
  const [videoStyle, setVideoStyle] = useState<string>('Cinematic');
  // Spoken voice for the film — ON by default so the character actually TALKS (and,
  // with the lip-sync pass, the lips move with it). When on, a localized cue is
  // appended to the brief so the pipeline generates a voice-over + lip-syncs the master.
  const [videoNarration, setVideoNarration] = useState(true);
  // Narrate the film in the user's TRAINED voice (RVC) — needs a trained model.
  const [videoMyVoiceNarration, setVideoMyVoiceNarration] = useState(false);
  // Lip-sync "dub from text" → speak the typed script in the user's TRAINED voice (RVC).
  const [lipMyVoice, setLipMyVoice] = useState(false);
  // Scene-to-scene transition in the final stitch: soft crossfade or hard cut.
  const [videoTransition, setVideoTransition] = useState<'crossfade' | 'cut'>('crossfade');
  // What the character SAYS — typed dialogue → spoken verbatim as the film's voice-over
  // (empty = auto-written narration). The clear "what should they say" field.
  const [videoSpeech, setVideoSpeech] = useState('');
  // Film length: 10s (2 scenes) or 30s (6 scenes). Drives the storyboard scene count.
  const [videoDuration, setVideoDuration] = useState<10 | 30>(30);
  // Background score on/off (off → voice-only film).
  const [videoMusic, setVideoMusic] = useState(true);
  // Storyboard preview gate (Video mode): the planned scenes + frames the user
  // reviews BEFORE committing to the full render. null = no storyboard pending.
  const [storyboard, setStoryboard] = useState<StoryboardState | null>(null);
  const [storyboardBusy, setStoryboardBusy] = useState(false);
  // Which storyboard scene is currently re-rolling its single frame (null = none).
  const [regenningOrdinal, setRegenningOrdinal] = useState<number | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Auto-stick to the newest message — but only when the user is already near the
  // bottom, so reading scrollback isn't yanked away mid-generation.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist < 160) scrollToBottom();
  }, [messages, busy, scrollToBottom]);

  // Persist the active conversation once a generation settles (never per token).
  // Resumed on next mount; listed/resumable in the history panel.
  useEffect(() => {
    if (!busy) {
      upsertConversation(conversationId, messages);
      // Notify the left sidebar's history list (ChatChrome) to refresh.
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('myavatar:conversations-updated'));
    }
  }, [messages, busy, conversationId]);

  // Switch to / start / delete conversations (the chat-history panel actions).
  const openHistory = useCallback(() => {
    upsertConversation(conversationId, messages); // flush current first
    setHistoryList(loadConversations());
    setHistoryOpen(true);
  }, [conversationId, messages]);
  const resumeConversation = useCallback((id: string) => {
    upsertConversation(conversationId, messages); // save current before leaving
    setConversationId(id);
    setCurrentConversationId(id);
    setMessages(loadConversationMessages(id));
    setHistoryOpen(false);
  }, [conversationId, messages]);
  const startNewConversation = useCallback(() => {
    upsertConversation(conversationId, messages); // save current
    const id = newConversationId();
    setConversationId(id);
    setCurrentConversationId(id);
    setMessages([]);
    setHistoryOpen(false);
  }, [conversationId, messages]);
  // Bridge: the persistent left sidebar (ChatChrome) drives chat-history resume + new-chat
  // via window events — so the sidebar works without prop-threading through the chrome.
  useEffect(() => {
    const onResume = (e: Event) => { const id = (e as CustomEvent<{ id?: string }>).detail?.id; if (id) resumeConversation(id); };
    const onNew = () => startNewConversation();
    window.addEventListener('myavatar:resume-conversation', onResume as EventListener);
    window.addEventListener('myavatar:new-chat', onNew);
    return () => {
      window.removeEventListener('myavatar:resume-conversation', onResume as EventListener);
      window.removeEventListener('myavatar:new-chat', onNew);
    };
  }, [resumeConversation, startNewConversation]);
  const removeConversation = useCallback((id: string) => {
    deleteConversation(id);
    setHistoryList(loadConversations());
    if (id === conversationId) startNewConversation();
  }, [conversationId, startNewConversation]);

  // Tick the elapsed clock while a generation OR the storyboard build is in flight
  // (so the storyboard overlay can show a live % too, not just a spinner).
  useEffect(() => {
    if (!busy && !storyboardBusy) { setElapsed(0); return; }
    genStartRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - genStartRef.current) / 1000))), 500);
    return () => clearInterval(id);
  }, [busy, storyboardBusy]);

  // Auto-grow the composer textarea with its content (capped), like a modern chat.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Close the full-screen lightbox on Escape (desktop affordance; the backdrop tap
  // and the X button cover touch).
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const lang = locale === 'en' ? 'en-US' : locale === 'ru' ? 'ru-RU' : 'ka-GE';

  // Drive the film render (orchestrate → poll → assemble) into a fresh assistant
  // bubble. Shared by the storyboard "Generate Video" action and the direct
  // fallback. `sceneFrames` (the approved storyboard frames) anchor each scene.
  const renderFilm = useCallback(async (filmPrompt: string, refs: string[], orientation: 'landscape' | 'vertical', sceneFrames: string[] | undefined, sceneScripts?: string[] | undefined, storyboardScenes?: { ordinal: number; beat?: string; frameUrl: string | null }[]) => {
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;
    // Keep the approved storyboard frames VISIBLE in the bubble while the film
    // renders (~7 min), so the preview shows every scene + the live progress —
    // the storyboard no longer just disappears on "Generate Video".
    setMessages((prev) => [...prev, { role: 'assistant', text: t.generatingVideo, genKind: 'video', ...(storyboardScenes?.length ? { storyboard: storyboardScenes } : {}) }]);
    setBusy(true);
    try {
      const res = await driveFilmStudio({
        prompt: filmPrompt,
        referenceImages: refs,
        orientation,
        transition: videoTransition,
        myVoiceNarration: videoMyVoiceNarration && hasTrainedVoice,
        ...(videoSpeech.trim() ? { narrationScript: videoSpeech.trim() } : {}),
        ...(videoMusic ? {} : { noMusic: true }),
        ...(sceneFrames?.length ? { sceneFrames } : {}),
        ...(sceneScripts?.length ? { sceneScripts } : {}),
        locale,
        signal: ac.signal,
        onProgress: (p) => {
          // Build a real progress %: scenes ready / total during the long render phase,
          // plus clear staged labels — so the ~5-7 min wait shows movement, not a wall.
          const cs = p.matrix?.clips ?? [];
          const ready = cs.filter((c) => c.status === 'succeeded').length;
          const total = p.matrix?.sceneCount || cs.length || 6;
          const pct = p.phase === 'assembled' ? 100
            : p.phase === 'stitching' ? 90
            : p.phase === 'rendering' ? Math.min(85, 25 + Math.round((ready / Math.max(1, total)) * 55))
            : p.phase === 'dispatching' ? 12 : 6;
          const status = p.phase === 'rendering'
            ? `🎬 ${locale === 'en' ? 'Rendering scenes' : locale === 'ru' ? 'Рендер сцен' : 'სცენების რენდერი'} ${ready}/${total}`
            : p.phase === 'stitching'
              ? `🎞 ${locale === 'en' ? 'Editing + adding music & narration' : locale === 'ru' ? 'Монтаж + музыка и озвучка' : 'მონტაჟი + მუსიკა და ნარაცია'}`
              : p.phase === 'dispatching'
                ? `✨ ${locale === 'en' ? 'Preparing the scenes' : locale === 'ru' ? 'Подготовка сцен' : 'სცენების მომზადება'}`
                : (p.message?.trim() || t.generatingVideo);
          // Fold the live matrix into the 9-agent roster + activity log so the
          // Director's Console renders real per-agent state and a streaming feed
          // (not a fake timer) right in the bubble.
          const roster = deriveFilmRoster(p);
          const freshLog = deriveFilmLog(p, locale);
          const nowElapsed = Math.max(0, Math.round((Date.now() - genStartRef.current) / 1000));
          setMessages((prev) => {
            if (!mine()) return prev;
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant' && !last.videoUrl) {
              // Stamp each log line with the elapsed seconds it FIRST appeared, so the
              // terminal can show per-line timestamps without re-stamping on each tick.
              // Clamp to the max existing stamp so timestamps stay monotonic even when
              // the elapsed clock re-anchors between the storyboard build and the render.
              const prevLog = last.filmLog ?? [];
              const prevByKey = new Map(prevLog.map((l) => [l.key, l]));
              const stampTs = Math.max(nowElapsed, prevLog.reduce((m, l) => Math.max(m, l.ts ?? 0), 0));
              const filmLog = freshLog.map((l) => prevByKey.get(l.key) ?? { ...l, ts: stampTs });
              next[next.length - 1] = { ...last, text: status, videoProgress: pct, filmRoster: roster, filmLog };
            }
            return next;
          });
        },
      });
      setMessages((prev) => {
        if (!mine()) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          // Capture the landed per-scene clips so the film bubble can offer Remix
          // (re-render only the edited scene, reuse the rest via /api/pipeline/remix).
          const landed = (res.matrix?.clips ?? [])
            .filter((c) => c.status === 'succeeded' && typeof c.url === 'string' && c.url)
            .map((c) => ({ ordinal: c.ordinal, url: c.url as string }));
          next[next.length - 1] = res.ok && res.masterUrl
            ? { role: 'assistant', text: '', videoUrl: res.masterUrl, ...(landed.length >= 2 ? { filmClips: landed, filmPrompt } : {}) }
            : { role: 'assistant', text: `⚠️ ${res.error || t.videoFailed}` };
        }
        return next;
      });
    } catch {
      if (!mine()) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.videoFailed}` };
        return next;
      });
    } finally {
      if (mine()) setBusy(false);
    }
  }, [locale, videoTransition, videoMyVoiceNarration, videoNarration, videoSpeech, videoMusic, hasTrainedVoice, t.generatingVideo, t.videoFailed]);

  // Remix a completed film: re-render ONLY the edited scene(s), reuse the rest
  // (POST /api/pipeline/remix with the bubble's stored landed clips + brief). The
  // remixed result carries the same clips/brief so it can be remixed again.
  const remixFilm = useCallback(async (i: number) => {
    const src = messages[i];
    const edit = (remixDrafts[i] ?? '').trim();
    if (!src?.filmClips?.length || !src.filmPrompt || !edit || remixBusyIdx !== null) return;
    setRemixBusyIdx(i);
    setMessages((prev) => [...prev, { role: 'user', text: edit }, { role: 'assistant', text: t.remixGenerating, genKind: 'video' }]);
    setRemixDrafts((d) => ({ ...d, [i]: '' }));
    const clips = src.filmClips;
    const prompt = src.filmPrompt;
    try {
      const r = await fetch('/api/pipeline/remix', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ originalPrompt: prompt, editRequest: edit, landedClips: clips }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; masterUrl?: string; url?: string; message?: string };
      const url = j.success ? (j.masterUrl || j.url || null) : null;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = url
            ? { role: 'assistant', text: '', videoUrl: url, filmClips: clips, filmPrompt: prompt }
            : { role: 'assistant', text: `⚠️ ${j.message || t.videoFailed}` };
        }
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.videoFailed}` };
        return next;
      });
    } finally {
      setRemixBusyIdx(null);
    }
  }, [messages, remixDrafts, remixBusyIdx, t.remixGenerating, t.videoFailed]);

  // Plan the storyboard (6 scenes + a frame each) and open the review overlay.
  // Fail-open: a storyboard miss falls back to a direct render so the user is
  // never blocked. A user Cancel (abort) stops quietly without rendering.
  const createStoryboard = useCallback(async (filmPrompt: string, refs: string[], orientation: 'landscape' | 'vertical') => {
    const ac = new AbortController();
    storyboardAbortRef.current = ac;
    setStoryboardBusy(true);
    const sceneCount = Math.max(2, Math.min(6, Math.round(videoDuration / 5)));
    try {
      // STEP 1 — fast PLAN-ONLY call: deterministic scene beats, no LLM, no frames.
      // Returns in ~1s so the board opens immediately (no long "frozen" wait).
      const res = await fetch('/api/film/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: ac.signal,
        body: JSON.stringify({ prompt: filmPrompt, orientation, referenceImages: refs, style: videoStyle, locale, sceneCount, planOnly: true }),
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; seed?: number; scenes?: (StoryboardScene & { framePrompt?: string })[]; sceneScripts?: string[] | null };
      if (!(j.success && Array.isArray(j.scenes) && j.scenes.length > 0)) {
        await renderFilm(filmPrompt, refs, orientation, undefined); // plan miss → direct render
        return;
      }
      const planned = j.scenes;
      const scenes: StoryboardScene[] = planned.map((s) => ({ ordinal: s.ordinal, beat: s.beat, prompt: s.prompt, frameUrl: null }));
      const framePrompts: Record<number, string> = {};
      planned.forEach((s) => { framePrompts[s.ordinal] = (s.framePrompt && s.framePrompt.trim()) || s.prompt; });
      const ordinals = scenes.map((s) => s.ordinal);
      // STEP 2 — open the review board NOW with skeleton tiles + an N/M counter.
      setStoryboard({
        filmPrompt, refs, orientation,
        seed: j.seed ?? 0,
        scenes,
        sceneScripts: Array.isArray(j.sceneScripts) ? j.sceneScripts : null,
        framePrompts,
        pending: ordinals,
      });
      setStoryboardBusy(false);

      // STEP 2.5 — fetch the LLM story enrichment in the BACKGROUND (off the board-open
      // hot-path). When it lands, store it so the RENDER tells the rich story; the
      // streaming preview frames keep their deterministic prompts (still cinematic stills).
      void (async () => {
        try {
          const sr = await fetch('/api/film/storyboard', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal,
            body: JSON.stringify({ prompt: filmPrompt, orientation, referenceImages: [], style: videoStyle, locale, sceneCount, scriptsOnly: true }),
          });
          const sj = (await sr.json().catch(() => ({}))) as { sceneScripts?: string[] | null };
          if (Array.isArray(sj.sceneScripts) && sj.sceneScripts.length) {
            const scripts = sj.sceneScripts;
            setStoryboard((prev) => (prev ? { ...prev, sceneScripts: scripts } : prev));
          }
        } catch { /* best-effort; render falls back to deterministic beats */ }
      })();

      // STEP 2.6 — CHARACTER LOCK. Derive ONE protagonist anchor portrait from the
      // brief, then condition EVERY scene frame on it so the character stays identical
      // across all 6 scenes — the frames anchor the LTX clips, so the whole 30s video
      // keeps the same face, hair and wardrobe. Skipped when the user uploaded their
      // own reference (that selfie already anchors identity). Fail-open: a miss falls
      // back to per-scene text frames (the prior, drift-prone behaviour).
      let anchorRefs = refs;
      if (!refs.length) {
        try {
          const ar = await fetch('/api/film/storyboard', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal,
            body: JSON.stringify({ prompt: filmPrompt, orientation, style: videoStyle, locale, sceneCount, characterAnchor: true }),
          });
          const aj = (await ar.json().catch(() => ({}))) as { success?: boolean; anchorUrl?: string | null };
          if (aj.success && typeof aj.anchorUrl === 'string' && aj.anchorUrl) {
            anchorRefs = [aj.anchorUrl];
            // Thread the anchor into the stored refs so the RENDER and single-scene
            // re-rolls also lock to the same character.
            setStoryboard((prev) => (prev ? { ...prev, refs: anchorRefs } : prev));
          }
        } catch { /* fall back to unanchored per-scene frames */ }
      }

      // STEP 3 — stream each frame in (concurrency 3); each tile fades in the moment
      // its own frame lands, and the N/M counter ticks up. A failed frame settles to
      // a graceful icon (removed from `pending`) — never an endless spinner.
      const fetchFrame = async (ordinal: number) => {
        // Up to 3 attempts with BACKOFF — under heavy image-provider load the frame
        // endpoint can return 503; retrying immediately just hammers it. Backing off
        // (3s, 6s) lets the provider recover so a transient 503 still lands the frame
        // instead of leaving a permanent graceful-icon gap.
        const MAX = 3;
        const backoff = (attempt: number) => new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
        for (let attempt = 0; attempt < MAX; attempt++) {
          try {
            const r = await fetch('/api/film/storyboard', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              signal: ac.signal,
              body: JSON.stringify({ prompt: filmPrompt, orientation, referenceImages: anchorRefs, style: videoStyle, locale, sceneOrdinal: ordinal, scenePrompt: framePrompts[ordinal] }),
            });
            const jf = (await r.json().catch(() => ({}))) as { success?: boolean; frameUrl?: string | null };
            const url = jf.success && typeof jf.frameUrl === 'string' ? jf.frameUrl : null;
            if (url || attempt === MAX - 1) {
              setStoryboard((prev) => prev ? {
                ...prev,
                scenes: prev.scenes.map((s) => (s.ordinal === ordinal ? { ...s, frameUrl: url } : s)),
                pending: (prev.pending ?? []).filter((o) => o !== ordinal),
              } : prev);
              return;
            }
            await backoff(attempt); // 503 / transient miss → wait before retrying
          } catch {
            if (ac.signal.aborted) return;
            if (attempt === MAX - 1) {
              setStoryboard((prev) => prev ? { ...prev, pending: (prev.pending ?? []).filter((o) => o !== ordinal) } : prev);
              return;
            }
            await backoff(attempt);
          }
        }
      };
      const queue = [...ordinals];
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length && !ac.signal.aborted) {
          const o = queue.shift();
          if (typeof o === 'number') await fetchFrame(o);
        }
      }));
    } catch {
      if (ac.signal.aborted) return; // user cancelled — do nothing
      await renderFilm(filmPrompt, refs, orientation, undefined);
    } finally {
      setStoryboardBusy(false);
    }
  }, [videoStyle, locale, videoDuration, renderFilm]);

  // Re-roll a SINGLE storyboard frame (the others are untouched) and swap it in.
  const regenScene = useCallback(async (ordinal: number) => {
    if (!storyboard || regenningOrdinal !== null) return;
    setRegenningOrdinal(ordinal);
    const scene = storyboard.scenes.find((s) => s.ordinal === ordinal);
    try {
      const res = await fetch('/api/film/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt: storyboard.filmPrompt, orientation: storyboard.orientation, referenceImages: storyboard.refs, style: videoStyle, locale, sceneOrdinal: ordinal, ...((scene?.edited && scene.prompt.trim()) ? { scenePrompt: scene.prompt.trim() } : (storyboard.framePrompts?.[ordinal] ? { scenePrompt: storyboard.framePrompts[ordinal] } : {})) }),
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; frameUrl?: string | null };
      if (j.success && typeof j.frameUrl === 'string') {
        const url = j.frameUrl;
        setStoryboard((prev) => prev
          ? { ...prev, scenes: prev.scenes.map((s) => (s.ordinal === ordinal ? { ...s, frameUrl: url } : s)) }
          : prev);
      }
    } catch {
      /* keep the existing frame on failure */
    } finally {
      setRegenningOrdinal(null);
    }
  }, [storyboard, regenningOrdinal, videoStyle, locale]);

  // Edit a storyboard scene's shot description in place (Storyboard scene editing).
  // The edit is used when re-rolling that scene's frame AND threaded into the final
  // render so the clip matches what the user wrote.
  const editScene = useCallback((ordinal: number, text: string) => {
    setStoryboard((prev) => prev
      ? { ...prev, scenes: prev.scenes.map((s) => (s.ordinal === ordinal ? { ...s, prompt: text, edited: true } : s)) }
      : prev);
  }, []);

  // One-click RE-ROLL of an image/music result: re-run the SAME prompt + settings
  // (a fresh variation) WITHOUT a new user bubble — the new asset lands as a fresh
  // assistant bubble beneath the original. Mirrors send()'s gen-token / abort
  // discipline so Stop and superseded requests can never clobber a newer one.
  const regenerate = useCallback(async (spec: RegenSpec) => {
    if (busy) return;
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;
    setMessages((prev) => [...prev, { role: 'assistant', text: '' }]);
    setBusy(true);
    const failMsg = spec.kind === 'image' ? t.imageFailed : t.musicFailed;
    try {
      const res = await fetch(spec.kind === 'image' ? '/api/nanobanana/image' : '/api/ai/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          spec.kind === 'image'
            ? { prompt: spec.prompt, quality: spec.quality, aspectRatio: spec.aspect, style: spec.style === 'Auto' ? undefined : spec.style, ...(spec.referenceImage ? { referenceImage: spec.referenceImage } : {}) }
            : { prompt: spec.prompt, style: spec.genre, instrumental: spec.instrumental, ...(spec.lyrics ? { lyrics: spec.lyrics } : {}) },
        ),
        credentials: 'include',
        signal: ac.signal,
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string; coverUrl?: string };
      setMessages((prev) => {
        if (!mine()) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = j.success && j.url
            ? (spec.kind === 'image'
                ? { role: 'assistant', text: '', imageUrl: j.url, regen: spec }
                : { role: 'assistant', text: '', audioUrl: j.url, ...(j.coverUrl ? { coverUrl: j.coverUrl } : {}), regen: spec })
            : { role: 'assistant', text: `⚠️ ${j.error || failMsg}` };
        }
        return next;
      });
    } catch {
      if (!mine()) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${failMsg}` };
        return next;
      });
    } finally {
      if (mine()) setBusy(false);
    }
  }, [busy, t.imageFailed, t.musicFailed]);

  // Edit a generated/attached image with img2img: load it as the source + switch to
  // Image mode; the next prompt transforms it. https URLs feed NanoBanana directly,
  // data: uploads are hosted by the route first.
  const startImageEdit = useCallback((url: string) => {
    setMode('image');
    setAttachments([{ dataUrl: url, mimeType: 'image/png' }]);
    setLightbox(null);
    setTimeout(() => { try { taRef.current?.focus(); } catch { /* noop */ } }, 60);
  }, []);

  // ×2 / ×4 image batch: generate N variations of the SAME prompt in parallel into
  // ONE result grid, each tile filling in as its generation lands. Reused by send
  // (new batch) and the grid's "regenerate all". Mirrors send()'s gen-token / abort
  // discipline so Stop and superseded requests can never clobber a newer grid.
  const runImageBatch = useCallback(async (spec: ImageRegenSpec, count: number) => {
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;
    setMessages((prev) => [...prev, { role: 'assistant', text: '', batch: { spec, tiles: Array.from({ length: count }, () => ({ status: 'pending' as const })) } }]);
    setBusy(true);
    const updateTile = (k: number, tile: BatchTile) => {
      setMessages((prev) => {
        if (!mine()) return prev;
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          const mm = next[i];
          if (mm && mm.role === 'assistant' && mm.batch) {
            const tiles = mm.batch.tiles.slice();
            tiles[k] = tile;
            next[i] = { ...mm, batch: { ...mm.batch, tiles } };
            break;
          }
        }
        return next;
      });
    };
    await Promise.all(
      Array.from({ length: count }, async (_unused, k) => {
        try {
          const res = await fetch('/api/nanobanana/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: spec.prompt, quality: spec.quality, aspectRatio: spec.aspect, style: spec.style === 'Auto' ? undefined : spec.style, ...(spec.referenceImage ? { referenceImage: spec.referenceImage } : {}) }),
            credentials: 'include',
            signal: ac.signal,
          });
          const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string };
          updateTile(k, j.success && j.url ? { status: 'done', url: j.url } : { status: 'failed' });
        } catch {
          updateTile(k, { status: 'failed' });
        }
      }),
    );
    if (mine()) setBusy(false);
  }, []);

  // Stream one chat turn from /api/chat/gemini into a fresh assistant bubble. Shared
  // by send (a new turn) and regenerateChat (re-roll the last answer). Owns its own
  // gen token so Stop / a superseded request never clobbers a newer stream.
  const streamChat = useCallback(async (history: Msg[]) => {
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;
    setMessages([...history, { role: 'assistant', text: '' }]);
    setBusy(true);
    // Build the Gemini payload: text-only → string content; with media → native
    // multimodal parts (image / file) the route forwards as inline_data.
    const payload = history.map((m) => {
      if (m.medias && m.medias.length) {
        const mediaParts = m.medias.map((md) => isImage(md.mimeType)
          ? { type: 'image', image: md.dataUrl }
          : { type: 'file', data: md.dataUrl, mimeType: md.mimeType });
        return { role: m.role, content: [
          ...(m.text ? [{ type: 'text', text: m.text }] : []),
          ...mediaParts,
        ] };
      }
      return { role: m.role, content: m.text };
    });
    try {
      const res = await fetch('/api/chat/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }), credentials: 'include', signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error('stream failed');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        if (!mine()) { try { await reader.cancel(); } catch { /* noop */ } break; }
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const mm = line.match(/^data:\s*(.+)$/s);
          if (!mm) continue;
          try {
            const j = JSON.parse(mm[1]!) as { text?: string };
            if (j.text) {
              setMessages((prev) => {
                if (!mine()) return prev;
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') next[next.length - 1] = { ...last, text: last.text + j.text };
                return next;
              });
            }
          } catch { /* ignore non-JSON keepalive lines */ }
        }
      }
    } catch {
      if (!mine()) return; // stopped / superseded — keep the partial stream as-is
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant' && !last.text) next[next.length - 1] = { ...last, text: '⚠️' };
        return next;
      });
    } finally {
      if (mine()) setBusy(false);
    }
  }, []);

  // Regenerate the LAST assistant reply: re-stream from the conversation up to (and
  // including) the user turn that prompted it — the standard chat "try again" /
  // retry-on-error. Drops the old answer and streams a fresh one in its place.
  const regenerateChat = useCallback(() => {
    if (busy) return;
    let lastA = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'assistant') { lastA = i; break; }
    }
    if (lastA < 0) return;
    void streamChat(messages.slice(0, lastA));
  }, [busy, messages, streamChat]);

  const send = useCallback(async (opts?: { forceMyVoice?: boolean }) => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    // Stop any live dictation so the recognizer doesn't keep appending after send.
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    // Mobile: blur the composer so the on-screen keyboard COMMITS the IME buffer —
    // otherwise a programmatic value='' doesn't visibly clear and the sent text lingers.
    try { taRef.current?.blur(); } catch { /* noop */ }

    // New generation token + abort controller. Every async finalizer below checks
    // `mine()` before mutating state, so Stop (which bumps the token + aborts) or a
    // superseded request can never overwrite a newer bubble or re-toggle `busy`.
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;

    // ── IMAGE GENERATION (NanoBanana) ──────────────────────────────────────────
    // In image mode the typed prompt becomes a brand-new image: POST it to
    // /api/nanobanana/image and render the returned URL as an assistant image
    // bubble. Text prompt is required; fail-soft to a clean retry notice.
    // NOTE: image generation is text-to-image — it cannot consume an uploaded
    // file. So if the user attached photos/files, we DON'T run image gen here;
    // we fall through to the multimodal CHAT branch, which sends the text + the
    // attachments together (and clears them). This fixes "the file stays in the
    // box and only the text is sent" when an attachment is present in Image mode.
    // Image mode: an attached IMAGE becomes the img2img / EDIT source (the route hosts
    // it + feeds NanoBanana); a file/audio attachment instead falls through to the
    // multimodal chat branch (it can't be an image input).
    const imgRefRaw = mode === 'image' ? attachments.find((a) => isImage(a.mimeType))?.dataUrl : undefined;
    const nonImageAttach = attachments.some((a) => !isImage(a.mimeType));
    if (mode === 'image' && text && !nonImageAttach) {
      const isBatch = imgCount > 1;
      // ×2 / ×4 → a grid; ×1 → one bubble. Push the user turn first (instant feedback).
      setMessages((prev) => [...prev, { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) }, ...(isBatch ? [] : [{ role: 'assistant' as const, text: '' }])]);
      setInput(''); setAttachments([]);
      if (!isBatch) setBusy(true);
      // Downscale a data: reference so a full-res photo never exceeds the body limit;
      // an https reference (the "Edit" action) is used as-is.
      const imgRef = imgRefRaw ? await downscaleDataUrl(imgRefRaw) : undefined;
      const imgSpec: ImageRegenSpec = { kind: 'image', prompt: text, quality: imgQuality, aspect: imgAspect, style: imgStyle, ...(imgRef ? { referenceImage: imgRef } : {}) };
      if (isBatch) {
        await runImageBatch(imgSpec, imgCount);
        return;
      }
      try {
        const res = await fetch('/api/nanobanana/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, quality: imgQuality, aspectRatio: imgAspect, style: imgStyle === 'Auto' ? undefined : imgStyle, ...(imgRef ? { referenceImage: imgRef } : {}) }),
          credentials: 'include',
          signal: ac.signal,
        });
        const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string; coverUrl?: string };
        setMessages((prev) => {
          if (!mine()) return prev;
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] =
              j.success && j.url
                ? { role: 'assistant', text: '', imageUrl: j.url, regen: imgSpec }
                : { role: 'assistant', text: `⚠️ ${j.error || t.imageFailed}` };
          }
          return next;
        });
      } catch {
        if (!mine()) return;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.imageFailed}` };
          return next;
        });
      } finally {
        if (mine()) setBusy(false);
      }
      return;
    }

    // ── MUSIC GENERATION (Udio) ────────────────────────────────────────────────
    // In music mode the prompt describes a vibe; POST it to /api/ai/music (Udio →
    // re-hosted to Supabase) and render the track as an inline audio player.
    // Same rule as Image: music is text-to-music. With attachments present, fall
    // through to multimodal chat so the files are actually sent (and cleared).
    // Music mode: an attached AUDIO becomes a COVER source (Udio reimagines it in the
    // chosen genre/prompt); image/file/video attachments instead route to chat.
    const audioRef = mode === 'music' ? attachments.find((a) => isAudio(a.mimeType))?.dataUrl : undefined;
    const audioMime = mode === 'music' ? attachments.find((a) => isAudio(a.mimeType))?.mimeType : undefined;
    const musicBlocked = mode === 'music' && attachments.some((a) => !isAudio(a.mimeType));
    // Generate music when there's a vibe typed OR a voice/cover attached — you should
    // NOT have to type a prompt just to sing in your own voice (that was a dead end).
    // Faithful trained-voice path needs neither typed text nor an upload — just the toggle.
    const useTrained = mode === 'music' && (useMyVoice || !!opts?.forceMyVoice) && hasTrainedVoice;
    if (mode === 'music' && (text || audioRef || useTrained) && !musicBlocked) {
      // Always have a prompt for the API: the typed vibe, else the lyrics, else the genre.
      const musicPrompt = text || musicLyrics.trim() || `${musicGenre} music`;
      const userBubble = text || (useTrained ? t.voiceMode : audioRef ? `🎤 ${musicAudioMode === 'voice' ? t.voiceMode : t.coverMode}` : musicPrompt);
      setMessages((prev) => [...prev, { role: 'user', text: userBubble, ...(attachments.length ? { medias: attachments } : {}) }, { role: 'assistant', text: useTrained ? t.generatingMyVoice : '' }]);
      setInput(''); setAttachments([]); setBusy(true);
      try {
        // Cover: upload the attached track to Supabase first (browser → storage), so
        // the request body stays tiny — the audio never hits the function-body limit.
        const uploadedAudioUrl = audioRef ? await uploadBigFile(audioRef, audioMime || 'audio/mpeg') : undefined;
        // Voice-clone path: the uploaded audio is the user's VOICE → MiniMax sings the
        // lyrics in it. Otherwise the attached audio is a cover (melody) source.
        const isVoiceClone = !!uploadedAudioUrl && musicAudioMode === 'voice' && !useTrained;
        const res = await fetch('/api/ai/music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: musicPrompt,
            style: musicGenre,
            // Trained voice (RVC) → no upload needed; the server uses the user's model.
            ...(useTrained ? { useMyVoice: true } : {}),
            instrumental: (useTrained || isVoiceClone) ? false : musicInstrumental,
            // Lyrics ride along for vocal tracks, voice clones AND the trained voice.
            ...((useTrained || isVoiceClone || !musicInstrumental) && musicLyrics.trim() ? { lyrics: musicLyrics.trim() } : {}),
            ...(useTrained ? {} : isVoiceClone
              ? { voiceReference: uploadedAudioUrl }
              : uploadedAudioUrl ? { audioReference: uploadedAudioUrl } : {}),
          }),
          credentials: 'include',
          signal: ac.signal,
        });
        const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string; coverUrl?: string };
        setMessages((prev) => {
          if (!mine()) return prev;
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] =
              j.success && j.url
                ? { role: 'assistant', text: '', audioUrl: j.url, ...(j.coverUrl ? { coverUrl: j.coverUrl } : {}), regen: { kind: 'music', prompt: musicPrompt, genre: musicGenre, instrumental: musicInstrumental, ...(!musicInstrumental && musicLyrics.trim() ? { lyrics: musicLyrics.trim() } : {}) } }
                : { role: 'assistant', text: /copyright|copyrighted/i.test(j.error || '') ? t.lyricsBlocked : `⚠️ ${j.error || t.musicFailed}` };
          }
          return next;
        });
      } catch {
        if (!mine()) return;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.musicFailed}` };
          return next;
        });
      } finally {
        if (mine()) setBusy(false);
      }
      return;
    }

    // ── VIDEO GENERATION (30-second film pipeline) ─────────────────────────────
    // In video mode the prompt is a scene; an attached photo locks the character.
    // Reuses the proven driveFilmStudio client (orchestrate → poll → assemble),
    // streams its live status into the assistant bubble, then renders the master
    // inline — so the full film service lives in this one chatbox.
    if (mode === 'video' && text) {
      const refs = attachments.filter((a) => isImage(a.mimeType)).map((a) => a.dataUrl);
      const filmPrompt = `${videoStyle ? `${text}. Visual style: ${videoStyle.toLowerCase()}, cinematic.` : text}${(videoNarration || (videoMyVoiceNarration && hasTrainedVoice)) ? t.narrationCue : ''}`;
      setMessages((prev) => [...prev, { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) }]);
      setInput(''); setAttachments([]);
      // Storyboard-FIRST: plan the 6 scenes + a frame each for the user to review;
      // the approved frames then anchor the full render (createStoryboard → renderFilm).
      await createStoryboard(filmPrompt, refs, videoOrientation);
      return;
    }

    // ── LIP-SYNC / DUB FROM TEXT ───────────────────────────────────────────────
    // Attach a video → type a script → it's spoken (ElevenLabs, optionally re-voiced in
    // the user's TRAINED voice via RVC) → Wav2Lip keys the character's lips to that
    // audio. A direct audio attachment also works (skips TTS). One long request → the
    // synced master, rendered inline like any other video result.
    if (mode === 'lipsync') {
      // The "face" can be a VIDEO or a still PHOTO (Wav2Lip animates a portrait into a
      // talking clip) → covers both "dub a video" and "make a character speak".
      const faceAtt = attachments.find((a) => isImage(a.mimeType)) ?? attachments.find((a) => isVideo(a.mimeType));
      const audioAtt = attachments.find((a) => isAudio(a.mimeType));
      // PRESENTER — no face photo but a typed script → a consistent stock avatar
      // speaks it in the CLONED Georgian voice (audio-driven HeyGen). START + POLL,
      // mobile-safe. (With a photo, fall through to the existing talking-photo flow.)
      if (!faceAtt && text) {
        setMessages((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: t.generatingLipsync, genKind: 'lipsync' }]);
        setInput(''); setAttachments([]); setBusy(true);
        try {
          // Two-phase START (each request stays well under the gateway timeout):
          // A) synthesize the cloned-voice audio, B) submit it to HeyGen → videoId.
          const synRes = await fetch('/api/heygen/presenter', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal,
            body: JSON.stringify({ text, orientation: videoOrientation, gender: 'female' }),
          });
          const syn = (await synRes.json().catch(() => ({}))) as { success?: boolean; audioUrl?: string };
          let sj: { success?: boolean; videoId?: string } = {};
          if (syn.success && syn.audioUrl) {
            const genRes = await fetch('/api/heygen/presenter', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal,
              body: JSON.stringify({ audioUrl: syn.audioUrl, orientation: videoOrientation }),
            });
            sj = (await genRes.json().catch(() => ({}))) as { success?: boolean; videoId?: string };
          }
          let url: string | null = null;
          if (sj.success && sj.videoId) {
            for (let i = 0; i < 60 && !url; i++) { // ~6 min of quick polls
              if (!mine()) return;
              await new Promise((r) => setTimeout(r, 6000));
              const pr = await fetch(`/api/heygen/presenter?id=${encodeURIComponent(sj.videoId)}`, { credentials: 'include', signal: ac.signal });
              const pj = (await pr.json().catch(() => ({}))) as { done?: boolean; url?: string | null };
              if (pj.done) { url = pj.url ?? null; break; }
            }
          }
          setMessages((prev) => {
            if (!mine()) return prev;
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') next[next.length - 1] = url ? { role: 'assistant', text: '', videoUrl: url, genKind: 'lipsync' } : { role: 'assistant', text: `⚠️ ${t.lipsyncFailed}` };
            return next;
          });
        } catch {
          if (!mine()) return;
          setMessages((prev) => { const next = [...prev]; const last = next[next.length - 1]; if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.lipsyncFailed}` }; return next; });
        } finally {
          if (mine()) setBusy(false);
        }
        return;
      }
      if (!faceAtt || (!text && !audioAtt)) {
        setMessages((prev) => [...prev, { role: 'assistant', text: t.lipsyncNeedFiles }]);
        return;
      }
      setMessages((prev) => [...prev, { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) }, { role: 'assistant', text: t.generatingLipsync }]);
      setInput(''); setAttachments([]); setBusy(true);
      try {
        const videoUrl = await uploadBigFile(faceAtt.dataUrl, faceAtt.mimeType);
        if (!videoUrl) throw new Error('upload failed');
        const audioUrl = audioAtt ? await uploadBigFile(audioAtt.dataUrl, audioAtt.mimeType) : undefined;
        const startBody = JSON.stringify({
          videoUrl,
          ...(audioUrl ? { audioUrl } : {}),
          ...(text ? { text } : {}),
          ...(lipMyVoice && hasTrainedVoice ? { useMyVoice: true } : {}),
        });
        // START the job (returns fast) → poll in SHORT requests (mobile-safe). The
        // SadTalker provider intermittently crashes (Pillow 'ANTIALIAS' on some of its
        // runtime builds), so retry the WHOLE job up to 3× — a fresh run lands on a
        // good build. Non-transient failures bail immediately.
        let resultUrl: string | null = null;
        let resultErr: string | null = null;
        // Avatar engine = HeyGen first; if a HeyGen job fails (create OR render), the next
        // attempt forces the proven SadTalker engine — so the service NEVER hard-fails.
        let forceSadTalker = false;
        for (let attempt = 0; attempt < 3 && !resultUrl; attempt++) {
          if (!mine()) return;
          const body = forceSadTalker ? JSON.stringify({ ...JSON.parse(startBody), forceSadTalker: true }) : startBody;
          const startRes = await fetch('/api/video/lipsync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: 'include', signal: ac.signal });
          const startJson = (await startRes.json().catch(() => ({}))) as { jobId?: string | null };
          if (!startJson.jobId) { resultErr = 'start failed'; continue; }
          const usedHeygen = String(startJson.jobId).startsWith('heygen:');
          resultErr = null;
          for (let i = 0; i < 70; i++) { // ~7 min per attempt; each poll is a quick request
            if (!mine()) return;
            await new Promise((r) => setTimeout(r, 6000));
            const pollRes = await fetch(`/api/video/lipsync?id=${encodeURIComponent(startJson.jobId)}`, { credentials: 'include', signal: ac.signal });
            const pj = (await pollRes.json().catch(() => ({}))) as { done?: boolean; url?: string | null; error?: string | null };
            if (pj.done) { resultUrl = pj.url ?? null; resultErr = pj.error ?? null; break; }
          }
          if (resultUrl) break;
          // A failed HeyGen job → fall back to the proven SadTalker engine on the next try.
          if (usedHeygen) { forceSadTalker = true; continue; }
          // SadTalker: retry only the known transient model crash; bail on anything else.
          if (resultErr && !/antialias|has no attribute|cuda|out of memory|memory|runtimeerror|baseexception|must derive/i.test(resultErr)) break;
        }
        setMessages((prev) => {
          if (!mine()) return prev;
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] = resultUrl
              ? { role: 'assistant', text: '', videoUrl: resultUrl }
              : { role: 'assistant', text: `⚠️ ${t.lipsyncFailed} ${locale === 'en' ? 'Please try again — re-attach the photo and resend.' : locale === 'ru' ? 'Попробуйте ещё раз — прикрепите фото и отправьте снова.' : 'სცადე თავიდან — ფოტო ხელახლა მიამაგრე და გააგზავნე.'}` };
          }
          return next;
        });
      } catch {
        if (!mine()) return;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.lipsyncFailed}` };
          return next;
        });
      } finally {
        if (mine()) setBusy(false);
      }
      return;
    }

    // ── CHAT (multimodal Gemini) ───────────────────────────────────────────────
    const userMsg: Msg = { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) };
    setInput(''); setAttachments([]);
    await streamChat([...messages, userMsg]);
  }, [input, attachments, busy, messages, mode, locale, imgAspect, imgQuality, imgStyle, imgCount, runImageBatch, musicGenre, musicInstrumental, musicLyrics, musicAudioMode, useMyVoice, hasTrainedVoice, videoOrientation, videoStyle, videoNarration, videoMyVoiceNarration, lipMyVoice, hasTrainedVoice, createStoryboard, streamChat, t.narrationCue, t.imageFailed, t.musicFailed, t.voiceMode, t.coverMode, t.generatingMyVoice, t.lipsyncNeedFiles, t.generatingLipsync, t.lipsyncFailed]);

  // STOP — cancel the in-flight generation. Bumps the generation token (so every
  // pending finalizer no-ops), aborts the fetch, frees the composer, and converts
  // an empty pending bubble into a "stopped" note (a streamed partial is kept).
  const stop = useCallback(() => {
    genIdRef.current += 1;
    try { abortRef.current?.abort(); } catch { /* noop */ }
    abortRef.current = null;
    setBusy(false);
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === 'assistant' && !last.text && !last.imageUrl && !last.audioUrl && !last.videoUrl) {
        next[next.length - 1] = { role: 'assistant', text: `⏹ ${t.stopped}` };
      }
      return next;
    });
  }, [t.stopped]);

  // Abort any in-flight request if the studio unmounts (e.g. New Chat remount).
  useEffect(() => () => { try { abortRef.current?.abort(); } catch { /* noop */ } try { recognitionRef.current?.stop(); } catch { /* noop */ } }, []);
  // Release the voice-sample recorder (mic + timer) if the component unmounts mid-capture.
  useEffect(() => () => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    try { voiceRecRef.current?.stop(); } catch { /* noop */ }
    voiceStreamRef.current?.getTracks().forEach((tr) => tr.stop());
  }, []);

  // Magic Wand — rewrite the current textarea prompt into an AI-optimized version
  // IN PLACE (Section 7 / 8A). Fail-soft: the endpoint returns the original prompt
  // on any miss, so the composer is never blanked.
  const magicEnhance = useCallback(async () => {
    const text = input.trim();
    if (!text || enhancing || busy) return;
    setEnhancing(true);
    try {
      const res = await fetch('/api/ai/magic-wand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
        credentials: 'include',
      });
      const j = (await res.json().catch(() => ({}))) as { enhanced?: string };
      if (j.enhanced && j.enhanced.trim()) setInput(j.enhanced.trim());
    } catch {
      /* fail-soft — keep the original prompt */
    } finally {
      setEnhancing(false);
    }
  }, [input, enhancing, busy]);

  // Copy an assistant reply to the clipboard (2s ✓ feedback).
  const copyMsg = useCallback(async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(i);
      setTimeout(() => setCopiedIdx((c) => (c === i ? null : c)), 2000);
    } catch {
      /* clipboard blocked — no-op */
    }
  }, []);

  // Thumbs feedback (#9): record the rating locally + fire-and-forget to the
  // server. Never throws — feedback must never disrupt the chat.
  const rateMsg = useCallback((i: number, rating: 'up' | 'down', text: string) => {
    setRatedIdx((r) => ({ ...r, [i]: rating }));
    void fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, preview: (text || '').slice(0, 280) }),
    }).catch(() => {});
  }, []);

  // Edit & resend a user turn: replace it with the edited text and re-run the chat
  // from that point (everything after it is dropped) — the standard "edit message".
  const startEdit = useCallback((i: number) => {
    if (busy) return;
    setEditingIdx(i);
    setEditText(messages[i]?.text ?? '');
  }, [busy, messages]);
  const cancelEdit = useCallback(() => { setEditingIdx(null); setEditText(''); }, []);
  const saveEdit = useCallback(() => {
    if (editingIdx === null) return;
    const idx = editingIdx;
    const orig = messages[idx];
    const trimmed = editText.trim();
    if (!orig || orig.role !== 'user' || !trimmed) { setEditingIdx(null); return; }
    setEditingIdx(null);
    setEditText('');
    void streamChat([...messages.slice(0, idx), { role: 'user', text: trimmed, ...(orig.medias ? { medias: orig.medias } : {}) }]);
  }, [editingIdx, editText, messages, streamChat]);

  // Read an assistant reply aloud via the premium TTS route (ElevenLabs Georgian
  // voice, Google-TTS fallback). Toggles: tapping the speaking message stops it.
  // Only one plays at a time. Fail-soft: any miss just clears the speaking state.
  const speakMsg = useCallback(async (text: string, i: number) => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    // Tapping the active bubble (loading OR playing) stops it — bump the token so any
    // in-flight synthesis for it is abandoned rather than auto-playing later.
    if (speakingIdx === i) { ttsTokenRef.current++; setSpeakingIdx(null); setSpeakPhase(null); return; }
    const token = ++ttsTokenRef.current;
    const live = () => token === ttsTokenRef.current;
    setSpeakingIdx(i);
    setSpeakPhase('loading'); // spinner while eleven_v3 synthesises the cloned voice
    try {
      const res = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 5000), locale }),
      });
      if (!live()) return; // superseded/cancelled during synthesis
      if (!res.ok) { setSpeakingIdx(null); setSpeakPhase(null); return; }
      const url = URL.createObjectURL(await res.blob());
      if (!live()) { URL.revokeObjectURL(url); return; }
      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      const clear = () => { if (live()) { setSpeakingIdx(null); setSpeakPhase(null); } URL.revokeObjectURL(url); if (ttsAudioRef.current === audio) ttsAudioRef.current = null; };
      audio.onended = clear;
      audio.onerror = clear;
      // Drive state from events, not just play()'s promise: a browser that leaves
      // play() pending (strict autoplay) must not strand the spinner. onplaying flips
      // to 'playing'; a timeout recovers to 'playing'/null if it never starts.
      audio.onplaying = () => { if (live()) setSpeakPhase('playing'); };
      audio.play()
        .then(() => { if (live()) setSpeakPhase('playing'); })
        .catch(() => { if (live()) { setSpeakingIdx(null); setSpeakPhase(null); ttsAudioRef.current = null; } });
      window.setTimeout(() => {
        if (live()) setSpeakPhase((p) => (p === 'loading' ? (audio.paused ? null : 'playing') : p));
        if (live() && audio.paused && ttsAudioRef.current === audio) { /* blocked → reset bubble */ setSpeakingIdx((s) => (s === i ? null : s)); }
      }, 1800);
    } catch {
      if (live()) { setSpeakingIdx(null); setSpeakPhase(null); }
      ttsAudioRef.current = null;
    }
  }, [speakingIdx, locale]);

  // Stop any in-flight read-aloud when the studio unmounts.
  useEffect(() => () => { try { ttsAudioRef.current?.pause(); } catch { /* noop */ } }, []);

  // ── Voice SAMPLE for "sing in my voice" (music) ──────────────────────────────
  // Add an audio blob/file as the music VOICE reference (replaces any prior audio),
  // then default to "my voice" mode so the lyrics box appears.
  const addVoiceMedia = useCallback((dataUrl: string, mimeType: string) => {
    setAttachments((prev) => [...prev.filter((a) => !isAudio(a.mimeType)), { dataUrl, mimeType }].slice(-MAX_ATTACHMENTS));
    setMusicAudioMode('voice');
  }, []);

  const stopVoiceRecording = useCallback(() => {
    try { voiceRecRef.current?.stop(); } catch { /* noop */ }
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
    voiceStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    voiceStreamRef.current = null;
    setVoiceRecording(false);
  }, []);

  const startVoiceRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
      let mime = '';
      for (const c of cands) { try { if (MediaRecorder.isTypeSupported(c)) { mime = c; break; } } catch { /* noop */ } }
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      voiceChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) voiceChunksRef.current.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(voiceChunksRef.current, { type });
        const r = new FileReader();
        r.onload = () => addVoiceMedia(String(r.result), type);
        r.readAsDataURL(blob);
      };
      voiceRecRef.current = rec;
      rec.start();
      setVoiceRecSec(0);
      setVoiceRecording(true);
      voiceTimerRef.current = setInterval(() => setVoiceRecSec((s) => {
        const n = s + 1;
        if (n >= 60) stopVoiceRecording(); // cap at 60s
        return n;
      }), 1000);
    } catch {
      setVoiceRecording(false);
    }
  }, [addVoiceMedia, stopVoiceRecording]);

  // Record-and-transcribe (Whisper) — the RELIABLE path on iOS (the Web Speech API
  // doesn't work in the WKWebView app) and any browser without live recognition.
  // Records in a container the platform actually supports and labels the file with the
  // MATCHING extension: iOS records mp4, NOT webm — a wrong extension makes Whisper
  // reject the audio (a real cause of "the mic does nothing on mobile").
  const startRecorderFallback = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg'];
      let chosen = '';
      for (const c of candidates) {
        try { if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) { chosen = c; break; } } catch { /* noop */ }
      }
      const rec = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const base = input ? `${input.trimEnd()} ` : '';
      const extFor = (t: string) => /mp4/i.test(t) ? 'mp4' : /aac/i.test(t) ? 'm4a' : /mpeg|mp3/i.test(t) ? 'mp3' : /wav/i.test(t) ? 'wav' : 'webm';
      let inFlight = false;
      let stopped = false;
      // Transcribe the audio captured SO FAR and STREAM the text into the composer —
      // the accumulated blob (chunk[0] carries the container header) is a valid clip,
      // so the text grows live as you speak instead of only appearing when you stop.
      const transcribeSoFar = async () => {
        if (inFlight) return;
        const type = rec.mimeType || chosen || 'audio/webm';
        const blob = new Blob(chunks, { type });
        if (blob.size < 1600) return;
        inFlight = true;
        try {
          const fd = new FormData();
          fd.append('audio', blob, `clip.${extFor(type)}`);
          fd.append('language', lang);
          const r = await fetch('/api/voice/transcribe', { method: 'POST', body: fd });
          const j = (await r.json().catch(() => ({}))) as { text?: string };
          if (j.text && j.text.trim()) setInput(base + j.text.trim());
        } catch { /* fail-soft */ }
        inFlight = false;
      };
      rec.ondataavailable = (e) => { if (e.data.size) { chunks.push(e.data); if (!stopped) void transcribeSoFar(); } };
      rec.onstop = async () => {
        stopped = true;
        setRecording(false);
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        // Wait out any in-flight request, then do one FINAL pass over the whole clip.
        for (let i = 0; inFlight && i < 25; i++) await new Promise((r) => setTimeout(r, 200));
        inFlight = false;
        await transcribeSoFar();
      };
      recRef.current = rec;
      rec.start(2500); // emit a chunk every 2.5s → progressive, streaming transcription
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, [input, lang]);

  const toggleMic = useCallback(async () => {
    if (recording) {
      // Stop whichever recognizer is active (live recognizer or fallback recorder).
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
      try { recRef.current?.stop(); } catch { /* noop */ }
      return;
    }
    const SR = (typeof window !== 'undefined'
      ? ((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
        ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)
      : undefined) as (new () => SpeechRecognitionLike) | undefined;
    // Try LIVE Web Speech FIRST on EVERY platform — it streams text as you talk and
    // works in mobile Safari too (iOS 14.5+); the old code skipped it on iOS, which is
    // exactly why "text doesn't appear until I stop". A 4s watchdog catches engines
    // that "start" but never deliver (some in-app webviews) and drops to the
    // record-and-transcribe fallback so the mic always does something.
    if (SR) {
      try {
        const rec = new SR();
        rec.lang = lang;
        rec.continuous = true;
        rec.interimResults = true;
        sttBaseRef.current = input ? `${input.trimEnd()} ` : '';
        sttFinalRef.current = '';
        let fellBack = false;
        let gotResult = false;
        const toRecorder = () => {
          if (fellBack) return;
          fellBack = true;
          try { rec.stop(); } catch { /* noop */ }
          recognitionRef.current = null;
          void startRecorderFallback();
        };
        // Give Web Speech a generous window to deliver the first text before assuming
        // it's a "silent" engine and dropping to the recorder — otherwise pausing a
        // moment before speaking would wrongly kill live transcription.
        const watchdog = setTimeout(() => { if (!gotResult) toRecorder(); }, 8000);
        rec.onresult = (e: SREvent) => {
          gotResult = true;
          clearTimeout(watchdog);
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i]!;
            const txt = res[0]?.transcript ?? '';
            if (res.isFinal) sttFinalRef.current += txt;
            else interim += txt;
          }
          setInput((sttBaseRef.current + sttFinalRef.current + interim).replace(/\s+/g, ' ').trimStart());
        };
        rec.onend = () => { clearTimeout(watchdog); recognitionRef.current = null; if (!fellBack) setRecording(false); };
        // No text yet + an error (incl. the silent webview case) → record-and-transcribe.
        rec.onerror = () => { clearTimeout(watchdog); if (!gotResult) toRecorder(); else { recognitionRef.current = null; setRecording(false); } };
        recognitionRef.current = rec;
        rec.start();
        setRecording(true);
        return;
      } catch {
        /* fall through to the recorder */
      }
    }
    await startRecorderFallback();
  }, [recording, lang, input, startRecorderFallback]);

  // Composer derived state: the active mode's icon/label for the inline selector,
  // and whether there's anything to send (drives the mic↔send swap).
  const activeMode = MODES.find((mm) => mm.id === mode) ?? MODES[0];
  const ActiveModeIcon = activeMode.Icon;
  const activeModeKey = activeMode.key;
  // Chat can send on text OR attachments alone; the generative modes need a text
  // prompt (this also prevents an image/music/video send with only files from
  // silently falling through to the chat branch).
  // Sendable when there's text OR any attachment — in EVERY mode. An attachment
  // in Image/Music mode routes to multimodal chat (see send), so it must be able
  // to trigger a send; this is also what clears the lingering attachment.
  const canSend = !!input.trim() || attachments.length > 0 || (mode === 'music' && useMyVoice && hasTrainedVoice);

  // Force a REAL download. The <a download> attribute is ignored cross-origin (Supabase
  // signed URLs), so the old button just opened the file in a new tab. Fetch → blob →
  // save instead; fail-open to opening it.
  const dl = useCallback(async (url: string, filename: string) => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('fetch failed');
      const blob = await r.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 5000);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }, []);

  // Share an output (image / track / talking-video). Best UX: hand the real FILE to the
  // native share sheet, so it lands as media in WhatsApp / Instagram / Messenger. Falls
  // back to a URL share, then to copying the link with a toast — works on every device.
  const share = useCallback(async (url: string, filename: string) => {
    const nav = navigator as Navigator & {
      canShare?: (d: { files?: File[] }) => boolean;
      share?: (d: { title?: string; text?: string; url?: string; files?: File[] }) => Promise<void>;
    };
    try {
      if (typeof nav.share === 'function') {
        try {
          const r = await fetch(url);
          if (r.ok) {
            const blob = await r.blob();
            const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
            if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: 'MyAvatar' }); return; }
          }
        } catch { /* fall through to URL / clipboard */ }
        try { await nav.share({ url, title: 'MyAvatar', text: 'MyAvatar.ge' }); return; }
        catch (e) { if ((e as { name?: string })?.name === 'AbortError') return; /* else fall through */ }
      }
      await navigator.clipboard.writeText(url);
      setShareToast(t.linkCopied);
      setTimeout(() => setShareToast((s) => (s === t.linkCopied ? null : s)), 2200);
    } catch {
      try { window.open(url, '_blank', 'noopener'); } catch { /* noop */ }
    }
  }, [t.linkCopied]);

  // ✨ Auto-write lyrics from the typed vibe (or the genre) and drop them into the box.
  const writeLyrics = useCallback(async () => {
    if (writingLyrics) return;
    const theme = input.trim() || musicLyrics.trim() || musicGenre;
    setWritingLyrics(true);
    try {
      const r = await fetch('/api/ai/lyrics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, language: locale, style: musicGenre }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; lyrics?: string };
      if (j.success && j.lyrics) setMusicLyrics(j.lyrics);
    } catch { /* fail-soft */ }
    setWritingLyrics(false);
  }, [writingLyrics, input, musicLyrics, musicGenre, locale]);

  // ⬆ Upscale a generated image to HD (Real-ESRGAN) → a fresh image bubble.
  const upscale = useCallback(async (url: string) => {
    if (upscaling) return;
    setUpscaling(true);
    setMessages((prev) => [...prev, { role: 'assistant', text: t.upscaling }]);
    try {
      const r = await fetch('/api/ai/upscale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: url, scale: 2 }), credentials: 'include' });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') next[next.length - 1] = j.success && j.url ? { role: 'assistant', text: '', imageUrl: j.url } : { role: 'assistant', text: `⚠️ ${j.error || t.upscaleFailed}` };
        return next;
      });
    } catch {
      setMessages((prev) => { const next = [...prev]; const last = next[next.length - 1]; if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.upscaleFailed}` }; return next; });
    }
    setUpscaling(false);
  }, [upscaling, t.upscaling, t.upscaleFailed]);

  return (
    <div
      className="relative mx-auto flex h-full w-full max-w-3xl flex-col px-4 pt-2 text-app-text"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {/* Chat-history button — opens the list of past conversations (resume/delete). */}
      <button
        type="button"
        onClick={openHistory}
        aria-label={t.historyTitle}
        title={t.historyTitle}
        className="hidden"
      >
        <History size={13} /> <span className="hidden sm:inline">{t.historyTitle}</span>
      </button>
      <div
        ref={feedRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 160);
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3 pt-1"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
            <div className="space-y-1.5">
              <h2 className="text-[22px] font-semibold tracking-tight text-app-text">{t.greeting}</h2>
              <p className="mx-auto max-w-sm text-[13.5px] text-app-muted">{t.empty}</p>
            </div>
            {/* Tappable first-run examples — borderless, minimal. Pre-fill the
                composer (never auto-send); the user reviews then presses send. */}
            <div className="flex w-full max-w-md flex-col gap-1.5">
              {(STARTERS[locale] ?? STARTERS.ka).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setMode(s.mode); setInput(s.prompt); }}
                  className="group flex items-center gap-3 rounded-2xl bg-app-elevated/60 px-4 py-3 text-left text-[13.5px] text-app-text transition-colors hover:bg-app-elevated active:scale-[0.99] motion-reduce:active:scale-100"
                >
                  <span className="shrink-0 text-app-muted transition-colors group-hover:text-app-accent">
                    {s.icon === 'image' ? <ImageIcon size={16} /> : s.icon === 'film' ? <Film size={16} /> : s.icon === 'music' ? <Music2 size={16} /> : s.icon === 'spark' ? <Sparkles size={16} /> : <MessageSquare size={16} />}
                  </span>
                  <span className="flex-1">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`text-[14.5px] leading-relaxed ${
              m.role === 'user'
                ? 'max-w-[85%] rounded-2xl bg-app-elevated px-4 py-2.5 text-app-text'
                : 'w-full max-w-full text-app-text'
            }`}>
              {m.medias && m.medias.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.medias.map((md, mi) => (
                    isImage(md.mimeType) ? (
                      <button key={mi} type="button" onClick={() => setLightbox(md.dataUrl)} className="block cursor-zoom-in" aria-label="open fullscreen">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={md.dataUrl} alt="attachment" className="max-h-44 rounded-lg" />
                      </button>
                    ) : isVideo(md.mimeType) ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video key={mi} src={md.dataUrl} controls className="max-h-44 rounded-lg" />
                    ) : isAudio(md.mimeType) ? (
                      <audio key={mi} src={md.dataUrl} controls className="w-full" />
                    ) : (
                      <span key={mi} className="inline-flex items-center gap-1.5 rounded-lg bg-app-elevated px-2 py-1 text-[11px] text-app-muted"><FileText size={12} /> document</span>
                    )
                  ))}
                </div>
              )}
              {m.imageUrl && (
                <div className="space-y-1.5">
                  <button type="button" onClick={() => setLightbox(m.imageUrl!)} className="block w-full cursor-zoom-in" aria-label="open fullscreen">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.imageUrl} alt="generated" className="max-h-96 w-full rounded-xl object-contain ring-1 ring-app-border/10 transition-opacity hover:opacity-90" />
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void dl(m.imageUrl!, 'myavatar-image.png')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                    >
                      <Download size={13} /> {t.imgDownload}
                    </button>
                    <button type="button" onClick={() => void share(m.imageUrl!, 'myavatar-image.png')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98]">
                      <Share2 size={13} /> {t.share}
                    </button>
                    <button type="button" onClick={() => void upscale(m.imageUrl!)} disabled={upscaling}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40">
                      <Sparkles size={13} /> {t.upscaleBtn}
                    </button>
                    {m.regen && (
                      <button type="button" onClick={() => void regenerate(m.regen!)} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40">
                        <RotateCcw size={13} /> {t.regenerate}
                      </button>
                    )}
                    {/* Edit → load this image as the img2img source. */}
                    <button type="button" onClick={() => startImageEdit(m.imageUrl!)} disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40">
                      <Pencil size={13} /> {t.editImage}
                    </button>
                  </div>
                </div>
              )}
              {m.batch && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {m.batch.tiles.map((tile, k) => (
                      <div key={k} className="relative overflow-hidden rounded-xl bg-app-elevated/40 ring-1 ring-app-border/10" style={{ aspectRatio: m.batch!.spec.aspect.replace(':', '/') }}>
                        {tile.status === 'done' && tile.url ? (
                          <button type="button" onClick={() => setLightbox(tile.url!)} className="block h-full w-full cursor-zoom-in" aria-label="open fullscreen">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={tile.url} alt="variation" className="h-full w-full object-cover transition-opacity hover:opacity-90" />
                          </button>
                        ) : tile.status === 'failed' ? (
                          <div className="flex h-full w-full items-center justify-center text-app-danger/70"><X size={18} /></div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-app-muted/50"><Loader2 size={18} className="animate-spin" /></div>
                        )}
                      </div>
                    ))}
                  </div>
                  {!m.batch.tiles.some((tl) => tl.status === 'pending') && (
                    <button type="button" onClick={() => void runImageBatch(m.batch!.spec, m.batch!.tiles.length)} disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40">
                      <RotateCcw size={13} /> {t.regenerate}
                    </button>
                  )}
                </div>
              )}
              {m.audioUrl && (
                <div className="w-[min(82vw,360px)] overflow-hidden rounded-2xl bg-app-elevated/50 p-3">
                  {/* Polished Suno-style player (album art + play/scrub/time). */}
                  <TrackPlayer url={m.audioUrl} coverUrl={m.coverUrl} label={t.modeMusic} />
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void dl(m.audioUrl!, 'myavatar-track.mp3')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                    >
                      <Download size={13} /> {t.imgDownload}
                    </button>
                    <button type="button" onClick={() => void share(m.audioUrl!, 'myavatar-track.mp3')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98]">
                      <Share2 size={13} /> {t.share}
                    </button>
                    {m.regen && (
                      <button type="button" onClick={() => void regenerate(m.regen!)} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40">
                        <RotateCcw size={13} /> {t.regenerate}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {m.videoUrl && (
                <div className="space-y-1.5">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  {/* #t=0.1 makes the browser paint a real frame as the poster (not a
                      black box); preload=metadata forces that frame to load up front. */}
                  <video src={`${m.videoUrl}#t=0.1`} poster={m.coverUrl || undefined} controls playsInline preload="metadata" className="max-h-96 w-full rounded-xl bg-black/90 ring-1 ring-app-border/10" />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void dl(m.videoUrl!, 'myavatar-video.mp4')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                    >
                      <Download size={13} /> {t.imgDownload}
                    </button>
                    <button type="button" onClick={() => void share(m.videoUrl!, 'myavatar-video.mp4')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98]">
                      <Share2 size={13} /> {t.share}
                    </button>
                  </div>
                  {/* Remix — re-render ONLY the edited scene, reuse the rest. Only
                      shown once the film captured its landed clips + brief. */}
                  {m.filmClips && m.filmClips.length > 0 && (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <input
                        type="text"
                        value={remixDrafts[i] ?? ''}
                        onChange={(e) => setRemixDrafts((d) => ({ ...d, [i]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void remixFilm(i); } }}
                        placeholder={t.remixPlaceholder}
                        disabled={remixBusyIdx !== null}
                        className="min-w-0 flex-1 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] text-app-text outline-none ring-1 ring-app-border/15 placeholder:text-app-muted/50 focus:ring-app-accent/40 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => void remixFilm(i)}
                        disabled={remixBusyIdx !== null || !(remixDrafts[i] ?? '').trim()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                      >
                        {remixBusyIdx === i ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} {t.remix}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {(() => {
                const pending = busy && m.role === 'assistant' && i === messages.length - 1 && !m.imageUrl && !m.audioUrl && !m.videoUrl && !m.batch;
                // Generative modes get the live staged progress card (bar + clock +
                // narrated steps) — the real "loading process". Chat gets typing dots.
                if (pending && (mode !== 'chat' || (m.storyboard?.length ?? 0) > 0)) {
                  // Pace the image bar to the chosen resolution (1K ≈ 40s · 2K ≈
                  // 170s · 4K ≈ 220s) so it doesn't sit at 95% looking stuck.
                  const imgTarget = imgQuality === 'standard' ? 42 : imgQuality === 'high' ? 170 : 215;
                  // Prefer the kind stamped on the message at render-start (intrinsic),
                  // so a mid-render mode switch can't swap the wrong progress UI in.
                  const kind: 'image' | 'music' | 'video' | 'lipsync' = m.genKind ?? ((m.storyboard?.length ?? 0) > 0 ? 'video' : (mode as 'image' | 'music' | 'video' | 'lipsync'));
                  return (
                    // Explicit vertical stack — the storyboard grid sits ABOVE the
                    // Director's Console and the two can never overlap (no absolute/
                    // fixed positioning, no shared z-index).
                    <div className="flex flex-col gap-3">
                      {/* Storyboard frames stay in view during the ~7-min render. */}
                      {m.storyboard && m.storyboard.length > 0 && (
                        <div className="grid w-[min(88vw,460px)] grid-cols-3 gap-1.5">
                          {m.storyboard.map((s) => (
                            <div key={s.ordinal} className={`relative overflow-hidden rounded-lg ${videoOrientation === 'vertical' ? 'aspect-[9/16]' : 'aspect-video'} bg-app-border/10 ring-1 ring-app-border/10`}>
                              <StoryboardFrame url={s.frameUrl} label={`${t.sbScene} ${s.ordinal}`} onZoom={setLightbox} />
                              <span className="absolute left-1 top-1 z-10 rounded bg-black/60 px-1 text-[9px] font-medium text-white">{s.ordinal}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {kind === 'video' ? (
                        // The Master-Prompt Director's Console — the 9-agent crew,
                        // live, driven by the real film-pipeline matrix.
                        <FilmDirectorConsole roster={m.filmRoster} log={m.filmLog} statusText={m.text} elapsed={elapsed} targetSec={PROGRESS_TARGET.video} locale={locale} />
                      ) : (
                        <GenerationProgress kind={kind} elapsed={elapsed} status={m.text} locale={locale} targetSec={kind === 'image' ? imgTarget : undefined} />
                      )}
                    </div>
                  );
                }
                if (pending && mode === 'chat' && !m.text) return <TypingDots />;
                if (!m.text) return null;
                // Inline edit mode for a user turn → textarea + Send/Cancel.
                if (m.role === 'user' && editingIdx === i) {
                  return (
                    <div className="space-y-1.5">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } else if (e.key === 'Escape') cancelEdit(); }}
                        className="w-[min(70vw,420px)] max-w-full resize-none rounded-xl bg-app-surface px-3 py-2 text-[14.5px] text-app-text outline-none ring-1 ring-app-accent/40"
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={cancelEdit} className="rounded-full px-3 py-1.5 text-[12px] font-medium text-app-muted transition-colors hover:text-app-text">{locale === 'en' ? 'Cancel' : locale === 'ru' ? 'Отмена' : 'გაუქმება'}</button>
                        <button type="button" onClick={saveEdit} disabled={!editText.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-40">{locale === 'en' ? 'Send' : locale === 'ru' ? 'Отправить' : 'გაგზავნა'}</button>
                      </div>
                    </div>
                  );
                }
                // Assistant replies render as rich markdown (bold · lists · code ·
                // links · tables); the user's own text stays verbatim.
                return m.role === 'assistant'
                  ? (
                    <>
                      {typeof m.videoProgress === 'number' && !m.videoUrl && (
                        <div className="mb-2 h-1.5 w-[min(80vw,340px)] overflow-hidden rounded-full bg-app-border/20">
                          <div className="h-full rounded-full bg-app-accent transition-[width] duration-700 ease-out" style={{ width: `${Math.max(4, m.videoProgress)}%` }} />
                        </div>
                      )}
                      <Markdown>{m.text}</Markdown>
                    </>
                  )
                  : <span className="whitespace-pre-wrap">{m.text}</span>;
              })()}
              {/* Edit a user turn → re-run the chat from here (drops later turns). */}
              {m.role === 'user' && m.text && editingIdx !== i && !busy && (
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => startEdit(i)}
                    aria-label={locale === 'en' ? 'Edit' : locale === 'ru' ? 'Изменить' : 'რედაქტირება'}
                    title={locale === 'en' ? 'Edit' : locale === 'ru' ? 'Изменить' : 'რედაქტირება'}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-app-muted/70 transition-colors hover:bg-app-border/15 hover:text-app-accent"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              )}
              {/* Per-response actions on a TEXT reply — Read-aloud + Copy. No
                  Like/Dislike, per the one-window spec. */}
              {m.role === 'assistant' && m.text && !m.text.startsWith('⚠️') && !m.text.startsWith('⏹') && (
                <div className="mt-1 flex items-center gap-0.5 text-app-muted">
                  <button
                    type="button"
                    onClick={() => void speakMsg(m.text, i)}
                    aria-label={locale === 'en' ? 'Read aloud' : locale === 'ru' ? 'Озвучить' : 'ხმამაღლა წაკითხვა'}
                    title={locale === 'en' ? 'Read aloud' : locale === 'ru' ? 'Озвучить' : 'ხმამაღლა წაკითხვა'}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-app-elevated hover:text-app-accent ${speakingIdx === i ? 'text-app-accent' : ''}`}
                  >
                    {speakingIdx === i
                      ? (speakPhase === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />)
                      : <Volume2 size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyMsg(m.text, i)}
                    aria-label={locale === 'en' ? 'Copy' : locale === 'ru' ? 'Копировать' : 'კოპირება'}
                    title={locale === 'en' ? 'Copy' : locale === 'ru' ? 'Копировать' : 'კოპირება'}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-app-elevated hover:text-app-accent ${copiedIdx === i ? 'text-app-accent' : ''}`}
                  >
                    {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => rateMsg(i, 'up', m.text)}
                    aria-label={locale === 'en' ? 'Good response' : locale === 'ru' ? 'Хороший ответ' : 'კარგი პასუხი'}
                    title={locale === 'en' ? 'Good response' : locale === 'ru' ? 'Хороший ответ' : 'კარგი პასუხი'}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-app-elevated hover:text-app-accent ${ratedIdx[i] === 'up' ? 'text-app-accent' : ''}`}
                  >
                    <ThumbsUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => rateMsg(i, 'down', m.text)}
                    aria-label={locale === 'en' ? 'Bad response' : locale === 'ru' ? 'Плохой ответ' : 'ცუდი პასუხი'}
                    title={locale === 'en' ? 'Bad response' : locale === 'ru' ? 'Плохой ответ' : 'ცუდი პასუხი'}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-app-elevated hover:text-app-accent ${ratedIdx[i] === 'down' ? 'text-app-accent' : ''}`}
                  >
                    <ThumbsDown size={13} />
                  </button>
                  {i === messages.length - 1 && !busy && (
                    <button
                      type="button"
                      onClick={() => regenerateChat()}
                      aria-label={t.regenerate}
                      title={t.regenerate}
                      className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-app-elevated hover:text-app-accent"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              )}
              {/* Retry — the last reply errored; re-run the same turn cleanly. */}
              {m.role === 'assistant' && i === messages.length - 1 && !busy && m.text.startsWith('⚠️') && (
                <button
                  type="button"
                  onClick={() => regenerateChat()}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98]"
                >
                  <RotateCcw size={13} /> {t.regenerate}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Scroll-to-bottom — appears only when the user has scrolled up. */}
      {showJump && messages.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          aria-label={t.scrollDown}
          title={t.scrollDown}
          className="absolute left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-app-border/15 bg-app-surface text-app-text shadow-lg backdrop-blur transition-colors hover:text-app-accent"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 104px)' }}
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* Composer — refined, Gemini-style: one rounded pill, [+] attach, an inline
          mode selector (the "Flash ⌄" analog) and mic-when-empty / send-when-typing. */}
      <div className="shrink-0 pt-1">
        {/* Per-service options. On MOBILE they collapse behind this toggle so the chat is
            never covered and the input stays reachable; on desktop (sm:) they're always
            open. When open on mobile they're capped to 45vh and scroll internally. */}
        {mode !== 'chat' && (
          <button type="button" onClick={() => setOptionsOpen((v) => !v)} aria-expanded={optionsOpen}
            className="mb-2 flex w-full items-center justify-between rounded-xl border border-app-border/12 bg-app-elevated/40 px-3 py-2 text-[12.5px] font-semibold text-app-text transition active:scale-[0.99] sm:hidden">
            <span className="inline-flex items-center gap-1.5"><Sparkles size={14} className="text-app-accent" /> {locale === 'en' ? 'Options' : locale === 'ru' ? 'Опции' : 'პარამეტრები'}</span>
            <ChevronDown size={16} className={`text-app-muted transition-transform ${optionsOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
        <div className={`${optionsOpen ? 'max-h-[45vh] overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'hidden'} sm:block sm:max-h-none sm:overflow-visible`}>
        {/* IMAGE — dedicated card panel: aspect (visual previews) · count · quality · style */}
        {mode === 'image' && (
          <div className="mb-2 space-y-2">
            <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">📐 {locale === 'en' ? 'Aspect ratio' : locale === 'ru' ? 'Соотношение' : 'პროპორცია'}</span>
              <div className="flex items-end gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {IMG_ASPECTS.map((a) => {
                  const [aw, ah] = a.split(':').map(Number) as [number, number];
                  const max = 26;
                  const bw = aw >= ah ? max : Math.round((max * aw) / ah);
                  const bh = ah >= aw ? max : Math.round((max * ah) / aw);
                  const on = imgAspect === a;
                  return (
                    <button key={a} type="button" onClick={() => setImgAspect(a)} aria-label={a} className="flex shrink-0 flex-col items-center gap-1 transition active:scale-95">
                      <span className="flex h-7 w-7 items-center justify-center">
                        <span className={`block rounded-[2px] border-2 transition-colors ${on ? 'border-app-accent bg-app-accent/25' : 'border-app-border/40'}`} style={{ width: bw, height: bh }} />
                      </span>
                      <span className={`text-[10px] font-medium ${on ? 'text-app-accent' : 'text-app-muted'}`}>{a}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🔢 {locale === 'en' ? 'Count' : locale === 'ru' ? 'Количество' : 'რაოდენობა'}</span>
                <div className="flex gap-1.5">
                  {([1, 2, 4] as const).map((n) => <Chip key={n} active={imgCount === n} onClick={() => setImgCount(n)}>{n === 1 ? '1' : `×${n}`}</Chip>)}
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">⚡ {locale === 'en' ? 'Quality' : locale === 'ru' ? 'Качество' : 'ხარისხი'}</span>
                <div className="flex flex-wrap gap-1.5">
                  {IMG_QUALITIES.map(([q, lbl]) => <Chip key={q} active={imgQuality === q} onClick={() => setImgQuality(q)}>{lbl}</Chip>)}
                </div>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎨 {locale === 'en' ? 'Style' : locale === 'ru' ? 'Стиль' : 'სტილი'}</span>
              <div className="flex flex-wrap gap-1.5">
                {IMG_STYLES.map((s) => <Chip key={s} active={imgStyle === s} onClick={() => setImgStyle(s)}>{s}</Chip>)}
              </div>
            </div>
          </div>
        )}

        {/* LIPSYNC — dedicated card panel: character photo (+ hint) · voice */}
        {mode === 'lipsync' && (
          <div className="mb-2 space-y-2">
            <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🧑 {locale === 'en' ? 'Character photo' : locale === 'ru' ? 'Фото персонажа' : 'პერსონაჟის ფოტო'}</span>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${attachments.some((a) => isImage(a.mimeType) || isVideo(a.mimeType)) ? 'bg-app-accent text-app-bg' : 'bg-app-bg/50 text-app-text ring-1 ring-app-border/20 hover:bg-app-bg/70'}`}>
                  <Upload size={13} /> {attachments.some((a) => isImage(a.mimeType) || isVideo(a.mimeType)) ? (locale === 'en' ? 'Photo ✓' : locale === 'ru' ? 'Фото ✓' : 'ფოტო ✓') : (locale === 'en' ? 'Attach' : locale === 'ru' ? 'Прикрепить' : 'მიამაგრე')}
                </button>
              </div>
              <span className="block text-[11px] leading-relaxed text-app-muted">{locale === 'en' ? 'Attach a face photo, then type what it should say below — the photo speaks it.' : locale === 'ru' ? 'Прикрепите фото лица, затем введите текст ниже — фото это произнесёт.' : 'მიამაგრე სახის ფოტო და ქვემოთ ჩაწერე ტექსტი — ფოტო ალაპარაკდება.'}</span>
            </div>
            {(attachments.some((a) => isAudio(a.mimeType)) || hasTrainedVoice) && (
              <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎙 {locale === 'en' ? 'Voice' : locale === 'ru' ? 'Голос' : 'ხმა'}</span>
                <div className="flex flex-wrap gap-1.5">
                  {attachments.some((a) => isAudio(a.mimeType)) && (
                    <Chip active onClick={() => fileRef.current?.click()}>🎵 {t.lipAudioLabel} ✓</Chip>
                  )}
                  {hasTrainedVoice && (
                    <Chip active={lipMyVoice} onClick={() => setLipMyVoice((v) => !v)}>🎤 {locale === 'en' ? 'My voice' : locale === 'ru' ? 'Мой голос' : 'ჩემი ხმით'}</Chip>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIDEO — a clear, labeled control panel so every setting has an obvious place:
            character · what they say · length · music · voice · effects · format. */}
        {mode === 'video' && (
          <div className="mb-2 space-y-2">
            {/* 1 · Character */}
            <div className="rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🧑 {locale === 'en' ? 'Character' : locale === 'ru' ? 'Персонаж' : 'პერსონაჟი'}</span>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${attachments.some((a) => isImage(a.mimeType)) ? 'bg-app-accent text-app-bg' : 'bg-app-bg/50 text-app-text ring-1 ring-app-border/20 hover:bg-app-bg/70'}`}>
                  <Upload size={13} /> {attachments.some((a) => isImage(a.mimeType)) ? t.charPhotoOn : t.charPhoto}
                </button>
              </div>
            </div>

            {/* 2 · Dialogue */}
            <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🗣 {locale === 'en' ? 'What the character says' : locale === 'ru' ? 'Что говорит персонаж' : 'რას ამბობს პერსონაჟი'}</span>
              <textarea value={videoSpeech} onChange={(e) => setVideoSpeech(e.target.value)} rows={2}
                placeholder={locale === 'en' ? 'Type the dialogue — spoken verbatim (empty = auto)…' : locale === 'ru' ? 'Введите реплику — произнесётся дословно (пусто = авто)…' : 'ჩაწერე რას იტყვის — ზუსტად ისე ილაპარაკებს (ცარიელი = ავტომატური)…'}
                className="w-full resize-none rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[12.5px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted/45 focus:border-app-accent/60 focus:bg-app-bg/70 focus:ring-2 focus:ring-app-accent/25" />
            </div>

            {/* 3 · Length + Format, side by side */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">⏱ {locale === 'en' ? 'Length' : locale === 'ru' ? 'Длина' : 'ხანგრძლივობა'}</span>
                <div className="flex gap-1.5">
                  <Chip active={videoDuration === 10} onClick={() => setVideoDuration(10)}>10{locale === 'en' ? 's' : 'წმ'}</Chip>
                  <Chip active={videoDuration === 30} onClick={() => setVideoDuration(30)}>30{locale === 'en' ? 's' : 'წმ'}</Chip>
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">📐 {locale === 'en' ? 'Format' : locale === 'ru' ? 'Формат' : 'ფორმატი'}</span>
                <div className="flex items-end gap-3">
                  <button type="button" onClick={() => setVideoOrientation('landscape')} aria-label="16:9" className="flex flex-col items-center gap-1 transition active:scale-95">
                    <span className={`block rounded-[3px] border-2 transition-colors ${videoOrientation === 'landscape' ? 'border-app-accent bg-app-accent/25' : 'border-app-border/40'}`} style={{ width: 38, height: 22 }} />
                    <span className={`text-[10.5px] font-medium ${videoOrientation === 'landscape' ? 'text-app-accent' : 'text-app-muted'}`}>16:9</span>
                  </button>
                  <button type="button" onClick={() => setVideoOrientation('vertical')} aria-label="9:16" className="flex flex-col items-center gap-1 transition active:scale-95">
                    <span className={`block rounded-[3px] border-2 transition-colors ${videoOrientation === 'vertical' ? 'border-app-accent bg-app-accent/25' : 'border-app-border/40'}`} style={{ width: 22, height: 38 }} />
                    <span className={`text-[10.5px] font-medium ${videoOrientation === 'vertical' ? 'text-app-accent' : 'text-app-muted'}`}>9:16</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 4 · Music & voice */}
            <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎵 {locale === 'en' ? 'Music & voice' : locale === 'ru' ? 'Музыка и голос' : 'მუსიკა და ხმა'}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip active={videoMusic} onClick={() => setVideoMusic(true)}>{locale === 'en' ? 'Music on' : locale === 'ru' ? 'Музыка вкл' : 'მუსიკა ჩართ.'}</Chip>
                <Chip active={!videoMusic} onClick={() => setVideoMusic(false)}>{locale === 'en' ? 'Off' : locale === 'ru' ? 'Выкл' : 'გამორთ.'}</Chip>
                <span className="mx-1 h-4 w-px bg-app-border/15" />
                <Chip active={videoNarration} onClick={() => setVideoNarration((v) => !v)}>🎙 {t.narration}</Chip>
                {hasTrainedVoice && (
                  <Chip active={videoMyVoiceNarration} onClick={() => setVideoMyVoiceNarration((v) => !v)}>🎤 {locale === 'en' ? 'My voice' : locale === 'ru' ? 'Мой голос' : 'ჩემი ხმით'}</Chip>
                )}
              </div>
            </div>

            {/* 5 · Effect & transition */}
            <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">✨ {locale === 'en' ? 'Effect & transition' : locale === 'ru' ? 'Эффект и переход' : 'ეფექტი და გადასვლა'}</span>
              <div className="flex flex-wrap gap-1.5">
                {VIDEO_STYLES.map((s) => <Chip key={s} active={videoStyle === s} onClick={() => setVideoStyle(s)}>{s}</Chip>)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <Chip active={videoTransition === 'crossfade'} onClick={() => setVideoTransition('crossfade')}>⤫ {t.transCrossfade}</Chip>
                <Chip active={videoTransition === 'cut'} onClick={() => setVideoTransition('cut')}>▮ {t.transCut}</Chip>
              </div>
            </div>
          </div>
        )}

        {/* FAITHFUL trained voice (RVC) — train once right here in chat, then sing in
            your REAL voice. No page jump; the whole service lives in this chatbox. */}
        {mode === 'music' && (
          <div className="mb-2 space-y-2">
            {/* Style — instrumental/vocal + genre, in one clearly-labelled section */}
            <div className="space-y-2 rounded-xl border border-app-border/12 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎚 {locale === 'en' ? 'Style' : locale === 'ru' ? 'Стиль' : 'სტილი'}</span>
              <div className="flex gap-1.5">
                <Chip active={musicInstrumental} onClick={() => setMusicInstrumental(true)}>{t.instrumental}</Chip>
                <Chip active={!musicInstrumental} onClick={() => setMusicInstrumental(false)}>{t.withVocals}</Chip>
              </div>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {MUSIC_GENRES.map((g) => <Chip key={g} active={musicGenre === g} onClick={() => setMusicGenre(g)}>{g}</Chip>)}
              </div>
            </div>
            <VoiceTrainer lang={locale} onReady={setHasTrainedVoice} />
            {/* Once trained: type lyrics + ONE button that GENERATES in your voice — no
                confusing toggle, no separate send. Pressing it creates the song. */}
            {hasTrainedVoice && (
              <div className="space-y-2 rounded-xl border border-app-accent/30 bg-app-accent/[0.06] p-3">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-app-accent">
                  <Check size={13} /> {t.myVoiceReady}
                </div>
                <textarea
                  value={musicLyrics}
                  onChange={(e) => setMusicLyrics(e.target.value)}
                  rows={3}
                  placeholder={t.myVoiceLyricsPh}
                  className="w-full resize-none rounded-lg border border-app-border/15 bg-app-bg/40 px-3 py-2 text-[13px] text-app-text outline-none transition-colors placeholder:text-app-muted/50 focus:border-app-accent/50 focus:bg-app-bg/70"
                />
                <button type="button" onClick={() => void writeLyrics()} disabled={writingLyrics} className="inline-flex w-fit items-center gap-1.5 rounded-full border border-app-border/20 px-3 py-1 text-[11px] font-medium text-app-muted transition-colors hover:bg-app-elevated hover:text-app-accent disabled:opacity-40">
                  {writingLyrics ? <Loader2 size={11} className="animate-spin" /> : null} {t.writeLyricsBtn}
                </button>
                <button type="button" onClick={() => void send({ forceMyVoice: true })} disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent px-4 py-3 text-[14px] font-bold text-app-bg shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <>🎤 {t.myVoiceCreate}</>}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Custom lyrics — the exact sung words. Shown for vocal tracks AND when singing
            with the trained voice (the lyrics are what your voice will sing). */}
        {mode === 'music' && (() => {
          const trained = useMyVoice && hasTrainedVoice;
          if (musicInstrumental && !trained) return null;
          return (
            <div className="mb-2 space-y-1.5">
              <textarea
                value={musicLyrics}
                onChange={(e) => setMusicLyrics(e.target.value)}
                rows={2}
                placeholder={trained ? t.voiceLyricsPlaceholder : t.lyricsPlaceholder}
                className="w-full resize-none rounded-xl bg-app-elevated/60 px-3 py-2 text-[13px] text-app-text outline-none transition-colors placeholder:text-app-muted/60 focus:bg-app-elevated"
              />
              <button type="button" onClick={() => void writeLyrics()} disabled={writingLyrics} className="inline-flex items-center gap-1.5 rounded-full border border-app-border/15 px-3 py-1 text-[11px] font-medium text-app-muted transition-colors hover:bg-app-elevated hover:text-app-accent disabled:opacity-40">
                {writingLyrics ? <Loader2 size={11} className="animate-spin" /> : null} {t.writeLyricsBtn}
              </button>
            </div>
          );
        })()}

        </div>{/* /collapsible options */}

        {/* Attachment previews — up to MAX_ATTACHMENTS files / images / a video,
            each removable. They ride with the next message (text + files together). */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a, ai) => (
              <div key={ai} className="relative">
                {isImage(a.mimeType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.dataUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-app-surface text-app-accent">
                    {isVideo(a.mimeType) ? <Film size={18} /> : isAudio(a.mimeType) ? <Music2 size={18} /> : <FileText size={18} />}
                  </span>
                )}
                <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, k) => k !== ai))} aria-label="remove"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/15 hover:text-app-text"><X size={11} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Input surface — one clean rounded pill. The picker accepts MULTIPLE files
            (images / video / audio / pdf), capped at MAX_ATTACHMENTS. */}
        <input ref={fileRef} type="file" multiple accept="image/*,audio/*,video/*,application/pdf" className="hidden" onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) {
            files.forEach((f) => {
              const r = new FileReader();
              r.onload = () => setAttachments((prev) => prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { dataUrl: String(r.result), mimeType: f.type || 'application/octet-stream' }]);
              r.readAsDataURL(f);
            });
          }
          e.target.value = '';
        }} />
        <div className="rounded-[24px] bg-app-elevated px-3 py-2">
          {/* Full-width prompt on its own line — a long prompt is never squeezed into a
              narrow column by the controls (the old single-row pill did exactly that). */}
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={1}
            disabled={enhancing}
            placeholder={recording ? t.recording : mode === 'image' ? t.imgPlaceholder : mode === 'music' ? t.musicPlaceholder : mode === 'video' ? t.videoPlaceholder : mode === 'lipsync' ? t.lipsyncPlaceholder : t.placeholder}
            className="max-h-40 min-h-[28px] w-full resize-none border-0 bg-transparent px-1 py-1.5 text-[16px] text-app-text placeholder:text-app-muted/70 outline-none focus:ring-0 disabled:opacity-60"
          />

          {/* Controls row — attach · mode selector · (spacer) · mic/stop/send. */}
          <div className="mt-1 flex items-center gap-1">
            {/* [+] add / attach */}
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={t.attachHint} title={t.attachHint}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-text">
              <Plus size={20} />
            </button>

            {/* Inline mode selector — the "Flash ⌄" analog. Tap to pick what to create. */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setModeMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={modeMenuOpen}
                className="flex h-9 items-center gap-1 rounded-full bg-app-surface/60 px-2.5 text-[12.5px] font-medium text-app-muted transition-colors hover:bg-app-surface hover:text-app-text"
              >
                <ActiveModeIcon size={15} />
                <span>{t[activeModeKey]}</span>
                <ChevronDown size={13} className={`transition-transform ${modeMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {modeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setModeMenuOpen(false)} />
                  <div role="menu" className="absolute bottom-full left-0 z-20 mb-2 w-48 overflow-hidden rounded-2xl border border-app-border/10 bg-app-surface p-1 shadow-2xl">
                    {MODES.map(({ id, Icon, key: lk }) => (
                      <button
                        key={id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={mode === id}
                        onClick={() => { setMode(id); setModeMenuOpen(false); }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors ${mode === id ? 'bg-app-accent/10 text-app-accent' : 'text-app-text hover:bg-app-elevated'}`}
                      >
                        <Icon size={15} /> <span className="flex-1 text-left">{t[lk]}</span> {mode === id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex-1" />

            {/* Right action: Stop while busy · Wand+Send when there's something to send ·
                Mic otherwise (record voice). Mirrors Gemini's mic↔send swap. */}
            {busy ? (
              <button type="button" onClick={stop} aria-label={t.stop} title={t.stop}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-surface text-app-text transition-colors hover:text-app-accent">
                <Square size={15} className="fill-current" />
              </button>
            ) : recording ? (
              // While dictating, a STOP that never disappears — even as live text
              // arrives — so recording is always controllable.
              <button type="button" onClick={() => void toggleMic()} aria-label={t.stop} title={t.stop}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full animate-pulse bg-app-danger/15 text-app-danger">
                <Square size={16} />
              </button>
            ) : (
              <>
                {/* Mic stays available even with text in the box — tap again to keep
                    dictating / continue where you left off. */}
                <button type="button" onClick={() => void toggleMic()} aria-label={t.micHint} title={t.micHint}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-text">
                  <Mic size={19} />
                </button>
                {input.trim() && (
                  <button type="button" onClick={() => void magicEnhance()} disabled={enhancing} aria-label={t.magicHint} title={t.magicHint}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-accent disabled:opacity-40">
                    {enhancing ? <Loader2 size={18} className="animate-spin text-app-accent" /> : <Wand2 size={18} />}
                  </button>
                )}
                {canSend && (
                  <button type="button" onClick={() => void send()} aria-label="send"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg transition-opacity hover:opacity-90">
                    <Send size={17} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* All full-screen overlays portal to document.body so they render above
          root-level chrome (the cookie banner) instead of being trapped in the chat
          shell's lower stacking context. */}
      <Portal>
      {/* Transient "link copied" toast — only shows when a share falls back to clipboard. */}
      {shareToast && (
        <div
          className="pointer-events-none fixed inset-x-0 z-[110] mx-auto flex w-fit items-center gap-2 rounded-full bg-app-elevated px-4 py-2 text-[13px] font-medium text-app-text shadow-lg ring-1 ring-app-border/20"
          style={{ bottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 5rem))' }}
        >
          <Check size={14} className="text-app-accent" /> {shareToast}
        </div>
      )}
      {/* Full-screen image lightbox — tap any chat image to open it edge-to-edge.
          Backdrop tap / the X button / Esc all close it; the picture itself swallows
          the click so it stays open while you inspect it. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="close"
            className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="fullscreen"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[96vw] rounded-lg object-contain"
          />
          <div
            className="absolute inset-x-0 mx-auto flex w-fit items-center gap-2"
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => void dl(lightbox, 'myavatar-image.png')}
              className="inline-flex w-fit items-center gap-1.5 rounded-full bg-app-accent px-4 py-2 text-[13px] font-semibold text-app-bg backdrop-blur"
            >
              <Download size={14} /> {t.imgDownload}
            </button>
            <button
              type="button"
              onClick={() => void share(lightbox, 'myavatar-image.png')}
              className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              <Share2 size={14} /> {t.share}
            </button>
            <button
              type="button"
              onClick={() => startImageEdit(lightbox)}
              className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              <Pencil size={14} /> {t.editImage}
            </button>
          </div>
        </div>
      )}

      {/* Storyboard — generating the plan + 6 frames (cancellable). */}
      {storyboardBusy && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-app-bg/95 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold tracking-tight text-app-text">🎬 {t.sbTitle}</h2>
                <p className="flex items-center gap-1.5 text-[12px] text-app-accent">
                  <Loader2 size={12} className="animate-spin" /> {t.sbCreating}
                  <span className="tabular-nums text-app-muted">· {Math.min(95, Math.round((1 - Math.exp(-elapsed / 62)) * 100))}% · {fmtClock(elapsed)}</span>
                </p>
              </div>
              <button type="button" onClick={() => { try { storyboardAbortRef.current?.abort(); } catch { /* noop */ } setStoryboardBusy(false); }} aria-label={t.sbCancel} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
                <X size={18} />
              </button>
            </div>
            {/* Live progress bar — pace ~150s (the real storyboard build) toward 95%. */}
            <div className="mx-4 mb-1 h-1 overflow-hidden rounded-full bg-app-border/15">
              <div className="h-full rounded-full bg-app-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.max(5, Math.min(95, Math.round((1 - Math.exp(-elapsed / 62)) * 100)))}%` }} />
            </div>
            {/* Skeleton preview of the 6 scenes being built — staggered shimmer so it
                feels like the storyboard is materialising, not a blank spinner. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: Math.max(2, Math.min(6, Math.round(videoDuration / 5))) }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-app-border/10 bg-app-elevated">
                    <div className={`relative ${videoOrientation === 'vertical' ? 'aspect-[9/16]' : 'aspect-video'} animate-pulse bg-gradient-to-br from-app-border/20 via-app-border/8 to-app-border/15`} style={{ animationDelay: `${i * 140}ms` }}>
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white/75">{t.sbScene} {i + 1}</span>
                      <div className="absolute inset-0 flex items-center justify-center"><ImageIcon size={20} className="text-app-muted/25" /></div>
                    </div>
                    <div className="space-y-1.5 p-2">
                      <div className="h-2.5 w-3/4 animate-pulse rounded bg-app-border/25" style={{ animationDelay: `${i * 140}ms` }} />
                      <div className="h-2 w-full animate-pulse rounded bg-app-border/15" style={{ animationDelay: `${i * 140 + 70}ms` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-app-border/10 px-4 py-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
              <button type="button" onClick={() => { try { storyboardAbortRef.current?.abort(); } catch { /* noop */ } setStoryboardBusy(false); }} className="w-full rounded-full bg-app-elevated px-4 py-2.5 text-[13px] font-medium text-app-muted transition-colors hover:text-app-text">
                {t.sbCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Storyboard — review the scenes/frames, then approve → render. */}
      {storyboard && !storyboardBusy && (
        <StoryboardOverlay
          sb={storyboard}
          t={t}
          busy={busy}
          regenningOrdinal={regenningOrdinal}
          onRegenScene={(ordinal) => void regenScene(ordinal)}
          onEditScene={editScene}
          onView={(url) => setLightbox(url)}
          onGenerate={() => {
            // Stop any still-streaming frame fetches — the user has approved; we
            // don't need (or want to pay for) the remaining preview frames.
            try { storyboardAbortRef.current?.abort(); } catch { /* noop */ }
            const frameUrls = storyboard.scenes.map((s) => s.frameUrl);
            const sceneFrames = frameUrls.every((f): f is string => typeof f === 'string') ? frameUrls : undefined;
            const sb = storyboard;
            setStoryboard(null);
            // Thread the (possibly EDITED) per-scene descriptions into the render: an
            // edited scene uses the user's own words; the rest keep the rich LLM script.
            const anyEdited = sb.scenes.some((s) => s.edited);
            const scripts = (sb.sceneScripts || anyEdited)
              ? sb.scenes.map((s, i) => (s.edited && s.prompt.trim() ? s.prompt.trim() : (sb.sceneScripts?.[i] ?? s.prompt)))
              : undefined;
            // With approved per-scene frames the identity is already baked in, so the
            // original (possibly multi-MB data-URL) refs are redundant — dropping them
            // avoids a 413 body-overflow on the render dispatch when a photo was attached.
            // The (possibly edited) story scenes ride along so the clips render the SAME story.
            void renderFilm(sb.filmPrompt, sceneFrames ? [] : sb.refs, sb.orientation, sceneFrames, scripts, sb.scenes.map((s) => ({ ordinal: s.ordinal, beat: s.beat, frameUrl: s.frameUrl })));
          }}
          onRegenerate={() => {
            try { storyboardAbortRef.current?.abort(); } catch { /* noop */ }
            const sb = storyboard;
            setStoryboard(null);
            void createStoryboard(sb.filmPrompt, sb.refs, sb.orientation);
          }}
          onCancel={() => { try { storyboardAbortRef.current?.abort(); } catch { /* noop */ } setStoryboard(null); }}
        />
      )}

      {/* Chat history — the list of past conversations: resume, start new, delete. */}
      {historyOpen && (
        <div className="fixed inset-0 z-[95] flex justify-start bg-black/40 backdrop-blur-sm" onClick={() => setHistoryOpen(false)} style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-80 max-w-[86vw] flex-col bg-app-surface shadow-[0_0_60px_rgba(0,0,0,0.35)] animate-[slideIn_0.2s_ease-out]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-app-text"><History size={16} /> {t.historyTitle}</span>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="close" className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-2 pb-2">
              <button type="button" onClick={startNewConversation} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-app-accent transition-colors hover:bg-app-elevated">
                <MessageSquarePlus className="h-[18px] w-[18px]" /> {t.historyNew}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
              {historyList.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-app-muted">{t.historyEmpty}</p>
              ) : (
                historyList.map((c) => (
                  <div key={c.id} className={`group flex items-center gap-1 rounded-xl pr-1 transition-colors hover:bg-app-elevated ${c.id === conversationId ? 'bg-app-elevated' : ''}`}>
                    <button type="button" onClick={() => resumeConversation(c.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left">
                      <MessageSquare className="h-4 w-4 shrink-0 text-app-muted" />
                      <span className="truncate text-[13px] text-app-text">{c.title}</span>
                    </button>
                    <button type="button" onClick={() => removeConversation(c.id)} aria-label={t.deleteLabel} title={t.deleteLabel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-app-muted opacity-0 transition-opacity hover:text-app-accent group-hover:opacity-100">
                      <Trash2 className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
      </Portal>
    </div>
  );
}
