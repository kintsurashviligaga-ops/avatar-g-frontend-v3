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
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { Send, Mic, Square, Plus, X, Loader2, Sparkles, Film, Music2, FileText, Image as ImageIcon, Download, Upload, MessageSquare, Wand2, Volume2, Copy, Check, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, History, Trash2, MessageSquarePlus, Pencil, Share2, ThumbsUp, ThumbsDown, Camera, BookmarkPlus, Scissors, GripVertical } from 'lucide-react';
import SurgicalEditor from '@/components/studio/SurgicalEditor';
import { classifyIntent, isImperativeCommand } from '@/lib/ai/agentG';
import { parseImageBlocks, hasImageBlocks } from '@/lib/chat/imageBlocks';
import { inferCameraMove } from '@/lib/chat/cameraCue';
import { parseServiceBlock, hasServiceBlock, stripDanglingServiceBlock, type ChatService } from '@/lib/chat/serviceBlocks';
import { driveFilmStudio, type FilmStudioMatrix } from '@/lib/chat/filmStudioClient';
import { FILM_CLIP_SEC, mergeSceneCaptions } from '@/lib/chat/filmPipeline';
// ISSUE 7 — both consoles only render WHILE a video/remix is generating, never on the
// initial dashboard paint, so lazy-load them (ssr:false) to keep their ~540 lines of JS
// out of the first-load bundle. A tiny placeholder holds layout until the chunk lands.
const FilmDirectorConsole = dynamic(() => import('./FilmDirectorConsole'), { ssr: false, loading: () => <div className="h-24" /> });
const RemixStudioConsole = dynamic(() => import('./RemixStudioConsole'), { ssr: false, loading: () => <div className="h-24" /> });
import { deriveFilmRoster, deriveFilmLog, type FilmAgentVM, type FilmLogLine, type FilmAgentStatus } from '@/lib/chat/filmAgentRoster';
import { TrackPlayer } from './TrackPlayer';
import { Markdown } from './Markdown';
import { MotionControlPanel } from './MotionControlPanel';
import { chunkForTts } from '@/lib/audio/ttsChunks';
import { createBrowserClient } from '@/lib/supabase/browser';
import { creditCostFor, creditsToGel, gelToCredits } from '@/lib/credits/pricing';
import { usdFromGel } from '@/lib/billing/gel';
import { productCtaText, generateVoiceoverScript, type ProductCtaOption } from '@/lib/ai/productAdAgent';
import { isAdImageMime, AD_IMAGE_MAX_BYTES, MAX_AD_IMAGES, AD_HOOK_MAX_CHARS } from '@/lib/ads/adInputValidation';
import { AppToggle } from '@/components/ui/AppToggle';
import { track } from '@/lib/analytics/track';
import { ensureNotificationPermission, fireCompletionNotification } from '@/lib/notify/browserNotify';
import { useStudioBridge } from '@/store/useStudioBridge';
import { serializeStoryboardMatrix, type StoryboardMatrixCell } from '@/lib/pipeline/storyboardBridge';
import { useServiceBridge } from '@/hooks/useServiceBridge';
import { useKeyboardResilience } from '@/hooks/useKeyboardResilience';
import { useJobQueue } from '@/store/useJobQueue';
import { useDurableProgress } from '@/hooks/useDurableProgress';
import { trackJobUpdate, trackJobComplete, trackJobFail, trackJobPosition } from '@/lib/jobs/trackJob';
import type { Job as QueueJob } from '@/lib/jobs/jobQueue';
import { StallDetector } from '@/lib/jobs/stallDetector';
import { detectIntent, isGenerativeCommand } from '@/lib/chat/intentDetector';
import { createSession, saveMessage, getMessages, getConversations } from '@/lib/chat-history';
import { computeCloudAdditions } from '@/lib/chat/conversationSync';
import { mapWithConcurrency } from '@/lib/chat/filmClipRetry';
import { JobTray } from './JobTray';
import { toast } from 'sonner';

type Lang = 'ka' | 'en' | 'ru';

/**
 * The platform serializes generation to ONE render at a time. When a user tries to
 * start a SECOND generation (e.g. a music track while a video is still rendering) the
 * request used to be dropped SILENTLY (the guard returned with no feedback), which read
 * as a hung/spinning button. Surface a friendly, localized toast instead so the busy
 * state is explicit. Reused by every generation entry point (chat/image/music/video,
 * product ad, character swap).
 */
function busyToastMessage(locale: Lang): string {
  return locale === 'en'
    ? 'Another generation is currently in progress. Please wait for it to complete.'
    : locale === 'ru'
    ? 'Уже выполняется другая генерация. Пожалуйста, дождитесь её завершения.'
    : 'უკვე მიმდინარეობს სხვა გენერაცია. გთხოვთ, დაელოდოთ დასრულებას.';
}

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

// Phase 6 polish — decode an uploaded audio File entirely client-side to get its real
// duration + a downsampled waveform (N peaks in 0..1) for the music-video preview. Pure
// browser Web Audio; fail-soft to null so a decode miss never blocks the upload.
async function decodeAudioMeta(file: File, buckets = 48): Promise<{ durationSec: number; peaks: number[] } | null> {
  try {
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    try {
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      const ch = buf.getChannelData(0);
      const block = Math.max(1, Math.floor(ch.length / buckets));
      const peaks: number[] = [];
      for (let i = 0; i < buckets; i += 1) {
        let peak = 0;
        const start = i * block;
        for (let j = 0; j < block && start + j < ch.length; j += 1) { const v = Math.abs(ch[start + j]!); if (v > peak) peak = v; }
        peaks.push(Math.min(1, peak));
      }
      // Normalize so the tallest bar reaches the top (quiet tracks still read well).
      const max = Math.max(0.0001, ...peaks);
      return { durationSec: buf.duration, peaks: peaks.map((p) => p / max) };
    } finally {
      try { await ctx.close(); } catch { /* noop */ }
    }
  } catch {
    return null;
  }
}

// mm:ss for a soundtrack duration chip.
function fmtDur(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const COPY: Record<Lang, {
  title: string; subtitle: string; placeholder: string; empty: string; thinking: string; recording: string; micHint: string;
  modeChat: string; modeImage: string; imgPlaceholder: string; generatingImage: string; imageFailed: string; imgDownload: string; editImage: string; share: string; linkCopied: string; remix: string; remixPlaceholder: string; remixGenerating: string;
  magicHint: string;
  modeMusic: string; musicPlaceholder: string; generatingMusic: string; musicFailed: string; lyricsBlocked: string;
  modeVideo: string; videoPlaceholder: string; generatingVideo: string; videoFailed: string; generatingMyVoice: string; myVoiceCreate: string; myVoiceLyricsPh: string; myVoiceReady: string; writeLyricsBtn: string; upscaleBtn: string; upscaling: string; upscaleFailed: string;
  modeLipsync: string; lipsyncPlaceholder: string; generatingLipsync: string; lipsyncFailed: string; lipsyncNeedFiles: string; lipsyncAuth: string; lipAudioLabel: string;
  modeRemix: string; remixUploadHint: string; remixRunning: string; remixDone: string; remixFailed: string; remixNeedVideo: string;
  modeSurgical: string;
  stop: string; stopped: string; scrollDown: string; regenerate: string; retry: string; elapsedHint: string; greeting: string; attachHint: string;
  instrumental: string; withVocals: string; lyricsPlaceholder: string; coverMode: string; voiceMode: string; voiceLyricsPlaceholder: string; voiceSecTitle: string; voiceRec: string; voiceUp: string; voiceReady: string; voiceRecHint: string; need15: string;
  narration: string; narrationCue: string; transCrossfade: string; transCut: string;
  sbTitle: string; sbReview: string; sbGenerate: string; sbRegen: string; sbCancel: string; sbCreating: string; sbFailed: string; sbScene: string; sbEditHint: string; sbReroll: string; sbFrames: string; sbEditPromptAction: string; sbChangeBaseAction: string; sbGenerating: string; sbEmpty: string; sbMoveEarlier: string; sbMoveLater: string; sbDeleteScene: string; sbAddScene: string; sbSourceLocked: string; sbAnchorLocked: string; sbPipeScript: string; sbPipeBoard: string; sbPipeRender: string; sbCompiling: string; sbReady: string; sbAutoFill: string; sbRenderNote: string; sbDrag: string;
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
    modeRemix: 'რემიქსი', remixUploadHint: 'ატვირთე ვიდეო რედაქტირებისთვის', remixRunning: 'ვიდეო მუშავდება…', remixDone: 'მზადაა', remixFailed: 'რემიქსი ვერ მოხერხდა. სცადე თავიდან.', remixNeedVideo: 'ჯერ ატვირთე ვიდეო.',
    modeSurgical: 'მონტაჟი',
    generatingLipsync: 'ავატარი იქმნება…', lipsyncFailed: 'ავატარი ვერ შეიქმნა.', lipsyncNeedFiles: 'მიამაგრე ფოტო და ტექსტი (ან აუდიო).', lipsyncAuth: 'ავატარისთვის ჯერ გაიარე ავტორიზაცია.', lipAudioLabel: 'აუდიო',
    stop: 'შეჩერება', stopped: 'შეჩერდა', scrollDown: 'ბოლოში გადასვლა', regenerate: 'თავიდან გენერაცია', retry: '🔄 თავიდან ცდა', elapsedHint: 'გავიდა', greeting: 'რით დაგეხმარო?', attachHint: 'დამატება',
    instrumental: 'ინსტრუმენტალი', withVocals: 'ვოკალით', lyricsPlaceholder: 'ლირიკა (არჩევითი) — შენი ტექსტი; ცარიელი = ავტომატური', coverMode: '🎵 ქავერი', voiceMode: '🎤 ჩემი ხმით', voiceLyricsPlaceholder: 'ლირიკა — რას იმღერებს შენი ხმა (ატვირთე ≥15წმ ხმა)', voiceSecTitle: '🎤 შენი ხმა', voiceRec: 'ჩაწერა', voiceUp: 'ატვირთვა', voiceReady: 'ხმა მზადაა — აირჩიე „ჩემი ხმით"', voiceRecHint: 'ჩაიწერე ან ატვირთე ≥15წმ ხმა — სიმღერა შენი ვოკალით შეიქმნება', need15: '≥15წმ',
    narration: 'ნარაცია', narrationCue: ' (პროფესიონალი კომენტატორის ხმოვანი ნარაციით)', transCrossfade: 'გადადნობა', transCut: 'კვეთა',
    sbTitle: 'სტორიბორდი', sbReview: 'გადახედე 6 სცენას — შეცვალე ტექსტი ან თავიდან დააგენერირე კადრი, შემდეგ გაუშვი ვიდეო', sbGenerate: 'ვიდეოს გენერაცია', sbRegen: 'თავიდან', sbCancel: 'გაუქმება', sbCreating: 'სცენარი და 6 კადრი იქმნება…', sbFailed: 'სტორიბორდი ვერ შეიქმნა. სცადე თავიდან.', sbScene: 'სცენა', sbEditHint: 'შეცვალე ამ კადრის აღწერა…', sbReroll: 'კადრის თავიდან დაგენერირება', sbFrames: 'კადრი', sbEditPromptAction: 'ტექსტის რედაქტირება', sbChangeBaseAction: 'ბაზის სურათის შეცვლა', sbGenerating: 'იქმნება', sbEmpty: 'კადრი არ არის', sbMoveEarlier: 'ადრე გადატანა', sbMoveLater: 'მოგვიანებით გადატანა', sbDeleteScene: 'სცენის წაშლა', sbAddScene: 'სცენის დამატება', sbSourceLocked: 'ორიგინალი დაფიქსირდა', sbAnchorLocked: '🎥 ორიგინალის იდენტობა დაფიქსირდა', sbPipeScript: 'სცენარი', sbPipeBoard: 'სტორიბორდი', sbPipeRender: 'რენდერი', sbCompiling: 'სცენების კომპილირება', sbReady: 'მზადაა', sbAutoFill: 'ავტომატურად შეიქმნება', sbRenderNote: 'რენდერს რამდენიმე წუთი სჭირდება — შეტყობინებას მიიღებ, როცა მზად იქნება', sbDrag: 'გადაათრიე გადასაწყობად',
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
    modeRemix: 'Remix', remixUploadHint: 'Upload a video to edit', remixRunning: 'Processing video…', remixDone: 'Ready', remixFailed: 'Remix failed. Try again.', remixNeedVideo: 'Upload a video first.',
    modeSurgical: 'Editor',
    generatingLipsync: 'Creating your Avatar…', lipsyncFailed: 'Avatar creation failed.', lipsyncNeedFiles: 'Attach a photo and a script (or audio).', lipsyncAuth: 'Sign in first to use Avatar.', lipAudioLabel: 'Audio',
    stop: 'Stop', stopped: 'Stopped', scrollDown: 'Scroll to bottom', regenerate: 'Regenerate', retry: '🔄 Try again', elapsedHint: 'elapsed', greeting: 'How can I help?', attachHint: 'Add',
    instrumental: 'Instrumental', withVocals: 'Vocals', lyricsPlaceholder: 'Lyrics (optional) — your words; empty = auto-written', coverMode: '🎵 Cover', voiceMode: '🎤 My voice', voiceLyricsPlaceholder: 'Lyrics — what your voice will sing (upload ≥15s of voice)', voiceSecTitle: '🎤 Your voice', voiceRec: 'Record', voiceUp: 'Upload', voiceReady: 'Voice ready — pick “My voice”', voiceRecHint: 'Record or upload ≥15s of voice — the song is sung in your voice', need15: '≥15s',
    narration: 'Narration', narrationCue: ' (with professional spoken voice-over narration)', transCrossfade: 'Crossfade', transCut: 'Cut',
    sbTitle: 'Storyboard', sbReview: 'Review the 6 scenes — edit a description or re-roll a frame, then generate', sbGenerate: 'Generate Video', sbRegen: 'Regenerate', sbCancel: 'Cancel', sbCreating: 'Creating storyboard & 6 frames…', sbFailed: 'Storyboard failed. Try again.', sbScene: 'Scene', sbEditHint: 'Edit this shot…', sbReroll: 'Re-roll this frame', sbFrames: 'frames', sbEditPromptAction: 'Edit prompt', sbChangeBaseAction: 'Change base image', sbGenerating: 'generating', sbEmpty: 'no frame', sbMoveEarlier: 'Move earlier', sbMoveLater: 'Move later', sbDeleteScene: 'Delete scene', sbAddScene: 'Add scene', sbSourceLocked: 'Source Reference Locked', sbAnchorLocked: '🎥 ORIGIN IDENTITY ANCHOR LOCKED', sbPipeScript: 'Script', sbPipeBoard: 'Storyboard', sbPipeRender: 'Render', sbCompiling: 'Compiling scenes', sbReady: 'ready', sbAutoFill: 'auto-generates at render', sbRenderNote: "Render takes a few minutes — you'll be notified when it's ready", sbDrag: 'Drag to reorder',
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
    modeRemix: 'Ремикс', remixUploadHint: 'Загрузите видео для редактирования', remixRunning: 'Обработка видео…', remixDone: 'Готово', remixFailed: 'Ремикс не удался. Попробуйте снова.', remixNeedVideo: 'Сначала загрузите видео.',
    modeSurgical: 'Монтаж',
    generatingLipsync: 'Создаю аватар…', lipsyncFailed: 'Не удалось создать аватар.', lipsyncNeedFiles: 'Прикрепите фото и текст (или аудио).', lipsyncAuth: 'Войдите, чтобы использовать Аватар.', lipAudioLabel: 'Аудио',
    stop: 'Стоп', stopped: 'Остановлено', scrollDown: 'Вниз', regenerate: 'Заново', retry: '🔄 Повторить', elapsedHint: 'прошло', greeting: 'Чем помочь?', attachHint: 'Добавить',
    instrumental: 'Инструментал', withVocals: 'Вокал', lyricsPlaceholder: 'Текст (необязательно) — ваши слова; пусто = авто', coverMode: '🎵 Кавер', voiceMode: '🎤 Мой голос', voiceLyricsPlaceholder: 'Текст — что споёт ваш голос (загрузите ≥15с голоса)', voiceSecTitle: '🎤 Ваш голос', voiceRec: 'Запись', voiceUp: 'Загрузить', voiceReady: 'Голос готов — выберите «Мой голос»', voiceRecHint: 'Запишите или загрузите ≥15с голоса — песня будет спета вашим голосом', need15: '≥15с',
    narration: 'Озвучка', narrationCue: ' (с профессиональной голосовой озвучкой)', transCrossfade: 'Плавно', transCut: 'Резко',
    sbTitle: 'Раскадровка', sbReview: 'Просмотрите 6 сцен — измените описание или кадр, затем сгенерируйте', sbGenerate: 'Сгенерировать видео', sbRegen: 'Заново', sbCancel: 'Отмена', sbCreating: 'Создаю раскадровку и 6 кадров…', sbFailed: 'Не удалось создать раскадровку. Попробуйте снова.', sbScene: 'Сцена', sbEditHint: 'Измените этот кадр…', sbReroll: 'Пересоздать кадр', sbFrames: 'кадры', sbEditPromptAction: 'Изменить текст', sbChangeBaseAction: 'Сменить базовое фото', sbGenerating: 'создаётся', sbEmpty: 'нет кадра', sbMoveEarlier: 'Переместить раньше', sbMoveLater: 'Переместить позже', sbDeleteScene: 'Удалить сцену', sbAddScene: 'Добавить сцену', sbSourceLocked: 'Оригинал закреплён', sbAnchorLocked: '🎥 ОРИГИНАЛ ЗАКРЕПЛЁН', sbPipeScript: 'Сценарий', sbPipeBoard: 'Раскадровка', sbPipeRender: 'Рендер', sbCompiling: 'Компиляция сцен', sbReady: 'готово', sbAutoFill: 'создастся при рендере', sbRenderNote: 'Рендер займёт несколько минут — вы получите уведомление, когда всё будет готово', sbDrag: 'Перетащите для порядка',
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
    video: ['სცენარს ვშლი…', 'აუდიო & SFX…', 'ხმა…', 'ვიდეო კადრები…', 'მასტერინგი…', 'გრაფიკა…'],
    lipsync: ['ფოტოს ვამზადებ…', 'ავატარი ცოცხლდება…', 'ვასრულებ…'],
  },
  en: {
    image: ['Reading your prompt…', 'Painting the frame…', 'Adding details…', 'Finishing up…'],
    music: ['Shaping the idea…', 'Composing the melody…', 'Mixing the voices…', 'Finishing up…'],
    video: ['Scripting…', 'Audio SFX…', 'Voice…', 'Video clips…', 'Mastering…', 'Graphics…'],
    lipsync: ['Preparing the photo…', 'Bringing the avatar to life…', 'Finishing up…'],
  },
  ru: {
    image: ['Читаю запрос…', 'Рисую кадр…', 'Добавляю детали…', 'Завершаю…'],
    music: ['Формирую идею…', 'Сочиняю мелодию…', 'Свожу голоса…', 'Завершаю…'],
    video: ['Сценарий…', 'Аудио и SFX…', 'Голос…', 'Видео-клипы…', 'Мастеринг…', 'Графика…'],
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
  // PHASE 2 L4 — video uses the explicit 6-phase bands (uneven on purpose:
  // clip-gen dominates 50-85%); other kinds keep the even time-based split.
  const stageIdx = kind === 'video'
    ? (pct < 20 ? 0 : pct < 35 ? 1 : pct < 50 ? 2 : pct < 85 ? 3 : pct < 95 ? 4 : 5)
    : Math.min(stages.length - 1, Math.floor((pct / 100) * stages.length));
  const headline = status && status.trim() ? status.trim() : stages[stageIdx];
  const remaining = Math.max(0, Math.round(target - elapsed));
  const remLabel = locale === 'en' ? 'remaining' : locale === 'ru' ? 'осталось' : 'დარჩა';
  return (
    <div className="w-[min(86vw,440px)] space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/50 p-4 shadow-[0_10px_34px_rgba(0,0,0,0.20)]">
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
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-app-border/15">
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
  { id: 'remix', Icon: Wand2, key: 'modeRemix' },
  { id: 'surgical', Icon: Scissors, key: 'modeSurgical' },
] as const;

// P1 — Music-video lip-sync. Sends the assembled multi-shot master to /api/video/lipsync
// with kind:'film' → the route uses Replicate's sync/lipsync-2 (video-input, official),
// keying the singer's mouth to the master's embedded Georgian vocal. Returns the synced
// URL or null (caller keeps the un-synced master — fail-open).
// PHASE 20 — LIP-SYNC OBSERVABILITY. The music-video singer-performance sync is the CORRECT
// approach (per-shot HeyGen close-ups composited into the montage — NOT whole-master
// sync/lipsync-2, which warps wide shots and was reverted twice: 8d72d47 reverts 64a9c93 +
// 5624771). But when it silently bailed (no clean face / HeyGen down / short result), the
// master shipped with un-synced lips and the card just said "skipped" with no reason — that
// was the real "lips don't track the vocal" symptom. These short localized lines surface WHY
// on the Director's Console Lip-Sync card so a skip is never mysterious.
type LipSkipReason = 'no_song' | 'no_face' | 'heygen_unavailable' | 'short_result' | 'no_clips' | 'composite_failed' | 'not_requested';
function lipsyncSkipReason(reason: LipSkipReason, locale: string): string {
  const M: Record<LipSkipReason, { en: string; ru: string; ka: string }> = {
    no_song: { en: 'Skipped — no song track to sync to', ru: 'Пропущено — нет песни для синхронизации', ka: 'გამოტოვდა — სასინქრონო აუდიო ფაილი მიუწვდომელია' },
    no_face: { en: 'Skipped — no clear face in frame (add a photo for lip-sync)', ru: 'Пропущено — в кадре нет чёткого лица (добавьте фото)', ka: 'გამოტოვდა — სუფთა სახე კადრში ვერ მოიძებნა (დაამატე ფოტო)' },
    heygen_unavailable: { en: 'Skipped — lip-sync engine unavailable (key/credit)', ru: 'Пропущено — движок липсинка недоступен (ключ/кредит)', ka: 'გამოტოვდა — ლიპსინკის ძრავა მიუწვდომელია (გასაღები/კრედიტი)' },
    short_result: { en: 'Skipped — sync clip too short', ru: 'Пропущено — клип слишком короткий', ka: 'გამოტოვდა — სასინქრონო კლიპი ძალიან მოკლეა' },
    no_clips: { en: 'Skipped — no rendered clips to composite', ru: 'Пропущено — нет клипов для монтажа', ka: 'გამოტოვდა — მონტაჟისთვის კლიპები არ არის' },
    composite_failed: { en: 'Skipped — composite failed', ru: 'Пропущено — сбой монтажа', ka: 'გამოტოვდა — მონტაჟი ვერ შესრულდა' },
    not_requested: { en: 'Not requested for this render', ru: 'Не запрошен для этого рендера', ka: 'ამ რენდერისთვის არ იყო მოთხოვნილი' },
  };
  const m = M[reason];
  return locale === 'ru' ? m.ru : locale === 'ka' ? m.ka : m.en;
}

// MUSIC-VIDEO lip-sync — generate a clean HeyGen SINGER PERFORMANCE: a close-up storyboard
// face lip-synced to the song's vocal (the talking-photo path, which tries HeyGen first).
// This replaces the old whole-master relip (sync/lipsync-2 warped the montage's wide/aerial
// shots). Fail-open: returns null on any miss so the caller just omits the companion clip.
async function heygenSingerPerformance(faceUrl: string, audioUrl: string, orientation: 'landscape' | 'vertical', signal: AbortSignal, mine: () => boolean): Promise<string | null> {
  let jobId: string | null = null;
  try {
    const r = await fetch('/api/video/lipsync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // No `kind:'film'` → the talking-photo engine (HeyGen first) animates the face to the
      // vocal. `characterRef` (the CLEAN portrait) is the preferred face — HeyGen needs a
      // front-facing portrait, not a stylized scene frame.
      body: JSON.stringify({ videoUrl: faceUrl, characterRef: faceUrl, audioUrl, orientation: orientation === 'vertical' ? 'vertical' : 'landscape' }),
      credentials: 'include', signal,
    });
    jobId = ((await r.json().catch(() => ({}))) as { jobId?: string | null }).jobId ?? null;
  } catch { return null; }
  if (!jobId) return null;
  for (let i = 0; i < 80 && mine(); i += 1) { // ~8 min of quick polls (HeyGen render window)
    await new Promise((res) => setTimeout(res, 6000));
    try {
      const pr = await fetch(`/api/video/lipsync?id=${encodeURIComponent(jobId)}`, { credentials: 'include', signal });
      const pj = (await pr.json().catch(() => ({}))) as { done?: boolean; url?: string | null };
      if (pj.done) return pj.url ?? null;
    } catch { /* transient poll error — keep polling */ }
  }
  return null;
}

// Stage 2b — COMPOSITE the HeyGen close-ups INTO the cinematic montage. Face-forward beats
// (Medium / Arc / Close-Up) take a 5s window of the continuous HeyGen performance at their
// timeline position (so lips match the song there); wide beats (Establishing / Wide / Reso-
// lution) keep the cinematic LTX clip. Re-assembles with the SONG as the master audio.
// Fail-open: a miss returns null and the caller keeps the cinematic + companion clips.
async function compositeMusicVideo(
  heygenUrl: string,
  matrix: FilmStudioMatrix,
  storyboardScenes: { ordinal: number; beat?: string; frameUrl: string | null }[] | undefined,
  musicUrl: string,
  orientation: 'landscape' | 'vertical',
  transition: 'crossfade' | 'cut' | 'dissolve' | 'zoom' | 'slide',
  signal: AbortSignal,
  mine: () => boolean,
  filmTokenId: string | null,
): Promise<string | null> {
  try {
    const ltxByOrd = new Map<number, string>();
    for (const c of matrix.clips) if (c.status === 'succeeded' && typeof c.url === 'string' && c.url) ltxByOrd.set(c.ordinal, c.url);
    const beatByOrd = new Map<number, string>();
    for (const s of storyboardScenes ?? []) beatByOrd.set(s.ordinal, (s.beat ?? '').toLowerCase());
    const ordinals = [...ltxByOrd.keys()].sort((a, b) => a - b);
    if (ordinals.length < 2) return null;
    const FACE = /close|medium|arc/;
    const segs: { url: string; durationSec: number }[] = [];
    for (const ord of ordinals) {
      // Keep the cinematic INTRO (drone over the city → into the venue: scenes 1-2 of a
      // 4+ scene music video) as the LTX clip — never lip-sync a shot with no singer.
      const isIntro = ordinals.length >= 4 && ord <= 2;
      const isFace = !isIntro && FACE.test(beatByOrd.get(ord) ?? '');
      let url = ltxByOrd.get(ord) as string;
      if (isFace && mine()) {
        try {
          const r = await fetch('/api/video/trim', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal,
            body: JSON.stringify({ videoUrl: heygenUrl, startSec: (ord - 1) * FILM_CLIP_SEC, durationSec: FILM_CLIP_SEC }),
          });
          const seg = ((await r.json().catch(() => ({}))) as { url?: string | null }).url ?? null;
          if (seg) url = seg; // else keep the LTX clip for this scene
        } catch { /* keep LTX */ }
      }
      segs.push({ url, durationSec: FILM_CLIP_SEC });
    }
    if (segs.length < 2 || !mine()) return null;
    const r = await fetch('/api/video/assemble', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal,
      body: JSON.stringify({
        segments: segs,
        musicUrl,
        musicVideoMode: true,
        // Re-stitch of an already-billed film → same token so assemble skips the second charge.
        ...(filmTokenId ? { filmTokenId } : {}),
        ...(orientation === 'vertical' ? { orientation: 'vertical' } : {}),
        ...(transition ? { globalRender: { transition } } : {}),
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { url?: unknown } | null;
    return j && typeof j.url === 'string' && j.url.length > 0 ? j.url : null;
  } catch {
    return null;
  }
}

// DOCUMENTARY talking head — lip-sync the CLEAN portrait to the spoken DIALOGUE. Same
// talking-photo engine as the singer (HeyGen first), but the audio is ElevenLabs TTS of the
// dialogue text in the narrator gender — the route's `text`+`gender` path does the TTS
// internally, so the returned clip already carries the narration in its audio track.
// Fail-open: any miss → null.
async function heygenSpeakingHead(
  portrait: string,
  dialogue: string,
  gender: 'male' | 'female',
  orientation: 'landscape' | 'vertical',
  signal: AbortSignal,
  mine: () => boolean,
): Promise<string | null> {
  let jobId: string | null = null;
  try {
    const r = await fetch('/api/video/lipsync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // No `kind:'film'` → talking-photo (HeyGen first) animates the portrait. `text`+`gender`
      // → the route synthesizes the narrator voice (ElevenLabs) and keys the mouth to it.
      body: JSON.stringify({ characterRef: portrait, videoUrl: portrait, text: dialogue, gender, orientation: orientation === 'vertical' ? 'vertical' : 'landscape' }),
      credentials: 'include', signal,
    });
    jobId = ((await r.json().catch(() => ({}))) as { jobId?: string | null }).jobId ?? null;
  } catch { return null; }
  if (!jobId) return null;
  for (let i = 0; i < 80 && mine(); i += 1) { // ~8 min of quick polls (HeyGen render window)
    await new Promise((res) => setTimeout(res, 6000));
    try {
      const pr = await fetch(`/api/video/lipsync?id=${encodeURIComponent(jobId)}`, { credentials: 'include', signal });
      const pj = (await pr.json().catch(() => ({}))) as { done?: boolean; url?: string | null };
      if (pj.done) return pj.url ?? null;
    } catch { /* transient poll error — keep polling */ }
  }
  return null;
}

// DOCUMENTARY composite — narrate the film in the character's OWN voice + face. Mirrors
// compositeMusicVideo, but: (1) the audio source is the spoken DIALOGUE (not a song vocal),
// (2) ElevenLabs TTS of that dialogue drives the lip-sync (narrator gender per the panel),
// (3) the CLEAN portrait is lip-synced via talking-photo, (4) the talking head is composited
// at the CLOSE-UP beat (cameraShot 'close-up' / beat /close/) — (5) or scene 3 by default if
// no close-up exists. The talking-head clip carries the narration, so we re-assemble with that
// clip itself as the master audio bed (ffmpeg maps its audio stream) → the documentary is
// narrated in the synced voice. Fail-open: any miss → null and the caller keeps the base master.
async function compositeDocumentary(
  portrait: string,
  matrix: FilmStudioMatrix,
  storyboardScenes: { ordinal: number; beat?: string; frameUrl: string | null }[] | undefined,
  dialogue: string,
  gender: 'male' | 'female',
  orientation: 'landscape' | 'vertical',
  transition: 'crossfade' | 'cut' | 'dissolve' | 'zoom' | 'slide',
  signal: AbortSignal,
  mine: () => boolean,
  filmTokenId: string | null,
): Promise<string | null> {
  try {
    // 1+2+3. ElevenLabs TTS of the dialogue + lip-sync the CLEAN portrait to it (talking-photo).
    const talkingHead = await heygenSpeakingHead(portrait, dialogue, gender, orientation, signal, mine);
    if (!talkingHead || !mine()) return null;

    // 4+5. Choose the scene that hosts the talking head: a CLOSE-UP beat, else scene 3, else
    // the middle scene of the montage.
    const ltxByOrd = new Map<number, string>();
    for (const c of matrix.clips) if (c.status === 'succeeded' && typeof c.url === 'string' && c.url) ltxByOrd.set(c.ordinal, c.url);
    const beatByOrd = new Map<number, string>();
    for (const s of storyboardScenes ?? []) beatByOrd.set(s.ordinal, (s.beat ?? '').toLowerCase());
    const ordinals = [...ltxByOrd.keys()].sort((a, b) => a - b);
    if (ordinals.length < 2) return null;
    const closeUpOrd =
      ordinals.find((o) => /close/.test(beatByOrd.get(o) ?? '')) ??
      (ordinals.includes(3) ? 3 : ordinals[Math.min(2, ordinals.length - 1)]);

    // Swap the close-up scene's cinematic clip for the talking head; keep every other scene.
    const segs: { url: string; durationSec: number }[] = ordinals.map((ord) => ({
      url: ord === closeUpOrd ? talkingHead : (ltxByOrd.get(ord) as string),
      durationSec: FILM_CLIP_SEC,
    }));
    if (segs.length < 2 || !mine()) return null;

    // Re-assemble the documentary — the talking-head clip is the master audio bed so the film
    // is narrated in the synced voice (NOT musicVideoMode → narration-forward documentary mix).
    const r = await fetch('/api/video/assemble', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal,
      body: JSON.stringify({
        segments: segs,
        musicUrl: talkingHead,
        // Re-stitch of an already-billed film → same token so assemble skips the second charge.
        ...(filmTokenId ? { filmTokenId } : {}),
        ...(orientation === 'vertical' ? { orientation: 'vertical' } : {}),
        ...(transition ? { globalRender: { transition } } : {}),
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { url?: unknown } | null;
    return j && typeof j.url === 'string' && j.url.length > 0 ? j.url : null;
  } catch {
    return null;
  }
}

// Reject a lip-sync result that isn't a sane full-length master (e.g. a 5s talking-head
// SadTalker mangled from a multi-shot film) so a good 30s master is never replaced by
// garbage. Resolves false on any load error/timeout.
function videoDurationAtLeast(url: string, minSec: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(false); return; }
    try {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      const to = setTimeout(() => resolve(false), 12000);
      v.onloadedmetadata = () => { clearTimeout(to); resolve(Number.isFinite(v.duration) && v.duration >= minSec); };
      v.onerror = () => { clearTimeout(to); resolve(false); };
      v.src = url;
    } catch { resolve(false); }
  });
}

// P10 — best-effort client preview of which scenes a remix edit will re-render
// (mirrors the server's planRemixFromText "scene N" / positional detection). Empty
// result → the AI picks the scene(s); the preview says so.
function parseRemixScenes(text: string, total: number): number[] {
  const t = text.toLowerCase();
  const nums = new Set<number>();
  const re = /(?:scene|სცენა|сцена)\s*#?\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) { const n = parseInt(m[1] ?? '', 10); if (n >= 1 && n <= total) nums.add(n); }
  if (/\b(intro|opening|first|beginning)\b|დასაწყის|პირველ|перв|начал/.test(t)) nums.add(1);
  if (/\b(ending|finale|final|last|resolution)\b|დასასრ|ფინალ|ბოლო|последн|конц|финал/.test(t)) nums.add(total);
  return [...nums].sort((a, b) => a - b);
}

// P8 — built-in avatar presets (1024² studio portraits in /public/avatars).
// Selecting one uses it as the talking face — no upload needed — and suggests the
// matching cloned-voice gender. Diverse on gender + age so most users find a fit.
const AVATAR_PRESETS: { src: string; gender: 'female' | 'male' }[] = [
  { src: '/avatars/preset-1.jpg', gender: 'female' },
  { src: '/avatars/preset-2.jpg', gender: 'male' },
  { src: '/avatars/preset-3.jpg', gender: 'female' },
  { src: '/avatars/preset-4.jpg', gender: 'male' },
  { src: '/avatars/preset-5.jpg', gender: 'male' },
  { src: '/avatars/preset-6.jpg', gender: 'female' },
];

// ── Per-service options (real backend capabilities) ──────────────────────────
const IMG_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:2', '2:3'] as const;
type ImgAspect = (typeof IMG_ASPECTS)[number];
const IMG_QUALITIES = [['standard', '1K'], ['high', '2K'], ['ultra', '4K']] as const;
type ImgQuality = (typeof IMG_QUALITIES)[number][0];
const IMG_STYLES = ['Auto', 'Photorealistic', 'Cinematic', 'Digital Art', 'Anime', '3D Render', 'Oil Painting', 'Watercolor', 'Cyberpunk', 'Fantasy', 'Minimalist', 'Line Art', 'Pixel Art'] as const;
// Curated style set for the redesigned Music panel (Section A). Each entry maps a
// user-facing label (per locale) to a genre value the score engine understands.
const MUSIC_STYLES: ReadonlyArray<readonly [string, { ka: string; en: string; ru: string }]> = [
  ['folk', { ka: 'ქართული ფოლკი', en: 'Georgian Folk', ru: 'Грузинский фолк' }],
  ['r&b', { ka: 'R&B', en: 'R&B', ru: 'R&B' }],
  ['hip-hop', { ka: 'ჰიპ-ჰოპი', en: 'Hip-Hop', ru: 'Хип-хоп' }],
  ['pop', { ka: 'პოპი', en: 'Pop', ru: 'Поп' }],
  ['electronic', { ka: 'ელექტრონული', en: 'Electronic', ru: 'Электроника' }],
  ['jazz', { ka: 'ჯაზი', en: 'Jazz', ru: 'Джаз' }],
  ['rock', { ka: 'როკი', en: 'Rock', ru: 'Рок' }],
  ['classical', { ka: 'კლასიკური', en: 'Classical', ru: 'Классика' }],
  ['trap', { ka: 'ტრეპი', en: 'Trap', ru: 'Трэп' }],
  ['reggae', { ka: 'რეგი', en: 'Reggae', ru: 'Регги' }],
  ['blues', { ka: 'ბლუზი', en: 'Blues', ru: 'Блюз' }],
  ['metal', { ka: 'მეტალი', en: 'Metal', ru: 'Метал' }],
  ['country', { ka: 'ქანთრი', en: 'Country', ru: 'Кантри' }],
  ['ambient', { ka: 'ემბიენტი', en: 'Ambient', ru: 'Эмбиент' }],
  ['lo-fi', { ka: 'ლო-ფაი', en: 'Lo-fi', ru: 'Лоу-фай' }],
  // ISSUE 6 — round the panel out to 19 genres (the horizontal chip strip already scrolls).
  ['soul', { ka: 'სოული', en: 'Soul', ru: 'Соул' }],
  ['funk', { ka: 'ფანკი', en: 'Funk', ru: 'Фанк' }],
  ['latin', { ka: 'ლათინური', en: 'Latin', ru: 'Латина' }],
  ['k-pop', { ka: 'K-Pop', en: 'K-Pop', ru: 'K-Pop' }],
];

// PHASE 31 — reasoning-backed one-tap Music presets. Each preset writes the FULL parameter set the
// panel + send() already consume (genre · tempo · duration · track-type · vocal), so a single tap
// gives a production-ready starting point without touching the Fine-tune dials. Weights are musically
// tuned: a cinematic score is instrumental + slow + long; an R&B core is a sung male mid-tempo hook;
// an ambient underscore is instrumental + slow + full-length. Purely additive — a preset is just state.
// The spread is deliberate: 2 instrumental + 3 sung, tempos spanning slow/medium/fast, 5 distinct
// genres, and the vocal surface exercised (male · duet · female). Genre values are exact MUSIC_STYLES ids.
type MusicPreset = {
  id: string;
  emoji: string;
  label: { ka: string; en: string; ru: string };
  genre: string;
  tempo: 'slow' | 'medium' | 'fast';
  duration: 0 | 15 | 30 | 60 | 90;
  instrumental: boolean;
  voiceType: 'female' | 'male' | 'duet';
};
const MUSIC_PRESETS: ReadonlyArray<MusicPreset> = [
  { id: 'hollywood-cinematic', emoji: '🎬', label: { ka: 'ჰოლივუდური კინო', en: 'Hollywood Cinematic', ru: 'Голливудское кино' }, genre: 'classical', tempo: 'slow', duration: 90, instrumental: true, voiceType: 'female' },
  { id: 'rnb-hiphop-core', emoji: '🎤', label: { ka: 'R&B / ჰიპ-ჰოპი', en: 'R&B / Hip-Hop Core', ru: 'R&B / Хип-хоп' }, genre: 'hip-hop', tempo: 'medium', duration: 30, instrumental: false, voiceType: 'male' },
  { id: 'documentary-ambient', emoji: '🌫️', label: { ka: 'დოკუმენტური ემბიენტი', en: 'Documentary Ambient', ru: 'Документальный эмбиент' }, genre: 'ambient', tempo: 'slow', duration: 0, instrumental: true, voiceType: 'female' },
  { id: 'retro-jazz-lounge', emoji: '🎷', label: { ka: 'რეტრო ჯაზ-ლაუნჯი', en: 'Retro Jazz Lounge', ru: 'Ретро джаз-лаунж' }, genre: 'jazz', tempo: 'slow', duration: 60, instrumental: false, voiceType: 'female' },
  { id: 'electronic-cyber', emoji: '🕹️', label: { ka: 'ელექტრონული კიბერ', en: 'Electronic Cyber', ru: 'Электронный кибер' }, genre: 'electronic', tempo: 'fast', duration: 60, instrumental: true, voiceType: 'female' },
];
const VIDEO_STYLES = ['Cinematic', 'Documentary', 'Anime', 'Vintage', 'Neon', 'Nature', 'Cyberpunk', 'Noir', 'Fantasy', 'Aerial', 'Realistic', 'Georgian', 'Dramatic', 'Romantic', 'Action', 'Horror', 'Comedy'] as const;

// A small, theme-tokenised option chip used by the per-service options bar.
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center justify-center rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors active:scale-95 ${active ? 'bg-app-accent/15 text-app-accent ring-1 ring-app-accent/40' : 'bg-app-elevated text-app-muted hover:text-app-text'}`}
      style={{ minHeight: 36 }}
    >
      {children}
    </button>
  );
}

// Collapsible options group — declutters the composer's option panel by folding an advanced /
// optional control cluster behind one labeled header. Mirrors the in-file imgNegative disclosure
// (same card chrome + ChevronDown rotate). `badge` surfaces the current selection while collapsed
// so nothing is hidden from the user's awareness. Manages its own open state (module-level
// component → no hooks-in-loop concern). Presentation only — the wrapped Chips/setters are untouched.
function Section({ title, badge, defaultOpen = false, children }: { title: React.ReactNode; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-[12.5px] font-semibold text-app-text">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">{title}</span>
          {badge != null && badge !== false && (
            <span className="truncate rounded-full bg-app-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-app-accent">{badge}</span>
          )}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-app-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

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
type ImageRegenSpec = { kind: 'image'; prompt: string; quality: ImgQuality; aspect: ImgAspect; style: string; referenceImage?: string; negativePrompt?: string };
type MusicRegenSpec = { kind: 'music'; prompt: string; genre: string; instrumental: boolean; lyrics?: string };
type RegenSpec = ImageRegenSpec | MusicRegenSpec;
// A grid of N image variations generated together (the ×2 / ×4 batch). Each tile
// fills in independently as its own parallel generation lands.
interface BatchTile { status: 'pending' | 'done' | 'failed'; url?: string; jobId?: string }
interface ImageBatch { spec: ImageRegenSpec; tiles: BatchTile[] }
// TASK 4 — Cinema-video parallelism gate. When ON, the flagship `renderFilm` dispatches
// through the Cap-3 queue (per-job signal + durable row + tray progress) so multiple films
// render at once. Default OFF via env → production is byte-identical to the legacy single-
// render path until `NEXT_PUBLIC_PARALLEL_CINEMA=1` is set (safe to deploy + type/Jest verify).
const ENABLE_PARALLEL_CINEMA = process.env.NEXT_PUBLIC_PARALLEL_CINEMA === '1';

// STEP 2 — immutable per-job snapshot of the ENTIRE video panel, captured at the millisecond of
// submit (startFilmRender) so a QUEUED cinema render uses the settings from its submit moment and
// NEVER inherits edits the user makes afterwards for their next film. Mirrors the product/swap
// snapshot pattern. renderFilm reads exclusively from this — no live-closure panel reads.
interface FilmSnap {
  videoTransition: 'crossfade' | 'cut' | 'dissolve' | 'zoom' | 'slide';
  videoMode: 'musicvideo' | 'documentary';
  videoStyle: string;
  videoDuration: 6 | 30 | 60;
  videoVocalGender: 'male' | 'female' | 'duet';
  videoLipsync: boolean;
  videoSoundtrack: { name: string; url: string; durationSec?: number; peaks?: number[]; previewUrl?: string } | null;
  videoMyVoiceNarration: boolean;
  videoSpeech: string;
  videoMusic: boolean;
  videoNarratorGender: 'male' | 'female';
  videoMultiChar: boolean;
  videoDialogue: string;
  videoSmartDuck: boolean;
  videoDuckDb: number;
  voiceLanguage: 'ka' | 'en' | 'ru';
  voicePersona: 'male' | 'female' | 'child' | 'elderly';
  voiceTone: 'epic' | 'emotional' | 'energetic';
  videoCameraMove: 'auto' | 'pan_left' | 'pan_right' | 'zoom_in' | 'zoom_out' | 'tilt_up' | 'tilt_down';
  videoMotionIntensity: number;
  videoModel: 'runway' | 'kling' | 'hailuo';
  hasTrainedVoice: boolean;
}

interface Msg { role: 'user' | 'assistant'; text: string; id?: string; medias?: Media[]; imageUrl?: string; audioUrl?: string; coverUrl?: string; engine?: string; videoUrl?: string; videoProgress?: number; storyboard?: { ordinal: number; beat?: string; frameUrl: string | null }[]; filmRoster?: FilmAgentVM[]; filmLog?: FilmLogLine[]; genKind?: 'image' | 'music' | 'video' | 'lipsync'; regen?: RegenSpec; batch?: ImageBatch; retryVideo?: boolean; retryReq?: { filmPrompt: string; refs: string[]; orientation: 'landscape' | 'vertical' | 'square' | 'portrait' }; remixOpKind?: string;
  /** Completed-film remix anchors: the per-scene landed clips + original brief, so the
   *  film bubble can offer a "remix" box (re-render only the edited scenes). */
  filmClips?: { ordinal: number; url: string }[]; filmPrompt?: string;
  /** Orientation of a video result, so the player uses the right aspect box on reload. */
  orientation?: 'landscape' | 'vertical' | 'square' | 'portrait' }

// Up to this many files/images (or one video) can ride along with a single message.
const MAX_ATTACHMENTS = 5;

const isImage = (m: string) => m.startsWith('image/');
const isAudio = (m: string) => m.startsWith('audio/');
const isVideo = (m: string) => m.startsWith('video/');

// Agent G granular reasoning steps (shown in the glowing overlay as the router orchestrates).
const AGENT_G_PHASES: { icon: string; ka: string; en: string; ru: string }[] = [
  { icon: '🔍', ka: 'მიმდინარეობს ბრძანების ანალიზი…', en: 'Parsing command parameters…', ru: 'Разбираю параметры команды…' },
  { icon: '⚙️', ka: 'ხდება AI მოდელების ინიციალიზაცია…', en: 'Spinning up specialized models…', ru: 'Запускаю нейромодели…' },
  { icon: '🎨', ka: 'მიმდინარეობს კრეატიული გენერაცია…', en: 'Rendering creative modifications…', ru: 'Генерирую творческие изменения…' },
  { icon: '💾', ka: 'ფაილი საიმედოდ ინახება ბიბლიოთეკაში…', en: 'Securely persisting final asset…', ru: 'Надёжно сохраняю результат…' },
  { icon: '🚀', ka: 'დასრულდა! სამუშაო სივრცე მზადაა…', en: 'Content ready. Refreshing workspace…', ru: 'Готово! Обновляю рабочую область…' },
];

// FIX 2 — Chat-mode video intent. When the user describes a video in plain Chat
// mode, the old behaviour was an inert text reply ("▶ Video Studio will…") that
// fired NOTHING. These detectors let the chat handler auto-route a strong video
// brief straight into the real Video Studio pipeline. Deliberately conservative:
// a bare "video" mention does NOT fire — it needs an explicit production cue (make
// a video / music video / short film / 30-second clip), in en/ka/ru.
function isVideoIntent(s: string): boolean {
  const b = (s || '').toLowerCase();
  if (/\b(music\s*video|video\s*clip|short\s*film|mini[\s-]?(movie|film))\b/.test(b)) return true;
  if (/\b(make|create|generate|produce|render|build|do)\b[\s\S]{0,48}\bvideo\b/.test(b)) return true;
  if (/\b(30|thirty)[\s-]?(second|sec|s)\b[\s\S]{0,40}\b(video|film|clip)\b/.test(b)) return true;
  // Georgian / Russian explicit cues.
  if (/მუსიკალური\s*ვიდეო|ვიდეო\s*კლიპ|შემიქმენ[\s\S]{0,40}ვიდეო|გააკეთ[\s\S]{0,40}ვიდეო|ფილმ/.test(s || '')) return true;
  if (/музыкальн\w*\s*клип|видеоклип|сними[\s\S]{0,30}видео|сделай[\s\S]{0,30}видео/.test(b)) return true;
  return false;
}
function isMusicVideoIntent(s: string): boolean {
  const b = (s || '').toLowerCase();
  return /\bmusic\s*video\b|\br&b\b|\brnb\b|\bsong\b|\bsinger\b|\bvocal|\blyric/.test(b)
    || /მუსიკალური\s*ვიდეო|სიმღერ|მომღერ|ვოკალ|ვიდეო\s*კლიპ/.test(s || '')
    || /музыкальн\w*\s*клип|видеоклип|песн\w|вокал|певиц/.test(b);
}

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

interface Conversation { id: string; title: string; messages: Msg[]; updatedAt: number; /** Supabase chat_sessions.session_id — set once a conversation is persisted/hydrated; enables cross-device merge + lazy transcript load. */ serverSid?: string }

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
// A stable per-scene id (session-unique, assigned once at creation) used as the React key so a
// drag-reorder MOVES the existing DOM node instead of reconciling content by position — this is what
// prevents the ~0.7s blur-up morph from re-firing on a branch-flip tile (the "no flicker" invariant).
let sceneUidSeq = 0;
const nextSceneUid = (): string => `sc${++sceneUidSeq}`;

interface StoryboardScene { uid: string; ordinal: number; beat: string; prompt: string; frameUrl: string | null; edited?: boolean; /** True when this scene's frame is a USER-uploaded anchor (vs AI-generated). */ anchored?: boolean; /** Per-scene base image (data URL) the user supplied to override this scene's identity reference. */ baseImage?: string }
interface StoryboardState {
  filmPrompt: string;
  refs: string[];
  orientation: 'landscape' | 'vertical' | 'square' | 'portrait';
  seed: number;
  scenes: StoryboardScene[];
  /** LLM story scenes (one per scene) — threaded to the render so clips match. A
   *  reordered/added scene may have no script (null) until it is re-rolled. */
  sceneScripts?: (string | null)[] | null;
  /** Per-scene frame-prompt for the streaming single-scene frame calls. */
  framePrompts?: Record<number, string>;
  /** Scene ordinals whose frame is still being generated (drives the N/M counter
   *  + per-tile spinner). Empty/undefined once every frame has settled. */
  pending?: number[];
  /** Prompt-Agent locked character fragment (from /api/film/storyboard scriptsOnly) —
   *  threaded to the render so the protagonist is identical across every clip. */
  character?: string | null;
}

/** Read a picked File into a data: URL (for the per-scene "Change Base Image"). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('read failed'));
    fr.readAsDataURL(file);
  });
}

// P9 — after a delete / reorder / add, renumber ordinals to 1..N and rebuild the
// per-scene maps so every lookup stays consistent with the new order:
//   • framePrompts is keyed by ordinal → re-key to the new ordinal.
//   • sceneScripts is POSITIONAL (index = scene position) → carry each scene's old
//     script to its new slot (a brand-new scene has no old index → null).
function commitSceneOrder(prev: StoryboardState, ordered: StoryboardScene[]): StoryboardState {
  const oldFP = prev.framePrompts ?? {};
  const oldScripts = prev.sceneScripts ?? [];
  const idxByOrd = new Map(prev.scenes.map((s, i) => [s.ordinal, i] as const));
  const framePrompts: Record<number, string> = {};
  const sceneScripts: (string | null)[] = [];
  const scenes = ordered.map((s, i) => {
    const newOrd = i + 1;
    const fp = oldFP[s.ordinal];
    if (fp) framePrompts[newOrd] = fp;
    const oldIdx = idxByOrd.get(s.ordinal);
    sceneScripts[i] = oldIdx != null ? oldScripts[oldIdx] ?? null : null;
    return { ...s, ordinal: newOrd };
  });
  return { ...prev, scenes, framePrompts, sceneScripts };
}

/**
 * SceneTile — one storyboard scene as a SMART, interactive skeleton (Master Prompt
 * v329 placeholder upgrade):
 *   • Loading/empty state is a shimmer-swept container, not a flat gray box.
 *   • Hover (or focus) over a placeholder reveals inline asset-override triggers —
 *     "Edit prompt" (focuses the shot field) and "Change base image" (per-scene
 *     identity upload). Clicking either INTERCEPTS this scene mid-generation and
 *     hot-reloads just its own agent thread; the rest of the board keeps streaming.
 *   • When the frame lands it MORPHS in via a blur-up (blurred+scaled → sharp), so
 *     an agent's delivery glides in with no layout pop (fixed-aspect container).
 */
function SceneTile({ s, t, portrait, pending, regenning, busy, index, total, structEnabled, onRegenScene, onEditScene, onView, onDelete, onMove, dragEnabled, dragActive, dragging, dragOver, onDragStartScene, onDragOverScene, onDropScene, onDragEndScene }: {
  s: StoryboardScene;
  t: (typeof COPY)[Lang];
  portrait: boolean;
  pending: boolean;
  regenning: boolean;
  busy: boolean;
  /** P9 — this scene's position (0-based) and the board size, for move-bound checks. */
  index: number;
  total: number;
  /** P9 — structural edits (move/delete) only once frames have settled (not streaming). */
  structEnabled: boolean;
  onRegenScene: (ordinal: number, baseImage?: string) => void;
  onEditScene: (ordinal: number, text: string) => void;
  onView: (url: string) => void;
  onDelete: (ordinal: number) => void;
  onMove: (ordinal: number, dir: -1 | 1) => void;
  /** Drag-to-reorder (desktop): enabled once the board has settled; touch keeps the chevron buttons. */
  dragEnabled: boolean;
  /** A SCENE drag is currently in flight — gates the card's drop handlers so native text drag-drop
   *  inside the prompt textarea (dragActive=false) is never suppressed. */
  dragActive: boolean;
  dragging: boolean;
  dragOver: boolean;
  onDragStartScene: (ordinal: number) => void;
  onDragOverScene: (ordinal: number) => void;
  onDropScene: (ordinal: number) => void;
  onDragEndScene: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pickBase = useCallback(() => fileRef.current?.click(), []);
  const focusPrompt = useCallback(() => {
    const el = taRef.current;
    if (el) { el.focus(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }, []);
  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { onRegenScene(s.ordinal, await fileToDataUrl(f)); } catch { /* ignore unreadable file */ }
  }, [onRegenScene, s.ordinal]);
  // Motion cue — derived from this scene's own visible text (no server field is threaded to
  // the client board). null ⇒ no chip (a missing cue beats a wrong one). See lib/chat/cameraCue.
  const cam = inferCameraMove(s.beat, s.prompt);

  return (
    <div
      ref={cardRef}
      onDragOver={dragEnabled && dragActive ? (e) => { e.preventDefault(); onDragOverScene(s.ordinal); } : undefined}
      onDrop={dragEnabled && dragActive ? (e) => { e.preventDefault(); onDropScene(s.ordinal); } : undefined}
      onDragEnd={dragActive ? onDragEndScene : undefined}
      className={`flex flex-col overflow-hidden rounded-xl border bg-app-elevated shadow-[0_4px_16px_rgba(0,0,0,0.13)] transition-[opacity,box-shadow,border-color] duration-150 ${dragging ? 'opacity-40' : ''} ${dragOver ? 'border-app-accent ring-2 ring-app-accent/60' : 'border-app-border/15'}`}
    >
      <div className={`group/media relative ${portrait ? 'aspect-[9/16]' : 'aspect-video'} bg-app-surface`}>
        {/* AI-generated indicator — kept clear of the re-roll button (top-right). The ANCHORED case gets the
            prominent "Source Reference Locked" badge below instead. */}
        {s.frameUrl && !s.anchored && (
          <span title="AI-generated"
            className="pointer-events-none absolute right-9 top-1.5 z-20 rounded-full bg-app-accent/25 px-1.5 py-0.5 text-[10px] font-semibold text-app-accent ring-1 ring-app-accent/40">🤖</span>
        )}
        {/* V1 — "Origin Identity Anchor Locked": this scene's frame IS the user's exact uploaded
            image (P78 `lockScene1`). Glowing emerald metadata chip so the identity lock reads as held. */}
        {s.frameUrl && s.anchored && (
          // max-width reserves room on the right for the camera badge ONLY when one is present,
          // so the two bottom-row chips never overlap (adversarial-review fix, P85).
          <span title={t.sbAnchorLocked}
            className={`mya-anchor-glow pointer-events-none absolute bottom-1.5 left-1.5 z-20 inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ring-1 ring-emerald-300/60 ${cam ? 'max-w-[calc(100%-88px)]' : 'max-w-[calc(100%-16px)]'}`}
            style={{ animation: 'mya-anchor-glow 2.6s ease-in-out infinite' }}>
            <span className="truncate">{t.sbAnchorLocked}</span>
          </span>
        )}
        {/* V1 — motion cue: a soft camera-move badge derived from the scene's text. */}
        {cam && (
          <span title={`Camera: ${cam}`}
            className="pointer-events-none absolute bottom-1.5 right-1.5 z-20 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[9.5px] font-semibold text-white/90 ring-1 ring-white/10 backdrop-blur-sm">
            🎥 {cam}
          </span>
        )}
        {s.frameUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={s.frameUrl}
            alt={`${t.sbScene} ${s.ordinal}`}
            onClick={() => s.frameUrl && onView(s.frameUrl)}
            // BLUR-UP morph: mounts blurred + slightly scaled, resolves sharp on load.
            className="h-full w-full cursor-zoom-in object-cover opacity-0 blur-md scale-[1.04] [transition:opacity_.6s_ease,filter_.7s_ease,transform_.7s_ease]"
            onLoad={(e) => { const el = e.currentTarget; el.style.opacity = '1'; el.style.filter = 'blur(0)'; el.style.transform = 'scale(1)'; }}
          />
        ) : (
          // SMART SKELETON — shimmer-swept, not a flat gray box.
          <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-app-elevated to-app-surface">
            <div className="pointer-events-none absolute inset-0 animate-[tile-shimmer_1.6s_linear_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            {pending ? (
              <>
                <Loader2 size={18} className="animate-spin text-app-accent/70" />
                <span className="text-[10px] font-medium text-app-muted/70">{t.sbScene} {s.ordinal} · {t.sbGenerating}…</span>
              </>
            ) : (
              <>
                <ImageIcon size={18} className="text-app-muted/40" />
                {/* Settled board (structEnabled) → this empty scene auto-fills at render, so say so
                    instead of the ambiguous "no frame" that reads as broken. Mid-stream → "no frame". */}
                <span className="px-2 text-center text-[10px] leading-tight text-app-muted/45">{structEnabled ? t.sbAutoFill : t.sbEmpty}</span>
              </>
            )}
          </div>
        )}

        {/* INTERACTIVE HOVER / MID-GENERATION INTERCEPT — only over a placeholder. */}
        {!s.frameUrl && !regenning && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/45 opacity-0 backdrop-blur-[1px] transition-opacity duration-200 group-hover/media:opacity-100 focus-within:opacity-100">
            <button type="button" onClick={focusPrompt} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/92 px-3 py-1.5 text-[11px] font-semibold text-black shadow transition-transform active:scale-95 disabled:opacity-50">
              <Pencil size={12} /> {t.sbEditPromptAction}
            </button>
            <button type="button" onClick={pickBase} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3 py-1.5 text-[11px] font-semibold text-app-bg shadow transition-transform active:scale-95 disabled:opacity-50">
              <Upload size={12} /> {t.sbChangeBaseAction}
            </button>
          </div>
        )}

        {/* VECTOR 3 — explicit frame index (#1, #2…) + per-clip duration tag. */}
        <span className="absolute left-1.5 top-1.5 z-20 flex items-center gap-1">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">#{s.ordinal}</span>
          <span className="rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white/85">⏳{FILM_CLIP_SEC}s</span>
        </span>
        <button type="button" onClick={() => onRegenScene(s.ordinal)} disabled={busy} aria-label={t.sbReroll} title={t.sbReroll}
          className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-all duration-200 hover:bg-app-accent hover:text-app-bg active:scale-90 disabled:opacity-40 touch-manipulation before:absolute before:-inset-2 before:content-['']">
          <RotateCcw size={13} />
        </button>
        {s.baseImage && (
          <span className="absolute bottom-1.5 left-1.5 z-20 inline-flex items-center gap-1 rounded-full bg-app-accent/85 px-2 py-0.5 text-[9px] font-semibold text-app-bg" title={t.sbChangeBaseAction}>
            <ImageIcon size={9} /> base
          </span>
        )}
        {regenning && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 bg-black/60"><Loader2 size={20} className="animate-spin text-white" /><span className="text-[10px] font-medium text-white/85">{t.sbRegen}…</span></div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <p className="text-[11.5px] font-semibold leading-snug text-app-text">{s.beat}</p>
        <textarea
          ref={taRef}
          value={s.prompt}
          onChange={(e) => onEditScene(s.ordinal, e.target.value)}
          rows={4}
          placeholder={t.sbEditHint}
          aria-label={`${t.sbScene} ${s.ordinal}`}
          className="min-h-[72px] w-full flex-1 resize-y rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[12px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted/45 focus:border-app-accent/60 focus:bg-app-bg/70 focus:ring-2 focus:ring-app-accent/25"
        />
        <button type="button" onClick={() => onRegenScene(s.ordinal)} disabled={busy}
          className="inline-flex items-center justify-center gap-1 rounded-md bg-app-bg/40 px-2 py-1 text-[10.5px] font-medium text-app-muted transition-all duration-200 hover:bg-app-accent/15 hover:text-app-accent active:scale-95 disabled:opacity-40">
          <RotateCcw size={11} /> {t.sbRegen}
        </button>
        {/* P9 — reorder (earlier/later) + delete, enabled once frames have settled. */}
        {structEnabled && (
          <div className="flex items-center gap-1">
            {/* Desktop drag handle — grab to reorder (HTML5 DnD). The chevrons below cover touch + keyboard. */}
            <span role="button" aria-label={t.sbDrag} title={t.sbDrag} draggable={dragEnabled}
              onDragStart={dragEnabled ? (e) => {
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', String(s.ordinal)); } catch { /* noop */ }
                if (cardRef.current) { try { e.dataTransfer.setDragImage(cardRef.current, 24, 24); } catch { /* noop */ } }
                onDragStartScene(s.ordinal);
              } : undefined}
              className={`flex h-7 w-8 shrink-0 select-none items-center justify-center rounded-md bg-app-bg/40 text-app-muted transition-all duration-200 ${dragEnabled ? 'cursor-grab hover:bg-app-accent/15 hover:text-app-accent active:cursor-grabbing' : 'cursor-default opacity-40'}`}>
              <GripVertical size={14} />
            </span>
            <button type="button" onClick={() => onMove(s.ordinal, -1)} disabled={busy || index === 0} aria-label={t.sbMoveEarlier} title={t.sbMoveEarlier}
              className="flex h-7 flex-1 items-center justify-center rounded-md bg-app-bg/40 text-app-muted transition-all duration-200 hover:bg-app-accent/15 hover:text-app-accent active:scale-95 disabled:opacity-30 touch-manipulation">
              <ChevronLeft size={14} />
            </button>
            <button type="button" onClick={() => onMove(s.ordinal, 1)} disabled={busy || index === total - 1} aria-label={t.sbMoveLater} title={t.sbMoveLater}
              className="flex h-7 flex-1 items-center justify-center rounded-md bg-app-bg/40 text-app-muted transition-all duration-200 hover:bg-app-accent/15 hover:text-app-accent active:scale-95 disabled:opacity-30 touch-manipulation">
              <ChevronRight size={14} />
            </button>
            <button type="button" onClick={() => onDelete(s.ordinal)} disabled={busy || total <= 2} aria-label={t.sbDeleteScene} title={t.sbDeleteScene}
              className="flex h-7 flex-1 items-center justify-center rounded-md bg-app-bg/40 text-app-muted transition-all duration-200 hover:bg-red-500/15 hover:text-red-400 active:scale-95 disabled:opacity-30 touch-manipulation">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Full-screen review surface: the six planned scenes + a frame each. The user
// approves (→ render the film anchored to these frames), regenerates, or cancels.
function StoryboardOverlay({ sb, t, locale, busy, regenningOrdinal, onGenerate, onRegenerate, onRegenScene, onEditScene, onView, onCancel, onDelete, onMove, onReorder, onAddScene }: {
  sb: StoryboardState;
  t: (typeof COPY)[Lang];
  locale: Lang;
  busy: boolean;
  /** The scene ordinal currently re-rolling its frame (null = none). */
  regenningOrdinal: number | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  onRegenScene: (ordinal: number, baseImage?: string) => void;
  onEditScene: (ordinal: number, text: string) => void;
  onView: (url: string) => void;
  onCancel: () => void;
  onDelete: (ordinal: number) => void;
  onMove: (ordinal: number, dir: -1 | 1) => void;
  onReorder: (from: number, to: number) => void;
  onAddScene: () => void;
}) {
  const portrait = sb.orientation === 'vertical';
  const pending = sb.pending ?? [];
  const total = sb.scenes.length;
  const loaded = sb.scenes.filter((s) => s.frameUrl).length;
  const streaming = pending.length > 0; // frames are still arriving
  // Drag-to-reorder state (desktop). dragOrd = the scene being dragged; overOrd = the current drop
  // target (deduped on set so the continuous dragover stream never re-renders on an unchanged target).
  const [dragOrd, setDragOrd] = useState<number | null>(null);
  const [overOrd, setOverOrd] = useState<number | null>(null);
  const dragEnabled = !streaming && !busy && regenningOrdinal === null;
  const prog = total > 0 ? loaded / total : 0;
  // V2 — the Cinematic Compiling Core's hue tracks REAL frame progress (not a fabricated state
  // machine): early → Deep Azure (planning/optimizing), mid → Emerald (identity-locked frames
  // landing), near-done → Amber (ready to compile the video). Honest signal → honest colour.
  const coreColor = prog >= 0.8 ? '#f59e0b' : prog >= 0.4 ? '#10b981' : '#2563eb';
  const pkgSec = total * FILM_CLIP_SEC; // package length: 1→~5s · 6→30s · 12→60s
  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-app-bg/95 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="mx-auto flex h-full w-full max-w-3xl flex-col">
        <div className="flex items-start justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-app-text">📋 {t.sbTitle}</h2>
              {/* Package length chip — makes the 6s / 30s / 60s worktree explicit. */}
              <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-app-muted ring-1 ring-app-border/15">{pkgSec}s · {total}×{FILM_CLIP_SEC}s</span>
            </div>
            {streaming ? (
              // V2 — Cinematic Compiling Core: a pulsing radial glow whose hue tracks real progress.
              <div className="mt-1 flex items-center gap-2">
                <span className="relative flex h-5 w-5 items-center justify-center">
                  <span className="mya-core-pulse absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${coreColor} 0%, transparent 70%)`, animation: 'mya-core-pulse 1.6s ease-in-out infinite' }} />
                  <span className="relative h-2 w-2 rounded-full" style={{ background: coreColor, boxShadow: `0 0 8px ${coreColor}` }} />
                </span>
                <span className="text-[12px] font-medium" style={{ color: coreColor }}>{t.sbCompiling} · <span className="tabular-nums">{loaded}/{total}</span> {t.sbFrames}</span>
              </div>
            ) : (
              <p className="truncate text-[12px] text-app-muted">{t.sbReview}</p>
            )}
          </div>
          <button type="button" onClick={onCancel} aria-label={t.sbCancel} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-muted transition-all duration-200 hover:bg-app-elevated hover:text-app-text active:scale-90 touch-manipulation sm:h-8 sm:w-8">
            <X size={18} />
          </button>
        </div>
        {/* V3 — pipeline lane: Script → Storyboard → Render, so the typed script visibly maps onto
            the compiled sequence. Storyboard is the live stage; Render is the next tap (Generate). */}
        <div className="flex items-center gap-1.5 px-4 pb-1 text-[10.5px] font-semibold uppercase tracking-wide">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400 ring-1 ring-emerald-400/30"><Check size={10} /> {t.sbPipeScript}</span>
          <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-emerald-400/40 to-app-accent/40" />
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ${streaming ? 'bg-app-accent/15 text-app-accent ring-app-accent/40' : 'bg-emerald-500/15 text-emerald-400 ring-emerald-400/30'}`}>{streaming ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} {t.sbPipeBoard}</span>
          <span aria-hidden className={`h-px flex-1 ${streaming ? 'bg-app-border/20' : 'bg-gradient-to-r from-app-accent/40 to-app-accent/60'}`} />
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ${streaming ? 'bg-app-elevated text-app-muted/60 ring-app-border/15' : 'bg-app-accent/15 text-app-accent ring-app-accent/40'}`}><Film size={10} /> {t.sbPipeRender}</span>
        </div>
        {/* Live frame-load progress — a hue-shifting bar (azure → compiling-core hue) fills as
            each scene's frame streams in. */}
        {streaming && (
          <div className="mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-app-border/15">
            <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.max(5, Math.round(prog * 100))}%`, background: `linear-gradient(90deg, #2563eb, ${coreColor})` }} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sb.scenes.map((s, i) => (
              <SceneTile
                key={s.uid}
                s={s}
                t={t}
                portrait={portrait}
                pending={pending.includes(s.ordinal)}
                regenning={regenningOrdinal === s.ordinal}
                busy={busy || regenningOrdinal !== null}
                index={i}
                total={total}
                structEnabled={!streaming}
                onRegenScene={onRegenScene}
                onEditScene={onEditScene}
                onView={onView}
                onDelete={onDelete}
                onMove={onMove}
                dragEnabled={dragEnabled}
                dragActive={dragOrd !== null}
                dragging={dragOrd === s.ordinal}
                dragOver={overOrd === s.ordinal && dragOrd !== null && dragOrd !== s.ordinal}
                onDragStartScene={(ord) => setDragOrd(ord)}
                onDragOverScene={(ord) => setOverOrd((p) => (p === ord ? p : ord))}
                onDropScene={(ord) => { if (dragOrd !== null) onReorder(dragOrd, ord); setDragOrd(null); setOverOrd(null); }}
                onDragEndScene={() => { setDragOrd(null); setOverOrd(null); }}
              />
            ))}
            {/* P9 — append a new scene (max 8). Disabled while frames are still streaming. */}
            {!streaming && total < 8 && (
              <button
                type="button"
                onClick={onAddScene}
                disabled={busy || regenningOrdinal !== null}
                className={`flex ${portrait ? 'aspect-[9/16]' : 'aspect-video'} flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-app-border/25 bg-app-elevated/40 text-app-muted transition-all duration-200 hover:border-app-accent/50 hover:bg-app-accent/[0.06] hover:text-app-accent active:scale-[0.98] disabled:opacity-40 touch-manipulation`}
              >
                <Plus size={22} />
                <span className="text-[11px] font-medium">{t.sbAddScene}</span>
              </button>
            )}
          </div>
        </div>
        {/* Pre-render clarity: how many frames are truly ready (empty tiles auto-fill server-side, so
            they aren't broken), plus an honest heads-up that render takes minutes + a completion notice
            (the P91 background-completion toast). Only once frames have settled — hidden while streaming. */}
        {!streaming && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 pb-1 text-[11px]">
            <span className={`inline-flex items-center gap-1 font-semibold ${loaded === total ? 'text-emerald-400' : 'text-amber-400'}`}>
              <Check size={11} /> <span className="tabular-nums">{loaded}/{total}</span> {t.sbReady}
            </span>
            {loaded < total && <span className="text-app-muted">· {total - loaded} {t.sbAutoFill}</span>}
            <span className="text-app-muted/70">· ⏱ {t.sbRenderNote}</span>
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-app-border/10 px-4 py-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <button type="button" onClick={onRegenerate} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-4 py-2.5 text-[13px] font-medium text-app-text transition-all duration-200 hover:bg-app-border/10 active:scale-95 disabled:opacity-50">
            <RotateCcw size={15} /> {t.sbRegen}
          </button>
          <button type="button" onClick={onGenerate} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-app-accent px-4 py-2.5 text-[13.5px] font-semibold text-app-bg transition-all duration-200 hover:opacity-90 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50">
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
  // Mirror of `messages` for the mount-hydration effect below (reads the current view without a
  // stale-closure / exhaustive-deps churn).
  const messagesRef = useRef<Msg[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
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
  const [mode, setMode] = useState<'chat' | 'image' | 'music' | 'video' | 'lipsync' | 'remix' | 'surgical'>('chat');
  // "Open in Editor" bridge — a generated asset forwarded from a chat bubble into the Surgical Editor. Agent G may
  // additionally seed `autoActions` (a chain) so the editor auto-runs the AI op(s) (remove_bg → upscale …) on arrival.
  const [editorAsset, setEditorAsset] = useState<{ url: string; kind: 'video' | 'image' | 'audio'; autoActions?: string[] } | null>(null);
  // Agent G — glowing granular loader while the router classifies + orchestrates. `agentGPhase` drives the step text.
  const [agentGBusy, setAgentGBusy] = useState(false);
  const [agentGPhase, setAgentGPhase] = useState(0);
  // Drag-over overlay — a frosted-glass "drop your file here" affordance shown while a
  // FILE is dragged anywhere over the chat surface. `dragDepthRef` counts enter/leave so
  // moving across child elements doesn't flicker the overlay (dragleave fires per child).
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
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
  // VECTOR 3 — when the mobile keyboard is up, the shell shrinks (ChatChrome subtracts this), but a
  // dvh-based options panel does NOT, so it overflows the reduced shell and buries the composer.
  // We cap the panel to the space actually left below the keyboard (see the panel's inline style).
  const { keyboardOffset } = useKeyboardResilience();
  // Transient toast (e.g. "link copied") shown after a share falls back to clipboard.
  const [shareToast, setShareToast] = useState<string | null>(null);
  // FIX 5 — URLs the user has explicitly filed into the Library (drives the ✓ saved state).
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());
  // Credit-deduction toast — shown briefly after each successful generation
  // ("−N credits · X.XX ₾"). Pricing is centralised in lib/credits/pricing.ts; the
  // real balance is still the GEL wallet (the ₾ pill re-reads it on the next open).
  const [creditToast, setCreditToast] = useState<{ credits: number; balanceGel: number | null } | null>(null);
  // Single dismiss timer — cleared before rescheduling so overlapping generations don't stack stale timers
  // that prematurely hide a newer toast (V4).
  const creditToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── Video Remix mode — upload an existing video and edit it ──
  const [remixVideo, setRemixVideo] = useState<{ name: string; url: string } | null>(null);
  const [remixVideoBusy, setRemixVideoBusy] = useState(false);
  const [remixOp, setRemixOp] = useState<'restyle' | 'character' | 'captions' | 'voiceover' | 'music' | 'redub' | 'trim'>('restyle');
  const [remixText, setRemixText] = useState('');
  const [remixGender, setRemixGender] = useState<'female' | 'male'>('female');
  const [remixAspect, setRemixAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [remixTrack, setRemixTrack] = useState<{ name: string; url: string } | null>(null);
  const [remixTrimStart, setRemixTrimStart] = useState(0);
  const [remixTrimDur, setRemixTrimDur] = useState(10);
  const [remixBusy, setRemixBusy] = useState(false);

  // Credit-deduction toast for a finished generation. Pricing lives in
  // lib/credits/pricing.ts (single source of truth); the GEL wallet stays the real
  // balance. Declared above renderFilm/send so both can reference it.
  const notifyCredit = useCallback((kind: 'image' | 'music' | 'video' | 'avatar' | 'remix', opts?: { seconds?: number; count?: number }) => {
    const credits = creditCostFor(kind, opts);
    if (credits <= 0) return;
    // PHASE 4 Task 1 — track the generation (fail-silent). One hook covers every kind.
    // notifyCredit is declared before the video panel state, so only call params are
    // referenced here (duration rides in via opts.seconds); the event + credits cost
    // is the core metric.
    if (kind === 'music') track('music_generated', { credits });
    else if (kind === 'image') track('image_generated', { count: opts?.count ?? 1 });
    else if (kind === 'video' || kind === 'avatar') track('video_generated', { duration: opts?.seconds ?? null, credits });
    setCreditToast({ credits, balanceGel: null });
    // V4 — a spend just landed server-side; tell the app shell to re-read the header ₾ pill
    // so the balance visibly drops (the shell only refreshed on mount/auth/modal-close before,
    // which is why generations looked like they never deducted).
    try { window.dispatchEvent(new Event('myavatar:credits-updated')); } catch { /* ignore */ }
    // PHASE 3 Task 3 — file a "your <kind> is ready" notification (fail-open if the
    // notifications table isn't migrated). avatar/remix read as video to the user.
    const notifType: 'video' | 'music' | 'image' = kind === 'music' ? 'music' : kind === 'image' ? 'image' : 'video';
    const readyMsg = notifType === 'music'
      ? (locale === 'en' ? 'Your music is ready! 🎵' : locale === 'ru' ? 'Музыка готова! 🎵' : 'მუსიკა მზადაა! 🎵')
      : notifType === 'image'
        ? (locale === 'en' ? 'Your image is ready! 🖼' : locale === 'ru' ? 'Изображение готово! 🖼' : 'სურათი მზადაა! 🖼')
        : (locale === 'en' ? 'Your video is ready! 🎬' : locale === 'ru' ? 'Ваше видео готово! 🎬' : 'თქვენი ვიდეო მზადაა! 🎬');
    const fileNotif = (type: string, message: string) => {
      void fetch('/api/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ type, message }),
      }).then(() => { try { window.dispatchEvent(new Event('myavatar:notifications-refresh')); } catch { /* ignore */ } }).catch(() => {});
    };
    fileNotif(notifType, readyMsg);
    // PHASE 20 — also fire a NATIVE OS-level notification (like ChatGPT/Gemini) so a user who
    // tabbed away gets alerted the moment the asset lands. Reuses the already-localized readyMsg
    // and fires for every kind (this is the single completion choke point). Best-effort + no-op
    // unless the user granted permission (requested on the Generate gesture); the in-app bell
    // above stays as the universal fallback. See lib/notify/browserNotify for the honest limits
    // (backgrounded tab: yes · fully-closed tab / iOS Safari tab: needs a PWA + Web Push).
    void fireCompletionNotification({ title: 'MyAvatar', body: readyMsg, tag: notifType });
    // Pull the live balance for the toast's "balance" line + a low-credit warning.
    void (async () => {
      try {
        const res = await fetch('/api/credits/balance', { cache: 'no-store', credentials: 'include' });
        const j = (await res.json().catch(() => ({}))) as { balance?: number | null };
        if (typeof j?.balance === 'number') {
          setCreditToast((c) => (c ? { ...c, balanceGel: j.balance as number } : c));
          // Credits low: warn under ~1 ₾ (≈10 credits at 0.10 ₾/cr).
          if (j.balance < 1) fileNotif('credits_low', locale === 'en' ? 'Credits almost out ⚠️' : locale === 'ru' ? 'Кредиты заканчиваются ⚠️' : 'კრედიტები თითქმის ამოიწურა ⚠️');
        }
      } catch { /* fail-soft */ }
    })();
    // Record the spend in credit_transactions (fail-open if the table/route is absent).
    void fetch('/api/credits/record', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action: kind, creditsDelta: -credits }),
    }).catch(() => {});
    if (creditToastTimerRef.current) clearTimeout(creditToastTimerRef.current);
    creditToastTimerRef.current = setTimeout(() => setCreditToast(null), 4000);
  }, [locale]);
  // Iteration 2 Phase 6 — silently file a result into the Library. Image / music / film
  // already persist server-side via the produce routes; remix / character-swap / product-ad
  // results do NOT, so they'd be lost on reload. Fail-open + silent (the explicit "save"
  // button at saveToLibrary stays for everything else). Stable ([] deps) so call sites can
  // use it freely without dependency churn.
  const autoSaveToLibrary = useCallback((url: string | null | undefined, kind: 'film' | 'image' | 'music' = 'film', prompt?: string) => {
    if (!url || !/^https?:\/\//.test(url)) return;
    void fetch('/api/studio/library', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ url, kind, ...(prompt ? { prompt } : {}) }),
    }).then((res) => {
      // Remix persistence last-mile — tell an OPEN Library panel to refetch so a just-generated render appears
      // instantly. Only fire on a CONFIRMED save (res.ok): a failed save (400/502) must NOT trigger a refetch,
      // which would collapse the user's infinite-scrolled library back to page 0.
      if (res.ok) { try { window.dispatchEvent(new Event('myavatar:library-updated')); } catch { /* ignore */ } }
    }).catch(() => {});
  }, []);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  // Read-aloud phase for the speaking bubble — 'loading' while eleven_v3 synthesises
  // (a few seconds), 'playing' once audio starts. Drives the dynamic listen button.
  const [speakPhase, setSpeakPhase] = useState<'loading' | 'playing' | null>(null);
  // Remix: per-film-bubble edit draft + which film is currently remixing.
  const [remixDrafts, setRemixDrafts] = useState<Record<number, string>>({});
  const [remixBusyIdx, setRemixBusyIdx] = useState<number | null>(null);
  // P10 — which result bubble is showing its remix CONFIRM preview (scene diff).
  const [remixPreviewIdx, setRemixPreviewIdx] = useState<number | null>(null);
  // Inline edit-&-resend of a user turn: which message is being edited + its draft.
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  // Resolver for the CURRENTLY-playing chunk's await — invoked on stop / message-switch so the loop unblocks and its
  // blob URL is revoked (pause/src-swap fire neither `ended` nor `error`, so without this the promise + URL leak).
  const ttsResolveRef = useRef<(() => void) | null>(null);
  // Monotonic token so a tap that cancels (or supersedes) an in-flight read-aloud
  // doesn't let the orphaned fetch start playing after the user moved on.
  const ttsTokenRef = useRef(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // v330 — dedicated hidden inputs for the Video panel's asset slots: a single
  // Character Reference image and a custom Audio Track (beat/song), each kept
  // separate from the shared attachment picker so they read as their own slots.
  const charFileRef = useRef<HTMLInputElement | null>(null);
  // When true, the next character-photo upload REPLACES the array (videoswap = single
  // photo); when false it APPENDS (film character-ref = up to 3 slots).
  const charReplaceRef = useRef(false);
  const audioFileRef = useRef<HTMLInputElement | null>(null);
  const scriptFileRef = useRef<HTMLInputElement | null>(null);
  // Camera capture (mobile): shoot a photo in-app → it seeds the attachment tray (and,
  // in Video mode, becomes the start image that anchors the storyboard).
  const cameraRef = useRef<HTMLInputElement | null>(null);
  // v330 — Avatar/lip-sync face: a scoped single-IMAGE picker (the slot can't ingest
  // PDFs/audio/multiples the way the shared attach button could).
  const lipsyncFaceRef = useRef<HTMLInputElement | null>(null);
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
  // Set true by send() so any in-flight/queued transcription result is DISCARDED
  // instead of re-populating the input after we've cleared it. Reset to false when
  // a new dictation starts. (Without this the record-and-transcribe fallback kept
  // streaming the spoken text back into the composer right after sending it.)
  const sttDiscardRef = useRef(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Composer wrapper height → anchors the scroll-to-bottom FAB just above it, so the
  // FAB never overlaps a grown composer (multi-line draft, attachments, open options).
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [composerH, setComposerH] = useState(96);
  // Stop / cancel plumbing. `abortRef` aborts the in-flight fetch; `genIdRef` is a
  // monotonic generation token — every finalizer checks it so a STOPPED or
  // superseded request can never clobber a newer message (or re-clear `busy`).
  const abortRef = useRef<AbortController | null>(null);
  const genIdRef = useRef(0);
  // Always-current mirror of `busy || storyboardBusy || remixBusy` (set by the loading-bar
  // effect below) so the legacy single-render entry points can reject a second parallel run
  // with a friendly toast, stale-closure-free. (Product ad is queue-governed now, not here.)
  const genActiveRef = useRef(false);
  // Abort handle for the (non-streaming) storyboard request, so Cancel can stop it.
  const storyboardAbortRef = useRef<AbortController | null>(null);
  // FIX 4 — the last video request (prompt + refs + orientation), captured so a failed
  // render can be retried in one click without the user re-typing or re-uploading.
  const lastVideoReqRef = useRef<{ filmPrompt: string; refs: string[]; orientation: 'landscape' | 'vertical' | 'square' | 'portrait' } | null>(null);
  // Live elapsed seconds during a generation — drives the progress clock + bar.
  const [elapsed, setElapsed] = useState(0);
  const genStartRef = useRef(0);
  // FIX 4 — per-result video duration (read from the player) for the result-card badge.
  const [videoResultDur, setVideoResultDur] = useState<Record<number, number>>({});
  // Live Director's-Console status for the post-assemble Lip-Sync agent (the music-video
  // singer sync). 'skipped' when no lip-sync is wanted; flips queued→processing→completed.
  const lipsyncStageRef = useRef<FilmAgentStatus>('idle');
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
  // P5 — Chat: response language (auto = reply in the user's language) + model tier.
  const [chatLang, setChatLang] = useState<'auto' | 'ka' | 'en' | 'ru'>('auto');
  const [chatTier, setChatTier] = useState<'standard' | 'pro'>('standard');
  // P7 — negative prompt (what to avoid), expandable below the main prompt.
  const [imgNegative, setImgNegative] = useState('');
  const [imgNegativeOpen, setImgNegativeOpen] = useState(false);
  // PHASE 29 (VECTOR 1) — Script-to-Storyboard: paste a script + pick a duration; the storyboard route
  // decomposes it into N identity-anchored scenes, then "Export to Video Studio" bridges the whole grid.
  const [imgBoardOpen, setImgBoardOpen] = useState(false);
  const [imgBoardScript, setImgBoardScript] = useState('');
  const [imgBoardDuration, setImgBoardDuration] = useState<30 | 60>(30);
  const [imgBoardBusy, setImgBoardBusy] = useState(false);
  // PHASE 36 — the compiled scene tiles (script + the RENDERED identity-locked frame), shown IN the Image
  // Studio for review BEFORE export. `imgBoardScenes` populated ⇒ frames were generated; export bridges them.
  const [imgBoardScenes, setImgBoardScenes] = useState<StoryboardMatrixCell[]>([]);
  const [imgBoardCharacter, setImgBoardCharacter] = useState<string | undefined>(undefined);
  // Default to VOCALS now that the redesigned Music panel has no instrumental/vocal
  // toggle (a vocal R&B/pop track is the common case; the model writes lyrics from the
  // prompt). Describe "instrumental …" in the prompt for an instrumental bed.
  const [musicInstrumental, setMusicInstrumental] = useState(false);
  const [musicGenre, setMusicGenre] = useState<string>('r&b');
  // Redesigned Music-panel prompt (Section C) — its OWN field so it never mirrors the
  // shared composer pill; the Generate button threads it into send() as promptOverride.
  const [musicPrompt, setMusicPrompt] = useState('');
  // Custom lyrics for vocal tracks — empty means Udio writes the lyrics from the prompt.
  const [musicLyrics, setMusicLyrics] = useState('');
  // With an audio attached in Music mode: 'cover' remixes its melody (MusicGen);
  // 'voice' clones the uploaded VOICE and sings the lyrics in it (MiniMax music-01).
  const [musicAudioMode, setMusicAudioMode] = useState<'cover' | 'voice'>('cover');
  // P6 — track length + tempo, passed to /api/ai/music (durationSec + tempo).
  // FIX 2 — duration 0 = "full song": skip the ffmpeg trim, keep Udio's full ~2-4 min output.
  const [musicDuration, setMusicDuration] = useState<0 | 15 | 30 | 60 | 90>(30);
  const [musicTempo, setMusicTempo] = useState<'slow' | 'medium' | 'fast'>('medium');
  // Sung-vocal gender when the track is a SONG (not instrumental). Maps to vocal
  // descriptors appended to the music prompt server-side (female/male/duet).
  const [musicVoiceType, setMusicVoiceType] = useState<'female' | 'male' | 'duet'>('female');
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
  // v330 — default to 9:16 vertical (mobile-first full-screen); Music Video Mode forces it.
  // 16:9 landscape · 9:16 vertical · 1:1 square · 4:5 portrait. The render pipeline
  // currently masters landscape/vertical, so square/portrait map to the nearest
  // (vertical) at dispatch — the selector still records the user's exact choice.
  const [videoOrientation, setVideoOrientation] = useState<'landscape' | 'vertical' | 'square' | 'portrait'>('vertical');
  const [videoStyle, setVideoStyle] = useState<string>('Cinematic');
  // Spoken voice for the film — ON by default so the character actually TALKS (and,
  // with the lip-sync pass, the lips move with it). When on, a localized cue is
  // appended to the brief so the pipeline generates a voice-over + lip-syncs the master.
  const [videoNarration, setVideoNarration] = useState(true);
  // Narrate the film in the user's TRAINED voice (RVC) — needs a trained model.
  const [videoMyVoiceNarration, setVideoMyVoiceNarration] = useState(false);
  // Lip-sync "dub from text" → speak the typed script in the user's TRAINED voice (RVC).
  const [lipMyVoice, setLipMyVoice] = useState(false);
  // Avatar mode: cloned-voice gender + output format (the panel's selectable options).
  const [lipGender, setLipGender] = useState<'female' | 'male'>('female');
  const [lipFormat, setLipFormat] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  // P8 — selected built-in avatar preset (a /public path used as the talking face).
  // Mutually exclusive with an uploaded face: picking one clears the other.
  const [lipPreset, setLipPreset] = useState<string | null>(null);
  // Lip-sync mode sub-tab: 'avatar' (talking photo) vs 'motion' (Kling Motion Control).
  const [lipTab, setLipTab] = useState<'avatar' | 'motion'>('avatar');
  // Scene-to-scene transition in the final stitch: soft crossfade or hard cut.
  const [videoTransition, setVideoTransition] = useState<'crossfade' | 'cut' | 'dissolve' | 'zoom' | 'slide'>('crossfade');
  // What the character SAYS — typed dialogue → spoken verbatim as the film's voice-over
  // (empty = auto-written narration). The clear "what should they say" field.
  const [videoSpeech, setVideoSpeech] = useState('');
  // Film length: 10s (2 scenes), 30s (6 scenes) or 60s (12 scenes). Drives the
  // storyboard scene count. 60s = a cinematic intro (first scenes establishing) →
  // the singer performance, for a full music-video edit.
  // PHASE 2 — 6s (single-clip path) · 30s · 60s. 6s → sceneCount 1 → no multi-clip stitch.
  const [videoDuration, setVideoDuration] = useState<6 | 30 | 60>(30);
  // Background score on/off (off → voice-only film). Documentary mode only.
  const [videoMusic, setVideoMusic] = useState(true);
  // v330 — explicit master AUDIO MODE (the voice-overlap fix as a first-class toggle).
  // 'musicvideo' → the song rules the master (narrator omitted, backing ducked −12 dB);
  // 'documentary' → narration-forward (voice on top, music ducked under it).
  const [videoMode, setVideoMode] = useState<'musicvideo' | 'documentary'>('documentary');
  // PHASE 2 L1 — Cinema vs Product-Ad tab (orthogonal to videoMode's music/documentary axis).
  // TASK 1 — 'videoswap': upload a video + a character photo → regenerate a ~5s clip with
  // the new character (honest capability: Kling is i2v-only, so it re-animates a keyframe).
  const [videoTab, setVideoTab] = useState<'cinema' | 'product' | 'videoswap'>('cinema');
  const [swapSourceVideo, setSwapSourceVideo] = useState<{ name: string; url: string; previewUrl?: string } | null>(null);
  const [swapSourceVideoBusy, setSwapSourceVideoBusy] = useState(false);
  const swapVideoRef = useRef<HTMLInputElement | null>(null);
  // PHASE 2 L1 — Character Voice selector → VOICE_MAP (language + persona + tone).
  const [voiceLanguage, setVoiceLanguage] = useState<'ka' | 'en' | 'ru'>('ka');
  const [voicePersona, setVoicePersona] = useState<'male' | 'female' | 'child' | 'elderly'>('male');
  const [voiceTone, setVoiceTone] = useState<'epic' | 'emotional' | 'energetic'>('emotional');
  // PHASE 2 L1 — camera controls → clip prompt tokens (move + 1–10 motion intensity).
  const [videoCameraMove, setVideoCameraMove] = useState<'auto' | 'pan_left' | 'pan_right' | 'zoom_in' | 'zoom_out' | 'tilt_up' | 'tilt_down'>('auto');
  const [videoMotionIntensity, setVideoMotionIntensity] = useState(5);
  // PHASE 2 L5 / Master Contract V3 — per-render i2v engine. Runway Gen-3/4 is the wired PRIMARY i2v
  // engine (ServiceManager tries it first, then falls to Kling → LTX), so it is the default selection;
  // choosing Kling opts OUT of the Runway attempt and renders Kling-first. Hailuo/MiniMax stays a valid
  // routing value but is retired from the toggle (it was an unmarked secondary; Runway supersedes it).
  const [videoModel, setVideoModel] = useState<'runway' | 'kling' | 'hailuo'>('runway');
  // PHASE 2 L1 — Product-Ad mode: one product photo (hosted URL) + a commercial preset.
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productPreset, setProductPreset] = useState<'splash' | 'epic' | 'luxury' | 'nature'>('luxury');
  // PHASE 4 — Product-Ad duration: 6s = one clip; 30/60s = N clips (same product
  // photo, varied scene prompts) stitched + scored via the assemble pipeline.
  const [productDuration, setProductDuration] = useState<6 | 30 | 60>(6);
  // Product-Ad context — brand/price/hook + CTA + Georgian voiceover. Optional; when set
  // they feed the EXISTING assemble marketing overlay (price chip + CTA pill + brand
  // lower-third) and an auto voiceover script (TTS'd server-side on the cloned KA voice).
  const [productBrand, setProductBrand] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productHook, setProductHook] = useState('');
  const [productCta, setProductCta] = useState<ProductCtaOption>('shop_now');
  const [productCtaCustom, setProductCtaCustom] = useState('');
  const [productVoiceover, setProductVoiceover] = useState(true);
  // Dedicated product-ad output format (independent of the film tab's videoOrientation),
  // multi-shot photo list (each clip can anchor a different product photo), and an error
  // surface so a failed generation isn't silent.
  const [productAspect, setProductAspect] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [productImages, setProductImages] = useState<string[]>([]); // EXTRA shots beyond productImage (shot 1)
  // v330 — dedicated CHARACTER REFERENCE slot: one identity-lock image (data URL),
  // separate from the generic attachment tray so it reads as its own asset slot.
  // Up to 3 character-reference photos (multi-angle identity lock). The FIRST is the
  // primary — it becomes the Kling i2v start_image; all are sent to the pipeline +
  // stored in the job's referenceImages metadata. `videoCharacterRef` (the primary) is
  // kept as a derived value so the videoswap sub-mode (single photo) reads it unchanged.
  const [videoCharacterRefs, setVideoCharacterRefs] = useState<string[]>([]);
  const videoCharacterRef = videoCharacterRefs[0] ?? null;
  // Per-scene ACTION prompts — parallel to the scene-frame slots (index i ↔ scene i+1).
  // Each slot's textarea lets the user describe that scene's motion up front; a non-empty
  // entry overrides that scene's AI frame-prompt AND its render script (so the clip
  // animates the described action). Empty entries fall back to the storyboard AI.
  const [scenePrompts, setScenePrompts] = useState<string[]>([]);
  const updateScenePrompt = useCallback((i: number, v: string) => {
    setScenePrompts((prev) => { const next = prev.slice(); next[i] = v; return next; });
  }, []);
  // Scene-frame slots scale with the film length, matching the pipeline's scene count
  // (6s→1 · 30s→6 · 60s→12 = round(sec/5)). Each uploaded frame anchors that scene IN
  // ORDER; empty scenes are auto-generated by the storyboard (handled server-side).
  const sceneFrameCount = videoDuration <= 6 ? 1 : Math.min(12, Math.round(videoDuration / 5));
  // Shrinking the film length drops scene frames beyond the new count (kept in order).
  useEffect(() => {
    setVideoCharacterRefs((prev) => (prev.length > sceneFrameCount ? prev.slice(0, sceneFrameCount) : prev));
    setScenePrompts((prev) => (prev.length > sceneFrameCount ? prev.slice(0, sceneFrameCount) : prev));
  }, [sceneFrameCount]);
  // v330 — dedicated AUDIO INGEST slot: a user-uploaded beat/song. Once uploaded
  // (uploadBigFile → storage path) it becomes the master bed, bypassing ambient music
  // generation. `videoSoundtrackBusy` is true while the upload is in flight.
  // Phase 6 polish — also carry the real duration + a downsampled waveform (peaks 0..1)
  // decoded client-side, so the music-video panel can show length + a waveform preview.
  const [videoSoundtrack, setVideoSoundtrack] = useState<{ name: string; url: string; durationSec?: number; peaks?: number[]; previewUrl?: string } | null>(null);
  const [videoSoundtrackBusy, setVideoSoundtrackBusy] = useState(false);
  // Dedicated SCRIPT for the video service — uploaded INTO the panel (not the chat
  // composer), so the Director/Storyboard agents always read it regardless of chat mode.
  // .txt/.md are decoded in-browser; .pdf/.docx go through /api/utils/extract-text.
  const [videoScriptDoc, setVideoScriptDoc] = useState<{ name: string; text: string } | null>(null);
  const [videoScriptBusy, setVideoScriptBusy] = useState(false);
  // Is this attachment/file a SCRIPT document (not media)? Matched by mime OR extension.
  const isScriptFile = useCallback((nameOrType: { name?: string; type?: string }) => {
    const n = (nameOrType.name || '').toLowerCase();
    const t = (nameOrType.type || '').toLowerCase();
    return /\.(txt|md|markdown|pdf|docx|doc|rtf)$/i.test(n) || /pdf|wordprocessing|officedocument|msword|^text\/|rtf/.test(t);
  }, []);
  // Load a SCRIPT file into the dedicated slot — shared by the Script slot AND the composer
  // "+" (so however the user attaches a doc, in video mode it becomes the script). .txt/.md
  // decode in-browser; .pdf/.docx go through /api/utils/extract-text. Clear toasts on every
  // failure mode (too large · empty/iCloud-not-downloaded · unreadable) so it's never silent.
  const loadScriptFile = useCallback(async (f: File): Promise<boolean> => {
    const toast = (en: string, ru: string, ka: string, tag: RegExp) => {
      setShareToast(locale === 'en' ? en : locale === 'ru' ? ru : ka);
      setTimeout(() => setShareToast((s) => (tag.test(s ?? '') ? null : s)), 2800);
    };
    if (!f.size) { // 0 bytes → typically an iCloud file that wasn't downloaded on the device
      toast('That file is empty — open it once in Files so it downloads, then retry', 'Файл пуст — откройте его в «Файлах», затем повторите', 'ფაილი ცარიელია — ჯერ გახსენი Files-ში (ჩამოიტვირთოს), მერე სცადე', /empty|пуст|ცარიელ/);
      return false;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast('Script is too large (max 15MB)', 'Файл слишком большой (макс 15МБ)', 'ფაილი ძალიან დიდია (მაქს 15MB)', /15|MB/);
      return false;
    }
    setVideoScriptBusy(true);
    try {
      const isText = /\.(txt|md|markdown)$/i.test(f.name) || /^text\//.test(f.type);
      let text = '';
      if (isText) {
        text = (await f.text()).trim();
      } else {
        const dataUrl = await fileToDataUrl(f);
        const r = await fetch('/api/utils/extract-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl, mimeType: f.type }) });
        const j = (await r.json().catch(() => ({}))) as { text?: string };
        text = (j.text || '').trim();
      }
      if (text) { setVideoScriptDoc({ name: f.name, text }); return true; }
      toast("Couldn't read that file — try a .txt or .pdf", 'Не удалось прочитать файл — попробуйте .txt или .pdf', 'ფაილი ვერ წავიკითხე — სცადე .txt ან .pdf', /read|прочитать|წავიკითხე/);
      return false;
    } catch {
      toast('Upload failed — please try again', 'Не удалось загрузить — попробуйте снова', 'ატვირთვა ვერ მოხერხდა — სცადე თავიდან', /failed|загрузить|ატვირთვა/);
      return false;
    } finally { setVideoScriptBusy(false); }
  }, [locale]);
  // VECTOR 1 — DROP a script file ONTO the Script slot. Without an explicit handler the browser default fires and
  // NAVIGATES the tab to the dropped file (loading it as a raw URL — the reported "opens in a new tab" bug).
  // preventDefault on the drop (and dragOver, on the element) stops that; a script file is read via loadScriptFile
  // (.txt/.md decoded in-browser, .pdf/.docx via extract-text), and a non-script file gets a clear format toast.
  const handleScriptDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer?.files?.[0];
    if (!f || videoScriptBusy) return;
    if (isScriptFile({ name: f.name, type: f.type })) { void loadScriptFile(f); return; }
    setShareToast(locale === 'en' ? 'Invalid file format. Please upload a text script (.txt, .md)' : locale === 'ru' ? 'Неверный формат файла. Загрузите текстовый сценарий (.txt, .md)' : 'არასწორი ფაილის ფორმატი. გთხოვთ ატვირთოთ ტექსტური სცენარი (.txt, .md)');
    setTimeout(() => setShareToast((s) => (s && /\.txt|формат|ფორმატ/.test(s) ? null : s)), 3200);
  }, [isScriptFile, loadScriptFile, locale, videoScriptBusy]);
  // Whole-surface drag-over overlay (V3). Only reacts to FILE drags (a text selection drag
  // is ignored). A depth counter survives dragleave firing once per crossed child. The Script
  // slot handles its own drop (stopPropagation), so a drop there never double-fires here.
  const dragHasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const onChatDragEnter = useCallback((e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }, []);
  const onChatDragOver = useCallback((e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault(); // required so the browser fires `drop` instead of navigating to the file
  }, []);
  const onChatDragLeave = useCallback((e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }, []);
  const onChatDrop = useCallback((e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    const first = files[0]!;
    // In Video mode a dropped script goes straight into the Director's Script slot.
    if (mode === 'video' && isScriptFile({ name: first.name, type: first.type })) { void loadScriptFile(first); return; }
    // Otherwise ingest as chat attachment(s), same as the composer "+" picker.
    files.forEach((f) => {
      const r = new FileReader();
      r.onload = () => setAttachments((prev) => prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { dataUrl: String(r.result), mimeType: f.type || 'application/octet-stream' }]);
      r.readAsDataURL(f);
    });
  }, [mode, isScriptFile, loadScriptFile]);
  // v330 — sung-vocal gender for Music Video Mode (steers the ElevenLabs Music singer
  // + selects the cloned Georgian voice for any narration). Default male tenor.
  const [videoVocalGender, setVideoVocalGender] = useState<'male' | 'female' | 'duet'>('male');
  // Documentary narrator gender (👩 ქალი / 👨 კაცი) → cloned female/male Georgian TTS.
  const [videoNarratorGender, setVideoNarratorGender] = useState<'male' | 'female'>('female');
  // Multi-character dialogue: when ON, the dialogue textarea is split per speaker
  // (ქალი:/კაცი:/Woman:/Man:) and each line is voiced in its gendered voice + mixed.
  const [videoMultiChar, setVideoMultiChar] = useState(false);
  const [videoDialogue, setVideoDialogue] = useState('');
  // DAY-6 — an optional full TIMECODED Master Production Script (SCENE/VOICE/DIALOGUE sheets). When filled it
  // drives the structured storyboard + multi-voice casting (parseMasterScript) instead of the single-prompt path.
  const [videoMasterScript, setVideoMasterScript] = useState('');
  // P1 — Music Video: after the master assembles, sync the singer's mouth to the
  // Georgian vocal. Uses Replicate sync/lipsync-2 (video-input, official model) via
  // /api/video/lipsync kind:'film'. ENGINE VERIFIED end-to-end on Replicate today
  // (prediction q9m5k5nexdrmr0cyyhnt2ca090, ~113s, output mp4). Default ON; fail-open
  // to the un-synced master if anything misses.
  const [videoLipsync, setVideoLipsync] = useState(true);
  // PHASE 2 L6 — Smart ducking (default ON): in documentary mode the music bed
  // auto-ducks under the dialogue via the assembler's 3-track sidechain. The slider
  // sets the duck depth (−6…−18 dB). Only affects films that carry voice + music +
  // sfx (the assembler's 3-track gate); others keep the existing mix unchanged.
  const [videoSmartDuck, setVideoSmartDuck] = useState(true);
  const [videoDuckDb, setVideoDuckDb] = useState(-12);
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
  const resumeConversation = useCallback(async (id: string) => {
    upsertConversation(conversationId, messages); // save current before leaving
    setConversationId(id);
    setCurrentConversationId(id);
    setHistoryOpen(false);
    const convo = loadConversations().find((c) => c.id === id);
    // A "cloud:" entry (a conversation from ANOTHER device, merged into the sidebar) carries a serverSid
    // and no local messages yet → continue writing to the SAME Supabase session + lazy-load its transcript.
    if (convo?.serverSid && (convo.messages?.length ?? 0) === 0) {
      chatSessionIdRef.current = convo.serverSid; // ensureChatSession returns this → no session fork
      setMessages([]);
      try {
        const rows = await getMessages(convo.serverSid);
        const msgs: Msg[] = rows
          .filter((r) => r.role === 'user' || r.role === 'assistant')
          .map((r) => ({ role: r.role as 'user' | 'assistant', text: r.content }));
        setMessages(msgs);
      } catch { /* fail-open → empty view; the server row persists, a re-open can hydrate */ }
    } else {
      setMessages(loadConversationMessages(id));
    }
  }, [conversationId, messages]);
  const startNewConversation = useCallback(() => {
    upsertConversation(conversationId, messages); // save current
    const id = newConversationId();
    setConversationId(id);
    setCurrentConversationId(id);
    setMessages([]);
    setHistoryOpen(false);
  }, [conversationId, messages]);
  const removeConversation = useCallback((id: string) => {
    deleteConversation(id);
    // Deleting the OPEN chat → discard it to a FRESH EMPTY conversation WITHOUT re-saving.
    // (startNewConversation upserts the current first, and the idle auto-save effect would
    // too — either one resurrects the just-deleted chat. A fresh empty id auto-saves to
    // nothing.) Non-active deletes don't touch conversationId/messages, so no re-save fires.
    if (id === conversationId) {
      const fresh = newConversationId();
      setConversationId(fresh);
      setCurrentConversationId(fresh);
      setMessages([]);
    }
    setHistoryList(loadConversations());
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('myavatar:conversations-updated'));
  }, [conversationId]);
  const clearAllConversations = useCallback(() => {
    try { window.localStorage.removeItem(OMNI_CONVERSATIONS_KEY); } catch { /* ignore */ }
    const fresh = newConversationId();
    setConversationId(fresh);
    setCurrentConversationId(fresh);
    setMessages([]);
    setHistoryList([]);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('myavatar:conversations-updated'));
  }, []);
  // Bridge: the persistent left sidebar (ChatChrome) drives chat-history resume + new-chat
  // via window events — so the sidebar works without prop-threading through the chrome.
  useEffect(() => {
    const onResume = (e: Event) => { const id = (e as CustomEvent<{ id?: string }>).detail?.id; if (id) resumeConversation(id); };
    const onNew = () => startNewConversation();
    const onDelete = (e: Event) => { const id = (e as CustomEvent<{ id?: string }>).detail?.id; if (id) removeConversation(id); };
    const onClear = () => clearAllConversations();
    window.addEventListener('myavatar:resume-conversation', onResume as EventListener);
    window.addEventListener('myavatar:new-chat', onNew);
    window.addEventListener('myavatar:delete-conversation', onDelete as EventListener);
    window.addEventListener('myavatar:clear-conversations', onClear);
    return () => {
      window.removeEventListener('myavatar:resume-conversation', onResume as EventListener);
      window.removeEventListener('myavatar:new-chat', onNew);
      window.removeEventListener('myavatar:delete-conversation', onDelete as EventListener);
      window.removeEventListener('myavatar:clear-conversations', onClear);
    };
  }, [resumeConversation, startNewConversation, removeConversation, clearAllConversations]);

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

  // v330 — bridge with the ChatChrome hamburger's Services list. The hamburger
  // dispatches 'omni:set-mode' to switch the active service; we mirror back the current
  // mode via 'omni:mode-changed' so the hamburger can highlight it. Switching also opens
  // the options drawer so the chosen service's controls are immediately visible.
  useEffect(() => {
    const onSet = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d === 'chat' || d === 'image' || d === 'music' || d === 'video' || d === 'lipsync') {
        setMode(d);
        if (d !== 'chat') setOptionsOpen(true);
        setModeMenuOpen(false);
      }
    };
    window.addEventListener('omni:set-mode', onSet);
    return () => window.removeEventListener('omni:set-mode', onSet);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('omni:mode-changed', { detail: mode }));
  }, [mode]);
  // GLOBAL LOADING BAR — surface the active generation to the ChatChrome shell so a thin
  // top progress bar shows during ANY generation (chat/image/music/video/storyboard/
  // product), regardless of which panel is open. Event-driven (no prop/context refactor):
  // the shell just listens for `myavatar:busy`.
  useEffect(() => {
    const active = busy || storyboardBusy || remixBusy;
    // Mirror the combined generation state into a ref so the legacy single-render entry points
    // (send / character swap) can cheaply guard against a SECOND parallel run. Product ad is NO
    // LONGER here — it runs per-job through the Cap-3 queue (tray-tracked), like image/music.
    genActiveRef.current = active;
    const label = storyboardBusy ? (mode === 'video' ? 'video' : 'video')
      : remixBusy ? 'remix'
      : mode; // chat · image · music · video · lipsync
    try { window.dispatchEvent(new CustomEvent('myavatar:busy', { detail: { active, service: active ? label : null } })); } catch { /* ignore */ }
  }, [busy, storyboardBusy, remixBusy, mode]);
  // ISSUE 1 — lock the PAGE behind the options drawer on mobile. The drawer itself
  // already scrolls (overflow-y-auto + overscroll-contain + touch-pan-y), but without
  // pinning the body a swipe still bubbled to the html/body and scrolled the whole page.
  // position:fixed is the only reliable iOS Safari lock (overflow:hidden alone is
  // ignored there); we preserve + restore the scroll offset so closing the drawer
  // doesn't jump the feed to the top. Desktop (≥640px) is untouched — the panel is
  // inline there, not an overlay.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!optionsOpen || window.innerWidth >= 640) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [optionsOpen]);

  // ── Cross-service Studio Bridge ────────────────────────────────────────────────
  // A generated image (→ character ref) or music track (→ music-video soundtrack) handed
  // over from another service lands in the bridge store; consume it here, drop it into the
  // right Video slot, switch to video mode, flash a welcome toast, then clear the store.
  // Strictly additive — no-op unless a bridge button fired.
  const { sendImageToVideo, sendMusicToMusicVideo } = useServiceBridge();
  const { transitCharacterUrl, transitAudioUrl, transitAudioMeta, transitStoryboard, setTransitStoryboard, clearCharacter, clearAudio, clearStoryboard } = useStudioBridge();
  // Capped-parallel render queue (Phase 1: the fast IMAGE flow runs 3-at-a-time through
  // it while the tray shows live progress + queue positions).
  const submitJob = useJobQueue((s) => s.submit);
  // DURABLE PROGRESS — hydrate the tray from the server's active generation_jobs on mount
  // + poll, so an in-flight render survives a page reload (bars sync to DB pct/stage).
  useDurableProgress(locale);
  // Write-side of durable progress: mark the persisted generation_jobs row terminal when a
  // local job settles (done → completed+url · failed/canceled → failed). Fired by the queue
  // engine's onSettle; best-effort (fire-and-forget POST). id === jobId, so the hydration
  // poll dedupes it via mergeTrayJobs.
  const trackJobSettle = useCallback((job: QueueJob) => {
    if (job.status === 'done') {
      trackJobComplete(job.id, typeof job.result === 'string' ? job.result : undefined);
      // P91 — a QUEUED (background) video render just finished. The completion choke point
      // (notifyCredit) already files a credit toast + in-app bell + native OS notification, and the
      // bubble hydrates into the player; add an in-chat "asset ready" toast for the case where the
      // user stayed in the app (on another mode) and never saw the OS notification.
      if (job.kind === 'video' || job.kind === 'product') {
        const msg = locale === 'en' ? '🎥 Your video finished rendering in the background!'
          : locale === 'ru' ? '🎥 Видео сгенерировано в фоновом режиме!'
          : '🎥 ვიდეო წარმატებით დაგენერირდა ფონურ რეჟიმში!';
        setShareToast(msg);
        setTimeout(() => setShareToast((s) => (s === msg ? null : s)), 3600);
      }
    } else {
      trackJobFail(job.id, job.status === 'canceled' ? 'canceled' : (job.error ?? undefined));
    }
    // TASK 6 — a terminal job holds NO queue position; null it so no ghost "#N" lingers in the DB
    // (isolated from the status write above so a pre-migration column-miss can't undo the terminal).
    trackJobPosition(job.id, null);
  }, [locale]);
  useEffect(() => {
    if (transitCharacterUrl) {
      setMode('video');
      setOptionsOpen(true);
      setVideoCharacterRefs([transitCharacterUrl]); // the bridged image → the film's first frame
      // "Send image to video" means ANIMATE THIS IMAGE. Default to a single 6s clip anchored on it
      // (sceneFrameCount derives to 1) instead of a 30s multi-scene film that reinvents the visuals —
      // that mismatch is why a bridged image "generated something completely different". User can bump
      // the duration to 30/60s for a full film.
      setVideoDuration(6);
      clearCharacter();
      setShareToast(locale === 'en' ? '🎬 Image sent to Video — press send to animate it' : locale === 'ru' ? '🎬 Изображение в Видео — нажмите «Отправить», чтобы оживить' : '🎬 სურათი ვიდეოშია — დააჭირე გაგზავნას რომ გააცოცხლო');
      setTimeout(() => setShareToast((s) => (/🎬/.test(s ?? '') ? null : s)), 2600);
      // Briefly highlight the character slot so the user sees where it landed.
      setTimeout(() => {
        const el = document.getElementById('character-ref-zone');
        if (el) { el.style.outline = '2px solid var(--app-accent, #22d3ee)'; el.style.outlineOffset = '2px'; setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 2000); }
      }, 400);
    }
    if (transitAudioUrl && transitAudioMeta) {
      setMode('video');
      setOptionsOpen(true);
      setVideoMode('musicvideo'); // a handed-over track implies a music video
      setVideoSoundtrack({
        name: transitAudioMeta.filename,
        url: transitAudioUrl,
        ...(transitAudioMeta.duration ? { durationSec: transitAudioMeta.duration } : {}),
        peaks: transitAudioMeta.waveform,
        previewUrl: transitAudioUrl, // remote signed URL is directly playable for preview
      });
      clearAudio();
      setShareToast(locale === 'en' ? '🎵 Track sent to the Video studio' : locale === 'ru' ? '🎵 Трек перенесён в видео-студию' : '🎵 სიმღერა ვიდეო სტუდიაში გადმოტანილია!');
      setTimeout(() => setShareToast((s) => (/🎵/.test(s ?? '') ? null : s)), 2600);
    }
    // PHASE 29 (VECTOR 2) — a full authored storyboard exported from the Image Studio pre-populates
    // EVERY scene lane: the per-scene frame anchors (videoCharacterRefs), the per-scene shot prompts,
    // the numbered-scene master script, plus duration/orientation/mode. The user then presses Generate
    // and the EXISTING createStoryboard/render path runs unchanged. Additive: nothing else reads it.
    if (transitStoryboard) {
      const sb = transitStoryboard;
      setMode('video');
      setOptionsOpen(true);
      // Duration FIRST so the videoCharacterRefs/scenePrompts clamp effect settles to the right count.
      setVideoDuration(sb.duration === 60 ? 60 : sb.duration === 6 ? 6 : 30);
      setVideoOrientation(sb.orientation);
      if (sb.musicVideoMode) setVideoMode('musicvideo');
      // PHASE 36 — the "Scene frames" lanes ARE videoCharacterRefs. Fill them with the FULL positional
      // sceneFrames array (every scene anchored to its rendered thumbnail) so "Scene frames 0/6" becomes
      // "6/6" natively; fall back to the single identity ref only when the storyboard carried no frames.
      if (sb.sceneFrames && sb.sceneFrames.length) setVideoCharacterRefs(sb.sceneFrames);
      else if (sb.characterRefs.length) setVideoCharacterRefs(sb.characterRefs);
      if (sb.scenePrompts.length) setScenePrompts(sb.scenePrompts);
      if (sb.masterScript.trim()) setVideoMasterScript(sb.masterScript);
      clearStoryboard();
      setShareToast(locale === 'en' ? '🎬 Storyboard sent to Video — review & generate' : locale === 'ru' ? '🎬 Раскадровка в Видео — проверьте и создайте' : '🎬 სცენარი ვიდეოშია — გადახედე და შექმენი');
      setTimeout(() => setShareToast((s) => (/🎬/.test(s ?? '') ? null : s)), 2800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitCharacterUrl, transitAudioUrl, transitStoryboard]);

  // Track the composer's live height so the scroll-to-bottom FAB always floats just
  // above it (a fixed 104px offset overlapped a multi-line / attachments / open-options composer).
  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Bail on no-op churn — the observer fires on every frame of an auto-grow /
    // options-expand, but React only needs the height when it actually changes.
    const measure = () => setComposerH((h) => (h === el.offsetHeight ? h : el.offsetHeight));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

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
  const renderFilm = useCallback(async (filmPrompt: string, refs: string[], orientation: 'landscape' | 'vertical' | 'square' | 'portrait', sceneFrames: string[] | undefined, sceneScripts: string[] | undefined, storyboardScenes: { ordinal: number; beat?: string; frameUrl: string | null }[] | undefined, characterLock: string | undefined, characterPortrait: string | undefined, jobCtx: { signal: AbortSignal; jobId: string; onProgress?: (pct: number) => void } | null, snap: FilmSnap): Promise<string | void> => {
    // SNAPSHOT-AT-SUBMIT (Step 2) — read the video panel from the IMMUTABLE per-job snapshot captured
    // at startFilmRender's submit, NOT the live component closure, so a QUEUED film never inherits
    // edits the user makes afterwards. These locals shadow the same-named closure state for the body.
    const {
      videoTransition, videoMode, videoStyle, videoDuration, videoVocalGender, videoLipsync,
      videoSoundtrack, videoMyVoiceNarration, videoSpeech, videoMusic, videoNarratorGender,
      videoMultiChar, videoDialogue, videoSmartDuck, videoDuckDb, voiceLanguage, voicePersona,
      voiceTone, videoCameraMove, videoMotionIntensity, videoModel, hasTrainedVoice,
    } = snap;
    // PER-JOB ISOLATION (Task 4) — when driven by the Cap-3 queue (`jobCtx` set) the render
    // tracks its own AbortSignal + a STABLE bubble id (=== jobId) instead of the shared
    // genIdRef/abortRef/last-bubble globals, so N cinema renders run in parallel without
    // clobbering each other. Without jobCtx the legacy single-render path is byte-identical.
    const myGen = jobCtx ? 0 : ++genIdRef.current;
    const ac = new AbortController();
    if (!jobCtx) abortRef.current = ac;
    const signal = jobCtx?.signal ?? ac.signal;
    const mine = jobCtx ? () => !jobCtx.signal.aborted : () => genIdRef.current === myGen;
    // Lip-sync stage + elapsed clock are per-render when queued (a shared ref would let two
    // parallel films fight over the same roster/elapsed state); the legacy path keeps the refs.
    const lipStage: { current: FilmAgentStatus } = jobCtx ? { current: 'idle' } : lipsyncStageRef;
    const startedAt = jobCtx ? Date.now() : genStartRef.current;
    const bubbleId = jobCtx?.jobId;
    let finalUrl: string | null = null;
    let lastPostedPct = -1;
    // Patch THIS film's bubble — by stable jobId when queued, else the last assistant bubble
    // (legacy). Guarded by the per-job alive check; `fn` may return null to skip.
    const patchFilmBubble = (fn: (last: Msg) => Msg | null) => {
      setMessages((prev) => {
        if (!mine()) return prev;
        const idx = bubbleId ? prev.findIndex((m) => m.id === bubbleId) : prev.length - 1;
        if (idx < 0) return prev;
        const cur = prev[idx];
        if (!cur) return prev;
        const patched = fn(cur);
        if (!patched) return prev;
        const next = prev.slice();
        next[idx] = patched;
        return next;
      });
    };
    // In-place upgrade of a bubble found by a legacy backward-search predicate (videoUrl /
    // filmRoster), or directly by jobId when queued. Used by the video/lip-sync card upgrades.
    const patchFilmBubbleBy = (matchLegacy: (m: Msg) => boolean, fn: (m: Msg) => Msg) => {
      if (!mine()) return;
      setMessages((prev) => {
        const next = prev.slice();
        if (bubbleId) {
          const i = next.findIndex((m) => m.id === bubbleId);
          const cur = i >= 0 ? next[i] : undefined;
          if (cur) next[i] = fn(cur);
        } else {
          for (let i = next.length - 1; i >= 0; i -= 1) {
            const m = next[i];
            if (m && matchLegacy(m)) { next[i] = fn(m); break; }
          }
        }
        return next;
      });
    };
    // Keep the approved storyboard frames VISIBLE in the bubble while the film
    // renders (~7 min), so the preview shows every scene + the live progress —
    // the storyboard no longer just disappears on "Generate Video".
    setMessages((prev) => [...prev, { role: 'assistant', text: t.generatingVideo, genKind: 'video', ...(bubbleId ? { id: bubbleId } : {}), ...(storyboardScenes?.length ? { storyboard: storyboardScenes } : {}) }]);
    // DURABLE PROGRESS — the placeholder row is now created at SUBMIT (store.submit → trackJobCreate
    // via startFilmRender's createParams, Task 6), so a QUEUED cinema job survives a reload too.
    if (!jobCtx) setBusy(true);
    try {
      // v330 — Music Video mode: the song rules, so the standalone narrator is
      // omitted and a soundtrack (if uploaded) becomes the master bed. Documentary
      // mode keeps narration-forward behaviour (voice-over + ducked score).
      const isMusicVideo = videoMode === 'musicvideo';
      // Director's-Console Lip-Sync agent. DEFAULT-ON for music videos: the SONG itself
      // is the vocal, so the singer-performance path (HeyGen close-up → isolated vocal →
      // composited into the montage) runs whenever Lip-Sync is toggled on (default true) —
      // no typed dialogue required. Documentary still needs typed dialogue/narration
      // (compositeDocumentary speaks videoSpeech via a talking photo).
      const hasDialogue = videoSpeech.trim().length > 0;
      const wantsLipsync = (isMusicVideo && videoLipsync) || (!isMusicVideo && hasDialogue);
      lipStage.current = wantsLipsync ? 'queued' : 'skipped';
      // REAL GEORGIAN VOCALS — ElevenLabs Music can't sing Georgian, so for a Georgian
      // music video we build the song ourselves (Georgian rap on the cloned KA voice over a
      // funk bed) and use it as the soundtrack. Fail-open → normal EL Music (English).
      // Fire for the Georgian-first audience (locale 'ka') OR any brief that names Georgian /
      // is written in Georgian script — UNLESS the brief explicitly asks for English vocals.
      // Keying off locale (not just prose) catches the common case of a ka user who typed an
      // English / transliterated brief; the English-intent guard avoids forcing Georgian on
      // a brief like "a Georgian-American singing in English".
      const wantsEnglishVocals = /\bin\s+english\b|english\s+(?:lyrics|vocals|song)/i.test(filmPrompt);
      const georgianBrief = !wantsEnglishVocals && (locale === 'ka' || /\bgeorgian\b/i.test(filmPrompt) || /[Ⴀ-ჿᲐ-Ჿ]/.test(filmPrompt));
      let kaSoundtrack: string | null = isMusicVideo && videoSoundtrack?.url ? videoSoundtrack.url : null;
      if (isMusicVideo && !kaSoundtrack && georgianBrief && mine()) {
        patchFilmBubble((last) => (last.role === 'assistant' && !last.videoUrl) ? { ...last, text: locale === 'en' ? '🎤 Writing the Georgian vocal track…' : locale === 'ru' ? '🎤 Создаю грузинский вокал…' : '🎤 ვქმნი ქართულ ვოკალს…' } : null);
        try {
          const r = await fetch('/api/audio/georgian-song', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal, body: JSON.stringify({ brief: filmPrompt, gender: videoVocalGender === 'duet' ? 'female' : videoVocalGender, ...(videoVocalGender === 'duet' ? { genderSecondary: 'male' } : {}), totalSec: videoDuration }) });
          const j = (await r.json().catch(() => ({}))) as { url?: string | null };
          if (j.url) kaSoundtrack = j.url;
        } catch { /* fail-open → EL Music (English) */ }
      }
      const res = await driveFilmStudio({
        prompt: filmPrompt,
        referenceImages: refs,
        // v330 — Music Video Mode is full-screen mobile-first: force 9:16 vertical.
        orientation: isMusicVideo ? 'vertical' : orientation,
        transition: videoTransition,
        musicVideoMode: isMusicVideo,
        // FIX B — the chosen effect reaches the CLIP prompts (not just the frames).
        style: videoStyle,
        // FIX A — the Prompt-Agent locked character → identical protagonist every clip.
        ...(characterLock?.trim() ? { characterLock: characterLock.trim() } : {}),
        ...(isMusicVideo ? { vocalGender: videoVocalGender } : {}),
        // Music Video soundtrack: the user-built Georgian song (or an uploaded track).
        ...(isMusicVideo && kaSoundtrack ? { soundtrackUrl: kaSoundtrack } : {}),
        // Narration only in documentary mode — a music video has no spoken narrator.
        myVoiceNarration: !isMusicVideo && videoMyVoiceNarration && hasTrainedVoice,
        ...(!isMusicVideo && videoSpeech.trim() ? { narrationScript: videoSpeech.trim() } : {}),
        // Narrator gender (👩/👨) — overrides brief auto-detect; only when NOT using
        // the user's own trained voice (that path forces the cloned-self voice).
        ...(!isMusicVideo && !videoMultiChar && !videoMyVoiceNarration ? { narratorGender: videoNarratorGender } : {}),
        // PHASE 2 L1 — Character Voice selector → VOICE_MAP (documentary narration only).
        ...(!isMusicVideo && !videoMyVoiceNarration ? { voiceLanguage, voicePersona, voiceTone } : {}),
        // PHASE 2 L1 — camera controls → clip prompt tokens (apply to every cinema render).
        ...(videoCameraMove !== 'auto' ? { cameraMove: videoCameraMove } : {}),
        motionIntensity: videoMotionIntensity,
        // PHASE 2 L5 — per-render i2v model (Kling/Hailuo).
        videoModel,
        // Multi-character dialogue → split per speaker, each line in its gendered voice.
        ...(!isMusicVideo && videoMultiChar && videoDialogue.trim() ? { dialogueScript: videoDialogue.trim() } : {}),
        // DAY-6 — a pasted timecoded Master Production Script → structured storyboard scenes + multi-voice
        // spatial casting (≥2 timecoded speakers → per-voice stems + -12dB duck). Documentary mode only.
        ...(!isMusicVideo && videoMasterScript.trim() ? { masterScript: videoMasterScript.trim() } : {}),
        // Music can only be turned OFF in documentary mode; a music video always has its song.
        ...(!isMusicVideo && !videoMusic ? { noMusic: true } : {}),
        // PHASE 2 L2/L6 — documentary 3-track master + smart ducking. The assembler only
        // applies it when the film actually has voice + music + sfx, so films missing any
        // keep their existing mix. Music videos use the song-master path (not this).
        ...(!isMusicVideo ? { audioMix: { threeTrack: true, smartDuck: videoSmartDuck, duckDb: videoDuckDb } } : {}),
        ...(sceneFrames?.length ? { sceneFrames } : {}),
        ...(sceneScripts?.length ? { sceneScripts } : {}),
        // PIN the render's clip count to the user's package so a scriptless/raced dispatch can never default to the
        // 30s/6-scene fallback (which also discards a single approved selfie frame). Prefer the approved storyboard /
        // script count; else derive from the chosen duration (6s→1 · 30s→6 · 60s→12) captured in the submit snapshot.
        sceneCount: storyboardScenes?.length || sceneScripts?.length || (snap.videoDuration <= 6 ? 1 : Math.max(2, Math.min(12, Math.round(snap.videoDuration / 5)))),
        locale,
        signal,
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
          const baseStatus = p.phase === 'rendering'
            ? `🎬 ${locale === 'en' ? 'Rendering scenes' : locale === 'ru' ? 'Рендер сцен' : 'სცენების რენდერი'} ${ready}/${total}`
            : p.phase === 'stitching'
              ? `🎞 ${locale === 'en' ? 'Editing + adding music & narration' : locale === 'ru' ? 'Монтаж + музыка и озвучка' : 'მონტაჟი + მუსიკა და ნარაცია'}`
              : p.phase === 'dispatching'
                ? `✨ ${locale === 'en' ? 'Preparing the scenes' : locale === 'ru' ? 'Подготовка сцен' : 'სცენების მომზადება'}`
                : (p.message?.trim() || t.generatingVideo);
          // POLL-LEVEL FAILOVER FLAG — the video provider (Kling) has been bottlenecked in
          // its remote queue for 90s+ with no forward tick. Surface an honest note (the
          // render keeps going — no re-submit, no double-charge) instead of a silent stall.
          const status = p.slow
            ? `${baseStatus} · ⏳ ${locale === 'en' ? 'provider is slow, still working…' : locale === 'ru' ? 'провайдер медленный, продолжаем…' : 'პროვაიდერი ნელია, ვაგრძელებთ…'}`
            : baseStatus;
          // Fold the live matrix into the 9-agent roster + activity log so the
          // Director's Console renders real per-agent state and a streaming feed
          // (not a fake timer) right in the bubble.
          const roster = deriveFilmRoster(p, lipStage.current);
          const freshLog = deriveFilmLog(p, locale);
          const nowElapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
          // Cap-3 tray bar + durable row (Task 4). Feed the tray every tick (cheap/local);
          // throttle the fire-and-forget DB write to ≥8-point jumps so a 7-min render posts
          // ~a dozen rows, not hundreds.
          if (jobCtx) {
            jobCtx.onProgress?.(pct);
            if (pct - lastPostedPct >= 8 || pct >= 100) { lastPostedPct = pct; trackJobUpdate(jobCtx.jobId, baseStatus, pct); }
          }
          patchFilmBubble((last) => {
            if (!(last.role === 'assistant' && !last.videoUrl)) return null;
            // Stamp each log line with the elapsed seconds it FIRST appeared, so the
            // terminal can show per-line timestamps without re-stamping on each tick.
            // Clamp to the max existing stamp so timestamps stay monotonic even when
            // the elapsed clock re-anchors between the storyboard build and the render.
            const prevLog = last.filmLog ?? [];
            const prevByKey = new Map(prevLog.map((l) => [l.key, l]));
            const stampTs = Math.max(nowElapsed, prevLog.reduce((m, l) => Math.max(m, l.ts ?? 0), 0));
            const filmLog = freshLog.map((l) => prevByKey.get(l.key) ?? { ...l, ts: stampTs });
            return { ...last, text: status, videoProgress: pct, filmRoster: roster, filmLog };
          });
        },
      });
      // Capture the landed per-scene clips so the film bubble can offer Remix
      // (re-render only the edited scene, reuse the rest via /api/pipeline/remix).
      const landed = (res.matrix?.clips ?? [])
        .filter((c) => c.status === 'succeeded' && typeof c.url === 'string' && c.url)
        .map((c) => ({ ordinal: c.ordinal, url: c.url as string }));
      const remixCarry = landed.length >= 2 ? { filmClips: landed, filmPrompt } : {};

      // MUSIC VIDEO — the cinematic LTX montage is the PRIMARY result. We no longer relip the
      // whole master (sync/lipsync-2 warped the wide/aerial shots — "terrible"). Show the
      // cinematic video first, then generate a clean matched-lip SINGER PERFORMANCE via HeyGen
      // (a close-up storyboard face lip-synced to the song) as a COMPANION clip. Fail-open.
      patchFilmBubble((last) => last.role === 'assistant'
        ? (res.ok && res.masterUrl
            // Keep the Director's Console (filmRoster/filmLog) alongside the video so the
            // post-assemble Lip-Sync + Graphics cards keep updating after the master lands.
            // Preserve the stable id/genKind when queued so later in-place upgrades hit THIS bubble.
            ? { role: 'assistant', text: '', videoUrl: res.masterUrl, orientation, filmRoster: last.filmRoster, filmLog: last.filmLog, ...(bubbleId ? { id: bubbleId, genKind: 'video' as const } : {}), ...remixCarry }
            : { role: 'assistant', text: `⚠️ ${res.error || t.videoFailed}`, retryVideo: true, retryReq: { filmPrompt, refs, orientation }, ...(bubbleId ? { id: bubbleId } : {}) })
        : null);
      if (mine() && res.ok && res.masterUrl) { notifyCredit('video', { seconds: videoDuration }); finalUrl = res.masterUrl; }
      // Queued mode: a failed master must REJECT the job so the tray shows failed + the durable
      // row flips to failed (the legacy path just leaves the ⚠️ bubble in place).
      if (jobCtx && !(res.ok && res.masterUrl)) throw new Error(res.error || 'video failed');

      // Upgrade the result bubble's video IN PLACE (base master → lip-synced → graphics),
      // so the chain progressively replaces the shown video without spawning new bubbles.
      const setResultVideo = (url: string) => {
        if (!mine()) return;
        finalUrl = url;
        patchFilmBubbleBy((m) => !!m && m.role === 'assistant' && !!m.videoUrl, (m) => ({ ...m, videoUrl: url }));
      };
      // A CLEAN front-facing face for any talking-head lip-sync — HeyGen's talking_photo
      // needs a clear portrait, not a stylized scene frame (that was the null bug). Prefer
      // the threaded anchor/selfie; generate one on-demand; last resort a close scene frame.
      const resolveCleanFace = async (): Promise<string | null> => {
        if (characterPortrait && /^https?:/i.test(characterPortrait)) return characterPortrait;
        if (mine()) {
          try {
            const sc = videoDuration <= 6 ? 1 : Math.max(2, Math.min(12, Math.round(videoDuration / 5)));
            const ar = await fetch('/api/film/storyboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal, body: JSON.stringify({ prompt: filmPrompt, orientation: isMusicVideo ? 'vertical' : orientation, style: videoStyle, locale, sceneCount: sc, characterAnchor: true }) });
            const aj = (await ar.json().catch(() => ({}))) as { anchorUrl?: string | null };
            if (aj.anchorUrl && /^https?:/i.test(aj.anchorUrl)) return aj.anchorUrl;
          } catch { /* fall through */ }
        }
        return (storyboardScenes ?? []).find((s) => /close|medium/i.test(s.beat ?? '') && s.frameUrl)?.frameUrl
          ?? sceneFrames?.[3] ?? sceneFrames?.[1] ?? sceneFrames?.[0] ?? null;
      };
      // Patch the Lip-Sync card on whichever bubble carries the Director's Console roster.
      // PHASE 20 — accepts an optional `note` (a localized reason) so a skip is never silent:
      // the reason lands on the card AND a console breadcrumb, turning the old mysterious
      // "lips don't track the vocal" into a visible, actionable cause.
      const patchLipsyncCard = (st: FilmAgentStatus, note?: string) => {
        lipStage.current = st;
        if (note) { try { console.info('[lipsync]', st, '—', note); } catch { /* ignore */ } }
        patchFilmBubbleBy(
          (m) => !!m && m.role === 'assistant' && !!m.filmRoster,
          (m) => ({ ...m, filmRoster: (m.filmRoster ?? []).map((a) => (a.id === 'lipsync' ? { ...a, status: st, pct: st === 'completed' || st === 'skipped' ? 100 : st === 'processing' ? 50 : 0, ...(note ? { note } : { note: undefined }) } : a)) }),
        );
      };
      // GRAPHICS INPUT — defaults to the base master so the Graphics agent ALWAYS runs, even
      // when Lip-Sync is skipped (FIX 1: never break the graphics chain). Each lip-sync leg
      // below upgrades it to the lip-synced video.
      let graphicsInput: string | null = res.ok && res.masterUrl ? res.masterUrl : null;
      if (res.ok && res.masterUrl && mine()) {
        // PHASE 22 (VECTOR 3) — PRE-FLIGHT HeyGen HEALTH GATE. Both lip-sync legs below drive HeyGen
        // (talking_photo). If the key is expired/credit-blocked/throttled, HeyGen accepts the create
        // then stalls, and the client polls ~8 min before giving up — a silent freeze. A cached,
        // fail-open readiness probe lets us skip that doomed poll and surface a reason in ~ms instead.
        // Only a DEFINITIVE {ok:false} blocks (see heygenHealthCheck); any flaky/uncertain result lets
        // the render proceed exactly as before.
        let heygenReady = true;
        if (wantsLipsync) {
          try {
            const hr = await fetch('/api/video/lipsync?health=heygen', { credentials: 'include', signal });
            const hj = (await hr.json().catch(() => ({}))) as { ok?: boolean };
            heygenReady = hj?.ok !== false;
          } catch { /* fail-open — a failed health check never blocks a render */ }
        }
        if (wantsLipsync && !heygenReady) {
          patchLipsyncCard('skipped', lipsyncSkipReason('heygen_unavailable', locale));
        } else if (isMusicVideo && wantsLipsync && res.musicUrl) {
          // MUSIC VIDEO → the singer-performance sync (close-up HeyGen head composited into the
          // montage). PHASE 20: staged so every bail surfaces WHICH step failed (the render was
          // shipping un-synced lips with a bare "skipped"). Still fail-open → base master + graphics.
          patchLipsyncCard('processing');
          const songUrl: string = res.musicUrl;
          let vocalForSync: string = songUrl;
          try {
            const iso = await fetch('/api/audio/isolate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal, body: JSON.stringify({ audioUrl: res.musicUrl }) });
            const ij = (await iso.json().catch(() => ({}))) as { vocalUrl?: string | null };
            if (ij.vocalUrl) vocalForSync = ij.vocalUrl;
            else { try { console.info('[lipsync] isolate: no vocalUrl → syncing to the full mix'); } catch { /* ignore */ } }
          } catch { try { console.info('[lipsync] isolate failed → syncing to the full mix'); } catch { /* ignore */ } }
          // #1 root cause of un-synced lips: no clean face → HeyGen never runs. Surface it (and
          // hint the fix: attach a reference photo) instead of a silent skip over the wide montage.
          const face = await resolveCleanFace();
          if (!face) {
            patchLipsyncCard('skipped', lipsyncSkipReason('no_face', locale));
          } else {
            const perf = await heygenSingerPerformance(face, vocalForSync, 'vertical', signal, mine);
            if (!perf) {
              // HeyGen returned nothing (no provider key / credit block / timeout / down).
              patchLipsyncCard('skipped', lipsyncSkipReason('heygen_unavailable', locale));
            } else if (!(await videoDurationAtLeast(perf, 8))) {
              patchLipsyncCard('skipped', lipsyncSkipReason('short_result', locale));
            } else if (!res.matrix || !mine()) {
              patchLipsyncCard('skipped', lipsyncSkipReason('no_clips', locale));
            } else {
              const composited = await compositeMusicVideo(perf, res.matrix, storyboardScenes, songUrl, 'vertical', videoTransition, signal, mine, res.filmTokenId ?? null);
              if (composited) { graphicsInput = composited; setResultVideo(composited); patchLipsyncCard('completed'); }
              else { patchLipsyncCard('skipped', lipsyncSkipReason('composite_failed', locale)); }
            }
          }
        } else if (isMusicVideo && wantsLipsync && !res.musicUrl) {
          // Music video wanted lip-sync but no song track landed → nothing to sync the mouth to.
          patchLipsyncCard('skipped', lipsyncSkipReason('no_song', locale));
        } else if (!isMusicVideo && wantsLipsync) {
          // DOCUMENTARY with dialogue → compositeDocumentary: ElevenLabs TTS of the dialogue
          // drives a talking-photo lip-sync of the CLEAN portrait, composited into the montage
          // at the close-up beat (or scene 3), narrated in the synced voice. Replaces the old
          // video-input sync/lipsync-2 pass (which warped the multi-shot master, returning null
          // on a montage with no consistent on-screen head). Fail-open → base master + graphics.
          // PHASE 22 (VECTOR 2) — staged like the music-video branch so a documentary skip is NEVER
          // a bare "skipped": surface no_face (resolveCleanFace null) / no_clips / composite_failed.
          patchLipsyncCard('processing');
          const face = await resolveCleanFace();
          if (!face) {
            patchLipsyncCard('skipped', lipsyncSkipReason('no_face', locale));
          } else if (!res.matrix || !mine()) {
            patchLipsyncCard('skipped', lipsyncSkipReason('no_clips', locale));
          } else {
            const composited = await compositeDocumentary(
              face,
              res.matrix,
              storyboardScenes,
              videoSpeech.trim(),
              videoVocalGender === 'male' ? 'male' : 'female',
              orientation === 'vertical' ? 'vertical' : 'landscape',
              videoTransition,
              signal,
              mine,
              res.filmTokenId ?? null,
            );
            if (composited) { graphicsInput = composited; setResultVideo(composited); patchLipsyncCard('completed'); }
            else { patchLipsyncCard('skipped', lipsyncSkipReason('composite_failed', locale)); }
          }
        } else {
          // PHASE 22 (VECTOR 2) — the not-wanted fallthrough (lip-sync toggle off, or documentary with
          // no dialogue): say so explicitly instead of a bare, ambiguous "skipped".
          patchLipsyncCard('skipped', lipsyncSkipReason('not_requested', locale));
        }
      }

      // ── GRAPHICS AGENT — ALWAYS on graphicsInput (lip-synced if it ran, else base master).
      // FIX 1: a lip-sync skip NEVER drops the graphics pass. Strictly fail-open. ──
      if (graphicsInput && mine()) {
        try {
          const theme = /tbilisi|თბილის/i.test(filmPrompt) ? 'TBILISI'
            : /night|ღამ|neon|ნეონ/i.test(filmPrompt) ? (locale === 'ka' ? 'ღამის განწყობა' : locale === 'ru' ? 'НОЧНЫЕ ВАЙБЫ' : 'NIGHT VIBES')
            : (locale === 'ka' ? 'ცოცხალი შესრულება' : locale === 'ru' ? 'ЖИВОЙ ЭФИР' : 'LIVE');
          const gr = await fetch('/api/video/graphics', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal,
            body: JSON.stringify({ videoUrl: graphicsInput, title: theme, lang: locale, introSec: videoDuration <= 6 ? 2 : videoDuration === 60 ? 13 : 10, musicBug: { artist: locale === 'ka' ? 'ავატარი' : 'MyAvatar', track: theme, producer: 'MyAvatar.ge Originals', lang: locale }, ...(videoSpeech.trim() ? { dialogue: videoSpeech.trim() } : {}) }),
          });
          const gj = (await gr.json().catch(() => ({}))) as { url?: string | null };
          if (gj.url) setResultVideo(gj.url);
        } catch { /* fail-open → graphicsInput already shown */ }
      }
    } catch (err) {
      // Canceled render (own signal aborted / superseded genId): leave it — when queued the
      // engine has already settled this job as canceled via its own cancel path.
      if (!mine()) return;
      patchFilmBubble((last) => last.role === 'assistant' ? { role: 'assistant', text: `⚠️ ${t.videoFailed}`, retryVideo: true, retryReq: { filmPrompt, refs, orientation }, ...(bubbleId ? { id: bubbleId } : {}) } : null);
      // Queued mode: propagate so the job settles FAILED (tray + durable row) via onSettle.
      if (jobCtx) throw err instanceof Error ? err : new Error('video failed');
    } finally {
      // Only the legacy single-render path owns the composer busy-gate; queued renders are
      // governed by the Cap-3 engine, so they never touch it (that's what lets films run N-up).
      if (!jobCtx && mine()) setBusy(false);
    }
    // Queued success → resolve with the final (possibly lip-synced/graphics-upgraded) URL so the
    // job's result carries it into onSettle → trackJobComplete(url).
    if (jobCtx) return finalUrl ?? undefined;
    // NB: the 22 video-panel vars are NOT deps — renderFilm reads them from the immutable `snap`
    // param (captured at submit by startFilmRender), so it no longer re-creates on every panel edit.
  }, [locale, notifyCredit, t.generatingVideo, t.videoFailed]);

  // TASK 4 — the single dispatch point for a cinema render. Legacy path (flag OFF): call
  // renderFilm directly and RETURN its promise, so existing `await`/`void` call sites behave
  // byte-identically. Parallel path (flag ON): submit into the Cap-3 queue with a fresh per-job
  // signal + jobId, so multiple films render at once with live tray progress + a durable row.
  // Fully fail-open: a queue submit throw falls back to a direct render (the flagship never breaks).
  const startFilmRender = useCallback((
    filmPrompt: string,
    refs: string[],
    orientation: 'landscape' | 'vertical' | 'square' | 'portrait',
    sceneFrames: string[] | undefined,
    sceneScripts?: string[] | undefined,
    storyboardScenes?: { ordinal: number; beat?: string; frameUrl: string | null }[],
    characterLock?: string,
    characterPortrait?: string,
  ): Promise<string | void> => {
    // SNAPSHOT-AT-SUBMIT (Step 2): capture the WHOLE video panel NOW (the submit millisecond) into one
    // immutable object; renderFilm renders from this exact snapshot, so a queued film never inherits a
    // later edit made for the next film. Mirrors generateProductAd / runVideoSwap.
    const snap: FilmSnap = {
      videoTransition, videoMode, videoStyle, videoDuration, videoVocalGender, videoLipsync,
      videoSoundtrack, videoMyVoiceNarration, videoSpeech, videoMusic, videoNarratorGender,
      videoMultiChar, videoDialogue, videoSmartDuck, videoDuckDb, voiceLanguage, voicePersona,
      voiceTone, videoCameraMove, videoMotionIntensity, videoModel, hasTrainedVoice,
    };
    if (!ENABLE_PARALLEL_CINEMA) {
      return renderFilm(filmPrompt, refs, orientation, sceneFrames, sceneScripts, storyboardScenes, characterLock, characterPortrait, null, snap);
    }
    try {
      const label = locale === 'en' ? 'Cinema video' : locale === 'ru' ? 'Кино-видео' : 'კინო ვიდეო';
      submitJob({
        kind: 'video',
        label,
        createParams: { prompt: filmPrompt },
        onSettle: trackJobSettle,
        run: ({ signal, onProgress, jobId }) =>
          renderFilm(filmPrompt, refs, orientation, sceneFrames, sceneScripts, storyboardScenes, characterLock, characterPortrait, {
            signal,
            jobId,
            onProgress: (pct) => onProgress({ pct }),
          }, snap),
      });
      return Promise.resolve();
    } catch {
      // The queue should never throw on submit — but if it does, render directly so the user's
      // film still happens (this is exactly the "safe fail-open" guarantee behind the flag).
      return renderFilm(filmPrompt, refs, orientation, sceneFrames, sceneScripts, storyboardScenes, characterLock, characterPortrait, null, snap);
    }
  }, [renderFilm, submitJob, trackJobSettle, locale, videoTransition, videoMode, videoStyle, videoDuration, videoVocalGender, videoLipsync, videoSoundtrack, videoMyVoiceNarration, videoSpeech, videoMusic, videoNarratorGender, videoMultiChar, videoDialogue, videoSmartDuck, videoDuckDb, voiceLanguage, voicePersona, voiceTone, videoCameraMove, videoMotionIntensity, videoModel, hasTrainedVoice]);

  // PHASE 2 L1 — Product-Ad: read the chosen product photo as a data URL (passed
  // straight to Kling i2v as the locked start_image; no auth-gated upload needed).
  // Decode an attached SCRIPT file (.md/.txt/etc.) to text so the film Director actually
  // reads it. Media only carries a base64 dataUrl + mimeType (no filename), so we decode
  // any non-image/audio/video attachment as UTF-8 and keep it only if it's mostly
  // printable (skips binary). This is what makes "attach a script → Director follows it"
  // work — before, non-image attachments were silently dropped from the film path.
  const extractScriptText = useCallback((atts: Media[]): string => {
    for (const a of atts) {
      if (/^(image|audio|video)\//.test(a.mimeType)) continue;
      try {
        const comma = a.dataUrl.indexOf(',');
        if (comma < 0) continue;
        const bytes = Uint8Array.from(atob(a.dataUrl.slice(comma + 1)), (c) => c.charCodeAt(0));
        const txt = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        // count non-control chars → printable ratio (Georgian/UTF-8 included)
        const printable = (txt.match(/[^\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
        if (txt.length > 0 && txt.indexOf('\u0000') < 0 && printable / txt.length > 0.85) return txt.trim();
      } catch { /* not a text file — skip */ }
    }
    return '';
  }, []);

  // STEP 2.1 — client-side ad-image validation (the server re-checks; never trusted).
  // Only jpeg/png/webp, ≤10MB; the server /api/upload adImage guard is authoritative.
  const rejectAdImage = useCallback((file: File): boolean => {
    if (!isAdImageMime(file.type)) {
      setShareToast(locale === 'en' ? 'Use a JPG, PNG or WebP image' : locale === 'ru' ? 'Используйте JPG, PNG или WebP' : 'გამოიყენე JPG, PNG ან WebP');
      return true;
    }
    if (file.size > AD_IMAGE_MAX_BYTES) {
      setShareToast(locale === 'en' ? 'Image too large (max 10MB)' : locale === 'ru' ? 'Изображение слишком большое (макс 10МБ)' : 'სურათი ძალიან დიდია (მაქს 10MB)');
      return true;
    }
    return false;
  }, [locale]);
  const onProductPhoto = useCallback((file: File) => {
    if (rejectAdImage(file)) return;
    const reader = new FileReader();
    reader.onload = () => setProductImage(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }, [rejectAdImage]);
  // Multi-shot: append an EXTRA product photo. STEP 2.1 caps the ad at MAX_AD_IMAGES
  // (3) total = primary + (MAX_AD_IMAGES-1) extras; each clip rotates a different shot.
  const addProductShot = useCallback((file: File) => {
    if (rejectAdImage(file)) return;
    if (productImages.length >= MAX_AD_IMAGES - 1) {
      setShareToast(locale === 'en' ? `Up to ${MAX_AD_IMAGES} images` : locale === 'ru' ? `До ${MAX_AD_IMAGES} изображений` : `მაქს ${MAX_AD_IMAGES} სურათი`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProductImages((prev) => (typeof reader.result === 'string' && prev.length < MAX_AD_IMAGES - 1 ? [...prev, reader.result] : prev));
    reader.readAsDataURL(file);
  }, [rejectAdImage, productImages.length, locale]);

  // Patch an existing chat bubble by id — the basis of PER-JOB result isolation: every queue
  // flow finalizes/updates its OWN bubble by id without ever touching another job's bubble.
  const updateBubble = useCallback((id: string, patch: Partial<Msg>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  // PHASE 2 L1 — Product-Ad generate: product photo + commercial preset → one i2v
  // clip via the /api/video/remix `productad` op (Kling, product as start_image).
  const generateProductAd = useCallback(() => {
    if (!productImage) return;
    void ensureNotificationPermission(); // PHASE 20 — permission on the generate gesture
    // The product ad renders PER-JOB in its OWN chat bubble (by id) through the Cap-3 queue —
    // NO productBusy gate, so N product ads run CONCURRENTLY, each fully self-contained (its inputs
    // are SNAPSHOTTED at click), so results never clobber a single panel slot. A per-clip 45s
    // timeout + StallDetector (below) keep one hung scene from freezing the whole multi-clip job.
    // Billing unchanged (same remix/assemble calls). Result lands in chat like image/music/swap.
    const jobLabel = locale === 'en' ? 'Product ad' : locale === 'ru' ? 'Реклама товара' : 'პროდუქტის რეკლამა';
    const bubbleId = `product_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // ── SNAPSHOT every panel input NOW so this job is independent of later panel edits AND of
    //    other concurrent product jobs (true per-job isolation via jobId/bubbleId). ────────────
    const photos = [productImage, ...productImages].filter((p): p is string => !!p);
    const firstPhoto = productImage;
    const preset = productPreset;
    const duration = productDuration;
    // Dedicated product aspect → the remix op's aspect AND the assemble orientation.
    // ('vertical' renders 1080×1920; 'portrait' would be 4:5 — so map 9:16 → vertical.)
    const aspect = productAspect;
    const orientationForAssemble = productAspect === '16:9' ? 'landscape' : productAspect === '1:1' ? 'square' : 'vertical';
    // ── Brand context → marketing overlay + auto voiceover (all snapshotted). ────────────────
    const ctaText = productCtaText(productCta, productCtaCustom, locale);
    const lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
    const overlayText = (productBrand.trim() || productHook.trim()) || undefined;
    const marketing = (productBrand.trim() || productHook.trim() || productPrice.trim() || ctaText)
      ? { overlayText, priceTag: productPrice.trim() || undefined, cta: ctaText || undefined, lang }
      : null;
    const voiceoverScript = productVoiceover
      ? generateVoiceoverScript({ brandName: productBrand, productPrice, productHook, ctaText, locale })
      : '';
    const enrich = Boolean(marketing || voiceoverScript.trim());
    const scorePrompt = `${preset} product commercial, premium, uplifting`;
    // Open the result in the chat (like image/music/swap): close the panel + drop a progress bubble.
    setOptionsOpen(false);
    setMessages((prev) => [...prev, { role: 'user', text: `🛍 ${productBrand.trim() || jobLabel}` }, { role: 'assistant', text: t.remixRunning, id: bubbleId }]);
    submitJob({ kind: 'product', label: jobLabel, createParams: { title: productBrand.trim() || jobLabel }, onSettle: trackJobSettle, run: async ({ signal, onProgress, jobId }): Promise<string> => {
    // Durable-progress: the placeholder row is created at SUBMIT (Task 6); flip it to processing.
    trackJobUpdate(jobId, jobLabel, 10);
    // Stage → THIS job's bubble (by id) + tray. Never touches shared panel state, so concurrent
    // product jobs each report into their own bubble.
    const setStage = (s: string) => { updateBubble(bubbleId, { text: s }); onProgress({ stage: s }); trackJobUpdate(jobId, s, 50); };
    // Land the finished video INTO this job's bubble (never a shared slot).
    const landVideo = (url: string) => updateBubble(bubbleId, { text: '', videoUrl: url, orientation: orientationForAssemble });
    // One i2v clip per ~5s. 6s → single clip; 30/60s → N clips (same product photo,
    // varied scene prompts) generated in parallel. `noMusic` lets the remix op return a
    // silent clip when we'll re-score it in assemble (avoids a wasted MusicGen call).
    // FAULT-TOLERANCE (Task 5.1) — each clip gets its OWN AbortController chained to the job
    // signal AND a strict per-clip timeout, so a SINGLE hung remote render self-releases (→ null)
    // instead of freezing the whole multi-clip Promise.all. `onClipSettle` feeds the batch
    // StallDetector below so a slow provider is surfaced mid-render. Never re-submits → the clip
    // just drops; no double-charge.
    const CLIP_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_PRODUCT_CLIP_TIMEOUT_MS) || 45_000;
    let onClipSettle: (ok: boolean) => void = () => {};
    const genClip = async (sceneIndex: number, noMusic = false): Promise<{ url: string; music: boolean } | null> => {
      // Job already cancelled → don't fire a LATER pool wave's paid Kling call. (A concurrency-
      // bounded fan-out starts clips over time, so a clip picked up after the abort must short-circuit
      // — addEventListener('abort') doesn't fire for an already-aborted signal.)
      if (signal.aborted) { onClipSettle(false); return null; }
      // Pick the shot for this clip — rotate through the uploaded photos by scene index.
      const imageUrl = photos[(sceneIndex >= 0 ? sceneIndex : 0) % photos.length] ?? firstPhoto;
      const clipAc = new AbortController();
      const onAbort = () => clipAc.abort();
      signal.addEventListener('abort', onAbort); // job-cancel → abort this clip too
      const to = setTimeout(() => clipAc.abort(), CLIP_TIMEOUT_MS); // hard per-clip ceiling
      try {
        const r = await fetch('/api/video/remix', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: clipAc.signal,
          // jobId → the remix route's PER-TRANSACTION idempotency ref (remix:productad:<jobId>).
          // All clips of one ad share it; only the primary clip is charged, so a retry of that clip
          // dedupes while a NEW ad (new jobId) charges correctly — fixing the once-per-user under-charge.
          body: JSON.stringify({ op: 'productad', imageUrl, preset, aspect, noMusic, jobId, productDurationSec: duration, ...(sceneIndex >= 0 ? { sceneIndex } : {}) }),
        });
        const j = (await r.json().catch(() => null)) as { url?: string; music?: boolean } | null;
        const out = r.ok && j?.url ? { url: j.url, music: j.music === true } : null;
        onClipSettle(!!out);
        return out;
      } catch {
        // clip timed out (clipAc), the whole job was cancelled (signal), or a network miss —
        // release this clip so the batch proceeds with whatever landed.
        onClipSettle(false);
        if (!signal.aborted) {
          // eslint-disable-next-line no-console
          console.warn(`[product] clip ${sceneIndex} released after ${CLIP_TIMEOUT_MS}ms (timeout/error) — batch continues`);
        }
        return null;
      } finally {
        clearTimeout(to);
        signal.removeEventListener('abort', onAbort);
      }
    };
    // Send finished clip(s) to /api/video/assemble for music + voiceover + overlays.
    const assemble = async (segments: { url: string; durationSec: number }[]): Promise<string | null> => {
      try {
        const ar = await fetch('/api/video/assemble', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal,
          body: JSON.stringify({
            segments,
            orientation: orientationForAssemble,
            scorePrompt,
            ...(marketing ? { marketing } : {}),
            ...(voiceoverScript.trim() ? { voiceoverScript: voiceoverScript.trim() } : {}),
            // The product-ad was ALREADY charged (full price) at the remix step under this jobId;
            // this billing token tells assemble to skip its own charge (no double-bill).
            ...(jobId ? { billingToken: jobId } : {}),
            globalRender: { transition: 'dissolve' },
          }),
        });
        const aj = (await ar.json().catch(() => null)) as { url?: string } | null;
        return ar.ok && aj?.url ? aj.url : null;
      } catch { return null; }
    };
    try {
      if (duration <= 6) {
        // With brand context: silent clip → assemble (music + VO + overlays). Without:
        // the original fast path (remix lays a preset score, no extra round-trip).
        const res = await genClip(-1, enrich);
        if (!res) throw new Error(locale === 'en' ? 'Generation failed. Please try again.' : locale === 'ru' ? 'Не удалось сгенерировать. Попробуйте снова.' : 'გენერაცია ვერ მოხდა. სცადეთ თავიდან.');
        if (enrich) {
          setStage(locale === 'en' ? 'Voiceover + branding…' : locale === 'ru' ? 'Озвучка + брендинг…' : 'გახმოვანება + ბრენდინგი…');
          const finalUrl = await assemble([{ url: res.url, durationSec: 6 }]);
          if (finalUrl) { landVideo(finalUrl); notifyCredit('video', { seconds: 6 }); autoSaveToLibrary(finalUrl, 'film'); return finalUrl; }
        }
        landVideo(res.url); notifyCredit('video', { seconds: 6 }); autoSaveToLibrary(res.url, 'film');
        return res.url;
      }
      const n = Math.round(duration / 5); // 30→6, 60→12 clips of ~5s
      setStage(locale === 'en' ? `Generating ${n} clips…` : locale === 'ru' ? `Генерация ${n} клипов…` : `${n} კლიპის გენერაცია…`);
      // Batch StallDetector (Task 5.1): tick as clips settle; a 5s watchdog surfaces a "provider
      // slow" stage the FIRST time no clip has landed for the stall window — an honest bottleneck
      // flag with NO re-submit (each clip already has its own 45s ceiling), so no double-charge.
      const stall = new StallDetector({ stallMs: Number(process.env.NEXT_PUBLIC_PRODUCT_STALL_MS) || 30_000 });
      let settled = 0;
      onClipSettle = () => { settled += 1; stall.tick(Math.round((settled / n) * 100)); };
      const slowStage = locale === 'en' ? `Generating ${n} clips… ⏳ provider is slow, still working`
        : locale === 'ru' ? `Генерация ${n} клипов… ⏳ провайдер медленный, продолжаем`
        : `${n} კლიპის გენერაცია… ⏳ პროვაიდერი ნელია, ვაგრძელებთ`;
      const watchdog = setInterval(() => { if (!signal.aborted && stall.shouldFlag()) setStage(slowStage); }, 5_000);
      // BOUND THE INNER CLIP FAN-OUT (Step 3): the outer Cap-3 queue governs the product JOB, but a
      // 60s ad is up to 12 genClip calls — an unthrottled Promise.all could stampede Kling (rate-limit
      // / silent drops). Run at most CLIP_CONCURRENCY (default 4) provider calls in flight at once via
      // the shared order-preserving worker pool. Survivor set, StallDetector ticks, per-clip 45s
      // ceiling and job-signal abort are ALL unchanged — only the peak in-flight count is capped.
      const CLIP_CONCURRENCY = Number(process.env.NEXT_PUBLIC_PRODUCT_CLIP_CONCURRENCY) || 4;
      let clips: string[];
      try {
        const settledClips = await mapWithConcurrency(
          Array.from({ length: n }, (_, i) => i),
          CLIP_CONCURRENCY,
          (i) => genClip(i),
        );
        clips = settledClips.filter((c): c is { url: string; music: boolean } => !!c).map((c) => c.url);
      } finally {
        clearInterval(watchdog);
      }
      if (clips.length < 2) {
        if (clips[0]) { landVideo(clips[0]); notifyCredit('video', { seconds: 6 }); autoSaveToLibrary(clips[0], 'film'); return clips[0]; }
        throw new Error(locale === 'en' ? 'Generation failed. Please try again.' : locale === 'ru' ? 'Не удалось сгенерировать. Попробуйте снова.' : 'გენერაცია ვერ მოხდა. სცადეთ თავიდან.');
      }
      setStage(enrich
        ? (locale === 'en' ? 'Stitching + voiceover + branding…' : locale === 'ru' ? 'Сборка + озвучка + брендинг…' : 'შეერთება + გახმოვანება + ბრენდინგი…')
        : (locale === 'en' ? 'Stitching + music…' : locale === 'ru' ? 'Сборка + музыка…' : 'შეერთება + მუსიკა…'));
      const finalUrl = await assemble(clips.map((url) => ({ url, durationSec: 5 })));
      // Assembled master carries the ElevenLabs music bed (+ VO/overlays).
      if (finalUrl) { landVideo(finalUrl); notifyCredit('video', { seconds: duration }); autoSaveToLibrary(finalUrl, 'film'); return finalUrl; }
      if (clips[0]) { landVideo(clips[0]); return clips[0]; } // fail-open: show the first clip
      throw new Error(locale === 'en' ? 'Generation failed.' : locale === 'ru' ? 'Ошибка генерации.' : 'გენერაცია ვერ მოხდა.');
    } catch (e) {
      // Error lands in THIS job's bubble (never a shared panel slot); rethrow → tray shows failed.
      updateBubble(bubbleId, { text: `⚠️ ${e instanceof Error ? e.message : (locale === 'en' ? 'Generation failed.' : locale === 'ru' ? 'Ошибка генерации.' : 'გენერაცია ვერ მოხდა.')}` });
      throw e instanceof Error ? e : new Error('product ad failed');
    }
    } });
  }, [productImage, locale, submitJob, trackJobSettle, updateBubble, productImages, productPreset, productDuration, productAspect, notifyCredit, productBrand, productPrice, productHook, productCta, productCtaCustom, productVoiceover, autoSaveToLibrary, t.remixRunning]);

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
  const createStoryboard = useCallback(async (filmPrompt: string, refs: string[], orientation: 'landscape' | 'vertical' | 'square' | 'portrait') => {
    // FIX 4 — remember this request so a failed render can be retried in one click.
    lastVideoReqRef.current = { filmPrompt, refs, orientation };
    const ac = new AbortController();
    storyboardAbortRef.current = ac;
    setStoryboardBusy(true);
    // 10s→2 · 30s→6 · 60s→12 scenes (5s each). The 60s music video opens with a few
    // establishing/intro beats then moves to the performance.
    const sceneCount = videoDuration <= 6 ? 1 : Math.max(2, Math.min(12, Math.round(videoDuration / 5)));
    try {
      // STEP 1 — fast PLAN-ONLY call: deterministic scene beats, no LLM, no frames.
      // Returns in ~1s so the board opens immediately (no long "frozen" wait).
      const res = await fetch('/api/film/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: ac.signal,
        // PHASE 19 — the pasted multi-scene Master Script drives the STORYBOARD VISUALS in BOTH modes
        // (documentary AND music video): parseMasterScript is fail-open (a non-timecoded / <2-scene paste
        // returns null → brief-driven plan untouched), so a music video with a written treatment gets its
        // scenes honoured while a freeform brief is unaffected. (Spoken multi-voice casting stays doc-only
        // at the RENDER path above — a music video's audio is the song, not TTS dialogue.)
        body: JSON.stringify({ prompt: filmPrompt, orientation, referenceImages: refs, style: videoStyle, locale, sceneCount, planOnly: true, musicVideoMode: videoMode === 'musicvideo', ...(videoMasterScript.trim() ? { masterScript: videoMasterScript.trim() } : {}) }),
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; seed?: number; scenes?: (StoryboardScene & { framePrompt?: string })[]; sceneScripts?: string[] | null };
      if (!(j.success && Array.isArray(j.scenes) && j.scenes.length > 0)) {
        await startFilmRender(filmPrompt, refs, orientation, undefined); // plan miss → direct render (or queue when flag ON)
        return;
      }
      const planned = j.scenes;
      // ANCHOR MODE — when ≥2 reference images were uploaded the route returns them as
      // the ordered per-scene frames (scene 1 → image 1, …). Use them directly and DON'T
      // stream a FLUX frame over them; they also become the render's per-scene anchors.
      const anchorMode = (j as { anchorMode?: boolean }).anchorMode === true;
      // User per-scene action (scene N ↔ scenePrompts[N-1]) overrides that scene's
      // description + marks it edited, so the approve→render path threads it into the
      // clip's script (see onApprove: edited scenes use the user's own words verbatim).
      const userAction = (ordinal: number) => scenePrompts[ordinal - 1]?.trim() || '';
      const scenes: StoryboardScene[] = planned.map((s) => {
        const ua = userAction(s.ordinal);
        // Trust the route's `anchored` flag (Scene 1 lock from a single selfie, OR a per-scene upload with ≥2 refs)
        // so the "Source Reference Locked" badge shows even for the single-selfie case (anchorMode false).
        return { uid: nextSceneUid(), ordinal: s.ordinal, beat: s.beat, prompt: ua || s.prompt, ...(ua ? { edited: true } : {}), frameUrl: s.frameUrl ?? null, anchored: !!s.anchored || (anchorMode && !!s.frameUrl) };
      });
      const framePrompts: Record<number, string> = {};
      // Also steer each scene's FRAME IMAGE with the user's action (falls back to the AI prompt).
      planned.forEach((s) => { framePrompts[s.ordinal] = userAction(s.ordinal) || (s.framePrompt && s.framePrompt.trim()) || s.prompt; });
      const ordinals = scenes.filter((s) => !s.frameUrl).map((s) => s.ordinal); // only un-anchored scenes stream a generated frame
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

      // STEP 2.5 — story enrichment. Decompose the brief into per-scene shots (Gemini-first;
      // it's the LIVE provider — Anthropic/Atlas are dead in prod). The board already opened
      // with SKELETON tiles above, so:
      //  • SCRIPT uploaded → AWAIT the decomposition (bounded ~55s; the live decomposer is
      //    ~45s) and use the shots as the FRAME prompts BEFORE the frames stream below, so
      //    every storyboard image depicts the script instead of generic camera beats.
      //  • typed brief → enrich in the BACKGROUND (frames stay fast deterministic stills;
      //    only the render gets the richer story).
      const hasScript = /SCRIPT \(follow this EXACTLY/i.test(filmPrompt);
      const enrichStory = async () => {
        let scripts: string[] | null = null;
        let character: string | null = null;
        try {
          const sr = await fetch('/api/film/storyboard', {
            // Pass the uploaded reference(s): without them the scene-script agent gets hasReferenceImage=false and
            // INVENTS a persona (the "30-year-old man in a skydiver suit" drift). With refs it locks the real subject
            // and the route vision-extracts the actual character from the photo.
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal,
            body: JSON.stringify({ prompt: filmPrompt, orientation, referenceImages: refs, style: videoStyle, locale, sceneCount, scriptsOnly: true, musicVideoMode: videoMode === 'musicvideo' }),
          });
          const sj = (await sr.json().catch(() => ({}))) as { sceneScripts?: string[] | null; character?: string | null };
          if (Array.isArray(sj.sceneScripts) && sj.sceneScripts.length) scripts = sj.sceneScripts;
          if (typeof sj.character === 'string' && sj.character.trim()) character = sj.character.trim();
        } catch { /* best-effort; frames fall back to deterministic beats */ }
        if (!scripts || !scripts.length) return;
        const finalScripts = scripts;
        if (hasScript) {
          // The per-scene shots BECOME the frame prompts (so each storyboard image depicts
          // the script), unless the user typed a per-scene action (which wins).
          finalScripts.forEach((sc, i) => { const ord = i + 1; if (!userAction(ord) && sc && sc.trim()) framePrompts[ord] = sc.trim(); });
        }
        setStoryboard((prev) => (prev ? {
          ...prev,
          sceneScripts: finalScripts,
          ...(character ? { character } : {}),
          // Reflect the STORY-SPECIFIC per-scene shots in the editable scene captions for
          // EVERY brief — not just attached scripts. A typed brief's scenes used to keep the
          // generic deterministic beat framing on screen (identical across unrelated briefs,
          // e.g. a WWII teaser reading the same as a coffee ad) even though these
          // story-specific scripts already existed and drove the render. Surface them so the
          // storyboard the user reviews matches the actual scene content. User-edited scenes
          // and blank script slots are preserved (see mergeSceneCaptions). NOTE: the FRAME
          // prompts stay gated on `hasScript` above — a typed brief keeps its fast
          // deterministic stills; only the on-screen caption becomes story-specific.
          scenes: mergeSceneCaptions(prev.scenes, finalScripts, (ord) => Boolean(userAction(ord))),
        } : prev));
      };
      if (hasScript) { await Promise.race([enrichStory(), new Promise<void>((r) => setTimeout(r, 90000))]); } else { void enrichStory(); }

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
      await startFilmRender(filmPrompt, refs, orientation, undefined);
    } finally {
      setStoryboardBusy(false);
    }
  }, [videoStyle, locale, videoDuration, startFilmRender, scenePrompts]);

  // Re-roll a SINGLE storyboard frame (the others are untouched) and swap it in —
  // a hot-reload of just this one scene's agent thread, never the master loop. An
  // optional `baseImage` (a data URL the user dropped on this scene via "Change Base
  // Image") becomes THIS scene's identity reference, overriding the film anchor; it's
  // downscaled + persisted on the scene so a later re-roll keeps it.
  const regenScene = useCallback(async (ordinal: number, baseImage?: string) => {
    if (!storyboard || regenningOrdinal !== null) return;
    setRegenningOrdinal(ordinal);
    const scene = storyboard.scenes.find((s) => s.ordinal === ordinal);
    let newBase: string | undefined;
    if (baseImage) {
      try { newBase = await downscaleDataUrl(baseImage, 1280); } catch { newBase = baseImage; }
      setStoryboard((prev) => prev ? { ...prev, scenes: prev.scenes.map((s) => (s.ordinal === ordinal ? { ...s, baseImage: newBase } : s)) } : prev);
    }
    // Per-scene base image (just-supplied or previously stored) wins as the
    // reference; otherwise the film's locked character anchor.
    const refsForScene = newBase ?? scene?.baseImage
      ? [String(newBase ?? scene?.baseImage)]
      : storyboard.refs;
    try {
      const res = await fetch('/api/film/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt: storyboard.filmPrompt, orientation: storyboard.orientation, referenceImages: refsForScene, style: videoStyle, locale, sceneOrdinal: ordinal, ...((scene?.edited && scene.prompt.trim()) ? { scenePrompt: scene.prompt.trim() } : (storyboard.framePrompts?.[ordinal] ? { scenePrompt: storyboard.framePrompts[ordinal] } : {})) }),
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; frameUrl?: string | null };
      if (j.success && typeof j.frameUrl === 'string') {
        const url = j.frameUrl;
        setStoryboard((prev) => prev
          // The re-rolled frame is AI-generated (the sceneOrdinal route always genFrames), so it is NO LONGER the
          // user's exact uploaded image — clear `anchored` so the "Source Reference Locked" badge doesn't go stale.
          ? { ...prev, scenes: prev.scenes.map((s) => (s.ordinal === ordinal ? { ...s, frameUrl: url, anchored: false } : s)) }
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

  // P9 — delete a scene (keep ≥2 for a valid film), then renumber + remap.
  const deleteScene = useCallback((ordinal: number) => {
    setStoryboard((prev) => {
      if (!prev || prev.scenes.length <= 2) return prev;
      return commitSceneOrder(prev, prev.scenes.filter((s) => s.ordinal !== ordinal));
    });
  }, []);

  // P9 — move a scene one slot earlier (-1) / later (+1) in the running order.
  const moveScene = useCallback((ordinal: number, dir: -1 | 1) => {
    setStoryboard((prev) => {
      if (!prev) return prev;
      const i = prev.scenes.findIndex((s) => s.ordinal === ordinal);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.scenes.length) return prev;
      const ordered = prev.scenes.slice();
      const a = ordered[i]!; const b = ordered[j]!;
      ordered[i] = b; ordered[j] = a;
      return commitSceneOrder(prev, ordered);
    });
  }, []);

  // Drag-to-reorder (desktop HTML5 DnD): pull the dragged scene OUT and re-insert it at the drop
  // target's slot, then renumber via the same commitSceneOrder the chevron move uses (positional
  // keys → React reconciles in place, no remount flicker). Touch + keyboard keep the chevron buttons
  // (HTML5 drag events don't fire on touch). No-op when source === target or either is missing.
  const reorderScene = useCallback((fromOrdinal: number, toOrdinal: number) => {
    if (fromOrdinal === toOrdinal) return;
    setStoryboard((prev) => {
      if (!prev) return prev;
      const from = prev.scenes.findIndex((s) => s.ordinal === fromOrdinal);
      const to = prev.scenes.findIndex((s) => s.ordinal === toOrdinal);
      if (from < 0 || to < 0 || from === to) return prev;
      const ordered = prev.scenes.slice();
      const [moved] = ordered.splice(from, 1);
      if (!moved) return prev;
      ordered.splice(to, 0, moved);
      return commitSceneOrder(prev, ordered);
    });
  }, []);

  // P9 — append a blank scene (max 8). Seeded with the film idea as its prompt so a
  // re-roll produces a frame even before the user edits it; it has no frame yet, so
  // the user re-rolls (or edits then re-rolls) before generating.
  const addScene = useCallback(() => {
    setStoryboard((prev) => {
      if (!prev || prev.scenes.length >= 8) return prev;
      const beat = locale === 'en' ? 'New scene' : locale === 'ru' ? 'Новая сцена' : 'ახალი სცენა';
      const blank: StoryboardScene = { uid: nextSceneUid(), ordinal: 90000 + prev.scenes.length, beat, prompt: prev.filmPrompt, frameUrl: null, edited: true };
      return commitSceneOrder(prev, [...prev.scenes, blank]);
    });
  }, [locale]);

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
            ? { prompt: spec.prompt, quality: spec.quality, aspectRatio: spec.aspect, style: spec.style === 'Auto' ? undefined : spec.style, ...(spec.referenceImage ? { referenceImage: spec.referenceImage } : {}), ...(spec.negativePrompt ? { negativePrompt: spec.negativePrompt } : {}) }
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
  /** Replace a chat bubble by its stable id — parallel jobs each finalize their OWN
   *  bubble (the single-slot flows update "the last bubble"; a queue of parallel jobs
   *  cannot). */
  /**
   * Run ONE image generation as a capped-parallel QUEUE JOB. Up to MAX_CONCURRENT_RENDERS
   * render at once; the rest wait with a live "In Queue: #N" position, all surfaced in the
   * JobTray. This path is INDEPENDENT of the single-slot `busy` gate that heavy renders
   * (video/avatar) still use — so images never block, and are never blocked by, a heavy
   * render. Billing is unchanged: each job calls the same /api/nanobanana/image that
   * bills exactly as before; the queue only decides WHEN it starts + tracks its progress.
   */
  const runImageJob = useCallback((prompt: string, imgRef: string | undefined, spec: ImageRegenSpec) => {
    const bubbleId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setMessages((prev) => [...prev, { role: 'user', text: prompt }, { role: 'assistant', text: '', id: bubbleId, genKind: 'image' }]);
    submitJob({
      kind: 'image',
      label: prompt.trim().slice(0, 42) || (locale === 'en' ? 'Image' : locale === 'ru' ? 'Изображение' : 'სურათი'),
      createParams: { prompt },
      onSettle: trackJobSettle,
      run: async ({ signal, onProgress, jobId }) => {
        // Durable-progress: the placeholder row is created at SUBMIT (Task 6); flip it to processing.
        trackJobUpdate(jobId, 'Rendering', 8);
        onProgress({ pct: 8 });
        const res = await fetch('/api/nanobanana/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal,
          body: JSON.stringify({ prompt, quality: spec.quality, aspectRatio: spec.aspect, style: spec.style === 'Auto' ? undefined : spec.style, jobId, ...(imgRef ? { referenceImage: imgRef } : {}), ...(spec.negativePrompt ? { negativePrompt: spec.negativePrompt } : {}) }),
        });
        const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string; code?: string };
        onProgress({ pct: 100 });
        if (j.success && j.url) {
          updateBubble(bubbleId, { text: '', imageUrl: j.url, regen: spec });
          notifyCredit('image');
          return j.url;
        }
        // Show the raw server error ONLY for the insufficient-credits case (a bilingual top-up
        // prompt); for provider errors (English "…timed out") show the localized generic instead.
        updateBubble(bubbleId, { text: `⚠️ ${j.code === 'insufficient_credits' && j.error ? j.error : t.imageFailed}` });
        throw new Error(j.error || 'image failed');
      },
    });
  }, [submitJob, updateBubble, notifyCredit, trackJobSettle, t]);

  /**
   * ×2 / ×4 batch → ONE capped-parallel queue JOB PER TILE. Each tile is fully isolated
   * (own AbortController + own jobId + own durable generation_jobs row), so a ×4 renders
   * 3-at-a-time with the 4th showing "In Queue: #1" in the tray, and each tile survives a
   * reload (hydration) + dedupes server-side (the tile's jobId is passed to the image route,
   * which upserts its completed row under that id). Tiles paint into ONE batch bubble (keyed
   * by a stable batchId) as they land. Replaces the old shared-abortRef/genIdRef Promise.all.
   */
  const runImageBatch = useCallback((spec: ImageRegenSpec, count: number) => {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: spec.prompt },
      { role: 'assistant', text: '', id: batchId, batch: { spec, tiles: Array.from({ length: count }, () => ({ status: 'pending' as const })) } },
    ]);
    // Update tile k of THIS batch bubble (by stable id — parallel tile jobs never clobber).
    const updateTile = (k: number, tile: BatchTile) => {
      setMessages((prev) => prev.map((m) => (m.id === batchId && m.batch ? { ...m, batch: { ...m.batch, tiles: m.batch.tiles.map((t, i) => (i === k ? tile : t)) } } : m)));
    };
    for (let k = 0; k < count; k++) {
      const tileIdx = k;
      submitJob({
        kind: 'image',
        label: `${(spec.prompt || 'Image').trim().slice(0, 32)} (${tileIdx + 1}/${count})`,
        createParams: { prompt: spec.prompt },
        onSettle: trackJobSettle,
        run: async ({ signal, onProgress, jobId }) => {
          trackJobUpdate(jobId, 'Rendering', 8);
          onProgress({ pct: 8 });
          // Stamp the tile with its durable jobId so a mid-render reload can reconcile it against
          // the DB (restore a completed tile from signed_url, or clear the phantom spinner).
          updateTile(tileIdx, { status: 'pending', jobId });
          try {
            const res = await fetch('/api/nanobanana/image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              signal,
              body: JSON.stringify({ prompt: spec.prompt, quality: spec.quality, aspectRatio: spec.aspect, style: spec.style === 'Auto' ? undefined : spec.style, jobId, batchTile: tileIdx, ...(spec.referenceImage ? { referenceImage: spec.referenceImage } : {}), ...(spec.negativePrompt ? { negativePrompt: spec.negativePrompt } : {}) }),
            });
            const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string; code?: string };
            onProgress({ pct: 100 });
            if (j.success && j.url) {
              updateTile(tileIdx, { status: 'done', url: j.url, jobId });
              notifyCredit('image');
              return j.url;
            }
            updateTile(tileIdx, { status: 'failed', jobId });
            throw new Error(j.error || 'image failed');
          } catch (e) {
            updateTile(tileIdx, { status: 'failed', jobId });
            throw e;
          }
        },
      });
    }
  }, [submitJob, trackJobSettle, notifyCredit]);

  // PHASE 29 (VECTOR 1) — Script-to-Storyboard: decompose a pasted script into N identity-anchored scenes
  // via the EXISTING storyboard route (scriptsOnly — deterministic split, else the Prompt Agent; no new
  // backend), then hand the whole grid to the Video Studio through the bridge store, which pre-populates
  // every scene lane. Fail-open: a decomposition miss still bridges the raw script as a single-scene brief.
  // PHASE 36 — STEP 1: "Generate Storyboard Frames". Splits the script into N identity-anchored scenes and
  // RENDERS a real frame for each (identity-locked to one character portrait), streaming each thumbnail into
  // the Image Studio so the user can verify the visuals BEFORE transferring. Does NOT navigate. Fail-open:
  // any per-scene miss (retried once) leaves that tile empty; the rest still render.
  const generateImageStoryboard = useCallback(async () => {
    const script = imgBoardScript.trim();
    if (imgBoardBusy || !script) return;
    const sceneCount = imgBoardDuration === 60 ? 12 : 6;
    const orientation: 'landscape' | 'vertical' = imgAspect === '9:16' ? 'vertical' : 'landscape';
    const base = { orientation, style: imgStyle, locale, sceneCount };
    const post = (body: Record<string, unknown>) => fetch('/api/film/storyboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ ...base, prompt: script, ...body }),
    }).then((r) => r.json().catch(() => ({}))).catch(() => ({}));

    setImgBoardBusy(true);
    setImgBoardScenes([]);
    setImgBoardCharacter(undefined);
    try {
      // 1) Script Agent → per-scene prompts + the locked character fragment.
      let scripts: string[] = [];
      let character: string | undefined;
      const sj = (await post({ scriptsOnly: true, masterScript: script })) as { sceneScripts?: string[]; character?: string };
      if (Array.isArray(sj.sceneScripts) && sj.sceneScripts.length) {
        scripts = sj.sceneScripts.slice(0, sceneCount).map((s) => (s || '').trim()).filter(Boolean);
        if (typeof sj.character === 'string' && sj.character.trim()) character = sj.character.trim();
      }
      if (!scripts.length) scripts = Array.from({ length: sceneCount }, () => script); // fallback: brief per scene
      setImgBoardCharacter(character);
      // Seed the tiles (frames pending) so the scene list appears at once.
      setImgBoardScenes(scripts.map((s, i) => ({ ordinal: i + 1, frameUrl: null, prompt: s, script: s })));

      // 2) One character-anchor portrait → locks every scene frame to the SAME person (fail-open).
      const aj = (await post({ characterAnchor: true })) as { anchorUrl?: string };
      const anchorUrl = typeof aj.anchorUrl === 'string' && /^https?:\/\//.test(aj.anchorUrl) ? aj.anchorUrl : null;

      // 3) Render each scene's frame (identity-locked), capped concurrency, one retry, streaming into its tile.
      const renderScene = async (i: number) => {
        const reqBody = { sceneOrdinal: i + 1, scenePrompt: scripts[i] ?? script, ...(anchorUrl ? { referenceImages: [anchorUrl] } : {}) };
        for (let attempt = 0; attempt < 2; attempt++) {
          const fj = (await post(reqBody)) as { frameUrl?: string };
          const url = typeof fj.frameUrl === 'string' && /^https?:\/\//.test(fj.frameUrl) ? fj.frameUrl : null;
          if (url) { setImgBoardScenes((prev) => prev.map((c) => (c.ordinal === i + 1 ? { ...c, frameUrl: url } : c))); return; }
        }
      };
      let idx = 0;
      await Promise.all(Array.from({ length: Math.min(3, scripts.length) }, async () => {
        while (idx < scripts.length) { const i = idx++; await renderScene(i); }
      }));
    } finally {
      setImgBoardBusy(false); // structurally guaranteed — the busy state can never get stuck
    }
  }, [imgBoardScript, imgBoardBusy, imgBoardDuration, imgAspect, imgStyle, locale]);

  // PHASE 36 — STEP 2: "Export Storyboard to Video Studio". Packs the rendered frame URLs + the per-scene
  // scripts and bridges them into the Video Studio's Scene-frame + Master-Script lanes (no manual download).
  const exportImageStoryboardToVideo = useCallback(() => {
    if (!imgBoardScenes.length) return;
    const orientation: 'landscape' | 'vertical' = imgAspect === '9:16' ? 'vertical' : 'landscape';
    const payload = serializeStoryboardMatrix({
      theme: imgBoardScript.trim().slice(0, 400) || 'storyboard',
      cells: imgBoardScenes,
      orientation,
      duration: imgBoardDuration,
      ...(imgBoardCharacter ? { character: imgBoardCharacter } : {}),
    });
    setTransitStoryboard(payload); // the bridge effect switches to Video mode + pre-populates every scene lane
  }, [imgBoardScenes, imgBoardScript, imgAspect, imgBoardDuration, imgBoardCharacter, setTransitStoryboard]);

  /**
   * MUSIC generation → a capped-parallel queue JOB (own signal + jobId + durable row), so a
   * track renders ALONGSIDE images/product/swap through the tray instead of the old
   * single-slot busy path. The server keeps its Udio→ElevenLabs→MusicGen latency-failover
   * (/api/ai/music); we pass the jobId so its completion row upserts under the client id
   * (one row, no duplicate). Result lands in its OWN chat bubble by id.
   */
  const runMusicJob = useCallback((m: {
    prompt: string; userBubble: string; medias?: Media[]; useTrained: boolean;
    audioRef?: string; audioMime?: string; audioMode: string; genre: string;
    duration: number; tempo: string; instrumental: boolean; voiceType: string; lyrics: string;
  }) => {
    const bubbleId = `music_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: m.userBubble, ...(m.medias?.length ? { medias: m.medias } : {}) },
      { role: 'assistant', text: m.useTrained ? t.generatingMyVoice : '', id: bubbleId, genKind: 'music' },
    ]);
    submitJob({
      kind: 'music',
      label: m.prompt.trim().slice(0, 42) || (locale === 'en' ? 'Music' : locale === 'ru' ? 'Музыка' : 'მუსიკა'),
      createParams: { prompt: m.prompt },
      onSettle: trackJobSettle,
      run: async ({ signal, onProgress, jobId }) => {
        trackJobUpdate(jobId, 'Composing', 10);
        onProgress({ pct: 10 });
        // Cover / voice: host the attached track first so the request body stays tiny.
        const uploadedAudioUrl = m.audioRef ? await uploadBigFile(m.audioRef, m.audioMime || 'audio/mpeg') : undefined;
        const isVoiceClone = !!uploadedAudioUrl && m.audioMode === 'voice' && !m.useTrained;
        const res = await fetch('/api/ai/music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal,
          body: JSON.stringify({
            prompt: m.prompt, style: m.genre, durationSec: m.duration, tempo: m.tempo, jobId,
            ...(m.useTrained ? { useMyVoice: true } : {}),
            instrumental: (m.useTrained || isVoiceClone) ? false : m.instrumental,
            ...(!m.instrumental && !m.useTrained && !isVoiceClone ? { voiceType: m.voiceType } : {}),
            ...((m.useTrained || isVoiceClone || !m.instrumental) && m.lyrics ? { lyrics: m.lyrics } : {}),
            ...(m.useTrained ? {} : isVoiceClone ? { voiceReference: uploadedAudioUrl } : uploadedAudioUrl ? { audioReference: uploadedAudioUrl } : {}),
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string; coverUrl?: string; engine?: string; code?: string };
        onProgress({ pct: 100 });
        if (j.success && j.url) {
          updateBubble(bubbleId, { text: '', audioUrl: j.url, ...(j.coverUrl ? { coverUrl: j.coverUrl } : {}), ...(j.engine ? { engine: j.engine } : {}), regen: { kind: 'music', prompt: m.prompt, genre: m.genre, instrumental: m.instrumental, ...(!m.instrumental && m.lyrics ? { lyrics: m.lyrics } : {}) } });
          notifyCredit('music', { seconds: m.duration === 0 ? 90 : m.duration });
          return j.url;
        }
        updateBubble(bubbleId, { text: /copyright|copyrighted/i.test(j.error || '') ? t.lyricsBlocked : `⚠️ ${j.code === 'insufficient_credits' && j.error ? j.error : t.musicFailed}` });
        throw new Error(j.error || 'music failed');
      },
    });
  }, [submitJob, trackJobSettle, updateBubble, notifyCredit, locale, t]);

  // Stream one chat turn from /api/chat/gemini into a fresh assistant bubble. Shared
  // by send (a new turn) and regenerateChat (re-roll the last answer). Owns its own
  // gen token so Stop / a superseded request never clobbers a newer stream.
  // ── Server-side chat persistence (cross-device / cross-reload durability) ──────────────────
  // Chat previously lived ONLY in localStorage (device-local, lost on cache-clear). We now mirror
  // each turn to Supabase (chat_sessions/chat_messages) via the fail-soft chat-history helpers.
  // A session is minted LAZILY on the first authed chat turn; anonymous users skip entirely
  // (fail-open — no server row, RLS would reject anyway). The session id is cached in a ref +
  // localStorage (scoped to the signed-in user) so a reload on the SAME device keeps appending to
  // the same server session; a different account on that device mints its own.
  const chatSessionIdRef = useRef<string | null>(null);
  const chatSessionInflightRef = useRef<Promise<string | null> | null>(null);
  // Clear the cached session on ANY auth change so an IN-PLACE account switch (A signs out, B
  // signs in with no page reload) never appends B's turns to A's cached session. ensureChatSession
  // then re-resolves under B's identity (the localStorage pointer is uid-scoped, so same-user
  // reloads still resume the same session).
  useEffect(() => {
    const sb = createBrowserClient();
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange(() => { chatSessionIdRef.current = null; });
    return () => { try { data.subscription.unsubscribe(); } catch { /* noop */ } };
  }, []);
  const ensureChatSession = useCallback((): Promise<string | null> => {
    if (chatSessionIdRef.current) return Promise.resolve(chatSessionIdRef.current);
    // In-flight dedup: two concurrent first-turns share ONE createSession (no duplicate sessions).
    if (chatSessionInflightRef.current) return chatSessionInflightRef.current;
    const run = (async (): Promise<string | null> => {
      try {
        const sb = createBrowserClient();
        if (!sb) return null;
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return null; // anonymous → no server persistence (fail-open)
        let sid: string | null = null;
        try {
          const raw = localStorage.getItem('myavatar:chat-session');
          if (raw) { const p = JSON.parse(raw) as { uid?: string; sid?: string }; if (p?.uid === user.id && p.sid) sid = p.sid; }
        } catch { /* ignore unreadable storage */ }
        if (!sid) {
          sid = await createSession(user.id, 'agent-g');
          if (sid) { try { localStorage.setItem('myavatar:chat-session', JSON.stringify({ uid: user.id, sid })); } catch { /* ignore */ } }
        }
        chatSessionIdRef.current = sid;
        return sid;
      } catch { return null; }
      finally { chatSessionInflightRef.current = null; }
    })();
    chatSessionInflightRef.current = run;
    return run;
  }, []);
  // Fire-and-forget mirror of one chat turn to the server. Never blocks or throws into the chat
  // UX; ensureChatSession + saveMessage are both fail-soft (anonymous / RLS / network → no-op).
  const persistChatTurn = useCallback((role: 'user' | 'assistant', content: string) => {
    const text = (content || '').trim();
    if (!text) return;
    void ensureChatSession().then((sid) => { if (sid) void saveMessage(sid, role, text); });
  }, [ensureChatSession]);

  // ── Mount hydration: server chat RESUME (#1) + batch-tile RECONCILIATION (#3) ────────────────
  // For an AUTHENTICATED user, once on mount:
  //  • local view EMPTY (fresh device / cleared cache) → hydrate the text transcript from Supabase
  //    (getMessages) so chat history follows the ACCOUNT cross-device, not just this device's
  //    localStorage. (Media / generation bubbles aren't server-persisted, so this restores the
  //    conversation text — the durable transcript — not device-local media tiles.)
  //  • local view NON-EMPTY (same device) → keep the rich local view and instead RECONCILE any
  //    still-pending image-batch tiles against the DB: a client-driven render can't resume after a
  //    reload, so restore a completed tile from its signed_url or clear the phantom spinner (→ failed).
  // Fully fail-open: anonymous / demo / no session / network → the localStorage view stands.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createBrowserClient();
        if (!sb) return;
        const { data: { user } } = await sb.auth.getUser();
        if (!user || !alive) return;
        if (messagesRef.current.length === 0) {
          // #1 — resume the text transcript from the server (cross-device).
          let sid: string | null = null;
          try {
            const raw = localStorage.getItem('myavatar:chat-session');
            if (raw) { const p = JSON.parse(raw) as { uid?: string; sid?: string }; if (p?.uid === user.id && p.sid) sid = p.sid; }
          } catch { /* ignore */ }
          if (!sid) {
            const convos = await getConversations(user.id);
            sid = convos[0]?.session_id ?? null;
            if (sid) { try { localStorage.setItem('myavatar:chat-session', JSON.stringify({ uid: user.id, sid })); } catch { /* ignore */ } }
          }
          if (!sid || !alive) return;
          chatSessionIdRef.current = sid; // reuse for the write path (continue the resumed session)
          const rows = await getMessages(sid);
          if (!alive || rows.length === 0) return;
          const serverMsgs: Msg[] = rows
            .filter((r) => r.role === 'user' || r.role === 'assistant')
            .map((r) => ({ role: r.role as 'user' | 'assistant', text: r.content }));
          // Guard against a race: only replace if the view is STILL empty (user hasn't typed yet).
          if (serverMsgs.length && messagesRef.current.length === 0) setMessages(serverMsgs);
        } else if (messagesRef.current.some((m) => m.batch?.tiles.some((t) => t.status === 'pending' && t.jobId))) {
          // #3 — reconcile still-pending batch tiles against the durable generation_jobs rows.
          const res = await fetch('/api/orchestrator/jobs?limit=50', { credentials: 'include' });
          if (!res.ok || !alive) return;
          const { jobs } = (await res.json().catch(() => ({ jobs: [] }))) as { jobs: { id: string; status: string; signed_url: string | null }[] };
          const byId = new Map((jobs || []).map((j) => [j.id, j]));
          setMessages((prev) => prev.map((m) => {
            if (!m.batch) return m;
            let changed = false;
            const tiles = m.batch.tiles.map((t): BatchTile => {
              if (t.status !== 'pending' || !t.jobId) return t;
              changed = true;
              const row = byId.get(t.jobId);
              return row?.status === 'completed' && row.signed_url
                ? { status: 'done', url: row.signed_url, jobId: t.jobId }
                : { status: 'failed', jobId: t.jobId };
            });
            return changed ? { ...m, batch: { ...m.batch, tiles } } : m;
          }));
        }
      } catch { /* fail-open → localStorage view */ }
    })();
    return () => { alive = false; };
  }, []);

  // CROSS-DEVICE SIDEBAR SYNC — on mount, for an AUTHENTICATED user, pull the account's server chat
  // sessions (getConversations) and MERGE any not already local into the sidebar, so a PC / iPad /
  // iPhone all show identical history (the sidebar's real cross-device gap: it previously initialized
  // ONLY from this device's localStorage). Strictly ADDITIVE + non-destructive (only ADDS "cloud"
  // entries, never deletes a local chat) + fail-open (anonymous / no server / error → the localStorage
  // sidebar stands unchanged). The persistent ChatChrome sidebar refreshes on the dispatched event.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createBrowserClient();
        if (!sb) return;
        const { data: { user } } = await sb.auth.getUser();
        if (!user || !alive) return;
        const server = await getConversations(user.id); // [{ session_id, title, updated_at }]
        if (!alive || !server.length) return;
        const localList = loadConversations();
        const additions = computeCloudAdditions(localList, server);
        if (!additions.length) return;
        const merged = [...localList, ...additions.map((a) => ({ ...a, messages: [] as Msg[] }))]
          .sort((x, y) => (y.updatedAt ?? 0) - (x.updatedAt ?? 0))
          .slice(0, CONV_MAX);
        saveConversations(merged);
        if (!alive) return;
        setHistoryList(loadConversations());
        window.dispatchEvent(new Event('myavatar:conversations-updated')); // refresh the persistent sidebar
      } catch { /* fail-open → localStorage sidebar */ }
    })();
    return () => { alive = false; };
  }, []);

  // VECTOR 1 — run the generation the chat model tried to route via a hallucinated { "service": … } JSON (the
  // deterministic intentDetector missed the phrasing, so it fell through to the LLM). Invoked ONLY from the one-tap
  // Generate chip (a user gesture) — NEVER auto-fired, so a hallucinated/teaching JSON can never silently charge.
  // image/music dispatch straight to their Cap-3 queue; video/avatar switch to that studio with the prompt prefilled
  // (heavy multi-step jobs the user should launch from the panel).
  const dispatchServiceBlock = useCallback((service: ChatService, prompt: string) => {
    const p = prompt.trim().slice(0, 2000);
    if (!p) return;
    if (service === 'image') {
      const neg = imgNegative.trim();
      const spec: ImageRegenSpec = { kind: 'image', prompt: p, quality: imgQuality, aspect: imgAspect, style: imgStyle, ...(neg ? { negativePrompt: neg } : {}) };
      runImageJob(p, undefined, spec);
    } else if (service === 'music') {
      runMusicJob({
        prompt: p, userBubble: p, useTrained: false, audioMode: musicAudioMode, genre: musicGenre,
        duration: musicDuration, tempo: musicTempo, instrumental: musicInstrumental, voiceType: musicVoiceType, lyrics: '',
      });
    } else if (service === 'video') {
      setMode('video'); setInput(p);
    } else if (service === 'avatar') {
      setMode('lipsync'); setInput(p);
    }
  }, [runImageJob, runMusicJob, imgNegative, imgQuality, imgAspect, imgStyle, musicAudioMode, musicGenre, musicDuration, musicTempo, musicInstrumental, musicVoiceType]);

  const streamChat = useCallback(async (history: Msg[]) => {
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;
    setMessages([...history, { role: 'assistant', text: '' }]);
    setBusy(true);
    let assistantText = ''; // accumulate the streamed reply so we can mirror it to the server on completion
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
        body: JSON.stringify({ messages: payload, ...(chatLang !== 'auto' ? { language: chatLang } : {}), ...(chatTier === 'pro' ? { tier: 'pro' } : {}) }), credentials: 'include', signal: ac.signal,
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
              assistantText += j.text;
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
      // Stream finished cleanly (not superseded) → mirror the reply to the server. VECTOR 1: when a hallucinated
      // { "service": … } routing block DOMINATES the reply, persist the CLEANED text so the raw JSON never lives in
      // history (the bubble keeps the original so its render can still offer the one-tap Generate chip). A long
      // answer that merely contains an example JSON is persisted verbatim. Generation is NEVER auto-fired here.
      if (mine() && assistantText.trim()) {
        const svc = hasServiceBlock(assistantText) ? parseServiceBlock(assistantText) : null;
        const cleaned = svc && svc.service && svc.text.length < 200 ? svc.text : assistantText;
        persistChatTurn('assistant', cleaned);
      }
    } catch {
      if (!mine()) return; // stopped / superseded — keep the partial stream as-is
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant' && !last.text) next[next.length - 1] = { ...last, text: locale === 'en' ? '⚠️ Something went wrong. Please try again.' : locale === 'ru' ? '⚠️ Что-то пошло не так. Попробуйте снова.' : '⚠️ პასუხის მიღება ვერ მოხერხდა. სცადე თავიდან.' };
        return next;
      });
    } finally {
      if (mine()) setBusy(false);
    }
  }, [chatLang, chatTier, persistChatTurn]);

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

  // Agent G router (shared by typed send + voice dictation). Returns true if it consumed the message + routed the
  // attached asset into the Surgical Editor. Strictly gated (chat mode · one editable asset · imperative edit intent)
  // and fail-open (a timeout/error just returns false → the message continues to normal chat with a gentle toast).
  // Kill every live-dictation echo on a COMMITTED dispatch so the sent/routed text can't linger or
  // re-appear. There are TWO recognizers — the Web Speech recognizer AND the record-and-transcribe
  // fallback (iOS/WebView) — and the recorder kept streaming transcription into the composer AFTER
  // send, which is exactly why the dictated text "stayed" in the input. We discard any further
  // transcription, stop both recognizers, reset the STT accumulators, then blur so a mobile IME
  // COMMITS its buffer (a programmatic value='' alone doesn't visibly clear on-screen). Shared by
  // tryAgentGRoute (the dictate-then-route path) AND send's image/music/chat-generative intercepts,
  // which all `return` before the main dispatch block — without it they leaked the lingering-input bug.
  const stopDictationEcho = useCallback(() => {
    sttDiscardRef.current = true;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    try { recRef.current?.stop(); } catch { /* noop */ }
    sttBaseRef.current = '';
    sttFinalRef.current = '';
    try { taRef.current?.blur(); } catch { /* noop */ }
  }, []);

  const tryAgentGRoute = useCallback(async (text: string): Promise<boolean> => {
    if (mode !== 'chat' || attachments.length !== 1) return false;
    const a0 = attachments[0];
    const gKind = a0 ? (isImage(a0.mimeType) ? 'image' : isVideo(a0.mimeType) ? 'video' : isAudio(a0.mimeType) ? 'audio' : null) : null;
    if (!a0 || !gKind || !isImperativeCommand(text) || classifyIntent(text, gKind).route === 'CLARIFY') return false;
    setAgentGPhase(0); setAgentGBusy(true);
    const phaseTimer = window.setInterval(() => setAgentGPhase((p) => (p < 3 ? p + 1 : p)), 500);
    try {
      const gRes = await fetch('/api/ai/agent-g', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ text, mediaKind: gKind }), signal: AbortSignal.timeout(20000),
      });
      const gj = (await gRes.json().catch(() => null)) as { route?: string; action?: string | null; actions?: string[] } | null;
      window.clearInterval(phaseTimer);
      if (gRes.ok && gj?.route && gj.route !== 'CLARIFY') {
        setAgentGPhase(4);
        const actions = Array.isArray(gj.actions) && gj.actions.length ? gj.actions : gj.action ? [gj.action] : [];
        setEditorAsset({ url: a0.dataUrl, kind: gKind, ...(actions.length ? { autoActions: actions } : {}) });
        setInput(''); setAttachments([]); setOptionsOpen(false);
        stopDictationEcho(); // a DICTATED edit command must not linger/re-appear after routing to the editor
        await new Promise((r) => window.setTimeout(r, 320)); // let "opening" show for a beat
        setMode('surgical');
        setAgentGBusy(false);
        return true;
      }
    } catch {
      window.clearInterval(phaseTimer);
      const msg = locale === 'en' ? 'G-Agent unavailable — continuing in chat' : locale === 'ru' ? 'G-Agent недоступен — продолжаю в чате' : 'G-Agent მიუწვდომელია — ვაგრძელებ ჩატში';
      setShareToast(msg); window.setTimeout(() => setShareToast((s) => (s === msg ? null : s)), 2400);
    }
    setAgentGBusy(false);
    return false;
  }, [mode, attachments, locale, stopDictationEcho]);

  // Voice → Agent G (V2): the dictated transcript settles into `input`; when recording stops, route it the same way
  // a typed command would. Both effects are purely additive — they never touch the STT internals. tryAgentGRoute is
  // strictly gated (attached asset + imperative edit), so ordinary dictation is a no-op.
  const latestInputRef = useRef(input);
  useEffect(() => { latestInputRef.current = input; }, [input]);
  const voiceStopAtRef = useRef(0);
  const prevRecordingRef = useRef(false);
  useEffect(() => {
    if (prevRecordingRef.current && !recording) voiceStopAtRef.current = Date.now();
    prevRecordingRef.current = recording;
  }, [recording]);
  // A changed attachment set invalidates any pending voice command — intent must be (re)issued with the asset present.
  // This closes the "dictate without an asset, then attach within the window → stale auto-charge" hole.
  useEffect(() => { voiceStopAtRef.current = 0; }, [attachments]);
  // Debounced SINGLE-SHOT: ~900ms after the transcript settles post-stop, route it ONCE with the latest text. The
  // token is consumed inside the timer (not on agentGBusy), so a non-routing agent-g reply can't re-arm a retry loop.
  useEffect(() => {
    if (recording || !voiceStopAtRef.current) return;
    if (Date.now() - voiceStopAtRef.current > 4000) { voiceStopAtRef.current = 0; return; }
    const id = window.setTimeout(() => {
      if (!voiceStopAtRef.current) return;      // may have been cleared by an attachment change
      voiceStopAtRef.current = 0;               // consume — exactly one attempt per voice stop
      const t = latestInputRef.current.trim();
      if (t) void tryAgentGRoute(t);
    }, 900);
    return () => window.clearTimeout(id);
  }, [input, recording, tryAgentGRoute]);

  const send = useCallback(async (opts?: { forceMyVoice?: boolean; promptOverride?: string }) => {
    const text = (opts?.promptOverride ?? input).trim();
    // VIDEO with a loaded script / scene frames can generate with NO typed text + NO image
    // attachment — otherwise this guard silently blocked a script-only run from starting.
    const videoOnlyInputs = mode === 'video' && (!!videoScriptDoc?.text?.trim() || videoCharacterRefs.length > 0);
    // Nothing to send → return quietly (no toast for an empty box).
    if (!text && attachments.length === 0 && !videoOnlyInputs) return;
    // PHASE 20 — request native-notification permission on the GENERATE gesture (this click),
    // for generative modes only. Must ride a user gesture (Chrome/Firefox block mount-time
    // prompts); once granted/denied it never re-prompts. Fire-and-forget — never blocks the send.
    if (mode !== 'chat') void ensureNotificationPermission();
    // AGENT G — a chat submit with one attached editable asset + an imperative edit command routes into the Surgical
    // Editor (and auto-runs the mapped action/chain). Fully gated inside tryAgentGRoute; returns false → normal chat.
    if (await tryAgentGRoute(text)) return;
    // IMAGE (single OR ×2/×4 batch) → the capped-parallel JOB QUEUE. This bypasses the
    // single-slot busy gate below, so a user can fire several images (they render 3-at-a-
    // time with live positions in the tray) AND start an image while a heavy video/avatar
    // render is in flight. A batch decomposes into ONE queue job PER TILE (each with its own
    // jobId + durable row), so a ×4 shows "3 rendering + In Queue: #1" and the 4th promotes
    // as a slot frees — instead of the old shared-ref Promise.all-of-4.
    if (mode === 'image' && text && !attachments.some((a) => !isImage(a.mimeType))) {
      setOptionsOpen(false);
      const rawRef = attachments.find((a) => isImage(a.mimeType))?.dataUrl;
      const ref = rawRef ? await downscaleDataUrl(rawRef) : undefined;
      const neg = imgNegative.trim();
      const spec: ImageRegenSpec = { kind: 'image', prompt: text, quality: imgQuality, aspect: imgAspect, style: imgStyle, ...(ref ? { referenceImage: ref } : {}), ...(neg ? { negativePrompt: neg } : {}) };
      if (imgCount > 1) runImageBatch(spec, imgCount);
      else runImageJob(text, ref, spec);
      setInput('');
      setAttachments([]);
      stopDictationEcho();
      return;
    }
    // MUSIC → the capped-parallel JOB QUEUE (also bypasses the busy gate below), so a track
    // renders alongside images/product/swap. An attached AUDIO is a cover/voice source; a
    // non-audio attachment falls through to multimodal chat (unchanged).
    {
      const mAudioRef = mode === 'music' ? attachments.find((a) => isAudio(a.mimeType))?.dataUrl : undefined;
      const mAudioMime = mode === 'music' ? attachments.find((a) => isAudio(a.mimeType))?.mimeType : undefined;
      const mBlocked = mode === 'music' && attachments.some((a) => !isAudio(a.mimeType));
      // Trained voice sings — it's meaningless for an INSTRUMENTAL track, and useMyVoice
      // persists across a Song→Instrumental switch (B4 just un-renders), so guard it here so
      // an explicit Instrumental choice is never silently overridden into a sung trained track.
      const mUseTrained = mode === 'music' && (useMyVoice || !!opts?.forceMyVoice) && hasTrainedVoice && !musicInstrumental;
      if (mode === 'music' && (text || mAudioRef || mUseTrained) && !mBlocked) {
        setOptionsOpen(false);
        const musicPrompt = text || musicLyrics.trim() || `${musicGenre} music`;
        const userBubble = text || (mUseTrained ? t.voiceMode : mAudioRef ? `🎤 ${musicAudioMode === 'voice' ? t.voiceMode : t.coverMode}` : musicPrompt);
        runMusicJob({
          prompt: musicPrompt, userBubble, medias: attachments, useTrained: mUseTrained,
          audioRef: mAudioRef, audioMime: mAudioMime, audioMode: musicAudioMode, genre: musicGenre,
          duration: musicDuration, tempo: musicTempo, instrumental: musicInstrumental,
          voiceType: musicVoiceType, lyrics: musicLyrics.trim(),
        });
        setInput('');
        setAttachments([]);
        stopDictationEcho();
        return;
      }
    }
    // ── AUTONOMOUS CHAT DISPATCH (image · music) ───────────────────────────────
    // STEP 1 (agency): in CHAT mode a natural generative ask — "generate a majestic tiger image",
    // "make an epic lofi beat" — is classified by the shared detectIntent brain and dispatched to
    // the SAME per-job Cap-3 queue the panels use, WITHOUT a manual mode switch. Only high-confidence
    // action-verb matches fire; the result renders in its OWN chat bubble like every other job. Runs
    // BEFORE the busy gate (like the mode intercepts) so it's queue-governed + concurrent. Anything
    // else (questions, "describe this photo", chat) falls through to the multimodal stream, unchanged
    // — fail-open, zero regression. Video keeps its isVideoIntent route below (broadened to honor this).
    // Guard against FALSE-POSITIVE HIJACK with an ALLOWLIST: detectIntent's banks are loose (bare
    // model keywords, verb + `.*` + media noun), so questions/declaratives/complaints ("is flux better
    // than sdxl", "my client asked for a music video", "the app won't let me generate a video") would
    // classify as generation. isGenerativeCommand dispatches ONLY an imperative command that LEADS with
    // a generate verb; everything else stays in the text stream (no wrong render / no wrong charge).
    const chatIntent = mode === 'chat' && text && isGenerativeCommand(text) ? detectIntent(text) : null;
    if (chatIntent && chatIntent.confidence >= 0.7) {
      // IMAGE — text→image; an attached image becomes an img2img ref (mirrors the Image panel).
      if (chatIntent.intent === 'image_generation' && !attachments.some((a) => !isImage(a.mimeType))) {
        setOptionsOpen(false);
        const rawRef = attachments.find((a) => isImage(a.mimeType))?.dataUrl;
        const ref = rawRef ? await downscaleDataUrl(rawRef) : undefined;
        const neg = imgNegative.trim();
        const spec: ImageRegenSpec = { kind: 'image', prompt: text, quality: imgQuality, aspect: imgAspect, style: imgStyle, ...(ref ? { referenceImage: ref } : {}), ...(neg ? { negativePrompt: neg } : {}) };
        if (imgCount > 1) runImageBatch(spec, imgCount); else runImageJob(text, ref, spec);
        setInput(''); setAttachments([]); stopDictationEcho();
        return;
      }
      // MUSIC — text→music using the Music panel defaults (genre/duration/tempo). A non-audio
      // attachment falls through to chat (an audio attachment is a cover/voice source).
      if (chatIntent.intent === 'music_generation' && !attachments.some((a) => !isAudio(a.mimeType))) {
        setOptionsOpen(false);
        const mAudioRef = attachments.find((a) => isAudio(a.mimeType))?.dataUrl;
        const mAudioMime = attachments.find((a) => isAudio(a.mimeType))?.mimeType;
        const mUseTrained = (useMyVoice || !!opts?.forceMyVoice) && hasTrainedVoice && !musicInstrumental;
        runMusicJob({
          prompt: text, userBubble: text, medias: attachments, useTrained: mUseTrained,
          audioRef: mAudioRef, audioMime: mAudioMime, audioMode: musicAudioMode, genre: musicGenre,
          duration: musicDuration, tempo: musicTempo, instrumental: musicInstrumental,
          voiceType: musicVoiceType, lyrics: musicLyrics.trim(),
        });
        setInput(''); setAttachments([]); stopDictationEcho();
        return;
      }
    }
    // A generation is already running (this mode OR another — e.g. a video render still in
    // flight while the user switches to Music and hits send). Don't silently swallow it:
    // tell the user why, then bail. `busy` is kept explicit for this mode; genActiveRef
    // catches the cross-mode cases (storyboard/product/remix).
    if (busy || genActiveRef.current) { toast(busyToastMessage(locale)); return; }
    // MOBILE FIX — collapse the settings panel on generation so the result (video +
    // render progress) isn't buried behind a 58dvh options sheet. The feed (flex-1)
    // then fills the screen; the user re-opens settings to tweak the next run.
    setOptionsOpen(false);
    // Kill dictation echo on every committed send (shared with the image/music/chat-generative
    // intercepts above, which return before this point) so a late transcription can't re-fill the
    // composer and the mobile IME buffer commits — see stopDictationEcho for the full rationale.
    stopDictationEcho();

    // New generation token + abort controller. Every async finalizer below checks
    // `mine()` before mutating state, so Stop (which bumps the token + aborts) or a
    // superseded request can never overwrite a newer bubble or re-toggle `busy`.
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;

    // ── VIDEO REMIX (chat-attached) ────────────────────────────────────────────
    // A video attached in chat + a text request = "edit this video", NOT the film
    // pipeline. Claude (with a keyword fallback) classifies the intent, then the
    // matching ffmpeg/generative op runs via /api/video/remix. Fail-open: any miss
    // surfaces a clean retry notice and keeps the original.
    if (mode === 'chat' && text && attachments.some((a) => isVideo(a.mimeType))) {
      const videoAtt = attachments.find((a) => isVideo(a.mimeType))!;
      // remixOpKind drives the Remix Studio staged-timer panel; starts generic, then
      // gets patched to the classified op once the intent call resolves (~1s).
      setMessages((prev) => [...prev, { role: 'user', text, medias: attachments }, { role: 'assistant', text: t.remixRunning, remixOpKind: 'remix' }]);
      setInput(''); setAttachments([]); setBusy(true);
      try {
        const intentRes = await fetch('/api/video/remix-intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal, body: JSON.stringify({ message: text }) });
        const intent = (await intentRes.json().catch(() => ({}))) as { op?: string; params?: Record<string, unknown> };
        // Patch the pending bubble so the panel shows the op-specific stages + ETA.
        if (mine() && intent.op) setMessages((prev) => { const next = [...prev]; const last = next[next.length - 1]; if (last && last.role === 'assistant' && !last.videoUrl) next[next.length - 1] = { ...last, remixOpKind: intent.op }; return next; });
        const videoUrl = await uploadBigFile(videoAtt.dataUrl, videoAtt.mimeType || 'video/mp4');
        if (!videoUrl) throw new Error('upload failed');
        const res = await fetch('/api/video/remix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal, body: JSON.stringify({ op: intent.op || 'color_grade', videoUrl, text, ...(intent.params || {}) }) });
        const j = (await res.json().catch(() => ({}))) as { url?: string | null; error?: string };
        setMessages((prev) => {
          if (!mine()) return prev;
          const next = [...prev]; const last = next[next.length - 1];
          if (last && last.role === 'assistant') next[next.length - 1] = j.url ? { role: 'assistant', text: '', videoUrl: j.url } : { role: 'assistant', text: `⚠️ ${j.error || t.remixFailed}` };
          return next;
        });
        if (mine() && j.url) { notifyCredit('remix'); autoSaveToLibrary(j.url, 'film'); }
      } catch {
        if (!mine()) return;
        setMessages((prev) => { const next = [...prev]; const last = next[next.length - 1]; if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.remixFailed}` }; return next; });
      } finally {
        if (mine()) setBusy(false);
      }
      return;
    }

    // IMAGE GENERATION (single → runImageJob · ×2/×4 → runImageBatch) is handled entirely
    // by the capped-parallel queue INTERCEPT above, which returns before this point. Both
    // paths run per-job (own signal + jobId + durable row) through the tray, so there is no
    // longer a shared-ref image branch here.

    // MUSIC GENERATION is handled by the capped-parallel queue INTERCEPT above (runMusicJob),
    // which returns before this point. A music request with a NON-audio attachment falls
    // through here to the multimodal chat branch (unchanged) — the intercept's `!mBlocked`
    // guard lets it pass.

    // ── VIDEO GENERATION (30-second film pipeline) ─────────────────────────────
    // In video mode the prompt is a scene; an attached photo locks the character.
    // Reuses the proven driveFilmStudio client (orchestrate → poll → assemble),
    // streams its live status into the assistant bubble, then renders the master
    // inline — so the full film service lives in this one chatbox.
    // BUGFIX — the Director ignored attached scripts/images: the film path only fired on
    // typed text and dropped non-image attachments. Now it also runs on a script/image-
    // only request, READS the attached script (.md/.txt) into the brief, and passes the
    // images through as anchors (≥2 → ordered per-scene anchors, handled server-side).
    // The dedicated video-panel script slot wins; fall back to a chat-composer text attachment.
    let videoScript = mode === 'video' ? (videoScriptDoc?.text?.trim() || extractScriptText(attachments)) : '';
    // extractScriptText only decodes PLAIN text (.txt/.md). For a BINARY script — PDF or
    // DOCX — decode it server-side so the Director still reads it. Fail-open: any miss
    // leaves videoScript empty and the film proceeds from the typed brief as before.
    if (mode === 'video' && !videoScript) {
      const binScript = attachments.find((a) => /pdf|wordprocessingml|officedocument|msword/.test(a.mimeType));
      if (binScript) {
        try {
          const xr = await fetch('/api/utils/extract-text', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: binScript.dataUrl, mimeType: binScript.mimeType }),
          });
          const xj = (await xr.json().catch(() => ({}))) as { text?: string };
          if (typeof xj.text === 'string' && xj.text.trim()) videoScript = xj.text.trim();
        } catch { /* fail-open — no script */ }
      }
    }
    const videoHasImages = mode === 'video' && (videoCharacterRefs.length > 0 || attachments.some((a) => isImage(a.mimeType)));
    // VECTOR 1 — a quick chat command ("გააკეთე") must NOT drop the manual panel fields. Pull the
    // typed Master Script + Character Dialogue from live state and fold them into the brief as
    // AUTHORITATIVE context, so the storyboard / character extractor respects them instead of
    // inventing a fallback character. (The Generate button already did this; chat-send did not.)
    const videoMaster = mode === 'video' ? videoMasterScript.trim() : '';
    const videoDlg = mode === 'video' ? videoDialogue.trim() : '';
    // PHASE 19 — music-video LYRICS (videoSpeech in that mode): fold the user's exact words into the
    // brief so the AI singer performs THEM (EL Music sings literal ka lyrics) instead of auto-writing.
    const videoLyrics = mode === 'video' && videoMode === 'musicvideo' ? videoSpeech.trim() : '';
    if (mode === 'video' && (text || videoScript || videoMaster || videoDlg || videoLyrics || videoHasImages)) {
      // v330 — the dedicated Character Reference slot leads the identity-lock refs,
      // followed by any generic image attachments (back-compat).
      const refs = [
        ...videoCharacterRefs,
        ...attachments.filter((a) => isImage(a.mimeType)).map((a) => a.dataUrl),
      ];
      // A music video has no spoken narrator → never append the narration cue in that mode.
      const wantNarration = videoMode === 'documentary' && (videoNarration || (videoMyVoiceNarration && hasTrainedVoice));
      // A file script wins; else the typed Master Script field IS the authoritative script.
      const scriptBlock = videoScript || videoMaster;
      // The typed prompt (or a sensible default when only a script/images were given).
      const baseText = text || (scriptBlock
        ? (locale === 'en' ? 'Make a cinematic film that follows the attached script.' : locale === 'ru' ? 'Сними фильм строго по приложенному сценарию.' : 'შექმენი კინო ზუსტად ატაჩ სკრიპტის მიხედვით.')
        : (locale === 'en' ? 'A cinematic film' : locale === 'ru' ? 'Кинематографичный фильм' : 'კინემატოგრაფიული ფილმი'));
      const styledText = videoStyle ? `${baseText}. Visual style: ${videoStyle.toLowerCase()}, cinematic.` : baseText;
      // The manual fields are AUTHORITATIVE in the brief → the Director (runPromptAgent) follows them
      // instead of inventing a different story / character / setting.
      const filmPrompt = `${styledText}`
        + (scriptBlock ? `\n\nSCRIPT — the SINGLE source of truth. Base EVERY scene ONLY on this text; keep its exact era/period, setting, location, and characters; invent nothing outside it:\n${scriptBlock.slice(0, 16000)}` : '')
        + (videoDlg ? `\n\nCHARACTER DIALOGUE (spoken verbatim by the SAME character — never replace the speaker):\n${videoDlg.slice(0, 2000)}` : '')
        + (videoLyrics ? `\n\nLYRICS (the song's EXACT words — the singer performs THESE verbatim, do not rewrite them):\n${videoLyrics.slice(0, 2000)}` : '')
        + (wantNarration ? t.narrationCue : '');
      const bubbleText = text || (videoScript ? '📄 ' + (locale === 'en' ? 'Film from attached script' : locale === 'ru' ? 'Фильм по сценарию' : 'ფილმი ატაჩ სკრიპტით') : baseText);
      setMessages((prev) => [...prev, { role: 'user', text: bubbleText, ...(attachments.length ? { medias: attachments } : {}) }]);
      setInput(''); setAttachments([]);
      // Storyboard-FIRST: plan the scenes + a frame each for the user to review; the
      // approved frames then anchor the full render. Music Video Mode is forced 9:16
      // vertical so the storyboard frames match the full-screen mobile render.
      const sbOrientation = videoMode === 'musicvideo' ? 'vertical' : videoOrientation;
      await createStoryboard(filmPrompt, refs, sbOrientation);
      return;
    }

    // ── LIP-SYNC / DUB FROM TEXT ───────────────────────────────────────────────
    // Attach a video → type a script → it's spoken (ElevenLabs, optionally re-voiced in
    // the user's TRAINED voice via RVC) → Wav2Lip keys the character's lips to that
    // audio. A direct audio attachment also works (skips TTS). One long request → the
    // synced master, rendered inline like any other video result.
    if (mode === 'lipsync') {
      // Output format the user picked: presenter dimension + the result player's box.
      const lipOrientation = lipFormat === '9:16' ? 'vertical' : lipFormat === '1:1' ? 'square' : 'landscape';
      const lipResultOrientation: 'landscape' | 'vertical' = lipFormat === '16:9' ? 'landscape' : 'vertical';
      // The "face" can be a VIDEO or a still PHOTO (Wav2Lip animates a portrait into a
      // talking clip) → covers both "dub a video" and "make a character speak".
      const faceAtt = attachments.find((a) => isImage(a.mimeType)) ?? attachments.find((a) => isVideo(a.mimeType));
      const audioAtt = attachments.find((a) => isAudio(a.mimeType));
      // PRESENTER — no face photo AND no chosen preset, but a typed script → a
      // consistent stock avatar speaks it in the CLONED Georgian voice (audio-driven
      // HeyGen). START + POLL, mobile-safe. (A face OR a preset falls through to the
      // talking-photo flow below.)
      if (!faceAtt && !lipPreset && text) {
        setMessages((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: t.generatingLipsync, genKind: 'lipsync' }]);
        setInput(''); setAttachments([]); setBusy(true);
        try {
          // Two-phase START (each request stays well under the gateway timeout):
          // A) synthesize the cloned-voice audio, B) submit it to HeyGen → videoId.
          const synRes = await fetch('/api/heygen/presenter', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal,
            // Honour the panel's Voice (Female/Male) + Format selections.
            body: JSON.stringify({ text, orientation: lipOrientation, gender: lipGender }),
          });
          const syn = (await synRes.json().catch(() => ({}))) as { success?: boolean; audioUrl?: string };
          let sj: { success?: boolean; videoId?: string } = {};
          if (syn.success && syn.audioUrl) {
            const genRes = await fetch('/api/heygen/presenter', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal,
              body: JSON.stringify({ audioUrl: syn.audioUrl, orientation: lipOrientation }),
            });
            sj = (await genRes.json().catch(() => ({}))) as { success?: boolean; videoId?: string };
          }
          let url: string | null = null;
          let failReason: string | null = null;
          if (sj.success && sj.videoId) {
            for (let i = 0; i < 90 && !url && !failReason; i++) { // ~9 min of quick polls
              if (!mine()) return;
              await new Promise((r) => setTimeout(r, 6000));
              const pr = await fetch(`/api/heygen/presenter?id=${encodeURIComponent(sj.videoId)}`, { credentials: 'include', signal: ac.signal });
              const pj = (await pr.json().catch(() => ({}))) as { done?: boolean; url?: string | null; error?: string | null };
              // Surface HeyGen's real rejection reason instead of conflating it with a timeout.
              if (pj.done) { if (pj.url) url = pj.url; else failReason = pj.error || t.lipsyncFailed; break; }
            }
          }
          // HeyGen unavailable / unpaid package → fall back to Replicate SadTalker: the default
          // presenter face speaks the SAME cloned-voice audio. Keeps the presenter working without HeyGen.
          if (!url && syn.success && syn.audioUrl) {
            try {
              const fbRes = await fetch('/api/video/lipsync', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal,
                body: JSON.stringify({ characterRef: 'https://myavatar.ge/presenter/default-female.jpg', audioUrl: syn.audioUrl, forceSadTalker: true, orientation: lipOrientation }),
              });
              const fb = (await fbRes.json().catch(() => ({}))) as { jobId?: string | null };
              if (fb.jobId) {
                failReason = null;
                for (let i = 0; i < 90 && !url; i++) {
                  if (!mine()) return;
                  await new Promise((r) => setTimeout(r, 6000));
                  const pr = await fetch(`/api/video/lipsync?id=${encodeURIComponent(fb.jobId)}`, { credentials: 'include', signal: ac.signal });
                  const pj = (await pr.json().catch(() => ({}))) as { done?: boolean; url?: string | null };
                  if (pj.done) { if (pj.url) url = pj.url; break; }
                }
              }
            } catch { /* keep the HeyGen failure below */ }
          }
          setMessages((prev) => {
            if (!mine()) return prev;
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') next[next.length - 1] = url ? { role: 'assistant', text: '', videoUrl: url, genKind: 'lipsync', orientation: lipResultOrientation } : { role: 'assistant', text: `⚠️ ${failReason || t.lipsyncFailed}` };
            return next;
          });
          if (mine() && url) notifyCredit('avatar');
        } catch {
          if (!mine()) return;
          setMessages((prev) => { const next = [...prev]; const last = next[next.length - 1]; if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.lipsyncFailed}` }; return next; });
        } finally {
          if (mine()) setBusy(false);
        }
        return;
      }
      if ((!faceAtt && !lipPreset) || (!text && !audioAtt)) {
        setMessages((prev) => [...prev, { role: 'assistant', text: t.lipsyncNeedFiles }]);
        return;
      }
      // Show the chosen face in the user bubble (uploaded attachment OR preset thumb).
      const bubbleMedias: Media[] = attachments.length ? attachments : (lipPreset ? [{ dataUrl: lipPreset, mimeType: 'image/jpeg' }] : []);
      const chosenPreset = lipPreset;
      setMessages((prev) => [...prev, { role: 'user', text, ...(bubbleMedias.length ? { medias: bubbleMedias } : {}) }, { role: 'assistant', text: t.generatingLipsync }]);
      setInput(''); setAttachments([]); setBusy(true);
      try {
        // A preset is a /public path → uploadBigFile re-fetches it same-origin and
        // re-hosts to the user's storage, giving the provider a known-good https face.
        const videoUrl = faceAtt
          ? await uploadBigFile(faceAtt.dataUrl, faceAtt.mimeType)
          : await uploadBigFile(chosenPreset!, 'image/jpeg');
        if (!videoUrl) throw new Error('upload failed');
        const audioUrl = audioAtt ? await uploadBigFile(audioAtt.dataUrl, audioAtt.mimeType) : undefined;
        const startBody = JSON.stringify({
          videoUrl,
          ...(audioUrl ? { audioUrl } : {}),
          ...(text ? { text } : {}),
          ...(lipMyVoice && hasTrainedVoice ? { useMyVoice: true } : { gender: lipGender }),
          orientation: lipOrientation, // honour the Format selector (9:16 / 16:9 / 1:1) in the HeyGen render
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
              ? { role: 'assistant', text: '', videoUrl: resultUrl, genKind: 'lipsync', orientation: lipResultOrientation }
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
    // FIX 2 — a video brief typed in Chat mode must ACTUALLY start the pipeline,
    // not return inert "▶ Video Studio" text. On a strong video cue we auto-switch
    // to Video Studio, pick Music-Video vs Documentary from the wording, post a
    // clear note, and fire the proven storyboard→render flow (createStoryboard) —
    // the same path the Video tab uses. Anything that is NOT a clear video brief
    // falls through to the normal multimodal chat below, unchanged.
    if (mode === 'chat' && text && isGenerativeCommand(text) && (isVideoIntent(text) || (chatIntent?.intent === 'video_generation' && chatIntent.confidence >= 0.7))) {
      const musicVideo = isMusicVideoIntent(text);
      setMode('video');
      setVideoMode(musicVideo ? 'musicvideo' : 'documentary');
      const routeOrientation = musicVideo ? 'vertical' : videoOrientation;
      const routeRefs = [
        ...videoCharacterRefs,
        ...attachments.filter((a) => isImage(a.mimeType)).map((a) => a.dataUrl),
      ];
      const routeNote = locale === 'en'
        ? '🎬 Opening Video Studio and planning your scenes — review the storyboard, then tap Generate Video.'
        : locale === 'ru'
          ? '🎬 Открываю Видеостудию и планирую сцены — проверьте раскадровку и нажмите «Сгенерировать видео».'
          : '🎬 ვხსნი ვიდეო სტუდიას და ვგეგმავ სცენებს — გადახედე სტორიბორდს და დააჭირე „ვიდეოს გენერაციას“.';
      setMessages((prev) => [...prev, { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) }, { role: 'assistant', text: routeNote }]);
      setInput(''); setAttachments([]);
      await createStoryboard(text, routeRefs, routeOrientation);
      return;
    }

    const userMsg: Msg = { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) };
    setInput(''); setAttachments([]);
    persistChatTurn('user', text); // mirror the user turn to the server (fail-soft; anonymous → no-op)
    await streamChat([...messages, userMsg]);
  }, [input, attachments, busy, messages, mode, locale, imgAspect, imgQuality, imgStyle, imgCount, imgNegative, runImageBatch, musicGenre, musicInstrumental, musicLyrics, musicAudioMode, musicDuration, musicTempo, musicVoiceType, useMyVoice, hasTrainedVoice, videoOrientation, videoStyle, videoNarration, videoMyVoiceNarration, videoMode, videoCharacterRefs, videoScriptDoc, videoMasterScript, videoDialogue, videoSpeech, lipMyVoice, lipGender, lipFormat, lipPreset, createStoryboard, streamChat, persistChatTurn, notifyCredit, t.narrationCue, t.imageFailed, t.musicFailed, t.voiceMode, t.coverMode, t.generatingMyVoice, t.lipsyncNeedFiles, t.generatingLipsync, t.lipsyncFailed, t.remixRunning, t.remixFailed]);

  // ── VIDEO REMIX — edit an uploaded video via /api/video/remix (one op at a time) ──
  const REMIX_OP_LABELS: Record<typeof remixOp, { ka: string; en: string; ru: string }> = {
    restyle: { ka: 'რესტაილი', en: 'Restyle', ru: 'Рестайл' },
    character: { ka: 'პერსონაჟის შეცვლა', en: 'Change character', ru: 'Смена персонажа' },
    captions: { ka: 'სუბტიტრები', en: 'Captions', ru: 'Субтитры' },
    voiceover: { ka: 'ვოისოვერი', en: 'Voiceover', ru: 'Озвучка' },
    music: { ka: 'მუსიკა', en: 'Music', ru: 'Музыка' },
    redub: { ka: 'ხელახალი გახმოვანება', en: 'Redub (lip-sync)', ru: 'Переозвучка' },
    trim: { ka: 'მოჭრა', en: 'Trim', ru: 'Обрезка' },
  };
  const runRemix = useCallback(async () => {
    if (!remixVideo || remixBusy || busy) return;
    void ensureNotificationPermission(); // PHASE 20 — permission on the generate gesture
    const label = REMIX_OP_LABELS[remixOp][locale] ?? REMIX_OP_LABELS[remixOp].en;
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;
    setOptionsOpen(false);
    setMessages((prev) => [...prev, { role: 'user', text: `🎬 ${label}` }, { role: 'assistant', text: t.remixRunning, remixOpKind: remixOp }]);
    setRemixBusy(true); setBusy(true);
    try {
      const payload: Record<string, unknown> = { op: remixOp, videoUrl: remixVideo.url };
      if (['captions', 'voiceover', 'redub', 'restyle', 'character'].includes(remixOp)) payload.text = remixText.trim();
      if (remixOp === 'voiceover' || remixOp === 'redub') payload.gender = remixGender;
      if (remixOp === 'restyle' || remixOp === 'character') payload.aspect = remixAspect;
      if ((remixOp === 'music' || remixOp === 'redub') && remixTrack?.url) payload.audioUrl = remixTrack.url;
      if (remixOp === 'trim') { payload.startSec = remixTrimStart; payload.durationSec = remixTrimDur; }
      const res = await fetch('/api/video/remix', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: ac.signal,
        body: JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string | null; error?: string };
      setMessages((prev) => {
        if (!mine()) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') next[next.length - 1] = j.url
          ? { role: 'assistant', text: '', videoUrl: j.url, orientation: remixAspect === '16:9' ? 'landscape' : 'vertical' }
          : { role: 'assistant', text: `⚠️ ${j.error || t.remixFailed}` };
        return next;
      });
      if (mine() && j.url) { notifyCredit('remix'); autoSaveToLibrary(j.url, 'film'); }
    } catch {
      if (!mine()) return;
      setMessages((prev) => { const next = [...prev]; const last = next[next.length - 1]; if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.remixFailed}` }; return next; });
    } finally {
      if (mine()) { setRemixBusy(false); setBusy(false); }
    }
  }, [remixVideo, remixBusy, busy, remixOp, remixText, remixGender, remixAspect, remixTrack, remixTrimStart, remixTrimDur, locale, notifyCredit, t.remixRunning, t.remixFailed]);

  // TASK 1 — Character swap: source video + new-character PHOTO → the remix `character` op
  // (frame → swap → re-animate via Kling, identity anchored by the photo). The result lands
  // in the chat with the Remix Studio staged-timer (remixOpKind: 'character'). Mirrors runRemix.
  const runVideoSwap = useCallback(() => {
    if (!swapSourceVideo?.url || !videoCharacterRef) return;
    // PHASE 2 — Character Swap now runs through the capped-parallel QUEUE (per-job signal
    // + its OWN chat bubble by id), so it renders alongside other jobs (cap 3) instead of
    // hard-blocking the whole composer. Billing unchanged (same /api/video/remix call).
    const label = locale === 'en' ? 'Character swap' : locale === 'ru' ? 'Замена персонажа' : 'პერსონაჟის შეცვლა';
    const bubbleId = `swap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const source = swapSourceVideo.url;
    const charRef = videoCharacterRef;
    const orient = videoOrientation;
    setOptionsOpen(false);
    setMessages((prev) => [...prev, { role: 'user', text: `🔄 ${label}` }, { role: 'assistant', text: t.remixRunning, remixOpKind: 'character', id: bubbleId }]);
    submitJob({
      kind: 'remix',
      label,
      createParams: { title: label },
      onSettle: (job) => {
        trackJobSettle(job);
        // Ghost-asset wipe (Step 5): once the swap SETTLES (done / canceled / error) drop the
        // source video from the panel so no intermediate upload lingers as a stray ref. Guarded
        // by url so a source the user has SINCE replaced isn't clobbered; the cleanup effect then
        // revokes its blob previewUrl. (videoCharacterRef is shared with the Video panel + is a
        // plain data-URL string, not a blob — GC'd normally — so it's intentionally left intact.)
        setSwapSourceVideo((prev) => (prev && prev.url === source ? null : prev));
      },
      run: async ({ signal, jobId }) => {
        // Durable-progress: the placeholder row is created at SUBMIT (Task 6); flip it to processing.
        trackJobUpdate(jobId, label, 20);
        // Host the character photo (a data URL) so kling can fetch it as a reference image.
        const photoRef = (await uploadBigFile(charRef, 'image/jpeg')) || charRef;
        const aspect = orient === 'landscape' ? '16:9' : orient === 'square' ? '1:1' : '9:16';
        const res = await fetch('/api/video/remix', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal,
          // jobId → the remix route's refund-compensation log carries the tray transaction id.
          body: JSON.stringify({ op: 'character', videoUrl: source, characterRef: photoRef, aspect, jobId }),
        });
        const j = (await res.json().catch(() => ({}))) as { url?: string | null; error?: string };
        if (j.url) {
          updateBubble(bubbleId, { text: '', videoUrl: j.url, orientation: orient === 'landscape' ? 'landscape' : orient === 'square' ? 'square' : 'vertical' });
          notifyCredit('remix');
          autoSaveToLibrary(j.url, 'film');
          return j.url;
        }
        updateBubble(bubbleId, { text: `⚠️ ${j.error || t.remixFailed}` });
        throw new Error(j.error || 'character swap failed');
      },
    });
  }, [swapSourceVideo, videoCharacterRef, videoOrientation, locale, submitJob, updateBubble, notifyCredit, trackJobSettle, t.remixRunning, t.remixFailed]);

  // Ghost-asset hygiene (Step 5): the swap source-video PREVIEW is a blob object URL
  // (URL.createObjectURL). Revoke it whenever it changes (a replacement upload) or the studio
  // unmounts (navigate away / leave mid-render), so a dismissed face-swap never leaks a dangling
  // blob ref. This is the single revoker — the remove button + settle-wipe just null the state.
  useEffect(() => {
    const prevUrl = swapSourceVideo?.previewUrl;
    return () => { if (prevUrl) { try { URL.revokeObjectURL(prevUrl); } catch { /* noop */ } } };
  }, [swapSourceVideo?.previewUrl]);

  // Upload a remix video / music track → signed URL (auth-gated; null when not
  // signed in, in which case the picker stays empty and Run remains disabled).
  const pickRemixMedia = useCallback(async (file: File, kind: 'video' | 'track') => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    }).catch(() => '');
    if (!dataUrl) return;
    if (kind === 'video') setRemixVideoBusy(true);
    const url = await uploadBigFile(dataUrl, file.type || (kind === 'video' ? 'video/mp4' : 'audio/mpeg'));
    if (kind === 'video') { setRemixVideoBusy(false); if (url) setRemixVideo({ name: file.name, url }); }
    else if (url) setRemixTrack({ name: file.name, url });
  }, []);

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
    // Toggle: tapping the already-selected thumb clears it (no re-POST); otherwise set + log it.
    if (ratedIdx[i] === rating) {
      setRatedIdx((r) => { const next = { ...r }; delete next[i]; return next; });
      return;
    }
    setRatedIdx((r) => ({ ...r, [i]: rating }));
    void fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, preview: (text || '').slice(0, 280) }),
    }).catch(() => {});
  }, [ratedIdx]);

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
    // Tapping the active bubble (loading OR playing) stops it — bump the token so any
    // in-flight synthesis for it is abandoned rather than auto-playing later, and unblock+revoke the current chunk.
    if (speakingIdx === i) { ttsTokenRef.current++; if (ttsAudioRef.current) ttsAudioRef.current.pause(); ttsResolveRef.current?.(); setSpeakingIdx(null); setSpeakPhase(null); return; }
    // Switching to a DIFFERENT message mid-read: unblock+revoke the prior chunk before we retarget the element.
    ttsResolveRef.current?.();
    const token = ++ttsTokenRef.current;
    const live = () => token === ttsTokenRef.current;

    // AUTOPLAY UNLOCK — the "speaker button does nothing" bug. The first audio.play() previously ran AFTER an awaited
    // TTS fetch, by which time the click's user-activation had expired, so iOS/Safari silently blocked playback. Fix:
    // reuse ONE <audio> element and prime it with a tiny silent WAV SYNCHRONOUSLY here (inside the click gesture) so
    // the later src+play() after the fetch is already user-activated. Everything below this line may await freely.
    const SILENT_WAV = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==';
    let audioEl = ttsAudioRef.current;
    if (!audioEl) { audioEl = new Audio(); ttsAudioRef.current = audioEl; }
    audioEl.pause();
    audioEl.src = SILENT_WAV;
    void audioEl.play().catch(() => {}); // primes playback permission within the gesture (must NOT be awaited)

    setSpeakingIdx(i);
    setSpeakPhase('loading'); // spinner while eleven_v3 synthesises the cloned voice

    // CHUNKED read-aloud: long replies were getting cut off because a single TTS
    // request truncates. Split into sentence-sized chunks and synthesise + play
    // them back-to-back (eleven_v3 cloned Georgian voice each time), so the WHOLE
    // message is read. The next chunk is pre-fetched while the current one plays.
    const chunks = chunkForTts(text);
    if (!chunks.length) { setSpeakingIdx(null); setSpeakPhase(null); return; }

    const synth = async (chunk: string): Promise<string | null> => {
      try {
        const res = await fetch('/api/elevenlabs/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunk, locale }),
          // Master Contract V17 — bound the request so a HUNG TTS socket can't keep the read-aloud
          // spinner up indefinitely; on timeout the fetch aborts → null → the loop clears/continues.
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        return URL.createObjectURL(await res.blob());
      } catch { return null; }
    };

    // Revoke a still-pending prefetched chunk URL so an aborted read never leaks its blob.
    const drainNext = (pr: Promise<string | null>) => { void pr.then((u) => { if (u) URL.revokeObjectURL(u); }); };
    try {
      let nextUrlPromise: Promise<string | null> = synth(chunks[0]!);
      for (let idx = 0; idx < chunks.length; idx++) {
        const url = await nextUrlPromise;
        if (!live()) { if (url) URL.revokeObjectURL(url); return; }
        // Kick off the next chunk's synthesis while this one plays (hides the gap).
        nextUrlPromise = idx + 1 < chunks.length ? synth(chunks[idx + 1]!) : Promise.resolve(null);
        if (!url) continue; // a chunk failed → skip it, keep reading the rest
        const el = ttsAudioRef.current;
        if (!el) { URL.revokeObjectURL(url); drainNext(nextUrlPromise); return; }
        el.src = url; // reuse the SAME (already user-activated) element so play() is never blocked
        if (live()) setSpeakPhase('playing');
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => { if (settled) return; settled = true; ttsResolveRef.current = null; URL.revokeObjectURL(url); resolve(); };
          // Register with the ref so a stop / message-switch can force this to resolve (pause fires neither event).
          ttsResolveRef.current = done;
          el.onended = done;
          el.onerror = done;
          el.play().catch(done);
        });
        if (!live()) { drainNext(nextUrlPromise); return; } // stopped mid-read → don't leak the prefetched chunk
      }
      if (live()) { setSpeakingIdx(null); setSpeakPhase(null); }
    } catch {
      if (live()) { setSpeakingIdx(null); setSpeakPhase(null); }
    }
  }, [speakingIdx, locale]);

  // Stop any in-flight read-aloud when the studio unmounts (pause + unblock/revoke the current chunk).
  useEffect(() => () => { try { ttsAudioRef.current?.pause(); ttsResolveRef.current?.(); } catch { /* noop */ } }, []);

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

  // Detect an existing TRAINED voice model (RVC) so the Music panel can surface a
  // "sing in my trained voice" toggle. GET /api/voice/train reports the user's model
  // status; 'completed' means a faithful RVC model is ready (the same probe VoiceTrainer
  // uses). Fail-open — on any error the toggle simply never appears, and the one-shot
  // upload/record voice-CLONE path (music-01) still works without it.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/voice/train', { credentials: 'include' });
        const j = (await r.json().catch(() => ({}))) as { status?: string };
        if (alive && j.status === 'completed') setHasTrainedVoice(true);
      } catch { /* fail-open — no trained-voice toggle */ }
    })();
    return () => { alive = false; };
  }, []);

  // Record-and-transcribe (Whisper) — the RELIABLE path on iOS (the Web Speech API
  // doesn't work in the WKWebView app) and any browser without live recognition.
  // Records in a container the platform actually supports and labels the file with the
  // MATCHING extension: iOS records mp4, NOT webm — a wrong extension makes Whisper
  // reject the audio (a real cause of "the mic does nothing on mobile").
  const startRecorderFallback = useCallback(async () => {
    sttDiscardRef.current = false; // fresh dictation — accept transcription again
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
        if (sttDiscardRef.current || inFlight) return; // a send() discarded this dictation

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
    // Master Contract V17 — INSTANT capture: flip the mic UI to "recording" the moment the user taps,
    // BEFORE the async recognizer / getUserMedia spins up, so there is zero perceived lag and no lost first
    // words. Every failure path below reverts it (SR onerror/onend + the recorder fallback's catch).
    setRecording(true);
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
        sttDiscardRef.current = false; // fresh dictation — accept transcription again
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
          if (sttDiscardRef.current) return; // a send() discarded this dictation
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
  // In VIDEO mode a loaded SCRIPT or uploaded scene frames are enough to generate — without
  // this the Send button hid when the text box was empty, so a script-only run couldn't START.
  const videoReadyToSend = mode === 'video' && (!!videoScriptDoc?.text?.trim() || videoCharacterRefs.length > 0);
  const canSend = !!input.trim() || attachments.length > 0 || (mode === 'music' && useMyVoice && hasTrainedVoice) || videoReadyToSend;

  // Force a REAL download. The <a download> attribute is ignored cross-origin (Supabase
  // signed URLs), so the old button just opened the file in a new tab. Fetch → blob →
  // save instead; fail-open to opening it.
  const dl = useCallback(async (url: string, filename: string) => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('fetch failed');
      const blob = await r.blob();
      // Name the file with the SINGLE extension that matches the blob's ACTUAL mime. The old code
      // hardcoded ".png"; when the provider returns a JPEG, iOS Safari appends the real extension
      // and you get "myavatar-image.png.jpeg". Strip any provided extension, then append the right
      // one so the OS reads it natively as one saveable image.
      const mime = (blob.type || '').toLowerCase();
      const extFromMime = /jpe?g/.test(mime) ? 'jpg' : /png/.test(mime) ? 'png' : /webp/.test(mime) ? 'webp'
        : /gif/.test(mime) ? 'gif' : /mp4/.test(mime) ? 'mp4' : /webm/.test(mime) ? 'webm'
          : /mpeg|mp3/.test(mime) ? 'mp3' : /wav/.test(mime) ? 'wav' : /m4a|aac/.test(mime) ? 'm4a' : '';
      const cleanUrl = (url.split(/[?#]/)[0] ?? url);
      const extFromUrl = (/\.([a-z0-9]{2,4})$/i.exec(cleanUrl)?.[1] ?? '').toLowerCase();
      const ext = extFromMime || extFromUrl || 'jpg';
      const base = filename.replace(/\.[a-z0-9]{2,4}$/i, '') || 'myavatar';
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj; a.download = `${base}.${ext}`;
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
        try { await nav.share({ url, title: 'MyAvatar', text: 'MyAvatar' }); return; }
        catch (e) { if ((e as { name?: string })?.name === 'AbortError') return; /* else fall through */ }
      }
      await navigator.clipboard.writeText(url);
      setShareToast(t.linkCopied);
      setTimeout(() => setShareToast((s) => (s === t.linkCopied ? null : s)), 2200);
    } catch {
      try { window.open(url, '_blank', 'noopener'); } catch { /* noop */ }
    }
  }, [t.linkCopied]);

  // FIX 5 — explicitly file a result into the user's Library. Optimistic ✓; on a miss
  // the URL is dropped from the saved set so the button returns to its idle state.
  const saveToLibrary = useCallback(async (url: string, kind: 'film' | 'image' | 'music', prompt?: string) => {
    if (!url || savedUrls.has(url)) return;
    setSavedUrls((s) => new Set(s).add(url));
    try {
      const r = await fetch('/api/studio/library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ url, kind, ...(prompt ? { prompt } : {}) }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean };
      if (j.success) {
        setShareToast(locale === 'en' ? '📚 Saved to library' : locale === 'ru' ? '📚 Сохранено в библиотеку' : '📚 ბიბლიოთეკაში შენახულია');
        setTimeout(() => setShareToast((s) => (/library|библиоте|ბიბლიოთეკ/i.test(s ?? '') ? null : s)), 2200);
      } else {
        setSavedUrls((s) => { const n = new Set(s); n.delete(url); return n; });
      }
    } catch {
      setSavedUrls((s) => { const n = new Set(s); n.delete(url); return n; });
    }
  }, [savedUrls, locale]);

  // FIX 5 — the shared "📚 ბიბლიოთეკაში შენახვა" result action (consistent across every
  // result card). Shows a ✓ saved state once filed.
  const saveLibButton = useCallback((url: string, kind: 'film' | 'image' | 'music', prompt?: string) => {
    const saved = savedUrls.has(url);
    // Icon-only (Phase 8): the label is the hover tooltip + accessible name, not visible chrome.
    const label = saved
      ? (locale === 'en' ? 'Saved to library' : locale === 'ru' ? 'Сохранено' : 'შენახულია ბიბლიოთეკაში')
      : (locale === 'en' ? 'Save to library' : locale === 'ru' ? 'В библиотеку' : 'ბიბლიოთეკაში შენახვა');
    return (
      <button
        type="button"
        onClick={() => void saveToLibrary(url, kind, prompt)}
        disabled={saved}
        title={label}
        aria-label={label}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent hover:opacity-90 active:scale-90 disabled:opacity-60 sm:h-9 sm:w-9"
      >
        {saved ? <Check size={16} className="text-app-accent" /> : <BookmarkPlus size={16} />}
      </button>
    );
  }, [savedUrls, saveToLibrary, locale]);

  // "Open in Editor" — forward a generated asset into the Surgical Editor (SurgicalEditor fetches the URL → File).
  const openInEditor = useCallback((url: string, kind: 'video' | 'image' | 'audio') => {
    if (!url) return;
    setEditorAsset({ url, kind });
    setMode('surgical');
  }, []);
  // Reverse context pipeline (V4): the editor hands its current (edited) asset back → seed it as a chat attachment so
  // the user can keep conversing / prompting Agent G about the freshly-edited file. Fetch → dataURL (the attachment
  // tray is dataURL-based; uploadBigFile re-hosts it on the next send).
  const handleReturnToChat = useCallback(async (asset: { url: string; kind: 'video' | 'image' | 'audio' }) => {
    setEditorAsset(null);
    setMode('chat');
    try {
      const res = await fetch(asset.url);
      if (!res.ok) return;
      const blob = await res.blob();
      const mimeType = blob.type || (asset.kind === 'video' ? 'video/mp4' : asset.kind === 'audio' ? 'audio/mpeg' : 'image/png');
      const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('read failed')); r.readAsDataURL(blob); });
      setAttachments([{ dataUrl, mimeType }]);
    } catch { /* couldn't re-attach; the user is back in chat regardless */ }
  }, []);
  const editButton = useCallback((url: string, kind: 'video' | 'image' | 'audio') => {
    const label = locale === 'en' ? 'Open in Editor' : locale === 'ru' ? 'Открыть в редакторе' : 'რედაქტირება ედიტორში';
    return (
      <button type="button" onClick={() => openInEditor(url, kind)} title={label} aria-label={label}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent hover:opacity-90 active:scale-90 sm:h-9 sm:w-9">
        <Scissors size={16} />
      </button>
    );
  }, [openInEditor, locale]);

  // ✨ Auto-write lyrics from the typed vibe (or the genre) and drop them into the box.
  const writeLyrics = useCallback(async () => {
    if (writingLyrics) return;
    // Theme priority: the Music panel's own Prompt (Section C) → the shared composer input →
    // any lyrics already typed → the genre. The panel's prompt is the field the user actually
    // fills, so a "✨ Write lyrics" tap writes ABOUT their song, not a generic genre stub.
    const theme = musicPrompt.trim() || input.trim() || musicLyrics.trim() || musicGenre;
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
  }, [writingLyrics, musicPrompt, input, musicLyrics, musicGenre, locale]);

  // ⬆ Upscale a generated image to HD (Real-ESRGAN) → a fresh image bubble.
  const upscale = useCallback(async (url: string) => {
    if (upscaling) return;
    setUpscaling(true);
    setMessages((prev) => [...prev, { role: 'assistant', text: t.upscaling }]);
    try {
      const r = await fetch('/api/ai/upscale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: url, scale: 2 }), credentials: 'include' });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string; code?: string };
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

  // Surgical Editor is a full-panel, self-contained editor — it replaces the chat/composer view for its
  // mode (a deterministic timeline editor doesn't fit the message-stream paradigm). Placed AFTER every hook
  // above so the early return never violates the rules of hooks.
  if (mode === 'surgical') {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden text-app-text">
        <SurgicalEditor locale={locale} initialAsset={editorAsset} onReturnToChat={handleReturnToChat} onExit={() => { setEditorAsset(null); setMode('chat'); }} />
      </div>
    );
  }

  return (
    <div
      className="relative mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden px-4 pt-2 text-app-text"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      onDragEnter={onChatDragEnter}
      onDragOver={onChatDragOver}
      onDragLeave={onChatDragLeave}
      onDrop={onChatDrop}
    >
      {/* V3 — premium drag-over overlay: frosted glass + high-contrast dashed emerald frame,
          shown whenever a file is dragged over the chat. Pointer-events-none so the drop lands
          on the real surface underneath (which bubbles to onChatDrop); fades out on ingestion. */}
      {dragActive && (
        <div className="mya-drop-overlay pointer-events-none absolute inset-0 z-[55] flex items-center justify-center p-5" style={{ animation: 'mya-drop-in 0.16s ease-out' }}>
          <div className="absolute inset-0 bg-app-bg/55 backdrop-blur-md" />
          <div
            className="mya-drop-card relative flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-emerald-400 bg-app-elevated/70 px-8 py-10 text-center"
            style={{ animation: 'mya-drop-card 0.2s ease-out', boxShadow: '0 0 60px -12px rgba(16,185,129,0.55)' }}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-400 ring-1 ring-emerald-400/40">
              <Upload size={26} />
            </span>
            <div className="text-[17px] font-bold text-app-text">
              {mode === 'video'
                ? (locale === 'en' ? 'Drop Script File Here' : locale === 'ru' ? 'Перетащите файл сценария' : 'ჩააგდეთ ფაილი სცენარისთვის')
                : (locale === 'en' ? 'Drop file here' : locale === 'ru' ? 'Перетащите файл сюда' : 'ჩააგდეთ ფაილი')}
            </div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-emerald-400/90">
              {mode === 'video'
                ? 'TXT · MD · PDF · DOCX'
                : (locale === 'en' ? 'Image · Audio · Video' : locale === 'ru' ? 'Фото · Аудио · Видео' : 'სურათი · აუდიო · ვიდეო')}
            </div>
          </div>
        </div>
      )}
      {/* Agent G — glowing transition overlay while the router classifies a chat submission with an attached asset. */}
      {agentGBusy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-app-bg/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            {/* Pulsating gradient orb — a rotating conic ring + breathing glow behind a
                calm core. Replaces the flat spinner square with a living "thinking" state. */}
            <span className="relative flex h-20 w-20 items-center justify-center">
              <span className="mya-orb-glow absolute inset-0 rounded-full bg-app-accent/25 blur-xl" style={{ animation: 'mya-orb-breathe 2.4s ease-in-out infinite' }} />
              <span
                className="mya-orb-ring absolute inset-0 rounded-full opacity-80"
                style={{
                  background: 'conic-gradient(from 0deg, rgba(6,210,255,0) 0deg, rgba(6,210,255,0.95) 130deg, rgba(16,185,129,0.9) 250deg, rgba(6,210,255,0) 360deg)',
                  WebkitMaskImage: 'radial-gradient(circle, transparent 57%, #000 60%)',
                  maskImage: 'radial-gradient(circle, transparent 57%, #000 60%)',
                  animation: 'mya-orb-spin 2.6s linear infinite',
                }}
              />
              <span className="mya-orb-core relative flex h-14 w-14 items-center justify-center rounded-full bg-app-bg ring-1 ring-app-accent/40" style={{ animation: 'mya-orb-breathe 2.4s ease-in-out infinite', boxShadow: '0 0 44px -6px rgba(6,210,255,0.6)' }}>
                <Sparkles size={24} className="text-app-accent" />
              </span>
            </span>
            <div className="text-[12px] font-bold uppercase tracking-[0.15em] text-app-accent">G-Agent</div>
            <div className="flex w-[min(88vw,320px)] flex-col gap-2">
              {AGENT_G_PHASES.map((ph, i) => {
                const state = i < agentGPhase ? 'done' : i === agentGPhase ? 'active' : 'pending';
                return (
                  <div key={i} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] transition-all duration-300 ease-out ${state === 'active' ? 'bg-app-accent/15 text-app-text ring-1 ring-app-accent/30' : state === 'done' ? 'text-app-muted/70' : 'text-app-muted/40'}`}>
                    <span className="text-[15px] leading-none">{state === 'done' ? '✅' : ph.icon}</span>
                    <span className="min-w-0 flex-1 font-medium">{locale === 'en' ? ph.en : locale === 'ru' ? ph.ru : ph.ka}</span>
                    {state === 'active' && (
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-app-accent/60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-app-accent" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain touch-pan-y pb-3 pt-1"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
            <div className="space-y-1.5">
              <h2 className="text-[28px] font-semibold tracking-tight text-app-text">{t.greeting}</h2>
              <p className="mx-auto max-w-sm text-[16px] leading-relaxed text-app-muted">{t.empty}</p>
            </div>
            {/* No hardcoded template suggestions here — the 4 ghost service pills above
                the composer (🖼/🎵/🎬/💬) are the only first-run shortcuts. */}
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={`group flex animate-[fadeIn_0.28s_ease-out] ${m.role === 'user' ? 'justify-end' : 'justify-start gap-2.5'}`}>
            {/* Assistant avatar — a small "M" brand circle to the left, Claude.ai-style. */}
            {m.role === 'assistant' && (
              <span aria-hidden className="mt-0.5 flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-app-accent/15 text-[12px] font-bold text-app-accent">M</span>
            )}
            <div className={`text-[16px] leading-[1.7] ${
              m.role === 'user'
                ? 'max-w-[85%] rounded-2xl bg-app-elevated px-4 py-2.5 text-app-text'
                : 'min-w-0 flex-1 text-app-text'
            }`}>
              {m.medias && m.medias.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.medias.map((md, mi) => (
                    isImage(md.mimeType) ? (
                      <button key={mi} type="button" onClick={() => setLightbox(md.dataUrl)} className="block cursor-zoom-in" aria-label="open fullscreen">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={md.dataUrl} alt="attachment" loading="lazy" decoding="async" className="max-h-44 rounded-lg" />
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
                  <div className="group relative">
                    <button type="button" onClick={() => setLightbox(m.imageUrl!)} className="block w-full cursor-zoom-in" aria-label="open fullscreen">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.imageUrl} alt="generated" loading="lazy" decoding="async" className="max-h-96 w-full rounded-xl object-contain ring-1 ring-app-border/10 transition-opacity hover:opacity-90" />
                    </button>
                    {/* Cross-service bridge — send this image to the Video studio as the character ref.
                        Corner badge (always visible) + a hover pill (always shown on touch). */}
                    <button type="button" aria-label={locale === 'en' ? 'Send to video' : locale === 'ru' ? 'В видео' : 'ვიდეოში გადატანა'}
                      title={locale === 'en' ? 'Send to video' : locale === 'ru' ? 'В видео' : 'ვიდეოში გადატანა'}
                      onClick={(e) => { e.stopPropagation(); sendImageToVideo(m.imageUrl!); }}
                      className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-app-bg/70 text-[15px] backdrop-blur ring-1 ring-app-border/15 transition-transform hover:scale-110 active:scale-95 touch-manipulation before:absolute before:-inset-2 before:content-['']">
                      🎬
                    </button>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100">
                      <button type="button" onClick={(e) => { e.stopPropagation(); sendImageToVideo(m.imageUrl!); }}
                        className="pointer-events-auto inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-full bg-app-bg/85 px-3.5 py-1.5 text-[12px] font-semibold text-app-text shadow-lg backdrop-blur ring-1 ring-app-border/15 transition-colors hover:bg-app-elevated hover:text-app-accent active:scale-[0.98]">
                        🎬 <span>{locale === 'en' ? 'Send to video' : locale === 'ru' ? 'В видео' : 'ვიდეოში გადატანა'}</span>
                      </button>
                    </div>
                  </div>
                  {/* Icon-only result toolbar (Phase 8): labels live in title/aria; 44px touch hit-box (h-11) → 36px on desktop. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void dl(m.imageUrl!, 'myavatar-image.png')}
                      title={t.imgDownload} aria-label={t.imgDownload}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-sm transition hover:opacity-90 active:scale-90 sm:h-9 sm:w-9"
                    >
                      <Download size={16} />
                    </button>
                    <button type="button" onClick={() => void share(m.imageUrl!, 'myavatar-image.png')} title={t.share} aria-label={t.share}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90 sm:h-9 sm:w-9">
                      <Share2 size={16} />
                    </button>
                    <button type="button" onClick={() => void upscale(m.imageUrl!)} disabled={upscaling} title={t.upscaleBtn.replace(/^[⬆🔍]\s*/, '')} aria-label={t.upscaleBtn.replace(/^[⬆🔍]\s*/, '')}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90 disabled:opacity-40 sm:h-9 sm:w-9">
                      <Sparkles size={16} />
                    </button>
                    {m.regen && (
                      <button type="button" onClick={() => void regenerate(m.regen!)} disabled={busy} title={t.regenerate} aria-label={t.regenerate}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90 disabled:opacity-40 sm:h-9 sm:w-9">
                        <RotateCcw size={16} />
                      </button>
                    )}
                    {/* Edit → load this image as the img2img source. */}
                    <button type="button" onClick={() => startImageEdit(m.imageUrl!)} disabled={busy} title={t.editImage} aria-label={t.editImage}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90 disabled:opacity-40 sm:h-9 sm:w-9">
                      <Pencil size={16} />
                    </button>
                    {saveLibButton(m.imageUrl, 'image', m.regen?.kind === 'image' ? m.regen.prompt : undefined)}
                    {editButton(m.imageUrl, 'image')}
                  </div>
                </div>
              )}
              {m.batch && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {m.batch.tiles.map((tile, k) => (
                      <div key={k} className="relative overflow-hidden rounded-xl bg-app-elevated/40 ring-1 ring-app-border/10" style={{ aspectRatio: m.batch!.spec.aspect.replace(':', '/') }}>
                        {tile.status === 'done' && tile.url ? (
                          <>
                            <button type="button" onClick={() => setLightbox(tile.url!)} className="block h-full w-full cursor-zoom-in" aria-label="open fullscreen">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={tile.url} alt="variation" loading="lazy" decoding="async" className="h-full w-full object-cover transition-opacity hover:opacity-90" />
                            </button>
                            {/* Cross-service bridge — each variation can be sent to the Video studio too. */}
                            <button type="button" aria-label={locale === 'en' ? 'Send to video' : locale === 'ru' ? 'В видео' : 'ვიდეოში გადატანა'} title={locale === 'en' ? 'Send to video' : locale === 'ru' ? 'В видео' : 'ვიდეოში გადატანა'}
                              onClick={(e) => { e.stopPropagation(); sendImageToVideo(tile.url!); }}
                              className="absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-app-bg/70 text-[13px] backdrop-blur ring-1 ring-app-border/15 transition-transform hover:scale-110 active:scale-95 touch-manipulation">🎬</button>
                          </>
                        ) : tile.status === 'failed' ? (
                          <div className="flex h-full w-full items-center justify-center text-app-danger/70"><X size={18} /></div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-app-muted/50"><Loader2 size={18} className="animate-spin" /></div>
                        )}
                      </div>
                    ))}
                  </div>
                  {!m.batch.tiles.some((tl) => tl.status === 'pending') && (
                    <button type="button" onClick={() => void runImageBatch(m.batch!.spec, m.batch!.tiles.length)} disabled={busy} title={t.regenerate} aria-label={t.regenerate}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90 disabled:opacity-40 sm:h-9 sm:w-9">
                      <RotateCcw size={16} />
                    </button>
                  )}
                </div>
              )}
              {m.audioUrl && (
                <div className="w-[min(82vw,360px)] overflow-hidden rounded-2xl bg-app-elevated/50 p-3">
                  {/* Polished Suno-style player (album art + play/scrub/time). */}
                  <TrackPlayer url={m.audioUrl} coverUrl={m.coverUrl} label={t.modeMusic} engine={m.engine} />
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void dl(m.audioUrl!, 'myavatar-track.mp3')}
                      title={t.imgDownload} aria-label={t.imgDownload}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-sm transition hover:opacity-90 active:scale-90 sm:h-9 sm:w-9"
                    >
                      <Download size={16} />
                    </button>
                    <button type="button" onClick={() => void share(m.audioUrl!, 'myavatar-track.mp3')} title={t.share} aria-label={t.share}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90 sm:h-9 sm:w-9">
                      <Share2 size={16} />
                    </button>
                    {m.regen && (
                      <button type="button" onClick={() => void regenerate(m.regen!)} disabled={busy} title={t.regenerate} aria-label={t.regenerate}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90 disabled:opacity-40 sm:h-9 sm:w-9">
                        <RotateCcw size={16} />
                      </button>
                    )}
                    {saveLibButton(m.audioUrl, 'music', m.regen?.kind === 'music' ? m.regen.prompt : undefined)}
                    {editButton(m.audioUrl, 'audio')}
                    {/* Cross-service bridge — turn this track into a music video (Video studio). The 🎤 IS the icon. */}
                    <button type="button" onClick={() => sendMusicToMusicVideo(m.audioUrl!, 0, m.regen?.kind === 'music' ? (m.regen.prompt || 'Generated Track') : 'Generated Track')}
                      title={locale === 'en' ? 'Music video' : locale === 'ru' ? 'Клип' : 'მუსიკალური კლიპი'} aria-label={locale === 'en' ? 'Music video' : locale === 'ru' ? 'Клип' : 'მუსიკალური კლიპი'}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-[16px] leading-none ring-1 ring-app-border/15 transition hover:opacity-90 active:scale-90 sm:h-9 sm:w-9">
                      🎤
                    </button>
                  </div>
                </div>
              )}
              {m.videoUrl && (
                <div className="space-y-1.5">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  {/* #t=0.1 makes the browser paint a real frame as the poster (not a
                      black box); preload=metadata forces that frame to load up front. */}
                  {/* Orientation-aware: a 9:16 clip gets a portrait box (no landscape
                      pillarbox on mobile); 16:9 fills the bubble. object-contain never distorts. */}
                  <video src={`${m.videoUrl}#t=0.1`} poster={m.coverUrl || undefined} controls playsInline preload="metadata" onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d) && d > 0) setVideoResultDur((p) => (p[i] === d ? p : { ...p, [i]: d })); }} className={`${(() => { const o = m.orientation ?? videoOrientation; return o === 'vertical' ? 'mx-auto aspect-[9/16] w-[min(70vw,300px)]' : o === 'square' ? 'mx-auto aspect-square w-[min(75vw,360px)]' : o === 'portrait' ? 'mx-auto aspect-[4/5] w-[min(72vw,340px)]' : 'aspect-video w-full'; })()} max-h-[72dvh] rounded-xl object-contain bg-black/90 ring-1 ring-app-border/10`} />
                  {/* FIX 4 — result meta: real clip length read from the player. */}
                  {videoResultDur[i] != null && videoResultDur[i]! > 0 && (
                    <div className="text-[10.5px] font-medium text-app-muted/70">⏱ {Math.round(videoResultDur[i]!)}{locale === 'en' ? 's' : ' წმ'} · {(m.orientation ?? videoOrientation) === 'vertical' ? '9:16' : (m.orientation ?? videoOrientation) === 'square' ? '1:1' : (m.orientation ?? videoOrientation) === 'portrait' ? '4:5' : '16:9'}</div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void dl(m.videoUrl!, 'myavatar-video.mp4')}
                      title={t.imgDownload} aria-label={t.imgDownload}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-sm transition hover:opacity-90 active:scale-90 sm:h-9 sm:w-9"
                    >
                      <Download size={16} />
                    </button>
                    <button type="button" onClick={() => void share(m.videoUrl!, 'myavatar-video.mp4')} title={t.share} aria-label={t.share}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90 sm:h-9 sm:w-9">
                      <Share2 size={16} />
                    </button>
                    {saveLibButton(m.videoUrl, 'film', m.filmPrompt)}
                    {editButton(m.videoUrl, 'video')}
                  </div>
                  {/* Remix — re-render ONLY the edited scene, reuse the rest. Only
                      shown once the film captured its landed clips + brief. */}
                  {m.filmClips && m.filmClips.length > 0 && (
                    <div className="space-y-1.5 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={remixDrafts[i] ?? ''}
                          onChange={(e) => setRemixDrafts((d) => ({ ...d, [i]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if ((remixDrafts[i] ?? '').trim()) setRemixPreviewIdx(i); } }}
                          placeholder={t.remixPlaceholder}
                          disabled={remixBusyIdx !== null}
                          className="min-w-0 flex-1 rounded-full bg-app-elevated min-h-[40px] sm:min-h-0 px-3.5 py-1.5 text-[12px] text-app-text outline-none ring-1 ring-app-border/15 placeholder:text-app-muted/50 focus:ring-app-accent/40 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => setRemixPreviewIdx(i)}
                          disabled={remixBusyIdx !== null || !(remixDrafts[i] ?? '').trim()}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-app-elevated min-h-[40px] sm:min-h-0 px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                        >
                          {remixBusyIdx === i ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} {t.remix}
                        </button>
                      </div>
                      {/* P10 — preview which scenes change vs reuse, then Confirm/Cancel. */}
                      {remixPreviewIdx === i && (() => {
                        const totalScenes = m.filmClips!.length;
                        const change = parseRemixScenes(remixDrafts[i] ?? '', totalScenes);
                        const reuse = Array.from({ length: totalScenes }, (_, k) => k + 1).filter((n) => !change.includes(n));
                        return (
                          <div className="space-y-2 rounded-xl border border-app-accent/30 bg-app-accent/[0.06] p-3 text-[12px]">
                            <p className="font-semibold text-app-text">{locale === 'en' ? 'Remix preview' : locale === 'ru' ? 'Предпросмотр ремикса' : 'რემიქსის გადახედვა'}</p>
                            {change.length > 0 ? (
                              <p className="text-app-muted">
                                <span className="font-semibold text-app-accent">{locale === 'en' ? `Scene${change.length > 1 ? 's' : ''} ${change.join(', ')}` : locale === 'ru' ? `Сцен${change.length > 1 ? 'ы' : 'а'} ${change.join(', ')}` : `სცენა ${change.join(', ')}`}</span> {locale === 'en' ? 'will be re-rendered.' : locale === 'ru' ? 'будет перерисована.' : 'გადაირენდერდება.'} {reuse.length > 0 && (locale === 'en' ? `Scenes ${reuse.join(', ')} will be reused.` : locale === 'ru' ? `Сцены ${reuse.join(', ')} будут переиспользованы.` : `სცენები ${reuse.join(', ')} ხელახლა გამოიყენება.`)}
                              </p>
                            ) : (
                              <p className="text-app-muted">{locale === 'en' ? 'The AI will pick the scene(s) to re-render from your edit; the rest are reused.' : locale === 'ru' ? 'ИИ выберет сцену(ы) для перерисовки; остальные переиспользуются.' : 'AI აირჩევს გადასარენდერებელ სცენას; დანარჩენი ხელახლა გამოიყენება.'}</p>
                            )}
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => { setRemixPreviewIdx(null); void remixFilm(i); }}
                                className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg transition-opacity hover:opacity-90 active:scale-[0.98]">
                                <Check size={13} /> {locale === 'en' ? 'Confirm' : locale === 'ru' ? 'Подтвердить' : 'დადასტურება'}
                              </button>
                              <button type="button" onClick={() => setRemixPreviewIdx(null)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-medium text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90">
                                {locale === 'en' ? 'Cancel' : locale === 'ru' ? 'Отмена' : 'გაუქმება'}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
              {(() => {
                const pending = busy && m.role === 'assistant' && i === messages.length - 1 && !m.imageUrl && !m.audioUrl && !m.videoUrl && !m.batch;
                // Director's Console for QUEUED cinema renders: the Cap-3 queue path never sets the
                // global `busy` flag (so `pending` is false and the console was hidden). Key off the
                // bubble's OWN genKind/videoProgress/filmRoster instead — per-message + queue-safe, so
                // it shows from the moment the film bubble is pushed and survives parallel jobs (not
                // just the last message). Excludes done (videoUrl) and failed (⚠️) bubbles.
                const isInflightVideo = m.role === 'assistant' && m.genKind === 'video' && !m.videoUrl && !m.batch && !m.text?.startsWith('⚠️') && (typeof m.videoProgress === 'number' || !!m.filmRoster || i === messages.length - 1);
                // FIX 6 — a remix op (panel OR chat-attached) gets the Remix Studio
                // staged-timer console. Checked first so it wins in chat mode too.
                if (pending && m.remixOpKind) {
                  return <RemixStudioConsole op={m.remixOpKind} elapsed={elapsed} locale={locale} onCancel={stop} stopLabel={t.stop} />;
                }
                // Generative modes get the live staged progress card (bar + clock +
                // narrated steps) — the real "loading process". Chat gets typing dots.
                // isInflightVideo also opens the second (mode/storyboard) gate so a queued film
                // bubble in chat mode without a storyboard still shows the console.
                if ((pending || isInflightVideo) && (mode !== 'chat' || (m.storyboard?.length ?? 0) > 0 || isInflightVideo)) {
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
                        <FilmDirectorConsole roster={m.filmRoster} log={m.filmLog} statusText={m.text} elapsed={elapsed} targetSec={PROGRESS_TARGET.video} locale={locale} onCancel={stop} stopLabel={t.stop} musicVideo={videoMode === 'musicvideo'} />
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
                        <button type="button" onClick={saveEdit} disabled={!editText.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-app-accent min-h-[40px] sm:min-h-0 px-3.5 py-1.5 text-[12px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-40">{locale === 'en' ? 'Send' : locale === 'ru' ? 'Отправить' : 'გაგზავნა'}</button>
                      </div>
                    </div>
                  );
                }
                // The user's own text stays verbatim; assistant replies render as rich markdown.
                if (m.role !== 'assistant') return <span className="whitespace-pre-wrap break-words">{m.text}</span>;
                // VECTOR 1 — split out image blocks so a `[Image: …]` placeholder never renders as a raw bracketed
                // text block: real URLs become <img> frames (Download + Open-in-Editor), URL-less descriptions
                // become a one-tap "Generate" card. Plain prose is untouched (fast-path when there are no blocks).
                const parsed = hasImageBlocks(m.text) ? parseImageBlocks(m.text) : { text: m.text, urls: [] as string[], prompts: [] as string[], audioUrls: [] as string[] };
                // VECTOR 1 — a chat model sometimes hallucinates a { "service": … } routing JSON. Never render it raw
                // (stripDanglingServiceBlock also hides a still-streaming partial), and when the block DOMINATES the
                // reply, offer a ONE-TAP Generate chip wired to the right backend. A long answer that merely contains
                // an example JSON is left intact. Generation is only ever triggered by the user tapping the chip.
                const svcBlk = hasServiceBlock(parsed.text) ? parseServiceBlock(parsed.text) : null;
                const routingChip = svcBlk && svcBlk.service && svcBlk.text.length < 200 ? svcBlk.service : null;
                const routingPrompt = ((svcBlk?.prompt) || (i > 0 && messages[i - 1]?.role === 'user' ? messages[i - 1]!.text : '') || '').trim();
                const displayText = stripDanglingServiceBlock(parsed.text);
                return (
                  <>
                    {typeof m.videoProgress === 'number' && !m.videoUrl && (
                      <div className="mb-2 h-1.5 w-[min(80vw,340px)] overflow-hidden rounded-full bg-app-border/20">
                        <div className="h-full rounded-full bg-app-accent transition-[width] duration-700 ease-out" style={{ width: `${Math.max(4, m.videoProgress)}%` }} />
                      </div>
                    )}
                    {displayText && <Markdown>{displayText}</Markdown>}
                    {/* Streaming caret — a soft blink while the reply is still arriving, so the
                        text reads as live-typed rather than snapping in as chunks land. */}
                    {pending && !m.genKind && (
                      <span aria-hidden className="mya-caret -mt-1 inline-block h-4 w-[3px] translate-y-[3px] rounded-full bg-app-accent" style={{ animation: 'mya-caret 1.05s ease-in-out infinite' }} />
                    )}
                    {routingChip && routingPrompt && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-2.5">
                        {routingChip === 'music' ? <Music2 size={16} className="shrink-0 text-app-accent" /> : routingChip === 'video' ? <Film size={16} className="shrink-0 text-app-accent" /> : routingChip === 'avatar' ? <Volume2 size={16} className="shrink-0 text-app-accent" /> : <ImageIcon size={16} className="shrink-0 text-app-accent" />}
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-app-muted">{routingPrompt}</span>
                        <button type="button" disabled={busy} onClick={() => dispatchServiceBlock(routingChip, routingPrompt)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-app-accent px-3 py-1.5 text-[12px] font-semibold text-app-bg transition-all duration-300 ease-out hover:scale-[1.04] hover:opacity-95 disabled:opacity-40 disabled:hover:scale-100">
                          <Sparkles size={13} />{(routingChip === 'image' || routingChip === 'music')
                            ? (locale === 'en' ? 'Generate' : locale === 'ru' ? 'Создать' : 'გენერაცია')
                            : (locale === 'en' ? 'Open' : locale === 'ru' ? 'Открыть' : 'გახსნა')}
                        </button>
                      </div>
                    )}
                    {parsed.urls.map((url, k) => (
                      <div key={`imgblk-${k}`} className="mt-2 overflow-hidden rounded-xl ring-1 ring-app-border/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" loading="lazy" decoding="async" onClick={() => setLightbox(url)}
                          className="block max-h-[60vh] w-full max-w-[min(82vw,420px)] cursor-zoom-in bg-black/40 object-contain" />
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <button type="button" onClick={() => void dl(url, `myavatar-${Date.now()}.png`)} title={t.imgDownload} aria-label={t.imgDownload}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-sm transition hover:opacity-90 active:scale-90"><Download size={15} /></button>
                          {editButton(url, 'image')}
                        </div>
                      </div>
                    ))}
                    {parsed.prompts.map((p, k) => (
                      <div key={`genblk-${k}`} className="mt-2 flex items-center gap-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-2.5">
                        <ImageIcon size={16} className="shrink-0 text-app-accent" />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-app-muted">{p}</span>
                        <button type="button" disabled={busy} onClick={() => void runImageJob(p, undefined, { kind: 'image', prompt: p, quality: imgQuality, aspect: imgAspect, style: imgStyle })}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-app-accent px-3 py-1.5 text-[12px] font-semibold text-app-bg transition-all duration-300 ease-out hover:scale-[1.04] hover:opacity-95 disabled:opacity-40 disabled:hover:scale-100">
                          <Sparkles size={13} />{locale === 'en' ? 'Generate' : locale === 'ru' ? 'Создать' : 'გენერაცია'}
                        </button>
                      </div>
                    ))}
                    {/* VECTOR 3 — a generated track referenced in text ([Audio: url]) renders as a native player + actions. */}
                    {parsed.audioUrls.map((url, k) => (
                      <div key={`audblk-${k}`} className="mt-2 w-[min(82vw,360px)] overflow-hidden rounded-2xl bg-app-elevated/50 p-3">
                        <TrackPlayer url={url} label={t.modeMusic} />
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <button type="button" onClick={() => void dl(url, `myavatar-${Date.now()}.mp3`)} title={t.imgDownload} aria-label={t.imgDownload}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-sm transition hover:opacity-90 active:scale-90"><Download size={15} /></button>
                          <button type="button" onClick={() => void share(url, 'myavatar-track.mp3')} title={t.share} aria-label={t.share}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90"><Share2 size={15} /></button>
                          {editButton(url, 'audio')}
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
              {/* FIX 4 — one-click retry on a failed video render (reuses the stored
                  prompt + refs + orientation; no re-typing / re-uploading). */}
              {m.retryVideo && !busy && (
                <button
                  type="button"
                  onClick={() => { const r = m.retryReq ?? lastVideoReqRef.current; if (r) void createStoryboard(r.filmPrompt, r.refs, r.orientation); }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                >
                  {t.retry}
                </button>
              )}
              {/* User-turn actions — Copy + Edit. Copy was missing entirely: users
                  could copy assistant replies but not their own messages. On desktop
                  the row reveals on hover / keyboard focus (group-hover); on mobile
                  (no hover) it stays visible so the action is always reachable. */}
              {m.role === 'user' && m.text && editingIdx !== i && !busy && (
                <div className="mt-1 flex justify-end gap-1.5 text-app-muted transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => void copyMsg(m.text, i)}
                    aria-label={locale === 'en' ? 'Copy' : locale === 'ru' ? 'Копировать' : 'კოპირება'}
                    title={copiedIdx === i
                      ? (locale === 'en' ? 'Copied!' : locale === 'ru' ? 'Скопировано!' : 'დაკოპირდა!')
                      : (locale === 'en' ? 'Copy' : locale === 'ru' ? 'Копировать' : 'კოპირება')}
                    className={`flex h-9 w-9 -m-0.5 items-center justify-center rounded-md transition-colors hover:bg-app-border/15 hover:text-app-accent ${copiedIdx === i ? 'text-app-accent' : ''}`}
                  >
                    {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(i)}
                    aria-label={locale === 'en' ? 'Edit' : locale === 'ru' ? 'Изменить' : 'რედაქტირება'}
                    title={locale === 'en' ? 'Edit' : locale === 'ru' ? 'Изменить' : 'რედაქტირება'}
                    className="flex h-9 w-9 -m-0.5 items-center justify-center rounded-md text-app-muted transition-colors hover:bg-app-border/15 hover:text-app-accent"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              )}
              {/* Per-response actions on a TEXT reply — Read-aloud + Copy. No
                  Like/Dislike, per the one-window spec. */}
              {m.role === 'assistant' && m.text && !m.text.startsWith('⚠️') && !m.text.startsWith('⏹') && (
                <div className="mt-1 flex items-center gap-1.5 text-app-muted">
                  <button
                    type="button"
                    onClick={() => void speakMsg(m.text, i)}
                    aria-label={locale === 'en' ? 'Read aloud' : locale === 'ru' ? 'Озвучить' : 'ხმამაღლა წაკითხვა'}
                    title={locale === 'en' ? 'Read aloud' : locale === 'ru' ? 'Озвучить' : 'ხმამაღლა წაკითხვა'}
                    className={`flex h-9 w-9 -m-0.5 items-center justify-center rounded-md transition-all duration-300 ease-out hover:scale-110 hover:bg-app-elevated hover:text-app-accent active:scale-90 ${speakingIdx === i ? 'text-app-accent' : ''}`}
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
                    className={`flex h-9 w-9 -m-0.5 items-center justify-center rounded-md transition-all duration-300 ease-out hover:scale-110 hover:bg-app-elevated hover:text-app-accent active:scale-90 ${copiedIdx === i ? 'text-app-accent' : ''}`}
                  >
                    {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => rateMsg(i, 'up', m.text)}
                    aria-label={locale === 'en' ? 'Good response' : locale === 'ru' ? 'Хороший ответ' : 'კარგი პასუხი'}
                    title={locale === 'en' ? 'Good response' : locale === 'ru' ? 'Хороший ответ' : 'კარგი პასუხი'}
                    className={`flex h-9 w-9 -m-0.5 items-center justify-center rounded-md transition-all duration-300 ease-out hover:scale-110 hover:bg-app-elevated hover:text-app-accent active:scale-90 ${ratedIdx[i] === 'up' ? 'text-app-accent' : ''}`}
                  >
                    <ThumbsUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => rateMsg(i, 'down', m.text)}
                    aria-label={locale === 'en' ? 'Bad response' : locale === 'ru' ? 'Плохой ответ' : 'ცუდი პასუხი'}
                    title={locale === 'en' ? 'Bad response' : locale === 'ru' ? 'Плохой ответ' : 'ცუდი პასუხი'}
                    className={`flex h-9 w-9 -m-0.5 items-center justify-center rounded-md transition-all duration-300 ease-out hover:scale-110 hover:bg-app-elevated hover:text-app-accent active:scale-90 ${ratedIdx[i] === 'down' ? 'text-app-accent' : ''}`}
                  >
                    <ThumbsDown size={13} />
                  </button>
                  {i === messages.length - 1 && !busy && (
                    <button
                      type="button"
                      onClick={() => regenerateChat()}
                      aria-label={t.regenerate}
                      title={t.regenerate}
                      className="flex h-9 w-9 -m-0.5 items-center justify-center rounded-md transition-all duration-300 ease-out hover:scale-110 hover:bg-app-elevated hover:text-app-accent active:scale-90"
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
          style={{ bottom: `calc(env(safe-area-inset-bottom) + ${Math.min(composerH, 180) + 12}px)` }}
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* Composer — refined, Gemini-style: one rounded pill, [+] attach, an inline
          mode selector (the "Flash ⌄" analog) and mic-when-empty / send-when-typing. */}
      <div ref={composerRef} className="shrink-0 pt-1">
        {/* Service shortcuts intentionally REMOVED from the composer — the in-pill mode
            dropdown (Chat ⌄ / Video ⌄) is the single, canonical mode switcher. The empty
            state is now just the heading + subtitle (no pills, no templates). */}
        {/* Per-service options. On MOBILE they collapse behind this toggle so the chat is
            never covered and the input stays reachable; on desktop (sm:) they're always
            open. When open on mobile they're capped to 58dvh (keyboard-aware) and scroll internally. */}
        {mode !== 'chat' && (
          <button type="button" onClick={() => setOptionsOpen((v) => !v)} aria-expanded={optionsOpen}
            className="mb-2 flex w-full items-center justify-between rounded-xl border border-app-border/15 bg-app-elevated/40 px-3 py-2 text-[12.5px] font-semibold text-app-text transition active:scale-[0.99] sm:hidden">
            <span className="inline-flex items-center gap-1.5"><Sparkles size={14} className="text-app-accent" /> {locale === 'en' ? 'Options' : locale === 'ru' ? 'Опции' : 'პარამეტრები'}</span>
            <ChevronDown size={16} className={`text-app-muted transition-transform ${optionsOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
        {/* Mobile: collapsible sheet capped at 52dvh with its OWN internal scroll — so however tall
            the params get (file-upload zones, script slots) the panel can never grow the column past
            the viewport and shove the composer dock off-screen behind the mobile nav bar. The dock
            stays locked at the bottom. Desktop (lg+): 58dvh + own scroll. */}
        <div
          className={`${optionsOpen ? 'max-h-[52dvh] overflow-y-auto overscroll-contain touch-pan-y pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'hidden'} sm:block sm:max-h-none sm:overflow-visible lg:max-h-[58dvh] lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden`}
          // VECTOR 3 — keyboard open: cap to what's left below it (header+composer buffer ≈ 220px) so
          // the panel scrolls internally and the composer dock never gets pushed under the keyboard.
          style={optionsOpen && keyboardOffset > 0 ? { maxHeight: `calc(100dvh - ${keyboardOffset + 220}px)` } : undefined}
        >
        {/* Panel header — title + ✕ close (BUG 1). The per-service panel had NO close
            affordance on desktop (sm:block keeps it open); ✕ returns to chat mode and
            collapses it. Lives at the top of the scroll area so it's always reachable. */}
        {mode !== 'chat' && (
          <div className="mb-2 flex items-center justify-between px-0.5">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-app-muted">{t[activeModeKey]}</span>
            <button type="button" onClick={() => { setMode('chat'); setOptionsOpen(false); }}
              aria-label={locale === 'en' ? 'Close' : locale === 'ru' ? 'Закрыть' : 'დახურვა'}
              className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text active:scale-95">
              <X size={17} />
            </button>
          </div>
        )}
        {/* IMAGE — dedicated card panel: aspect (visual previews) · count · quality · style */}
        {mode === 'image' && (
          <div className="mb-2 space-y-2">
            <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">📐 {locale === 'en' ? 'Aspect ratio' : locale === 'ru' ? 'Соотношение' : 'პროპორცია'}</span>
              <div className="flex items-end gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {IMG_ASPECTS.map((a) => {
                  const [aw, ah] = a.split(':').map(Number) as [number, number];
                  const max = 26;
                  const bw = aw >= ah ? max : Math.round((max * aw) / ah);
                  const bh = ah >= aw ? max : Math.round((max * ah) / aw);
                  const on = imgAspect === a;
                  return (
                    <button key={a} type="button" onClick={() => setImgAspect(a)} aria-label={a} className="flex min-h-[44px] min-w-[44px] shrink-0 flex-col items-center justify-center gap-1 transition active:scale-95 touch-manipulation">
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
              <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🔢 {locale === 'en' ? 'Count' : locale === 'ru' ? 'Количество' : 'რაოდენობა'}</span>
                <div className="flex gap-1.5">
                  {([1, 2, 4] as const).map((n) => <Chip key={n} active={imgCount === n} onClick={() => setImgCount(n)}>{n === 1 ? '1' : `×${n}`}</Chip>)}
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">⚡ {locale === 'en' ? 'Quality' : locale === 'ru' ? 'Качество' : 'ხარისხი'}</span>
                <div className="flex flex-wrap gap-1.5">
                  {IMG_QUALITIES.map(([q, lbl]) => <Chip key={q} active={imgQuality === q} onClick={() => setImgQuality(q)}>{lbl}</Chip>)}
                </div>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎨 {locale === 'en' ? 'Style' : locale === 'ru' ? 'Стиль' : 'სტილი'}</span>
              {/* Horizontal-scroll strip (13 styles) — one calm row instead of a 4-5 row wrap wall.
                  Chips are shrink-0 so they scroll; matches the music Style + aspect strips. */}
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {IMG_STYLES.map((s) => <Chip key={s} active={imgStyle === s} onClick={() => setImgStyle(s)}>{s}</Chip>)}
              </div>
            </div>
            {/* P7 — Negative prompt (expandable) */}
            <div className="rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <button type="button" onClick={() => setImgNegativeOpen((v) => !v)} aria-expanded={imgNegativeOpen}
                className="flex w-full items-center justify-between text-[12.5px] font-semibold text-app-text">
                <span className="inline-flex items-center gap-1.5">🚫 {locale === 'en' ? 'Negative prompt' : locale === 'ru' ? 'Негативный промпт' : 'ნეგატიური პრომპტი'}{imgNegative.trim() && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-app-accent" />}</span>
                <ChevronDown size={15} className={`transition-transform ${imgNegativeOpen ? 'rotate-180' : ''}`} />
              </button>
              {imgNegativeOpen && (
                <textarea
                  value={imgNegative}
                  onChange={(e) => setImgNegative(e.target.value)}
                  placeholder={locale === 'en' ? 'What to avoid in the image…' : locale === 'ru' ? 'Что исключить из изображения…' : 'რა ავიცილოთ სურათში…'}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-app-border/15 bg-app-bg/40 px-3 py-2 text-[13px] text-app-text outline-none placeholder:text-app-muted/60 focus:border-app-accent/50"
                />
              )}
            </div>
            {/* PHASE 29 (VECTOR 1) — Script-to-Storyboard: paste a script → N identity-anchored scenes → Video */}
            <div className="rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <button type="button" onClick={() => setImgBoardOpen((v) => !v)} aria-expanded={imgBoardOpen}
                className="flex w-full items-center justify-between text-[12.5px] font-semibold text-app-text">
                <span className="inline-flex items-center gap-1.5">🎬 {locale === 'en' ? 'Script → Storyboard' : locale === 'ru' ? 'Сценарий → Раскадровка' : 'სცენარი → სცენარიუმი'}{imgBoardScript.trim() && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-app-accent" />}</span>
                <ChevronDown size={15} className={`transition-transform ${imgBoardOpen ? 'rotate-180' : ''}`} />
              </button>
              {imgBoardOpen && (
                <div className="mt-2 space-y-2.5">
                  <span className="block text-[10.5px] leading-tight text-app-muted">{locale === 'en' ? 'Paste a script — it splits into identity-locked scenes, then exports to the Video Studio.' : locale === 'ru' ? 'Вставьте сценарий — он разобьётся на сцены с единым персонажем и уйдёт в видео-студию.' : 'ჩასვი სცენარი — დაიყოფა ერთიანი პერსონაჟის სცენებად და გადავა ვიდეო სტუდიაში.'}</span>
                  <textarea
                    value={imgBoardScript}
                    onChange={(e) => setImgBoardScript(e.target.value)}
                    placeholder={locale === 'en' ? 'SCENE 1: a detective walks a rainy street at dawn…\nSCENE 2: he enters a dim office…' : locale === 'ru' ? 'СЦЕНА 1: детектив идёт по улице под дождём…' : 'სცენა 1: დეტექტივი მიდის წვიმიან ქუჩაზე…'}
                    rows={4}
                    className="w-full resize-none rounded-lg border border-app-border/15 bg-app-bg/40 px-3 py-2 text-[12.5px] leading-relaxed text-app-text outline-none placeholder:text-app-muted/50 focus:border-app-accent/50"
                  />
                  {/* Duration → scene count (30s = 6 scenes · 60s = 12 scenes) */}
                  <div className="grid grid-cols-2 gap-2">
                    {([[30, '6'], [60, '12']] as const).map(([sec, scenes]) => {
                      const on = imgBoardDuration === sec;
                      return (
                        <button key={sec} type="button" onClick={() => setImgBoardDuration(sec)}
                          className={`flex min-h-[46px] flex-col items-center justify-center rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition active:scale-[0.98] ${on ? 'border-app-accent/60 bg-app-accent/15 text-app-accent ring-1 ring-app-accent/30' : 'border-app-border/20 bg-app-bg/40 text-app-text hover:bg-app-bg/60'}`}>
                          <span>{sec}{locale === 'en' ? 's film' : locale === 'ru' ? 'с' : 'წმ'}</span>
                          <span className="text-[10px] font-normal text-app-muted">{scenes} {locale === 'en' ? 'scenes' : locale === 'ru' ? 'сцен' : 'სცენა'}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* STEP 1 — render the identity-locked scene frames right here (no navigation yet). */}
                  <button type="button" onClick={() => void generateImageStoryboard()} disabled={imgBoardBusy || !imgBoardScript.trim()}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold transition active:scale-[0.98] ${imgBoardBusy || !imgBoardScript.trim() ? 'cursor-not-allowed bg-app-surface/50 text-app-muted' : 'bg-app-accent text-white hover:bg-app-accent/90'}`}>
                    {imgBoardBusy
                      ? `${locale === 'en' ? 'Rendering scenes' : locale === 'ru' ? 'Рендер сцен' : 'სცენების რენდერი'} ${imgBoardScenes.filter((c) => c.frameUrl).length}/${imgBoardScenes.length || (imgBoardDuration === 60 ? 12 : 6)}…`
                      : imgBoardScenes.length
                        ? `🔄 ${locale === 'en' ? 'Re-generate frames' : locale === 'ru' ? 'Пересоздать кадры' : 'კადრების ხელახლა გენერაცია'}`
                        : `🎬 ${locale === 'en' ? 'Generate storyboard frames' : locale === 'ru' ? 'Создать кадры раскадровки' : 'კადრების გენერაცია'}`}
                  </button>

                  {/* STEP 2 — the rendered thumbnails + a single "Export to Video Studio" button (packs the
                      frame URLs + scripts into the Video Studio's Scene-frame + Master-Script lanes). */}
                  {imgBoardScenes.length > 0 && (() => {
                    const done = imgBoardScenes.filter((c) => c.frameUrl).length;
                    return (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          {imgBoardScenes.map((c) => (
                            <div key={c.ordinal} className={`relative overflow-hidden rounded-lg bg-app-bg/40 ring-1 ring-app-border/15 ${imgAspect === '9:16' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                              <StoryboardFrame url={c.frameUrl ?? null} label={`Scene ${c.ordinal}`} onZoom={(u) => setLightbox(u)} />
                              <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[9px] font-semibold text-white">{c.ordinal}</span>
                            </div>
                          ))}
                        </div>
                        <button type="button" onClick={exportImageStoryboardToVideo} disabled={imgBoardBusy || done === 0}
                          className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold transition active:scale-[0.98] ${imgBoardBusy || done === 0 ? 'cursor-not-allowed bg-app-surface/50 text-app-muted' : 'bg-app-accent text-white hover:bg-app-accent/90'}`}>
                          🎥 {locale === 'en' ? 'Export storyboard to Video Studio' : locale === 'ru' ? 'Экспорт в видео-студию' : 'ექსპორტი ვიდეო სტუდიაში'}
                          {done < imgBoardScenes.length && <span className="text-[10px] font-normal opacity-80">({done}/{imgBoardScenes.length})</span>}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* LIPSYNC — dedicated card panel: character photo (+ hint) · voice */}
        {mode === 'lipsync' && (
          <div className="mb-2 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setLipTab('avatar')}
                className={`rounded-xl border p-2.5 text-[12px] font-semibold transition active:scale-[0.99] ${lipTab === 'avatar' ? 'border-app-accent/60 bg-app-accent/15 text-app-accent ring-1 ring-app-accent/30' : 'border-app-border/20 bg-app-bg/40 text-app-muted'}`}>
                👄 {t.modeLipsync}
              </button>
              <button type="button" onClick={() => setLipTab('motion')}
                className={`rounded-xl border p-2.5 text-[12px] font-semibold transition active:scale-[0.99] ${lipTab === 'motion' ? 'border-app-accent/60 bg-app-accent/15 text-app-accent ring-1 ring-app-accent/30' : 'border-app-border/20 bg-app-bg/40 text-app-muted'}`}>
                🎭 {locale === 'en' ? 'Motion' : locale === 'ru' ? 'Движение' : 'მოძრაობა'}
              </button>
            </div>
            {lipTab === 'motion' ? (
              <MotionControlPanel locale={locale} onVideoGenerated={(url) => setMessages((prev) => [...prev, { role: 'assistant', text: '', videoUrl: url, orientation: 'vertical' }])} />
            ) : (<>
            {(() => {
              const face = attachments.find((a) => isImage(a.mimeType) || isVideo(a.mimeType));
              const presetSrc = !face ? lipPreset : null; // a chosen preset stands in as the face
              const ready = !!face || !!presetSrc;
              return (
                <div role="button" tabIndex={0} onClick={() => lipsyncFaceRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lipsyncFaceRef.current?.click(); } }}
                  className={`relative flex min-h-[92px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-3 text-center transition active:scale-[0.99] ${ready ? 'border-app-accent/50 bg-app-accent/10' : 'border-app-border/30 bg-app-elevated/40 hover:bg-app-elevated/70'}`}>
                  {ready ? (
                    <>
                      {face && !isImage(face.mimeType) ? (
                        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-app-bg/60 text-app-accent ring-1 ring-app-accent/40"><Film size={18} /></span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={face ? face.dataUrl : presetSrc!} alt="" loading="lazy" decoding="async" className="h-12 w-12 rounded-lg object-cover ring-1 ring-app-accent/40" />
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-app-accent"><Check size={12} /> {presetSrc ? (locale === 'en' ? 'Preset chosen' : locale === 'ru' ? 'Пресет выбран' : 'არჩეულია') : (locale === 'en' ? 'Face ready' : locale === 'ru' ? 'Лицо готово' : 'სახე მზადაა')}</span>
                      <button type="button" aria-label="remove face" onClick={(e) => { e.stopPropagation(); setLipPreset(null); setAttachments((prev) => prev.filter((a) => !isImage(a.mimeType) && !isVideo(a.mimeType))); }}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/15 hover:text-app-text touch-manipulation before:absolute before:-inset-2.5 before:content-['']"><X size={11} /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-app-bg/60 text-app-accent"><ImageIcon size={16} /></span>
                      <span className="text-[12px] font-semibold text-app-text">{locale === 'en' ? 'Character photo' : locale === 'ru' ? 'Фото персонажа' : 'პერსონაჟის ფოტო'}</span>
                      <span className="text-[10px] leading-tight text-app-muted">{locale === 'en' ? 'upload a face — or pick a preset below' : locale === 'ru' ? 'загрузите лицо — или выберите пресет ниже' : 'ატვირთე სახე — ან აირჩიე მზა ქვემოთ'}</span>
                    </>
                  )}
                </div>
              );
            })()}
            {/* P8 — built-in avatar gallery: tap to use as the talking face (no upload). */}
            <div>
              <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-app-muted">{locale === 'en' ? 'Or pick an avatar' : locale === 'ru' ? 'Или выберите аватар' : 'ან აირჩიე ავატარი'}</span>
              <div className="grid grid-cols-6 gap-1.5">
                {AVATAR_PRESETS.map((p, i) => {
                  const selected = lipPreset === p.src;
                  return (
                    <button key={p.src} type="button" aria-pressed={selected} aria-label={`Avatar ${i + 1}`}
                      onClick={() => {
                        if (selected) { setLipPreset(null); return; }
                        setLipPreset(p.src);
                        setLipGender(p.gender); // match the cloned voice to the face
                        setAttachments((prev) => prev.filter((a) => !isImage(a.mimeType) && !isVideo(a.mimeType)));
                      }}
                      className={`relative aspect-square overflow-hidden rounded-lg ring-1 transition active:scale-95 ${selected ? 'ring-2 ring-app-accent' : 'ring-app-border/15 hover:ring-app-accent/50'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.src} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {selected && (
                        <span className="absolute inset-0 flex items-center justify-center bg-app-accent/30">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-app-accent text-app-bg"><Check size={12} /></span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <span className="block text-[11px] leading-relaxed text-app-muted">{locale === 'en' ? 'Pick or attach a face → type what it says (it speaks). Or leave it empty — an AI presenter speaks your script in the cloned voice.' : locale === 'ru' ? 'Выберите или прикрепите лицо → введите текст (оно произнесёт). Или оставьте пустым — AI-ведущий озвучит ваш текст клонированным голосом.' : 'აირჩიე ან მიამაგრე სახე → ჩაწერე ტექსტი (ალაპარაკდება). ან დატოვე ცარიელი — AI წამყვანი წაიკითხავს კლონირებული ხმით.'}</span>
            {/* Voice (cloned Georgian Female/Male) + output Format — always available. */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-app-muted">{locale === 'en' ? 'Voice' : locale === 'ru' ? 'Голос' : 'ხმა'}</span>
                <div className="mt-1.5 flex gap-1.5">
                  {([['female', locale === 'en' ? 'Female' : locale === 'ru' ? 'Жен.' : 'ქალი'], ['male', locale === 'en' ? 'Male' : locale === 'ru' ? 'Муж.' : 'კაცი']] as const).map(([g, label]) => (
                    <button key={g} type="button" onClick={() => setLipGender(g)} aria-pressed={lipGender === g}
                      className={`flex-1 rounded-lg px-2 py-2 text-[12px] font-semibold transition active:scale-[0.98] ${lipGender === g ? 'bg-app-accent/15 text-app-accent ring-1 ring-app-accent/40' : 'bg-app-bg/40 text-app-text/80 hover:bg-app-bg/60'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-app-muted">{locale === 'en' ? 'Format' : locale === 'ru' ? 'Формат' : 'ფორმატი'}</span>
                <div className="mt-1.5 flex gap-1.5">
                  {(['9:16', '16:9', '1:1'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setLipFormat(f)} aria-pressed={lipFormat === f}
                      className={`flex-1 rounded-lg px-1.5 py-2 text-[11px] font-semibold tabular-nums transition active:scale-[0.98] ${lipFormat === f ? 'bg-app-accent/15 text-app-accent ring-1 ring-app-accent/40' : 'bg-app-bg/40 text-app-text/80 hover:bg-app-bg/60'}`}>{f}</button>
                  ))}
                </div>
              </div>
            </div>
            {(attachments.some((a) => isAudio(a.mimeType)) || hasTrainedVoice) && (
              <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎙 {locale === 'en' ? 'My audio' : locale === 'ru' ? 'Моё аудио' : 'ჩემი აუდიო'}</span>
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
            </>)}
          </div>
        )}

        {/* VIDEO — v330 elite, responsive multi-slot panel: master audio MODE,
            Character Reference + Audio Track ingest slots, length/format, mode-aware
            audio controls, effect/transition. Optimized for mobile touch. */}
        {mode === 'video' && (
          <div className="mb-2 space-y-2">
            {/* PHASE 2 L1 — Cinema / Product-Ad / Character-Swap tabs (TASK 1 adds swap). */}
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" onClick={() => setVideoTab('cinema')}
                className={`rounded-xl border p-2.5 text-[12px] font-semibold transition active:scale-[0.99] ${videoTab === 'cinema' ? 'border-app-accent/60 bg-app-accent/15 text-app-accent ring-1 ring-app-accent/30' : 'border-app-border/20 bg-app-bg/40 text-app-muted'}`}>
                🎬 {locale === 'en' ? 'Cinema' : locale === 'ru' ? 'Кино' : 'კინო'}
              </button>
              <button type="button" onClick={() => setVideoTab('product')}
                className={`rounded-xl border p-2.5 text-[12px] font-semibold transition active:scale-[0.99] ${videoTab === 'product' ? 'border-app-accent/60 bg-app-accent/15 text-app-accent ring-1 ring-app-accent/30' : 'border-app-border/20 bg-app-bg/40 text-app-muted'}`}>
                📦 {locale === 'en' ? 'Product' : locale === 'ru' ? 'Реклама' : 'პროდუქტი'}
              </button>
              <button type="button" onClick={() => setVideoTab('videoswap')}
                className={`relative rounded-xl border p-2.5 text-[12px] font-semibold transition active:scale-[0.99] ${videoTab === 'videoswap' ? 'border-orange-500/50 bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'border-app-border/20 bg-app-bg/40 text-app-muted'}`}>
                🔄 {locale === 'en' ? 'Swap' : locale === 'ru' ? 'Замена' : 'შეცვლა'}
                <span className="absolute -right-1 -top-1 rounded-full bg-orange-500/30 px-1 text-[8px] font-bold text-orange-300">★</span>
              </button>
            </div>
            {videoTab === 'cinema' && (<>
            {/* 1 · MASTER AUDIO MODE — Music Video vs Documentary (the voice-overlap fix) */}
            <div className="rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎚 {locale === 'en' ? 'Mode' : locale === 'ru' ? 'Режим' : 'რეჟიმი'}</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  ['musicvideo', Music2, locale === 'en' ? 'Music Video' : locale === 'ru' ? 'Клип' : 'მუსიკ. ვიდეო', locale === 'en' ? 'song leads · no narrator' : locale === 'ru' ? 'песня ведёт · без диктора' : 'სიმღერა წამყვანი · დიქტორის გარეშე'],
                  ['documentary', Mic, locale === 'en' ? 'Documentary' : locale === 'ru' ? 'Документальный' : 'დოკუმენტური', locale === 'en' ? 'narrator leads · music ducked' : locale === 'ru' ? 'диктор ведёт · музыка тише' : 'დიქტორი წამყვანი · მუსიკა ჩაწეული'],
                ] as const).map(([id, Icon, label, sub]) => {
                  const on = videoMode === id;
                  return (
                    <button key={id} type="button" onClick={() => setVideoMode(id)}
                      className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${on ? 'border-app-accent/60 bg-app-accent/15 ring-1 ring-app-accent/30' : 'border-app-border/20 bg-app-bg/40 hover:bg-app-bg/60'}`}>
                      <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${on ? 'text-app-accent' : 'text-app-text'}`}><Icon size={14} /> {label}</span>
                      <span className="text-[10.5px] leading-tight text-app-muted">{sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2 · CHARACTER REFERENCE — up to 3 photos. The FIRST is the main identity →
                Kling i2v start_image; all are sent to the pipeline (referenceImages) + stored
                in the job metadata for multi-angle character lock. */}
            <div id="character-ref-zone" className="space-y-1.5">
              <span className="inline-flex flex-wrap items-center gap-1.5 px-0.5 text-[12.5px] font-semibold text-app-text">
                🎬 {locale === 'en' ? 'Scene frames' : locale === 'ru' ? 'Кадры сцен' : 'სცენის ფრეიმები'}
                <span className="text-[10px] font-normal text-app-muted">
                  {videoCharacterRefs.length}/{sceneFrameCount}
                  {videoCharacterRefs.length < sceneFrameCount && videoCharacterRefs.length > 0 && (
                    <> · {sceneFrameCount - videoCharacterRefs.length} {locale === 'en' ? 'AI-filled' : locale === 'ru' ? 'ИИ' : 'AI-ით'}</>
                  )}
                </span>
              </span>
              <div className={`grid gap-2 ${sceneFrameCount === 1 ? 'grid-cols-1' : sceneFrameCount <= 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {Array.from({ length: sceneFrameCount }).map((_, i) => {
                  const url = videoCharacterRefs[i];
                  const isAdd = !url && i === videoCharacterRefs.length;
                  return (
                    <div key={i} className="flex min-w-0 flex-col gap-1">
                      {url ? (
                        <div className="relative aspect-square overflow-hidden rounded-xl border border-app-accent/50 bg-app-accent/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent pt-3 pb-0.5 text-center text-[8.5px] font-medium text-white">{locale === 'en' ? 'Scene' : locale === 'ru' ? 'Сц.' : 'სცენა'} {i + 1}</span>
                          <button type="button" aria-label="remove scene frame" onClick={() => setVideoCharacterRefs((p) => p.filter((_, k) => k !== i))}
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/15 hover:text-app-text touch-manipulation before:absolute before:-inset-2.5 before:content-['']"><X size={11} /></button>
                        </div>
                      ) : (
                        <div role={isAdd ? 'button' : undefined} tabIndex={isAdd ? 0 : undefined}
                          onClick={isAdd ? () => { charReplaceRef.current = false; charFileRef.current?.click(); } : undefined}
                          onKeyDown={isAdd ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); charReplaceRef.current = false; charFileRef.current?.click(); } } : undefined}
                          className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed text-center transition ${isAdd ? 'cursor-pointer border-app-border/30 bg-app-elevated/40 hover:bg-app-elevated/70 active:scale-[0.99]' : 'border-app-border/15 bg-app-elevated/20'}`}>
                          {isAdd ? <span className="flex h-7 w-7 items-center justify-center rounded-full bg-app-bg/60 text-app-accent"><Plus size={14} /></span> : <span className="text-[11px]">🤖</span>}
                          <span className="text-[8.5px] font-medium text-app-muted">{locale === 'en' ? 'Scene' : locale === 'ru' ? 'Сц.' : 'სცენა'} {i + 1}</span>
                        </div>
                      )}
                      {/* Per-scene ACTION prompt — describe this scene's motion (optional; empty → AI). */}
                      <textarea
                        value={scenePrompts[i] || ''}
                        onChange={(e) => updateScenePrompt(i, e.target.value)}
                        rows={2}
                        placeholder={locale === 'en' ? `Scene ${i + 1} — action…` : locale === 'ru' ? `Сцена ${i + 1} — действие…` : `სცენა ${i + 1} — მოქმედება…`}
                        className="w-full resize-none rounded-lg border border-app-border/20 bg-app-elevated/40 px-2 py-1 text-[11px] leading-snug text-app-text placeholder:text-app-muted/55 focus:border-app-accent/50 focus:outline-none"
                      />
                    </div>
                  );
                })}
              </div>
              <p className="px-0.5 text-[10px] leading-tight text-app-muted">{locale === 'en' ? 'One frame per scene (optional, in order). Empty scenes are filled by the storyboard AI.' : locale === 'ru' ? 'По кадру на сцену (опц., по порядку). Пустые сцены добавит ИИ-раскадровка.' : 'თითო ფრეიმი თითო სცენისთვის (არჩევით, თანმიმდევრობით). ცარიელ სცენებს Storyboard-ის AI შეავსებს.'}</p>
            </div>

            {/* 2-script · SCRIPT ingest slot — the Director follows this verbatim. Lives in the
                video panel (not the chat composer) so the script ALWAYS reaches the storyboard,
                independent of chat mode. .txt/.md/.pdf/.docx. */}
            <div className="grid grid-cols-1 gap-2">
              <div role="button" tabIndex={0} onClick={() => { if (!videoScriptBusy) scriptFileRef.current?.click(); }}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !videoScriptBusy) { e.preventDefault(); scriptFileRef.current?.click(); } }}
                onDragOver={(e) => { e.preventDefault(); }} onDrop={handleScriptDrop}
                className={`relative flex min-h-[92px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-3 text-center transition active:scale-[0.99] ${videoScriptDoc ? 'border-app-accent/50 bg-app-accent/10' : 'border-app-border/30 bg-app-elevated/40 hover:bg-app-elevated/70'}`}>
                {videoScriptBusy ? (
                  <><Loader2 size={18} className="animate-spin text-app-accent" /><span className="text-[11px] font-medium text-app-muted">{locale === 'en' ? 'Reading script…' : locale === 'ru' ? 'Читаю сценарий…' : 'სცენარს ვკითხულობ…'}</span></>
                ) : videoScriptDoc ? (
                  <>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-app-bg/60 text-app-accent"><FileText size={16} /></span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-app-accent"><Check size={12} /> {locale === 'en' ? 'Script loaded' : locale === 'ru' ? 'Сценарий загружен' : 'სცენარი ჩაიტვირთა'}</span>
                    <span className="max-w-full truncate px-1 text-[10px] leading-tight text-app-muted">{videoScriptDoc.name} · {videoScriptDoc.text.length.toLocaleString()} {locale === 'en' ? 'chars' : locale === 'ru' ? 'симв.' : 'სიმბ.'}</span>
                    <button type="button" aria-label="remove script" onClick={(e) => { e.stopPropagation(); setVideoScriptDoc(null); }}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/15 hover:text-app-text touch-manipulation before:absolute before:-inset-2.5 before:content-['']"><X size={11} /></button>
                  </>
                ) : (
                  <>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-app-bg/60 text-app-accent"><FileText size={16} /></span>
                    <span className="text-[12px] font-semibold text-app-text">{locale === 'en' ? 'Script / scenario' : locale === 'ru' ? 'Сценарий' : 'სცენარი'}</span>
                    <span className="text-[10px] leading-tight text-app-muted">{locale === 'en' ? 'upload .txt / .pdf / .docx — the film follows it' : locale === 'ru' ? 'загрузите .txt / .pdf / .docx — фильм по нему' : 'ატვირთე .txt / .pdf / .docx — ფილმი მის მიხედვით'}</span>
                  </>
                )}
              </div>
            </div>

            {/* 2a · Audio Track ingest slot (full width) */}
            <div className="grid grid-cols-1 gap-2">
              <div role="button" tabIndex={0} onClick={() => { if (!videoSoundtrackBusy) audioFileRef.current?.click(); }}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !videoSoundtrackBusy) { e.preventDefault(); audioFileRef.current?.click(); } }}
                className={`relative flex min-h-[92px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-3 text-center transition active:scale-[0.99] ${videoSoundtrack ? 'border-app-accent/50 bg-app-accent/10' : 'border-app-border/30 bg-app-elevated/40 hover:bg-app-elevated/70'}`}>
                {videoSoundtrackBusy ? (
                  <><Loader2 size={18} className="animate-spin text-app-accent" /><span className="text-[11px] font-medium text-app-muted">{locale === 'en' ? 'Uploading…' : locale === 'ru' ? 'Загрузка…' : 'იტვირთება…'}</span></>
                ) : videoSoundtrack ? (
                  <>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-app-bg/60 text-app-accent"><Music2 size={16} /></span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-app-accent"><Check size={12} /> {locale === 'en' ? 'Soundtrack' : locale === 'ru' ? 'Саундтрек' : 'საუნდტრეკი'}</span>
                    <span className="max-w-full truncate px-1 text-[10px] leading-tight text-app-muted">{videoSoundtrack.name}</span>
                    <button type="button" aria-label="remove soundtrack" onClick={(e) => { e.stopPropagation(); setVideoSoundtrack((prev) => { if (prev?.previewUrl) { try { URL.revokeObjectURL(prev.previewUrl); } catch { /* noop */ } } return null; }); }}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/15 hover:text-app-text touch-manipulation before:absolute before:-inset-2.5 before:content-['']"><X size={11} /></button>
                  </>
                ) : (
                  <>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-app-bg/60 text-app-accent"><Music2 size={16} /></span>
                    <span className="text-[12px] font-semibold text-app-text">{locale === 'en' ? 'Audio track' : locale === 'ru' ? 'Аудиодорожка' : 'აუდიო ტრეკი'}</span>
                    <span className="text-[10px] leading-tight text-app-muted">{locale === 'en' ? 'upload a beat/song' : locale === 'ru' ? 'загрузить бит/песню' : 'ატვირთე ბიტი/სიმღერა'}</span>
                  </>
                )}
              </div>
            </div>

            {/* 2b · Soundtrack detail — waveform + duration + preview (Phase 6 polish).
                Shown once a track is uploaded; purely informative, never blocks generation. */}
            {videoSoundtrack && (
              <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-app-text">
                    <Music2 size={13} className="shrink-0 text-app-accent" />
                    <span className="truncate">{videoSoundtrack.name}</span>
                  </span>
                  {videoSoundtrack.durationSec ? (
                    <span className="shrink-0 tabular-nums text-[11px] font-medium text-app-muted">{fmtDur(videoSoundtrack.durationSec)}</span>
                  ) : null}
                </div>
                {videoSoundtrack.peaks && videoSoundtrack.peaks.length > 0 && (
                  <div className="flex h-9 items-end gap-[2px]" aria-hidden="true">
                    {videoSoundtrack.peaks.map((p, k) => (
                      <span key={k} className="flex-1 rounded-sm bg-app-accent/55" style={{ height: `${Math.max(8, Math.round(p * 100))}%` }} />
                    ))}
                  </div>
                )}
                {videoSoundtrack.previewUrl && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio src={videoSoundtrack.previewUrl} controls className="h-8 w-full" />
                )}
              </div>
            )}

            {/* 2c · Character-photo guidance for music video — lip-sync keys a face, so a
                character reference gives the best result. A WARNING (not a hard block): the
                pipeline still derives a face if none is given, so generation is never blocked. */}
            {videoMode === 'musicvideo' && !videoCharacterRef && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2.5 text-[11.5px] leading-snug text-amber-600 dark:text-amber-400">
                <span className="shrink-0">📸</span>
                <span>{locale === 'en'
                  ? 'Add a character photo above for accurate lip-sync (otherwise a face is auto-generated).'
                  : locale === 'ru'
                    ? 'Добавьте фото персонажа выше для точного липсинка (иначе лицо создаётся автоматически).'
                    : 'lip-sync-ისთვის ატვირთე პერსონაჟის ფოტო ზემოთ (თუ არა — სახე ავტომატურად შეიქმნება).'}</span>
              </div>
            )}

            {/* 3 · Length + Format, side by side */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">⏱ {locale === 'en' ? 'Length' : locale === 'ru' ? 'Длина' : 'ხანგრძლივობა'}</span>
                <div className="flex gap-1.5">
                  <Chip active={videoDuration === 6} onClick={() => setVideoDuration(6)}>6{locale === 'en' ? 's' : 'წმ'}</Chip>
                  <Chip active={videoDuration === 30} onClick={() => setVideoDuration(30)}>30{locale === 'en' ? 's' : 'წმ'}</Chip>
                  <Chip active={videoDuration === 60} onClick={() => setVideoDuration(60)}>60{locale === 'en' ? 's' : 'წმ'}</Chip>
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">📐 {locale === 'en' ? 'Format' : locale === 'ru' ? 'Формат' : 'ფორმატი'}{videoMode === 'musicvideo' && <span className="ml-1 text-[10px] font-normal text-app-muted">· {locale === 'en' ? '9:16 locked' : locale === 'ru' ? '9:16 фикс.' : '9:16 ფიქს.'}</span>}</span>
                {/* ISSUE 4 — flex-wrap so all 4 formats (16:9·9:16·1:1·4:5) stay visible in
                    the half-width grid column on a 375px phone (1:1 + 4:5 were clipping off-screen). */}
                <div className={`flex flex-wrap items-end gap-x-3 gap-y-2 ${videoMode === 'musicvideo' ? 'opacity-70' : ''}`}>
                  <button type="button" disabled={videoMode === 'musicvideo'} onClick={() => setVideoOrientation('landscape')} aria-label="16:9" className="flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 transition active:scale-95 disabled:cursor-not-allowed touch-manipulation">
                    <span className={`block rounded-[3px] border-2 transition-colors ${(videoMode === 'musicvideo' ? 'vertical' : videoOrientation) === 'landscape' ? 'border-app-accent bg-app-accent/25' : 'border-app-border/40'}`} style={{ width: 38, height: 22 }} />
                    <span className={`text-[10.5px] font-medium ${(videoMode === 'musicvideo' ? 'vertical' : videoOrientation) === 'landscape' ? 'text-app-accent' : 'text-app-muted'}`}>16:9</span>
                  </button>
                  <button type="button" disabled={videoMode === 'musicvideo'} onClick={() => setVideoOrientation('vertical')} aria-label="9:16" className="flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 transition active:scale-95 disabled:cursor-not-allowed touch-manipulation">
                    <span className={`block rounded-[3px] border-2 transition-colors ${(videoMode === 'musicvideo' ? 'vertical' : videoOrientation) === 'vertical' ? 'border-app-accent bg-app-accent/25' : 'border-app-border/40'}`} style={{ width: 22, height: 38 }} />
                    <span className={`text-[10.5px] font-medium ${(videoMode === 'musicvideo' ? 'vertical' : videoOrientation) === 'vertical' ? 'text-app-accent' : 'text-app-muted'}`}>9:16</span>
                  </button>
                  <button type="button" disabled={videoMode === 'musicvideo'} onClick={() => setVideoOrientation('square')} aria-label="1:1" className="flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 transition active:scale-95 disabled:cursor-not-allowed touch-manipulation">
                    <span className={`block rounded-[3px] border-2 transition-colors ${videoMode !== 'musicvideo' && videoOrientation === 'square' ? 'border-app-accent bg-app-accent/25' : 'border-app-border/40'}`} style={{ width: 30, height: 30 }} />
                    <span className={`text-[10.5px] font-medium ${videoMode !== 'musicvideo' && videoOrientation === 'square' ? 'text-app-accent' : 'text-app-muted'}`}>1:1</span>
                  </button>
                  <button type="button" disabled={videoMode === 'musicvideo'} onClick={() => setVideoOrientation('portrait')} aria-label="4:5" className="flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 transition active:scale-95 disabled:cursor-not-allowed touch-manipulation">
                    <span className={`block rounded-[3px] border-2 transition-colors ${videoMode !== 'musicvideo' && videoOrientation === 'portrait' ? 'border-app-accent bg-app-accent/25' : 'border-app-border/40'}`} style={{ width: 26, height: 32 }} />
                    <span className={`text-[10.5px] font-medium ${videoMode !== 'musicvideo' && videoOrientation === 'portrait' ? 'text-app-accent' : 'text-app-muted'}`}>4:5</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 4 · Audio mix — adapts to the chosen mode (the voice-overlap fix made visible) */}
            {videoMode === 'documentary' ? (
              <>
                <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
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
                  {/* Character voice — female/male cloned Georgian voice, or "Both"
                      (ორივე) which flips on multi-character mode (per-speaker voices,
                      script split below). Shown when narration is on and not using
                      the user's own trained voice. */}
                  {videoNarration && !videoMyVoiceNarration && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="mr-0.5 text-[11px] text-app-muted">{locale === 'en' ? 'Character voice:' : locale === 'ru' ? 'Голос персонажа:' : 'პერსონაჟის ხმა:'}</span>
                      <Chip active={!videoMultiChar && videoNarratorGender === 'female'} onClick={() => { setVideoMultiChar(false); setVideoNarratorGender('female'); }}>👩 {locale === 'en' ? 'Female' : locale === 'ru' ? 'Женский' : 'ქალი'}</Chip>
                      <Chip active={!videoMultiChar && videoNarratorGender === 'male'} onClick={() => { setVideoMultiChar(false); setVideoNarratorGender('male'); }}>👨 {locale === 'en' ? 'Male' : locale === 'ru' ? 'Мужской' : 'კაცი'}</Chip>
                      <Chip active={videoMultiChar} onClick={() => setVideoMultiChar(true)}>👫 {locale === 'en' ? 'Both' : locale === 'ru' ? 'Оба' : 'ორივე'}</Chip>
                    </div>
                  )}
                  {/* PHASE 2 L1 — Character Voice DETAILS: language + persona + tone → VOICE_MAP.
                      Folded into an accordion (13 chips) with a live emoji summary so the default
                      view stays calm; the primary female/male/both choice above stays visible. */}
                  {videoNarration && !videoMyVoiceNarration && (
                    <Section
                      title={`🎙 ${locale === 'en' ? 'Voice details' : locale === 'ru' ? 'Детали голоса' : 'ხმის დეტალები'}`}
                      badge={`${voiceLanguage === 'ka' ? '🇬🇪' : voiceLanguage === 'en' ? '🇬🇧' : '🇷🇺'} ${voicePersona === 'male' ? '👨' : voicePersona === 'female' ? '👩' : voicePersona === 'child' ? '👶' : '👴'} ${voiceTone === 'epic' ? '🎭' : voiceTone === 'emotional' ? '💫' : '⚡'}`}
                    >
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-0.5 text-[11px] text-app-muted">{locale === 'en' ? 'Language:' : locale === 'ru' ? 'Язык:' : 'ენა:'}</span>
                        <Chip active={voiceLanguage === 'ka'} onClick={() => setVoiceLanguage('ka')}>🇬🇪 KA</Chip>
                        <Chip active={voiceLanguage === 'en'} onClick={() => setVoiceLanguage('en')}>🇬🇧 EN</Chip>
                        <Chip active={voiceLanguage === 'ru'} onClick={() => setVoiceLanguage('ru')}>🇷🇺 RU</Chip>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-0.5 text-[11px] text-app-muted">{locale === 'en' ? 'Persona:' : locale === 'ru' ? 'Персона:' : 'პერსონა:'}</span>
                        <Chip active={voicePersona === 'male'} onClick={() => setVoicePersona('male')}>👨 {locale === 'en' ? 'Man' : locale === 'ru' ? 'Муж' : 'კაცი'}</Chip>
                        <Chip active={voicePersona === 'female'} onClick={() => setVoicePersona('female')}>👩 {locale === 'en' ? 'Woman' : locale === 'ru' ? 'Жен' : 'ქალი'}</Chip>
                        <Chip active={voicePersona === 'child'} onClick={() => setVoicePersona('child')}>👶 {locale === 'en' ? 'Child' : locale === 'ru' ? 'Ребёнок' : 'ბავშვი'}</Chip>
                        <Chip active={voicePersona === 'elderly'} onClick={() => setVoicePersona('elderly')}>👴 {locale === 'en' ? 'Elder' : locale === 'ru' ? 'Пожилой' : 'ხანდაზმული'}</Chip>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-0.5 text-[11px] text-app-muted">{locale === 'en' ? 'Tone:' : locale === 'ru' ? 'Тон:' : 'ტონი:'}</span>
                        <Chip active={voiceTone === 'epic'} onClick={() => setVoiceTone('epic')}>🎭 {locale === 'en' ? 'Epic' : locale === 'ru' ? 'Эпично' : 'ეპიკური'}</Chip>
                        <Chip active={voiceTone === 'emotional'} onClick={() => setVoiceTone('emotional')}>💫 {locale === 'en' ? 'Emotional' : locale === 'ru' ? 'Эмоц.' : 'ემოციური'}</Chip>
                        <Chip active={voiceTone === 'energetic'} onClick={() => setVoiceTone('energetic')}>⚡ {locale === 'en' ? 'Energetic' : locale === 'ru' ? 'Энерг.' : 'ენერგიული'}</Chip>
                      </div>
                    </div>
                    </Section>
                  )}
                  {/* PHASE 2 L6 — Smart ducking: music auto-ducks under the narration.
                      Only shown with music on; depth −6…−18 dB (default −12). */}
                  {videoMusic && (
                    <div className="flex flex-col gap-1.5 border-t border-app-border/10 pt-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-app-muted">🎚 {locale === 'en' ? 'Smart ducking' : locale === 'ru' ? 'Авто-приглушение' : 'ჭკვიანი ჩაჩუმება'}</span>
                        <AppToggle on={videoSmartDuck} onChange={setVideoSmartDuck} label="smart ducking" />
                      </div>
                      {videoSmartDuck && (
                        <label className="flex items-center gap-2">
                          <span className="whitespace-nowrap text-[10.5px] text-app-muted">{locale === 'en' ? 'Depth' : locale === 'ru' ? 'Глубина' : 'სიღრმე'}</span>
                          <input type="range" min={-18} max={-6} step={6} value={videoDuckDb}
                            onChange={(e) => setVideoDuckDb(Number(e.target.value))}
                            className="h-1.5 flex-1 cursor-pointer accent-app-accent" aria-label="ducking depth dB" />
                          <span className="w-12 text-right text-[10.5px] tabular-nums text-app-text">{videoDuckDb} dB</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
                {/* Multiple-characters toggle — when on, the script below is split per
                    speaker (ქალი:/კაცი:/Woman:/Man:) and each line voiced separately. */}
                <button type="button" onClick={() => setVideoMultiChar((v) => !v)} aria-pressed={videoMultiChar}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left shadow-[0_2px_12px_rgba(0,0,0,0.12)] transition active:scale-[0.99] ${videoMultiChar ? 'border-app-accent/50 bg-app-accent/10' : 'border-app-border/20 bg-app-bg/40'}`}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">💬 {locale === 'en' ? 'Multiple characters' : locale === 'ru' ? 'Несколько персонажей' : 'მრავალი პერსონაჟი'}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-tight text-app-muted">{locale === 'en' ? 'Each speaker gets their own voice.' : locale === 'ru' ? 'У каждого говорящего свой голос.' : 'თითო პერსონაჟს თავისი ხმა.'}</span>
                  </span>
                  {/* Inline-styled visual track (the card button handles the click). */}
                  <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, width: 44, height: 24, borderRadius: 9999, backgroundColor: videoMultiChar ? '#06b6d4' : '#475569', transition: 'background-color 200ms ease' }}>
                    <span style={{ position: 'absolute', top: 3, left: videoMultiChar ? 23 : 3, width: 18, height: 18, borderRadius: 9999, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', transition: 'left 200ms ease', display: 'block' }} />
                  </span>
                </button>
                {/* Dialogue — single narrator (verbatim) OR a multi-character script. */}
                <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                  {videoMultiChar ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🗣 {locale === 'en' ? 'Dialogue script' : locale === 'ru' ? 'Сценарий диалога' : 'დიალოგის სცენარი'}</span>
                      <textarea value={videoDialogue} onChange={(e) => setVideoDialogue(e.target.value)} rows={4}
                        placeholder={locale === 'en' ? 'Woman: Hello, how are you?\nMan: I am well, thanks!' : locale === 'ru' ? 'Женщина: Привет, как дела?\nМужчина: Хорошо, спасибо!' : 'ქალი: გამარჯობა, როგორ ხარ?\nკაცი: კარგად ვარ, გმადლობ!'}
                        className="w-full resize-none rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[12.5px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted/45 focus:border-app-accent/60 focus:bg-app-bg/70 focus:ring-2 focus:ring-app-accent/25" />
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🗣 {locale === 'en' ? 'What the character says' : locale === 'ru' ? 'Что говорит персонаж' : 'რას ამბობს პერსონაჟი'}</span>
                      <textarea value={videoSpeech} onChange={(e) => setVideoSpeech(e.target.value)} rows={2}
                        placeholder={locale === 'en' ? 'Type the dialogue — spoken verbatim (empty = auto)…' : locale === 'ru' ? 'Введите реплику — произнесётся дословно (пусто = авто)…' : 'ჩაწერე რას იტყვის — ზუსტად ისე ილაპარაკებს (ცარიელი = ავტომატური)…'}
                        className="w-full resize-none rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[12.5px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted/45 focus:border-app-accent/60 focus:bg-app-bg/70 focus:ring-2 focus:ring-app-accent/25" />
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Vocal gender — steers the ElevenLabs Music singer (big touch targets) */}
                <div className="rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎤 {locale === 'en' ? 'Vocal' : locale === 'ru' ? 'Вокал' : 'ვოკალი'}</span>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([
                      ['female', '👩‍🎤', locale === 'en' ? 'Female' : locale === 'ru' ? 'Женский' : 'ქალის'],
                      ['male', '👨‍🎤', locale === 'en' ? 'Male' : locale === 'ru' ? 'Мужской' : 'კაცის'],
                      ['duet', '👫', locale === 'en' ? 'Duet' : locale === 'ru' ? 'Дуэт' : 'დუეტი'],
                    ] as const).map(([id, emoji, label]) => {
                      const on = videoVocalGender === id;
                      return (
                        <button key={id} type="button" onClick={() => setVideoVocalGender(id)}
                          className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl border px-3 py-3 text-[14px] font-semibold transition active:scale-[0.98] ${on ? 'border-app-accent/60 bg-app-accent/15 text-app-accent ring-1 ring-app-accent/30' : 'border-app-border/20 bg-app-bg/40 text-app-text hover:bg-app-bg/60'}`}>
                          <span className="text-[19px] leading-none">{emoji}</span> {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Song-master info */}
                <div className="space-y-1 rounded-xl border border-app-accent/25 bg-app-accent/10 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-accent">🎚 {locale === 'en' ? 'Song-master mix' : locale === 'ru' ? 'Песня — мастер' : 'სიმღერა — მთავარი'}</span>
                  <p className="text-[11px] leading-relaxed text-app-muted">
                    {locale === 'en'
                      ? 'The song rules the master — no narrator, backing ducked −12 dB under the vocal, forced 9:16 vertical. Upload a beat in the Audio Track slot, or one is generated for you.'
                      : locale === 'ru'
                        ? 'Песня — мастер: без диктора, фон −12 дБ под вокал, вертикаль 9:16. Загрузите бит в слот «Аудиодорожка» — или он сгенерируется.'
                        : 'სიმღერა მთავარია — დიქტორის გარეშე, ფონი −12 dB ვოკალის ქვეშ, 9:16 ვერტიკალური. ატვირთე ბიტი „აუდიო ტრეკში“, ან დაგენერირდება.'}
                  </p>
                </div>
                {/* P1 · Lip-sync the singer to the vocal (default ON; fail-open) */}
                <button type="button" onClick={() => setVideoLipsync((v) => !v)} aria-pressed={videoLipsync}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left shadow-[0_2px_12px_rgba(0,0,0,0.12)] transition active:scale-[0.99] ${videoLipsync ? 'border-app-accent/50 bg-app-accent/10' : 'border-app-border/20 bg-app-bg/40'}`}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎤 {locale === 'en' ? "Sync singer's lips to the vocal" : locale === 'ru' ? 'Синхрон губ певицы с вокалом' : 'მომღერლის ტუჩები ვოკალთან'}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-tight text-app-muted">{locale === 'en' ? 'A lip-sync pass after the film assembles (adds time).' : locale === 'ru' ? 'Липсинк после сборки фильма (дольше).' : 'ლიპსინკი ფილმის აწყობის შემდეგ (დრო ემატება).'}</span>
                  </span>
                  {/* Inline-styled visual track (the card button handles the click). */}
                  <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, width: 44, height: 24, borderRadius: 9999, backgroundColor: videoLipsync ? '#06b6d4' : '#475569', transition: 'background-color 200ms ease' }}>
                    <span style={{ position: 'absolute', top: 3, left: videoLipsync ? 23 : 3, width: 18, height: 18, borderRadius: 9999, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', transition: 'left 200ms ease', display: 'block' }} />
                  </span>
                </button>
                {/* PHASE 19 — LYRICS. Music-video mode had no way to supply the song's words; the singer
                    sang auto-written lyrics. Bound to videoSpeech (folded into the brief in send()), so the
                    AI performs THESE Georgian lyrics. Empty = auto-written. */}
                <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎤 {locale === 'en' ? 'Lyrics' : locale === 'ru' ? 'Текст песни' : 'ლირიკა'}</span>
                  <span className="block text-[10.5px] leading-tight text-app-muted">{locale === 'en' ? 'What the singer sings (Georgian works). Empty = auto-written.' : locale === 'ru' ? 'Что поёт исполнитель (можно на грузинском). Пусто = авто.' : 'რას მღერის შემსრულებელი (ქართული მუშაობს). ცარიელი = ავტომატური.'}</span>
                  <textarea value={videoSpeech} onChange={(e) => setVideoSpeech(e.target.value)} rows={3}
                    placeholder={locale === 'en' ? 'Paste the song lyrics…' : locale === 'ru' ? 'Вставьте текст песни…' : 'ჩასვი სიმღერის ტექსტი…'}
                    className="w-full resize-none rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[12.5px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted/45 focus:border-app-accent/60 focus:bg-app-bg/70 focus:ring-2 focus:ring-app-accent/25" />
                </div>
              </>
            )}

            {/* PHASE 19 — MASTER SCRIPT / STORYBOARD, now UNIVERSAL (both documentary AND music-video).
                It was documentary-only, so a music video had no way to supply a timecoded scene script —
                the storyboard then invented its own. When filled it drives the scenes + per-speaker
                casting; empty = auto. Folded into the brief in send() for every video mode. */}
            <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">🎬 {locale === 'en' ? 'Master script / storyboard' : locale === 'ru' ? 'Мастер-сценарий / раскадровка' : 'მასტერ-სცენარი / სცენარი'}</span>
              <span className="block text-[10.5px] leading-tight text-app-muted">{locale === 'en' ? 'Paste a full timecoded script — its scenes + per-speaker dialogue drive the film. Empty = auto.' : locale === 'ru' ? 'Вставьте сценарий с таймкодами — его сцены и реплики управляют фильмом. Пусто = авто.' : 'ჩასვი დროით მონიშნული სცენარი — მისი სცენები და დიალოგი მართავს ფილმს. ცარიელი = ავტომატური.'}</span>
              <textarea id="master-script-input" data-testid="master-script-input" value={videoMasterScript} onChange={(e) => setVideoMasterScript(e.target.value)} rows={4}
                placeholder={locale === 'en' ? 'SCENE 1 (00:00–00:05): a quiet street at dawn…\n[00:02] Speaker 1: Are you ready?\n[00:04] Speaker 2: Almost.' : 'SCENE 1 (00:00–00:05): მშვიდი ქუჩა გამთენიისას…\n[00:02] მოსაუბრე 1: მზად ხარ?\n[00:04] მოსაუბრე 2: თითქმის.'}
                className="w-full resize-none rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[12px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted/45 focus:border-app-accent/60 focus:bg-app-bg/70 focus:ring-2 focus:ring-app-accent/25" />
            </div>

            {/* 5 · Effect — the primary creative control, kept fully visible. */}
            <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">✨ {locale === 'en' ? 'Effect' : locale === 'ru' ? 'Эффект' : 'ეფექტი'}</span>
              {/* Horizontal-scroll strip (17 effects) — the primary creative control stays fully
                  reachable but collapses to one calm row instead of ~6 wrapped rows on mobile. */}
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {VIDEO_STYLES.map((s) => <Chip key={s} active={videoStyle === s} onClick={() => setVideoStyle(s)}>{s}</Chip>)}
              </div>
            </div>

            {/* Advanced — transition + engine folded together (both are set-and-forget defaults);
                the collapsed badge surfaces the current transition glyph + engine so nothing hides. */}
            <Section
              title={`⚙️ ${locale === 'en' ? 'Advanced' : locale === 'ru' ? 'Дополнительно' : 'დამატებითი'}`}
              badge={`${videoTransition === 'crossfade' ? '⤫' : videoTransition === 'cut' ? '▮' : videoTransition === 'dissolve' ? '◈' : videoTransition === 'zoom' ? '⊕' : '▷'} · ${videoModel === 'kling' ? 'Kling' : videoModel === 'hailuo' ? 'Hailuo' : 'Runway'}`}
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[11px] text-app-muted">{locale === 'en' ? 'Transition:' : locale === 'ru' ? 'Переход:' : 'გადასვლა:'}</span>
                  <Chip active={videoTransition === 'crossfade'} onClick={() => setVideoTransition('crossfade')}>⤫ {t.transCrossfade}</Chip>
                  <Chip active={videoTransition === 'cut'} onClick={() => setVideoTransition('cut')}>▮ {t.transCut}</Chip>
                  <Chip active={videoTransition === 'dissolve'} onClick={() => setVideoTransition('dissolve')}>◈ {locale === 'en' ? 'Dissolve' : locale === 'ru' ? 'Растворение' : 'დაშლა'}</Chip>
                  <Chip active={videoTransition === 'zoom'} onClick={() => setVideoTransition('zoom')}>⊕ {locale === 'en' ? 'Zoom' : locale === 'ru' ? 'Зум' : 'ზუმი'}</Chip>
                  <Chip active={videoTransition === 'slide'} onClick={() => setVideoTransition('slide')}>▷ {locale === 'en' ? 'Slide' : locale === 'ru' ? 'Слайд' : 'სლაიდი'}</Chip>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[11px] text-app-muted">{locale === 'en' ? 'Engine:' : locale === 'ru' ? 'Движок:' : 'ძრავა:'}</span>
                  <Chip active={videoModel === 'runway'} onClick={() => setVideoModel('runway')}>✨ Runway</Chip>
                  <Chip active={videoModel === 'kling'} onClick={() => setVideoModel('kling')}>🎬 Kling</Chip>
                </div>
              </div>
            </Section>

            {/* PHASE 2 L1 — Camera controls folded (advanced; 'Auto' + intensity 5 are the sensible
                defaults). Badge appears only when the user has moved off the defaults. */}
            <Section
              title={`🎥 ${locale === 'en' ? 'Camera' : locale === 'ru' ? 'Камера' : 'კამერა'}`}
              badge={(videoCameraMove !== 'auto' || videoMotionIntensity !== 5)
                ? `${videoCameraMove === 'pan_left' ? '←' : videoCameraMove === 'pan_right' ? '→' : videoCameraMove === 'zoom_in' ? '＋' : videoCameraMove === 'zoom_out' ? '－' : videoCameraMove === 'tilt_up' ? '↑' : videoCameraMove === 'tilt_down' ? '↓' : ''} ${videoMotionIntensity}/10`.trim()
                : false}
            >
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={videoCameraMove === 'auto'} onClick={() => setVideoCameraMove('auto')}>{locale === 'en' ? 'Auto' : locale === 'ru' ? 'Авто' : 'ავტო'}</Chip>
                  <Chip active={videoCameraMove === 'pan_left'} onClick={() => setVideoCameraMove('pan_left')}>← {locale === 'en' ? 'Pan' : locale === 'ru' ? 'Пан' : 'პან'}</Chip>
                  <Chip active={videoCameraMove === 'pan_right'} onClick={() => setVideoCameraMove('pan_right')}>→ {locale === 'en' ? 'Pan' : locale === 'ru' ? 'Пан' : 'პან'}</Chip>
                  <Chip active={videoCameraMove === 'zoom_in'} onClick={() => setVideoCameraMove('zoom_in')}>＋ {locale === 'en' ? 'Zoom' : locale === 'ru' ? 'Зум' : 'ზუმი'}</Chip>
                  <Chip active={videoCameraMove === 'zoom_out'} onClick={() => setVideoCameraMove('zoom_out')}>－ {locale === 'en' ? 'Zoom' : locale === 'ru' ? 'Зум' : 'ზუმი'}</Chip>
                  <Chip active={videoCameraMove === 'tilt_up'} onClick={() => setVideoCameraMove('tilt_up')}>↑ {locale === 'en' ? 'Tilt' : locale === 'ru' ? 'Наклон' : 'დახრა'}</Chip>
                  <Chip active={videoCameraMove === 'tilt_down'} onClick={() => setVideoCameraMove('tilt_down')}>↓ {locale === 'en' ? 'Tilt' : locale === 'ru' ? 'Наклон' : 'დახრა'}</Chip>
                </div>
                <label className="flex items-center gap-2 pt-0.5">
                  <span className="whitespace-nowrap text-[11px] text-app-muted">{locale === 'en' ? 'Motion' : locale === 'ru' ? 'Движение' : 'მოძრაობა'}</span>
                  <input type="range" min={1} max={10} step={1} value={videoMotionIntensity} onChange={(e) => setVideoMotionIntensity(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-app-accent" aria-label="motion intensity" />
                  <span className="w-9 text-right text-[10.5px] tabular-nums text-app-text">{videoMotionIntensity}/10</span>
                </label>
              </div>
            </Section>
            </>)}

            {/* PHASE 2 L1 — Product-Ad mode: product photo → commercial preset → i2v clip */}
            {videoTab === 'product' && (
              <div className="space-y-2.5">
                {/* Product photo upload */}
                <label className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-5 text-center transition ${productImage ? 'border-app-accent/50 bg-app-accent/10' : 'border-app-border/30 bg-app-bg/40 hover:border-app-accent/40'}`}>
                  {productImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={productImage} alt="product" loading="lazy" decoding="async" className="max-h-32 rounded-lg object-contain" />
                  ) : (
                    <>
                      <span className="text-2xl">📦</span>
                      <span className="text-[12px] font-medium text-app-text">{locale === 'en' ? 'Upload product photo' : locale === 'ru' ? 'Загрузите фото продукта' : 'ატვირთეთ პროდუქტის ფოტო'}</span>
                      <span className="text-[10.5px] text-app-muted">{locale === 'en' ? 'It becomes the locked foreground' : locale === 'ru' ? 'Станет фиксированным передним планом' : 'დარჩება ფიქსირებულ წინა პლანზე'}</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onProductPhoto(f); }} />
                </label>
                {/* Multi-shot — extra product photos. Each clip in a 30/60s ad anchors a
                    different angle (rotated), so the ad shows the product from several sides. */}
                {productImage && (
                  <div>
                    <span className="mb-1.5 block text-[11px] text-app-muted">
                      📸 {locale === 'en' ? `Shots ${1 + productImages.length}/6 — more angles (30/60s)` : locale === 'ru' ? `Кадры ${1 + productImages.length}/6 — больше ракурсов` : `კადრები ${1 + productImages.length}/6 — მეტი რაკურსი (30/60წმ)`}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={productImage} alt="shot 1" className="h-12 w-12 rounded-lg object-cover ring-1 ring-app-accent/40" />
                      {productImages.map((src, i) => (
                        <div key={i} className="relative h-12 w-12 overflow-hidden rounded-lg ring-1 ring-app-border/20">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`shot ${i + 2}`} className="h-full w-full object-cover" />
                          <button type="button" aria-label="remove shot" onClick={() => setProductImages((p) => p.filter((_, j) => j !== i))}
                            className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl-md bg-black/70 text-[9px] text-white">✕</button>
                        </div>
                      ))}
                      {productImages.length < 5 && (
                        <label className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg border border-dashed border-app-border/30 bg-app-bg/40 text-app-muted transition hover:border-app-accent/40 hover:text-app-accent">
                          <Plus size={16} />
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addProductShot(f); e.target.value = ''; }} />
                        </label>
                      )}
                    </div>
                  </div>
                )}
                {/* Output format — dedicated to the product ad (9:16 default). */}
                <div>
                  <span className="mb-1.5 block text-[11px] text-app-muted">📐 {locale === 'en' ? 'Format' : locale === 'ru' ? 'Формат' : 'ფორმატი'}</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([['9:16', 'h-4 w-2.5'], ['1:1', 'h-3.5 w-3.5'], ['16:9', 'h-3 w-5']] as const).map(([id, box]) => (
                      <button key={id} type="button" onClick={() => setProductAspect(id)}
                        className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-center transition ${productAspect === id ? 'border-app-accent/60 bg-app-accent/15 text-app-accent ring-1 ring-app-accent/30' : 'border-app-border/20 bg-app-bg/40 text-app-muted hover:border-app-border/40'}`}>
                        <span className="flex h-6 items-center justify-center"><span className={`rounded-sm border border-current ${box}`} /></span>
                        <span className="text-[11px] font-medium">{id}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Commercial presets */}
                <div>
                  <span className="mb-1.5 block text-[11px] text-app-muted">{locale === 'en' ? 'Commercial style' : locale === 'ru' ? 'Стиль рекламы' : 'რეკლამის სტილი'}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={productPreset === 'splash'} onClick={() => setProductPreset('splash')}>💧 {locale === 'en' ? 'Splash' : locale === 'ru' ? 'Всплеск' : 'შხეფა'}</Chip>
                    <Chip active={productPreset === 'epic'} onClick={() => setProductPreset('epic')}>🎬 {locale === 'en' ? 'Epic' : locale === 'ru' ? 'Эпик' : 'ეპიკური'}</Chip>
                    <Chip active={productPreset === 'luxury'} onClick={() => setProductPreset('luxury')}>✨ {locale === 'en' ? 'Luxury' : locale === 'ru' ? 'Люкс' : 'ლუქსი'}</Chip>
                    <Chip active={productPreset === 'nature'} onClick={() => setProductPreset('nature')}>🍃 {locale === 'en' ? 'Nature' : locale === 'ru' ? 'Природа' : 'ბუნება'}</Chip>
                  </div>
                </div>
                {/* Brand context → price/CTA overlay (burned) + auto Georgian voiceover.
                    All optional: leave blank for a clean cinematic clip; fill any field
                    and the ad gets a price chip, a CTA pill, a brand lower-third and a
                    short spoken voiceover (cloned KA voice), applied by /api/video/assemble. */}
                <Section
                  title={`🏷️ ${locale === 'en' ? 'Brand & voiceover' : locale === 'ru' ? 'Бренд и озвучка' : 'ბრენდი და გახმოვანება'}`}
                  badge={(productBrand.trim() || productHook.trim() || productPrice.trim() || productCtaCustom.trim())
                    ? '✓'
                    : (locale === 'en' ? 'optional' : locale === 'ru' ? 'опц.' : 'არჩ.')}
                >
                  <div className="space-y-2">
                  <input type="text" value={productBrand} onChange={(e) => setProductBrand(e.target.value)} maxLength={40}
                    placeholder={locale === 'en' ? 'Brand name' : locale === 'ru' ? 'Название бренда' : 'ბრენდის სახელი'}
                    className="w-full rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[13px] text-app-text outline-none focus:border-app-accent/60" />
                  <input type="text" value={productHook} onChange={(e) => setProductHook(e.target.value)} maxLength={AD_HOOK_MAX_CHARS}
                    placeholder={locale === 'en' ? 'Tagline / hook' : locale === 'ru' ? 'Слоган' : 'სლოგანი / მესიჯი'}
                    className="w-full rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[13px] text-app-text outline-none focus:border-app-accent/60" />
                  <input type="text" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} maxLength={20}
                    placeholder={locale === 'en' ? 'Price e.g. 99₾' : locale === 'ru' ? 'Цена напр. 99₾' : 'ფასი მაგ. 99₾'}
                    className="w-full rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[13px] text-app-text outline-none focus:border-app-accent/60" />
                  {/* CTA — preset pills + a custom override */}
                  <span className="block pt-0.5 text-[10.5px] text-app-muted">{locale === 'en' ? 'Call to action' : locale === 'ru' ? 'Призыв к действию' : 'მოწოდება'}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(['shop_now', 'order_now', 'book_now', 'learn_more', 'try_free', 'custom'] as ProductCtaOption[]).map((opt) => (
                      <Chip key={opt} active={productCta === opt} onClick={() => setProductCta(opt)}>
                        {opt === 'custom' ? (locale === 'en' ? '✏️ Custom' : locale === 'ru' ? '✏️ Свой' : '✏️ სხვა') : productCtaText(opt, '', locale)}
                      </Chip>
                    ))}
                  </div>
                  {productCta === 'custom' && (
                    <input type="text" value={productCtaCustom} onChange={(e) => setProductCtaCustom(e.target.value)} maxLength={24}
                      placeholder={locale === 'en' ? 'Custom button text' : locale === 'ru' ? 'Текст кнопки' : 'ღილაკის ტექსტი'}
                      className="w-full rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[13px] text-app-text outline-none focus:border-app-accent/60" />
                  )}
                  {/* Georgian voiceover toggle */}
                  <button type="button" onClick={() => setProductVoiceover((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-left transition active:scale-[0.99]">
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-app-text">
                      🎙️ {locale === 'en' ? 'Auto voiceover' : locale === 'ru' ? 'Авто-озвучка' : 'ავტო-გახმოვანება'}
                    </span>
                    {/* Inline-styled visual track (the row button handles the click). */}
                    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, width: 44, height: 24, borderRadius: 9999, backgroundColor: productVoiceover ? '#06b6d4' : '#475569', transition: 'background-color 200ms ease' }}>
                      <span style={{ position: 'absolute', top: 3, left: productVoiceover ? 23 : 3, width: 18, height: 18, borderRadius: 9999, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', transition: 'left 200ms ease', display: 'block' }} />
                    </span>
                  </button>
                  </div>
                </Section>
                {/* PHASE 4 — duration: 6s single clip · 30/60s multi-clip stitch */}
                <div>
                  <span className="mb-1.5 block text-[11px] text-app-muted">{locale === 'en' ? 'Duration' : locale === 'ru' ? 'Длительность' : 'ხანგრძლივობა'}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={productDuration === 6} onClick={() => setProductDuration(6)}>6{locale === 'en' ? 's' : 'წმ'}</Chip>
                    <Chip active={productDuration === 30} onClick={() => setProductDuration(30)}>30{locale === 'en' ? 's' : 'წმ'}</Chip>
                    <Chip active={productDuration === 60} onClick={() => setProductDuration(60)}>60{locale === 'en' ? 's' : 'წმ'}</Chip>
                  </div>
                </div>
                {/* Generate — always enabled once a product photo is set (no busy gate). Progress +
                    the finished ad land in the CHAT (a per-job bubble) + the tray, so several product
                    ads can render concurrently without clobbering one shared panel slot. */}
                <button type="button" disabled={!productImage} onClick={generateProductAd}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl p-3 text-[13px] font-semibold transition active:scale-[0.99] ${!productImage ? 'cursor-not-allowed bg-app-border/20 text-app-muted' : 'bg-app-accent text-white shadow-[0_2px_12px_rgba(0,0,0,0.18)]'}`}>
                  📦 {locale === 'en' ? 'Generate product ad' : locale === 'ru' ? 'Создать рекламу' : 'რეკლამის შექმნა'}
                </button>
                {/* Upload hint — the Generate button is gated on a product photo (the locked
                    foreground); say so instead of leaving the button silently disabled. */}
                {!productImage && (
                  <p className="text-center text-[11px] text-app-muted">
                    {locale === 'en' ? 'Please upload a product photo first' : locale === 'ru' ? 'Сначала загрузите фото продукта' : 'ჯერ ატვირთეთ პროდუქტის ფოტო'}
                  </p>
                )}
              </div>
            )}

            {/* TASK 1 — Character-Swap panel: source video + new-character photo → ~5s clip. */}
            {videoTab === 'videoswap' && (
              <div className="space-y-3">
                <p className="rounded-lg bg-app-elevated/40 px-3 py-2 text-[10.5px] leading-snug text-app-muted">
                  🔄 {locale === 'en'
                    ? 'Upload a video + a character photo → AI swaps the face in your video (motion preserved). If it can’t, it regenerates a short clip instead.'
                    : locale === 'ru'
                      ? 'Загрузите видео + фото персонажа → ИИ заменит лицо в вашем видео (движение сохраняется). Если не получится — создаст короткий клип.'
                      : 'ატვირთე ვიდეო + პერსონაჟის ფოტო → AI შეუცვლის სახეს შენს ვიდეოში (მოძრაობა შენარჩუნებულია). თუ ვერ — შექმნის მოკლე კლიპს.'}
                </p>

                {/* 1 — source video */}
                <div>
                  <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-app-muted">📹 {locale === 'en' ? 'Source video' : locale === 'ru' ? 'Исходное видео' : 'წყარო ვიდეო'}</span>
                  {!swapSourceVideo ? (
                    <div role="button" tabIndex={0}
                      onClick={() => { if (!swapSourceVideoBusy) swapVideoRef.current?.click(); }}
                      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !swapSourceVideoBusy) { e.preventDefault(); swapVideoRef.current?.click(); } }}
                      className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-app-border/30 bg-app-bg/40 p-4 text-center transition hover:border-orange-400/40 hover:bg-orange-500/[0.06] active:scale-[0.99]">
                      {swapSourceVideoBusy ? (
                        <><Loader2 size={18} className="animate-spin text-orange-400" /><span className="text-[11px] text-app-muted">{locale === 'en' ? 'Uploading…' : locale === 'ru' ? 'Загрузка…' : 'იტვირთება…'}</span></>
                      ) : (
                        <><span className="text-2xl">📹</span>
                        <span className="text-[12px] font-medium text-app-text">{locale === 'en' ? 'Drop a video or tap' : locale === 'ru' ? 'Перетащите видео' : 'ჩააგდე ვიდეო ან დააწკაპე'}</span>
                        <span className="text-[10px] text-app-muted">.mp4 .mov — {locale === 'en' ? 'max 100MB' : locale === 'ru' ? 'макс 100МБ' : 'მაქს 100MB'}</span></>
                      )}
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-xl border border-app-border/15 bg-app-bg/60">
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video src={swapSourceVideo.previewUrl || swapSourceVideo.url} muted playsInline preload="metadata" className="h-28 w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-1.5"><p className="truncate text-[10px] text-white">{swapSourceVideo.name}</p></div>
                      <button type="button" aria-label={locale === 'en' ? 'remove video' : locale === 'ru' ? 'удалить видео' : 'ვიდეოს მოცილება'} onClick={() => setSwapSourceVideo(null)}
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[11px] text-white hover:bg-black/80 touch-manipulation before:absolute before:-inset-2 before:content-['']">✕</button>
                    </div>
                  )}
                </div>

                {/* 2 — new character photo (reuses charFileRef + videoCharacterRef) */}
                <div>
                  <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-app-muted">👤 {locale === 'en' ? 'New character (photo)' : locale === 'ru' ? 'Новый персонаж (фото)' : 'ახალი პერსონაჟი (ფოტო)'}</span>
                  <div role="button" tabIndex={0} onClick={() => { charReplaceRef.current = true; charFileRef.current?.click(); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); charReplaceRef.current = true; charFileRef.current?.click(); } }}
                    className={`relative flex min-h-[80px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-3 text-center transition active:scale-[0.99] ${videoCharacterRef ? 'border-orange-400/50 bg-orange-500/[0.06]' : 'border-app-border/30 bg-app-elevated/40 hover:bg-app-elevated/70'}`}>
                    {videoCharacterRef ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={videoCharacterRef} alt="" loading="lazy" decoding="async" className="h-11 w-11 rounded-lg object-cover ring-1 ring-orange-400/40" />
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-400"><Check size={12} /> {locale === 'en' ? 'Character set' : locale === 'ru' ? 'Персонаж задан' : 'პერსონაჟი დაყენდა'}</span>
                        <button type="button" aria-label={locale === 'en' ? 'remove character' : locale === 'ru' ? 'удалить персонажа' : 'პერსონაჟის მოცილება'} onClick={(e) => { e.stopPropagation(); setVideoCharacterRefs([]); }}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/15 hover:text-app-text touch-manipulation before:absolute before:-inset-2.5 before:content-['']"><X size={11} /></button>
                      </>
                    ) : (
                      <><span className="flex h-9 w-9 items-center justify-center rounded-full bg-app-bg/60 text-orange-400"><ImageIcon size={16} /></span>
                      <span className="text-[12px] font-semibold text-app-text">{locale === 'en' ? 'Upload a face' : locale === 'ru' ? 'Загрузите лицо' : 'ატვირთე სახე'}</span></>
                    )}
                  </div>
                </div>

                {/* 3 — status */}
                {/* No source video yet — the button is gated on it, so say so up front
                    rather than leaving it silently disabled. */}
                {!swapSourceVideo && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                    <span>⚠️</span><span>{locale === 'en' ? 'Please upload a source video first.' : locale === 'ru' ? 'Сначала загрузите исходное видео.' : 'ჯერ ატვირთეთ საწყისი ვიდეო.'}</span>
                  </div>
                )}
                {swapSourceVideo && !videoCharacterRef && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                    <span>⚠️</span><span>{locale === 'en' ? 'A character photo is required to swap.' : locale === 'ru' ? 'Нужно фото персонажа для замены.' : 'პერსონაჟის შესაცვლელად საჭიროა ფოტო.'}</span>
                  </div>
                )}
                {swapSourceVideo && videoCharacterRef && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <span>✅</span><span>{locale === 'en' ? 'Ready — video + character set.' : locale === 'ru' ? 'Готово — видео + персонаж заданы.' : 'მზადაა! ვიდეო + პერსონაჟი დაყენებულია.'}</span>
                  </div>
                )}

                {/* 4 — generate. NO `busy` gate: a character swap runs PER-JOB through the Cap-3
                    queue (its own bubble by id), so it's always available + N swaps run concurrently
                    (independent of the legacy single-render `busy` used by chat/storyboard/lipsync). */}
                <button type="button" disabled={!swapSourceVideo || !videoCharacterRef} onClick={() => void runVideoSwap()}
                  className={`w-full rounded-xl p-3 text-[13px] font-semibold transition active:scale-[0.99] ${(!swapSourceVideo || !videoCharacterRef) ? 'cursor-not-allowed bg-app-border/20 text-app-muted' : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.18)]'}`}>
                  🔄 {locale === 'en' ? 'Swap character' : locale === 'ru' ? 'Заменить персонажа' : 'პერსონაჟის შეცვლა'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Music panel · 5 clean sections (A Style · B Duration+Tempo · C Prompt · D Generate · E Result) ── */}
        {mode === 'music' && (() => {
          const lastMusic = [...messages].reverse().find((m) => m.audioUrl);
          // A voice SAMPLE (recorded or uploaded) rides `attachments` as an audio entry — its
          // presence flips the panel into cover/clone territory and enables Generate with no prompt.
          const hasVoiceSample = attachments.some((a) => isAudio(a.mimeType));
          const tempos = [
            ['slow', locale === 'en' ? 'Slow' : locale === 'ru' ? 'Медленно' : 'ნელი'],
            ['medium', locale === 'en' ? 'Medium' : locale === 'ru' ? 'Средне' : 'საშუალო'],
            ['fast', locale === 'en' ? 'Fast' : locale === 'ru' ? 'Быстро' : 'სწრაფი'],
          ] as const;
          // PHASE 31 — apply a preset in one tap: write the full parameter set. The active pill is
          // DERIVED from live state (below), so there is no "clear on manual edit" bookkeeping —
          // editing any dial simply stops matching.
          const applyMusicPreset = (p: (typeof MUSIC_PRESETS)[number]) => {
            setMusicGenre(p.genre);
            setMusicTempo(p.tempo);
            setMusicDuration(p.duration);
            setMusicInstrumental(p.instrumental);
            setMusicVoiceType(p.voiceType);
          };
          // A chip is active when every core dial matches; instrumental presets exclude vocal from
          // the match (gender is hidden/moot for a bed), so their highlight stays stable.
          const activePresetId = MUSIC_PRESETS.find((p) =>
            p.genre === musicGenre && p.tempo === musicTempo && p.duration === musicDuration
            && p.instrumental === musicInstrumental && (p.instrumental || p.voiceType === musicVoiceType),
          )?.id ?? null;
          // Fine-tune accordion badge — a glanceable 3-part summary of the collapsed dials, e.g.
          // "30s · Medium · ♀" (song) or "Full · Slow · 🎹" (instrumental; gender is moot so the
          // vocal glyph becomes 🎹, keeping a stable shape). Locale-aware.
          const durBadge = musicDuration === 0
            ? (locale === 'en' ? 'Full' : locale === 'ru' ? 'Полная' : 'სრული')
            : `${musicDuration}${locale === 'en' ? 's' : locale === 'ru' ? 'с' : ' წმ'}`;
          const tempoBadge = tempos.find(([v]) => v === musicTempo)?.[1] ?? musicTempo;
          const vocalBadge = musicInstrumental ? '🎹' : musicVoiceType === 'male' ? '♂' : musicVoiceType === 'duet' ? '👫' : '♀';
          const fineTuneBadge = `${durBadge} · ${tempoBadge} · ${vocalBadge}`;
          return (
          <div className="mb-2 space-y-4">
            {/* ✨ Presets — one-tap vibe row (horizontal scroll). Sets every dial at once; the active
                pill is derived from the live parameter state. Above Style so most users tap a vibe
                and never need to open Fine-tune. */}
            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">✨ {locale === 'en' ? 'Presets' : locale === 'ru' ? 'Пресеты' : 'პრესეტები'}</span>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {MUSIC_PRESETS.map((p) => (
                  <Chip key={p.id} active={activePresetId === p.id} onClick={() => applyMusicPreset(p)}>{p.emoji} {p.label[locale] ?? p.label.en}</Chip>
                ))}
              </div>
            </div>

            {/* A — Style (single select, horizontal scroll) */}
            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">🎚 {locale === 'en' ? 'Style' : locale === 'ru' ? 'Стиль' : 'სტილი'}</span>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {MUSIC_STYLES.map(([val, label]) => (
                  <Chip key={val} active={musicGenre === val} onClick={() => setMusicGenre(val)}>{label[locale] ?? label.en}</Chip>
                ))}
              </div>
            </div>

            {/* Track type (instrumental vs song) — kept PRIMARY: it gates whether the Lyrics /
                Your-voice / Vocal subtrees render below, so hiding it would hide the cause of those
                sections appearing and disappearing. */}
            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">🎙 {locale === 'en' ? 'Track type' : locale === 'ru' ? 'Тип трека' : 'ტიპი'}</span>
              <div className="flex gap-1.5">
                <Chip active={musicInstrumental} onClick={() => setMusicInstrumental(true)}>🎵 {locale === 'en' ? 'Instrumental' : locale === 'ru' ? 'Инструментал' : 'ინსტრუმენტული'}</Chip>
                <Chip active={!musicInstrumental} onClick={() => setMusicInstrumental(false)}>🎤 {locale === 'en' ? 'Song' : locale === 'ru' ? 'Песня' : 'სიმღერა'}</Chip>
              </div>
            </div>

            {/* ⚙️ Fine-tune — the set-once dials (Duration · Tempo · Vocal) folded behind one collapsed
                Section so the default panel stays calm. Every preset already writes these, so most users
                never open it; the badge surfaces the live values. The Vocal sub-row renders only for a
                sung track (the same !instrumental gate as before). */}
            <Section title={<>⚙️ {locale === 'en' ? 'Fine-tune' : locale === 'ru' ? 'Настройка' : 'დახვეწა'}</>} badge={fineTuneBadge}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">⏱ {locale === 'en' ? 'Duration' : locale === 'ru' ? 'Длительность' : 'ხანგრძლივობა'}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {([30, 60, 90] as const).map((d) => <Chip key={d} active={musicDuration === d} onClick={() => setMusicDuration(d)}>{d}{locale === 'en' ? 's' : locale === 'ru' ? 'с' : ' წმ'}</Chip>)}
                      {/* FIX 2 — full song: duration 0 keeps Udio's full ~2-4 min output (no trim). */}
                      <Chip active={musicDuration === 0} onClick={() => setMusicDuration(0)}>🎵 {locale === 'en' ? 'Full song' : locale === 'ru' ? 'Полная' : 'სრული სიმღერა'}</Chip>
                    </div>
                  </div>
                  <div>
                    <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">🎵 {locale === 'en' ? 'Tempo' : locale === 'ru' ? 'Темп' : 'ტემპი'}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {tempos.map(([v, label]) => <Chip key={v} active={musicTempo === v} onClick={() => setMusicTempo(v)}>{label}</Chip>)}
                    </div>
                  </div>
                </div>
                {/* Vocal gender — only meaningful for a sung track */}
              {!musicInstrumental && (
                <div>
                  <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">🎤 {locale === 'en' ? 'Vocal' : locale === 'ru' ? 'Вокал' : 'ვოკალი'}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ['female', '👩', locale === 'en' ? 'Female' : locale === 'ru' ? 'Женский' : 'ქალის'],
                      ['male', '👨', locale === 'en' ? 'Male' : locale === 'ru' ? 'Мужской' : 'კაცის'],
                      ['duet', '👫', locale === 'en' ? 'Duet' : locale === 'ru' ? 'Дуэт' : 'დუეტი'],
                    ] as const).map(([id, emoji, label]) => (
                      <Chip key={id} active={musicVoiceType === id} onClick={() => setMusicVoiceType(id)}>{emoji} {label}</Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </Section>

            {/* B3 — Lyrics (song only): type your own words OR one-tap ✨ AI writer.
                Empty = the model auto-writes lyrics from the prompt. Threaded to /api/ai/music
                as `lyrics` via send()→runMusicJob (vocal / cover / clone / trained paths). */}
            {!musicInstrumental && (
              <div>
                <span className="mb-1.5 flex items-center justify-between gap-2 text-[12.5px] font-semibold text-app-text">
                  <span>📝 {locale === 'en' ? 'Lyrics' : locale === 'ru' ? 'Текст' : 'ლირიკა'} <span className="font-normal text-app-muted/60">({locale === 'en' ? 'optional' : locale === 'ru' ? 'необязательно' : 'არჩევითი'})</span></span>
                  <button type="button" onClick={() => void writeLyrics()} disabled={writingLyrics}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-app-accent/40 px-2.5 py-1 text-[11px] font-semibold text-app-accent transition-colors hover:bg-app-accent/10 disabled:opacity-50">
                    {writingLyrics ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {t.writeLyricsBtn}
                  </button>
                </span>
                <textarea
                  value={musicLyrics}
                  onChange={(e) => setMusicLyrics(e.target.value.slice(0, 1200))}
                  maxLength={1200}
                  rows={3}
                  placeholder={t.lyricsPlaceholder}
                  className="w-full resize-none rounded-xl border border-app-border/15 bg-app-bg/40 px-3 py-2.5 text-[13px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted/45 focus:border-app-accent/60 focus:bg-app-bg/70 focus:ring-2 focus:ring-app-accent/25"
                />
              </div>
            )}

            {/* B4 — Your voice (song only): record or upload a ≥15s sample → the song is sung
                in YOUR cloned voice (music-01). A sample can instead be used as a COVER source
                (remix its melody) via the cover/voice switch. With a completed TRAINED RVC model,
                a toggle sings in your faithful trained voice (overrides the one-shot clone). The
                attached sample renders as a removable chip in the composer tray above. */}
            {!musicInstrumental && (
              <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="block text-[12.5px] font-semibold text-app-text">{t.voiceSecTitle}</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Record (toggle) — live seconds while capturing; ≥15s hint until enough. */}
                  {voiceRecording ? (
                    <button type="button" onClick={stopVoiceRecording}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-400/50 bg-red-500/10 px-3 py-1.5 text-[12px] font-semibold text-red-300 transition-colors hover:bg-red-500/20">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
                      {voiceRecSec}{locale === 'en' ? 's' : locale === 'ru' ? 'с' : ' წმ'} · {locale === 'en' ? 'Stop' : locale === 'ru' ? 'Стоп' : 'გაჩერება'}{voiceRecSec < 15 ? ` (${t.need15})` : ''}
                    </button>
                  ) : (
                    <button type="button" onClick={() => void startVoiceRecording()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-app-border/25 px-3 py-1.5 text-[12px] font-medium text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
                      <Mic size={13} /> {t.voiceRec}
                    </button>
                  )}
                  {/* Upload a voice file (mp3/wav/m4a, ≤50MB). */}
                  <button type="button" onClick={() => voiceFileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-app-border/25 px-3 py-1.5 text-[12px] font-medium text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
                    <Upload size={13} /> {t.voiceUp}
                  </button>
                  {/* Trained RVC toggle — ONLY when a completed trained model exists (probed on mount). */}
                  {hasTrainedVoice && (
                    <Chip active={useMyVoice} onClick={() => setUseMyVoice((v) => !v)}>🎙 {t.voiceMode}</Chip>
                  )}
                </div>
                {/* With a sample attached (and NOT overridden by the trained toggle): pick how it's used. */}
                {hasVoiceSample && !(useMyVoice && hasTrainedVoice) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip active={musicAudioMode === 'voice'} onClick={() => setMusicAudioMode('voice')}>{t.voiceMode}</Chip>
                    <Chip active={musicAudioMode === 'cover'} onClick={() => setMusicAudioMode('cover')}>{t.coverMode}</Chip>
                  </div>
                )}
                <span className="block text-[11px] leading-relaxed text-app-muted/70">
                  {(useMyVoice && hasTrainedVoice) || hasVoiceSample ? t.voiceReady : t.voiceRecHint}
                </span>
              </div>
            )}

            {/* C — Prompt (max 300 chars, live counter bottom-right) */}
            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">✍️ {locale === 'en' ? 'Prompt' : locale === 'ru' ? 'Описание' : 'აღწერა'}</span>
              <div className="relative">
                <textarea
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value.slice(0, 300))}
                  maxLength={300}
                  rows={3}
                  placeholder={t.musicPlaceholder}
                  className="w-full resize-none rounded-xl border border-app-border/15 bg-app-bg/40 px-3 py-2.5 pb-6 text-[13px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted/45 focus:border-app-accent/60 focus:bg-app-bg/70 focus:ring-2 focus:ring-app-accent/25"
                />
                <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-app-muted/60">{musicPrompt.length}/300</span>
              </div>
            </div>

            {/* D — Generate (full width). Label reflects the active path: trained voice →
                one-shot clone → cover → instrumental/vocal-gender. A voice sample or trained
                toggle lets it fire with NO typed prompt (the lyrics/genre become the brief). */}
            {(() => {
              const trainedActive = useMyVoice && hasTrainedVoice && !musicInstrumental;
              const genLabel = trainedActive
                ? `🎙 ${t.voiceMode}`
                : hasVoiceSample && musicAudioMode === 'voice'
                  ? `🎤 ${t.voiceMode}`
                  : hasVoiceSample && musicAudioMode === 'cover'
                    ? t.coverMode
                    : musicInstrumental
                      ? `🎵 ${locale === 'en' ? 'Generate Music' : locale === 'ru' ? 'Создать музыку' : 'მუსიკის გენერაცია'}`
                      : musicVoiceType === 'duet'
                        ? `🎤 ${locale === 'en' ? 'Duet' : locale === 'ru' ? 'Дуэт' : 'დუეტი'}`
                        : musicVoiceType === 'male'
                          ? `🎤 ${locale === 'en' ? 'Male Song' : locale === 'ru' ? 'Мужская песня' : 'კაცის სიმღერა'}`
                          : `🎤 ${locale === 'en' ? 'Female Song' : locale === 'ru' ? 'Женская песня' : 'ქალის სიმღერა'}`;
              return (
                <button type="button" onClick={() => void send({ promptOverride: musicPrompt })} disabled={busy || (!musicPrompt.trim() && !hasVoiceSample && !trainedActive)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent px-4 py-3 text-[14px] font-bold text-app-bg shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <>{genLabel}</>}
                </button>
              );
            })()}

            {/* E — Result (hidden until a track exists): audio player + download/share */}
            {lastMusic?.audioUrl && (
              <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-elevated/40 p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                <span className="block text-[12.5px] font-semibold text-app-text">🎧 {locale === 'en' ? 'Result' : locale === 'ru' ? 'Результат' : 'შედეგი'}</span>
                {/* Polished Suno-style player (album art + scrub/time + provenance badge). */}
                <TrackPlayer url={lastMusic.audioUrl} coverUrl={lastMusic.coverUrl} label={t.modeMusic} engine={lastMusic.engine} />
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => void dl(lastMusic.audioUrl!, 'myavatar-track.mp3')} title={t.imgDownload} aria-label={t.imgDownload}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-border/20 text-app-muted transition hover:bg-app-elevated hover:text-app-accent active:scale-90 sm:h-9 sm:w-9">
                    <Download size={16} />
                  </button>
                  <button type="button" onClick={() => void share(lastMusic.audioUrl!, 'myavatar-track.mp3')} title={t.share} aria-label={t.share}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-border/20 text-app-muted transition hover:bg-app-elevated hover:text-app-accent active:scale-90 sm:h-9 sm:w-9">
                    <Share2 size={16} />
                  </button>
                  {saveLibButton(lastMusic.audioUrl, 'music')}
                  {/* Cross-service bridge — turn this track into a music video. The 🎤 IS the icon. */}
                  <button type="button" onClick={() => sendMusicToMusicVideo(lastMusic.audioUrl!, 0, 'Generated Track')}
                    title={locale === 'en' ? 'Music video' : locale === 'ru' ? 'Клип' : 'მუსიკალური კლიპი'} aria-label={locale === 'en' ? 'Music video' : locale === 'ru' ? 'Клип' : 'მუსიკალური კლიპი'}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-border/20 text-[16px] leading-none transition hover:bg-app-elevated active:scale-90 sm:h-9 sm:w-9">
                    🎤
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* ── Video Remix panel · upload a video + one edit op (restyle · character · captions · voiceover · music · redub · trim) ── */}
        {mode === 'remix' && (
          <div className="mb-2 space-y-4">
            {/* 1 — Source video */}
            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">🎬 {locale === 'en' ? 'Source video' : locale === 'ru' ? 'Исходное видео' : 'საწყისი ვიდეო'}</span>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-app-border/30 bg-app-bg/40 px-4 py-5 text-[12.5px] font-medium text-app-muted transition-colors hover:border-app-accent/50 hover:text-app-text">
                <input type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickRemixMedia(f, 'video'); e.currentTarget.value = ''; }} />
                {remixVideoBusy ? <><Loader2 size={15} className="animate-spin" /> {t.remixRunning}</> : remixVideo ? <><Check size={15} className="text-app-accent" /> <span className="max-w-[200px] truncate">{remixVideo.name}</span></> : <><Upload size={15} /> {t.remixUploadHint}</>}
              </label>
            </div>

            {/* 2 — Edit operation */}
            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">🛠 {locale === 'en' ? 'Edit' : locale === 'ru' ? 'Редактирование' : 'რედაქტირება'}</span>
              <div className="flex flex-wrap gap-1.5">
                {([['restyle', '🎨'], ['character', '🧑‍🎤'], ['captions', '💬'], ['voiceover', '🎙'], ['music', '🎵'], ['redub', '👄'], ['trim', '✂️']] as const).map(([id, emoji]) => (
                  <Chip key={id} active={remixOp === id} onClick={() => setRemixOp(id)}>{emoji} {REMIX_OP_LABELS[id][locale] ?? REMIX_OP_LABELS[id].en}</Chip>
                ))}
              </div>
            </div>

            {/* 3 — Per-op parameters */}
            {(remixOp === 'restyle' || remixOp === 'character' || remixOp === 'captions' || remixOp === 'voiceover' || remixOp === 'redub') && (
              <textarea value={remixText} onChange={(e) => setRemixText(e.target.value.slice(0, 600))} rows={2}
                placeholder={
                  remixOp === 'restyle' ? (locale === 'en' ? 'New look (e.g. cinematic, anime, vintage)…' : locale === 'ru' ? 'Новый стиль (кино, аниме, винтаж)…' : 'ახალი სტილი (კინო, ანიმე, ვინტაჟი)…')
                    : remixOp === 'character' ? (locale === 'en' ? 'Describe the character to swap in / insert…' : locale === 'ru' ? 'Опишите нового персонажа…' : 'აღწერე ახალი პერსონაჟი…')
                      : remixOp === 'captions' ? (locale === 'en' ? 'Caption text to burn on the video…' : locale === 'ru' ? 'Текст субтитров…' : 'სუბტიტრის ტექსტი…')
                        : remixOp === 'voiceover' ? (locale === 'en' ? 'Narration to speak over the video…' : locale === 'ru' ? 'Текст озвучки…' : 'ნარაციის ტექსტი…')
                          : (locale === 'en' ? 'New dialogue to lip-sync…' : locale === 'ru' ? 'Новый текст для синхрона…' : 'ახალი დიალოგი ლიპ-სინქისთვის…')
                }
                className="w-full resize-none rounded-xl border border-app-border/15 bg-app-bg/40 px-3 py-2.5 text-[13px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted/45 focus:border-app-accent/60 focus:bg-app-bg/70 focus:ring-2 focus:ring-app-accent/25" />
            )}

            {(remixOp === 'voiceover' || remixOp === 'redub') && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-app-muted">{locale === 'en' ? 'Voice:' : locale === 'ru' ? 'Голос:' : 'ხმა:'}</span>
                <Chip active={remixGender === 'female'} onClick={() => setRemixGender('female')}>👩 {locale === 'en' ? 'Female' : locale === 'ru' ? 'Жен.' : 'ქალი'}</Chip>
                <Chip active={remixGender === 'male'} onClick={() => setRemixGender('male')}>👨 {locale === 'en' ? 'Male' : locale === 'ru' ? 'Муж.' : 'კაცი'}</Chip>
              </div>
            )}

            {(remixOp === 'restyle' || remixOp === 'character') && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-app-muted">{locale === 'en' ? 'Aspect:' : locale === 'ru' ? 'Формат:' : 'ფორმატი:'}</span>
                {(['9:16', '16:9', '1:1'] as const).map((a) => <Chip key={a} active={remixAspect === a} onClick={() => setRemixAspect(a)}>{a}</Chip>)}
              </div>
            )}

            {(remixOp === 'music' || remixOp === 'redub') && (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-app-border/30 bg-app-bg/40 px-4 py-3 text-[12px] font-medium text-app-muted transition-colors hover:border-app-accent/50 hover:text-app-text">
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickRemixMedia(f, 'track'); e.currentTarget.value = ''; }} />
                {remixTrack ? <><Check size={14} className="text-app-accent" /> <span className="max-w-[180px] truncate">{remixTrack.name}</span></> : <><Music2 size={14} /> {remixOp === 'music' ? (locale === 'en' ? 'Add a music track' : locale === 'ru' ? 'Добавить трек' : 'დაამატე ტრეკი') : (locale === 'en' ? 'Or upload audio (optional)' : locale === 'ru' ? 'Или загрузите аудио (опц.)' : 'ან ატვირთე აუდიო (არჩევითი)')}</>}
              </label>
            )}

            {remixOp === 'trim' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[12px] text-app-muted">{locale === 'en' ? 'Start (s)' : locale === 'ru' ? 'Старт (с)' : 'დასაწყისი (წმ)'}
                  <input type="number" min={0} value={remixTrimStart} onChange={(e) => setRemixTrimStart(Math.max(0, Number(e.target.value) || 0))} className="mt-1 w-full rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[13px] text-app-text outline-none focus:border-app-accent/60" />
                </label>
                <label className="block text-[12px] text-app-muted">{locale === 'en' ? 'Length (s)' : locale === 'ru' ? 'Длина (с)' : 'ხანგრძლივობა (წმ)'}
                  <input type="number" min={1} value={remixTrimDur} onChange={(e) => setRemixTrimDur(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-full rounded-lg border border-app-border/15 bg-app-bg/40 px-2.5 py-2 text-[13px] text-app-text outline-none focus:border-app-accent/60" />
                </label>
              </div>
            )}

            {/* 4 — Run */}
            {(() => {
              const needsText = (['captions', 'voiceover', 'restyle', 'character'] as string[]).includes(remixOp) || (remixOp === 'redub' && !remixTrack);
              const needsTrack = remixOp === 'music' && !remixTrack;
              const disabled = remixBusy || busy || !remixVideo || (needsText && !remixText.trim()) || needsTrack;
              return (
                <button type="button" onClick={() => void runRemix()} disabled={disabled}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent px-4 py-3 text-[14px] font-bold text-app-bg shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all hover:opacity-90 disabled:opacity-50">
                  {remixBusy ? <><Loader2 size={16} className="animate-spin" /> {t.remixRunning}</> : <>✨ {REMIX_OP_LABELS[remixOp][locale] ?? REMIX_OP_LABELS[remixOp].en}</>}
                </button>
              );
            })()}
          </div>
        )}

        </div>{/* /collapsible options */}

        {/* Video Remix Mode — a video attached in chat = "edit this video". Show the
            indicator + quick-action chips that pre-fill the right request. */}
        {mode === 'chat' && attachments.some((a) => isVideo(a.mimeType)) && (
          <div className="mb-2 space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-app-accent/15 px-3 py-1 text-[11.5px] font-semibold text-app-accent ring-1 ring-app-accent/25">
              🎬 {locale === 'en' ? 'Video Remix Mode' : locale === 'ru' ? 'Режим ремикса видео' : 'ვიდეო რემიქსის რეჟიმი'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['📝', locale === 'en' ? 'Subtitles' : locale === 'ru' ? 'Субтитры' : 'სუბტიტრები', locale === 'en' ? 'add subtitles' : locale === 'ru' ? 'добавь субтитры' : 'სუბტიტრები დაამატე'],
                ['🎨', locale === 'en' ? 'Color' : locale === 'ru' ? 'Цвет' : 'ფერი', locale === 'en' ? 'cinematic color grade' : locale === 'ru' ? 'кинематографичный цвет' : 'ფერი შეცვალე — კინემატოგრაფიული'],
                ['🎵', locale === 'en' ? 'Music' : locale === 'ru' ? 'Музыка' : 'მუსიკა', locale === 'en' ? 'add background music' : locale === 'ru' ? 'добавь музыку' : 'მუსიკა ჩაამატე'],
                ['✏️', locale === 'en' ? 'Text' : locale === 'ru' ? 'Текст' : 'ტექსტი', locale === 'en' ? 'add a text overlay' : locale === 'ru' ? 'добавь текст' : 'ტექსტი დაამატე'],
                ['✂️', locale === 'en' ? 'Trim' : locale === 'ru' ? 'Обрезка' : 'მოჭრა', locale === 'en' ? 'trim the first 10 seconds' : locale === 'ru' ? 'обрежь первые 10 секунд' : 'მოჭერი პირველი 10 წამი'],
                ['⚡', locale === 'en' ? 'Speed' : locale === 'ru' ? 'Скорость' : 'სიჩქარე', locale === 'en' ? 'speed it up 2x' : locale === 'ru' ? 'ускорь в 2 раза' : 'სიჩქარე გაზარდე 2x'],
              ] as const).map(([emoji, label, fill]) => (
                <button key={label} type="button" onClick={() => { setInput(fill); taRef.current?.focus(); }}
                  className="inline-flex items-center gap-1 rounded-full border border-app-border/20 bg-app-bg/40 px-2.5 py-1 text-[12px] font-medium text-app-text transition-colors hover:border-app-accent/50 hover:text-app-accent">
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attachment previews — up to MAX_ATTACHMENTS files / images / a video,
            each removable. They ride with the next message (text + files together). */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a, ai) => (
              <div key={ai} className="relative">
                {isImage(a.mimeType) ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.dataUrl} alt="" loading="lazy" decoding="async" className="h-14 w-14 rounded-xl object-cover" />
                    {/* Scanline processing sweep — plays once as the thumbnail mounts (i.e. on upload). */}
                    <span aria-hidden="true" className="mya-scanline pointer-events-none absolute inset-0" />
                  </>
                ) : isVideo(a.mimeType) ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={a.dataUrl} className="h-14 w-14 rounded-xl object-cover" muted playsInline preload="metadata" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-app-surface text-app-accent">
                    {isAudio(a.mimeType) ? <Music2 size={18} /> : <FileText size={18} />}
                  </span>
                )}
                <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, k) => k !== ai))} aria-label="remove"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/15 hover:text-app-text touch-manipulation before:absolute before:-inset-2.5 before:content-['']"><X size={11} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Input surface — one clean rounded pill. The picker accepts MULTIPLE files
            (images / video / audio / pdf), capped at MAX_ATTACHMENTS. */}
        <input ref={fileRef} type="file" multiple accept="image/*,audio/*,video/*,application/pdf,.txt,.md,.pdf,.docx,.doc,.rtf" className="hidden" onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          files.forEach((f) => {
            // In VIDEO mode a document attached via the "+" IS the film script → load it into
            // the dedicated Script slot (with feedback) instead of a silent generic attachment.
            if (mode === 'video' && isScriptFile(f)) { void loadScriptFile(f); return; }
            const r = new FileReader();
            r.onload = () => setAttachments((prev) => prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { dataUrl: String(r.result), mimeType: f.type || 'application/octet-stream' }]);
            r.readAsDataURL(f);
          });
          e.target.value = '';
        }} />
        {/* v330 — dedicated Character Reference picker (single image, downscaled + locked). */}
        <input ref={charFileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const dataUrl = await fileToDataUrl(f);
            const url = await downscaleDataUrl(dataUrl);
            setVideoCharacterRefs((prev) => {
              if (charReplaceRef.current) { charReplaceRef.current = false; return [url]; } // videoswap: single
              return prev.length >= sceneFrameCount ? prev : [...prev, url]; // film: one frame per scene
            });
          } catch { /* ignore unreadable file */ }
        }} />
        {/* Dedicated SCRIPT ingest for the video service — the Director reads this verbatim. */}
        {/* accept = extensions only (iOS maps these to UTIs reliably; the long docx MIME
            could make the Files picker offer nothing). */}
        <input ref={scriptFileRef} type="file" accept=".txt,.md,.pdf,.docx,.doc,.rtf" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void loadScriptFile(f);
        }} />
        {/* v330 — dedicated Audio Track ingest (single beat/song → uploadBigFile → master bed). */}
        <input ref={audioFileRef} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,.mp3,.wav,.m4a" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          // Phase 6 polish — validate BEFORE the upload so we never burn a round-trip on a
          // file the pipeline can't use. Format (mp3/wav/m4a/aac) + ≤50MB. Clear toast on a miss.
          const okType = /audio\/(mpeg|mp3|wav|x-wav|mp4|x-m4a|aac)/i.test(f.type) || /\.(mp3|wav|m4a|aac)$/i.test(f.name);
          if (!okType) {
            setShareToast(locale === 'en' ? 'Use an MP3, WAV or M4A file' : locale === 'ru' ? 'Нужен MP3, WAV или M4A' : 'საჭიროა MP3, WAV ან M4A ფაილი');
            setTimeout(() => setShareToast((s) => (/MP3|M4A/i.test(s ?? '') ? null : s)), 2600);
            return;
          }
          if (f.size > 50 * 1024 * 1024) {
            setShareToast(locale === 'en' ? 'Audio is too large (max 50MB)' : locale === 'ru' ? 'Файл слишком большой (макс 50МБ)' : 'ფაილი ძალიან დიდია (მაქს 50MB)');
            setTimeout(() => setShareToast((s) => (/50/i.test(s ?? '') ? null : s)), 2600);
            return;
          }
          setVideoSoundtrackBusy(true);
          try {
            // Decode metadata locally (duration + waveform) in parallel with the upload.
            const [meta, dataUrl] = await Promise.all([decodeAudioMeta(f), fileToDataUrl(f)]);
            const url = await uploadBigFile(dataUrl, f.type || 'audio/mpeg');
            if (url) {
              // Local blob URL for in-panel preview (the stored `url` is a storage PATH, not playable).
              let previewUrl: string | undefined;
              try { previewUrl = URL.createObjectURL(f); } catch { /* noop */ }
              setVideoSoundtrack({ name: f.name, url, ...(meta ? { durationSec: meta.durationSec, peaks: meta.peaks } : {}), ...(previewUrl ? { previewUrl } : {}) });
              setVideoMode('musicvideo'); // an uploaded soundtrack implies music-video intent
            }
          } catch { /* ignore */ } finally {
            setVideoSoundtrackBusy(false);
          }
        }} />
        {/* Music VOICE sample (record's sibling) — an uploaded ≥15s clip of the user's voice.
            Validated (mp3/wav/m4a/aac, ≤50MB) BEFORE reading, then handed to addVoiceMedia →
            rides `attachments` as the music voice reference (cover/clone). */}
        <input ref={voiceFileRef} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,.mp3,.wav,.m4a" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const okType = isAudio(f.type) || /\.(mp3|wav|m4a|aac)$/i.test(f.name);
          if (!okType) {
            setShareToast(locale === 'en' ? 'Use an MP3, WAV or M4A file' : locale === 'ru' ? 'Нужен MP3, WAV или M4A' : 'საჭიროა MP3, WAV ან M4A ფაილი');
            setTimeout(() => setShareToast((s) => (/MP3|M4A/i.test(s ?? '') ? null : s)), 2600);
            return;
          }
          if (f.size > 50 * 1024 * 1024) {
            setShareToast(locale === 'en' ? 'Audio is too large (max 50MB)' : locale === 'ru' ? 'Файл слишком большой (макс 50МБ)' : 'ფაილი ძალიან დიდია (მაქს 50MB)');
            setTimeout(() => setShareToast((s) => (/50/i.test(s ?? '') ? null : s)), 2600);
            return;
          }
          try { addVoiceMedia(await fileToDataUrl(f), f.type || 'audio/mpeg'); } catch { /* ignore unreadable file */ }
        }} />
        {/* TASK 1 — Character-Swap source video: ≤100MB mp4/mov → Supabase; keeps a local
            blob for the panel preview. */}
        <input ref={swapVideoRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const okType = /video\/(mp4|quicktime)/i.test(f.type) || /\.(mp4|mov)$/i.test(f.name);
          if (!okType) {
            setShareToast(locale === 'en' ? 'Use an MP4 or MOV file' : locale === 'ru' ? 'Нужен MP4 или MOV' : 'საჭიროა MP4 ან MOV ფაილი');
            setTimeout(() => setShareToast((s) => (/MP4|MOV/i.test(s ?? '') ? null : s)), 2600);
            return;
          }
          if (f.size > 100 * 1024 * 1024) {
            setShareToast(locale === 'en' ? 'Video is too large (max 100MB)' : locale === 'ru' ? 'Видео слишком большое (макс 100МБ)' : 'ვიდეო ძალიან დიდია (მაქს 100MB)');
            setTimeout(() => setShareToast((s) => (/100/i.test(s ?? '') ? null : s)), 2600);
            return;
          }
          setSwapSourceVideoBusy(true);
          try {
            const dataUrl = await fileToDataUrl(f);
            const url = await uploadBigFile(dataUrl, f.type || 'video/mp4');
            if (url) {
              let previewUrl: string | undefined;
              try { previewUrl = URL.createObjectURL(f); } catch { /* noop */ }
              setSwapSourceVideo({ name: f.name, url, ...(previewUrl ? { previewUrl } : {}) });
            }
          } catch { /* ignore */ } finally {
            setSwapSourceVideoBusy(false);
          }
        }} />
        {/* v330 — Avatar/lip-sync face: scoped single-image picker → replaces any prior
            face image in the attachment tray (the talking-photo flow reads attachments). */}
        <input ref={lipsyncFaceRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const small = await downscaleDataUrl(await fileToDataUrl(f));
            setLipPreset(null); // an uploaded face supersedes a chosen preset
            setAttachments((prev) => [
              ...prev.filter((a) => !isImage(a.mimeType) && !isVideo(a.mimeType)),
              { dataUrl: small, mimeType: f.type || 'image/jpeg' },
            ]);
          } catch { /* ignore unreadable file */ }
        }} />
        {/* Camera capture — shoot a photo in-app; it joins the attachment tray and, in
            Video mode, seeds the storyboard as the start image. `capture="environment"`
            opens the REAR camera on mobile and falls back to the file picker on desktop. */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const small = await downscaleDataUrl(await fileToDataUrl(f));
            setAttachments((prev) => prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { dataUrl: small, mimeType: f.type || 'image/jpeg' }]);
          } catch { /* ignore unreadable capture */ }
        }} />
        {/* One clean rounded pill — min-height 52px, padding 12px 16px; the prompt sits on
            its own line so a long brief is never squeezed, and ALL controls live inside. */}
        <div className="rounded-[24px] border border-app-border/15 bg-app-elevated px-4 py-3 min-h-[52px] shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-colors focus-within:border-app-accent/40">
          {/* Full-width prompt on its own line — a long prompt is never squeezed into a
              narrow column by the controls (the old single-row pill did exactly that). */}
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            onFocus={() => setTimeout(() => taRef.current?.scrollIntoView({ block: 'nearest' }), 120)}
            rows={1}
            disabled={enhancing}
            placeholder={recording ? t.recording : mode === 'image' ? t.imgPlaceholder : mode === 'music' ? t.musicPlaceholder : mode === 'video' ? t.videoPlaceholder : mode === 'lipsync' ? t.lipsyncPlaceholder : mode === 'remix' ? t.remixUploadHint : t.placeholder}
            className="max-h-40 min-h-[28px] w-full resize-none border-0 bg-transparent px-1 py-1.5 text-[16px] text-app-text placeholder:text-app-muted/70 outline-none focus:ring-0 disabled:opacity-60"
          />

          {/* Controls row — a single clean line on every viewport: [+][📷] locked FAR-LEFT, a
              flex-1 spacer, then the mode chip + mic + live-voice + send clustered FAR-RIGHT. To fit
              375px without wrapping, mobile trims width (the mode chip is icon-only + the desktop-only
              Wand is hidden) — see below. NO wrap, so Send never drops to a broken second row. */}
          <div className="mt-1 flex items-center gap-1">
            {/* [+] add / attach */}
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={t.attachHint} title={t.attachHint}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-text">
              <Plus size={20} />
            </button>
            {/* [📷] camera — image/camera capture specifically (rear camera on mobile);
                the selected photo previews in the attachment tray above and rides the next
                generation (core to image-to-video). Sits right of [+], left of the spacer. */}
            <button type="button" onClick={() => cameraRef.current?.click()}
              aria-label={locale === 'en' ? 'Take a photo' : locale === 'ru' ? 'Сделать фото' : 'გადაიღე ფოტო'}
              title={locale === 'en' ? 'Take a photo' : locale === 'ru' ? 'Сделать фото' : 'გადაიღე ფოტო'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-text">
              <Camera size={19} />
            </button>

            {/* Spacer — pushes the mode selector + mic/live/send to the FAR-RIGHT on EVERY viewport
                so [+]/📷 stay far-left (the asymmetric split the design calls for). */}
            <div className="flex-1" />

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
                {/* Icon-only on mobile (the label would blow the single-row budget); label returns at sm+. */}
                <span className="hidden sm:inline">{t[activeModeKey]}</span>
                <ChevronDown size={13} className={`transition-transform ${modeMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {modeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setModeMenuOpen(false)} />
                  <div role="menu" className="absolute bottom-full right-0 z-20 mb-2 w-48 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-app-border/10 bg-app-surface p-1 shadow-2xl">
                    {MODES.map(({ id, Icon, key: lk }) => (
                      <button
                        key={id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={mode === id}
                        onClick={() => { if (id === mode) { setMode('chat'); setOptionsOpen(false); } else { setMode(id); } setModeMenuOpen(false); }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors ${mode === id ? 'bg-app-accent/10 text-app-accent' : 'text-app-text hover:bg-app-elevated'}`}
                      >
                        <Icon size={15} /> <span className="flex-1 text-left">{t[lk]}</span> {mode === id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Right action: Stop while busy · Wand+Send when there's something to send ·
                Mic otherwise (record voice). Mirrors Gemini's mic↔send swap. */}
            {busy ? (
              <button type="button" onClick={stop} aria-label={t.stop} title={t.stop}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-surface text-app-text transition-colors hover:text-app-accent">
                <Square size={15} className="fill-current" />
              </button>
            ) : recording ? (
              // While dictating, a STOP that never disappears — even as live text
              // arrives — so recording is always controllable.
              <button type="button" onClick={() => void toggleMic()} aria-label={t.stop} title={t.stop}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full animate-pulse bg-app-danger/15 text-app-danger">
                <Square size={16} />
              </button>
            ) : (
              <>
                {/* Mic stays available even with text in the box — tap again to keep
                    dictating / continue where you left off. (Dictation → fills the text box.) */}
                <button type="button" onClick={() => void toggleMic()} aria-label={t.micHint} title={t.micHint}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-muted transition-all duration-300 ease-out hover:scale-105 hover:bg-app-surface hover:text-app-text active:scale-95">
                  <Mic size={19} />
                </button>
                {/* LIVE VOICE — Gemini-style full-duplex voice-dialogue chip, immediately right of the
                    dictation mic. Launches the real-time VoiceConversation overlay (owned by the parent
                    ChatChrome) via the window CustomEvent bridge. The animated equalizer (a living
                    waveform, staggered scale-Y bars) over a soft accent aura is the premium real-time
                    voice call-to-action. Reduced-motion falls the bars back to static (see .voice-eq). */}
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('myavatar:voice-open'))}
                  aria-label={locale === 'en' ? 'Live voice' : locale === 'ru' ? 'Живой голос' : 'ცოცხალი ხმა'}
                  title={locale === 'en' ? 'Live voice' : locale === 'ru' ? 'Живой голос' : 'ცოცხალი ხმა'}
                  className="group relative ml-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-accent transition-all duration-300 ease-out hover:scale-105 hover:bg-app-accent/10 active:scale-95">
                  {/* Soft, steady accent aura (the motion comes from the equalizer, not a strobing halo). */}
                  <span aria-hidden="true" className="pointer-events-none absolute inset-[7px] rounded-full bg-app-accent/20 blur-md" />
                  <span className="voice-eq relative" aria-hidden="true"><span /><span /><span /><span /></span>
                </button>
                {input.trim() && (
                  // Prompt-enhance is a desktop-only power tool — hidden on mobile so the single-row
                  // composer keeps [mic][live][send] clean and Send never wraps. (magicEnhance stays wired.)
                  <button type="button" onClick={() => void magicEnhance()} disabled={enhancing} aria-label={t.magicHint} title={t.magicHint}
                    className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-accent disabled:opacity-40 sm:flex">
                    {enhancing ? <Loader2 size={18} className="animate-spin text-app-accent" /> : <Wand2 size={18} />}
                  </button>
                )}
                {canSend && (
                  <button type="button" onClick={() => void send()} aria-label="send"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg transition-all duration-300 ease-out hover:scale-105 hover:opacity-95 active:scale-95">
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
      {/* Credit-deduction toast — dark card, green check, 3 lines (done · spent · balance). */}
      {creditToast && (() => {
        const creditsWord = locale === 'en' ? 'credits' : locale === 'ru' ? 'кред.' : 'კრედიტი';
        return (
          <div
            className="pointer-events-none fixed inset-x-0 z-[111] mx-auto flex w-fit max-w-[88vw] animate-[fadeIn_0.2s_ease-out] flex-col gap-1 rounded-2xl bg-app-elevated px-4 py-3 text-[13px] font-semibold tabular-nums text-app-text shadow-lg ring-1 ring-app-accent/30"
            style={{ bottom: 'max(8rem, calc(env(safe-area-inset-bottom) + 7.5rem))' }}
          >
            <span className="flex items-center gap-1.5"><Check size={15} className="text-emerald-400" /> {locale === 'en' ? 'Generation complete' : locale === 'ru' ? 'Генерация завершена' : 'გენერაცია დასრულდა'}</span>
            <span className="text-app-muted">💳 −{creditToast.credits} {creditsWord} (${usdFromGel(creditsToGel(creditToast.credits))})</span>
            {creditToast.balanceGel !== null && (
              <span className="text-app-muted">💰 {locale === 'en' ? 'Balance' : locale === 'ru' ? 'Баланс' : 'ბალანსი'}: <span className="text-app-accent">{gelToCredits(creditToast.balanceGel)} {creditsWord}</span> (${usdFromGel(creditToast.balanceGel)})</span>
            )}
          </div>
        );
      })()}
      {/* Background-render tray — capped-parallel job queue (live progress + queue
          positions). Portaled to document.body so it floats above the studio shell.
          Renders nothing when there are no jobs. */}
      <Portal><JobTray locale={locale} /></Portal>
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
              title={t.imgDownload} aria-label={t.imgDownload}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-app-accent text-app-bg backdrop-blur transition active:scale-90"
            >
              <Download size={18} />
            </button>
            <button
              type="button"
              onClick={() => void share(lightbox, 'myavatar-image.png')}
              title={t.share} aria-label={t.share}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 active:scale-90"
            >
              <Share2 size={18} />
            </button>
            <button
              type="button"
              onClick={() => startImageEdit(lightbox)}
              title={t.editImage} aria-label={t.editImage}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 active:scale-90"
            >
              <Pencil size={18} />
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
              <button type="button" onClick={() => { try { storyboardAbortRef.current?.abort(); } catch { /* noop */ } setStoryboardBusy(false); }} aria-label={t.sbCancel} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation sm:h-8 sm:w-8">
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
                {Array.from({ length: videoDuration <= 6 ? 1 : Math.max(2, Math.min(6, Math.round(videoDuration / 5))) }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-app-border/10 bg-app-elevated">
                    <div className={`relative ${videoOrientation === 'vertical' ? 'aspect-[9/16]' : 'aspect-video'} animate-pulse bg-gradient-to-br from-app-border/20 via-app-border/10 to-app-border/15`} style={{ animationDelay: `${i * 140}ms` }}>
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
          locale={locale}
          busy={busy}
          regenningOrdinal={regenningOrdinal}
          onRegenScene={(ordinal, baseImage) => void regenScene(ordinal, baseImage)}
          onEditScene={editScene}
          onView={(url) => setLightbox(url)}
          onDelete={deleteScene}
          onMove={moveScene}
          onReorder={reorderScene}
          onAddScene={addScene}
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
            void startFilmRender(sb.filmPrompt, sceneFrames ? [] : sb.refs, sb.orientation, sceneFrames, scripts, sb.scenes.map((s) => ({ ordinal: s.ordinal, beat: s.beat, frameUrl: s.frameUrl })), sb.character ?? undefined, sb.refs?.[0]);
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
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="close" className="flex h-10 w-10 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation sm:h-8 sm:w-8"><X className="h-4 w-4" /></button>
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
