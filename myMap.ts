// 마이맵(개인 지도) 공용 헬퍼.
// MyNode.tsx가 쓰는 것과 동일한 localStorage 키/데이터 형식을 사용하므로,
// 여기서 추가한 노드/기록은 마이맵 화면에 그대로 나타난다.
// 로그인한 사용자는 mymap_nodes/mymap_records 테이블에도 동기화된다
// (지금까지는 이 브라우저의 localStorage에만 저장되는 "캐시"였다).

import { safeGetItem, safeSetItem } from "../utils/safeStorage";
import { supabase } from "../lib/supabaseClient";

const MAP_KEY = "oneu-mymap-nodes";
const RECORDS_KEY = "oneu-mymap-records";
const ROOT_ID = "root";

// 이 브라우저 세션에서 서버 상태를 한 번이라도 확인(pull)했는지 — 확인 전에는 로컬 변경을
// 서버로 올리지 않는다. 안 그러면 새 기기에서 로그인 직후, 아직 못 받아온 서버의 진짜
// 데이터를 텅 빈/오래된 로컬 상태로 덮어써서 지워버리는 경쟁 상태(race condition)가 생긴다
// ("다른 곳에서 로그인하면 기록이 사라져있다"는 문제의 원인).
let pullAttempted = false;

// syncNow()가 겹쳐서 동시에 돌지 않게 막는 잠금 — 예전엔 사용자가 짧은 시간에 여러 번
// 바꾸면(노드 추가하자마자 기록 추가 등) syncNow가 겹쳐서 실행돼서, 서로 다른 시점의
// "전체 교체(지우고 다시 넣기)"가 경쟁하며 데이터가 꼬이거나 사라질 위험이 있었다.
// 이제 이미 동기화 중이면 다음 요청은 "끝나고 한 번 더"로 미뤄서 순서대로만 돈다.
let syncInProgress = false;
let syncPending = false;

/**
 * 로그아웃할 때 호출한다. 로컬(localStorage)에 남아있던 마이맵 데이터를 지워서,
 * 로그아웃한 뒤에도 이전 계정의 메모/기록이 화면에 남아있던 문제를 막는다.
 * 다음에 로그인하면 pullMyMapFromSupabase()가 그 계정의 진짜 데이터를 다시 받아온다.
 */
export function clearLocalMyMap(): void {
  try {
    localStorage.removeItem(MAP_KEY);
    localStorage.removeItem(RECORDS_KEY);
  } catch (_) {}
  pullAttempted = false;
}

export interface MapNode {
  id: string;
  label: string;
  color: string;
  note: string;
  parentId: string | null;
  createdAt: number;
}

export interface MapRecord {
  id: string;
  nodeId: string;
  content: string;
  createdAt: number;
  imageUrls?: string[];
  fontFamily?: string;
}

