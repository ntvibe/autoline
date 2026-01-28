const canvasPlayBtn = document.getElementById("canvasPlayBtn");
const canvasPauseBtn = document.getElementById("canvasPauseBtn");
const canvasStopBtn = document.getElementById("canvasStopBtn");
const canvasSettingsBtn = document.getElementById("canvasSettingsBtn");
const canvasAddNodeBtn = document.getElementById("canvasAddNodeBtn");
const canvasSaveBtn = document.getElementById("canvasSaveBtn");
const canvasOpenBtn = document.getElementById("canvasOpenBtn");
const canvasImportBtn = document.getElementById("canvasImportBtn");
const canvasZoomOutBtn = document.getElementById("canvasZoomOutBtn");
const canvasZoomInBtn = document.getElementById("canvasZoomInBtn");
const canvasFrameBtn = document.getElementById("canvasFrameBtn");

const canvasViewport = document.getElementById("canvasViewport");
const canvasInner = document.getElementById("canvasInner");
const canvasLines = document.getElementById("canvasLines");
const canvasNodes = document.getElementById("canvasNodes");
const canvasRunner = document.getElementById("canvasRunner");
const workflowNameInput = document.getElementById("workflowNameInput");
const canvasStatus = document.getElementById("canvasStatus");

const nodeSidebar = document.getElementById("nodeSidebar");
const nodeOptions = document.getElementById("nodeOptions");
const sidebarSubtitle = document.getElementById("sidebarSubtitle");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");

const addNodeBackdrop = document.getElementById("addNodeBackdrop");
const closeAddNodeBtn = document.getElementById("closeAddNodeBtn");
const addNodeList = document.getElementById("addNodeList");

const settingsBackdrop = document.getElementById("settingsBackdrop");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const themeSelect = document.getElementById("themeSelect");
const runSpeedInput = document.getElementById("runSpeedInput");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");

const workflowBackdrop = document.getElementById("workflowBackdrop");
const workflowModalTitle = document.getElementById("workflowModalTitle");
const workflowList = document.getElementById("workflowList");
const closeWorkflowBtn = document.getElementById("closeWorkflowBtn");

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

const ACTION_DEFS = [
  { type: "switchTab", label: "Switch Tab", hint: "Activate a recorded tab during replay" },
  { type: "delay", label: "Delay", hint: "Wait before the next action" },
  { type: "openUrl", label: "Open URL", hint: "Navigate the active tab to a URL" },
  { type: "click", label: "Click", hint: "Record and replay a precise click on the page" },
  { type: "reloadTab", label: "Reload Tab", hint: "Refresh the active tab" },
  { type: "simpleLoop", label: "Simple Loop", hint: "Repeat the entire flow until stopped" },
  { type: "textBlocks", label: "Text Blocks", hint: "Insert saved text blocks into fields" },
  { type: "clipboard", label: "Clipboard", hint: "Copy the current selection or paste clipboard text" },
  { type: "keyboard", label: "Keyboard", hint: "Send keyboard shortcuts or navigation keys" },
  { type: "sheetsCheckValue", label: "Sheets Check Value", hint: "Validate the selected Google Sheets cell value" },
  { type: "sheetsCopy", label: "Sheets Copy", hint: "Copy the active Google Sheets cell text" },
  { type: "sheetsPaste", label: "Sheets Paste", hint: "Paste the runtime clipboard into the focused field" },
  { type: "higgsfieldAi", label: "Higgsfield AI", hint: "Wait for job capacity based on status phrases" }
];

let canvasState = {
  workflowName: "Workflow",
  nodes: [],
  connections: [],
  settings: {
    themeMode: "auto",
    runSpeedMs: 800,
    zoom: 1
  }
};

let workflows = [];
let selectedNodeId = null;
let dragState = null;
let workflowMode = "open";
let runState = {
  status: "idle",
  currentActionId: null,
  doneActionIds: new Set()
};
let animationFrame = null;

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function showStatus(text, ms = 2000) {
  canvasStatus.textContent = text;
  canvasStatus.classList.remove("hidden");
  window.clearTimeout(showStatus._t);
  showStatus._t = window.setTimeout(() => canvasStatus.classList.add("hidden"), ms);
}

function createTextBlock(text = "") {
  return { id: uid(), text, enabled: true };
}

