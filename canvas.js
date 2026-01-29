const canvasPlayBtn = document.getElementById("canvasPlayBtn");
const canvasRunFromBtn = document.getElementById("canvasRunFromBtn");
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
let selectedNodeIds = new Set();
let dragState = null;
let panState = null;
let selectionState = null;
let connectionDrag = null;
let snapTarget = null;
let workflowMode = "open";
let runState = {
  status: "idle",
  currentActionId: null,
  doneActionIds: new Set()
};
let animationFrame = null;
let ignoreStorageUpdate = false;
let zoomSaveTimer = null;
let selectionRect = null;
let runnerTimeout = null;
let suppressCanvasClick = false;

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

function syncCanvasStateWithActions(actions = [], workflowName = null) {
  if (!Array.isArray(actions)) return;
  const nodesByActionId = new Map(
    canvasState.nodes.filter((node) => node.kind === "action" && node.action?.id).map((node) => [node.action.id, node])
  );

  actions.forEach((action) => {
    const node = nodesByActionId.get(action.id);
    if (node) {
      node.action = action;
      node.label = action.type;
    }
  });

  const actionIds = new Set(actions.map((action) => action.id));
  canvasState.nodes = canvasState.nodes.filter((node) => {
    if (node.kind !== "action") return true;
    return node.action?.id && actionIds.has(node.action.id);
  });

  const existingActionIds = new Set(
    canvasState.nodes.filter((node) => node.kind === "action" && node.action?.id).map((node) => node.action.id)
  );
  const endNode = getEndNode();
  const anchorX = endNode?.position?.x ?? 520;
  const anchorY = endNode?.position?.y ?? 180;
  actions.forEach((action, index) => {
    if (existingActionIds.has(action.id)) return;
    canvasState.nodes.push({
      id: uid(),
      kind: "action",
      label: action.type,
      action,
      expanded: false,
      position: { x: anchorX + (index + 1) * 220, y: anchorY }
    });
  });

  const startNode = getStartNode();
  const finalEndNode = getEndNode();
  if (startNode && finalEndNode) {
    canvasState.connections = [];
    let prev = startNode;
    actions.forEach((action) => {
      const node = canvasState.nodes.find((item) => item.kind === "action" && item.action?.id === action.id);
      if (!node) return;
      connectNodes(prev.id, node.id);
      prev = node;
    });
    connectNodes(prev.id, finalEndNode.id);
  }

  if (typeof workflowName === "string" && workflowName.trim()) {
    canvasState.workflowName = workflowName.trim();
  }
  normalizeCanvasState();
}

async function loadWorkflows() {
  const res = await chrome.storage.local.get("autolineWorkflows");
  workflows = Array.isArray(res.autolineWorkflows) ? res.autolineWorkflows : [];
}

