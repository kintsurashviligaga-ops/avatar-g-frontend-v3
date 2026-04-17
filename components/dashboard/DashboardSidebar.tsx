'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface DashboardSidebarProps {
  locale: string
  collapsed?: boolean
  onToggle?: () => void
}

const NAV_ITEMS = [
  { key: 'dashboard', icon: '◉', href: '' },
  { key: 'create', icon: '✦', href: '/services' },
  { key: 'agentG', icon: '◈', href: '/services/agent-g', primary: true },
  { key: 'workflows', icon: '◎', href: '/services/workflow' },
  { key: 'analytics', icon: '▣', href: '/analytics' },
  { divider: true },
  { key: 'billing', icon: '◻', href: '/billing' },
  { key: 'settings', icon: '⚙', href: '/settings' },
] as const

export function DashboardSidebar({ locale, collapsed = false, onToggle }: DashboardSidebarProps) {
  const t = useTranslations('dashboard')
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'shrink-0 flex flex-col border-r transition-all duration-300',
        collapsed ? 'w-16' : 'w-60',
      )}
      style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--nav-border)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 shrink-0" style={{ borderBottom: '1px solid var(--nav-border)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: 'linear-gradient(135deg, #00d4ff, #7c3aed)', color: '#fff' }}>
          M
        </div>
        {!collapsed && <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>MyAvatar</span>}
        <button
          onClick={onToggle}
          className="ml-auto w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 transition-colors"
          style={{ color: 'var(--color-muted)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <><path d="m9 18 6-6-6-6"/></> : <><path d="m15 18-6-6 6-6"/></>}
          </svg>
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item, i) => {
          if ('divider' in item) {
            return <div key={`d-${i}`} className="my-2 mx-2 h-px" style={{ background: 'var(--nav-border)' }} />
          }

          const href = `/${locale}${item.href}`
          const isActive = item.href === '' ? pathname === `/${locale}` : pathname?.startsWith(href)

          return (
            <Link
              key={item.key}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg transition-all duration-200',
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
                isActive
                  ? 'bg-[rgba(0,212,255,0.08)]'
                  : 'hover:bg-white/[0.04]',
              )}
              title={collapsed ? t(`sidebar.${item.key}`) : undefined}
            >
              <span
                className={cn('text-sm shrink-0', 'primary' in item && item.primary && 'text-[#00d4ff]')}
                style={{ color: isActive ? '#00d4ff' : 'var(--color-muted)' }}
              >
                {item.icon}
              </span>
              {!collapsed && (
                <span
                  className="text-sm font-medium truncate"
                  style={{ color: isActive ? '#00d4ff' : 'var(--color-text-secondary)' }}
                >
                  {t(`sidebar.${item.key}`)}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
