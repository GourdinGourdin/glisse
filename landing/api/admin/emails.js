// /api/admin/emails, réservé à l'admin : le clic humain avant l'envoi.
// GET            : brouillons à valider et état de la connexion Gmail
// POST {id,…}    : valide un brouillon et l'envoie (objet et texte modifiables)
// POST {lead_id, subject, body, kind} : envoie un message écrit depuis la fiche du lead
// DELETE ?id=…   : supprime un brouillon

import { clean, db, isAdmin, readBody, send } from "../_lib.js";
import { mailConfigured, sendEmail } from "../_mail.js";

export default async function handler(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: "Non connecté" });

  if (req.method === "GET") {
    const { data, error } = await db()
      .from("emails")
      .select("id, lead_id, kind, subject, body, hold_reason, sent_at, leads(email, school, name, audience)")
      .eq("status", "draft")
      .order("sent_at", { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { drafts: data, mail: { configured: mailConfigured() } });
  }

  if (req.method === "POST") {
    const body = readBody(req);
    const subject = clean(body.subject, 200);
    const text = clean(body.body, 8000);
    if (!subject || !text) return send(res, 400, { error: "Objet et texte obligatoires" });

    let leadId = body.lead_id;
    let kind = ["email1", "followup", "manual"].includes(body.kind) ? body.kind : "manual";
    if (body.id) {
      const { data: draft } = await db().from("emails").select("lead_id, kind").eq("id", body.id).eq("status", "draft").maybeSingle();
      if (!draft) return send(res, 404, { error: "Brouillon introuvable : il a peut-être déjà été envoyé" });
      leadId = draft.lead_id;
      kind = draft.kind;
    }
    const { data: lead } = await db().from("leads").select("*").eq("id", leadId).maybeSingle();
    if (!lead) return send(res, 404, { error: "Lead introuvable" });

    try {
      return send(res, 200, { lead: await sendEmail(lead, { subject, body: text, kind }) });
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  if (req.method === "DELETE") {
    const { error } = await db().from("emails").delete().eq("id", req.query.id).eq("status", "draft");
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { ok: true });
  }

  send(res, 405, { error: "Méthode non autorisée" });
}
