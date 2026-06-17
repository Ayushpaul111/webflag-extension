/**
 * Content Script - Handles text selection UI
 * Shows a floating icon when text is selected (like Grammarly)
 */

let selectionIcon = null;
let selectionModal = null;
let selectionTimeout = null;
let currentSelection = null;
let currentUrl = null;
let currentTitle = null;
let currentEnv = null;
let currentScreenshot = null;
let currentElement = null;
let extensionEnabled = true;

// Element picker state
let pickerActive = false;
let pickerHighlight = null;
let pickerLabel = null;
let pickerBanner = null;
let pickerHoverEl = null;

// Initialize
function init() {
  createSelectionIcon();
  createSelectionModal();
  createPickerUI();
  setupSelectionListeners();
  loadExtensionState();
}

/**
 * Load extension enabled state from storage
 */
async function loadExtensionState() {
  if (!isExtensionContextValid()) {
    extensionEnabled = true;
    return;
  }
  try {
    const result = await chrome.storage.local.get("extensionEnabled");
    extensionEnabled = result.extensionEnabled !== false; // Default to true
  } catch (error) {
    console.error("Error loading extension state:", error);
    extensionEnabled = true;
  }
}

/**
 * Listen for toggle messages from popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleExtension") {
    extensionEnabled = request.enabled;
    if (!extensionEnabled) {
      hideIcon();
      hideModal();
    }
  }

  if (request.action === "startElementPicker") {
    startElementPicker();
    if (sendResponse) sendResponse({ started: true });
  }
});

/**
 * Create the floating selection icon
 */