function createAction(type) {
  switch (type) {
    case "switchTab":
      return { id: uid(), type: "switchTab", collapsed: true, jsonOpen: false, tab: null };
    case "delay":
      return { id: uid(), type: "delay", collapsed: true, jsonOpen: false, delaySec: 1 };
    case "openUrl":
      return { id: uid(), type: "openUrl", collapsed: true, jsonOpen: false, url: "" };
    case "click":
      return {
        id: uid(),
        type: "click",
        collapsed: true,
        jsonOpen: false,
        target: null,
        click: null,
        clickCount: 1,
        showClickDot: true
      };
    case "reloadTab":
      return { id: uid(), type: "reloadTab", collapsed: true, jsonOpen: false };
    case "simpleLoop":
      return {
        id: uid(),
        type: "simpleLoop",
        collapsed: true,
        jsonOpen: false,
        enabled: true,
        loopCount: 1
      };
    case "textBlocks":
      return {
        id: uid(),
        type: "textBlocks",
        collapsed: true,
        jsonOpen: false,
        blocks: [createTextBlock("")]
      };
    case "clipboard":
      return { id: uid(), type: "clipboard", collapsed: true, jsonOpen: false, mode: "copy" };
    case "keyboard":
      return {
        id: uid(),
        type: "keyboard",
        collapsed: true,
        jsonOpen: false,
        key: "ctrlA",
        pressCount: 1,
        delaySec: 1
      };
    case "sheetsCheckValue":
      return {
        id: uid(),
        type: "sheetsCheckValue",
        collapsed: true,
        jsonOpen: false,
        expectedValue: "",
        cellRef: ""
      };
    case "sheetsCopy":
      return {
        id: uid(),
        type: "sheetsCopy",
        collapsed: true,
        jsonOpen: false,
        lastCopiedA1: "",
        lastCopiedLength: 0,
        lastCopySuccess: false
      };
    case "sheetsPaste":
      return {
        id: uid(),
        type: "sheetsPaste",
        collapsed: true,
        jsonOpen: false,
        lastPastedLength: 0,
        lastPasteSuccess: false
      };
    case "higgsfieldAi":
      return {
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
    default:
      return { id: uid(), type, collapsed: true, jsonOpen: false };
  }
}

function buildCanvasFromActions(actions, name = "Workflow") {
  const nodes = [];
  const connections = [];
  const startNode = {
    id: uid(),
    kind: "start",
    label: "Start",
    position: { x: 140, y: 160 },
    expanded: false
  };
  const endNode = {
    id: uid(),
    kind: "end",
    label: "End",
    position: { x: 140 + (actions.length + 1) * 220, y: 160 },
    expanded: false
  };
  nodes.push(startNode);

  let prev = startNode;
  actions.forEach((action, index) => {
    const node = {
      id: uid(),
      kind: "action",
      label: action.type,
      action,
      position: { x: 140 + (index + 1) * 220, y: 160 },
      expanded: false
    };
    nodes.push(node);
    connections.push({ from: prev.id, to: node.id });
    prev = node;
  });

  nodes.push(endNode);
  connections.push({ from: prev.id, to: endNode.id });

  return {
    workflowName: name,
    nodes,
    connections,
    settings: {
      themeMode: canvasState.settings.themeMode ?? "auto",
      runSpeedMs: canvasState.settings.runSpeedMs ?? 800,
      zoom: 1
    }
  };
}

function ensureStartEndNodes() {
  const startNodes = canvasState.nodes.filter((node) => node.kind === "start");
  const endNodes = canvasState.nodes.filter((node) => node.kind === "end");
  if (!startNodes.length) {
    canvasState.nodes.push({
      id: uid(),
      kind: "start",
      label: "Start",
      position: { x: 140, y: 160 },
      expanded: false
    });
  }
  if (!endNodes.length) {
    canvasState.nodes.push({
      id: uid(),
      kind: "end",
      label: "End",
      position: { x: 580, y: 160 },
      expanded: false
    });
  }

  if (startNodes.length > 1) {
    canvasState.nodes = canvasState.nodes.filter((node, index) => node.kind !== "start" || index === 0);
  }
  if (endNodes.length > 1) {
    canvasState.nodes = canvasState.nodes.filter((node, index) => node.kind !== "end" || index === 0);
  }
}

function getStartNode() {
  return canvasState.nodes.find((node) => node.kind === "start");
}

function getEndNode() {
  return canvasState.nodes.find((node) => node.kind === "end");
}

function getNodeById(id) {
  return canvasState.nodes.find((node) => node.id === id);
}

function getNodeByActionId(actionId) {
  return canvasState.nodes.find((node) => node.kind === "action" && node.action?.id === actionId);
}

function getOutgoingConnection(nodeId) {
  return canvasState.connections.find((connection) => connection.from === nodeId);
}

function getIncomingConnection(nodeId) {
  return canvasState.connections.find((connection) => connection.to === nodeId);
}

function removeConnectionsForNode(nodeId) {
  canvasState.connections = canvasState.connections.filter(
    (connection) => connection.from !== nodeId && connection.to !== nodeId
  );
}

function connectNodes(fromId, toId) {
  canvasState.connections = canvasState.connections.filter((connection) => connection.from !== fromId);
  if (fromId && toId) {
    canvasState.connections.push({ from: fromId, to: toId });
  }
}

function getFlowActionsFromCanvas() {
  const startNode = getStartNode();
  if (!startNode) return [];
  const nodesById = new Map(canvasState.nodes.map((node) => [node.id, node]));
  const actions = [];
  const visited = new Set();
  let current = startNode;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.kind === "action" && current.action) actions.push(current.action);
    const connection = canvasState.connections.find((item) => item.from === current.id);
    if (!connection) break;
    current = nodesById.get(connection.to);
    if (!current || current.kind === "end") break;
  }
  return actions;
}

