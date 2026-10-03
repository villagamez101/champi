const $ = (sel) => document.querySelector(sel);

const FALLBACK_MODELS = [
  "deepseek-v4.1-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "glm-5.3-flash",
  "glm-5.3",
  "kimi-k2.7-code",
  "qwen3.7-plus",
];
const EXCLUDED_PREFIXES = ["gpt-", "grok-", "minimax-", "muse-", "omen-"];
const VISION_MODELS = new Set(["deepseek-v4-flash-vision-exp", "mimo-v2-omni"]);

const state = {
  conversations: [],
  currentId: null,
  messages: [],
  models: [],
  model: localStorage.getItem("champi_model") || "",
  attachments: [],
  streaming: false,
  controller: null,
};

/* ---------------- api ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error("No autorizado");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

/* ---------------- auth ---------------- */
function showLogin() {
  $("#app").classList.add("hidden");
  $("#login").classList.remove("hidden");
  $("#password").focus();
}

async function init() {
  const session = await fetch("/api/session").then((r) => r.json());
  if (!session.authed) return showLogin();
  startApp();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("#password").value }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      $("#login-error").textContent = d.error || "No se pudo entrar";
      return;
    }
    $("#password").value = "";
    startApp();
  } catch {
    $("#login-error").textContent = "Error de red";
  }
});

$("#logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  showLogin();
});

/* ---------------- boot ---------------- */
async function startApp() {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  await Promise.all([loadModels(), loadConversations()]);
}

async function loadModels() {
  let ids = FALLBACK_MODELS;
  try {
    const data = await api("/api/models");
    ids = (data.data || [])
      .map((m) => m.id)
      .filter((id) => !EXCLUDED_PREFIXES.some((p) => id.startsWith(p)));
    if (ids.length === 0) ids = FALLBACK_MODELS;
  } catch {
    /* use fallback */
  }
  state.models = ids;
  if (!state.model || !ids.includes(state.model)) {
    state.model = ids.includes("deepseek-v4.1-flash") ? "deepseek-v4.1-flash" : ids[0];
  }
  const select = $("#model");
  select.innerHTML = "";
  for (const id of ids) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id + (VISION_MODELS.has(id) ? " · visión" : "");
    select.appendChild(opt);
  }
  select.value = state.model;
  updateVisionWarn();
}

$("#model").addEventListener("change", (e) => {
  state.model = e.target.value;
  localStorage.setItem("champi_model", state.model);
  if (state.currentId) {
    api(`/api/conversations/${state.currentId}`, { method: "PATCH", body: { model: state.model } }).catch(() => {});
  }
  updateVisionWarn();
});

function updateVisionWarn() {
  const hasImages = state.attachments.length > 0;
  $("#vision-warn").classList.toggle("hidden", !(hasImages && !VISION_MODELS.has(state.model)));
}

/* ---------------- conversations ---------------- */
async function loadConversations() {
  state.conversations = await api("/api/conversations");
  renderConversations();
}

function renderConversations() {
  const nav = $("#conversations");
  nav.innerHTML = "";
  if (state.conversations.length === 0) {
    nav.innerHTML = '<div class="empty-list">Sin conversaciones</div>';
    return;
  }
  for (const conv of state.conversations) {
    const el = document.createElement("div");
    el.className = "conv" + (conv.id === state.currentId ? " active" : "");

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = conv.title;
    title.title = conv.title;
    title.addEventListener("dblclick", () => renameConv(conv));

    const actions = document.createElement("span");
    actions.className = "actions";
    const rename = document.createElement("button");
    rename.textContent = "✏️";
    rename.title = "Renombrar";
    rename.addEventListener("click", (e) => {
      e.stopPropagation();
      renameConv(conv);
    });
    const del = document.createElement("button");
    del.textContent = "🗑";
    del.title = "Eliminar";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("¿Eliminar esta conversación?")) return;
      await api(`/api/conversations/${conv.id}`, { method: "DELETE" });
      if (state.currentId === conv.id) newChat();
      await loadConversations();
    });
    actions.append(rename, del);

    el.append(title, actions);
    el.addEventListener("click", () => openConversation(conv.id));
    nav.appendChild(el);
  }
}

async function renameConv(conv) {
  const name = prompt("Nuevo nombre:", conv.title);
  if (!name || name === conv.title) return;
  await api(`/api/conversations/${conv.id}`, { method: "PATCH", body: { title: name } });
  await loadConversations();
}

async function openConversation(id) {
  state.currentId = id;
  const data = await api(`/api/conversations/${id}`);
  state.messages = data.messages;
  if (data.model) {
    state.model = data.model;
    $("#model").value = data.model;
  }
  renderConversations();
  renderMessages();
  closeSidebar();
}

function newChat() {
  state.currentId = null;
  state.messages = [];
  renderConversations();
  renderMessages();
  closeSidebar();
  $("#input").focus();
}

$("#new-chat").addEventListener("click", newChat);

/* ---------------- messages ---------------- */
function renderMessages() {
  const box = $("#messages");
  box.innerHTML = "";
  if (!state.currentId || state.messages.length === 0) {
    box.innerHTML =
      '<div class="empty" id="empty-state"><h2>¿En qué te ayudo hoy?</h2><p>Escribe, pega o adjunta una imagen.</p></div>';
    return;
  }
  for (const msg of state.messages) box.appendChild(messageEl(msg));
  scrollToBottom();
}

