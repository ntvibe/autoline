const addNodeBtn = document.getElementById("addNodeBtn");
const settingsBtn = document.getElementById("settingsBtn");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");

const modalBackdrop = document.getElementById("modalBackdrop");
const closeModalBtn = document.getElementById("closeModalBtn");
const addSwitchTabNode = document.getElementById("addSwitchTabNode");
const addDelayNode = document.getElementById("addDelayNode");
const addOpenUrlNode = document.getElementById("addOpenUrlNode");
const addClickNode = document.getElementById("addClickNode");
const addReloadTabNode = document.getElementById("addReloadTabNode");
const addSimpleLoopNode = document.getElementById("addSimpleLoopNode");

const settingsBackdrop = document.getElementById("settingsBackdrop");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const globalDelayInput = document.getElementById("globalDelayInput");
const themeSelect = document.getElementById("themeSelect");
const pointerSizeInput = document.getElementById("pointerSizeInput");
const pointerFillInput = document.getElementById("pointerFillInput");
const pointerOutlineInput = document.getElementById("pointerOutlineInput");
const pointerOutlineColorInput = document.getElementById("pointerOutlineColorInput");
const pointerShadowToggle = document.getElementById("pointerShadowToggle");
const pointerShadowOpacityInput = document.getElementById("pointerShadowOpacityInput");
const pointerShadowBlurInput = document.getElementById("pointerShadowBlurInput");

const actionsList = document.getElementById("actionsList");
const statusEl = document.getElementById("status");

// State
let state = {
  settings: {
    globalDelaySec: 1,
    themeMode: "auto",
    pointerSizePx: 32,
    pointerFill: "#000000",
    pointerOutlinePx: 2,
    pointerOutlineColor: "#ffffff",
    pointerShadowEnabled: true,
    pointerShadowOpacity: 0.25,
    pointerShadowBlur: 8
  },
  actions: []
  // action:
  // { id, type: "switchTab"|"delay"|"openUrl"|"click"|"reloadTab"|"simpleLoop", collapsed: true, jsonOpen: false }
};

