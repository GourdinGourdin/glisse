// POST /api/track : compte les étapes du tunnel. Anonyme : ni cookie, ni IP, ni email.

import { db, readBody, send } from "./_lib.js";

const TYPES = ["visit", "quiz_start", "form_shown", "result_shown", "chat_open"];

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Méthode non autorisée" });
  const { type, audience, path } = readBody(req);
  if (!TYPES.includes(type)) return send(res, 400, { error: "Événement inconnu" });
  if (/bot|crawl|spider|preview|headless/i.test(req.headers["user-agent"] ?? "") && !req.headers["x-glisse-test"]) return send(res, 200, { ok: true });
  const { error } = await db().from("events").insert({
    type,
    audience: ["ecole", "pratiquant"].includes(audience) ? audience : null,
    path: String(path ?? "").slice(0, 80) || null,
  });
  if (error) console.error("event failed:", error.message);
  send(res, 200, { ok: true });
}
