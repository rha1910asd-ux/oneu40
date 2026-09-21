// 닉네임 변경권을 1개 소비하면서 닉네임을 실제로 바꾼다. profiles.nickname은
// RLS가 UPDATE를 원천 차단해뒀으므로(회원가입 때 한 번만 고정), 이 서버
// 함수(service_role 키)를 통해서만 바꿀 수 있다 — 변경권을 갖고 있는지도
// 여기서 함께 확인한다.

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
    res.status(500).json({ error: "server not configured" });
    return;
  }

  let userId;
  try {
    const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: auth, apikey: SERVICE_ROLE_KEY },
    });
    if (!callerRes.ok) {
      res.status(401).json({ error: "invalid session" });
      return;
    }
    const callerData = await callerRes.json();
    userId = callerData.id;
    if (!userId) throw new Error("no user id");
  } catch (e) {
    res.status(401).json({ error: "invalid session" });
    return;
  }

  const { nickname } = req.body || {};
  const trimmed = typeof nickname === "string" ? nickname.trim() : "";
  if (!trimmed) {
    res.status(400).json({ error: "닉네임을 입력해주세요." });
    return;
  }
  if (trimmed.length > 20) {
    res.status(400).json({ error: "닉네임은 20자 이내로 적어주세요." });
    return;
  }

  try {
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}&select=nickname_change_tickets`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const rows = profileRes.ok ? await profileRes.json() : [];
    const tickets = rows[0]?.nickname_change_tickets ?? 0;
    if (tickets < 1) {
      res.status(400).json({ error: "닉네임 변경권이 없어요." });
      return;
    }

    const { error } = await (async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nickname: trimmed,
          nickname_change_tickets: tickets - 1,
          updated_at: new Date().toISOString(),
        }),
      });
      return { error: r.ok ? null : await r.text() };
    })();
    if (error) {
      console.warn("[change-nickname] 실패:", error);
      res.status(502).json({ error: "변경 중 문제가 생겼어요." });
      return;
    }

    res.status(200).json({ ok: true, nickname: trimmed, tickets: tickets - 1 });
  } catch (e) {
    console.warn("[change-nickname] 실패:", e);
    res.status(500).json({ error: "처리 중 문제가 생겼어요." });
  }
};
