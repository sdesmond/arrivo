import { test as setup } from "@playwright/test";
import fs from "fs";
import path from "path";

const authFile = path.join("tests/e2e/.auth/user.json");

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Username" }).fill(process.env.E2E_USERNAME!);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/trips");
  await page.context().storageState({ path: authFile });
});
