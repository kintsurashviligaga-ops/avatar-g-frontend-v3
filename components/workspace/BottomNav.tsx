'use client'

import { usePathname, useRouter } from 'next/navigation'

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  const navItems = [
    { id: 'home', label: 'Home', icon: 'home', path: '/' },
    { id: 'explore', label: 'Explore', icon: 'compass', path: '/explore' },
    { id: 'create', label: 'Create', icon: 'plus', path: '/create', center: true },
    { id: 'chats', label: 'Chats', icon: 'message', path: '/chats' },
    { id: 'profile', label: 'Profile', icon: 'user', path: '/profile' },
  ]

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '80px',
        background: 'rgba(10, 14, 20, 0.95)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(192, 192, 192, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 100,
      }}
    >
      {navItems.map((item) => {
        const isActive = pathname === item.path
        return (
          <button
            key={item.id}
            onClick={() => router.push(item.path)}
            style={{
              flex: item.center ? 0 : 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: item.center ? 'linear-gradient(135deg, #3B82F6, #6366F1)' : 'transparent',
              width: item.center ? '56px' : 'auto',
              height: item.center ? '56px' : 'auto',
              borderRadius: item.center ? '50%' : '0',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              top: item.center ? '-12px' : '0',
              boxShadow: item.center ? '0 8px 24px rgba(59, 130, 246, 0.3)' : 'none',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={item.center ? '#ffffff' : isActive ? '#3B82F6' : '#9CA3AF'}>
              {item.icon === 'home' && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              )}
              {item.icon === 'compass' && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
              {item.icon === 'plus' && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              )}
              {item.icon === 'message' && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              )}
              {item.icon === 'user' && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              )}
            </svg>
            {!item.center && (
              <span
                style={{
                  fontSize: '10px',
                  color: isActive ? '#3B82F6' : '#9CA3AF',
                  fontWeight: isActive ? '600' : '500',
                }}
              >
                {item.label}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
          }
