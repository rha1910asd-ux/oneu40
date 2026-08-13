// 계정(로그인 정보) 자체를 지우는 건 Supabase 클라이언트 SDK로는 할 수 없다
// (본인이라도 자기 계정을 직접 못 지우고, service role 키가 있어야 한다).
// 이 키는 절대 브라우저 코드에 들어가면 안 되기 때문에, 이 서버 함수 안에서만 쓴다.
//
// 배포 전에 Vercel 프로젝트 설정 → Environment Variables에 아래 두 개를 등록해야
// 이 함수가 작동한다:
//   SUPABASE_URL              — https://qorsbgtpwvqvcscdpypx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — Supabase 대시보드 Settings → API → service_role 키
//     (anon 키가 아니라 service_role 키다. 이건 완전 관리자 권한이라 외부에 절대 노출되면 안 된다 —
//      그래서 config.js가 아니라 여기, 서버에서만 쓰는 환경변수로 넣는다.)

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

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "server not configured — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다" });
    return;
  }

  try {
    // 요청에 담긴 토큰이 진짜 로그인된 사용자의 것인지 먼저 확인한다
    // (아무나 아무 계정이나 지울 수 없도록).
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: auth, apikey: SERVICE_ROLE_KEY },
    });
    if (!userRes.ok) {
      res.status(401).json({ error: "invalid session" });
      return;
    }
    const user = await userRes.json();
    const userId = user.id;
    if (!userId) {
      res.status(401).json({ error: "invalid session" });
      return;
    }

    // 실제 계정 삭제 (Admin API — service role 키로만 가능)
    const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
    });

    if (!delRes.ok) {
      const detail = await delRes.text();
      res.status(500).json({ error: "delete failed", detail });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
