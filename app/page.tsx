use client'

import { useState } from 'react'

export default function HomePage() {
  const [activeService, setActiveService] = useState<string | null>(null)

  const services = [
    { key: 'avatar', icon: '👤', title: 'Avatar Builder', subtitle: 'Digital Identity' },
    { key: 'voice', icon: '🎙️', title: 'Voice Lab', subtitle: 'Georgian Synthesis' },
    { key: 'image', icon: '🎨', title: 'Image Architect', subtitle: 'Visual Design' },
    { key: 'music', icon: '🎵', title: 'Music Studio', subtitle: 'Audio Composition' },
    { key: 'video', icon: '🎬', title: 'Video Cine-Lab', subtitle: 'Motion Pictures' },
    { key: 'game', icon: '🎮', title: 'Game Forge', subtitle: 'World Builder' },
    { key: 'production', icon: '⚡', title: 'AI Production', subtitle: 'Full Pipeline' },
    { key: 'business', icon: '💼', title: 'Business Agent', subtitle: 'Strategy Alpha' },
  ]

  if (activeService) {
    return (
      <div className="min-h-screen bg-[#05070A] text-white">
        <header className="h-14 border-b border-white/10 flex items-center px-4 bg-white/5 backdrop-blur-sm">
          <button
            onClick={() => setActiveService(null)}
            className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="ml-4 text-sm font-semibold text-white">
            {services.find(s => s.key === activeService)?.title}
          </div>
        </header>
        
        <main className="p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
              <h2 className="text-xl font-bold mb-2">{services.find(s => s.key === activeService)?.title}</h2>
              <p className="text-gray-400 mb-4">{services.find(s => s.key === activeService)?.subtitle}</p>
              <div className="bg-white/5 rounded-lg p-4 text-sm text-gray-300">
                Chat interface coming soon...
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#05070A] text-white">
      {/* TopBar */}
      <header className="h-14 border-b border-white/10 flex items-center px-4 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1a2332] to-[#0f1419] border border-[#C0C0C0]/20 flex items-center justify-center">
            <span className="text-sm font-bold text-[#C0C0C0]">A</span>
          </div>
          <div>
            <h1 className="text-xs font-bold text-[#C0C0C0]">Avatar G</h1>
            <p className="text-[9px] text-[#C0C0C0]/50">Neural Ecosystem</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-[#C0C0C0]/70">1250</span>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-bold border border-white/20">
            DU
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 pb-8">
        <div className="text-center mb-6 mt-4">
          <h2 className="text-2xl font-bold text-[#C0C0C0] mb-2">Choose Your Service</h2>
          <p className="text-sm text-[#C0C0C0]/50">Select an AI module to begin</p>
        </div>

        {/* Services List - Vertical Stack */}
        <div className="space-y-3 max-w-md mx-auto">
          {services.map((service) => (
            <button
              key={service.key}
              onClick={() => setActiveService(service.key)}
              className="w-full bg-white/5 backdrop-blur-md border border-[#C0C0C0]/10 rounded-xl p-4 text-left active:bg-white/10 transition-all hover:border-[#C0C0C0]/20"
            >
              <div className="flex items-center gap-3">
                {/* Icon */}
                <div className="w-12 h-12 rounded-lg bg-white/10 backdrop-blur-sm border border-[#C0C0C0]/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">{service.icon}</span>
                </div>
                
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-[#C0C0C0] truncate">{service.title}</h3>
                  <p className="text-xs text-[#C0C0C0]/50 truncate">{service.subtitle}</p>
                </div>
                
                {/* Arrow */}
                <svg className="w-5 h-5 text-[#C0C0C0]/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Credits Info */}
        <div className="mt-8 max-w-md mx-auto">
          <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 backdrop-blur-sm border border-[#C0C0C0]/10 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#C0C0C0]/50 mb-1">Neural Credits</p>
                <p className="text-2xl font-bold text-[#C0C0C0]">1,250</p>
              </div>
              <button className="px-4 py-2 bg-[#C0C0C0]/10 hover:bg-[#C0C0C0]/20 border border-[#C0C0C0]/20 text-[#C0C0C0] text-xs font-medium rounded-lg transition-colors">
                Buy More
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
