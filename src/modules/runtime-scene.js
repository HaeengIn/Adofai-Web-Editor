import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { degToRad } from "../utils/math.js";

export class RuntimeScene {
  constructor(three = THREE) {
    this.Three = three;
    this.scene = null;
    this.renderer = null;

    this.defaultWidth = 150;
    this.defaultHeight = 85;
    this.defaultOutlineOffset = 10;
    this.defaultBorder = 23;

    this.isGrid = true;

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
    this.renderFloorCount = 0;

    this.floorGeometryCache = new Map();

    this.sharedOuterMaterial = new this.Three.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false
    });

    this.sharedInnerMaterial = new this.Three.MeshBasicMaterial({
      color: 0x0a0a0a,
      depthTest: false,
      depthWrite: false
    });

    this.sharedSelectedInnerMaterial = new this.Three.MeshBasicMaterial({
      color: 0x00ff00,
      depthTest: false,
      depthWrite: false
    });

    this.sharedEventMarkerGeometry = new this.Three.PlaneGeometry(this.eventMarkerSize, this.eventMarkerSize);
    this.eventMarkerMaterialCache = new Map();
    this.playbackVisualMode = false;
    this.visibleFloorMeshes = [];
    this.visibilityMargin = 2;
    this.visibilityRefreshDistance = 0.3;
    this.floorVisibilityState = {
      x: Infinity,
      y: Infinity,
      zoom: -1,
      viewWidth: -1,
      viewHeight: -1
    };
    this.floorChunkSize = 8;
    this.floorChunks = new Map();
    this.attachedFloorGroups = new Set();
  }

  init() {
    const THREE = this.Three;

    this.scene = new THREE.Scene();

    const canvas = document.getElementById("canvas");
    if (!canvas) {
      throw new Error("canvas not found");
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.gridHelper = new THREE.GridHelper(5000, 5000, 0x303030, 0x202020);
    this.gridHelper.rotation.x = Math.PI / 2;
    this.gridHelper.position.z = -1;
    this.gridHelper.renderOrder = -10000;

    if (this.gridHelper.material) {
      const materials = Array.isArray(this.gridHelper.material)
        ? this.gridHelper.material
        : [this.gridHelper.material];

      for (const material of materials) {
        material.transparent = false;
        material.opacity = 1;
        material.depthTest = false;
        material.depthWrite = false;
        material.needsUpdate = true;
      }
    }

    this.axesHelper = new THREE.AxesHelper(10);
    this.axesHelper.position.z = -0.9;
    this.axesHelper.renderOrder = -9999;

    if (this.axesHelper.material) {
      const materials = Array.isArray(this.axesHelper.material)
        ? this.axesHelper.material
        : [this.axesHelper.material];

      for (const material of materials) {
        material.transparent = false;
        material.opacity = 1;
        material.depthTest = false;
        material.depthWrite = false;
        material.needsUpdate = true;
      }
    }

    this.scene.add(this.gridHelper);
    this.scene.add(this.axesHelper);
    this.setGridVisible(this.isGrid);
  }

  setGridVisible(visible) {
    this.isGrid = Boolean(visible);

    if (this.gridHelper) {
      this.gridHelper.visible = this.isGrid;
    }

    if (this.axesHelper) {
      this.axesHelper.visible = this.isGrid;
    }

    return this.isGrid;
  }

  rebuildFloorSpatialIndex() {
    this.floorChunks.clear();

    const size = this.floorChunkSize;

    for (const group of this.floorMeshes) {
      const cx = Math.floor(group.position.x / size);
      const cy = Math.floor(group.position.y / size);
      const key = `${cx},${cy}`;

      let chunk = this.floorChunks.get(key);
      if (!chunk) {
        chunk = [];
        this.floorChunks.set(key, chunk);
      }

      chunk.push(group);
    }
  }

  render(camera) {
    this.updateFloorVisibility(camera);
    this.renderer.render(this.scene, camera);
  }

  resize(width, height) {
    if (!this.renderer) {
      return;
    }

    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));

    if (w === this.viewportWidth && h === this.viewportHeight) {
      return;
    }

    this.viewportWidth = w;
    this.viewportHeight = h;
    this.renderer.setSize(w, h, false);
  }

  mergeGeometryParts(geometries) {
    const parts = [];

    for (const geometry of geometries) {
      if (geometry.index) {
        const converted = geometry.toNonIndexed();
        geometry.dispose();
        parts.push(converted);
      } else {
        parts.push(geometry);
      }
    }

    if (parts.length === 1) {
      const geometry = parts[0];
      geometry.computeBoundingSphere();
      return geometry;
    }

    const merged = mergeGeometries(parts, false);

    for (const geometry of parts) {
      geometry.dispose();
    }

    if (!merged) {
      throw new Error("Floor geometry merge failed.");
    }

    merged.computeBoundingSphere();
    return merged;
  }

  createRotatedRectGeometry(width, height, angleRad) {
    const geometry = new this.Three.PlaneGeometry(width, height);
    geometry.rotateZ(angleRad);
    geometry.translate(Math.cos(angleRad) * width / 2, Math.sin(angleRad) * width / 2, 0);
    return geometry;
  }

  getFloorGeometryPair(floor) {
    const THREE = this.Three;
    const type = floor.option?.isFullspin ? "fullspin" : floor.option?.isMidspin ? "midspin" : "normal";
    const key = [type, floor.startAngle, floor.endAngle].join("|");
    const cached = this.floorGeometryCache.get(key);
    if (cached) {
      return cached;
    }

    const floorWidth = 1;
    const floorHeight = this.defaultHeight / this.defaultWidth;
    const halfW = floorWidth / 2;
    const radius = floorHeight / 2;
    const floorBorder = this.defaultBorder / this.defaultWidth;
    const innerFloorWidth = (this.defaultWidth - this.defaultOutlineOffset) / this.defaultWidth;
    const innerFloorHeight = (this.defaultHeight - this.defaultOutlineOffset) / this.defaultWidth;
    const innerHalfW = innerFloorWidth / 2;
    const innerRadius = innerFloorHeight / 2;

    let outerGeometry;
    let innerGeometry;

    if (type === "normal") {
      const a0 = degToRad(floor.startAngle);
      const a1 = degToRad(floor.endAngle);

      const outerCircle = new THREE.CircleGeometry(radius, this.circleSegments);
      const outerA = this.createRotatedRectGeometry(halfW, floorHeight, a0);
      const outerB = this.createRotatedRectGeometry(halfW, floorHeight, a1);
      outerGeometry = this.mergeGeometryParts([outerCircle, outerA, outerB]);

      const innerCircle = new THREE.CircleGeometry(innerRadius, this.circleSegments);
      const innerA = this.createRotatedRectGeometry(innerHalfW, innerFloorHeight, a0);
      const innerB = this.createRotatedRectGeometry(innerHalfW, innerFloorHeight, a1);
      innerGeometry = this.mergeGeometryParts([innerCircle, innerA, innerB]);
    } else if (type === "fullspin") {
      const createRectShape = (w, h, r) => {
        const shape = new THREE.Shape();
        const b = floorBorder;

        shape.moveTo(-w / 2 + b, -h / 2);
        shape.lineTo(w / 2 - r - b, -h / 2);
        shape.lineTo(w / 2 - r - b, h / 2);
        shape.lineTo(-w / 2 + b, h / 2);
        shape.closePath();
        return shape;
      };

      const rotation = degToRad(floor.endAngle + 180);

      const outerRect = new THREE.ShapeGeometry(createRectShape(floorWidth, floorHeight, radius));
      outerRect.rotateZ(rotation);
      const outerCircle = new THREE.CircleGeometry(radius, this.circleSegments);
      outerGeometry = this.mergeGeometryParts([outerRect, outerCircle]);

      const innerRect = new THREE.ShapeGeometry(createRectShape(innerFloorWidth, innerFloorHeight, innerRadius));
      innerRect.rotateZ(rotation);
      const innerCircle = new THREE.CircleGeometry(innerRadius, this.circleSegments);
      innerGeometry = this.mergeGeometryParts([innerRect, innerCircle]);
    } else {
      const createMidspinShape = (w, h, r) => {
        const shape = new THREE.Shape();
        const b = floorBorder;

        shape.moveTo(-w / 2 + b, -h / 2);
        shape.lineTo(w / 2 - r - b, -h / 2);
        shape.lineTo(w / 2 - b, 0);
        shape.lineTo(w / 2 - r - b, h / 2);
        shape.lineTo(-w / 2 + b, h / 2);
        shape.closePath();
        return shape;
      };

      const rotation = degToRad(floor.endAngle + 180);

      outerGeometry = new THREE.ShapeGeometry(createMidspinShape(floorWidth, floorHeight, radius));
      outerGeometry.rotateZ(rotation);

      innerGeometry = new THREE.ShapeGeometry(createMidspinShape(innerFloorWidth, innerFloorHeight, innerRadius));
      innerGeometry.rotateZ(rotation);

      outerGeometry.computeBoundingSphere();
      innerGeometry.computeBoundingSphere();
    }

    const pair = { outer: outerGeometry, inner: innerGeometry };
    this.floorGeometryCache.set(key, pair);
    return pair;
  }

  getEventMarkerMaterial(src) {
    const cached = this.eventMarkerMaterialCache.get(src);
    if (cached) {
      return cached;
    }

    const texture = this.getEventMarkerTexture(src);
    const material = new this.Three.MeshBasicMaterial({
      map: texture,
      transparent: false,
      alphaTest: 0.02,
      depthTest: false,
      depthWrite: false
    });

    this.eventMarkerMaterialCache.set(src, material);
    return material;
  }

  getEventMarkerTexture(src) {
    if (this.eventTextureCache.has(src)) {
      return this.eventTextureCache.get(src);
    }

    const texture = this.eventTextureLoader.load(
      src,
      undefined,
      undefined,
      (error) => {
        console.warn("Event marker texture load failed:", src, error);
      }
    );

    texture.colorSpace = this.Three.SRGBColorSpace;
    texture.minFilter = this.Three.LinearFilter;
    texture.magFilter = this.Three.LinearFilter;

    this.eventTextureCache.set(src, texture);
    return texture;
  }

  invalidateFloorVisibility() {
    const state = this.floorVisibilityState;
    state.x = Infinity;
    state.y = Infinity;
    state.zoom = -1;
    state.viewWidth = -1;
    state.viewHeight = -1;
    this.visibleFloorMeshes = [];
  }

  updateFloorVisibility(camera, force = false) {
    if (!camera) {
      return;
    }

    const x = camera.position.x;
    const y = camera.position.y;
    const zoom = camera.zoom;
    const viewWidth = (camera.right - camera.left) / zoom;
    const viewHeight = (camera.top - camera.bottom) / zoom;

    const old = this.floorVisibilityState;

    if (
      !force &&
      Math.abs(x - old.x) < this.visibilityRefreshDistance &&
      Math.abs(y - old.y) < this.visibilityRefreshDistance &&
      Math.abs(zoom - old.zoom) < 0.001 &&
      Math.abs(viewWidth - old.viewWidth) < 0.01 &&
      Math.abs(viewHeight - old.viewHeight) < 0.01
    ) {
      return;
    }

    old.x = x;
    old.y = y;
    old.zoom = zoom;
    old.viewWidth = viewWidth;
    old.viewHeight = viewHeight;

    const halfWidth = viewWidth / 2 + this.visibilityMargin;
    const halfHeight = viewHeight / 2 + this.visibilityMargin;
    const size = this.floorChunkSize;

    const minChunkX = Math.floor((x - halfWidth) / size);
    const maxChunkX = Math.floor((x + halfWidth) / size);
    const minChunkY = Math.floor((y - halfHeight) / size);
    const maxChunkY = Math.floor((y + halfHeight) / size);

    const nextVisible = [];
    const nextSet = new Set();

    for (let cy = minChunkY; cy <= maxChunkY; cy++) {
      for (let cx = minChunkX; cx <= maxChunkX; cx++) {
        const chunk = this.floorChunks.get(`${cx},${cy}`);
        if (!chunk) {
          continue;
        }

        for (const group of chunk) {
          if (
            Math.abs(group.position.x - x) > halfWidth ||
            Math.abs(group.position.y - y) > halfHeight
          ) {
            continue;
          }

          nextVisible.push(group);
          nextSet.add(group);
        }
      }
    }

    for (const group of this.attachedFloorGroups) {
      if (!nextSet.has(group)) {
        this.scene.remove(group);
      }
    }

    for (const group of nextSet) {
      if (!this.attachedFloorGroups.has(group)) {
        this.scene.add(group);
      }
    }

    this.attachedFloorGroups = nextSet;
    this.visibleFloorMeshes = nextVisible;
  }

  createEventMarkerVisual(marker, renderOrder = 0) {
    if (!marker?.iconSrc) {
      return null;
    }

    const mesh = new this.Three.Mesh(
      this.sharedEventMarkerGeometry,
      this.getEventMarkerMaterial(marker.iconSrc)
    );

    mesh.renderOrder = renderOrder;
    mesh.userData.role = "event-marker";
    mesh.userData.eventType = marker.type;
    mesh.userData.markerType = marker.type;

    if (marker.type === "twirl") {
      const rotationDeg = Number(marker.rotationDeg);
      if (Number.isFinite(rotationDeg)) {
        mesh.rotation.z = degToRad(rotationDeg);
      }
      mesh.scale.x = marker.mirrorX ? -1 : 1;
    }

    mesh.visible = !(this.playbackVisualMode && (marker.type === "other" || marker.type === "speed-equal"));
    mesh.raycast = () => {};

    return mesh;
  }

  createFloorVisual(floor, eventMarker = null, floorIndex = 0) {
    const THREE = this.Three;

    const group = new THREE.Group();
    group.position.set(floor.x, floor.y, 0);
    group.userData.floorId = floor.id;
    group.userData.floorIndex = floorIndex;
    group.userData.visualSignature = this.getFloorVisualSignature(floor, eventMarker);

    const geometryPair = this.getFloorGeometryPair(floor);

    const outer = new THREE.Mesh(geometryPair.outer, this.sharedOuterMaterial);
    outer.userData.role = "outer";
    outer.userData.floorId = floor.id;
    group.add(outer);

    const inner = new THREE.Mesh(geometryPair.inner, this.sharedInnerMaterial);
    inner.userData.role = "inner";
    inner.userData.floorId = floor.id;
    group.add(inner);
    group.userData.innerMesh = inner;

    if (eventMarker) {
      const markerMesh = this.createEventMarkerVisual(eventMarker, 0);
      if (markerMesh) {
        group.add(markerMesh);
        group.userData.eventMarkerMesh = markerMesh;
      }
    }

    this.applyFloorRenderOrder(group, floorIndex);
    return group;
  }

  setInnerColorByGroup(group, colorHex) {
    if (!group) {
      return;
    }

    const inner = group.userData?.innerMesh;
    if (!inner) {
      return;
    }

    inner.material = colorHex === 0x00ff00 ? this.sharedSelectedInnerMaterial : this.sharedInnerMaterial;
  }

  highlightFloorById(floorId, enabled) {
    const group = this.meshByFloorId.get(floorId);
    if (!group) {
      return;
    }

    const color = enabled ? 0x00ff00 : 0x0a0a0a;
    this.setInnerColorByGroup(group, color);
  }

  setFloor(floors, eventMarkers = []) {
    this.renderFloorCount = floors.length;

    for (const group of this.attachedFloorGroups) {
      this.scene.remove(group);
    }
    this.attachedFloorGroups.clear();

    const oldFloorMeshes = this.floorMeshes;
    const oldById = this.meshByFloorId;

    const nextFloorMeshes = [];
    const nextById = new Map();
    const keptGroups = new Set();

    for (let index = 0; index < floors.length; index++) {
      const floor = floors[index];
      const marker = eventMarkers[index] ?? null;
      const signature = this.getFloorVisualSignature(floor, marker);

      let group = oldById.get(floor.id);
      const reusable = group && group.userData?.visualSignature === signature;

      if (reusable) {
        group.position.set(floor.x, floor.y, 0);
        this.applyFloorRenderOrder(group, index);
        this.setInnerColorByGroup(group, 0x0a0a0a);
      } else {
        group = this.createFloorVisual(floor, marker, index);
      }

      nextFloorMeshes.push(group);
      nextById.set(floor.id, group);
      keptGroups.add(group);
    }

    for (const oldGroup of oldFloorMeshes) {
      if (keptGroups.has(oldGroup)) {
        continue;
      }

      this.scene.remove(oldGroup);
      this.disposeFloorGroup(oldGroup);
    }

    this.floorMeshes = nextFloorMeshes;
    this.meshByFloorId = nextById;
    this.floorIdByMesh.clear();

    for (const group of this.floorMeshes) {
      this.floorIdByMesh.set(group.uuid, group.userData.floorId);
    }

    this.rebuildFloorSpatialIndex();
    this.invalidateFloorVisibility();
  }

  applyFloorRenderOrder(group, floorIndex) {
    const baseOrder = (this.renderFloorCount - floorIndex) * 4;
    group.userData.floorIndex = floorIndex;

    group.traverse((obj) => {
      if (!obj.isMesh) {
        return;
      }

      const role = obj.userData?.role;
      if (role === "outer") {
        obj.renderOrder = baseOrder;
      } else if (role === "inner") {
        obj.renderOrder = baseOrder + 1;
      } else if (role === "event-marker") {
        obj.renderOrder = baseOrder + 2;
      }
    });
  }

  getFloorVisualSignature(floor, marker) {
    return [
      floor.startAngle,
      floor.endAngle,
      floor.option?.isFullspin ? 1 : 0,
      floor.option?.isMidspin ? 1 : 0,
      marker?.type ?? "",
      marker?.direction ?? "",
      marker?.iconSrc ?? "",
      marker?.mirrorX ? 1 : 0,
      Number.isFinite(Number(marker?.rotationDeg)) ? Number(marker.rotationDeg) : 0,
      Number.isFinite(Number(marker?.effectiveAngle)) ? Number(marker.effectiveAngle) : ""
    ].join("|");
  }

  disposeFloorGroup(group) {
    if (!group) {
      return;
    }

    group.clear();
    group.userData.innerMesh = null;
    group.userData.eventMarkerMesh = null;
  }

  setPlaybackVisualMode(playing) {
    this.playbackVisualMode = !!playing;

    for (const group of this.floorMeshes) {
      const marker = group.userData?.eventMarkerMesh;
      if (!marker) {
        continue;
      }

      const markerType = marker.userData.markerType;
      marker.visible = !(playing && (markerType === "other" || markerType === "speed-equal"));
    }
  }
}
