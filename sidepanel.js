const addNodeBtn = document.getElementById("addNodeBtn");
const settingsBtn = document.getElementById("settingsBtn");
const playBtn = document.getElementById("playBtn");

const modalBackdrop = document.getElementById("modalBackdrop");
const closeModalBtn = document.getElementById("closeModalBtn");
const addSwitchTabNode = document.getElementById("addSwitchTabNode");
const addDelayNode = document.getElementById("addDelayNode");

const settingsBackdrop = document.getElementById("settingsBackdrop");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const globalDelayInput = document.getElementById("globalDelayInput");

const actionsList = document.getElementById("actionsList");
const statusEl = document.getElementById("status");

// State
let state = {
  settings: {
    globalDelaySec: 0.2
  },
  actions: []
  // action:
  // { id, type: "switchTab"|"delay", collapsed: true, jsonOpen: false, tab?, delaySec? }
};

let runState = {
  running: false,
  currentId: null,
  doneIds: new Set()
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function showStatus(text, ms = 1800) {
  statusEl.textContent = text;
  statusEl.classList.remove("hidden");
  window.clearTimeout(showStatus._t);
  showStatus._t = window.setTimeout(() => statusEl.classList.add("hidden"), ms);
}

async function loadState() {
  const res = await chrome.storage.local.get("autolineState");
  if (res.autolineState) state = res.autolineState;

  // Defaults (in case older saved state)
  state.settings ||= { globalDelaySec: 0.2 };
  if (typeof state.settings.globalDelaySec !== "number") state.settings.globalDelaySec = 0.2;

  for (const a of state.actions) {
    if (typeof a.collapsed !== "boolean") a.collapsed = true;
    if (typeof a.jsonOpen !== "boolean") a.jsonOpen = false;
    if (a.type === "delay" && typeof a.delaySec !== "number") a.delaySec = 1;
  }

  render();
}

async function saveState() {
  await chrome.storage.local.set({ autolineState: state });
}

function openModal() {
  modalBackdrop.classList.remove("hidden");
}
function closeModal() {
  modalBackdrop.classList.add("hidden");
}

function openSettings() {
  globalDelayInput.value = String(state.settings.globalDelaySec ?? 0.2);
  settingsBackdrop.classList.remove("hidden");
}
function closeSettings() {
  settingsBackdrop.classList.add("hidden");
}

addNodeBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
settingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
settingsBackdrop.addEventListener("click", (e) => {
  if (e.target === settingsBackdrop) closeSettings();
});

saveSettingsBtn.addEventListener("click", async () => {
  const v = Number(globalDelayInput.value);
  state.settings.globalDelaySec = Number.isFinite(v) && v >= 0 ? v : 0.2;
  await saveState();
  closeSettings();
  showStatus("✅ Settings saved");
});

addSwitchTabNode.addEventListener("click", async () => {
  const action = { id: uid(), type: "switchTab", collapsed: true, jsonOpen: false, tab: null };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Switch Tab node added");
});

addDelayNode.addEventListener("click", async () => {
  const action = { id: uid(), type: "delay", collapsed: true, jsonOpen: false, delaySec: 1 };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Delay node added");
});

playBtn.addEventListener("click", async () => {
  if (runState.running) {
    showStatus("⏳ Already running…");
    return;
  }

  // Basic validation for switchTab nodes
  for (const a of state.actions) {
    if (a.type === "switchTab" && !a.tab?.tabId) {
      showStatus("⚠️ A Switch Tab node has no tab selected");
      a.collapsed = false;
      await saveState();
      render();
      return;
    }
  }

  runState.running = true;
  runState.currentId = null;
  runState.doneIds = new Set();
  render();

  await chrome.runtime.sendMessage({
    type: "RUN_FLOW",
    actions: state.actions,
    settings: state.settings
  });

  showStatus("▶️ Running flow…", 1200);
});

function iconChevron() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"></path>
    </svg>
  `;
}

function iconClose() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"></path>
    </svg>
  `;
}

function buildJsonForAction(action) {
  if (action.type === "switchTab") {
    return {
      type: "switchTab",
      tabId: action.tab?.tabId ?? null,
      windowId: action.tab?.windowId ?? null,
      meta: { title: action.tab?.title ?? "", url: action.tab?.url ?? "" }
    };
  }
  if (action.type === "delay") {
    return { type: "delay", delaySec: action.delaySec ?? 1 };
  }
  return { type: action.type };
}

function render() {
  actionsList.innerHTML = "";

  if (!state.actions.length) {
    const empty = document.createElement("div");
    empty.className = "pill";
    empty.textContent = "No actions yet. Click + to add a node.";
    actionsList.appendChild(empty);
    return;
  }

  state.actions.forEach((action, idx) => {
    actionsList.appendChild(renderTimelineItem(action, idx, idx === state.actions.length - 1));
  });
}

