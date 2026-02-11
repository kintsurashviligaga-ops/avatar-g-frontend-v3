"use client"

import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useState, useEffect } from "react"
import { 
  User, Film, Music, Camera, Star, Zap,
  Play, Bell, Search, Menu, X,
  ArrowRight, ArrowUpRight, Activity
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RocketLogo } from "@/components/ui/RocketLogo"

// Services data - 4 Core Services Only
const services = [
  { 
    id: 'avatar-builder', 
    name: 'Avatar Builder', 
    shortName: 'Avatar',
    icon: User, 
    color: 'from-cyan-400 to-blue-500',
    bgColor: 'bg-cyan-500/20',
    description: 'Create your digital twin with AI',
    features: ['3D Scan', 'Customization', 'Style Transfer'],
    isNew: false,
    isPopular: true
  },
  { 
    id: 'media-production', 
    name: 'Video Generation', 
    shortName: 'Video',
    icon: Film, 
    color: 'from-red-400 to-orange-500',
    bgColor: 'bg-red-500/20',
    description: 'Professional AI video generation',
    features: ['AI Video', 'Editing', 'Export'],
    isNew: false,
    isPopular: true
  },
  { 
    id: 'photo-studio', 
    name: 'Image Generation', 
    shortName: 'Images',
    icon: Camera, 
    color: 'from-yellow-400 to-amber-500',
    bgColor: 'bg-yellow-500/20',
    description: 'AI-powered image creation',
    features: ['Generate', 'Edit', 'Enhance'],
    isNew: false,
    isPopular: true
  },
  { 
    id: 'music-studio', 
    name: 'Music Generation', 
    shortName: 'Music',
    icon: Music, 
    color: 'from-green-400 to-emerald-500',
    bgColor: 'bg-green-500/20',
    description: 'Create music with AI',
    features: ['Compose', 'Record', 'Master'],
    isNew: false,
    isPopular: true
  },
]

// Stats
const stats = [
  { value: '4', label: 'Core Services', icon: Zap },
  { value: '50K+', label: 'Active Users', icon: User },
  { value: '1M+', label: 'Creations', icon: Star },
  { value: '99.9%', label: 'Uptime', icon: Activity },
]

