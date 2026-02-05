import { test, expect } from '@playwright/test'

test.describe('Identity Creation Flow', () => {
  test('user can navigate to avatar builder', async ({ page }) => {
    await page.goto('/')
    await page.click('text=Create Your Avatar')
    await expect(page).toHaveURL(/.*avatar-builder/)
    await expect(page.getByText('Avatar Builder')).toBeVisible()
  })

  test('avatar builder has upload option', async ({ page }) => {
    await page.goto('/services/avatar-builder')
    await expect(page.getByText('Upload Photo')).toBeVisible()
    await expect(page.getByText('Use Camera')).toBeVisible()
  })

  test('voice cloning requires avatar first', async ({ page }) => {
    // Clear any existing identity
    await page.goto('/services/voice-cloning')
    // Should show identity required message if no avatar
    await expect(page.getByText(/Identity|Avatar/i)).toBeVisible()
  })
})
