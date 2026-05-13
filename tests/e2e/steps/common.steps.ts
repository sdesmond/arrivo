import { expect } from '@playwright/test'
import { Given, Then } from '../fixtures'

Given('I am on the sign-in page', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/sign-in')
})

Given('I am signed in', async ({ page }) => {
  await page.goto('/trips')
  await expect(page).toHaveURL(/\/trips/)
})

Then('I should be redirected to the trips page', async ({ page }) => {
  await expect(page).toHaveURL(/\/trips/)
})

Then('I should be redirected to the sign-in page', async ({ page }) => {
  await expect(page).toHaveURL(/\/sign-in/)
})
