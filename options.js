/**
 * Options / Onboarding controller.
 * Captures the ClickUp token, walks the user through Workspace → Space →
 * Folder → List, lets them create or pick a parent task, and saves the
 * connection. Doubles as the ongoing settings page (prefills on reopen).
 *
 * All ClickUp calls run directly here (extension page has host permission).
 */

// Module state
let currentToken = "";

// DOM elements
const el = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  attachListeners();
  prefillFromSavedConfig();
});

function cacheElements() {
  el.tokenInput = document.getElementById("tokenInput");
  el.verifyBtn = document.getElementById("verifyBtn");
  el.tokenStatus = document.getElementById("tokenStatus");

  el.destinationCard = document.getElementById("destinationCard");
  el.workspaceSelect = document.getElementById("workspaceSelect");
  el.spaceSelect = document.getElementById("spaceSelect");
  el.folderSelect = document.getElementById("folderSelect");
  el.listSelect = document.getElementById("listSelect");

  el.parentCard = document.getElementById("parentCard");
  el.newTaskNameInput = document.getElementById("newTaskNameInput");
  el.existingTaskSelect = document.getElementById("existingTaskSelect");

  el.saveBtn = document.getElementById("saveBtn");
  el.disconnectBtn = document.getElementById("disconnectBtn");
  el.saveStatus = document.getElementById("saveStatus");
}

function attachListeners() {
  el.verifyBtn.addEventListener("click", handleVerify);
  el.tokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleVerify();
  });

  el.workspaceSelect.addEventListener("change", onWorkspaceChange);
  el.spaceSelect.addEventListener("change", onSpaceChange);
  el.folderSelect.addEventListener("change", onFolderChange);
  el.listSelect.addEventListener("change", onListChange);

  document.querySelectorAll('input[name="parentMode"]').forEach((radio) => {
    radio.addEventListener("change", onParentModeChange);
  });
  el.newTaskNameInput.addEventListener("input", updateSaveEnabled);
  el.existingTaskSelect.addEventListener("change", updateSaveEnabled);

  el.saveBtn.addEventListener("click", handleSave);
  el.disconnectBtn.addEventListener("click", handleDisconnect);
}

/* ---------- Status helpers ---------- */

function setStatus(node, type, html) {
  node.style.display = "block";
  node.className =
    node === el.saveStatus ? `status status-block ${type}` : `status ${type}`;
  node.innerHTML = html;
}

function clearStatus(node) {
  node.style.display = "none";
  node.innerHTML = "";
}

/* ---------- Select helpers ---------- */

function fillSelect(select, items, placeholder, getValue, getLabel) {
  select.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder;
  select.appendChild(ph);
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = getValue(item);
    opt.textContent = getLabel(item);
    select.appendChild(opt);
  });
}

function resetSelect(select, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  select.disabled = true;
}

function selectedLabel(select) {
  const opt = select.options[select.selectedIndex];
  return opt ? opt.textContent : "";
}

/* ---------- Step 1: token ---------- */

async function handleVerify() {
  const token = el.tokenInput.value.trim();
  if (!token) {
    setStatus(el.tokenStatus, "error", "Please paste your API token.");
    return;
  }

  el.verifyBtn.disabled = true;
  setStatus(el.tokenStatus, "info", `<span class="spinner"></span>Verifying…`);

  try {
    const workspaces = await ClickUpAPI.getWorkspaces(token);
    currentToken = token;

    if (!workspaces.length) {
      setStatus(
        el.tokenStatus,
        "error",
        "Token works, but no workspaces were found on this account."
      );
      el.verifyBtn.disabled = false;
      return;
    }

    fillSelect(
      el.workspaceSelect,
      workspaces,
      "Select a workspace…",
      (w) => w.id,
      (w) => w.name
    );
    el.workspaceSelect.disabled = false;
    el.destinationCard.classList.remove("disabled");
    setStatus(
      el.tokenStatus,
      "success",
      `✓ Connected. Found ${workspaces.length} workspace(s).`
    );
  } catch (error) {
    setStatus(el.tokenStatus, "error", `✕ ${error.message}`);
  } finally {
    el.verifyBtn.disabled = false;
  }
}

/* ---------- Step 2: destination ---------- */

async function onWorkspaceChange() {
  resetSelect(el.spaceSelect, "Select a space…");
  resetSelect(el.folderSelect, "— No folder (folderless lists) —");
  resetSelect(el.listSelect, "Select a list…");
  el.parentCard.classList.add("disabled");
  updateSaveEnabled();

  const workspaceId = el.workspaceSelect.value;
  if (!workspaceId) return;

  try {
    const spaces = await ClickUpAPI.getSpaces(currentToken, workspaceId);
    fillSelect(
      el.spaceSelect,
      spaces,
      "Select a space…",
      (s) => s.id,
      (s) => s.name
    );
    el.spaceSelect.disabled = false;
  } catch (error) {
    setStatus(el.tokenStatus, "error", `✕ ${error.message}`);
  }
}

