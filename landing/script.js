// URL de ton service de collecte d'emails (Formspree, Brevo, Supabase, etc.).
// Laisse vide pour tester en local : les inscriptions s'affichent dans la console.
const FORM_ENDPOINT = "";

// Lien de prise de rendez-vous pour les démos écoles (Calendly, Cal.com...).
const DEMO_URL = "";

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- Questions ---------- */

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

/* ---------- Calculs ---------- */

const REGIONS = {
  bretagne: { name: "Bretagne", where: "en Bretagne" },
  landes: { name: "Landes", where: "dans les Landes et au Pays basque" },
  med: { name: "Méditerranée", where: "sur la Méditerranée" },
  nord: { name: "Normandie", where: "en Normandie et dans le Nord" },
  charente: { name: "Charente", where: "en Charente et en Vendée" },
  other: { name: "France", where: "près de chez toi" },
};

const LEVELS = ["Découverte", "Débutant", "Intermédiaire", "Confirmé"];

const COURSES = {
  surf: ["une initiation au surf", "un cours débutant en petit groupe", "un coaching pour prendre tes premières vagues vertes", "une session de coaching vidéo"],
  voile: ["un baptême en catamaran", "un stage débutant en dériveur", "un cours de perfectionnement en navigation", "un entraînement à la régate"],
  kite: ["une découverte du pilotage sur la plage", "un stage d'initiation encadré", "un cours pour réussir tes premiers bords", "un coaching sauts et transitions"],
  paddle: ["une balade encadrée en eau calme", "un cours pour gagner en équilibre", "une sortie en mer avec un moniteur", "une initiation au paddle sur les vagues"],
};

const TIPS = [
  "Choisis un spot avec un fond sableux et peu de monde. Les écoles indiquent souvent les meilleurs créneaux selon la marée.",
  "C'est en enchaînant les séances rapprochées que tu progresses le plus vite. Trois cours la même semaine valent mieux que trois cours dans l'année.",
  "À ce stade, un retour vidéo ou un cours particulier peut te faire gagner une saison entière.",
  "Cherche des créneaux en petit groupe de niveau homogène, ou un coaching ciblé sur un point technique précis.",
];

function riderResult(a) {
  const score = a.sessions + a.skill;
  const lvl = score <= 1 ? 0 : score <= 3 ? 1 : score <= 5 ? 2 : 3;
  const course = COURSES[a.sport][lvl];
  let format = a.format;
  if (format === "any") format = a.goal === "camp" ? "camp" : a.goal === "level" ? "private" : "group";
  const formatName = { group: "Collectif", private: "Particulier", camp: "Stage" }[format];
  return { level: LEVELS[lvl], lvl, course, formatName, tip: TIPS[lvl] };
}

function schoolResult(a) {
  const adminHours = { paper: 4, sheet: 3, phone: 3.5, software: 1 }[a.tool];
  // 4 min par appel, 6 jours par semaine
  const hours = Math.round(a.calls * 4 * 6 / 60 + adminHours);
  // On considère qu'environ un tiers des places vides peut être récupéré
  const revenue = Math.round(a.empty * a.courses * a.price * a.season * 0.35 / 100) * 100;
  const seasonHours = hours * a.season;

  const score =
    { paper: 5, sheet: 15, phone: 10, software: 30 }[a.tool] +
    { word: 5, google: 15, social: 12, platform: 20 }[a.visibility] +
    ({ 3: 25, 10: 18, 22: 10, 40: 4 })[a.calls] +
    ({ 0.3: 25, 1.5: 18, 3.5: 10, 5: 4 })[a.empty];

  const status = score < 40 ? "À digitaliser" : score < 70 ? "En bonne voie" : "Bien équipée";

  const recos = [];
  if (a.tool !== "software") recos.push("Rassembler le planning, les moniteurs et la liste des inscrits dans un seul outil partagé avec ton équipe.");
  if (a.calls >= 10) recos.push("Ouvrir la réservation et le paiement en ligne pour que les clients s'inscrivent sans t'appeler, même le soir.");
  if (a.empty >= 1.5) recos.push("Mettre en place une liste d'attente et des rappels automatiques pour remplir les places qui se libèrent.");
  if (a.visibility === "word") recos.push("Être visible là où les gens cherchent un cours, c'est-à-dire sur Google et sur les plateformes de réservation.");
  recos.push("Suivre le taux de remplissage de chaque créneau pour ajuster ton planning d'une semaine à l'autre.");

  return { hours, seasonHours, revenue, score, status, recos: recos.slice(0, 3) };
}

/* ---------- Interface du quiz ---------- */

const quiz = document.getElementById("quiz");
const screens = Object.fromEntries([...quiz.querySelectorAll("[data-screen]")].map((s) => [s.dataset.screen, s]));
const qTitle = quiz.querySelector(".quiz__q");
const qOptions = quiz.querySelector(".quiz__options");
const qCount = quiz.querySelector(".quiz__count");
const qBar = quiz.querySelector(".progress i");
const resultBox = quiz.querySelector(".result");

let state = { path: null, step: 0, answers: {} };

function show(name) {
  Object.entries(screens).forEach(([key, el]) => (el.hidden = key !== name));
}

function start(path) {
  state = { path, step: 0, answers: {} };
  renderQuestion();
}

function renderQuestion() {
  const list = QUESTIONS[state.path];
  const item = list[state.step];
  qTitle.textContent = item.q;
  qCount.textContent = `${state.step + 1} sur ${list.length}`;
  qBar.style.width = `${(state.step / list.length) * 100}%`;
  qOptions.innerHTML = "";

  item.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt";
    if (state.answers[item.id] === opt.value) btn.classList.add("is-picked");
    btn.innerHTML = opt.label + (opt.small ? `<small>${opt.small}</small>` : "");
    btn.addEventListener("click", () => {
      state.answers[item.id] = opt.value;
      btn.classList.add("is-picked");
      setTimeout(next, 180);
    });
    qOptions.appendChild(btn);
  });

  show("question");
  qOptions.querySelector(".opt").focus({ preventScroll: true });
}

