export class Document {
  constructor() {
    this.actions = [];
    this.idCounter = 1;
  }

  newId() {
    return `doc_${this.idCounter++}`;
  }

  addAction(floorId, eventType, data = {}) {
    const action = {
      id: this.newId(),
      floorId,
      eventType,
      ...data
    };

    this.actions.push(action);
    return action;
  }

  removeAction(action) {
    this.actions = this.actions.filter((item) => item !== action);
  }

  getActionsByFloorId(floorId) {
    return this.actions.filter((item) => item.floorId === floorId);
  }

  updateAction(action, patch) {
    Object.assign(action, patch);
    return action;
  }
}

export class DocumentBuilder {
  constructor() {
    this.doc = null;
  }

  fromProject(project) {
    this.doc = new Document();
    if (project?.floors) {
      for (const floor of project.floors) {
        this.doc.addAction(floor.id, "SetSpeed", { floorId: floor.id });
      }
    }
    return this.doc;
  }
}

export class Compiler {
  constructor() {
    this.compiled = null;
  }

  compile(doc) {
    this.compiled = {
      floors: doc?.actions ?? [],
      version: 1
    };
    return this.compiled;
  }
}
