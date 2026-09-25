import { expect, test } from "@playwright/test";
import { TUTORIAL_SEEN, bottomTab, seedLocalStorage, waitForSplashGone } from "./helpers";

const readBackground = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background").trim());

test.describe("6. 상점 테마 미리보기", () => {
  test('"8초 동안 미리보기"는 --background를 바꿨다가 8초 뒤 되돌리고, 저장하지 않는다', async ({ page, context }) => {
    await seedLocalStorage(context, { ...TUTORIAL_SEEN });
    await page.goto("/");
    await waitForSplashGone(page);
    const original = await readBackground(page);
    expect(original).not.toBe("");
    const inventoryBefore = await page.evaluate(() => localStorage.getItem("onbob_inventory"));

    // 아이템 가방 → 빈 칸 → 상점 → 테마 "바다"
    await bottomTab(page, "아이템가방").click();
    await page.locator(".grid.grid-cols-9 > button.border-dashed").first().click();
    await page.getByRole("button", { name: "상점", exact: true }).click();
    await page.getByRole("button", { name: /^바다/ }).click();

    await page.getByRole("button", { name: /8초 동안 미리보기/ }).click({ timeout: 15_000 });
    const startedAt = Date.now();

    await expect.poll(() => readBackground(page), { timeout: 3_000 }).not.toBe(original);
    const previewed = await readBackground(page);

    // 8초가 되기 전에는 미리보기가 유지된다.
    await page.waitForTimeout(Math.max(0, 6_000 - (Date.now() - startedAt)));
    expect(await readBackground(page)).toBe(previewed);

    // 8초 뒤 원래대로
    await expect.poll(() => readBackground(page), { timeout: 6_000 }).toBe(original);

    // 저장되지 않는다: 가방·장착 상태가 그대로이고, 새로고침해도 원래 색이다.
    const inventoryAfter = await page.evaluate(() => localStorage.getItem("onbob_inventory"));
    expect(inventoryAfter ?? "").not.toContain("theme-ocean");
    expect(inventoryAfter).toBe(inventoryBefore);
    await page.reload();
    await waitForSplashGone(page);
    expect(await readBackground(page)).toBe(original);
  });
});