let runState = {
  status: "idle",
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
  state.settings ||= { globalDelaySec: 1 };
  if (typeof state.settings.globalDelaySec !== "number") state.settings.globalDelaySec = 1;
  if (!["auto", "light", "dark"].includes(state.settings.themeMode)) {
    state.settings.themeMode = "auto";
  }
  if (typeof state.settings.pointerSizePx !== "number") state.settings.pointerSizePx = 32;
  if (typeof state.settings.pointerFill !== "string") state.settings.pointerFill = "#000000";
  if (typeof state.settings.pointerOutlinePx !== "number") state.settings.pointerOutlinePx = 2;
  if (typeof state.settings.pointerOutlineColor !== "string") {
    state.settings.pointerOutlineColor = "#ffffff";
  }
  if (typeof state.settings.pointerShadowEnabled !== "boolean") {
    state.settings.pointerShadowEnabled = true;
  }
  if (typeof state.settings.pointerShadowOpacity !== "number") {
    state.settings.pointerShadowOpacity = 0.25;
  }
  if (typeof state.settings.pointerShadowBlur !== "number") {
    state.settings.pointerShadowBlur = 8;
  }

  for (const a of state.actions) {
    if (typeof a.collapsed !== "boolean") a.collapsed = true;
    if (typeof a.jsonOpen !== "boolean") a.jsonOpen = false;
    if (a.type === "delay" && typeof a.delaySec !== "number") a.delaySec = 1;
    if (a.type === "openUrl" && typeof a.url !== "string") a.url = "";
    if (a.type === "click") {
      if (!a.target) a.target = null;
      if (!a.click) a.click = null;
    }
    if (a.type === "simpleLoop" && typeof a.enabled !== "boolean") a.enabled = true;
  }

  render();
  applyTheme(state.settings.themeMode);
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
  globalDelayInput.value = String(state.settings.globalDelaySec ?? 1);
  themeSelect.value = state.settings.themeMode ?? "auto";
  pointerSizeInput.value = String(state.settings.pointerSizePx ?? 32);
  pointerFillInput.value = state.settings.pointerFill ?? "#000000";
  pointerOutlineInput.value = String(state.settings.pointerOutlinePx ?? 2);
  pointerOutlineColorInput.value = state.settings.pointerOutlineColor ?? "#ffffff";
  pointerShadowToggle.checked = state.settings.pointerShadowEnabled !== false;
  pointerShadowOpacityInput.value = String(Math.round((state.settings.pointerShadowOpacity ?? 0.25) * 100));
  pointerShadowBlurInput.value = String(state.settings.pointerShadowBlur ?? 8);
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
  state.settings.globalDelaySec = Number.isFinite(v) && v >= 0 ? v : 1;
  state.settings.themeMode = themeSelect.value ?? "auto";
  const pointerSize = Number(pointerSizeInput.value);
  state.settings.pointerSizePx = Number.isFinite(pointerSize) && pointerSize > 0 ? pointerSize : 32;
  state.settings.pointerFill = pointerFillInput.value || "#000000";
  const outlineSize = Number(pointerOutlineInput.value);
  state.settings.pointerOutlinePx = Number.isFinite(outlineSize) && outlineSize >= 0 ? outlineSize : 2;
  state.settings.pointerOutlineColor = pointerOutlineColorInput.value || "#ffffff";
  state.settings.pointerShadowEnabled = pointerShadowToggle.checked;
  const shadowOpacity = Number(pointerShadowOpacityInput.value);
  state.settings.pointerShadowOpacity = Number.isFinite(shadowOpacity)
    ? Math.min(1, Math.max(0, shadowOpacity / 100))
    : 0.25;
  const shadowBlur = Number(pointerShadowBlurInput.value);
  state.settings.pointerShadowBlur = Number.isFinite(shadowBlur) && shadowBlur >= 0 ? shadowBlur : 8;
  applyTheme(state.settings.themeMode);
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

addOpenUrlNode.addEventListener("click", async () => {
  const action = { id: uid(), type: "openUrl", collapsed: true, jsonOpen: false, url: "" };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Open URL node added");
});

addClickNode.addEventListener("click", async () => {
  const action = { id: uid(), type: "click", collapsed: true, jsonOpen: false, target: null, click: null };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Click node added");
});

addReloadTabNode.addEventListener("click", async () => {
  const action = { id: uid(), type: "reloadTab", collapsed: true, jsonOpen: false };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Reload Tab node added");
});

addSimpleLoopNode.addEventListener("click", async () => {
  const action = { id: uid(), type: "simpleLoop", collapsed: true, jsonOpen: false, enabled: true };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Simple Loop node added");
});

playBtn.addEventListener("click", async () => {
  if (runState.status === "running") {
    await chrome.runtime.sendMessage({ type: "PAUSE_FLOW" });
    runState.status = "paused";
    render();
    showStatus("⏸️ Paused");
    return;
  }

  if (runState.status === "paused") {
    await chrome.runtime.sendMessage({ type: "RESUME_FLOW" });
    runState.status = "running";
    render();
    showStatus("▶️ Resumed");
    return;
  }

  // Basic validation for switchTab/openUrl nodes
  for (const a of state.actions) {
    if (a.type === "switchTab" && !a.tab?.tabId) {
      showStatus("⚠️ A Switch Tab node has no tab selected");
      a.collapsed = false;
      await saveState();
      render();
      return;
    }
    if (a.type === "openUrl" && !a.url?.trim()) {
      showStatus("⚠️ An Open URL node is missing a URL");
      a.collapsed = false;
      await saveState();
      render();
      return;
    }
    if (a.type === "click" && (!a.target || !a.click)) {
      showStatus("⚠️ A Click node has no recorded target");
      a.collapsed = false;
      await saveState();
      render();
      return;
    }
  }

  runState.status = "running";
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

stopBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP_FLOW" });
  runState.status = "idle";
  runState.currentId = null;
  runState.doneIds = new Set();
  render();
  showStatus("⏹️ Stopped");
});

function iconChevron() {
  return `
    <span class="material-icons" aria-hidden="true">chevron_right</span>
  `;
}

function iconClose() {
  return `
    <span class="material-icons" aria-hidden="true">close</span>
  `;
}

function iconDelete() {
  return `
    <span class="material-icons" aria-hidden="true">delete</span>
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
  if (action.type === "openUrl") {
    return { type: "openUrl", url: action.url ?? "" };
  }
  if (action.type === "click") {
    return {
      type: "click",
      target: action.target ?? null,
      click: action.click ?? null
    };
  }
  if (action.type === "reloadTab") {
    return { type: "reloadTab" };
  }
  if (action.type === "simpleLoop") {
    return { type: "simpleLoop", enabled: action.enabled ?? true };
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
    setPlayButtonState();
    return;
  }

  state.actions.forEach((action, idx) => {
    actionsList.appendChild(renderTimelineItem(action, idx, idx === state.actions.length - 1));
  });

  setPlayButtonState();
}

function renderTimelineItem(action, idx, isLast) {
  const tItem = document.createElement("div");
  tItem.className = "tItem";
  tItem.dataset.actionId = action.id;

  // Running visuals
  if (runState.status === "running" && runState.currentId === action.id) tItem.classList.add("running");
  if (runState.status === "paused" && runState.currentId === action.id) tItem.classList.add("paused");
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

  const dragHandle = document.createElement("div");
  dragHandle.className = "dragHandle";
  dragHandle.setAttribute("aria-label", "Drag to reorder");
  dragHandle.innerHTML = `<span class="material-icons" aria-hidden="true">more_vert</span>`;
  dragHandle.draggable = true;
  dragHandle.addEventListener("click", (e) => e.stopPropagation());

  const caret = document.createElement("div");
  caret.className = "caret";
  caret.innerHTML = iconChevron();

  const title = document.createElement("div");
  title.className = "headerTitle";
  if (action.type === "switchTab") title.textContent = "Switch Tab";
  if (action.type === "delay") title.textContent = "Delay";
  if (action.type === "openUrl") title.textContent = "Open URL";
  if (action.type === "click") title.textContent = "Click";
  if (action.type === "reloadTab") title.textContent = "Reload Tab";
  if (action.type === "simpleLoop") title.textContent = "Simple Loop";

  const sub = document.createElement("span");
  sub.className = "headerSub";
  if (action.type === "switchTab") {
    sub.textContent = action.tab
      ? `• ${truncate(action.tab.title || action.tab.url || "Tab")}`
      : "• not set";
  }
  if (action.type === "delay") {
    sub.textContent = `• ${Number(action.delaySec ?? 1)} sec`;
  }
  if (action.type === "openUrl") {
    sub.textContent = action.url ? `• ${truncate(action.url, 32)}` : "• not set";
  }
  if (action.type === "click") {
    sub.textContent = action.target ? `• ${truncate(action.target.label || \"target\", 32)}` : \"• not set\";
  }
  if (action.type === "reloadTab") {
    sub.textContent = "• active tab";
  }
  if (action.type === "simpleLoop") {
    sub.textContent = action.enabled ? "• enabled" : "• disabled";
  }

  const headerRight = document.createElement("div");
  headerRight.className = "headerRight";

  const del = document.createElement("button");
  del.className = "deleteBtn";
  del.setAttribute("aria-label", "Delete action");
  del.innerHTML = iconDelete();

  del.addEventListener("click", async (e) => {
    e.stopPropagation();
    state.actions = state.actions.filter((a) => a.id !== action.id);
    await saveState();
    render();
    showStatus("🗑️ Action deleted");
  });

  headerRight.appendChild(del);

  header.appendChild(dragHandle);
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

  if (action.type === "openUrl") {
    const label = document.createElement("div");
    label.className = "pill";
    label.textContent = "Target URL";

    const input = document.createElement("input");
    input.className = "input";
    input.type = "text";
    input.placeholder = "https://example.com";
    input.style.minWidth = "220px";
    input.value = action.url ?? "";

    input.addEventListener("change", async () => {
      action.url = input.value.trim();
      await saveState();
      render();
    });

    left.appendChild(label);
    left.appendChild(input);
  }

  if (action.type === "click") {
    const recordBtn = document.createElement("button");
    recordBtn.className = "btn primary";
    recordBtn.textContent = "Record click";

    recordBtn.addEventListener("click", async () => {
      const tab = await getActiveTab();
      if (!tab) {
        showStatus("⚠️ No active tab to record.");
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { type: "ARM_CLICK_RECORD", actionId: action.id });
      showStatus("🎯 Click on the page to record");
    });

    const showBtn = document.createElement("button");
    showBtn.className = "btn";
    showBtn.textContent = "Show click";
    showBtn.disabled = !action.target;

    showBtn.addEventListener("click", async () => {
      if (!action.target || !action.click) {
        showStatus("⚠️ Record a click first.");
        return;
      }
      const tab = await getActiveTab();
      if (!tab) {
        showStatus("⚠️ No active tab to preview.");
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_CLICK_PREVIEW", action });
    });

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn";
    resetBtn.textContent = "Reset selection";
    resetBtn.disabled = !action.target;
    resetBtn.addEventListener("click", async () => {
      action.target = null;
      action.click = null;
      await saveState();
      render();
      showStatus("↩️ Click selection reset");
    });

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = action.target
      ? `Recorded: ${truncate(action.target.label || action.target.selectors?.[0] || "target", 36)}`
      : "No click recorded";

    left.appendChild(recordBtn);
    left.appendChild(showBtn);
    left.appendChild(resetBtn);
    left.appendChild(pill);
  }

  if (action.type === "reloadTab") {
    const label = document.createElement("div");
    label.className = "pill";
    label.textContent = "Reload the active tab.";
    left.appendChild(label);
  }

  if (action.type === "simpleLoop") {
    const label = document.createElement("div");
    label.className = "pill";
    label.textContent = "Loop the entire flow";

    const toggle = document.createElement("button");
    toggle.className = "btn toggle" + (action.enabled ? " active" : "");
    toggle.type = "button";
    toggle.textContent = action.enabled ? "Enabled" : "Disabled";

    toggle.addEventListener("click", async () => {
      action.enabled = !action.enabled;
      await saveState();
      render();
    });

    left.appendChild(label);
    left.appendChild(toggle);
  }

  const del2 = document.createElement("button");
  del2.className = "deleteBtn";
  del2.setAttribute("aria-label", "Delete action");
  del2.style.opacity = "1";
  del2.innerHTML = iconDelete();
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

  dragHandle.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", action.id);
    e.dataTransfer.effectAllowed = "move";
    tItem.classList.add("dragging");
  });

  dragHandle.addEventListener("dragend", () => {
    tItem.classList.remove("dragging");
  });

  tItem.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  tItem.addEventListener("drop", async (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === action.id) return;
    const fromIndex = state.actions.findIndex((a) => a.id === draggedId);
    const toIndex = state.actions.findIndex((a) => a.id === action.id);
    if (fromIndex < 0 || toIndex < 0) return;

    const [moved] = state.actions.splice(fromIndex, 1);
    state.actions.splice(toIndex, 0, moved);
    await saveState();
    render();
    showStatus("↕️ Action reordered");
  });

  return tItem;
}

