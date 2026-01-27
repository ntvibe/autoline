(() => {
  const POINTER_ID = "autoline-pointer";
  const PREVIEW_ID = "autoline-click-preview";
  const STYLE_ID = "autoline-overlay-style";
  const RECORDING_CLASS = "autoline-recording";
  let pendingRecord = null;
  let pointerState = {
    visible: false,
    x: 0,
    y: 0,
    padding: 0,
    animation: null
  };

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PREVIEW_ID} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483646;
      }
      #${PREVIEW_ID} .autoline-highlight {
        position: fixed;
        border: 2px solid rgba(255, 0, 0, 0.85);
        border-radius: 8px;
        box-shadow: 0 0 0 6px rgba(255, 0, 0, 0.15);
        animation: autolinePulse 1s ease-in-out infinite;
      }
      #${PREVIEW_ID} .autoline-dot {
        position: fixed;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(255, 0, 0, 0.9);
        box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.35);
        animation: autolineDotPulse 0.9s ease-in-out infinite;
      }
      .autoline-perform-dot {
        position: fixed;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(255, 0, 0, 0.9);
        box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.35);
        animation: autolineDotPulse 0.9s ease-in-out;
        pointer-events: none;
        z-index: 2147483646;
      }
      #${PREVIEW_ID}.autoline-fade {
        animation: autolineFadeOut 2s ease-in-out forwards;
      }
      #${POINTER_ID} {
        position: fixed;
        left: 0;
        top: 0;
        z-index: 2147483647;
        pointer-events: none;
        opacity: 0;
        transform: translate(0, 0);
        transition: opacity 160ms ease;
      }
      #${POINTER_ID}.visible {
        opacity: 1;
      }
      @keyframes autolinePulse {
        0%, 100% { box-shadow: 0 0 0 6px rgba(255, 0, 0, 0.15); }
        50% { box-shadow: 0 0 0 12px rgba(255, 0, 0, 0.25); }
      }
      @keyframes autolineDotPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.3); }
        50% { transform: scale(1.35); box-shadow: 0 0 0 10px rgba(255, 0, 0, 0); }
      }
      @keyframes autolineFadeOut {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
      body.${RECORDING_CLASS} { cursor: crosshair !important; }
    `;
    document.head.appendChild(style);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }

  function isUniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  }

  function buildSelectorCandidates(element) {
    const selectors = [];
    if (!(element instanceof Element)) return selectors;
    const tag = element.tagName.toLowerCase();
    if (element.id) {
      const idSelector = `#${cssEscape(element.id)}`;
      if (isUniqueSelector(idSelector)) selectors.push(idSelector);
    }

    const attrs = [
      "data-testid",
      "data-test",
      "data-qa",
      "aria-label",
      "name",
      "title",
      "alt",
      "role"
    ];
    for (const attr of attrs) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const selector = `${tag}[${attr}="${cssEscape(value)}"]`;
      if (isUniqueSelector(selector)) selectors.push(selector);
      if (selectors.length >= 3) break;
    }

    if (!selectors.length) {
      const className = element.className && typeof element.className === "string" ? element.className.trim() : "";
      if (className) {
        const safeClass = className
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((cls) => `.${cssEscape(cls)}`)
          .join("");
        if (safeClass) {
          const selector = `${tag}${safeClass}`;
          if (isUniqueSelector(selector)) selectors.push(selector);
        }
      }
    }

    return selectors;
  }

  function buildCssPath(element) {
    if (!(element instanceof Element)) return "";
    const segments = [];
    let current = element;
    while (current && current.nodeType === 1 && current.tagName.toLowerCase() !== "html") {
      const tag = current.tagName.toLowerCase();
      let segment = tag;
      if (current.id) {
        segment += `#${cssEscape(current.id)}`;
        segments.unshift(segment);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          segment += `:nth-of-type(${index})`;
        }
      }
      segments.unshift(segment);
      current = parent;
    }
    return segments.join(" > ");
  }

  function buildXPath(element) {
    if (!(element instanceof Element)) return "";
    const segments = [];
    let current = element;
    while (current && current.nodeType === 1) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentNode;
      if (!parent || parent.nodeType !== 1) {
        segments.unshift(tag);
        break;
      }
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      const index = siblings.indexOf(current) + 1;
      segments.unshift(`${tag}[${index}]`);
      current = parent;
    }
    return `/${segments.join("/")}`;
  }

  function describeElement(element) {
    if (!(element instanceof Element)) return "";
    const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("alt");
    const text = element.textContent?.trim().slice(0, 80) || "";
    const tag = element.tagName.toLowerCase();
    return label || text || tag;
  }

  function recordClick(event) {
    if (!pendingRecord) return;
    const actionId = pendingRecord;
    pendingRecord = null;
    document.removeEventListener("click", recordClick, true);
    document.body?.classList.remove(RECORDING_CLASS);

    const target = event.target instanceof Element ? event.target : event.composedPath?.()[0];
    if (!(target instanceof Element)) return;

    const rect = target.getBoundingClientRect();
    const relativeX = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    const relativeY = rect.height ? (event.clientY - rect.top) / rect.height : 0;

    const candidates = buildSelectorCandidates(target);
    const cssPath = buildCssPath(target);
    if (cssPath && !candidates.includes(cssPath)) candidates.push(cssPath);

    const payload = {
      target: {
        selectors: candidates,
        xpath: buildXPath(target),
        tagName: target.tagName.toLowerCase(),
        label: describeElement(target)
      },
      click: {
        relativeX: Number(relativeX.toFixed(4)),
        relativeY: Number(relativeY.toFixed(4)),
        clientX: Math.round(event.clientX),
        clientY: Math.round(event.clientY)
      },
      rect: {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };

    chrome.runtime.sendMessage({
      type: "CLICK_RECORDED",
      actionId,
      payload
    });
  }

  function resolveElement(target) {
    if (!target) return null;
    const selectors = Array.isArray(target.selectors) ? target.selectors : [];
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch (e) {}
    }
    if (target.xpath) {
      try {
        const result = document.evaluate(target.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue instanceof Element) return result.singleNodeValue;
      } catch (e) {}
    }
    return null;
  }

  function resolveClickPosition(action) {
    const target = resolveElement(action?.target);
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    const relativeX = action?.click?.relativeX ?? 0.5;
    const relativeY = action?.click?.relativeY ?? 0.5;
    const x = rect.left + rect.width * relativeX;
    const y = rect.top + rect.height * relativeY;
    return {
      target,
      rect,
      click: { x, y }
    };
  }

  function isPointInViewport(x, y, padding = 6) {
    return (
      x >= padding &&
      y >= padding &&
      x <= window.innerWidth - padding &&
      y <= window.innerHeight - padding
    );
  }

  function waitForScrollToSettle(timeoutMs = 1200, stableMs = 120) {
    const scrollingElement = document.scrollingElement || document.documentElement;
    if (!scrollingElement) return Promise.resolve(true);
    return new Promise((resolve) => {
      const start = performance.now();
      let lastX = scrollingElement.scrollLeft;
      let lastY = scrollingElement.scrollTop;
      let lastChange = performance.now();
      const check = () => {
        const now = performance.now();
        const nextX = scrollingElement.scrollLeft;
        const nextY = scrollingElement.scrollTop;
        if (nextX !== lastX || nextY !== lastY) {
          lastX = nextX;
          lastY = nextY;
          lastChange = now;
        }
        if (now - lastChange >= stableMs) {
          resolve(true);
          return;
        }
        if (now - start >= timeoutMs) {
          resolve(false);
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  async function scrollTargetIntoView(target) {
    if (!(target instanceof Element)) return Promise.resolve(false);
    const scrollingElement = document.scrollingElement || document.documentElement;
    const rect = target.getBoundingClientRect();
    const viewportHeight = window.innerHeight || scrollingElement?.clientHeight || 0;
    const viewportWidth = window.innerWidth || scrollingElement?.clientWidth || 0;
    const centerOffsetY = rect.top + rect.height / 2 - viewportHeight / 2;
    const centerOffsetX = rect.left + rect.width / 2 - viewportWidth / 2;
    if (scrollingElement) {
      const nextTop = scrollingElement.scrollTop + centerOffsetY;
      const nextLeft = scrollingElement.scrollLeft + centerOffsetX;
      scrollingElement.scrollTop = Math.max(0, nextTop);
      scrollingElement.scrollLeft = Math.max(0, nextLeft);
    }
    target.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    await waitForScrollToSettle(1600, 100);
    return true;
  }

  function waitForClickPosition(action, timeoutMs = 800) {
    return new Promise((resolve) => {
      const start = performance.now();
      const check = () => {
        const resolved = resolveClickPosition(action);
        if (resolved && isPointInViewport(resolved.click.x, resolved.click.y)) {
          resolve(resolved);
          return;
        }
        if (performance.now() - start > timeoutMs) {
          resolve(resolved ?? null);
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  async function ensureClickVisible(action) {
    const resolved = resolveClickPosition(action);
    if (!resolved) return null;
    if (isPointInViewport(resolved.click.x, resolved.click.y)) {
      return { resolved, scrolled: false };
    }
    await scrollTargetIntoView(resolved.target);
    const updated = await waitForClickPosition(action);
    return { resolved: updated ?? resolved, scrolled: true };
  }

  function removePreview() {
    const existing = document.getElementById(PREVIEW_ID);
    if (existing) existing.remove();
  }

  async function showPreview(action) {
    ensureStyles();
    removePreview();

    const ensured = await ensureClickVisible(action);
    if (!ensured?.resolved) return;
    const { rect, click } = ensured.resolved;

    const overlay = document.createElement("div");
    overlay.id = PREVIEW_ID;
    overlay.className = "autoline-fade";

    const highlight = document.createElement("div");
    highlight.className = "autoline-highlight";
    highlight.style.left = `${rect.left}px`;
    highlight.style.top = `${rect.top}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;

    const dot = document.createElement("div");
    dot.className = "autoline-dot";
    dot.style.left = `${click.x - 5}px`;
    dot.style.top = `${click.y - 5}px`;

    overlay.appendChild(highlight);
    overlay.appendChild(dot);
    document.body.appendChild(overlay);

    window.setTimeout(removePreview, 2000);
  }

  function showClickIndicator(x, y) {
    ensureStyles();
    const dot = document.createElement("div");
    dot.className = "autoline-perform-dot";
    dot.style.left = `${x - 5}px`;
    dot.style.top = `${y - 5}px`;
    document.body.appendChild(dot);
    window.setTimeout(() => dot.remove(), 900);
  }

  function ensurePointer(settings) {
    ensureStyles();
    let pointer = document.getElementById(POINTER_ID);
    if (!pointer) {
      pointer = document.createElement("div");
      pointer.id = POINTER_ID;
      pointer.innerHTML = `
        <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M 10.88,31.19 0.12,2.49 A 1.85,1.85 0 0 1 2.48,0.11 L 31.17,10.67 a 1.27,1.27 0 0 1 -0.11,2.42 l -10.33,2.73 a 6.82,6.81 0 0 0 -4.87,4.94 l -2.58,10.3 a 1.25,1.25 0 0 1 -2.39,0.14 z"
            transform="translate(-0.12 -0.11) scale(1.0296)"
          />
        </svg>
      `;
      document.body.appendChild(pointer);
    }

    const size = Math.max(8, Number(settings?.pointerSizePx ?? 32));
    const fill = settings?.pointerFill ?? "#000000";
    const stroke = settings?.pointerOutlineColor ?? "#ffffff";
    const strokeWidth = Math.max(0, Number(settings?.pointerOutlinePx ?? 2));
    const shadowEnabled = settings?.pointerShadowEnabled !== false;
    const shadowOpacity = Math.max(0, Math.min(1, Number(settings?.pointerShadowOpacity ?? 0.25)));
    const shadowBlur = Math.max(0, Number(settings?.pointerShadowBlur ?? 8));
    const padding = Math.max(2, Math.ceil(strokeWidth / 2) + 1);

    pointer.style.width = `${size}px`;
    pointer.style.height = `${size}px`;
    pointer.style.padding = `${padding}px`;
    pointer.style.boxSizing = "content-box";
    pointerState.padding = padding;

    const svg = pointer.querySelector("svg");
    if (svg) {
      svg.style.display = "block";
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute("overflow", "visible");
      const path = svg.querySelector("path");
      if (path) {
        path.setAttribute("fill", fill);
        path.setAttribute("stroke", stroke);
        path.setAttribute("stroke-width", String(strokeWidth));
        path.setAttribute("stroke-linejoin", "round");
      }
    }

    pointer.style.filter = shadowEnabled
      ? `drop-shadow(0 0 ${shadowBlur}px rgba(0, 0, 0, ${shadowOpacity}))`
      : "none";

    return pointer;
  }

  function setPointerPosition(pointer, x, y) {
    const offset = pointerState.padding || 0;
    pointer.style.transform = `translate(${Math.round(x - offset)}px, ${Math.round(y - offset)}px)`;
    pointerState.x = x;
    pointerState.y = y;
  }

  function showPointer(x, y, settings, fadeIn = true) {
    const pointer = ensurePointer(settings);
    if (pointerState.animation) {
      pointerState.animation.cancel();
      pointerState.animation = null;
    }
    setPointerPosition(pointer, x, y);
    if (fadeIn) {
      requestAnimationFrame(() => pointer.classList.add("visible"));
    } else {
      pointer.classList.add("visible");
    }
    pointerState.visible = true;
  }

  function movePointer(x, y, duration, settings) {
    const pointer = ensurePointer(settings);
    if (!pointerState.visible) {
      showPointer(pointerState.x, pointerState.y, settings, false);
    }
    if (pointerState.animation) pointerState.animation.cancel();

    const start = { x: pointerState.x, y: pointerState.y };
    const end = { x, y };
    const offset = pointerState.padding || 0;
    pointerState.animation = pointer.animate(
      [
        {
          transform: `translate(${Math.round(start.x - offset)}px, ${Math.round(start.y - offset)}px)`
        },
        { transform: `translate(${Math.round(end.x - offset)}px, ${Math.round(end.y - offset)}px)` }
      ],
      {
        duration: Math.max(0, duration),
        easing: "cubic-bezier(0.1, 0, 0.1, 1)",
        fill: "forwards"
      }
    );
    pointerState.animation.onfinish = () => {
      pointerState.animation = null;
      setPointerPosition(pointer, end.x, end.y);
    };
  }

  function hidePointer() {
    const pointer = document.getElementById(POINTER_ID);
    if (pointer) {
      pointer.classList.remove("visible");
      window.setTimeout(() => pointer.remove(), 180);
    }
    pointerState.visible = false;
  }

  async function copySelectionToClipboard() {
    let text = "";
    let source = "selection";
    let cellRef = "";

    if (isGoogleSheets()) {
      const sheetsResult = readSheetsSelection();
      if (sheetsResult.ok) {
        text = sheetsResult.value ?? "";
        cellRef = sheetsResult.cellRef ?? "";
        source = "sheets";
      }
    }

    if (source !== "sheets") {
      const selection = window.getSelection();
      text = selection ? selection.toString() : "";
    }

    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, text, source, cellRef };
    } catch (e) {
      return { ok: false, text, source, cellRef, error: e?.message || "Clipboard write failed" };
    }
  }

  async function readClipboardText(fallbackText) {
    try {
      const text = await navigator.clipboard.readText();
      return { ok: true, text };
    } catch (e) {
      if (typeof fallbackText === "string") {
        return { ok: true, text: fallbackText, fallback: true };
      }
      return { ok: false, error: e?.message || "Clipboard read failed" };
    }
  }

  function insertTextIntoActiveElement(text) {
    const active = document.activeElement;
    if (!active) return { ok: false, error: "No focused element to paste into." };
    active.focus();

    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      const start = Number.isFinite(active.selectionStart) ? active.selectionStart : active.value.length;
      const end = Number.isFinite(active.selectionEnd) ? active.selectionEnd : active.value.length;
      if (typeof active.setRangeText === "function") {
        active.setRangeText(text, start, end, "end");
      } else {
        const before = active.value.slice(0, start);
        const after = active.value.slice(end);
        active.value = `${before}${text}${after}`;
        const pos = start + text.length;
        active.selectionStart = pos;
        active.selectionEnd = pos;
      }
      active.dispatchEvent(new Event("input", { bubbles: true }));
      return { ok: true };
    }

    if (active.isContentEditable) {
      const success = document.execCommand("insertText", false, text);
      if (!success) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          selection.deleteFromDocument();
          selection.getRangeAt(0).insertNode(document.createTextNode(text));
        } else {
          active.textContent += text;
        }
      }
      active.dispatchEvent(new Event("input", { bubbles: true }));
      return { ok: true };
    }

    return { ok: false, error: "Focused element does not support text input." };
  }

  function isGoogleSheets() {
    return window.location.hostname === "docs.google.com" && window.location.pathname.includes("/spreadsheets");
  }

  function findSheetsNameBox() {
    const selectors = [
      'input[aria-label="Name box"]',
      'input[aria-label="Name Box"]',
      '[aria-label="Name box"] input',
      '[aria-label="Name Box"] input',
      ".name-box input"
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function findSheetsFormulaInput() {
    const selectors = [
      'textarea[aria-label="Formula bar"]',
      'input[aria-label="Formula bar"]',
      ".cell-input"
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function readSheetsSelection() {
    if (!isGoogleSheets()) {
      return { ok: false, error: "This action only works on Google Sheets." };
    }
    const nameBox = findSheetsNameBox();
    const cellRef = (nameBox?.value || nameBox?.textContent || "").trim();
    const formulaInput = findSheetsFormulaInput();
    let value = "";
    if (formulaInput) {
      value = typeof formulaInput.value === "string" ? formulaInput.value : formulaInput.textContent || "";
    }
    return { ok: true, cellRef, value };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "ARM_CLICK_RECORD") {
      ensureStyles();
      pendingRecord = msg.actionId;
      document.body?.classList.add(RECORDING_CLASS);
      document.addEventListener("click", recordClick, true);
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "SHOW_CLICK_PREVIEW") {
      showPreview(msg.action);
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "HIDE_CLICK_PREVIEW") {
      removePreview();
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "RESOLVE_CLICK_TARGET") {
      const resolved = resolveClickPosition(msg.action);
      if (!resolved) {
        sendResponse({ ok: false });
        return true;
      }
      sendResponse({
        ok: true,
        rect: {
          left: resolved.rect.left,
          top: resolved.rect.top,
          width: resolved.rect.width,
          height: resolved.rect.height
        },
        click: {
          x: resolved.click.x,
          y: resolved.click.y
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      });
      return true;
    }

    if (msg?.type === "ENSURE_CLICK_VISIBLE") {
      (async () => {
        const ensured = await ensureClickVisible(msg.action);
        if (!ensured?.resolved) {
          sendResponse({ ok: false });
          return;
        }
        const { rect, click } = ensured.resolved;
        sendResponse({
          ok: true,
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          },
          click: { x: click.x, y: click.y },
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        });
      })();
      return true;
    }

    if (msg?.type === "POINTER_SHOW") {
      showPointer(msg.x, msg.y, msg.settings, msg.fadeIn !== false);
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "POINTER_SNAP") {
      const pointer = ensurePointer(msg.settings);
      if (!pointerState.visible) {
        showPointer(msg.x, msg.y, msg.settings, false);
      } else {
        setPointerPosition(pointer, msg.x, msg.y);
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "POINTER_MOVE") {
      movePointer(msg.x, msg.y, msg.duration ?? 0, msg.settings);
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "POINTER_HIDE") {
      hidePointer();
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "SHOW_CLICK_DOT") {
      if (msg.showDot !== false) {
        showClickIndicator(msg.x, msg.y);
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "CLIPBOARD_COPY_SELECTION") {
      (async () => {
        const result = await copySelectionToClipboard();
        sendResponse(result);
      })();
      return true;
    }

    if (msg?.type === "CLIPBOARD_PASTE") {
      (async () => {
        const readResult = await readClipboardText(msg.fallbackText);
        if (!readResult.ok) {
          sendResponse(readResult);
          return;
        }
        const insertResult = insertTextIntoActiveElement(readResult.text ?? "");
        sendResponse(
          insertResult.ok
            ? { ok: true, usedFallback: readResult.fallback, source: isGoogleSheets() ? "sheets" : "active" }
            : insertResult
        );
      })();
      return true;
    }

    if (msg?.type === "SHEETS_READ_SELECTION") {
      sendResponse(readSheetsSelection());
      return true;
    }

    return false;
  });
})();
