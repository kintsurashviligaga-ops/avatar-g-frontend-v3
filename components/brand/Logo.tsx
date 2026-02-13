import { Rocket } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { colors, shadows } from '@/lib/design/tokens'

interface LogoProps {
  variant?: 'full' | 'icon' | 'text'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  href?: string
  className?: string
  showTagline?: boolean
}

const sizeConfig = {
  sm: {
    icon: 'w-6 h-6',
    container: 'w-8 h-8',
    text: 'text-sm',
    tagline: 'text-[10px]',
    gap: 'gap-2'
  },
  md: {
    icon: 'w-6 h-6',
    container: 'w-12 h-12',
    text: 'text-xl',
    tagline: 'text-xs',
    gap: 'gap-3'
  },
  lg: {
    icon: 'w-8 h-8',
    container: 'w-16 h-16',
    text: 'text-2xl',
    tagline: 'text-sm',
    gap: 'gap-4'
  },
  xl: {
    icon: 'w-10 h-10',
    container: 'w-20 h-20',
    text: 'text-3xl',
    tagline: 'text-base',
    gap: 'gap-4'
  }
}

export function Logo({
  variant = 'full',
  size = 'md',
  href = '/',
  className,
  showTagline = true
}: LogoProps) {
  const config = sizeConfig[size]

  const LogoIcon = () => (
    <div className="relative">
      <div
        className={cn(
          config.container,
          'rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 hover:shadow-2xl'
        )}
        style={{
          background: colors.gradients.cyanToBlue,
          boxShadow: shadows.glow.cyan,
        }}
      >
        <Rocket className={cn(config.icon, 'text-white')} />
      </div>
    </div>
  )

  const LogoText = () => (
    <div>
      <h1
        className={cn(
          config.text,
          'font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent'
        )}
      >
        Avatar G
      </h1>
      {showTagline && (
        <p className={cn(config.tagline, 'text-gray-400')}>Singularity v4.0</p>
      )}
    </div>
  )

  const LogoContent = () => {
    switch (variant) {
      case 'icon':
        return <LogoIcon />
      case 'text':
        return <LogoText />
      case 'full':
      default:
        return (
          <>
            <LogoIcon />
            <LogoText />
          </>
        )
    }
  }

  const Wrapper = href
    ? ({ children }: { children: React.ReactNode }) => (
        <Link
          href={href}
          className={cn(
            'flex items-center hover:opacity-80 transition-opacity',
            config.gap,
            className
          )}
        >
          {children}
        </Link>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <div className={cn('flex items-center', config.gap, className)}>
          {children}
        </div>
      )

  return (
    <Wrapper>
      <LogoContent />
    </Wrapper>
  )
}

// Convenience exports for specific variants
export function LogoIcon(props: Omit<LogoProps, 'variant'>) {
  return <Logo {...props} variant="icon" />
}

export function LogoFull(props: Omit<LogoProps, 'variant'>) {
  return <Logo {...props} variant="full" />
}

export function LogoText(props: Omit<LogoProps, 'variant'>) {
  return <Logo {...props} variant="text" />
}
