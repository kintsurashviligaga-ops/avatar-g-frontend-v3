"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Home, 
  User, 
  Film,
  Camera,
  Music,
  LayoutDashboard, 
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { useIdentity } from "@/lib/identity/IdentityContext";

export default function Navigation() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { globalAvatarId, verifyIdentity } = useIdentity();
  
  const hasIdentity = verifyIdentity();

  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/services/avatar-builder", label: "Avatar", icon: User },
    { href: "/services/media-production", label: "Video", icon: Film },
    { href: "/services/photo-studio", label: "Images", icon: Camera },
    { href: "/services/music-studio", label: "Music", icon: Music },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-white/10">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#00FFFF] flex items-center justify-center">
              <span className="text-black font-bold text-sm">G</span>
            </div>
            <span className="font-bold text-xl bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] bg-clip-text text-transparent">
              Avatar G
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-4 py-2 rounded-lg transition-colors ${
                    isActive ? "text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute inset-0 bg-white/10 rounded-lg -z-10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Identity Badge */}
          <div className="hidden md:flex items-center gap-3">
            {hasIdentity ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#00FFFF]/10 border border-[#00FFFF]/30 rounded-full">
                <div className="w-2 h-2 rounded-full bg-[#00FFFF] animate-pulse" />
                <span className="text-xs text-[#00FFFF] font-mono">
                  {globalAvatarId?.slice(0, 8)}...
                </span>
              </div>
            ) : (
              <Link
                href="/services/avatar-builder"
                className="px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black text-sm font-semibold rounded-lg"
              >
                Create Identity
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-white"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <motion.div
        initial={false}
        animate={{ height: isMobileMenuOpen ? "auto" : 0, opacity: isMobileMenuOpen ? 1 : 0 }}
        className="md:hidden overflow-hidden bg-[#0A0A0A] border-b border-white/10"
      >
        <div className="px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                pathname === item.href ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
        </div>
      </motion.div>
    </nav>
  );
}
