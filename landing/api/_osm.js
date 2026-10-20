// Import des écoles et clubs de glisse depuis OpenStreetMap (API Overpass, gratuite, données ODbL).

// Départements de chaque région du quiz
export const REGION_DEPTS = {
  bretagne: ["29", "22", "56", "35", "44"],
  landes: ["33", "40", "64"],
  med: ["66", "11", "34", "30", "13", "83", "06", "2A", "2B"],
  nord: ["50", "14", "76", "80", "62", "59"],
  charente: ["17", "85", "16", "79"],
  other: ["01", "73", "74", "38", "05", "04", "12", "87", "23", "19", "15", "63", "03", "42", "69", "71", "58", "89", "10", "51", "52", "55", "54", "57", "67", "68", "88", "70", "90", "25", "39", "21", "18", "36", "41", "45", "28", "37", "86", "49", "53", "72", "61", "27", "60", "02", "08", "95", "77", "91", "78", "93", "92", "94", "75", "24", "47", "46", "82", "32", "65", "31", "81", "09", "48", "07", "26", "84", "43"],
};

const SPORTS = /(^|;)(surfing|bodyboarding|sailing|windsurfing|kitesurfing|stand_up_paddleboarding|paddleboarding|wakeboarding)(;|$)/;
const SCHOOLISH = /([ée]cole|school|stage|surf ?camp|academ)/i;
const CLUBISH = /(club|cercle|centre|center|base|p[oô]le|nautique|yacht|asso|watersport|glisse)/i;

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

// Le tag ISO3166-2 (ex. FR-29) est le plus rapide pour retrouver un département dans Overpass
function query(dept) {
  return `[out:json][timeout:55];
area["ISO3166-2"="FR-${dept}"]->.a;
(nwr["sport"~"${SPORTS.source}"]["name"](area.a);nwr["amenity"~"^(surf_school|sailing_school)$"]["name"](area.a););
out tags center;`;
}

export const regionOf = (dept) => Object.keys(REGION_DEPTS).find((r) => REGION_DEPTS[r].includes(dept)) ?? "other";

async function overpass(q, timeout) {
  let lastError;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "Glisse-CRM/1.0 (https://glisse.vercel.app)" },
        body: new URLSearchParams({ data: q }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

const SPORT_KEYS = {
  surfing: "surf", bodyboarding: "surf", surf_school: "surf",
  kitesurfing: "kite",
  sailing: "voile", windsurfing: "voile", sailing_school: "voile",
  stand_up_paddleboarding: "paddle", paddleboarding: "paddle",
};

// Premier sport déclaré, comparé mot par mot (« kitesurfing » contient « surfing »)
function sportOf(tags) {
  const tokens = `${tags.sport ?? ""};${tags.amenity ?? ""}`.split(";").map((x) => x.trim());
  return SPORT_KEYS[tokens.find((x) => SPORT_KEYS[x])] ?? "autre";
}

const website = (v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`).slice(0, 300) : null);

// Score d'adéquation sur 100 : vraie école de glisse, joignable
export function fitScore(p, tags = {}) {
  let f = 0;
  if (SCHOOLISH.test(p.name)) f += 30;
  else if (CLUBISH.test(p.name)) f += 20;
  if (["surf", "voile", "kite"].includes(p.sport)) f += 20;
  else if (p.sport === "paddle") f += 10;
  if (/school/.test(tags.amenity ?? "") || tags.club === "sport" || tags.leisure === "sports_centre") f += 10;
  if (p.email) f += 20;
  if (p.phone) f += 15;
  if (p.website) f += 10;
  return Math.min(100, f);
}

// Transforme un élément OpenStreetMap en prospect, ou null si ce n'est pas une école ou un club de glisse
export function toProspect(el, dept) {
  const t = el.tags ?? {};
  if (!t.name) return null;
  if (!SPORTS.test(t.sport ?? "") && !/^(surf_school|sailing_school)$/.test(t.amenity ?? "")) return null;
  // Terrains, magasins de vêtements et plages ne sont pas des écoles, sauf si le nom le dit
  if ((t.leisure === "pitch" || t.shop === "clothes" || t.natural) && !SCHOOLISH.test(t.name) && !CLUBISH.test(t.name)) return null;

  const p = {
    name: t.name.slice(0, 200),
    sport: sportOf(t),
    city: t["addr:city"] ?? null,
    postcode: t["addr:postcode"] ?? null,
    departement: dept,
    region: dept ? regionOf(dept) : "other",
    lat: el.lat ?? el.center?.lat ?? null,
    lon: el.lon ?? el.center?.lon ?? null,
    website: website(t.website ?? t["contact:website"] ?? t.url),
    email: (t.email ?? t["contact:email"] ?? "").split(/[;,\s]/)[0].toLowerCase() || null,
    phone: (t.phone ?? t["contact:phone"] ?? t["contact:mobile"] ?? "").split(";")[0].trim() || null,
    source: "osm",
    source_id: `${el.type}/${el.id}`,
  };
  p.fit = fitScore(p, t);
  return p;
}

// Écoles et clubs d'un département (code INSEE, ex. "29" ou "2A")
export async function importDept(dept, { timeout = 50000 } = {}) {
  if (!Object.values(REGION_DEPTS).flat().includes(dept)) throw new Error("Département inconnu");
  const data = await overpass(query(dept), timeout);
  const rows = new Map();
  for (const el of data.elements ?? []) {
    const p = toProspect(el, dept);
    if (p) rows.set(p.source_id, p);
  }
  return [...rows.values()];
}