async function saveCanvasState() {
  ignoreStorageUpdate = true;
  try {
    await chrome.storage.local.set({ autolineCanvasState: canvasState });
    const actions = getFlowActionsFromCanvas();
    const res = await chrome.storage.local.get("autolineState");
    const nextState = res.autolineState ?? { actions: [], settings: {}, workflowName: canvasState.workflowName };
    nextState.actions = actions;
    nextState.workflowName = canvasState.workflowName || nextState.workflowName;
    await chrome.storage.local.set({ autolineState: nextState });
  } finally {
    ignoreStorageUpdate = false;
  }
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

function updateCanvasBounds() {
  const minWidth = 6000;
  const minHeight = 3600;
  const padding = 1200;
  if (!canvasState.nodes.length) {
    canvasInner.style.width = `${minWidth}px`;
    canvasInner.style.height = `${minHeight}px`;
    return;
  }
  const xs = canvasState.nodes.map((node) => node.position?.x ?? 0);
  const ys = canvasState.nodes.map((node) => node.position?.y ?? 0);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = Math.max(minWidth, maxX + padding);
  const height = Math.max(minHeight, maxY + padding);
  canvasInner.style.width = `${width}px`;
  canvasInner.style.height = `${height}px`;
}

function render() {
  workflowNameInput.value = canvasState.workflowName || "Workflow";
  applyTheme(canvasState.settings.themeMode ?? "auto");
  applyZoom(canvasState.settings.zoom ?? 1);

  updateCanvasBounds();
  renderNodes();
  renderConnections();
  renderSidebar();
  updateRunFromButtonState();
}

function renderNodes() {
  canvasNodes.innerHTML = "";

  canvasState.nodes.forEach((node) => {
    const nodeEl = document.createElement("div");
    nodeEl.className = "nodeCard";
    nodeEl.dataset.nodeId = node.id;
    nodeEl.style.left = `${node.position?.x ?? 0}px`;
    nodeEl.style.top = `${node.position?.y ?? 0}px`;
    if (node.expanded) nodeEl.classList.add("expanded");
    if (selectedNodeIds.has(node.id)) nodeEl.classList.add("selected");
    if (node.action?.id && runState.currentActionId === node.action.id) nodeEl.classList.add("running");

    const header = document.createElement("div");
    header.className = "nodeHeader";

    const titleWrap = document.createElement("div");
    titleWrap.className = "nodeHeaderMain";
    const title = document.createElement("div");
    title.className = "nodeTitle";
    title.textContent = node.kind === "action" ? getActionTitle(node.action) : node.label;
    const sub = document.createElement("div");
    sub.className = "nodeSub";
    if (node.kind === "action") {
      sub.textContent = getActionSummary(node.action);
    } else {
      sub.textContent = node.kind === "start" ? "Start of the flow" : "End of the flow";
    }
    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "nodeActions";

    const expandBtn = document.createElement("button");
    expandBtn.className = "nodeActionBtn";
    expandBtn.innerHTML = `<span class="material-icons" aria-hidden="true">${node.expanded ? "expand_less" : "chevron_right"}</span>`;
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      node.expanded = !node.expanded;
      render();
    });

    actions.appendChild(expandBtn);

    if (node.kind === "action") {
      const duplicateBtn = document.createElement("button");
      duplicateBtn.className = "nodeActionBtn";
      duplicateBtn.innerHTML = '<span class="material-icons" aria-hidden="true">content_copy</span>';
      duplicateBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await duplicateNode(node.id);
        render();
        showStatus("📄 Node duplicated");
      });
      actions.appendChild(duplicateBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "nodeActionBtn";
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
    header.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      node.expanded = !node.expanded;
      render();
    });

    const body = document.createElement("div");
    body.className = "nodeBody";
    if (node.kind === "action") {
      renderNodeOptionsContent(body, node, true);
    } else {
      body.innerHTML = `<div class="nodeTag">${node.kind === "start" ? "Starting point" : "Ending point"}</div>`;
    }

    nodeEl.appendChild(header);
    nodeEl.appendChild(body);

    const inConnector = document.createElement("div");
    inConnector.className = "nodeConnector in";
    inConnector.dataset.connector = "in";
    inConnector.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      startConnectionDrag(node.id, "in", e);
    });

    const outConnector = document.createElement("div");
    outConnector.className = "nodeConnector out";
    outConnector.dataset.connector = "out";
    outConnector.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      startConnectionDrag(node.id, "out", e);
    });

    nodeEl.appendChild(inConnector);
    nodeEl.appendChild(outConnector);

    nodeEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("input, textarea, select, button")) return;
      dragState = {
        nodeId: node.id,
        nodeEl,
        startX: e.clientX,
        startY: e.clientY,
        originX: node.position?.x ?? 0,
        originY: node.position?.y ?? 0
      };
      nodeEl.style.cursor = "grabbing";
      document.body.style.cursor = "grabbing";
      e.stopPropagation();
    });

    nodeEl.addEventListener("click", (e) => {
      if (e.shiftKey) {
        if (selectedNodeIds.has(node.id)) {
          selectedNodeIds.delete(node.id);
        } else {
          selectedNodeIds.add(node.id);
        }
        setSelectedNodes(selectedNodeIds);
      } else {
        setSelectedNodes([node.id]);
      }
      renderSidebar();
      renderNodes();
    });

    canvasNodes.appendChild(nodeEl);
  });
}

