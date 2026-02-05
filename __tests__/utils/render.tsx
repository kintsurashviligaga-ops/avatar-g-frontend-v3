import { ReactElement } from 'react'
import { render as rtlRender, RenderOptions } from '@testing-library/react'
import { IdentityProvider } from '@/lib/identity/IdentityContext'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { ToastProvider } from '@/components/ui/Toast'

function AllTheProviders({ children }: { children: React.ReactNode }) {
  return (
    <IdentityProvider>
      <LanguageProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </LanguageProvider>
    </IdentityProvider>
  )
}

function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: AllTheProviders, ...options })
}

export * from '@testing-library/react'
export { render }
