// 알림을 실제 푸시(앱이 꺼져있어도 오는 알림)로 보내는 서버 함수.
// createNotification()이 앱 안 알림(종 아이콘)을 만들 때 이 함수도 같이 호출한다.
//
// 보안: 예전엔 로그인만 하면 아무에게나 "원하는 제목·내용·링크"로 푸시를 보낼 수 있었고,
// 받는 사람 id를 주소에 그대로 넣어 구독자 전체에게 보내는 것도 가능했다(가짜 링크 피싱 위험).
// 이제는
//  - 앱은 "무슨 일이 있었는지"(kind)와 글 id, 받는 사람 id만 보낸다.
//  - 서버가 그 일이 실제로 있었는지 DB에서 확인한다(댓글을 정말 달았는지, 받는 사람이 그 글/댓글의
//    주인인지, 관리자인지 등).
//  - 푸시 문구와 이동 주소는 서버가 정해진 틀로만 만든다(앱이 보낸 글자는 쓰지 않는다).
//  - 오류 내용은 밖으로 내보내지 않는다.
//
// 필요한 환경변수: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const webpush = require("web-push");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NODE_PATH_RE = /^[A-Za-z0-9_\-/.]{1,200}$/;
const KINDS = new Set(["comment", "reply", "like", "mymap-save", "freeze", "freeze-result"]);
const RECENT_MS = 10 * 60 * 1000; // "방금 한 일"로 인정하는 시간 — 10분

function cut(s, n) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const auth = req.headers.authorization;
  if (!auth) {
    res.status(401).json({ error: "missing authorization" });
    return;
  }

  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !KEY) {
    res.status(500).json({ error: "server not configured" });
    return;
  }
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const db = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
    if (!r.ok) throw new Error("db");
    return r.json();
  };

  // 1) 부른 사람 확인
  let callerId;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: KEY } });
    if (!r.ok) throw new Error("auth");
    callerId = (await r.json()).id;
    if (!UUID_RE.test(String(callerId || ""))) throw new Error("auth");
  } catch (_) {
    res.status(401).json({ error: "invalid session" });
    return;
  }

  // 2) 받은 값 검사 — 형식이 다르면 아예 조회하지 않는다(주소에 끼워 넣기 방지)
  const { kind, targetUserId, postId } = req.body || {};
  if (!KINDS.has(kind) || !UUID_RE.test(String(targetUserId || "")) || (postId != null && !UUID_RE.test(String(postId)))) {
    res.status(400).json({ error: "bad request" });
    return;
  }
  if (targetUserId === callerId) {
    res.status(200).json({ ok: true, sent: 0 });
    return;
  }

  try {
    const since = new Date(Date.now() - RECENT_MS).toISOString();
    const isAdmin = (await db(`admin_users?user_id=eq.${callerId}&select=user_id`)).length > 0;

    let post = null;
    if (postId) {
      const rows = await db(`posts?id=eq.${postId}&select=id,user_id,title,node_path`);
      post = rows[0] || null;
    }
    const owner = post && post.user_id;
    const commentAuthorOnPost = async (uid) =>
      post ? (await db(`comments?post_id=eq.${post.id}&user_id=eq.${uid}&select=id&limit=1`)).length > 0 : false;

    // 3) 실제로 있었던 일인지 확인
    let allowed = false;
    if (kind === "comment") {
      // 방금 이 글에 댓글을 달았고, 받는 사람이 글쓴이
      allowed = !!post && owner === targetUserId &&
        (await db(`comments?post_id=eq.${post.id}&user_id=eq.${callerId}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`)).length > 0;
    } else if (kind === "reply") {
      // 방금 이 글에 댓글을 달았고, 받는 사람이 이 글에 댓글을 단 사람
      allowed = !!post &&
        (await db(`comments?post_id=eq.${post.id}&user_id=eq.${callerId}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`)).length > 0 &&
        (await commentAuthorOnPost(targetUserId));
    } else if (kind === "like") {
      // 이 글에 공감이 실제로 있고, 받는 사람이 글쓴이
      allowed = !!post && owner === targetUserId &&
        (await db(`post_likes?post_id=eq.${post.id}&user_id=eq.${callerId}&select=post_id&limit=1`)).length > 0;
    } else if (kind === "mymap-save") {
      // 마이맵 저장은 서버에 흔적이 없어서 글쓴이에게만, 정해진 문구로만 보낸다
      allowed = !!post && owner === targetUserId;
    } else if (kind === "freeze") {
      // 방금 이 글(또는 댓글)을 프리즈했고, 받는 사람이 그 글쓴이 또는 댓글 쓴 사람
      allowed = !!post &&
        (await db(`post_freezes?post_id=eq.${post.id}&frozen_by=eq.${callerId}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`)).length > 0 &&
        (owner === targetUserId || (await commentAuthorOnPost(targetUserId)));
    } else if (kind === "freeze-result") {
      allowed = isAdmin; // 검토 결과는 관리자만
    }
    if (!allowed) {
      res.status(403).json({ error: "not allowed" });
      return;
    }

    // 4) 문구와 이동 주소는 서버가 정한다
    let nick = "누군가";
    try {
      const p = await db(`profiles?user_id=eq.${callerId}&select=nickname`);
      if (p[0] && p[0].nickname) nick = cut(p[0].nickname, 20);
    } catch (_) {}
    const title = post ? cut(post.title, 30) : "";
    const bodyByKind = {
      comment: `${nick}님이 "${title}"에 댓글을 남겼어요`,
      reply: `${nick}님이 내 댓글에 답글을 남겼어요`,
      like: `${nick}님이 "${title}"에 공감했어요`,
      "mymap-save": `내 글 "${title}"이(가) 마이맵에 저장됐어요`,
      freeze: `내 글 또는 댓글이 프리즈됐어요. 관리자가 살펴보고 있어요`,
      "freeze-result": `프리즈 검토 결과가 나왔어요. 알림에서 확인해 보세요`,
    };
    const url = post && NODE_PATH_RE.test(String(post.node_path || ""))
      ? `/space/${post.node_path}?post=${post.id}`
      : "/";

    // 5) 보내기
    webpush.setVapidDetails("mailto:hello@oneu.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const subs = await db(`push_subscriptions?user_id=eq.${targetUserId}&select=endpoint,p256dh,auth`);
    if (!Array.isArray(subs) || subs.length === 0) {
      res.status(200).json({ ok: true, sent: 0 });
      return;
    }
    const payload = JSON.stringify({ title: "오느", body: bodyByKind[kind], url });
    await Promise.allSettled(
      subs.map((sub) =>
        webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
          .catch(async (err) => {
            // 구독이 만료/취소됐으면(410 Gone, 404) 정리해둔다.
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
              await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
                method: "DELETE",
                headers: H,
              });
            }
          })
      )
    );
    res.status(200).json({ ok: true, sent: subs.length });
  } catch (e) {
    console.error("[send-push] 실패");
    res.status(500).json({ error: "internal error" });
  }
};
