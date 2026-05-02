'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'xl';
type IconPosition = 'left' | 'right';

interface GlowButtonBaseProps {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  iconPosition?: IconPosition;
  loading?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
}

interface GlowButtonWithHref extends GlowButtonBaseProps {
  href: string;
  onClick?: never;
}

interface GlowButtonWithClick extends GlowButtonBaseProps {
  href?: never;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

type GlowButtonProps = GlowButtonWithHref | GlowButtonWithClick;

const variantStyles: Record<Variant, string> = {
  primary: [
    'bg-gradient-to-r from-cyan-base to-violet-base',
    'border border-cyan-base/40',
    'text-white font-semibold',
    'shadow-glow-cyan',
    'hover:shadow-[0_0_30px_rgba(0,212,255,0.6),0_0_60px_rgba(0,212,255,0.2)]',
    'hover:border-cyan-base/70',
  ].join(' '),
  secondary: [
    'bg-gradient-to-r from-violet-base to-violet-bright',
    'border border-violet-base/40',
    'text-white font-semibold',
    'shadow-glow-violet',
    'hover:shadow-[0_0_30px_rgba(124,58,237,0.6),0_0_60px_rgba(124,58,237,0.2)]',
    'hover:border-violet-base/70',
  ].join(' '),
  ghost: [
    'bg-transparent',
    'border border-white/10',
    'text-white/80 font-medium',
    'hover:bg-white/5',
    'hover:border-white/25',
    'hover:text-white',
  ].join(' '),
  danger: [
    'bg-gradient-to-r from-crimson-base to-crimson-bright',
    'border border-crimson-base/40',
    'text-white font-semibold',
    'hover:shadow-[0_0_20px_rgba(232,58,58,0.5)]',
  ].join(' '),
};

const sizeStyles: Record<Size, string> = {
  sm:  'px-4 py-2 text-xs rounded-lg gap-1.5',
  md:  'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg:  'px-7 py-3.5 text-base rounded-xl gap-2.5',
  xl:  'px-9 py-4 text-lg rounded-2xl gap-3',
};

export function GlowButton({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  children,
  className,
  href,
  onClick,
}: GlowButtonProps) {
  const baseStyles = cn(
    'relative inline-flex items-center justify-center',
    'transition-all duration-200',
    'select-none cursor-pointer',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    variantStyles[variant],
    sizeStyles[size],
    className,
  );

  const iconEl = loading
    ? <Loader2 size={size === 'sm' ? 14 : size === 'xl' ? 20 : 16} className="animate-spin" />
    : icon ?? null;

  const inner = (
    <>
      {iconEl && iconPosition === 'left' && iconEl}
      {children && <span>{children}</span>}
      {iconEl && iconPosition === 'right' && !loading && iconEl}
    </>
  );

  if (href) {
    return (
      <motion.div
        whileHover={disabled ? {} : { scale: 1.03 }}
        whileTap={disabled ? {} : { scale: 0.97 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="inline-flex"
      >
        <Link href={href} className={baseStyles} aria-disabled={disabled}>
          {inner}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.03 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onClick={onClick}
      disabled={disabled || loading}
      className={baseStyles}
    >
      {inner}
    </motion.button>
  );
}
