// /api/admin/activities, réservé à l'admin : journal des appels, emails envoyés à la main, messages et notes.
// POST {lead_id | prospect_id, type, body, next_action_at?, next_action?} : ajoute une action
// DELETE ?id=…                                                          : supprime une action

import { ACTIVITY_TYPES, clean, db, isAdmin, isoDate, readBody, send } from "../_lib.js";

// Ces actions comptent comme un contact avec l'école
const CONTACTS = ["call", "email", "message", "meeting"];

export default async function handler(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: "Non connecté" });

  if (req.method === "POST") {
    const body = readBody(req);
    const target = body.lead_id ? { table: "leads", key: "lead_id", id: body.lead_id } : body.prospect_id ? { table: "prospects", key: "prospect_id", id: body.prospect_id } : null;
    if (!target) return send(res, 400, { error: "Lead ou école manquant" });
    if (!ACTIVITY_TYPES.includes(body.type)) return send(res, 400, { error: "Type d'action inconnu" });
    if (body.next_action_at && !isoDate(body.next_action_at)) return send(res, 400, { error: "Date invalide" });

    const text = clean(body.body, 5000);
    if (body.type === "note" && !text) return send(res, 400, { error: "La note est vide" });

    const { data: current } = await db().from(target.table).select("id, status").eq("id", target.id).single();
    if (!current) return send(res, 404, { error: "Fiche introuvable" });

    const { data: activity, error } = await db()
      .from("activities")
      .insert({ [target.key]: target.id, type: body.type, body: text })
      .select()
      .single();
    if (error) return send(res, 500, { error: error.message });

    // Mise à jour de la fiche : prochaine action, et pour une école, date et statut de contact.
    // Le statut d'un lead n'est jamais changé ici : le robot de relance s'appuie sur ce statut.
    const patch = {};
    if ("next_action_at" in body) patch.next_action_at = isoDate(body.next_action_at);
    if ("next_action" in body) patch.next_action = clean(body.next_action, 200);
    if (target.table === "prospects" && CONTACTS.includes(body.type)) {
      patch.last_contact_at = new Date().toISOString();
      if (current.status === "to_contact") patch.status = "contacted";
    }

    let record = null;
    if (Object.keys(patch).length) {
      const { data, error: e } = await db().from(target.table).update(patch).eq("id", target.id).select().single();
      if (e) return send(res, 500, { error: e.message });
      record = data;
    }
    return send(res, 200, { activity, record });
  }

  if (req.method === "DELETE") {
    const { error } = await db().from("activities").delete().eq("id", req.query.id);
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { ok: true });
  }

  send(res, 405, { error: "Méthode non autorisée" });
}
