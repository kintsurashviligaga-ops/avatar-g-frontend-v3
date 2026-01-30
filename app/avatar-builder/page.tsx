"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { User, Upload, Wand2, Download, RefreshCw } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

export default function AvatarBuilderPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [step, setStep] = useState<'upload' | 'processing' | 'result'>('upload');

  const handleGenerate = () => {
    setIsGenerating(true);
    setStep('processing');
    setTimeout(() => {
      setIsGenerating(false);
      setStep('result');
    }, 3000);
  };

  return (
    <ServicePageShell
      serviceId="avatar-builder"
      serviceNameKa="Avatar Builder"
      serviceNameEn="Avatar Builder"
      serviceDescriptionKa="შექმენით თქვენი პერსონალური 3D ავატარი. სურათიდან რეალისტურ მოდელამდე."
      serviceDescriptionEn="Create your personal 3D avatar. From photo to realistic model."
      icon={<User className="w-6 h-6 text-white" />}
      gradient="from-cyan-500 to-blue-600"
      agentGContext="ავატარის შესაქმნელად დამჭირდება თქვენი ფოტო. აირჩიეთ კარგი განათება, სახის პირდაპირ კამერასთან. / To create your avatar, I'll need your photo. Choose good lighting, face directly at the camera."
    >
      <div className="p-6">
        {step === 'upload' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Upload Zone */}
            <div className="border-2 border-dashed border-white/20 rounded-2xl p-12 text-center hover:border-cyan-500/50 transition-colors cursor-pointer bg-white/5">
              <Upload className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                ატვირთეთ ფოტო / Upload Photo
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                JPG, PNG, WEBP • მაქს. 10MB
              </p>
              <button className="px-6 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
                აირჩიეთ ფაილი / Choose File
              </button>
            </div>

            {/* Style Options */}
            <div>
              <h4 className="text-sm font-medium text-white mb-3">სტილი / Style</h4>
              <div className="grid grid-cols-3 gap-3">
                {['რეალისტური / Realistic', 'სტილიზებული / Stylized', '3D კატრუნი / 3D Cartoon'].map((style, i) => (
                  <button
                    key={i}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:border-cyan-500/50 hover:text-white transition-all"
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGenerate}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-2"
            >
              <Wand2 className="w-5 h-5" />
              გენერაცია / Generate
            </motion.button>
          </motion.div>
        )}

        {step === 'processing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-12 text-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 rounded-full border-4 border-cyan-500/30 border-t-cyan-400 mx-auto mb-6"
            />
            <h3 className="text-xl font-medium text-white mb-2">
              ვმუშაობ... / Processing...
            </h3>
            <p className="text-sm text-gray-400">
              AI ანალიზს აკეთებს თქვენი სახის / AI is analyzing your face
            </p>
          </motion.div>
        )}

        {step === 'result' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <div className="aspect-square rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
              <div className="text-center">
                <User className="w-24 h-24 text-cyan-400 mx-auto mb-4" />
                <p className="text-white font-medium">თქვენი ავატარი / Your Avatar</p>
                <p className="text-sm text-gray-400">3D მოდელი მზადაა / 3D model ready</p>
              </div>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                ჩამოტვირთვა / Download
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStep('upload')}
                className="px-4 py-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </div>
    </ServicePageShell>
  );
}
