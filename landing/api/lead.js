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

  // Une école démarchée qui fait le quiz est reliée à sa fiche de prospection
  if (audience === "ecole") await relink().catch((err) => console.error("prospect link failed:", err.message));

  // Message personnalisé : Gemini, ou texte de secours. Il est montré tout de suite au visiteur et gardé sur le lead.
  const message = await leadEmail({ audience, school: lead.school, labels });
  const { error: saveError } = await db()
    .from("leads")
    .update({
      ai_subject: message.subject,
      ai_body: message.body,
      ai_source: message.source,
      ai_priority: message.priority,
      ai_summary: message.summary,
      ai_at: new Date().toISOString(),
    })
    .eq("id", lead.id);
  if (saveError) console.error("ai message save failed:", saveError.message);

  send(res, 200, { ok: true, message: { subject: message.subject, body: message.body } });
}
