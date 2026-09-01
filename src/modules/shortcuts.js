/**
 * Keyboard Shortcut System for ADOFAI Editor
 * Handles all keyboard shortcuts for tile placement, event insertion, and selection
 */

export class KeyboardShortcutManager {
  constructor(app) {
    this.app = app;
    this.backtickPressed = false;
  }

  /**
   * Initialize keyboard shortcuts
   */
  init() {
    document.addEventListener("keydown", (e) => this.handleKeyDown(e));
    document.addEventListener("keyup", (e) => this.handleKeyUp(e));
  }

  /**
   * Handle keyup events
   */
  handleKeyUp(e) {
    // Track backtick state for combined shortcuts
    if (e.key === "`") {
      this.backtickPressed = false;
    }
  }

  /**
   * Main keydown handler
   */
  handleKeyDown(e) {
    // Don't process shortcuts when in editing field
    const target = e.target;
    const isEditingField =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;

    if (isEditingField && !this.isShortcutOverride(e)) {
      return;
    }

    // Track backtick for combined shortcuts
    if (e.key === "`") {
      this.backtickPressed = true;
      return;
    }

    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    // ===========================
    // TILE PLACEMENT SHORTCUTS
    // ===========================

    // Basic tiles: w, a, s, d, e, q, z, c
    if (!ctrl && !shift && !alt && !isEditingField) {
      const tileShortcuts = {
        w: 90, // 90 degrees
        a: 180, // 180 degrees
        s: 270, // 270 degrees
        d: 0, // 0 degrees
        e: 45, // 45 degrees
        q: 135, // 135 degrees
        z: 225, // 225 degrees
        c: 315, // 315 degrees
      };

      if (tileShortcuts[key] !== undefined) {
        e.preventDefault();
        this.placeTile(tileShortcuts[key]);
        return;
      }
    }

    // H/J shortcuts for medium angles (no shift needed)
    if (!ctrl && !shift && !alt && !isEditingField) {
      const mediumTileShortcuts = {
        h: 150, // 150 degrees
        j: 30, // 30 degrees
      };

      if (mediumTileShortcuts[key] !== undefined) {
        e.preventDefault();
        this.placeTile(mediumTileShortcuts[key]);
        return;
      }
    }

    // Backtick + H/J for fine angles
    if (!ctrl && shift && !alt && !isEditingField) {
      if (this.backtickPressed) {
        const backquoteTileShortcuts = {
          h: 165, // 165 degrees
          j: 15, // 15 degrees
        };

        if (backquoteTileShortcuts[key] !== undefined) {
          e.preventDefault();
          this.placeTile(backquoteTileShortcuts[key]);
          this.backtickPressed = false;
          return;
        }
      }
    }

    // ===========================
    // TILE FLIPPING SHORTCUTS
    // ===========================

    // Ctrl+L: Flip horizontally (left-right)
    if (ctrl && !shift && key === "l" && !isEditingField) {
      e.preventDefault();
      this.flipSelectedTilesHorizontal();
      return;
    }

    // Ctrl+Shift+L: Flip vertically (up-down)
    if (ctrl && shift && key === "l" && !isEditingField) {
      e.preventDefault();
      this.flipSelectedTilesVertical();
      return;
    }

    // ===========================
    // EVENT SHORTCUTS
    // ===========================

    if (!ctrl && !shift && !alt && !isEditingField) {
      const eventShortcuts = {
        1: "SetSpeed", // 1: SetSpeed event
        2: "Twirl", // 2: Twirl event
        3: "Pause", // 3: Pause event
        4: "SetHitsound", // 4: SetHitsound event
      };

      if (eventShortcuts[key] !== undefined) {
        e.preventDefault();
        this.addEventToSelected(eventShortcuts[key]);
        return;
      }
    }

    // ===========================
    // NAVIGATION SHORTCUTS
    // ===========================

    // ArrowLeft: Select previous tile
    if (!ctrl && !shift && key === "arrowleft" && !isEditingField) {
      e.preventDefault();
      this.selectPreviousTile();
      return;
    }

    // ArrowRight: Select next tile
    if (!ctrl && !shift && key === "arrowright" && !isEditingField) {
      e.preventDefault();
      this.selectNextTile();
      return;
    }

    // Shift+ArrowLeft: Add previous tile to selection
    if (!ctrl && shift && key === "arrowleft" && !isEditingField) {
      e.preventDefault();
      this.extendSelectionBackward();
      return;
    }

    // Shift+ArrowRight: Add next tile to selection
    if (!ctrl && shift && key === "arrowright" && !isEditingField) {
      e.preventDefault();
      this.extendSelectionForward();
      return;
    }

    // ===========================
    // DELETION SHORTCUTS
    // ===========================

    // Backspace: Delete previous tile
    if (!ctrl && !shift && key === "backspace" && !isEditingField) {
      e.preventDefault();
      this.deletePreviousTile();
      return;
    }

    // Ctrl+Backspace: Delete all previous tiles
    if (ctrl && !shift && key === "backspace" && !isEditingField) {
      e.preventDefault();
      this.deleteAllPreviousTiles();
      return;
    }

    // Delete: Delete next tile
    if (!ctrl && !shift && key === "delete" && !isEditingField) {
      e.preventDefault();
      this.deleteNextTile();
      return;
    }

    // Ctrl+Delete: Delete all next tiles
    if (ctrl && !shift && key === "delete" && !isEditingField) {
      e.preventDefault();
      this.deleteAllNextTiles();
      return;
    }

    // ===========================
    // FILE SHORTCUTS
    // ===========================

    // Ctrl+O: Load Level
    if (ctrl && key === "o" && !isEditingField) {
      e.preventDefault();
      this.triggerLoadLevel();
      return;
    }

    // Ctrl+S: Download Level
    if (ctrl && key === "s" && !isEditingField) {
      e.preventDefault();
      this.triggerDownloadLevel();
      return;
    }

    // ===========================
    // UNDO/REDO SHORTCUTS
    // ===========================

    // Ctrl+Z: Undo
    if (ctrl && !shift && key === "z" && !isEditingField) {
      e.preventDefault();
      this.undo();
      return;
    }

    // Ctrl+Y: Redo
    if (ctrl && !shift && key === "y" && !isEditingField) {
      e.preventDefault();
      this.redo();
      return;
    }
  }

