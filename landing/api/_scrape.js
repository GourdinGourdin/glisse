// Cherche les adresses email publiées sur le site d'une école (page d'accueil et page contact).

const MAX_BYTES = 1_500_000;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const JUNK = /\.(png|jpe?g|gif|svg|webp|css|js)$|@(sentry|wixpress|example|domain|email|yourdomain|votredomaine|exemple)\.|^(nom|name|prenom|votre|your|xxx|user)@/i;

function safeUrl(raw) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  // Seulement des sites publics : pas d'adresse IP ni de réseau local
  const h = url.hostname;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
  return url;
}

async function page(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Glisse-CRM/1.0; +https://glisse.vercel.app)", Accept: "text/html" },
    signal: AbortSignal.timeout(7000),
  });
  if (res.status === 403 || res.status === 429) throw new Error("Le site bloque la lecture automatique : ouvre-le pour chercher l'email");
  if (!res.ok) throw new Error(`Le site répond avec une erreur (${res.status})`);
  if (!(res.headers.get("content-type") ?? "").includes("html")) throw new Error("Le site ne renvoie pas une page web");
  const reader = res.body.getReader();
  let size = 0;
  const chunks = [];
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return { html: Buffer.concat(chunks).toString("utf8"), url: new URL(res.url) };
}

// Emails masqués par Cloudflare (attribut data-cfemail)
function cloudflare(html) {
  return [...html.matchAll(/data-cfemail="([0-9a-f]+)"/gi)].map(([, hex]) => {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
  });
}

function extract(html) {
  const found = [];
  for (const [, m] of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    try {
      found.push(decodeURIComponent(m));
    } catch {
      found.push(m);
    }
  }
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/&#64;|&commat;|\s?\[at\]\s?|\s?\(at\)\s?/gi, "@");
  found.push(...(text.match(EMAIL) ?? []), ...cloudflare(html));
  return found.map((e) => e.trim().toLowerCase().replace(/^\/+/, "")).filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) && !JUNK.test(e));
}

export async function findEmails(website) {
  const start = safeUrl(website);
  if (!start) throw new Error("Adresse de site invalide");

  let first;
  try {
    first = await page(start);
  } catch (err) {
    if (err.name === "TimeoutError") throw new Error("Le site met trop de temps à répondre");
    if (err.message.startsWith("Le site")) throw err;
    throw new Error("Site injoignable (adresse introuvable ou hors ligne)");
  }

  const emails = extract(first.html);
  const host = first.url.hostname.replace(/^www\./, "");

  // Pages contact et mentions légales du même site
  const links = [...first.html.matchAll(/href="([^"#]+)"/gi)]
    .map(([, href]) => {
      try {
        return new URL(href, first.url);
      } catch {
        return null;
      }
    })
    .filter((u) => u && u.hostname.replace(/^www\./, "") === host && /contact|mention|legal|propos|about|infos/i.test(u.pathname));
  const unique = [...new Map(links.map((u) => [u.pathname, u])).values()].slice(0, 2);

  for (const u of unique) {
    const p = await page(u).catch(() => null);
    if (p) emails.push(...extract(p.html));
  }

  // Les adresses du domaine de l'école d'abord
  return [...new Set(emails)]
    .sort((a, b) => Number(b.endsWith(host)) - Number(a.endsWith(host)))
    .slice(0, 6);
}