export default function Home() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [isAutoRotating, setIsAutoRotating] = useState(true)
  const [rotation, setRotation] = useState(0)

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Scroll tracking
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto rotation
  useEffect(() => {
    if (!isAutoRotating) return
    const interval = setInterval(() => {
      setRotation(prev => (prev + 0.2) % 360)
    }, 50)
    return () => clearInterval(interval)
  }, [isAutoRotating])

  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Stars */}
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{ 
              left: `${Math.random() * 100}%`, 
              top: `${Math.random() * 100}%`,
            }}
            animate={{ 
              opacity: [0.2, 1, 0.2],
              scale: [1, 1.5, 1]
            }}
            transition={{ 
              duration: Math.random() * 3 + 2, 
              repeat: Infinity,
              delay: Math.random() * 2 
            }}
          />
        ))}

        {/* Gradient Orbs */}
        <motion.div 
          animate={{ 
            x: mousePosition.x * 0.02, 
            y: mousePosition.y * 0.02 
          }}
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[150px]" 
        />
        <motion.div 
          animate={{ 
            x: -mousePosition.x * 0.015, 
            y: -mousePosition.y * 0.015 
          }}
          className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[150px]" 
        />
      </div>

      {/* Navigation */}
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrollY > 50 ? 'bg-[#05070A]/90 backdrop-blur-xl border-b border-white/5' : ''
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <motion.div 
            className="flex items-center gap-3"
            whileHover={{ scale: 1.02 }}
          >
            <div className="relative">
              {/* Rocket Logo */}
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                <motion.div
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
                    <path d="M12 2C12 2 8 6 8 10C8 12 9 14 12 14C15 14 16 12 16 10C16 6 12 2 12 2Z" fill="currentColor"/>
                    <path d="M12 14V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M9 18L12 14L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 10C4 10 2 12 2 14C2 16 4 17 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M17 10C20 10 22 12 22 14C22 16 20 17 17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </motion.div>
              </div>
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 blur-lg opacity-50 -z-10" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Avatar G
              </h1>
              <p className="text-xs text-gray-400">Singularity Protocol v4.0</p>
            </div>
          </motion.div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {['Services', 'Features', 'Pricing', 'About'].map((item) => (
              <motion.a 
                key={item}
                href={`#${item.toLowerCase()}`}
                className="text-sm text-gray-400 hover:text-white transition-colors relative group"
                whileHover={{ y: -2 }}
              >
                {item}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-cyan-400 group-hover:w-full transition-all" />
              </motion.a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="hidden md:flex">
              <Search size={20} />
            </Button>
            <Button variant="ghost" size="icon" className="hidden md:flex relative">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </Button>
            <Button 
              variant="primary" 
              size="sm"
              className="hidden md:flex"
            >
              Create Identity
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-[#0A0F1C] border-b border-white/10"
            >
              <div className="px-6 py-4 space-y-4">
                {['Services', 'Features', 'Pricing', 'About'].map((item) => (
                  <a 
                    key={item}
                    href={`#${item.toLowerCase()}`}
                    className="block text-gray-400 hover:text-white py-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item}
                  </a>
                ))}
                <Button variant="primary" className="w-full">
                  Create Identity
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-32 md:pt-24 pb-16 md:pb-32 px-4 sm:px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center lg:text-left"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-6"
              >
                <Star size={14} className="text-cyan-400" />
                <span className="text-sm text-cyan-400">New: Agent G is now available</span>
              </motion.div>

              {/* DEPLOY MARKER - VISIBLE TEST */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 border border-green-500/50 mb-6 ml-0 md:ml-2"
              >
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm text-green-300 font-mono">DEPLOY_MARKER_2026-02-12_v1</span>
              </motion.div>

              <h1 
                className="font-bold mb-6 leading-tight text-white"
                style={{
                  fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                }}
              >
                Create with{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                  AI Power
                </span>
              </h1>
              
              <p 
                className="text-gray-400 mb-8 max-w-2xl mx-auto lg:mx-0"
                style={{
                  fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
                }}
              >
                13 professional AI services to create, edit, and enhance your digital content. 
                From avatars to music, code to video.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button variant="glow" size="lg" className="group">
                  Get Started
                  <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button variant="outline" size="lg">
                  <Play size={18} className="mr-2" />
                  Watch Demo
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 mt-12 pt-8 sm:pt-12 border-t border-white/10">
                {stats.map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="text-center"
                  >
                    <p className="font-bold text-white" style={{ fontSize: 'clamp(1.25rem, 3vw, 1.875rem)' }}>{stat.value}</p>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">{stat.label}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Right Content - Orbital Interface */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="relative h-[400px] sm:h-[500px] md:h-[600px] hidden lg:block"
            >
              {/* Central Avatar */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="w-80 h-80 rounded-full border-2 border-dashed border-cyan-500/20 absolute -inset-8"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                  className="w-96 h-96 rounded-full border border-purple-500/10 absolute -inset-16"
                />
                
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsAutoRotating(!isAutoRotating)}
                  className="relative w-64 h-64 rounded-full bg-gradient-to-br from-cyan-400/10 to-blue-500/10 backdrop-blur-xl border-2 border-white/20 flex items-center justify-center group overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-20 transition-opacity" />
                  
                  {/* Rocket Icon in Center */}
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" className="text-cyan-400">
                      <path d="M12 2C12 2 8 6 8 10C8 12 9 14 12 14C15 14 16 12 16 10C16 6 12 2 12 2Z" fill="currentColor"/>
                      <path d="M12 14V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M9 18L12 14L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M7 10C4 10 2 12 2 14C2 16 4 17 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M17 10C20 10 22 12 22 14C22 16 20 17 17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </motion.div>
                  
                  {/* Scanning effect */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-t from-cyan-500/0 via-cyan-500/20 to-cyan-500/0"
                    animate={{ y: ['100%', '-100%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  />
                </motion.button>

                {/* Center label */}
                <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center">
                  <p className="text-sm text-gray-400">Your Digital Identity</p>
                  <p className="text-xs text-cyan-400">Click to customize</p>
                </div>
              </div>

              {/* Orbital Services */}
              <div 
                className="absolute inset-0"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                {services.map((service, index) => {
                  const Icon = service.icon
                  const angle = (index * 360) / services.length
                  const radius = 220
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
                          className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${service.color} p-[2px] cursor-pointer group`}
                          style={{ transform: `rotate(-${rotation}deg)` }}
                        >
                          <div className="w-full h-full rounded-2xl bg-[#0A0F1C] flex items-center justify-center group-hover:bg-transparent transition-colors">
                            <Icon size={24} className="text-white" />
                          </div>
                        </motion.div>
                        
                        {/* Tooltip */}
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.9 }}
                          whileHover={{ opacity: 1, y: 0, scale: 1 }}
                          className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
                        >
                          <div className="bg-[#0A0F1C] px-3 py-1.5 rounded-lg border border-white/10 text-sm font-medium shadow-xl">
                            {service.shortName}
                          </div>
                        </motion.div>
                      </motion.div>
                    </Link>
                  )
                })}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="w-6 h-10 rounded-full border-2 border-white/20 flex justify-center pt-2">
            <motion.div
              animate={{ y: [0, 12, 0], opacity: [1, 0, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-cyan-400"
            />
          </div>
        </motion.div>
      </section>

      {/* Services Grid Section */}
      <section id="services" className="py-16 sm:py-24 md:py-32 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 
              className="font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent"
              style={{
                fontSize: 'clamp(1.875rem, 4vw, 2.25rem)',
              }}
            >
              All <span>AI Services</span>
            </h2>
            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto px-2">
              Everything you need to create professional content, powered by cutting-edge AI
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {services.map((service, index) => {
              const Icon = service.icon
              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link href={`/services/${service.id}`}>
                    <Card 
                      className="h-full p-6 group cursor-pointer hover:scale-[1.02] transition-all duration-300"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center flex-shrink-0`}>
                          <Icon size={24} className="text-white" />
                        </div>
                        <div className="flex gap-2 ml-2">
                          {service.isNew && (
                            <Badge variant="success" className="text-xs">New</Badge>
                          )}
                          {service.isPopular && (
                            <Badge variant="default" className="text-xs bg-gradient-to-r from-yellow-400 to-orange-500 text-black">Popular</Badge>
                          )}
                        </div>
                      </div>

                      <h3 className="text-lg font-semibold mb-2 group-hover:text-cyan-400 transition-colors">
                        {service.name}
                      </h3>
                      <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                        {service.description}
                      </p>

                      <div className="space-y-2">
                        {service.features.map((feature, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                            <Zap size={12} className="text-cyan-400 flex-shrink-0" />
                            <span className="truncate">{feature}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                        <span className="text-sm text-cyan-400">Open Service</span>
                        <ArrowUpRight size={16} className="text-cyan-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform flex-shrink-0" />
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24 md:py-32 relative px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative p-8 sm:p-12 md:p-16 rounded-3xl bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-pink-500/20 border border-white/10 overflow-hidden"
          >
            <h2 
              className="font-bold mb-4 sm:mb-6 relative z-10 text-white"
              style={{
                fontSize: 'clamp(1.875rem, 4vw, 2.25rem)',
              }}
            >
              Ready to Create?
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-400 mb-8 relative z-10">
              Join thousands of creators using Avatar G to bring their ideas to life.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 relative z-10">
              <Button variant="glow" size="lg" className="w-full sm:w-auto">
                Get Started Free
                <ArrowRight size={18} className="ml-2" />
              </Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                View Pricing
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 sm:py-12 border-t border-white/10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                  <path d="M12 2C12 2 8 6 8 10C8 12 9 14 12 14C15 14 16 12 16 10C16 6 12 2 12 2Z" fill="currentColor"/>
                  <path d="M12 14V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="font-bold text-sm sm:text-base">Avatar G</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 text-center">
              © 2024 Avatar G. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
