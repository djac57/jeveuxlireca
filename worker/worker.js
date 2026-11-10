/**
 * jeveuxlireca — Cloudflare Worker (removepaywall perso, serverless, gratuit).
 * 1) récupère l'article côté serveur en se présentant comme Googlebot
 * 2) extrait le TEXTE INTÉGRAL caché dans les métadonnées JSON-LD (articleBody)
 *    -> affiche un mode lecture propre (défait la troncature/le fondu)
 * 3) sinon, renvoie la page d'origine dé-voilée (fallback)
 * Usage : https://<worker>.workers.dev/?url=https://site/article
 * ⚠️ Usage strictement personnel de lecture. Peut enfreindre les CGU d'un éditeur.
 */
const BOT = {
  "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Referer": "https://www.google.com/",
  "X-Forwarded-For": "66.249.66.1",
};

export default {
  async fetch(request) {
    const u = new URL(request.url);
    let target = u.searchParams.get("url") || decodeURIComponent(u.pathname.slice(1));
    if (!target) return page(landing(u.origin));
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;

    let res;
    try { res = await fetch(target, { headers: BOT, redirect: "follow", cf: { cacheTtl: 0 } }); }
    catch (e) { return page("<p style='font-family:sans-serif;padding:20px'>Erreur réseau : " + esc(String(e)) + "</p>", 502); }

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return new Response(res.body, res);

    const src = await res.text();
    const art = extractArticle(src);
    if (art && art.body && art.body.replace(/\s/g, "").length > 600) {
      return page(reader(art, res.url || target));
    }
    return page(strip(src, new URL(res.url || target)));
  }
};

/* ---- extraction du texte intégral depuis JSON-LD ---- */
function extractArticle(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m, objs = [];
  while ((m = re.exec(html))) { try { flatten(JSON.parse(m[1].trim()), objs); } catch (e) {} }
  for (const o of objs) {
    const t = [].concat(o["@type"] || "").join(" ");
    if (/Article|NewsArticle|ReportageNewsArticle|BlogPosting|LiveBlogPosting/i.test(t) && o.articleBody) {
      return { headline: o.headline || o.name || "", body: String(o.articleBody),
               author: authorName(o.author), date: o.datePublished || o.dateModified || "" };
    }
  }
  return null;
}
function flatten(j, out) {
  if (Array.isArray(j)) j.forEach(x => flatten(x, out));
  else if (j && typeof j === "object") { out.push(j); if (j["@graph"]) flatten(j["@graph"], out); }
}
function authorName(a) {
  if (!a) return ""; if (Array.isArray(a)) return a.map(authorName).filter(Boolean).join(", ");
  return a.name || "";
}

/* ---- rendu mode lecture ---- */
function reader(a, url) {
  const paras = a.body.split(/\n+/).map(p => p.trim()).filter(Boolean).map(p => "<p>" + esc(p) + "</p>").join("");
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
  <title>${esc(a.headline || "Article")}</title>
  <style>
    body{font-family:Georgia,"Times New Roman",serif;max-width:720px;margin:0 auto;padding:30px 18px;line-height:1.75;color:#1b1b1b;background:#fbfbf8}
    h1{font-family:system-ui,-apple-system,sans-serif;line-height:1.2;font-size:1.9rem}
    .meta{color:#8a8a8a;font-size:.9rem;margin:6px 0 26px;font-family:system-ui,sans-serif}
    .meta a{color:#2f7dd1} p{margin:0 0 1.15em;font-size:1.12rem}
    .tag{display:inline-block;background:#eef5ec;color:#2aa876;font:600 .72rem system-ui;padding:2px 8px;border-radius:999px}
  </style>
  <span class=tag>🪜 jeveuxlireca · mode lecture</span>
  <h1>${esc(a.headline || "")}</h1>
  <div class=meta>${esc(a.author || "")}${a.date ? " · " + esc(String(a.date).slice(0, 10)) : ""} · <a href="${esc(url)}" target=_blank>article original</a></div>
  ${paras}`;
}

/* ---- fallback : page d'origine dé-voilée ---- */
function strip(src, base) {
  const inject = `<base href="${base.origin}${base.pathname}">
  <style>
    html,body{overflow:auto!important;position:static!important;height:auto!important;filter:none!important}
    [class*=paywall],[id*=paywall],[class*=piano],.tp-modal,.tp-backdrop,[class*=poool],[class*=qiota],
    [class*=regwall],[class*=subscription],[class*=premium-overlay],[class*=gate-overlay],[data-paywall],
    [class*=gradient-mask],[class*=fade-out],[class*=paywall-mask]{display:none!important;-webkit-mask:none!important;mask:none!important}
    *{-webkit-line-clamp:unset!important;max-height:none!important;filter:none!important}
    [class*=teaser],[class*=truncat],[class*=fade]{max-height:none!important;-webkit-mask:none!important;mask:none!important;opacity:1!important}
  </style>`;
  return /<head[^>]*>/i.test(src) ? src.replace(/<head([^>]*)>/i, "<head$1>" + inject)
                                  : inject + src;
}

function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function page(body, status){ return new Response(body, { status: status || 200, headers: { "content-type": "text/html; charset=utf-8" } }); }
function landing(origin){
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
  <title>jeveuxlireca</title><body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:0 16px">
  <h1>🪜 jeveuxlireca</h1><p>Colle le lien d'un article bloqué :</p>
  <input id=u style="width:100%;padding:12px;font-size:1rem;border:2px solid #ccd;border-radius:10px" placeholder="https://www.lemonde.fr/…">
  <button onclick="location='${origin}/?url='+encodeURIComponent(document.getElementById('u').value)" style="margin-top:10px;padding:12px 18px;font-size:1rem;border:0;border-radius:10px;background:#2aa876;color:#fff;font-weight:700">📖 Lire</button>
  <p style="color:#888;font-size:.85rem;margin-top:20px">Récupère l'article en tant que Googlebot, extrait le texte intégral (JSON-LD) et l'affiche en mode lecture. Usage personnel.</p></body>`;
}
