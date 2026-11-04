// Chatbot du site : une petite bulle, des réponses écrites en direct par /api/chat.
// La conversation vit seulement dans cette page : rien n'est enregistré côté serveur.

(function () {
  const SUGGESTIONS = ["Quel cours pour débuter le surf ?", "C'est gratuit pour mon école ?", "Quand pourrai-je réserver ?"];
  const history = [];
  let busy = false;

  const root = document.createElement("div");
  root.className = "chat";
  root.innerHTML = `
    <button type="button" class="chat__open" aria-expanded="false" aria-controls="chat-panel">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg><span>Une question ?</span>
    </button>
    <section class="chat__panel" id="chat-panel" role="dialog" aria-label="Assistant Glisse" hidden>
      <header class="chat__head">
        <div><b>Assistant Glisse</b><small>IA, peut se tromper. N'écris pas de données sensibles.</small></div>
        <button type="button" class="chat__close" aria-label="Fermer">×</button>
      </header>
      <div class="chat__log" aria-live="polite"></div>
      <div class="chat__chips"></div>
      <form class="chat__form">
        <input name="q" type="text" maxlength="600" placeholder="Pose ta question…" aria-label="Ta question" autocomplete="off" required>
        <button type="submit" aria-label="Envoyer">→</button>
      </form>
    </section>`;
  document.body.append(root);

  const openBtn = root.querySelector(".chat__open");
  const panel = root.querySelector(".chat__panel");
  const log = root.querySelector(".chat__log");
  const chips = root.querySelector(".chat__chips");
  const form = root.querySelector(".chat__form");
  const input = form.elements.q;

  function bubble(role, text = "") {
    const el = document.createElement("p");
    el.className = `chat__msg chat__msg--${role}`;
    el.textContent = text; // textContent : le texte n'est jamais interprété comme du HTML
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function toggle(open) {
    panel.hidden = !open;
    openBtn.hidden = open;
    openBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      if (!log.children.length) {
        bubble("bot", "Salut ! Je réponds à tes questions sur Glisse et sur les cours de glisse. Qu'est-ce que tu veux savoir ?");
        chips.innerHTML = SUGGESTIONS.map((s) => `<button type="button">${s}</button>`).join("");
        if (typeof track === "function") track("chat_open");
      }
      input.focus();
    } else {
      openBtn.focus();
    }
  }

  async function ask(text) {
    if (busy || !text.trim()) return;
    busy = true;
    chips.innerHTML = "";
    input.value = "";
    bubble("user", text);
    history.push({ role: "user", text });
    const answer = bubble("bot");
    answer.classList.add("is-typing");
    let reply = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-12) }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let i;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, i).trim();
          buffer = buffer.slice(i + 1);
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.t === "text") {
            reply += event.v;
            answer.classList.remove("is-typing");
            answer.textContent = reply;
            log.scrollTop = log.scrollHeight;
          }
        }
      }
    } catch {
      reply ||= "La connexion a coupé. Réessaie dans un instant.";
      answer.textContent = reply;
    }
    answer.classList.remove("is-typing");
    history.push({ role: "bot", text: reply });
    busy = false;
    input.focus();
  }

  openBtn.addEventListener("click", () => toggle(true));
  root.querySelector(".chat__close").addEventListener("click", () => toggle(false));
  chips.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") ask(e.target.textContent);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(input.value);
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggle(false);
  });
})();
