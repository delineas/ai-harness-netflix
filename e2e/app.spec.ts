import { expect, test } from "@playwright/test";

test("searching «love» with the Movies filter shows only movies", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search titles").fill("love");
  await page.getByLabel("Kind").selectOption({ label: "Movies" });
  await page.getByRole("button", { name: "Search" }).click();

  const cards = page.getByRole("list", { name: "Titles" }).getByRole("listitem");
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    // the kind label ("Movie" / "Show", optionally followed by " · year")
    await expect(cards.nth(i).locator(".meta")).toHaveText(/^Movie( · \d{4})?$/);
  }
});

test("Through My Window: card and detail show the same weeks in the top 10", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search titles").fill("Through My Window");
  await page.getByRole("button", { name: "Search" }).click();

  const card = page.getByRole("button", { name: /^Through My Window/ }).first();
  await expect(card).toBeVisible();
  const cardText = (await card.textContent()) ?? "";
  const cardWeeks = cardText.match(/(\d+) weeks? in top 10/)?.[1];
  expect(cardWeeks, `card text: ${cardText}`).toBeDefined();

  await card.click();
  const detail = page.getByRole("region", { name: "Through My Window" });
  await expect(detail).toBeVisible();
  const detailWeeks = (await detail.locator("dt", { hasText: "Weeks in top 10" }).locator("+ dd").textContent())?.trim();

  expect(detailWeeks).toBe(cardWeeks);
});

// Keep last: if the server dies here, the other tests are not affected.
test("GET /favicon.ico is answered and the app keeps working", async ({ page, request }) => {
  const res = await request.get("/favicon.ico").catch((e: Error) => {
    throw new Error(`server did not answer /favicon.ico: ${e.message}`);
  });
  expect(res.status()).toBe(404);

  // the app is still alive afterwards
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Netflix Explorer" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Titles" }).getByRole("listitem").first()).toBeVisible();
});
