/**
 * jeveuxlireca — Cloudflare Worker (removepaywall perso, serverless, gratuit).
 * Va chercher l'article côté serveur (pas de CORS), se présente comme Googlebot,
 * retire voiles/scripts de paywall, renvoie l'article lisible.
 * Déploiement : voir DEPLOY.md. Usage : https://<ton-worker>.workers.dev/?url=https://site/article
 *
 * ⚠️ Usage strictement personnel de lecture. Peut enfreindre les CGU d'un éditeur.
 */
const BOT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Referer": "https://www.google.com/",
  "X-Forwarded-For": "66.249.66.1",
};

// sélecteurs d'overlays/murs fréquents à masquer
const HIDE = [
  '[class*="paywall"]','[id*="paywall"]','[class*="piano"]','.tp-modal','.tp-backdrop','#tp-modal',
  '[class*="poool"]','[id*="poool"]','[class*="qiota"]','[class*="regwall"]','[class*="reg-wall"]',
  '[class*="subscription-wall"]','[class*="premium-overlay"]','[class*="gate-overlay"]','[data-paywall]'
].join(",");

// scripts de vendeurs de paywall à retirer
const KILL_SCRIPT = /tinypass|piano\.io|poool|qiota|cxense|blueconic|getsitecontrol|outbrain|axelspringer|piano-|tiny\.pass|amplitude|permutive/i;

export default {
  async fetch(request) {
    const u = new URL(request.url);
    let target = u.searchParams.get("url") || decodeURIComponent(u.pathname.slice(1));
    if (!target) return new Response(landing(u.origin), { headers: htmlH() });
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;

    let res;
    try {
      res = await fetch(target, { headers: BOT_HEADERS, redirect: "follow", cf: { cacheTtl: 0 } });
    } catch (e) {
      return new Response("Erreur en récupérant l'article : " + e, { status: 502, headers: htmlH() });
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return new Response(res.body, res); // images/pdf : passthrough

    const base = new URL(res.url || target);
    const rewriter = new HTMLRewriter()
      .on("head", {
        element(el) {
          el.prepend(`<base href="${base.origin}${base.pathname}">`, { html: true });
          el.append(
            `<style>
              html,body{overflow:auto!important;position:static!important;height:auto!important;filter:none!important}
              ${HIDE}{display:none!important}
              *{-webkit-line-clamp:unset!important;max-height:none!important}
              body{pointer-events:auto!important;user-select:auto!important}
            </style>`, { html: true });
        }
      })
      .on("html", { element(el){ el.removeAttribute("class"); } })
      .on("body", { element(el){ el.removeAttribute("class"); el.removeAttribute("style"); } })
      .on("script", { element(el) { const s = el.getAttribute("src") || ""; if (KILL_SCRIPT.test(s)) el.remove(); } })
      .on('link[rel="stylesheet"]', { element(el){ const h=el.getAttribute("href")||""; if(KILL_SCRIPT.test(h)) el.remove(); } });

    const transformed = rewriter.transform(new Response(res.body, { headers: htmlH() }));
    return new Response(transformed.body, { headers: htmlH() });
  }
};

function htmlH() { return { "content-type": "text/html; charset=utf-8", "x-frame-options": "ALLOWALL" }; }
function landing(origin) {
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
  <title>jeveuxlireca</title>
  <body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:0 16px">
  <h1>🪜 jeveuxlireca</h1>
  <p>Colle le lien d'un article bloqué :</p>
  <input id=u style="width:100%;padding:12px;font-size:1rem;border:2px solid #ccd;border-radius:10px" placeholder="https://www.lemonde.fr/…">
  <button onclick="location='${origin}/?url='+encodeURIComponent(document.getElementById('u').value)" style="margin-top:10px;padding:12px 18px;font-size:1rem;border:0;border-radius:10px;background:#2aa876;color:#fff;font-weight:700">📖 Lire</button>
  <p style="color:#888;font-size:.85rem;margin-top:20px">Usage personnel. Se présente comme Googlebot pour obtenir l'article complet, puis retire les voiles.</p>
  </body>`;
}
