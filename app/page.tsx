"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { useState, useEffect } from "react"
import { 
  User, Mic, Film, Music, Camera, Briefcase, 
  TrendingUp, Code, PenTool, Presentation, Languages, 
  Video, Glasses, Sparkles
} from "lucide-react"

const services = [
  { id: 'avatar-builder', name: 'Avatar Builder', icon: User, color: 'from-cyan-400 to-blue-500', angle: 0 },
  { id: 'voice-cloner', name: 'Voice Cloner', icon: Mic, color: 'from-purple-400 to-pink-500', angle: 27.7 },
  { id: 'media-production', name: 'Media Production', icon: Film, color: 'from-red-400 to-orange-500', angle: 55.4 },
  { id: 'music-studio', name: 'Music Studio', icon: Music, color: 'from-green-400 to-emerald-500', angle: 83.1 },
  { id: 'photo-studio', name: 'Photo Studio', icon: Camera, color: 'from-yellow-400 to-amber-500', angle: 110.8 },
  { id: 'executive-agent', name: 'Executive Agent', icon: Briefcase, color: 'from-blue-400 to-indigo-500', angle: 138.5 },
  { id: 'finance-ai', name: 'Finance AI', icon: TrendingUp, color: 'from-emerald-400 to-green-500', angle: 166.2 },
  { id: 'code-studio', name: 'Code Studio', icon: Code, color: 'from-cyan-400 to-teal-500', angle: 193.9 },
  { id: 'creative-writer', name: 'Creative Writer', icon: PenTool, color: 'from-pink-400 to-rose-500', angle: 221.6 },
  { id: 'presentations', name: 'Presentations', icon: Presentation, color: 'from-orange-400 to-red-500', angle: 249.3 },
  { id: 'language-tutor', name: 'Language Tutor', icon: Languages, color: 'from-indigo-400 to-purple-500', angle: 277 },
  { id: 'meeting-ai', name: 'Meeting AI', icon: Video, color: 'from-teal-400 to-cyan-500', angle: 304.7 },
  { id: 'ar-vr-lab', name: 'AR/VR Lab', icon: Glasses, color: 'from-violet-400 to-fuchsia-500', angle: 332.4 },
]

export default function Home() {
  const [activeService, setActiveService] = useState<string | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-hidden relative">
      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            initial={{ 
              x: Math.random() * window.innerWidth, 
              y: Math.random() * window.innerHeight,
              opacity: Math.random() 
            }}
            animate={{ 
              y: [null, Math.random() * -100],
              opacity: [null, 0] 
            }}
            transition={{ 
              duration: Math.random() * 3 + 2, 
              repeat: Infinity,
              delay: Math.random() * 2 
            }}
          />
        ))}
      </div>

      {/* Gradient Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div 
          animate={{ 
            x: mousePosition.x * 0.05, 
            y: mousePosition.y * 0.05 
          }}
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[128px]" 
        />
        <motion.div 
          animate={{ 
            x: -mousePosition.x * 0.03, 
            y: -mousePosition.y * 0.03 
          }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[128px]" 
        />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#05070A]/50 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold">Avatar G</h1>
              <p className="text-xs text-gray-400">Singularity Protocol v4.0</p>
            </div>
          </motion.div>
          
          <nav className="hidden md:flex items-center gap-6">
            {['Dashboard', 'Services', 'Workspace', 'Settings'].map((item) => (
              <button key={item} className="text-sm text-gray-400 hover:text-white transition-colors">
                {item}
              </button>
            ))}
          </nav>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-sm font-semibold"
          >
            Create Identity
          </motion.button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative min-h-screen flex items-center justify-center pt-20">
        <div className="relative w-full max-w-6xl mx-auto px-6">
          
          {/* Central Avatar */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="w-64 h-64 rounded-full border-2 border-dashed border-cyan-500/30 absolute inset-0"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="w-80 h-80 rounded-full border border-purple-500/20 absolute -inset-8"
            />
            <motion.div
              whileHover={{ scale: 1.1 }}
              className="w-48 h-48 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 backdrop-blur-xl border border-white/20 flex items-center justify-center cursor-pointer relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-20 transition-opacity" />
              <User size={64} className="text-cyan-400" />
              <motion.div
                className="absolute inset-0 bg-gradient-to-t from-cyan-500/0 via-cyan-500/10 to-cyan-500/0"
                animate={{ y: ["100%", "-100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          </div>

          {/* Service Orbit */}
          <div className="relative h-[600px] flex items-center justify-center">
            {services.map((service, index) => {
              const Icon = service.icon
              const radius = 280
              const angle = (index * 360) / services.length
              const x = Math.cos((angle * Math.PI) / 180) * radius
              const y = Math.sin((angle * Math.PI) / 180) * radius

              return (
                <Link key={service.id} href={`/services/${service.id}`}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.2, zIndex: 50 }}
                    className="absolute"
                    style={{ 
                      left: `calc(50% + ${x}px)`, 
                      top: `calc(50% + ${y}px)`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    <motion.div
                      whileHover={{ boxShadow: `0 0 40px rgba(6,182,212,0.5)` }}
                      className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${service.color} p-[2px] cursor-pointer group`}
                    >
                      <div className="w-full h-full rounded-2xl bg-[#0A0F1C] flex items-center justify-center group-hover:bg-transparent transition-colors">
                        <Icon size={28} className="text-white" />
                      </div>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      whileHover={{ opacity: 1, y: 0 }}
                      className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-medium bg-[#0A0F1C] px-3 py-1 rounded-lg border border-white/10"
                    >
                      {service.name}
                    </motion.div>
                  </motion.div>
                </Link>
              )
            })}
          </div>

          {/* Bottom Info */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5 }}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center"
          >
            <p className="text-gray-500 text-sm">Select a service to begin</p>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
