// CRM Glisse : liste et pipeline des leads, fiche détaillée, statut, notes, export.
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

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const euro = (n) => Number(n).toLocaleString("fr-FR") + " €";
const day = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const ago = (d) => {
  const h = (Date.now() - new Date(d)) / 36e5;
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${Math.floor(h)} h`;
  if (h < 24 * 7) return `il y a ${Math.floor(h / 24)} j`;
  return day(d);
};

let leads = [];
let view = "table";

/* ---------- Lecture des réponses ---------- */

// Libellé lisible d'une réponse, à partir des questions du quiz
function label(audience, id, value) {
  const list = QUESTIONS[audience === "ecole" ? "school" : "rider"];
  const q = list.find((x) => x.id === id);
  const opt = q?.options.find((o) => o.value === value);
  return opt ? opt.label : value;
}

const SPORTS = { surf: "Surf", voile: "Voile", kite: "Kite", paddle: "Paddle", multi: "Multi" };

// Score de priorité sur 100 : à qui écrire ou téléphoner en premier
function priority(lead) {
  const a = lead.answers ?? {};
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
  const a = lead.answers ?? {};
  const r = a.result ?? {};
  if (lead.audience === "ecole") return r.revenue ? `${euro(r.revenue)} récupérables · ${r.hours ?? "?"} h/sem` : "—";
  return r.level ? `${r.level} · ${r.formatName ?? ""}` : "—";
}

/* ---------- API ---------- */

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    credentials: "same-origin",
  });
  if (res.status === 401 && !path.endsWith("/login")) {
    showLogin();
    throw new Error("Session expirée");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast is-on${isError ? " is-error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = "toast"), 2600);
}

/* ---------- Connexion ---------- */

function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#password").focus();
}

$("#login form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $(".login__msg");
  msg.textContent = "";
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: $("#password").value }) });
    $("#password").value = "";
    $("#login").hidden = true;
    load();
  } catch (err) {
    msg.textContent = err.message;
  }
});

$("#logout").addEventListener("click", async () => {
  await api("/api/admin/login", { method: "DELETE" }).catch(() => {});
  showLogin();
});

/* ---------- Chargement ---------- */

async function load() {
  try {
    const data = await api("/api/admin/leads");
    leads = data.leads.map((l) => ({ ...l, priority: priority(l) }));
    $("#app").hidden = false;
    fillRegions();
    render();
  } catch (err) {
    if (err.message !== "Session expirée") toast(err.message, true);
  }
}

$("#refresh").addEventListener("click", () => load().then(() => toast("Leads à jour")));

/* ---------- Filtres ---------- */

Object.entries(STATUS).forEach(([k, s]) => $("#f-status").insertAdjacentHTML("beforeend", `<option value="${k}">${s.label}</option>`));

function fillRegions() {
  const select = $("#f-region");
  if (select.options.length > 1) return;
  Object.entries(REGIONS).forEach(([k, r]) => select.insertAdjacentHTML("beforeend", `<option value="${k}">${r.name}</option>`));
}

["#search", "#f-audience", "#f-status", "#f-region", "#f-sort"].forEach((s) => $(s).addEventListener("input", render));

function filtered() {
  const q = $("#search").value.trim().toLowerCase();
  const aud = $("#f-audience").value;
  const st = $("#f-status").value;
  const reg = $("#f-region").value;
  const list = leads.filter(
    (l) =>
      (!aud || l.audience === aud) &&
      (!st || l.status === st) &&
      (!reg || l.answers?.region === reg) &&
      (!q || [l.email, l.school, l.name, l.notes].some((v) => v?.toLowerCase().includes(q)))
  );
  const byDate = (a, b) => new Date(b.created_at) - new Date(a.created_at);
  return list.sort($("#f-sort").value === "priority" ? (a, b) => b.priority - a.priority || byDate(a, b) : byDate);
}

/* ---------- Rendu ---------- */

function render() {
  renderKpis();
  const list = filtered();
  $("#empty").hidden = list.length > 0;
  if (view === "table") renderTable(list);
  else renderBoard(list);
}

function renderKpis() {
  const week = Date.now() - 7 * 864e5;
  const schools = leads.filter((l) => l.audience === "ecole");
  const open = leads.filter((l) => !["won", "lost"].includes(l.status));
  const cards = [
    { n: leads.length, l: "leads au total" },
    { n: leads.filter((l) => new Date(l.created_at) > week).length, l: "cette semaine" },
    { n: schools.length, l: "écoles" },
    { n: leads.length - schools.length, l: "pratiquants" },
    { n: open.filter((l) => heat(l.priority) === "hot").length, l: "leads chauds à traiter", hot: true, filter: "hot" },
    { n: leads.filter((l) => l.status === "new").length, l: "jamais contactés" },
    { n: leads.filter((l) => l.status === "meeting").length, l: "RDV" },
    { n: leads.filter((l) => l.status === "won").length, l: "gagnés" },
  ];
  $("#kpis").innerHTML = cards
    .map((c) => `<div class="kpi${c.hot ? " kpi--hot" : ""}"><b>${c.n}</b><span>${c.l}</span></div>`)
    .join("");
}

const pill = (status) => `<span class="pill pill--${STATUS[status].tone}">${STATUS[status].label}</span>`;
const score = (p) => `<span class="score score--${heat(p)}" title="${HEAT[heat(p)]}">${p}</span>`;
const who = (l) => `<b>${esc(l.school || l.name || l.email)}</b>${l.school || l.name ? `<small>${esc(l.email)}</small>` : ""}`;

function renderTable(list) {
  $("#rows").innerHTML = list
    .map((l) => {
      const a = l.answers ?? {};
      return `<tr data-id="${l.id}" tabindex="0">
        <td>${score(l.priority)}</td>
        <td class="who">${who(l)}</td>
        <td><span class="tag tag--${l.audience}">${l.audience === "ecole" ? "École" : "Pratiquant"}</span></td>
        <td>${esc(SPORTS[a.sport] ?? "—")} · ${esc(REGIONS[a.region]?.name ?? "—")}</td>
        <td class="muted">${esc(summary(l))}</td>
        <td>${pill(l.status)}</td>
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
            (l) => `<article class="card" draggable="true" data-id="${l.id}" tabindex="0">
              <div class="card__top">${score(l.priority)}<span class="tag tag--${l.audience}">${l.audience === "ecole" ? "École" : "Pratiquant"}</span></div>
              <p class="who">${who(l)}</p>
              <p class="muted">${esc(summary(l))}</p>
            </article>`
          )
          .join("")}</div>
      </div>`;
    })
    .join("");
}

/* ---------- Vues ---------- */

document.querySelectorAll(".views__btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    view = btn.dataset.view;
    document.querySelectorAll(".views__btn").forEach((b) => b.classList.toggle("is-on", b === btn));
    $("#view-table").hidden = view !== "table";
    $("#view-board").hidden = view !== "board";
    render();
  })
);

// Ouvrir une fiche depuis la liste ou le pipeline
document.addEventListener("click", (e) => {
  const row = e.target.closest("tr[data-id], .card[data-id]");
  if (row) openLead(row.dataset.id);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLead();
  const row = e.target.closest?.("tr[data-id], .card[data-id]");
  if (row && e.key === "Enter") openLead(row.dataset.id);
});

// Glisser une carte dans une autre colonne change son statut
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
  board.querySelectorAll(".col").forEach((c) => c.classList.toggle("is-over", c === col));
});
board.addEventListener("drop", (e) => {
  const col = e.target.closest(".col");
  board.querySelectorAll(".col").forEach((c) => c.classList.remove("is-over"));
  if (!col) return;
  e.preventDefault();
  setStatus(e.dataTransfer.getData("text/plain"), col.dataset.status);
});

/* ---------- Modifications ---------- */

async function save(id, patch) {
  const { lead } = await api("/api/admin/leads", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
  const i = leads.findIndex((l) => l.id === id);
  leads[i] = { ...lead, priority: priority(lead) };
  render();
  return leads[i];
}

async function setStatus(id, status) {
  const lead = leads.find((l) => l.id === id);
  if (!lead || lead.status === status) return;
  try {
    await save(id, { status });
    toast(`Statut : ${STATUS[status].label}`);
    if (openId === id) openLead(id);
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------- Fiche lead ---------- */

let openId = null;

async function openLead(id) {
  openId = id;
  const lead = leads.find((l) => l.id === id);
  renderDetail(lead, null);
  $("#scrim").hidden = false;
  $("#drawer").classList.add("is-open");
  $("#drawer").setAttribute("aria-hidden", "false");
  try {
    const data = await api(`/api/admin/leads?id=${encodeURIComponent(id)}`);
    if (openId === id) renderDetail({ ...data.lead, priority: priority(data.lead) }, data.emails);
  } catch (err) {
    toast(err.message, true);
  }
}

function closeLead() {
  openId = null;
  $("#scrim").hidden = true;
  $("#drawer").classList.remove("is-open");
  $("#drawer").setAttribute("aria-hidden", "true");
}
$("#close").addEventListener("click", closeLead);
$("#scrim").addEventListener("click", closeLead);

function renderDetail(lead, emails) {
  const a = lead.answers ?? {};
  const r = a.result ?? {};
  const list = QUESTIONS[lead.audience === "ecole" ? "school" : "rider"];

  const result =
    lead.audience === "ecole"
      ? `<div class="mini"><b>${r.score ?? "?"}/100</b><span>${esc(r.status ?? "")}</span></div>
         <div class="mini"><b>${r.hours ?? "?"} h</b><span>admin / semaine</span></div>
         <div class="mini mini--hot"><b>${r.revenue ? euro(r.revenue) : "?"}</b><span>récupérables / saison</span></div>`
      : `<div class="mini"><b>${esc(r.level ?? "?")}</b><span>niveau</span></div>
         <div class="mini"><b>${esc(r.formatName ?? "?")}</b><span>format conseillé</span></div>
         <div class="mini mini--hot"><b>${esc(REGIONS[a.region]?.name ?? "?")}</b><span>région</span></div>`;

  $("#detail").innerHTML = `
    <div class="d__head">
      <div class="d__badges">${score(lead.priority)}<span class="tag tag--${lead.audience}">${lead.audience === "ecole" ? "École" : "Pratiquant"}</span><span class="muted">${HEAT[heat(lead.priority)]}</span></div>
      <h2>${esc(lead.school || lead.name || lead.email)}</h2>
      <a href="mailto:${esc(lead.email)}" class="d__mail">${esc(lead.email)}</a>
      <p class="muted">Arrivé le ${new Date(lead.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}${lead.consent ? " · consentement email ✓" : ""}</p>
    </div>

    <div class="d__block">
      <h4>Statut</h4>
      <div class="d__status">${Object.entries(STATUS)
        .map(([k, s]) => `<button type="button" class="chip-status${k === lead.status ? " is-on" : ""}" data-status="${k}"><span class="dot dot--${s.tone}"></span>${s.label}</button>`)
        .join("")}</div>
    </div>

    <div class="d__block">
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
      <label class="d__field">Nom du contact<input id="d-name" value="${esc(lead.name ?? "")}" placeholder="Ex. : Julie, gérante"></label>
      <label class="d__field">Notes<textarea id="d-notes" rows="5" placeholder="Appel le 12/11 : intéressée, rappeler après la saison…">${esc(lead.notes ?? "")}</textarea></label>
      <p class="d__saved muted" id="d-saved"></p>
    </div>

    <div class="d__block">
      <h4>Emails ${lead.follow_ups ? `<span class="muted">· ${lead.follow_ups} relance</span>` : ""}</h4>
      ${
        emails === null
          ? `<p class="muted">Chargement…</p>`
          : emails.length
          ? `<ul class="d__emails">${emails
              .map((m) => `<li class="mail mail--${m.direction}"><div><b>${m.direction === "in" ? "Reçu" : "Envoyé"}</b> · ${esc(m.subject ?? "")}<time>${day(m.sent_at)}</time></div><p>${esc((m.body ?? "").slice(0, 400))}</p></li>`)
              .join("")}</ul>`
          : `<p class="muted">Aucun email pour l'instant.</p>`
      }
    </div>`;

  $("#detail").querySelectorAll(".chip-status").forEach((b) => b.addEventListener("click", () => setStatus(lead.id, b.dataset.status)));

  // Les notes et le nom s'enregistrent tout seuls, une seconde après la dernière frappe
  let timer;
  const autosave = () => {
    clearTimeout(timer);
    $("#d-saved").textContent = "…";
    timer = setTimeout(async () => {
      try {
        await save(lead.id, { notes: $("#d-notes").value, name: $("#d-name").value });
        $("#d-saved").textContent = "Enregistré ✓";
      } catch (err) {
        $("#d-saved").textContent = err.message;
      }
    }, 900);
  };
  $("#d-notes").addEventListener("input", autosave);
  $("#d-name").addEventListener("input", autosave);
}

/* ---------- Export CSV ---------- */

$("#export").addEventListener("click", () => {
  const cols = ["created_at", "audience", "email", "school", "name", "status", "priority", "sport", "region", "resultat", "notes"];
  const rows = filtered().map((l) => [
    l.created_at, l.audience, l.email, l.school, l.name, STATUS[l.status].label, l.priority,
    l.answers?.sport, l.answers?.region, summary(l), l.notes,
  ]);
  const csv = [cols, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `glisse-leads-${new Date().toISOString().slice(0, 10)}.csv` });
  link.click();
  URL.revokeObjectURL(url);
});

load();
