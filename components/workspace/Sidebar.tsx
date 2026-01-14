'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { useWorkspace } from './WorkspaceProvider'
import { getServiceIcon } from '@/lib/utils'
import type { ServiceConfig } from '@/lib/types'

const services: ServiceConfig[] = [
  {
    key: 'avatar',
    title: 'Avatar Builder',
    subtitle: 'Digital Identity',
    icon: '👤',
    accent: 'from-blue-500/20 to-cyan-500/20',
    dropdowns: [
      { key: 'style', label: 'Style', options: ['Realistic', 'Stylized', 'Anime', 'Cartoon'] },
      { key: 'expression', label: 'Expression', options: ['Neutral', 'Happy', 'Serious', 'Dynamic'] },
      { key: 'apparel', label: 'Apparel', options: ['Casual', 'Formal', 'Fantasy', 'Futuristic'] },
    ],
  },
  {
    key: 'voice',
    title: 'Voice Lab',
    subtitle: 'Georgian Synthesis',
    icon: '🎙️',
    accent: 'from-purple-500/20 to-pink-500/20',
    dropdowns: [
      { key: 'dialect', label: 'Georgian Dialect', options: ['Tbilisi', 'Megrelian', 'Kakhetian'] },
      { key: 'emotion', label: 'Emotion', options: ['Neutral', 'Warm', 'Energetic', 'Calm'] },
      { key: 'tone', label: 'Tone', options: ['Conversational', 'Professional', 'Narrative', 'Character'] },
    ],
  },
  {
    key: 'image',
    title: 'Image Architect',
    subtitle: 'Visual Design',
    icon: '🎨',
    accent: 'from-orange-500/20 to-red-500/20',
    dropdowns: [
      { key: 'lighting', label: 'Lighting', options: ['Natural', 'Studio', 'Dramatic', 'Soft'] },
      { key: 'lens', label: 'Lens', options: ['Wide', 'Portrait', 'Macro', 'Telephoto'] },
      { key: 'style', label: 'Style', options: ['Photorealistic', 'Artistic', 'Abstract', 'Minimal'] },
    ],
  },
  {
    key: 'music',
    title: 'Music Studio',
    subtitle: 'Audio Composition',
    icon: '🎵',
    accent: 'from-indigo-500/20 to-purple-500/20',
    dropdowns: [
      { key: 'genre', label: 'Genre', options: ['Folk-Trap', 'Techno', 'Ambient', 'Cinematic'] },
      { key: 'mood', label: 'Mood', options: ['Energetic', 'Melancholic', 'Epic', 'Peaceful'] },
      { key: 'instruments', label: 'Instruments', options: ['Electronic', 'Orchestral', 'Hybrid', 'Acoustic'] },
    ],
  },
  {
    key: 'video',
    title: 'Video Cine-Lab',
    subtitle: 'Motion Pictures',
    icon: '🎬',
    accent: 'from-green-500/20 to-teal-500/20',
    dropdowns: [
      { key: 'camera', label: 'Camera Motion', options: ['Static', 'Dolly', 'Crane', 'Handheld'] },
      { key: 'vfx', label: 'VFX', options: ['None', 'Subtle', 'Cinematic', 'Stylized'] },
      { key: 'duration', label: 'Duration', options: ['15s', '30s', '60s', '120s'] },
    ],
  },
  {
    key: 'game',
    title: 'Game Forge',
    subtitle: 'World Builder',
    icon: '🎮',
    accent: 'from-violet-500/20 to-blue-500/20',
    dropdowns: [
      { key: 'genre', label: 'World Genre', options: ['Fantasy', 'Sci-Fi', 'Modern', 'Historical'] },
      { key: 'npc', label: 'NPC Logic', options: ['Simple', 'Behavioral', 'AI-Driven', 'Scripted'] },
      { key: 'physics', label: 'Physics', options: ['Realistic', 'Arcade', 'None', 'Custom'] },
    ],
  },
  {
    key: 'production',
    title: 'AI Production',
    subtitle: 'Full Pipeline',
    icon: '⚡',
    accent: 'from-yellow-500/20 to-orange-500/20',
    dropdowns: [
      { key: 'aspect', label: 'Aspect Ratio', options: ['16:9', '9:16', '1:1', '4:5'] },
      { key: 'pace', label: 'Edit Pace', options: ['Slow', 'Medium', 'Fast', 'Dynamic'] },
      { key: 'subtitles', label: 'Subtitles', options: ['None', 'English', 'Georgian', 'Both'] },
    ],
  },
  {
    key: 'business',
    title: 'Business Agent',
    subtitle: 'Strategy Alpha',
    icon: '💼',
    accent: 'from-slate-500/20 to-zinc-500/20',
    dropdowns: [
      { key: 'goal', label: 'Goal', options: ['Growth', 'Efficiency', 'Revenue', 'Expansion'] },
      { key: 'platform', label: 'Platform', options: ['Web', 'Mobile', 'Social', 'Multi-Channel'] },
      { key: 'strategy', label: 'Strategy', options: ['Organic', 'Paid', 'Hybrid', 'Viral'] },
    ],
  },
]

const Sidebar: React.FC = () => {
  const { activeService, setActiveService, assets, addPipelineJob } = useWorkspace()

  const handleDrop = (e: React.DragEvent, targetService: ServiceConfig) => {
    e.preventDefault()
    const assetId = e.dataTransfer.getData('assetId')
    const asset = assets.find(a => a.id === assetId)
    
    if (asset) {
      addPipelineJob({
        sourceService: asset.meta?.service as any,
        targetService: targetService.key,
        action: 'attach',
        assetId: asset.id,
        status: 'processing',
      })
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="hidden md:flex w-64 lg:w-72 glass-panel border-r border-silver/10 flex-col relative z-10"
    >
      <div className="p-4 border-b border-silver/10">
        <h2 className="text-xs font-semibold text-silver/60 uppercase tracking-wider">Services</h2>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {services.map((service) => (
          <motion.button
            key={service.key}
            onClick={() => setActiveService(service.key)}
            onDrop={(e) => handleDrop(e, service)}
            onDragOver={handleDragOver}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full group relative overflow-hidden rounded-lg transition-all duration-200 ${
              activeService === service.key
                ? 'glass-panel border-silver/30'
                : 'glass-card hover:bg-white/5'
            }`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${service.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
            
            <div className="relative flex items-center gap-2 px-3 py-2.5">
              <span className="text-xl flex-shrink-0">{service.icon}</span>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-medium text-silver truncate">{service.title}</p>
                <p className="text-[10px] text-silver/50 truncate">{service.subtitle}</p>
              </div>
              {activeService === service.key && (
                <div className="w-1.5 h-1.5 rounded-full bg-silver flex-shrink-0"></div>
              )}
            </div>
          </motion.button>
        ))}
      </nav>

      <div className="p-3 border-t border-silver/10">
        <div className="glass-panel rounded-lg p-3">
          <p className="text-[10px] font-semibold text-silver/70 mb-1.5">Neural Credits</p>
          <p className="text-xl font-bold text-silver mb-2">1,250</p>
          <button className="w-full glass-card border-silver/20 text-silver hover:bg-white/10 text-[10px] font-medium py-1.5 rounded-lg transition-all">
            Purchase Credits
          </button>
        </div>
      </div>
    </motion.aside>
  )
}

export default Sidebar
export { services }
