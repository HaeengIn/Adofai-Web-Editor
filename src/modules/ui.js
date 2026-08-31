export class TileEditorUI {
  constructor() {
    this.tabs = [];
    this.selectedTab = null;
    this.palette = [];
  }

  init(callback = {}) {
    this.callback = callback;
    return this;
  }

  renderTabs() {
    return this.tabs;
  }

  renderEventPalette() {
    return this.palette;
  }

  update(data = {}) {
    this.data = data;
    return this;
  }

  render() {
    return {
      tabs: this.renderTabs(),
      palette: this.renderEventPalette(),
      selectedTab: this.selectedTab
    };
  }
}

export class ModifierKeyController {
  constructor() {
    this.enabled = true;
    this.ctrl = false;
    this.shift = false;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
  }

  setCtrl(value) {
    this.ctrl = Boolean(value);
  }

  setShift(value) {
    this.shift = Boolean(value);
  }

  isCtrl() {
    return this.enabled && this.ctrl;
  }

  isShift() {
    return this.enabled && this.shift;
  }
}

export class PlayButtonController {
  constructor() {
    this.playing = false;
  }

  init(onToggle = () => {}) {
    this.onToggle = onToggle;
  }

  setPlaying(value) {
    this.playing = Boolean(value);
    if (this.onToggle) {
      this.onToggle(this.playing);
    }
  }
}
