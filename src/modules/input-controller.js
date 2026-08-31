export class InputController {
  constructor(runtime, cameraSystem) {
    this.runtime = runtime;
    this.cameraSystem = cameraSystem;
    this.enabled = true;
  }

  setEnabled(v) {
    this.enabled = Boolean(v);
  }

  onDown(e) {
    return e;
  }

  onMove(e) {
    return e;
  }

  onUp(e) {
    return e;
  }

  getCenter() {
    return { x: 0, y: 0 };
  }

  handleTap(x, y) {
    return { x, y };
  }
}
