// Questions du quiz et régions, partagées par la landing (script.js) et le CRM (admin.js).

const QUESTIONS = {
  rider: [
    {
      id: "sport",
      q: "Quel sport te tente ?",
      options: [
        { label: "Surf", value: "surf" },
        { label: "Voile", value: "voile" },
        { label: "Kitesurf", value: "kite" },
        { label: "Paddle", value: "paddle" },
      ],
    },
    {
      id: "sessions",
      q: "Combien de fois as-tu déjà pratiqué ?",
      options: [
        { label: "Jamais", value: 0 },
        { label: "Entre 1 et 5 fois", value: 1 },
        { label: "Entre 6 et 20 fois", value: 2 },
        { label: "Régulièrement", value: 3 },
      ],
    },
    {
      id: "skill",
      q: "Où en es-tu aujourd'hui ?",
      options: [
        { label: "Je découvre", small: "Je n'ai jamais vraiment essayé", value: 0 },
        { label: "Je me débrouille avec un moniteur", small: "Je tiens debout ou je sais barrer", value: 1 },
        { label: "Je suis autonome quand c'est calme", small: "Je gère seul dans de bonnes conditions", value: 2 },
        { label: "Je suis à l'aise partout", small: "Je cherche à me perfectionner", value: 3 },
      ],
    },
    {
      id: "goal",
      q: "Qu'est-ce que tu cherches ?",
      options: [
        { label: "Essayer pendant les vacances", value: "try" },
        { label: "Progresser toute l'année", value: "regular" },
        { label: "Passer un cap technique", value: "level" },
        { label: "Partir en stage intensif", value: "camp" },
      ],
    },
    {
      id: "format",
      q: "Tu préfères quel format ?",
      options: [
        { label: "Cours collectif", small: "Plus convivial et moins cher", value: "group" },
        { label: "Cours particulier", small: "Progression plus rapide", value: "private" },
        { label: "Stage sur plusieurs jours", value: "camp" },
        { label: "Peu importe", value: "any" },
      ],
    },
    {
      id: "region",
      q: "Tu veux pratiquer où ?",
      options: [
        { label: "Bretagne", value: "bretagne" },
        { label: "Landes et Pays basque", value: "landes" },
        { label: "Méditerranée", value: "med" },
        { label: "Normandie et Nord", value: "nord" },
        { label: "Charente et Vendée", value: "charente" },
        { label: "Ailleurs", value: "other" },
      ],
    },
  ],

  school: [
    {
      id: "sport",
      q: "Quelle activité propose ton école ?",
      options: [
        { label: "Surf", value: "surf" },
        { label: "Voile", value: "voile" },
        { label: "Kitesurf ou wing", value: "kite" },
        { label: "Plusieurs activités", value: "multi" },
      ],
    },
    {
      id: "courses",
      q: "Combien de cours donnez-vous par semaine en haute saison ?",
      options: [
        { label: "Moins de 10", value: 6 },
        { label: "Entre 10 et 30", value: 20 },
        { label: "Entre 30 et 60", value: 45 },
        { label: "Plus de 60", value: 75 },
      ],
    },
    {
      id: "tool",
      q: "Comment gérez-vous les inscriptions aujourd'hui ?",
      options: [
        { label: "Carnet ou papier", value: "paper" },
        { label: "Excel ou Google Sheets", value: "sheet" },
        { label: "Au téléphone et par messages", value: "phone" },
        { label: "Avec un logiciel de réservation", value: "software" },
      ],
    },
    {
      id: "calls",
      q: "Combien d'appels ou de messages recevez-vous par jour pour des réservations ?",
      options: [
        { label: "Moins de 5", value: 3 },
        { label: "Entre 5 et 15", value: 10 },
        { label: "Entre 15 et 30", value: 22 },
        { label: "Plus de 30", value: 40 },
      ],
    },
    {
      id: "empty",
      q: "En moyenne, combien de places restent vides par cours ?",
      options: [
        { label: "Presque aucune", value: 0.3 },
        { label: "1 ou 2", value: 1.5 },
        { label: "3 ou 4", value: 3.5 },
        { label: "Plus de 4", value: 5 },
      ],
    },
    {
      id: "price",
      q: "Quel est le prix moyen d'un cours par personne ?",
      options: [
        { label: "Autour de 30 €", value: 30 },
        { label: "Autour de 45 €", value: 45 },
        { label: "Autour de 60 €", value: 60 },
        { label: "80 € ou plus", value: 80 },
      ],
    },
    {
      id: "visibility",
      q: "Comment la plupart de vos clients vous trouvent ?",
      options: [
        { label: "Bouche-à-oreille ou passage", value: "word" },
        { label: "Google", value: "google" },
        { label: "Instagram ou Facebook", value: "social" },
        { label: "Office de tourisme ou plateformes", value: "platform" },
      ],
    },
    {
      id: "season",
      q: "Votre saison dure combien de temps ?",
      options: [
        { label: "Juillet et août", value: 9 },
        { label: "Environ 4 mois", value: 17 },
        { label: "Environ 6 mois", value: 26 },
        { label: "Toute l'année", value: 45 },
      ],
    },
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
