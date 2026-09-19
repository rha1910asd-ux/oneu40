// 정리 안 된 텍스트를 마인드맵용 마크다운으로 자동 정리하는 서버 함수.
// 지금까지 사용자가 ChatGPT·Claude에 직접 복사해서 붙여넣던 프롬프트
// (src/app/data/aiImportGuideline.ts의 AI_IMPORT_GUIDELINE)를, 여기서
// 서버가 대신 실행해준다 — "파일로 지도 만들기" 화면에서 한 번에 끝나게.
//
// 배포 전에 Vercel 환경변수에 아래를 등록해야 작동한다:
//   ANTHROPIC_API_KEY — Anthropic API 키
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — 이미 다른 기능에서 등록해뒀다면 그대로 재사용됨
//
// 이 프롬프트 텍스트는 src/app/data/aiImportGuideline.ts와 내용이 같아야
// 한다 — 프런트(Vite로 빌드되는 TS)와 이 서버 함수(별도 CommonJS)가 서로
// import를 공유하지 않는 구조라 부득이하게 복사해뒀다. 한쪽을 고치면
// 반드시 다른 쪽도 같이 고쳐야 한다.
const AI_IMPORT_GUIDELINE = `아래 파일(또는 텍스트)을 마인드맵으로 만들 수 있게 정리해줘.

**출력 형식 — 마크다운 제목 + 설명**
- #, ##, ### 처럼 "#" 개수로 단계를 나타내는 마크다운 제목을 쓰고, 제목
  바로 다음 줄에 설명을 2~4문장으로 붙여줘(이건 그 노드의 "메모"로 들어가서
  나중에 눌렀을 때 보여). 구체적인 수치·날짜·근거·예시를 최대한 담아줘 —
  제목만 보고는 못 떠올릴 내용을 여기서 채워준다고 생각하면 돼. 설명은 다음
  제목이 나오기 전까지로.
- 문장이 2개 이상이면 한 줄에 다 몰아 쓰지 말고, 문장마다 줄을 바꿔줘 —
  한 덩어리로 쭉 이어지면 어디서 한 생각이 끝나고 다음 생각이 시작되는지
  구분이 안 돼서 읽기 답답해.
- 예시:
  # 큰 주제
  ## 하위 주제 1
  구체적인 수치나 맥락, 근거를 여기 한 문장. 원문에 있는 숫자나 고유명사는
  요약하지 말고 그대로 옮겨줘.
  이어지는 다음 생각은 이렇게 줄을 바꿔서 새 문장으로.
  ### 더 구체적인 항목
  ## 하위 주제 2

**정리할 때 지켜줄 것**
1. 문장을 그대로 나열하지 말고, 비슷한 내용끼리 묶어서 상위 제목을 새로
   만들어줘. 원문에 있는 모든 문장을 각각 하나씩 옮기는 게 아니라, "이
   문단들이 결국 무슨 얘기를 하는지" 스스로 판단해서 요약된 제목으로
   바꿔줘. 다만 그렇게 뭉뚱그리는 과정에서 사라지는 구체적인 내용(수치,
   사례, 이유)은 버리지 말고 설명(메모) 쪽으로 옮겨줘 — 제목은 압축하되
   내용은 잃지 않는 게 핵심이야.
2. 먼저 원문 전체가 결국 하나의 큰 주제를 다루고 있는 건 아닌지 확인해줘
   (예: 영상 하나, 글 하나가 통째로 "외로움"이라는 한 가지를 얘기하는
   경우). 그렇다면 최상위 제목(#)을 그 주제 하나로만 잡고, 원문에서
   다루는 여러 각도(정의·원인·영향·해법 같은)는 전부 그 밑의 ##로
   묶어줘. "외로움의 원인", "외로움의 영향", "외로움 극복법"처럼 겉보기에
   서로 다른 이야기 같아도, 결국 같은 주제의 여러 측면이면 반드시 하나의
   #로 모아야 해 — 각각을 별도의 #로 쪼개면 안 돼. #가 여러 개 필요한
   경우는 원문이 정말로 서로 다른 여러 주제를 다룰 때뿐이야.
3. 제목 하나는 짧게 — 20자 안팎의 명사구로. "~는 ~다" 같은 완전한 문장이
   아니라 "여행 계획", "예산 관리"처럼 이름표 수준으로 줄여줘. 24자를
   넘기면 뒷부분이 잘려.
4. 전체 제목 개수는 150개를 넘기지 마. 원문이 길면 자잘한 내용은 상위
   제목 안으로 합치고, 꼭 필요한 것만 하위 항목으로 남겨줘.
5. 단계는 최대 3~4단계 정도로 — 너무 깊게 파고들지 말고, 비슷한 수준끼리는
   같은 단계에 모아줘.
6. 전부 같은 단계로 평평하게 늘어놓지 마. 최상위 제목 몇 개 아래에
   하위 항목이 실제로 딸려 있는, 위아래로 갈라지는 진짜 나무 구조로
   만들어줘 — 그래야 지도 위에서 한눈에 읽힌다.
7. 원문의 언어(한국어/영어 등)를 그대로 따라줘. 번역하지 마.
8. 원문이 유튜브 자막이나 강연 스크립트처럼 말하듯이 쓰인 글이면(문장이
   자꾸 끊기거나, "음", "그러니까", "아 그리고" 같은 말버릇이 섞여
   있으면), 그런 군더더기와 같은 말 반복은 무시하고 실제로 하는 말의
   핵심만 뽑아줘. 타임스탬프("00:12:34" 같은)나 화자 표시("[진행자]:")도
   지워도 돼 — 이런 것들은 구조와 무관한 잡음이야.

**하지 말아야 할 것**
- 설명(메모)이 한 문장으로 너무 짧거나, 반대로 한 문단을 통째로 옮기는 건
  피해줘 — 2~4문장, 400자 정도가 적당해.
- "===", "---" 같은 구분선을 넣지 마.
- 볼드·이탤릭 같은 다른 마크다운 문법은 필요 없어, 제목(#)만 써줘.
- "네, 정리해드릴게요!" 같은 인사말이나 설명 없이, 정리된 마크다운 본문만
  바로 출력해줘. 앞뒤에 다른 말이 섞여 있으면 파일로 저장했을 때 그대로
  같이 들어가서 지도를 만들 때 방해가 돼.`;

