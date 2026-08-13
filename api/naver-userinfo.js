// Supabase의 Custom OAuth Provider는 UserInfo 엔드포인트가 email 같은 값을
// 응답 최상위(flat)에 바로 담아서 줄 거라고 기대한다. 그런데 네이버는
//   { "resultcode": "00", "message": "success", "response": { "email": "...", "id": "..." } }
// 이렇게 한 겹 감싸서 주기 때문에, Supabase가 이메일을 못 찾아서
// "500: Error getting user email from external provider" 에러가 난다.
//
// 이 함수는 Supabase와 네이버 사이에 껴서, 네이버의 응답을 풀어
// Supabase가 이해할 수 있는 평평한(flat) 형태로 바꿔준다.
// Supabase 커스텀 제공자 설정의 "UserInfo URL"을 네이버 주소 대신
// 이 함수 주소로 넣으면 된다.

module.exports = async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) {
    res.status(401).json({ error: "missing authorization header" });
    return;
  }

  try {
    const naverRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: auth },
    });
    const data = await naverRes.json();

    if (data.resultcode !== "00" || !data.response) {
      res.status(400).json({ error: "naver userinfo request failed", detail: data });
      return;
    }

    const u = data.response;
    res.status(200).json({
      sub: u.id,
      email: u.email,
      email_verified: true,
      name: u.name || u.nickname || undefined,
      nickname: u.nickname || undefined,
      picture: u.profile_image || undefined,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