function renderConnections() {
  canvasLines.innerHTML = "";
  canvasRunner.innerHTML = "";

  canvasState.connections.forEach((connection) => {
    const fromNode = getNodeById(connection.from);
    const toNode = getNodeById(connection.to);
    if (!fromNode || !toNode) return;
    const start = getConnectorPosition(connection.from, "out");
    const end = getConnectorPosition(connection.to, "in");
    if (!start || !end) return;
    canvasLines.appendChild(createConnectionPath(start, end, "connection-path"));
  });

  if (connectionDrag) {
    const start = connectionDrag.start;
    const end = connectionDrag.snapPoint || connectionDrag.current;
    if (start && end) {
      canvasLines.appendChild(createConnectionPath(start, end, "connection-path preview"));
    }
  }
}

function renderSidebar() {
  if (selectedNodeIds.size > 1) {
    sidebarSubtitle.textContent = `${selectedNodeIds.size} nodes selected`;
    nodeOptions.innerHTML = "<div class=\"nodeTag\">Multiple nodes selected. Choose a single node to edit options.</div>";
    return;
  }
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

function getActionTitle(action) {
  if (!action) return "Action";
  const map = {
    switchTab: "Switch Tab",
    delay: "Delay",
    openUrl: "Open URL",
    click: "Click",
    reloadTab: "Reload Tab",
    simpleLoop: "Simple Loop",
    textBlocks: "Text Blocks",
    clipboard: "Clipboard",
    keyboard: "Keyboard",
    sheetsCheckValue: "Sheets Check Value",
    sheetsCopy: "Sheets Copy",
    sheetsPaste: "Sheets Paste",
    higgsfieldAi: "Higgsfield AI"
  };
  return map[action.type] || action.type || "Action";
}

function getActionSummary(action) {
  if (!action) return "Action";
  if (action.type === "switchTab") {
    return action.tab ? `• ${truncate(action.tab.title || action.tab.url || "Tab")}` : "• not set";
  }
  if (action.type === "delay") {
    return `• ${Number(action.delaySec ?? 1)} sec`;
  }
  if (action.type === "openUrl") {
    return action.url ? `• ${truncate(action.url, 32)}` : "• not set";
  }
  if (action.type === "click") {
    return action.target ? `• ${truncate(action.target.label || "target", 32)}` : "• not set";
  }
  if (action.type === "reloadTab") {
    return "• active tab";
  }
  if (action.type === "simpleLoop") {
    const loops = Number.isFinite(action.loopCount) ? Math.max(1, Math.round(action.loopCount)) : 1;
    return `${action.enabled ? "• enabled" : "• disabled"} • loops: ${loops}`;
  }
  if (action.type === "textBlocks") {
    const total = Array.isArray(action.blocks) ? action.blocks.length : 0;
    const used = Array.isArray(action.blocks) ? action.blocks.filter((block) => block.enabled === false).length : 0;
    return total > 0 ? `• ${used}/${total} used` : "• no blocks";
  }
  if (action.type === "clipboard") {
    return action.mode === "paste" ? "• paste clipboard" : "• copy selection";
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
    return `• ${label || "key"} ×${Number(action.pressCount ?? 1)}`;
  }
  if (action.type === "sheetsCheckValue") {
    const cellLabel = action.cellRef ? ` ${action.cellRef}` : " selection";
    const expectedLabel = action.expectedValue ? ` = "${truncate(action.expectedValue, 18)}"` : "";
    return `•${cellLabel}${expectedLabel}`;
  }
  if (action.type === "sheetsCopy") {
    return "• copy active cell";
  }
  if (action.type === "sheetsPaste") {
    return "• paste runtime clipboard";
  }
  if (action.type === "higgsfieldAi") {
    const threshold = Number.isFinite(action.threshold) ? action.threshold : DEFAULT_HIGGSFIELD_CONFIG.threshold;
    const phraseCount = Array.isArray(action.activePhrases) ? action.activePhrases.length : 0;
    return `• max ${threshold} • ${phraseCount} active phrase${phraseCount === 1 ? "" : "s"}`;
  }
  return "Action";
}

function truncate(text, max = 24) {
  const value = String(text ?? "");
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function updateRunFromButtonState() {
  if (!canvasRunFromBtn) return;
  const node = selectedNodeId ? getNodeById(selectedNodeId) : null;
  const canRun = node && node.kind !== "end";
  canvasRunFromBtn.disabled = !canRun;
}

function setSelectedNodes(ids) {
  selectedNodeIds = new Set(ids);
  if (selectedNodeIds.size === 1) {
    selectedNodeId = Array.from(selectedNodeIds)[0];
  } else {
    selectedNodeId = null;
  }
  updateRunFromButtonState();
}

function clearSelection() {
  setSelectedNodes([]);
}

function updateNodeSummary(node) {
  if (!node) return;
  const nodeEl = canvasNodes.querySelector(`.nodeCard[data-node-id="${node.id}"]`);
  if (!nodeEl) return;
  const titleEl = nodeEl.querySelector(".nodeTitle");
  const subEl = nodeEl.querySelector(".nodeSub");
  if (titleEl) {
    titleEl.textContent = node.kind === "action" ? getActionTitle(node.action) : node.label;
  }
  if (subEl) {
    subEl.textContent =
      node.kind === "action" ? getActionSummary(node.action) : node.kind === "start" ? "Start of the flow" : "End of the flow";
  }
}

function persistNodeEdit(node, compact, { render: forceRender } = {}) {
  saveCanvasState();
  const shouldRender = forceRender === true;
  if (shouldRender) {
    render();
    return;
  }
  updateNodeSummary(node);
  if (compact && selectedNodeId === node.id) {
    renderSidebar();
  }
}

async function duplicateNode(nodeId) {
  const node = getNodeById(nodeId);
  if (!node || node.kind !== "action") return;
  const clonedAction = JSON.parse(JSON.stringify(node.action));
  clonedAction.id = uid();
  clonedAction.jsonOpen = false;
  const newNode = {
    id: uid(),
    kind: "action",
    label: clonedAction.type,
    action: clonedAction,
    position: { x: (node.position?.x ?? 0) + 220, y: node.position?.y ?? 0 },
    expanded: node.expanded
  };
  canvasState.nodes.push(newNode);
  await saveCanvasState();
}

function renderNodeOptionsContent(container, node, compact) {
  if (!node.action) return;
  const action = node.action;
  const commit = (forceRender = false) => persistNodeEdit(node, compact, { render: forceRender });

  const title = document.createElement("div");
  title.className = "nodeTag";
  title.textContent = `Type: ${action.type}`;
  container.appendChild(title);

  if (action.type === "delay") {
    const row = createOptionRow("Delay (sec)", "number", action.delaySec ?? 1, (val) => {
      action.delaySec = Number(val) || 1;
      commit();
    });
    container.appendChild(row);
  }

  if (action.type === "openUrl") {
    const row = createOptionRow("URL", "text", action.url ?? "", (val) => {
      action.url = val;
      commit();
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
        info.textContent = action.tab?.title ? action.tab.title : "No tab selected";
        commit();
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
      commit();
    });
    const countRow = createOptionRow("Loop count", "number", action.loopCount ?? 1, (val) => {
      action.loopCount = Number(val) || 1;
      commit();
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
        commit();
      });
      const toggle = createToggleRow("Enabled", block.enabled !== false, (val) => {
        block.enabled = val;
        commit();
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
      commit(true);
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
      commit();
    }
  );
    container.appendChild(row);
  }

  if (action.type === "keyboard") {
    const keyRow = createSelectRow(
      "Key command",
      [
        { value: "ctrlA", label: "Ctrl + A (Select all)" },
        { value: "ctrlC", label: "Ctrl + C (Copy)" },
        { value: "ctrlV", label: "Ctrl + V (Paste)" },
        { value: "delete", label: "Delete" },
        { value: "backspace", label: "Backspace" },
        { value: "arrowUp", label: "Arrow Up" },
        { value: "arrowDown", label: "Arrow Down" },
        { value: "arrowLeft", label: "Arrow Left" },
        { value: "arrowRight", label: "Arrow Right" },
        { value: "enter", label: "Enter" },
        { value: "escape", label: "Esc" }
      ],
      action.key ?? "ctrlA",
      (val) => {
      action.key = val;
      commit();
    }
  );
    const pressRow = createOptionRow("Press count", "number", action.pressCount ?? 1, (val) => {
      action.pressCount = Number(val) || 1;
      commit();
    });
    const delayRow = createOptionRow("Delay (sec)", "number", action.delaySec ?? 1, (val) => {
      action.delaySec = Number(val) || 1;
      commit();
    });
    container.appendChild(keyRow);
    container.appendChild(pressRow);
    container.appendChild(delayRow);
  }

  if (action.type === "sheetsCheckValue") {
    const expectedRow = createOptionRow("Expected value", "text", action.expectedValue ?? "", (val) => {
      action.expectedValue = val;
      commit();
    });
    const cellRow = createOptionRow("Cell ref", "text", action.cellRef ?? "", (val) => {
      action.cellRef = val;
      commit();
    });
    container.appendChild(expectedRow);
    container.appendChild(cellRow);
  }

  if (action.type === "higgsfieldAi") {
    const thresholdRow = createOptionRow("Threshold", "number", action.threshold ?? 4, (val) => {
      action.threshold = Number(val) || 4;
      commit();
    });
    const highlightRow = createToggleRow("Highlight", action.highlight !== false, (val) => {
      action.highlight = val;
      commit();
    });
    const pollRow = createOptionRow("Poll interval (sec)", "number", action.pollIntervalSec ?? 1.5, (val) => {
      action.pollIntervalSec = Number(val) || 1.5;
      commit();
    });
    const timeoutRow = createOptionRow("Timeout (sec)", "number", action.timeoutSec ?? 600, (val) => {
      action.timeoutSec = Number(val) || 600;
      commit();
    });
    const maxRow = createOptionRow("Max highlights", "number", action.maxHighlights ?? 80, (val) => {
      action.maxHighlights = Number(val) || 80;
      commit();
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

  if (selectedNodeIds.has(nodeId)) {
    selectedNodeIds.delete(nodeId);
    setSelectedNodes(selectedNodeIds);
  }
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

  await chrome.runtime.sendMessage({ type: "FOCUS_SIDEPANEL" });
  await chrome.runtime.sendMessage({
    type: "RUN_FLOW",
    actions,
    settings: (await chrome.storage.local.get("autolineState")).autolineState?.settings ?? {}
  });

  showStatus("▶️ Running from selected node…", 1200);
}

function updateZoom(delta, anchor = null) {
  const nextZoom = (canvasState.settings.zoom ?? 1) + delta;
  setZoom(nextZoom, anchor, true);
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

  const start = getConnectorPosition(fromNode.id, "out");
  const end = getConnectorPosition(toNode.id, "in");
  if (!start || !end) return;

  const { d } = getConnectionPathDefinition(start, end);
  const motionPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  motionPath.setAttribute("d", d);
  motionPath.setAttribute("fill", "none");
  motionPath.setAttribute("stroke", "none");
  canvasRunner.appendChild(motionPath);

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("r", "6");
  circle.setAttribute("fill", "var(--accent)");
  canvasRunner.appendChild(circle);

  const duration = canvasState.settings.runSpeedMs ?? 800;
  const startTime = performance.now();
  const length = motionPath.getTotalLength();

  function step(timestamp) {
    const progress = Math.min(1, (timestamp - startTime) / duration);
    const point = motionPath.getPointAtLength(length * progress);
    const x = point.x;
    const y = point.y;
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    if (progress < 1) {
      animationFrame = requestAnimationFrame(step);
    }
  }

  animationFrame = requestAnimationFrame(step);
}

async function getGlobalDelayMs() {
  const res = await chrome.storage.local.get("autolineState");
  const settings = res.autolineState?.settings ?? {};
  return Math.max(0, Number(settings.globalDelaySec ?? 1)) * 1000;
}

function scheduleRunnerAnimation(fromNode, toNode, delayMs = 0) {
  if (runnerTimeout) {
    window.clearTimeout(runnerTimeout);
    runnerTimeout = null;
  }
  if (!fromNode || !toNode) return;
  if (delayMs > 0) {
    runnerTimeout = window.setTimeout(() => {
      updateRunnerAnimation(fromNode, toNode);
      runnerTimeout = null;
    }, delayMs);
  } else {
    updateRunnerAnimation(fromNode, toNode);
  }
}

function applyZoom(zoom) {
  canvasInner.style.transform = `scale(${zoom})`;
}

function scheduleZoomSave() {
  if (zoomSaveTimer) window.clearTimeout(zoomSaveTimer);
  zoomSaveTimer = window.setTimeout(() => {
    saveCanvasState();
    zoomSaveTimer = null;
  }, 250);
}

function setZoom(nextZoom, anchor = null, persist = false) {
  const currentZoom = canvasState.settings.zoom ?? 1;
  const clamped = Math.min(2.5, Math.max(0.4, nextZoom));
  if (Math.abs(clamped - currentZoom) < 0.001) return;
  canvasState.settings.zoom = Number(clamped.toFixed(3));
  if (anchor) {
    const rect = canvasViewport.getBoundingClientRect();
    const offsetX = (anchor.x - rect.left + canvasViewport.scrollLeft) / currentZoom;
    const offsetY = (anchor.y - rect.top + canvasViewport.scrollTop) / currentZoom;
    applyZoom(canvasState.settings.zoom);
    canvasViewport.scrollLeft = offsetX * canvasState.settings.zoom - (anchor.x - rect.left);
    canvasViewport.scrollTop = offsetY * canvasState.settings.zoom - (anchor.y - rect.top);
  } else {
    applyZoom(canvasState.settings.zoom);
  }
  if (persist) scheduleZoomSave();
}

function getCanvasPoint(clientX, clientY) {
  const viewportRect = canvasInner.getBoundingClientRect();
  const zoom = canvasState.settings.zoom ?? 1;
  return {
    x: (clientX - viewportRect.left) / zoom,
    y: (clientY - viewportRect.top) / zoom
  };
}

function updateSelectionRect() {
  if (!selectionState || !selectionRect) return;
  const { start, current } = selectionState;
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(start.x - current.x);
  const height = Math.abs(start.y - current.y);
  selectionRect.style.left = `${left}px`;
  selectionRect.style.top = `${top}px`;
  selectionRect.style.width = `${width}px`;
  selectionRect.style.height = `${height}px`;
  selectionRect.style.display = "block";
}

function clearSelectionRect() {
  if (!selectionRect) return;
  selectionRect.style.display = "none";
  selectionRect.style.width = "0";
  selectionRect.style.height = "0";
}

function finalizeSelection() {
  if (!selectionState) return;
  const { start, current } = selectionState;
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const right = Math.max(start.x, current.x);
  const bottom = Math.max(start.y, current.y);
  const viewportRect = canvasInner.getBoundingClientRect();
  const zoom = canvasState.settings.zoom ?? 1;
  const picked = [];
  canvasNodes.querySelectorAll(".nodeCard").forEach((nodeEl) => {
    const rect = nodeEl.getBoundingClientRect();
    const nodeLeft = (rect.left - viewportRect.left) / zoom;
    const nodeRight = (rect.right - viewportRect.left) / zoom;
    const nodeTop = (rect.top - viewportRect.top) / zoom;
    const nodeBottom = (rect.bottom - viewportRect.top) / zoom;
    const intersects =
      nodeRight >= left && nodeLeft <= right && nodeBottom >= top && nodeTop <= bottom;
    if (intersects) {
      const nodeId = nodeEl.dataset.nodeId;
      if (nodeId) picked.push(nodeId);
    }
  });
  setSelectedNodes(picked);
  renderNodes();
  renderSidebar();
  selectionState = null;
  clearSelectionRect();
}

function getConnectorPosition(nodeId, side) {
  const nodeEl = canvasNodes.querySelector(`.nodeCard[data-node-id="${nodeId}"]`);
  if (!nodeEl) return null;
  const connector = nodeEl.querySelector(`.nodeConnector.${side}`);
  if (!connector) return null;
  const rect = connector.getBoundingClientRect();
  const viewportRect = canvasInner.getBoundingClientRect();
  const zoom = canvasState.settings.zoom ?? 1;
  return {
    x: (rect.left - viewportRect.left + rect.width / 2) / zoom,
    y: (rect.top - viewportRect.top + rect.height / 2) / zoom
  };
}

function detachConnection(nodeId, side) {
  if (side === "out") {
    const outgoing = getOutgoingConnection(nodeId);
    if (!outgoing) return null;
    canvasState.connections = canvasState.connections.filter((connection) => connection.from !== nodeId);
    return outgoing;
  }
  const incoming = getIncomingConnection(nodeId);
  if (!incoming) return null;
  canvasState.connections = canvasState.connections.filter((connection) => connection.to !== nodeId);
  return incoming;
}

function createConnectionPath(start, end, className) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const { d } = getConnectionPathDefinition(start, end);
  path.setAttribute("d", d);
  path.setAttribute("class", className);
  return path;
}

function getConnectionPathDefinition(start, end) {
  const midX = (start.x + end.x) / 2;
  const d = `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
  return { d };
}

function startConnectionDrag(nodeId, side, event) {
  const start = getConnectorPosition(nodeId, side);
  if (!start) return;
  const detached = detachConnection(nodeId, side);
  connectionDrag = {
    nodeId,
    side,
    start,
    detached,
    current: getCanvasPoint(event.clientX, event.clientY),
    snapPoint: null
  };
  updateSnapTarget(null);
  renderConnections();
}

function updateSnapTarget(nextTarget) {
  if (snapTarget?.el) {
    snapTarget.el.classList.remove("snap");
  }
  snapTarget = nextTarget;
  if (snapTarget?.el) {
    snapTarget.el.classList.add("snap");
  }
}

function findClosestConnector(point, excludeNodeId) {
  const connectors = Array.from(canvasNodes.querySelectorAll(".nodeConnector"));
  let best = null;
  connectors.forEach((connector) => {
    const nodeEl = connector.closest(".nodeCard");
    if (!nodeEl) return;
    const nodeId = nodeEl.dataset.nodeId;
    if (!nodeId || nodeId === excludeNodeId) return;
    const rect = connector.getBoundingClientRect();
    const viewportRect = canvasInner.getBoundingClientRect();
    const zoom = canvasState.settings.zoom ?? 1;
    const cx = (rect.left - viewportRect.left + rect.width / 2) / zoom;
    const cy = (rect.top - viewportRect.top + rect.height / 2) / zoom;
    const dist = Math.hypot(point.x - cx, point.y - cy);
    if (!best || dist < best.distance) {
      best = {
        distance: dist,
        nodeId,
        side: connector.classList.contains("in") ? "in" : "out",
        point: { x: cx, y: cy },
        el: connector
      };
    }
  });
  return best;
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
  clearSelection();
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

  await chrome.runtime.sendMessage({ type: "FOCUS_SIDEPANEL" });
  await chrome.runtime.sendMessage({
    type: "RUN_FLOW",
    actions: getFlowActionsFromCanvas(),
    settings: (await chrome.storage.local.get("autolineState")).autolineState?.settings ?? {}
  });

  showStatus("▶️ Running flow…", 1200);
});

canvasRunFromBtn.addEventListener("click", async () => {
  if (!selectedNodeId) {
    showStatus("⚠️ Select a node to run from");
    return;
  }
  await runFromNode(selectedNodeId);
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

canvasViewport.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (e.target.closest(".nodeCard, .nodeConnector, button, input, textarea, select")) return;
  if (e.shiftKey) {
    const point = getCanvasPoint(e.clientX, e.clientY);
    selectionState = { start: point, current: point };
    updateSelectionRect();
  } else {
    panState = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: canvasViewport.scrollLeft,
      scrollTop: canvasViewport.scrollTop
    };
    canvasViewport.classList.add("panning");
    document.body.style.cursor = "grabbing";
  }
  e.preventDefault();
});

canvasViewport.addEventListener("click", (e) => {
  if (suppressCanvasClick) return;
  if (e.target.closest(".nodeCard, .nodeConnector, button, input, textarea, select")) return;
  if (selectedNodeIds.size) {
    clearSelection();
    render();
  }
});

canvasViewport.addEventListener(
  "wheel",
  (e) => {
    if (!e.deltaY) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoom((canvasState.settings.zoom ?? 1) + delta, { x: e.clientX, y: e.clientY }, true);
  },
  { passive: false }
);

window.addEventListener("mousemove", (e) => {
  if (dragState) {
    const dx = (e.clientX - dragState.startX) / (canvasState.settings.zoom ?? 1);
    const dy = (e.clientY - dragState.startY) / (canvasState.settings.zoom ?? 1);
    const node = getNodeById(dragState.nodeId);
    if (node) {
      node.position = { x: dragState.originX + dx, y: dragState.originY + dy };
      if (dragState.nodeEl) {
        dragState.nodeEl.style.left = `${node.position.x}px`;
        dragState.nodeEl.style.top = `${node.position.y}px`;
      }
      renderConnections();
    }
  }
  if (panState) {
    const dx = e.clientX - panState.startX;
    const dy = e.clientY - panState.startY;
    canvasViewport.scrollLeft = panState.scrollLeft - dx;
    canvasViewport.scrollTop = panState.scrollTop - dy;
  }
  if (selectionState) {
    selectionState.current = getCanvasPoint(e.clientX, e.clientY);
    updateSelectionRect();
    return;
  }
  if (!connectionDrag) return;
  const point = getCanvasPoint(e.clientX, e.clientY);
  connectionDrag.current = point;
  const closest = findClosestConnector(point, connectionDrag.nodeId);
  const snapThreshold = 28;
  if (closest && closest.distance <= snapThreshold) {
    connectionDrag.snapPoint = closest.point;
    updateSnapTarget(closest);
  } else {
    connectionDrag.snapPoint = null;
    updateSnapTarget(null);
  }
  renderConnections();
});

window.addEventListener("mouseup", async () => {
  if (dragState) {
    dragState = null;
    document.body.style.cursor = "";
    await saveCanvasState();
    render();
    return;
  }
  if (panState) {
    panState = null;
    canvasViewport.classList.remove("panning");
    document.body.style.cursor = "";
    suppressCanvasClick = true;
    window.setTimeout(() => {
      suppressCanvasClick = false;
    }, 0);
  }
  if (selectionState) {
    finalizeSelection();
    suppressCanvasClick = true;
    window.setTimeout(() => {
      suppressCanvasClick = false;
    }, 0);
    return;
  }
  if (!connectionDrag) return;
  const target = snapTarget;
  const startNode = getNodeById(connectionDrag.nodeId);
  const targetNode = target ? getNodeById(target.nodeId) : null;
  const startSide = connectionDrag.side;
  const detached = connectionDrag.detached;
  connectionDrag = null;
  updateSnapTarget(null);
  if (!startNode || !targetNode || startNode.id === targetNode.id) {
    if (detached) await saveCanvasState();
    render();
    return;
  }

  let fromNode = null;
  let toNode = null;
  if (startSide === "out") {
    fromNode = startNode;
    toNode = targetNode;
  } else {
    fromNode = targetNode;
    toNode = startNode;
  }
  if (fromNode.kind === "end" || toNode.kind === "start") {
    if (detached) await saveCanvasState();
    render();
    return;
  }
  connectNodes(fromNode.id, toNode.id);
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
    const startNode = getStartNode();
    const firstConnection = startNode ? getOutgoingConnection(startNode.id) : null;
    const firstNode = firstConnection ? getNodeById(firstConnection.to) : null;
    if (startNode && firstNode) {
      getGlobalDelayMs().then((delayMs) => {
        scheduleRunnerAnimation(startNode, firstNode, delayMs);
      });
    }
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
    runState.currentActionId = null;
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
    const endNode = getEndNode();
    const flowActions = getFlowActionsFromCanvas();
    const lastAction = flowActions.length ? flowActions[flowActions.length - 1] : null;
    const lastNode = lastAction ? getNodeByActionId(lastAction.id) : getStartNode();
    if (lastNode && endNode) {
      getGlobalDelayMs().then((delayMs) => {
        scheduleRunnerAnimation(lastNode, endNode, delayMs);
      });
    }
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
  if (!selectionRect) {
    selectionRect = document.createElement("div");
    selectionRect.className = "selectionRect";
    selectionRect.style.display = "none";
    canvasInner.appendChild(selectionRect);
  }
  await loadWorkflows();
  render();
}

init();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || ignoreStorageUpdate) return;
  if (changes.autolineCanvasState?.newValue) {
    canvasState = changes.autolineCanvasState.newValue;
    normalizeCanvasState();
    render();
    return;
  }
  if (changes.autolineState?.newValue) {
    const nextState = changes.autolineState.newValue;
    syncCanvasStateWithActions(nextState.actions ?? [], nextState.workflowName ?? canvasState.workflowName);
    render();
  }
});
