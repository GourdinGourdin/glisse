// Modèles de messages du CRM et liste des départements.
// Les textes sont à relire et à adapter : ce sont des propositions (voir AGENTS.md, « Emails »).

const DEPTS = {
  "01": "Ain", "02": "Aisne", "03": "Allier", "04": "Alpes-de-Haute-Provence", "05": "Hautes-Alpes", "06": "Alpes-Maritimes",
  "07": "Ardèche", "08": "Ardennes", "09": "Ariège", "10": "Aube", "11": "Aude", "12": "Aveyron", "13": "Bouches-du-Rhône",
  "14": "Calvados", "15": "Cantal", "16": "Charente", "17": "Charente-Maritime", "18": "Cher", "19": "Corrèze", "2A": "Corse-du-Sud",
  "2B": "Haute-Corse", "21": "Côte-d'Or", "22": "Côtes-d'Armor", "23": "Creuse", "24": "Dordogne", "25": "Doubs", "26": "Drôme",
  "27": "Eure", "28": "Eure-et-Loir", "29": "Finistère", "30": "Gard", "31": "Haute-Garonne", "32": "Gers", "33": "Gironde",
  "34": "Hérault", "35": "Ille-et-Vilaine", "36": "Indre", "37": "Indre-et-Loire", "38": "Isère", "39": "Jura", "40": "Landes",
  "41": "Loir-et-Cher", "42": "Loire", "43": "Haute-Loire", "44": "Loire-Atlantique", "45": "Loiret", "46": "Lot",
  "47": "Lot-et-Garonne", "48": "Lozère", "49": "Maine-et-Loire", "50": "Manche", "51": "Marne", "52": "Haute-Marne",
  "53": "Mayenne", "54": "Meurthe-et-Moselle", "55": "Meuse", "56": "Morbihan", "57": "Moselle", "58": "Nièvre", "59": "Nord",
  "60": "Oise", "61": "Orne", "62": "Pas-de-Calais", "63": "Puy-de-Dôme", "64": "Pyrénées-Atlantiques", "65": "Hautes-Pyrénées",
  "66": "Pyrénées-Orientales", "67": "Bas-Rhin", "68": "Haut-Rhin", "69": "Rhône", "70": "Haute-Saône", "71": "Saône-et-Loire",
  "72": "Sarthe", "73": "Savoie", "74": "Haute-Savoie", "75": "Paris", "76": "Seine-Maritime", "77": "Seine-et-Marne",
  "78": "Yvelines", "79": "Deux-Sèvres", "80": "Somme", "81": "Tarn", "82": "Tarn-et-Garonne", "83": "Var", "84": "Vaucluse",
  "85": "Vendée", "86": "Vienne", "87": "Haute-Vienne", "88": "Vosges", "89": "Yonne", "90": "Territoire de Belfort",
  "91": "Essonne", "92": "Hauts-de-Seine", "93": "Seine-Saint-Denis", "94": "Val-de-Marne", "95": "Val-d'Oise",
};

// Départements de chaque région, dans le même ordre que l'import serveur (api/_osm.js)
const REGION_DEPTS = {
  bretagne: ["29", "22", "56", "35", "44"],
  landes: ["33", "40", "64"],
  med: ["66", "11", "34", "30", "13", "83", "06", "2A", "2B"],
  nord: ["50", "14", "76", "80", "62", "59"],
  charente: ["17", "85", "16", "79"],
  other: Object.keys(DEPTS).filter((d) => !["29", "22", "56", "35", "44", "33", "40", "64", "66", "11", "34", "30", "13", "83", "06", "2A", "2B", "50", "14", "76", "80", "62", "59", "17", "85", "16", "79"].includes(d)),
};

const SPORT_NAMES = { surf: "Surf", voile: "Voile", kite: "Kite", paddle: "Paddle", autre: "Autre", multi: "Multi" };
const SPORT_WORDS = { surf: "surf", voile: "voile", kite: "kitesurf", paddle: "paddle", autre: "glisse", multi: "glisse" };

const SITE = "https://glisse.vercel.app";
const SIGNATURE = "Victor, fondateur de Glisse";
const STOP_PRO = "Si vous ne souhaitez plus recevoir de message de ma part, répondez simplement « STOP ».";
const STOP_LEAD = "Tu reçois cet email parce que tu as fait le test sur glisse.vercel.app. Réponds STOP pour ne plus rien recevoir.";

const euroTxt = (n) => Number(n).toLocaleString("fr-FR") + " €";

/* ---------- Prospection (vouvoiement, premier contact professionnel) ---------- */

