"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { 
  User, 
  Volume2, 
  Video, 
  Image as ImageIcon, 
  Music, 
  FileText, 
  Code, 
  BarChart3,
  MessageSquare,
  Phone,
  Settings,
  Bell,
  Activity,
  Zap,
  Shield,
  Globe
} from "lucide-react";

// 1980s Executive Luxury Colors
const colors = {
  gold: "#D4AF37",
  cyan: "#00FFFF",
  obsidian: "#0A0A0A",
  obsidianLight: "#1A1A1A",
  glass: "rgba(26, 26, 26, 0.85)"
};

interface Service {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  status: "active" | "idle" | "processing";
  lastUsed: string;
}

interface Notification {
  id: string;
  type: "call" | "message" | "alert";
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export default function OrbitalDashboardClient() {
  const [activeOrbit, setActiveOrbit] = useState(1);
  const [notifications, setNotifications] = useState<Notification[]>([
    { id: "1", type: "call", title: "Incoming Call", message: "Avatar G Executive Agent", time: "2 min ago", read: false },
    { id: "2", type: "message", title: "Generation Complete", message: "Video Lab: Project Alpha ready", time: "15 min ago", read: false },
    { id: "3", type: "alert", title: "Identity Sync", message: "Global avatar updated successfully", time: "1 hour ago", read: true }
  ]);
  const [systemStatus, setSystemStatus] = useState({
    avatarIntegrity: 98.7,
    voiceIntegrity: 97.2,
    apiLatency: 147,
    activeServices: 6
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const services: Service[] = [
    { id: "avatar-builder", name: "Avatar Builder", icon: User, color: "from-[#D4AF37] to-[#00FFFF]", status: "active", lastUsed: "2 hours ago" },
    { id: "voice-cloning", name: "Voice Clone", icon: Volume2, color: "from-[#00FFFF] to-[#D4AF37]", status: "active", lastUsed: "1 hour ago" },
    { id: "video-lab", name: "Video Lab", icon: Video, color: "from-purple-500 to-pink-500", status: "idle", lastUsed: "3 hours ago" },
    { id: "image-generator", name: "Image Forge", icon: ImageIcon, color: "from-cyan-500 to-blue-500", status: "idle", lastUsed: "5 hours ago" },
    { id: "music-generator", name: "Music Studio", icon: Music, color: "from-emerald-500 to-teal-500", status: "idle", lastUsed: "1 day ago" },
    { id: "text-intelligence", name: "Text AI", icon: FileText, color: "from-orange-500 to-red-500", status: "active", lastUsed: "30 min ago" }
  ];

  const recentGenerations = [
    { id: 1, type: "video", title: "Q4 Presentation", service: "Video Lab", time: "2 hours ago", thumbnail: "🎬" },
    { id: 2, type: "image", title: "Product Mockup v3", service: "Image Forge", time: "4 hours ago", thumbnail: "🎨" },
    { id: 3, type: "audio", title: "Podcast Intro", service: "Voice Clone", time: "6 hours ago", thumbnail: "🎙️" },
    { id: 4, type: "code", title: "API Integration", service: "Code Forge", time: "8 hours ago", thumbnail: "💻" }
  ];

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white overflow-hidden">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0A0A0A]/90 backdrop-blur-md border-b border-[#D4AF37]/20 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#00FFFF] flex items-center justify-center">
              <User className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#D4AF37]">Orbital Command</h1>
              <p className="text-xs text-gray-400">Digital Twin Protocol v1.0</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* System Status */}
            <div className="hidden md:flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00FFFF] animate-pulse" />
                <span className="text-gray-400">API: {systemStatus.apiLatency}ms</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-gray-400">Integrity: {systemStatus.avatarIntegrity}%</span>
              </div>
            </div>

            {/* Time */}
            <div className="text-right">
              <p className="text-lg font-mono text-[#D4AF37]">
                {currentTime.toLocaleTimeString('en-US', { hour12: false })}
              </p>
              <p className="text-xs text-gray-400">
                {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button className="p-2 hover:bg-[#1A1A1A] rounded-lg transition-colors">
                <Bell className="w-5 h-5 text-[#D4AF37]" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Settings */}
            <button className="p-2 hover:bg-[#1A1A1A] rounded-lg transition-colors">
              <Settings className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Orbital Interface */}
      <div className="pt-24 pb-8 px-6 min-h-screen flex flex-col items-center justify-center relative">
        {/* Background Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(212,175,55,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(212,175,55,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
        
        {/* Orbital Rings */}
        <div className="relative w-[800px] h-[800px] flex items-center justify-center">
          {/* Outer Ring - Orbit 3 */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute w-[700px] h-[700px] rounded-full border border-[#D4AF37]/10"
          >
            {activeOrbit === 3 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <div className="bg-[#1A1A1A] border border-[#D4AF37]/30 rounded-xl p-4 w-48">
                  <h3 className="text-[#D4AF37] font-semibold mb-2">System Status</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avatar</span>
                      <span className="text-[#00FFFF]">{systemStatus.avatarIntegrity}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Voice</span>
                      <span className="text-[#00FFFF]">{systemStatus.voiceIntegrity}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Services</span>
                      <span className="text-[#00FFFF]">{systemStatus.activeServices}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Middle Ring - Orbit 2 */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
            className="absolute w-[500px] h-[500px] rounded-full border border-[#00FFFF]/10"
          >
            {activeOrbit === 2 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <div className="bg-[#1A1A1A] border border-[#00FFFF]/30 rounded-xl p-4 w-64">
                  <h3 className="text-[#00FFFF] font-semibold mb-3">Recent Generations</h3>
                  <div className="space-y-2">
                    {recentGenerations.map((gen) => (
                      <div key={gen.id} className="flex items-center gap-3 p-2 bg-[#0A0A0A] rounded-lg">
                        <span className="text-lg">{gen.thumbnail}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{gen.title}</p>
                          <p className="text-xs text-gray-500">{gen.service} • {gen.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Inner Ring - Orbit 1 */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            className="absolute w-[300px] h-[300px] rounded-full border border-[#D4AF37]/20"
          >
            {services.map((service, index) => {
              const angle = (index * 60) * (Math.PI / 180);
              const x = Math.cos(angle) * 150;
              const y = Math.sin(angle) * 150;
              
              return (
                <motion.div
                  key={service.id}
                  style={{ 
                    position: 'absolute',
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  whileHover={{ scale: 1.2 }}
                  className="cursor-pointer"
                  onClick={() => setActiveOrbit(1)}
                >
                  <Link href={`/services/${service.id}`}>
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-r ${service.color} flex items-center justify-center shadow-lg`}>
                      <service.icon className="w-6 h-6 text-white" />
                    </div>
                    {activeOrbit === 1 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap"
                      >
                        <span className="text-xs text-[#D4AF37] font-medium">{service.name}</span>
                      </motion.div>
                    )}
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Center - 3D Avatar */}
          <motion.div
            animate={{ 
              scale: [1, 1.05, 1],
              rotateY: [0, 360]
            }}
            transition={{ 
              scale: { duration: 4, repeat: Infinity },
              rotateY: { duration: 20, repeat: Infinity, ease: "linear" }
            }}
            className="relative w-40 h-40"
          >
            {/* Avatar Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#D4AF37]/30 to-[#00FFFF]/30 rounded-full blur-3xl" />
            
            {/* Avatar Sphere */}
            <div className="relative w-full h-full rounded-full bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border-2 border-[#D4AF37]/50 flex items-center justify-center overflow-hidden">
              {/* Brushed metal texture */}
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')] opacity-20" />
              
              {/* Avatar Face */}
              <div className="relative z-10 text-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#F5D0C5] to-[#E8B4A0] mx-auto mb-2 border-2 border-[#D4AF37]/30">
                  {/* Eyes */}
                  <div className="flex justify-center gap-4 pt-8">
                    <div className="w-4 h-4 rounded-full bg-[#4A90E2] shadow-[0_0_10px_#4A90E2]" />
                    <div className="w-4 h-4 rounded-full bg-[#4A90E2] shadow-[0_0_10px_#4A90E2]" />
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00FFFF] animate-pulse" />
                  <span className="text-xs text-[#D4AF37] font-mono">ONLINE</span>
                </div>
              </div>

              {/* Orbital Rings on Avatar */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-4 rounded-full border border-[#D4AF37]/20"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute inset-8 rounded-full border border-[#00FFFF]/20"
              />
            </div>
          </motion.div>
        </div>

        {/* Orbit Selector */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
          {[1, 2, 3].map((orbit) => (
            <motion.button
              key={orbit}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveOrbit(orbit)}
              className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${
                activeOrbit === orbit 
                  ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]' 
                  : 'border-[#D4AF37]/30 text-gray-500 hover:border-[#D4AF37]/60'
              }`}
            >
              <span className="font-bold">{orbit}</span>
            </motion.button>
          ))}
        </div>

        {/* Communication Hub */}
        <div className="fixed bottom-8 right-8 space-y-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-14 h-14 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] flex items-center justify-center shadow-lg shadow-[#D4AF37]/30"
          >
            <Phone className="w-6 h-6 text-black" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-14 h-14 rounded-full bg-[#1A1A1A] border border-[#D4AF37]/50 flex items-center justify-center"
          >
            <MessageSquare className="w-6 h-6 text-[#D4AF37]" />
          </motion.button>
        </div>

        {/* Quick Stats */}
        <div className="fixed bottom-8 left-8 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-gray-400">
            <Globe className="w-4 h-4 text-[#00FFFF]" />
            <span>Global Node: Tokyo-7</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <Zap className="w-4 h-4 text-[#D4AF37]" />
            <span>GPU Cluster: Active</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <Activity className="w-4 h-4 text-[#00FFFF]" />
            <span>Network: 12ms</span>
          </div>
        </div>
      </div>
    </div>
  );
}
