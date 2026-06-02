'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/browser';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditBalanceProps {
  userId?: string;
  initialBalance?: number;
  locale?: string;
  className?: string;
  showLabel?: boolean;
  warningThreshold?: number;
}

// ─── Animated number ──────────────────────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev === value) return;

    const diff = value - prev;
    const steps = Math.min(Math.abs(diff), 30);
    const stepSize = diff / steps;
    let current = prev;
    let count = 0;

    const id = setInterval(() => {
      count++;
      current += stepSize;
      setDisplayed(count >= steps ? value : Math.round(current));
      if (count >= steps) clearInterval(id);
    }, 16);

    return () => clearInterval(id);
  }, [value]);

  return <span>{displayed}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CreditBalance({
  userId,
  initialBalance = 0,
  locale = 'ka',
  className,
  showLabel = true,
  warningThreshold = 10,
}: CreditBalanceProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [delta, setDelta] = useState<number | null>(null);
  const prevBalanceRef = useRef(initialBalance);

  const creditLabel = locale === 'ka' ? 'კრ.' : locale === 'ru' ? 'кр.' : 'cr.';
  const balanceLabel = locale === 'ka' ? 'ბალანსი' : locale === 'ru' ? 'Баланс' : 'Balance';
  const lowWarning   = locale === 'ka' ? 'კრედიტი იწურება' : locale === 'ru' ? 'Мало кредитов' : 'Low credits';

  const isLow = balance <= warningThreshold;

  // Fetch initial balance
  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return;

    supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const row = data as { credits?: number } | null;
        if (row?.credits !== undefined) {
          setBalance(row.credits);
          prevBalanceRef.current = row.credits;
        }
      });
  }, [userId]);

  // Realtime subscription via pipeline_runs
  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return;

    const channel = supabase
      .channel(`credits:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const newCredits = (payload.new as { credits?: number }).credits;
          if (newCredits !== undefined) {
            const prev = prevBalanceRef.current;
            const diff = newCredits - prev;
            prevBalanceRef.current = newCredits;
            setBalance(newCredits);
            if (diff !== 0) {
              setDelta(diff);
              setTimeout(() => setDelta(null), 2000);
            }
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return (
    <div className={cn('relative flex items-center gap-1.5', className)}>
      {/* Delta animation */}
      <AnimatePresence>
        {delta !== null && (
          <motion.span
            key={delta}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -20 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className={cn(
              'pointer-events-none absolute -top-4 right-0 text-[10px] font-bold',
              delta > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400',
            )}
          >
            {delta > 0 ? `+${delta}` : delta}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Low balance pulse */}
      {isLow && (
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-rose-400"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      <div
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1 transition-all',
          isLow
            ? 'border-rose-400/30 bg-rose-400/10'
            : 'border-app-border/10 bg-app-elevated',
        )}
      >
        <span className={cn('text-xs font-bold', isLow ? 'text-rose-500 dark:text-rose-300' : 'text-cyan-600 dark:text-cyan-300')}>
          <AnimatedNumber value={balance} />
        </span>
        <span className={cn('text-[10px]', isLow ? 'text-rose-500/70 dark:text-rose-300/70' : 'text-app-muted')}>
          {creditLabel}
        </span>
        {showLabel && (
          <span className="hidden text-[10px] text-app-muted sm:inline">{balanceLabel}</span>
        )}
      </div>

      {/* Low balance tooltip */}
      {isLow && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="hidden whitespace-nowrap rounded-full border border-rose-400/20 bg-rose-400/10 px-2 py-0.5 text-[9px] text-rose-500 dark:text-rose-300 sm:inline"
        >
          ⚠ {lowWarning}
        </motion.span>
      )}
    </div>
  );
}
