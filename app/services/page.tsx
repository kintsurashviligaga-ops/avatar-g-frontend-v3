'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Sparkles, 
  MessageSquare, 
  Wand2, 
  Image, 
  Video, 
  Music, 
  Mic, 
  Gamepad2, 
  Bot, 
  Briefcase,
  FileText,
  Factory,
  Hexagon
} from 'lucide-react'

interface Service {
  key: string
  href: string
  icon: any
  status: 'ready' | 'beta' | 'soon'
  description?: string
}

export default function ServicesPage() {
  const t = useTranslations('services')

  const services: Service[] = [
    {
      key: 'image_generator',
      href: '/services/image-creator',
      icon: Image,
      status: 'ready',
      description: 'AI-ით გენერირებული სურათები და ვიზუალური კონტენტი'
    },
    {
      key: 'video_generator',
      href: '/services/video-studio',
      icon: Video,
      status: 'ready',
      description: 'პროფესიონალური ვიდეო კონტენტის შექმნა'
    },
    {
      key: 'music_studio',
      href: '/services/music-studio',
      icon: Music,
      status: 'ready',
      description: 'მუსიკალური ტრეკების გენერაცია და რედაქტირება'
    },
    {
      key: 'voice_lab',
      href: '/services/voice-lab',
      icon: Mic,
      status: 'beta',
      description: 'ხმოვანი სინთეზი და voice cloning'
    },
    {
      key: 'image_architect',
      href: '/services/photo-studio',
      icon: Sparkles,
      status: 'ready',
      description: 'პროფესიონალური ფოტოს რედაქტირება AI-ით'
    },
    {
      key: 'prompt_builder',
      href: '/services/prompt-builder',
      icon: Wand2,
      status: 'ready',
      description: 'პრომპტების ოპტიმიზაცია და შაბლონები'
    },
    {
      key: 'agent_g',
      href: '/services/agent-g',
      icon: Bot,
      status: 'ready',
      description: 'პერსონალური AI ასისტენტი'
    },
    {
      key: 'business_agent',
      href: '/services/business-agent',
      icon: Briefcase,
      status: 'beta',
      description: 'ბიზნეს ანალიტიკა და სტრატეგია'
    },
    {
      key: 'game_forge',
      href: '/services/game-creator',
      icon: Gamepad2,
      status: 'beta',
      description: 'თამაშების კონცეფცია და დიზაინი'
    },
    {
      key: 'text_intelligence',
      href: '/services/text-intelligence',
      icon: FileText,
      status: 'beta',
      description: 'ტექსტის ანალიზი, რეზიუმე და SEO ოპტიმიზაცია'
    },
    {
      key: 'ai_production',
      href: '/services/media-production',
      icon: Factory,
      status: 'beta',
      description: 'სრული მედია პროდუქციის pipeline'
    },
    {
      key: 'pentagon',
      href: '/dashboard',
      icon: Hexagon,
      status: 'soon',
      description: 'ინტეგრირებული AI კონტროლ ცენტრი'
    }
  ]

  const getStatusBadge = (status: Service['status']) => {
    switch (status) {
      case 'ready':
        return <Badge variant="success">მზადაა</Badge>
      case 'beta':
        return <Badge variant="warning">Beta</Badge>
      case 'soon':
        return <Badge variant="outline">მალე</Badge>
    }
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-16 space-y-4">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
          {t('title')}
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          {t('subtitle')}
        </p>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => {
          const Icon = service.icon
          const isAvailable = service.status !== 'soon'

          return (
            <Link 
              key={service.key}
              href={isAvailable ? service.href : '#'}
              className={`
                block transition-all duration-300 
                ${isAvailable 
                  ? 'hover:scale-105 cursor-pointer' 
                  : 'opacity-60 cursor-not-allowed'
                }
              `}
            >
              <Card 
                className="h-full relative p-6"
                glow={isAvailable}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                    <Icon className="w-6 h-6" />
                  </div>
                  {getStatusBadge(service.status)}
                </div>
                
                {/* Title */}
                <h3 className="text-2xl font-bold mb-2">
                  {t(service.key)}
                </h3>
                
                {/* Description */}
                {service.description && (
                  <p className="text-gray-400 text-sm mb-4">
                    {service.description}
                  </p>
                )}

                {/* Status */}
                <div className="flex items-center text-sm text-gray-500 mt-auto">
                  {isAvailable ? (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      ხელმისაწვდომია
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-600" />
                      მალე გაეშვება
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Footer CTA */}
      <div className="text-center mt-16 p-12 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-blue-500/10 rounded-2xl border border-white/10">
        <h2 className="text-3xl font-bold mb-4">
          მზად ხარ დაიწყო?
        </h2>
        <p className="text-gray-400 mb-8 text-lg">
          13 AI სერვისი შენი ბიზნესის ზრდისთვის
        </p>
        <Link 
          href="/dashboard"
          className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all duration-300"
        >
          <Sparkles className="w-5 h-5" />
          შედი დეშბორდში
        </Link>
      </div>
    </div>
  )
}