function prospectTemplates(p) {
  const sport = SPORT_WORDS[p.sport] ?? "glisse";
  const where = p.city ? ` à ${p.city}` : p.departement && DEPTS[p.departement] ? ` (${DEPTS[p.departement]})` : "";
  const subject = `${p.name} : vos réservations en ligne, sans le téléphone`;

  return {
    first: {
      label: "Premier email",
      subject,
      body: `Bonjour,

Je m'appelle Victor et je construis Glisse, un outil de réservation et de gestion pensé pour les écoles de ${sport} comme ${p.name}${where}.

Concrètement : vos clients réservent et paient en ligne, même le soir. Votre planning, vos moniteurs et vos inscrits sont au même endroit, et les places qui se libèrent se remplissent toutes seules grâce à une liste d'attente.

Nous cherchons quelques écoles pilotes pour la saison prochaine. C'est gratuit pendant toute la phase pilote, et on construit l'outil avec vous.

Auriez-vous 15 minutes cette semaine ou la suivante pour en parler ? Vous pouvez aussi faire notre diagnostic en 2 minutes : ${SITE}/#diagnostic

Bonne journée,
${SIGNATURE}

${STOP_PRO}`,
    },
    followup: {
      label: "Relance",
      subject: `Re: ${subject}`,
      body: `Bonjour,

Je me permets de revenir vers vous au sujet de Glisse. En deux mots : vos clients réservent en ligne, même à 23h, et vous arrêtez de gérer les inscriptions au téléphone en pleine saison.

Seriez-vous partant pour un échange de 15 minutes ? Un simple « oui » suffit, je vous propose un créneau.

${SIGNATURE}

${STOP_PRO}`,
    },
    call: {
      label: "Script d'appel",
      subject: null,
      body: `1. Présentation (10 s)
« Bonjour, Victor de Glisse. Je construis un outil de réservation en ligne pour les écoles de ${sport}. Vous avez deux minutes ? »

2. Question de découverte
« Aujourd'hui, comment vos clients réservent un cours chez ${p.name} ? Par téléphone, sur un site, sur une plateforme ? »
« Combien d'appels ou de messages vous recevez par jour en pleine saison ? »
« Il vous arrive d'avoir des places vides sur des cours ? »

3. Proposition
« Glisse permet à vos clients de réserver et payer en ligne, avec planning, moniteurs et liste d'attente au même endroit. On cherche quelques écoles pilotes, c'est gratuit pendant la phase pilote. »

4. Prochaine étape
« Je vous propose 15 minutes de démo cette semaine, quel jour vous arrange ? »
Sinon : « Je vous envoie un email avec le lien du diagnostic, à quelle adresse ? »

À noter après l'appel : outil actuel, volume d'appels, places vides, intérêt (1 à 5), prochaine étape.`,
    },
  };
}

/* ---------- Leads (tutoiement, comme la landing ; textes d'AGENTS.md) ---------- */

// Le message personnalisé généré à l'arrivée du lead passe en premier
function leadTemplates(lead) {
  const base = baseLeadTemplates(lead);
  if (!lead.ai_body) return base;
  return {
    ai: { label: lead.ai_source === "gemini" ? "Message Gemini" : "Message (secours)", subject: lead.ai_subject, body: lead.ai_body },
    ...base,
  };
}

function baseLeadTemplates(lead) {
  const a = lead.answers ?? {};
  const r = a.result ?? {};
  if (lead.audience === "ecole") {
    const recos = (r.recos ?? []).map((t, i) => `${i + 1}. ${t}`).join("\n");
    const subject = `Ton diagnostic Glisse : ${r.revenue ? euroTxt(r.revenue) : "ton résultat"} récupérables par saison`;
    return {
      first: {
        label: "Email 1",
        subject,
        body: `Salut,

Merci d'avoir fait le diagnostic Glisse${lead.school ? ` pour ${lead.school}` : ""}. Voici ton résultat :

- Score de gestion : ${r.score ?? "?"}/100${r.status ? ` (${r.status})` : ""}
- ${r.hours ?? "?"} h par semaine passées sur l'administratif, soit ${r.seasonHours ?? "?"} h sur la saison
- Environ ${r.revenue ? euroTxt(r.revenue) : "?"} de chiffre d'affaires récupérable par saison
${recos ? `\nNos conseils pour ton école :\n${recos}\n` : ""}
On construit Glisse avec quelques écoles pilotes : réservation en ligne, planning des moniteurs et gestion des places, sans Excel ni téléphone. C'est gratuit pour les écoles pilotes.

Ça te dit qu'on en parle 15 minutes ? Réponds simplement à cet email.

${SIGNATURE}

${STOP_LEAD}`,
      },
      followup: {
        label: "Relance",
        subject: `Re: ${subject}`,
        body: `Salut,

Je reviens vers toi suite à ton diagnostic. Les écoles qui ressemblent à la tienne perdent surtout du temps au téléphone en pleine saison : c'est exactement ce que Glisse règle.

15 minutes cette semaine ou la suivante, ça te va ? Une simple réponse « oui » suffit et je te propose un créneau.

Victor

${STOP_LEAD}`,
      },
    };
  }

  const region = REGIONS[a.region]?.where ?? "près de chez toi";
  const subject = `Bienvenue sur Glisse : ton cours de ${SPORT_WORDS[a.sport] ?? "glisse"} t'attend`;
  return {
    first: {
      label: "Email 1",
      subject,
      body: `Salut,

Merci d'avoir fait le test ! Ton niveau : ${r.level ?? "?"}. Le format qui te correspond : ${(r.formatName ?? "?").toLowerCase()}.

Tu es sur la liste d'attente de Glisse. On te prévient dès qu'on ouvre les réservations ${region}, et si tu fais partie des 100 premiers inscrits, ton premier cours est offert.

Une question pour nous aider : quand comptes-tu aller à l'eau ? Réponds juste à cet email.

${SIGNATURE}

${STOP_LEAD}`,
    },
    followup: {
      label: "Relance",
      subject: `Re: ${subject}`,
      body: `Salut,

Petit rappel : tu es bien sur la liste d'attente Glisse, ton cours offert est réservé si tu fais partie des 100 premiers. Tu connais quelqu'un que ça intéresserait ? Transfère-lui cet email.

Victor

${STOP_LEAD}`,
    },
  };
}
