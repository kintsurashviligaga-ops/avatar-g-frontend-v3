"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { 
  User, 
  Volume2, 
  Bell, 
  Shield, 
  CreditCard, 
  Trash2,
  Save,
  CheckCircle,
  AlertTriangle
} from "lucide-react";

export default function SettingsClient() {
  const { globalAvatarId, globalVoiceId, clearIdentity } = useIdentity();
  const [activeTab, setActiveTab] = useState("profile");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "voice", label: "Voice", icon: Volume2 },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "billing", label: "Billing", icon: CreditCard },
  ];

  const handleDeleteIdentity = () => {
    clearIdentity();
    setShowDeleteConfirm(false);
  };

  return (
    <div className="min-h-screen bg-[#05070A] text-white pt-20">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-gray-400">Manage your digital identity and preferences</p>
        </motion.div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-[#D4AF37]/20 to-[#00FFFF]/20 text-white"
                      : "text-gray-400 hover:bg-white/5"
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Danger Zone */}
            <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl">
              <h3 className="text-cyan-300 font-semibold mb-2">Integrations</h3>
              <Link
                href="/settings/integrations/telegram"
                className="block w-full py-2 text-center bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 rounded-lg text-sm transition-colors"
              >
                Telegram Webhook Setup
              </Link>
            </div>

            {/* Danger Zone */}
            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
              <h3 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Danger Zone
              </h3>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
              >
                Delete Identity
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/5 border border-white/10 rounded-2xl p-6"
            >
              {activeTab === "profile" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold mb-4">Digital Identity</h2>
                  
                  <div className="grid gap-4">
                    <div className="p-4 bg-black/30 rounded-xl">
                      <label className="text-sm text-gray-400 block mb-2">Avatar ID</label>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
                          <User className="w-5 h-5 text-[#D4AF37]" />
                        </div>
                        <code className="flex-1 text-[#00FFFF] font-mono text-sm bg-black/50 px-3 py-2 rounded-lg">
                          {globalAvatarId || "Not created"}
                        </code>
                      </div>
                    </div>

                    <div className="p-4 bg-black/30 rounded-xl">
                      <label className="text-sm text-gray-400 block mb-2">Voice ID</label>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#00FFFF]/20 flex items-center justify-center">
                          <Volume2 className="w-5 h-5 text-[#00FFFF]" />
                        </div>
                        <code className="flex-1 text-[#00FFFF] font-mono text-sm bg-black/50 px-3 py-2 rounded-lg">
                          {globalVoiceId || "Not created"}
                        </code>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button className="px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-xl font-semibold flex items-center gap-2">
                      <Save className="w-4 h-4" />
                      Save Changes
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "voice" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold mb-4">Voice Settings</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-400 block mb-2">Default Emotion</label>
                      <select className="w-full bg-black/30 border border-white/20 rounded-xl px-4 py-3 text-white">
                        <option>Neutral</option>
                        <option>Happy</option>
                        <option>Serious</option>
                        <option>Excited</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 block mb-2">Stability</label>
                      <input type="range" className="w-full accent-[#00FFFF]" min="0" max="100" defaultValue="75" />
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 block mb-2">Similarity Boost</label>
                      <input type="range" className="w-full accent-[#00FFFF]" min="0" max="100" defaultValue="85" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold mb-4">Notification Preferences</h2>
                  {[
                    "Generation complete",
                    "Voice callbacks",
                    "Security alerts",
                    "Weekly digest"
                  ].map((setting) => (
                    <label key={setting} className="flex items-center justify-between p-4 bg-black/30 rounded-xl cursor-pointer hover:bg-black/40 transition-colors">
                      <span>{setting}</span>
                      <input type="checkbox" defaultChecked className="w-5 h-5 accent-[#00FFFF]" />
                    </label>
                  ))}
                </div>
              )}

              {activeTab === "security" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold mb-4">Security Settings</h2>
                  
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-500" />
                    <div>
                      <p className="font-semibold text-green-400">Identity Verified</p>
                      <p className="text-sm text-gray-400">Your digital twin is secure</p>
                    </div>
                  </div>

                  <button className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-colors">
                    <p className="font-semibold">Change Password</p>
                    <p className="text-sm text-gray-400">Last changed 30 days ago</p>
                  </button>

                  <button className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-colors">
                    <p className="font-semibold">Two-Factor Authentication</p>
                    <p className="text-sm text-gray-400">Enable 2FA for extra security</p>
                  </button>
                </div>
              )}

              {activeTab === "billing" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold mb-4">Subscription</h2>
                  
                  <div className="p-6 bg-gradient-to-br from-[#D4AF37]/20 to-[#00FFFF]/10 border border-[#D4AF37]/30 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm text-gray-400">Current Plan</p>
                        <p className="text-2xl font-bold">Free Tier</p>
                      </div>
                      <span className="px-3 py-1 bg-[#00FFFF]/20 text-[#00FFFF] rounded-full text-sm">
                        Active
                      </span>
                    </div>
                    
                    <div className="space-y-2 mb-6">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Generations used</span>
                        <span>156 / 1000</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full w-[15%] bg-gradient-to-r from-[#D4AF37] to-[#00FFFF]" />
                      </div>
                    </div>

                    <button className="w-full py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-xl font-semibold">
                      Upgrade to Pro
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="max-w-md w-full bg-[#1A1A1A] border border-red-500/30 rounded-2xl p-6"
          >
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            
            <h3 className="text-xl font-bold text-center mb-2">Delete Identity?</h3>
            <p className="text-gray-400 text-center mb-6">
              This will permanently delete your avatar and voice data. This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteIdentity}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
