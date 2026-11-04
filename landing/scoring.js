// Note de compatibilité d'un lead avec Glisse, sur 100, calculée dans le CRM à partir de ses réponses.
// Chaque critère donne ses points et sa raison : la note s'explique, et rien n'est stocké en base.
// La note de Gemini n'est qu'un critère parmi les autres. Les contrôles (manipulation, réponses fantaisistes) plafonnent le total.

(() => {
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const REGION_WORDS = {
    landes: /landes|hossegor|capbreton|seignosse|biarritz|anglet|bidart|guethary|saint.jean.de.luz|hendaye|lacanau|gironde|arcachon|cap.ferret|pays basque|mimizan|vieux.boucau|moliets|le porge/,
    bretagne: /bretagne|finistere|morbihan|quiberon|la torche|crozon|brest|lorient|saint.malo|loire.atlantique|la baule|pornic|carnac|douarnenez|cotes.d.armor/,
    charente: /charente|vendee|oleron|ile de re|la rochelle|royan|les sables|saint.jean.de.monts|noirmoutier|ile d.yeu/,
    med: /mediterranee|marseille|hyeres|almanarre|leucate|gruissan|corse|ajaccio|cote d.azur|\bnice\b|cannes|antibes|saint.tropez|toulon|\bvar\b|herault|palavas|\bsete\b|grande motte|narbonne|perpignan/,
    nord: /normandie|cherbourg|etretat|deauville|le havre|calais|wissant|dunkerque|touquet|berck|hauts.de.france/,
  };
  const ABROAD = /portugal|maroc|espagne|bali|costa rica|hawai|australie|sri lanka|canaries|fuerteventura|lanzarote|indonesie|mexique/;

  function detectRegion(text) {
    for (const [key, re] of Object.entries(REGION_WORDS)) if (re.test(text)) return key;
    if (ABROAD.test(text)) return "abroad";
    if (/\bfrance\b|\blac\b|annecy/.test(text)) return "other";
    return null;
  }

  const SPORT_LABELS = { surf: "Surf", voile: "Voile", kite: "Kite", paddle: "Paddle", windsurf: "Windsurf", wing: "Wing foil", autre: "Autre" };

  // « kitesurf » et « planche à voile » ne doivent pas compter comme du surf ou de la voile
  function detectSport(text) {
    const t = text.replace(/planche a voile/g, "windsurf");
    if (/\bsurf(er|eur|euse)?\b/.test(t)) return "surf";
    if (/\bvoile\b|deriveur|catamaran|\bnaviguer\b|\bvoilier\b/.test(t)) return "voile";
    if (/kite/.test(t)) return "kite";
    if (/paddle|\bsup\b/.test(t)) return "paddle";
    if (/windsurf/.test(t)) return "windsurf";
    if (/wing|foil/.test(t)) return "wing";
    return null;
  }

  // Termes repérés dans un texte, pour expliquer la note avec les mots du lead
  const found = (text, words) => Object.entries(words).filter(([, re]) => re.test(text)).map(([label]) => label);
  const list = (items) => items.slice(0, 3).join(", ");

  // Anciens leads du questionnaire à choix : mêmes champs que les réponses libres
  function fields(lead) {
    const a = lead.answers ?? {};
    if (lead.audience === "ecole") {
      return {
        about: a.school ?? "",
        booking: a.booking ?? { paper: "carnet", phone: "telephone", sheet: "excel", software: "logiciel" }[a.tool] ?? "",
        pain: a.pain ?? (a.calls >= 10 ? "appels" : ""),
        fill: a.fill ?? (a.empty == null ? "" : a.empty > 0 ? "creneaux vides" : "complet"),
        clients: a.clients ?? a.visibility ?? "",
        wish: a.wish ?? "",
        expected: 6,
      };
    }
    const legacyGoal = { camp: "stage", regular: "progresser", level: "progresser", try: "apprendre" }[a.goal];
    return {
      sport: a.sport ?? "",
      experience: a.experience ?? a.niveau ?? a.result?.level ?? "",
      goal: legacyGoal ?? a.goal ?? "",
      where: a.where ?? a.lieu ?? "",
      blocker: a.blocker ?? "",
      expected: 5,
    };
  }

  // Réponses détaillées : part des questions remplies et longueur moyenne
  function engagement(f) {
    const { expected, ...rest } = f;
    const texts = Object.values(rest).map((v) => String(v).trim()).filter(Boolean);
    if (!texts.length) return { ratio: 0, why: "Aucune réponse exploitable" };
    const filled = Math.min(1, texts.length / expected);
    const length = Math.min(1, texts.reduce((n, t) => n + t.length, 0) / texts.length / 80);
    const ratio = filled * 0.3 + length * 0.7;
    return { ratio, why: `${texts.length} réponses sur ${expected}, ${length > 0.6 ? "détaillées" : length > 0.3 ? "assez courtes" : "très courtes"}` };
  }

  function schoolCriteria(lead, f) {
    const all = norm(Object.values(f).join(" "));
    const booking = norm(f.booking);
    const manual = found(booking, { téléphone: /telephone|appel|\btel\b/, carnet: /carnet|papier|cahier/, Excel: /excel|tableur|sheet/, messages: /sms|whatsapp|message|instagram|facebook|e?mail/, "sur place": /sur place/ });
    const hasTool = /logiciel|plateforme|en ligne|site|fareharbor|regiondo|reservio|bookeo/.test(booking);
    const bookingCrit = manual.length && hasTool
      ? [0.6, `Déjà en partie en ligne, en plus de : ${list(manual)}`]
      : manual.length
        ? [1, `Réservations à la main : ${list(manual)}`]
        : hasTool
          ? [0.25, "A déjà un outil de réservation"]
          : booking
            ? [0.4, "Mode de réservation peu clair"]
            : [0, "Mode de réservation inconnu"];

    const pains = found(norm(`${f.pain} ${f.wish}`), { annulations: /annulation|meteo/, plannings: /planning|organis/, appels: /appel|telephone/, paiements: /paiement|encaiss/, relances: /relance|rappel/, "temps perdu": /temps|gestion|admin/ });
    const painCrit = pains.length >= 2 ? [1, `Douleurs que Glisse traite : ${list(pains)}`] : pains.length ? [0.7, `Douleur que Glisse traite : ${pains[0]}`] : norm(f.pain + f.wish).trim() ? [0.15, "Pas de douleur liée à notre offre"] : [0, "Aucune douleur exprimée"];

    const fill = norm(f.fill).trim();
    const fillCrit = !fill
      ? [0, "Remplissage inconnu"]
      : /^non\b|aucun|toujours (plein|complet)|complet|jamais vide/.test(fill)
        ? [0.15, "Cours déjà remplis"]
        : /vide|creuse|reste|manque|basse saison|moitie/.test(fill)
          ? [1, "Des créneaux restent à remplir"]
          : /\boui\b/.test(fill)
            ? [0.6, "Des créneaux vides, sans détail"]
            : [0.4, "Remplissage à préciser"];

    const clients = norm(f.clients);
    const word = /bouche|office|tourisme|flyer|passage/.test(clients);
    const online = /google|internet|instagram|site|reseaux/.test(clients);
    const clientsCrit = !clients.trim() ? [0, "Acquisition inconnue"] : word && online ? [0.75, "Visibilité en ligne encore partielle"] : word ? [1, "Dépend du bouche-à-oreille : Glisse apporte de la visibilité"] : online ? [0.55, "Déjà visible en ligne"] : [0.4, "Acquisition à préciser"];

    return [
      { key: "booking", label: "Réservation manuelle", max: 25, value: bookingCrit },
      { key: "pain", label: "Douleurs exprimées", max: 15, value: painCrit },
      { key: "fill", label: "Créneaux à remplir", max: 10, value: fillCrit },
      { key: "clients", label: "Besoin de visibilité", max: 10, value: clientsCrit },
      { key: "zone", label: "Zone couverte", max: 10, value: zoneValue(detectRegion(all), "L'école") },
    ];
  }

  function zoneValue(region, who) {
    if (region === "abroad") return [0.1, `${who} est hors de France`];
    if (region === "other") return [0.6, "En France, hors littoral prioritaire"];
    if (region) return [1, "Sur le littoral français visé"];
    return [0.35, "Lieu à confirmer"];
  }

  function riderCriteria(lead, f) {
    const sport = detectSport(norm(f.sport));
    const sportCrit = sport === "surf" || sport === "voile"
      ? [1, `${SPORT_LABELS[sport]} : ouvert en premier`]
      : sport
        ? [0.65, `${SPORT_LABELS[sport]} : ouvert dans un second temps`]
        : norm(f.sport).trim()
          ? [0.15, "Sport hors de notre offre"]
          : [0, "Sport inconnu"];

    const goal = norm(f.goal).trim();
    const concrete = /stage|semaine|cours|apprend|progress|vague|debout|cutback|take.off|navigu|autonom|initiation|essayer|premier/.test(goal);
    const goalCrit = !goal ? [0, "Pas d'objectif donné"] : concrete ? [1, "Objectif concret"] : goal.length > 15 ? [0.6, "Objectif à préciser"] : [0.25, "Objectif vague"];

    const where = norm(f.where);
    const region = detectRegion(where);
    const when = /janvier|fevrier|mars|avril|mai\b|juin|juillet|aout|septembre|octobre|novembre|decembre|ete|printemps|automne|hiver|vacances|week.?end|semaine|\d{1,2}\/\d{1,2}/.test(where);
    const [zone, zoneWhy] = zoneValue(region, "Le projet");
    const whereCrit = !where.trim() ? [0, "Ni lieu ni date"] : [zone * 0.6 + (when ? 0.4 : 0), `${zoneWhy}${when ? ", avec une date" : ", sans date"}`];

    const xp = norm(f.experience);
    const levelCrit = !xp.trim()
      ? [0.3, "Niveau inconnu"]
      : /confirme|expert|\bpro\b|depuis \d+ ans|competition/.test(xp)
        ? [0.4, "Confirmé : a moins besoin de cours"]
        : [1, "Débutant ou intermédiaire : notre cible"];

    const blocker = norm(f.blocker);
    const solved = found(blocker, { "peur du niveau": /peur|niveau|oser|apprehen/, "école à trouver": /trouv|dispo|ecole|choisir/, "manque d'infos": /info|savoir|comprend/, téléphone: /telephone|appel|repond/ });
    const blockerCrit = solved.length
      ? [1, `Frein que Glisse lève : ${list(solved)}`]
      : /prix|cher|budget/.test(blocker)
        ? [0.6, "Frein de prix : le premier cours offert peut aider"]
        : blocker.trim()
          ? [0.25, "Frein hors de notre portée"]
          : [0, "Frein inconnu"];

    return [
      { key: "sport", label: "Sport proposé", max: 15, value: sportCrit },
      { key: "where", label: "Lieu et date", max: 20, value: whereCrit },
      { key: "goal", label: "Projet concret", max: 15, value: goalCrit },
      { key: "blocker", label: "Frein levable", max: 15, value: blockerCrit },
      { key: "level", label: "Niveau visé", max: 5, value: levelCrit },
    ];
  }

  const CAPS = [
    ["injection_attempt", 10, "Tentative de manipulation dans les réponses"],
    ["fake_or_joke", 20, "Réponses fantaisistes"],
    ["disposable_email", 20, "Email jetable"],
    ["missing_info", 40, "Réponses trop courtes"],
  ];
  const BONUS = { replied: [6, "A répondu à notre email"], meeting: [10, "A accepté un rendez-vous"], won: [15, "Client gagné"] };

  function level(score) {
    if (score >= 75) return { level: "top", label: "Très compatible" };
    if (score >= 55) return { level: "good", label: "Compatible" };
    if (score >= 35) return { level: "mid", label: "À creuser" };
    return { level: "low", label: "Peu compatible" };
  }

  function scoreLead(lead) {
    const f = fields(lead);
    const isSchool = lead.audience === "ecole";
    const criteria = isSchool ? schoolCriteria(lead, f) : riderCriteria(lead, f);

    const eng = engagement(f);
    criteria.push({ key: "engagement", label: "Qualité des réponses", max: 20, value: [eng.ratio, eng.why] });
    if (lead.ai_priority != null) {
      criteria.push({ key: "ai", label: "Lecture par l'IA", max: 10, value: [Math.max(0, Math.min(100, lead.ai_priority)) / 100, `Gemini donne ${lead.ai_priority}/100`] });
    }

    const rows = criteria.map((c) => ({ key: c.key, label: c.label, max: c.max, points: Math.round(c.value[0] * c.max), ratio: c.value[0], why: c.value[1] }));
    const maxTotal = rows.reduce((n, r) => n + r.max, 0);
    const raw = (rows.reduce((n, r) => n + r.ratio * r.max, 0) / maxTotal) * 100;

    const notes = [];
    let score = raw;
    const bonus = BONUS[lead.status];
    if (bonus) {
      score += bonus[0];
      notes.push(`+${bonus[0]} : ${bonus[1]}`);
    }
    if (lead.status === "lost") {
      score = Math.min(score, 25);
      notes.push("Plafonné à 25 : lead perdu ou désinscrit");
    }
    for (const [flag, cap, why] of CAPS) {
      if ((lead.ai_flags ?? []).includes(flag)) {
        score = Math.min(score, cap);
        notes.push(`Plafonné à ${cap} : ${why}`);
      }
    }
    score = Math.max(0, Math.min(100, Math.round(score)));

    const text = norm(isSchool ? `${lead.school ?? ""} ${f.about}` : `${f.where}`);
    const sport = detectSport(norm(isSchool ? `${Object.values(f).join(" ")} ${lead.school ?? ""}` : f.sport));
    const legacyRegion = lead.answers?.region;
    const region = legacyRegion ?? detectRegion(text);
    const legacySport = lead.answers?.sport in SPORT_LABELS ? lead.answers.sport : null;

    return {
      score,
      ...level(score),
      rows,
      notes,
      maxTotal,
      region: region === "abroad" ? null : region,
      sportName: SPORT_LABELS[sport ?? legacySport] ?? null,
    };
  }

  globalThis.scoreLead = scoreLead;
})();
