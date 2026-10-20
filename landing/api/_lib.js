// Outils partagés par les routes serveur. Les fichiers qui commencent par _ ne deviennent pas des routes.

import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

let client;
export function db() {
  client ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return client;
}

export const STATUSES = ["new", "contacted", "followed_up", "replied", "meeting", "won", "lost"];
export const PROSPECT_STATUSES = ["to_contact", "contacted", "interested", "pilot", "not_interested"];
export const ACTIVITY_TYPES = ["call", "email", "message", "meeting", "note"];

export function send(res, code, body) {
  res.status(code).setHeader("Cache-Control", "no-store").json(body);
}

export function readBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body ?? {};
}

// Texte nettoyé et tronqué, ou null s'il est vide
export const clean = (v, max = 200) => (v == null ? null : String(v).trim().slice(0, max) || null);

// Date au format AAAA-MM-JJ, ou null
export const isoDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : null);

/* ---------- Lien entre prospects et leads ---------- */

// Adresses personnelles : leur domaine ne permet pas de reconnaître une école
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "live.fr",
  "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr",
  "laposte.net", "aol.com", "gmx.fr", "gmx.com", "protonmail.com", "proton.me", "bbox.fr",
]);

export function domainOf(value) {
  if (!value) return null;
  const s = String(value).toLowerCase().trim();
  let host = s.includes("@") ? s.split("@").pop() : s;
  try {
    if (!s.includes("@")) host = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  return host && !FREEMAIL.has(host) ? host : null;
}

// Relie les écoles démarchées aux leads qui ont fait le quiz avec le même email ou le même domaine.
// Une école reliée qui n'avait pas encore répondu passe en « intéressée ».
export async function relink() {
  const [{ data: leads }, { data: prospects }] = await Promise.all([
    db().from("leads").select("id, email").eq("audience", "ecole"),
    db().from("prospects").select("id, email, website, status").is("lead_id", null),
  ]);
  for (const p of prospects ?? []) {
    const domains = [domainOf(p.email), domainOf(p.website)].filter(Boolean);
    const lead = (leads ?? []).find((l) => (p.email && l.email === p.email) || domains.includes(domainOf(l.email)));
    if (!lead) continue;
    const patch = { lead_id: lead.id };
    if (["to_contact", "contacted"].includes(p.status)) patch.status = "interested";
    await db().from("prospects").update(patch).eq("id", p.id);
  }
}

/* ---------- Session admin ---------- */

const COOKIE = "glisse_admin";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 jours

const sign = (value) => createHmac("sha256", process.env.ADMIN_PASSWORD).update(value).digest("hex");

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(password) {
  return Boolean(process.env.ADMIN_PASSWORD) && safeEqual(password ?? "", process.env.ADMIN_PASSWORD);
}

export function sessionCookie() {
  const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return `${COOKIE}=${expires}.${sign(expires)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}

export const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

export function isAdmin(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const raw = (req.headers.cookie ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [expires, sig] = raw.slice(COOKIE.length + 1).split(".");
  return Number(expires) > Date.now() / 1000 && safeEqual(sig, sign(expires));
}
