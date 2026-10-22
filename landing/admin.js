// CRM Glisse : leads du quiz, prospection des écoles, actions à faire.
// Toutes les données passent par /api/admin/* : le navigateur ne parle jamais à Supabase.

const STATUS = {
  new: { label: "Nouveau", tone: "blue" },
  contacted: { label: "Contacté", tone: "teal" },
  followed_up: { label: "Relancé", tone: "teal" },
  replied: { label: "A répondu", tone: "sun" },
  meeting: { label: "RDV", tone: "coral" },
  won: { label: "Gagné", tone: "green" },
  lost: { label: "Perdu", tone: "grey" },
};

const P_STATUS = {
  to_contact: { label: "À contacter", tone: "blue" },
  contacted: { label: "Contactée", tone: "teal" },
  interested: { label: "Intéressée", tone: "sun" },
  pilot: { label: "École pilote", tone: "green" },
  not_interested: { label: "Pas intéressée", tone: "grey" },
};

const ACTIVITY = {
  call: "Appel",
  email: "Email envoyé",
  message: "Message (SMS, WhatsApp, réseaux)",
  meeting: "Rendez-vous",
  note: "Note",
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const euro = (n) => Number(n).toLocaleString("fr-FR") + " €";

/* ---------- Dates (jours locaux au format AAAA-MM-JJ) ---------- */

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => ymd(new Date());
const plusDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const dayLabel = (s) => {
  if (!s) return "";
  if (s === today()) return "Aujourd'hui";
  if (s === plusDays(1)) return "Demain";
  if (s === plusDays(-1)) return "Hier";
  return new Date(`${s}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
};
const ago = (d) => {
  if (!d) return "—";
  const h = (Date.now() - new Date(d)) / 36e5;
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${Math.floor(h)} h`;
  if (h < 24 * 30) return `il y a ${Math.floor(h / 24)} j`;
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};
const when = (d) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function nextBadge(rec) {
  if (!rec.next_action_at) return `<span class="muted">—</span>`;
  const late = rec.next_action_at < today();
  const now = rec.next_action_at === today();
  return `<span class="due${late ? " due--late" : now ? " due--today" : ""}" title="${esc(rec.next_action ?? "")}">${dayLabel(rec.next_action_at)}${rec.next_action ? ` · ${esc(rec.next_action)}` : ""}</span>`;
}

/* ---------- État ---------- */

let leads = [];
let prospects = [];
let tab = "leads";
let view = "table";
let open = null; // { kind: "lead" | "prospect", id }
let pLimit = 200;

/* ---------- Lecture des réponses du quiz ---------- */

function label(audience, id, value) {
  const list = QUESTIONS[audience === "ecole" ? "school" : "rider"];
  const opt = list.find((x) => x.id === id)?.options?.find((o) => o.value === value);
  return opt ? opt.label : value;
}

// Score de priorité sur 100 : à qui écrire ou téléphoner en premier
// Leads aux réponses libres : score donné par Gemini. Anciens leads (choix multiples) : calcul d'origine.
function priority(lead) {
  if (lead.ai_priority != null) return lead.ai_priority;
  const a = lead.answers ?? {};
  if (!a.tool && !a.goal) return 50;
  let p = 0;
  if (lead.audience === "ecole") {
    p += { paper: 30, phone: 30, sheet: 20, software: 0 }[a.tool] ?? 0;
    p += { 40: 20, 22: 15, 10: 8, 3: 2 }[a.calls] ?? 0;
    const rev = a.result?.revenue ?? 0;
    p += rev >= 15000 ? 30 : rev >= 7000 ? 22 : rev >= 3000 ? 12 : 4;
    p += { 75: 10, 45: 8, 20: 4, 6: 0 }[a.courses] ?? 0;
    if (lead.school) p += 10;
  } else {
    p += { camp: 40, regular: 35, level: 25, try: 15 }[a.goal] ?? 0;
    p += { camp: 25, private: 20, group: 10, any: 10 }[a.format] ?? 0;
    p += (a.sessions ?? 0) * 5 + 10;
  }
  return Math.min(100, p);
}

const heat = (p) => (p >= 65 ? "hot" : p >= 40 ? "warm" : "cold");
const HEAT = { hot: "Chaud", warm: "Tiède", cold: "Froid" };

function summary(lead) {
  if (lead.ai_summary) return lead.ai_summary;
  const r = lead.answers?.result ?? {};
  if (lead.audience === "ecole") return r.revenue ? `${euro(r.revenue)} récupérables · ${r.hours ?? "?"} h/sem` : "—";
  return r.level ? `${r.level} · ${r.formatName ?? ""}` : "—";
}

const leadName = (l) => l.school || l.name || l.email;
const place = (p) => [p.city, p.departement && DEPTS[p.departement] ? `${DEPTS[p.departement]} (${p.departement})` : null].filter(Boolean).join(" · ") || "—";

/* ---------- API ---------- */

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    credentials: "same-origin",
  });
  if (res.status === 401 && !path.endsWith("/login")) {
    showLogin();
    throw new Error("Session expirée, reconnecte-toi");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data;
}
const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
const patch = (path, body) => api(path, { method: "PATCH", body: JSON.stringify(body) });

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast is-on${isError ? " is-error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = "toast"), isError ? 4500 : 2600);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast("Copié dans le presse-papiers");
}

const mailto = (to, subject, body) => `mailto:${encodeURIComponent(to ?? "")}?subject=${encodeURIComponent(subject ?? "")}&body=${encodeURIComponent(body ?? "")}`;
const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;

/* ---------- Connexion ---------- */

function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#password").focus();
}

