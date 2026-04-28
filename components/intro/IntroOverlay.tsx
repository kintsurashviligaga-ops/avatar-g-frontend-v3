'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import IntroSequence from './IntroSequence';

const STORAGE_KEY = 'myavatar_intro_v1';

interface IntroOverlayProps {
  /** Force show even if already seen (for testing) */
  force?: boolean;
}

export default function IntroOverlay({ force = false }: IntroOverlayProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (force || !seen) {
        setShow(true);
      }
    } catch {
      // localStorage blocked (private browsing etc.) — skip intro
    }
  }, [force]);

  const handleComplete = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && <IntroSequence key="intro" onComplete={handleComplete} />}
    </AnimatePresence>
  );
}