function createSelectionIcon() {
  selectionIcon = document.createElement("div");
  selectionIcon.id = "quick-note-selection-icon";
  selectionIcon.className = "quick-note-icon-hidden";
  selectionIcon.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9 7H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M9 11H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M9 15H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;

  selectionIcon.title = "Save to Webtest";
  document.body.appendChild(selectionIcon);

  // Click handler
  selectionIcon.addEventListener("click", handleIconClick);

  // Prevent icon from interfering with page selection
  selectionIcon.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

/**
 * Create the selection modal for URL option
 */
function createSelectionModal() {
  selectionModal = document.createElement("div");
  selectionModal.id = "quick-note-modal";
  selectionModal.className = "quick-note-modal-hidden";
  selectionModal.innerHTML = `
    <div class="quick-note-modal-content">
      <div class="quick-note-modal-header">
        <h3>💾 Save Note</h3>
        <button class="quick-note-modal-close" title="Close">✕</button>
      </div>
      <div class="quick-note-modal-body">
        <div class="quick-note-preview">
          <div class="quick-note-preview-label">Selected Text:</div>
          <textarea class="quick-note-preview-textarea"></textarea>
        </div>
        <div class="quick-note-element">
          <div class="quick-note-element-label">🎯 Element</div>
          <div class="quick-note-element-selector"></div>
          <div class="quick-note-element-chips"></div>
        </div>
        <div class="quick-note-url-option">
          <label class="quick-note-checkbox">
            <input type="checkbox" id="quick-note-include-url" checked>
            <span>Include page URL</span>
          </label>
          <div class="quick-note-url-display"></div>
        </div>
        <div class="quick-note-screenshot-option">
          <label class="quick-note-checkbox">
            <input type="checkbox" id="quick-note-include-screenshot" checked>
            <span>Attach screenshot</span>
          </label>
          <div class="quick-note-annotate">
            <div class="quick-note-annotate-toolbar">
              <button type="button" class="qn-tool" data-tool="box" title="Box">▭</button>
              <button type="button" class="qn-tool" data-tool="circle" title="Circle">◯</button>
              <button type="button" class="qn-tool" data-tool="arrow" title="Arrow">➜</button>
              <button type="button" class="qn-tool" data-tool="pen" title="Free draw">✎</button>
              <span class="qn-tool-sep"></span>
              <button type="button" class="qn-color" data-color="#ef4444" title="Red" style="background:#ef4444"></button>
              <button type="button" class="qn-color" data-color="#f59e0b" title="Orange" style="background:#f59e0b"></button>
              <button type="button" class="qn-color" data-color="#22c55e" title="Green" style="background:#22c55e"></button>
              <button type="button" class="qn-color" data-color="#3b82f6" title="Blue" style="background:#3b82f6"></button>
              <span class="qn-tool-sep"></span>
              <button type="button" class="qn-tool qn-undo" title="Undo">⟲</button>
              <button type="button" class="qn-tool qn-clear" title="Clear all">✕</button>
            </div>
            <div class="quick-note-screenshot-preview">
              <canvas class="quick-note-annotate-canvas"></canvas>
            </div>
            <div class="quick-note-annotate-hint">Pick a tool and drag on the screenshot to mark the bug.</div>
          </div>
        </div>
        <div class="quick-note-env">
          <div class="quick-note-env-label">Environment</div>
          <div class="quick-note-env-chips"></div>
        </div>
      </div>
      <div class="quick-note-modal-footer">
        <button class="quick-note-btn quick-note-btn-secondary quick-note-cancel">Cancel</button>
        <button class="quick-note-btn quick-note-btn-clickup">
          <div class="btn-content">
            <span>Send to ClickUp</span>
          </div>
        </button>
        <button class="quick-note-btn quick-note-btn-primary quick-note-save">
          <div class="btn-content">
            <span>Save Note</span>
          </div>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(selectionModal);

  // Event listeners
  selectionModal
    .querySelector(".quick-note-modal-close")
    .addEventListener("click", hideModal);
  selectionModal
    .querySelector(".quick-note-cancel")
    .addEventListener("click", hideModal);
  selectionModal
    .querySelector(".quick-note-save")
    .addEventListener("click", handleSaveFromModal);
  selectionModal
    .querySelector(".quick-note-btn-clickup")
    .addEventListener("click", handleSendToClickUpFromModal);

  // Close on outside click
  selectionModal.addEventListener("click", (e) => {
    if (e.target === selectionModal) {
      hideModal();
    }
  });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      !selectionModal.classList.contains("quick-note-modal-hidden")
    ) {
      hideModal();
    }
  });

  // URL checkbox toggle
  selectionModal
    .querySelector("#quick-note-include-url")
    .addEventListener("change", (e) => {
      const urlDisplay = selectionModal.querySelector(
        ".quick-note-url-display"
      );
      urlDisplay.style.display = e.target.checked ? "block" : "none";
    });

  // Screenshot checkbox toggle (show/hide the whole annotation block)
  selectionModal
    .querySelector("#quick-note-include-screenshot")
    .addEventListener("change", (e) => {
      const annotate = selectionModal.querySelector(".quick-note-annotate");
      annotate.style.display = e.target.checked ? "block" : "none";
    });

  // Annotation: bind canvas + wire toolbar
  const annotateCanvas = selectionModal.querySelector(
    ".quick-note-annotate-canvas"
  );
  Annotator.bind(annotateCanvas);
  annotateCanvas.addEventListener("pointerdown", (e) => Annotator.onDown(e));
  document.addEventListener("pointermove", (e) => Annotator.onMove(e));
  document.addEventListener("pointerup", () => Annotator.onUp());

  // Tool buttons
  selectionModal.querySelectorAll(".qn-tool[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      Annotator.setTool(btn.dataset.tool);
      selectionModal
        .querySelectorAll(".qn-tool[data-tool]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Color swatches
  selectionModal.querySelectorAll(".qn-color").forEach((btn) => {
    btn.addEventListener("click", () => {
      Annotator.setColor(btn.dataset.color);
      selectionModal
        .querySelectorAll(".qn-color")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Undo / clear
  selectionModal
    .querySelector(".qn-undo")
    .addEventListener("click", () => Annotator.undo());
  selectionModal
    .querySelector(".qn-clear")
    .addEventListener("click", () => Annotator.clearAll());

  // Auto-resize textarea in modal
  const textarea = selectionModal.querySelector(".quick-note-preview-textarea");
  textarea.addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 320) + "px";
  });
}

/**
 * Setup selection event listeners
 */
function setupSelectionListeners() {
  document.addEventListener("mouseup", handleTextSelection);
  document.addEventListener("selectionchange", handleSelectionChange);

  // Hide icon when clicking elsewhere (but not on the icon itself)
  document.addEventListener("mousedown", (e) => {
    if (
      !selectionIcon.contains(e.target) &&
      !selectionModal.contains(e.target)
    ) {
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.toString().trim().length === 0) {
          hideIcon();
        }
      }, 10);
    }
  });

  // Hide icon when scrolling
  let scrollTimeout;
  document.addEventListener(
    "scroll",
    () => {
      hideIcon();
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim() && extensionEnabled) {
          showIconForSelection();
        }
      }, 150);
    },
    true
  );

  // Hide icon when window loses focus
  window.addEventListener("blur", () => {
    hideIcon();
  });
}

/**
 * Handle text selection
 */
function handleTextSelection(e) {
  // Don't process if extension is disabled
  if (!extensionEnabled) {
    return;
  }

  // Don't process if clicking on the icon or modal
  if (selectionIcon.contains(e.target) || selectionModal.contains(e.target)) {
    return;
  }

  // Small delay to ensure selection is complete
  clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText && selectedText.length > 0) {
      // Store current selection text and URL
      currentSelection = selectedText;
      currentUrl = window.location.href;
      showIconForSelection();
    } else {
      hideIcon();
    }
  }, 10);
}

/**
 * Handle selection change
 */
function handleSelectionChange() {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (!selectedText || selectedText.length === 0) {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.toString().trim().length === 0) {
        hideIcon();
      }
    }, 50);
  }
}

/**
 * Show icon near the selection
 */
function showIconForSelection() {
  // Don't show if extension is disabled
  if (!extensionEnabled) {
    return;
  }

  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) return;

  // Position icon at the end of selection
  const iconWidth = 44;
  const iconHeight = 44;
  const offset = 8;

  let left = rect.right + offset + window.scrollX;
  let top = rect.top + window.scrollY - iconHeight / 2 + rect.height / 2;

  // Keep icon within viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Adjust horizontal position if too far right
  if (left + iconWidth > viewportWidth + window.scrollX) {
    left = rect.left + window.scrollX - iconWidth - offset;
  }

  // Adjust vertical position if too far down
  if (top + iconHeight > viewportHeight + window.scrollY) {
    top = viewportHeight + window.scrollY - iconHeight - offset;
  }

  // Adjust vertical position if too far up
  if (top < window.scrollY) {
    top = window.scrollY + offset;
  }

  selectionIcon.style.left = `${left}px`;
  selectionIcon.style.top = `${top}px`;

  // Show with animation
  requestAnimationFrame(() => {
    selectionIcon.classList.remove("quick-note-icon-hidden");
    selectionIcon.classList.add("quick-note-icon-visible");
  });
}

/**
 * Hide the icon
 */
function hideIcon() {
  selectionIcon.classList.remove("quick-note-icon-visible");
  selectionIcon.classList.add("quick-note-icon-hidden");
}

/* ------------------------------------------------------------------ *
 * Element picker (devtools-style): hover to highlight, click to capture
 * ------------------------------------------------------------------ */

/**
 * Build the picker overlay nodes once. They live outside page flow with a
 * very high z-index and never receive pointer events so they don't block
 * element resolution under the cursor.
 */
function createPickerUI() {
  pickerHighlight = document.createElement("div");
  pickerHighlight.id = "qn-picker-highlight";
  pickerHighlight.style.display = "none";

  pickerLabel = document.createElement("div");
  pickerLabel.id = "qn-picker-label";
  pickerLabel.style.display = "none";

  pickerBanner = document.createElement("div");
  pickerBanner.id = "qn-picker-banner";
  pickerBanner.textContent = "Click an element to report a bug · Esc to cancel";
  pickerBanner.style.display = "none";

  document.body.appendChild(pickerHighlight);
  document.body.appendChild(pickerLabel);
  document.body.appendChild(pickerBanner);
}

/** True if the node is part of our own injected UI (so we skip it). */
function isOwnUi(node) {
  if (!node || !node.closest) return false;
  return !!node.closest(
    "#quick-note-modal, #quick-note-selection-icon, #qn-picker-highlight, #qn-picker-label, #qn-picker-banner"
  );
}

/** Enter element-picker mode. */
function startElementPicker() {
  if (pickerActive) return;
  // Make sure any leftover selection UI / modal is out of the way.
  hideIcon();
  hideModal();

  pickerActive = true;
  pickerHoverEl = null;
  document.documentElement.classList.add("qn-picker-cursor");
  pickerBanner.style.display = "block";

  document.addEventListener("mousemove", onPickerMove, true);
  document.addEventListener("mousedown", onPickerSuppress, true);
  document.addEventListener("mouseup", onPickerSuppress, true);
  document.addEventListener("click", onPickerClick, true);
  document.addEventListener("keydown", onPickerKey, true);
}

/** Leave element-picker mode and tear down listeners + overlay. */
function stopElementPicker() {
  if (!pickerActive) return;
  pickerActive = false;
  pickerHoverEl = null;
  document.documentElement.classList.remove("qn-picker-cursor");
  pickerHighlight.style.display = "none";
  pickerLabel.style.display = "none";
  pickerBanner.style.display = "none";

  document.removeEventListener("mousemove", onPickerMove, true);
  document.removeEventListener("mousedown", onPickerSuppress, true);
  document.removeEventListener("mouseup", onPickerSuppress, true);
  document.removeEventListener("click", onPickerClick, true);
  document.removeEventListener("keydown", onPickerKey, true);
}

/** Highlight the element under the cursor and show a live selector preview. */
function onPickerMove(e) {
  if (!pickerActive) return;
  const el = e.target;
  if (!el || isOwnUi(el)) {
    pickerHighlight.style.display = "none";
    pickerLabel.style.display = "none";
    return;
  }
  pickerHoverEl = el;
  const rect = el.getBoundingClientRect();

  pickerHighlight.style.display = "block";
  pickerHighlight.style.left = `${rect.left + window.scrollX}px`;
  pickerHighlight.style.top = `${rect.top + window.scrollY}px`;
  pickerHighlight.style.width = `${rect.width}px`;
  pickerHighlight.style.height = `${rect.height}px`;

  pickerLabel.textContent = describeElement(el);
  pickerLabel.style.display = "block";
  // Place the label just above the element, or below if near the top.
  const labelTop =
    rect.top > 28 ? rect.top - 26 + window.scrollY : rect.bottom + 6 + window.scrollY;
  pickerLabel.style.left = `${rect.left + window.scrollX}px`;
  pickerLabel.style.top = `${labelTop}px`;
}

/** Swallow mousedown/up during picking so the page can't react. */
function onPickerSuppress(e) {
  if (!pickerActive) return;
  if (isOwnUi(e.target)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

/** Lock in the clicked element and start the capture flow. */
function onPickerClick(e) {
  if (!pickerActive) return;
  if (isOwnUi(e.target)) return;
  e.preventDefault();
  e.stopImmediatePropagation();

  const el = pickerHoverEl || e.target;
  capturePickedElement(el);
}

/** Esc cancels picking. */
function onPickerKey(e) {
  if (!pickerActive) return;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    stopElementPicker();
  }
}

/**
 * Capture context for the picked element, take a screenshot (with our overlay
 * hidden), then open the modal in element mode.
 */
async function capturePickedElement(el) {
  currentElement = collectElementInfo(el);
  currentTitle = document.title || "";
  currentUrl = window.location.href;
  currentEnv = detectEnv();
  currentSelection = "";

  // Take down the picker overlay so it isn't in the screenshot, then capture.
  stopElementPicker();
  currentScreenshot = await captureScreenshot();

  showModal();
}

/**
 * A short human-readable description of an element (tag#id.class) for the
 * hover label.
 * @param {Element} el
 * @returns {string}
 */
function describeElement(el) {
  let str = el.tagName.toLowerCase();
  if (el.id) str += `#${el.id}`;
  if (el.classList && el.classList.length) {
    str += "." + Array.from(el.classList).slice(0, 2).join(".");
  }
  return str;
}

/**
 * Collect selector + details + viewport rect for a picked element.
 * @param {Element} el
 * @returns {Object}
 */
function collectElementInfo(el) {
  const rect = el.getBoundingClientRect();
  const attr = (name) => el.getAttribute && el.getAttribute(name);
  const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");

  return {
    selector: buildCssSelector(el),
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    classes: el.classList ? Array.from(el.classList) : [],
    text: text.length > 120 ? text.slice(0, 120) + "…" : text,
    attrs: {
      testid:
        attr("data-testid") ||
        attr("data-test") ||
        attr("data-cy") ||
        attr("data-qa") ||
        null,
      name: attr("name"),
      type: attr("type"),
      role: attr("role"),
      ariaLabel: attr("aria-label"),
      href: attr("href"),
    },
    rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
  };
}

/**
 * Build a reasonably-robust, unique CSS selector for an element.
 * Prefers stable test attributes, then a unique id, else an nth-of-type path.
 * @param {Element} el
 * @returns {string}
 */
function buildCssSelector(el) {
  if (!(el instanceof Element)) return "";

  const isUnique = (sel) => {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch (e) {
      return false;
    }
  };

  // 1) Stable test attribute
  const testAttrs = ["data-testid", "data-test", "data-cy", "data-qa"];
  for (const a of testAttrs) {
    const v = el.getAttribute && el.getAttribute(a);
    if (v) {
      const sel = `${el.tagName.toLowerCase()}[${a}="${cssEscape(v)}"]`;
      if (isUnique(sel)) return sel;
    }
  }

  // 2) Unique id
  if (el.id) {
    const sel = `#${cssEscape(el.id)}`;
    if (isUnique(sel)) return sel;
  }

  // 3) Walk up building an nth-of-type path until unique or <body>
  const parts = [];
  let node = el;
  let depth = 0;
  while (node && node.nodeType === 1 && node !== document.body && depth < 6) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      part = `#${cssEscape(node.id)}`;
      parts.unshift(part);
      break;
    }
    const parent = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === node.tagName
      );
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    const candidate = parts.join(" > ");
    if (isUnique(candidate)) return candidate;
    node = node.parentElement;
    depth++;
  }

  return parts.join(" > ");
}