$("#login form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $(".login__msg");
  const btn = $("#login button");
  msg.textContent = "";
  btn.disabled = true;
  try {
    await post("/api/admin/login", { password: $("#password").value });
    $("#password").value = "";
    $("#login").hidden = true;
    await load();
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$("#logout").addEventListener("click", async () => {
  await api("/api/admin/login", { method: "DELETE" }).catch(() => {});
  closeDrawer();
  showLogin();
});

/* ---------- Chargement ---------- */

async function load() {
  try {
    const [l, p] = await Promise.all([api("/api/admin/leads"), api("/api/admin/prospects")]);
    leads = l.leads.map(withPriority);
    prospects = p.prospects;
    $("#app").hidden = false;
    render();
  } catch (err) {
    if (!/Session/.test(err.message)) toast(err.message, true);
  }
}
const withPriority = (l) => ({ ...l, priority: priority(l) });

$("#refresh").addEventListener("click", async () => {
  await load();
  if (open) openRecord(open.kind, open.id);
  toast("Données à jour");
});

/* ---------- Onglets ---------- */

function setTab(name) {
  tab = name;
  $$(".tab").forEach((b) => b.classList.toggle("is-on", b.dataset.tab === name));
  ["todo", "leads", "prospects"].forEach((t) => ($(`#tab-${t}`).hidden = t !== name));
  $("#export").hidden = name === "todo";
  render();
  try {
    localStorage.setItem("glisse-crm-tab", name);
  } catch {}
}
$$(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

$$(".views__btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    view = btn.dataset.view;
    $$(".views__btn").forEach((b) => b.classList.toggle("is-on", b === btn));
    $("#view-table").hidden = view !== "table";
    $("#view-board").hidden = view !== "board";
    render();
  })
);

/* ---------- Filtres ---------- */

Object.entries(STATUS).forEach(([k, s]) => $("#f-status").insertAdjacentHTML("beforeend", `<option value="${k}">${s.label}</option>`));
Object.entries(P_STATUS).forEach(([k, s]) => $("#p-status").insertAdjacentHTML("beforeend", `<option value="${k}">${s.label}</option>`));
Object.entries(REGIONS).forEach(([k, r]) => {
  $("#f-region").insertAdjacentHTML("beforeend", `<option value="${k}">${r.name}</option>`);
  $("#p-region").insertAdjacentHTML("beforeend", `<option value="${k}">${k === "other" ? "Intérieur et autres" : r.name}</option>`);
});
Object.entries(DEPTS).forEach(([k, n]) => $("#add-dept").insertAdjacentHTML("beforeend", `<option value="${k}">${k} · ${esc(n)}</option>`));

["#search", "#f-audience", "#f-status", "#f-region", "#f-sort"].forEach((s) => $(s).addEventListener("input", render));
["#p-search", "#p-status", "#p-region", "#p-sport", "#p-contact", "#p-sort"].forEach((s) =>
  $(s).addEventListener("input", () => {
    pLimit = 200;
    render();
  })
);

const byNext = (a, b) => (a.next_action_at ?? "9999") .localeCompare(b.next_action_at ?? "9999");
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function filteredLeads() {
  const q = norm($("#search").value.trim());
  const aud = $("#f-audience").value;
  const st = $("#f-status").value;
  const reg = $("#f-region").value;
  const list = leads.filter(
    (l) =>
      (!aud || l.audience === aud) &&
      (!st || l.status === st) &&
      (!reg || l.answers?.region === reg) &&
      (!q || [l.email, l.school, l.name, l.notes, l.next_action].some((v) => norm(v).includes(q)))
  );
  const byDate = (a, b) => new Date(b.created_at) - new Date(a.created_at);
  const sort = $("#f-sort").value;
  return list.sort(sort === "priority" ? (a, b) => b.priority - a.priority || byDate(a, b) : sort === "next" ? (a, b) => byNext(a, b) || byDate(a, b) : byDate);
}

function filteredProspects() {
  const q = norm($("#p-search").value.trim());
  const st = $("#p-status").value;
  const reg = $("#p-region").value;
  const sp = $("#p-sport").value;
  const ct = $("#p-contact").value;
  const list = prospects.filter(
    (p) =>
      (!st || p.status === st) &&
      (!reg || p.region === reg) &&
      (!sp || p.sport === sp) &&
      (!ct || (ct === "none" ? !p.email && !p.phone : p[ct])) &&
      (!q || [p.name, p.city, p.email, p.website, p.notes, DEPTS[p.departement], p.departement].some((v) => norm(v).includes(q)))
  );
  const sort = $("#p-sort").value;
  const sorters = {
    fit: (a, b) => b.fit - a.fit || a.name.localeCompare(b.name, "fr"),
    next: (a, b) => byNext(a, b) || b.fit - a.fit,
    last: (a, b) => (b.last_contact_at ?? "").localeCompare(a.last_contact_at ?? ""),
    name: (a, b) => a.name.localeCompare(b.name, "fr"),
  };
  return list.sort(sorters[sort]);
}

/* ---------- Rendu ---------- */

function render() {
  renderTodoCount();
  if (tab === "leads") renderLeads();
  else if (tab === "prospects") renderProspects();
  else renderTodo();
}

const pill = (map, status) => `<span class="pill pill--${map[status].tone}">${map[status].label}</span>`;
const score = (p, title) => `<span class="score score--${heat(p)}" title="${title ?? HEAT[heat(p)]}">${p}</span>`;
const tag = (l) => `<span class="tag tag--${l.audience}">${l.audience === "ecole" ? "École" : "Pratiquant"}</span>`;
const who = (l) => `<b>${esc(leadName(l))}</b>${l.school || l.name ? `<small>${esc(l.email)}</small>` : ""}`;

function kpis(target, cards) {
  $(target).innerHTML = cards.map((c) => `<div class="kpi${c.hot ? " kpi--hot" : ""}"><b>${c.n}</b><span>${c.l}</span></div>`).join("");
}

// Entonnoir : combien de fiches ont atteint chaque étape, et le taux de passage
function funnel(target, steps, records, lostKey) {
  const order = steps.map((s) => s.key);
  const reached = steps.map((s, i) => records.filter((r) => s.match(r, order)).length);
  const lost = records.filter((r) => r.status === lostKey).length;
  $(target).innerHTML =
    steps
      .map((s, i) => {
        const rate = i && reached[i - 1] ? Math.round((reached[i] / reached[i - 1]) * 100) : null;
        const width = records.length ? Math.max(4, (reached[i] / records.length) * 100) : 0;
        return `<div class="funnel__step">
          <div class="funnel__top"><span>${s.label}</span>${rate !== null ? `<em>${rate} %</em>` : ""}</div>
          <b>${reached[i]}</b>
          <div class="funnel__bar"><i style="width:${width}%"></i></div>
        </div>`;
      })
      .join("") + `<div class="funnel__step funnel__step--lost"><div class="funnel__top"><span>${lostKey === "lost" ? "Perdus" : "Pas intéressées"}</span></div><b>${lost}</b></div>`;
}

function renderLeads() {
  const week = Date.now() - 7 * 864e5;
  const schools = leads.filter((l) => l.audience === "ecole");
  const open = leads.filter((l) => !["won", "lost"].includes(l.status));
  kpis("#kpis", [
    { n: leads.length, l: "leads au total" },
    { n: leads.filter((l) => new Date(l.created_at) > week).length, l: "cette semaine" },
    { n: schools.length, l: "écoles" },
    { n: leads.length - schools.length, l: "pratiquants" },
    { n: open.filter((l) => heat(l.priority) === "hot").length, l: "leads chauds en cours", hot: true },
    { n: leads.filter((l) => l.status === "new").length, l: "jamais contactés" },
    { n: leads.filter((l) => l.status === "meeting").length, l: "RDV" },
    { n: leads.filter((l) => l.status === "won").length, l: "gagnés" },
  ]);

  // Une fiche « atteint » une étape si son statut est à cette étape ou plus loin (les perdus sont comptés à part)
  const rank = { new: 0, contacted: 1, followed_up: 1, replied: 2, meeting: 3, won: 4 };
  const reach = (min) => (r) => r.status !== "lost" && rank[r.status] >= min;
  funnel("#funnel", [
    { key: "new", label: "Leads", match: (r) => r.status !== "lost" },
    { key: "contacted", label: "Contactés", match: reach(1) },
    { key: "replied", label: "Ont répondu", match: reach(2) },
    { key: "meeting", label: "RDV", match: reach(3) },
    { key: "won", label: "Gagnés", match: reach(4) },
  ], leads, "lost");

  const list = filteredLeads();
  $("#empty").hidden = list.length > 0;
  if (view === "table") renderLeadTable(list);
  else renderBoard(list);
}

function renderLeadTable(list) {
  $("#rows").innerHTML = list
    .map((l) => {
      const a = l.answers ?? {};
      return `<tr data-kind="lead" data-id="${l.id}" tabindex="0">
        <td>${score(l.priority)}</td>
        <td class="who">${who(l)}</td>
        <td>${tag(l)}</td>
        <td>${esc(SPORT_NAMES[a.sport] ?? "—")} · ${esc(REGIONS[a.region]?.name ?? "—")}</td>
        <td class="muted">${esc(summary(l))}</td>
        <td>${pill(STATUS, l.status)}</td>
        <td>${nextBadge(l)}</td>
        <td class="muted">${ago(l.created_at)}</td>
      </tr>`;
    })
    .join("");
}

function renderBoard(list) {
  $("#view-board").innerHTML = Object.entries(STATUS)
    .map(([key, s]) => {
      const col = list.filter((l) => l.status === key);
      return `<div class="col" data-status="${key}">
        <h3><span class="dot dot--${s.tone}"></span>${s.label}<em>${col.length}</em></h3>
        <div class="col__cards">${col
          .map(
            (l) => `<article class="card" draggable="true" data-kind="lead" data-id="${l.id}" tabindex="0">
              <div class="card__top">${score(l.priority)}${tag(l)}</div>
              <p class="who">${who(l)}</p>
              <p class="muted">${esc(summary(l))}</p>
              ${l.next_action_at ? `<p>${nextBadge(l)}</p>` : ""}
            </article>`
          )
          .join("")}</div>
      </div>`;
    })
    .join("");
}

function contactIcons(p) {
  return `<span class="icons">
    <span class="ic${p.email ? " is-on" : ""}" title="${p.email ? esc(p.email) : "Pas d'email"}">✉</span>
    <span class="ic${p.phone ? " is-on" : ""}" title="${p.phone ? esc(p.phone) : "Pas de téléphone"}">☎</span>
    <span class="ic${p.website ? " is-on" : ""}" title="${p.website ? esc(p.website) : "Pas de site"}">⌂</span>
  </span>`;
}

function renderProspects() {
  const due = prospects.filter((p) => p.next_action_at && p.next_action_at <= today() && !["pilot", "not_interested"].includes(p.status));
  kpis("#p-kpis", [
    { n: prospects.length, l: "écoles en base" },
    { n: prospects.filter((p) => p.status === "to_contact").length, l: "à contacter" },
    { n: prospects.filter((p) => p.status === "to_contact" && p.fit >= 70).length, l: "à contacter, score ≥ 70", hot: true },
    { n: prospects.filter((p) => p.email).length, l: "avec email" },
    { n: due.length, l: "relances dues" },
    { n: prospects.filter((p) => p.status === "interested").length, l: "intéressées" },
    { n: prospects.filter((p) => p.status === "pilot").length, l: "écoles pilotes" },
  ]);

  const rank = { to_contact: 0, contacted: 1, interested: 2, pilot: 3 };
  const reach = (min) => (r) => r.status !== "not_interested" && rank[r.status] >= min;
  funnel("#p-funnel", [
    { key: "to_contact", label: "Écoles", match: (r) => r.status !== "not_interested" },
    { key: "contacted", label: "Contactées", match: reach(1) },
    { key: "interested", label: "Intéressées", match: reach(2) },
    { key: "pilot", label: "Pilotes", match: reach(3) },
  ], prospects, "not_interested");

  const list = filteredProspects();
  $("#p-empty").hidden = list.length > 0;
  $("#p-rows").innerHTML = list
    .slice(0, pLimit)
    .map(
      (p) => `<tr data-kind="prospect" data-id="${p.id}" tabindex="0">
        <td>${score(p.fit, "Score d'adéquation")}</td>
        <td class="who"><b>${esc(p.name)}</b><small>${esc(place(p))}</small></td>
        <td>${esc(SPORT_NAMES[p.sport] ?? "—")}</td>
        <td>${contactIcons(p)}</td>
        <td>${pill(P_STATUS, p.status)}${p.lead_id ? ` <span class="linked" title="A fait le quiz">quiz ✓</span>` : ""}</td>
        <td>${nextBadge(p)}</td>
        <td class="muted">${ago(p.last_contact_at)}</td>
      </tr>`
    )
    .join("");
  const more = $("#p-more");
  more.hidden = list.length <= pLimit;
  more.textContent = `Afficher plus (${list.length - pLimit} restantes)`;
}
$("#p-more").addEventListener("click", () => {
  pLimit += 200;
  renderProspects();
});

/* ---------- À faire ---------- */

function todoItems() {
  const items = [];
  for (const l of leads) {
    if (["won", "lost"].includes(l.status)) continue;
    if (l.next_action_at) items.push({ kind: "lead", rec: l, date: l.next_action_at });
  }
  for (const p of prospects) {
    if (["pilot", "not_interested"].includes(p.status)) continue;
    if (p.next_action_at) items.push({ kind: "prospect", rec: p, date: p.next_action_at });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

function renderTodoCount() {
  const n = todoItems().filter((i) => i.date <= today()).length;
  $("#todo-count").textContent = n || "";
}

function todoRow(i) {
  const r = i.rec;
  const isLead = i.kind === "lead";
  return `<li class="todo__item" data-kind="${i.kind}" data-id="${r.id}" tabindex="0">
    ${isLead ? score(r.priority) : score(r.fit, "Score d'adéquation")}
    <div class="who"><b>${esc(isLead ? leadName(r) : r.name)}</b><small>${isLead ? (r.audience === "ecole" ? "Lead école" : "Lead pratiquant") : `Prospection · ${esc(place(r))}`}</small></div>
    <div class="todo__what">${esc(r.next_action || "Faire le point")}</div>
    ${nextBadge(r)}
    <div class="todo__actions">
      <button type="button" class="mini-btn" data-done="${i.kind}:${r.id}" title="Marquer comme fait">✓ Fait</button>
      <button type="button" class="mini-btn" data-snooze="${i.kind}:${r.id}" title="Reporter à demain">Demain</button>
    </div>
  </li>`;
}

function renderTodo() {
  const items = todoItems();
  const t = today();
  const week = plusDays(7);
  const groups = [
    { title: "En retard", cls: "late", list: items.filter((i) => i.date < t) },
    { title: "Aujourd'hui", cls: "today", list: items.filter((i) => i.date === t) },
    { title: "7 prochains jours", cls: "", list: items.filter((i) => i.date > t && i.date <= week) },
  ];

  // Suggestions : leads chauds jamais contactés et meilleures écoles à contacter, sans action prévue
  const hotLeads = leads.filter((l) => l.status === "new" && !l.next_action_at).sort((a, b) => b.priority - a.priority).slice(0, 5);
  const bestSchools = prospects.filter((p) => p.status === "to_contact" && !p.next_action_at && (p.email || p.phone)).sort((a, b) => b.fit - a.fit).slice(0, 8);

  const html = groups
    .filter((g) => g.list.length)
    .map((g) => `<section class="todo__group todo__group--${g.cls}"><h2>${g.title} <em>${g.list.length}</em></h2><ul>${g.list.map(todoRow).join("")}</ul></section>`)
    .join("");

  const suggest = (title, hint, rows) =>
    rows.length
      ? `<section class="todo__group"><h2>${title}</h2><p class="muted todo__hint">${hint}</p><ul>${rows.join("")}</ul></section>`
      : "";

  $("#todo").innerHTML =
    (html || `<div class="todo__empty"><b>Rien de prévu.</b><span>Planifie une prochaine action depuis la fiche d'un lead ou d'une école : elle apparaîtra ici le jour venu.</span></div>`) +
    suggest(
      "Leads à contacter en priorité",
      "Arrivés par le quiz, jamais contactés.",
      hotLeads.map((l) => `<li class="todo__item" data-kind="lead" data-id="${l.id}" tabindex="0">${score(l.priority)}<div class="who"><b>${esc(leadName(l))}</b><small>${esc(summary(l))}</small></div><div class="todo__what">${ago(l.created_at)}</div><span></span><div class="todo__actions"></div></li>`)
    ) +
    suggest(
      "Écoles à démarcher",
      "Les meilleurs scores avec un email ou un téléphone.",
      bestSchools.map((p) => `<li class="todo__item" data-kind="prospect" data-id="${p.id}" tabindex="0">${score(p.fit, "Score d'adéquation")}<div class="who"><b>${esc(p.name)}</b><small>${esc(place(p))}</small></div><div class="todo__what">${contactIcons(p)}</div><span></span><div class="todo__actions"></div></li>`)
    );
}

// « Fait » efface la prochaine action et l'ajoute au journal ; « Demain » la reporte
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-done], [data-snooze]");
  if (!btn) return;
  e.stopPropagation();
  const [kind, id] = (btn.dataset.done ?? btn.dataset.snooze).split(":");
  const rec = (kind === "lead" ? leads : prospects).find((r) => r.id === id);
  btn.disabled = true;
  try {
    if (btn.dataset.done) {
      await post("/api/admin/activities", { [`${kind}_id`]: id, type: "note", body: `Fait : ${rec.next_action || "action prévue"}`, next_action_at: null, next_action: null });
      updateLocal(kind, { id, next_action_at: null, next_action: null });
      toast("Action terminée");
    } else {
      await saveRecord(kind, id, { next_action_at: plusDays(1) });
      toast("Reporté à demain");
    }
    render();
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
  }
});

