"use client";

import { motion } from "framer-motion";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Film, 
  Image as ImageIcon, 
  Music, 
  User,
  Activity,
  Zap,
  Clock,
  TrendingUp,
} from "lucide-react";
import { getAccessToken } from "@/lib/auth/client";

interface GenerationStats {
  total: number;
  today: number;
  byType: Record<string, number>;
  recent: unknown[];
}

export default function OrbitalDashboardClient() {
  const { globalAvatarId, verifyIdentity } = useIdentity();
  const [stats, setStats] = useState<GenerationStats>({
    total: 0,
    today: 0,
    byType: {},
    recent: []
  });
  const [isLoading, setIsLoading] = useState(true);
  
  const hasIdentity = verifyIdentity();

  useEffect(() => {
    async function fetchStats() {
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/user/stats', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (response.ok) {
          const data = await response.json();
          setStats(data?.data || data);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchStats();
  }, []);

  const coreServices = [
    { id: "avatar-builder", name: "Avatar Builder", icon: User, color: "from-cyan-500 to-blue-600" },
    { id: "media-production", name: "Video Generation", icon: Film, color: "from-red-500 to-orange-600" },
    { id: "photo-studio", name: "Image Generation", icon: ImageIcon, color: "from-yellow-500 to-amber-600" },
    { id: "music-studio", name: "Music Generation", icon: Music, color: "from-green-500 to-emerald-600" },
  ];

  const quickStats = [
    { label: "Total Generations", value: stats.total, icon: Zap, color: "text-yellow-400" },
    { label: "Today", value: stats.today, icon: Clock, color: "text-cyan-400" },
    { label: "Success Rate", value: "98.7%", icon: TrendingUp, color: "text-green-400" },
    { label: "Status", value: "Active", icon: Activity, color: "text-purple-400" },
  ];

  return (
    <div className="min-h-screen bg-[#05070A] text-white pt-20">
      {/* Minimal Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[#D4AF37] via-[#00FFFF] to-[#D4AF37] bg-clip-text text-transparent mb-2">
            Command Center
          </h1>
          <p className="text-gray-400">Your digital twin control dashboard</p>
          
          {hasIdentity && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 inline-flex items-center gap-4 px-6 py-3 bg-[#1A1A1A] border border-[#00FFFF]/30 rounded-full"
            >
              <User className="w-5 h-5 text-[#D4AF37]" />
              <span className="text-sm text-gray-400">Avatar:</span>
              <span className="text-[#00FFFF] font-mono text-sm">{globalAvatarId?.slice(0, 8)}...</span>
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
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4"
            >
              <stat.icon className={`w-6 h-6 mb-2 ${stat.color}`} />
              <p className="text-2xl font-bold">{isLoading ? "..." : stat.value}</p>
              <p className="text-gray-400 text-xs">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Core Services Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold mb-6">Core Services</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {coreServices.map((service, idx) => (
              <Link key={service.id} href={`/services/${service.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ y: -5, boxShadow: "0 0 30px rgba(0, 255, 255, 0.2)" }}
                  className={`h-40 rounded-xl bg-gradient-to-br ${service.color} p-0.5 cursor-pointer`}
                >
                  <div className="w-full h-full rounded-xl bg-[#05070A] flex flex-col items-center justify-center gap-3 hover:bg-opacity-80 transition-all">
                    <service.icon className="w-10 h-10 text-white" />
                    <span className="text-white font-semibold text-center text-sm">{service.name}</span>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6"
        >
          <h3 className="text-xl font-semibold mb-4">Quick Access</h3>
          <div className="space-y-3">
            {[
              { title: "Create New Avatar", desc: "Start building your digital twin" },
              { title: "Generate Video", desc: "Create professional AI videos" },
              { title: "Generate Images", desc: "Make stunning AI-generated images" },
              { title: "Create Music", desc: "Compose and produce music with AI" }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + idx * 0.05 }}
                className="flex items-center gap-4 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-[#00FFFF]" />
                <div>
                  <p className="font-medium text-white">{item.title}</p>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

