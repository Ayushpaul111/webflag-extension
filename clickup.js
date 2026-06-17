/**
 * ClickUp API Client
 * Thin wrappers around the ClickUp REST API v2.
 *
 * Shared between the options page / popup (loaded via <script>) and the
 * background service worker (loaded via importScripts). Exposes a single
 * global `ClickUpAPI` object, mirroring the StorageHelper pattern.
 *
 * Auth uses a Personal API token (pk_...) passed straight in the
 * Authorization header. No OAuth, no backend.
 */
const ClickUpAPI = {
  BASE_URL: "https://api.clickup.com/api/v2",

  /**
   * Perform an authenticated request and return parsed JSON.
   * Throws an Error with a readable message on failure.
   * @param {string} token - ClickUp personal API token
   * @param {string} path - Path beginning with "/" (relative to BASE_URL)
   * @param {Object} [options] - { method, body }
   * @returns {Promise<Object>}
   */
  async request(token, path, options = {}) {
    if (!token) {
      throw new Error("Missing ClickUp API token.");
    }

    const { method = "GET", body } = options;

    let response;
    try {
      response = await fetch(`${this.BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkError) {
      throw new Error(
        "Could not reach ClickUp. Check your internet connection."
      );
    }

    let data = null;
    try {
      data = await response.json();
    } catch (parseError) {
      // Some responses (rare) may not be JSON
      data = null;
    }

    if (!response.ok) {
      // ClickUp returns { err: "...", ECODE: "..." } on errors
      const message =
        (data && (data.err || data.error)) ||
        `ClickUp request failed (HTTP ${response.status}).`;
      if (response.status === 401) {
        throw new Error("Invalid or expired ClickUp token.");
      }
      throw new Error(message);
    }

    return data || {};
  },

  /**
   * Get the user's workspaces (called "teams" in the API).
   * @param {string} token
   * @returns {Promise<Array>} [{ id, name, color }]
   */
  async getWorkspaces(token) {
    const data = await this.request(token, "/team");
    return data.teams || [];
  },

  /**
   * Get spaces in a workspace.
   * @param {string} token
   * @param {string} workspaceId
   * @returns {Promise<Array>} [{ id, name }]
   */
  async getSpaces(token, workspaceId) {
    const data = await this.request(
      token,
      `/team/${workspaceId}/space?archived=false`
    );
    return data.spaces || [];
  },

  /**
   * Get folders in a space.
   * @param {string} token
   * @param {string} spaceId
   * @returns {Promise<Array>} [{ id, name }]
   */
  async getFolders(token, spaceId) {
    const data = await this.request(
      token,
      `/space/${spaceId}/folder?archived=false`
    );
    return data.folders || [];
  },

  /**
   * Get lists inside a folder.
   * @param {string} token
   * @param {string} folderId
   * @returns {Promise<Array>} [{ id, name }]
   */
  async getFolderLists(token, folderId) {
    const data = await this.request(
      token,
      `/folder/${folderId}/list?archived=false`
    );
    return data.lists || [];
  },

  /**
   * Get folderless lists directly under a space.
   * @param {string} token
   * @param {string} spaceId
   * @returns {Promise<Array>} [{ id, name }]
   */
  async getSpaceLists(token, spaceId) {
    const data = await this.request(
      token,
      `/space/${spaceId}/list?archived=false`
    );
    return data.lists || [];
  },

  /**
   * Get tasks in a list (used to pick an existing parent task).
   * @param {string} token
   * @param {string} listId
   * @returns {Promise<Array>} [{ id, name, url }]
   */
  async getTasks(token, listId) {
    const data = await this.request(
      token,
      `/list/${listId}/task?archived=false&subtasks=false`
    );
    return data.tasks || [];
  },

  /**
   * Create a task (or subtask when `parent` is provided) in a list.
   * @param {string} token
   * @param {string} listId
   * @param {Object} task - { name, description, parent }
   * @returns {Promise<Object>} The created task { id, name, url, ... }
   */
  async createTask(token, listId, task) {
    const body = { name: task.name };
    if (task.description) body.description = task.description;
    if (task.parent) body.parent = task.parent;

    return this.request(token, `/list/${listId}/task`, {
      method: "POST",
      body,
    });
  },

  /**
   * Upload a file attachment to a task (used for bug-report screenshots).
   * Uses multipart/form-data, so it can't go through `request()` (which sends
   * JSON). The browser sets the multipart boundary header automatically when
   * given a FormData body — do NOT set Content-Type manually.
   * @param {string} token
   * @param {string} taskId
   * @param {Blob} blob - File contents
   * @param {string} filename
   * @returns {Promise<Object>} The created attachment metadata
   */
  async uploadAttachment(token, taskId, blob, filename) {
    if (!token) throw new Error("Missing ClickUp API token.");

    const form = new FormData();
    form.append("attachment", blob, filename);

    let response;
    try {
      response = await fetch(`${this.BASE_URL}/task/${taskId}/attachment`, {
        method: "POST",
        headers: { Authorization: token },
        body: form,
      });
    } catch (networkError) {
      throw new Error("Could not reach ClickUp to upload the screenshot.");
    }

    if (!response.ok) {
      let data = null;
      try {
        data = await response.json();
      } catch (e) {
        data = null;
      }
      const message =
        (data && (data.err || data.error)) ||
        `Attachment upload failed (HTTP ${response.status}).`;
      throw new Error(message);
    }

    try {
      return await response.json();
    } catch (e) {
      return {};
    }
  },
};

// Make available to importScripts (service worker) and module-less pages.
if (typeof self !== "undefined") {
  self.ClickUpAPI = ClickUpAPI;
}
