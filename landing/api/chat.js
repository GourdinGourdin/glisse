// POST /api/chat : le chatbot du site. Répond en direct, en NDJSON : {"t":"text","v":"…"} puis {"t":"end"}.
// La conversation n'est pas enregistrée : seuls les jetons, le coût et la durée sont notés.

import { CHAT_FALLBACK, CHAT_REFUSAL, chatStream } from "./_gemini.js";
import { ipHash, isInjection, llmAllowed } from "./_guards.js";
import { logRun, readBody, send } from "./_lib.js";

const MAX_MESSAGES = 12;
const MAX_LENGTH = 600;

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Méthode non autorisée" });

  const raw = readBody(req).messages;
  if (!Array.isArray(raw) || !raw.length) return send(res, 400, { error: "Message manquant" });
  const messages = raw.slice(-MAX_MESSAGES).map((m) => ({ role: m?.role === "bot" ? "bot" : "user", text: String(m?.text ?? "").trim().slice(0, MAX_LENGTH) })).filter((m) => m.text);
  while (messages.length && messages[0].role !== "user") messages.shift();
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return send(res, 400, { error: "Message manquant" });

  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  const emit = (event) => res.write(`${JSON.stringify(event)}\n`);
  const hash = ipHash(req);

  // Tentative de manipulation : réponse fixe, le modèle n'est pas appelé
  if (messages.filter((m) => m.role === "user").some((m) => isInjection(m.text))) {
    emit({ t: "text", v: CHAT_REFUSAL });
    emit({ t: "end" });
    await logRun({ kind: "chat", status: "blocked", ip_hash: hash, detail: "tentative de manipulation" });
    return res.end();
  }

  if (!(await llmAllowed("chat", hash))) {
    emit({ t: "text", v: CHAT_FALLBACK });
    emit({ t: "end" });
    await logRun({ kind: "chat", status: "capped", ip_hash: hash });
    return res.end();
  }

  const result = await chatStream(messages, (v) => emit({ t: "text", v }));
  if (!result) emit({ t: "text", v: CHAT_FALLBACK });
  emit({ t: "end" });
  await logRun(
    result
      ? { kind: "chat", status: "ok", ip_hash: hash, model: result.model, tokens_in: result.tokensIn, tokens_out: result.tokensOut, cost_usd: result.cost, duration_ms: result.ms }
      : { kind: "chat", status: "fallback", ip_hash: hash, detail: "modèle indisponible" }
  );
  res.end();
}
