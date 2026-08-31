export class Floor {
  constructor(id, x, y, startAngle, endAngle, option = {
    isTwirled: false,
    isFullspin: false,
    isMidspin: false
  }) {
    this.id = id;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.x = x;
    this.y = y;
    this.option = option;
  }
}

export class EditorState {
  constructor() {
    this.selectedFloorIds = new Set();
    this.activeFloorId = null;
    this.selectionAnchorId = null;
    this.mode = "edit";
  }
}

export class RenderEngine {
  constructor(runtime, cameraSystem, clock) {
    this.runtime = runtime;
    this.cameraSystem = cameraSystem;
    this.clock = clock;
    this._raf = null;

    this.onFrame = () => {};
    this.afterFrame = () => {};

    this.frameCount = 0;
    this.fps = 0;
    this._fpsWindowStart = null;
    this._fpsWindowFrames = 0;
    this._lastTime = null;
  }

  start() {
    const loop = (now) => {
      if (this._lastTime == null) {
        this._lastTime = now;
      }

      const dtMs = now - this._lastTime;
      this._lastTime = now;

      this.frameCount++;
      this._fpsWindowFrames++;

      if (this._fpsWindowStart === null) {
        this._fpsWindowStart = now;
      }

      const fpsElapsed = now - this._fpsWindowStart;

      if (fpsElapsed >= 500) {
        this.fps = (this._fpsWindowFrames * 1000) / fpsElapsed;
        this._fpsWindowFrames = 0;
        this._fpsWindowStart = now;
      }

      this.onFrame(now);
      this.afterFrame(now);

      this.runtime.render(this.cameraSystem.camera);

      this._raf = requestAnimationFrame(loop);
    };

    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
    }

    this._raf = null;
    this._lastTime = null;
  }
}

export class CompiledProject {
  constructor() {
    this.floors = null;
    this.bpms = [];
    this.relativeAngles = [];
    this.beats = [];
    this.floorStarts_us = [];
    this.floorDurations_us = [];
    this.countdownHitTimes_us = [];
    this.playerCameraPositions = [];
    this.eventMarkers = [];
    this.hitSoundEvents = [];
    this.playSoundActions = [];
  }
}
