import { expect, test, type Page } from "@playwright/test";
import { HOME_PINS, TUTORIAL_SEEN, bottomTab, mapNode, seedLocalStorage, waitForSplashGone } from "./helpers";

/** 홈 지도에서 관심사 하나를 누른다. 다른 관심사가 가운데 있으면 '지도' 탭으로 '나'에게 돌아온 뒤 누른다. */
async function visitHomeNode(page: Page, label: string) {
  if (!(await mapNode(page, label).isVisible())) {
    await bottomTab(page, "지도").click();
  }
  await expect(mapNode(page, label)).toBeVisible();
  // 노드는 계속 숨쉬는 애니메이션이라 안정 상태를 기다리지 않는다.
  await mapNode(page, label).click({ force: true });
  // 누른 관심사가 가운데로 옮겨질 때까지 기다린다.
  await expect(mapNode(page, "튜토리얼")).toBeHidden();
}

test.describe("3. 미션", () => {
  test("홈에서 서로 다른 관심사 3곳을 누르면 첫 미션이 3/3이 되고, 보상을 받으면 다음 미션으로 넘어간다", async ({
    page,
    context,
  }) => {
    await seedLocalStorage(context, { ...TUTORIAL_SEEN, "oneu-home-pins": HOME_PINS });
    await page.goto("/");
    await waitForSplashGone(page);

    for (const pin of HOME_PINS) await visitHomeNode(page, pin.label);

    await bottomTab(page, "미션").click();
    await expect(page).toHaveURL(/\/mission$/);

    const first = page.getByText("주변 둘러보기", { exact: true }).first();
    await expect(first).toBeVisible();
    await expect(page.getByText("3 / 3", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "완료! 보상 받기" }).click();

    // 다음 미션(첫 자리 세우기)이 현재 미션으로 올라온다.
    await expect(page.getByText("첫 자리 세우기", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "완료! 보상 받기" })).toHaveCount(0);

    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("oneu-mission-state") ?? "{}"));
    expect(state.completed?.["mission-1"]).toBe(true);
    expect(state.claimed?.["mission-1"]).toBe(true);
  });
});
