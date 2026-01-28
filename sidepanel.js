const addNodeBtn = document.getElementById("addNodeBtn");
const settingsBtn = document.getElementById("settingsBtn");
const canvasBtn = document.getElementById("canvasBtn");
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
const addTextBlocksNode = document.getElementById("addTextBlocksNode");
const addClipboardNode = document.getElementById("addClipboardNode");
const addKeyboardNode = document.getElementById("addKeyboardNode");
const addSheetsCheckValueNode = document.getElementById("addSheetsCheckValueNode");
const addSheetsCopyNode = document.getElementById("addSheetsCopyNode");
const addSheetsPasteNode = document.getElementById("addSheetsPasteNode");
const addHiggsfieldAiNode = document.getElementById("addHiggsfieldAiNode");

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
const pointerPreview = document.getElementById("pointerPreview");
const pointerPreviewPointer = document.getElementById("pointerPreviewPointer");

const workflowNameInput = document.getElementById("workflowNameInput");
const workflowsBtn = document.getElementById("workflowsBtn");
const saveWorkflowBtn = document.getElementById("saveWorkflowBtn");
const workflowsBackdrop = document.getElementById("workflowsBackdrop");
const closeWorkflowsBtn = document.getElementById("closeWorkflowsBtn");
const workflowsList = document.getElementById("workflowsList");
const workflowJsonBackdrop = document.getElementById("workflowJsonBackdrop");
const workflowJsonTitle = document.getElementById("workflowJsonTitle");
const workflowJsonText = document.getElementById("workflowJsonText");
const closeWorkflowJsonBtn = document.getElementById("closeWorkflowJsonBtn");
const copyWorkflowJsonBtn = document.getElementById("copyWorkflowJsonBtn");
const backToWorkflowsBtn = document.getElementById("backToWorkflowsBtn");
const sheetsCopyBackdrop = document.getElementById("sheetsCopyBackdrop");
const sheetsCopyCell = document.getElementById("sheetsCopyCell");
const sheetsCopyText = document.getElementById("sheetsCopyText");
const sheetsCopyBtn = document.getElementById("sheetsCopyBtn");
const sheetsCopyCancelBtn = document.getElementById("sheetsCopyCancelBtn");
const closeSheetsCopyBtn = document.getElementById("closeSheetsCopyBtn");

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
  actions: [],
  workflowName: "Workflow"
  // action:
  // { id, type: "switchTab"|"delay"|"openUrl"|"click"|"reloadTab"|"simpleLoop"|"textBlocks"|"clipboard"|"keyboard"|"sheetsCheckValue"|"sheetsCopy"|"sheetsPaste"|"higgsfieldAi", collapsed: true, jsonOpen: false }
};

let runState = {
  status: "idle",
  currentId: null,
  doneIds: new Set(),
  checkResults: new Map(),
  higgsfieldStatus: new Map()
};

let workflows = [];
let activeJsonWorkflowId = null;
let pendingSheetsCopyRequest = null;
let ignoreCanvasStorageUpdate = false;

const DEFAULT_ACTIVE_PHRASES = [
  { text: "In Progress", caseSensitive: false },
  { text: "In Queue", caseSensitive: false }
];
const DEFAULT_FAILURE_PHRASES = [{ text: "Failed", caseSensitive: false }];
const DEFAULT_HIGGSFIELD_CONFIG = {
  threshold: 4,
  highlight: true,
  pollIntervalSec: 1.5,
  timeoutSec: 600,
  maxHighlights: 80
};

function normalizePhraseList(list, fallback) {
  const source = Array.isArray(list) && list.length ? list : fallback;
  if (!Array.isArray(source)) return [];
  return source
    .map((item) => {
      if (typeof item === "string") return { text: item, caseSensitive: false };
      if (!item) return null;
      return {
        text: typeof item.text === "string" ? item.text : "",
        caseSensitive: item.caseSensitive === true
      };
    })
    .filter((item) => item && item.text.trim());
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function getCanvasActions(canvasState) {
  if (!canvasState || !Array.isArray(canvasState.nodes) || !Array.isArray(canvasState.connections)) {
    return null;
  }
  const nodesById = new Map(canvasState.nodes.map((node) => [node.id, node]));
  const startNode = canvasState.nodes.find((node) => node.kind === "start");
  if (!startNode) return null;
  const actions = [];
  const visited = new Set();
  let current = startNode;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.kind === "action" && current.action) {
      actions.push(current.action);
    }
    const connection = canvasState.connections.find((item) => item.from === current.id);
    if (!connection) break;
    current = nodesById.get(connection.to);
    if (!current || current.kind === "end") break;
  }

  return actions;
}

async function syncCanvasStateFromActions(actions) {
  const res = await chrome.storage.local.get("autolineCanvasState");
  const canvasState = res.autolineCanvasState;
  if (!canvasState || !Array.isArray(canvasState.nodes) || !Array.isArray(canvasState.connections)) {
    return;
  }

  const nodesByActionId = new Map(
    canvasState.nodes.filter((node) => node.kind === "action" && node.action?.id).map((node) => [node.action.id, node])
  );
  for (const action of actions) {
    const node = nodesByActionId.get(action.id);
    if (node) {
      node.action = action;
      node.label = action.type;
    }
  }

  const actionIds = new Set(actions.map((action) => action.id));
  canvasState.nodes = canvasState.nodes.filter((node) => {
    if (node.kind !== "action") return true;
    return node.action?.id && actionIds.has(node.action.id);
  });
  const nodeIds = new Set(canvasState.nodes.map((node) => node.id));
  canvasState.connections = canvasState.connections.filter(
    (connection) => nodeIds.has(connection.from) && nodeIds.has(connection.to)
  );

  const startNode = canvasState.nodes.find((node) => node.kind === "start");
  const endNode = canvasState.nodes.find((node) => node.kind === "end");
  if (!startNode || !endNode) return;

  const existingActionIds = new Set(canvasState.nodes.filter((node) => node.kind === "action").map((node) => node.action.id));
  if (existingActionIds.size < actions.length) {
    const missing = actions.filter((action) => !existingActionIds.has(action.id));
    let xOffset = endNode.position?.x ?? 600;
    let yOffset = endNode.position?.y ?? 120;
    missing.forEach((action, index) => {
      canvasState.nodes.push({
        id: uid(),
        kind: "action",
        label: action.type,
        action,
        expanded: false,
        position: { x: xOffset + (index + 1) * 220, y: yOffset }
      });
    });
  }

  ignoreCanvasStorageUpdate = true;
  await chrome.storage.local.set({ autolineCanvasState: canvasState });
  ignoreCanvasStorageUpdate = false;
}

function createTextBlock(text = "") {
  return { id: uid(), text, enabled: true };
}

function getTotalTextBlocks() {
  return state.actions.reduce((total, action) => {
    if (action.type !== "textBlocks") return total;
    return total + (Array.isArray(action.blocks) ? action.blocks.length : 0);
  }, 0);
}

function showStatus(text, ms = 1800) {
  statusEl.textContent = text;
  statusEl.classList.remove("hidden");
  window.clearTimeout(showStatus._t);
  showStatus._t = window.setTimeout(() => statusEl.classList.add("hidden"), ms);
}

function copyTextToClipboard(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i)) : [];
  document.body.appendChild(textarea);
  textarea.select();
  let success = false;
  try {
    success = document.execCommand("copy");
  } catch (e) {
    success = false;
  }
  textarea.remove();
  if (selection) {
    selection.removeAllRanges();
    ranges.forEach((range) => selection.addRange(range));
  }
  return success;
}

