import * as THREE from "three";

export class RuntimeScene {
  constructor(three = THREE) {
    this.Three = three;
    this.scene = null;
    this.renderer = null;
    this.gridHelper = null;
    this.axesHelper = null;
    this.floorMeshes = [];
    this.meshByFloorId = new Map();
    this.floorIdByMesh = new Map();
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.eventTextureLoader = new this.Three.TextureLoader();
    this.eventTextureCache = new Map();
    this.eventMarkerSize = 0.5;
    this.circleSegments = 16;
    this.isGrid = true;
    this.playbackVisualMode = false;
  }

  init() {
    this.scene = new this.Three.Scene();
    const canvas = document.getElementById("canvas");

    if (!canvas) {
      throw new Error("Canvas element not found.");
    }

    this.renderer = new this.Three.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.gridHelper = new this.Three.GridHelper(200, 200, 0x2e2e2e, 0x1f1f1f);
    this.gridHelper.position.z = -2;
    this.scene.add(this.gridHelper);

    this.axesHelper = new this.Three.AxesHelper(20);
    this.axesHelper.visible = false;
    this.scene.add(this.axesHelper);
  }

  setGridVisible(visible) {
    this.isGrid = Boolean(visible);
    if (this.gridHelper) {
      this.gridHelper.visible = this.isGrid;
    }
  }

  render(camera) {
    if (!this.renderer || !this.scene || !camera) {
      return;
    }

    this.renderer.render(this.scene, camera);
  }

  resize(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;

    if (!this.renderer) {
      return;
    }

    this.renderer.setSize(width, height, false);
  }

  setFloor(floorData = [], eventMarkers = []) {
    this.floorMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
    });

    this.floorMeshes = [];
    this.meshByFloorId.clear();
    this.floorIdByMesh.clear();

    for (const floor of floorData) {
      const mesh = new this.Three.Group();
      this.scene.add(mesh);
      this.floorMeshes.push(mesh);
      this.meshByFloorId.set(floor.id, mesh);
      this.floorIdByMesh.set(mesh, floor.id);
    }
  }

  setPlaybackVisualMode(playing) {
    this.playbackVisualMode = Boolean(playing);
  }
}
