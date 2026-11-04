// POST /api/lead : enregistre un lead envoyé par le diagnostic, puis renvoie son analyse personnalisée en direct.
// Réponse en NDJSON : {"t":"text","v":"…"} au fil de l'écriture, {"t":"end"}, puis {"t":"mail","state":"sent|held|none"}.
// Chemin fixé par le code : contrôles, modèle, contrôles, enregistrement, envoi ou mise en attente du clic humain.

import { defaultSubject, feedbackStream, qualify, toEmail } from "./_gemini.js";
import { checkLead, checkOutput, clampPriority, ipHash, isTestAddress, llmAllowed, FLAG_LABELS } from "./_guards.js";
import { db, logRun, readBody, relink, send } from "./_lib.js";
import { mailConfigured, saveDraft, sendEmail } from "./_mail.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Méthode non autorisée" });

  const body = readBody(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const audience = body.audience;

  if (!EMAIL.test(email) || email.length > 200) return send(res, 400, { error: "Email invalide" });
  if (body.consent !== true) return send(res, 400, { error: "Consentement manquant" });
  if (!["ecole", "pratiquant"].includes(audience)) return send(res, 400, { error: "Parcours inconnu" });

  // Réponses libres : seulement du texte, 600 caractères au plus par réponse
  const answers = Object.fromEntries(
    Object.entries(body.answers && typeof body.answers === "object" ? body.answers : {})
      .slice(0, 15)
      .map(([k, v]) => [String(k).slice(0, 40), String(v ?? "").trim().slice(0, 600)])
  );
  if (JSON.stringify(answers).length > 8000) return send(res, 400, { error: "Réponses trop longues" });

  const school = audience === "ecole" ? String(body.school ?? "").trim().slice(0, 120) || null : null;

  // Réponses en clair (question + réponse) envoyées par la page, utilisées seulement pour rédiger le message
  const labels = (Array.isArray(body.labels) ? body.labels : [])
    .slice(0, 15)
    .map((l) => ({ q: String(l?.q ?? "").slice(0, 160), a: String(l?.a ?? "").trim().slice(0, 600) }))
    .filter((l) => l.q && l.a);

  // Refaire le test met à jour les réponses sans toucher au statut, aux notes ni au nom d'école déjà connu
  const { data: lead, error } = await db()
    .from("leads")
    .upsert({ email, audience, consent: true, answers, ...(school && { school }) }, { onConflict: "email,audience" })
    .select()
    .single();

  if (error) {
    console.error("lead insert failed:", error.message);
    return send(res, 500, { error: "Enregistrement impossible" });
  }

  // Analyse en direct : chaque morceau de texte part vers la page dès qu'il est écrit
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  const emit = (event) => res.write(`${JSON.stringify(event)}\n`);

  // Avant le modèle : un lead piégé ou un visiteur au-delà du budget reçoit le texte de secours
  const input = { audience, school: lead.school, labels };
  const hash = ipHash(req);
  const flags = checkLead({ email, labels });
  const trapped = flags.includes("injection_attempt");
  const allowed = !trapped && (await llmAllowed("analysis", hash));

  const feedback = await feedbackStream(input, (v) => emit({ t: "text", v }), { useModel: allowed });
  emit({ t: "end", source: feedback.source });
  await logRun({
    kind: "analysis",
    status: feedback.source === "gemini" ? "ok" : trapped ? "blocked" : allowed ? "fallback" : "capped",
    lead_id: lead.id,
    model: feedback.model,
    tokens_in: feedback.tokensIn,
    tokens_out: feedback.tokensOut,
    cost_usd: feedback.cost,
    duration_ms: feedback.ms,
    ip_hash: hash,
  });

  // Ensuite, sans faire attendre le visiteur : qualification, contrôle du texte, enregistrement
  const q = feedback.source === "gemini" ? await qualify(input, feedback.text) : { subject: null, priority: null, summary: null, flags: [], ok: false };
  if (feedback.source === "gemini") {
    await logRun({ kind: "qualify", status: q.ok ? "ok" : "error", lead_id: lead.id, model: q.model ?? null, tokens_in: q.tokensIn ?? 0, tokens_out: q.tokensOut ?? 0, cost_usd: q.cost ?? 0, duration_ms: q.ms ?? null });
    flags.push(...checkOutput(feedback.text, labels));
  }
  const allFlags = [...new Set([...flags, ...q.flags])];
  const subject = q.subject ?? defaultSubject(input);
  const mailBody = toEmail(feedback.text);

  const { error: saveError } = await db()
    .from("leads")
    .update({
      ai_subject: subject,
      ai_body: mailBody,
      ai_source: feedback.source,
      ai_priority: clampPriority(q.priority, allFlags),
      ai_summary: trapped ? "Tentative de manipulation détectée dans les réponses : modèle non appelé." : q.summary,
      ai_flags: allFlags,
      ai_at: new Date().toISOString(),
    })
    .eq("id", lead.id);
  if (saveError) console.error("ai message save failed:", saveError.message);

  // Email 1 : seulement au premier passage. Le visiteur vient de lire ce texte et l'a demandé : il part tout de suite,
  // sauf si un contrôle a levé un drapeau. Dans ce cas, ou sans Gmail, il attend un clic humain dans le CRM.
  let state = "none";
  if (lead.status === "new") {
    const reason = allFlags.length
      ? `Bloqué par les contrôles : ${allFlags.map((f) => FLAG_LABELS[f] ?? f).join(", ")}`
      : isTestAddress(email)
        ? "Adresse de test : pas d'envoi réel"
        : !mailConfigured()
          ? "Gmail pas encore connecté"
          : null;
    try {
      if (reason) await saveDraft(lead, { subject, body: mailBody, kind: "email1", reason });
      else await sendEmail(lead, { subject, body: mailBody, kind: "email1" });
      state = reason ? "held" : "sent";
    } catch (err) {
      console.error("email 1 failed:", err.message);
      await saveDraft(lead, { subject, body: mailBody, kind: "email1", reason: err.message }).catch(() => {});
      state = "held";
    }
  }
  emit({ t: "mail", state });

  // Une école démarchée qui fait le diagnostic est reliée à sa fiche de prospection
  if (audience === "ecole") await relink().catch((err) => console.error("prospect link failed:", err.message));

  res.end();
}