async function loadState() {
  const res = await chrome.storage.local.get(["autolineState", "autolineCanvasState"]);
  if (res.autolineState) state = res.autolineState;
  const canvasActions = getCanvasActions(res.autolineCanvasState);
  if (Array.isArray(canvasActions)) {
    state.actions = canvasActions;
  }

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
  if (typeof state.workflowName !== "string" || !state.workflowName.trim()) {
    state.workflowName = "Workflow";
  }

  for (const a of state.actions) {
    if (typeof a.collapsed !== "boolean") a.collapsed = true;
    if (typeof a.jsonOpen !== "boolean") a.jsonOpen = false;
    if (a.type === "delay" && typeof a.delaySec !== "number") a.delaySec = 1;
    if (a.type === "openUrl" && typeof a.url !== "string") a.url = "";
    if (a.type === "click") {
      if (!a.target) a.target = null;
      if (!a.click) a.click = null;
      if (!Number.isFinite(a.clickCount)) a.clickCount = 1;
      if (typeof a.showClickDot !== "boolean") a.showClickDot = true;
    }
    if (a.type === "simpleLoop") {
      if (typeof a.enabled !== "boolean") a.enabled = true;
      if (!Number.isFinite(a.loopCount) || a.loopCount < 1) a.loopCount = 1;
    }
    if (a.type === "textBlocks") {
      if (!Array.isArray(a.blocks)) a.blocks = [];
      a.blocks = a.blocks.map((block) => ({
        id: typeof block?.id === "string" ? block.id : uid(),
        text: typeof block?.text === "string" ? block.text : "",
        enabled: typeof block?.enabled === "boolean" ? block.enabled : true
      }));
    }
    if (a.type === "clipboard" && !["copy", "paste"].includes(a.mode)) {
      a.mode = "copy";
    }
    if (a.type === "keyboard") {
      if (
        ![
          "ctrlA",
          "ctrlC",
          "ctrlV",
          "delete",
          "backspace",
          "arrowUp",
          "arrowDown",
          "arrowLeft",
          "arrowRight",
          "enter",
          "escape"
        ].includes(a.key)
      ) {
        a.key = "ctrlA";
      }
      if (!Number.isFinite(a.pressCount) || a.pressCount < 1) a.pressCount = 1;
      if (!Number.isFinite(a.delaySec) || a.delaySec < 0) a.delaySec = 1;
    }
    if (a.type === "sheetsCheckValue") {
      if (typeof a.expectedValue !== "string") a.expectedValue = "";
      if (typeof a.cellRef !== "string") a.cellRef = "";
      if (typeof a.lastReadCellRef !== "string") a.lastReadCellRef = "";
      if (typeof a.lastReadValue !== "string") a.lastReadValue = "";
    }
    if (a.type === "sheetsCopy") {
      if (typeof a.lastCopiedA1 !== "string") a.lastCopiedA1 = "";
      if (!Number.isFinite(a.lastCopiedLength)) a.lastCopiedLength = 0;
      if (typeof a.lastCopySuccess !== "boolean") a.lastCopySuccess = false;
    }
    if (a.type === "sheetsPaste") {
      if (!Number.isFinite(a.lastPastedLength)) a.lastPastedLength = 0;
      if (typeof a.lastPasteSuccess !== "boolean") a.lastPasteSuccess = false;
    }
    if (a.type === "higgsfieldAi") {
      a.activePhrases = normalizePhraseList(a.activePhrases, DEFAULT_ACTIVE_PHRASES);
      a.failurePhrases = normalizePhraseList(a.failurePhrases, DEFAULT_FAILURE_PHRASES);
      if (!Number.isFinite(a.threshold)) a.threshold = DEFAULT_HIGGSFIELD_CONFIG.threshold;
      if (typeof a.highlight !== "boolean") a.highlight = DEFAULT_HIGGSFIELD_CONFIG.highlight;
      if (!Number.isFinite(a.pollIntervalSec)) a.pollIntervalSec = DEFAULT_HIGGSFIELD_CONFIG.pollIntervalSec;
      if (!Number.isFinite(a.timeoutSec)) a.timeoutSec = DEFAULT_HIGGSFIELD_CONFIG.timeoutSec;
      if (!Number.isFinite(a.maxHighlights)) a.maxHighlights = DEFAULT_HIGGSFIELD_CONFIG.maxHighlights;
    }
  }

  await loadWorkflows();
  render();
  applyTheme(state.settings.themeMode);
}

async function saveState() {
  await chrome.storage.local.set({ autolineState: state });
  await syncCanvasStateFromActions(state.actions);
}

async function loadWorkflows() {
  const res = await chrome.storage.local.get("autolineWorkflows");
  workflows = Array.isArray(res.autolineWorkflows) ? res.autolineWorkflows : [];
}

async function saveWorkflows() {
  await chrome.storage.local.set({ autolineWorkflows: workflows });
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
  updatePointerPreviewFromInputs();
  settingsBackdrop.classList.remove("hidden");
}
function closeSettings() {
  settingsBackdrop.classList.add("hidden");
}

function getPointerPreviewSettings() {
  const pointerSize = Number(pointerSizeInput.value);
  const outlineSize = Number(pointerOutlineInput.value);
  const shadowOpacity = Number(pointerShadowOpacityInput.value);
  const shadowBlur = Number(pointerShadowBlurInput.value);
  return {
    pointerSizePx: Number.isFinite(pointerSize) && pointerSize > 0 ? pointerSize : 32,
    pointerFill: pointerFillInput.value || "#000000",
    pointerOutlinePx: Number.isFinite(outlineSize) && outlineSize >= 0 ? outlineSize : 2,
    pointerOutlineColor: pointerOutlineColorInput.value || "#ffffff",
    pointerShadowEnabled: pointerShadowToggle.checked,
    pointerShadowOpacity: Number.isFinite(shadowOpacity) ? Math.min(1, Math.max(0, shadowOpacity / 100)) : 0.25,
    pointerShadowBlur: Number.isFinite(shadowBlur) && shadowBlur >= 0 ? shadowBlur : 8
  };
}

function updatePointerPreviewFromInputs() {
  if (!pointerPreviewPointer || !pointerPreview) return;
  const settings = getPointerPreviewSettings();
  const svg = pointerPreviewPointer.querySelector("svg");
  const path = svg?.querySelector("path");
  const containerSize = Math.min(pointerPreview.clientWidth || 160, pointerPreview.clientHeight || 120);
  const padding = Math.max(2, Math.ceil(settings.pointerOutlinePx / 2) + 1);
  const shadowMargin = settings.pointerShadowEnabled ? Math.ceil(settings.pointerShadowBlur) : 0;
  const maxSize = Math.max(16, containerSize - 32 - (padding + shadowMargin) * 2);
  const size = Math.min(settings.pointerSizePx, maxSize);

  pointerPreviewPointer.style.width = `${size}px`;
  pointerPreviewPointer.style.height = `${size}px`;
  pointerPreviewPointer.style.padding = `${padding}px`;
  pointerPreviewPointer.style.boxSizing = "content-box";

  if (path) {
    path.setAttribute("fill", settings.pointerFill);
    path.setAttribute("stroke", settings.pointerOutlineColor);
    path.setAttribute("stroke-width", String(settings.pointerOutlinePx));
    path.setAttribute("stroke-linejoin", "round");
  }

  pointerPreviewPointer.style.filter = settings.pointerShadowEnabled
    ? `drop-shadow(0 0 ${settings.pointerShadowBlur}px rgba(0, 0, 0, ${settings.pointerShadowOpacity}))`
    : "none";
}

addNodeBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
settingsBtn.addEventListener("click", openSettings);
canvasBtn.addEventListener("click", async () => {
  const url = chrome.runtime.getURL("canvas.html");
  await chrome.windows.create({ url, type: "popup", width: 1280, height: 800 });
});
closeSettingsBtn.addEventListener("click", closeSettings);

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
settingsBackdrop.addEventListener("click", (e) => {
  if (e.target === settingsBackdrop) closeSettings();
});

function openWorkflows() {
  renderWorkflowsList();
  workflowsBackdrop.classList.remove("hidden");
}