export function loadNodes(): MapNode[] {
  try {
    const raw = safeGetItem(MAP_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [{ id: ROOT_ID, label: "나", color: "#2C2420", note: "", parentId: null, createdAt: Date.now() }];
}

export function saveNodes(nodes: MapNode[]) {
  safeSetItem(MAP_KEY, JSON.stringify(nodes));
  if (pullAttempted) void syncNow();
}

export function loadRecords(): MapRecord[] {
  try {
    const raw = safeGetItem(RECORDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

export function saveRecords(records: MapRecord[]) {
  safeSetItem(RECORDS_KEY, JSON.stringify(records));
  if (pullAttempted) void syncNow();
}

/**
 * 지금 localStorage에 있는 마이맵 전체(nodes+records)를 Supabase에 그대로 반영한다.
 * 로그인 안 했으면 조용히 아무것도 안 한다 (로컬 캐시로만 남음).
 * upsert(있으면 갱신, 없으면 추가) + 이제는 없어진 것만 targeted로 지우는 방식이라,
 * 예전(전체 삭제 후 전체 재삽입)과 달리 중간에 끊겨도 "잠깐 동안 서버에 아무 데이터도
 * 없는" 위험한 순간이 생기지 않는다.
 */
export async function syncNow(): Promise<void> {
  if (syncInProgress) { syncPending = true; return; }
  syncInProgress = true;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const nodes = loadNodes();
    const records = loadRecords();
    const nodeIds = nodes.map((n) => n.id);
    const recordIds = records.map((r) => r.id);

    const nodeRows = nodes.map((n) => ({
      user_id: userId,
      id: n.id,
      label: n.label,
      color: n.color,
      note: n.note,
      parent_id: n.parentId,
      created_at: new Date(n.createdAt).toISOString(),
    }));
    const recordRows = records.map((r) => ({
      user_id: userId,
      id: r.id,
      node_id: r.nodeId,
      content: r.content,
      image_url: r.imageUrls?.[0] ?? null,
      image_urls: r.imageUrls ?? null,
      font_family: r.fontFamily ?? null,
      created_at: new Date(r.createdAt).toISOString(),
    }));

    if (nodeRows.length) {
      const { error } = await supabase.from("mymap_nodes").upsert(nodeRows, { onConflict: "user_id,id" });
      if (error) console.warn("[Supabase] 마이맵 노드 저장 실패:", error.message);
    }
    // 로컬에서 지워진 것만 targeted로 삭제 — nodeIds가 비어있으면(전부 지워짐) 조건 없이
    // 전체 삭제해도 안전하다(빈 배열로 .not(...)을 걸면 오히려 아무것도 안 지워진다).
    if (nodeIds.length > 0) {
      await supabase.from("mymap_nodes").delete().eq("user_id", userId).not("id", "in", `(${nodeIds.join(",")})`);
    } else {
      await supabase.from("mymap_nodes").delete().eq("user_id", userId);
    }

    if (recordRows.length) {
      const { error } = await supabase.from("mymap_records").upsert(recordRows, { onConflict: "user_id,id" });
      if (error) console.warn("[Supabase] 마이맵 기록 저장 실패:", error.message);
    }
    if (recordIds.length > 0) {
      await supabase.from("mymap_records").delete().eq("user_id", userId).not("id", "in", `(${recordIds.join(",")})`);
    } else {
      await supabase.from("mymap_records").delete().eq("user_id", userId);
    }
  } catch (e) {
    console.warn("[Supabase] 마이맵 저장 실패:", e);
  } finally {
    syncInProgress = false;
    if (syncPending) {
      syncPending = false;
      void syncNow();
    }
  }
}

/**
 * 로그인한 사용자의 서버 마이맵을 불러온다. 로그인 안 했거나 서버에
 * 데이터가 없으면 null을 반환한다 (이 경우 로컬 데이터를 그대로 쓰면 됨).
 */
export async function pullMyMapFromSupabase(): Promise<{ nodes: MapNode[]; records: MapRecord[] } | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return null;

    const [nodesRes, recordsRes] = await Promise.all([
      supabase.from("mymap_nodes").select("id, label, color, note, parent_id, created_at").eq("user_id", userId),
      supabase.from("mymap_records").select("id, node_id, content, image_url, image_urls, font_family, created_at").eq("user_id", userId),
    ]);

    // 로그인된 상태로 실제 서버 조회를 완료했다 — 이제부터 로컬 변경을 서버로 올려도 안전하다.
    pullAttempted = true;

    if (nodesRes.error || !nodesRes.data || nodesRes.data.length === 0) {
      if (nodesRes.error) console.warn("[Supabase] 마이맵 불러오기 실패:", nodesRes.error.message);
      return null;
    }

    const nodes: MapNode[] = nodesRes.data.map((row) => ({
      id: row.id,
      label: row.label,
      color: row.color,
      note: row.note ?? "",
      parentId: row.parent_id,
      createdAt: new Date(row.created_at).getTime(),
    }));

    const records: MapRecord[] = (recordsRes.data ?? []).map((row) => ({
      id: row.id,
      nodeId: row.node_id,
      content: row.content,
      createdAt: new Date(row.created_at).getTime(),
      imageUrls: (row.image_urls && row.image_urls.length > 0)
        ? row.image_urls
        : (row.image_url ? [row.image_url] : undefined),
      fontFamily: row.font_family ?? undefined,
    }));

    return { nodes, records };
  } catch (e) {
    console.warn("[Supabase] 마이맵 불러오기 실패:", e);
    return null;
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 같은 라벨의 노드가 마이맵에 이미 있으면 그 id를,
 * 없으면 '나'(root)에 연결된 새 노드를 만들어 그 id를 반환한다.
 */
export function ensureMyMapNode(label: string, color: string): string {
  const nodes = loadNodes();
  const trimmed = label.trim();

  const existing = nodes.find((n) => n.label.trim() === trimmed);
  if (existing) return existing.id;

  const newNode: MapNode = {
    id: makeId("mm"),
    label: trimmed,
    color: color || "#8B6D44",
    note: "",
    parentId: ROOT_ID,
    createdAt: Date.now(),
  };
  saveNodes([...nodes, newNode]);
  notifyMyMapUpdated();
  return newNode.id;
}

/** 마이맵의 특정 노드에 기록 하나를 추가한다. */
export function addMyMapRecord(nodeId: string, content: string, imageUrls?: string[], fontFamily?: string): void {
  const records = loadRecords();
  const record: MapRecord = {
    id: makeId("rec"),
    nodeId,
    content,
    createdAt: Date.now(),
    imageUrls,
    fontFamily,
  };
  saveRecords([...records, record]);
  notifyMyMapUpdated();
}

/**
 * 게시물 저장: 게시물이 위치한 공간(spaceLabel)의 노드를 마이맵에 보장하고,
 * 그 노드 아래에 게시물을 기록으로 저장한다(사진이 있으면 사진도 같이).
 */
export function savePostToMyMap(
  spaceLabel: string,
  spaceColor: string,
  postTitle: string,
  postContent: string,
  imageUrls?: string[]
): void {
  const nodeId = ensureMyMapNode(spaceLabel, spaceColor);
  const content = postContent.trim()
    ? `${postTitle.trim()}\n\n${postContent.trim()}`
    : postTitle.trim();
  addMyMapRecord(nodeId, content, imageUrls && imageUrls.length > 0 ? imageUrls : undefined);
}

/** 노드 즐겨찾기: 해당 노드를 마이맵의 '나'에 연결한다 (기록은 추가하지 않음). */
export function addFavoriteNodeToMyMap(label: string, color: string): void {
  ensureMyMapNode(label, color);
}

function notifyMyMapUpdated() {
  try {
    window.dispatchEvent(new CustomEvent("oneu:mymap-updated"));
  } catch (_) {}
}

/**
 * 기록에 첨부할 사진을 Supabase Storage(mymap-photos 버킷)에 올리고, 그 저장 경로를
 * 반환한다(공개 URL이 아니다 — 버킷이 비공개라 항상 서명된 URL을 새로 받아와야
 * 보인다. resolveRecordPhotoUrl로 보여줄 때마다 새로 발급받는다).
 * 로그인 안 했으면 업로드하지 않고 null을 반환한다(사진 없이 기록만 남길 수 있음).
 */
export async function uploadRecordPhoto(file: File): Promise<string | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return null;

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage.from("mymap-photos").upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) {
      console.warn("[Supabase] 사진 업로드 실패:", error.message);
      return null;
    }

    return path;
  } catch (e) {
    console.warn("[Supabase] 사진 업로드 실패:", e);
    return null;
  }
}

// 서명된 URL을 짧게 캐싱해서, 같은 화면 안에서 여러 번 안 불러오게 한다.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * 저장된 경로(또는 예전 방식의 공개 URL)를 실제로 화면에 띄울 수 있는 URL로 바꾼다.
 * 이미 "http"로 시작하면(예전에 만든 기록의 공개 URL) 그대로 쓰고, 아니면 비공개
 * 버킷에서 본인만 열 수 있는 서명된 URL을 새로 발급받는다(1시간 유효).
 */
export async function resolveRecordPhotoUrl(pathOrUrl: string): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;

  const cached = signedUrlCache.get(pathOrUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  try {
    const { data, error } = await supabase.storage.from("mymap-photos").createSignedUrl(pathOrUrl, 3600);
    if (error || !data?.signedUrl) {
      console.warn("[Supabase] 사진 URL 발급 실패:", error?.message);
      return null;
    }
    signedUrlCache.set(pathOrUrl, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
    return data.signedUrl;
  } catch (e) {
    console.warn("[Supabase] 사진 URL 발급 실패:", e);
    return null;
  }
}
