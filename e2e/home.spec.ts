import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Avatar G/)
  })

  test('has CTA button', async ({ page }) => {
    await expect(page.getByText('Create Your Avatar')).toBeVisible()
  })

  test('navigation works', async ({ page }) => {
    await page.click('text=Dashboard')
    await expect(page).toHaveURL(/.*dashboard/)
  })

  test('responsive design', async ({ page }) => {
    // Mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(page.getByText('Create Your Avatar')).toBeVisible()
    
    // Desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await expect(page.getByText('Create Your Avatar')).toBeVisible()
  })
})
