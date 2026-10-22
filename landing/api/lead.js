// POST /api/lead : enregistre un lead envoyé par le diagnostic, puis renvoie son analyse personnalisée en direct.
// Réponse en NDJSON (une ligne JSON par événement) : {"t":"text","v":"…"} au fil de l'écriture, puis {"t":"end"}.

import { defaultSubject, feedbackStream, qualify, toEmail } from "./_gemini.js";
import { db, readBody, relink, send } from "./_lib.js";

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
    .select("id, school")
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

  const input = { audience, school: lead.school, labels };
  const feedback = await feedbackStream(input, (v) => emit({ t: "text", v }));
  emit({ t: "end", source: feedback.source });

  // Ensuite, sans faire attendre le visiteur : qualification, enregistrement, lien avec la prospection
  const q = feedback.source === "gemini" ? await qualify(input, feedback.text) : { subject: null, priority: null, summary: null };
  const { error: saveError } = await db()
    .from("leads")
    .update({
      ai_subject: q.subject ?? defaultSubject(input),
      ai_body: toEmail(feedback.text),
      ai_source: feedback.source,
      ai_priority: q.priority,
      ai_summary: q.summary,
      ai_at: new Date().toISOString(),
    })
    .eq("id", lead.id);
  if (saveError) console.error("ai message save failed:", saveError.message);

  // Une école démarchée qui fait le diagnostic est reliée à sa fiche de prospection
  if (audience === "ecole") await relink().catch((err) => console.error("prospect link failed:", err.message));

  res.end();
}
