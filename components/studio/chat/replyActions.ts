/**
 * components/studio/chat/replyActions.ts — the words and the clipboard path for the chat's own action buttons
 * (Phase 8.13 audit). Kept out of OmniStudio so they are unit-tested on their own.
 *
 *   copy        the reply's Copy button used navigator.clipboard only: an in-app browser (Facebook, Instagram) or a
 *               denied permission made it a dead tap. It now takes the same legacy fallback as a code block's Copy
 *               (copyText) and, if both fail, says so.
 *   recorder    the Music / Avatar „record my voice" chip swallowed every getUserMedia rejection: a blocked microphone
 *               looked like a button that does nothing. Each failure kind now has one plain sentence.
 */
import { classifyMicError } from '@/lib/voice/micAcquire';

export type ReplyLang = 'ka' | 'en' | 'ru';

export const replyLang = (locale: string | null | undefined): ReplyLang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

export const COPY_FAILED: Record<ReplyLang, string> = {
  ka: 'ვერ დაკოპირდა. მონიშნე ტექსტი და დააკოპირე ხელით.',
  en: "Couldn't copy. Select the text and copy it by hand.",
  ru: 'Не удалось скопировать. Выделите текст и скопируйте вручную.',
};

const RECORD_FAILED: Record<ReplyLang, Record<'denied' | 'system_denied' | 'not_found' | 'busy' | 'other', string>> = {
  ka: {
    denied: 'მიკროფონზე წვდომა არ არის. მისამართის ზოლში დააჭირე ბოქლომს → მიკროფონი → დაშვება და სცადე თავიდან.',
    system_denied: 'მიკროფონი სისტემის პარამეტრებშია დაბლოკილი. ჩართე ამ ბრაუზერისთვის და სცადე თავიდან.',
    not_found: 'მიკროფონი ვერ მოიძებნა. შეაერთე მიკროფონი ან ყურსასმენი და სცადე თავიდან.',
    busy: 'მიკროფონს სხვა პროგრამა იყენებს. დახურე ზარი ან ჩამწერი და სცადე თავიდან.',
    other: 'ჩაწერა ვერ დაიწყო. სცადე თავიდან ან ატვირთე აუდიო ფაილი.',
  },
  en: {
    denied: 'Microphone access is blocked. Tap the lock in the address bar → Microphone → Allow, then try again.',
    system_denied: 'The microphone is blocked in your system settings. Allow it for this browser and try again.',
    not_found: 'No microphone found. Connect a microphone or headset and try again.',
    busy: 'Another app is using the microphone. Close the call or recorder and try again.',
    other: "Recording couldn't start. Try again or upload an audio file.",
  },
  ru: {
    denied: 'Доступ к микрофону запрещён. Нажмите на замок в адресной строке → Микрофон → Разрешить и повторите.',
    system_denied: 'Микрофон заблокирован в настройках системы. Разрешите его для браузера и повторите.',
    not_found: 'Микрофон не найден. Подключите микрофон или гарнитуру и повторите.',
    busy: 'Микрофон занят другим приложением. Закройте звонок или запись и повторите.',
    other: 'Не удалось начать запись. Повторите или загрузите аудиофайл.',
  },
};

/** One sentence for a failed voice recording, in the UI language. A missing API (no getUserMedia) is "other". */
export function recordErrorText(err: unknown, locale: string | null | undefined): string {
  const k = classifyMicError(err).kind;
  const key = k === 'denied' || k === 'system_denied' || k === 'not_found' || k === 'busy' ? k : 'other';
  return RECORD_FAILED[replyLang(locale)][key];
}
