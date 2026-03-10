'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

interface Feature {
  icon: string
  title: Record<string, string>
  desc: Record<string, string>
}

const FEATURES: Feature[] = [
  {
    icon: '✦',
    title: { en: 'Avatar Identity', ka: 'ავატარი', ru: 'Аватар' },
    desc: { en: 'AI-generated avatars in any style', ka: 'AI ავატარები ნებისმიერ სტილში', ru: 'AI-аватары в любом стиле' },
  },
  {
    icon: '▶',
    title: { en: 'Video Studio', ka: 'ვიდეო სტუდია', ru: 'Видео-студия' },
    desc: { en: 'Text-to-video and motion generation', ka: 'ტექსტიდან ვიდეოსა და მოძრაობის გენერაცია', ru: 'Генерация видео из текста' },
  },
  {
    icon: '◆',
    title: { en: 'Image Creator', ka: 'სურათის შემქმნელი', ru: 'Создатель изображений' },
    desc: { en: 'Premium AI image generation', ka: 'პრემიუმ AI სურათების გენერაცია', ru: 'Премиум AI-генерация изображений' },
  },
  {
    icon: '♪',
    title: { en: 'Music Studio', ka: 'მუსიკის სტუდია', ru: 'Музыкальная студия' },
    desc: { en: 'Compose beats, soundtracks, and more', ka: 'ბითების, საუნდტრეკების შექმნა', ru: 'Создание битов и саундтреков' },
  },
  {
    icon: '◈',
    title: { en: 'Media Pack', ka: 'მედია პაკეტი', ru: 'Медиа-пакет' },
    desc: { en: 'Photo enhancement and editing', ka: 'ფოტოს გაუმჯობესება და რედაქტირება', ru: 'Улучшение и редактирование фото' },
  },
  {
    icon: '◎',
    title: { en: 'Business AI', ka: 'ბიზნეს AI', ru: 'Бизнес AI' },
    desc: { en: 'Marketing and content at scale', ka: 'მარკეტინგი და კონტენტი მასშტაბით', ru: 'Маркетинг и контент в масштабе' },
  },
  {
    icon: 'G',
    title: { en: 'Agent G', ka: 'Agent G', ru: 'Агент G' },
    desc: { en: 'Orchestrated AI workflows', ka: 'ორკესტრირებული AI სამუშაო პროცესები', ru: 'Оркестрированные AI-процессы' },
  },
]

export function FeatureGrid() {
  const { language } = useLanguage()

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-16 sm:py-20">
      <div className="max-w-3xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-10 sm:mb-14">
          <p className="text-[11px] tracking-[0.25em] uppercase text-white/20 font-medium mb-3">
            {{ en: 'Platform', ka: 'პლატფორმა', ru: 'Платформа' }[language] || 'Platform'}
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-white/90 tracking-tight">
            {{ en: 'Everything you need, one workspace', ka: 'ყველაფერი ერთ სივრცეში', ru: 'Всё в одном пространстве' }[language] || 'Everything you need, one workspace'}
          </h2>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-white/[0.04] rounded-2xl overflow-hidden border border-white/[0.06]">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="bg-[#0a0a0a] p-5 sm:p-6 flex flex-col gap-3 hover:bg-white/[0.02] transition-colors duration-300"
            >
              <span className="text-base text-white/15 font-light">{f.icon}</span>
              <h3 className="text-[13px] sm:text-sm font-semibold text-white/70">
                {f.title[language] || f.title.en}
              </h3>
              <p className="text-[11px] sm:text-xs text-white/25 leading-relaxed">
                {f.desc[language] || f.desc.en}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
