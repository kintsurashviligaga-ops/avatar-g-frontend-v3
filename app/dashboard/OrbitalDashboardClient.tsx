"use client";

import { motion } from "framer-motion";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { 
  Film, 
  Image as ImageIcon, 
  Music, 
  User,
  Activity,
  Zap,
  Clock,
  TrendingUp,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { getAccessToken } from "@/lib/auth/client";

// Dynamic import for 3D scene (no SSR)
const Dashboard3DScene = dynamic(
  () => import('@/components/dashboard/Dashboard3DScene'),
  { ssr: false, loading: () => <DashboardSceneFallback /> }
);

const UsageAnalytics = dynamic(
  () => import('@/components/dashboard/UsageAnalytics'),
  { ssr: false }
);

function DashboardSceneFallback() {
  return (
    <div className="w-full h-[300px] bg-gradient-to-br from-[#05070A] via-[#1A1A1A] to-[#05070A] rounded-2xl animate-pulse" />
  );
}

interface GenerationStats {
  total: number;
  total_jobs: number;
  today: number;
  jobs_today: number;
  credits_spent_today: number;
  success_rate: number;
  byType: Record<string, number>;
  top_services: Array<{ agent_id: string; count: number }>;
  recent: unknown[];
}

export default function OrbitalDashboardClient() {
  const { globalAvatarId, verifyIdentity } = useIdentity();
  const [stats, setStats] = useState<GenerationStats>({
    total: 0,
    total_jobs: 0,
    today: 0,
    jobs_today: 0,
    credits_spent_today: 0,
    success_rate: 98.7,
    byType: {},
    top_services: [],
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
    { id: "video-studio", name: "Video Studio", icon: Film, color: "from-red-500 to-orange-600" },
    { id: "image-creator", name: "Image Creator", icon: ImageIcon, color: "from-yellow-500 to-amber-600" },
    { id: "music-studio", name: "Music Studio", icon: Music, color: "from-green-500 to-emerald-600" },
  ];

  const quickStats = [
    { label: "Total Jobs", value: isLoading ? "..." : stats.total_jobs || stats.total, icon: Zap, color: "text-yellow-400" },
    { label: "Today", value: isLoading ? "..." : stats.jobs_today || stats.today, icon: Clock, color: "text-cyan-400" },
    { label: "Success Rate", value: isLoading ? "..." : `${stats.success_rate}%`, icon: TrendingUp, color: "text-green-400" },
    { label: "Status", value: "Active", icon: Activity, color: "text-purple-400" },
  ];

  return (
    <div className="min-h-screen bg-[#05070A] text-white pt-20">
      {/* Minimal Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-8 relative z-10 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-5xl font-bold bg-gradient-to-r from-[#D4AF37] via-[#00FFFF] to-[#D4AF37] bg-clip-text text-transparent mb-2">
            Command Center
          </h1>
          <p className="text-gray-400">Your Neural Control Dashboard</p>
          
          {hasIdentity && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 inline-flex items-center gap-4 px-6 py-3 bg-[#1A1A1A] border border-[#00FFFF]/30 rounded-full"
            >
              <Sparkles className="w-5 h-5 text-[#D4AF37]" />
              <span className="text-sm text-gray-400">Avatar ID:</span>
              <span className="text-[#00FFFF] font-mono text-sm">{globalAvatarId?.slice(0, 8)}...</span>
            </motion.div>
          )}
        </motion.div>

        {/* 3D Scene Hero */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          <Dashboard3DScene />
        </motion.div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {quickStats.map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.1 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-all"
            >
              <stat.icon className={`w-6 h-6 mb-2 ${stat.color}`} />
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-gray-400 text-xs">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Core Services Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Zap className="w-6 h-6 text-[#D4AF37]" />
            Core Services
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {coreServices.map((service, idx) => (
              <Link key={service.id} href={`/services/${service.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + idx * 0.05 }}
                  whileHover={{ y: -5, boxShadow: "0 0 30px rgba(0, 255, 255, 0.3)" }}
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

        {/* Usage Analytics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Activity className="w-6 h-6 text-[#00FFFF]" />
            Usage Analytics
          </h2>
          <UsageAnalytics data={{
            total_jobs: stats.total_jobs || stats.total,
            jobs_today: stats.jobs_today || stats.today,
            credits_spent_today: stats.credits_spent_today || 0,
            success_rate: stats.success_rate || 98.7,
            top_services: stats.top_services || [],
          }} />
        </motion.div>

        {/* Quick Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="grid md:grid-cols-2 gap-6"
        >
          <Link href="/dashboard/billing">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all cursor-pointer group">
              <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                Billing & Credits
              </h3>
              <p className="text-gray-400 text-sm mb-4">Manage your subscription and view credit usage</p>
              <span className="text-[#00FFFF] text-sm inline-flex items-center gap-2 group-hover:gap-3 transition-all">
                View Details <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </Link>

          <Link href="/pricing">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all cursor-pointer group">
              <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                Upgrade Plan
              </h3>
              <p className="text-gray-400 text-sm mb-4">Unlock more features with Premium</p>
              <span className="text-[#D4AF37] text-sm inline-flex items-center gap-2 group-hover:gap-3 transition-all">
                View Plans <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