/** Minimal CSS identifier escaper (CSS.escape with a fallback). */
function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * Escape a string for safe insertion into innerHTML.
 * @param {string} text
 * @returns {string}
 */
function escapeForHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

/**
 * Detect browser, OS and screen environment for a bug report.
 * Best-effort parsing of the user agent with sensible fallbacks.
 * @returns {Object} env info
 */
function detectEnv() {
  const ua = navigator.userAgent;

  // Browser + version (order matters: Edge/Opera/Brave masquerade as Chrome).
  let browser = "Unknown";
  let browserVersion = "";
  const match = (re) => {
    const m = ua.match(re);
    return m ? m[1] : null;
  };
  if (/Edg\//.test(ua)) {
    browser = "Edge";
    browserVersion = match(/Edg\/([\d.]+)/);
  } else if (/OPR\//.test(ua)) {
    browser = "Opera";
    browserVersion = match(/OPR\/([\d.]+)/);
  } else if (/Firefox\//.test(ua)) {
    browser = "Firefox";
    browserVersion = match(/Firefox\/([\d.]+)/);
  } else if (/Chrome\//.test(ua)) {
    browser = "Chrome";
    browserVersion = match(/Chrome\/([\d.]+)/);
  } else if (/Safari\//.test(ua) && /Version\//.test(ua)) {
    browser = "Safari";
    browserVersion = match(/Version\/([\d.]+)/);
  }

  // OS
  let os = "Unknown";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/(iPhone|iPad|iPod)/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return {
    browser,
    browserVersion: browserVersion || "",
    os,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    screen: `${window.screen.width}×${window.screen.height}`,
    dpr: window.devicePixelRatio || 1,
    userAgent: ua,
    capturedAt: Date.now(),
  };
}

