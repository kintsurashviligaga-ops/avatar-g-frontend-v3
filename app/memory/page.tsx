"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  Search, 
  Trash2, 
  Download, 
  Brain,
  Folder,
  MessageSquare,
  Image as ImageIcon,
  Music,
  Video,
  FileText
} from "lucide-react";
import Link from "next/link";

// Mock memory data
const memoryData = [
  { id: 1, type: "project", title: "Website Redesign", date: "2024-01-15", icon: Folder, color: "blue" },
  { id: 2, type: "chat", title: "Marketing Strategy Discussion", date: "2024-01-14", icon: MessageSquare, color: "cyan" },
  { id: 3, type: "image", title: "Logo Concepts", date: "2024-01-13", icon: ImageIcon, color: "purple" },
  { id: 4, type: "music", title: "Background Track v2", date: "2024-01-12", icon: Music, color: "pink" },
  { id: 5, type: "video", title: "Product Demo", date: "2024-01-11", icon: Video, color: "red" },
  { id: 6, type: "document", title: "Business Plan 2024", date: "2024-01-10", icon: FileText, color: "green" },
];

export default function MemoryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  const toggleSelection = (id: number) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const filteredData = memoryData.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative min-h-screen bg-[#05070A]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-[rgba(5,7,10,0.9)] backdrop-blur-xl border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 h-full flex items-center justify-between">
          <Link href="/settings">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← უკან / Back
            </motion.button>
          </Link>
          <h1 className="text-lg font-bold text-white">მეხსიერება / Memory</h1>
          <div className="w-16" />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 pt-20 pb-8 px-4 max-w-3xl mx-auto">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-4 mb-6"
        >
          <div className="p-4 rounded-2xl bg-[rgba(10,20,35,0.5)] border border-white/10 text-center">
            <Brain className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">142</p>
            <p className="text-xs text-gray-500">პროექტი / Projects</p>
          </div>
          <div className="p-4 rounded-2xl bg-[rgba(10,20,35,0.5)] border border-white/10 text-center">
            <MessageSquare className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">1.2k</p>
            <p className="text-xs text-gray-500">ჩათი / Chats</p>
          </div>
          <div className="p-4 rounded-2xl bg-[rgba(10,20,35,0.5)] border border-white/10 text-center">
            <Folder className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">48MB</p>
            <p className="text-xs text-gray-500">ზომა / Size</p>
          </div>
        </motion.div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="ძებნა... / Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-[rgba(10,20,35,0.5)] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Actions */}
        {selectedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2 mb-4"
          >
            <button className="flex-1 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm flex items-center justify-center gap-2">
              <Trash2 className="w-4 h-4" />
              წაშლა / Delete ({selectedItems.length})
            </button>
            <button className="flex-1 py-2 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-sm flex items-center justify-center gap-2">
              <Download className="w-4 h-4" />
              ექსპორტი / Export
            </button>
          </motion.div>
        )}

        {/* Memory List */}
        <div className="space-y-2">
          {filteredData.map((item, index) => {
            const Icon = item.icon;
            const isSelected = selectedItems.includes(item.id);
            
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => toggleSelection(item.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? "bg-cyan-500/20 border-cyan-500/50"
                    : "bg-[rgba(10,20,35,0.5)] border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg bg-${item.color}-500/20 flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 text-${item.color}-400`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.date}</p>
                  </div>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Clear All */}
        <button className="w-full mt-6 py-3 rounded-xl bg-white/5 border border-white/10 text-red-400 text-sm hover:bg-red-500/10 transition-colors">
          მეხსიერების გასუფთავება / Clear All Memory
        </button>
      </main>
    </div>
  );
}