function next() {
  if (state.step < QUESTIONS[state.path].length - 1) {
    state.step++;
    renderQuestion();
  } else {
    qBar.style.width = "100%";
    renderResult();
  }
}

function back() {
  if (state.step === 0) return show("start");
  state.step--;
  renderQuestion();
}

const euro = (n) => n.toLocaleString("fr-FR") + " €";

function renderResult() {
  const a = state.answers;
  let html;

  if (state.path === "rider") {
    const r = riderResult(a);
    state.result = r;
    html = `
      <div>
        <p class="result__label">Ton niveau</p>
        <h3>${r.level}</h3>
        <p class="result__intro">Le cours qui te correspond le mieux, c'est ${r.course}.</p>
      </div>
      <div class="stats">
        <div class="stat stat--hot"><b>${r.formatName}</b><span>Format de cours conseillé</span></div>
        <div class="stat"><b>${r.lvl + 1}/4</b><span>Sur l'échelle de progression</span></div>
        <div class="stat"><b>${REGIONS[a.region].name}</b><span>Zone de recherche</span></div>
      </div>
      <p>${r.tip}</p>
      <div class="capture">
        <h3>On te prévient dès que ça ouvre ${REGIONS[a.region].where}</h3>
        <p>Laisse ton email pour faire partie des premiers à réserver avec Glisse, avec un cours offert pour les 100 premiers inscrits.</p>
        ${captureForm("Me prévenir")}
      </div>`;
  } else {
    const r = schoolResult(a);
    state.result = r;
    html = `
      <div>
        <p class="result__label">Ton école est ${r.status.toLowerCase()}</p>
        <h3>Score de gestion : ${r.score}/100</h3>
        <p class="result__intro">Voici ce que te coûte ta façon de gérer les réservations aujourd'hui.</p>
      </div>
      <div class="stats">
        <div class="stat"><b>${r.hours} h</b><span>passées chaque semaine sur l'administratif</span></div>
        <div class="stat"><b>${r.seasonHours} h</b><span>sur l'ensemble de la saison</span></div>
        <div class="stat stat--hot"><b>${euro(r.revenue)}</b><span>de chiffre d'affaires récupérable par saison</span></div>
      </div>
      <div>
        <h3 style="font-size:1.25rem;margin-bottom:1rem">Les trois chantiers prioritaires</h3>
        <ol class="recos">${r.recos.map((t) => `<li><p>${t}</p></li>`).join("")}</ol>
      </div>
      <p class="result__fine">Estimation indicative, calculée à partir de tes réponses. On part du principe qu'un appel prend environ 4 minutes et qu'un tiers des places vides peut être rempli avec une réservation en ligne.</p>
      <div class="capture">
        <h3>Reçois ton rapport détaillé</h3>
        <p>On t'envoie le diagnostic complet avec un plan d'action adapté à ton école. Les 20 premières écoles inscrites profitent de 6 mois gratuits.</p>
        ${captureForm("Recevoir mon rapport", true)}
        ${DEMO_URL ? `<p class="capture__alt">Tu préfères en parler ? <a href="${DEMO_URL}" target="_blank" rel="noopener">Réserve une démo de 15 minutes</a></p>` : ""}
      </div>`;
  }

  resultBox.innerHTML = html + `<button type="button" class="result__restart">Refaire le test</button>`;
  resultBox.querySelector(".result__restart").addEventListener("click", () => show("start"));
  resultBox.querySelector("form").addEventListener("submit", submitLead);
  show("result");
  quiz.scrollIntoView({ behavior: "smooth", block: "start" });
}

function captureForm(cta, withSchool = false) {
  return `
    <form novalidate>
      ${withSchool ? `<input type="text" name="school" placeholder="Nom de l'école" autocomplete="organization">` : ""}
      <input type="email" name="email" required placeholder="ton@email.fr" autocomplete="email">
      <button class="btn" type="submit">${cta}</button>
    </form>
    <p class="capture__msg" role="status" aria-live="polite"></p>`;
}

async function submitLead(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = form.nextElementSibling;
  msg.className = "capture__msg";

  if (!form.elements.email.checkValidity()) {
    msg.textContent = "Il manque une adresse email valide.";
    msg.classList.add("is-error");
    return;
  }

  const payload = {
    ...Object.fromEntries(new FormData(form)),
    audience: state.path === "school" ? "ecole" : "pratiquant",
    answers: state.answers,
    result: state.result,
  };

  try {
    if (FORM_ENDPOINT) {
      const res = await fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(res.statusText);
    } else {
      console.log("Nouveau lead :", payload);
    }
    form.hidden = true;
    msg.textContent = state.path === "school"
      ? "C'est noté, ton rapport arrive par email."
      : "C'est noté, on te prévient à l'ouverture.";
    msg.classList.add("is-ok");
  } catch {
    msg.textContent = "L'envoi n'a pas fonctionné, réessaie dans un instant.";
    msg.classList.add("is-error");
  }
}

/* ---------- Branchements ---------- */

const nav = document.querySelector(".nav");
const onScroll = () => nav.classList.toggle("is-scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

quiz.querySelectorAll(".path").forEach((btn) => btn.addEventListener("click", () => start(btn.dataset.path)));
quiz.querySelector(".quiz__back").addEventListener("click", back);

// Les boutons du haut de page lancent directement le bon parcours
document.querySelectorAll("a[data-path]").forEach((link) => {
  link.addEventListener("click", () => start(link.dataset.path));
});
