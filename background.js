// background.js (MV3 service worker)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunkDelay = 150;
const urlSchemeRegex = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const attachedDebugTabs = new Set();
const debugLocks = new Map();
let clipboardCache = "";

// Open side panel on icon click
chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (e) {}
});

// Pick Tab state
let activePick = null; // { actionId, windowId }
let runController = {
  running: false,
  paused: false,
  stopRequested: false,
  runId: 0
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "ARM_PICK_TAB") {
      activePick = { actionId: msg.actionId, windowId: msg.windowId };
      await chrome.storage.local.set({ activePick });
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "CANCEL_PICK_TAB") {
      activePick = null;
      await chrome.storage.local.remove("activePick");
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "RUN_FLOW") {
      if (runController.running) {
        runController.stopRequested = true;
      }
      // msg: { actions: [], settings: { globalDelaySec } }
      const runId = ++runController.runId;
      runController = {
        running: true,
        paused: false,
        stopRequested: false,
        runId
      };
      runFlow(msg.actions || [], msg.settings || {}, runId).catch((e) => {
        chrome.runtime.sendMessage({ type: "FLOW_ERROR", error: String(e?.message || e) });
        getActiveTab().then((tab) => {
          if (tab) sendMessageToTab(tab.id, { type: "POINTER_HIDE" });
        });
      });
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "PAUSE_FLOW") {
      runController.paused = true;
      chrome.runtime.sendMessage({ type: "FLOW_PAUSE" });
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "RESUME_FLOW") {
      runController.paused = false;
      chrome.runtime.sendMessage({ type: "FLOW_RESUME" });
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "STOP_FLOW") {
      runController.stopRequested = true;
      runController.paused = false;
      runController.running = false;
      chrome.runtime.sendMessage({ type: "FLOW_STOP" });
      const active = await getActiveTab();
      if (active) await sendMessageToTab(active.id, { type: "POINTER_HIDE" });
      if (active?.id) {
        await releaseDebuggerLock(active.id, "flow");
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "CLICK_RECORDED") {
      if (sender?.tab?.id) {
        await releaseDebuggerLock(sender.tab.id, "record");
      }
      chrome.runtime.sendMessage(msg);
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "DEBUG_ATTACH") {
      const tabId = msg.tabId ?? sender?.tab?.id;
      if (typeof tabId !== "number") {
        sendResponse({ ok: false, error: "Missing tabId." });
        return;
      }
      await ensureDebuggerLock(tabId, msg.reason || "manual");
      if (Number.isFinite(msg.autoDetachMs) && msg.autoDetachMs > 0) {
        const reason = msg.reason || "manual";
        setTimeout(() => {
          releaseDebuggerLock(tabId, reason);
        }, msg.autoDetachMs);
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "DEBUG_DETACH") {
      const tabId = msg.tabId ?? sender?.tab?.id;
      if (typeof tabId !== "number") {
        sendResponse({ ok: false, error: "Missing tabId." });
        return;
      }
      await releaseDebuggerLock(tabId, msg.reason || "manual");
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false });
  })();

  return true;
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const stored = await chrome.storage.local.get("activePick");
  const pick = stored.activePick || activePick;
  if (!pick) return;

  if (pick.windowId && pick.windowId !== activeInfo.windowId) return;

  const tab = await chrome.tabs.get(activeInfo.tabId);

  const payload = {
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title || "",
    url: tab.url || ""
  };

  activePick = null;
  await chrome.storage.local.remove("activePick");

  chrome.runtime.sendMessage({
    type: "TAB_PICKED",
    actionId: pick.actionId,
    payload
  });
});

