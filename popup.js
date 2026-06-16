/**
 * Popup UI Controller
 * Modern, clean interface for note management
 */

// DOM Elements
const newNoteInput = document.getElementById("newNoteInput");
const newNoteUrl = document.getElementById("newNoteUrl");
const addNoteBtn = document.getElementById("addNoteBtn");
const notesList = document.getElementById("notesList");
const emptyState = document.getElementById("emptyState");
const extensionToggle = document.getElementById("extensionToggle");
const settingsBtn = document.getElementById("settingsBtn");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");
const toastAction = document.getElementById("toastAction");

// Initialize popup
document.addEventListener("DOMContentLoaded", async () => {
  await loadToggleState();
  await loadAndRenderNotes();
  setupEventListeners();
});

/**
 * Load toggle state from storage
 */
async function loadToggleState() {
  try {
    const result = await chrome.storage.local.get("extensionEnabled");
    const isEnabled = result.extensionEnabled !== false; // Default to true
    extensionToggle.checked = isEnabled;
  } catch (error) {
    console.error("Error loading toggle state:", error);
    extensionToggle.checked = true;
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Add note button click
  addNoteBtn.addEventListener("click", handleAddNote);

  // Add note on Enter key (Shift+Enter for new line)
  newNoteInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddNote();
    }
  });

  // Auto-resize textarea
  newNoteInput.addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  });

  // Toggle switch handler
  extensionToggle.addEventListener("change", handleToggleChange);

  // Open ClickUp settings / onboarding page
  settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

let toastTimer = null;

/**
 * Show a transient toast message at the top of the popup.
 * @param {string} message
 * @param {string} type - "success" | "error" | "info"
 * @param {Object} [action] - { label, onClick }
 */
function showToast(message, type = "info", action = null) {
  clearTimeout(toastTimer);
  toastMessage.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.style.display = "flex";

  if (action) {
    toastAction.textContent = action.label;
    toastAction.style.display = "inline-block";
    toastAction.onclick = action.onClick;
  } else {
    toastAction.style.display = "none";
    toastAction.onclick = null;
  }

  // Auto-hide (longer when there's an action to click)
  toastTimer = setTimeout(
    () => {
      toast.style.display = "none";
    },
    action ? 6000 : 3000
  );
}

/**
 * Handle toggle switch change
 */
async function handleToggleChange(e) {
  const isEnabled = e.target.checked;

  try {
    await chrome.storage.local.set({ extensionEnabled: isEnabled });

    // Send message to all tabs to update their state
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "toggleExtension",
          enabled: isEnabled,
        })
        .catch(() => {
          // Ignore errors for tabs that don't have content script
        });
    });
  } catch (error) {
    console.error("Error saving toggle state:", error);
  }
}

/**
 * Load notes from storage and render them
 */
async function loadAndRenderNotes() {
  try {
    const notes = await StorageHelper.getAllNotes();
    renderNotes(notes);
  } catch (error) {
    console.error("Error loading notes:", error);
  }
}

/**
 * Render all notes in the UI
 * @param {Array} notes - Array of note objects
 */
function renderNotes(notes) {
  // Clear current notes
  notesList.innerHTML = "";

  // Show empty state if no notes
  if (notes.length === 0) {
    emptyState.style.display = "flex";
    notesList.style.display = "none";
    return;
  }

  emptyState.style.display = "none";
  notesList.style.display = "block";

  // Render each note with staggered animation
  notes.forEach((note, index) => {
    const noteElement = createNoteElement(note, index, notes.length);
    noteElement.style.animationDelay = `${index * 0.03}s`;
    notesList.appendChild(noteElement);
  });
}

/**
 * Create a note element
 * @param {Object} note - Note object
 * @param {number} index - Current index in list
 * @param {number} totalNotes - Total number of notes
 * @returns {HTMLElement} Note element
 */