/**
 * Whether the extension context is still alive. After the extension is
 * reloaded or updated, content scripts already injected into open tabs keep
 * running but lose their connection to the extension — `chrome.runtime` is
 * gone and any call into it throws "Extension context invalidated".
 * @returns {boolean}
 */
function isExtensionContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

/**
 * Send a message to the background worker without throwing when the extension
 * context has been invalidated. Returns { __contextInvalid: true } in that
 * case so callers can show a "reload the page" hint instead of crashing.
 * @param {Object} message
 * @returns {Promise<Object>}
 */
async function safeSendMessage(message) {
  if (!isExtensionContextValid()) {
    return { __contextInvalid: true };
  }
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (/context invalidated|Extension context/i.test(error.message || "")) {
      return { __contextInvalid: true };
    }
    throw error;
  }
}

/**
 * Ask the background service worker to capture the visible tab.
 * @returns {Promise<string|null>} JPEG data URL, or null on failure
 */
async function captureScreenshot() {
  const response = await safeSendMessage({ action: "captureVisibleTab" });
  if (!response || response.__contextInvalid) return null;
  return response.success ? response.dataUrl : null;
}

/**
 * Lightweight screenshot annotator.
 * Draws the captured screenshot on a canvas and lets the tester mark up the
 * bug with boxes, circles, arrows or freehand strokes. Exports a flattened
 * JPEG (screenshot + annotations) on demand.
 */
