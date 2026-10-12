import { expect, test } from "@playwright/test";
import { TUTORIAL_SEEN, seedLocalStorage, waitForSplashGone } from "./helpers";

test.describe("7. 검색", () => {
  test('없는 관심사를 검색하면 "제안하기"와 "내 마이맵에 두기"가 나오고, 마이맵에 두기는 이름이 채워진 추가 창을 연다', async ({
    page,
    context,
  }) => {
    await seedLocalStorage(context, { ...TUTORIAL_SEEN });
    await page.goto("/");
    await waitForSplashGone(page);

    // 운영 지도에 절대 없을 이름 (예시로 든 "등산"은 앱 내장 관심사 목록에 있어서 결과가 달라질 수 있다)
    const query = `없는관심사${Date.now().toString(36)}`;
    await page.getByRole("textbox", { name: "관심사를 검색해보세요" }).fill(query);

    // 운영 Supabase에서 목록을 받아오는 동안 "찾아보는 중" 표시가 뜬다.
    await expect(page.getByText("찾아보는 중이에요…")).toBeHidden({ timeout: 60_000 });

    await expect(page.getByRole("button", { name: /제안하기/ })).toBeVisible();
    const keepInMyMap = page.getByRole("button", { name: /내 마이맵에 두기/ });
    await expect(keepInMyMap).toBeVisible();

    await keepInMyMap.click();
    await expect(page.getByText("새 노드 추가", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(/^이름/)).toHaveValue(query);
  });
});
