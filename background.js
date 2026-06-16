// Import shared utilities
importScripts("storage.js", "clickup.js", "config.js");

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: "saveToNotes",
    title: "Save to Notes",
    contexts: ["selection"],
  });

  console.log("Quick Note Taker extension installed");

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

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveNote" && request.text) {
    // Handle async operation properly
    (async () => {
      try {
        await saveNoteFromText(request.text, request.url);
        sendResponse({ success: true });
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

  if (!config || !config.token || !config.listId || !config.parentTaskId) {
    return { success: false, notConnected: true };
  }

  const text = (note.text || "").trim();
  if (!text) {
    return { success: false, error: "Note is empty." };
  }

  // Title = first line, capped to 100 chars; description = full text + source.
  const firstLine = text.split("\n")[0];
  const name =
    firstLine.length > 100 ? firstLine.substring(0, 100) + "…" : firstLine;
  let description = text;
  if (note.url) {
    description += `\n\nSource: ${note.url}`;
  }

  try {
    const created = await ClickUpAPI.createTask(config.token, config.listId, {
      name,
      description,
      parent: config.parentTaskId,
    });

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
 * Save a note from selected text
 * @param {string} text - Selected text to save
 * @param {string} url - Page URL (optional)
 */
async function saveNoteFromText(text, url = null) {
  try {
    const selectedText = text.trim();

    if (!selectedText) {
      console.log("No text to save");
      return;
    }

    const newNote = {
      id: crypto.randomUUID(),
      text: selectedText,
      url: url || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      index: 0,
    };

    await StorageHelper.addNote(newNote);
    console.log("Note saved:", selectedText.substring(0, 50) + "...");
  } catch (error) {
    console.error("Error saving note:", error);
    throw error;
  }
}
