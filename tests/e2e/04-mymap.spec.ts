import { expect, test } from "@playwright/test";
import {
  ROOT_ID,
  TUTORIAL_SEEN,
  bottomTab,
  myMapNodeButton,
  myMapFocus,
  seedNode,
  seedLocalStorage,
  waitForSplashGone,
} from "./helpers";

test.describe("4. 마이맵", () => {
  test("노드 추가 → 이동 → 기록 추가가 된다", async ({ page, context }) => {
    await seedLocalStorage(context, {
      ...TUTORIAL_SEEN,
      "oneu-mymap-nodes": [seedNode(ROOT_ID, "나", null, "#9B7A5A")],
    });
    await page.goto("/my-space");
    await waitForSplashGone(page);
    await expect(myMapFocus(page, null)).toBeVisible();

    // 노드 추가
    await page.getByRole("button", { name: "노드 추가", exact: true }).click();
    await page.getByPlaceholder(/^이름/).fill("테스트노드");
    await page.getByRole("button", { name: "추가하기", exact: true }).click();
    await expect(myMapNodeButton(page, "테스트노드")).toBeVisible();

    // 이동: 새 노드를 눌러 가운데로
    await myMapNodeButton(page, "테스트노드").click();
    await expect(myMapFocus(page, "테스트노드")).toBeVisible();

    // 기록 추가
    const note = `e2e 기록 ${Date.now()}`;
    await page.getByRole("button", { name: "기록 추가", exact: true }).click();
    await page.getByPlaceholder(/오늘의 생각/).fill(note);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    // 저장한 기록이 노드 아래 목록에 나타난다.
    await expect(page.getByRole("button", { name: new RegExp(note) })).toBeVisible();

    const stored = await page.evaluate(() => {
      const nodes = JSON.parse(localStorage.getItem("oneu-mymap-nodes") ?? "[]") as { id: string; label: string }[];
      const records = JSON.parse(localStorage.getItem("oneu-mymap-records") ?? "[]") as { nodeId: string; content?: string; text?: string }[];
      return { nodes, records };
    });
    const added = stored.nodes.find((n) => n.label === "테스트노드");
    expect(added, "추가한 노드가 저장돼야 합니다").toBeTruthy();
    expect(
      stored.records.some((r) => r.nodeId === added!.id && JSON.stringify(r).includes(note)),
      "기록이 그 노드에 저장돼야 합니다",
    ).toBe(true);
  });

  test("두 칸 들어간 뒤 뒤로가기를 누르면 앱을 나가지 않고 한 칸씩 올라온다", async ({ page, context }) => {
    await seedLocalStorage(context, {
      ...TUTORIAL_SEEN,
      "oneu-mymap-nodes": [
        seedNode(ROOT_ID, "나", null, "#9B7A5A"),
        seedNode("e2e-a", "가나다", ROOT_ID),
        seedNode("e2e-b", "라마바", "e2e-a"),
      ],
    });
    // 홈에서 탭으로 들어가서, "앱 밖"(이전 문서)으로 나가는지도 확인할 수 있게 한다.
    await page.goto("/");
    await waitForSplashGone(page);
    await bottomTab(page, "마이맵").click();
    await expect(page).toHaveURL(/\/my-space$/);
    await expect(myMapFocus(page, null)).toBeVisible();

    await myMapNodeButton(page, "가나다").click();
    await expect(myMapFocus(page, "가나다")).toBeVisible();
    await myMapNodeButton(page, "라마바").click();
    await expect(myMapFocus(page, "라마바")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/my-space$/);
    await expect(myMapFocus(page, "가나다")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/my-space$/);
    await expect(myMapFocus(page, null)).toBeVisible();
  });
});
