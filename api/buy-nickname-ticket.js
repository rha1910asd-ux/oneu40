// 닉네임 변경권 구매 — 에메랄드 1개를 쓰고 profiles.nickname_change_tickets를
// 1 늘린다. 닉네임 관련 컬럼(nickname, nickname_change_tickets)은 RLS가
// UPDATE를 원천 차단해뒀다(닉네임을 회원가입 때 한 번만 고정하기 위해서) —
// 그래서 일반 클라이언트가 아니라 이 서버 함수(service_role 키, RLS 우회)를
// 통해서만 늘릴 수 있다.

const TICKET_PRICE_EMERALDS = 1;

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

  try {
    // 1) 지금 에메랄드가 충분한지 확인한다.
    const currencyRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_currency?user_id=eq.${userId}&select=emeralds`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const currencyRows = currencyRes.ok ? await currencyRes.json() : [];
    const currentEmeralds = currencyRows[0]?.emeralds ?? 0;
    if (currentEmeralds < TICKET_PRICE_EMERALDS) {
      res.status(400).json({ error: "에메랄드가 부족해요." });
      return;
    }

    // 2) 에메랄드를 차감한다.
    const { error: spendError } = await (async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/user_currency?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emeralds: currentEmeralds - TICKET_PRICE_EMERALDS, updated_at: new Date().toISOString() }),
      });
      return { error: r.ok ? null : await r.text() };
    })();
    if (spendError) {
      console.warn("[buy-nickname-ticket] 에메랄드 차감 실패:", spendError);
      res.status(502).json({ error: "결제 처리 중 문제가 생겼어요." });
      return;
    }

    // 3) 변경권 개수를 늘린다. 지금 보유 개수를 먼저 읽어서 +1로 덮어쓴다
    //    (여러 재화 필드를 한 번에 다루는 CurrencyContext.tsx의 upsert 패턴과
    //    같은 방식 — 이 프로젝트에서 이미 검증된 방식이라 그대로 따랐다).
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}&select=nickname_change_tickets`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profileRows = profileRes.ok ? await profileRes.json() : [];
    const currentTickets = profileRows[0]?.nickname_change_tickets ?? 0;
    const { error: ticketError } = await (async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nickname_change_tickets: currentTickets + 1 }),
      });
      return { error: r.ok ? null : await r.text() };
    })();
    if (ticketError) {
      // 에메랄드는 이미 빠져나갔는데 여기서 실패하면 유저가 손해를 본다 —
      // 에메랄드를 되돌려준다.
      console.warn("[buy-nickname-ticket] 변경권 지급 실패, 에메랄드 환불:", ticketError);
      await fetch(`${SUPABASE_URL}/rest/v1/user_currency?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ emeralds: currentEmeralds }),
      }).catch(() => {});
      res.status(502).json({ error: "변경권 지급 중 문제가 생겼어요. 에메랄드는 환불됐어요." });
      return;
    }

    res.status(200).json({ ok: true, tickets: currentTickets + 1, emeralds: currentEmeralds - TICKET_PRICE_EMERALDS });
  } catch (e) {
    console.warn("[buy-nickname-ticket] 실패:", e);
    res.status(500).json({ error: "처리 중 문제가 생겼어요." });
  }
};