function createNoteElement(note, index, totalNotes) {
  const noteCard = document.createElement("div");
  noteCard.className = "note-card";
  noteCard.dataset.noteId = note.id;

  // Truncate text to 150 characters
  const displayText =
    note.text.length > 150 ? note.text.substring(0, 150) + "..." : note.text;

  // Format date
  const dateStr = formatDate(note.createdAt);

  // URL section
  const urlSection = note.url
    ? `
    <a href="${escapeHtml(
      note.url
    )}" target="_blank" class="note-link-badge" title="${escapeHtml(note.url)}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
      </svg>
      Open link
    </a>
  `
    : "";

  // ClickUp synced badge (shown once a note has been pushed)
  const clickupSection = note.clickupTaskId
    ? `
    <a href="${escapeHtml(note.clickupTaskUrl || "#")}" target="_blank"
       class="note-clickup-badge" title="Open subtask in ClickUp">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      In ClickUp
    </a>
  `
    : "";

  noteCard.innerHTML = `
    <div class="note-header">
      <div class="note-meta">${dateStr}</div>
      <div class="note-actions">
        <div class="note-reorder">
          <button class="reorder-btn btn-up" title="Move up" data-action="up" ${
            index === 0 ? "disabled" : ""
          }>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
          <button class="reorder-btn btn-down" title="Move down" data-action="down" ${
            index === totalNotes - 1 ? "disabled" : ""
          }>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
        <button class="note-action-btn clickup ${
          note.clickupTaskId ? "synced" : ""
        }" title="${
    note.clickupTaskId ? "Synced — send again to ClickUp" : "Send to ClickUp"
  }" data-action="clickup">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
        </button>
        <button class="note-action-btn" title="Edit" data-action="edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="note-action-btn delete" title="Delete" data-action="delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
    <div class="note-text">${escapeHtml(displayText)}</div>
    <div class="note-badges">${urlSection}${clickupSection}</div>
  `;

  // Add event listeners
  noteCard
    .querySelector('[data-action="clickup"]')
    .addEventListener("click", (e) => {
      e.stopPropagation();
      handleSendToClickUp(note, e.currentTarget);
    });
  noteCard
    .querySelector('[data-action="edit"]')
    .addEventListener("click", (e) => {
      e.stopPropagation();
      handleEdit(note);
    });
  noteCard
    .querySelector('[data-action="delete"]')
    .addEventListener("click", (e) => {
      e.stopPropagation();
      handleDelete(note.id);
    });
  noteCard
    .querySelector('[data-action="up"]')
    .addEventListener("click", (e) => {
      e.stopPropagation();
      handleMoveUp(note.id);
    });
  noteCard
    .querySelector('[data-action="down"]')
    .addEventListener("click", (e) => {
      e.stopPropagation();
      handleMoveDown(note.id);
    });

  return noteCard;
}

/**
 * Handle adding a new note
 */
