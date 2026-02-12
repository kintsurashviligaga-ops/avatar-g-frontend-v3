"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Film, Music, Camera, Star, Zap, ArrowRight } from "lucide-react"

const services = [
  { 
    id: 'avatar-builder', 
    name: 'Avatar Builder', 
    icon: User, 
    color: 'from-cyan-400 to-blue-500',
    description: 'Create your digital twin with AI',
  },
  { 
    id: 'media-production', 
    name: 'Video Generation', 
    icon: Film, 
    color: 'from-red-400 to-orange-500',
    description: 'Professional AI video generation',
  },
  { 
    id: 'photo-studio', 
    name: 'Image Generation', 
    icon: Camera, 
    color: 'from-yellow-400 to-amber-500',
    description: 'AI-powered image creation',
  },
  { 
    id: 'music-studio', 
    name: 'Music Generation', 
    icon: Music, 
    color: 'from-green-400 to-emerald-500',
    description: 'Create music with AI',
  },
]

const stats = [
  { value: '4', label: 'Core Services', icon: Zap },
  { value: '50K+', label: 'Active Users', icon: User },
  { value: '1M+', label: 'Creations', icon: Star },
  { value: '99.9%', label: 'Uptime', icon: Zap },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-hidden">
      {/* Animated Background Gradient */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[150px]" />
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-32 md:pt-20 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-7xl mx-auto px-4 sm:px-6 w-full"
        >
          <div className="space-y-8">
            {/* Badges */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Badge className="w-fit">
                <span className="w-2 h-2 rounded-full bg-cyan-400 mr-2" />
                New: Avatar G v4.0 Released
              </Badge>
              <Badge variant="secondary" className="w-fit">
                powered by cutting-edge AI
              </Badge>
            </div>

            {/* Main Headline */}
            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-bold leading-tight">
                Create{' '}
                <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  Anything
                </span>
                {' '}with AI
              </h1>
              <p className="text-xl text-gray-400 max-w-2xl">
                Generate avatars, videos, images, and music using the power of artificial intelligence. 
                Transform your creative vision into reality in minutes.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button variant="primary" size="lg">
                  Get Started Free
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button variant="secondary" size="lg">
                  View Demo
                </Button>
              </motion.div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-12 border-t border-white/10">
              {stats.map((stat, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="space-y-2"
                >
                  <div className="text-2xl md:text-3xl font-bold text-cyan-400">
                    {stat.value}
                  </div>
                  <div className="text-sm text-gray-400">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Services Grid */}
      <section className="relative py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Core Services
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Everything you need to create professional media content
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((service, idx) => {
              const Icon = service.icon
              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ y: -8 }}
                  className="group"
                >
                  <Card className="h-full p-6 hover:border-cyan-400/50 transition-colors relative overflow-hidden">
                    {/* Gradient accent */}
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${service.color} opacity-0 group-hover:opacity-5 transition-opacity`}
                    />

                    <div className="relative space-y-4">
                      <div
                        className={`w-12 h-12 rounded-lg bg-gradient-to-br ${service.color} flex items-center justify-center`}
                      >
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold">{service.name}</h3>
                      <p className="text-sm text-gray-400">{service.description}</p>
                      <Link
                        href={`/services/${service.id}`}
                        className="inline-flex items-center text-cyan-400 hover:text-cyan-300 transition-colors text-sm font-medium"
                      >
                        Learn more
                        <ArrowRight className="ml-2 w-3 h-3" />
                      </Link>
                    </div>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Why Choose Avatar G?
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Lightning Fast',
                description: 'Generate professional content in seconds, not hours',
              },
              {
                title: 'AI-Powered',
                description: 'Cutting-edge machine learning algorithms',
              },
              {
                title: '100% Secure',
                description: 'Your data is encrypted and never shared',
              },
              {
                title: 'Easy to Use',
                description: 'No technical skills required to get started',
              },
              {
                title: 'Always Available',
                description: '99.9% uptime SLA guarantee',
              },
              {
                title: 'Affordable',
                description: 'Flexible pricing for all budgets',
              },
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="space-y-3"
              >
                <div className="w-10 h-10 rounded-lg bg-cyan-400/10 flex items-center justify-center">
                  <Star className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto text-center space-y-8"
        >
          <h2 className="text-4xl md:text-5xl font-bold">
            Ready to Create?
          </h2>
          <p className="text-xl text-gray-400">
            Join thousands of creators using Avatar G to bring their ideas to life
          </p>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button variant="primary" size="lg">
              Start Creating Now
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </motion.div>
        </motion.div>
      </section>
    </div>
  )
}
