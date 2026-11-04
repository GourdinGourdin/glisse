// Le robot de relance : voir AGENTS.md. Une relance par lead au maximum, jamais après une réponse :
// le lancer dix fois de suite n'envoie rien de plus.
// Le texte de la relance étant écrit par le modèle, il attend un clic humain, sauf si AUTO_FOLLOW_UP=1.

import { writeFollowUp } from "./_gemini.js";
import { db, logRun } from "./_lib.js";
import { gmailMailbox, mailConfigured, saveDraft, sendEmail } from "./_mail.js";

export const isStop = (body) => /^\s*stop\b/i.test(String(body ?? ""));

// Décision pure, facile à tester : que faire de ce lead ?
export function decide(lead, { replies, hasDraft, now, followDays }) {
  if (!["contacted", "followed_up"].includes(lead.status) || !lead.last_email_at) return { action: "ignore" };
  const after = replies.filter((r) => new Date(r.date) > new Date(lead.last_email_at));
  if (after.length) return { action: after.some((r) => isStop(r.body)) ? "stop" : "replied", replies: after };
  const age = (now - new Date(lead.last_email_at)) / 864e5;
  if (lead.status === "contacted" && lead.follow_ups === 0 && !hasDraft && age >= followDays) return { action: "followup" };
  return { action: "wait" };
}

export async function runRobot({
  mailbox,
  transport,
  writer = writeFollowUp,
  now = new Date(),
  followDays = Number(process.env.FOLLOW_UP_DAYS ?? 3),
  auto = process.env.AUTO_FOLLOW_UP === "1",
  onlyLeadId,
} = {}) {
  const started = Date.now();
  const summary = { checked: 0, replies: 0, stops: 0, drafts: 0, followUpsSent: 0, errors: [] };
  const box = mailbox ?? (mailConfigured() ? gmailMailbox : null);
  if (!box) {
    summary.note = "Gmail n'est pas encore connecté : le robot n'a rien lu ni envoyé.";
    await logRun({ kind: "robot", status: "error", duration_ms: Date.now() - started, detail: summary.note });
    return summary;
  }

  let query = db().from("leads").select("*").in("status", ["contacted", "followed_up"]).eq("consent", true).not("last_email_at", "is", null);
  if (onlyLeadId) query = query.eq("id", onlyLeadId);
  const { data: leads, error } = await query;
  if (error) throw new Error(error.message);
  summary.checked = leads.length;

  let inbox = [];
  try {
    inbox = await box.fetchReplies(leads);
  } catch (err) {
    // Sans lecture de la boîte, on ne peut pas savoir qui a répondu : aucune relance
    summary.errors.push(`Lecture de la boîte : ${err.message}`);
    await logRun({ kind: "robot", status: "error", duration_ms: Date.now() - started, detail: JSON.stringify(summary).slice(0, 500) });
    return summary;
  }

  const { data: drafts } = await db().from("emails").select("lead_id").eq("status", "draft").eq("kind", "followup");
  const withDraft = new Set((drafts ?? []).map((d) => d.lead_id));

  for (const lead of leads) {
    try {
      const replies = inbox.filter((r) => r.email.toLowerCase() === lead.email.toLowerCase());
      const decision = decide(lead, { replies, hasDraft: withDraft.has(lead.id), now, followDays });

      if (decision.action === "replied" || decision.action === "stop") {
        for (const r of decision.replies) {
          await db().from("emails").upsert(
            { lead_id: lead.id, direction: "in", status: "sent", kind: "reply", subject: r.subject, body: r.body, message_id: r.messageId, sent_at: new Date(r.date).toISOString() },
            { onConflict: "message_id", ignoreDuplicates: true }
          );
        }
        await db().from("emails").delete().eq("lead_id", lead.id).eq("status", "draft");
        const stop = decision.action === "stop";
        const today = now.toISOString().slice(0, 10);
        await db()
          .from("leads")
          .update(stop ? { status: "lost", next_action: null, next_action_at: null } : { status: "replied", next_action: "Répondre à ce lead", next_action_at: today })
          .eq("id", lead.id);
        summary[stop ? "stops" : "replies"]++;
      }

      if (decision.action === "followup") {
        const email = await writer(lead);
        await logRun({ kind: "followup", status: email.source === "gemini" ? "ok" : "fallback", lead_id: lead.id, model: email.model, tokens_in: email.tokensIn, tokens_out: email.tokensOut, cost_usd: email.cost, duration_ms: email.ms });
        if (auto) {
          await sendEmail(lead, { subject: email.subject, body: email.body, kind: "followup" }, { transport });
          summary.followUpsSent++;
        } else {
          await saveDraft(lead, { subject: email.subject, body: email.body, kind: "followup", reason: "Relance rédigée par l'IA : à relire" });
          await db().from("leads").update({ next_action: "Valider la relance", next_action_at: now.toISOString().slice(0, 10) }).eq("id", lead.id);
          summary.drafts++;
        }
      }
    } catch (err) {
      summary.errors.push(`${lead.email} : ${err.message}`);
    }
  }

  await logRun({ kind: "robot", status: summary.errors.length ? "error" : "ok", duration_ms: Date.now() - started, detail: JSON.stringify(summary).slice(0, 500) });
  return summary;
}
