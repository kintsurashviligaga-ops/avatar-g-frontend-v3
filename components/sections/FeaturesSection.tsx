"use client";

import { motion } from "framer-motion";
import { 
  Fingerprint, 
  Mic, 
  Video, 
  Image as ImageIcon, 
  Music, 
  MessageSquare,
  Shield,
  Zap
} from "lucide-react";

const features = [
  {
    icon: Fingerprint,
    title: "Digital Identity",
    description: "Create a unique AI avatar with 32-point facial mesh technology",
    color: "from-[#D4AF37] to-yellow-600"
  },
  {
    icon: Mic,
    title: "Voice Cloning",
    description: "Clone your voice with 97.3% accuracy using just 60 seconds of audio",
    color: "from-[#00FFFF] to-cyan-600"
  },
  {
    icon: Video,
    title: "Video Generation",
    description: "Generate professional videos with your avatar as the presenter",
    color: "from-purple-500 to-pink-600"
  },
  {
    icon: ImageIcon,
    title: "Image Forge",
    description: "Create stunning images featuring your digital twin",
    color: "from-blue-500 to-indigo-600"
  },
  {
    icon: Music,
    title: "Music Studio",
    description: "Compose original music with AI-generated vocals in your voice",
    color: "from-orange-500 to-red-600"
  },
  {
    icon: MessageSquare,
    title: "Executive Agent",
    description: "AI assistant that calls you with updates using your cloned voice",
    color: "from-green-500 to-emerald-600"
  }
];

export default function FeaturesSection() {
  return (
    <section className="py-24 relative">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] bg-clip-text text-transparent">
              Core Features
            </span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Everything you need to create, manage, and deploy your digital twin
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, idx) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              whileHover={{ y: -5 }}
              className="group p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:border-white/20 transition-all"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${feature.color} p-0.5 mb-4`}>
                <div className="w-full h-full rounded-xl bg-[#0A0A0A] flex items-center justify-center group-hover:bg-transparent transition-colors">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
              </div>
              
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-16 flex flex-wrap justify-center gap-8"
        >
          {[
            { icon: Shield, label: "Enterprise Security" },
            { icon: Zap, label: "Real-time Processing" },
            { icon: Fingerprint, label: "Identity Verified" }
          ].map((badge, idx) => (
            <div key={idx} className="flex items-center gap-2 text-gray-500">
              <badge.icon className="w-5 h-5" />
              <span className="text-sm">{badge.label}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
