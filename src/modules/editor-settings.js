export class EditorSettingsController {
  constructor(app) {
    this.app = app;
    this.projectSettingsInitialized = false;
    this.levelLoadHelpInitialized = false;
    this.editorSettingsInitialized = false;
  }

  initEditorSettingsUI() {
    if (this.editorSettingsInitialized) {
      return true;
    }

    const app = this.app;
    const button = document.getElementById("editor-settings-button");
    const overlay = document.getElementById("editor-settings-overlay");
    const sheet = document.getElementById("editor-settings-sheet");
    const closeButton = document.getElementById("editor-settings-close");
    const gridInput = document.getElementById("editor-setting-grid");
    const infoInput = document.getElementById("editor-setting-info");
    const offsetInput = document.getElementById("editor-setting-offset");
    const openWelcomeButton = document.getElementById("editor-open-welcome-button");
    const openLogsButton = document.getElementById("editor-open-logs-button");
    const clearCacheButton = document.getElementById("editor-clear-cache-button");
    const logOverlay = document.getElementById("editor-log-overlay");
    const logSheet = document.getElementById("editor-log-sheet");
    const logCloseButton = document.getElementById("editor-log-close");
    const logCopyButton = document.getElementById("editor-log-copy");
    const logClearButton = document.getElementById("editor-log-clear");
    const editorInfoElement = document.getElementById("editor-info");

    if (
      !button ||
      !overlay ||
      !sheet ||
      !closeButton ||
      !gridInput ||
      !infoInput ||
      !offsetInput ||
      !openWelcomeButton ||
      !openLogsButton ||
      !clearCacheButton ||
      !logOverlay ||
      !logSheet ||
      !logCloseButton ||
      !logCopyButton ||
      !logClearButton ||
      !editorInfoElement
    ) {
      throw new Error("editor settings UI element not found");
    }

    overlay.hidden = true;

    const savedGrid = app.readEditorPreference("adofai-editor-grid", null);
    const showGrid = savedGrid !== "false";
    gridInput.checked = showGrid;
    app.runtime.setGridVisible(showGrid);

    const savedInfo = app.readEditorPreference("adofai-editor-info", null);
    const showInfo = savedInfo !== "false";
    infoInput.checked = showInfo;
    app.setEditorInfoVisible(showInfo);

    const savedOffset = Number(app.readEditorPreference("adofai-editor-offset-ms", "0"));
    const editorOffset = Number.isFinite(savedOffset) ? savedOffset : 0;
    app.setEditorOffset(editorOffset, { persist: false, log: false });
    offsetInput.value = String(editorOffset);

    button.addEventListener("click", () => {
      overlay.hidden = false;
    });

    closeButton.addEventListener("click", () => {
      overlay.hidden = true;
    });

    overlay.addEventListener("pointerdown", e => {
      if (e.target === overlay) {
        overlay.hidden = true;
      }
    });

    sheet.addEventListener("pointerdown", e => {
      e.stopPropagation();
    });

    window.addEventListener("keydown", e => {
      if (e.key !== "Escape") {
        return;
      }

      if (!logOverlay.hidden) {
        app.closeDebugLogs();
        return;
      }

      if (!overlay.hidden) {
        overlay.hidden = true;
      }
    });

    gridInput.addEventListener("change", () => {
      const visible = gridInput.checked;
      app.runtime.setGridVisible(visible);
      app.writeEditorPreference("adofai-editor-grid", visible);
    });

    infoInput.addEventListener("change", () => {
      const visible = infoInput.checked;
      app.setEditorInfoVisible(visible);
      app.writeEditorPreference("adofai-editor-info", visible);
    });

    const commitEditorOffset = () => {
      const value = Number(offsetInput.value);

      if (!Number.isFinite(value)) {
        offsetInput.value = String(app.editorVisualOffset_ms);
        return;
      }

      app.setEditorOffset(value);
      offsetInput.value = String(app.editorVisualOffset_ms);
    };

    offsetInput.addEventListener("change", commitEditorOffset);
    offsetInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitEditorOffset();
        offsetInput.blur();
      }
    });

    openWelcomeButton.addEventListener("click", () => {
      app.openWelcomeNotice();
    });

    openLogsButton.addEventListener("click", () => {
      app.openDebugLogs();
    });

    clearCacheButton.addEventListener("click", async () => {
      await app.clearAllEditorCache();
    });

    logCloseButton.addEventListener("click", () => {
      app.closeDebugLogs();
    });

    logOverlay.addEventListener("pointerdown", e => {
      if (e.target === logOverlay) {
        app.closeDebugLogs();
      }
    });

    logSheet.addEventListener("pointerdown", e => {
      e.stopPropagation();
    });

    logCopyButton.addEventListener("click", async () => {
      await app.copyDebugLogs();
    });

    logClearButton.addEventListener("click", () => {
      app.logger.clear();
      app.refreshDebugLogView();
      app.showToast("Debug logs cleared.", "success");
    });

    app.logUnsubscribe = app.logger.subscribe(() => {
      if (!logOverlay.hidden) {
        app.refreshDebugLogView();
      }
    });

    app.refreshDebugLogView();
    this.editorSettingsInitialized = true;
    app.editorSettingsInitialized = true;
    return true;
  }

  initProjectSettingsUI() {
    if (this.projectSettingsInitialized) {
      return true;
    }

    const app = this.app;
    const settingsButton = document.getElementById("project-settings-button");
    const overlay = document.getElementById("project-settings-overlay");
    const sheet = document.getElementById("project-settings-sheet");
    const closeButton = document.getElementById("project-settings-close");
    const levelInput = document.getElementById("level-file-input");
    const songInput = document.getElementById("song-file-input");
    const loadLevelButton = document.getElementById("load-level-file-button");
    const newLevelButton = document.getElementById("new-level-button");
    const downloadLevelButton = document.getElementById("download-level-button");
    const chooseSongButton = document.getElementById("choose-song-file-button");

    if (!settingsButton || !overlay || !sheet || !closeButton || !levelInput || !songInput) {
      throw new Error("project settings UI element not found");
    }

    overlay.hidden = true;

    settingsButton.addEventListener("click", () => {
      app.openProjectSettings();
    });

    closeButton.addEventListener("click", () => {
      app.closeProjectSettings();
    });

    overlay.addEventListener("pointerdown", e => {
      if (e.target === overlay) {
        app.closeProjectSettings();
      }
    });

    sheet.addEventListener("pointerdown", e => {
      e.stopPropagation();
    });

    window.addEventListener("keydown", e => {
      if (e.key === "Escape" && !overlay.hidden) {
        app.closeProjectSettings();
      }
    });

    loadLevelButton?.addEventListener("click", () => {
      app.openLevelLoadHelp();
    });

    newLevelButton?.addEventListener("click", async () => {
      await app.createNewLevel();
    });

    downloadLevelButton?.addEventListener("click", () => {
      app.downloadLevel();
    });

    chooseSongButton?.addEventListener("click", () => {
      songInput.click();
    });

    levelInput.addEventListener("change", async () => {
      const files = Array.from(levelInput.files ?? []);
      levelInput.value = "";

      if (!files.length) {
        return;
      }

      const file = files.find(item => /\.adofai$/i.test(item.name)) ?? files[0];
      await app.loadProjectFromFile(file, files);
    });

    songInput.addEventListener("change", async () => {
      const file = songInput.files?.[0];
      songInput.value = "";

      if (!file) {
        return;
      }

      await app.selectSongFile(file);
    });

    const bindText = (id, key) => {
      const input = document.getElementById(id);
      input?.addEventListener("change", () => {
        app.applyProjectSetting(key, input.value);
      });
    };

    const bindNumber = (id, key, { min = null, max = null } = {}) => {
      const input = document.getElementById(id);
      input?.addEventListener("change", () => {
        let value = Number(input.value);

        if (!Number.isFinite(value)) {
          app.refreshProjectSettingsUI();
          return;
        }

        if (min !== null) {
          value = Math.max(min, value);
        }

        if (max !== null) {
          value = Math.min(max, value);
        }

        input.value = String(value);
        app.applyProjectSetting(key, value);
      });
    };

    bindText("settings-artist", "artist");
    bindText("settings-song", "song");
    bindText("settings-author", "author");
    bindNumber("settings-bpm", "bpm", { min: 0.001 });
    bindNumber("settings-volume", "volume", { min: 0, max: 100 });
    bindNumber("settings-offset", "offset");
    bindNumber("settings-pitch", "pitch", { min: 1 });
    bindText("settings-hitsound", "hitsound");
    bindNumber("settings-hitsound-volume", "hitsoundVolume", { min: 0, max: 100 });

    this.projectSettingsInitialized = true;
    app.projectSettingsInitialized = true;
    return true;
  }

  openProjectSettings() {
    const overlay = document.getElementById("project-settings-overlay");
    if (!overlay) {
      return false;
    }

    this.app.refreshProjectSettingsUI();
    overlay.hidden = false;
    return true;
  }

  closeProjectSettings() {
    const overlay = document.getElementById("project-settings-overlay");
    if (overlay) {
      overlay.hidden = true;
    }
    return true;
  }

  refreshHitsoundSettingOptions() {
    const select = document.getElementById("settings-hitsound");
    if (!select) {
      return false;
    }

    const currentValue = String(this.app.doc?.settings?.hitsound ?? "Kick");
    const options = (
      this.app.hitSound?.getAvailableHitsoundOptions?.() ?? [
        { value: "None", label: "None" },
        { value: "Kick", label: "Kick" }
      ]
    ).map(option => ({
      value: String(option?.value ?? option),
      label: String(option?.label ?? option?.value ?? option)
    }));

    if (currentValue && !options.some(option => option.value === currentValue)) {
      options.push({ value: currentValue, label: currentValue });
    }

    select.innerHTML = "";
    for (const optionInfo of options) {
      const option = document.createElement("option");
      option.value = optionInfo.value;
      option.textContent = optionInfo.label;
      select.appendChild(option);
    }

    select.value = currentValue;
    return true;
  }

  initLevelLoadHelp() {
    if (this.levelLoadHelpInitialized) {
      return true;
    }

    const overlay = document.getElementById("level-load-help-overlay");
    const cancelButton = document.getElementById("level-load-help-cancel");
    const okButton = document.getElementById("level-load-help-ok");
    const neverInput = document.getElementById("level-load-help-never");
    const levelInput = document.getElementById("level-file-input");

    if (!overlay || !cancelButton || !okButton || !neverInput || !levelInput) {
      return false;
    }

    overlay.hidden = true;

    cancelButton.addEventListener("click", () => {
      overlay.hidden = true;
    });

    okButton.addEventListener("click", () => {
      if (neverInput.checked) {
        this.app.writeEditorPreference("adofai-editor-hide-load-help-v1", "1");
      }

      overlay.hidden = true;
      levelInput.click();
    });

    this.levelLoadHelpInitialized = true;
    this.app.levelLoadHelpInitialized = true;
    return true;
  }

  openLevelLoadHelp() {
    const hidden = this.app.readEditorPreference("adofai-editor-hide-load-help-v1", "0") === "1";
    const levelInput = document.getElementById("level-file-input");

    if (hidden) {
      levelInput?.click();
      return true;
    }

    this.initLevelLoadHelp();
    const overlay = document.getElementById("level-load-help-overlay");
    if (!overlay) {
      levelInput?.click();
      return true;
    }

    overlay.hidden = false;
    return true;
  }

  refreshProjectSettingsUI() {
    const settings = this.app.doc?.settings ?? {};
    this.refreshHitsoundSettingOptions();

    const setValue = (id, value) => {
      const element = document.getElementById(id);
      if (element) {
        element.value = value ?? "";
      }
    };

    setValue("settings-song-filename", settings.songFilename ?? "");
    setValue("settings-bpm", Number.isFinite(Number(settings.bpm)) ? Number(settings.bpm) : 100);
    setValue("settings-volume", Number.isFinite(Number(settings.volume)) ? Number(settings.volume) : 100);
    setValue("settings-offset", Number.isFinite(Number(settings.offset)) ? Number(settings.offset) : 0);
    setValue("settings-pitch", Number.isFinite(Number(settings.pitch)) ? Number(settings.pitch) : 100);
    setValue("settings-hitsound", String(settings.hitsound ?? "Kick"));
    setValue("settings-hitsound-volume", Number.isFinite(Number(settings.hitsoundVolume)) ? Number(settings.hitsoundVolume) : 100);
    setValue("settings-artist", settings.artist ?? "");
    setValue("settings-song", settings.song ?? "");
    setValue("settings-author", settings.author ?? "");

    const levelName = document.getElementById("settings-level-file-name");
    if (levelName) {
      levelName.textContent = this.app.currentLevelSource?.name ?? "New Level";
    }

    const songStatus = document.getElementById("settings-song-status");
    if (songStatus) {
      songStatus.textContent = this.app.songLoadState.message ?? "";
      songStatus.classList.remove("ok", "warning", "error");

      if (this.app.songLoadState.loaded) {
        songStatus.classList.add("ok");
      }
      else if (settings.songFilename) {
        songStatus.classList.add("warning");
      }
    }

    return true;
  }

  syncSettingsToProject() {
    if (!this.app.project?.json) {
      return false;
    }

    if (!this.app.project.json.settings) {
      this.app.project.json.settings = {};
    }

    Object.assign(this.app.project.json.settings, this.app.doc?.settings ?? {});
    return true;
  }

  applyProjectSetting(key, value) {
    if (!this.app.doc?.settings) {
      return false;
    }

    if (Object.is(this.app.doc.settings[key], value)) {
      return true;
    }

    this.app.recordHistoryBeforeEdit();
    this.app.doc.settings[key] = value;
    this.syncSettingsToProject();

    if (key === "artist" || key === "song") {
      this.app.updateProjectTitle();
    }

    if (key === "volume") {
      const volume = Number(value);
      this.app.song.setVolume(Number.isFinite(volume) ? Math.max(0, volume) / 100 : 1);
    }

    if (key === "pitch") {
      const pitch = Number(value);
      const playbackRate = Number.isFinite(pitch) && pitch > 0 ? pitch / 100 : 1;

      this.app.clock.setPlaybackRate(playbackRate);
      this.app.song.setPlaybackRate(playbackRate);
      this.app.hitSound.setTimelineRate(playbackRate);

      if (this.app.state.mode === "play" && this.app.levelStarted) {
        const currentTime_us = this.app.clock.getTime_us();
        this.app.hitSound.start(
          this.app.compiled.hitSoundEvents,
          this.app.compiled.countdownHitTimes_us,
          currentTime_us
        );
      }
    }

    if (key === "bpm" || key === "offset" || key === "hitsound" || key === "hitsoundVolume") {
      this.app.rebuild();
    }

    this.app.refreshProjectSettingsUI();
    this.app.scheduleAutosave();
    this.app.logger.info("Level setting changed", key, value);
    return true;
  }

  async loadSongFromProjectUrl(projectPath) {
    const songFilename = String(this.app.doc?.settings?.songFilename ?? "").trim();

    if (!songFilename) {
      await this.app.song.init(this.app.hitSound.ctx, null);
      this.app.songLoadState = {
        loaded: false,
        message: "No song is assigned. Please choose a song file."
      };
      return false;
    }

    const projectUrl = new URL(projectPath, window.location.href);
    const songUrl = new URL(songFilename, projectUrl).href;
    const loaded = await this.app.song.init(this.app.hitSound.ctx, songUrl);

    const volume = Number(this.app.doc.settings?.volume ?? 100);
    this.app.song.setVolume(Number.isFinite(volume) ? Math.max(0, volume) / 100 : 1);

    this.app.songLoadState = loaded
      ? { loaded: true, message: `Song loaded automatically: ${songFilename}` }
      : { loaded: false, message: `Could not find ${songFilename} in the same path. Please choose it manually.` };

    return loaded;
  }

  findLocalSongFile(files, songFilename) {
    const expectedName = String(songFilename ?? "").trim();
    if (!expectedName || !Array.isArray(files)) {
      return null;
    }

    const normalizedExpected = expectedName.replace(/\\/g, "/");
    const expectedBaseName = normalizedExpected.split("/").pop();
    return files.find(file => file.name === expectedBaseName) ?? null;
  }

  async loadSongFromLocalFiles(files) {
    const expectedSong = String(this.app.doc?.settings?.songFilename ?? "").trim();

    if (!expectedSong) {
      await this.app.song.init(this.app.hitSound.ctx, null);
      this.app.songLoadState = {
        loaded: false,
        message: "No song is assigned to this level. Please choose a song file."
      };
      return false;
    }

    const songFile = this.findLocalSongFile(files, expectedSong);
    if (!songFile) {
      await this.app.song.init(this.app.hitSound.ctx, null);
      this.app.songLoadState = {
        loaded: false,
        message: `음원 파일을 찾을 수 없습니다. (${expectedSong})`
      };
      this.app.showToast("음원 파일을 찾을 수 없습니다.", "error", 5000);
      return false;
    }

    return await this.app.selectSongFile(songFile, {
      updateSongFilename: false,
      statusMessage: `Song loaded automatically: ${songFile.name}`
    });
  }

  async selectSongFile(file, { updateSongFilename = true, statusMessage = null } = {}) {
    if (!file || !this.app.hitSound.ctx) {
      return false;
    }

    if (this.app.localSongObjectUrl) {
      URL.revokeObjectURL(this.app.localSongObjectUrl);
    }

    this.app.localSongObjectUrl = URL.createObjectURL(file);

    const loaded = await this.app.song.init(this.app.hitSound.ctx, this.app.localSongObjectUrl);

    if (loaded) {
      if (this.app.autosaveSuppressed) {
        this.app.autosaveSuppressed = false;
        this.app.logger.setPersistenceEnabled(true);
      }

      if (updateSongFilename) {
        this.app.doc.settings.songFilename = file.name;
        this.syncSettingsToProject();
      }

      await this.app.cacheLocalSongForAutosave(file);

      const volume = Number(this.app.doc.settings?.volume ?? 100);
      this.app.song.setVolume(Number.isFinite(volume) ? Math.max(0, volume) / 100 : 1);
    }

    this.app.songLoadState = loaded
      ? { loaded: true, message: statusMessage ?? `Song selected: ${file.name}` }
      : { loaded: false, message: `Failed to read song: ${file.name}` };

    this.app.refreshProjectSettingsUI();

    if (loaded) {
      this.app.scheduleAutosave();
      this.app.logger.info("Song selected", {
        name: file.name,
        size: file.size,
        type: file.type || "unknown"
      });
    }
    else {
      this.app.showToast(`Failed to read song: ${file.name}`, "error");
    }

    return loaded;
  }
}