function normalizeCanvasState() {
  canvasState.nodes ||= [];
  canvasState.connections ||= [];
  canvasState.settings ||= { themeMode: "auto", runSpeedMs: 800, zoom: 1 };
  ensureStartEndNodes();

  const startNode = getStartNode();
  const endNode = getEndNode();
  if (startNode && endNode && !getOutgoingConnection(startNode.id)) {
    connectNodes(startNode.id, endNode.id);
  }
}

async function loadWorkflows() {
  const res = await chrome.storage.local.get("autolineWorkflows");
  workflows = Array.isArray(res.autolineWorkflows) ? res.autolineWorkflows : [];
}

async function saveCanvasState() {
  await chrome.storage.local.set({ autolineCanvasState: canvasState });
  const actions = getFlowActionsFromCanvas();
  const res = await chrome.storage.local.get("autolineState");
  const nextState = res.autolineState ?? { actions: [], settings: {}, workflowName: canvasState.workflowName };
  nextState.actions = actions;
  nextState.workflowName = canvasState.workflowName || nextState.workflowName;
  await chrome.storage.local.set({ autolineState: nextState });
}

function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
}

function openAddNodeModal() {
  addNodeBackdrop.classList.remove("hidden");
}

function closeAddNodeModal() {
  addNodeBackdrop.classList.add("hidden");
}

function openSettingsModal() {
  themeSelect.value = canvasState.settings.themeMode ?? "auto";
  runSpeedInput.value = String(canvasState.settings.runSpeedMs ?? 800);
  settingsBackdrop.classList.remove("hidden");
}

function closeSettingsModal() {
  settingsBackdrop.classList.add("hidden");
}

function openWorkflowModal(mode) {
  workflowMode = mode;
  workflowModalTitle.textContent = mode === "open" ? "Open workflow" : "Import workflow";
  workflowBackdrop.classList.remove("hidden");
  renderWorkflowList();
}

function closeWorkflowModal() {
  workflowBackdrop.classList.add("hidden");
}

function renderWorkflowList() {
  workflowList.innerHTML = "";
  if (!workflows.length) {
    const empty = document.createElement("div");
    empty.className = "nodeTag";
    empty.textContent = "No saved workflows yet.";
    workflowList.appendChild(empty);
    return;
  }

  workflows.forEach((workflow) => {
    const item = document.createElement("div");
    item.className = "workflowItem";

    const name = document.createElement("div");
    name.textContent = workflow.name || "Untitled workflow";

    const actions = document.createElement("div");
    actions.className = "workflowActions";

    const useBtn = document.createElement("button");
    useBtn.className = "btn primary";
    useBtn.textContent = workflowMode === "open" ? "Open" : "Import";
    useBtn.addEventListener("click", async () => {
      const payload = workflow.data?.actions || [];
      if (workflowMode === "open") {
        canvasState = buildCanvasFromActions(payload, workflow.name || "Workflow");
        normalizeCanvasState();
      } else {
        const endNode = getEndNode();
        const startNode = getStartNode();
        if (!startNode || !endNode) return;
        const path = getFlowActionsFromCanvas();
        let anchor = getNodeByActionId(path.at(-1)?.id ?? null);
        if (!anchor) anchor = startNode;
        const insertBaseX = (anchor.position?.x ?? 140) + 220;
        const insertY = anchor.position?.y ?? 160;
        const newNodes = [];
        payload.forEach((action, index) => {
          const node = {
            id: uid(),
            kind: "action",
            label: action.type,
            action,
            position: { x: insertBaseX + index * 220, y: insertY + index * 40 },
            expanded: false
          };
          canvasState.nodes.push(node);
          newNodes.push(node);
        });
        if (newNodes.length) {
          connectNodes(anchor.id, newNodes[0].id);
          newNodes.forEach((node, index) => {
            if (index === 0) return;
            connectNodes(newNodes[index - 1].id, node.id);
          });
          connectNodes(newNodes[newNodes.length - 1].id, endNode.id);
        }
      }
      await saveCanvasState();
      render();
      closeWorkflowModal();
    });

    actions.appendChild(useBtn);
    item.appendChild(name);
    item.appendChild(actions);
    workflowList.appendChild(item);
  });
}

