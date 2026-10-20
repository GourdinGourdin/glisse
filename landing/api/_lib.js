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

export function send(res, code, body) {
  res.status(code).setHeader("Cache-Control", "no-store").json(body);
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