async function runFlow(actions, settings, runId) {
  // Normalize
  const globalDelayMs = Math.max(0, Number(settings.globalDelaySec ?? 1)) * 1000;
  const loopEnabled = actions.some((action) => action.type === "simpleLoop" && action.enabled !== false);
  let pointerVisible = false;
  let flowTabId = null;

  try {
    let shouldLoop = true;
    while (shouldLoop) {
      if (!isActiveRun(runId)) return;
      chrome.runtime.sendMessage({ type: "FLOW_START" });
      const activeTab = await getActiveTab();
      if (activeTab?.id) {
        flowTabId = activeTab.id;
        await ensureDebuggerLock(flowTabId, "flow");
      }

      for (let i = 0; i < actions.length; i++) {
        const step = actions[i];
        if (!isActiveRun(runId)) return;
        await waitIfPaused(runId);
        if (!isActiveRun(runId)) return;

        chrome.runtime.sendMessage({ type: "FLOW_STEP_START", actionId: step.id, index: i });

        if (step.type === "switchTab") {
          const tabId = step.tab?.tabId;
          if (typeof tabId !== "number") throw new Error("Switch Tab node missing tabId.");

          // Activate tab
          await chrome.tabs.update(tabId, { active: true });

          // Give the browser a moment to actually switch visually
          await sleep(150);
          if (flowTabId && flowTabId !== tabId) {
            await releaseDebuggerLock(flowTabId, "flow");
          }
          flowTabId = tabId;
          await ensureDebuggerLock(flowTabId, "flow");
        }

      if (step.type === "delay") {
        const ms = Math.max(0, Number(step.delaySec ?? 1)) * 1000;
        await sleepWithPause(ms, runId);
      }

      if (step.type === "openUrl") {
        const url = normalizeUrl(step.url);
        if (!url) throw new Error("Open URL node missing a URL.");
        const tab = await getActiveTab();
        if (!tab) throw new Error("No active tab to navigate.");
        await chrome.tabs.update(tab.id, { url });
      }

      if (step.type === "click") {
        const tab = await getActiveTab();
        if (!tab) throw new Error("No active tab to click.");
        const resolved = await resolveClickTarget(tab.id, step);
        if (!resolved?.ok) throw new Error("Click target not found on the page.");
        const ensured = await ensureClickVisible(tab.id, step);
        const clickX = ensured?.click?.x ?? resolved.click.x;
        const clickY = ensured?.click?.y ?? resolved.click.y;
        const viewport = ensured?.viewport ?? resolved.viewport;
        const clickCount = Math.min(3, Math.max(1, Number(step?.clickCount) || 1));

        if (!pointerVisible) {
          const centerX = (viewport?.width ?? 0) / 2 || clickX;
          const centerY = (viewport?.height ?? 0) / 2 || clickY;
          await sendMessageToTab(tab.id, {
            type: "POINTER_SHOW",
            x: centerX,
            y: centerY,
            settings,
            fadeIn: true
          });
          pointerVisible = true;
          if (globalDelayMs > 0) {
            await sendMessageToTab(tab.id, {
              type: "POINTER_MOVE",
              x: clickX,
              y: clickY,
              duration: globalDelayMs,
              settings
            });
            await sleepWithPause(globalDelayMs, runId);
          } else {
            await sendMessageToTab(tab.id, {
              type: "POINTER_SNAP",
              x: clickX,
              y: clickY,
              settings
            });
          }
        } else {
          await sendMessageToTab(tab.id, {
            type: "POINTER_SNAP",
            x: clickX,
            y: clickY,
            settings
          });
        }

        if (step.showClickDot !== false) {
          await sendMessageToTab(tab.id, {
            type: "SHOW_CLICK_DOT",
            x: clickX,
            y: clickY,
            showDot: true
          });
        }
        await realClick(tab.id, clickX, clickY, clickCount);

        const hasMoreClicks = actions.slice(i + 1).some((action) => action.type === "click");
        if (!hasMoreClicks) {
          await sendMessageToTab(tab.id, { type: "POINTER_HIDE" });
          pointerVisible = false;
        }
      }

      if (step.type === "reloadTab") {
        const tab = await getActiveTab();
        if (!tab) throw new Error("No active tab to reload.");
        await chrome.tabs.reload(tab.id);
      }

      if (step.type === "simpleLoop") {
        await sleepWithPause(0, runId);
      }

      if (step.type === "clipboard") {
        const tab = await getActiveTab();
        if (!tab) throw new Error("No active tab for clipboard action.");
        const mode = step.mode === "paste" ? "paste" : "copy";
        if (mode === "copy") {
          const result = await sendMessageToTab(tab.id, { type: "CLIPBOARD_COPY_SELECTION" });
          if (!result?.ok) {
            throw new Error(result?.error || "Clipboard copy failed.");
          }
          clipboardCache = typeof result.text === "string" ? result.text : "";
        } else {
          const result = await sendMessageToTab(tab.id, {
            type: "CLIPBOARD_PASTE",
            fallbackText: clipboardCache
          });
          if (!result?.ok) {
            throw new Error(result?.error || "Clipboard paste failed.");
          }
        }
      }

      if (step.type === "keyboard") {
        const tab = await getActiveTab();
        if (!tab) throw new Error("No active tab for keyboard action.");
        await ensureDebuggerLock(tab.id, "flow");
        const keySpec = getKeySpec(step.key);
        if (!keySpec) throw new Error("Keyboard node missing a key selection.");
        const pressCount = Math.max(1, Math.round(Number(step.pressCount) || 1));
        const delayMs = Math.max(0, Number(step.delaySec ?? 1)) * 1000;
        for (let press = 0; press < pressCount; press += 1) {
          await dispatchKey(tab.id, keySpec, "keyDown");
          await dispatchKey(tab.id, keySpec, "keyUp");
          if (press < pressCount - 1 && delayMs > 0) {
            await sleepWithPause(delayMs, runId);
          }
        }
      }

      if (step.type === "sheetsCheckValue") {
        const tab = await getActiveTab();
        if (!tab) throw new Error("No active tab for Sheets check.");
        const result = await sendMessageToTab(tab.id, { type: "SHEETS_READ_SELECTION" });
        if (!result?.ok) throw new Error(result?.error || "Sheets check failed.");
        const expected = String(step.expectedValue ?? "");
        const actual = typeof result.value === "string" ? result.value : "";
        if (step.cellRef && result.cellRef && step.cellRef !== result.cellRef) {
          throw new Error(`Sheets Check Value expected cell ${step.cellRef} but found ${result.cellRef}.`);
        }
        if (actual !== expected) {
          throw new Error(`Sheets Check Value expected "${expected}" but got "${actual}".`);
        }
      }

        chrome.runtime.sendMessage({ type: "FLOW_STEP_END", actionId: step.id, index: i });

      // Global delay between steps (don’t add extra after last)
        if (i !== actions.length - 1 && globalDelayMs > 0) {
          const nextStep = actions[i + 1];
          if (step.type === "click" && nextStep?.type === "click") {
            const tab = await getActiveTab();
            if (tab) {
              const nextResolved = await ensureClickVisible(tab.id, nextStep);
              if (nextResolved) {
                await sendMessageToTab(tab.id, {
                  type: "POINTER_MOVE",
                  x: nextResolved.click.x,
                  y: nextResolved.click.y,
                  duration: globalDelayMs,
                  settings
                });
              }
            }
          }
          await sleepWithPause(globalDelayMs, runId);
        }
      }

      if (!loopEnabled || !isActiveRun(runId)) {
        shouldLoop = false;
      }
    }

    if (!isActiveRun(runId)) return;
    chrome.runtime.sendMessage({ type: "FLOW_END" });
    const active = await getActiveTab();
    if (active) await sendMessageToTab(active.id, { type: "POINTER_HIDE" });
    runController.running = false;
  } finally {
    if (flowTabId) {
      await releaseDebuggerLock(flowTabId, "flow");
    }
  }
}

