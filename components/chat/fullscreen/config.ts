/**
 * Fullscreen Chat configuration — quick actions, labels, breakpoints.
 */

export type QuickActionConfig = {
  id: string
  icon: string
  intent: string
  targetService: string
  label: { en: string; ka: string; ru: string }
  prefillPrompt?: { en: string; ka: string; ru: string }
}

export const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    id: 'avatar', icon: '🧑‍🎨', intent: 'create_avatar', targetService: 'avatar',
    label: { en: 'Create Avatar', ka: 'ავატარის შექმნა', ru: 'Создать аватар' },
    prefillPrompt: { en: 'Create a professional avatar for me', ka: 'შემიქმენი პროფესიონალური ავატარი', ru: 'Создай мне профессиональный аватар' },
  },
  {
    id: 'video', icon: '🎬', intent: 'generate_video', targetService: 'video',
    label: { en: 'Generate Video', ka: 'ვიდეოს გენერაცია', ru: 'Создать видео' },
    prefillPrompt: { en: 'Generate a short promotional video', ka: 'შექმენი მოკლე პრომო ვიდეო', ru: 'Создай короткое промо-видео' },
  },
  {
    id: 'image', icon: '🖼️', intent: 'create_image', targetService: 'image',
    label: { en: 'Create Image', ka: 'სურათის შექმნა', ru: 'Создать изображение' },
    prefillPrompt: { en: 'Create an AI-generated image', ka: 'შექმენი AI გენერირებული სურათი', ru: 'Создай AI-изображение' },
  },
  {
    id: 'music', icon: '🎵', intent: 'generate_music', targetService: 'music',
    label: { en: 'Generate Music', ka: 'მუსიკის გენერაცია', ru: 'Создать музыку' },
    prefillPrompt: { en: 'Generate background music for a video', ka: 'შექმენი ფონის მუსიკა ვიდეოსთვის', ru: 'Создай фоновую музыку для видео' },
  },
  {
    id: 'text', icon: '✍️', intent: 'write_text', targetService: 'text',
    label: { en: 'Write Anything', ka: 'ნებისმიერის დაწერა', ru: 'Написать что угодно' },
  },
  {
    id: 'workflow', icon: '⚡', intent: 'build_workflow', targetService: 'workflow',
    label: { en: 'Build Workflow', ka: 'სამუშაო ნაკადი', ru: 'Создать воркфлоу' },
  },
]

export const CHAT_LABELS = {
  en: {
    title: 'Agent G',
    greeting: 'Hi there',
    heading: 'What would you like to create?',
    helper: 'Agent G coordinates all your AI services',
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
    helper: 'Agent G კოორდინაციას უწევს ყველა AI სერვისს',
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
    helper: 'Agent G координирует все ваши AI-сервисы',
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
