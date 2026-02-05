"use client"

import { motion } from "framer-motion"
import Link from "next/link"

const services = [
  { name: "Avatar Builder", path: "/services/avatar-builder", color: "from-cyan-400 to-blue-500" },
  { name: "Voice Cloner", path: "/services/voice-cloner", color: "from-purple-400 to-pink-500" },
  { name: "Media Production", path: "/services/media-production", color: "from-red-400 to-orange-500" },
  { name: "Music Studio", path: "/services/music-studio", color: "from-green-400 to-emerald-500" },
  { name: "Photo Studio", path: "/services/photo-studio", color: "from-yellow-400 to-amber-500" },
  { name: "Executive Agent", path: "/services/executive-agent", color: "from-blue-400 to-indigo-500" },
  { name: "Finance AI", path: "/services/finance-ai", color: "from-emerald-400 to-green-500" },
  { name: "Code Studio", path: "/services/code-studio", color: "from-cyan-400 to-blue-500" },
  { name: "Creative Writer", path: "/services/creative-writer", color: "from-pink-400 to-rose-500" },
  { name: "Presentations", path: "/services/presentations", color: "from-orange-400 to-red-500" },
  { name: "Language Tutor", path: "/services/language-tutor", color: "from-indigo-400 to-purple-500" },
  { name: "Meeting AI", path: "/services/meeting-ai", color: "from-teal-400 to-cyan-500" },
  { name: "AR/VR Lab", path: "/services/ar-vr-lab", color: "from-violet-400 to-fuchsia-500" },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-[#05070A] text-white p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto"
      >
        <h1 className="text-5xl font-bold text-center mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          Avatar G
        </h1>
        <p className="text-center text-gray-400 mb-12">Singularity Protocol v3.0</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, i) => (
            <Link key={i} href={service.path}>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`p-6 rounded-xl bg-gradient-to-br ${service.color} bg-opacity-10 border border-white/10 hover:border-white/30 transition-all cursor-pointer`}
              >
                <h3 className="text-xl font-semibold">{service.name}</h3>
                <p className="text-sm text-gray-300 mt-2">Click to open</p>
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
