"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Volume2, VolumeX } from "lucide-react";

interface NavigationProps {
  activeSection: string;
  onNavigate: (id: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

const NAV_ITEMS = [
  { id: "hero", label: "მთავარი" },
  { id: "services", label: "სერვისები" },
  { id: "agent", label: "Agent G" },
  { id: "pricing", label: "ფასები" },
];

export default function Navigation({
  activeSection,
  onNavigate,
  soundEnabled,
  onToggleSound,
}: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeIndex = useMemo(() => {
    const idx = NAV_ITEMS.findIndex((i) => i.id === activeSection);
    return idx === -1 ? 0 : idx;
  }, [activeSection]);

  // Body scroll lock on mobile menu
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Basic focus trap inside panel when open (small + safe)
  useEffect(() => {
    if (!isOpen) return;

    const root = panelRef.current;
    if (!root) return;

    const selector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const focusables = Array.from(root.querySelectorAll<HTMLElement>(selector));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    first?.focus();

    const onTrap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (focusables.length === 0) return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    root.addEventListener("keydown", onTrap);
    return () => root.removeEventListener("keydown", onTrap);
  }, [isOpen]);

  const handleNavigate = (id: string) => {
    setIsOpen(false);
    onNavigate(id);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Top bar */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mt-4 sm:mt-6 rounded-2xl sm:rounded-3xl border border-white/10 bg-black/50 backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
            {/* Brand */}
            <button
              onClick={() => handleNavigate("hero")}
              className="flex items-center gap-2 sm:gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500/50 rounded-xl"
              aria-label="Avatar G - მთავარზე დაბრუნება"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm sm:text-base">
                  G
                </span>
              </div>
              <div className="leading-tight text-left">
                <div className="text-white font-bold text-sm sm:text-base">
                  Avatar G
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500">
                  Neo-Silver Futurism
                </div>
              </div>
            </button>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item, idx) => {
                const isActive = item.id === activeSection;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className={`relative px-4 py-2 rounded-full text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500/50 ${
                      isActive
                        ? "text-white"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-full bg-white/10 border border-white/10"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Right controls */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={onToggleSound}
                className="p-2 sm:p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500/50"
                aria-label={soundEnabled ? "ხმის გამორთვა" : "ხმის ჩართვა"}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setIsOpen((p) => !p)}
                className="md:hidden p-2 sm:p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500/50"
                aria-label={isOpen ? "მენიუს დახურვა" : "მენიუს გახსნა"}
                aria-expanded={isOpen}
                aria-controls="mobile-nav"
              >
                {isOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile active indicator */}
          <div className="md:hidden px-4 sm:px-6 pb-3 sm:pb-4">
            <div className="relative h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className="absolute top-0 bottom-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600"
                animate={{
                  width: `${((activeIndex + 1) / NAV_ITEMS.length) * 100}%`,
                }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile overlay + panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            <motion.div
              id="mobile-nav"
              ref={panelRef}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
              className="fixed top-[88px] left-4 right-4 md:hidden rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="ნავიგაცია"
            >
              <div className="p-3">
                {NAV_ITEMS.map((item) => {
                  const isActive = item.id === activeSection;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate(item.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500/50 ${
                        isActive
                          ? "bg-white/10 text-white border border-white/10"
                          : "text-gray-300 hover:bg-white/5 hover:text-white"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span>{item.label}</span>
                      {isActive && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-500/20">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="px-4 pb-4">
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500/50"
                >
                  დახურვა
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
