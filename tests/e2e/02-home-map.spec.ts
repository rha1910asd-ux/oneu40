import { expect, test } from "@playwright/test";
import { HOME_PINS, TUTORIAL_SEEN, seedLocalStorage, waitForSplashGone, waitForSupabaseTable } from "./helpers";

test.describe("2. 홈 지도", () => {
  test('노드 이름에 "custom-"으로 시작하는 내부 id가 보이지 않는다', async ({ page, context }) => {
    await seedLocalStorage(context, { ...TUTORIAL_SEEN, "oneu-home-pins": HOME_PINS });

    // 운영 Supabase의 사용자 노드·연결은 늦게 올 수 있으니 응답이 올 때까지 충분히 기다린다.
    const remoteLoaded = Promise.all([
      waitForSupabaseTable(page, "custom_nodes"),
      waitForSupabaseTable(page, "node_connections"),
    ]);
    await page.goto("/");
    await remoteLoaded;
    await waitForSplashGone(page);
    await expect(page.getByRole("button", { name: "나", exact: true })).toBeVisible();
    // 응답을 받은 뒤 지도가 다시 그려질 시간을 준다.
    await page.waitForTimeout(3_000);

    const leaked = await page.evaluate(() => {
      const found: string[] = [];
      const re = /custom-[\w-]+/;
      for (const el of Array.from(document.querySelectorAll("button, [aria-label], [title], svg text"))) {
        const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
        for (const v of [text, el.getAttribute("aria-label") ?? "", el.getAttribute("title") ?? ""]) {
          const m = re.exec(v);
          if (m) found.push(m[0]);
        }
      }
      const bodyMatch = document.body.innerText.match(/custom-[\w-]+/g) ?? [];
      return Array.from(new Set([...found, ...bodyMatch]));
    });
    expect(leaked, "화면에 내부 id가 노출됐습니다").toEqual([]);
  });
});
