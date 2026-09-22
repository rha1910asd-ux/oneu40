// 프리즈(신고) 검토 화면에서 관리자에게 참고용 힌트를 준다 — Jev(TypeSafe AI의
// System One 모델)에게 "이 신고가 타당한가"를 물어서 확률만 받아온다.
//
// 중요: 이건 순전히 "보조 역할"이다. 이 함수는 신고를 자동으로 처리(resolve)
// 하지 않는다 — 오직 참고용 숫자 하나만 돌려주고, 실제 인정/기각 버튼은
// 여전히 관리자가 직접 눌러야 한다. Jev는 지난주(2026-09-15)에 막 나온 신생
// 모델이라 정확도가 검증되지 않았다는 점도 고려한 설계다.
//
// 배포 전에 Vercel 환경변수에 아래를 등록해야 작동한다:
//   TYPESAFE_API_KEY — TypeSafe AI(Jev) API 키
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — 이미 다른 기능에서 등록해뒀다면 그대로 재사용됨
//
// 키가 없거나 호출이 실패해도 이 기능은 조용히 빠질 뿐, 신고 검토 화면
// 자체(관리자가 직접 보고 판단하는 기존 흐름)는 전혀 지장받지 않는다.

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
  const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "server not configured" });
    return;
  }
  if (!TYPESAFE_API_KEY) {
    // 아직 키를 등록 안 했을 수 있다 — 이건 "기능이 꺼져있다"는 뜻이지 오류가
    // 아니다. 화면 쪽에서 힌트 없이 조용히 넘어가도록 명확한 신호를 준다.
    res.status(200).json({ available: false });
    return;
  }

  // 관리자만 — admin_users 테이블에 있는지 확인한다(클라이언트 쪽 AuthContext와 같은 방식).
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
    const adminRes = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_users?user_id=eq.${userId}&select=user_id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const adminRows = adminRes.ok ? await adminRes.json() : [];
    if (!adminRows.length) {
      res.status(403).json({ error: "관리자만 사용할 수 있어요" });
      return;
    }
  } catch (e) {
    res.status(500).json({ error: "권한 확인에 실패했어요" });
    return;
  }

  const { postTitle, postContent, reason } = req.body || {};
  if (!postContent || !reason) {
    res.status(400).json({ error: "missing postContent or reason" });
    return;
  }

  try {
    const jevRes = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TYPESAFE_API_KEY}`,
      },
      body: JSON.stringify({
        state: {
          post_title: postTitle ?? "",
          post_content: String(postContent).slice(0, 2000),
          report_reason: reason,
        },
        model: "jev-latest",
        questions: {
          report_valid: {
            type: "noul",
            instructions: "Does `post_content` actually violate community guidelines in the way `report_reason` claims? Judge only what's in the text — don't assume anything not stated.",
            criteria: {
              true: "The post content clearly matches the reported problem",
              false: "The post content does not support the reported problem, or the report looks mistaken/abusive",
            },
          },
        },
      }),
    });

    if (!jevRes.ok) {
      const errText = await jevRes.text().catch(() => "");
      console.warn("[jev-freeze-hint] Jev 호출 실패:", jevRes.status, errText);
      res.status(200).json({ available: false });
      return;
    }

    const jevData = await jevRes.json();
    const noul = jevData?.answers?.report_valid?.noul;
    if (typeof noul !== "number") {
      res.status(200).json({ available: false });
      return;
    }

    res.status(200).json({ available: true, reportValidProbability: noul });
  } catch (e) {
    console.warn("[jev-freeze-hint] 실패:", e);
    // 실패해도 힌트가 없을 뿐 — 관리자 검토 흐름 자체는 그대로 계속된다.
    res.status(200).json({ available: false });
  }
};
