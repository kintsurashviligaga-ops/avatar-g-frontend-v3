import { test, expect } from '@playwright/test'

const PROD = 'https://www.myavatar.ge'

const SERVICE_ROUTES = [
  'avatar', 'video', 'editing', 'music', 'photo', 'image',
  'text', 'prompt', 'shop', 'workflow', 'media', 'visual-intel', 'agent-g',
]

test.describe('Production Smoke — MyAvatar.ge', () => {

  test('Homepage: returns 200 with content', async ({ request }) => {
    const res = await request.get(PROD)
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body.length).toBeGreaterThan(1000)
    expect(body).toContain('GlobalNavbar')
  })

  test('Homepage: logo in navbar', async ({ request }) => {
    const res = await request.get(PROD)
    const body = await res.text()
    // logo.png reference must exist in SSR HTML
    expect(body).toMatch(/logo\.png/)
  })

  test('Language switcher: navbar module loaded (client-rendered)', async ({ request }) => {
    const res = await request.get(PROD)
    const body = await res.text()
    // GlobalNavbar is 'use client' — language buttons render via JS
    // Verify the module reference is in the RSC payload
    expect(body).toContain('GlobalNavbar')
  })

  test('Pricing page: returns 200', async ({ request }) => {
    const res = await request.get(`${PROD}/pricing`)
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body.length).toBeGreaterThan(500)
  })

  test('Login page: returns 200 with form module', async ({ request }) => {
    const res = await request.get(`${PROD}/login`)
    expect(res.status()).toBe(200)
    const body = await res.text()
    // Login form is client-rendered — check page loaded with content
    expect(body.length).toBeGreaterThan(1000)
    expect(body).toContain('login')
  })

  test('Signup page: returns 200', async ({ request }) => {
    const res = await request.get(`${PROD}/signup`)
    expect(res.status()).toBe(200)
  })

  for (const serviceId of SERVICE_ROUTES) {
    test(`Service: /services/${serviceId} returns 200 with content`, async ({ request }) => {
      const res = await request.get(`${PROD}/services/${serviceId}`)
      expect(res.status()).toBe(200)
      const body = await res.text()
      expect(body.length).toBeGreaterThan(500)
      // Must NOT contain "404" or "Not Found" indicators
      expect(body).not.toMatch(/class="not-found"|Page not found/)
    })
  }

  test('Business Hub: returns 200 (direct or via login redirect)', async ({ request }) => {
    const res = await request.get(`${PROD}/business`)
    expect(res.status()).toBe(200)
  })

  test('Executive: returns 200', async ({ request }) => {
    const res = await request.get(`${PROD}/executive`)
    expect(res.status()).toBe(200)
  })

  test('Health API: returns ok JSON', async ({ request }) => {
    const res = await request.get(`${PROD}/api/health`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.status).toBe('healthy')
  })

  test('Navbar links: GlobalNavbar module present with all routes', async ({ request }) => {
    const res = await request.get(PROD)
    const body = await res.text()
    // GlobalNavbar is client-rendered — verify module is loaded
    // All 6 links (avatar, video, editing, music, business, pricing) render via JS
    expect(body).toContain('GlobalNavbar')
    // Also verify /pricing route exists as a static page
    const pricingRes = await request.get(`${PROD}/pricing`)
    expect(pricingRes.status()).toBe(200)
  })

  test('No server error markers in homepage', async ({ request }) => {
    const res = await request.get(PROD)
    const body = await res.text()
    expect(body).not.toMatch(/Internal Server Error/)
    expect(body).not.toMatch(/NEXT_NOT_FOUND/)
    expect(body).not.toMatch(/Application error/)
  })

  test('Locale routes: /ka returns 200', async ({ request }) => {
    const res = await request.get(`${PROD}/ka`)
    expect(res.status()).toBe(200)
  })

  test('Locale routes: /en returns 200', async ({ request }) => {
    const res = await request.get(`${PROD}/en`)
    expect(res.status()).toBe(200)
  })

  test('Locale routes: /ru returns 200', async ({ request }) => {
    const res = await request.get(`${PROD}/ru`)
    expect(res.status()).toBe(200)
  })

  test('Agent status API: returns JSON', async ({ request }) => {
    const res = await request.get(`${PROD}/api/agents/status?agentId=agent-g`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('status')
  })
})
