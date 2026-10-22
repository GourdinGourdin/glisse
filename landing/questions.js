// Questions ouvertes du diagnostic, partagées par la landing (script.js) et le CRM (admin.js).
// Le visiteur répond librement ; Gemini lit les réponses et rédige une analyse personnalisée.

const QUESTIONS = {
  rider: [
    { id: "sport", q: "Quel sport de glisse te tente, et qu'est-ce qui t'attire ?", hint: "Surf, voile, kite, paddle… dis-nous ce qui te donne envie." },
    { id: "experience", q: "Où en es-tu aujourd'hui ? Raconte-nous ton expérience.", hint: "Jamais essayé, quelques sessions en vacances, autonome par mer calme…" },
    { id: "goal", q: "Qu'est-ce que tu aimerais vivre ou réussir cette saison ?", hint: "Tenir debout, prendre ses premières vagues, partir en stage, naviguer seul…" },
    { id: "where", q: "Où et quand voudrais-tu pratiquer ?", hint: "Région ou spot, dates, vacances, week-ends…" },
    { id: "blocker", q: "Qu'est-ce qui t'a freiné jusqu'ici pour réserver un cours ?", hint: "Prix, peur de ne pas avoir le niveau, difficile de trouver une école dispo…" },
  ],
  school: [
    { id: "school", q: "Présente ton école en quelques mots.", hint: "Sports proposés, lieu, taille de l'équipe, durée de la saison…" },
    { id: "booking", q: "Comment tes clients réservent-ils un cours aujourd'hui ?", hint: "Téléphone, messages, site, plateforme, sur place…" },
    { id: "pain", q: "Qu'est-ce qui te prend le plus de temps ou t'agace le plus en pleine saison ?", hint: "Appels, plannings, annulations météo, paiements…" },
    { id: "fill", q: "Comment se remplissent tes cours ? Certains créneaux restent-ils vides ?", hint: "Quels jours, quelles heures, quels niveaux…" },
    { id: "clients", q: "Comment les nouveaux clients te trouvent-ils ?", hint: "Bouche-à-oreille, Google, Instagram, office de tourisme…" },
    { id: "wish", q: "Si tu avais l'outil idéal demain, qu'est-ce qu'il ferait pour toi ?", hint: "Sois aussi concret que possible." },
  ],
};

const REGIONS = {
  bretagne: { name: "Bretagne", where: "en Bretagne" },
  landes: { name: "Landes", where: "dans les Landes et au Pays basque" },
  med: { name: "Méditerranée", where: "sur la Méditerranée" },
  nord: { name: "Normandie", where: "en Normandie et dans le Nord" },
  charente: { name: "Charente", where: "en Charente et en Vendée" },
  other: { name: "France", where: "près de chez toi" },
};