/* ---------- Ouvrir une fiche ---------- */

document.addEventListener("click", (e) => {
  if (e.target.closest("button, a, input, select, textarea, label")) return;
  const row = e.target.closest("[data-kind][data-id]");
  if (row && !row.closest("#drawer")) openRecord(row.dataset.kind, row.dataset.id);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.querySelector("dialog[open]")) closeDrawer();
  if (e.key === "/" && !e.target.closest("input, textarea, select")) {
    e.preventDefault();
    (tab === "prospects" ? $("#p-search") : tab === "leads" ? $("#search") : null)?.focus();
  }
  const row = e.target.closest?.("[data-kind][data-id]");
  if (row && e.key === "Enter" && !row.closest("#drawer") && e.target === row) openRecord(row.dataset.kind, row.dataset.id);
});

function showDrawer() {
  $("#scrim").hidden = false;
  $("#drawer").classList.add("is-open");
  $("#drawer").setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  open = null;
  $("#scrim").hidden = true;
  $("#drawer").classList.remove("is-open");
  $("#drawer").setAttribute("aria-hidden", "true");
}
$("#close").addEventListener("click", closeDrawer);
$("#scrim").addEventListener("click", closeDrawer);

async function openRecord(kind, id) {
  open = { kind, id };
  const list = kind === "lead" ? leads : prospects;
  const rec = list.find((r) => r.id === id);
  if (!rec) return;
  if (kind === "lead") renderLeadDetail(rec);
  else renderProspectDetail(rec);
  showDrawer();
  await refreshExtras(kind, id);
}

