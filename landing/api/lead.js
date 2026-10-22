// POST /api/lead : enregistre un lead envoyé par le quiz de la landing.

import { leadEmail } from "./_gemini.js";
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

  const answers = { ...(body.answers ?? {}), result: body.result ?? null };
  if (JSON.stringify(answers).length > 5000) return send(res, 400, { error: "Réponses trop longues" });

  const school = audience === "ecole" ? String(body.school ?? "").trim().slice(0, 120) || null : null;

  // Réponses en clair (question + réponse) envoyées par la page, utilisées seulement pour rédiger le message
  const labels = (Array.isArray(body.labels) ? body.labels : [])
    .slice(0, 15)
    .map((l) => ({ q: String(l?.q ?? "").slice(0, 160), a: String(l?.a ?? "").slice(0, 120) }))
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

  // Une école démarchée qui fait le quiz est reliée à sa fiche de prospection
  if (audience === "ecole") await relink().catch((err) => console.error("prospect link failed:", err.message));

  // Message personnalisé : Gemini, ou texte de secours. Il est montré tout de suite au visiteur et gardé sur le lead.
  const message = await leadEmail({ audience, school: lead.school, labels, result: answers.result ?? {} });
  const { error: saveError } = await db()
    .from("leads")
    .update({ ai_subject: message.subject, ai_body: message.body, ai_source: message.source, ai_at: new Date().toISOString() })
    .eq("id", lead.id);
  if (saveError) console.error("ai message save failed:", saveError.message);

  send(res, 200, { ok: true, message: { subject: message.subject, body: message.body } });
}
