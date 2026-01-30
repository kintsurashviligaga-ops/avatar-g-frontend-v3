"use client";

import React from "react";
import { motion } from "framer-motion";
import { MessageSquare, Send, Sparkles } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

export default function TextIntelligencePage() {
  return (
    <ServicePageShell
      title="Text Intelligence"
      description="Advanced NLP for content creation"
      icon={<MessageSquare className="w-5 h-5 text-white" />}
      gradient="from-cyan-500 to-blue-600"
    >
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-1 space-y-4"
        >
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
            <div className="space-y-2">
              {["Generate Content", "Summarize Text", "Translate", "Analyze Sentiment"].map((action) => (
                <button
                  key={action}
                  className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-sm"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Main Chat Area */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2"
        >
          <div className="h-[600px] rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col">
            {/* Chat Header */}
            <div className="p-4 border-b border-white/10 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm text-gray-400">AI Assistant Online</span>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 p-4 rounded-2xl bg-white/5 text-gray-300 text-sm">
                  Hello! I&apos;m your Text Intelligence assistant. How can I help you today?
                </div>
              </div>
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
                >
                  <Send className="w-5 h-5" />
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </ServicePageShell>
  );
}
