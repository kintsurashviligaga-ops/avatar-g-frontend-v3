/**
 * Fullscreen Chat configuration — quick actions, labels, breakpoints.
 */

export type QuickActionConfig = {
  id: string
  icon: string
  intent: string
  targetService: string
  label: { en: string; ka: string; ru: string }
  prefillPrompt: { en: string; ka: string; ru: string }
}

export const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    id: 'avatar', icon: 'avatar', intent: 'create_avatar', targetService: 'avatar',
    label: { en: 'Create Avatar', ka: 'ავატარის შექმნა', ru: 'Создать аватар' },
    prefillPrompt: {
      en: 'I want to create a professional AI avatar. Guide me through the Avatar Studio.',
      ka: 'მინდა პროფესიონალური AI ავატარის შექმნა. გამიძღოლე Avatar Studio-ში.',
      ru: 'Хочу создать профессиональный AI-аватар. Проведи меня через Avatar Studio.',
    },
  },
  {
    id: 'video', icon: 'video', intent: 'generate_video', targetService: 'video',
    label: { en: 'Generate Video', ka: 'ვიდეოს გენერაცია', ru: 'Сгенерировать видео' },
    prefillPrompt: {
      en: 'I need to generate a short AI video. Help me set up the video generation.',
      ka: 'მინდა მოკლე AI ვიდეოს გენერაცია. დამეხმარე ვიდეოს შექმნაში.',
      ru: 'Мне нужно сгенерировать короткое AI-видео. Помоги настроить генерацию.',
    },
  },
  {
    id: 'image', icon: 'image', intent: 'create_image', targetService: 'image',
    label: { en: 'Create Image', ka: 'სურათის შექმნა', ru: 'Создать изображение' },
    prefillPrompt: {
      en: 'I want to create an AI-generated image or poster. Start the image creation flow.',
      ka: 'მინდა AI გენერირებული სურათის ან პოსტერის შექმნა. დაიწყე სურათის შექმნის პროცესი.',
      ru: 'Хочу создать AI-изображение или постер. Запусти процесс создания.',
    },
  },
  {
    id: 'music', icon: 'music', intent: 'produce_music', targetService: 'music',
    label: { en: 'Produce Music', ka: 'მუსიკის პროდუქცია', ru: 'Создать музыку' },
    prefillPrompt: {
      en: 'I want to produce AI music. Help me with the music production tools.',
      ka: 'მინდა AI მუსიკის შექმნა. დამეხმარე მუსიკის პროდუქციის ინსტრუმენტებით.',
      ru: 'Хочу создать AI-музыку. Помоги с инструментами продакшна.',
    },
  },
  {
    id: 'text', icon: 'text', intent: 'write_content', targetService: 'text',
    label: { en: 'Write Content', ka: 'კონტენტის წერა', ru: 'Написать контент' },
    prefillPrompt: {
      en: 'I need to write content — scripts, captions, or marketing copy. Help me get started.',
      ka: 'მინდა კონტენტის დაწერა — სკრიპტები, წარწერები ან მარკეტინგული ტექსტი. დამეხმარე.',
      ru: 'Мне нужно написать контент — сценарии, подписи или маркетинговый текст. Помоги начать.',
    },
  },
  {
    id: 'workflow', icon: 'workflow', intent: 'build_workflow', targetService: 'workflow',
    label: { en: 'Build Workflow', ka: 'ავტომატიზაცია', ru: 'Создать воркфлоу' },
    prefillPrompt: {
      en: 'I want to build a multi-step AI workflow that chains multiple services together.',
      ka: 'მინდა მრავალსაფეხურიანი AI სამუშაო ნაკადის შექმნა, რომელიც სერვისებს აერთიანებს.',
      ru: 'Хочу построить многоэтапный AI-воркфлоу, объединяющий несколько сервисов.',
    },
  },
]

export const CHAT_LABELS = {
  en: {
    title: 'Agent G',
    greeting: 'Hi there',
    heading: 'What would you like to create?',
    helper: 'Your AI coordinator across Avatar, Video, Image, Music & more',
    placeholder: 'Message Agent G…',
    sending: 'Sending…',
    processing: 'Agent G is thinking…',
    error: 'Something went wrong. Please try again.',
    retry: 'Retry',
    voiceListening: 'Listening…',
    voiceProcessing: 'Processing speech…',
    cameraHint: 'Take a photo',
    attachHint: 'Attach file',
    speechModeOn: 'Voice mode on',
    speechModeOff: 'Voice mode off',
    permissionDenied: 'Permission denied',
    resultOpen: 'Open',
    resultContinue: 'Continue',
    resultEdit: 'Edit',
  },
  ka: {
    title: 'Agent G',
    greeting: 'გამარჯობა',
    heading: 'რისი შექმნა გსურთ?',
    helper: 'თქვენი AI კოორდინატორი — ავატარი, ვიდეო, სურათი, მუსიკა და სხვა',
    placeholder: 'მიწერე Agent G-ს…',
    sending: 'იგზავნება…',
    processing: 'Agent G ფიქრობს…',
    error: 'რაღაც არასწორად წავიდა. სცადეთ თავიდან.',
    retry: 'თავიდან',
    voiceListening: 'მისმენს…',
    voiceProcessing: 'ხმის დამუშავება…',
    cameraHint: 'ფოტოს გადაღება',
    attachHint: 'ფაილის მიმაგრება',
    speechModeOn: 'ხმოვანი რეჟიმი ჩართ.',
    speechModeOff: 'ხმოვანი რეჟიმი გამორთ.',
    permissionDenied: 'ნებართვა უარყოფილია',
    resultOpen: 'გახსნა',
    resultContinue: 'გაგრძელება',
    resultEdit: 'რედაქტირება',
  },
  ru: {
    title: 'Agent G',
    greeting: 'Привет',
    heading: 'Что хотите создать?',
    helper: 'Ваш AI-координатор — аватары, видео, изображения, музыка и другое',
    placeholder: 'Напишите Agent G…',
    sending: 'Отправка…',
    processing: 'Agent G думает…',
    error: 'Что-то пошло не так. Попробуйте ещё раз.',
    retry: 'Повторить',
    voiceListening: 'Слушаю…',
    voiceProcessing: 'Обработка речи…',
    cameraHint: 'Сделать фото',
    attachHint: 'Прикрепить файл',
    speechModeOn: 'Голос. режим вкл.',
    speechModeOff: 'Голос. режим выкл.',
    permissionDenied: 'Доступ запрещён',
    resultOpen: 'Открыть',
    resultContinue: 'Продолжить',
    resultEdit: 'Редактировать',
  },
} as const

export type ChatLocale = keyof typeof CHAT_LABELS
