// /api/admin/prospects, réservé à l'admin : les écoles à démarcher.
// GET              : toutes les écoles
// GET ?id=…        : une école avec son historique et le lead relié
// POST {action}    : "create" (une école), "csv" (plusieurs), "import" (un département depuis OpenStreetMap),
//                    "find_email" (cherche les emails publiés sur son site)
// PATCH {id,…}     : modifie une école
// DELETE ?id=…     : supprime une école

import { clean, db, isAdmin, isoDate, PROSPECT_STATUSES, readBody, relink, send } from "../_lib.js";
import { fitScore, importDept, REGION_DEPTS, regionOf } from "../_osm.js";
import { findEmails } from "../_scrape.js";

const SPORTS = ["surf", "voile", "kite", "paddle", "autre"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const url = (v) => {
  const s = clean(v, 300);
  return s ? (/^https?:\/\//i.test(s) ? s : `https://${s}`) : null;
};

// Champs modifiables, nettoyés. Renvoie une erreur en texte si une valeur est invalide.
function fields(body) {
  const p = {};
  if ("name" in body) p.name = clean(body.name, 200);
  if ("email" in body) {
    p.email = clean(body.email, 200)?.toLowerCase() ?? null;
    if (p.email && !EMAIL.test(p.email)) return "Email invalide";
  }
  if ("phone" in body) p.phone = clean(body.phone, 40);
  if ("website" in body) p.website = url(body.website);
  if ("city" in body) p.city = clean(body.city, 120);
  if ("notes" in body) p.notes = clean(body.notes, 5000);
  if ("next_action" in body) p.next_action = clean(body.next_action, 200);
  if ("next_action_at" in body) {
    if (body.next_action_at && !isoDate(body.next_action_at)) return "Date invalide";
    p.next_action_at = isoDate(body.next_action_at);
  }
  if ("sport" in body) {
    if (!SPORTS.includes(body.sport)) return "Sport inconnu";
    p.sport = body.sport;
  }
  if ("departement" in body) {
    const d = clean(body.departement, 3)?.toUpperCase() ?? null;
    if (d && !Object.values(REGION_DEPTS).flat().includes(d)) return "Département inconnu";
    p.departement = d;
    p.region = d ? regionOf(d) : "other";
  }
  if ("status" in body) {
    if (!PROSPECT_STATUSES.includes(body.status)) return "Statut inconnu";
    p.status = body.status;
  }
  return p;
}

async function list(res) {
  const { data, error } = await db().from("prospects").select("*").order("fit", { ascending: false }).limit(10000);
  if (error) return send(res, 500, { error: error.message });
  send(res, 200, { prospects: data });
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: "Non connecté" });

  if (req.method === "GET" && req.query.id) {
    const [p, activities] = await Promise.all([
      db().from("prospects").select("*, lead:leads(id, email, status, created_at)").eq("id", req.query.id).single(),
      db().from("activities").select("*").eq("prospect_id", req.query.id).order("created_at", { ascending: false }),
    ]);
    if (p.error) return send(res, 404, { error: "École introuvable" });
    return send(res, 200, { prospect: p.data, activities: activities.data ?? [] });
  }

  if (req.method === "GET") return list(res);

  if (req.method === "POST") {
    const body = readBody(req);

    if (body.action === "create") {
      const p = fields(body);
      if (typeof p === "string") return send(res, 400, { error: p });
      if (!p.name) return send(res, 400, { error: "Le nom est obligatoire" });
      const row = { sport: "autre", region: "other", ...p, source: "manual" };
      row.fit = fitScore(row);
      const { data, error } = await db().from("prospects").insert(row).select().single();
      if (error) return send(res, 500, { error: error.message });
      await relink();
      return send(res, 200, { prospect: data });
    }

    if (body.action === "csv") {
      const items = Array.isArray(body.items) ? body.items.slice(0, 3000) : [];
      const { data: existing } = await db().from("prospects").select("name, city");
      const known = new Set((existing ?? []).map((x) => `${x.name.toLowerCase()}|${(x.city ?? "").toLowerCase()}`));
      const rows = [];
      const skipped = [];
      for (const [i, item] of items.entries()) {
        const { status, id, ...rest } = item ?? {};
        const p = fields({ ...rest, sport: SPORTS.includes(rest.sport) ? rest.sport : "autre" });
        if (typeof p === "string" || !p.name) {
          skipped.push(i + 2);
          continue;
        }
        const key = `${p.name.toLowerCase()}|${(p.city ?? "").toLowerCase()}`;
        if (known.has(key)) continue;
        known.add(key);
        const row = { region: "other", ...p, source: "csv" };
        row.fit = fitScore(row);
        rows.push(row);
      }
      if (rows.length) {
        const { error } = await db().from("prospects").insert(rows);
        if (error) return send(res, 500, { error: error.message });
        await relink();
      }
      return send(res, 200, { added: rows.length, duplicates: items.length - rows.length - skipped.length, skipped });
    }

    if (body.action === "import") {
      let rows;
      try {
        rows = await importDept(String(body.departement ?? ""));
      } catch (err) {
        return send(res, 502, { error: `OpenStreetMap n'a pas répondu (${err.message}). Réessaie dans quelques minutes.` });
      }
      let added = 0;
      if (rows.length) {
        // Les écoles déjà présentes ne sont pas modifiées : statut, notes et corrections sont conservés
        const { data, error } = await db().from("prospects").upsert(rows, { onConflict: "source_id", ignoreDuplicates: true }).select("id");
        if (error) return send(res, 500, { error: error.message });
        added = data.length;
        if (added) await relink();
      }
      return send(res, 200, { found: rows.length, added });
    }

    if (body.action === "find_email") {
      const { data: p } = await db().from("prospects").select("id, website").eq("id", body.id).single();
      if (!p?.website) return send(res, 400, { error: "Cette école n'a pas de site web" });
      try {
        return send(res, 200, { emails: await findEmails(p.website) });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    return send(res, 400, { error: "Action inconnue" });
  }

  if (req.method === "PATCH") {
    const body = readBody(req);
    const p = fields(body);
    if (typeof p === "string") return send(res, 400, { error: p });
    if (!body.id || !Object.keys(p).length) return send(res, 400, { error: "Rien à modifier" });
    if ("name" in p && !p.name) return send(res, 400, { error: "Le nom est obligatoire" });

    const { data: current } = await db().from("prospects").select("*").eq("id", body.id).single();
    if (!current) return send(res, 404, { error: "École introuvable" });
    // Le bonus calculé à l'import (tags OpenStreetMap) est conservé
    const bonus = current.fit - fitScore(current);
    p.fit = Math.max(0, Math.min(100, fitScore({ ...current, ...p }) + Math.max(0, bonus)));

    const { data, error } = await db().from("prospects").update(p).eq("id", body.id).select().single();
    if (error) return send(res, 500, { error: error.message });
    if ("email" in p || "website" in p) await relink();
    return send(res, 200, { prospect: data });
  }

  if (req.method === "DELETE") {
    const { error } = await db().from("prospects").delete().eq("id", req.query.id);
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { ok: true });
  }

  send(res, 405, { error: "Méthode non autorisée" });
}
