import { expect, type Page } from '@playwright/test'
import { Given, When, Then, Before, After } from '../fixtures'

let lastEventName: string | undefined
let createdEventIds: string[] = []
let eventIdByName: Map<string, string> = new Map()
let createdNoteIds: string[] = []

async function openFirstDay(page: Page) {
  // Wait for day cards to render (unique to trip detail — toggle buttons contain "X stops")
  const firstDayToggle = page.locator('button').filter({ hasText: /\d+ stops/ }).first()
  await expect(firstDayToggle).toBeVisible()

  // Expand if collapsed
  if (await firstDayToggle.getAttribute('aria-expanded') === 'false') {
    await firstDayToggle.click()
  }

  // Confirm the day body is open by waiting for the add-event button
  await expect(page.getByRole('button', { name: /add a place/i }).first()).toBeVisible()
}

async function addEvent(page: Page, name: string) {
  const idsBefore = new Set(
    await page.locator('[id^="event-"]').evaluateAll((els: Element[]) => els.map(el => el.id))
  )
  await page.getByRole('button', { name: /add a place/i }).first().click()
  await page.getByTitle('Add event').click()
  await page.getByPlaceholder('Event name').fill(name)
  await page.keyboard.press('Enter')
  // Wait for the new event row to appear
  await expect(page.locator('[id^="event-"]')).toHaveCount(idsBefore.size + 1)
  const idsAfter = await page.locator('[id^="event-"]').evaluateAll((els: Element[]) => els.map(el => el.id))
  const newId = idsAfter.find(id => !idsBefore.has(id))
  if (newId) {
    createdEventIds.push(newId)
    eventIdByName.set(name, newId)
  }
}

Before(async () => {
  lastEventName = undefined
  createdEventIds = []
  eventIdByName = new Map()
  createdNoteIds = []
  })

After(async ({ page }) => {
  for (const rowId of [...createdEventIds]) {
    const row = page.locator(`#${rowId}`)
    if (await row.isVisible()) {
      await row.hover()
      await row.getByTitle('Delete event').click()
      await expect(row).not.toBeVisible({ timeout: 5000 })
    }
  }
  for (const noteId of [...createdNoteIds]) {
    const noteEl = page.locator(`#${noteId}`)
    if (await noteEl.isVisible()) {
      await noteEl.hover()
      await noteEl.getByTitle('Delete note').click()
      await expect(noteEl).not.toBeVisible({ timeout: 5000 })
    }
  }
  createdEventIds = []
  createdNoteIds = []
  lastEventName = undefined
    eventIdByName = new Map()
})

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
  await addEvent(page, name)
})

Then('the day should contain {string}', async ({ page }, name: string) => {
  const id = eventIdByName.get(name)
  const row = id ? page.locator(`#${id}`) : page.locator('[id^="event-"]').filter({ hasText: name }).first()
  await expect(row).toBeVisible()
})

Given('a day has an event named {string}', async ({ page }, name: string) => {
  lastEventName = name
  await addEvent(page, name)
})

When('I edit the event name to {string}', async ({ page }, newName: string) => {
  const id = eventIdByName.get(lastEventName!)
  const row = id ? page.locator(`#${id}`) : page.locator('[id^="event-"]').filter({ hasText: lastEventName! }).first()
  const rowId = await row.getAttribute('id')
  await row.hover()
  await row.getByTitle('Edit name').click()
  await page.locator(`#${rowId}`).getByRole('textbox').fill(newName)
  await page.keyboard.press('Enter')
})

Then('the day should show {string}', async ({ page }, name: string) => {
  // Use tracked ID — the event was renamed so text changed but ID is stable
  const lastId = createdEventIds[createdEventIds.length - 1]
  const row = lastId ? page.locator(`#${lastId}`) : page.locator('[id^="event-"]').filter({ hasText: name }).first()
  await expect(row).toContainText(name)
})

Given('a day has an event without a time', async ({ page }) => {
  const name = 'Untimed Event'
  lastEventName = name
  await addEvent(page, name)
})

When('I open the time picker and set a start time', async ({ page }) => {
  const id = eventIdByName.get(lastEventName!)
  const row = id ? page.locator(`#${id}`) : page.locator('[id^="event-"]').filter({ hasText: lastEventName! }).first()
  await row.getByRole('button', { name: 'Add time' }).click()
  await page.locator('input[type="time"]').first().fill('09:00')
  await page.getByRole('button', { name: 'Save' }).click()
})

