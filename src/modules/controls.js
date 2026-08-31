export class ModifierKeyController {
  constructor() {
    this.ctrl = false;
    this.shift = false;
    this.ctrlButton = null;
    this.shiftButton = null;
    this.enabled = true;
  }

  init() {
    this.ctrlButton = document.getElementById("ctrl-button");
    this.shiftButton = document.getElementById("shift-button");

    if (!this.ctrlButton) {
      throw new Error("ctrl-button not found");
    }

    if (!this.shiftButton) {
      throw new Error("shift-button not found");
    }

    this.ctrlButton.addEventListener("click", () => {
      if (!this.enabled) return;
      this.setCtrl(!this.ctrl);
    });

    this.shiftButton.addEventListener("click", () => {
      if (!this.enabled) return;
      this.setShift(!this.shift);
    });

    window.addEventListener("keydown", (e) => {
      if (!this.enabled) return;
      if (e.key === "Control") this.setCtrl(true);
      if (e.key === "Shift") this.setShift(true);
    });

    window.addEventListener("keyup", (e) => {
      if (e.key === "Control") this.setCtrl(false);
      if (e.key === "Shift") this.setShift(false);
    });

    window.addEventListener("blur", () => {
      this.setCtrl(false);
      this.setShift(false);
    });

    this.updateVisual();
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    this.ctrlButton.disabled = !value;
    this.shiftButton.disabled = !value;

    if (!value) {
      this.ctrl = false;
      this.shift = false;
      this.updateVisual();
    }
  }

  setCtrl(value) {
    this.ctrl = Boolean(value);
    if (this.ctrl) {
      this.shift = false;
    }
    this.updateVisual();
  }

  setShift(value) {
    this.shift = Boolean(value);
    if (this.shift) {
      this.ctrl = false;
    }
    this.updateVisual();
  }

  updateVisual() {
    this.ctrlButton?.classList.toggle("active", this.ctrl);
    this.shiftButton?.classList.toggle("active", this.shift);
  }

  isCtrl() {
    return this.ctrl;
  }

  isShift() {
    return this.shift;
  }
}

export class PlayButtonController {
  constructor() {
    this.button = null;
    this.isPlaying = false;
    this.onToggle = null;
  }

  init(onToggle) {
    this.button = document.getElementById("play-button");

    if (!this.button) {
      throw new Error("play-button not found");
    }

    this.onToggle = onToggle;

    this.button.addEventListener("click", () => {
      this.onToggle?.();
    });

    this.setPlaying(false);
  }

  setPlaying(value) {
    this.isPlaying = Boolean(value);
    if (!this.button) return;

    if (value) {
      this.button.textContent = "■";
      this.button.setAttribute("aria-label", "Pause");
      this.button.title = "Pause";
    } else {
      this.button.textContent = "▶";
      this.button.setAttribute("aria-label", "Play");
      this.button.title = "Play";
    }
  }
}
