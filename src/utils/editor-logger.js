export class EditorLogger {
  constructor() {
    this.storageKey = "adofai-editor-debug-log-v1";
    this.maxEntries = 300;
    this.entries = [];
    this.listeners = new Set();

    this.persistenceEnabled = true;
    this.consoleCaptureInstalled = false;

    this.originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    this.load();
  }

  formatValue(value) {
    if (value instanceof Error) {
      return value.stack || `${value.name}: ${value.message}`;
    }

    if (typeof value === "string") {
      return value;
    }

    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      return String(value);
    }

    try {
      const seen = new WeakSet();

      const text = JSON.stringify(value, (key, item) => {
        if (item && typeof item === "object") {
          if (seen.has(item)) {
            return "[Circular]";
          }
          seen.add(item);
        }
        return item;
      });

      if (typeof text === "string") {
        return text.length > 3000 ? text.slice(0, 3000) + "…" : text;
      }
    } catch {}

    try {
      return String(value);
    } catch {
      return "[Unprintable value]";
    }
  }

  load() {
    try {
      const text = localStorage.getItem(this.storageKey);

      if (!text) {
        return;
      }

      const parsed = JSON.parse(text);

      if (Array.isArray(parsed)) {
        this.entries = parsed.slice(-this.maxEntries);
      }
    } catch {}
  }

  persist() {
    if (!this.persistenceEnabled) {
      return;
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
    } catch {}
  }

  emit() {
    for (const listener of this.listeners) {
      try {
        listener(this.entries);
      } catch {}
    }
  }

  push(level, args, source = "editor") {
    const entry = {
      time: new Date().toISOString(),
      level,
      source,
      message: args.map((value) => this.formatValue(value)).join(" "),
    };

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }

    this.persist();
    this.emit();

    return entry;
  }

  info(...args) {
    this.originalConsole.log("[ADOFAI Editor]", ...args);
    return this.push("INFO", args);
  }

  warn(...args) {
    this.originalConsole.warn("[ADOFAI Editor]", ...args);
    return this.push("WARN", args);
  }

  error(...args) {
    this.originalConsole.error("[ADOFAI Editor]", ...args);
    return this.push("ERROR", args);
  }

  installConsoleCapture() {
    if (this.consoleCaptureInstalled) {
      return;
    }

    const map = {
      log: "INFO",
      warn: "WARN",
      error: "ERROR",
    };

    for (const method of Object.keys(map)) {
      console[method] = (...args) => {
        this.originalConsole[method](...args);
        this.push(map[method], args, "console");
      };
    }

    this.consoleCaptureInstalled = true;
  }

  clear({ persist = true } = {}) {
    this.entries.length = 0;

    if (persist) {
      try {
        localStorage.removeItem(this.storageKey);
      } catch {}
    }

    this.emit();
  }

  setPersistenceEnabled(value) {
    this.persistenceEnabled = Boolean(value);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toText() {
    const header = [
      "ADOFAI Web Editor Debug Log",
      `Exported: ${new Date().toISOString()}`,
      `URL: ${location.href}`,
      `User Agent: ${navigator.userAgent}`,
      "",
    ];

    const body = this.entries.map(
      (entry) =>
        `[${entry.time}] [${entry.level}] [${entry.source}] ${entry.message}`,
    );

    return [...header, ...body].join("\n");
  }
}