async function onSpaceChange() {
  resetSelect(el.folderSelect, "— No folder (folderless lists) —");
  resetSelect(el.listSelect, "Select a list…");
  el.parentCard.classList.add("disabled");
  updateSaveEnabled();

  const spaceId = el.spaceSelect.value;
  if (!spaceId) return;

  try {
    const folders = await ClickUpAPI.getFolders(currentToken, spaceId);
    // Folder dropdown keeps a "no folder" default for folderless lists.
    el.folderSelect.innerHTML =
      '<option value="">— No folder (folderless lists) —</option>';
    folders.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.name;
      el.folderSelect.appendChild(opt);
    });
    el.folderSelect.disabled = false;

    // Default to folderless lists for this space.
    await loadListsForCurrentSelection();
  } catch (error) {
    setStatus(el.tokenStatus, "error", `✕ ${error.message}`);
  }
}

async function onFolderChange() {
  resetSelect(el.listSelect, "Select a list…");
  el.parentCard.classList.add("disabled");
  updateSaveEnabled();
  await loadListsForCurrentSelection();
}

async function loadListsForCurrentSelection() {
  const folderId = el.folderSelect.value;
  const spaceId = el.spaceSelect.value;
  if (!spaceId) return;

  try {
    const lists = folderId
      ? await ClickUpAPI.getFolderLists(currentToken, folderId)
      : await ClickUpAPI.getSpaceLists(currentToken, spaceId);
    fillSelect(
      el.listSelect,
      lists,
      "Select a list…",
      (l) => l.id,
      (l) => l.name
    );
    el.listSelect.disabled = false;
  } catch (error) {
    setStatus(el.tokenStatus, "error", `✕ ${error.message}`);
  }
}

async function onListChange() {
  el.parentCard.classList.add("disabled");
  resetSelect(el.existingTaskSelect, "Select a task…");
  updateSaveEnabled();

  const listId = el.listSelect.value;
  if (!listId) return;

  // Enable the parent-task step and load existing tasks for the picker.
  el.parentCard.classList.remove("disabled");

  try {
    const tasks = await ClickUpAPI.getTasks(currentToken, listId);
    fillSelect(
      el.existingTaskSelect,
      tasks,
      tasks.length ? "Select a task…" : "No tasks in this list",
      (t) => t.id,
      (t) => t.name
    );
    el.existingTaskSelect.disabled = !isExistingMode();
  } catch (error) {
    setStatus(el.tokenStatus, "error", `✕ ${error.message}`);
  }

  onParentModeChange();
}

/* ---------- Step 3: parent task ---------- */

function isExistingMode() {
  const checked = document.querySelector('input[name="parentMode"]:checked');
  return checked && checked.value === "existing";
}

function onParentModeChange() {
  const existing = isExistingMode();
  el.existingTaskSelect.disabled = !existing || !el.listSelect.value;
  el.newTaskNameInput.disabled = existing;
  updateSaveEnabled();
}

function updateSaveEnabled() {
  const hasList = !!el.listSelect.value;
  const ready =
    hasList &&
    (isExistingMode()
      ? !!el.existingTaskSelect.value
      : !!el.newTaskNameInput.value.trim());
  el.saveBtn.disabled = !ready;
}

/* ---------- Save / disconnect ---------- */

async function handleSave() {
  el.saveBtn.disabled = true;
  setStatus(el.saveStatus, "info", `<span class="spinner"></span>Saving…`);

  try {
    let parentTaskId;
    let parentTaskName;

    if (isExistingMode()) {
      parentTaskId = el.existingTaskSelect.value;
      parentTaskName = selectedLabel(el.existingTaskSelect);
    } else {
      // Create the parent task (no `parent` => top-level task).
      const name = el.newTaskNameInput.value.trim();
      const created = await ClickUpAPI.createTask(
        currentToken,
        el.listSelect.value,
        { name }
      );
      parentTaskId = created.id;
      parentTaskName = name;
    }

    const config = {
      token: currentToken,
      workspaceId: el.workspaceSelect.value,
      workspaceName: selectedLabel(el.workspaceSelect),
      spaceId: el.spaceSelect.value,
      spaceName: selectedLabel(el.spaceSelect),
      folderId: el.folderSelect.value || null,
      folderName: el.folderSelect.value ? selectedLabel(el.folderSelect) : null,
      listId: el.listSelect.value,
      listName: selectedLabel(el.listSelect),
      parentTaskId,
      parentTaskName,
    };

    await ClickUpConfig.save(config);

    setStatus(
      el.saveStatus,
      "success",
      `✓ Connected! Notes will be added as subtasks of <strong>${escapeHtml(
        parentTaskName
      )}</strong> in <strong>${escapeHtml(config.listName)}</strong>.`
    );
    el.disconnectBtn.style.display = "inline-block";
  } catch (error) {
    setStatus(el.saveStatus, "error", `✕ ${error.message}`);
  } finally {
    el.saveBtn.disabled = false;
  }
}