function renderAddNodeList() {
  addNodeList.innerHTML = "";
  ACTION_DEFS.forEach((actionDef) => {
    const btn = document.createElement("button");
    btn.className = "nodeItem";
    btn.innerHTML = `<div class="nodeTitle">${actionDef.label}</div><div class="nodeTag">${actionDef.hint}</div>`;
    btn.addEventListener("click", async () => {
      const action = createAction(actionDef.type);
      const newNode = {
        id: uid(),
        kind: "action",
        label: action.type,
        action,
        position: { x: 360, y: 320 },
        expanded: false
      };
      canvasState.nodes.push(newNode);
      const endNode = getEndNode();
      const startNode = getStartNode();
      const path = getFlowActionsFromCanvas();
      let anchor = getNodeByActionId(path.at(-1)?.id ?? null);
      if (!anchor) anchor = startNode;
      connectNodes(anchor.id, newNode.id);
      if (endNode) connectNodes(newNode.id, endNode.id);
      await saveCanvasState();
      render();
      closeAddNodeModal();
      showStatus("✅ Node added");
    });
    addNodeList.appendChild(btn);
  });
}

function render() {
  workflowNameInput.value = canvasState.workflowName || "Workflow";
  applyTheme(canvasState.settings.themeMode ?? "auto");
  canvasInner.style.transform = `scale(${canvasState.settings.zoom ?? 1})`;

  renderNodes();
  renderConnections();
  renderSidebar();
}

function renderNodes() {
  canvasNodes.innerHTML = "";
  const nodeMap = new Map();

  canvasState.nodes.forEach((node) => {
    const nodeEl = document.createElement("div");
    nodeEl.className = "nodeCard";
    nodeEl.dataset.nodeId = node.id;
    nodeEl.style.left = `${node.position?.x ?? 0}px`;
    nodeEl.style.top = `${node.position?.y ?? 0}px`;
    if (node.expanded) nodeEl.classList.add("expanded");
    if (selectedNodeId === node.id) nodeEl.classList.add("selected");
    if (node.action?.id && runState.currentActionId === node.action.id) nodeEl.classList.add("running");

    const header = document.createElement("div");
    header.className = "nodeHeader";

    const titleWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "nodeTitle";
    title.textContent = node.kind === "action" ? node.label : node.label;
    const tag = document.createElement("div");
    tag.className = "nodeTag";
    tag.textContent = node.kind === "action" ? "Action" : "System";
    titleWrap.appendChild(title);
    titleWrap.appendChild(tag);

    const actions = document.createElement("div");
    actions.className = "nodeActions";

    const expandBtn = document.createElement("button");
    expandBtn.className = "nodeExpand";
    expandBtn.innerHTML = `<span class="material-icons" aria-hidden="true">${node.expanded ? "expand_less" : "chevron_right"}</span>`;
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      node.expanded = !node.expanded;
      render();
    });

    actions.appendChild(expandBtn);

    if (node.kind === "action") {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "nodeExpand";
      deleteBtn.innerHTML = '<span class="material-icons" aria-hidden="true">delete</span>';
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        deleteNode(node.id);
        await saveCanvasState();
        render();
        showStatus("🗑️ Node deleted");
      });
      actions.appendChild(deleteBtn);
    }

    header.appendChild(titleWrap);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.className = "nodeBody";
    if (node.kind === "action") {
      renderNodeOptionsContent(body, node, true);
    } else {
      body.innerHTML = `<div class="nodeTag">${node.kind === "start" ? "Starting point" : "Ending point"}</div>`;
    }

    const footer = document.createElement("div");
    footer.className = "nodeFooter";
    if (node.kind === "action") {
      const runBtn = document.createElement("button");
      runBtn.className = "btn";
      runBtn.textContent = "Run from here";
      runBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        runFromNode(node.id);
      });
      footer.appendChild(runBtn);
    }

    nodeEl.appendChild(header);
    nodeEl.appendChild(body);
    nodeEl.appendChild(footer);

    nodeEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("input, textarea, select, button")) return;
      dragState = {
        nodeId: node.id,
        startX: e.clientX,
        startY: e.clientY,
        originX: node.position?.x ?? 0,
        originY: node.position?.y ?? 0
      };
      nodeEl.style.cursor = "grabbing";
      e.stopPropagation();
    });

    nodeEl.addEventListener("click", () => {
      selectedNodeId = node.id;
      renderSidebar();
      render();
    });

    canvasNodes.appendChild(nodeEl);
    nodeMap.set(node.id, nodeEl);
  });
}

