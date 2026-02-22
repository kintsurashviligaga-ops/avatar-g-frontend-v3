import '@testing-library/jest-dom'

if (typeof globalThis.Request === 'undefined' || typeof globalThis.fetch === 'undefined') {
  try {
    const undici = require('undici')
    globalThis.fetch = undici.fetch
    globalThis.Request = undici.Request
    globalThis.Response = undici.Response
    globalThis.Headers = undici.Headers
  } catch {
    // keep defaults when undici is unavailable
  }
}

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
    }
  },
  usePathname() {
    return ''
  },
}))

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
globalThis.localStorage = globalThis.localStorage || localStorageMock

// Mock window.matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
}
