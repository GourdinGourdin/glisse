// POST /api/admin/login : ouvre une session admin. DELETE : la ferme.

import { checkPassword, clearCookie, send, sessionCookie } from "../_lib.js";

export default async function handler(req, res) {
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearCookie);
    return send(res, 200, { ok: true });
  }
  if (req.method !== "POST") return send(res, 405, { error: "Méthode non autorisée" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  if (!checkPassword(body.password)) {
    await new Promise((r) => setTimeout(r, 800)); // ralentit les essais en série
    return send(res, 401, { error: "Mot de passe incorrect" });
  }
  res.setHeader("Set-Cookie", sessionCookie());
  send(res, 200, { ok: true });
}