function renderConnections() {
  canvasLines.innerHTML = "";
  canvasRunner.innerHTML = "";
  const nodeElements = Array.from(canvasNodes.children);
  const nodeById = new Map();
  nodeElements.forEach((el) => nodeById.set(getNodeIdFromElement(el), el));

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "arrow");
  marker.setAttribute("markerWidth", "10");
  marker.setAttribute("markerHeight", "10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "3");
  marker.setAttribute("orient", "auto");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M0,0 L8,3 L0,6 Z");
  path.setAttribute("fill", "rgba(124, 108, 255, 0.7)");
  marker.appendChild(path);
  defs.appendChild(marker);
  canvasLines.appendChild(defs);

  canvasState.connections.forEach((connection) => {
    const fromNode = getNodeById(connection.from);
    const toNode = getNodeById(connection.to);
    if (!fromNode || !toNode) return;
    const fromEl = nodeById.get(connection.from);
    const toEl = nodeById.get(connection.to);
    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const viewportRect = canvasInner.getBoundingClientRect();

    const x1 = fromRect.left - viewportRect.left + fromRect.width / 2;
    const y1 = fromRect.top - viewportRect.top + fromRect.height / 2;
    const x2 = toRect.left - viewportRect.left + toRect.width / 2;
    const y2 = toRect.top - viewportRect.top + toRect.height / 2;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", "rgba(124, 108, 255, 0.6)");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("marker-end", "url(#arrow)");
    canvasLines.appendChild(line);
  });
}

function renderSidebar() {
  const node = selectedNodeId ? getNodeById(selectedNodeId) : null;
  if (!node) {
    sidebarSubtitle.textContent = "Select a node";
    nodeOptions.innerHTML = "<div class=\"nodeTag\">Choose a node to edit its options.</div>";
    return;
  }
  sidebarSubtitle.textContent = node.kind === "action" ? node.label : node.label + " node";
  nodeOptions.innerHTML = "";

  const infoCard = document.createElement("div");
  infoCard.className = "optionsCard";
  infoCard.innerHTML = `<div class="nodeTag">${node.kind === "action" ? "Action node" : "System node"}</div>`;
  nodeOptions.appendChild(infoCard);

  if (node.kind === "action") {
    const optionsCard = document.createElement("div");
    optionsCard.className = "optionsCard";
    renderNodeOptionsContent(optionsCard, node, false);
    nodeOptions.appendChild(optionsCard);
  }

  if (node.kind !== "end") {
    const connectCard = document.createElement("div");
    connectCard.className = "optionsCard";
    const label = document.createElement("div");
    label.className = "nodeTag";
    label.textContent = "Connection";
    const select = document.createElement("select");
    const optionNone = document.createElement("option");
    optionNone.value = "";
    optionNone.textContent = "Disconnect";
    select.appendChild(optionNone);

    canvasState.nodes.forEach((candidate) => {
      if (candidate.id === node.id || candidate.kind === "start") return;
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = `${candidate.kind === "action" ? candidate.label : candidate.label}`;
      select.appendChild(option);
    });

    const existing = getOutgoingConnection(node.id);
    select.value = existing?.to ?? "";
    select.addEventListener("change", async () => {
      connectNodes(node.id, select.value || null);
      await saveCanvasState();
      render();
    });

    connectCard.appendChild(label);
    connectCard.appendChild(select);
    nodeOptions.appendChild(connectCard);
  }

  if (node.kind === "action") {
    const actionsCard = document.createElement("div");
    actionsCard.className = "optionsCard";
    const actionRow = document.createElement("div");
    actionRow.className = "optionActions";

    const runBtn = document.createElement("button");
    runBtn.className = "btn";
    runBtn.textContent = "Run from this node";
    runBtn.addEventListener("click", () => runFromNode(node.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn";
    deleteBtn.textContent = "Delete node";
    deleteBtn.addEventListener("click", async () => {
      deleteNode(node.id);
      await saveCanvasState();
      render();
      showStatus("🗑️ Node deleted");
    });

    actionRow.appendChild(runBtn);
    actionRow.appendChild(deleteBtn);
    actionsCard.appendChild(actionRow);
    nodeOptions.appendChild(actionsCard);
  }
}

function getNodeIdFromElement(el) {
  return el.dataset.nodeId;
}

function renderNodeOptionsContent(container, node, compact) {
  if (!node.action) return;
  const action = node.action;

  const title = document.createElement("div");
  title.className = "nodeTag";
  title.textContent = `Type: ${action.type}`;
  container.appendChild(title);

  if (action.type === "delay") {
    const row = createOptionRow("Delay (sec)", "number", action.delaySec ?? 1, (val) => {
      action.delaySec = Number(val) || 1;
      persistAndRender();
    });
    container.appendChild(row);
  }

  if (action.type === "openUrl") {
    const row = createOptionRow("URL", "text", action.url ?? "", (val) => {
      action.url = val;
      persistAndRender();
    });
    container.appendChild(row);
  }

  if (action.type === "switchTab") {
    const row = document.createElement("div");
    row.className = "optionRow";
    const label = document.createElement("label");
    label.textContent = "Active tab";
    const info = document.createElement("div");
    info.className = "nodeTag";
    info.textContent = action.tab?.title ? action.tab.title : "No tab selected";
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Use current tab";
    btn.addEventListener("click", async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs?.[0];
      if (tab) {
        action.tab = { tabId: tab.id, title: tab.title, url: tab.url };
        persistAndRender();
      }
    });
    row.appendChild(label);
    row.appendChild(info);
    row.appendChild(btn);
    container.appendChild(row);
  }

  if (action.type === "click") {
    const row = document.createElement("div");
    row.className = "optionRow";
    const label = document.createElement("label");
    label.textContent = "Click target";
    const info = document.createElement("div");
    info.className = "nodeTag";
    info.textContent = action.target ? "Target recorded" : "No target recorded";
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Record click";
    btn.addEventListener("click", async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs?.[0];
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: "ARM_CLICK_RECORD", actionId: action.id });
        showStatus("🎯 Click armed. Click in the page.");
      }
    });
    row.appendChild(label);
    row.appendChild(info);
    row.appendChild(btn);
    container.appendChild(row);
  }

  if (action.type === "simpleLoop") {
    const enabledRow = createToggleRow("Enabled", action.enabled !== false, (val) => {
      action.enabled = val;
      persistAndRender();
    });
    const countRow = createOptionRow("Loop count", "number", action.loopCount ?? 1, (val) => {
      action.loopCount = Number(val) || 1;
      persistAndRender();
    });
    container.appendChild(enabledRow);
    container.appendChild(countRow);
  }

  if (action.type === "textBlocks") {
    const blocks = Array.isArray(action.blocks) ? action.blocks : [];
    blocks.forEach((block, index) => {
      const row = document.createElement("div");
      row.className = "optionRow";
      const label = document.createElement("label");
      label.textContent = `Block ${index + 1}`;
      const textarea = document.createElement("textarea");
      textarea.value = block.text ?? "";
      textarea.addEventListener("input", (e) => {
        block.text = e.target.value;
        persistAndRender();
      });
      const toggle = createToggleRow("Enabled", block.enabled !== false, (val) => {
        block.enabled = val;
        persistAndRender();
      });
      row.appendChild(label);
      row.appendChild(textarea);
      row.appendChild(toggle);
      container.appendChild(row);
    });
    const addBtn = document.createElement("button");
    addBtn.className = "btn";
    addBtn.textContent = "Add block";
    addBtn.addEventListener("click", () => {
      action.blocks = Array.isArray(action.blocks) ? action.blocks : [];
      action.blocks.push(createTextBlock(""));
      persistAndRender();
    });
    container.appendChild(addBtn);
  }

  if (action.type === "clipboard") {
    const row = createSelectRow(
      "Mode",
      [
        { value: "copy", label: "Copy" },
        { value: "paste", label: "Paste" }
      ],
      action.mode ?? "copy",
      (val) => {
        action.mode = val;
        persistAndRender();
      }
    );
    container.appendChild(row);
  }

  if (action.type === "keyboard") {
    const keyRow = createOptionRow("Key", "text", action.key ?? "ctrlA", (val) => {
      action.key = val;
      persistAndRender();
    });
    const pressRow = createOptionRow("Press count", "number", action.pressCount ?? 1, (val) => {
      action.pressCount = Number(val) || 1;
      persistAndRender();
    });
    const delayRow = createOptionRow("Delay (sec)", "number", action.delaySec ?? 1, (val) => {
      action.delaySec = Number(val) || 1;
      persistAndRender();
    });
    container.appendChild(keyRow);
    container.appendChild(pressRow);
    container.appendChild(delayRow);
  }

  if (action.type === "sheetsCheckValue") {
    const expectedRow = createOptionRow("Expected value", "text", action.expectedValue ?? "", (val) => {
      action.expectedValue = val;
      persistAndRender();
    });
    const cellRow = createOptionRow("Cell ref", "text", action.cellRef ?? "", (val) => {
      action.cellRef = val;
      persistAndRender();
    });
    container.appendChild(expectedRow);
    container.appendChild(cellRow);
  }

  if (action.type === "higgsfieldAi") {
    const thresholdRow = createOptionRow("Threshold", "number", action.threshold ?? 4, (val) => {
      action.threshold = Number(val) || 4;
      persistAndRender();
    });
    const highlightRow = createToggleRow("Highlight", action.highlight !== false, (val) => {
      action.highlight = val;
      persistAndRender();
    });
    const pollRow = createOptionRow("Poll interval (sec)", "number", action.pollIntervalSec ?? 1.5, (val) => {
      action.pollIntervalSec = Number(val) || 1.5;
      persistAndRender();
    });
    const timeoutRow = createOptionRow("Timeout (sec)", "number", action.timeoutSec ?? 600, (val) => {
      action.timeoutSec = Number(val) || 600;
      persistAndRender();
    });
    const maxRow = createOptionRow("Max highlights", "number", action.maxHighlights ?? 80, (val) => {
      action.maxHighlights = Number(val) || 80;
      persistAndRender();
    });
    container.appendChild(thresholdRow);
    container.appendChild(highlightRow);
    container.appendChild(pollRow);
    container.appendChild(timeoutRow);
    container.appendChild(maxRow);
  }
}

