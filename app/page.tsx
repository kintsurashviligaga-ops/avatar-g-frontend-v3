'use client'

import { useState } from 'react'

export default function HomePage() {
  const [activeService, setActiveService] = useState<string | null>(null)
  const [showSplash, setShowSplash] = useState(false)

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
      <div className="min-h-screen bg-[#05070A] text-white p-4">
        <button
          onClick={() => setActiveService(null)}
          className="mb-4 px-4 py-2 bg-white/10 rounded-lg"
        >
          ← Back to Services
        </button>
        <h1 className="text-2xl font-bold">
          {services.find(s => s.key === activeService)?.title}
        </h1>
        <p className="text-gray-400 mt-2">Chat interface coming soon...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#05070A] text-white">
      {/* TopBar */}
      <header className="h-14 border-b border-white/10 flex items-center px-4 bg-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <span className="text-base font-bold">A</span>
          </div>
          <div>
            <h1 className="text-xs font-bold">Avatar G</h1>
            <p className="text-[9px] text-gray-400">Neural Ecosystem</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">1250</span>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-bold">
            DU
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4">
        <div className="text-center mb-6 mt-4">
          <h2 className="text-2xl font-bold mb-2">Choose Your Service</h2>
          <p className="text-sm text-gray-400">Select an AI module to begin</p>
        </div>

        {/* Services List */}
        <div className="space-y-3 max-w-md mx-auto">
          {services.map((service) => (
            <button
              key={service.key}
              onClick={() => setActiveService(service.key)}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-left active:bg-white/10 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">{service.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold truncate">{service.title}</h3>
                  <p className="text-xs text-gray-400 truncate">{service.subtitle}</p>
                </div>
                <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
