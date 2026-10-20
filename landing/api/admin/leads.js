// /api/admin/leads, réservé à l'admin.
// GET          : tous les leads (sans les emails)
// GET ?id=…    : un lead avec son historique d'emails
// PATCH {id,…} : change le statut, les notes ou le nom

import { db, isAdmin, send, STATUSES } from "../_lib.js";

export default async function handler(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: "Non connecté" });

  if (req.method === "GET" && req.query.id) {
    const [lead, emails] = await Promise.all([
      db().from("leads").select("*").eq("id", req.query.id).single(),
      db().from("emails").select("*").eq("lead_id", req.query.id).order("sent_at", { ascending: false }),
    ]);
    if (lead.error) return send(res, 404, { error: "Lead introuvable" });
    return send(res, 200, { lead: lead.data, emails: emails.data ?? [] });
  }

  if (req.method === "GET") {
    const { data, error } = await db().from("leads").select("*").order("created_at", { ascending: false }).limit(2000);
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { leads: data });
  }

  if (req.method === "PATCH") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const patch = {};
    if ("status" in body) {
      if (!STATUSES.includes(body.status)) return send(res, 400, { error: "Statut inconnu" });
      patch.status = body.status;
    }
    if ("notes" in body) patch.notes = String(body.notes ?? "").slice(0, 5000);
    if ("name" in body) patch.name = String(body.name ?? "").slice(0, 120) || null;
    if (!body.id || !Object.keys(patch).length) return send(res, 400, { error: "Rien à modifier" });

    const { data, error } = await db().from("leads").update(patch).eq("id", body.id).select().single();
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { lead: data });
  }

  send(res, 405, { error: "Méthode non autorisée" });
}
