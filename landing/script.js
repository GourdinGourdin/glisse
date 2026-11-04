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
const audienceOf = (path) => (path === "school" ? "ecole" : "pratiquant");

function show(name) {
  Object.entries(screens).forEach(([key, el]) => (el.hidden = key !== name));
}

function start(path) {
  state = { path, step: 0, answers: {} };
  track("quiz_start", audienceOf(path));
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
  track("form_shown", audienceOf(state.path));
  resultBox.innerHTML = `
    <div>
      <p class="result__label">Dernière étape</p>
      <h3>${school ? "Ton analyse personnalisée est prête à être rédigée" : "On a tout ce qu'il faut pour te conseiller"}</h3>
      <p class="result__intro">${school
        ? "Une IA lit tes réponses et rédige une analyse sur mesure : ce qui te fait perdre du temps et des clients, et par où commencer. Elle s'affiche ici en quelques secondes."
        : "Une IA lit tes réponses et rédige un conseil sur mesure : le bon format de cours, le bon moment et comment progresser. Il s'affiche ici en quelques secondes."}</p>
    </div>
    <div class="capture">
      <h3>${school ? "Affiche ton analyse" : "Affiche ton conseil personnalisé"}</h3>
      <p>${school ? "Les écoles pilotes utilisent Glisse gratuitement pendant toute la phase pilote." : "Tu rejoins aussi la liste d'attente : les 100 premiers inscrits ont leur premier cours offert."}</p>
      ${captureForm(school ? "Voir mon analyse" : "Voir mon conseil", school)}
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
      <label class="capture__consent"><input type="checkbox" name="consent" required> J'accepte de recevoir des emails de Glisse (désinscription en répondant STOP).</label>
      <button class="btn" type="submit">${cta}</button>
    </form>
    <p class="capture__why">Ton email sert à t'envoyer une copie de ce résultat, une seule relance et les nouvelles de Glisse. Rien d'autre.</p>
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
        <span class="report__badge"><span class="pulse"></span> Analyse personnalisée, rédigée par IA</span>
        <h3>${school ? "Ton diagnostic Glisse" : "Ton plan pour (enfin) aller à l'eau"}</h3>
        <p>Préparé pour ${escapeHtml(email)}, à partir de tes réponses.</p>
      </header>
      <div class="report__body" aria-live="polite">
        <div class="report__loading"><span></span><span></span><span></span> Lecture de tes réponses…</div>
      </div>
      <p class="report__mail" role="status"></p>
      <footer class="report__foot" hidden>
        <button type="button" class="btn btn--small report__copy">Copier mon analyse</button>
        ${navigator.share ? `<button type="button" class="btn btn--line btn--small report__share">${school ? "L'envoyer à mon équipe" : "Partager"}</button>` : ""}
        <button type="button" class="result__restart">Refaire le test</button>
      </footer>
      <p class="report__legal">Texte généré par une IA à partir de tes réponses : à prendre comme un conseil, à vérifier avec un moniteur pour tout ce qui touche à la sécurité.</p>
    </article>`;
  resultBox.querySelector(".result__restart").addEventListener("click", () => show("start"));
  return resultBox.querySelector(".report");
}

// Lit le flux NDJSON de /api/lead et affiche le texte au fur et à mesure.
// onEnd est appelé dès que le texte est complet ; le flux reste ouvert le temps d'annoncer l'envoi de l'email.
async function streamAnalysis(res, card, onEnd) {
  const body = card.querySelector(".report__body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let frame = 0;
  let ended = false;
  const paint = (done) => {
    body.innerHTML = renderAnalysis(text) + (done ? "" : '<span class="report__caret"></span>');
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(frame);
    paint(true);
    onEnd(text);
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
      if (event.t === "end") finish();
      if (event.t === "mail") {
        const email = card.dataset.email;
        card.querySelector(".report__mail").textContent =
          event.state === "sent" ? `Une copie vient de partir vers ${email} (regarde aussi tes spams).`
          : event.state === "held" ? `Ton analyse est enregistrée : Victor te répond par email à ${email}.`
          : "";
      }
    }
  }
  if (!ended && text) finish();
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
    audience: audienceOf(state.path),
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
  card.dataset.email = payload.email;
  card.scrollIntoView({ behavior: "smooth", block: "start" });

  const showFooter = (text) => {
    track("result_shown", payload.audience);
    const foot = card.querySelector(".report__foot");
    foot.hidden = false;
    const plain = text.replace(/^## +/gm, "").replace(/\*\*/g, "");
    foot.querySelector(".report__copy").addEventListener("click", async (ev) => {
      const target = ev.currentTarget;
      try {
        await navigator.clipboard.writeText(plain);
        target.textContent = "Copié ✓";
      } catch {
        target.textContent = "Copie impossible";
      }
    });
    foot.querySelector(".report__share")?.addEventListener("click", () => {
      navigator.share({ title: "Mon diagnostic Glisse", text: plain }).catch(() => {});
    });
  };

  try {
    const text = await streamAnalysis(res, card, showFooter);
    if (!text) throw new Error("vide");
  } catch {
    if (!card.querySelector(".report__body p")) {
      card.querySelector(".report__body").innerHTML = "<p>Tes réponses sont bien enregistrées, mais l'affichage a été interrompu. Victor te répond personnellement par email très vite.</p>";
      card.querySelector(".report__foot").hidden = false;
    }
  }
}

/* ---------- Branchements ---------- */

quiz.querySelectorAll(".path").forEach((btn) => btn.addEventListener("click", () => start(btn.dataset.path)));
quiz.querySelector(".quiz__back").addEventListener("click", back);

// Les boutons du haut de page lancent directement le bon parcours
document.querySelectorAll("a[data-path]").forEach((link) => {
  link.addEventListener("click", () => start(link.dataset.path));
});
