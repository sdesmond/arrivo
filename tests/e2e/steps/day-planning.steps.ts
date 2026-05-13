import { expect, type Page } from '@playwright/test'
import { Given, When, Then } from '../fixtures'

// Shared within a scenario's sequential steps
let lastEventName: string | undefined

async function openFirstDay(page: Page) {
  // Expand the first day card if it is collapsed
  const firstToggle = page.locator('button[aria-expanded="false"]').first()
  if (await firstToggle.count() > 0) {
    await firstToggle.click()
  }
  await expect(page.locator('button[aria-expanded="true"]')).toBeVisible()
}

async function addEvent(page: Page, name: string) {
  await page.getByRole('button', { name: /add a place/i }).first().click()
  await page.getByPlaceholder('Event name').fill(name)
  await page.keyboard.press('Enter')
  await expect(page.getByText(name)).toBeVisible()
}

Given('I have an existing trip with days', async ({ page }) => {
  await page.goto('/trips')
  await page.locator('a[href*="/trips/"]').first().click()
  await page.waitForURL(/\/trips\/.+/)
  await openFirstDay(page)
})

Given('I am on the trip detail page', async ({ page }) => {
  await expect(page).toHaveURL(/\/trips\/.+/)
})

When('I add a new event named {string}', async ({ page }, name: string) => {
  await page.getByRole('button', { name: /add a place/i }).first().click()
  await page.getByPlaceholder('Event name').fill(name)
  await page.keyboard.press('Enter')
})

Then('the day should contain {string}', async ({ page }, name: string) => {
  await expect(page.getByText(name)).toBeVisible()
})

Given('a day has an event named {string}', async ({ page }, name: string) => {
  lastEventName = name
  await addEvent(page, name)
})

When('I edit the event name to {string}', async ({ page }, newName: string) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: lastEventName! })
  await row.hover()
  await row.getByTitle('Edit name').click()
  const input = row.getByRole('textbox')
  await input.fill(newName)
  await page.keyboard.press('Enter')
})

Then('the day should show {string}', async ({ page }, name: string) => {
  await expect(page.getByText(name)).toBeVisible()
})

Given('a day has an event without a time', async ({ page }) => {
  const name = 'Untimed Event'
  lastEventName = name
  await addEvent(page, name)
})

When('I open the time picker and set a start time', async ({ page }) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: lastEventName! }).first()
  await row.getByRole('button', { name: 'Add time' }).click()
  await page.locator('input[type="time"]').first().fill('09:00')
  await page.getByRole('button', { name: 'Save' }).click()
})

Then('the event should display the time', async ({ page }) => {
  await expect(page.getByText(/\d+:\d{2}\s*(AM|PM)/i)).toBeVisible()
})

When('I delete that event', async ({ page }) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: lastEventName! }).first()
  await row.hover()
  await row.getByTitle('Delete event').click()
})

Then('the day should not contain {string}', async ({ page }, name: string) => {
  await expect(page.getByText(name)).not.toBeVisible()
})

Given('a day has events {string} and {string} in order', async ({ page }, first: string, second: string) => {
  await addEvent(page, first)
  await addEvent(page, second)
})

When('I drag {string} above {string}', async ({ page }, source: string, target: string) => {
  const sourceRow = page.locator('[id^="event-"]').filter({ hasText: source })
  const targetRow = page.locator('[id^="event-"]').filter({ hasText: target })

  // Hover source to ensure drag handle is in hover state
  await sourceRow.hover()
  const dragHandle = sourceRow.locator('[aria-roledescription="sortable"]')

  const handleBox = await dragHandle.boundingBox()
  const targetBox = await targetRow.boundingBox()

  if (!handleBox || !targetBox) throw new Error('Could not locate drag elements')

  const srcX = handleBox.x + handleBox.width / 2
  const srcY = handleBox.y + handleBox.height / 2
  const dstX = targetBox.x + targetBox.width / 2
  const dstY = targetBox.y + 2  // just above the target's center

  await page.mouse.move(srcX, srcY)
  await page.mouse.down()
  // Move past the 5px activation threshold
  await page.mouse.move(srcX, srcY + 7, { steps: 3 })
  // Move to target position
  await page.mouse.move(dstX, dstY, { steps: 10 })
  await page.mouse.up()
})

Then('the order should be {string} then {string}', async ({ page }, first: string, second: string) => {
  await expect(async () => {
    const rows = page.locator('[id^="event-"]')
    const texts = await rows.allTextContents()
    const firstIdx = texts.findIndex(t => t.includes(first))
    const secondIdx = texts.findIndex(t => t.includes(second))
    expect(firstIdx).toBeGreaterThanOrEqual(0)
    expect(secondIdx).toBeGreaterThanOrEqual(0)
    expect(firstIdx).toBeLessThan(secondIdx)
  }).toPass({ timeout: 10000 })
})
