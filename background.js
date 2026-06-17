// Import shared utilities
importScripts("storage.js", "clickup.js", "config.js");

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: "saveToNotes",
    title: "Save selection to Webtest",
    contexts: ["selection"],
  });

  // On first install, open the onboarding / settings page so the user can
  // connect their ClickUp account.
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "saveToNotes" && info.selectionText) {
    await saveNoteFromText(info.selectionText, info.pageUrl);
  }
});

// Keyboard shortcut → tell the active tab's content script to start picking.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "pick-element") return;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.id != null) {
      await chrome.tabs.sendMessage(tab.id, { action: "startElementPicker" });
    }
  } catch (error) {
    // No content script on this page (e.g. chrome:// or the Web Store).
    console.warn("Could not start element picker:", error.message);
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveNote" && request.text) {
    // Handle async operation properly
    (async () => {
      try {
        await saveNoteFromText(request.text, request.url, {
          title: request.title,
          env: request.env,
          screenshot: request.screenshot,
          element: request.element,
        });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Keep message channel open for async response
  }

  if (request.action === "captureVisibleTab") {
    (async () => {
      try {
        const windowId = sender.tab
          ? sender.tab.windowId
          : chrome.windows.WINDOW_ID_CURRENT;
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: "jpeg",
          quality: 60,
        });
        sendResponse({ success: true, dataUrl });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Keep message channel open for async response
  }

  if (request.action === "sendNoteToClickUp" && request.note) {
    (async () => {
      try {
        const result = await sendNoteToClickUp(request.note);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Keep message channel open for async response
  }
});

/**
 * Push a single note to ClickUp as a subtask of the configured parent task.
 * @param {Object} note - Note object { id, text, url, ... }
 * @returns {Promise<Object>} { success, taskId?, taskUrl?, error?, notConnected? }
 */
async function sendNoteToClickUp(note) {
  const config = await ClickUpConfig.get();
  const mode = config && config.taskMode === "task" ? "task" : "subtask";

  // Always need a token + list; subtask mode additionally needs a parent task.
  if (
    !config ||
    !config.token ||
    !config.listId ||
    (mode !== "task" && !config.parentTaskId)
  ) {
    return { success: false, notConnected: true };
  }

  const text = (note.text || "").trim();
  if (!text) {
    return { success: false, error: "Note is empty." };
  }

  // Title = first line, capped to 100 chars; description = full text + source
  // + a captured-environment block so the subtask reads like a bug report.
  const firstLine = text.split("\n")[0];
  const name =
    firstLine.length > 100 ? firstLine.substring(0, 100) + "…" : firstLine;
  let description = text;
  if (note.url) {
    description += `\n\nSource: ${note.url}`;
  }
  description += formatElementForClickUp(note);
  description += formatEnvForClickUp(note);

  try {
    const created = await ClickUpAPI.createTask(config.token, config.listId, {
      name,
      description,
      // In "task" mode there's no parent — it becomes a top-level task.
      parent: mode === "task" ? undefined : config.parentTaskId,
    });

    // Upload the screenshot as an attachment (best-effort; a failure here
    // shouldn't fail the whole send — the subtask is already created).
    if (note.screenshot) {
      try {
        const blob = await (await fetch(note.screenshot)).blob();
        await ClickUpAPI.uploadAttachment(
          config.token,
          created.id,
          blob,
          `screenshot-${note.id || Date.now()}.jpg`
        );
      } catch (attachError) {
        console.warn("Screenshot attachment failed:", attachError);
      }
    }

    return {
      success: true,
      taskId: created.id,
      taskUrl: created.url || null,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Build a human-readable element block for a ClickUp subtask description so a
 * dev can jump straight to the component. Empty string when no element.
 * @param {Object} note
 * @returns {string}
 */
function formatElementForClickUp(note) {
  const el = note.element;
  if (!el) return "";

  const lines = ["\n\n---", "🎯 Element"];
  if (el.selector) lines.push(`- Selector: ${el.selector}`);
  if (el.tag) lines.push(`- Tag: <${el.tag}>`);
  if (el.attrs && el.attrs.testid) lines.push(`- Test ID: ${el.attrs.testid}`);
  if (el.attrs && el.attrs.role) lines.push(`- Role: ${el.attrs.role}`);
  if (el.attrs && el.attrs.name) lines.push(`- Name: ${el.attrs.name}`);
  if (el.attrs && el.attrs.href) lines.push(`- Href: ${el.attrs.href}`);
  if (el.text) lines.push(`- Text: "${el.text}"`);

  return lines.join("\n");
}

/**
 * Build a human-readable environment block for a ClickUp subtask description.
 * Returns an empty string when the note has no captured environment.
 * @param {Object} note
 * @returns {string}
 */
function formatEnvForClickUp(note) {
  const env = note.env;
  if (!env) return "";

  const lines = ["\n\n---", "🐞 Captured environment"];
  if (note.title) lines.push(`- Page: ${note.title}`);
  if (env.browser)
    lines.push(`- Browser: ${env.browser} ${env.browserVersion || ""}`.trim());
  if (env.os) lines.push(`- OS: ${env.os}`);
  if (env.viewport) lines.push(`- Viewport: ${env.viewport}`);
  if (env.screen) lines.push(`- Screen: ${env.screen}`);
  if (env.dpr) lines.push(`- Device pixel ratio: ${env.dpr}`);
  if (env.capturedAt)
    lines.push(`- Captured: ${new Date(env.capturedAt).toLocaleString()}`);
  if (env.userAgent) lines.push(`- User agent: ${env.userAgent}`);

  return lines.join("\n");
}

/**
 * Save a note from selected text
 * @param {string} text - Selected text to save
 * @param {string} url - Page URL (optional)
 * @param {Object} [context] - { title, env, screenshot } captured for bug reports
 */
async function saveNoteFromText(text, url = null, context = {}) {
  try {
    const selectedText = text.trim();

    if (!selectedText) return;

    const newNote = {
      id: crypto.randomUUID(),
      text: selectedText,
      url: url || null,
      title: context.title || null,
      env: context.env || null,
      element: context.element || null,
      screenshot: context.screenshot || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      index: 0,
    };

    await StorageHelper.addNote(newNote);
  } catch (error) {
    console.error("Error saving note:", error);
    throw error;
  }
}
