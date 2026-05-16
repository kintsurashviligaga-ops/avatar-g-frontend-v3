'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PromptChipsProps {
  activeService: string;
  onSelect: (prompt: string) => void;
}

const SERVICE_CHIPS: Record<string, string[]> = {
  image: [
    'ლომი ღამის ცაზე 🦁',
    'თბილისი შუქებით 🌆',
    'ქართული ფერწერის სტილი 🎨',
    'Futuristic avatar portrait',
    'Cyberpunk street scene 🌃',
  ],
  music: [
    'ქართული ხალხური 🎻',
    'Electronic beats 🎵',
    'Cinematic score 🎬',
    'Upbeat pop 🎤',
    'Lo-fi chill hop 🎧',
  ],
  video: [
    'Tbilisi old town sunset 🌅',
    'Mountain landscape drone 🏔️',
    'City timelapse 🌃',
    'Abstract art animation',
    'Slow motion waterfall 💧',
  ],
  voice: [
    'ახალი ამბები ქართულად 📰',
    'Podcast intro ხმა',
    'Product promo VO',
    'Meditation guide 🧘',
    'Storytelling narration 📖',
  ],
  avatar: [
    'AI news anchor ქართულად',
    'CEO announcement',
    'Customer support bot',
    'Tutorial presenter',
    'Social media influencer 🎯',
  ],
  chat: [
    'ბიზნეს გეგმა ჩემი სტარტაპისთვის',
    'Instagram caption ideas',
    'Email template professional',
    'Story idea for short film',
    'Marketing strategy outline 📊',
  ],
  text: [
    'ბიზნეს გეგმა ჩემი სტარტაპისთვის',
    'Instagram caption ideas',
    'Email template professional',
    'Story idea for short film',
    'Marketing strategy outline 📊',
  ],
  code: [
    'Next.js API route',
    'Python web scraper',
    'React hook for form validation',
    'SQL query optimizer',
    'TypeScript utility types 🛠️',
  ],
};

const DEFAULT_CHIPS: string[] = [
  'ბიზნეს გეგმა ჩემი სტარტაპისთვის',
  'Instagram caption ideas',
  'Email template professional',
  'Story idea for short film',
  'Marketing strategy outline 📊',
];

function getChips(service: string): string[] {
  const chips: string[] | undefined = SERVICE_CHIPS[service];
  return chips ?? DEFAULT_CHIPS;
}

export default function PromptChips({ activeService, onSelect }: PromptChipsProps) {
  const chips = getChips(activeService);
  // Key changes when activeService changes — triggers re-mount for re-animation
  const [animKey, setAnimKey] = useState(activeService);
  const [flashedChip, setFlashedChip] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Slight delay so exit animation can play before re-entering
    const t = setTimeout(() => {
      setAnimKey(activeService);
    }, 80);
    return () => clearTimeout(t);
  }, [activeService]);

  // Reset scroll position when service changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }, [activeService]);

  const handleClick = (chip: string) => {
    setFlashedChip(chip);
    onSelect(chip);
    setTimeout(() => setFlashedChip(null), 600);
  };

  return (
    <div className="pc-root">
      <AnimatePresence mode="wait">
        <motion.div
          key={animKey}
          className="pc-row"
          ref={scrollRef}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {chips.map((chip, i) => (
            <motion.button
              key={chip}
              className={`pc-chip${flashedChip === chip ? ' pc-chip--flash' : ''}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleClick(chip)}
            >
              {chip}
            </motion.button>
          ))}
        </motion.div>
      </AnimatePresence>

      <style jsx>{`
        .pc-root {
          width: 100%;
          overflow: hidden;
          /* Fade edges */
          mask-image: linear-gradient(
            to right,
            transparent 0%,
            black 4%,
            black 92%,
            transparent 100%
          );
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0%,
            black 4%,
            black 92%,
            transparent 100%
          );
        }
        .pc-row {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          padding: 2px 12px;
          scrollbar-width: none;
          -ms-overflow-style: none;
          /* Prevent row from collapsing */
          min-height: 36px;
        }
        .pc-row::-webkit-scrollbar {
          display: none;
        }
        .pc-chip {
          flex-shrink: 0;
          white-space: nowrap;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 6px 14px;
          font-size: 13px;
          color: #a0a0c0;
          cursor: pointer;
          transition:
            background 0.15s,
            border-color 0.15s,
            color 0.15s,
            box-shadow 0.15s;
          line-height: 1;
          font-family: inherit;
        }
        .pc-chip:hover {
          background: rgba(129, 140, 248, 0.1);
          border-color: rgba(129, 140, 248, 0.35);
          color: #c8caff;
          box-shadow: 0 0 12px rgba(129, 140, 248, 0.2);
        }
        .pc-chip--flash {
          background: rgba(129, 140, 248, 0.22) !important;
          border-color: rgba(129, 140, 248, 0.6) !important;
          color: #e0e2ff !important;
          box-shadow: 0 0 18px rgba(129, 140, 248, 0.35) !important;
        }
      `}</style>
    </div>
  );
}
