/**
 * Storage Helper - Manages all Chrome storage operations for notes
 * Uses chrome.storage.local API with async/await pattern
 */
const StorageHelper = {
  STORAGE_KEY: "notes",

  /**
   * Get all notes from storage
   * @returns {Promise<Array>} Array of note objects
   */
  async getAllNotes() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      return result[this.STORAGE_KEY] || [];
    } catch (error) {
      console.error("Error getting notes:", error);
      return [];
    }
  },

  /**
   * Save all notes to storage
   * @param {Array} notes - Array of note objects
   * @returns {Promise<void>}
   */
  async saveAllNotes(notes) {
    try {
      await chrome.storage.local.set({ [this.STORAGE_KEY]: notes });
    } catch (error) {
      console.error("Error saving notes:", error);
      throw error;
    }
  },

  /**
   * Add a new note
   * @param {Object} note - Note object with id, text, url, createdAt, updatedAt
   * @returns {Promise<void>}
   */
  async addNote(note) {
    try {
      const notes = await this.getAllNotes();

      // Increment index for all existing notes
      notes.forEach((n) => n.index++);

      // Add new note at index 0 (top of list)
      note.index = 0;
      notes.unshift(note);

      await this.saveAllNotes(notes);
    } catch (error) {
      console.error("Error adding note:", error);
      throw error;
    }
  },

  /**
   * Update an existing note
   * @param {string} noteId - ID of note to update
   * @param {string} newText - Updated text content
   * @param {string} newUrl - Updated URL (optional)
   * @returns {Promise<void>}
   */
  async updateNote(noteId, newText, newUrl = undefined) {
    try {
      const notes = await this.getAllNotes();
      const noteIndex = notes.findIndex((n) => n.id === noteId);

      if (noteIndex !== -1) {
        notes[noteIndex].text = newText;
        if (newUrl !== undefined) {
          notes[noteIndex].url = newUrl || null;
        }
        notes[noteIndex].updatedAt = Date.now();
        await this.saveAllNotes(notes);
      }
    } catch (error) {
      console.error("Error updating note:", error);
      throw error;
    }
  },

  /**
   * Delete a note
   * @param {string} noteId - ID of note to delete
   * @returns {Promise<void>}
   */
  async deleteNote(noteId) {
    try {
      let notes = await this.getAllNotes();
      notes = notes.filter((n) => n.id !== noteId);

      // Re-index remaining notes
      notes.forEach((note, index) => {
        note.index = index;
      });

      await this.saveAllNotes(notes);
    } catch (error) {
      console.error("Error deleting note:", error);
      throw error;
    }
  },

  /**
   * Move a note up in the list (decrease index)
   * @param {string} noteId - ID of note to move
   * @returns {Promise<void>}
   */
  async moveNoteUp(noteId) {
    try {
      const notes = await this.getAllNotes();
      const currentIndex = notes.findIndex((n) => n.id === noteId);

      // Can't move up if already at top
      if (currentIndex <= 0) return;

      // Swap with previous note
      [notes[currentIndex], notes[currentIndex - 1]] = [
        notes[currentIndex - 1],
        notes[currentIndex],
      ];

      // Update indices
      notes.forEach((note, index) => {
        note.index = index;
      });

      await this.saveAllNotes(notes);
    } catch (error) {
      console.error("Error moving note up:", error);
      throw error;
    }
  },

  /**
   * Move a note down in the list (increase index)
   * @param {string} noteId - ID of note to move
   * @returns {Promise<void>}
   */
  async moveNoteDown(noteId) {
    try {
      const notes = await this.getAllNotes();
      const currentIndex = notes.findIndex((n) => n.id === noteId);

      // Can't move down if already at bottom
      if (currentIndex === -1 || currentIndex >= notes.length - 1) return;

      // Swap with next note
      [notes[currentIndex], notes[currentIndex + 1]] = [
        notes[currentIndex + 1],
        notes[currentIndex],
      ];

      // Update indices
      notes.forEach((note, index) => {
        note.index = index;
      });

      await this.saveAllNotes(notes);
    } catch (error) {
      console.error("Error moving note down:", error);
      throw error;
    }
  },
};
