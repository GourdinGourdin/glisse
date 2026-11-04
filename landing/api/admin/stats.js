// GET /api/admin/stats, réservé à l'admin : le tableau de bord de la machine (tunnel, coûts, erreurs, robot).

import { db, isAdmin, send } from "../_lib.js";
import { mailConfigured } from "../_mail.js";

const count = async (type) => {
  const { count: n } = await db().from("events").select("id", { count: "exact", head: true }).eq("type", type);
  return n ?? 0;
};

export default async function handler(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: "Non connecté" });

  const [{ data: runs, error }, visit, quizStart, formShown, resultShown, chatOpen, { data: firstEvent }] = await Promise.all([
    db().from("runs").select("*").order("created_at", { ascending: false }).limit(3000),
    count("visit"),
    count("quiz_start"),
    count("form_shown"),
    count("result_shown"),
    count("chat_open"),
    db().from("events").select("created_at").order("created_at").limit(1).maybeSingle(),
  ]);
  if (error) return send(res, 500, { error: error.message });

  const byKind = {};
  for (const r of runs) {
    const k = (byKind[r.kind] ??= { runs: 0, ok: 0, errors: 0, fallback: 0, capped: 0, blocked: 0, tokensIn: 0, tokensOut: 0, cost: 0, ms: 0, timed: 0 });
    k.runs++;
    if (r.status === "ok") k.ok++;
    else if (r.status === "error") k.errors++;
    else k[r.status]++;
    k.tokensIn += r.tokens_in;
    k.tokensOut += r.tokens_out;
    k.cost += Number(r.cost_usd);
    if (r.duration_ms) {
      k.ms += r.duration_ms;
      k.timed++;
    }
  }

  // Coût d'un lead : analyse + qualification, mesuré sur les leads passés par le modèle
  const leadRuns = runs.filter((r) => ["analysis", "qualify"].includes(r.kind) && r.status === "ok" && r.lead_id);
  const perLead = {};
  for (const r of leadRuns) perLead[r.lead_id] = (perLead[r.lead_id] ?? 0) + Number(r.cost_usd);
  const costs = Object.values(perLead);

  send(res, 200, {
    funnel: { visit, quizStart, formShown, resultShown, chatOpen, since: firstEvent?.created_at ?? null },
    byKind,
    costPerLead: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    measuredLeads: costs.length,
    totalCost: runs.reduce((a, r) => a + Number(r.cost_usd), 0),
    runs: runs.slice(0, 40),
    lastRobot: runs.find((r) => r.kind === "robot") ?? null,
    mail: { configured: mailConfigured() },
    cron: Boolean(process.env.CRON_SECRET),
    followDays: Number(process.env.FOLLOW_UP_DAYS ?? 3),
    autoFollowUp: process.env.AUTO_FOLLOW_UP === "1",
  });
}
