// Le robot sur la vraie base, avec une fausse boîte Gmail : aucun email réel ne part. Lancer : npm test
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { decide, isStop, runRobot } from "../api/_robot.js";
import { db } from "../api/_lib.js";
import { sendEmail } from "../api/_mail.js";

const DAY = 864e5;
const now = new Date("2026-11-10T09:00:00Z");
const hasDb = Boolean(process.env.SUPABASE_URL);
const writer = async (lead) => ({ subject: `Re: ${lead.ai_subject}`, body: "Relance de test", source: "fallback", model: null, tokensIn: 0, tokensOut: 0, cost: 0, ms: 0 });
const sent = [];
const transport = { sendMail: async (m) => (sent.push(m), { messageId: `<test-${Date.now()}-${sent.length}@example.com>` }) };
const box = (list = []) => ({ fetchReplies: async () => list });

test("décisions : statuts ignorés, attente, relance, réponse, STOP", () => {
  const base = { status: "contacted", follow_ups: 0, last_email_at: new Date(now - 4 * DAY).toISOString() };
  const opts = { replies: [], hasDraft: false, now, followDays: 3 };
  for (const status of ["new", "replied", "meeting", "won", "lost"]) assert.equal(decide({ ...base, status }, opts).action, "ignore", status);
  assert.equal(decide(base, opts).action, "followup");
  assert.equal(decide({ ...base, last_email_at: new Date(now - DAY).toISOString() }, opts).action, "wait");
  assert.equal(decide(base, { ...opts, hasDraft: true }).action, "wait");
  assert.equal(decide({ ...base, status: "followed_up", follow_ups: 1 }, opts).action, "wait");
  const reply = { date: now, body: "Oui, avec plaisir" };
  assert.equal(decide(base, { ...opts, replies: [reply] }).action, "replied");
  assert.equal(decide(base, { ...opts, replies: [{ date: now, body: "STOP merci" }] }).action, "stop");
  assert.equal(decide(base, { ...opts, replies: [{ date: new Date(now - 10 * DAY), body: "ancien" }] }).action, "followup");
  assert.equal(isStop("Je ne veux pas stop"), false);
});

test("parcours complet sur la base", { skip: !hasDb }, async (t) => {
  const email = `robot-${Date.now()}@example.com`;
  const { data: lead, error } = await db().from("leads").insert({ email, audience: "ecole", consent: true, ai_subject: "Ton diagnostic" }).select().single();
  assert.equal(error, null);
  t.after(async () => {
    await db().from("runs").delete().eq("lead_id", lead.id);
    await db().from("leads").delete().eq("id", lead.id);
  });
  const run = (mailbox = box()) => runRobot({ mailbox, transport, writer, now, followDays: 3, auto: false, onlyLeadId: lead.id });
  const fresh = async () => (await db().from("leads").select("*").eq("id", lead.id).single()).data;

  // Adresse de test : refusée sans autorisation explicite ; consentement absent : refusé
  await assert.rejects(sendEmail(lead, { subject: "x", body: "y", kind: "email1" }, { transport }), /test/);
  await assert.rejects(sendEmail({ ...lead, consent: false }, { subject: "x", body: "y", kind: "email1" }, { transport, allowTestAddress: true }), /consentement/);

  // Email 1 : statut contacted, date du dernier email, email enregistré
  let l = await sendEmail(lead, { subject: "Ton diagnostic", body: "Bonjour", kind: "email1" }, { transport, allowTestAddress: true });
  assert.equal(l.status, "contacted");
  assert.ok(l.last_email_at);
  assert.equal(sent.at(-1).to, email);

  // Trois jours sans réponse : une relance en brouillon, et dix passages n'en créent pas d'autre
  await db().from("leads").update({ last_email_at: new Date(now - 4 * DAY).toISOString() }).eq("id", lead.id);
  const before = sent.length;
  assert.equal((await run()).drafts, 1);
  for (let i = 0; i < 10; i++) assert.equal((await run()).drafts, 0);
  assert.equal(sent.length, before, "aucun email ne part sans clic humain");
  const { data: drafts } = await db().from("emails").select("*").eq("lead_id", lead.id).eq("status", "draft");
  assert.equal(drafts.length, 1);

  // Clic humain : la relance part, statut followed_up, et une seconde relance est refusée
  l = await sendEmail(await fresh(), { subject: drafts[0].subject, body: drafts[0].body, kind: "followup" }, { transport, allowTestAddress: true });
  assert.equal(l.status, "followed_up");
  assert.equal(l.follow_ups, 1);
  assert.match(sent.at(-1).inReplyTo, /test-/);
  await assert.rejects(sendEmail(l, { subject: "x", body: "y", kind: "followup" }, { transport, allowTestAddress: true }), /Une seule relance/);
  assert.equal((await db().from("emails").select("id").eq("lead_id", lead.id).eq("status", "draft")).data.length, 0);
  assert.equal((await run()).drafts, 0);

  // Une réponse : statut replied, réponse enregistrée une seule fois, action créée pour l'équipe
  const reply = { email, messageId: `<reply-${Date.now()}@example.com>`, subject: "Re: Ton diagnostic", body: "Oui, appelle-moi", date: new Date(Date.now() + 1000) };
  assert.equal((await run(box([reply]))).replies, 1);
  l = await fresh();
  assert.equal(l.status, "replied");
  assert.equal(l.next_action, "Répondre à ce lead");
  assert.equal((await run(box([reply]))).checked, 0, "un lead qui a répondu n'est plus jamais touché");
  assert.equal((await db().from("emails").select("id").eq("lead_id", lead.id).eq("direction", "in")).data.length, 1);

  // Boîte illisible : aucune relance
  await db().from("leads").update({ status: "contacted", follow_ups: 0, last_email_at: new Date(now - 4 * DAY).toISOString() }).eq("id", lead.id);
  const broken = await run({ fetchReplies: async () => { throw new Error("IMAP en panne"); } });
  assert.equal(broken.drafts, 0);
  assert.equal(broken.errors.length, 1);

  // STOP : le lead sort du circuit et plus rien ne peut lui être envoyé
  assert.equal((await run(box([{ ...reply, messageId: `<stop-${Date.now()}@example.com>`, body: "STOP", date: new Date(now.getTime() + 1000) }]))).stops, 1);
  l = await fresh();
  assert.equal(l.status, "lost");
  await assert.rejects(sendEmail(l, { subject: "x", body: "y", kind: "manual" }, { transport, allowTestAddress: true }), /désinscrit/);
});
