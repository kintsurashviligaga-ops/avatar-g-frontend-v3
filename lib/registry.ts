import assert from 'assert'

export const SERVICE_REGISTRY = [
  {
    id: 'avatar',
    name: { ka: 'AvATAR', en: 'Avatar', ru: 'Аватар' },
    description: { ka: 'პერსონა და ვიზუალური იდენტობა', en: 'Persona & Visual Identity', ru: 'Персона и визуальная идентичность' },
    icon: '◉',
    color: '#00d4ff',
    credits: 15,
    category: 'visual',
    avgSeconds: 25,
  },
  {
    id: 'video',
    name: { ka: 'ვიდეო', en: 'Video', ru: 'Видео' },
    description: { ka: 'სცენები და მოძრაობის კონცეპტი', en: 'Scenes & Motion Concept', ru: 'Сцены и концепт движения' },
    icon: '▶',
    color: '#7c3aed',
    credits: 20,
    category: 'media',
    avgSeconds: 60,
  },
  {
    id: 'image',
    name: { ka: 'სურათი', en: 'Image', ru: 'Изображение' },
    description: { ka: 'ვიზუალები და გრაფიკული აქტივები', en: 'Visuals & Graphic Assets', ru: 'Визуалы и графические активы' },
    icon: '✦',
    color: '#00d4ff',
    credits: 5,
    category: 'visual',
    avgSeconds: 20,
  },
  {
    id: 'music',
    name: { ka: 'მუსიკა', en: 'Music', ru: 'Музыка' },
    description: { ka: 'საუნდტრეკი და ატმოსფერო', en: 'Soundtrack & Atmosphere', ru: 'Саундтрек и атмосфера' },
    icon: '♪',
    color: '#10b981',
    credits: 10,
    category: 'audio',
    avgSeconds: 30,
  },
  {
    id: 'game',
    name: { ka: 'თამაშების შექმნა', en: 'Game Creation', ru: 'Создание игр' },
    description: { ka: 'მექანიკა, ლეველები და კონცეფცია', en: 'Mechanics, Levels & Concept', ru: 'Механика, уровни и концепция' },
    icon: '⬡',
    color: '#f59e0b',
    credits: 8,
    category: 'creation',
    avgSeconds: 15,
  },
  {
    id: 'interior',
    name: { ka: 'ინტერიერის დიზაინი', en: 'Interior Design', ru: 'Дизайн интерьера' },
    description: { ka: 'სივრცის დაგეგმარება და სტილი', en: 'Space Planning & Style', ru: 'Планирование пространства и стиль' },
    icon: '◫',
    color: '#f43f5e',
    credits: 7,
    category: 'visual',
    avgSeconds: 20,
  },
  {
    id: 'prompt-builder',
    name: { ka: 'პრომპტ ბილდერი', en: 'Prompt Builder', ru: 'Конструктор промптов' },
    description: { ka: 'სტრუქტურირებული prompt-ების მშენებლობა', en: 'Structured Prompt Engineering', ru: 'Построение структурированных промптов' },
    icon: '⌥',
    color: '#00d4ff',
    credits: 2,
    category: 'tools',
    avgSeconds: 5,
  },
  {
    id: 'terminal',
    name: { ka: 'ტერმინალი და კოდინგი', en: 'Terminal & Coding', ru: 'Терминал и кодинг' },
    description: { ka: 'CLI, სკრიპტები და კოდის იმპლემენტაცია', en: 'CLI, Scripts & Code Implementation', ru: 'CLI, скрипты и реализация кода' },
    icon: '>_',
    color: '#10b981',
    credits: 3,
    category: 'tools',
    avgSeconds: 8,
  },
] as const

assert(SERVICE_REGISTRY.length === 8, `SERVICE_REGISTRY must have exactly 8 services, got ${SERVICE_REGISTRY.length}`)

export type ServiceId = typeof SERVICE_REGISTRY[number]['id']
export type Service = typeof SERVICE_REGISTRY[number]

export const SERVICE_CREDIT_COSTS: Record<ServiceId, number> = Object.fromEntries(
  SERVICE_REGISTRY.map(s => [s.id, s.credits])
) as Record<ServiceId, number>

export const SERVICE_AVG_SECONDS: Record<ServiceId, number> = Object.fromEntries(
  SERVICE_REGISTRY.map(s => [s.id, s.avgSeconds])
) as Record<ServiceId, number>

export function getServiceById(id: ServiceId) {
  return SERVICE_REGISTRY.find(s => s.id === id)
}

export function resolveServiceColor(id: ServiceId): string {
  return getServiceById(id)?.color ?? '#00d4ff'
}

export const SERVICE_OUTPUT_KINDS: Record<ServiceId, 'image' | 'video' | 'audio' | 'text' | 'code'> = {
  avatar:           'video',
  video:            'video',
  image:            'image',
  music:            'audio',
  game:             'text',
  interior:         'image',
  'prompt-builder': 'text',
  terminal:         'code',
}
