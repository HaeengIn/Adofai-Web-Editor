export class Clock {
  constructor() {
    this.audioContext = null;
    this.startedAtUs = 0;
    this.rate = 1;
    this.isRunning = false;
  }

  setAudioContext(ctx) {
    this.audioContext = ctx;
  }

  startAt(timeUs, startTimeSec = null) {
    this.startedAtUs = Number(timeUs) || 0;
    this.startTimeSec = startTimeSec ?? (this.audioContext?.currentTime ?? 0);
    this.isRunning = true;
  }

  setPlaybackRate(value) {
    this.rate = Number(value) || 1;
  }

  update() {
    return this.isRunning;
  }

  stop() {
    this.isRunning = false;
  }

  getTime_us() {
    return this.startedAtUs;
  }
}

export class SongSystem {
  constructor() {
    this.audioContext = null;
    this.buffer = null;
    this.playbackRate = 1;
    this.source = null;
  }

  async init(audioContext, url) {
    this.audioContext = audioContext;
    this.url = url;
    return this;
  }

  setPlaybackRate(value) {
    this.playbackRate = Number(value) || 1;
    if (this.source) {
      this.source.playbackRate.value = this.playbackRate;
    }
  }

  playFromLevelTime(levelTimeUs, ctxStartTime, globalOffsetUs = 0) {
    return { levelTimeUs, ctxStartTime, globalOffsetUs };
  }

  stop() {
    if (this.source) {
      this.source.stop();
      this.source = null;
    }
  }

  setVolume(value) {
    this.volume = Number(value) || 1;
  }
}

export class HitSoundSystem {
  constructor() {
    this.audioContext = null;
    this.timelineRate = 1;
    this.scheduled = [];
  }

  async init(manifestUrl = "./sfx/hitsounds.json", countdownHitsound = "Hat") {
    this.manifestUrl = manifestUrl;
    this.countdownHitsound = countdownHitsound;
    return this;
  }

  setTimelineRate(value) {
    this.timelineRate = Number(value) || 1;
  }

  stopScheduled() {
    this.scheduled = [];
  }

  stop() {
    this.stopScheduled();
  }

  setVolume(value) {
    this.volume = Number(value) || 1;
  }
}

export class Evaluator {
  constructor() {
    this.compiled = null;
  }

  init(compiled, tUs, startFloorIndex = null) {
    this.compiled = compiled;
    this.tUs = tUs;
    this.startFloorIndex = startFloorIndex;
    return this;
  }

  evaluateAt(compiled, tUs, knownIndex = null) {
    return {
      compiled,
      tUs,
      knownIndex
    };
  }

  reset() {
    this.compiled = null;
  }
}