  /**
   * Check if this shortcut should override default behavior
   */
  isShortcutOverride(e) {
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // Allow these shortcuts to override browser defaults:
    // Ctrl+S (Save), Ctrl+O (Open), Ctrl+Z (Undo), Ctrl+Y (Redo)
    // Ctrl+L / Ctrl+Shift+L (Flip shortcuts)
    if (
      ctrl &&
      (key === "s" || key === "o" || key === "z" || key === "y" || key === "l")
    ) {
      return true;
    }

    // Backspace (Firefox: back button, some browsers: delete)
    if (key === "backspace") {
      return true;
    }

    // Delete
    if (key === "delete") {
      return true;
    }

    return false;
  }

  /**
   * Place a tile with the given angle
   */
  placeTile(angle) {
    if (!this.app || !this.app.addFloorAfterSelected) {
      return;
    }

    this.app.addFloorAfterSelected(angle);
  }

  /**
   * Flip selected tiles horizontally (mirror on vertical axis)
   * 180 - angle = horizontally flipped angle
   */
  flipSelectedTilesHorizontal() {
    if (!this.app || !this.app.state || !this.app.doc) {
      return;
    }

    const selectedIds = this.app.state.selectedFloorIds;
    if (selectedIds.size === 0) {
      return;
    }

    // For each selected tile, flip its angle horizontally
    for (const id of selectedIds) {
      const index = this.app.doc.indexOfId(id);
      if (index < 0) continue;

      const currentAngle = this.app.doc.angles[index];

      // Skip midspins (999)
      if (currentAngle === 999) continue;

      const angle = Number(currentAngle);
      if (!Number.isFinite(angle)) continue;

      // Horizontal flip: 180 - angle
      const normalizedAngle = (180 - angle + 360) % 360;
      this.app.doc.angles[index] = normalizedAngle;
    }

    this.app.rebuild();
  }