async function handleDisconnect() {
  await ClickUpConfig.clear();
  currentToken = "";
  el.tokenInput.value = "";
  clearStatus(el.tokenStatus);
  clearStatus(el.saveStatus);

  resetSelect(el.workspaceSelect, "Select a workspace…");
  resetSelect(el.spaceSelect, "Select a space…");
  resetSelect(el.folderSelect, "— No folder (folderless lists) —");
  resetSelect(el.listSelect, "Select a list…");
  resetSelect(el.existingTaskSelect, "Select a task…");
  el.newTaskNameInput.value = "";
  el.destinationCard.classList.add("disabled");
  el.parentCard.classList.add("disabled");
  el.disconnectBtn.style.display = "none";
  el.saveBtn.disabled = true;
}

/* ---------- Prefill on reopen (settings mode) ---------- */

async function prefillFromSavedConfig() {
  const config = await ClickUpConfig.get();
  if (!config || !config.token) return;

  el.tokenInput.value = config.token;
  currentToken = config.token;

  try {
    // Step 1
    const workspaces = await ClickUpAPI.getWorkspaces(config.token);
    fillSelect(
      el.workspaceSelect,
      workspaces,
      "Select a workspace…",
      (w) => w.id,
      (w) => w.name
    );
    el.workspaceSelect.disabled = false;
    el.destinationCard.classList.remove("disabled");
    setStatus(el.tokenStatus, "success", "✓ Connected.");

    if (!config.workspaceId) return;
    el.workspaceSelect.value = config.workspaceId;

    // Step 2: spaces
    const spaces = await ClickUpAPI.getSpaces(config.token, config.workspaceId);
    fillSelect(
      el.spaceSelect,
      spaces,
      "Select a space…",
      (s) => s.id,
      (s) => s.name
    );
    el.spaceSelect.disabled = false;
    if (!config.spaceId) return;
    el.spaceSelect.value = config.spaceId;

    // Folders
    const folders = await ClickUpAPI.getFolders(config.token, config.spaceId);
    el.folderSelect.innerHTML =
      '<option value="">— No folder (folderless lists) —</option>';
    folders.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.name;
      el.folderSelect.appendChild(opt);
    });
    el.folderSelect.disabled = false;
    el.folderSelect.value = config.folderId || "";

    // Lists
    const lists = config.folderId
      ? await ClickUpAPI.getFolderLists(config.token, config.folderId)
      : await ClickUpAPI.getSpaceLists(config.token, config.spaceId);
    fillSelect(
      el.listSelect,
      lists,
      "Select a list…",
      (l) => l.id,
      (l) => l.name
    );
    el.listSelect.disabled = false;
    if (!config.listId) return;
    el.listSelect.value = config.listId;

    // Step 3: parent task — default to "use existing" with the saved one.
    el.parentCard.classList.remove("disabled");
    const tasks = await ClickUpAPI.getTasks(config.token, config.listId);
    fillSelect(
      el.existingTaskSelect,
      tasks,
      "Select a task…",
      (t) => t.id,
      (t) => t.name
    );

    const existingRadio = document.querySelector(
      'input[name="parentMode"][value="existing"]'
    );
    if (existingRadio) existingRadio.checked = true;

    // The saved parent task may or may not be in the (paginated) list result.
    if (![...el.existingTaskSelect.options].some((o) => o.value === config.parentTaskId)) {
      const opt = document.createElement("option");
      opt.value = config.parentTaskId;
      opt.textContent = config.parentTaskName || "(saved task)";
      el.existingTaskSelect.appendChild(opt);
    }
    el.existingTaskSelect.value = config.parentTaskId;
    el.existingTaskSelect.disabled = false;

    el.disconnectBtn.style.display = "inline-block";
    updateSaveEnabled();
  } catch (error) {
    setStatus(
      el.tokenStatus,
      "error",
      `Saved token could not be verified: ${error.message}`
    );
  }
}

/* ---------- Util ---------- */

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : text;
  return div.innerHTML;
}