// Historique et fiche reliée, chargés après l'ouverture : seuls ces blocs sont mis à jour,
// pour ne rien effacer de ce que tu as commencé à saisir dans la fiche
async function refreshExtras(kind, id) {
  try {
    const data = await api(`/api/admin/${kind === "lead" ? "leads" : "prospects"}?id=${encodeURIComponent(id)}`);
    if (open?.id !== id) return;
    const rec = kind === "lead" ? withPriority(data.lead) : data.prospect;
    updateLocal(kind, rec);
    $("#d-history").outerHTML = timeline(data.activities, data.emails ?? []);
    const linked = $("#d-linked");
    if (kind === "lead" && data.prospect) linked.innerHTML = `<button type="button" class="linked" data-open="prospect:${data.prospect.id}">Fiche prospection →</button>`;
    if (kind === "prospect" && rec.lead) linked.innerHTML = `<button type="button" class="linked" data-open="lead:${rec.lead.id}">A fait le quiz →</button>`;
    bindHistory(kind, id);
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------- Modifications ---------- */

function updateLocal(kind, rec) {
  if (kind === "lead") {
    const i = leads.findIndex((l) => l.id === rec.id);
    if (i >= 0) leads[i] = withPriority({ ...leads[i], ...rec });
  } else {
    const i = prospects.findIndex((p) => p.id === rec.id);
    if (i >= 0) prospects[i] = { ...prospects[i], ...rec };
  }
}

async function saveRecord(kind, id, fields) {
  const path = kind === "lead" ? "/api/admin/leads" : "/api/admin/prospects";
  const data = await patch(path, { id, ...fields });
  const rec = data.lead ?? data.prospect;
  updateLocal(kind, rec);
  render();
  return rec;
}

async function setStatus(kind, id, status) {
  const rec = (kind === "lead" ? leads : prospects).find((r) => r.id === id);
  if (!rec || rec.status === status) return;
  try {
    const saved = await saveRecord(kind, id, { status });
    toast(`Statut : ${(kind === "lead" ? STATUS : P_STATUS)[status].label}`);
    if (open?.id === id) syncHead(kind, saved);
  } catch (err) {
    toast(err.message, true);
  }
}

// Glisser une carte du pipeline dans une autre colonne change son statut
const board = $("#view-board");
board.addEventListener("dragstart", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  e.dataTransfer.setData("text/plain", card.dataset.id);
  card.classList.add("is-dragging");
});
board.addEventListener("dragend", (e) => e.target.closest(".card")?.classList.remove("is-dragging"));
board.addEventListener("dragover", (e) => {
  const col = e.target.closest(".col");
  if (!col) return;
  e.preventDefault();
  $$(".col", board).forEach((c) => c.classList.toggle("is-over", c === col));
});
board.addEventListener("dragleave", (e) => {
  if (!board.contains(e.relatedTarget)) $$(".col", board).forEach((c) => c.classList.remove("is-over"));
});
board.addEventListener("drop", (e) => {
  const col = e.target.closest(".col");
  $$(".col", board).forEach((c) => c.classList.remove("is-over"));
  if (!col) return;
  e.preventDefault();
  setStatus("lead", e.dataTransfer.getData("text/plain"), col.dataset.status);
});

/* ---------- Blocs communs des fiches ---------- */

function statusBlock(map, current) {
  return `<div class="d__block"><h4>Statut</h4><div class="d__status">${Object.entries(map)
    .map(([k, s]) => `<button type="button" class="chip-status${k === current ? " is-on" : ""}" data-status="${k}"><span class="dot dot--${s.tone}"></span>${s.label}</button>`)
    .join("")}</div></div>`;
}

function nextBlock(rec) {
  return `<div class="d__block">
    <h4>Prochaine action</h4>
    <div class="d__next">
      <input type="text" id="d-next" maxlength="200" placeholder="Ex. : rappeler après 17h, envoyer la démo…" value="${esc(rec.next_action ?? "")}">
      <input type="date" id="d-next-at" value="${esc(rec.next_action_at ?? "")}">
    </div>
    <div class="d__quick">
      <button type="button" class="mini-btn" data-in="1">Demain</button>
      <button type="button" class="mini-btn" data-in="3">Dans 3 jours</button>
      <button type="button" class="mini-btn" data-in="7">Dans 1 semaine</button>
      <button type="button" class="mini-btn" data-in="clear">Effacer</button>
      <span class="d__saved muted" id="d-next-saved"></span>
    </div>
  </div>`;
}

function logBlock() {
  return `<div class="d__block">
    <h4>Ajouter au journal</h4>
    <form class="d__log" id="d-log">
      <select name="type">${Object.entries(ACTIVITY).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <textarea name="body" rows="2" placeholder="Ce qui s'est dit, ce qui est prévu…" maxlength="5000"></textarea>
      <label class="d__check"><input type="checkbox" name="follow" checked> Relancer dans <input type="number" name="days" value="3" min="1" max="60"> jours</label>
      <button class="btn btn--small" type="submit">Enregistrer</button>
    </form>
  </div>`;
}

function timeline(activities, emails = []) {
  const items = [
    ...activities.map((a) => ({ at: a.created_at, html: `<li class="ev ev--${a.type}"><div><b>${ACTIVITY[a.type]}</b><time>${when(a.created_at)}</time><button type="button" class="ev__del" data-del-activity="${a.id}" title="Supprimer">×</button></div>${a.body ? `<p>${esc(a.body)}</p>` : ""}</li>` })),
    ...emails.map((m) => ({ at: m.sent_at, html: `<li class="ev ev--mail-${m.direction}"><div><b>${m.direction === "in" ? "Email reçu" : "Email automatique"}</b> · ${esc(m.subject ?? "")}<time>${when(m.sent_at)}</time></div><p>${esc((m.body ?? "").slice(0, 600))}</p></li>` })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  return `<div class="d__block" id="d-history"><h4>Historique</h4>${items.length ? `<ul class="timeline">${items.map((i) => i.html).join("")}</ul>` : `<p class="muted">Rien pour l'instant.</p>`}</div>`;
}

function templatesBlock(tpls, to, kind, id) {
  const keys = Object.keys(tpls);
  return `<div class="d__block">
    <h4>Messages prêts à envoyer</h4>
    <div class="tpl__tabs">${keys.map((k, i) => `<button type="button" class="tpl__tab${i ? "" : " is-on"}" data-tpl="${k}">${tpls[k].label}</button>`).join("")}</div>
    ${keys
      .map(
        (k, i) => `<div class="tpl" data-tpl-panel="${k}"${i ? " hidden" : ""}>
          ${tpls[k].subject ? `<p class="tpl__subject"><span>Objet</span>${esc(tpls[k].subject)}</p>` : ""}
          <textarea class="tpl__body" rows="10">${esc(tpls[k].body)}</textarea>
          <div class="tpl__actions">
            ${tpls[k].subject ? `<button type="button" class="btn btn--small" data-mail="${k}"${to ? "" : " disabled title=\"Ajoute d'abord un email\""}>Ouvrir dans ma messagerie</button>` : ""}
            <button type="button" class="ghost ghost--dark" data-copy="${k}">Copier</button>
            ${tpls[k].subject ? `<button type="button" class="ghost ghost--dark" data-logsent="${k}">Noter comme envoyé</button>` : ""}
          </div>
        </div>`
      )
      .join("")}
  </div>`;
}

function syncHead(kind, rec) {
  $$("#detail .chip-status[data-status]").forEach((b) => b.classList.toggle("is-on", b.dataset.status === rec.status));
  if ("next_action_at" in rec && $("#d-next-at")) $("#d-next-at").value = rec.next_action_at ?? "";
  if ("next_action" in rec && $("#d-next") && document.activeElement !== $("#d-next")) $("#d-next").value = rec.next_action ?? "";
}

function bindCommon(kind, rec, tpls, to) {
  const root = $("#detail");
  $$(".chip-status", root).forEach((b) => b.addEventListener("click", () => setStatus(kind, rec.id, b.dataset.status)));

  // Prochaine action : enregistrée automatiquement
  let timer;
  const saveNext = (fields) => {
    clearTimeout(timer);
    $("#d-next-saved").textContent = "…";
    timer = setTimeout(async () => {
      try {
        await saveRecord(kind, rec.id, fields ?? { next_action: $("#d-next").value, next_action_at: $("#d-next-at").value || null });
        $("#d-next-saved").textContent = "Enregistré ✓";
      } catch (err) {
        $("#d-next-saved").textContent = err.message;
      }
    }, fields ? 0 : 700);
  };
  $("#d-next").addEventListener("input", () => saveNext());
  $("#d-next-at").addEventListener("change", () => saveNext());
  $$("[data-in]", root).forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.in === "clear") {
        $("#d-next").value = "";
        $("#d-next-at").value = "";
        return saveNext({ next_action: null, next_action_at: null });
      }
      $("#d-next-at").value = plusDays(Number(b.dataset.in));
      saveNext({ next_action: $("#d-next").value || null, next_action_at: $("#d-next-at").value });
    })
  );

  // Journal
  $("#d-log").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const follow = f.follow.checked;
    const body = { [`${kind}_id`]: rec.id, type: f.type.value, body: f.body.value };
    if (follow) {
      body.next_action_at = plusDays(Math.max(1, Math.min(60, Number(f.days.value) || 3)));
      body.next_action = $("#d-next").value || "Relancer";
    }
    const btn = $("button[type=submit]", f);
    btn.disabled = true;
    try {
      const data = await post("/api/admin/activities", body);
      if (data.record) {
        updateLocal(kind, data.record);
        syncHead(kind, data.record);
      }
      f.body.value = "";
      toast("Ajouté au journal");
      render();
      await refreshExtras(kind, rec.id);
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  // Modèles de messages
  if (!tpls) return;
  $$(".tpl__tab", root).forEach((t) =>
    t.addEventListener("click", () => {
      $$(".tpl__tab", root).forEach((x) => x.classList.toggle("is-on", x === t));
      $$("[data-tpl-panel]", root).forEach((p) => (p.hidden = p.dataset.tplPanel !== t.dataset.tpl));
    })
  );
  const bodyOf = (k) => $(`[data-tpl-panel="${k}"] .tpl__body`, root).value;
  $$("[data-copy]", root).forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.copy;
      copy(tpls[k].subject ? `Objet : ${tpls[k].subject}\n\n${bodyOf(k)}` : bodyOf(k));
    })
  );
  $$("[data-mail]", root).forEach((b) => b.addEventListener("click", () => (location.href = mailto(to, tpls[b.dataset.mail].subject, bodyOf(b.dataset.mail)))));
  $$("[data-logsent]", root).forEach((b) =>
    b.addEventListener("click", async () => {
      const k = b.dataset.logsent;
      b.disabled = true;
      try {
        const data = await post("/api/admin/activities", {
          [`${kind}_id`]: rec.id,
          type: "email",
          body: `${tpls[k].label} : ${tpls[k].subject}`,
          next_action_at: plusDays(k === "followup" ? 7 : 4),
          next_action: k === "followup" ? "Dernière relance ou clore" : "Relancer si pas de réponse",
        });
        if (data.record) {
          updateLocal(kind, data.record);
          syncHead(kind, data.record);
        }
        toast("Envoi noté, relance planifiée");
        render();
        await refreshExtras(kind, rec.id);
      } catch (err) {
        toast(err.message, true);
      } finally {
        b.disabled = false;
      }
    })
  );
}

