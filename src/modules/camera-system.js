import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { ease } from "../utils/easing.js";

export class CameraSystem {
  constructor(three = THREE) {
    this.THREE = three;

    this.camera = null;
    this.controls = null;

    this.baseViewWidth = 19.2;
    this.baseViewHeight = 10.8;

    this.pos = new this.THREE.Vector3(0, 0, 100);
    this.tgt = new this.THREE.Vector3(0, 0, 0);

    this._panPixels = { dx: 0, dy: 0 };

    this._focus = {
      enabled: false,
      fromPos: new this.THREE.Vector3(),
      toPos: new this.THREE.Vector3(),
      fromTgt: new this.THREE.Vector3(),
      toTgt: new this.THREE.Vector3(),
      startMs: 0,
      durationSec: 1,
      ease: "outquad"
    };

    this.viewportWidth = 1;
    this.viewportHeight = 1;
  }

  init(domElement) {
    const THREE = this.THREE;
    const halfW = this.baseViewWidth / 2;
    const halfH = this.baseViewHeight / 2;

    this.camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 2000);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.tgt);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableRotate = false;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 0.8;
    this.controls.screenSpacePanning = true;
    this.controls.target.copy(this.tgt);
    this.controls.update();
  }

  requestPanByPixels(dx, dy) {
    if (this._focus.enabled) {
      this.cancelFocus();
    }

    this._panPixels.dx += dx;
    this._panPixels.dy += dy;
  }

  requestPanByWorld(worldDx, worldDy) {
    if (this._focus.enabled) {
      this.cancelFocus();
    }

    this.pos.x += worldDx;
    this.pos.y += worldDy;
    this.tgt.x += worldDx;
    this.tgt.y += worldDy;
  }

  requestFocusTo(toX, toY, durationSec = 0.6, easeName = "outexpo") {
    const now = performance.now();

    this._focus.enabled = true;
    this._focus.startMs = now;
    this._focus.durationSec = Math.max(0, durationSec);
    this._focus.ease = easeName;

    this._focus.fromPos.copy(this.pos);
    this._focus.fromTgt.copy(this.tgt);
    this._focus.toPos.set(toX, toY, this.pos.z);
    this._focus.toTgt.set(toX, toY, 0);
  }

  cancelFocus() {
    this._focus.enabled = false;
  }

  _applyPanPixels(domElement) {
    const dx = this._panPixels.dx;
    const dy = this._panPixels.dy;
    if (dx === 0 && dy === 0) {
      return;
    }

    this._panPixels.dx = 0;
    this._panPixels.dy = 0;

    const cssW = this.viewportWidth;
    const cssH = this.viewportHeight;
    if (cssW <= 0 || cssH <= 0) {
      return;
    }

    const cam = this.camera;
    const viewW = (cam.right - cam.left) / cam.zoom;
    const viewH = (cam.top - cam.bottom) / cam.zoom;

    const worldDx = -dx * (viewW / cssW);
    const worldDy = dy * (viewH / cssH);

    this.pos.x += worldDx;
    this.pos.y += worldDy;
    this.tgt.x += worldDx;
    this.tgt.y += worldDy;
  }

  applyCameraFrame(cameraFrame) {
    this.pos.x = this.tgt.x = cameraFrame.x;
    this.pos.y = this.tgt.y = cameraFrame.y;
  }

  setZoomPercent(percent) {
    const p = Math.max(1, percent);
    this.camera.zoom = p / 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  getZoomPercent() {
    return this.camera.zoom * 100;
  }

  update(domElement) {
    if (this._focus.enabled) {
      const now = performance.now();
      const durMs = this._focus.durationSec * 1000;
      const t = durMs <= 0 ? 1 : (now - this._focus.startMs) / durMs;

      if (t >= 1) {
        this.pos.copy(this._focus.toPos);
        this.tgt.copy(this._focus.toTgt);
        this._focus.enabled = false;
      } else {
        const a = ease(t, this._focus.ease);
        this.pos.lerpVectors(this._focus.fromPos, this._focus.toPos, a);
        this.tgt.lerpVectors(this._focus.fromTgt, this._focus.toTgt, a);
      }
    }

    this._applyPanPixels(domElement);
    this.camera.position.copy(this.pos);
    this.controls.target.copy(this.tgt);
    this.controls.update();
  }

  resize(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;

    if (!this.camera || width <= 0 || height <= 0) {
      return;
    }

    const aspect = width / height;
    const baseAspect = this.baseViewWidth / this.baseViewHeight;

    let viewWidth;
    let viewHeight;

    if (aspect >= baseAspect) {
      viewHeight = this.baseViewHeight;
      viewWidth = viewHeight * aspect;
    } else {
      viewWidth = this.baseViewWidth;
      viewHeight = viewWidth / aspect;
    }

    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }
}
