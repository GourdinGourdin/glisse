// Note de compatibilité des leads (sans réseau). Lancer : npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import "../scoring.js";

const { scoreLead } = globalThis;

const goodSchool = {
  audience: "ecole",
  status: "new",
  school: "Hossegor Surf",
  ai_priority: 90,
  answers: {
    school: "École de surf à Hossegor, 3 moniteurs, saison d'avril à octobre",
    booking: "Tout passe par le téléphone et les messages Instagram, on note sur un carnet",
    pain: "Les annulations météo : je rappelle chaque client un par un",
    fill: "Le matin c'est plein mais le créneau de 14h reste souvent à moitié vide",
    clients: "Surtout le bouche-à-oreille et l'office de tourisme",
    wish: "Que les clients réservent et paient seuls",
  },
};
const equippedSchool = {
  audience: "ecole",
  status: "new",
  school: "Grosse École",
  ai_priority: 30,
  answers: {
    school: "Grand centre nautique au Portugal",
    booking: "Réservation en ligne sur notre plateforme",
    pain: "Rien de spécial",
    fill: "Non, toujours complet",
    clients: "Google et notre site",
    wish: "Rien",
  },
};
const goodRider = {
  audience: "pratiquant",
  status: "new",
  answers: {
    sport: "Le surf, j'adore l'idée d'être dans l'eau",
    experience: "Jamais essayé",
    goal: "Tenir debout et prendre mes premières vagues",
    where: "Biarritz en juillet, une semaine",
    blocker: "Peur de ne pas avoir le niveau",
  },
};

test("une école à la main et en difficulté passe devant une école déjà équipée", () => {
  const good = scoreLead(goodSchool);
  const equipped = scoreLead(equippedSchool);
  assert.ok(good.score >= 75, `bonne école : ${good.score}`);
  assert.ok(equipped.score < 35, `école équipée : ${equipped.score}`);
  assert.equal(good.label, "Très compatible");
});

test("un débutant au projet précis est très compatible", () => {
  const r = scoreLead(goodRider);
  assert.ok(r.score >= 75, `score : ${r.score}`);
  assert.equal(r.region, "landes");
  assert.equal(r.sportName, "Surf");
});

test("kitesurf et planche à voile ne comptent pas comme surf ou voile", () => {
  const kite = scoreLead({ ...goodRider, answers: { ...goodRider.answers, sport: "Le kitesurf" } });
  const wind = scoreLead({ ...goodRider, answers: { ...goodRider.answers, sport: "La planche à voile" } });
  assert.equal(kite.sportName, "Kite");
  assert.equal(wind.sportName, "Windsurf");
  assert.ok(kite.score < scoreLead(goodRider).score);
});

test("les contrôles plafonnent la note, même si les réponses semblent bonnes", () => {
  assert.equal(scoreLead({ ...goodSchool, ai_flags: ["injection_attempt"] }).score, 10);
  assert.equal(scoreLead({ ...goodSchool, ai_flags: ["fake_or_joke"] }).score, 20);
  assert.ok(scoreLead({ ...goodSchool, status: "lost" }).score <= 25);
});

test("une réponse et un rendez-vous font monter la note", () => {
  const mid = { ...goodRider, answers: { ...goodRider.answers, where: "", blocker: "" } };
  const base = scoreLead(mid).score;
  assert.equal(scoreLead({ ...mid, status: "replied" }).score, base + 6);
  assert.equal(scoreLead({ ...mid, status: "meeting" }).score, base + 10);
});

test("un lead vide ne plante pas et reste faible", () => {
  for (const audience of ["ecole", "pratiquant"]) {
    const r = scoreLead({ audience, status: "new", answers: {} });
    assert.ok(r.score < 35, `${audience} : ${r.score}`);
    assert.equal(r.level, "low");
  }
  assert.doesNotThrow(() => scoreLead({ audience: "ecole", status: "new", answers: null }));
});

test("les anciens leads à choix multiples sont notés", () => {
  const r = scoreLead({ audience: "ecole", status: "new", school: "École Test", answers: { tool: "paper", calls: 22, empty: 2, visibility: "word", region: "landes", sport: "surf" } });
  assert.ok(r.rows.find((c) => c.key === "booking").points > 20);
  assert.equal(r.region, "landes");
  assert.equal(r.sportName, "Surf");
});

test("chaque critère explique ses points", () => {
  for (const row of scoreLead(goodSchool).rows) {
    assert.ok(row.why.length > 3, row.key);
    assert.ok(row.points <= row.max, row.key);
  }
});
