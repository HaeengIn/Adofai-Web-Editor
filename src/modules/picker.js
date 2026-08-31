export class Picker {
  constructor(runtime, cameraSystem) {
    this.runtime = runtime;
    this.cameraSystem = cameraSystem;
  }

  pickFloorId(clientX, clientY) {
    return { clientX, clientY };
  }
}
