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

/* ---------- Analyse personnalisée ---------- */

const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Mise en forme du texte de Gemini : titres "## ", puces "- " et **gras** seulement (le reste est échappé)
function renderAnalysis(text) {
  const inline = (t) => escapeHtml(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  let html = "";
  let list = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•] +(.*)$/);
    if (list && !bullet) {
      html += "</ul>";
      list = false;
    }
    if (!line) continue;
    if (line.startsWith("## ")) html += `<h4>${inline(line.slice(3))}</h4>`;
    else if (bullet) {
      if (!list) html += "<ul>";
      list = true;
      html += `<li>${inline(bullet[1])}</li>`;
    } else html += `<p>${inline(line)}</p>`;
  }
  return html + (list ? "</ul>" : "");
}

function reportCard(email) {
  const school = state.path === "school";
  resultBox.innerHTML = `
    <article class="report">
      <header class="report__head">
        <span class="report__badge"><span class="pulse"></span> Analyse personnalisée</span>
        <h3>${school ? "Ton diagnostic Glisse" : "Ton plan pour (enfin) aller à l'eau"}</h3>
        <p>Préparé pour ${escapeHtml(email)}, à partir de tes réponses.</p>
      </header>
      <div class="report__body" aria-live="polite">
        <div class="report__loading"><span></span><span></span><span></span> Victor lit tes réponses…</div>
      </div>
      <footer class="report__foot" hidden>
        <button type="button" class="btn btn--small report__copy">Copier mon analyse</button>
        ${navigator.share ? `<button type="button" class="btn btn--line btn--small report__share">${school ? "L'envoyer à mon équipe" : "Partager"}</button>` : ""}
        <button type="button" class="result__restart">Refaire le test</button>
      </footer>
    </article>`;
  resultBox.querySelector(".result__restart").addEventListener("click", () => show("start"));
  return resultBox.querySelector(".report");
}

// Lit le flux NDJSON de /api/lead et affiche le texte au fur et à mesure
async function streamAnalysis(res, card) {
  const body = card.querySelector(".report__body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let frame = 0;
  const paint = (done) => {
    body.innerHTML = renderAnalysis(text) + (done ? "" : '<span class="report__caret"></span>');
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.t === "text") {
        text += event.v;
        if (!frame) frame = requestAnimationFrame(() => ((frame = 0), paint(false)));
      }
      if (event.t === "end") {
        cancelAnimationFrame(frame);
        paint(true);
        return text;
      }
    }
  }
  paint(true);
  return text;
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
    msg.textContent = "Coche la case pour recevoir ton analyse.";
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

  if (!FORM_ENDPOINT) {
    console.log("Nouveau lead :", payload);
    return;
  }

  let res;
  try {
    res = await fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  } catch (err) {
    button.disabled = false;
    msg.textContent = err.message && err.message !== "Failed to fetch" ? err.message : "L'envoi n'a pas fonctionné, réessaie dans un instant.";
    msg.classList.add("is-error");
    return;
  }

  // Le lead est enregistré : on remplace le formulaire par l'analyse, écrite en direct
  const card = reportCard(payload.email);
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  let text = "";
  try {
    text = await streamAnalysis(res, card);
  } catch {
    if (!card.querySelector(".report__body p")) {
      card.querySelector(".report__body").innerHTML = "<p>Ton analyse a bien été enregistrée, mais l'affichage a été interrompu. Victor te la renvoie personnellement très vite.</p>";
    }
  }

  const foot = card.querySelector(".report__foot");
  foot.hidden = false;
  const plain = text.replace(/^## +/gm, "").replace(/\*\*/g, "");
  foot.querySelector(".report__copy").addEventListener("click", async (ev) => {
    try {
      await navigator.clipboard.writeText(plain);
      ev.currentTarget.textContent = "Copié ✓";
    } catch {
      ev.currentTarget.textContent = "Copie impossible";
    }
  });
  foot.querySelector(".report__share")?.addEventListener("click", () => {
    navigator.share({ title: "Mon diagnostic Glisse", text: plain }).catch(() => {});
  });
}

/* ---------- Branchements ---------- */

quiz.querySelectorAll(".path").forEach((btn) => btn.addEventListener("click", () => start(btn.dataset.path)));
quiz.querySelector(".quiz__back").addEventListener("click", back);

// Les boutons du haut de page lancent directement le bon parcours
document.querySelectorAll("a[data-path]").forEach((link) => {
  link.addEventListener("click", () => start(link.dataset.path));
});
