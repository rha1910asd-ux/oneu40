import { expect, test } from "@playwright/test";

test.describe("1. 첫 실행 온보딩", () => {
  test("스플래시가 사라진 뒤에 온보딩이 뜨고, 관심사 3개를 골라야 다음으로 넘어간다", async ({ page }) => {
    // 스플래시와 온보딩이 "처음/마지막으로 보인 시각"을 매 프레임 기록한다.
    await page.addInitScript(() => {
      const w = window as unknown as { __e2eTimeline: { splashLast: number; onboardingFirst: number } };
      w.__e2eTimeline = { splashLast: 0, onboardingFirst: 0 };
      const tick = () => {
        const now = performance.now();
        if (document.querySelector('svg[viewBox="-95 -95 190 190"]')) w.__e2eTimeline.splashLast = now;
        if (!w.__e2eTimeline.onboardingFirst && /\b1 \/ 4\b/.test(document.body?.innerText ?? "")) {
          w.__e2eTimeline.onboardingFirst = now;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.goto("/");

    const stepLabel = page.getByText(/^\d \/ 4$/);
    await expect(stepLabel).toHaveText("1 / 4", { timeout: 30_000 });

    // 온보딩이 떴을 때 스플래시는 이미 없어야 하고, 둘이 겹친 프레임도 없어야 한다.
    await expect(page.locator('svg[viewBox="-95 -95 190 190"]')).toHaveCount(0);
    const timeline = await page.evaluate(
      () => (window as unknown as { __e2eTimeline: { splashLast: number; onboardingFirst: number } }).__e2eTimeline,
    );
    expect(timeline.splashLast, "스플래시가 한 번은 보였어야 합니다").toBeGreaterThan(0);
    expect(timeline.onboardingFirst, "온보딩은 스플래시가 사라진 뒤에 떠야 합니다").toBeGreaterThan(timeline.splashLast);

    // 2단계: 관심사 고르기
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(stepLabel).toHaveText("2 / 4");
    const next = page.getByRole("button", { name: "다음", exact: true });

    await expect(next).toBeDisabled();
    await page.getByRole("button", { name: "혼밥", exact: true }).click();
    await expect(next).toBeDisabled();
    await page.getByRole("button", { name: "카페", exact: true }).click();
    await expect(next).toBeDisabled();
    await page.getByRole("button", { name: "여행", exact: true }).click();
    await expect(next).toBeEnabled();

    await next.click();
    await expect(stepLabel).toHaveText("3 / 4");
  });
});
