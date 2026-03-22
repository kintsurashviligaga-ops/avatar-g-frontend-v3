'use client';

/**
 * components/service-chat/ServiceHamburgerMenu.tsx
 * ==================================================
 * Premium slide-in hamburger menu for each service chatbot.
 * Each service gets its own menu items from config.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ICON_MAP } from './icons';
import type { ServiceChatConfig, HamburgerMenuItem } from './types';

interface Props {
  config: ServiceChatConfig;
  isOpen: boolean;
  language: string;
  onClose: () => void;
  onAction: (action: string) => void;
}

export function ServiceHamburgerMenu({ config, isOpen, language, onClose, onAction }: Props) {
  const lang = (language || 'en') as 'en' | 'ka' | 'ru';
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
            className="absolute left-0 top-0 bottom-0 z-30 w-[260px] flex flex-col"
            style={{
              background: 'var(--color-surface)',
              borderRight: '1px solid var(--color-border)',
              boxShadow: '8px 0 32px rgba(0,0,0,0.3)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                  style={{
                    background: `${config.accentColor}18`,
                    border: `1px solid ${config.accentColor}30`,
                  }}
                >
                  {config.icon}
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {config.name[lang] || config.name.en}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Menu items */}
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
              {config.hamburgerMenu.map((item, idx) => (
                <div key={item.id}>
                  {item.divider && idx > 0 && (
                    <div className="my-2 mx-2" style={{ borderTop: '1px solid var(--color-border)' }} />
                  )}
                  <MenuItemRow
                    item={item}
                    lang={lang}
                    accentColor={config.accentColor}
                    onAction={onAction}
                    onClose={onClose}
                  />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 text-[10px]" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
              Powered by Agent G
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function MenuItemRow({
  item,
  lang,
  accentColor,
  onAction,
  onClose,
}: {
  item: HamburgerMenuItem;
  lang: 'en' | 'ka' | 'ru';
  accentColor: string;
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const Icon = ICON_MAP[item.icon];
  const label = item.label[lang] || item.label.en;
  const isTransfer = item.action.startsWith('transfer-');

  return (
    <button
      onClick={() => { onAction(item.action); onClose(); }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-white/5 group"
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
        style={{
          background: isTransfer ? `${accentColor}12` : 'rgba(255,255,255,0.04)',
          color: isTransfer ? accentColor : 'var(--color-text-secondary)',
        }}
      >
        {Icon ? <Icon className="w-4 h-4" /> : <span className="text-xs">{item.icon}</span>}
      </div>
      <span
        className="text-[13px] font-medium truncate"
        style={{ color: isTransfer ? accentColor : 'var(--color-text-secondary)' }}
      >
        {label}
      </span>
    </button>
  );
}
