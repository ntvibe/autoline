// background.js (MV3 service worker)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunkDelay = 150;

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
  const globalDelayMs = Math.max(0, Number(settings.globalDelaySec ?? 0.2)) * 1000;
  const loopEnabled = actions.some((action) => action.type === "simpleLoop" && action.enabled !== false);

  let shouldLoop = true;
  while (shouldLoop) {
    if (!isActiveRun(runId)) return;
    chrome.runtime.sendMessage({ type: "FLOW_START" });

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
      }

      if (step.type === "delay") {
        const ms = Math.max(0, Number(step.delaySec ?? 1)) * 1000;
        await sleepWithPause(ms, runId);
      }

      if (step.type === "openUrl") {
        const url = step.url;
        if (!url) throw new Error("Open URL node missing a URL.");
        const tab = await getActiveTab();
        if (!tab) throw new Error("No active tab to navigate.");
        await chrome.tabs.update(tab.id, { url });
      }

      if (step.type === "reloadTab") {
        const tab = await getActiveTab();
        if (!tab) throw new Error("No active tab to reload.");
        await chrome.tabs.reload(tab.id);
      }

      if (step.type === "simpleLoop") {
        await sleepWithPause(0, runId);
      }

      chrome.runtime.sendMessage({ type: "FLOW_STEP_END", actionId: step.id, index: i });

      // Global delay between steps (don’t add extra after last)
      if (i !== actions.length - 1 && globalDelayMs > 0) {
        await sleepWithPause(globalDelayMs, runId);
      }
    }

    if (!loopEnabled || !isActiveRun(runId)) {
      shouldLoop = false;
    }
  }

  if (!isActiveRun(runId)) return;
  chrome.runtime.sendMessage({ type: "FLOW_END" });
  runController.running = false;
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

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] ?? null;
}