function closeWorkflows() {
  workflowsBackdrop.classList.add("hidden");
}

function openWorkflowJson(workflow) {
  activeJsonWorkflowId = workflow.id;
  workflowJsonTitle.textContent = `Workflow JSON • ${workflow.name}`;
  workflowJsonText.textContent = JSON.stringify(workflow.data, null, 2);
  workflowJsonBackdrop.classList.remove("hidden");
  workflowsBackdrop.classList.add("hidden");
}

function closeWorkflowJson() {
  workflowJsonBackdrop.classList.add("hidden");
  activeJsonWorkflowId = null;
}

function openSheetsCopyModal(request) {
  pendingSheetsCopyRequest = request;
  sheetsCopyCell.textContent = `Active cell: ${request?.a1 || "-"}`;
  sheetsCopyText.textContent = request?.formulaText ?? "";
  sheetsCopyBackdrop.classList.remove("hidden");
}

function closeSheetsCopyModal() {
  sheetsCopyBackdrop.classList.add("hidden");
  pendingSheetsCopyRequest = null;
  sheetsCopyText.textContent = "";
}

async function handleSheetsCopyRequest(request) {
  const requestId = request?.requestId;
  const a1 = request?.a1;
  const formulaText = request?.formulaText ?? "";
  if (!requestId) return;
  try {
    const copied = copyTextToClipboard(formulaText);
    if (!copied) {
      throw new Error("Clipboard write failed");
    }
    await chrome.runtime.sendMessage({
      type: "SHEETS_COPY_RESULT",
      requestId,
      ok: true,
      a1: a1 || null,
      copiedTextLength: formulaText.length
    });
  } catch (e) {
    await chrome.runtime.sendMessage({
      type: "SHEETS_COPY_RESULT",
      requestId,
      ok: false,
      a1: a1 || null,
      copiedTextLength: 0,
      error: e?.message || "Clipboard write failed"
    });
  }
}

workflowsBtn.addEventListener("click", openWorkflows);
closeWorkflowsBtn.addEventListener("click", closeWorkflows);
workflowsBackdrop.addEventListener("click", (e) => {
  if (e.target === workflowsBackdrop) closeWorkflows();
});

closeWorkflowJsonBtn.addEventListener("click", () => {
  closeWorkflowJson();
  openWorkflows();
});
backToWorkflowsBtn.addEventListener("click", () => {
  closeWorkflowJson();
  openWorkflows();
});
workflowJsonBackdrop.addEventListener("click", (e) => {
  if (e.target === workflowJsonBackdrop) {
    closeWorkflowJson();
    openWorkflows();
  }
});

sheetsCopyBackdrop.addEventListener("click", (e) => {
  if (e.target === sheetsCopyBackdrop) {
    closeSheetsCopyModal();
  }
});
closeSheetsCopyBtn.addEventListener("click", closeSheetsCopyModal);
sheetsCopyCancelBtn.addEventListener("click", async () => {
  if (!pendingSheetsCopyRequest) {
    closeSheetsCopyModal();
    return;
  }
  const { requestId, a1 } = pendingSheetsCopyRequest;
  await chrome.runtime.sendMessage({
    type: "SHEETS_COPY_RESULT",
    requestId,
    ok: false,
    a1: a1 || null,
    copiedTextLength: 0,
    error: "Copy canceled"
  });
  closeSheetsCopyModal();
});
sheetsCopyBtn.addEventListener("click", async () => {
  if (!pendingSheetsCopyRequest) {
    closeSheetsCopyModal();
    return;
  }
  const { requestId, a1, formulaText } = pendingSheetsCopyRequest;
  try {
    const copied = copyTextToClipboard(formulaText ?? "");
    if (!copied) {
      throw new Error("Clipboard write failed");
    }
    await chrome.runtime.sendMessage({
      type: "SHEETS_COPY_RESULT",
      requestId,
      ok: true,
      a1: a1 || null,
      copiedTextLength: (formulaText ?? "").length
    });
  } catch (e) {
    await chrome.runtime.sendMessage({
      type: "SHEETS_COPY_RESULT",
      requestId,
      ok: false,
      a1: a1 || null,
      copiedTextLength: 0,
      error: e?.message || "Clipboard write failed"
    });
  }
  closeSheetsCopyModal();
});

copyWorkflowJsonBtn.addEventListener("click", async () => {
  const text = workflowJsonText.textContent || "";
  try {
    const copied = copyTextToClipboard(text);
    showStatus(copied ? "✅ Workflow JSON copied" : "⚠️ Unable to copy JSON");
  } catch (e) {
    showStatus("⚠️ Unable to copy JSON");
  }
});

workflowNameInput.addEventListener("click", () => {
  workflowNameInput.readOnly = false;
  workflowNameInput.focus();
  workflowNameInput.select();
});

workflowNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    workflowNameInput.blur();
  }
  if (e.key === "Escape") {
    workflowNameInput.value = state.workflowName ?? "Workflow";
    workflowNameInput.blur();
  }
});

workflowNameInput.addEventListener("blur", async () => {
  const nextName = workflowNameInput.value.trim() || "Workflow";
  state.workflowName = nextName;
  workflowNameInput.value = nextName;
  workflowNameInput.readOnly = true;
  await saveState();
});

[
  pointerSizeInput,
  pointerFillInput,
  pointerOutlineInput,
  pointerOutlineColorInput,
  pointerShadowOpacityInput,
  pointerShadowBlurInput
].forEach((input) => {
  input.addEventListener("input", updatePointerPreviewFromInputs);
});
pointerShadowToggle.addEventListener("change", updatePointerPreviewFromInputs);

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

saveWorkflowBtn.addEventListener("click", async () => {
  const name = workflowNameInput.value.trim() || "Workflow";
  const payload = {
    id: uid(),
    name,
    data: JSON.parse(JSON.stringify({ actions: state.actions, settings: state.settings }))
  };
  workflows.unshift(payload);
  await saveWorkflows();
  renderWorkflowsList();
  showStatus("✅ Workflow saved");
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
  const action = {
    id: uid(),
    type: "click",
    collapsed: true,
    jsonOpen: false,
    target: null,
    click: null,
    clickCount: 1,
    showClickDot: true
  };
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
  const totalBlocks = getTotalTextBlocks();
  const action = {
    id: uid(),
    type: "simpleLoop",
    collapsed: true,
    jsonOpen: false,
    enabled: true,
    loopCount: totalBlocks > 0 ? totalBlocks : 1
  };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Simple Loop node added");
});

addTextBlocksNode.addEventListener("click", async () => {
  const action = {
    id: uid(),
    type: "textBlocks",
    collapsed: true,
    jsonOpen: false,
    blocks: [createTextBlock("")]
  };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Text Blocks node added");
});

addClipboardNode.addEventListener("click", async () => {
  const action = { id: uid(), type: "clipboard", collapsed: true, jsonOpen: false, mode: "copy" };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Clipboard node added");
});

addKeyboardNode.addEventListener("click", async () => {
  const action = {
    id: uid(),
    type: "keyboard",
    collapsed: true,
    jsonOpen: false,
    key: "ctrlA",
    pressCount: 1,
    delaySec: 1
  };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Keyboard node added");
});

addSheetsCheckValueNode.addEventListener("click", async () => {
  const action = {
    id: uid(),
    type: "sheetsCheckValue",
    collapsed: true,
    jsonOpen: false,
    expectedValue: "",
    cellRef: ""
  };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Sheets Check Value node added");
});

addSheetsCopyNode.addEventListener("click", async () => {
  const action = {
    id: uid(),
    type: "sheetsCopy",
    collapsed: true,
    jsonOpen: false,
    lastCopiedA1: "",
    lastCopiedLength: 0,
    lastCopySuccess: false
  };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Sheets Copy node added");
});

