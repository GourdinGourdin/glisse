// Emails du projet : envoi par Gmail (SMTP, Nodemailer) et lecture des réponses (IMAP, ImapFlow).
// Toutes les règles d'envoi sont ici : consentement, plafond quotidien, adresses de test, statut du lead.

import { isTestAddress } from "./_guards.js";
import { db, logRun } from "./_lib.js";

const DAILY_LIMIT = 100;

export const mailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

async function gmailTransport() {
  const { default: nodemailer } = await import("nodemailer");
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

const escapeHtml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const toHtml = (text) =>
  `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#0b2129;max-width:600px">${text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;

export async function saveDraft(lead, { subject, body, kind, reason }) {
  await db().from("emails").delete().eq("lead_id", lead.id).eq("status", "draft").eq("kind", kind);
  const { data, error } = await db()
    .from("emails")
    .insert({ lead_id: lead.id, direction: "out", status: "draft", kind, subject, body, hold_reason: reason ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Envoie un email à un lead et met à jour sa fiche. Lève une erreur en français si une règle l'interdit.
export async function sendEmail(lead, { subject, body, kind }, { transport, allowTestAddress = false } = {}) {
  if (!lead.consent) throw new Error("Ce lead n'a pas donné son consentement");
  if (lead.status === "lost") throw new Error("Ce lead est perdu ou désinscrit : aucun envoi");
  if (isTestAddress(lead.email) && !allowTestAddress) throw new Error("Adresse de test : aucun envoi réel");
  if (kind === "followup") {
    if (lead.status !== "contacted" || lead.follow_ups > 0) throw new Error("Une seule relance par lead, et jamais après une réponse");
  }
  if (!transport && !mailConfigured()) throw new Error("Gmail n'est pas encore connecté");

  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await db()
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("direction", "out")
    .eq("status", "sent")
    .gte("sent_at", midnight.toISOString());
  if (countError) throw new Error(countError.message);
  if (count >= DAILY_LIMIT) throw new Error(`Plafond de ${DAILY_LIMIT} emails par jour atteint`);

  // Une relance ou une réponse reste dans le même fil que le dernier email
  const { data: previous } = await db()
    .from("emails")
    .select("message_id")
    .eq("lead_id", lead.id)
    .eq("status", "sent")
    .not("message_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const started = Date.now();
  let info;
  try {
    const mailer = transport ?? (await gmailTransport());
    info = await mailer.sendMail({
      from: `"Glisse" <${process.env.GMAIL_USER ?? "test@example.com"}>`,
      to: lead.email,
      subject,
      text: body,
      html: toHtml(body),
      ...(previous?.message_id && { inReplyTo: previous.message_id, references: [previous.message_id] }),
    });
  } catch (err) {
    await logRun({ kind: "email", status: "error", lead_id: lead.id, duration_ms: Date.now() - started, detail: `${kind} : ${err.message}`.slice(0, 300) });
    throw new Error(`Gmail a refusé l'envoi : ${err.message}`);
  }

  const now = new Date().toISOString();
  await db().from("emails").delete().eq("lead_id", lead.id).eq("status", "draft").eq("kind", kind);
  const { error: saveError } = await db()
    .from("emails")
    .insert({ lead_id: lead.id, direction: "out", status: "sent", kind, subject, body, message_id: info.messageId, sent_at: now });
  if (saveError) console.error("email save failed:", saveError.message);

  const patch = { last_email_at: now };
  if (kind === "email1" && lead.status === "new") patch.status = "contacted";
  if (kind === "followup") Object.assign(patch, { status: "followed_up", follow_ups: 1 });
  const { data: updated, error } = await db().from("leads").update(patch).eq("id", lead.id).select().single();
  if (error) console.error("lead update failed:", error.message);

  await logRun({ kind: "email", status: "ok", lead_id: lead.id, duration_ms: Date.now() - started, detail: kind });
  return updated ?? { ...lead, ...patch };
}

// Texte brut d'un message : la partie text/plain, sans les lignes citées
function plainPart(node) {
  if (!node) return null;
  if (node.type === "text/plain") return node.part ?? "1";
  for (const child of node.childNodes ?? []) {
    const found = plainPart(child);
    if (found) return found;
  }
  return null;
}

export const stripQuoted = (text) => {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const cut = lines.findIndex((l) => /^\s*(>|On .+ wrote:|Le .+ a écrit\s?:|-{2,}\s*Original Message)/.test(l));
  return (cut >= 0 ? lines.slice(0, cut) : lines).join("\n").trim().slice(0, 5000);
};

// Boîte Gmail réelle : réponses reçues des adresses données. IMAP SINCE travaille au jour près : le robot refiltre à la minute.
export const gmailMailbox = {
  async fetchReplies(leads) {
    if (!leads.length) return [];
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      logger: false,
    });
    const wanted = new Set(leads.map((l) => l.email.toLowerCase()));
    const since = new Date(Math.min(...leads.map((l) => new Date(l.last_email_at).getTime())));
    const replies = [];
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = (await client.search({ since }, { uid: true })) || [];
      const found = [];
      for await (const m of uids.length ? client.fetch(uids, { envelope: true, bodyStructure: true }, { uid: true }) : []) {
        const from = m.envelope?.from?.[0]?.address?.toLowerCase();
        if (wanted.has(from)) found.push({ uid: m.uid, from, envelope: m.envelope, part: plainPart(m.bodyStructure) });
      }
      for (const m of found) {
        let body = "";
        if (m.part) {
          const { content } = await client.download(String(m.uid), m.part, { uid: true });
          const chunks = [];
          for await (const chunk of content) chunks.push(chunk);
          body = stripQuoted(Buffer.concat(chunks).toString("utf8"));
        }
        replies.push({ email: m.from, messageId: m.envelope.messageId, subject: m.envelope.subject ?? "", body, date: m.envelope.date });
      }
    } finally {
      lock.release();
      await client.logout().catch(() => {});
    }
    return replies;
  },
};
