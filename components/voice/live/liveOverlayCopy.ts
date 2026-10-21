import { isMicErrorCode, type LiveErrorCode, type LiveStatus } from './useGeminiLiveSession';

type Locale = 'ka' | 'en' | 'ru';

interface Strings {
  title: string;
  /** The top-bar label (Gemini's "Live"). */
  live: string;
  status: Record<LiveStatus, string>;
  errors: Record<LiveErrorCode, string>;
  /** Extra "what to do" lines where the reason alone does not say it. */
  hints: Partial<Record<LiveErrorCode, string>>;
  micHeadline: string;
  /** Headline for failures that are neither the mic nor the connection (sign-in, limits, unsupported…). */
  startFailed: string;
  mute: string;
  /** The word under the mute button (contained in `mute`). */
  muteShort: string;
  camera: string;
  /** The word under stop-speaking (contained in LIVE_DOCK_STRINGS.stopSpeaking). */
  stopShort: string;
  flip: string;
  frontCamera: string;
  backCamera: string;
  /** Accessible name of End (contains the visible `endShort`, WCAG 2.5.3). */
  end: string;
  endShort: string;
  retry: string;
  captions: string;
  copyLink: string;
  copied: string;
  openInBrowser: string;
  tapToStart: string;
  /** Docks the call into a slim bar so the app is visible (the call goes on). */
  showScreen: string;
}