addSheetsPasteNode.addEventListener("click", async () => {
  const action = {
    id: uid(),
    type: "sheetsPaste",
    collapsed: true,
    jsonOpen: false,
    lastPastedLength: 0,
    lastPasteSuccess: false
  };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Sheets Paste node added");
});

addHiggsfieldAiNode.addEventListener("click", async () => {
  const action = {
    id: uid(),
    type: "higgsfieldAi",
    collapsed: true,
    jsonOpen: false,
    activePhrases: DEFAULT_ACTIVE_PHRASES.map((item) => ({ ...item })),
    failurePhrases: DEFAULT_FAILURE_PHRASES.map((item) => ({ ...item })),
    threshold: DEFAULT_HIGGSFIELD_CONFIG.threshold,
    highlight: DEFAULT_HIGGSFIELD_CONFIG.highlight,
    pollIntervalSec: DEFAULT_HIGGSFIELD_CONFIG.pollIntervalSec,
    timeoutSec: DEFAULT_HIGGSFIELD_CONFIG.timeoutSec,
    maxHighlights: DEFAULT_HIGGSFIELD_CONFIG.maxHighlights
  };
  state.actions.push(action);
  await saveState();
  render();
  closeModal();
  showStatus("✅ Higgsfield AI node added");
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
    if (a.type === "textBlocks") {
      const blocks = Array.isArray(a.blocks) ? a.blocks : [];
      const hasEnabled = blocks.some((block) => block.enabled !== false);
      if (!blocks.length || !hasEnabled) {
        showStatus("⚠️ A Text Blocks node has no enabled blocks");
        a.collapsed = false;
        await saveState();
        render();
        return;
      }
    }
    if (a.type === "higgsfieldAi") {
      const activePhrases = normalizePhraseList(a.activePhrases, DEFAULT_ACTIVE_PHRASES);
      if (!activePhrases.length) {
        showStatus("⚠️ Higgsfield AI needs at least one active phrase");
        a.collapsed = false;
        await saveState();
        render();
        return;
      }
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

function iconDuplicate() {
  return `
    <span class="material-icons" aria-hidden="true">content_copy</span>
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
      click: action.click ?? null,
      clickCount: Number.isFinite(action.clickCount) ? action.clickCount : 1,
      showClickDot: action.showClickDot !== false
    };
  }
  if (action.type === "reloadTab") {
    return { type: "reloadTab" };
  }
  if (action.type === "simpleLoop") {
    return {
      type: "simpleLoop",
      enabled: action.enabled ?? true,
      loopCount: Number.isFinite(action.loopCount) ? Math.max(1, Math.round(action.loopCount)) : 1
    };
  }
  if (action.type === "textBlocks") {
    return {
      type: "textBlocks",
      blocks: Array.isArray(action.blocks)
        ? action.blocks.map((block) => ({
            id: block.id,
            text: block.text ?? "",
            enabled: block.enabled !== false
          }))
        : []
    };
  }
  if (action.type === "clipboard") {
    return { type: "clipboard", mode: action.mode ?? "copy" };
  }
  if (action.type === "keyboard") {
    return {
      type: "keyboard",
      key: action.key ?? "ctrlA",
      pressCount: Number.isFinite(action.pressCount) ? Math.max(1, Math.round(action.pressCount)) : 1,
      delaySec: Number.isFinite(action.delaySec) ? Math.max(0, action.delaySec) : 1
    };
  }
  if (action.type === "sheetsCheckValue") {
    return {
      type: "sheetsCheckValue",
      expectedValue: action.expectedValue ?? "",
      cellRef: action.cellRef ?? ""
    };
  }
  if (action.type === "sheetsCopy") {
    return { type: "sheetsCopy" };
  }
  if (action.type === "sheetsPaste") {
    return { type: "sheetsPaste" };
  }
  if (action.type === "higgsfieldAi") {
    return {
      type: "higgsfieldAi",
      activePhrases: normalizePhraseList(action.activePhrases, DEFAULT_ACTIVE_PHRASES),
      failurePhrases: normalizePhraseList(action.failurePhrases, DEFAULT_FAILURE_PHRASES),
      threshold: Number.isFinite(action.threshold) ? action.threshold : DEFAULT_HIGGSFIELD_CONFIG.threshold,
      highlight: action.highlight !== false,
      pollIntervalSec: Number.isFinite(action.pollIntervalSec)
        ? Math.max(0.2, action.pollIntervalSec)
        : DEFAULT_HIGGSFIELD_CONFIG.pollIntervalSec,
      timeoutSec: Number.isFinite(action.timeoutSec) ? Math.max(0, action.timeoutSec) : DEFAULT_HIGGSFIELD_CONFIG.timeoutSec,
      maxHighlights: Number.isFinite(action.maxHighlights)
        ? Math.max(0, Math.round(action.maxHighlights))
        : DEFAULT_HIGGSFIELD_CONFIG.maxHighlights
    };
  }
  return { type: action.type };
}

function render() {
  if (workflowNameInput) {
    workflowNameInput.value = state.workflowName ?? "Workflow";
  }
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

function renderWorkflowsList() {
  workflowsList.innerHTML = "";

  if (!workflows.length) {
    const empty = document.createElement("div");
    empty.className = "pill";
    empty.textContent = "No saved workflows yet.";
    workflowsList.appendChild(empty);
    return;
  }

  workflows.forEach((workflow) => {
    const item = document.createElement("div");
    item.className = "workflowItem";

    const name = document.createElement("div");
    name.className = "workflowItemName";
    name.textContent = workflow.name || "Workflow";

    const actions = document.createElement("div");
    actions.className = "workflowItemActions";

    const jsonBtn = document.createElement("button");
    jsonBtn.className = "workflowActionBtn workflowJsonBtn";
    jsonBtn.type = "button";
    jsonBtn.textContent = "JSON";
    jsonBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openWorkflowJson(workflow);
    });

    const renameBtn = document.createElement("button");
    renameBtn.className = "workflowActionBtn";
    renameBtn.type = "button";
    renameBtn.innerHTML = `<span class="material-icons" aria-hidden="true">edit</span>`;
    renameBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const nextName = window.prompt("Rename workflow", workflow.name || "Workflow");
      if (!nextName) return;
      workflow.name = nextName.trim() || workflow.name;
      await saveWorkflows();
      renderWorkflowsList();
      showStatus("✅ Workflow renamed");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "workflowActionBtn";
    deleteBtn.type = "button";
    deleteBtn.innerHTML = `<span class="material-icons" aria-hidden="true">close</span>`;
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      workflows = workflows.filter((itemWorkflow) => itemWorkflow.id !== workflow.id);
      await saveWorkflows();
      renderWorkflowsList();
      showStatus("🗑️ Workflow deleted");
    });

    actions.appendChild(jsonBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(name);
    item.appendChild(actions);

    item.addEventListener("click", async () => {
      state.actions = JSON.parse(JSON.stringify(workflow.data?.actions ?? []));
      if (workflow.data?.settings) {
        state.settings = JSON.parse(JSON.stringify(workflow.data.settings));
      }
      state.workflowName = workflow.name || "Workflow";
      await saveState();
      render();
      closeWorkflows();
      showStatus("✅ Workflow loaded");
    });

    workflowsList.appendChild(item);
  });
}

function clearDropIndicators() {
  actionsList.querySelectorAll(".tItem.drop-before, .tItem.drop-after").forEach((item) => {
    item.classList.remove("drop-before", "drop-after");
  });
}

function renderTimelineItem(action, idx, isLast) {
  const tItem = document.createElement("div");
  tItem.className = "tItem";
  tItem.dataset.actionId = action.id;

  // Running visuals
  if (runState.status === "running" && runState.currentId === action.id) tItem.classList.add("running");
  if (runState.status === "paused" && runState.currentId === action.id) tItem.classList.add("paused");
  if (runState.doneIds.has(action.id)) tItem.classList.add("done");
  if (action.type === "sheetsCheckValue") {
    const checkResult = runState.checkResults.get(action.id);
    if (checkResult?.matched === true) tItem.classList.add("check-pass");
    if (checkResult?.matched === false) tItem.classList.add("check-fail");
  }

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
  if (action.type === "textBlocks") title.textContent = "Text Blocks";
  if (action.type === "clipboard") title.textContent = "Clipboard";
  if (action.type === "keyboard") title.textContent = "Keyboard";
  if (action.type === "sheetsCheckValue") title.textContent = "Sheets Check Value";
  if (action.type === "sheetsCopy") title.textContent = "Sheets Copy";
  if (action.type === "sheetsPaste") title.textContent = "Sheets Paste";
  if (action.type === "higgsfieldAi") title.textContent = "Higgsfield AI";

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
    sub.textContent = action.target
      ? `• ${truncate(action.target.label || "target", 32)}`
      : "• not set";
  }
  if (action.type === "reloadTab") {
    sub.textContent = "• active tab";
  }
  if (action.type === "simpleLoop") {
    const loops = Number.isFinite(action.loopCount) ? Math.max(1, Math.round(action.loopCount)) : 1;
    sub.textContent = `${action.enabled ? "• enabled" : "• disabled"} • loops: ${loops}`;
  }
  if (action.type === "textBlocks") {
    const total = Array.isArray(action.blocks) ? action.blocks.length : 0;
    const used = Array.isArray(action.blocks) ? action.blocks.filter((block) => block.enabled === false).length : 0;
    sub.textContent = total > 0 ? `• ${used}/${total} used` : "• no blocks";
  }
  if (action.type === "clipboard") {
    sub.textContent = action.mode === "paste" ? "• paste clipboard" : "• copy selection";
  }
  if (action.type === "keyboard") {
    const label = {
      ctrlA: "Ctrl+A",
      ctrlC: "Ctrl+C",
      ctrlV: "Ctrl+V",
      delete: "Delete",
      backspace: "Backspace",
      arrowUp: "Arrow Up",
      arrowDown: "Arrow Down",
      arrowLeft: "Arrow Left",
      arrowRight: "Arrow Right",
      enter: "Enter",
      escape: "Esc"
    }[action.key];
    sub.textContent = `• ${label || "key"} ×${Number(action.pressCount ?? 1)}`;
  }
  if (action.type === "sheetsCheckValue") {
    const cellLabel = action.cellRef ? ` ${action.cellRef}` : " selection";
    const expectedLabel = action.expectedValue ? ` = "${truncate(action.expectedValue, 18)}"` : "";
    sub.textContent = `•${cellLabel}${expectedLabel}`;
  }
  if (action.type === "sheetsCopy") {
    sub.textContent = "• copy active cell";
  }
  if (action.type === "sheetsPaste") {
    sub.textContent = "• paste runtime clipboard";
  }
  if (action.type === "higgsfieldAi") {
    const threshold = Number.isFinite(action.threshold) ? action.threshold : DEFAULT_HIGGSFIELD_CONFIG.threshold;
    const phraseCount = Array.isArray(action.activePhrases) ? action.activePhrases.length : 0;
    sub.textContent = `• max ${threshold} • ${phraseCount} active phrase${phraseCount === 1 ? "" : "s"}`;
  }

  const headerRight = document.createElement("div");
  headerRight.className = "headerRight";

  const duplicateBtn = document.createElement("button");
  duplicateBtn.className = "duplicateBtn";
  duplicateBtn.setAttribute("aria-label", "Duplicate action");
  duplicateBtn.innerHTML = iconDuplicate();

  duplicateBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const cloned = JSON.parse(JSON.stringify(action));
    cloned.id = uid();
    cloned.jsonOpen = false;
    state.actions.splice(idx + 1, 0, cloned);
    await saveState();
    render();
    showStatus("📄 Action duplicated");
  });

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

  headerRight.appendChild(duplicateBtn);
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
  left.className = action.type === "higgsfieldAi" ? "stack" : "row";

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
      await chrome.runtime.sendMessage({ type: "DEBUG_ATTACH", tabId: tab.id, reason: "record" });
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
      await chrome.runtime.sendMessage({
        type: "DEBUG_ATTACH",
        tabId: tab.id,
        reason: "preview",
        autoDetachMs: 2500
      });
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

    const clickTypeLabel = document.createElement("div");
    clickTypeLabel.className = "pill";
    clickTypeLabel.textContent = "Click type";

    const clickTypeSelect = document.createElement("select");
    clickTypeSelect.className = "select";
    clickTypeSelect.style.minWidth = "140px";
    clickTypeSelect.innerHTML = `
      <option value="1">Single click</option>
      <option value="2">Double click</option>
      <option value="3">Triple click</option>
    `;
    clickTypeSelect.value = String(Number.isFinite(action.clickCount) ? action.clickCount : 1);
    clickTypeSelect.addEventListener("change", async () => {
      const count = Number(clickTypeSelect.value);
      action.clickCount = Number.isFinite(count) ? Math.min(3, Math.max(1, count)) : 1;
      await saveState();
      render();
    });

    const dotLabel = document.createElement("div");
    dotLabel.className = "pill";
    dotLabel.textContent = "Click dot on playback";

    const dotToggle = document.createElement("button");
    dotToggle.className = "btn toggle" + (action.showClickDot !== false ? " active" : "");
    dotToggle.type = "button";
    dotToggle.textContent = action.showClickDot !== false ? "On" : "Off";
    dotToggle.addEventListener("click", async () => {
      action.showClickDot = !(action.showClickDot !== false);
      await saveState();
      render();
    });

    left.appendChild(recordBtn);
    left.appendChild(showBtn);
    left.appendChild(resetBtn);
    left.appendChild(pill);
    left.appendChild(clickTypeLabel);
    left.appendChild(clickTypeSelect);
    left.appendChild(dotLabel);
    left.appendChild(dotToggle);
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

    const countLabel = document.createElement("div");
    countLabel.className = "pill";
    countLabel.textContent = "Loop count";

    const countInput = document.createElement("input");
    countInput.className = "input";
    countInput.type = "number";
    countInput.min = "1";
    countInput.step = "1";
    countInput.style.width = "110px";
    countInput.value = String(Number.isFinite(action.loopCount) ? Math.max(1, Math.round(action.loopCount)) : 1);
    countInput.addEventListener("change", async () => {
      const v = Number(countInput.value);
      action.loopCount = Number.isFinite(v) ? Math.max(1, Math.round(v)) : 1;
      await saveState();
      render();
    });

    const totalBlocks = getTotalTextBlocks();
    if (totalBlocks > 0) {
      const detected = document.createElement("div");
      detected.className = "pill";
      detected.textContent = `Text blocks detected: ${totalBlocks}`;
      left.appendChild(detected);
    }

    left.appendChild(label);
    left.appendChild(toggle);
    left.appendChild(countLabel);
    left.appendChild(countInput);
  }

  if (action.type === "textBlocks") {
    const addLabel = document.createElement("div");
    addLabel.className = "pill";
    addLabel.textContent = "Text blocks";

    const addBtn = document.createElement("button");
    addBtn.className = "btn";
    addBtn.type = "button";
    addBtn.textContent = "Add block";
    addBtn.addEventListener("click", async () => {
      action.blocks = Array.isArray(action.blocks) ? action.blocks : [];
      action.blocks.push(createTextBlock(""));
      await saveState();
      render();
    });

    const enableAllBtn = document.createElement("button");
    enableAllBtn.className = "btn";
    enableAllBtn.type = "button";
    enableAllBtn.textContent = "Enable all";
    enableAllBtn.addEventListener("click", async () => {
      action.blocks = Array.isArray(action.blocks) ? action.blocks : [];
      action.blocks.forEach((block) => {
        block.enabled = true;
      });
      await saveState();
      render();
    });

    const disableAllBtn = document.createElement("button");
    disableAllBtn.className = "btn";
    disableAllBtn.type = "button";
    disableAllBtn.textContent = "Disable all";
    disableAllBtn.addEventListener("click", async () => {
      action.blocks = Array.isArray(action.blocks) ? action.blocks : [];
      action.blocks.forEach((block) => {
        block.enabled = false;
      });
      await saveState();
      render();
    });

    const total = Array.isArray(action.blocks) ? action.blocks.length : 0;
    const used = Array.isArray(action.blocks) ? action.blocks.filter((block) => block.enabled === false).length : 0;
    const progress = document.createElement("div");
    progress.className = "pill";
    progress.textContent = total > 0 ? `${used}/${total}` : "0/0";

    left.appendChild(addLabel);
    left.appendChild(addBtn);
    left.appendChild(enableAllBtn);
    left.appendChild(disableAllBtn);
    left.appendChild(progress);
  }

  if (action.type === "clipboard") {
    const label = document.createElement("div");
    label.className = "pill";
    label.textContent = "Clipboard action";

    const select = document.createElement("select");
    select.className = "select";
    select.style.minWidth = "160px";
    select.innerHTML = `
      <option value="copy">Copy selection</option>
      <option value="paste">Paste clipboard</option>
    `;
    select.value = action.mode ?? "copy";
    select.addEventListener("change", async () => {
      action.mode = select.value === "paste" ? "paste" : "copy";
      await saveState();
      render();
    });

    left.appendChild(label);
    left.appendChild(select);
  }

  if (action.type === "keyboard") {
    const keyLabel = document.createElement("div");
    keyLabel.className = "pill";
    keyLabel.textContent = "Key command";

    const keySelect = document.createElement("select");
    keySelect.className = "select";
    keySelect.style.minWidth = "180px";
    keySelect.innerHTML = `
      <option value="ctrlA">Ctrl + A (Select all)</option>
      <option value="ctrlC">Ctrl + C (Copy)</option>
      <option value="ctrlV">Ctrl + V (Paste)</option>
      <option value="delete">Delete</option>
      <option value="backspace">Backspace</option>
      <option value="arrowUp">Arrow Up</option>
      <option value="arrowDown">Arrow Down</option>
      <option value="arrowLeft">Arrow Left</option>
      <option value="arrowRight">Arrow Right</option>
      <option value="enter">Enter</option>
      <option value="escape">Esc</option>
    `;
    keySelect.value = action.key ?? "ctrlA";
    keySelect.addEventListener("change", async () => {
      action.key = keySelect.value;
      await saveState();
      render();
    });

    const pressLabel = document.createElement("div");
    pressLabel.className = "pill";
    pressLabel.textContent = "Press count";

    const pressInput = document.createElement("input");
    pressInput.className = "input";
    pressInput.type = "number";
    pressInput.min = "1";
    pressInput.step = "1";
    pressInput.style.width = "110px";
    pressInput.value = String(action.pressCount ?? 1);
    pressInput.addEventListener("change", async () => {
      const v = Number(pressInput.value);
      action.pressCount = Number.isFinite(v) ? Math.max(1, Math.round(v)) : 1;
      await saveState();
      render();
    });

    const delayLabel = document.createElement("div");
    delayLabel.className = "pill";
    delayLabel.textContent = "Delay (sec)";

    const delayInput = document.createElement("input");
    delayInput.className = "input";
    delayInput.type = "number";
    delayInput.min = "0";
    delayInput.step = "0.1";
    delayInput.style.width = "110px";
    delayInput.value = String(action.delaySec ?? 1);
    delayInput.addEventListener("change", async () => {
      const v = Number(delayInput.value);
      action.delaySec = Number.isFinite(v) ? Math.max(0, v) : 1;
      await saveState();
      render();
    });

    left.appendChild(keyLabel);
    left.appendChild(keySelect);
    left.appendChild(pressLabel);
    left.appendChild(pressInput);
    left.appendChild(delayLabel);
    left.appendChild(delayInput);
  }

  if (action.type === "sheetsCheckValue") {
    const valueLabel = document.createElement("div");
    valueLabel.className = "pill";
    valueLabel.textContent = "Expected value";

    const valueInput = document.createElement("input");
    valueInput.className = "input";
    valueInput.type = "text";
    valueInput.placeholder = "Enter text to match";
    valueInput.style.minWidth = "220px";
    valueInput.value = action.expectedValue ?? "";
    valueInput.addEventListener("change", async () => {
      action.expectedValue = valueInput.value;
      await saveState();
      render();
    });

    const pickBtn = document.createElement("button");
    pickBtn.className = "btn";
    pickBtn.textContent = "Capture selected cell";

    pickBtn.addEventListener("click", async () => {
      const tab = await getActiveTab();
      if (!tab) {
        showStatus("⚠️ No active tab to read.");
        return;
      }
      const response = await chrome.runtime.sendMessage({
        type: "SHEETS_READ_SELECTION_DEBUG",
        tabId: tab.id
      });
      if (!response?.ok) {
        showStatus(`⚠️ ${response?.error || "Unable to read selection."}`);
        return;
      }
      action.cellRef = response.cellRef ?? "";
      action.lastReadCellRef = response.cellRef ?? "";
      action.lastReadValue = response.value ?? "";
      await saveState();
      render();
      showStatus("✅ Sheets cell captured");
    });

    const cellPill = document.createElement("div");
    cellPill.className = "pill";
    cellPill.textContent = action.cellRef ? `Selected cell: ${action.cellRef}` : "Selected cell: not set";

    const readPill = document.createElement("div");
    readPill.className = "pill";
    if (action.lastReadCellRef || action.lastReadValue) {
      const cell = action.lastReadCellRef ? action.lastReadCellRef : "selection";
      const value = action.lastReadValue !== "" ? `"${truncate(action.lastReadValue, 22)}"` : "(empty)";
      readPill.textContent = `Last read: ${cell} = ${value}`;
    } else {
      readPill.textContent = "Last read: not captured";
    }

    left.appendChild(valueLabel);
    left.appendChild(valueInput);
    left.appendChild(pickBtn);
    left.appendChild(cellPill);
    left.appendChild(readPill);
  }

  if (action.type === "sheetsCopy") {
    const label = document.createElement("div");
    label.className = "pill";
    label.textContent = "Copy active cell text";

    const lastPill = document.createElement("div");
    lastPill.className = "pill";
    if (action.lastCopiedA1 || Number.isFinite(action.lastCopiedLength)) {
      const cell = action.lastCopiedA1 ? action.lastCopiedA1 : "selection";
      const length = Number.isFinite(action.lastCopiedLength) ? action.lastCopiedLength : 0;
      const status = action.lastCopySuccess ? "copied" : "not copied";
      lastPill.textContent = `Last ${status}: ${cell} (${length} chars)`;
    } else {
      lastPill.textContent = "Last copied: not available";
    }

    left.appendChild(label);
    left.appendChild(lastPill);
  }

  if (action.type === "sheetsPaste") {
    const label = document.createElement("div");
    label.className = "pill";
    label.textContent = "Paste runtime clipboard text";

    const lastPill = document.createElement("div");
    lastPill.className = "pill";
    if (Number.isFinite(action.lastPastedLength)) {
      const length = Number.isFinite(action.lastPastedLength) ? action.lastPastedLength : 0;
      const status = action.lastPasteSuccess ? "pasted" : "not pasted";
      lastPill.textContent = `Last ${status}: ${length} chars`;
    } else {
      lastPill.textContent = "Last paste: not available";
    }

    left.appendChild(label);
    left.appendChild(lastPill);
  }

  if (action.type === "higgsfieldAi") {
    const status = runState.higgsfieldStatus.get(action.id);
    if (status) {
      const statusRow = document.createElement("div");
      statusRow.className = "row";
      const activePill = document.createElement("div");
      activePill.className = "pill";
      activePill.textContent = `Active jobs: ${status.activeCount} / ${status.threshold} → ${
        status.waiting ? "Waiting…" : "Ready"
      }`;
      const failedPill = document.createElement("div");
      failedPill.className = "pill";
      failedPill.textContent = `Failed: ${status.failedCount}`;
      statusRow.appendChild(activePill);
      statusRow.appendChild(failedPill);
      left.appendChild(statusRow);
    }

    const activeSection = document.createElement("div");
    activeSection.className = "phraseSection";
    const activeLabel = document.createElement("div");
    activeLabel.className = "pill";
    activeLabel.textContent = "Count these phrases as active jobs";
    const activeList = document.createElement("div");
    activeList.className = "phraseList";

    const activePhrases = normalizePhraseList(action.activePhrases, DEFAULT_ACTIVE_PHRASES);
    if (!activePhrases.length) activePhrases.push({ text: "", caseSensitive: false });
    action.activePhrases = activePhrases;

    activePhrases.forEach((phrase, phraseIndex) => {
      const row = document.createElement("div");
      row.className = "phraseRow";

      const input = document.createElement("input");
      input.className = "input phraseInput";
      input.type = "text";
      input.placeholder = "Add phrase";
      input.value = phrase.text ?? "";
      input.addEventListener("change", async () => {
        action.activePhrases[phraseIndex].text = input.value;
        await saveState();
        render();
      });

      const caseToggle = document.createElement("button");
      caseToggle.className = "btn toggle small" + (phrase.caseSensitive ? " active" : "");
      caseToggle.type = "button";
      caseToggle.textContent = phrase.caseSensitive ? "Case" : "iCase";
      caseToggle.addEventListener("click", async () => {
        action.activePhrases[phraseIndex].caseSensitive = !action.activePhrases[phraseIndex].caseSensitive;
        await saveState();
        render();
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "iconBtn small";
      removeBtn.type = "button";
      removeBtn.innerHTML = iconDelete();
      removeBtn.addEventListener("click", async () => {
        action.activePhrases.splice(phraseIndex, 1);
        if (!action.activePhrases.length) {
          action.activePhrases.push({ text: "", caseSensitive: false });
        }
        await saveState();
        render();
      });

      row.appendChild(input);
      row.appendChild(caseToggle);
      row.appendChild(removeBtn);
      activeList.appendChild(row);
    });

    const addActiveBtn = document.createElement("button");
    addActiveBtn.className = "btn small";
    addActiveBtn.type = "button";
    addActiveBtn.textContent = "Add phrase";
    addActiveBtn.addEventListener("click", async () => {
      action.activePhrases.push({ text: "", caseSensitive: false });
      await saveState();
      render();
    });

    activeSection.appendChild(activeLabel);
    activeSection.appendChild(activeList);
    activeSection.appendChild(addActiveBtn);

    const failureSection = document.createElement("div");
    failureSection.className = "phraseSection";
    const failureLabel = document.createElement("div");
    failureLabel.className = "pill";
    failureLabel.textContent = "Detect failures (report only)";
    const failureList = document.createElement("div");
    failureList.className = "phraseList";

    const failurePhrases = normalizePhraseList(action.failurePhrases, DEFAULT_FAILURE_PHRASES);
    if (!failurePhrases.length) failurePhrases.push({ text: "", caseSensitive: false });
    action.failurePhrases = failurePhrases;

    failurePhrases.forEach((phrase, phraseIndex) => {
      const row = document.createElement("div");
      row.className = "phraseRow";

      const input = document.createElement("input");
      input.className = "input phraseInput";
      input.type = "text";
      input.placeholder = "Add phrase";
      input.value = phrase.text ?? "";
      input.addEventListener("change", async () => {
        action.failurePhrases[phraseIndex].text = input.value;
        await saveState();
        render();
      });

      const caseToggle = document.createElement("button");
      caseToggle.className = "btn toggle small" + (phrase.caseSensitive ? " active" : "");
      caseToggle.type = "button";
      caseToggle.textContent = phrase.caseSensitive ? "Case" : "iCase";
      caseToggle.addEventListener("click", async () => {
        action.failurePhrases[phraseIndex].caseSensitive = !action.failurePhrases[phraseIndex].caseSensitive;
        await saveState();
        render();
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "iconBtn small";
      removeBtn.type = "button";
      removeBtn.innerHTML = iconDelete();
      removeBtn.addEventListener("click", async () => {
        action.failurePhrases.splice(phraseIndex, 1);
        if (!action.failurePhrases.length) {
          action.failurePhrases.push({ text: "", caseSensitive: false });
        }
        await saveState();
        render();
      });

      row.appendChild(input);
      row.appendChild(caseToggle);
      row.appendChild(removeBtn);
      failureList.appendChild(row);
    });

    const addFailureBtn = document.createElement("button");
    addFailureBtn.className = "btn small";
    addFailureBtn.type = "button";
    addFailureBtn.textContent = "Add phrase";
    addFailureBtn.addEventListener("click", async () => {
      action.failurePhrases.push({ text: "", caseSensitive: false });
      await saveState();
      render();
    });

    failureSection.appendChild(failureLabel);
    failureSection.appendChild(failureList);
    failureSection.appendChild(addFailureBtn);

    const settingsRow = document.createElement("div");
    settingsRow.className = "row";

    const thresholdLabel = document.createElement("div");
    thresholdLabel.className = "pill";
    thresholdLabel.textContent = "Max concurrent active jobs";
    const thresholdInput = document.createElement("input");
    thresholdInput.className = "input";
    thresholdInput.type = "number";
    thresholdInput.min = "1";
    thresholdInput.step = "1";
    thresholdInput.style.width = "120px";
    thresholdInput.value = String(action.threshold ?? DEFAULT_HIGGSFIELD_CONFIG.threshold);
    thresholdInput.addEventListener("change", async () => {
      const v = Number(thresholdInput.value);
      action.threshold = Number.isFinite(v) && v > 0 ? Math.round(v) : DEFAULT_HIGGSFIELD_CONFIG.threshold;
      await saveState();
      render();
    });

    const highlightLabel = document.createElement("div");
    highlightLabel.className = "pill";
    highlightLabel.textContent = "Highlight detected phrases";
    const highlightToggle = document.createElement("button");
    highlightToggle.className = "btn toggle" + (action.highlight !== false ? " active" : "");
    highlightToggle.type = "button";
    highlightToggle.textContent = action.highlight !== false ? "On" : "Off";
    highlightToggle.addEventListener("click", async () => {
      action.highlight = !(action.highlight !== false);
      await saveState();
      render();
    });

    settingsRow.appendChild(thresholdLabel);
    settingsRow.appendChild(thresholdInput);
    settingsRow.appendChild(highlightLabel);
    settingsRow.appendChild(highlightToggle);

    const timingRow = document.createElement("div");
    timingRow.className = "row";

    const pollLabel = document.createElement("div");
    pollLabel.className = "pill";
    pollLabel.textContent = "Poll interval (sec)";
    const pollInput = document.createElement("input");
    pollInput.className = "input";
    pollInput.type = "number";
    pollInput.min = "0.2";
    pollInput.step = "0.1";
    pollInput.style.width = "120px";
    pollInput.value = String(action.pollIntervalSec ?? DEFAULT_HIGGSFIELD_CONFIG.pollIntervalSec);
    pollInput.addEventListener("change", async () => {
      const v = Number(pollInput.value);
      action.pollIntervalSec = Number.isFinite(v) && v >= 0.2 ? v : DEFAULT_HIGGSFIELD_CONFIG.pollIntervalSec;
      await saveState();
      render();
    });

    const timeoutLabel = document.createElement("div");
    timeoutLabel.className = "pill";
    timeoutLabel.textContent = "Timeout (sec)";
    const timeoutInput = document.createElement("input");
    timeoutInput.className = "input";
    timeoutInput.type = "number";
    timeoutInput.min = "0";
    timeoutInput.step = "10";
    timeoutInput.style.width = "120px";
    timeoutInput.value = String(action.timeoutSec ?? DEFAULT_HIGGSFIELD_CONFIG.timeoutSec);
    timeoutInput.addEventListener("change", async () => {
      const v = Number(timeoutInput.value);
      action.timeoutSec = Number.isFinite(v) && v >= 0 ? v : DEFAULT_HIGGSFIELD_CONFIG.timeoutSec;
      await saveState();
      render();
    });

    const maxLabel = document.createElement("div");
    maxLabel.className = "pill";
    maxLabel.textContent = "Max highlights";
    const maxInput = document.createElement("input");
    maxInput.className = "input";
    maxInput.type = "number";
    maxInput.min = "0";
    maxInput.step = "1";
    maxInput.style.width = "120px";
    maxInput.value = String(action.maxHighlights ?? DEFAULT_HIGGSFIELD_CONFIG.maxHighlights);
    maxInput.addEventListener("change", async () => {
      const v = Number(maxInput.value);
      action.maxHighlights = Number.isFinite(v) && v >= 0 ? Math.round(v) : DEFAULT_HIGGSFIELD_CONFIG.maxHighlights;
      await saveState();
      render();
    });

    timingRow.appendChild(pollLabel);
    timingRow.appendChild(pollInput);
    timingRow.appendChild(timeoutLabel);
    timingRow.appendChild(timeoutInput);
    timingRow.appendChild(maxLabel);
    timingRow.appendChild(maxInput);

    left.appendChild(activeSection);
    left.appendChild(failureSection);
    left.appendChild(settingsRow);
    left.appendChild(timingRow);
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
  if (action.type === "textBlocks") {
    const list = document.createElement("div");
    list.className = "textBlockList";

    if (!Array.isArray(action.blocks) || action.blocks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pill";
      empty.textContent = "No text blocks yet.";
      list.appendChild(empty);
    } else {
      action.blocks.forEach((block, blockIndex) => {
        const row = document.createElement("div");
        row.className = "textBlockRow";

        const indexBadge = document.createElement("div");
        indexBadge.className = "textBlockIndex";
        indexBadge.textContent = String(blockIndex + 1);

        const input = document.createElement("textarea");
        input.className = "textBlockInput";
        input.rows = 2;
        input.placeholder = "Enter text to paste";
        input.value = block.text ?? "";
        input.addEventListener("change", async () => {
          block.text = input.value;
          await saveState();
          render();
        });

        const toggle = document.createElement("button");
        toggle.className = "btn toggle" + (block.enabled !== false ? " active" : "");
        toggle.type = "button";
        toggle.textContent = block.enabled !== false ? "Enabled" : "Disabled";
        toggle.addEventListener("click", async () => {
          block.enabled = block.enabled === false;
          await saveState();
          render();
        });

        row.appendChild(indexBadge);
        row.appendChild(input);
        row.appendChild(toggle);
        list.appendChild(row);
      });
    }

    body.appendChild(list);
  }
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
    clearDropIndicators();
  });

  dragHandle.addEventListener("dragend", () => {
    tItem.classList.remove("dragging");
    clearDropIndicators();
  });

  tItem.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = tItem.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    clearDropIndicators();
    tItem.classList.toggle("drop-before", before);
    tItem.classList.toggle("drop-after", !before);
  });

  tItem.addEventListener("dragleave", (e) => {
    if (!tItem.contains(e.relatedTarget)) {
      tItem.classList.remove("drop-before", "drop-after");
    }
  });

  tItem.addEventListener("drop", async (e) => {
    e.preventDefault();
    clearDropIndicators();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === action.id) return;
    const fromIndex = state.actions.findIndex((a) => a.id === draggedId);
    const toIndex = state.actions.findIndex((a) => a.id === action.id);
    if (fromIndex < 0 || toIndex < 0) return;

    const insertAfter = tItem.classList.contains("drop-after");
    const [moved] = state.actions.splice(fromIndex, 1);
    let insertIndex = insertAfter ? toIndex + 1 : toIndex;
    if (fromIndex < insertIndex) insertIndex -= 1;
    state.actions.splice(insertIndex, 0, moved);
    clearDropIndicators();
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
    runState.checkResults = new Map();
    runState.higgsfieldStatus = new Map();
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
    runState.higgsfieldStatus = new Map();
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
    runState.higgsfieldStatus = new Map();
    render();
    showStatus("⏹️ Flow stopped");
  }

  if (msg?.type === "FLOW_ERROR") {
    runState.status = "idle";
    runState.currentId = null;
    runState.higgsfieldStatus = new Map();
    render();
    showStatus("❌ Flow error: " + msg.error, 3500);
  }

  if (msg?.type === "SHEETS_COPY_REQUEST") {
    closeSheetsCopyModal();
    handleSheetsCopyRequest({
      requestId: msg.requestId,
      a1: msg.a1,
      formulaText: msg.formulaText ?? ""
    });
  }

  if (msg?.type === "SHEETS_CHECK_RESULT") {
    if (msg.actionId) {
      const action = state.actions.find((item) => item.id === msg.actionId);
      if (action) {
        action.lastReadCellRef = msg.cellRef ?? "";
        action.lastReadValue = msg.actual ?? "";
        saveState();
      }
      runState.checkResults.set(msg.actionId, {
        matched: msg.matched,
        cellRef: msg.cellRef,
        expected: msg.expected,
        actual: msg.actual
      });
      render();
    }
  }

  if (msg?.type === "HIGGSFIELD_STATUS") {
    if (msg.actionId) {
      runState.higgsfieldStatus.set(msg.actionId, {
        activeCount: msg.activeCount ?? 0,
        failedCount: msg.failedCount ?? 0,
        threshold: msg.threshold ?? DEFAULT_HIGGSFIELD_CONFIG.threshold,
        waiting: msg.waiting === true
      });
      render();
    }
  }

  if (msg?.type === "SHEETS_COPY_STATUS") {
    if (msg.actionId) {
      const action = state.actions.find((item) => item.id === msg.actionId);
      if (action) {
        action.lastCopiedA1 = msg.a1 ?? "";
        action.lastCopiedLength = Number.isFinite(msg.copiedTextLength) ? msg.copiedTextLength : 0;
        action.lastCopySuccess = msg.success === true;
        saveState();
      }
      render();
    }
    if (msg.success) {
      showStatus("✅ Sheets cell copied");
    } else {
      showStatus(`⚠️ Sheets copy failed${msg.error ? `: ${msg.error}` : ""}`);
    }
  }

  if (msg?.type === "SHEETS_PASTE_STATUS") {
    if (msg.actionId) {
      const action = state.actions.find((item) => item.id === msg.actionId);
      if (action) {
        action.lastPastedLength = Number.isFinite(msg.length) ? msg.length : 0;
        action.lastPasteSuccess = msg.success === true;
        saveState();
      }
      render();
    }
    if (msg.success) {
      showStatus("✅ Runtime clipboard pasted");
    } else {
      showStatus(`⚠️ Sheets paste failed${msg.error ? `: ${msg.error}` : ""}`);
    }
  }

  if (msg?.type === "TEXT_BLOCK_USED") {
    const action = state.actions.find((item) => item.id === msg.actionId);
    if (action && action.type === "textBlocks") {
      const blocks = Array.isArray(action.blocks) ? action.blocks : [];
      const block = blocks.find((item) => item.id === msg.blockId);
      if (block) {
        block.enabled = false;
        saveState().then(render);
      } else {
        render();
      }
    }
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || ignoreCanvasStorageUpdate) return;
  if (changes.autolineCanvasState?.newValue) {
    const canvasActions = getCanvasActions(changes.autolineCanvasState.newValue);
    if (Array.isArray(canvasActions)) {
      state.actions = canvasActions;
      render();
    }
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
