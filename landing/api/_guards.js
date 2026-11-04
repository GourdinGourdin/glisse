// Contrôles autour du modèle : ce qui entre (réponses du visiteur), ce qui sort (texte généré) et ce que ça coûte.
// Le modèle propose, ce code décide : une réponse bien formée peut quand même être fausse.

import { createHmac } from "node:crypto";
import { db } from "./_lib.js";

const LIMITS = { analysis: 20, chat: 60 }; // par IP et par heure (généreux : une salle de cours partage la même IP)
const DAILY_CAP = 1000;                    // appels au modèle par jour, tous visiteurs confondus

const norm = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const INJECTION = [
  /\b(ignore|ignorez|disregard|forget|oublie|oubliez)\b.{0,40}\b(instructions?|consignes?|regles?|rules|prompt)\b/,
  /\b(system|systeme)\s*prompt\b|\bprompt\s*(system|systeme)\b/,
  /\b(you are now|tu es maintenant|vous etes maintenant|act as|agis comme|fais comme si tu etais)\b/,
  /\b(revele|revelez|donne|affiche|montre|repete|reveal|print|show|repeat)\b.{0,40}\b(prompt|instructions|consignes|api key|cle api|secret|mot de passe|password)\b/,
  /<\/?\s*(system|instructions?|reponses)\s*>/,
  /\bjailbreak\b/,
  /\b(mets|met|donne|attribue|note|give|set|assign)\b.{0,40}\b(priorite|score|priority|note)\b.{0,25}\b(100|maximum|max|maximale)\b/,
];

export const isInjection = (text) => INJECTION.some((re) => re.test(norm(text)));

const DISPOSABLE = new Set([
  "mailinator.com", "yopmail.com", "yopmail.fr", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "trashmail.com", "sharklasers.com", "maildrop.cc", "getnada.com",
]);

// Domaines réservés aux tests (RFC 2606) : jamais d'envoi réel
export const isTestAddress = (email) => /@([a-z0-9-]+\.)*(example\.(com|org|net)|test|invalid)$/i.test(email ?? "");

// Contrôles sur le lead, avant d'appeler le modèle
export function checkLead({ email, labels }) {
  const flags = [];
  const answers = labels.map((l) => l.a);
  if (answers.some(isInjection)) flags.push("injection_attempt");
  const substantial = answers.filter((a) => a.replace(/[^\p{L}]/gu, "").length >= 15).length;
  if (substantial < 2) flags.push("missing_info");
  if (DISPOSABLE.has(String(email).split("@").pop())) flags.push("disposable_email");
  return flags;
}

// Contrôles sur le texte généré, avant tout envoi par email
export function checkOutput(text, labels = []) {
  const flags = [];
  const source = norm(labels.map((l) => l.a).join(" "));
  const output = norm(text);
  if (/https?:\/\/|www\./.test(output)) flags.push("output_link");
  if (/\bgemini_api|system prompt|prompt systeme|mes instructions|mes consignes\b/.test(output)) flags.push("output_leak");
  const figures = output.match(/\d[\d\s.,]*\s?(€|%|euros?)/g) ?? [];
  if (figures.some((f) => !source.includes(f.replace(/[^\d]/g, "")))) flags.push("output_figure");
  if (!output.includes("victor")) flags.push("output_truncated");
  return flags;
}

// La priorité du modèle est plafonnée par ce que le code a constaté
export function clampPriority(priority, flags) {
  let max = 100;
  if (flags.includes("missing_info")) max = 40;
  if (flags.includes("disposable_email") || flags.includes("fake_or_joke")) max = 20;
  if (flags.includes("injection_attempt")) max = 10;
  return priority == null ? (max < 100 ? max : null) : Math.max(0, Math.min(max, Math.round(priority)));
}

export const FLAG_LABELS = {
  injection_attempt: "tentative de manipulation",
  missing_info: "réponses trop courtes",
  fake_or_joke: "réponses fantaisistes",
  disposable_email: "email jetable",
  output_link: "lien dans le texte généré",
  output_leak: "fuite possible des consignes",
  output_figure: "chiffre absent des réponses",
  output_truncated: "texte généré incomplet",
};

export function ipHash(req) {
  const ip = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || "local";
  return createHmac("sha256", process.env.ADMIN_PASSWORD ?? "glisse").update(ip).digest("hex").slice(0, 32);
}

// Budget : plafond par IP et plafond quotidien. Si le comptage échoue, on n'appelle pas le modèle.
export async function llmAllowed(kind, hash) {
  try {
    const hour = new Date(Date.now() - 36e5).toISOString();
    const day = new Date(Date.now() - 864e5).toISOString();
    const [mine, all] = await Promise.all([
      db().from("runs").select("id", { count: "exact", head: true }).eq("kind", kind).eq("ip_hash", hash).gte("created_at", hour),
      db().from("runs").select("id", { count: "exact", head: true }).in("kind", ["analysis", "chat"]).eq("status", "ok").gte("created_at", day),
    ]);
    if (mine.error || all.error) throw new Error(mine.error?.message ?? all.error?.message);
    if (mine.count >= LIMITS[kind]) return false;
    return all.count < DAILY_CAP;
  } catch (err) {
    console.error("budget check failed:", err.message);
    return false;
  }
}
