import { expect, type APIRequestContext, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT_ID = "root";

export type SeedNode = {
  id: string;
  label: string;
  color: string;
  note: string;
  parentId: string | null;
  createdAt: number;
};

export function seedNode(id: string, label: string, parentId: string | null, color = "#3D6B96"): SeedNode {
  return { id, label, color, note: "", parentId, createdAt: Date.now() };
}

/** 온보딩(튜토리얼)을 이미 본 상태 */
export const TUTORIAL_SEEN = { "oneu-tutorial-seen": "1" } as const;

/** 홈 지도에 미리 꽂아 둘 관심사 (앱 내장 노드) */
export const HOME_PINS = [
  { id: "solo-meal", label: "혼밥", color: "#E8DFD0", realPath: "eat/solo-meal" },
  { id: "cafe", label: "카페", color: "#C9BFAE", realPath: "eat/cafe" },
  { id: "travel", label: "여행", color: "#D4C4B0", realPath: "go/travel" },
];

/**
 * 컨텍스트가 처음 문서를 열 때 한 번만 localStorage를 채운다.
 * (새로고침·재방문 때 다시 덮어쓰면 "저장되지 않는다" 같은 검사가 무의미해진다.)
 */
export async function seedLocalStorage(context: BrowserContext, entries: Record<string, unknown>) {
  await context.addInitScript((seed: Record<string, unknown>) => {
    try {
      if (localStorage.getItem("__e2e_seeded")) return;
      for (const [key, value] of Object.entries(seed)) {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }
      localStorage.setItem("__e2e_seeded", "1");
    } catch {
      /* about:blank 등 storage 접근이 막힌 문서 */
    }
  }, entries);
}

/** 앱 첫 로딩 스플래시(가운데 노드 SVG가 있는 전체 화면 레이어)가 사라질 때까지 기다린다. */
export async function waitForSplashGone(page: Page) {
  await expect(page.locator('svg[viewBox="-95 -95 190 190"]')).toHaveCount(0, { timeout: 30_000 });
}

/** 하단 탭 */
export function bottomTab(page: Page, name: "지도" | "마이맵" | "아이템가방" | "미션"): Locator {
  return page.getByRole("button", { name, exact: true });
}

/** 지도 노드(버튼). 노드는 계속 "숨쉬는" 애니메이션을 해서 안정 상태 대기를 하면 끝나지 않는다. */
export function mapNode(page: Page, label: string): Locator {
  return page.getByRole("button", { name: label, exact: true });
}

export async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "요소가 화면에 그려져 있어야 합니다").not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, box: box! };
}

/** 실제 손가락 탭처럼 좌표를 눌러서, 그 위를 덮고 있는 레이어가 있으면 그대로 드러나게 한다. */
export async function tapCenter(page: Page, locator: Locator) {
  const { x, y } = await centerOf(locator);
  await page.touchscreen.tap(x, y);
}

/** (x, y) 위치에서 실제로 눌리는 요소가 target 안에 있는지 */
export async function isHitTarget(page: Page, target: Locator): Promise<boolean> {
  const { x, y } = await centerOf(target);
  const handle = await target.elementHandle();
  return page.evaluate(
    ({ x, y, el }) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && !!el && (el === hit || el.contains(hit));
    },
    { x, y, el: handle },
  );
}

/** 마이맵 캔버스 위의 노드 (상단 경로 표시줄에 같은 이름 버튼이 있어서 캔버스 안으로 한정한다) */
export function myMapNodeButton(page: Page, label: string): Locator {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.locator("div.absolute > button").filter({ hasText: new RegExp(`^${escaped}$`) });
}

/** 마이맵에서 지금 가운데(초점)에 있는 노드 — 내보내기 버튼의 aria-label로 판별한다. */
export function myMapFocus(page: Page, label: string | null): Locator {
  return label === null
    ? page.getByRole("button", { name: "전체 지도 내보내기" })
    : page.getByRole("button", { name: `"${label}" 내보내기` });
}

/** 보물상자는 Math.random 확률로 뜬다 — 누르는 순간에만 0.05로 고정하고 바로 원복한다. */
export async function withFixedRandom<T>(page: Page, value: number, action: () => Promise<T>): Promise<T> {
  await page.evaluate((v) => {
    const w = window as unknown as { __e2eRandom?: () => number };
    w.__e2eRandom = Math.random;
    Math.random = () => v;
  }, value);
  try {
    return await action();
  } finally {
    await page.evaluate(() => {
      const w = window as unknown as { __e2eRandom?: () => number };
      if (w.__e2eRandom) Math.random = w.__e2eRandom;
    });
  }
}

// ─── 운영 Supabase ───────────────────────────────────────────────────────────

function readSupabaseConfig(): { url: string; key: string } {
  const src = readFileSync(join(process.cwd(), "config.js"), "utf8");
  const url = /SUPABASE_URL:\s*"([^"]+)"/.exec(src)?.[1];
  const key = /SUPABASE_ANON_KEY:\s*"([^"]+)"/.exec(src)?.[1];
  if (!url || !key) throw new Error("config.js에서 SUPABASE_URL / SUPABASE_ANON_KEY를 읽지 못했습니다.");
  return { url, key };
}

export type RemotePost = { id: string; title: string; node_path: string; content: string | null };

/** 공개(프리즈되지 않은) 최근 글 목록을 운영 Supabase에서 직접 가져온다. */
export async function fetchRecentPosts(request: APIRequestContext, limit = 30): Promise<RemotePost[]> {
  const { url, key } = readSupabaseConfig();
  const res = await request.get(`${url}/rest/v1/posts`, {
    params: {
      select: "id,title,node_path,content",
      is_frozen: "eq.false",
      order: "created_at.desc",
      limit: String(limit),
    },
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    timeout: 30_000,
  });
  expect(res.ok(), `Supabase posts 조회 실패: HTTP ${res.status()}`).toBeTruthy();
  const rows = (await res.json()) as RemotePost[];
  const usable = rows.filter((p) => p.id && p.title && p.node_path);
  expect(usable.length, "운영 DB에 열어볼 공개 글이 한 개 이상 있어야 합니다").toBeGreaterThan(0);
  return usable;
}

/**
 * 페이지가 특정 Supabase 테이블을 읽어오는 응답을 기다린다.
 * 요청이 네트워크 단계에서 실패하면(차단 등) 타임아웃까지 기다리지 않고 바로 원인을 알려준다.
 */
export function waitForSupabaseTable(page: Page, table: string, timeout = 60_000): Promise<void> {
  const match = (u: string) => u.includes(`/rest/v1/${table}`);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Supabase "${table}" 응답이 ${timeout / 1000}초 안에 오지 않았습니다.`));
    }, timeout);
    const onResponse = (res: import("@playwright/test").Response) => {
      if (!match(res.url())) return;
      cleanup();
      if (res.ok()) resolve();
      else reject(new Error(`Supabase "${table}" 응답 HTTP ${res.status()}`));
    };
    const onFailed = (req: import("@playwright/test").Request) => {
      if (!match(req.url())) return;
      cleanup();
      reject(new Error(`Supabase "${table}" 요청 실패: ${req.failure()?.errorText ?? "unknown"}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      page.off("response", onResponse);
      page.off("requestfailed", onFailed);
    };
    page.on("response", onResponse);
    page.on("requestfailed", onFailed);
  });
}