function bindHistory(kind, id) {
  $$("#d-history [data-del-activity]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Supprimer cette entrée du journal ?")) return;
      try {
        await api(`/api/admin/activities?id=${encodeURIComponent(b.dataset.delActivity)}`, { method: "DELETE" });
        refreshExtras(kind, id);
      } catch (err) {
        toast(err.message, true);
      }
    })
  );
}

// Boutons qui ouvrent la fiche reliée (lead ↔ école)
document.addEventListener("click", (e) => {
  const b = e.target.closest("#detail [data-open]");
  if (!b) return;
  const [kind, id] = b.dataset.open.split(":");
  openRecord(kind, id);
});

const loadingHistory = `<div class="d__block" id="d-history"><h4>Historique</h4><p class="muted">Chargement…</p></div>`;

/* ---------- Fiche lead ---------- */

function renderLeadDetail(lead) {
  const a = lead.answers ?? {};
  const r = a.result ?? {};
  const list = QUESTIONS[lead.audience === "ecole" ? "school" : "rider"];
  const tpls = leadTemplates(lead);

  const result =
    lead.audience === "ecole"
      ? `<div class="mini"><b>${r.score ?? "?"}/100</b><span>${esc(r.status ?? "score de gestion")}</span></div>
         <div class="mini"><b>${r.hours ?? "?"} h</b><span>admin / semaine</span></div>
         <div class="mini mini--hot"><b>${r.revenue ? euro(r.revenue) : "?"}</b><span>récupérables / saison</span></div>`
      : `<div class="mini"><b>${esc(r.level ?? "?")}</b><span>niveau</span></div>
         <div class="mini"><b>${esc(r.formatName ?? "?")}</b><span>format conseillé</span></div>
         <div class="mini mini--hot"><b>${esc(REGIONS[a.region]?.name ?? "?")}</b><span>région</span></div>`;

  $("#detail").innerHTML = `
    <div class="d__head">
      <div class="d__badges">${score(lead.priority)}${tag(lead)}<span class="muted">${HEAT[heat(lead.priority)]}</span><span id="d-linked"></span></div>
      <h2>${esc(leadName(lead))}</h2>
      <div class="d__links"><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></div>
      <p class="muted">Arrivé le ${new Date(lead.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}${lead.consent ? " · consentement email ✓" : ""}</p>
    </div>

    ${statusBlock(STATUS, lead.status)}
    ${nextBlock(lead)}

    ${lead.ai_summary || !r.score && !r.level ? `<div class="d__block">
      <h4>Analyse Gemini</h4>
      <p class="d__summary">${lead.ai_summary ? esc(lead.ai_summary) : `<span class="muted">${lead.ai_source === "fallback" ? "Gemini n'a pas répondu à l'arrivée du lead : texte de secours utilisé, à personnaliser." : "Pas d'analyse."}</span>`}</p>
    </div>` : ""}
    <div class="d__block"${r.score || r.level ? "" : " hidden"}>
      <h4>Résultat du test</h4>
      <div class="d__minis">${result}</div>
      ${r.recos?.length ? `<ol class="d__recos">${r.recos.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : ""}
    </div>

    <div class="d__block">
      <h4>Réponses</h4>
      <dl class="d__answers">${list
        .filter((q) => q.id in a)
        .map((q) => `<dt>${esc(q.q)}</dt><dd>${esc(label(lead.audience, q.id, a[q.id]))}</dd>`)
        .join("")}</dl>
    </div>

    <div class="d__block">
      <h4>Contact</h4>
      <label class="d__field">Nom du contact<input id="d-name" value="${esc(lead.name ?? "")}" placeholder="Ex. : Julie, gérante" maxlength="120"></label>
      <label class="d__field">Notes<textarea id="d-notes" rows="4" placeholder="Infos utiles, besoins, objections…" maxlength="5000">${esc(lead.notes ?? "")}</textarea></label>
      <p class="d__saved muted" id="d-saved"></p>
    </div>

    ${templatesBlock(tpls, lead.email, "lead", lead.id)}
    ${logBlock()}
    ${loadingHistory}`;

  bindCommon("lead", lead, tpls, lead.email);

  let timer;
  const autosave = () => {
    clearTimeout(timer);
    $("#d-saved").textContent = "…";
    timer = setTimeout(async () => {
      try {
        await saveRecord("lead", lead.id, { notes: $("#d-notes").value, name: $("#d-name").value });
        $("#d-saved").textContent = "Enregistré ✓";
      } catch (err) {
        $("#d-saved").textContent = err.message;
      }
    }, 800);
  };
  $("#d-notes").addEventListener("input", autosave);
  $("#d-name").addEventListener("input", autosave);
}

/* ---------- Fiche école (prospection) ---------- */

function renderProspectDetail(p) {
  const tpls = prospectTemplates(p);
  const map = p.lat != null ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=16/${p.lat}/${p.lon}` : null;
  const search = `https://www.google.com/search?q=${encodeURIComponent(`${p.name} ${p.city ?? DEPTS[p.departement] ?? ""}`)}`;

  $("#detail").innerHTML = `
    <div class="d__head">
      <div class="d__badges">${score(p.fit, "Score d'adéquation")}<span class="tag tag--ecole">${esc(SPORT_NAMES[p.sport] ?? "—")}</span><span class="muted">${p.source === "osm" ? "OpenStreetMap" : p.source === "csv" ? "Import CSV" : "Ajout manuel"}</span><span id="d-linked"></span></div>
      <h2>${esc(p.name)}</h2>
      <p class="muted">${esc(place(p))}${p.last_contact_at ? ` · dernier contact ${ago(p.last_contact_at)}` : ""}</p>
      <div class="d__actions">
        ${p.phone ? `<a class="act" href="${telHref(p.phone)}">☎ Appeler</a>` : ""}
        ${p.email ? `<a class="act" href="${esc(mailto(p.email, tpls.first.subject, tpls.first.body))}">✉ Écrire</a>` : ""}
        ${p.website ? `<a class="act" href="${esc(p.website)}" target="_blank" rel="noopener">⌂ Site web</a>` : ""}
        ${map ? `<a class="act" href="${map}" target="_blank" rel="noopener">⌖ Carte</a>` : ""}
        <a class="act" href="${search}" target="_blank" rel="noopener">⌕ Rechercher</a>
      </div>
    </div>

    ${statusBlock(P_STATUS, p.status)}
    ${nextBlock(p)}

    <div class="d__block">
      <h4>Coordonnées</h4>
      <form class="d__form" id="d-pform">
        <label class="d__field">Nom<input name="name" value="${esc(p.name)}" required maxlength="200"></label>
        <div class="grid2">
          <label class="d__field">Email
            <span class="d__inline"><input name="email" type="email" value="${esc(p.email ?? "")}" maxlength="200">${p.website ? `<button type="button" class="mini-btn" id="d-find">Trouver</button>` : ""}</span>
          </label>
          <label class="d__field">Téléphone<input name="phone" value="${esc(p.phone ?? "")}" maxlength="40"></label>
        </div>
        <div id="d-found"></div>
        <label class="d__field">Site web<input name="website" value="${esc(p.website ?? "")}" maxlength="300"></label>
        <div class="grid3">
          <label class="d__field">Ville<input name="city" value="${esc(p.city ?? "")}" maxlength="120"></label>
          <label class="d__field">Département<select name="departement"><option value="">—</option>${Object.entries(DEPTS).map(([k, n]) => `<option value="${k}"${k === p.departement ? " selected" : ""}>${k} · ${esc(n)}</option>`).join("")}</select></label>
          <label class="d__field">Sport<select name="sport">${Object.entries({ surf: "Surf", voile: "Voile", kite: "Kite", paddle: "Paddle", autre: "Autre" }).map(([k, n]) => `<option value="${k}"${k === p.sport ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        </div>
        <label class="d__field">Notes<textarea name="notes" rows="3" maxlength="5000" placeholder="Nom du gérant, outil actuel, objections…">${esc(p.notes ?? "")}</textarea></label>
        <div class="d__formfoot"><button class="btn btn--small" type="submit">Enregistrer</button><span class="d__saved muted" id="d-psaved"></span></div>
      </form>
    </div>

    ${templatesBlock(tpls, p.email, "prospect", p.id)}
    ${logBlock()}
    ${loadingHistory}

    <div class="d__block d__danger"><button type="button" class="link-danger" id="d-delete">Supprimer cette école</button></div>`;

  bindCommon("prospect", p, tpls, p.email);

  const form = $("#d-pform");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    $("#d-psaved").textContent = "…";
    try {
      await saveRecord("prospect", p.id, f);
      $("#d-psaved").textContent = "Enregistré ✓";
      openRecord("prospect", p.id);
    } catch (err) {
      $("#d-psaved").textContent = err.message;
      btn.disabled = false;
    }
  });

  $("#d-find")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Recherche…";
    const box = $("#d-found");
    try {
      const { emails } = await post("/api/admin/prospects", { action: "find_email", id: p.id });
      box.innerHTML = emails.length
        ? `<p class="found"><span>Trouvé sur le site :</span>${emails.map((m) => `<button type="button" class="chip-status" data-use="${esc(m)}">${esc(m)}</button>`).join("")}</p>`
        : `<p class="found muted">Aucun email publié sur la page d'accueil ni la page contact. Essaie le formulaire du site ou le téléphone.</p>`;
      $$("[data-use]", box).forEach((b) =>
        b.addEventListener("click", () => {
          form.email.value = b.dataset.use;
          form.requestSubmit();
        })
      );
    } catch (err) {
      box.innerHTML = `<p class="found found--error">${esc(err.message)}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Trouver";
    }
  });

  $("#d-delete").addEventListener("click", async () => {
    if (!confirm(`Supprimer « ${p.name} » et son historique ? C'est définitif.`)) return;
    try {
      await api(`/api/admin/prospects?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
      prospects = prospects.filter((x) => x.id !== p.id);
      closeDrawer();
      render();
      toast("École supprimée");
    } catch (err) {
      toast(err.message, true);
    }
  });
}

/* ---------- Ajouter une école ---------- */

$("#p-add").addEventListener("click", () => {
  $("#f-add").reset();
  $("#m-add .modal__msg").textContent = "";
  $("#m-add").showModal();
});
$("#f-add").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "ok") return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.currentTarget));
  try {
    const { prospect } = await post("/api/admin/prospects", { action: "create", ...f });
    prospects.unshift(prospect);
    $("#m-add").close();
    render();
    openRecord("prospect", prospect.id);
    toast("École ajoutée");
  } catch (err) {
    $("#m-add .modal__msg").textContent = err.message;
  }
});

/* ---------- Import CSV ---------- */

// Lecture d'un CSV (séparateur virgule ou point-virgule, guillemets gérés)
function parseCsv(text) {
  const first = text.split(/\r?\n/)[0] ?? "";
  const sep = (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

const CSV_COLUMNS = {
  name: ["nom", "name", "ecole", "etablissement", "club", "raison sociale"],
  email: ["email", "e-mail", "mail", "courriel"],
  phone: ["telephone", "tel", "phone", "portable", "mobile"],
  website: ["site", "site web", "website", "web", "url"],
  city: ["ville", "city", "commune", "localite"],
  departement: ["departement", "dept", "dep", "code departement"],
  sport: ["sport", "activite"],
  notes: ["notes", "note", "commentaire", "commentaires"],
};

$("#p-csv").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const rows = parseCsv((await file.text()).replace(/^﻿/, ""));
    if (rows.length < 2) throw new Error("Le fichier est vide");
    const header = rows[0].map((h) => norm(h).trim());
    const index = Object.fromEntries(Object.entries(CSV_COLUMNS).map(([k, names]) => [k, header.findIndex((h) => names.includes(h))]));
    if (index.name < 0) throw new Error("Colonne « nom » introuvable. Colonnes reconnues : nom, email, téléphone, site, ville, département, sport, notes");
    const sportOf = (s) => ({ surf: "surf", voile: "voile", sailing: "voile", kite: "kite", kitesurf: "kite", paddle: "paddle" })[norm(s).trim()] ?? "autre";
    const items = rows.slice(1).map((r) => {
      const item = {};
      for (const [k, i] of Object.entries(index)) if (i >= 0 && r[i]?.trim()) item[k] = r[i].trim();
      if (item.sport) item.sport = sportOf(item.sport);
      if (item.departement) item.departement = item.departement.padStart(2, "0").toUpperCase();
      return item;
    });
    if (!confirm(`Importer ${items.length} ligne(s) depuis « ${file.name} » ? Les écoles déjà présentes (même nom et même ville) seront ignorées.`)) return;
    const res = await post("/api/admin/prospects", { action: "csv", items });
    await load();
    toast(`${res.added} école(s) ajoutée(s)${res.duplicates ? `, ${res.duplicates} déjà présente(s)` : ""}${res.skipped.length ? `, ${res.skipped.length} ligne(s) invalide(s) : ${res.skipped.slice(0, 8).join(", ")}` : ""}`, res.skipped.length > 0);
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------- Mise à jour depuis OpenStreetMap ---------- */

let osmRunning = false;
$("#p-osm").addEventListener("click", () => {
  if (!osmRunning) {
    $("#osm-log").innerHTML = "";
    $("#m-osm .modal__msg").textContent = "";
  }
  $("#m-osm").showModal();
});
$("#f-osm").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "ok") return;
  e.preventDefault();
  if (osmRunning) return;
  osmRunning = true;
  const region = $("#osm-region").value;
  const depts = REGION_DEPTS[region];
  const log = $("#osm-log");
  const msg = $("#m-osm .modal__msg");
  log.innerHTML = depts.map((d) => `<li data-d="${d}"><span>${d} · ${esc(DEPTS[d])}</span><em>en attente</em></li>`).join("");
  $("#osm-go").disabled = true;
  $("#osm-region").disabled = true;
  let added = 0;
  let failed = 0;
  for (const d of depts) {
    const li = $(`[data-d="${d}"]`, log);
    let ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      $("em", li).textContent = attempt === 1 ? "en cours…" : "nouvel essai…";
      li.className = "is-busy";
      try {
        const r = await post("/api/admin/prospects", { action: "import", departement: d });
        added += r.added;
        $("em", li).textContent = `${r.found} trouvée(s), ${r.added} nouvelle(s)`;
        li.className = "is-ok";
        ok = true;
      } catch (err) {
        if (attempt === 2) {
          $("em", li).textContent = err.message;
          li.className = "is-error";
          failed++;
        }
      }
    }
    msg.textContent = `${added} nouvelle(s) école(s) ajoutée(s)${failed ? ` · ${failed} département(s) en échec, relance plus tard` : ""}`;
  }
  osmRunning = false;
  $("#osm-go").disabled = false;
  $("#osm-region").disabled = false;
  msg.textContent = `Terminé : ${added} nouvelle(s) école(s)${failed ? ` · ${failed} département(s) en échec (OpenStreetMap surchargé), relance plus tard` : ""}.`;
  if (added) await load();
});

/* ---------- Export CSV ---------- */

$("#export").addEventListener("click", () => {
  const isLeads = tab === "leads";
  const cols = isLeads
    ? ["arrivé le", "type", "email", "école", "nom", "statut", "priorité", "sport", "région", "résultat", "prochaine action", "date prochaine action", "notes"]
    : ["école", "sport", "ville", "département", "email", "téléphone", "site", "statut", "score", "dernier contact", "prochaine action", "date prochaine action", "notes", "source"];
  const rows = isLeads
    ? filteredLeads().map((l) => [l.created_at, l.audience, l.email, l.school, l.name, STATUS[l.status].label, l.priority, l.answers?.sport, REGIONS[l.answers?.region]?.name, summary(l), l.next_action, l.next_action_at, l.notes])
    : filteredProspects().map((p) => [p.name, SPORT_NAMES[p.sport], p.city, p.departement, p.email, p.phone, p.website, P_STATUS[p.status].label, p.fit, p.last_contact_at, p.next_action, p.next_action_at, p.notes, p.source === "osm" ? "OpenStreetMap (ODbL)" : p.source]);
  // Une cellule qui commence par = + - @ serait lue comme une formule par Excel
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [cols, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `glisse-${isLeads ? "leads" : "prospection"}-${today()}.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* ---------- Démarrage ---------- */

try {
  const saved = localStorage.getItem("glisse-crm-tab");
  if (["todo", "leads", "prospects"].includes(saved)) setTab(saved);
} catch {}
load();
