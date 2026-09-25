// 게시물 공유 링크(/p/글id)의 미리보기 — 카카오톡·메시지·슬랙 등은 링크를 받으면 그 주소의
// HTML만 읽고 자바스크립트는 실행하지 않는다. 이 앱은 화면을 자바스크립트로 그려서, 어떤 글
// 링크를 보내도 똑같은 기본 HTML만 읽혔다(제목·사진 없는 밋밋한 미리보기).
//
// 그래서 공유 링크는 이 서버 함수가 직접 응답한다:
//  - 미리보기를 만드는 쪽(카카오톡 등)에게는 그 글의 제목·내용 일부·첫 사진을 og 태그로 준다.
//  - 사람이 누르면 같은 HTML이 곧바로 원래 글 화면(/space/공간?post=글id)으로 넘겨준다.
//
// public/vercel.json의 rewrite가 /p/:id → /api/post-preview?id=:id 로 연결한다.
// 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY(다른 서버 함수와 같은 값).

const SITE_NAME = "오느";
const DEFAULT_TITLE = "오느, 좋아하는 것으로 이어지는 공간";
const DEFAULT_DESC = "관심사로 사람을 잇는 조용한 커뮤니티. 팔로워 수도, 인기 순위도 없이 좋아하는 것을 나눠요.";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** 본문에서 미리보기 한 줄을 뽑는다 — 주소·줄바꿈을 걷어내고 앞부분만. */
function summarize(content) {
  const text = String(content ?? "")
    .replace(/\[\[[a-z]+:\d+\]\]/g, "") // 본문 속 사진 자리 표시([[img:0]]) — 앱 내부 표기라 뺀다
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[@!](\S+)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 90 ? text.slice(0, 88) + "…" : text;
}

/** 사진이 없고 유튜브 링크가 있으면 그 영상의 썸네일을 쓴다. */
function youtubeThumb(content) {
  const m = String(content ?? "").match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

async function supa(path, url, key) {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) return null;
  return r.json();
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || "");
  const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let title = DEFAULT_TITLE, desc = DEFAULT_DESC, image = `${origin}/og-default.png`;
  let target = `${origin}/`;

  // 글 id는 uuid만 받는다 — 그 외 값은 조회하지 않고 앱 첫 화면으로 보낸다.
  if (/^[0-9a-f-]{36}$/i.test(id) && SUPABASE_URL && KEY) {
    try {
      const rows = await supa(`posts?id=eq.${id}&select=title,content,image_url,image_urls,node_path,is_frozen`, SUPABASE_URL, KEY);
      const post = rows && rows[0];
      if (post) {
        target = `${origin}/space/${post.node_path}?post=${id}`;
        // 프리즈(검토 중) 된 글은 내용을 미리보기에 싣지 않는다 — 링크만 이어준다.
        if (!post.is_frozen) {
          let spaceLabel = "";
          const nodes = await supa(`custom_nodes?id=eq.${encodeURIComponent(post.node_path)}&select=label`, SUPABASE_URL, KEY);
          if (nodes && nodes[0] && nodes[0].label) spaceLabel = nodes[0].label;
          title = post.title || DEFAULT_TITLE;
          const summary = summarize(post.content);
          desc = [spaceLabel ? `${spaceLabel} 게시판` : "", summary].filter(Boolean).join(" · ") || DEFAULT_DESC;
          const firstImage = (Array.isArray(post.image_urls) && post.image_urls[0]) || post.image_url || youtubeThumb(post.content);
          if (firstImage) image = firstImage;
        }
      }
    } catch (e) {
      console.warn("[post-preview] 불러오기 실패:", e);
    }
  }

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:url" content="${esc(origin + "/p/" + id)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${esc(image)}" />
<meta http-equiv="refresh" content="0; url=${esc(target)}" />
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body style="font-family:sans-serif;background:#FAF8F5;color:#2C2420">
<p style="padding:24px">글로 이동하는 중이에요. 넘어가지 않으면 <a href="${esc(target)}">여기를 눌러주세요</a>.</p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // 글이 수정되면 미리보기도 바뀌어야 해서 오래 캐시하지 않는다.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  res.status(200).send(html);
};
