import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'full' | 'icon' | 'text'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  href?: string
  className?: string
  showTagline?: boolean
}

const sizeConfig = {
  sm: {
    container: 'w-10 h-10',
    text: 'text-sm',
    tagline: 'text-[10px]',
    gap: 'gap-2'
  },
  md: {
    container: 'w-14 h-14',
    text: 'text-xl',
    tagline: 'text-xs',
    gap: 'gap-3'
  },
  lg: {
    container: 'w-20 h-20',
    text: 'text-2xl',
    tagline: 'text-sm',
    gap: 'gap-4'
  },
  xl: {
    container: 'w-24 h-24',
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
    <div className={cn(config.container, 'relative overflow-hidden rounded-xl')}>
      <Image
        src="/brand/logo-rocket.svg"
        alt="Avatar G"
        fill
        className="object-contain drop-shadow-[0_0_16px_rgba(34,211,238,0.45)]"
        sizes="80px"
        priority
      />
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
