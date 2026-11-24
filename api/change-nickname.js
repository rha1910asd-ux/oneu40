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
  // 닉네임 규칙 — src/app/utils/nicknameRules.ts, DB 함수 nickname_problem 과 같은 규칙
  const problem = nicknameProblem(trimmed);
  if (problem) {
    res.status(400).json({ error: problem });
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

const BAD = new RegExp(
  "(씨발|시발|씨빨|시빨|쓰발|씹|좆|좃|존나|졸라|병신|븅신|빙신|개새|새끼|섀끼|미친놈|미친년|미친새|또라이|지랄|염병|엠창|느금|니애미|니미|애미|애비|닥쳐|꺼져|썅|엿먹|쌍놈|쌍년" +
    "|섹스|섹시|야동|야사|보지|자지|불알|딸딸|자위|강간|성폭|몸캠|조건만남|창녀|창놈|걸레" +
    "|한남충|한녀충|김치녀|된장녀|틀딱|급식충|맘충|짱깨|짱개|쪽바리|흑형|깜둥|애자|일베|히틀러" +
    "|자살|필로폰|코카인|대마초|도박|카지노|바카라|토토사이트" +
    "|fuck|fck|shit|bitch|sex|porn|nigg|fag|cunt|dick|pussy|asshole|slut|whore|rapist|nazi|hitler|penis)"
);
const STAFF = /(관리자|운영자|운영진|운영팀|관리인|어드민|admin|공식|staff|moderator|오느팀|오느운영|오느관리|오느공식|oneu)/;
const CONTACT_RAW = /(http|www\.|\.com|\.kr|\.net|01[0-9][ .-]?[0-9]{3,4})/;
const CONTACT = /(카톡|카카오톡|오픈채팅|오픈톡|텔레그램|텔레|인스타|kakao|telegram|openchat)/;
const RESERVED = new Set(["익명", "누군가", "나", "오느", "탈퇴한사용자", "알수없음", "시스템", "system"]);

/** 문제가 없으면 null, 있으면 사용자에게 보여줄 이유. */
function nicknameProblem(input) {
  const t = (input ?? "").trim();
  if ([...t].length < 2) return "닉네임은 2자 이상으로 적어주세요.";
  if ([...t].length > 12) return "닉네임은 12자 이내로 적어주세요.";
  if (!/^[가-힣a-zA-Z0-9 _.-]+$/.test(t)) return "한글·영문·숫자와 띄어쓰기, _ . - 만 쓸 수 있어요.";
  if (!/[가-힣a-zA-Z]/.test(t)) return "한글이나 영문을 한 글자 이상 넣어주세요.";
  if (/\s{2,}/.test(t)) return "띄어쓰기는 한 칸씩만 쓸 수 있어요.";
  if (/(.)\1{3,}/.test(t)) return "같은 글자를 너무 많이 이어 쓸 수 없어요.";
  const v = t.toLowerCase();
  const c = v.replace(/[ ._0-9-]/g, "");
  if (RESERVED.has(c)) return "이미 앱에서 쓰는 이름이라 쓸 수 없어요.";
  if (STAFF.test(c)) return "운영진으로 보일 수 있는 이름은 쓸 수 없어요.";
  if (CONTACT_RAW.test(v) || CONTACT.test(c)) return "연락처나 홍보 문구는 닉네임에 쓸 수 없어요.";
  if (BAD.test(c)) return "쓸 수 없는 말이 들어 있어요.";
  return null;
}
