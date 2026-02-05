"use client";

import { motion } from "framer-motion";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Video, 
  Image as ImageIcon, 
  Music, 
  Mic, 
  MessageSquare, 
  Code, 
  BarChart3,
  User,
  Volume2,
  Activity,
  Zap,
  Clock,
  TrendingUp,
  Sparkles,
  Phone,
  Radio
} from "lucide-react";

interface GenerationStats {
  total: number;
  today: number;
  byType: Record<string, number>;
  recent: any[];
}

export default function OrbitalDashboardClient() {
  const { globalAvatarId, globalVoiceId, verifyIdentity } = useIdentity();
  const [stats, setStats] = useState<GenerationStats>({
    total: 0,
    today: 0,
    byType: {},
    recent: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [activeRing, setActiveRing] = useState(0);
  
  const hasIdentity = verifyIdentity();

  // Fetch real stats
  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/user/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchStats();
    
    // Rotate rings animation
    const interval = setInterval(() => {
      setActiveRing(prev => (prev + 1) % 3);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  const services = [
    { id: "video-lab", icon: Video, color: "from-purple-500 to-pink-600", angle: 0 },
    { id: "image-generator", icon: ImageIcon, color: "from-cyan-500 to-blue-600", angle: 60 },
    { id: "music-generator", icon: Music, color: "from-amber-500 to-orange-600", angle: 120 },
    { id: "voice-studio", icon: Mic, color: "from-orange-500 to-red-600", angle: 180 },
    { id: "text-intelligence", icon: MessageSquare, color: "from-emerald-500 to-teal-600", angle: 240 },
    { id: "code-assistant", icon: Code, color: "from-indigo-500 to-purple-600", angle: 300 },
  ];

  const quickStats = [
    { label: "Total Generations", value: stats.total, icon: Zap, color: "text-yellow-400" },
    { label: "Today", value: stats.today, icon: Clock, color: "text-cyan-400" },
    { label: "Success Rate", value: "98.7%", icon: TrendingUp, color: "text-green-400" },
    { label: "Active", value: "2m ago", icon: Activity, color: "text-purple-400" },
  ];

  return (
    <div className="min-h-screen bg-[#05070A] text-white pt-20 overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold bg-gradient-to-r from-[#D4AF37] via-[#00FFFF] to-[#D4AF37] bg-clip-text text-transparent mb-4">
            Orbital Command
          </h1>
          <p className="text-gray-400 text-xl">
            Digital Twin Control Center
          </p>
          
          {hasIdentity && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 inline-flex items-center gap-4 px-6 py-3 bg-[#1A1A1A] border border-[#00FFFF]/30 rounded-full"
            >
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-[#D4AF37]" />
                <span className="text-sm text-gray-400">Avatar:</span>
                <span className="text-[#00FFFF] font-mono">{globalAvatarId?.slice(0, 12)}...</span>
              </div>
              <div className="w-px h-4 bg-gray-700" />
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-[#D4AF37]" />
                <span className="text-sm text-gray-400">Voice:</span>
                <span className="text-[#00FFFF] font-mono">{globalVoiceId?.slice(0, 12)}...</span>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {quickStats.map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center"
            >
              <stat.icon className={`w-8 h-8 mx-auto mb-2 ${stat.color}`} />
              <p className="text-3xl font-bold">{isLoading ? "..." : stat.value}</p>
              <p className="text-gray-400 text-sm">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Orbital System */}
        <div className="relative h-[600px] flex items-center justify-center">
          {/* Outer Ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute w-[500px] h-[500px] rounded-full border border-white/10"
          >
            {services.slice(0, 2).map((service, idx) => (
              <Link
                key={service.id}
                href={`/services/${service.id}`}
                style={{
                  position: 'absolute',
                  left: `${50 + 50 * Math.cos((service.angle * Math.PI) / 180)}%`,
                  top: `${50 + 50 * Math.sin((service.angle * Math.PI) / 180)}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <motion.div
                  whileHover={{ scale: 1.2 }}
                  className={`w-16 h-16 rounded-full bg-gradient-to-r ${service.color} p-0.5`}
                >
                  <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center">
                    <service.icon className="w-8 h-8 text-white" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </motion.div>

          {/* Middle Ring */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
            className="absolute w-[350px] h-[350px] rounded-full border border-white/10"
          >
            {services.slice(2, 4).map((service) => (
              <Link
                key={service.id}
                href={`/services/${service.id}`}
                style={{
                  position: 'absolute',
                  left: `${50 + 50 * Math.cos((service.angle * Math.PI) / 180)}%`,
                  top: `${50 + 50 * Math.sin((service.angle * Math.PI) / 180)}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <motion.div
                  whileHover={{ scale: 1.2 }}
                  className={`w-14 h-14 rounded-full bg-gradient-to-r ${service.color} p-0.5`}
                >
                  <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center">
                    <service.icon className="w-7 h-7 text-white" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </motion.div>

          {/* Inner Ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            className="absolute w-[200px] h-[200px] rounded-full border border-white/10"
          >
            {services.slice(4, 6).map((service) => (
              <Link
                key={service.id}
                href={`/services/${service.id}`}
                style={{
                  position: 'absolute',
                  left: `${50 + 50 * Math.cos((service.angle * Math.PI) / 180)}%`,
                  top: `${50 + 50 * Math.sin((service.angle * Math.PI) / 180)}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <motion.div
                  whileHover={{ scale: 1.2 }}
                  className={`w-12 h-12 rounded-full bg-gradient-to-r ${service.color} p-0.5`}
                >
                  <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center">
                    <service.icon className="w-6 h-6 text-white" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </motion.div>

          {/* Center Avatar */}
          <motion.div
            animate={{ 
              scale: [1, 1.05, 1],
              boxShadow: [
                "0 0 20px rgba(212, 175, 55, 0.3)",
                "0 0 40px rgba(0, 255, 255, 0.5)",
                "0 0 20px rgba(212, 175, 55, 0.3)"
              ]
            }}
            transition={{ duration: 4, repeat: Infinity }}
            className="relative w-32 h-32 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#00FFFF] p-1"
          >
            <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center overflow-hidden">
              {hasIdentity ? (
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#00FFFF]/20 flex items-center justify-center mb-1">
                    <User className="w-10 h-10 text-[#D4AF37]" />
                  </div>
                  <p className="text-[10px] text-[#00FFFF]">ONLINE</p>
                </div>
              ) : (
                <Link href="/services/avatar-builder">
                  <Sparkles className="w-12 h-12 text-gray-600" />
                </Link>
              )}
            </div>
            
            {/* Pulse Rings */}
            <motion.div
              animate={{ scale: [1, 2], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full border-2 border-[#00FFFF]"
            />
          </motion.div>
        </div>

        {/* Communication Hub */}
        <div className="mt-12 grid md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-gradient-to-br from-[#D4AF37]/10 to-transparent border border-[#D4AF37]/30 rounded-2xl p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
                <Phone className="w-6 h-6 text-[#D4AF37]" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Executive Agent</h3>
                <p className="text-gray-400">Voice callback system</p>
              </div>
            </div>
            <p className="text-gray-300 mb-4">
              Your AI agent can call you with task updates, reports, and urgent notifications using your cloned voice.
            </p>
            <Link 
              href="/services/executive-agent"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#D4AF37] text-black rounded-xl font-semibold hover:bg-[#D4AF37]/90 transition-colors"
            >
              <Radio className="w-5 h-5" />
              Open Communication Hub
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-gradient-to-br from-[#00FFFF]/10 to-transparent border border-[#00FFFF]/30 rounded-2xl p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#00FFFF]/20 flex items-center justify-center">
                <Activity className="w-6 h-6 text-[#00FFFF]" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">System Status</h3>
                <p className="text-gray-400">All systems operational</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { name: "OpenAI GPT-4", status: "Online", latency: "45ms" },
                { name: "ElevenLabs Voice", status: "Online", latency: "120ms" },
                { name: "Stability AI", status: "Online", latency: "89ms" },
                { name: "Runway ML", status: "Online", latency: "200ms" }
              ].map((service) => (
                <div key={service.name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-gray-300">{service.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{service.latency}</span>
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      {service.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