  /**
   * Flip selected tiles vertically (mirror on horizontal axis)
   * 360 - angle = vertically flipped angle (or -angle)
   */
  flipSelectedTilesVertical() {
    if (!this.app || !this.app.state || !this.app.doc) {
      return;
    }

    const selectedIds = this.app.state.selectedFloorIds;
    if (selectedIds.size === 0) {
      return;
    }

    // For each selected tile, flip its angle vertically
    for (const id of selectedIds) {
      const index = this.app.doc.indexOfId(id);
      if (index < 0) continue;

      const currentAngle = this.app.doc.angles[index];

      // Skip midspins (999)
      if (currentAngle === 999) continue;

      const angle = Number(currentAngle);
      if (!Number.isFinite(angle)) continue;

      // Vertical flip: 360 - angle (or -angle normalized to 0-360)
      const normalizedAngle = (360 - angle) % 360;
      this.app.doc.angles[index] = normalizedAngle === 0 ? 0 : normalizedAngle;
    }

    this.app.rebuild();
  }

  /**
   * Add an event to the currently selected tile
   */
  addEventToSelected(eventType) {
    if (!this.app || !this.app.addEventToSelected) {
      return;
    }

    // Use the EditorApp's own addEventToSelected method
    this.app.addEventToSelected(eventType);
  }

  /**
   * Trigger load level button click
   */
  triggerLoadLevel() {
    const button = document.getElementById("load-level-file-button");
    if (button) {
      button.click();
    }
  }

  /**
   * Trigger download level button click
   */
  triggerDownloadLevel() {
    const button = document.getElementById("download-level-button");
    if (button) {
      button.click();
    }
  }

  /**
   * Select the previous tile
   */
  selectPreviousTile() {
    if (!this.app || !this.app.state || !this.app.doc) {
      return;
    }

    const activeId = this.app.state.activeFloorId;
    if (!activeId) {
      // If no active tile, select first tile
      if (this.app.doc.ids.length > 0) {
        this.app.state.selectedFloorIds.clear();
        this.app.state.selectedFloorIds.add(this.app.doc.ids[0]);
        this.app.state.activeFloorId = this.app.doc.ids[0];
        this.app.rebuild();
      }
      return;
    }

    const index = this.app.doc.indexOfId(activeId);
    if (index <= 0) {
      return; // Already at first tile
    }

    const prevId = this.app.doc.ids[index - 1];
    if (prevId) {
      this.app.state.selectedFloorIds.clear();
      this.app.state.selectedFloorIds.add(prevId);
      this.app.state.activeFloorId = prevId;
      this.app.rebuild();
    }
  }

  /**
   * Select the next tile
   */
  selectNextTile() {
    if (!this.app || !this.app.state || !this.app.doc) {
      return;
    }

    const activeId = this.app.state.activeFloorId;
    if (!activeId) {
      // If no active tile, select first tile
      if (this.app.doc.ids.length > 0) {
        this.app.state.selectedFloorIds.clear();
        this.app.state.selectedFloorIds.add(this.app.doc.ids[0]);
        this.app.state.activeFloorId = this.app.doc.ids[0];
        this.app.rebuild();
      }
      return;
    }

    const index = this.app.doc.indexOfId(activeId);
    if (index < 0 || index >= this.app.doc.ids.length - 1) {
      return; // Already at last tile or not found
    }

    const nextId = this.app.doc.ids[index + 1];
    if (nextId) {
      this.app.state.selectedFloorIds.clear();
      this.app.state.selectedFloorIds.add(nextId);
      this.app.state.activeFloorId = nextId;
      this.app.rebuild();
    }
  }

  /**
   * Extend selection to include the next tile
   * Keeps existing selection and adds the next tile
   */
  extendSelectionForward() {
    if (!this.app || !this.app.state || !this.app.doc) {
      return;
    }

    const activeId = this.app.state.activeFloorId;
    if (!activeId) {
      // If no active tile, select first tile
      if (this.app.doc.ids.length > 0) {
        this.app.state.selectedFloorIds.clear();
        this.app.state.selectedFloorIds.add(this.app.doc.ids[0]);
        this.app.state.activeFloorId = this.app.doc.ids[0];
        this.app.rebuild();
      }
      return;
    }

    const index = this.app.doc.indexOfId(activeId);
    if (index < 0 || index >= this.app.doc.ids.length - 1) {
      return; // Already at last tile or not found
    }

    const nextId = this.app.doc.ids[index + 1];
    if (nextId) {
      // Add to selection without clearing
      this.app.state.selectedFloorIds.add(nextId);
      this.app.state.activeFloorId = nextId;
      this.app.rebuild();
    }
  }