function renderTimelineItem(action, idx, isLast) {
  const tItem = document.createElement("div");
  tItem.className = "tItem";

  // Running visuals
  if (runState.running && runState.currentId === action.id) tItem.classList.add("running");
  if (runState.doneIds.has(action.id)) tItem.classList.add("done");

  const rail = document.createElement("div");
  rail.className = "tRail";

  const line = document.createElement("div");
  line.className = "tLine";
  // shorten last line a bit for nicer look
  if (isLast) line.style.bottom = "18px";

  const dot = document.createElement("div");
  dot.className = "tDot";

  rail.appendChild(line);
  rail.appendChild(dot);

  const card = document.createElement("div");
  card.className = "card" + (action.collapsed ? " collapsed" : "");

  const header = document.createElement("div");
  header.className = "cardHeader";

  const caret = document.createElement("div");
  caret.className = "caret";
  caret.innerHTML = iconChevron();

  const title = document.createElement("div");
  title.className = "headerTitle";
  title.textContent = action.type === "switchTab" ? "Switch Tab" : "Delay";

  const sub = document.createElement("span");
  sub.className = "headerSub";
  sub.textContent =
    action.type === "switchTab"
      ? (action.tab ? `• ${truncate(action.tab.title || action.tab.url || "Tab")}` : "• not set")
      : `• ${Number(action.delaySec ?? 1)} sec`;

  const headerRight = document.createElement("div");
  headerRight.className = "headerRight";

  const del = document.createElement("button");
  del.className = "deleteBtn";
  del.setAttribute("aria-label", "Delete action");
  del.innerHTML = iconClose();

  del.addEventListener("click", async (e) => {
    e.stopPropagation();
    state.actions = state.actions.filter((a) => a.id !== action.id);
    await saveState();
    render();
    showStatus("🗑️ Action deleted");
  });

  headerRight.appendChild(del);

  header.appendChild(caret);
  header.appendChild(title);
  header.appendChild(sub);
  header.appendChild(headerRight);

  header.addEventListener("click", async () => {
    action.collapsed = !action.collapsed;
    await saveState();
    render();
  });

  const body = document.createElement("div");
  body.className = "cardBody";

  // Body top row: controls + delete
  const bodyTopRow = document.createElement("div");
  bodyTopRow.className = "row";
  bodyTopRow.style.justifyContent = "space-between";

  const left = document.createElement("div");
  left.className = "row";

  if (action.type === "switchTab") {
    const pickBtn = document.createElement("button");
    pickBtn.className = "btn";
    pickBtn.textContent = "Pick Tab";

    pickBtn.addEventListener("click", async () => {
      const win = await chrome.windows.getCurrent();
      await chrome.runtime.sendMessage({
        type: "ARM_PICK_TAB",
        actionId: action.id,
        windowId: win.id
      });
      showStatus("👉 Click the tab you want to record");
    });

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = action.tab
      ? `Picked: ${action.tab.title || "(no title)"} — ${action.tab.url || ""}`
      : "No tab selected";

    left.appendChild(pickBtn);
    left.appendChild(pill);
  }

  if (action.type === "delay") {
    const label = document.createElement("div");
    label.className = "pill";
    label.textContent = "Delay (sec)";

    const input = document.createElement("input");
    input.className = "input";
    input.type = "number";
    input.step = "0.1";
    input.min = "0";
    input.style.width = "120px";
    input.value = String(action.delaySec ?? 1);

    input.addEventListener("change", async () => {
      const v = Number(input.value);
      action.delaySec = Number.isFinite(v) && v >= 0 ? v : 1;
      await saveState();
      render();
    });

    left.appendChild(label);
    left.appendChild(input);
  }

  const del2 = document.createElement("button");
  del2.className = "deleteBtn";
  del2.setAttribute("aria-label", "Delete action");
  del2.style.opacity = "1";
  del2.innerHTML = iconClose();
  del2.addEventListener("click", async () => {
    state.actions = state.actions.filter((a) => a.id !== action.id);
    await saveState();
    render();
    showStatus("🗑️ Action deleted");
  });

  bodyTopRow.appendChild(left);
  bodyTopRow.appendChild(del2);

  // JSON toggle (hidden by default)
  const jsonToggleRow = document.createElement("div");
  jsonToggleRow.className = "row";
  jsonToggleRow.style.marginTop = "10px";

  const jsonBtn = document.createElement("button");
  jsonBtn.className = "jsonToggle";
  jsonBtn.textContent = action.jsonOpen ? "Hide JSON" : "Show JSON";

  jsonBtn.addEventListener("click", async () => {
    action.jsonOpen = !action.jsonOpen;
    await saveState();
    render();
  });

  jsonToggleRow.appendChild(jsonBtn);

  body.appendChild(bodyTopRow);
  body.appendChild(jsonToggleRow);

  if (action.jsonOpen) {
    const box = document.createElement("div");
    box.className = "jsonBox";
    box.textContent = JSON.stringify(buildJsonForAction(action), null, 2);
    body.appendChild(box);
  }

  card.appendChild(header);
  card.appendChild(body);

  tItem.appendChild(rail);
  tItem.appendChild(card);

  return tItem;
}

function truncate(s, n = 28) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Listen for picked tab + flow progress
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "TAB_PICKED") {
    const action = state.actions.find((a) => a.id === msg.actionId);
    if (!action) return;

    action.tab = msg.payload;
    action.collapsed = false;
    saveState().then(() => {
      render();
      showStatus("✅ Tab recorded");
    });
  }

  if (msg?.type === "FLOW_START") {
    runState.running = true;
    runState.currentId = null;
    runState.doneIds = new Set();
    render();
  }

  if (msg?.type === "FLOW_STEP_START") {
    runState.currentId = msg.actionId;
    render();
  }

  if (msg?.type === "FLOW_STEP_END") {
    runState.doneIds.add(msg.actionId);
    runState.currentId = null;
    render();
  }

  if (msg?.type === "FLOW_END") {
    runState.running = false;
    runState.currentId = null;
    render();
    showStatus("✅ Flow complete");
  }

  if (msg?.type === "FLOW_ERROR") {
    runState.running = false;
    runState.currentId = null;
    render();
    showStatus("❌ Flow error: " + msg.error, 3500);
  }
});

// Boot
loadState();