function createOptionRow(labelText, type, value, onChange) {
  const row = document.createElement("div");
  row.className = "optionRow";
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  input.addEventListener("input", (e) => onChange(e.target.value));
  row.appendChild(label);
  row.appendChild(input);
  return row;
}

function createSelectRow(labelText, options, value, onChange) {
  const row = document.createElement("div");
  row.className = "optionRow";
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    select.appendChild(opt);
  });
  select.value = value;
  select.addEventListener("change", (e) => onChange(e.target.value));
  row.appendChild(label);
  row.appendChild(select);
  return row;
}

function createToggleRow(labelText, value, onChange) {
  const row = document.createElement("div");
  row.className = "optionRow";
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  input.addEventListener("change", (e) => onChange(e.target.checked));
  row.appendChild(label);
  row.appendChild(input);
  return row;
}

function persistAndRender() {
  saveCanvasState().then(render);
}

function deleteNode(nodeId) {
  const node = getNodeById(nodeId);
  if (!node || node.kind !== "action") return;

  const incoming = getIncomingConnection(nodeId);
  const outgoing = getOutgoingConnection(nodeId);
  removeConnectionsForNode(nodeId);
  canvasState.nodes = canvasState.nodes.filter((item) => item.id !== nodeId);

  if (incoming && outgoing) {
    connectNodes(incoming.from, outgoing.to);
  }

  if (selectedNodeId === nodeId) selectedNodeId = null;
}

