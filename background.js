// background.js (MV3 service worker)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      // msg: { actions: [], settings: { globalDelaySec } }
      runFlow(msg.actions || [], msg.settings || {}).catch((e) => {
        chrome.runtime.sendMessage({ type: "FLOW_ERROR", error: String(e?.message || e) });
      });
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

async function runFlow(actions, settings) {
  // Normalize
  const globalDelayMs = Math.max(0, Number(settings.globalDelaySec ?? 0.2)) * 1000;

  chrome.runtime.sendMessage({ type: "FLOW_START" });

  for (let i = 0; i < actions.length; i++) {
    const step = actions[i];

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
      await sleep(ms);
    }

    chrome.runtime.sendMessage({ type: "FLOW_STEP_END", actionId: step.id, index: i });

    // Global delay between steps (don’t add extra after last)
    if (i !== actions.length - 1 && globalDelayMs > 0) {
      await sleep(globalDelayMs);
    }
  }

  chrome.runtime.sendMessage({ type: "FLOW_END" });
}