export const LIVE_OVERLAY_STRINGS: Record<Locale, Strings> = {
  ka: {
    title: 'ცოცხალი საუბარი',
    live: 'ცოცხალი ზარი',
    status: {
      idle: 'მზად არის',
      connecting: 'უკავშირდება…',
      listening: 'გისმენ',
      thinking: 'ვფიქრობ…',
      speaking: 'ვსაუბრობ…',
      reconnecting: 'კავშირის აღდგენა…',
      error: 'კავშირი შეწყდა',
      closed: 'ზარი დასრულდა',
    },
    errors: {
      mic_denied: 'მიკროფონზე წვდომა არ არის დაშვებული.',
      mic_system_denied: 'მიკროფონი სისტემის პარამეტრებშია დაბლოკილი — ჩართე ამ ბრაუზერისთვის (Settings → Privacy → Microphone).',
      mic_not_found: 'მიკროფონი ვერ მოიძებნა — შეაერთე მიკროფონი ან ყურსასმენი და სცადე თავიდან.',
      mic_busy: 'მიკროფონს სხვა პროგრამა იყენებს — დახურე ზარი ან ჩამწერი (Zoom, Teams, Discord) და სცადე თავიდან.',
      mic_in_app: 'ამ აპის ბრაუზერში მიკროფონი არ მუშაობს — გახსენი myavatar.ge Safari-ში ან Chrome-ში.',
      mic_insecure: 'მიკროფონი მხოლოდ დაცულ (https) კავშირზე მუშაობს.',
      mic_lost: 'მიკროფონი გაითიშა საუბრის დროს.',
      mic_unavailable: 'მიკროფონი ვერ ჩაირთო.',
      auth: 'ცოცხალი საუბრისთვის შედი ანგარიშზე.',
      rate_limited: 'ძალიან ბევრი მცდელობა — სცადე ცოტა ხანში.',
      unavailable: 'ცოცხალი ხმა ახლა მიუწვდომელია.',
      mint_failed: 'საუბრის დაწყება ვერ მოხერხდა.',
      setup_failed: 'Gemini-სთან კავშირი ვერ დამყარდა.',
      connection_lost: 'კავშირი გაწყდა.',
      unsupported: 'ეს ბრაუზერი ცოცხალ ხმას ვერ უჭერს მხარს.',
    },
    hints: {
      mic_denied: 'მისამართის ზოლში დააჭირე ბოქლომის ხატულას → მიკროფონი → დაშვება და სცადე თავიდან.',
      mic_unavailable: 'მიკროფონი სხვა აპს ან ჩანართს ხომ არ უკავია? დახურე და სცადე თავიდან.',
      mic_lost: 'შეამოწმე ყურსასმენის ან Bluetooth-ის კავშირი და სცადე თავიდან.',
    },
    micHeadline: 'მიკროფონი მიუწვდომელია',
    startFailed: 'Live ვერ დაიწყო',
    mute: 'მიკროფონის დადუმება',
    muteShort: 'დადუმება',
    camera: 'კამერა',
    stopShort: 'შეწყვეტა',
    flip: 'კამერის შებრუნება',
    frontCamera: 'წინა კამერა',
    backCamera: 'უკანა კამერა',
    end: 'ზარის დასრულება',
    endShort: 'დასრულება',
    retry: 'თავიდან ცდა',
    captions: 'სუბტიტრები',
    copyLink: 'ბმულის კოპირება',
    copied: 'დაკოპირდა',
    openInBrowser: 'ბრაუზერში გახსნა',
    tapToStart: 'შეეხე ხმის ჩასართავად',
    showScreen: 'ეკრანის ნახვა',
  },
  en: {
    title: 'Live Conversation',
    live: 'Live call',
    status: {
      idle: 'Ready',
      connecting: 'Connecting…',
      listening: 'Listening',
      thinking: 'Thinking…',
      speaking: 'Speaking…',
      reconnecting: 'Reconnecting…',
      error: 'Connection problem',
      closed: 'Call ended',
    },
    errors: {
      mic_denied: "Microphone access isn't allowed.",
      mic_system_denied: 'The microphone is blocked in your system settings — allow it for this browser (Settings → Privacy → Microphone).',
      mic_not_found: 'No microphone found — connect a microphone or headset and try again.',
      mic_busy: 'Another app is using the microphone — close calls or recorders (Zoom, Teams, Discord) and try again.',
      mic_in_app: "The microphone doesn't work in this in-app browser — open myavatar.ge in Safari or Chrome.",
      mic_insecure: 'The microphone only works over a secure (https) connection.',
      mic_lost: 'The microphone disconnected during the call.',
      mic_unavailable: 'The microphone could not be started.',
      auth: 'Sign in to start a live conversation.',
      rate_limited: 'Too many attempts — try again in a moment.',
      unavailable: 'Live voice is unavailable right now.',
      mint_failed: 'The conversation could not be started.',
      setup_failed: 'Could not connect to Gemini.',
      connection_lost: 'The connection was lost.',
      unsupported: 'This browser does not support live voice.',
    },
    hints: {
      mic_denied: 'Tap the lock icon in the address bar → Microphone → Allow, then try again.',
      mic_unavailable: 'Is another app or tab using the microphone? Close it and try again.',
      mic_lost: 'Check your headset or Bluetooth connection and try again.',
    },
    micHeadline: 'Microphone unavailable',
    startFailed: "Live couldn't start",
    mute: 'Mute microphone',
    muteShort: 'Mute',
    camera: 'Camera',
    stopShort: 'Stop',
    flip: 'Flip camera',
    frontCamera: 'Front camera',
    backCamera: 'Back camera',
    end: 'End call',
    endShort: 'End',
    retry: 'Retry',
    captions: 'Captions',
    copyLink: 'Copy link',
    copied: 'Copied',
    openInBrowser: 'Open in browser',
    tapToStart: 'Tap to turn on sound',
    showScreen: 'Show the screen',
  },
  ru: {
    title: 'Живой разговор',
    live: 'Живой звонок',
    status: {
      idle: 'Готово',
      connecting: 'Подключение…',
      listening: 'Слушаю',
      thinking: 'Думаю…',
      speaking: 'Говорю…',
      reconnecting: 'Восстанавливаю связь…',
      error: 'Проблема со связью',
      closed: 'Звонок завершён',
    },
    errors: {
      mic_denied: 'Доступ к микрофону не разрешён.',
      mic_system_denied: 'Микрофон заблокирован в настройках системы — разрешите его для браузера (Настройки → Конфиденциальность → Микрофон).',
      mic_not_found: 'Микрофон не найден — подключите микрофон или гарнитуру и повторите.',
      mic_busy: 'Микрофон занят другим приложением — закройте звонок или запись (Zoom, Teams, Discord) и повторите.',
      mic_in_app: 'Во встроенном браузере микрофон не работает — откройте myavatar.ge в Safari или Chrome.',
      mic_insecure: 'Микрофон работает только по защищённому (https) соединению.',
      mic_lost: 'Микрофон отключился во время звонка.',
      mic_unavailable: 'Не удалось включить микрофон.',
      auth: 'Войдите в аккаунт, чтобы начать живой разговор.',
      rate_limited: 'Слишком много попыток — попробуйте чуть позже.',
      unavailable: 'Живой голос сейчас недоступен.',
      mint_failed: 'Не удалось начать разговор.',
      setup_failed: 'Не удалось подключиться к Gemini.',
      connection_lost: 'Соединение потеряно.',
      unsupported: 'Этот браузер не поддерживает живой голос.',
    },
    hints: {
      mic_denied: 'Нажмите на значок замка в адресной строке → Микрофон → Разрешить и повторите.',
      mic_unavailable: 'Микрофон не занят другим приложением или вкладкой? Закройте его и повторите.',
      mic_lost: 'Проверьте подключение гарнитуры или Bluetooth и повторите.',
    },
    micHeadline: 'Микрофон недоступен',
    startFailed: 'Не удалось запустить Live',
    mute: 'Выключить микрофон',
    muteShort: 'Микрофон',
    camera: 'Камера',
    stopShort: 'Остановить',
    flip: 'Перевернуть камеру',
    frontCamera: 'Фронтальная камера',
    backCamera: 'Основная камера',
    end: 'Завершить звонок',
    endShort: 'Завершить',
    retry: 'Повторить',
    captions: 'Субтитры',
    copyLink: 'Скопировать ссылку',
    copied: 'Скопировано',
    openInBrowser: 'Открыть в браузере',
    tapToStart: 'Нажмите, чтобы включить звук',
    showScreen: 'Показать экран',
  },
};

/** The screen's headline for an error: the MICROPHONE for mic codes, the connection only for connection codes. */
export function liveErrorHeadline(error: LiveErrorCode, locale: Locale = 'ka'): string {
  const t = LIVE_OVERLAY_STRINGS[locale] ?? LIVE_OVERLAY_STRINGS.ka;
  if (isMicErrorCode(error)) return t.micHeadline;
  if (error === 'connection_lost' || error === 'setup_failed') return t.status.error;
  return t.startFailed;
}

