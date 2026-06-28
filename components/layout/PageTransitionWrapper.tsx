'use client';

import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    // OPACITY-ONLY (no y/transform). The studio shell is `position: fixed inset-0`, and a
    // CSS transform on this wrapper makes those fixed pages relative to the WRAPPER instead
    // of the viewport DURING the transition — briefly revealing the page behind (the
    // reported "ghost page" / flash on navigation). Opacity never creates a containing block
    // for fixed descendants, so the fixed shell stays viewport-locked. The solid bg keeps
    // the cross-fade opaque so nothing shows through.
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        className="min-h-[100dvh] bg-app-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
