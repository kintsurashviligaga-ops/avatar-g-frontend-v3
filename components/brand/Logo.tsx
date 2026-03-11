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
    container: 'w-[44px] h-[44px]',
    text: 'text-sm',
    tagline: 'text-[10px]',
    gap: 'gap-2'
  },
  md: {
    container: 'w-[60px] h-[60px]',
    text: 'text-xl',
    tagline: 'text-xs',
    gap: 'gap-3'
  },
  lg: {
    container: 'w-[82px] h-[82px]',
    text: 'text-2xl',
    tagline: 'text-sm',
    gap: 'gap-4'
  },
  xl: {
    container: 'w-[102px] h-[102px]',
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
    <div className={cn(config.container, 'relative overflow-hidden')}>
      <div className="absolute inset-[10%] rounded-full bg-indigo-400/[0.06] blur-xl" />
      <Image
        src="/brand/rocket-3d-hq.svg"
        alt="MyAvatar.ge Rocket"
        fill
        className="object-contain object-center drop-shadow-[0_8px_20px_rgba(99,102,241,0.28)] md:drop-shadow-[0_10px_24px_rgba(99,102,241,0.30)] lg:drop-shadow-[0_12px_28px_rgba(99,102,241,0.32)]"
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
          'font-extrabold tracking-[-0.01em] bg-gradient-to-r from-cyan-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent'
        )}
      >
        Avatar G
      </h1>
      {showTagline && (
        <p className={cn(config.tagline, 'text-gray-400 tracking-[0.01em]')}>Singularity v4.0</p>
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
