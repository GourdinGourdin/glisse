// Route serveur qui enregistre les leads dans Supabase (api/lead.js).
// Laisse vide pour tester sans serveur : les inscriptions s'affichent dans la console.
const FORM_ENDPOINT = "/api/lead";

// Lien de prise de rendez-vous pour les démos écoles (Calendly, Cal.com...).
const DEMO_URL = "";

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

const MIN_LENGTH = 3;

function renderQuestion() {
  const list = QUESTIONS[state.path];
  const item = list[state.step];
  const last = state.step === list.length - 1;
  qTitle.textContent = item.q;
  qCount.textContent = `${state.step + 1} sur ${list.length}`;
  qBar.style.width = `${(state.step / list.length) * 100}%`;

  qOptions.innerHTML = `
    <div class="free">
      <textarea class="free__input" rows="4" maxlength="600" placeholder="${item.hint}"></textarea>
      <div class="free__foot">
        <span class="free__count">0 / 600</span>
        <button type="button" class="btn free__next" disabled>${last ? "Voir mon analyse" : "Suivant"} <span aria-hidden="true">→</span></button>
      </div>
    </div>`;

  const input = qOptions.querySelector(".free__input");
  const button = qOptions.querySelector(".free__next");
  const count = qOptions.querySelector(".free__count");
  const sync = () => {
    state.answers[item.id] = input.value;
    count.textContent = `${input.value.length} / 600`;
    button.disabled = input.value.trim().length < MIN_LENGTH;
  };
  input.value = state.answers[item.id] ?? "";
  sync();
  input.addEventListener("input", sync);
  // Ctrl/Cmd + Entrée pour passer à la question suivante
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !button.disabled) next();
  });
  button.addEventListener("click", next);

  show("question");
  input.focus({ preventScroll: true });
}

function next() {
  const item = QUESTIONS[state.path][state.step];
  state.answers[item.id] = (state.answers[item.id] ?? "").trim();
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

function renderResult() {
  const school = state.path === "school";
  resultBox.innerHTML = `
    <div>
      <p class="result__label">Dernière étape</p>
      <h3>${school ? "Ton analyse personnalisée est prête à être rédigée" : "On a tout ce qu'il faut pour te conseiller"}</h3>
      <p class="result__intro">${school
        ? "On lit tes réponses et on t'écrit une analyse sur mesure : ce qui te fait perdre du temps et des clients, et par où commencer."
        : "On lit tes réponses et on t'écrit un conseil sur mesure : le bon format de cours, le bon moment et comment progresser."}</p>
    </div>
    <div class="capture">
      <h3>${school ? "Reçois ton analyse" : "Reçois ton conseil personnalisé"}</h3>
      <p>${school ? "Les écoles pilotes utilisent Glisse gratuitement pendant toute la phase pilote." : "Tu rejoins aussi la liste d'attente : les 100 premiers inscrits ont leur premier cours offert."}</p>
      ${captureForm(school ? "Recevoir mon analyse" : "Recevoir mon conseil", school)}
      ${school && DEMO_URL ? `<p class="capture__alt">Tu préfères en parler ? <a href="${DEMO_URL}" target="_blank" rel="noopener">Réserve une démo de 15 minutes</a></p>` : ""}
    </div>
    <button type="button" class="result__restart">Refaire le test</button>`;
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
      <label class="capture__consent"><input type="checkbox" name="consent" required> J'accepte de recevoir des emails de Glisse (désinscription en un clic).</label>
      <button class="btn" type="submit">${cta}</button>
    </form>
    <p class="capture__msg" role="status" aria-live="polite"></p>`;
}

// Affiche le message personnalisé (Gemini ou texte de secours) sous le formulaire
function showMessage(box, { subject, body }) {
  const card = document.createElement("article");
  card.className = "ai-mail";
  const head = document.createElement("p");
  head.className = "ai-mail__subject";
  head.textContent = subject;
  const text = document.createElement("div");
  text.className = "ai-mail__body";
  text.textContent = body;
  card.append(head, text);
  box.append(card);
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  if (!form.elements.consent.checked) {
    msg.textContent = "Coche la case pour recevoir ton résultat par email.";
    msg.classList.add("is-error");
    return;
  }

  const list = QUESTIONS[state.path];
  const payload = {
    ...Object.fromEntries(new FormData(form)),
    consent: true,
    audience: state.path === "school" ? "ecole" : "pratiquant",
    answers: state.answers,
    // Question + réponse, pour que Gemini lise exactement ce que le visiteur a écrit
    labels: list.map((q) => ({ q: q.q, a: state.answers[q.id] })).filter((l) => l.a),
  };

  const button = form.querySelector("button");
  button.disabled = true;
  msg.textContent = "On prépare ton analyse personnalisée…";

  try {
    let message = null;
    if (FORM_ENDPOINT) {
      const res = await fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(res.statusText);
      message = (await res.json()).message ?? null;
    } else {
      console.log("Nouveau lead :", payload);
    }
    form.hidden = true;
    msg.textContent = state.path === "school"
      ? "C'est noté. Voici ton analyse personnalisée :"
      : "C'est noté, tu es sur la liste. Voici ton conseil personnalisé :";
    msg.classList.add("is-ok");
    if (message) showMessage(form.closest(".capture"), message);
  } catch {
    button.disabled = false;
    msg.textContent = "L'envoi n'a pas fonctionné, réessaie dans un instant.";
    msg.classList.add("is-error");
  }
}

/* ---------- Branchements ---------- */

quiz.querySelectorAll(".path").forEach((btn) => btn.addEventListener("click", () => start(btn.dataset.path)));
quiz.querySelector(".quiz__back").addEventListener("click", back);

// Les boutons du haut de page lancent directement le bon parcours
document.querySelectorAll("a[data-path]").forEach((link) => {
  link.addEventListener("click", () => start(link.dataset.path));
});
