import { expect, test } from "@playwright/test";
import { fetchRecentPosts } from "./helpers";

test.describe("8. 공유 링크", () => {
  test("새 브라우저에서 /space/공간?post=글id 로 들어오면 그 글이 바로 열리고, 닫으면 ?post=가 사라진다", async ({
    page,
    request,
  }) => {
    const [post] = await fetchRecentPosts(request, 5);

    // 테스트마다 새 컨텍스트라 localStorage·쿠키가 완전히 비어 있다(= 새 브라우저).
    {
      await page.goto(`/space/${post.node_path}?post=${encodeURIComponent(post.id)}`);

      const title = page.getByRole("heading", { name: post.title, exact: true });
      await expect(title).toBeVisible({ timeout: 60_000 });

      // 글 상세의 뒤로(닫기) 버튼: "<공간> 게시판"
      await page.getByRole("button", { name: /게시판$/ }).first().click();
      await expect(title).toBeHidden();
      await expect(page).not.toHaveURL(/[?&]post=/);
      await expect(page).toHaveURL(new RegExp(`/space/${post.node_path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
  });
});
