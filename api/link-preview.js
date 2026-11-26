// 다른 곳(인스타그램·블로그 등)에 올린 내 글을 오느로 가져올 때 쓰는 서버 함수.
//  - mode "page"  : 주소의 제목·요약·대표 사진 주소(og 태그)를 읽어 돌려준다.
//  - mode "image" : 사용자가 "내가 올린 글이에요"에 체크했을 때만, 대표 사진 파일을 받아 돌려준다
//                   (앱이 그 파일을 평소처럼 사진 첨부로 올린다).
//
// 보안: 서버가 남의 주소에 대신 접속하는 기능이라, 내부망을 훔쳐보는 데 악용되지 않게 막는다.
//  - 로그인한 사용자만 쓸 수 있다.
//  - http/https, 기본 포트만. 주소를 실제 IP로 풀어 내부·사설·루프백 주소면 거절한다.
//  - 리다이렉트는 직접 따라가며 매번 같은 검사를 한다(최대 4번).
//  - 6초 제한, 페이지 1.5MB·사진 8MB까지만 읽는다. 오류 내용은 밖으로 내보내지 않는다.

const dns = require("node:dns").promises;
const net = require("node:net");

const UA = "Mozilla/5.0 (compatible; OneuLinkPreview/1.0; +https://oneu-six.vercel.app)";
const PAGE_MAX = 1.5 * 1024 * 1024;
const IMAGE_MAX = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") ||
    v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("scheme");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("port");
  if (u.username || u.password) throw new Error("auth");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("host");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("private");
}

// 네이버 블로그 PC 주소는 본문이 틀(iframe) 안에 있어서 모바일 주소로 바꿔 읽는다
function normalize(raw) {
  const u = new URL(raw);
  if (/^(www\.)?blog\.naver\.com$/i.test(u.hostname)) u.hostname = "m.blog.naver.com";
  return u;
}

async function safeFetch(raw, accept) {
  let u = normalize(raw);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(u);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let r;
    try {
      r = await fetch(u.toString(), { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "ko,en;q=0.8" } });
    } finally {
      clearTimeout(timer);
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      u = new URL(r.headers.get("location"), u);
      continue;
    }
    return { res: r, finalUrl: u };
  }
  throw new Error("redirects");
}

async function readCapped(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { try { reader.cancel(); } catch (_) {} throw new Error("too large"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

function decode(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function meta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const t of tags) {
    const name = (t.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (name && name.toLowerCase() === key) {
      const c = (t.match(/\bcontent\s*=\s*"([^"]*)"/i) || t.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
      if (c) return decode(c);
    }
  }
  return "";
}

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  const auth = req.headers.authorization;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !KEY) return res.status(500).json({ error: "server not configured" });
  if (!auth) return res.status(401).json({ error: "로그인이 필요해요." });
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: KEY } });
    if (!r.ok || !(await r.json()).id) throw new Error("auth");
  } catch (_) {
    return res.status(401).json({ error: "로그인이 필요해요." });
  }

  const { url, mode } = req.body || {};
  let target;
  try {
    if (typeof url !== "string" || url.length > 2000) throw new Error("bad");
    target = new URL(url.trim());
  } catch (_) {
    return res.status(400).json({ error: "주소를 확인해 주세요." });
  }

  try {
    if (mode === "image") {
      const { res: r } = await safeFetch(target.toString(), "image/*");
      const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!r.ok || !IMAGE_TYPES.has(type)) return res.status(422).json({ error: "사진을 가져오지 못했어요." });
      const buf = await readCapped(r, IMAGE_MAX);
      return res.status(200).json({ ok: true, mime: type, data: buf.toString("base64") });
    }

    const { res: r, finalUrl } = await safeFetch(target.toString(), "text/html,application/xhtml+xml");
    const type = (r.headers.get("content-type") || "").toLowerCase();
    if (!r.ok || !type.includes("html")) return res.status(422).json({ error: "이 주소의 내용을 읽지 못했어요." });
    const html = (await readCapped(r, PAGE_MAX)).toString("utf8");
    const titleTag = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const title = meta(html, "og:title") || meta(html, "twitter:title") || titleTag;
    const description = meta(html, "og:description") || meta(html, "twitter:description") || meta(html, "description");
    let image = meta(html, "og:image") || meta(html, "twitter:image");
    try { image = image ? new URL(image, finalUrl).toString() : ""; } catch (_) { image = ""; }
    if (image && !/^https?:/i.test(image)) image = "";
    const site = meta(html, "og:site_name") || finalUrl.hostname.replace(/^www\.|^m\./, "");
    return res.status(200).json({
      ok: true,
      url: target.toString(),
      site: cut(site, 40),
      title: cut(title, 100),
      description: cut(description, 1200),
      image,
    });
  } catch (_) {
    return res.status(422).json({ error: "이 주소의 내용을 읽지 못했어요." });
  }
};
