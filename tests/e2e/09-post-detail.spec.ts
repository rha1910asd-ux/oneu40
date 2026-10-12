import { expect, test } from "@playwright/test";
import { TUTORIAL_SEEN, fetchRecentPosts, seedLocalStorage, waitForSplashGone } from "./helpers";

test.describe("9. 글 상세", () => {
  test("아래로 스크롤해도 제목이 화면 밖으로 밀려나지 않는다", async ({ page, context, request }) => {
    // 스크롤이 생기도록 본문이 가장 긴 글을 고른다.
    const posts = await fetchRecentPosts(request, 30);
    const post = [...posts].sort((a, b) => (b.content?.length ?? 0) - (a.content?.length ?? 0))[0];

    await seedLocalStorage(context, { ...TUTORIAL_SEEN });
    await page.goto(`/space/${post.node_path}`);
    await waitForSplashGone(page);

    // 게시판 목록에서 글을 눌러 연다.
    await page.getByText(post.title, { exact: true }).first().click({ timeout: 60_000 });
    const heading = page.getByRole("heading", { name: post.title, exact: true });
    await expect(heading).toBeVisible();

    // 손가락으로 쓸어올리듯 여러 번 아래로 스크롤
    const viewport = page.viewportSize()!;
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);

    // 제목 텍스트가 적어도 하나는 화면 안에 보여야 한다.
    const onScreen = await page.getByText(post.title, { exact: true }).evaluateAll((els, vh) => {
      return els.some((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.height > 0 && r.top >= 0 && r.bottom <= vh && style.visibility !== "hidden" && style.opacity !== "0";
      });
    }, viewport.height);
    expect(onScreen, "스크롤 후 제목이 화면 밖으로 밀려났습니다").toBe(true);
  });
});
