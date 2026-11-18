// saveManager.js — Full localStorage save/load system
(function () {
  const STORAGE_KEY = 'chineseRPGSave';

  window.SaveManager = {
    /**
     * Save arbitrary data to localStorage.
     * @param {Object} data – must include playerName, currentChapter, currentSeqIndex,
     *                        completedObstacles, masteredVocab; timestamp is auto-set.
     */
    save(data) {
      try {
        data.timestamp = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn('[SaveManager] save failed:', e);
      }
    },

    /**
     * Load saved data.
     * @returns {Object|null} Parsed save data, or null if none / corrupt.
     */
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) {
        console.warn('[SaveManager] load failed:', e);
        return null;
      }
    },

    /**
     * @returns {boolean} Whether a save exists in localStorage.
     */
    hasSave() {
      try {
        return localStorage.getItem(STORAGE_KEY) !== null;
      } catch (e) {
        return false;
      }
    },

    /**
     * Remove saved data entirely.
     */
    clearSave() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn('[SaveManager] clearSave failed:', e);
      }
    },

    /**
     * Human-readable summary of the current save.
     * @returns {{ name: string, chapter: number, checkpoint: number, label: string }|null}
     */
    getSaveInfo() {
      const data = this.load();
      if (!data) return null;
      return {
        name: data.playerName || 'Traveler',
        chapter: data.currentChapter || 1,
        checkpoint: data.currentSeqIndex || 0,
        label:
          (data.playerName || 'Traveler') +
          ' — Chapter ' +
          (data.currentChapter || 1) +
          ', Checkpoint ' +
          (data.currentSeqIndex || 0)
      };
    },

    /**
     * Convenience: build and persist a full checkpoint in one call.
     * @param {string}   playerName
     * @param {number}   chapter          1–3
     * @param {number}   seqIndex         exact position in the chapter's sequence array
     * @param {string[]} completedObstacles  array of obstacle IDs already cleared
     * @param {string[]} masteredVocab       array of vocab IDs the player has written
     */
    saveCheckpoint(playerName, chapter, seqIndex, completedObstacles, masteredVocab) {
      this.save({
        playerName: playerName || 'Traveler',
        currentChapter: chapter,
        currentSeqIndex: seqIndex,
        completedObstacles: completedObstacles || [],
        masteredVocab: masteredVocab || [],
        timestamp: Date.now()
      });
    }
  };
})();