async function handleAddNote() {
  const text = newNoteInput.value.trim();
  const url = newNoteUrl.value.trim();

  if (!text) {
    // Add shake animation to input
    newNoteInput.classList.add("shake");
    setTimeout(() => {
      newNoteInput.classList.remove("shake");
    }, 300);
    newNoteInput.focus();
    return;
  }

  // Validate URL if provided
  if (url && !isValidUrl(url)) {
    newNoteUrl.classList.add("shake");
    newNoteUrl.style.borderColor = "#dc3545";
    setTimeout(() => {
      newNoteUrl.classList.remove("shake");
      newNoteUrl.style.borderColor = "";
    }, 300);
    return;
  }

  try {
    const newNote = {
      id: crypto.randomUUID(),
      text: text,
      url: url || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      index: 0,
    };

    await StorageHelper.addNote(newNote);

    // Add success feedback
    const originalText = addNoteBtn.innerHTML;
    addNoteBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>Added!</span>
    `;
    addNoteBtn.style.background = "#10b981";

    setTimeout(() => {
      addNoteBtn.innerHTML = originalText;
      addNoteBtn.style.background = "";
    }, 1200);

    newNoteInput.value = "";
    newNoteUrl.value = "";
    newNoteInput.style.height = "auto";
    await loadAndRenderNotes();
    newNoteInput.focus();
  } catch (error) {
    console.error("Error adding note:", error);
    alert("Failed to add note. Please try again.");
  }
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handle editing a note
 * @param {Object} note - Note to edit
 */
async function handleEdit(note) {
  const noteElement = document.querySelector(`[data-note-id="${note.id}"]`);

  // Store original content
  const originalContent = noteElement.innerHTML;

  // Create edit form
  const editForm = document.createElement("div");
  editForm.className = "note-edit-form";
  editForm.innerHTML = `
    <textarea class="edit-textarea">${escapeHtml(note.text)}</textarea>
    <input type="url" class="edit-url-input" placeholder="🔗 Add or edit link" value="${escapeHtml(
      note.url || ""
    )}">
    <div class="edit-actions">
      <button class="btn-cancel">Cancel</button>
      <button class="btn-save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Save
      </button>
    </div>
  `;

  // Replace content with edit form
  noteElement.innerHTML = "";
  noteElement.appendChild(editForm);

  const textarea = editForm.querySelector(".edit-textarea");
  const urlInput = editForm.querySelector(".edit-url-input");
  const saveBtn = editForm.querySelector(".btn-save");
  const cancelBtn = editForm.querySelector(".btn-cancel");

  // Focus textarea and select all
  textarea.focus();
  textarea.select();

  // Auto-resize textarea
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
  textarea.addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  });

  // Save handler
  saveBtn.addEventListener("click", async () => {
    const newText = textarea.value.trim();
    const newUrl = urlInput.value.trim();

    if (!newText) {
      textarea.classList.add("shake");
      setTimeout(() => {
        textarea.classList.remove("shake");
      }, 300);
      return;
    }

    // Validate URL if provided
    if (newUrl && !isValidUrl(newUrl)) {
      urlInput.classList.add("shake");
      urlInput.style.borderColor = "#dc3545";
      setTimeout(() => {
        urlInput.classList.remove("shake");
        urlInput.style.borderColor = "";
      }, 300);
      return;
    }

    try {
      await StorageHelper.updateNote(note.id, newText, newUrl || null);
      await loadAndRenderNotes();
    } catch (error) {
      console.error("Error updating note:", error);
      alert("Failed to update note. Please try again.");
    }
  });

  // Cancel handler
  cancelBtn.addEventListener("click", () => {
    noteElement.innerHTML = originalContent;
    // Re-attach event listeners
    setupNoteEventListeners(noteElement, note);
  });

  // Save on Ctrl+Enter or Cmd+Enter
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      saveBtn.click();
    }
    if (e.key === "Escape") {
      cancelBtn.click();
    }
  });
}

/**
 * Setup event listeners for a note element
 */
function setupNoteEventListeners(noteElement, note) {
  noteElement
    .querySelector('[data-action="clickup"]')
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      handleSendToClickUp(note, e.currentTarget);
    });
  noteElement
    .querySelector('[data-action="edit"]')
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      handleEdit(note);
    });
  noteElement
    .querySelector('[data-action="delete"]')
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDelete(note.id);
    });
  noteElement
    .querySelector('[data-action="up"]')
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      handleMoveUp(note.id);
    });
  noteElement
    .querySelector('[data-action="down"]')
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      handleMoveDown(note.id);
    });
}

/**
 * Send a note to ClickUp as a subtask of the configured parent task.
 * @param {Object} note - Note object
 * @param {HTMLElement} buttonEl - The clicked ClickUp button
 */
async function handleSendToClickUp(note, buttonEl) {
  // Show a loading spinner on the button
  const originalHtml = buttonEl.innerHTML;
  buttonEl.disabled = true;
  buttonEl.classList.add("sending");
  buttonEl.innerHTML = `
    <svg class="btn-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
  `;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "sendNoteToClickUp",
      note,
    });

    if (response && response.success) {
      await StorageHelper.setNoteClickUpInfo(note.id, {
        taskId: response.taskId,
        taskUrl: response.taskUrl,
      });
      showToast("Sent to ClickUp ✓", "success");
      await loadAndRenderNotes();
      return;
    }

    if (response && response.notConnected) {
      showToast("Connect ClickUp first to send notes.", "info", {
        label: "Open settings",
        onClick: () => chrome.runtime.openOptionsPage(),
      });
    } else {
      showToast(
        `Couldn't send: ${(response && response.error) || "unknown error"}`,
        "error"
      );
    }
  } catch (error) {
    console.error("Error sending to ClickUp:", error);
    showToast("Failed to send to ClickUp. Please try again.", "error");
  } finally {
    // Restore button (only matters when we didn't re-render)
    buttonEl.disabled = false;
    buttonEl.classList.remove("sending");
    buttonEl.innerHTML = originalHtml;
  }
}

/**
 * Handle deleting a note
 * @param {string} noteId - ID of note to delete
 */
async function handleDelete(noteId) {
  const noteElement = document.querySelector(`[data-note-id="${noteId}"]`);

  // Add remove animation
  noteElement.classList.add("removing");

  // Wait for animation before deleting
  setTimeout(async () => {
    try {
      await StorageHelper.deleteNote(noteId);
      await loadAndRenderNotes();
    } catch (error) {
      console.error("Error deleting note:", error);
      noteElement.classList.remove("removing");
      alert("Failed to delete note. Please try again.");
    }
  }, 300);
}

/**
 * Handle moving note up
 * @param {string} noteId - ID of note to move
 */
async function handleMoveUp(noteId) {
  try {
    await StorageHelper.moveNoteUp(noteId);
    await loadAndRenderNotes();
  } catch (error) {
    console.error("Error moving note up:", error);
  }
}

/**
 * Handle moving note down
 * @param {string} noteId - ID of note to move
 */
async function handleMoveDown(noteId) {
  try {
    await StorageHelper.moveNoteDown(noteId);
    await loadAndRenderNotes();
  } catch (error) {
    console.error("Error moving note down:", error);
  }
}

/**
 * Format timestamp to readable date
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date string
 */
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
