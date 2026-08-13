// 알림을 실제 푸시(앱이 꺼져있어도 오는 알림)로 보내는 서버 함수.
// createNotification()이 앱 안 알림(종 아이콘)을 만들 때 이 함수도 같이 호출해서
// 그 사람의 등록된 기기들로 진짜 푸시를 보낸다.
//
// 배포 전에 Vercel 환경변수에 아래 3개를 등록해야 작동한다:
//   VAPID_PUBLIC_KEY   — 공개 키 (클라이언트 구독에도 쓰이는 값과 동일해야 함)
//   VAPID_PRIVATE_KEY  — 비밀 키 (절대 외부 노출 금지)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — 이미 계정 삭제 기능에서 등록해뒀다면 그대로 재사용됨

const webpush = require("web-push");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "server not configured — VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다" });
    return;
  }

  const { userId, title, body, url } = req.body || {};
  if (!userId) {
    res.status(400).json({ error: "missing userId" });
    return;
  }

  webpush.setVapidDetails("mailto:hello@oneu.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  try {
    const subsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=endpoint,p256dh,auth`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const subs = await subsRes.json();

    if (!Array.isArray(subs) || subs.length === 0) {
      res.status(200).json({ ok: true, sent: 0 });
      return;
    }

    const payload = JSON.stringify({ title: title || "오느", body: body || "", url: url || "/" });

    await Promise.allSettled(
      subs.map((sub) =>
        webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
          .catch(async (err) => {
            // 구독이 만료/취소됐으면(410 Gone, 404) 정리해둔다.
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
              await fetch(
                `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
                { method: "DELETE", headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
              );
            }
          })
      )
    );

    res.status(200).json({ ok: true, sent: subs.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