const Annotator = {
  canvas: null,
  ctx: null,
  image: null,
  shapes: [],
  current: null,
  tool: "box",
  color: "#ef4444",
  drawing: false,
  lineWidth: 4,

  /** Bind to a canvas element once (event wiring lives outside). */
  bind(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
  },

  /**
   * Load a screenshot data URL as the canvas background and reset state.
   * Optionally auto-draw a box around a picked element (rect is viewport CSS px;
   * dpr scales it to the screenshot's device-pixel canvas).
   * @param {string} dataUrl
   * @param {Object} [opts] - { boxRect: {x,y,w,h}, dpr: number }
   */
  load(dataUrl, opts = {}) {
    this.shapes = [];
    this.current = null;
    this.drawing = false;
    this.image = null;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.canvas.width = img.naturalWidth;
        this.canvas.height = img.naturalHeight;
        // Scale stroke width to the image so marks stay visible on big shots.
        this.lineWidth = Math.max(3, Math.round(img.naturalWidth / 320));
        if (opts.boxRect) {
          const s = opts.dpr || 1;
          const r = opts.boxRect;
          this.shapes = [
            {
              type: "box",
              color: this.color,
              width: this.lineWidth,
              x1: r.x * s,
              y1: r.y * s,
              x2: (r.x + r.w) * s,
              y2: (r.y + r.h) * s,
            },
          ];
        }
        this.redraw();
        resolve();
      };
      img.onerror = () => resolve();
      img.src = dataUrl;
    });
  },

  setTool(tool) {
    this.tool = tool;
  },
  setColor(color) {
    this.color = color;
  },
  undo() {
    this.shapes.pop();
    this.redraw();
  },
  clearAll() {
    this.shapes = [];
    this.redraw();
  },
  hasAnnotations() {
    return this.shapes.length > 0;
  },

  /** Map a pointer event to canvas pixel coordinates. */
  pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * this.canvas.height,
    };
  },

  onDown(e) {
    if (!this.image) return;
    e.preventDefault();
    const p = this.pos(e);
    this.drawing = true;
    if (this.tool === "pen") {
      this.current = {
        type: "pen",
        color: this.color,
        width: this.lineWidth,
        points: [p],
      };
    } else {
      this.current = {
        type: this.tool,
        color: this.color,
        width: this.lineWidth,
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
      };
    }
  },

  onMove(e) {
    if (!this.drawing || !this.current) return;
    const p = this.pos(e);
    if (this.current.type === "pen") {
      this.current.points.push(p);
    } else {
      this.current.x2 = p.x;
      this.current.y2 = p.y;
    }
    this.redraw();
    this.drawShape(this.current);
  },

  onUp() {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.current) {
      this.shapes.push(this.current);
      this.current = null;
      this.redraw();
    }
  },

  redraw() {
    if (!this.ctx) return;
    if (this.image) this.ctx.drawImage(this.image, 0, 0);
    for (const shape of this.shapes) this.drawShape(shape);
  },

  drawShape(s) {
    const ctx = this.ctx;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (s.type === "box") {
      ctx.strokeRect(
        Math.min(s.x1, s.x2),
        Math.min(s.y1, s.y2),
        Math.abs(s.x2 - s.x1),
        Math.abs(s.y2 - s.y1)
      );
    } else if (s.type === "circle") {
      ctx.beginPath();
      ctx.ellipse(
        (s.x1 + s.x2) / 2,
        (s.y1 + s.y2) / 2,
        Math.abs(s.x2 - s.x1) / 2,
        Math.abs(s.y2 - s.y1) / 2,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    } else if (s.type === "arrow") {
      const head = Math.max(12, s.width * 4);
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(
        s.x2 - head * Math.cos(angle - Math.PI / 6),
        s.y2 - head * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        s.x2 - head * Math.cos(angle + Math.PI / 6),
        s.y2 - head * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
    } else if (s.type === "pen") {
      const pts = s.points;
      if (!pts.length) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  },

  /**
   * Return the final image. If the user drew anything, returns a flattened
   * JPEG data URL; otherwise returns null so the caller can keep the original
   * screenshot (avoids needless re-compression).
   */
  export() {
    if (!this.image || !this.shapes.length) return null;
    return this.canvas.toDataURL("image/jpeg", 0.7);
  },
};

/**
 * Show the modal
 */
function showModal() {
  const isElementMode = !!currentElement;

  // Populate modal with current selection
  const previewTextarea = selectionModal.querySelector(
    ".quick-note-preview-textarea"
  );
  const urlDisplay = selectionModal.querySelector(".quick-note-url-display");
  const includeUrlCheckbox = selectionModal.querySelector(
    "#quick-note-include-url"
  );
  const titleEl = selectionModal.querySelector(".quick-note-modal-header h3");
  const previewLabel = selectionModal.querySelector(".quick-note-preview-label");

  // Adapt header + description field to the capture mode.
  titleEl.textContent = isElementMode ? "🐞 Report Bug" : "💾 Save Note";
  previewLabel.textContent = isElementMode ? "Describe the bug:" : "Selected Text:";
  previewTextarea.placeholder = isElementMode
    ? "Describe what's wrong (expected vs. actual)…"
    : "";
  previewTextarea.value = isElementMode ? "" : currentSelection;

  // Element section (only in element-picker mode)
  const elementBlock = selectionModal.querySelector(".quick-note-element");
  if (isElementMode) {
    elementBlock.style.display = "block";
    selectionModal.querySelector(".quick-note-element-selector").textContent =
      currentElement.selector || "(no selector)";
    const a = currentElement.attrs || {};
    const chips = [
      currentElement.tag,
      a.testid ? `testid: ${a.testid}` : "",
      currentElement.id ? `#${currentElement.id}` : "",
      a.role ? `role: ${a.role}` : "",
      a.name ? `name: ${a.name}` : "",
      currentElement.text ? `"${currentElement.text}"` : "",
    ];
    selectionModal.querySelector(".quick-note-element-chips").innerHTML = chips
      .filter(Boolean)
      .map(
        (c) => `<span class="quick-note-element-chip">${escapeForHtml(c)}</span>`
      )
      .join("");
  } else {
    elementBlock.style.display = "none";
  }

  urlDisplay.textContent = currentUrl;
  includeUrlCheckbox.checked = true;
  urlDisplay.style.display = "block";

  // Screenshot + annotation editor
  const annotateBlock = selectionModal.querySelector(".quick-note-annotate");
  const includeScreenshotCheckbox = selectionModal.querySelector(
    "#quick-note-include-screenshot"
  );
  const screenshotOption = selectionModal.querySelector(
    ".quick-note-screenshot-option"
  );
  if (currentScreenshot) {
    screenshotOption.style.display = "block";
    includeScreenshotCheckbox.checked = true;
    annotateBlock.style.display = "block";

    // Reset to the default tool/color each time the modal opens.
    Annotator.setTool("box");
    Annotator.setColor("#ef4444");
    selectionModal
      .querySelectorAll(".qn-tool[data-tool]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tool === "box"));
    selectionModal
      .querySelectorAll(".qn-color")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.color === "#ef4444")
      );

    // In element mode, auto-draw a box around the picked element.
    const loadOpts =
      isElementMode && currentElement.rect
        ? {
            boxRect: currentElement.rect,
            dpr: (currentEnv && currentEnv.dpr) || window.devicePixelRatio || 1,
          }
        : {};
    Annotator.load(currentScreenshot, loadOpts);
  } else {
    // Capture failed (e.g. a restricted page) — hide the option entirely.
    screenshotOption.style.display = "none";
    includeScreenshotCheckbox.checked = false;
  }

  // Environment chips
  const envChips = selectionModal.querySelector(".quick-note-env-chips");
  if (currentEnv) {
    const chips = [
      `${currentEnv.browser} ${currentEnv.browserVersion}`.trim(),
      currentEnv.os,
      `Viewport ${currentEnv.viewport}`,
      `Screen ${currentEnv.screen}`,
      `DPR ${currentEnv.dpr}`,
    ];
    envChips.innerHTML = chips
      .filter(Boolean)
      .map((c) => `<span class="quick-note-env-chip">${escapeForHtml(c)}</span>`)
      .join("");
  } else {
    envChips.innerHTML = "";
  }

  // Auto-resize textarea
  previewTextarea.style.height = "auto";
  previewTextarea.style.height =
    Math.min(previewTextarea.scrollHeight, 320) + "px";

  // Show modal
  selectionModal.classList.remove("quick-note-modal-hidden");
  selectionModal.classList.add("quick-note-modal-visible");

  // Focus textarea
  setTimeout(() => {
    previewTextarea.focus();
    previewTextarea.select();
  }, 100);
}

/**
 * Hide the modal
 */
function hideModal() {
  selectionModal.classList.remove("quick-note-modal-visible");
  selectionModal.classList.add("quick-note-modal-hidden");

  // Clear selection
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
  }

  hideIcon();

  // Clear stored data after a delay to ensure save completes
  setTimeout(() => {
    currentSelection = null;
    currentUrl = null;
    currentTitle = null;
    currentEnv = null;
    currentScreenshot = null;
    currentElement = null;
  }, 100);
}

