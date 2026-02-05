"use client";

import { useIdentity } from "@/lib/identity/IdentityContext";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, User, Volume2, ArrowRight } from "lucide-react";
import Link from "next/link";

interface IdentityGuardProps {
  children: React.ReactNode;
  requiredService?: string;
}

export default function IdentityGuard({ children, requiredService }: IdentityGuardProps) {
  const { verifyIdentity, globalAvatarId, globalVoiceId } = useIdentity();
  const isVerified = verifyIdentity();

  if (!isVerified) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full bg-[#1A1A1A] border border-[#D4AF37]/30 rounded-3xl p-8 text-center"
        >
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-red-500/20 flex items-center justify-center"
          >
            <AlertTriangle className="w-12 h-12 text-[#D4AF37]" />
          </motion.div>

          <h2 className="text-3xl font-bold text-[#D4AF37] mb-4">
            Identity Verification Required
          </h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            To use {requiredService || "this service"}, you must first establish your Digital Twin identity through Avatar Builder and Voice Cloning.
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className={`p-6 rounded-2xl border ${globalAvatarId ? 'border-[#00FFFF] bg-[#00FFFF]/10' : 'border-[#D4AF37]/30 bg-[#0A0A0A]'}`}>
              <User className={`w-8 h-8 mx-auto mb-3 ${globalAvatarId ? 'text-[#00FFFF]' : 'text-gray-600'}`} />
              <p className="font-semibold mb-1">{globalAvatarId ? 'Avatar Established' : 'Avatar Required'}</p>
              <p className="text-xs text-gray-500">{globalAvatarId || 'Not created'}</p>
            </div>
            <div className={`p-6 rounded-2xl border ${globalVoiceId ? 'border-[#00FFFF] bg-[#00FFFF]/10' : 'border-[#D4AF37]/30 bg-[#0A0A0A]'}`}>
              <Volume2 className={`w-8 h-8 mx-auto mb-3 ${globalVoiceId ? 'text-[#00FFFF]' : 'text-gray-600'}`} />
              <p className="font-semibold mb-1">{globalVoiceId ? 'Voice Cloned' : 'Voice Required'}</p>
              <p className="text-xs text-gray-500">{globalVoiceId || 'Not created'}</p>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            {!globalAvatarId && (
              <Link href="/services/avatar-builder">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-xl text-black font-bold flex items-center gap-2"
                >
                  Create Avatar
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
              </Link>
            )}
            {!globalVoiceId && globalAvatarId && (
              <Link href="/services/voice-cloning">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-xl text-black font-bold flex items-center gap-2"
                >
                  Clone Voice
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
