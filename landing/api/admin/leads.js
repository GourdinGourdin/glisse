// /api/admin/leads, réservé à l'admin.
// GET          : tous les leads (sans les emails)
// GET ?id=…    : un lead avec son historique d'emails et d'activités, et l'école démarchée reliée
// PATCH {id,…} : change le statut, les notes, le nom ou la prochaine action

import { clean, db, isAdmin, isoDate, readBody, send, STATUSES } from "../_lib.js";

export default async function handler(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: "Non connecté" });

  if (req.method === "GET" && req.query.id) {
    const id = req.query.id;
    const [lead, emails, activities, prospect] = await Promise.all([
      db().from("leads").select("*").eq("id", id).single(),
      db().from("emails").select("*").eq("lead_id", id).order("sent_at", { ascending: false }),
      db().from("activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      db().from("prospects").select("id, name, status").eq("lead_id", id).maybeSingle(),
    ]);
    if (lead.error) return send(res, 404, { error: "Lead introuvable" });
    return send(res, 200, { lead: lead.data, emails: emails.data ?? [], activities: activities.data ?? [], prospect: prospect.data });
  }

  if (req.method === "GET") {
    const { data, error } = await db().from("leads").select("*").order("created_at", { ascending: false }).limit(5000);
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { leads: data });
  }

  if (req.method === "PATCH") {
    const body = readBody(req);
    const patch = {};
    if ("status" in body) {
      if (!STATUSES.includes(body.status)) return send(res, 400, { error: "Statut inconnu" });
      patch.status = body.status;
    }
    if ("notes" in body) patch.notes = clean(body.notes, 5000);
    if ("name" in body) patch.name = clean(body.name, 120);
    if ("next_action" in body) patch.next_action = clean(body.next_action, 200);
    if ("next_action_at" in body) {
      if (body.next_action_at && !isoDate(body.next_action_at)) return send(res, 400, { error: "Date invalide" });
      patch.next_action_at = isoDate(body.next_action_at);
    }
    if (!body.id || !Object.keys(patch).length) return send(res, 400, { error: "Rien à modifier" });

    const { data, error } = await db().from("leads").update(patch).eq("id", body.id).select().single();
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { lead: data });
  }

  send(res, 405, { error: "Méthode non autorisée" });
}