function isActiveRun(runId) {
  return runController.runId === runId && !runController.stopRequested;
}

async function waitIfPaused(runId) {
  while (runController.paused && isActiveRun(runId)) {
    await sleep(chunkDelay);
  }
}

async function sleepWithPause(ms, runId) {
  let remaining = ms;
  while (remaining > 0 && isActiveRun(runId)) {
    await waitIfPaused(runId);
    const slice = Math.min(chunkDelay, remaining);
    await sleep(slice);
    remaining -= slice;
  }
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

async function resolveClickTarget(tabId, action) {
  const response = await sendMessageToTab(tabId, { type: "RESOLVE_CLICK_TARGET", action });
  if (!response?.ok) return null;
  return response;
}

async function ensureClickVisible(tabId, action) {
  const response = await sendMessageToTab(tabId, { type: "ENSURE_CLICK_VISIBLE", action });
  if (!response?.ok) return null;
  return response;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] ?? null;
}

function normalizeUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (urlSchemeRegex.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function dispatchMouse(tabId, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", params, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function ensureDebuggerAttached(tabId) {
  if (attachedDebugTabs.has(tabId)) {
    return false;
  }
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      attachedDebugTabs.add(tabId);
      resolve(true);
    });
  });
}

async function detachDebugger(tabId) {
  if (!attachedDebugTabs.has(tabId)) {
    return;
  }
  await new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => resolve());
  });
  attachedDebugTabs.delete(tabId);
}

async function ensureDebuggerLock(tabId, reason) {
  const lockSet = debugLocks.get(tabId) ?? new Set();
  if (!lockSet.has(reason)) {
    lockSet.add(reason);
    debugLocks.set(tabId, lockSet);
  }
  await ensureDebuggerAttached(tabId);
}

async function releaseDebuggerLock(tabId, reason) {
  const lockSet = debugLocks.get(tabId);
  if (!lockSet) return;
  lockSet.delete(reason);
  if (lockSet.size === 0) {
    debugLocks.delete(tabId);
    await detachDebugger(tabId);
  } else {
    debugLocks.set(tabId, lockSet);
  }
}

async function realClick(tabId, x, y, count = 1) {
  const safeCount = Math.min(3, Math.max(1, Number(count) || 1));
  try {
    await dispatchMouse(tabId, { type: "mouseMoved", x, y, buttons: 0 });
    for (let index = 1; index <= safeCount; index += 1) {
      await dispatchMouse(tabId, {
        type: "mousePressed",
        x,
        y,
        button: "left",
        buttons: 1,
        clickCount: index
      });
      await dispatchMouse(tabId, {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        buttons: 1,
        clickCount: index
      });
      if (index < safeCount) {
        await sleep(80);
      }
    }
  } finally {
  }
}

function dispatchKey(tabId, keySpec, type) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", { type, ...keySpec }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function getKeySpec(key) {
  switch (key) {
    case "ctrlA":
      return {
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        modifiers: 2
      };
    case "delete":
      return { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 };
    case "backspace":
      return { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 };
    case "arrowUp":
      return { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 };
    case "arrowDown":
      return { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 };
    case "arrowLeft":
      return { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 };
    case "arrowRight":
      return { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 };
    case "enter":
      return { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 };
    default:
      return null;
  }
}