async function runFromNode(nodeId) {
  const node = getNodeById(nodeId);
  if (!node) return;
  const nodesById = new Map(canvasState.nodes.map((item) => [item.id, item]));
  const actions = [];
  let current = node;
  const visited = new Set();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.kind === "action" && current.action) actions.push(current.action);
    const connection = getOutgoingConnection(current.id);
    if (!connection) break;
    current = nodesById.get(connection.to);
    if (!current || current.kind === "end") break;
  }

  if (!actions.length) {
    showStatus("⚠️ No actions to run from this node");
    return;
  }

  runState.status = "running";
  runState.currentActionId = null;
  runState.doneActionIds = new Set();
  render();

  await chrome.runtime.sendMessage({
    type: "RUN_FLOW",
    actions,
    settings: (await chrome.storage.local.get("autolineState")).autolineState?.settings ?? {}
  });

  showStatus("▶️ Running from selected node…", 1200);
}

function updateZoom(delta) {
  const nextZoom = Math.min(2.5, Math.max(0.4, (canvasState.settings.zoom ?? 1) + delta));
  canvasState.settings.zoom = Number(nextZoom.toFixed(2));
  persistAndRender();
}

function frameAllNodes() {
  if (!canvasState.nodes.length) return;
  const xs = canvasState.nodes.map((node) => node.position?.x ?? 0);
  const ys = canvasState.nodes.map((node) => node.position?.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 120;
  const targetX = Math.max(minX - padding, 0);
  const targetY = Math.max(minY - padding, 0);
  canvasViewport.scrollTo({ left: targetX, top: targetY, behavior: "smooth" });
}

function updateRunnerAnimation(fromNode, toNode) {
  if (!fromNode || !toNode) return;
  cancelAnimationFrame(animationFrame);
  canvasRunner.innerHTML = "";

  const fromEl = canvasNodes.querySelector(`.nodeCard[data-node-id="${fromNode.id}"]`);
  const toEl = canvasNodes.querySelector(`.nodeCard[data-node-id="${toNode.id}"]`);
  if (!fromEl || !toEl) return;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();
  const viewportRect = canvasInner.getBoundingClientRect();

  const start = {
    x: fromRect.left - viewportRect.left + fromRect.width / 2,
    y: fromRect.top - viewportRect.top + fromRect.height / 2
  };
  const end = {
    x: toRect.left - viewportRect.left + toRect.width / 2,
    y: toRect.top - viewportRect.top + toRect.height / 2
  };

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("r", "6");
  circle.setAttribute("fill", "#3dd598");
  canvasRunner.appendChild(circle);

  const duration = canvasState.settings.runSpeedMs ?? 800;
  const startTime = performance.now();

  function step(timestamp) {
    const progress = Math.min(1, (timestamp - startTime) / duration);
    const x = start.x + (end.x - start.x) * progress;
    const y = start.y + (end.y - start.y) * progress;
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    if (progress < 1) {
      animationFrame = requestAnimationFrame(step);
    }
  }

  animationFrame = requestAnimationFrame(step);
}

canvasAddNodeBtn.addEventListener("click", () => {
  renderAddNodeList();
  openAddNodeModal();
});

closeAddNodeBtn.addEventListener("click", closeAddNodeModal);
addNodeBackdrop.addEventListener("click", (e) => {
  if (e.target === addNodeBackdrop) closeAddNodeModal();
});

canvasSettingsBtn.addEventListener("click", openSettingsModal);
closeSettingsBtn.addEventListener("click", closeSettingsModal);
settingsBackdrop.addEventListener("click", (e) => {
  if (e.target === settingsBackdrop) closeSettingsModal();
});

saveSettingsBtn.addEventListener("click", async () => {
  canvasState.settings.themeMode = themeSelect.value;
  canvasState.settings.runSpeedMs = Number(runSpeedInput.value) || 800;
  await saveCanvasState();
  render();
  closeSettingsModal();
  showStatus("✅ Settings saved");
});

canvasSaveBtn.addEventListener("click", async () => {
  const name = workflowNameInput.value.trim() || "Workflow";
  const res = await chrome.storage.local.get("autolineState");
  const payload = {
    id: uid(),
    name,
    data: {
      actions: getFlowActionsFromCanvas(),
      settings: res.autolineState?.settings ?? {}
    }
  };
  workflows.unshift(payload);
  await chrome.storage.local.set({ autolineWorkflows: workflows });
  showStatus("✅ Workflow saved");
});

canvasOpenBtn.addEventListener("click", async () => {
  await loadWorkflows();
  openWorkflowModal("open");
});

canvasImportBtn.addEventListener("click", async () => {
  await loadWorkflows();
  openWorkflowModal("import");
});

closeWorkflowBtn.addEventListener("click", closeWorkflowModal);
workflowBackdrop.addEventListener("click", (e) => {
  if (e.target === workflowBackdrop) closeWorkflowModal();
});

workflowNameInput.addEventListener("change", async () => {
  canvasState.workflowName = workflowNameInput.value.trim() || "Workflow";
  await saveCanvasState();
  render();
});

canvasZoomInBtn.addEventListener("click", () => updateZoom(0.1));
canvasZoomOutBtn.addEventListener("click", () => updateZoom(-0.1));
canvasFrameBtn.addEventListener("click", frameAllNodes);

sidebarCloseBtn.addEventListener("click", () => {
  selectedNodeId = null;
  renderSidebar();
  render();
});

canvasPlayBtn.addEventListener("click", async () => {
  if (runState.status === "paused") {
    await chrome.runtime.sendMessage({ type: "RESUME_FLOW" });
    runState.status = "running";
    render();
    showStatus("▶️ Resumed");
    return;
  }
  runState.status = "running";
  runState.currentActionId = null;
  runState.doneActionIds = new Set();
  render();

  await chrome.runtime.sendMessage({
    type: "RUN_FLOW",
    actions: getFlowActionsFromCanvas(),
    settings: (await chrome.storage.local.get("autolineState")).autolineState?.settings ?? {}
  });

  showStatus("▶️ Running flow…", 1200);
});

canvasPauseBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "PAUSE_FLOW" });
  runState.status = "paused";
  render();
  showStatus("⏸️ Paused");
});

canvasStopBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP_FLOW" });
  runState.status = "idle";
  runState.currentActionId = null;
  runState.doneActionIds = new Set();
  render();
  showStatus("⏹️ Stopped");
});

canvasViewport.addEventListener("mousemove", (e) => {
  if (!dragState) return;
  const dx = (e.clientX - dragState.startX) / (canvasState.settings.zoom ?? 1);
  const dy = (e.clientY - dragState.startY) / (canvasState.settings.zoom ?? 1);
  const node = getNodeById(dragState.nodeId);
  if (!node) return;
  node.position = { x: dragState.originX + dx, y: dragState.originY + dy };
  renderConnections();
});

canvasViewport.addEventListener("mouseup", async () => {
  if (!dragState) return;
  dragState = null;
  await saveCanvasState();
  render();
});

window.addEventListener("mouseup", async () => {
  if (!dragState) return;
  dragState = null;
  await saveCanvasState();
  render();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "CLICK_RECORDED") {
    const node = getNodeByActionId(msg.actionId);
    if (node?.action) {
      node.action.target = msg.payload?.target ?? null;
      node.action.click = msg.payload?.click ?? null;
      saveCanvasState().then(render);
      showStatus("✅ Click recorded");
    }
  }

  if (msg?.type === "FLOW_START") {
    runState.status = "running";
    runState.currentActionId = null;
    runState.doneActionIds = new Set();
    render();
  }

  if (msg?.type === "FLOW_STEP_START") {
    runState.currentActionId = msg.actionId;
    render();
  }

  if (msg?.type === "FLOW_STEP_END") {
    runState.doneActionIds.add(msg.actionId);
    const fromNode = getNodeByActionId(msg.actionId);
    const outgoing = fromNode ? getOutgoingConnection(fromNode.id) : null;
    const toNode = outgoing ? getNodeById(outgoing.to) : null;
    render();
    if (fromNode && toNode) {
      updateRunnerAnimation(fromNode, toNode);
    }
  }

  if (msg?.type === "FLOW_END") {
    runState.status = "idle";
    runState.currentActionId = null;
    runState.doneActionIds = new Set();
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
    runState.currentActionId = null;
    runState.doneActionIds = new Set();
    render();
    showStatus("⏹️ Flow stopped");
  }
});

async function init() {
  const res = await chrome.storage.local.get(["autolineCanvasState", "autolineState"]);
  if (res.autolineCanvasState && Array.isArray(res.autolineCanvasState.nodes)) {
    canvasState = res.autolineCanvasState;
  } else {
    canvasState = buildCanvasFromActions(res.autolineState?.actions ?? [], res.autolineState?.workflowName ?? "Workflow");
  }
  normalizeCanvasState();
  await loadWorkflows();
  render();
}

init();