function messageEl(msg) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${msg.role}`;
  const role = document.createElement("div");
  role.className = "role";
  role.textContent = msg.role === "user" ? "Tú" : "Champi";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.dataset.role = msg.role;
  fillBubble(bubble, msg.content);
  wrap.append(role, bubble);
  return wrap;
}

function fillBubble(bubble, parts, streaming = false) {
  bubble.innerHTML = "";
  for (const part of parts || []) {
    if (part.type === "image") {
      const img = document.createElement("img");
      img.className = "attached";
      img.src = part.url;
      img.alt = "imagen adjunta";
      bubble.appendChild(img);
    } else if (part.type === "text") {
      if (bubble.dataset.role === "user") {
        const p = document.createElement("div");
        p.style.whiteSpace = "pre-wrap";
        p.textContent = part.text;
        bubble.appendChild(p);
      } else {
        const div = document.createElement("div");
        div.innerHTML = DOMPurify.sanitize(marked.parse(part.text, { gfm: true, breaks: true }));
        div.querySelectorAll("pre code").forEach((el) => hljs.highlightElement(el));
        bubble.appendChild(div);
      }
    }
  }
  bubble.classList.toggle("streaming", streaming);
}

function appendAssistant(parts) {
  const empty = $("#empty-state");
  if (empty) empty.remove();
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";
  wrap.innerHTML = '<div class="role">Champi</div>';
  const bubble = document.createElement("div");
  bubble.className = "bubble streaming";
  bubble.dataset.role = "assistant";
  wrap.appendChild(bubble);
  $("#messages").appendChild(wrap);
  scrollToBottom();
  return bubble;
}

function scrollToBottom() {
  const box = $("#messages");
  box.scrollTop = box.scrollHeight;
}

/* ---------------- attachments ---------------- */
function addImage(dataUrl, mime, name) {
  state.attachments.push({ dataUrl, mime, name });
  renderAttachments();
}

function renderAttachments() {
  const box = $("#attachments");
  box.innerHTML = "";
  state.attachments.forEach((att, i) => {
    const el = document.createElement("div");
    el.className = "att";
    const img = document.createElement("img");
    img.src = att.dataUrl;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      state.attachments.splice(i, 1);
      renderAttachments();
    });
    el.append(img, rm);
    box.appendChild(el);
  });
  updateVisionWarn();
}

function readFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const reader = new FileReader();
    reader.onload = () => addImage(reader.result, file.type, file.name);
    reader.readAsDataURL(file);
  }
}

$("#attach").addEventListener("click", () => $("#file").click());
$("#file").addEventListener("change", (e) => {
  readFiles(e.target.files);
  e.target.value = "";
});

/* ---------------- composer ---------------- */
const input = $("#input");
input.addEventListener("input", autoGrow);
function autoGrow() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 200) + "px";
}
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
input.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.items || [])]
    .filter((it) => it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  if (files.length) {
    e.preventDefault();
    readFiles(files);
  }
});

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  send();
});

$("#stop").addEventListener("click", () => state.controller?.abort());

async function send() {
  if (state.streaming) return;
  const text = input.value.trim();
  if (!text && state.attachments.length === 0) return;

  if (!state.currentId) {
    const conv = await api("/api/conversations", { method: "POST", body: { model: state.model } });
    state.currentId = conv.id;
  }

  const parts = [];
  if (text) parts.push({ type: "text", text });
  for (const att of state.attachments) parts.push({ type: "image", dataUrl: att.dataUrl, mime: att.mime });

  state.messages.push({ role: "user", content: parts });
  renderMessages();
  input.value = "";
  autoGrow();
  state.attachments = [];
  renderAttachments();

  await stream(parts);
}

async function stream(parts) {
  state.streaming = true;
  setComposerBusy(true);
  const bubble = appendAssistant();
  state.controller = new AbortController();
  let full = "";

  try {
    const res = await fetch(`/api/conversations/${state.currentId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parts, model: state.model }),
      signal: state.controller.signal,
    });
    if (res.status === 401) {
      showLogin();
      return;
    }
    if (!res.ok || !res.body) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";
      for (const block of blocks) {
        const ev = { event: "message", data: "" };
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) ev.event = line.slice(6).trim();
          else if (line.startsWith("data:")) ev.data += line.slice(5).trim();
        }
        if (!ev.data) continue;
        const payload = JSON.parse(ev.data);
        if (ev.event === "delta") {
          full += payload.text;
          fillBubble(bubble, [{ type: "text", text: full }], true);
          scrollToBottom();
        } else if (ev.event === "done") {
          fillBubble(bubble, [{ type: "text", text: payload.content || full }], false);
        } else if (ev.event === "error") {
          bubble.classList.remove("streaming");
          const err = document.createElement("div");
          err.className = "err";
          err.textContent = `⚠ ${payload.error}`;
          bubble.appendChild(err);
        }
      }
    }
  } catch (err) {
    bubble.classList.remove("streaming");
    if (err.name !== "AbortError") {
      const e = document.createElement("div");
      e.className = "err";
      e.textContent = `⚠ ${err.message}`;
      bubble.appendChild(e);
    }
  } finally {
    bubble.classList.remove("streaming");
    state.streaming = false;
    state.controller = null;
    setComposerBusy(false);
    await Promise.all([refreshCurrent(), loadConversations()]);
  }
}

async function refreshCurrent() {
  if (!state.currentId) return;
  try {
    const data = await api(`/api/conversations/${state.currentId}`);
    state.messages = data.messages;
  } catch {
    /* ignore */
  }
}

function setComposerBusy(busy) {
  $("#send").classList.toggle("hidden", busy);
  $("#stop").classList.toggle("hidden", !busy);
}

/* ---------------- mobile sidebar ---------------- */
$("#toggle-sidebar").addEventListener("click", () => {
  $("#sidebar").classList.toggle("open");
  $("#scrim").classList.toggle("hidden", !$("#sidebar").classList.contains("open"));
});
$("#scrim").addEventListener("click", closeSidebar);
function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#scrim").classList.add("hidden");
}

init();