Then('the event should display the time', async ({ page }) => {
  const id = eventIdByName.get(lastEventName!)
  const eventRow = id ? page.locator(`#${id}`) : page.locator('[id^="event-"]').filter({ hasText: lastEventName! }).first()
  await expect(eventRow.getByText(/\d+:\d{2}\s*(AM|PM)/i)).toBeVisible()
})

When('I delete that event', async ({ page }) => {
  const id = eventIdByName.get(lastEventName!)
  const row = id ? page.locator(`#${id}`) : page.locator('[id^="event-"]').filter({ hasText: lastEventName! }).first()
  await row.hover()
  await row.getByTitle('Delete event').click()
  // Remove from tracking — deleted, no need for After cleanup
  if (id) {
    createdEventIds = createdEventIds.filter(eid => eid !== id)
    eventIdByName.delete(lastEventName!)
  }
})

Then('the day should not contain {string}', async ({ page }, name: string) => {
  await expect(page.locator('[id^="event-"]').filter({ hasText: name })).toHaveCount(0)
})

Given('a day has events {string} and {string} in order', async ({ page }, first: string, second: string) => {
  await addEvent(page, first)
  await addEvent(page, second)
})

When('I drag {string} above {string}', async ({ page }, source: string, target: string) => {
  const sourceId = eventIdByName.get(source)
  const targetId = eventIdByName.get(target)
  const sourceRow = sourceId ? page.locator(`#${sourceId}`) : page.locator('[id^="event-"]').filter({ hasText: source }).first()
  const targetRow = targetId ? page.locator(`#${targetId}`) : page.locator('[id^="event-"]').filter({ hasText: target }).first()

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
  const firstId = eventIdByName.get(first)
  const secondId = eventIdByName.get(second)
  await expect(async () => {
    const ids = await page.locator('[id^="event-"]').evaluateAll((els: Element[]) => els.map(el => el.id))
    const firstIdx = firstId ? ids.indexOf(firstId) : ids.findIndex(id => id.includes(first))
    const secondIdx = secondId ? ids.indexOf(secondId) : ids.findIndex(id => id.includes(second))
    expect(firstIdx).toBeGreaterThanOrEqual(0)
    expect(secondIdx).toBeGreaterThanOrEqual(0)
    expect(firstIdx).toBeLessThan(secondIdx)
  }).toPass({ timeout: 10000 })
})

When('I add a note {string}', async ({ page }, content: string) => {
  const idsBefore = new Set(
    await page.locator('[id^="note-"]').evaluateAll((els: Element[]) => els.map(el => el.id))
  )
  await page.getByRole('button', { name: /add a place/i }).first().click()
  await page.getByTitle('Add note').click()
  await page.getByPlaceholder('Add a note…').fill(content)
  await page.keyboard.press('Enter')
  await expect(async () => {
    const idsAfter = await page.locator('[id^="note-"]').evaluateAll((els: Element[]) => els.map(el => el.id))
    expect(idsAfter.length).toBeGreaterThan(idsBefore.size)
  }).toPass({ timeout: 5000 })
  const idsAfter = await page.locator('[id^="note-"]').evaluateAll((els: Element[]) => els.map(el => el.id))
  const newId = idsAfter.find(id => !idsBefore.has(id))
  if (newId) createdNoteIds.push(newId)
})

Then('the note {string} should be visible on the timeline', async ({ page }, content: string) => {
  await expect(page.locator('[id^="note-"]').filter({ hasText: content })).toBeVisible()
})

Then('the note {string} should not be visible', async ({ page }, content: string) => {
  await expect(page.locator('[id^="note-"]').filter({ hasText: content })).toHaveCount(0)
})

When('I edit the note {string} to {string}', async ({ page }, oldContent: string, newContent: string) => {
  const noteEl = page.locator('[id^="note-"]').filter({ hasText: oldContent }).first()
  await noteEl.getByRole('button', { name: oldContent }).click()
  const textarea = noteEl.locator('textarea')
  await textarea.fill(newContent)
  await page.keyboard.press('Enter')
})

When('I delete the note {string}', async ({ page }, content: string) => {
  const noteEl = page.locator('[id^="note-"]').filter({ hasText: content }).first()
  const noteId = await noteEl.getAttribute('id')
  await noteEl.hover()
  await noteEl.getByTitle('Delete note').click()
  if (noteId) createdNoteIds = createdNoteIds.filter(id => id !== noteId)
})
