"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, User, Volume2, Image as ImageIcon, 
  Palette, Globe, Bell, Shield, Database, 
  ChevronRight, LogOut, CreditCard, Activity
} from 'lucide-react';
import { useIdentityStore } from '@/store/identity-store';
import Link from 'next/link';

const MENU_ITEMS = [
  { id: 'profile', name: 'Digital Identity', icon: User, description: 'Manage your avatar and voice' },
  { id: 'appearance', name: 'Appearance', icon: Palette, description: 'Theme and visual settings' },
  { id: 'language', name: 'Language', icon: Globe, description: 'Interface language' },
  { id: 'notifications', name: 'Notifications', icon: Bell, description: 'Alert preferences' },
  { id: 'privacy', name: 'Privacy & Security', icon: Shield, description: 'Data protection settings' },
  { id: 'storage', name: 'Storage', icon: Database, description: 'Manage your assets' },
  { id: 'billing', name: 'Billing', icon: CreditCard, description: 'Subscription and payments' },
];

export default function ControlPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');
  const { avatar, voice, clearIdentity } = useIdentityStore();

  return (
    <>
      {/* Control Panel Toggle */}
      <motion.button
        className="fixed top-6 right-6 z-50 w-10 h-10 rounded-full glass-panel flex items-center justify-center hover:bg-cyan-500/20"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Settings className="w-5 h-5 text-cyan-400" />
      </motion.button>

      {/* Control Panel Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-96 glass-panel z-50 overflow-y-auto"
            >
              {/* Header */}
              <div className="p-6 border-b border-cyan-500/20">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-glow">Control Panel</h2>
                  <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-cyan-500/10 rounded-lg">
                    <Settings className="w-5 h-5 text-cyan-400" />
                  </button>
                </div>
                
                {/* Identity Status */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-cyan-500/20">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center">
                    {avatar ? (
                      <img src={avatar.imageUrl} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{avatar?.name || 'Guest User'}</p>
                    <p className="text-xs text-cyan-400/70">
                      {avatar && voice ? 'Full Identity Active' : 'Identity Incomplete'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {avatar && <div className="w-2 h-2 rounded-full bg-green-400" />}
                    {voice && <div className="w-2 h-2 rounded-full bg-purple-400" />}
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="p-4 space-y-2">
                {MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${isActive ? 'bg-cyan-500/20 border border-cyan-500/30' : 'hover:bg-black/20 border border-transparent'}`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isActive ? 'bg-cyan-500/30' : 'bg-black/30'}`}>
                        <Icon className={`w-5 h-5 ${isActive ? 'text-cyan-400' : 'text-cyan-400/70'}`} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-sm font-medium ${isActive ? 'text-white' : 'text-cyan-400/90'}`}>{item.name}</p>
                        <p className="text-xs text-cyan-400/50">{item.description}</p>
                      </div>
                      <ChevronRight className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-cyan-400/30'}`} />
                    </button>
                  );
                })}
              </div>

              {/* Quick Actions */}
              <div className="p-4 border-t border-cyan-500/20 mt-auto">
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <Link href="/services/avatar-builder">
                    <button className="w-full p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors">
                      <ImageIcon className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                      <p className="text-xs text-cyan-400">Create Avatar</p>
                    </button>
                  </Link>
                  <Link href="/services/voice-cloner">
                    <button className="w-full p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors">
                      <Volume2 className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                      <p className="text-xs text-purple-400">Clone Voice</p>
                    </button>
                  </Link>
                </div>
                
                <button 
                  onClick={clearIdentity}
                  className="w-full flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Clear Identity</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