function truncate(s, n = 28) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] ?? null;
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

  if (msg?.type === "CLICK_RECORDED") {
    const action = state.actions.find((a) => a.id === msg.actionId);
    if (!action) return;
    action.target = msg.payload?.target ?? null;
    action.click = msg.payload?.click ?? null;
    action.collapsed = false;
    saveState().then(() => {
      render();
      showStatus("✅ Click recorded");
    });
  }

  if (msg?.type === "FLOW_START") {
    runState.status = "running";
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
    runState.status = "idle";
    runState.currentId = null;
    render();
    showStatus("✅ Flow complete");
  }

  if (msg?.type === "FLOW_PAUSE") {
    runState.status = "paused";
    render();
  }

  if (msg?.type === "FLOW_RESUME") {
    runState.status = "running";
    render();
  }

  if (msg?.type === "FLOW_STOP") {
    runState.status = "idle";
    runState.currentId = null;
    runState.doneIds = new Set();
    render();
    showStatus("⏹️ Flow stopped");
  }

  if (msg?.type === "FLOW_ERROR") {
    runState.status = "idle";
    runState.currentId = null;
    render();
    showStatus("❌ Flow error: " + msg.error, 3500);
  }
});

function setPlayButtonState() {
  const icon = playBtn.querySelector(".material-icons");
  playBtn.classList.toggle("paused", runState.status === "paused");
  if (runState.status === "running") {
    icon.textContent = "pause";
    playBtn.title = "Pause";
    playBtn.setAttribute("aria-label", "Pause");
    return;
  }

  icon.textContent = "play_arrow";
  playBtn.title = runState.status === "paused" ? "Resume" : "Play";
  playBtn.setAttribute("aria-label", runState.status === "paused" ? "Resume" : "Play");
}

function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
}

// Boot
loadState();