  /**
   * Extend selection to include the previous tile
   * Keeps existing selection and adds the previous tile
   */
  extendSelectionBackward() {
    if (!this.app || !this.app.state || !this.app.doc) {
      return;
    }

    const activeId = this.app.state.activeFloorId;
    if (!activeId) {
      // If no active tile, select first tile
      if (this.app.doc.ids.length > 0) {
        this.app.state.selectedFloorIds.clear();
        this.app.state.selectedFloorIds.add(this.app.doc.ids[0]);
        this.app.state.activeFloorId = this.app.doc.ids[0];
        this.app.rebuild();
      }
      return;
    }

    const index = this.app.doc.indexOfId(activeId);
    if (index <= 0) {
      return; // Already at first tile or not found
    }

    const prevId = this.app.doc.ids[index - 1];
    if (prevId) {
      // Add to selection without clearing
      this.app.state.selectedFloorIds.add(prevId);
      this.app.state.activeFloorId = prevId;
      this.app.rebuild();
    }
  }

  /**
   * Delete the previous tile relative to active selection
   */
  deletePreviousTile() {
    if (!this.app || !this.app.state || !this.app.doc) {
      return;
    }

    const activeId = this.app.state.activeFloorId;
    if (!activeId) {
      return;
    }

    const index = this.app.doc.indexOfId(activeId);
    if (index <= 1) {
      return; // No previous tile to delete (index 0 is start tile, protected)
    }

    const prevId = this.app.doc.ids[index - 1];
    if (prevId) {
      this.app.recordHistoryBeforeEdit?.();
      this.app.doc.removeById(prevId);
      this.app.rebuild?.();
    }
  }

  /**
   * Delete the next tile relative to active selection
   */
  deleteNextTile() {
    if (!this.app || !this.app.state || !this.app.doc) {
      return;
    }

    const activeId = this.app.state.activeFloorId;
    if (!activeId) {
      return;
    }

    const index = this.app.doc.indexOfId(activeId);
    if (index < 0 || index >= this.app.doc.ids.length - 1) {
      return; // No next tile to delete
    }

    const nextId = this.app.doc.ids[index + 1];
    if (nextId) {
      this.app.recordHistoryBeforeEdit?.();
      this.app.doc.removeById(nextId);
      this.app.rebuild?.();
    }
  }

  /**
   * Delete all tiles before the active selection
   */
  deleteAllPreviousTiles() {
    if (!this.app || !this.app.state || !this.app.doc) {
      return;
    }

    const activeId = this.app.state.activeFloorId;
    if (!activeId) {
      return;
    }

    const index = this.app.doc.indexOfId(activeId);
    if (index <= 1) {
      return; // No previous tiles to delete (index 0 is start tile, protected)
    }

    // Collect all tile IDs before the active tile (excluding index 0)
    const tilesToDelete = this.app.doc.ids.slice(1, index);

    if (tilesToDelete.length === 0) {
      return;
    }

    this.app.recordHistoryBeforeEdit?.();

    // Delete each tile
    for (const id of tilesToDelete) {
      this.app.doc.removeById(id);
    }

    this.app.rebuild?.();
  }

  /**
   * Delete all tiles after the active selection
   */
  deleteAllNextTiles() {
    if (!this.app || !this.app.state || !this.app.doc) {
      return;
    }

    const activeId = this.app.state.activeFloorId;
    if (!activeId) {
      return;
    }

    const index = this.app.doc.indexOfId(activeId);
    if (index < 0 || index >= this.app.doc.ids.length - 1) {
      return; // No next tiles to delete
    }

    // Collect all tile IDs after the active tile
    const tilesToDelete = this.app.doc.ids.slice(index + 1);

    if (tilesToDelete.length === 0) {
      return;
    }

    this.app.recordHistoryBeforeEdit?.();

    // Delete each tile
    for (const id of tilesToDelete) {
      this.app.doc.removeById(id);
    }

    this.app.rebuild?.();
  }

  /**
   * Trigger undo action
   */
  undo() {
    if (this.app && this.app.undo) {
      this.app.undo();
    }
  }

  /**
   * Trigger redo action
   */
  redo() {
    if (this.app && this.app.redo) {
      this.app.redo();
    }
  }
}
