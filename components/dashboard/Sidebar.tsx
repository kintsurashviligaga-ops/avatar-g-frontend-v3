'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { 
  LayoutDashboard, 
  ShoppingBag, 
  TrendingUp, 
  DollarSign, 
  Rocket,
  Users,
  Settings,
  BarChart3,
  Package,
  CreditCard,
  FileText,
  Bell,
  Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  userRole?: 'seller' | 'admin' | 'buyer'
  className?: string
}

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  badge?: string
  roles: ('seller' | 'admin' | 'buyer')[]
}

export function DashboardSidebar({ userRole = 'seller', className }: SidebarProps) {
  const pathname = usePathname()
  const _t = useTranslations()

  // Georgian navigation items (using translation keys)
  const navItems: NavItem[] = [
    // Seller Dashboard
    {
      label: 'მთავარი დაფა', // Main Dashboard
      href: '/dashboard/seller',
      icon: <LayoutDashboard className="w-5 h-5" />, 
      roles: ['seller']
    },
    {
      label: 'პროდუქტები', // Products
      href: '/dashboard/shop/products',
      icon: <Package className="w-5 h-5" />,
      roles: ['seller']
    },
    {
      label: 'შეკვეთები', // Orders
      href: '/dashboard/shop/orders',
      icon: <ShoppingBag className="w-5 h-5" />,
      roles: ['seller']
    },
    {
      label: 'ფინანსები', // Finance
      href: '/dashboard/shop/finance',
      icon: <DollarSign className="w-5 h-5" />,
      roles: ['seller']
    },
    {
      label: 'გადახდები', // Payouts
      href: '/dashboard/shop/payouts',
      icon: <CreditCard className="w-5 h-5" />,
      roles: ['seller']
    },
    {
      label: 'პროგნოზი', // Forecast
      href: '/dashboard/forecast',
      icon: <TrendingUp className="w-5 h-5" />,
      roles: ['seller']
    },
    {
      label: 'გაშვების გეგმა', // Launch Plan
      href: '/dashboard/shop/launch',
      icon: <Rocket className="w-5 h-5" />,
      roles: ['seller']
    },
    {
      label: 'ინვოისები', // Invoices
      href: '/dashboard/shop/invoices',
      icon: <FileText className="w-5 h-5" />,
      roles: ['seller']
    },
    
    // Admin Dashboard
    {
      label: 'ადმინ დაფა', // Admin Dashboard
      href: '/dashboard/admin',
      icon: <Shield className="w-5 h-5" />,
      badge: 'ადმინი',
      roles: ['admin']
    },
    {
      label: 'სისტემის ჯანმრთელობა', // System Health
      href: '/dashboard/admin/system-health',
      icon: <BarChart3 className="w-5 h-5" />,
      roles: ['admin']
    },
    {
      label: 'გაყიდველები', // Sellers
      href: '/dashboard/admin/sellers',
      icon: <Users className="w-5 h-5" />,
      roles: ['admin']
    },
    {
      label: 'გადახდები', // Payments
      href: '/dashboard/admin/payments',
      icon: <CreditCard className="w-5 h-5" />,
      roles: ['admin']
    },
    {
      label: 'გადახდების მოთხოვნები', // Payout Requests
      href: '/dashboard/admin/payouts',
      icon: <DollarSign className="w-5 h-5" />,
      roles: ['admin']
    },
    
    // Common items
    {
      label: 'შეტყობინებები', // Notifications
      href: '/dashboard/notifications',
      icon: <Bell className="w-5 h-5" />,
      badge: '3',
      roles: ['seller', 'admin', 'buyer']
    },
    {
      label: 'პარამეტრები', // Settings
      href: '/dashboard/settings',
      icon: <Settings className="w-5 h-5" />,
      roles: ['seller', 'admin', 'buyer']
    }
  ]

  // Filter items by user role
  const filteredItems = navItems.filter(item => item.roles.includes(userRole))

  const isActive = (href: string) => {
    if (href === '/dashboard/seller') {
      return pathname === href
    }
    return pathname?.startsWith(href)
  }

  return (
    <aside className={cn(
      'w-64 bg-[#0A0F1C] border-r border-white/10 min-h-screen p-6',
      className
    )}>
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-white mb-1">
          {userRole === 'admin' ? 'ადმინისტრაციის პანელი' : 'გამყიდველის დაფა'}
        </h2>
        <p className="text-sm text-gray-400">
          {userRole === 'admin' ? 'სისტემის მართვა' : 'თქვენი მაღაზიის მართვა'}
        </p>
      </div>

      {/* Navigation */}
      <nav className="space-y-1">
        {filteredItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center justify-between px-4 py-3 rounded-lg transition-all group',
              isActive(item.href)
                ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'transition-colors',
                isActive(item.href) ? 'text-cyan-400' : 'text-gray-500 group-hover:text-gray-300'
              )}>
                {item.icon}
              </div>
              <span className="font-medium text-sm">{item.label}</span>
            </div>
            {item.badge && (
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                isActive(item.href)
                  ? 'bg-cyan-500/30 text-cyan-300'
                  : 'bg-white/10 text-gray-400'
              )}>
                {item.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-white/10">
        <div className="text-xs text-gray-500">
          <p className="mb-1">Avatar G v3.0</p>
          <p>AI Commerce Platform</p>
        </div>
      </div>
    </aside>
  )
}
