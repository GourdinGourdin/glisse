// Comportements communs à toutes les pages : nav, animations au scroll, onglets.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- Nav ---------- */

const nav = document.querySelector(".nav");
const bar = document.querySelector(".scrollbar i");
const sun = document.querySelector(".hero__sun");

function onScroll() {
  const y = scrollY;
  nav.classList.toggle("is-scrolled", y > 24);
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  if (sun && !reduceMotion && y < innerHeight) sun.style.transform = `translate3d(0, ${y * 0.35}px, 0)`;
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

const burger = document.querySelector(".nav__burger");
burger.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  burger.setAttribute("aria-expanded", open);
});
nav.querySelectorAll(".nav__links a").forEach((a) =>
  a.addEventListener("click", () => {
    nav.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
  })
);

/* ---------- Titres mot par mot ---------- */

// Découpe chaque titre .split en mots, pour les faire monter un par un
document.querySelectorAll(".split").forEach((el) => {
  let i = 0;
  const wrap = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(part);
          const w = document.createElement("span");
          w.className = "w";
          w.innerHTML = `<span style="--i:${i++}">${part}</span>`;
          frag.append(w);
        });
        child.replaceWith(frag);
      } else {
        wrap(child);
      }
    });
  };
  wrap(el);
  el.classList.add("reveal");
});

/* ---------- Apparition au scroll ---------- */

const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    }),
  { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---------- Téléphone qui suit la souris ---------- */

const tilt = document.querySelector("[data-tilt]");
if (tilt && !reduceMotion && matchMedia("(hover: hover)").matches) {
  const hero = tilt.closest(".hero");
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    tilt.style.setProperty("--rx", `${-y * 8}deg`);
    tilt.style.setProperty("--ry", `${x * 10}deg`);
  });
  hero.addEventListener("pointerleave", () => {
    tilt.style.setProperty("--rx", "0deg");
    tilt.style.setProperty("--ry", "0deg");
  });
}

/* ---------- Onglets de la page À propos ---------- */

const tabs = document.querySelector(".tabs");
if (tabs) {
  const links = [...tabs.querySelectorAll(".tabs__link")];
  const ink = tabs.querySelector(".tabs__ink");
  const sections = links.map((l) => document.querySelector(l.getAttribute("href")));

  const setActive = (link) => {
    links.forEach((l) => l.classList.toggle("is-active", l === link));
    ink.style.width = `${link.offsetWidth}px`;
    ink.style.transform = `translateX(${link.offsetLeft}px)`;
    const inner = link.parentElement;
    inner.scrollTo({ left: link.offsetLeft - (inner.clientWidth - link.offsetWidth) / 2, behavior: reduceMotion ? "auto" : "smooth" });
  };

  const spy = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) setActive(links[sections.indexOf(e.target)]);
      }),
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach((s) => spy.observe(s));
  addEventListener("resize", () => setActive(tabs.querySelector(".is-active")));
  requestAnimationFrame(() => setActive(tabs.querySelector(".is-active")));
}
