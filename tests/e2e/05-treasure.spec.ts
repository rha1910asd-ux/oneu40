import { expect, test } from "@playwright/test";
import {
  ROOT_ID,
  TUTORIAL_SEEN,
  bottomTab,
  centerOf,
  isHitTarget,
  myMapNodeButton,
  myMapFocus,
  seedNode,
  seedLocalStorage,
  tapCenter,
  waitForSplashGone,
  withFixedRandom,
} from "./helpers";

test.describe("5. 보물상자", () => {
  test("떠 있는 동안에도 다른 노드와 하단 메뉴가 눌리고, 상자 중심이 노드와 겹치지 않는다", async ({ page, context }) => {
    await seedLocalStorage(context, {
      ...TUTORIAL_SEEN,
      "oneu-mymap-nodes": [
        seedNode(ROOT_ID, "나", null, "#9B7A5A"),
        seedNode("e2e-a", "가나다", ROOT_ID),
        seedNode("e2e-b", "라마바", "e2e-a"),
        seedNode("e2e-c", "사아자", "e2e-a"),
        seedNode("e2e-d", "차카타", ROOT_ID),
      ],
    });
    await page.goto("/my-space");
    await waitForSplashGone(page);
    await expect(myMapFocus(page, null)).toBeVisible();

    const chest = page.getByRole("button", { name: "보물상자 열기" });

    // 상자 확률은 노드로 이동하는 동안 굴려지므로, 이동이 끝날 때까지 고정해 둔다.
    await withFixedRandom(page, 0.05, async () => {
      await myMapNodeButton(page, "가나다").click();
      await expect(myMapFocus(page, "가나다")).toBeVisible();
      await expect(chest).toBeVisible();
    });
    // 튀어나오는 애니메이션이 끝나 자리를 잡을 때까지
    await page.waitForTimeout(1_200);

    // 상자 중심이 어떤 노드와도 겹치지 않는다.
    const chestCenter = await centerOf(chest);
    const visibleNodes = page.locator("div.absolute > button").filter({ hasText: /^(나|가나다|라마바|사아자|차카타|오느)$/ });
    expect(await visibleNodes.count()).toBeGreaterThan(1);
    for (const node of await visibleNodes.all()) {
      if (!(await node.isVisible())) continue;
      const { box } = await centerOf(node);
      const inside =
        chestCenter.x >= box.x &&
        chestCenter.x <= box.x + box.width &&
        chestCenter.y >= box.y &&
        chestCenter.y <= box.y + box.height;
      expect(inside, `보물상자 중심이 "${await node.innerText()}" 노드 위에 있습니다`).toBe(false);
    }

    // 상자가 떠 있는 동안 다른 노드와 하단 메뉴가 가려지지 않는다.
    expect(await isHitTarget(page, myMapNodeButton(page, "라마바")), "라마바 노드가 가려져 있습니다").toBe(true);
    expect(await isHitTarget(page, bottomTab(page, "미션")), "하단 '미션' 탭이 가려져 있습니다").toBe(true);

    // 실제로 다른 노드를 탭하면 이동한다.
    await tapCenter(page, myMapNodeButton(page, "라마바"));
    await expect(myMapFocus(page, "라마바")).toBeVisible();

    // 다시 상자를 띄우고, 떠 있는 상태에서 하단 메뉴를 탭한다.
    await withFixedRandom(page, 0.05, async () => {
      await myMapNodeButton(page, "가나다").click();
      await expect(myMapFocus(page, "가나다")).toBeVisible();
      await expect(chest).toBeVisible();
    });
    await tapCenter(page, bottomTab(page, "미션"));
    await expect(page).toHaveURL(/\/mission$/);
  });
});