// 텍스트 길이 상한 — 너무 긴 입력은 호출 하나당 비용이 커진다. 대략
// 한글 기준 4천 자 안팎이면 A4 몇 페이지 분량의 글은 충분히 담긴다.
const MAX_INPUT_CHARS = 12000;
// 하루 사용 횟수 상한 — 수익 없는 초기 단계에서 무제한으로 열어두면
// 예측 못 한 비용이 쌓일 수 있다. 필요하면 나중에 계정별로 다르게(예:
// 후원자는 더 많이) 조정할 수 있게 숫자 하나로 뺐다.
const DAILY_LIMIT = 5;

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

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "server not configured — ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다" });
    return;
  }

  // 로그인한 사람만 — 그리고 이 아래에서 그 사람의 userId로 하루 사용량을 잰다.
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

  const { text, fileName } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "missing text" });
    return;
  }
  if (text.length > MAX_INPUT_CHARS) {
    res.status(400).json({ error: `텍스트가 너무 길어요(${text.length.toLocaleString()}자). ${MAX_INPUT_CHARS.toLocaleString()}자 이하로 줄여서 다시 시도해주세요.` });
    return;
  }

  // 하루 사용량 확인 — 오늘 날짜(UTC 기준) 행을 읽어서 이미 한도를 넘었는지 본다.
  const today = new Date().toISOString().slice(0, 10);
  let currentCount = 0;
  try {
    const usageRes = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_import_usage?user_id=eq.${userId}&usage_date=eq.${today}&select=count`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const usageRows = usageRes.ok ? await usageRes.json() : [];
    currentCount = usageRows[0]?.count ?? 0;
    if (currentCount >= DAILY_LIMIT) {
      res.status(429).json({ error: `오늘은 AI 자동 정리를 이미 ${DAILY_LIMIT}번 쓰셨어요. 내일 다시 시도해주세요.` });
      return;
    }
  } catch (e) {
    // 사용량 확인 자체가 실패해도(네트워크 등) 기능이 완전히 막히진 않게 한다.
    console.warn("[ai-outline] 사용량 확인 실패:", e);
  }

  // Claude 호출 — 결과는 정리된 마크다운 텍스트 하나만 받는다.
  let outlineText;
  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        // 가이드라인(AI_IMPORT_GUIDELINE)은 호출할 때마다 완전히 똑같은
        // 내용이다 — 그런데 예전엔 이걸 매번 사용자 글과 합쳐서 하나의
        // user 메시지로 통째로 보내고 있었다. 매번 똑같은 부분을 매번 새로
        // 계산하고 매번 정가로 값을 치른 셈이다.
        //
        // 이 프롬프트만 system으로 따로 빼고 cache_control을 붙이면,
        // 5분 안에 다시 호출될 때 이 부분은 캐시에서 읽어와서 90% 싸게
        // 처리된다(2026년 2월 정식 기능이 돼서 별도 베타 헤더 없이 바로
        // 쓸 수 있다). 사용자마다 매번 다른 글(text)만 user 메시지에 남겨서,
        // 캐시가 안 맞을 일이 없는 "고정된 부분"과 "매번 바뀌는 부분"을
        // 확실히 나눴다.
        system: [
          { type: "text", text: AI_IMPORT_GUIDELINE, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: `${fileName ? `(파일명: ${fileName})\n\n` : ""}${text}`,
          },
        ],
      }),
    });
    if (!claudeRes.ok) {
      const errBody = await claudeRes.text().catch(() => "");
      console.warn("[ai-outline] Claude 호출 실패:", claudeRes.status, errBody);
      res.status(502).json({ error: "정리하는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요." });
      return;
    }
    const claudeData = await claudeRes.json();
    // 캐싱이 실제로 걸리고 있는지는 여기서만 확인할 수 있다(대시보드에 바로
    // 안 보인다) — cache_read_input_tokens가 0보다 크면 캐시를 읽어와서 90%
    // 싸게 처리됐다는 뜻이고, cache_creation_input_tokens는 이번 호출에서
    // 새로 캐시를 만들었다는 뜻이다(그 5분 안에 또 호출이 오면 그때부터
    // 할인이 적용된다).
    if (claudeData.usage) {
      console.log("[ai-outline] 캐시 사용량:", {
        cache_read: claudeData.usage.cache_read_input_tokens ?? 0,
        cache_write: claudeData.usage.cache_creation_input_tokens ?? 0,
        input: claudeData.usage.input_tokens ?? 0,
        output: claudeData.usage.output_tokens ?? 0,
      });
    }
    outlineText = (claudeData.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (!outlineText) throw new Error("empty response");
  } catch (e) {
    console.warn("[ai-outline] Claude 호출 실패:", e);
    res.status(502).json({ error: "정리하는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요." });
    return;
  }

  // 사용량을 늘린다 — 실제로 API 호출(비용 발생)까지 마친 뒤에 기록해야,
  // 실패한 시도까지 한도에 포함되는 억울한 상황이 안 생긴다. 위에서 이미
  // 읽어둔 currentCount에 1을 더한 값으로 통째로 덮어쓴다(upsert) — 행이
  // 없으면 새로 만들고, 있으면 그 값으로 교체한다.
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_import_usage`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify([{ user_id: userId, usage_date: today, count: currentCount + 1 }]),
    });
  } catch (e) {
    // 기록에 실패해도 사용자에게는 이미 정리 결과를 내려줬으니 여기서 막지 않는다 —
    // 다만 이 경우 하루 한도 집계가 실제보다 낮게 남을 수 있다.
    console.warn("[ai-outline] 사용량 기록 실패:", e);
  }

  res.status(200).json({ text: outlineText });
};
