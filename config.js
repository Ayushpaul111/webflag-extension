/**
 * ClickUp Config Helper
 * Reads/writes the user's ClickUp connection settings in chrome.storage.local.
 *
 * Shared between the options page, popup, and background service worker.
 * Exposes a single global `ClickUpConfig` object.
 *
 * Stored shape (key: "clickupConfig"):
 * {
 *   token,
 *   workspaceId, workspaceName,
 *   spaceId, spaceName,
 *   folderId | null, folderName | null,
 *   listId, listName,
 *   parentTaskId, parentTaskName
 * }
 */
const ClickUpConfig = {
  STORAGE_KEY: "clickupConfig",

  /**
   * Get the saved config, or null if nothing is stored.
   * @returns {Promise<Object|null>}
   */
  async get() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      return result[this.STORAGE_KEY] || null;
    } catch (error) {
      console.error("Error reading ClickUp config:", error);
      return null;
    }
  },

  /**
   * Persist the config.
   * @param {Object} config
   * @returns {Promise<void>}
   */
  async save(config) {
    try {
      await chrome.storage.local.set({ [this.STORAGE_KEY]: config });
    } catch (error) {
      console.error("Error saving ClickUp config:", error);
      throw error;
    }
  },

  /**
   * Remove the saved config (disconnect).
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await chrome.storage.local.remove(this.STORAGE_KEY);
    } catch (error) {
      console.error("Error clearing ClickUp config:", error);
      throw error;
    }
  },

  /**
   * Whether the user has a usable connection (token + destination + parent).
   * @returns {Promise<boolean>}
   */
  async isConnected() {
    const config = await this.get();
    return !!(config && config.token && config.listId && config.parentTaskId);
  },
};

// Make available to importScripts (service worker) and module-less pages.
if (typeof self !== "undefined") {
  self.ClickUpConfig = ClickUpConfig;
}