/**
 * Handle icon click
 */
async function handleIconClick(e) {
  e.preventDefault();
  e.stopPropagation();

  if (!currentSelection || !currentUrl) {
    hideIcon();
    return;
  }

  // Capture context BEFORE the modal is shown so our own overlay isn't in
  // the screenshot. Force-hide the icon instantly (its CSS hide is a 0.3s
  // fade, which would otherwise show up in the capture).
  currentTitle = document.title || "";
  currentEnv = detectEnv();

  selectionIcon.style.display = "none";
  currentScreenshot = await captureScreenshot();
  selectionIcon.style.display = "";
  hideIcon();

  showModal();
}

/**
 * Handle save from modal
 */
async function handleSaveFromModal() {
  const textarea = selectionModal.querySelector(".quick-note-preview-textarea");
  const textToSave = textarea.value.trim();
  const urlToSave = currentUrl;
  const includeUrl = selectionModal.querySelector(
    "#quick-note-include-url"
  ).checked;
  const includeScreenshot = selectionModal.querySelector(
    "#quick-note-include-screenshot"
  ).checked;

  const finalUrl = includeUrl ? urlToSave : null;
  // Use the annotated image if the tester drew anything, else the original.
  const finalScreenshot =
    includeScreenshot && currentScreenshot
      ? Annotator.export() || currentScreenshot
      : null;

  if (!textToSave) {
    textarea.classList.add("shake");
    setTimeout(() => {
      textarea.classList.remove("shake");
    }, 300);
    return;
  }

  try {
    const saveBtn = selectionModal.querySelector(".quick-note-save");
    const btnContent = saveBtn.querySelector(".btn-content");

    // Show saving state
    saveBtn.classList.add("saving");
    saveBtn.disabled = true;
    btnContent.innerHTML = `
      <svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      <span>Saving...</span>
    `;

    // Send message to background script to save note
    const saveResponse = await safeSendMessage({
      action: "saveNote",
      text: textToSave,
      url: finalUrl,
      title: currentTitle,
      env: currentEnv,
      screenshot: finalScreenshot,
      element: currentElement,
    });

    if (saveResponse && saveResponse.__contextInvalid) {
      saveBtn.classList.remove("saving");
      saveBtn.disabled = false;
      btnContent.innerHTML = `<span>Save Note</span>`;
      alert(
        "Webtest was updated. Please reload this page, then save your note again."
      );
      return;
    }

    // Show success state
    saveBtn.classList.remove("saving");
    saveBtn.classList.add("saved");
    btnContent.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>Saved!</span>
    `;

    // Hide modal after short delay
    setTimeout(() => {
      hideModal();
      saveBtn.disabled = false;
      saveBtn.classList.remove("saved");
      btnContent.innerHTML = `<span>Save Note</span>`;
    }, 1000);
  } catch (error) {
    console.error("Error in handleSaveFromModal:", error);

    const saveBtn = selectionModal.querySelector(".quick-note-save");
    const btnContent = saveBtn.querySelector(".btn-content");
    saveBtn.classList.remove("saving");
    saveBtn.disabled = false;
    btnContent.innerHTML = `<span>Save Note</span>`;

    alert("Failed to save note. Please try again.");
  }
}

/**
 * Send the current capture straight to ClickUp, skipping the local note list.
 * On success the modal closes; on failure the user is told what to fix.
 */
async function handleSendToClickUpFromModal() {
  const textarea = selectionModal.querySelector(".quick-note-preview-textarea");
  const textToSave = textarea.value.trim();
  const includeUrl = selectionModal.querySelector(
    "#quick-note-include-url"
  ).checked;
  const includeScreenshot = selectionModal.querySelector(
    "#quick-note-include-screenshot"
  ).checked;

  if (!textToSave) {
    textarea.classList.add("shake");
    setTimeout(() => textarea.classList.remove("shake"), 300);
    return;
  }

  const note = {
    id: crypto.randomUUID(),
    text: textToSave,
    url: includeUrl ? currentUrl : null,
    title: currentTitle,
    env: currentEnv,
    element: currentElement,
    screenshot:
      includeScreenshot && currentScreenshot
        ? Annotator.export() || currentScreenshot
        : null,
  };

  const btn = selectionModal.querySelector(".quick-note-btn-clickup");
  const btnContent = btn.querySelector(".btn-content");

  const restore = () => {
    btn.disabled = false;
    btn.classList.remove("saving", "saved");
    btnContent.innerHTML = `<span>Send to ClickUp</span>`;
  };

  btn.disabled = true;
  btn.classList.add("saving");
  btnContent.innerHTML = `
    <svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    <span>Sending...</span>
  `;

  try {
    const response = await safeSendMessage({
      action: "sendNoteToClickUp",
      note,
    });

    if (response && response.__contextInvalid) {
      restore();
      alert(
        "Webtest was updated. Please reload this page, then send to ClickUp again."
      );
      return;
    }

    if (response && response.success) {
      btn.classList.remove("saving");
      btn.classList.add("saved");
      btnContent.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Sent!</span>
      `;
      setTimeout(() => {
        hideModal();
        restore();
      }, 1000);
      return;
    }

    restore();
    if (response && response.notConnected) {
      alert(
        "Connect ClickUp first: open the Webtest popup, click the gear icon, connect your ClickUp account, then try again."
      );
    } else {
      alert(
        "Couldn't send to ClickUp: " +
          ((response && response.error) || "unknown error")
      );
    }
  } catch (error) {
    console.error("Error sending to ClickUp from modal:", error);
    restore();
    alert("Failed to send to ClickUp. Please try again.");
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
