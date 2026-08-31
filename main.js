import * as THREE from "three";
import JSON5 from "https://cdn.jsdelivr.net/npm/json5@2/dist/index.mjs";
import {
  degToRad,
  radToDeg,
  normalizeAngle,
  reverseAngle
} from "./src/utils/math.js";
import { EditorLogger } from "./src/utils/editor-logger.js";
import {
  EVENT_MARKER_ICONS,
  EVENT_TAB_DEFS,
  getEventDefinition,
  createEventTabGroups
} from "./src/config/event-config.js";
import { CameraSystem } from "./src/modules/camera-system.js";
import { RuntimeScene } from "./src/modules/runtime-scene.js";
import { ModifierKeyController, PlayButtonController, TileEditorUI } from "./src/modules/ui.js";
import { Clock, SongSystem, HitSoundSystem, Evaluator } from "./src/modules/audio.js";
import { Document, DocumentBuilder, Compiler } from "./src/modules/document.js";
import { InputController } from "./src/modules/input-controller.js";
import { Picker } from "./src/modules/picker.js";

const EDITOR_LOGGER = new EditorLogger();


function createEventMarkerInfo(
  actions,
  bpmBefore,
  twirlState, // false = 시계, true = 반시계
  twirlVisual = null
){

  let marker = null;

  /*
    마커 표시 우선순위

    30 = 의미 있는 SetSpeed
    20 = Twirl
    10 = 거의 변화 없는 SetSpeed (equal)
     0 = Pause / 기타 generic

    같은 우선순위에서는
    뒤의 action이 앞의 action을 덮는다.
  */
  let markerPriority =
    -Infinity;


  const setMarker = (
    nextMarker,
    priority
  ) => {

    if(
      priority <
      markerPriority
    ){
      return;
    }

    marker =
      nextMarker;

    markerPriority =
      priority;
  };


  let tempBpm =
    Number(bpmBefore);


  if(
    !Number.isFinite(tempBpm)
  ){
    tempBpm = 100;
  }


  for(
    const action
    of actions
  ){

    if(!action){
      continue;
    }


    /* =========================
       SetSpeed
    ========================= */

    if(
      action.eventType ===
      "SetSpeed"
    ){

      const oldBpm =
        tempBpm;

      let nextBpm =
        oldBpm;


      const speedType =
        String(
          action.speedType ??
          "Bpm"
        ).toLowerCase();


      if(
        speedType === "bpm"
      ){

        const value =
          Number(
            action.beatsPerMinute
          );


        if(
          Number.isFinite(value)
        ){
          nextBpm =
            value;
        }
      }

      else if(
        speedType ===
        "multiplier"
      ){

        const multiplier =
          Number(
            action.bpmMultiplier
          );


        if(
          Number.isFinite(
            multiplier
          )
        ){

          nextBpm =
            oldBpm *
            multiplier;
        }
      }


      const ratio =
        oldBpm !== 0
          ? nextBpm / oldBpm
          : 1;


      /*
        0.95x ~ 1.05x는 시각적으로 거의 동일한 속도 변화다.
        편집 중에는 equal.png, Twirl보다 낮은 우선순위,
        재생 중에는 숨김으로 처리한다.
      */
      if(
        Number.isFinite(ratio)
        &&
        ratio >= 0.95
        &&
        ratio <= 1.05
      ){

        setMarker(
          {
            type:
              "speed-equal",

            ratio,

            iconSrc:
              EVENT_MARKER_ICONS.equal
          },

          10
        );
      }


      /* 의미 있게 빨라짐 */
      else if(ratio > 1.05){

        setMarker(
          {
            type:
              "speed-up",

            ratio,

            iconSrc:
              ratio <= 2.05
                ? EVENT_MARKER_ICONS.rabbit
                : EVENT_MARKER_ICONS.rabbitFast
          },

          30
        );
      }


      /* 의미 있게 느려짐 */
      else if(ratio < 0.95){

        setMarker(
          {
            type:
              "speed-down",

            ratio,

            iconSrc:
              ratio <= 0.45
                ? EVENT_MARKER_ICONS.snailSlow
                : EVENT_MARKER_ICONS.snail
          },

          30
        );
      }


      else{

        setMarker(
          {
            type:
              "other",

            iconSrc:
              EVENT_MARKER_ICONS.star
          },

          0
        );
      }


      tempBpm =
        nextBpm;


      continue;
    }


    /* =========================
       Twirl
    ========================= */

    if(
      action.eventType ===
      "Twirl"
    ){

      /*
        Twirl의 색상은 공전 방향과 무관하다.

        이 타일의 Twirl을 밟은 뒤 계산된
        현재 -> 다음 타일의 유효 각도를 사용한다.

        180° 이상 = blue
        180° 미만 = red
      */
      const effectiveAngle =
        Number(
          twirlVisual?.effectiveAngle
        );


      const isBlue =
        Number.isFinite(
          effectiveAngle
        )
        &&
        effectiveAngle >= 180;


      const nextAbsoluteAngle =
        Number(
          twirlVisual?.nextAbsoluteAngle
        );


      /*
        Twirl 이미지 회전 규칙.

        BLUE:
          기존 규칙을 유지한다.
          원본 이미지는 90° 방향을 기준으로 하므로
          nextAbsoluteAngle - 90°를 사용한다.

          반시계 공전 상태에서는 기존 규칙대로
          추가 180° 회전을 적용한다.

        RED:
          실제 ADOFAI 표시 규칙에 맞춰
          "다음 타일의 절대각 / 2" 만큼
          반시계 방향으로 회전한다.

          Three.js의 +Z 회전은 반시계 방향이므로
          값을 그대로 양수로 넣는다.

          예:
            nextAbsoluteAngle = 135°
            -> red rotation = +67.5°
      */
      let rotationDeg =
        0;


      if(
        !isBlue
        &&
        Number.isFinite(
          nextAbsoluteAngle
        )
      ){

        rotationDeg =
          normalizeAngle(
            nextAbsoluteAngle /
            2
          );
      }
      else{

        const baseRotationDeg =
          Number.isFinite(
            nextAbsoluteAngle
          )
            ? normalizeAngle(
                nextAbsoluteAngle -
                90
              )
            : 0;


        rotationDeg =
          normalizeAngle(
            baseRotationDeg +
            (
              twirlState
                ? 180
                : 0
            )
          );
      }


      setMarker(
        {
          type:
            "twirl",

          direction:
            twirlState
              ? "counterclockwise"
              : "clockwise",

          iconSrc:
            isBlue
              ? EVENT_MARKER_ICONS.twirlBlue
              : EVENT_MARKER_ICONS.twirlRed,

          /*
            두 원본 이미지 모두 시계방향용.
            Twirl을 밟은 뒤 공전이 반시계면
            X축 거울반전한다.
          */
          mirrorX:
            Boolean(
              twirlState
            ),

          rotationDeg,

          effectiveAngle,

          nextAbsoluteAngle
        },

        20
      );


      continue;
    }


    /* =========================
       Pause + 기타 모든 이벤트
    ========================= */

    setMarker(
      {
        type:
          "other",

        iconSrc:
          EVENT_MARKER_ICONS.star
      },

      0
    );
  }


  return marker;
}

/*
  한 타일의 여러 action 중
  최종적으로 화면에 보여줄 이벤트 마커를 결정한다.

  같은 타일에 여러 이벤트가 있으면
  actions 배열에서 뒤의 이벤트가 앞의 이벤트를 덮는다.
*/


function ease(t, ease = 'linear'){
  t = Math.min(1, Math.max(0, t));
  const e = ease.toLowerCase()
  switch(e) {
    case 'linear': //선형
      return t;
      
    case 'inquad': //2차함수
      return t**2;
    
    case 'outquad':
      return -1*(1-t)**2+1;
      
    case 'inoutquad':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    
    case 'inqubic': //3차함수
      return t*t*t;
    
    case 'outqubic':
      return 1-(1-t)**3;
    
    case 'inoutcubic':
      return t < 0.5 ? 4 * t * t * t : 1 - 4 * Math.pow(1 - t, 3);
    
    case 'inexpo':
      return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
    
    case 'outexpo':
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      
    case 'inoutexpo':
      if (t === 0) return 0;
      if (t === 1) return 1;
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    
    case 'inback': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return c3 * t * t * t - c1 * t * t;
    }
    
    case 'outback': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    
    case 'inoutback': {
      const c1 = 1.70158;
      const c2 = c1 * 1.525;
      return t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    }
    
    case 'outbounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
    
      if (t < 1 / d1) {
        return n1 * t * t;
      } else if (t < 2 / d1) {
        t -= 1.5 / d1;
        return n1 * t * t + 0.75;
      } else if (t < 2.5 / d1) {
        t -= 2.25 / d1;
        return n1 * t * t + 0.9375;
      } else {
        t -= 2.625 / d1;
        return n1 * t * t + 0.984375;
      }
    }
    
    case 'inbounce':
      return 1 - ease(1 - t, 'outbounce');
    
    case 'inoutbounce':
      return t < 0.5
        ? (1 - ease(1 - 2 * t, 'outbounce')) / 2
        : (1 + ease(2 * t - 1, 'outbounce')) / 2;
    
    case 'outelastic': {
      const c4 = (2 * Math.PI) / 3;
      return t === 0
        ? 0
        : t === 1
        ? 1
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }
    
    case 'inelastic': {
      const c4 = (2 * Math.PI) / 3;
      return t === 0
        ? 0
        : t === 1
        ? 1
        : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    }
    
    
    
    default:
      return t;
  }
}


class Floor{
  constructor(id, x,y, startAngle, endAngle, option = {isTwirled : false, isFullspin : false, isMidspin : false}){
    this.id = id ///f_3, f_7...
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.x = x;
    this.y = y;
    this.option = option
  }
}

//파일을 저장할 프로젝트
class Project{
  constructor(){
    this.json = null; //불러온 json 자체가 이곳에 저장
  }
}

//앱
class EditorApp{
  constructor(){
    this.project = null
    this.doc = null;
    
    this.builder = new DocumentBuilder();
    this.compiler = new Compiler();
    
    this.runtime = new RuntimeScene(THREE);
    this.cameraSystem = new CameraSystem(THREE);
    this.renderEngine = null
    this.input = null;
    this.state = new EditorState();
    
    this.modifierKeys = new ModifierKeyController();
    this.playButton = new PlayButtonController();
    
    this.prevFloorButton = null;
    this.nextFloorButton = null;

    /* =========================
       Undo / Redo
    ========================= */

    this.undoButton = null;
    this.redoButton = null;

    this.undoStack = [];
    this.redoStack = [];

    this.historyLimit = 120;
    this.historyRestoring = false;
    this.historyInitialized = false;
    
    /* =========================
       Internal Clipboards
    ========================= */

    this.copyTilesButton = null;
    this.pasteTilesButton = null;
    this.tileClipboard = null;
    this.eventClipboard = null;
    this.clipboardInitialized = false;

    this.editorUI = new TileEditorUI();
    
    this.resizeObserver = null;
    
    this.resizeRaf = null;
    
    

    this.pendingViewportSize = {
      width: 0,
      height: 0
    };
    
    this.viewportSize = {
      width: 0,
      height: 0
    };
    
    this.evaluator = new Evaluator();
    this.clock = new Clock();
    
    this.hitSound = new HitSoundSystem();
    
    this.song = new SongSystem();

    /*
      Editor-only playback compensation.

      Positive value = delay level visuals.
      Negative value = advance level visuals.

      IMPORTANT:
      This value must NOT move only the song or only the hitsounds.
      Song + hitsounds stay on the same level clock; only the visual
      evaluator is shifted. This avoids the old bug where an editor
      offset could make the music drift away from hitsounds.
    */
    this.editorVisualOffset_ms = 0;

    /*
      Deprecated compatibility field. Older code used this as a
      song-only offset. Keep it at zero so old callers cannot
      accidentally separate music from the hitsound timeline.
    */
    this.editorGlobalOffset_ms = 0;
    
    this.playbackFloorIndex = null;
    
    this.playTargetIndex = null;

    this.playTarget_us = null;

    /* =========================
       Project settings / local files
    ========================= */

    this.projectSettingsInitialized =
      false;

    this.editorSettingsInitialized =
      false;

    this.editorInfoVisible =
      true;

    this.editorInfoElement =
      null;

    this.currentLevelSource =
      null;

    this.localSongObjectUrl =
      null;

    this.songLoadState = {
      loaded: false,
      message: ""
    };

    /* =========================
       Autosave / restore
    ========================= */

    this.autosaveStorageKey =
      "adofai-editor-autosave-v1";

    this.autosaveSongCacheKey =
      null;

    this.autosaveInitialized =
      false;

    this.autosaveTimer =
      null;

    this.autosaveInterval =
      null;

    this.autosaveDelay_ms =
      900;

    this.autosaveInterval_ms =
      15000;

    /*
      Clear Cache suppresses background writes until the user makes
      another edit. This prevents pagehide/15s autosave from instantly
      recreating the data that was just deleted.
    */
    this.autosaveSuppressed = false;

    this.logger = EDITOR_LOGGER;
    this.diagnosticsInitialized = false;
    this.logUnsubscribe = null;

    this.levelStarted = false;

    this.initDiagnostics();
  }

  /* =========================================================
     Diagnostics / user-facing notifications
  ========================================================= */

  initDiagnostics(){
    if(this.diagnosticsInitialized){
      return;
    }

    this.logger.installConsoleCapture();

    window.addEventListener(
      "error",
      event => {
        const error =
          event.error ??
          new Error(
            event.message ||
            "Unknown window error"
          );

        this.reportError(
          error,
          "Unhandled error"
        );
      }
    );

    window.addEventListener(
      "unhandledrejection",
      event => {
        const reason =
          event.reason instanceof Error
            ? event.reason
            : new Error(
                this.logger.formatValue(
                  event.reason
                )
              );

        this.reportError(
          reason,
          "Unhandled promise rejection"
        );
      }
    );

    this.diagnosticsInitialized = true;

    this.logger.info(
      "Editor session started",
      {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        dpr: window.devicePixelRatio || 1
      }
    );
  }

  showToast(
    message,
    type = "info",
    duration_ms = 3200
  ){
    const container =
      document.getElementById(
        "editor-toast-container"
      );

    if(!container){
      return false;
    }

    const toast =
      document.createElement(
        "div"
      );

    toast.className =
      `editor-toast ${type}`;

    toast.textContent =
      String(message ?? "");

    container.appendChild(toast);

    const remove = () => {
      toast.classList.add(
        "leaving"
      );

      window.setTimeout(
        () => toast.remove(),
        220
      );
    };

    window.setTimeout(
      remove,
      Math.max(1000, duration_ms)
    );

    return true;
  }

  readEditorPreference(
    key,
    fallback = null
  ){
    try{
      const value =
        localStorage.getItem(key);

      return value === null
        ? fallback
        : value;
    }
    catch(error){
      this.logger.warn(
        "Could not read editor preference",
        key,
        error
      );
      return fallback;
    }
  }

  writeEditorPreference(
    key,
    value
  ){
    try{
      localStorage.setItem(
        key,
        String(value)
      );
      return true;
    }
    catch(error){
      this.logger.warn(
        "Could not save editor preference",
        key,
        error
      );
      return false;
    }
  }

  reportError(
    error,
    context = "Editor error",
    { toast = true } = {}
  ){
    const normalized =
      error instanceof Error
        ? error
        : new Error(
            String(error ?? "Unknown error")
          );

    this.logger.error(
      context,
      normalized
    );

    if(toast){
      this.showToast(
        `${context}. Open Debug Logs for details.`,
        "error",
        5000
      );
    }

    return normalized;
  }

  refreshDebugLogView(){
    const output =
      document.getElementById(
        "editor-log-output"
      );

    if(!output){
      return;
    }

    output.textContent =
      this.logger.toText();

    output.scrollTop =
      output.scrollHeight;
  }

  openDebugLogs(){
    const overlay =
      document.getElementById(
        "editor-log-overlay"
      );

    if(!overlay){
      return false;
    }

    this.refreshDebugLogView();
    overlay.hidden = false;
    return true;
  }

  closeDebugLogs(){
    const overlay =
      document.getElementById(
        "editor-log-overlay"
      );

    if(overlay){
      overlay.hidden = true;
    }
  }

  async copyDebugLogs(){
    const text =
      this.logger.toText();

    try{
      if(
        navigator.clipboard &&
        window.isSecureContext
      ){
        await navigator.clipboard
          .writeText(text);
      }
      else{
        const textarea =
          document.createElement(
            "textarea"
          );

        textarea.value = text;
        textarea.style.position =
          "fixed";
        textarea.style.opacity =
          "0";

        document.body.appendChild(
          textarea
        );

        textarea.select();
        document.execCommand(
          "copy"
        );
        textarea.remove();
      }

      this.showToast(
        "Debug logs copied.",
        "success"
      );

      return true;
    }
    catch(error){
      this.reportError(
        error,
        "Could not copy debug logs"
      );
      return false;
    }
  }

  formatPlaybackTime(seconds){
    const value =
      Number(seconds);

    if(!Number.isFinite(value)){
      return "--:--.---";
    }

    const safe =
      Math.max(0, value);

    const minutes =
      Math.floor(safe / 60);

    const secs =
      safe - minutes * 60;

    return (
      String(minutes).padStart(2, "0") +
      ":" +
      secs.toFixed(3).padStart(6, "0")
    );
  }

  async deleteAutosaveDatabase(){
    if(!window.indexedDB){
      return true;
    }

    return await new Promise(
      (resolve, reject) => {
        const request =
          indexedDB.deleteDatabase(
            "adofai-web-editor"
          );

        request.onsuccess =
          () => resolve(true);

        request.onerror =
          () => reject(
            request.error ??
            new Error(
              "IndexedDB delete failed."
            )
          );

        request.onblocked =
          () => reject(
            new Error(
              "IndexedDB delete was blocked."
            )
          );
      }
    );
  }

  async clearAllEditorCache(){
    /* Stop timers from recreating the just-deleted autosave. */
    this.autosaveSuppressed = true;

    if(this.autosaveTimer !== null){
      clearTimeout(
        this.autosaveTimer
      );
      this.autosaveTimer = null;
    }

    try{
      const localKeys = [];

      for(let i = 0; i < localStorage.length; i++){
        const key = localStorage.key(i);
        if(
          key &&
          key.startsWith(
            "adofai-editor-"
          )
        ){
          localKeys.push(key);
        }
      }

      for(const key of localKeys){
        localStorage.removeItem(key);
      }

      const sessionKeys = [];

      for(let i = 0; i < sessionStorage.length; i++){
        const key = sessionStorage.key(i);
        if(
          key &&
          key.startsWith(
            "adofai-editor-"
          )
        ){
          sessionKeys.push(key);
        }
      }

      for(const key of sessionKeys){
        sessionStorage.removeItem(key);
      }

      await this.deleteAutosaveDatabase();

      if("caches" in window){
        const cacheNames =
          await caches.keys();

        for(const name of cacheNames){
          if(/adofai/i.test(name)){
            await caches.delete(name);
          }
        }
      }

      this.autosaveSongCacheKey = null;

      /*
        Clear old saved logs as part of cache deletion. Keep new logs
        in memory only until the user makes another real edit.
      */
      this.logger.clear({
        persist: false
      });
      this.logger.setPersistenceEnabled(
        false
      );

      const gridInput =
        document.getElementById(
          "editor-setting-grid"
        );

      const infoInput =
        document.getElementById(
          "editor-setting-info"
        );

      const offsetInput =
        document.getElementById(
          "editor-setting-offset"
        );

      if(gridInput){
        gridInput.checked = true;
      }

      if(infoInput){
        infoInput.checked = true;
      }

      if(offsetInput){
        offsetInput.value = "0";
      }

      this.setEditorOffset(
        0,
        {
          persist: false,
          log: false
        }
      );

      this.runtime.setGridVisible(true);
      this.setEditorInfoVisible(true);
      this.refreshDebugLogView();

      this.showToast(
        "All editor cache has been deleted.",
        "success",
        4200
      );

      return true;
    }
    catch(error){
      this.reportError(
        error,
        "Could not clear all editor cache"
      );
      return false;
    }
  }

  /* =========================================================
     Autosave

     - Level JSON: localStorage
     - Local song Blob: IndexedDB

     Audio is deliberately kept out of localStorage because a
     normal song file can easily exceed localStorage's quota.
  ========================================================= */

  readAutosaveRecord(){

    try{

      const text =
        localStorage.getItem(
          this.autosaveStorageKey
        );

      if(!text){
        return null;
      }

      const record =
        JSON.parse(text);

      if(
        !record ||
        record.version !== 1 ||
        !record.project
      ){
        return null;
      }

      return record;
    }
    catch(error){

      console.warn(
        "Could not read editor autosave.",
        error
      );

      return null;
    }
  }

  getAutosaveSource(){

    const source =
      this.currentLevelSource;

    if(!source){
      return null;
    }

    return {
      type:
        source.type ?? null,

      name:
        source.name ?? null,

      url:
        source.url ?? null
    };
  }

  saveAutosaveNow(){

    if(this.autosaveSuppressed){
      return false;
    }

    if(!this.doc){
      return false;
    }

    const project =
      this.createDownloadProjectJson();

    if(!project){
      return false;
    }

    const record = {
      version: 1,
      savedAt: Date.now(),
      project,
      source: this.getAutosaveSource(),
      songCacheKey:
        this.autosaveSongCacheKey ?? null
    };

    try{

      localStorage.setItem(
        this.autosaveStorageKey,
        JSON.stringify(record)
      );

      return true;
    }
    catch(error){

      /*
        A very large level may exceed localStorage quota.
        Editing continues normally; only autosave is skipped.
      */
      console.warn(
        "Editor autosave failed. The level may be too large for localStorage.",
        error
      );

      return false;
    }
  }

  scheduleAutosave(
    delay_ms = this.autosaveDelay_ms
  ){

    if(
      this.autosaveSuppressed ||
      !this.autosaveInitialized
    ){
      return;
    }

    if(this.autosaveTimer !== null){
      clearTimeout(
        this.autosaveTimer
      );
    }

    this.autosaveTimer =
      setTimeout(
        () => {
          this.autosaveTimer = null;
          this.saveAutosaveNow();
        },
        Math.max(0, delay_ms)
      );
  }

  initAutosave(){

    if(this.autosaveInitialized){
      return;
    }

    this.autosaveInitialized =
      true;

    const flush =
      () => {
        this.saveAutosaveNow();
      };

    /*
      pagehide works better than beforeunload on mobile browsers.
    */
    window.addEventListener(
      "pagehide",
      flush
    );

    window.addEventListener(
      "beforeunload",
      flush
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        if(
          document.visibilityState ===
          "hidden"
        ){
          flush();
        }
      }
    );

    this.autosaveInterval =
      setInterval(
        flush,
        this.autosaveInterval_ms
      );
  }

  openAutosaveDatabase(){

    return new Promise(
      (resolve, reject) => {

        if(!window.indexedDB){
          reject(
            new Error(
              "IndexedDB is unavailable."
            )
          );
          return;
        }

        const request =
          indexedDB.open(
            "adofai-web-editor",
            1
          );

        request.onupgradeneeded =
          () => {

            const db =
              request.result;

            if(
              !db.objectStoreNames
                .contains("assets")
            ){
              db.createObjectStore(
                "assets"
              );
            }
          };

        request.onsuccess =
          () => resolve(
            request.result
          );

        request.onerror =
          () => reject(
            request.error ??
            new Error(
              "IndexedDB open failed."
            )
          );
      }
    );
  }

  async writeAutosaveAsset(
    key,
    value
  ){

    let db = null;

    try{

      db =
        await this.openAutosaveDatabase();

      await new Promise(
        (resolve, reject) => {

          const transaction =
            db.transaction(
              "assets",
              "readwrite"
            );

          transaction.objectStore(
            "assets"
          ).put(
            value,
            key
          );

          transaction.oncomplete =
            () => resolve();

          transaction.onerror =
            () => reject(
              transaction.error
            );
        }
      );

      return true;
    }
    catch(error){

      console.warn(
        "Could not cache local song.",
        error
      );

      return false;
    }
    finally{
      db?.close();
    }
  }

  async readAutosaveAsset(
    key
  ){

    if(!key){
      return null;
    }

    let db = null;

    try{

      db =
        await this.openAutosaveDatabase();

      return await new Promise(
        (resolve, reject) => {

          const transaction =
            db.transaction(
              "assets",
              "readonly"
            );

          const request =
            transaction.objectStore(
              "assets"
            ).get(key);

          request.onsuccess =
            () => resolve(
              request.result ?? null
            );

          request.onerror =
            () => reject(
              request.error
            );
        }
      );
    }
    catch(error){

      console.warn(
        "Could not restore cached local song.",
        error
      );

      return null;
    }
    finally{
      db?.close();
    }
  }

  async cacheLocalSongForAutosave(
    file
  ){

    if(!file){
      return false;
    }

    const key =
      "last-local-song-v1";

    const saved =
      await this.writeAutosaveAsset(
        key,
        {
          blob: file,
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified:
            file.lastModified ?? 0,
          savedAt: Date.now()
        }
      );

    if(saved){
      this.autosaveSongCacheKey =
        key;
    }

    return saved;
  }

  async restoreAutosavedSong(){

    const key =
      this.autosaveSongCacheKey;

    if(!key || !this.hitSound.ctx){
      return false;
    }

    const record =
      await this.readAutosaveAsset(
        key
      );

    if(!record?.blob){
      return false;
    }

    const expectedName =
      String(
        this.doc?.settings
          ?.songFilename ??
        ""
      ).trim();

    /*
      Never attach an old cached song to a different level just
      because the browser still has the Blob in IndexedDB.
    */
    if(
      expectedName &&
      record.name &&
      expectedName !== record.name
    ){
      return false;
    }

    if(this.localSongObjectUrl){
      URL.revokeObjectURL(
        this.localSongObjectUrl
      );
    }

    this.localSongObjectUrl =
      URL.createObjectURL(
        record.blob
      );

    const loaded =
      await this.song.init(
        this.hitSound.ctx,
        this.localSongObjectUrl
      );

    if(!loaded){
      return false;
    }

    const volume =
      Number(
        this.doc?.settings?.volume ??
        100
      );

    this.song.setVolume(
      Number.isFinite(volume)
        ? Math.max(0, volume) / 100
        : 1
    );

    this.songLoadState = {
      loaded: true,
      message:
        `Song restored from this browser: ${record.name ?? expectedName ?? "song"}`
    };

    return true;
  }
  
  async loadProject(path){ //일단 level.adofai만 가져오는걸로

    this.logger.info(
      "Loading initial project",
      path
    );

    this.setLevelLoading(
      true,
      "loading..."
    );

    /*
      Initial page load prefers the last autosaved level.
      If no autosave exists, fall back to ./level.adofai as before.
    */
    const autosaveRecord =
      this.readAutosaveRecord();

    let json = null;
    let restoredFromAutosave =
      false;

    if(autosaveRecord?.project){

      json =
        autosaveRecord.project;

      restoredFromAutosave =
        true;

      this.autosaveSongCacheKey =
        autosaveRecord.songCacheKey ??
        null;
    }
    else{

      const res =
        await fetch(path);

      if(!res.ok){
        throw new Error(
          "level load failed!"
        );
      }

      const text =
        (await res.text())
          .replace(/\r/g, "")
          .replace(/\n/g, "");

      json =
        JSON5.parse(text);
    }
    
    //console.log(json)
    
    this.project = new Project(); 
    this.project.json = json;
    
    //document를 project로부터 생성
    this.doc = this.builder.fromProject(this.project);
    
    this.updateProjectTitle();
    
    this.runtime.init(); //초기 셋팅
    //init을 통해 renderer를 만들어준 후 인풋 추가
    
    this.cameraSystem.init(this.runtime.renderer.domElement);
    this.input = new InputController(this.runtime, this.cameraSystem);
    
    this.renderEngine = new RenderEngine(this.runtime, this.cameraSystem, this.clock);

    this.renderEngine.afterFrame =
      () => {
        this.updateEditorInfo();
      };

    this.modifierKeys.init();
    
    this.playButton.init(
      () => {
        this.togglePlayback();
      }
    );
    
    this.initFloorNavigation();

    this.initHistoryControls();
    this.resetHistory();

    this.initClipboardControls();
    
    
    this.editorUI.init({

      onAddAngle: (
        angle,
        options = {}
      ) => {

        this.addFloorAfterSelected(
          angle,
          options
        );
      },
    
    
      onAddFullspin: () => {
    
        this.addFullspinAfterSelected();
      },
    
    
      onAddMidspin: () => {
    
        this.addMidspinAfterSelected();
      },
    
    
      onDeleteFloor: () => {
    
        this.deleteSelectedFloor();
      },
    
    
      onDeleteSelected: () => {
    
        this.removeSelectedFloors();
      },
      
      onUpdateEvent: (
        action,
        patch
      ) => {
      
        this.updateEventAction(
          action,
          patch
        );
      },

      onAddEvent:
        eventType => {

          return this.addEventToSelected(
            eventType
          );
        },
      
      onDeleteEvent:
        action => {
      
          return this.deleteEventAction(
            action
          );
        },

      onCopyEvent:
        action => {
          return this.copyEventAction(
            action
          );
        },

      onPasteEvent:
        () => {
          return this.pasteEventToSelected();
        },
    
    });

    this.initProjectSettingsUI();

    this.initEditorSettingsUI();

    this.initWelcomeNotice();

    this.initResponsiveViewport();


    // 선택 callback 먼저
    this.input.callback.onSelectFloor =
      floorId => {
        this.selectFloor(floorId);
      };
    
    
    // ==========================
    // 화면은 즉시 실행
    // ==========================

    requestAnimationFrame(
      () => {

        requestAnimationFrame(
          () => {

            this.setLevelLoading(
              false
            );

          }
        );

      }
    );
    
    this.rebuild();
    
    this.setEdit();
    
    this.renderEngine.start();
    
    
    // ==========================
    // 오디오는 이후 로딩
    // ==========================
    
    await this.hitSound.init();

    this.refreshHitsoundSettingOptions();
    this.updateEditorUI();
        
    
    this.clock.setAudioContext(
      this.hitSound.ctx
    );
    
    
    if(restoredFromAutosave){

      const savedSource =
        autosaveRecord?.source ??
        null;

      this.currentLevelSource = {
        type: "autosave",
        name:
          savedSource?.name ??
          "Autosaved Level",
        url:
          savedSource?.url ??
          null
      };
    }
    else{

      this.currentLevelSource = {
        type: "url",
        name:
          String(path).split("/").pop() ||
          String(path),
        url:
          new URL(
            path,
            window.location.href
          ).href
      };
    }


    let songLoaded =
      false;


    if(restoredFromAutosave){

      /*
        Local user-selected songs are restored from IndexedDB.
      */
      songLoaded =
        await this.restoreAutosavedSong();


      /*
        URL-based levels do not need to duplicate the whole song
        in browser storage. If the original URL is still reachable,
        load songFilename relative to it.
      */
      if(
        !songLoaded &&
        autosaveRecord?.source?.url
      ){
        songLoaded =
          await this.loadSongFromProjectUrl(
            autosaveRecord.source.url
          );
      }


      if(!songLoaded){

        await this.song.init(
          this.hitSound.ctx,
          null
        );

        const expectedSong =
          String(
            this.doc?.settings
              ?.songFilename ??
            ""
          ).trim();

        this.songLoadState = {
          loaded: false,
          message:
            expectedSong
              ? `Level restored. Please choose ${expectedSong} again if the cached song is unavailable.`
              : "Level restored. No song is assigned."
        };
      }
    }
    else{

      songLoaded =
        await this.loadSongFromProjectUrl(
          path
        );
    }


    this.initAutosave();

    /*
      Establish a fresh snapshot after startup as well.
    */
    this.scheduleAutosave(
      0
    );


    this.refreshProjectSettingsUI();

    this.logger.info(
      "Initial project ready",
      {
        restoredFromAutosave,
        tiles: this.doc?.ids?.length ?? 0,
        events: this.doc?.actions?.length ?? 0,
        songLoaded
      }
    );


    /*
      Do not open Level Settings automatically on the first page load.
      Missing song information is still shown when the user opens
      Level Settings manually.
    */
  }
  
  /* =========================================================
     First-launch notice
  ========================================================= */

  initWelcomeNotice(){

    const overlay =
      document.getElementById(
        "editor-welcome-overlay"
      );

    const closeButton =
      document.getElementById(
        "editor-welcome-continue"
      );

    if(!overlay || !closeButton){
      return;
    }

    /*
      The legal / sharing notice is intentionally shown on every
      page load. It is session UI, not a remembered preference.
    */
    overlay.hidden = false;

    closeButton.addEventListener(
      "click",
      () => {
        overlay.hidden = true;
      }
    );
  }


  /* =========================================================
     Editor Settings UI

     These settings belong to the web editor itself and are
     intentionally kept out of the .adofai project data.
  ========================================================= */

  initEditorSettingsUI(){

    if(
      this.editorSettingsInitialized
    ){
      return;
    }

    const button =
      document.getElementById(
        "editor-settings-button"
      );

    const overlay =
      document.getElementById(
        "editor-settings-overlay"
      );

    const sheet =
      document.getElementById(
        "editor-settings-sheet"
      );

    const closeButton =
      document.getElementById(
        "editor-settings-close"
      );

    const gridInput =
      document.getElementById(
        "editor-setting-grid"
      );

    const infoInput =
      document.getElementById(
        "editor-setting-info"
      );

    const offsetInput =
      document.getElementById(
        "editor-setting-offset"
      );

    const openLogsButton =
      document.getElementById(
        "editor-open-logs-button"
      );

    const clearCacheButton =
      document.getElementById(
        "editor-clear-cache-button"
      );

    const logOverlay =
      document.getElementById(
        "editor-log-overlay"
      );

    const logSheet =
      document.getElementById(
        "editor-log-sheet"
      );

    const logCloseButton =
      document.getElementById(
        "editor-log-close"
      );

    const logCopyButton =
      document.getElementById(
        "editor-log-copy"
      );

    const logClearButton =
      document.getElementById(
        "editor-log-clear"
      );

    this.editorInfoElement =
      document.getElementById(
        "editor-info"
      );

    if(
      !button ||
      !overlay ||
      !sheet ||
      !closeButton ||
      !gridInput ||
      !infoInput ||
      !offsetInput ||
      !openLogsButton ||
      !clearCacheButton ||
      !logOverlay ||
      !logSheet ||
      !logCloseButton ||
      !logCopyButton ||
      !logClearButton ||
      !this.editorInfoElement
    ){
      throw new Error(
        "editor settings UI element not found"
      );
    }


    /*
      Settings panels should never appear automatically
      when the editor first opens.
    */
    overlay.hidden =
      true;


    const savedGrid =
      this.readEditorPreference(
        "adofai-editor-grid",
        null
      );

    const showGrid =
      savedGrid !== "false";

    gridInput.checked =
      showGrid;

    this.runtime.setGridVisible(
      showGrid
    );

    const savedInfo =
      this.readEditorPreference(
        "adofai-editor-info",
        null
      );

    const showInfo =
      savedInfo !== "false";

    infoInput.checked =
      showInfo;

    this.setEditorInfoVisible(
      showInfo
    );

    const savedOffset =
      Number(
        this.readEditorPreference(
          "adofai-editor-offset-ms",
          "0"
        )
      );

    const editorOffset =
      Number.isFinite(savedOffset)
        ? savedOffset
        : 0;

    this.setEditorOffset(
      editorOffset,
      {
        persist: false,
        log: false
      }
    );

    offsetInput.value =
      String(editorOffset);

    button.addEventListener(
      "click",
      () => {
        overlay.hidden = false;
      }
    );

    closeButton.addEventListener(
      "click",
      () => {
        overlay.hidden = true;
      }
    );

    overlay.addEventListener(
      "pointerdown",
      e => {
        if(e.target === overlay){
          overlay.hidden = true;
        }
      }
    );

    sheet.addEventListener(
      "pointerdown",
      e => {
        e.stopPropagation();
      }
    );

    window.addEventListener(
      "keydown",
      e => {
        if(e.key !== "Escape"){
          return;
        }

        if(!logOverlay.hidden){
          this.closeDebugLogs();
          return;
        }

        if(!overlay.hidden){
          overlay.hidden = true;
        }
      }
    );

    gridInput.addEventListener(
      "change",
      () => {

        const visible =
          gridInput.checked;

        this.runtime.setGridVisible(
          visible
        );

        this.writeEditorPreference(
          "adofai-editor-grid",
          visible
        );
      }
    );

    infoInput.addEventListener(
      "change",
      () => {

        const visible =
          infoInput.checked;

        this.setEditorInfoVisible(
          visible
        );

        this.writeEditorPreference(
          "adofai-editor-info",
          visible
        );
      }
    );

    const commitEditorOffset =
      () => {

        const value =
          Number(offsetInput.value);

        if(!Number.isFinite(value)){
          offsetInput.value =
            String(this.editorVisualOffset_ms);
          return;
        }

        this.setEditorOffset(value);

        offsetInput.value =
          String(this.editorVisualOffset_ms);
      };

    offsetInput.addEventListener(
      "change",
      commitEditorOffset
    );

    offsetInput.addEventListener(
      "keydown",
      e => {
        if(e.key === "Enter"){
          e.preventDefault();
          commitEditorOffset();
          offsetInput.blur();
        }
      }
    );

    openLogsButton.addEventListener(
      "click",
      () => {
        this.openDebugLogs();
      }
    );

    clearCacheButton.addEventListener(
      "click",
      async () => {
        await this.clearAllEditorCache();
      }
    );

    logCloseButton.addEventListener(
      "click",
      () => {
        this.closeDebugLogs();
      }
    );

    logOverlay.addEventListener(
      "pointerdown",
      e => {
        if(e.target === logOverlay){
          this.closeDebugLogs();
        }
      }
    );

    logSheet.addEventListener(
      "pointerdown",
      e => {
        e.stopPropagation();
      }
    );

    logCopyButton.addEventListener(
      "click",
      async () => {
        await this.copyDebugLogs();
      }
    );

    logClearButton.addEventListener(
      "click",
      () => {
        this.logger.clear();
        this.refreshDebugLogView();
        this.showToast(
          "Debug logs cleared.",
          "success"
        );
      }
    );

    this.logUnsubscribe =
      this.logger.subscribe(
        () => {
          if(!logOverlay.hidden){
            this.refreshDebugLogView();
          }
        }
      );

    this.refreshDebugLogView();

    this.editorSettingsInitialized =
      true;
  }

  /* =========================================================
     Project Settings UI
  ========================================================= */

  initProjectSettingsUI(){

    if(
      this.projectSettingsInitialized
    ){
      return;
    }


    const settingsButton =
      document.getElementById(
        "project-settings-button"
      );

    const overlay =
      document.getElementById(
        "project-settings-overlay"
      );

    const sheet =
      document.getElementById(
        "project-settings-sheet"
      );

    const closeButton =
      document.getElementById(
        "project-settings-close"
      );

    const levelInput =
      document.getElementById(
        "level-file-input"
      );

    const songInput =
      document.getElementById(
        "song-file-input"
      );

    const loadLevelButton =
      document.getElementById(
        "load-level-file-button"
      );

    const newLevelButton =
      document.getElementById(
        "new-level-button"
      );

    const downloadLevelButton =
      document.getElementById(
        "download-level-button"
      );

    const chooseSongButton =
      document.getElementById(
        "choose-song-file-button"
      );


    if(
      !settingsButton ||
      !overlay ||
      !sheet ||
      !closeButton ||
      !levelInput ||
      !songInput
    ){
      throw new Error(
        "project settings UI element not found"
      );
    }


    /*
      Level Settings is opened only by an explicit user action.
    */
    overlay.hidden =
      true;


    settingsButton.addEventListener(
      "click",
      () => {
        this.openProjectSettings();
      }
    );


    closeButton.addEventListener(
      "click",
      () => {
        this.closeProjectSettings();
      }
    );


    overlay.addEventListener(
      "pointerdown",
      e => {

        if(e.target === overlay){
          this.closeProjectSettings();
        }
      }
    );


    sheet.addEventListener(
      "pointerdown",
      e => {
        e.stopPropagation();
      }
    );


    window.addEventListener(
      "keydown",
      e => {

        if(
          e.key === "Escape" &&
          !overlay.hidden
        ){
          this.closeProjectSettings();
        }
      }
    );


    loadLevelButton?.addEventListener(
      "click",
      () => {
        levelInput.click();
      }
    );


    newLevelButton?.addEventListener(
      "click",
      async () => {
        await this.createNewLevel();
      }
    );


    downloadLevelButton?.addEventListener(
      "click",
      () => {
        this.downloadLevel();
      }
    );


    chooseSongButton?.addEventListener(
      "click",
      () => {
        songInput.click();
      }
    );


    levelInput.addEventListener(
      "change",
      async () => {

        const file =
          levelInput.files?.[0];

        levelInput.value = "";

        if(!file){
          return;
        }

        await this.loadProjectFromFile(
          file
        );
      }
    );


    songInput.addEventListener(
      "change",
      async () => {

        const file =
          songInput.files?.[0];

        songInput.value = "";

        if(!file){
          return;
        }

        await this.selectSongFile(
          file
        );
      }
    );


    const bindText = (
      id,
      key
    ) => {

      const input =
        document.getElementById(id);

      input?.addEventListener(
        "change",
        () => {
          this.applyProjectSetting(
            key,
            input.value
          );
        }
      );
    };


    const bindNumber = (
      id,
      key,
      {
        min = null,
        max = null
      } = {}
    ) => {

      const input =
        document.getElementById(id);

      input?.addEventListener(
        "change",
        () => {

          let value =
            Number(input.value);


          if(!Number.isFinite(value)){
            this.refreshProjectSettingsUI();
            return;
          }


          if(min !== null){
            value = Math.max(min, value);
          }

          if(max !== null){
            value = Math.min(max, value);
          }


          input.value =
            String(value);


          this.applyProjectSetting(
            key,
            value
          );
        }
      );
    };


    bindText(
      "settings-artist",
      "artist"
    );

    bindText(
      "settings-song",
      "song"
    );

    bindText(
      "settings-author",
      "author"
    );


    bindNumber(
      "settings-bpm",
      "bpm",
      { min: 0.001 }
    );

    bindNumber(
      "settings-volume",
      "volume",
      {
        min: 0,
        max: 100
      }
    );

    bindNumber(
      "settings-offset",
      "offset"
    );

    bindNumber(
      "settings-pitch",
      "pitch",
      { min: 1 }
    );

    bindText(
      "settings-hitsound",
      "hitsound"
    );

    bindNumber(
      "settings-hitsound-volume",
      "hitsoundVolume",
      {
        min: 0,
        max: 100
      }
    );


    this.projectSettingsInitialized =
      true;
  }


  openProjectSettings(){

    const overlay =
      document.getElementById(
        "project-settings-overlay"
      );

    if(!overlay){
      return;
    }


    this.refreshProjectSettingsUI();

    overlay.hidden =
      false;
  }


  closeProjectSettings(){

    const overlay =
      document.getElementById(
        "project-settings-overlay"
      );

    if(overlay){
      overlay.hidden = true;
    }
  }


  refreshHitsoundSettingOptions(){

    const select =
      document.getElementById(
        "settings-hitsound"
      );


    if(!select){
      return;
    }


    const currentValue =
      String(
        this.doc?.settings
          ?.hitsound ??
        "Kick"
      );


    const options =
      (
        this.hitSound
          ?.getAvailableHitsoundOptions?.()
        ??
        [
          {
            value: "None",
            label: "None"
          },
          {
            value: "Kick",
            label: "Kick"
          }
        ]
      )
      .map(
        option => ({
          value:
            String(
              option?.value ??
              option
            ),

          label:
            String(
              option?.label ??
              option?.value ??
              option
            )
        })
      );


    if(
      currentValue &&
      !options.some(
        option =>
          option.value ===
          currentValue
      )
    ){

      options.push({
        value:
          currentValue,

        label:
          currentValue
      });
    }


    select.innerHTML =
      "";


    for(
      const optionInfo
      of options
    ){

      const option =
        document.createElement(
          "option"
        );


      option.value =
        optionInfo.value;

      option.textContent =
        optionInfo.label;

      select.appendChild(
        option
      );
    }


    select.value =
      currentValue;
  }


  refreshProjectSettingsUI(){

    const settings =
      this.doc?.settings ?? {};


    this.refreshHitsoundSettingOptions();


    const setValue = (
      id,
      value
    ) => {

      const element =
        document.getElementById(id);

      if(element){
        element.value =
          value ?? "";
      }
    };


    setValue(
      "settings-song-filename",
      settings.songFilename ?? ""
    );

    setValue(
      "settings-bpm",
      Number.isFinite(
        Number(settings.bpm)
      )
        ? Number(settings.bpm)
        : 100
    );

    setValue(
      "settings-volume",
      Number.isFinite(
        Number(settings.volume)
      )
        ? Number(settings.volume)
        : 100
    );

    setValue(
      "settings-offset",
      Number.isFinite(
        Number(settings.offset)
      )
        ? Number(settings.offset)
        : 0
    );

    setValue(
      "settings-pitch",
      Number.isFinite(
        Number(settings.pitch)
      )
        ? Number(settings.pitch)
        : 100
    );

    setValue(
      "settings-hitsound",
      String(
        settings.hitsound ??
        "Kick"
      )
    );

    setValue(
      "settings-hitsound-volume",
      Number.isFinite(
        Number(
          settings.hitsoundVolume
        )
      )
        ? Number(
            settings.hitsoundVolume
          )
        : 100
    );

    setValue(
      "settings-artist",
      settings.artist ?? ""
    );

    setValue(
      "settings-song",
      settings.song ?? ""
    );

    setValue(
      "settings-author",
      settings.author ?? ""
    );


    const levelName =
      document.getElementById(
        "settings-level-file-name"
      );

    if(levelName){
      levelName.textContent =
        this.currentLevelSource?.name ??
        "New Level";
    }


    const songStatus =
      document.getElementById(
        "settings-song-status"
      );

    if(songStatus){

      songStatus.textContent =
        this.songLoadState.message ?? "";

      songStatus.classList.remove(
        "ok",
        "warning",
        "error"
      );

      if(this.songLoadState.loaded){
        songStatus.classList.add("ok");
      }
      else if(settings.songFilename){
        songStatus.classList.add("warning");
      }
    }
  }


  syncSettingsToProject(){

    if(!this.project?.json){
      return;
    }


    if(!this.project.json.settings){
      this.project.json.settings = {};
    }


    Object.assign(
      this.project.json.settings,
      this.doc?.settings ?? {}
    );
  }


  applyProjectSetting(
    key,
    value
  ){

    if(!this.doc?.settings){
      return false;
    }


    if(
      Object.is(
        this.doc.settings[key],
        value
      )
    ){
      return true;
    }


    this.recordHistoryBeforeEdit();


    this.doc.settings[key] =
      value;

    this.syncSettingsToProject();


    if(
      key === "artist" ||
      key === "song"
    ){
      this.updateProjectTitle();
    }


    if(key === "volume"){

      const volume =
        Number(value);

      this.song.setVolume(
        Number.isFinite(volume)
          ? Math.max(0, volume) / 100
          : 1
      );
    }


    if(key === "pitch"){

      const pitch =
        Number(value);

      const playbackRate =
        Number.isFinite(pitch) &&
        pitch > 0
          ? pitch / 100
          : 1;

      this.clock.setPlaybackRate(
        playbackRate
      );

      this.song.setPlaybackRate(
        playbackRate
      );

      this.hitSound.setTimelineRate(
        playbackRate
      );

      /*
        Re-index scheduled hitsounds if pitch is changed
        during playback. Their actual audio pitch stays intact.
      */
      if(
        this.state.mode === "play" &&
        this.levelStarted
      ){

        const currentTime_us =
          this.clock.getTime_us();

        this.hitSound.start(
          this.compiled.hitSoundEvents,
          this.compiled.countdownHitTimes_us,
          currentTime_us
        );
      }
    }


    if(
      key === "bpm" ||
      key === "offset" ||
      key === "hitsound" ||
      key === "hitsoundVolume"
    ){
      this.rebuild();
    }


    this.refreshProjectSettingsUI();

    this.scheduleAutosave();

    this.logger.info(
      "Level setting changed",
      key,
      value
    );

    return true;
  }


  async loadSongFromProjectUrl(
    projectPath
  ){

    const songFilename =
      String(
        this.doc?.settings
          ?.songFilename ??
        ""
      ).trim();


    if(!songFilename){

      await this.song.init(
        this.hitSound.ctx,
        null
      );

      this.songLoadState = {
        loaded: false,
        message:
          "No song is assigned. Please choose a song file."
      };

      return false;
    }


    const projectUrl =
      new URL(
        projectPath,
        window.location.href
      );


    const songUrl =
      new URL(
        songFilename,
        projectUrl
      ).href;


    const loaded =
      await this.song.init(
        this.hitSound.ctx,
        songUrl
      );


    const volume =
      Number(
        this.doc.settings?.volume ??
        100
      );


    this.song.setVolume(
      Number.isFinite(volume)
        ? Math.max(0, volume) / 100
        : 1
    );


    this.songLoadState =
      loaded
        ? {
            loaded: true,
            message:
              `Song loaded automatically: ${songFilename}`
          }
        : {
            loaded: false,
            message:
              `Could not find ${songFilename} in the same path. Please choose it manually.`
          };


    return loaded;
  }


  async selectSongFile(
    file
  ){

    if(!file || !this.hitSound.ctx){
      return false;
    }


    if(this.localSongObjectUrl){
      URL.revokeObjectURL(
        this.localSongObjectUrl
      );
    }


    this.localSongObjectUrl =
      URL.createObjectURL(
        file
      );


    const loaded =
      await this.song.init(
        this.hitSound.ctx,
        this.localSongObjectUrl
      );


    if(loaded){

      if(this.autosaveSuppressed){
        this.autosaveSuppressed = false;
        this.logger.setPersistenceEnabled(
          true
        );
      }

      this.doc.settings.songFilename =
        file.name;

      this.syncSettingsToProject();

      /*
        File objects cannot be reopened from their original local
        path after a restart, so keep the selected song Blob in
        IndexedDB.
      */
      await this.cacheLocalSongForAutosave(
        file
      );


      const volume =
        Number(
          this.doc.settings?.volume ??
          100
        );

      this.song.setVolume(
        Number.isFinite(volume)
          ? Math.max(0, volume) / 100
          : 1
      );
    }


    this.songLoadState =
      loaded
        ? {
            loaded: true,
            message:
              `Song selected: ${file.name}`
          }
        : {
            loaded: false,
            message:
              `Failed to read song: ${file.name}`
          };


    this.refreshProjectSettingsUI();

    if(loaded){
      this.scheduleAutosave();
      this.logger.info(
        "Song selected",
        {
          name: file.name,
          size: file.size,
          type: file.type || "unknown"
        }
      );
    }
    else{
      this.showToast(
        `Failed to read song: ${file.name}`,
        "error"
      );
    }

    return loaded;
  }


  async replaceProjectJson(
    json,
    source = null
  ){

    if(!json){
      return false;
    }


    if(this.state.mode === "play"){
      this.stopPlay();
    }
    else{
      this.song.stop();
      this.hitSound.stop();
      this.clock.stop();
    }


    if(this.localSongObjectUrl){
      URL.revokeObjectURL(
        this.localSongObjectUrl
      );

      this.localSongObjectUrl =
        null;
    }


    this.project =
      new Project();

    this.project.json =
      json;


    this.doc =
      this.builder.fromProject(
        this.project
      );


    this.resetHistory();


    this.currentLevelSource =
      source;

    /*
      A newly opened level must not inherit the previous level's
      cached local song association. Selecting a song establishes
      a new association.
    */
    this.autosaveSongCacheKey =
      null;


    this.state.selectedFloorIds.clear();
    this.state.activeFloorId = null;
    this.state.selectionAnchorId = null;


    this.songLoadState = {
      loaded: false,
      message: ""
    };


    this.updateProjectTitle();
    this.rebuild();
    this.setEdit();


    this.refreshProjectSettingsUI();

    this.scheduleAutosave();

    this.logger.info(
      "Project replaced",
      {
        source: source?.name ?? source?.type ?? "unknown",
        tiles: this.doc?.ids?.length ?? 0,
        events: this.doc?.actions?.length ?? 0
      }
    );

    return true;
  }


  async loadProjectFromFile(
    file
  ){

    if(!file){
      return false;
    }


    this.setLevelLoading(
      true,
      "Loading level..."
    );


    try{

      const text =
        await file.text();


      const json =
        JSON5.parse(
          text
            .replace(/\r/g, "")
            .replace(/\n/g, "")
        );


      await this.replaceProjectJson(
        json,
        {
          type: "file",
          name: file.name,
          file
        }
      );


      /*
        중요:
        <input type=file>로 받은 File 객체에는
        같은 폴더의 다른 파일에 접근할 권한이 없다.

        songFilename이 있어도 자동 탐색할 수 없으므로
        곡 선택을 요청한다.
      */
      await this.song.init(
        this.hitSound.ctx,
        null
      );


      const expectedSong =
        String(
          this.doc.settings
            ?.songFilename ??
          ""
        ).trim();


      this.songLoadState = {
        loaded: false,
        message:
          expectedSong
            ? `This level uses ${expectedSong}. Browser security prevents automatic access to files in the same local folder, so please choose the song manually.`
            : "No song is assigned to this level. Please choose a song file."
      };


      this.refreshProjectSettingsUI();
      this.openProjectSettings();

      this.logger.info(
        "Local level loaded",
        {
          name: file.name,
          tiles: this.doc?.ids?.length ?? 0,
          events: this.doc?.actions?.length ?? 0
        }
      );

      return true;
    }
    catch(error){

      this.reportError(
        error,
        "Failed to load the level file"
      );

      return false;
    }
    finally{
      this.setLevelLoading(false);
    }
  }


  async createNewLevel(){

    /*
      이 에디터의 "New Level"은
      빈 JSON을 즉석에서 만드는 대신,
      처음 에디터를 열었을 때 사용하는
      ./level.adofai 를 다시 불러온다.

      loadProject()를 다시 호출하면
      renderer / input / UI 이벤트가
      중복 초기화될 수 있으므로,
      파일만 fetch한 뒤 replaceProjectJson()
      경로로 교체한다.
    */
    const path =
      "./level.adofai";


    this.setLevelLoading(
      true,
      "Loading default level..."
    );


    try{

      const response =
        await fetch(
          path,
          {
            /*
              개발 중 level.adofai가 바뀌어도
              오래된 캐시가 다시 열리지 않게 함.
            */
            cache:
              "no-store"
          }
        );


      if(!response.ok){

        throw new Error(
          `default level load failed: ${response.status}`
        );
      }


      const text =
        (
          await response.text()
        )
        .replace(/\r/g, "")
        .replace(/\n/g, "");


      const json =
        JSON5.parse(
          text
        );


      await this.replaceProjectJson(
        json,
        {
          type:
            "url",

          name:
            "level.adofai",

          url:
            new URL(
              path,
              window.location.href
            ).href
        }
      );


      /*
        기본 level.adofai에 songFilename이 있다면
        처음 실행할 때와 똑같이
        level.adofai 기준 상대 경로에서 곡을 찾는다.
      */
      const songLoaded =
        await this.loadSongFromProjectUrl(
          path
        );


      this.refreshProjectSettingsUI();


      /*
        설정창 안에서 "New Level"을 눌렀으므로
        창은 그대로 유지한다.
        곡이 없거나 찾지 못한 경우에도
        사용자가 바로 곡을 지정할 수 있다.
      */
      if(!songLoaded){

        this.openProjectSettings();
      }

      this.logger.info(
        "New level loaded",
        { songLoaded }
      );

      return true;
    }
    catch(error){

      this.reportError(
        error,
        "Failed to load the default level.adofai file"
      );


      return false;
    }
    finally{

      this.setLevelLoading(
        false
      );
    }
  }


  createDownloadProjectJson(){

    if(
      !this.doc
    ){
      return null;
    }


    /*
      원본 JSON의 알 수 없는 설정/필드는
      최대한 보존한다.
      그 위에 현재 Document 상태만 덮어쓴다.
    */
    const json =
      structuredClone(
        this.project?.json ??
        {}
      );


    /*
      Document의 index 0은
      ADOFAI의 시작 타일이므로
      angleData에는 포함하지 않는다.
    */
    json.angleData =
      this.doc.angles.slice(
        1
      );


    json.settings = {

      ...(
        json.settings ??
        {}
      ),

      ...structuredClone(
        this.doc.settings ??
        {}
      )
    };


    const floorIndexById =
      new Map();


    for(
      let i = 0;
      i < this.doc.ids.length;
      i++
    ){

      floorIndexById.set(
        this.doc.ids[i],
        i
      );
    }


    /*
      편집용 floorId를
      실제 .adofai의 floor 숫자로 되돌린다.
    */
    json.actions =
      [];


    for(
      const action
      of this.doc.actions
    ){

      const floor =
        floorIndexById.get(
          action.floorId
        );


      /*
        존재하지 않는 타일을 가리키는
        비정상 action은 내보내지 않는다.
      */
      if(
        floor ===
        undefined
      ){
        continue;
      }


      const cloned =
        structuredClone(
          action
        );


      delete cloned.floorId;


      json.actions.push({

        floor,

        ...cloned
      });
    }


    return json;
  }


  getDownloadLevelFilename(){

    const artist =
      String(
        this.doc?.settings
          ?.artist ??
        ""
      ).trim()
      ||
      "Artist";


    const song =
      String(
        this.doc?.settings
          ?.song ??
        ""
      ).trim()
      ||
      "Song";


    /*
      Windows / Android 등에서
      파일명으로 사용할 수 없는 문자를 치환.
    */
    const rawBaseName =
      `${artist} - ${song}`;

    const parsedTitle =
      this.parseLevelTitleMarkup(
        rawBaseName
      );

    let baseName =
      (
        parsedTitle.valid
          ? parsedTitle.plainText
          : rawBaseName
      )
      .replace(
        /[<>:"/\\|?*\u0000-\u001F]/g,
        "_"
      )
      .replace(
        /[. ]+$/g,
        ""
      )
      .trim();


    if(!baseName){

      baseName =
        "Artist - Song";
    }


    return (
      baseName +
      ".adofai"
    );
  }


  downloadLevel(){

    const json =
      this.createDownloadProjectJson();


    if(!json){

      this.showToast(
        "There is no level to download.",
        "warning"
      );

      return false;
    }


    /*
      현재 settings도 project 쪽에
      한 번 동기화해 둔다.
    */
    this.syncSettingsToProject();


    const text =
      JSON.stringify(
        json,
        null,
        2
      );


    const blob =
      new Blob(
        [text],
        {
          /*
            .adofai는 내용상 JSON이지만
            다운로드 MIME을 JSON으로 선언하면
            일부 모바일 브라우저가
            파일명 뒤에 .json을 자동 추가한다.
    
            일반 바이너리 파일로 취급해서
            download 속성의 .adofai를 그대로 유지.
          */
          type:
            "application/octet-stream"
        }
      );


    const url =
      URL.createObjectURL(
        blob
      );


    const link =
      document.createElement(
        "a"
      );


    link.href =
      url;


    link.download =
      this.getDownloadLevelFilename();


    link.style.display =
      "none";


    document.body.appendChild(
      link
    );


    link.click();


    link.remove();


    /*
      click 직후 바로 revoke하면
      일부 모바일 브라우저에서
      다운로드가 시작되기 전에 URL이 사라질 수 있어
      약간 뒤에 해제한다.
    */
    window.setTimeout(
      () => {

        URL.revokeObjectURL(
          url
        );
      },
      1000
    );

    this.logger.info(
      "Level download requested",
      this.getDownloadLevelFilename()
    );

    this.showToast(
      "Level download started.",
      "success",
      2200
    );

    return true;
  }


  updateEventAction(
    action,
    patch
  ){
  
    if(
      this.state.mode !== "edit"
    ){
      return false;
    }
  
  
    const hasChange =
      Object.entries(
        patch ?? {}
      ).some(
        ([key, value]) =>
          !Object.is(
            action?.[key],
            value
          )
      );


    if(!hasChange){
      return true;
    }


    this.recordHistoryBeforeEdit();


    const updated =
      this.doc.updateAction(
        action,
        patch
      );
  
  
    if(!updated){
      return false;
    }
  
  
    /*
      즉시 재컴파일
      → 타일 아이콘
      → BPM
      → Pause 시간
      → UI
  
      전부 갱신
    */
    this.rebuild();

    this.logger.info(
      "Event updated",
      {
        eventType: action?.eventType ?? "Unknown",
        floorId: action?.floorId ?? null,
        patch
      }
    );
  
    return true;
  }
  
  deleteEventAction(
    action
  ){
  
    if(
      this.state.mode !==
      "edit"
    ){
      return false;
    }
  
  
    if(
      !this.doc.actions.includes(
        action
      )
    ){
      return false;
    }


    this.recordHistoryBeforeEdit();


    const removed =
      this.doc.removeAction(
        action
      );
  
  
    if(!removed){
      return false;
    }
  
  
    /*
      BPM / Pause / Twirl / 아이콘
      전부 다시 계산.
    */
    this.rebuild();

    this.logger.info(
      "Event deleted",
      {
        eventType: action?.eventType ?? "Unknown",
        floorId: action?.floorId ?? null
      }
    );
  
    return true;
  }
  
  /* =========================================================
     Undo / Redo

     A snapshot stores the editable Document plus the current
     selection. Camera position is intentionally not part of edit
     history, so Undo/Redo changes the level without jumping the view.
  ========================================================= */

  initHistoryControls(){

    if(this.historyInitialized){
      this.updateHistoryButtons();
      return;
    }

    this.undoButton =
      document.getElementById(
        "undo-button"
      );

    this.redoButton =
      document.getElementById(
        "redo-button"
      );

    if(
      !this.undoButton ||
      !this.redoButton
    ){
      throw new Error(
        "history controls not found"
      );
    }

    this.undoButton.addEventListener(
      "click",
      () => {
        this.undo();
      }
    );

    this.redoButton.addEventListener(
      "click",
      () => {
        this.redo();
      }
    );

    /*
      Desktop convenience:
        Ctrl/Cmd + Z       = Undo
        Ctrl/Cmd + Shift+Z = Redo
        Ctrl/Cmd + Y       = Redo

      When a text/number field is focused, leave the shortcut to the
      browser so normal text editing keeps its native undo behavior.
    */
    window.addEventListener(
      "keydown",
      e => {

        const target = e.target;

        const isEditingField =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target?.isContentEditable;

        if(isEditingField){
          return;
        }

        const modifier =
          e.ctrlKey ||
          e.metaKey;

        if(!modifier){
          return;
        }

        const key =
          String(e.key).toLowerCase();

        if(key === "z"){

          e.preventDefault();

          if(e.shiftKey){
            this.redo();
          }
          else{
            this.undo();
          }
        }
        else if(key === "y"){

          e.preventDefault();
          this.redo();
        }
      }
    );

    this.historyInitialized = true;
    this.updateHistoryButtons();
  }


  createHistorySnapshot(){

    if(!this.doc){
      return null;
    }

    return {

      document: {
        ids:
          structuredClone(
            this.doc.ids
          ),

        angles:
          structuredClone(
            this.doc.angles
          ),

        nextId:
          this.doc.nextId,

        actions:
          structuredClone(
            this.doc.actions
          ),

        settings:
          structuredClone(
            this.doc.settings ?? {}
          )
      },

      selection: {
        ids:
          [
            ...this.state
              .selectedFloorIds
          ],

        activeFloorId:
          this.state.activeFloorId,

        selectionAnchorId:
          this.state.selectionAnchorId
      }
    };
  }


  recordHistoryBeforeEdit(){

    if(
      this.historyRestoring ||
      this.state.mode !== "edit"
    ){
      return false;
    }

    if(this.autosaveSuppressed){
      this.autosaveSuppressed = false;
      this.logger.setPersistenceEnabled(
        true
      );
      this.logger.info(
        "Cache writes resumed after a new edit."
      );
    }

    const snapshot =
      this.createHistorySnapshot();

    if(!snapshot){
      return false;
    }

    this.undoStack.push(
      snapshot
    );

    if(
      this.undoStack.length >
      this.historyLimit
    ){
      this.undoStack.splice(
        0,
        this.undoStack.length -
        this.historyLimit
      );
    }

    /*
      A new edit creates a new branch, so old Redo states are no
      longer reachable.
    */
    this.redoStack.length = 0;

    this.updateHistoryButtons();

    return true;
  }


  resetHistory(){

    this.undoStack.length = 0;
    this.redoStack.length = 0;

    this.updateHistoryButtons();
  }


  restoreHistorySnapshot(
    snapshot
  ){

    if(
      !snapshot?.document ||
      !this.doc
    ){
      return false;
    }

    const data =
      snapshot.document;

    this.doc.ids =
      structuredClone(
        data.ids ?? []
      );

    this.doc.angles =
      structuredClone(
        data.angles ?? []
      );

    this.doc.nextId =
      Number.isFinite(
        Number(data.nextId)
      )
        ? Number(data.nextId)
        : this.doc.ids.length;

    this.doc.actions =
      structuredClone(
        data.actions ?? []
      );

    this.doc.settings =
      structuredClone(
        data.settings ?? {}
      );


    /* =========================
       Selection restore
    ========================= */

    const validIds =
      new Set(
        this.doc.ids
      );

    this.state
      .selectedFloorIds
      .clear();

    for(
      const id
      of snapshot.selection?.ids ?? []
    ){

      if(validIds.has(id)){
        this.state
          .selectedFloorIds
          .add(id);
      }
    }

    const requestedActive =
      snapshot.selection
        ?.activeFloorId ??
      null;

    this.state.activeFloorId =
      validIds.has(
        requestedActive
      )
        ? requestedActive
        : [
            ...this.state
              .selectedFloorIds
          ].at(-1) ?? null;

    const requestedAnchor =
      snapshot.selection
        ?.selectionAnchorId ??
      null;

    this.state.selectionAnchorId =
      validIds.has(
        requestedAnchor
      )
        ? requestedAnchor
        : this.state.activeFloorId;


    /* =========================
       Setting side effects
    ========================= */

    this.syncSettingsToProject();
    this.updateProjectTitle();

    const volume =
      Number(
        this.doc.settings?.volume ??
        100
      );

    this.song.setVolume(
      Number.isFinite(volume)
        ? Math.max(0, volume) / 100
        : 1
    );

    const pitch =
      Number(
        this.doc.settings?.pitch ??
        100
      );

    const playbackRate =
      Number.isFinite(pitch) &&
      pitch > 0
        ? pitch / 100
        : 1;

    this.clock.setPlaybackRate(
      playbackRate
    );

    this.song.setPlaybackRate(
      playbackRate
    );

    this.hitSound.setTimelineRate(
      playbackRate
    );


    /*
      Event screens may contain references to the previous action
      objects. Returning to the tile tab guarantees the restored UI
      is rebuilt entirely from the new Document snapshot.
    */
    if(this.editorUI){
      this.editorUI.activeTabKey =
        "tile";

      this.editorUI.isAdvanced =
        false;
    }

    this.rebuild();
    this.refreshProjectSettingsUI();

    return true;
  }


  undo(){

    if(
      this.state.mode !== "edit" ||
      this.undoStack.length === 0
    ){
      return false;
    }

    const previous =
      this.undoStack.pop();

    const current =
      this.createHistorySnapshot();

    if(current){
      this.redoStack.push(
        current
      );
    }

    this.historyRestoring = true;

    try{
      this.restoreHistorySnapshot(
        previous
      );
    }
    finally{
      this.historyRestoring = false;
    }

    this.updateHistoryButtons();
    this.scheduleAutosave(0);

    this.logger.info(
      "Undo",
      {
        undo: this.undoStack.length,
        redo: this.redoStack.length
      }
    );

    return true;
  }


  redo(){

    if(
      this.state.mode !== "edit" ||
      this.redoStack.length === 0
    ){
      return false;
    }

    const next =
      this.redoStack.pop();

    const current =
      this.createHistorySnapshot();

    if(current){
      this.undoStack.push(
        current
      );

      if(
        this.undoStack.length >
        this.historyLimit
      ){
        this.undoStack.shift();
      }
    }

    this.historyRestoring = true;

    try{
      this.restoreHistorySnapshot(
        next
      );
    }
    finally{
      this.historyRestoring = false;
    }

    this.updateHistoryButtons();
    this.scheduleAutosave(0);

    this.logger.info(
      "Redo",
      {
        undo: this.undoStack.length,
        redo: this.redoStack.length
      }
    );

    return true;
  }


  updateHistoryButtons(){

    const editable =
      this.state?.mode === "edit";

    if(this.undoButton){
      this.undoButton.disabled =
        !editable ||
        this.undoStack.length === 0;
    }

    if(this.redoButton){
      this.redoButton.disabled =
        !editable ||
        this.redoStack.length === 0;
    }
  }


  /* =========================================================
     Tile / Event Clipboard
  ========================================================= */

  initClipboardControls(){
    if(this.clipboardInitialized){
      this.updateClipboardButtons();
      return;
    }

    this.copyTilesButton =
      document.getElementById(
        "copy-tiles-button"
      );
    this.pasteTilesButton =
      document.getElementById(
        "paste-tiles-button"
      );

    if(!this.copyTilesButton || !this.pasteTilesButton){
      throw new Error(
        "tile clipboard controls not found"
      );
    }

    this.copyTilesButton.addEventListener(
      "click",
      () => this.copySelectedTiles()
    );
    this.pasteTilesButton.addEventListener(
      "click",
      () => this.pasteTilesAfterSelected()
    );

    this.clipboardInitialized = true;
    this.updateClipboardButtons();
  }

  updateClipboardButtons(){
    const editable =
      this.state?.mode === "edit";
    const selectedCount =
      this.state?.selectedFloorIds?.size ?? 0;

    if(this.copyTilesButton){
      this.copyTilesButton.disabled =
        !editable || selectedCount <= 0;
    }

    if(this.pasteTilesButton){
      this.pasteTilesButton.disabled =
        !editable ||
        selectedCount !== 1 ||
        !Array.isArray(this.tileClipboard?.tiles) ||
        this.tileClipboard.tiles.length === 0;
    }
  }

  copySelectedTiles(){
    if(this.state.mode !== "edit"){
      return false;
    }

    const selected =
      [...this.state.selectedFloorIds]
      .map(id => ({
        id,
        index: this.doc.indexOfId(id)
      }))
      .filter(item => item.index >= 0)
      .sort((a, b) => a.index - b.index);

    if(selected.length === 0){
      return false;
    }

    const tiles = selected.map(item => ({
      angle: structuredClone(
        this.doc.angles[item.index]
      ),
      actions:
        this.doc.getActionsByFloorId(item.id)
        .map(action => {
          const cloned = structuredClone(action);
          delete cloned.floorId;
          return cloned;
        })
    }));

    this.tileClipboard = {
      tiles,
      copiedAt: Date.now()
    };

    this.updateClipboardButtons();
    this.showToast(
      `${tiles.length} tile${tiles.length === 1 ? "" : "s"} copied.`,
      "success",
      2200
    );
    this.logger.info(
      "Tiles copied",
      {
        count: tiles.length,
        sourceIndices: selected.map(item => item.index)
      }
    );

    return true;
  }

  pasteTilesAfterSelected(){
    if(
      this.state.mode !== "edit" ||
      this.state.selectedFloorIds.size !== 1
    ){
      return false;
    }

    const copiedTiles =
      this.tileClipboard?.tiles;

    if(!Array.isArray(copiedTiles) || copiedTiles.length === 0){
      return false;
    }

    const targetId =
      this.state.activeFloorId;
    const targetIndex =
      this.doc.indexOfId(targetId);

    if(!targetId || targetIndex < 0){
      return false;
    }

    this.recordHistoryBeforeEdit();

    let afterId = targetId;
    const insertedIds = [];

    for(const tile of copiedTiles){
      const newId =
        this.doc.insertAfter(
          afterId,
          structuredClone(tile.angle)
        );

      insertedIds.push(newId);

      for(const copiedAction of tile.actions ?? []){
        const action = structuredClone(copiedAction);
        action.floorId = newId;
        // Preserve all events, including unsupported ones.
        this.doc.actions.push(action);
      }

      afterId = newId;
    }

    if(insertedIds.length === 0){
      return false;
    }

    // Select the last pasted tile so repeated Paste appends naturally.
    const lastInsertedId =
      insertedIds[insertedIds.length - 1];

    this.state.selectedFloorIds.clear();
    this.state.selectedFloorIds.add(lastInsertedId);
    this.state.activeFloorId = lastInsertedId;
    this.state.selectionAnchorId = lastInsertedId;

    this.rebuild();

    /*
      Pasting creates tiles too; follow the last pasted tile because it
      is also the new active selection and the next insertion point.
    */
    this.focusFloorById(
      lastInsertedId
    );

    this.showToast(
      `${insertedIds.length} tile${insertedIds.length === 1 ? "" : "s"} pasted.`,
      "success",
      2400
    );
    this.logger.info(
      "Tiles pasted",
      {
        afterIndex: targetIndex,
        count: insertedIds.length
      }
    );

    return true;
  }

  copyEventAction(action){
    if(
      this.state.mode !== "edit" ||
      !action ||
      !this.doc.actions.includes(action)
    ){
      return false;
    }

    const cloned =
      structuredClone(action);
    delete cloned.floorId;

    this.eventClipboard = {
      action: cloned,
      copiedAt: Date.now()
    };

    this.updateEditorUI();

    const eventType =
      String(cloned.eventType ?? "Event");

    this.showToast(
      `${eventType} copied.`,
      "success",
      2200
    );
    this.logger.info(
      "Event copied",
      { eventType }
    );

    return true;
  }

  canPasteEventToSelected(){
    if(
      this.state.mode !== "edit" ||
      this.state.selectedFloorIds.size !== 1
    ){
      return false;
    }

    const copiedAction =
      this.eventClipboard?.action;
    const floorId =
      this.state.activeFloorId;
    const eventType =
      copiedAction?.eventType;

    if(!floorId || !eventType){
      return false;
    }

    return this.doc.canAddAction(
      floorId,
      eventType
    );
  }

  pasteEventToSelected(){
    if(!this.canPasteEventToSelected()){
      return null;
    }

    const floorId =
      this.state.activeFloorId;
    const copied =
      structuredClone(this.eventClipboard.action);
    const eventType =
      copied.eventType;

    delete copied.eventType;
    delete copied.floorId;

    this.recordHistoryBeforeEdit();

    const action =
      this.doc.addAction(
        floorId,
        eventType,
        copied
      );

    if(!action){
      return null;
    }

    this.rebuild();

    this.showToast(
      `${eventType} pasted.`,
      "success",
      2200
    );
    this.logger.info(
      "Event pasted",
      { eventType, floorId }
    );

    return action;
  }


  initFloorNavigation(){

    this.prevFloorButton =
      document.getElementById(
        "prev-floor-button"
      );
  
    this.nextFloorButton =
      document.getElementById(
        "next-floor-button"
      );
  
  
    if(!this.prevFloorButton){
      throw new Error(
        "prev-floor-button not found"
      );
    }
  
    if(!this.nextFloorButton){
      throw new Error(
        "next-floor-button not found"
      );
    }
  
  
    this.prevFloorButton
      .addEventListener(
        "click",
        () => {
  
          this.moveFloorSelection(-1);
        }
      );
  
  
    this.nextFloorButton
      .addEventListener(
        "click",
        () => {
  
          this.moveFloorSelection(1);
        }
      );
  }
  
  moveFloorSelection(direction){

    /*
      편집 모드에서만 허용
    */
    if(
      this.state.mode !== "edit"
    ){
      return false;
    }
  
  
    const currentId =
      this.state.activeFloorId;
  
  
    /*
      선택된 타일이 없으면
      이동 기준 자체가 없음
    */
    if(!currentId){
      return false;
    }
  
  
    const currentIndex =
      this.doc.indexOfId(
        currentId
      );
  
  
    if(currentIndex < 0){
      return false;
    }
  
  
    const targetIndex =
      currentIndex + direction;
  
  
    /*
      맵 범위 밖
    */
    if(
      targetIndex < 0 ||
      targetIndex >=
        this.doc.ids.length
    ){
      return false;
    }
  
  
    const targetId =
      this.doc.ids[
        targetIndex
      ];
  
  
    /* =========================
       Ctrl + Arrow
  
       누적 선택
    ========================= */
  
    if(
      this.modifierKeys.isCtrl()
    ){
  
      /*
        이미 선택된 타일이어도
        제거하지 않는다.
  
        Arrow + Ctrl은
        "선택을 추가하면서 이동"
        역할로 고정.
      */
      this.state
        .selectedFloorIds
        .add(
          targetId
        );
  
  
      this.state.activeFloorId =
        targetId;
  
  
      /*
        이후 Shift로 전환했을 때
        현재 위치를 기준으로 사용
      */
      this.state.selectionAnchorId =
        targetId;
  
  
      this.runtime.highlightFloorById(
        targetId,
        true
      );
  
  
      const group =
        this.runtime
          .meshByFloorId
          .get(
            targetId
          );
  
  
      if(group){
  
        this.cameraSystem.requestFocusTo(
          group.position.x,
          group.position.y
        );
      }
  
  
      this.updateEditorUI();
  
      return true;
    }
  
  
    /* =========================
       Shift / 일반 이동
  
       기존 selectFloor() 재사용
    ========================= */
  
    this.selectFloor(
      targetId,
      true
    );
  
  
    return true;
  }
  
  updateFloorNavigationButtons(){

    if(
      !this.prevFloorButton ||
      !this.nextFloorButton
    ){
      return;
    }
  
  
    let index = -1;
  
  
    if(
      this.state.activeFloorId
    ){
  
      index =
        this.doc.indexOfId(
          this.state.activeFloorId
        );
    }
  
  
    const canNavigate =
      this.state.mode === "edit" &&
      index >= 0;
  
  
    /*
      첫 번째 타일이면 이전 불가
    */
    this.prevFloorButton.disabled =
      !canNavigate ||
      index <= 0;
  
  
    /*
      마지막 타일이면 다음 불가
    */
    this.nextFloorButton.disabled =
      !canNavigate ||
      index >=
        this.doc.ids.length - 1;
  }
  
  rebuild(){
    const compiled = this.compiler.compile(this.doc);
    this.runtime.setFloor(
  compiled.floors,
  compiled.eventMarkers
);
    
    this.compiled = compiled;
    
  
  
    for(const id of [...this.state.selectedFloorIds]){

      // 삭제된 타일이면 선택 목록에서도 제거
      if(this.doc.indexOfId(id) < 0){
        this.state.selectedFloorIds.delete(id);
        continue;
      }
    
      this.runtime.highlightFloorById(
        id,
        true
      );
    }
    
    
    // active 타일 검증
    if(
      this.state.activeFloorId &&
      this.doc.indexOfId(this.state.activeFloorId) < 0
    ){
      const remaining =
        [...this.state.selectedFloorIds];
    
      this.state.activeFloorId =
        remaining.at(-1) ?? null;
    }
    
    
    // anchor 검증
    if(
      this.state.selectionAnchorId &&
      this.doc.indexOfId(
        this.state.selectionAnchorId
      ) < 0
    ){
      this.state.selectionAnchorId =
        this.state.activeFloorId;
    }
    
    this.updateEditorUI();

    this.logger.info(
      "Level compiled",
      {
        tiles: compiled.floors?.length ?? 0,
        events: this.doc?.actions?.length ?? 0
      }
    );

    /*
      Most actual level edits end in rebuild(). Debounce the write
      so dragging/editing does not synchronously hit localStorage
      dozens of times per second.
    */
    this.scheduleAutosave();
  }
  
  initResponsiveViewport(){

    const viewport =
      document.getElementById(
        "map-viewport"
      );
  
  
    if(!viewport){
  
      throw new Error(
        "map-viewport not found"
      );
    }
  
  
    let resizeRaf = null;
  
  
    const resize = () => {
  
      resizeRaf = null;
  
  
      const rect =
        viewport.getBoundingClientRect();
  
  
      if(
        rect.width <= 0 ||
        rect.height <= 0
      ){
        return;
      }
  
  
      this.cameraSystem.resize(
        rect.width,
        rect.height
      );
  
  
      this.runtime.resize(
        rect.width,
        rect.height
      );
    };
  
  
    const requestResize = () => {
  
      if(resizeRaf !== null){
        return;
      }
  
  
      resizeRaf =
        requestAnimationFrame(
          resize
        );
    };
  
  
    this.resizeObserver =
      new ResizeObserver(
        requestResize
      );
  
  
    this.resizeObserver.observe(
      viewport
    );
  
  
    requestResize();
  }
  
  getSelectedAngleEditorInfo(){

    const result = {
      editable: false,
  
      angle: null,
  
      rawAngle: null,
  
      label: "—",
  
      special: null
    };
  
  
    if(
      this.state.selectedFloorIds
        .size !== 1
    ){
      return result;
    }
  
  
    const id =
      this.state.activeFloorId;
  
  
    if(!id){
      return result;
    }
  
  
    const index =
      this.doc.indexOfId(
        id
      );
  
  
    /*
      마지막 타일은
      다음 방향이 없으므로 수정 불가
    */
    if(
      index < 0 ||
      index >=
        this.doc.ids.length - 1
    ){
  
      result.label = "END";
  
      return result;
    }
  
  
    result.editable = true;
  
  
    const rawAngle =
      this.doc.angles[
        index + 1
      ];
  
  
    const floor =
      this.compiled
        ?.floors?.[
          index
        ];
  
  
    /*
      Midspin
    */
    if(
      rawAngle === 999 ||
      floor?.option?.isMidspin
    ){
  
      result.label =
        "MID";
  
      result.special =
        "midspin";
  
      return result;
    }
  
  
    const normalized =
      normalizeAngle(
        rawAngle
      );
  
  
    result.rawAngle =
      normalized;
  
  
    /*
      Fullspin
    */
    if(
      floor?.option?.isFullspin
    ){
  
      result.label =
        "360°";
  
      result.special =
        "fullspin";
  
      return result;
    }
  
  
    result.angle =
      normalized;
  
    result.label =
      `${normalized}°`;
  
  
    return result;
  }
  
  updateEditorUI(){

    if(!this.editorUI){
      return;
    }
  
  
    const selectedCount =
      this.state
        .selectedFloorIds
        .size;
  
  
    let selectedIndex = -1;
  
  
    if(
      this.state.activeFloorId
    ){
  
      selectedIndex =
        this.doc.indexOfId(
          this.state.activeFloorId
        );
    }
    
    let selectedActions = [];


    if(
      this.state.activeFloorId
    ){

      selectedActions = this.doc.getActionsByFloorId(
        this.state.activeFloorId
      );
    }


    const eventTabGroups =
      createEventTabGroups(
        selectedActions
      );
  
  
    const canAdd =
      this.state.mode === "edit" &&
      selectedCount === 1 &&
      selectedIndex >= 0;
      
    const canDelete =
      this.state.mode === "edit" &&
      selectedCount === 1 &&
      selectedIndex > 0 &&
      this.doc.ids.length > 1;
    
    const eventPaletteItems =
    Object
      .entries(
        EVENT_TAB_DEFS
      )
      .map(
        (
          [
            eventType,
            def
          ]
        ) => {

          return {

            eventType,

            key:
              def.key,

            title:
              def.title,

            iconSrc:
              def.iconSrc,

            order:
              def.order,

            /*
              EVENT_TAB_DEFS가 생성 후 탭 이동 동작까지 결정한다.
              속성이 없는 미래 이벤트는 기존 동작과의 호환을 위해 true.
            */
            openTabOnCreate:
              def.openTabOnCreate !==
              false,

            canAdd:
              this.state.mode ===
                "edit"
              &&
              selectedCount === 1
              &&
              !!this.state
                .activeFloorId
              &&
              this.doc.canAddAction(
                this.state
                  .activeFloorId,
                eventType
              )
          };
        }
      )
      .sort(
        (a, b) =>
          a.order - b.order
      );
  
  
    this.editorUI.update({
  
      mode:
        this.state.mode,
    
      selectedCount,
    
      canAdd,
    
      canDelete,
      
      eventTabGroups,

      eventPaletteItems,

      canPasteEvent:
        this.canPasteEventToSelected(),

      eventClipboardType:
        this.eventClipboard?.action?.eventType ?? null,

      hitsoundOptions:
        this.hitSound
          ?.getAvailableHitsoundOptions?.()
        ??
        [
          {
            value: "None",
            label: "None"
          },
          {
            value: "Kick",
            label: "Kick"
          }
        ],
    
      label:
        selectedIndex >= 0
          ? `#${selectedIndex}`
          : "—"
    
    });
    
    this.updateFloorNavigationButtons();
    this.updateHistoryButtons();
    this.updateClipboardButtons();
  }
  
  setSelectedOutgoingAngle(
    angle
  ){
  
    if(
      this.state.mode !== "edit"
    ){
      return false;
    }
  
  
    if(
      this.state.selectedFloorIds
        .size !== 1
    ){
      return false;
    }
  
  
    const selectedId =
      this.state.activeFloorId;
  
  
    const index =
      this.doc.indexOfId(
        selectedId
      );
  
  
    if(
      index < 0 ||
      index >=
        this.doc.ids.length - 1
    ){
      return false;
    }
  
  
    const nextFloorId =
      this.doc.ids[
        index + 1
      ];
  
  
    const nextAngle =
      normalizeAngle(angle);


    if(
      Object.is(
        this.doc.angles[index + 1],
        nextAngle
      )
    ){
      return true;
    }


    this.recordHistoryBeforeEdit();


    this.doc.setAngle(
      nextFloorId,
      nextAngle
    );
  
  
    /*
      선택 상태는 stable ID라
      rebuild 후에도 그대로 살아 있음.
    */
    this.rebuild();

    this.logger.info(
      "Outgoing angle changed",
      {
        floorIndex: index,
        nextAngle
      }
    );
  
    return true;
  }
  
  setSelectedMidspin(){

    if(
      this.state.mode !== "edit" ||
      this.state.selectedFloorIds
        .size !== 1
    ){
      return false;
    }
  
  
    const index =
      this.doc.indexOfId(
        this.state.activeFloorId
      );
  
  
    if(
      index < 0 ||
      index >=
        this.doc.ids.length - 1
    ){
      return false;
    }
  
  
    const nextId =
      this.doc.ids[
        index + 1
      ];
  
  
    if(
      this.doc.angles[index + 1] ===
      999
    ){
      return true;
    }


    this.recordHistoryBeforeEdit();


    this.doc.setAngle(
      nextId,
      999
    );
  
    this.rebuild();

    this.logger.info(
      "Outgoing angle changed to MID",
      { floorIndex: index }
    );
  
    return true;
  }
  
  setSelectedFullspin(){

    if(
      this.state.mode !== "edit" ||
      this.state.selectedFloorIds
        .size !== 1
    ){
      return false;
    }
  
  
    const index =
      this.doc.indexOfId(
        this.state.activeFloorId
      );
  
  
    if(
      index < 0 ||
      index >=
        this.doc.ids.length - 1
    ){
      return false;
    }
  
  
    const floor =
      this.compiled.floors[
        index
      ];
  
  
    if(!floor){
      return false;
    }
  
  
    const nextId =
      this.doc.ids[
        index + 1
      ];
  
  
    /*
      Floor.startAngle은
      reverseAngle(nowAngle)이므로
  
      이 값을 다음 raw angle로 넣으면
      Compiler에서 fullspin이 된다.
    */
    const fullspinAngle =
      normalizeAngle(
        floor.startAngle
      );


    if(
      Object.is(
        this.doc.angles[index + 1],
        fullspinAngle
      )
    ){
      return true;
    }


    this.recordHistoryBeforeEdit();
  
  
    this.doc.setAngle(
      nextId,
      fullspinAngle
    );
  
    this.rebuild();

    this.logger.info(
      "Outgoing angle changed to 360°",
      { floorIndex: index }
    );
  
    return true;
  }
  
  //콜백함수
  selectFloor(floorId, isFocus = true){

    const selected = this.state.selectedFloorIds;
  
    const isCtrl = this.modifierKeys.isCtrl();
    const isShift = this.modifierKeys.isShift();
  
    // 빈 공간 클릭
    if(floorId == null){
      this.clearSelection();
      return;
    }
  
  
    /* =========================
       Shift : 범위 선택
    ========================= */
    if(isShift){
  
      // 기준점이 없다면 현재 클릭한 타일을 기준점으로
      const anchorId =
        this.state.selectionAnchorId ??
        this.state.activeFloorId ??
        floorId;
  
      const anchorIndex = this.doc.indexOfId(anchorId);
      const targetIndex = this.doc.indexOfId(floorId);
  
      if(anchorIndex < 0 || targetIndex < 0){
        return;
      }
  
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
  
      // Shift는 기존 선택을 범위 선택으로 교체
      for(const id of selected){
        this.runtime.highlightFloorById(id, false);
      }
  
      selected.clear();
  
      for(let i = start; i <= end; i++){
  
        const id = this.doc.ids[i];
  
        selected.add(id);
        this.runtime.highlightFloorById(id, true);
      }
  
      // 클릭한 마지막 타일을 active로
      this.state.activeFloorId = floorId;
  
      // anchor는 그대로 유지
      this.state.selectionAnchorId = anchorId;
    }
  
  
    /* =========================
       Ctrl : 선택 추가 / 제거
    ========================= */
    else if(isCtrl){
  
      if(selected.has(floorId)){
  
        // 이미 선택된 타일이면 제거
        selected.delete(floorId);
  
        this.runtime.highlightFloorById(
          floorId,
          false
        );
  
        // active 타일을 해제했다면
        if(this.state.activeFloorId === floorId){
  
          const remaining = [...selected];
  
          this.state.activeFloorId =
            remaining.at(-1) ?? null;
        }
  
        // anchor도 제거된 타일이었다면 새 기준 설정
        if(this.state.selectionAnchorId === floorId){
          this.state.selectionAnchorId =
            this.state.activeFloorId;
        }
  
      }
      else{
  
        // 선택 추가
        selected.add(floorId);
  
        this.runtime.highlightFloorById(
          floorId,
          true
        );
  
        this.state.activeFloorId = floorId;
  
        // Ctrl로 마지막 선택한 타일을
        // 다음 Shift 선택의 기준으로 사용
        this.state.selectionAnchorId = floorId;
      }
    }
  
  
    /* =========================
       일반 클릭
    ========================= */
    else{
  
      // 정확히 이 타일 하나만 이미 선택되어 있다면
      // 기존 동작처럼 선택 해제
      if(
        selected.size === 1 &&
        selected.has(floorId)
      ){
        this.clearSelection();
        return;
      }
  
      // 그 외에는 단일 선택
      this.setSingleSelection(
        floorId,
        false
      );
    }
  
  
    /* =========================
       Focus
    ========================= */
  
    if(
      isFocus &&
      selected.has(floorId)
    ){
      const g =
        this.runtime.meshByFloorId.get(floorId);
  
      if(g){
        this.cameraSystem.requestFocusTo(
          g.position.x,
          g.position.y
        );
      }
    }
    
    this.updateEditorUI();
  
    /*
    console.log(
      "selected:",
      [...selected],
      "active:",
      this.state.activeFloorId,
      "anchor:",
      this.state.selectionAnchorId
    );
    */
  }
  
  /* =========================================================
     Camera follow for newly-created tiles

     Rebuild first so the new floor mesh has its final position,
     then focus the map camera on that mesh. Repeated additions
     restart this short easing from the current camera position, so
     the viewport continuously follows level construction.
  ========================================================= */
  focusFloorById(
    floorId,
    durationSec = 0.22
  ){

    if(!floorId){
      return false;
    }

    const group =
      this.runtime
        ?.meshByFloorId
        ?.get(floorId);

    if(!group){
      return false;
    }

    this.cameraSystem.requestFocusTo(
      group.position.x,
      group.position.y,
      durationSec,
      "outexpo"
    );

    return true;
  }


  /* =========================================================
     Advanced FREE angle base

     FREE는 절대각 입력이 아니라 현재 선택 타일의
     실제 절대각에 입력값을 더하는 상대각 방식이다.

     Compiler가 MID(999)를 이미 절대방향으로 해석했으므로
     compiled floor를 우선 사용한다.
  ========================================================= */
  getResolvedAbsoluteAngleAt(
    index
  ){

    const floor =
      this.compiled
        ?.floors?.[index];


    const compiledStartAngle =
      Number(
        floor?.startAngle
      );


    if(
      Number.isFinite(
        compiledStartAngle
      )
    ){

      /*
        Compiler에서
          floor.startAngle = reverseAngle(nowAngle)

        이므로 다시 reverse하면 현재 타일의
        해석된 절대각(nowAngle)을 얻는다.
      */
      return normalizeAngle(
        reverseAngle(
          compiledStartAngle
        )
      );
    }


    const rawAngle =
      Number(
        this.doc
          ?.angles?.[index]
      );


    if(
      Number.isFinite(rawAngle)
      &&
      rawAngle !== 999
    ){

      return normalizeAngle(
        rawAngle
      );
    }


    return null;
  }


  addFloorAfterSelected(
    angle = 0,
    {
      relative = false
    } = {}
  ){

    if(
      this.state.mode !== "edit"
    ){
      return false;
    }


    if(
      this.state.selectedFloorIds
        .size !== 1
    ){
      return false;
    }


    const selectedId =
      this.state.activeFloorId;


    if(!selectedId){
      return false;
    }


    const index =
      this.doc.indexOfId(
        selectedId
      );


    if(index < 0){
      return false;
    }


    /*
      999는 Midspin이므로
      정규화시키면 안 된다.
    */
    let rawAngle;


    if(angle === 999){

      rawAngle =
        999;
    }
    else{

      const requestedAngle =
        Number(
          angle
        );


      if(
        !Number.isFinite(
          requestedAngle
        )
      ){
        return false;
      }


      if(relative){

        /*
          ADOFAI Advanced FREE는 절대각 입력이 아니라
          "현재 선택 타일의 절대각 + 자유각도" 방식이다.

          예:
            0° + FREE 10° -> 10°
            10° + FREE 10° -> 20°
            20° + FREE 10° -> 30°

          MID(999) 뒤에서도 동작해야 하므로
          doc.angles[index] 대신 Compiler가 이미 해석한
          현재 타일의 절대방향을 우선 사용한다.

          Compiler:
            floor.startAngle = reverseAngle(nowAngle)

          따라서:
            nowAngle = reverseAngle(floor.startAngle)
        */
        const baseAngle =
          this.getResolvedAbsoluteAngleAt(
            index
          );


        if(
          !Number.isFinite(
            baseAngle
          )
        ){
          return false;
        }


        /*
          예:
            선택 타일 90° + FREE 10° = 100°
            새 100° 타일 + FREE 10° = 110°

          따라서 반복 추가하면
            90 -> 100 -> 110 -> 120 ...
          로 누적된다.
        */
        rawAngle =
          normalizeAngle(
            baseAngle +
            requestedAngle
          );
      }
      else{

        /*
          일반 방향 버튼과 Advanced SNAP은
          기존과 동일하게 절대각도 입력.
        */
        rawAngle =
          normalizeAngle(
            requestedAngle
          );
      }
    }


    this.recordHistoryBeforeEdit();


    const newId =
      this.doc.insertAfter(
        selectedId,
        rawAngle
      );
  
  
    /*
      새 타일을 바로 선택
    */
    this.state
      .selectedFloorIds
      .clear();
  
    this.state
      .selectedFloorIds
      .add(
        newId
      );
  
  
    this.state.activeFloorId =
      newId;
  
    this.state.selectionAnchorId =
      newId;
  
  
    this.rebuild();

    /*
      Newly created tile becomes the active selection, so keep the
      map camera following the construction point as tiles are added.
    */
    this.focusFloorById(
      newId
    );

    this.logger.info(
      "Tile added",
      {
        afterIndex: index,
        floorId: newId,
        angle: rawAngle,
        relative
      }
    );
  
    return true;
  }
  
  deleteSelectedFloor(){

    /*
      편집 중에만 삭제
    */
    if(
      this.state.mode !== "edit"
    ){
      return false;
    }
  
  
    /*
      반드시 타일 하나만 선택
    */
    if(
      this.state.selectedFloorIds
        .size !== 1
    ){
      return false;
    }
  
  
    const selectedId =
      this.state.activeFloorId;
  
  
    if(!selectedId){
      return false;
    }
  
  
    const index =
      this.doc.indexOfId(
        selectedId
      );
  
  
    /*
      index 0 = 시작 타일
      삭제 금지
    */
    if(index <= 0){
      return false;
    }
  
  
    /*
      타일이 하나뿐이라면
      삭제 금지
    */
    if(
      this.doc.ids.length <= 1
    ){
      return false;
    }
  
  
    /*
      삭제 후에는 항상 바로 이전 타일을 선택한다.

      index > 0만 삭제할 수 있으므로
      index - 1은 항상 유효한 이전 타일이다.
    */
    const nextSelectedId =
      this.doc.ids[index - 1] ??
      null;
  
  
    /*
      실제 삭제
  
      Document.removeById()가
      이 타일에 속한 action도 같이 제거함.
    */
    this.recordHistoryBeforeEdit();


    const removed =
      this.doc.removeById(
        selectedId
      );
  
  
    if(!removed){
      return false;
    }
  
  
    /*
      selection 상태를
      삭제된 ID에서 새 ID로 변경
    */
    this.state
      .selectedFloorIds
      .clear();
  
  
    if(nextSelectedId){
  
      this.state
        .selectedFloorIds
        .add(
          nextSelectedId
        );
  
  
      this.state.activeFloorId =
        nextSelectedId;
  
      this.state.selectionAnchorId =
        nextSelectedId;
    }
    else{
  
      this.state.activeFloorId =
        null;
  
      this.state.selectionAnchorId =
        null;
    }
  
  
    /*
      새 Document 기준으로
      타일 전체 재구축
    */
    this.rebuild();

    this.logger.info(
      "Tile deleted",
      {
        floorIndex: index,
        floorId: selectedId
      }
    );
  
    return true;
  }
  
  addMidspinAfterSelected(){
  
    return this.addFloorAfterSelected(
      999
    );
  }
  
  addFullspinAfterSelected(){
  
    if(
      this.state.mode !== "edit" ||
      this.state.selectedFloorIds
        .size !== 1
    ){
      return false;
    }
  
  
    const index =
      this.doc.indexOfId(
        this.state.activeFloorId
      );
  
  
    if(index < 0){
      return false;
    }
  
  
    const floor =
      this.compiled
        ?.floors?.[
          index
        ];
  
  
    if(!floor){
      return false;
    }
  
  
    /*
      네 Compiler에서
  
      floor.startAngle =
        reverseAngle(nowAngle)
  
      따라서 이 방향을 다음 raw angle로
      삽입하면 angle == 0,
      즉 Fullspin 처리된다.
    */
    const fullspinAngle =
      normalizeAngle(
        floor.startAngle
      );
  
  
    return this.addFloorAfterSelected(
      fullspinAngle
    );
  }
  
  removeSelectedFloors(){

    const ids = [
      ...this.state.selectedFloorIds
    ];
  
    if(ids.length === 0){
      return false;
    }
  
    // 삭제 가능한 타일만
    // index 0은 시작 타일이라 보호
    const removableIds = ids.filter(id => {
      return this.doc.indexOfId(id) > 0;
    });
  
    if(removableIds.length === 0){
      return false;
    }

    this.recordHistoryBeforeEdit();
  
    for(const id of removableIds){
      this.doc.removeById(id);
    }
  
    this.state.selectedFloorIds.clear();
    this.state.activeFloorId = null;
    this.state.selectionAnchorId = null;
  
    this.rebuild();

    this.logger.info(
      "Tiles deleted",
      { count: removableIds.length }
    );
  
    return true;
  }
  
  setSingleSelection(
    floorId,
    isFocus = true,
    updateUI = true
  ){

    /*
      기존 선택의 highlight만 제거.

      clearSelection()을 쓰지 않는다.
      clearSelection()은 UI render까지
      발생시키기 때문.
    */
    for(
      const id
      of this.state
        .selectedFloorIds
    ){

      this.runtime
        .highlightFloorById(
          id,
          false
        );
    }


    this.state
      .selectedFloorIds
      .clear();


    if(!floorId){

      this.state.activeFloorId =
        null;

      this.state.selectionAnchorId =
        null;


      if(updateUI){

        this.updateEditorUI();
      }

      return;
    }


    this.state
      .selectedFloorIds
      .add(
        floorId
      );


    this.state.activeFloorId =
      floorId;

    this.state.selectionAnchorId =
      floorId;


    this.runtime.highlightFloorById(
      floorId,
      true
    );


    if(isFocus){

      const g =
        this.runtime
          .meshByFloorId
          .get(
            floorId
          );


      if(g){

        this.cameraSystem
          .requestFocusTo(
            g.position.x,
            g.position.y
          );
      }
    }


    if(updateUI){

      this.updateEditorUI();
    }
  }
  
  clearSelection(){
    for(const id of this.state.selectedFloorIds){
      this.runtime.highlightFloorById(id, false);
    }
  
    this.state.selectedFloorIds.clear();
    this.state.activeFloorId = null;
    this.state.selectionAnchorId = null;
    
    this.updateEditorUI();
  }
  
  async togglePlayback(){

    if(this.state.mode === "play"){
  
      this.stopPlay();
  
    }
    else{
  
      await this.setPlay();
  
    }
  }
  
  
  async setPlay(){

    await this.hitSound.resume();

    const pitch =
      Number(
        this.doc?.settings?.pitch ??
        100
      );

    const playbackRate =
      Number.isFinite(pitch) &&
      pitch > 0
        ? pitch / 100
        : 1;

    /*
      The same timeline speed is applied to the level clock,
      song playback, and hitsound scheduling.
      Hitsound source pitch itself is not changed.
    */
    this.clock.setPlaybackRate(
      playbackRate
    );

    this.song.setPlaybackRate(
      playbackRate
    );

    this.hitSound.setTimelineRate(
      playbackRate
    );

    this.state.mode = "play";
    
    this.runtime
      .setPlaybackVisualMode(
        true
      );
    
    this.modifierKeys.setEnabled(
      false
    );
    
    this.updateEditorUI();
  
    this.input.setEnabled(false);
  
    
  
  
    /*
      아무 선택도 없다면
      시작 타일 f_0 선택
    */
    if(!this.state.activeFloorId){
  
      this.setSingleSelection(
        this.doc.ids[0],
        false
      );
    }
  
  
    let selectedIndex =
      this.doc.indexOfId(
        this.state.activeFloorId
      );
  
    if(selectedIndex < 0){
      return false;
    }
  
  
    /*
      f_0은 시작용 타일.
  
      f_0에서 Play를 누른 경우
      실제 진행 목표는 f_1.
    */
    let targetIndex =
      selectedIndex;
  
    if(
      targetIndex === 0 &&
      this.doc.ids.length > 1
    ){
      targetIndex = 1;
    }
  
  
    const target_us =
      this.compiled.floorStarts_us[
        targetIndex
      ];
  
  
    /*
      settings.bpm 기준 3박
    */
    const baseBeat_us =
      60000000 /
      this.doc.settings.bpm;
  
    const countIn_us =
      3 * baseBeat_us;
  
  
    /*
      실제 Clock은 목표 지점보다
      3박 전부터 시작한다.
    */
    const preRollStart_us =
      target_us -
      countIn_us;
  
  
    this.playTargetIndex =
      targetIndex;
  
    this.playTarget_us =
      target_us;
  
    this.levelStarted =
      false;
  
  
    /*
      pre-roll 중에는 현재 선택을 유지.
  
      f_0에서 시작하면 f_0을 보여주고,
      중간 타일에서 시작하면 해당 타일을 보여준다.
    */
    this.playbackFloorIndex =
      selectedIndex;
  
  
    // focus 애니메이션 제거
    this.cameraSystem.cancelFocus();
  
  
    // 재생 시 줌 초기화
    this.cameraSystem.setZoomPercent(
      100
    );
  
  
    /*
      Seed playback camera from the tile the user actually selected.
      For a middle start, older camera transitions must not leak into
      the new playback session. The next tile transition is then
      consumed normally by Evaluator.evaluateAt().
    */
    this.evaluator.init(
      this.compiled,
      this.playTarget_us,
      selectedIndex
    );

    const initialCameraFrame =
      this.evaluator.evaluateAt(
        this.compiled,
        this.playTarget_us,
        this.playTargetIndex
      );

    if(
      initialCameraFrame
        ?.camera
    ){
      this.cameraSystem.applyCameraFrame(
        initialCameraFrame.camera
      );
    }
  
  
    /*
      Clock, Song 모두
      정확히 같은 AudioContext 시점에서 시작.
    */
    const ctxStartTime =
      this.hitSound.ctx.currentTime;
  
  
    this.clock.startAt(
      preRollStart_us,
      ctxStartTime
    );
  
  
    /*
      곡 역시 3박 전 위치부터 시작.
  
      settings.offset은 이미
      floorStarts_us에 포함되어 있으므로
      다시 더하지 않는다.
    */
    /*
      Editor Offset is intentionally NOT applied to the song.
      Music and hitsounds must remain on the same level clock.
      The editor-only compensation is applied only when evaluating
      visualTime_us below.
    */
    this.song.playFromLevelTime(
      preRollStart_us,
      ctxStartTime,
      0
    );
  
  
    /*
      Hitsounds are armed BEFORE the pre-roll finishes.

      start() skips every event before playTarget_us, while update()
      can schedule the first target hit slightly ahead of time using
      the AudioContext clock. This avoids the old behavior where the
      first hit was only created after the render frame had already
      crossed the target tile.
    */
    this.hitSound.start(
      this.compiled
        .hitSoundEvents,

      this.compiled
        .countdownHitTimes_us,

      this.playTarget_us
    );
  
  
    this.playButton.setPlaying(
      true
    );
  
  
    this.renderEngine.onFrame =
      () => {
  
        this.clock.update();
  
        const t_us =
          this.clock.getTime_us();

        /*
          Always advance the audio scheduler, including during
          pre-roll. Events before playTarget_us were filtered by
          HitSoundSystem.start(), so this remains silent before the
          chosen start but lets the first target hit land exactly.
        */
        this.hitSound.update(
          t_us
        );
          
        const visualTime_us =
          Math.max(
            this.playTarget_us ?? -Infinity,
            t_us -
            this.editorVisualOffset_ms * 1000
          );
  
        /*
          ==========================
          3박 pre-roll
          ==========================
        */
  
        if(
          t_us <
          this.playTarget_us
        ){
  
          // 카메라는 선택 위치에 그대로
          this.cameraSystem.update(
            this.runtime.renderer.domElement
          );
  
          return;
        }
  
  
        /*
          ==========================
          실제 레벨 시작 순간
          ==========================
        */
  
        if(!this.levelStarted){
  
          this.levelStarted =
            true;

            
  
  
          /*
            첫 실제 타일로 선택 이동
  
            f_0부터 시작한 경우
            여기서 f_1로 넘어감.
          */
          const targetId =
            this.doc.ids[
              this.playTargetIndex
            ];
  
          if(targetId){
  
            this.setSingleSelection(
              targetId,
              false,
              false
            );
          }
  
  
          this.playbackFloorIndex =
            this.playTargetIndex;
        }
  
  
        /*
          ==========================
          현재 타일 표시
          ==========================
        */
  
        const currentFloorIndex =
          this.evaluator
            .findFloorIndexByTime_us(
              visualTime_us
            );
  
  
        if(
          currentFloorIndex !==
          this.playbackFloorIndex
        ){
  
          this.playbackFloorIndex =
            currentFloorIndex;
  
          const id =
            this.doc.ids[
              currentFloorIndex
            ];
  
          if(id){
  
            this.setSingleSelection(
              id,
              false,
              false
            );
          }
        }
  
  
        /*
          ==========================
          카메라
          ==========================
        */
  
        const frameState =
          this.evaluator.evaluateAt(
            this.compiled,
            visualTime_us,
            currentFloorIndex
          );
  
  
        this.cameraSystem.applyCameraFrame(
          frameState.camera
        );
  
  
        this.cameraSystem.update(
          this.runtime.renderer.domElement
        );
  
  
        /*
          ==========================
          레벨 끝 자동 정지
          ==========================
        */
  /*
        const lastIndex =
          this.compiled.floors.length - 1;
  
        const end_us =
          this.compiled.floorStarts_us[
            lastIndex
          ] +
          this.compiled.floorDurations_us[
            lastIndex
          ];
  
  
        if(t_us >= end_us){
          this.stopPlay();
        }
        */
      };
  
  
    this.logger.info(
      "Playback started",
      {
        targetIndex: this.playTargetIndex,
        target_us: this.playTarget_us,
        pitch: this.doc?.settings?.pitch ?? 100
      }
    );

    return true;
  }
  
  stopPlay(){

    if(this.state.mode !== "play"){
      return false;
    }
  
  
    this.clock.update();
  
    const t_us =
      this.clock.getTime_us();
  
  
    let index;
  
  
    /*
      아직 3박 countdown 중이면
      원래 시작하려던 타일 위치 유지
    */
    if(!this.levelStarted){
  
      index =
        this.playTargetIndex;
    }
    else{

      const visualTime_us =
        Math.max(
          this.playTarget_us ?? -Infinity,
          t_us -
          this.editorVisualOffset_ms *
          1000
        );
  
      index =
        this.evaluator
          .findFloorIndexByTime_us(
            visualTime_us
          );
    }
  
  
    const floorId =
      this.doc.ids[index];
  
  
    // 곡 즉시 중단
    this.song.stop();
  
    // 예약된 히트사운드 중단
    this.hitSound.stop();
  
  
    this.setEdit();
  
  
    if(floorId){
  
      this.setSingleSelection(
        floorId,
        false
      );
    }

    this.logger.info(
      "Playback stopped",
      { index }
    );
  
    return true;
  }
  
  setEdit(){

    this.state.mode = "edit";
    
    this.runtime
      .setPlaybackVisualMode(
        false
      );

    this.input.setEnabled(true);
    
    this.modifierKeys.setEnabled(
      true
    );
  
  
    this.song.stop();
  
    this.hitSound.stop();
  
    this.clock.stop();
  
  
    this.playbackFloorIndex = null;
  
    this.playTargetIndex = null;
    this.playTarget_us = null;
  
    this.levelStarted = false;
  
  
    this.playButton?.setPlaying(false);
  
  
    this.renderEngine.onFrame =
      () => {
  
        this.cameraSystem.update(
          this.runtime.renderer.domElement
        );
      };
    this.updateEditorUI();
  }
  
  setEditorOffset(
    ms,
    {
      persist = true,
      log = true
    } = {}
  ){

    const value =
      Number(ms);

    if(!Number.isFinite(value)){
      return false;
    }

    /*
      A single editor offset must never desynchronize audio channels.
      Apply it only to the visual evaluator.
    */
    this.editorVisualOffset_ms =
      value;

    this.editorGlobalOffset_ms =
      0;

    if(persist){
      this.writeEditorPreference(
        "adofai-editor-offset-ms",
        value
      );
    }

    if(log){
      this.logger.info(
        "Editor offset changed",
        {
          ms: value,
          meaning:
            value >= 0
              ? "visuals delayed"
              : "visuals advanced"
        }
      );
    }

    return true;
  }

  /*
    Backward-compatible alias. Older builds exposed a global offset
    that shifted only the song. Redirect it to the safe visual-only
    editor offset instead.
  */
  setEditorGlobalOffset(ms){
    return this.setEditorOffset(ms);
  }

  setLevelLoading(
    loading,
    text = "loading..."
  ){

    const element =
      document.getElementById(
        "level-loading"
      );


    if(!element){
      return;
    }


    element.textContent =
      text;


    if(loading){

      element.classList.remove(
        "hidden"
      );
    }
    else{

      element.classList.add(
        "hidden"
      );
    }
  }
  
  /* =========================================================
     Level title markup

     Supported:
       <b>...</b>
       <i>...</i>
       <color=#rgb|#rgba|#rrggbb|#rrggbbaa>...</color>
       <size=number>...</size>

     The Artist and Song strings are concatenated BEFORE parsing,
     so a tag may open in Artist and close in Song.
  ========================================================= */

  normalizeTitleColor(value){

    const match =
      String(value ?? "")
        .trim()
        .match(
          /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
        );

    if(!match){
      return null;
    }

    const hex =
      match[1].toLowerCase();

    if(hex.length === 3){
      return "#" +
        hex
          .split("")
          .map(ch => ch + ch)
          .join("");
    }

    if(hex.length === 4){
      /*
        Match the requested ADOFAI-like behavior:
        #ffff -> #ffffff
        The fourth short-form digit is ignored.
      */
      return "#" +
        hex
          .slice(0, 3)
          .split("")
          .map(ch => ch + ch)
          .join("");
    }

    return `#${hex}`;
  }

  parseLevelTitleMarkup(rawText){

    const raw =
      String(rawText ?? "");

    const tokens = [];
    let cursor = 0;

    /* =========================
       Tokenize
    ========================= */

    while(cursor < raw.length){

      const openIndex =
        raw.indexOf("<", cursor);

      if(openIndex < 0){
        tokens.push({
          type: "text",
          value: raw.slice(cursor)
        });
        break;
      }

      if(openIndex > cursor){
        tokens.push({
          type: "text",
          value: raw.slice(
            cursor,
            openIndex
          )
        });
      }

      const closeIndex =
        raw.indexOf(">", openIndex + 1);

      /* Wrong bracket syntax -> display the whole source literally. */
      if(closeIndex < 0){
        return {
          valid: false,
          raw,
          plainText: raw,
          fragment: null
        };
      }

      const source =
        raw.slice(
          openIndex,
          closeIndex + 1
        );

      const body =
        raw.slice(
          openIndex + 1,
          closeIndex
        );

      const closing =
        body.match(
          /^\/([A-Za-z][A-Za-z0-9]*)$/
        );

      const opening =
        body.match(
          /^([A-Za-z][A-Za-z0-9]*)(?:=([^<>]*))?$/
        );

      if(closing){
        tokens.push({
          type: "close",
          name: closing[1].toLowerCase(),
          source
        });
      }
      else if(opening){
        tokens.push({
          type: "open",
          name: opening[1].toLowerCase(),
          value:
            opening[2] === undefined
              ? null
              : opening[2],
          source
        });
      }
      else{
        return {
          valid: false,
          raw,
          plainText: raw,
          fragment: null
        };
      }

      cursor =
        closeIndex + 1;
    }

    /* =========================
       Validate nesting first.

       If even one tag is unclosed or mismatched, the complete
       title is rendered literally instead of partially styling it.
    ========================= */

    const validationStack = [];

    for(const token of tokens){

      if(token.type === "open"){
        validationStack.push(
          token.name
        );
      }
      else if(token.type === "close"){

        if(
          validationStack.length === 0 ||
          validationStack.at(-1) !== token.name
        ){
          return {
            valid: false,
            raw,
            plainText: raw,
            fragment: null
          };
        }

        validationStack.pop();
      }
    }

    if(validationStack.length > 0){
      return {
        valid: false,
        raw,
        plainText: raw,
        fragment: null
      };
    }

    /* =========================
       Build safe DOM nodes.
       Raw HTML is never assigned through innerHTML.
    ========================= */

    const fragment =
      document.createDocumentFragment();

    const stack = [
      {
        name: null,
        node: fragment,
        size: 85,
        hidden: false
      }
    ];

    let plainText = "";

    for(const token of tokens){

      const current =
        stack.at(-1);

      if(token.type === "text"){

        current.node.appendChild(
          document.createTextNode(
            token.value
          )
        );

        if(!current.hidden){
          plainText += token.value;
        }

        continue;
      }

      if(token.type === "close"){
        stack.pop();
        continue;
      }

      const parent =
        stack.at(-1);

      const name =
        token.name;

      let node =
        parent.node;

      let nextSize =
        parent.size;

      let hidden =
        parent.hidden;

      const isSupported =
        name === "b" ||
        name === "i" ||
        name === "color" ||
        name === "size";

      if(isSupported){

        const span =
          document.createElement(
            "span"
          );

        span.className =
          "level-title-rich-node";

        if(name === "b"){
          span.style.fontWeight =
            "800";
        }
        else if(name === "i"){
          span.style.fontStyle =
            "italic";
        }
        else if(name === "color"){

          const color =
            this.normalizeTitleColor(
              token.value
            );

          if(color){
            span.style.color =
              color;
          }
        }
        else if(name === "size"){

          /*
            parseFloat-like leading-number behavior:
              100      -> 100
              100px    -> 100
              85abc    -> 85
          */
          const sizeMatch =
            String(token.value ?? "")
              .trim()
              .match(
                /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)/
              );

          if(sizeMatch){

            const parsedSize =
              Number(sizeMatch[0]);

            if(
              Number.isFinite(parsedSize) &&
              parsedSize >= 0
            ){

              nextSize =
                parsedSize;

              if(parsedSize === 0){
                span.style.display =
                  "none";

                hidden = true;
              }
              else if(parent.size > 0){

                /*
                  Size values are absolute relative to the ADOFAI
                  baseline 85, not multiplicative when nested.
                */
                const relativePercent =
                  parsedSize /
                  parent.size *
                  100;

                span.style.fontSize =
                  `${relativePercent}%`;
              }
            }
          }
        }

        parent.node.appendChild(
          span
        );

        node = span;
      }

      /*
        Unknown but syntactically valid tags deliberately create no
        visible element. Their enclosed text still renders normally.
      */
      stack.push({
        name,
        node,
        size: nextSize,
        hidden
      });
    }

    return {
      valid: true,
      raw,
      plainText,
      fragment
    };
  }

  updateProjectTitle(){

    const settings =
      this.doc?.settings ?? {};

    const artist =
      String(
        settings.artist ?? ""
      ).trim() ||
      "Artist";

    const song =
      String(
        settings.song ?? ""
      ).trim() ||
      "Song";

    /*
      Parse only after joining the two settings fields. This is what
      lets an opening tag in Artist close inside Song.
    */
    const rawTitle =
      `${artist} - ${song}`;

    const parsed =
      this.parseLevelTitleMarkup(
        rawTitle
      );

    const browserTitle =
      parsed.valid
        ? parsed.plainText
        : rawTitle;

    document.title =
      browserTitle ||
      "ADOFAI Web Editor";

    const element =
      document.getElementById(
        "level-title"
      );

    if(element){

      element.replaceChildren();

      if(parsed.valid){
        element.appendChild(
          parsed.fragment
        );
      }
      else{
        element.textContent =
          rawTitle;
      }

      element.title =
        browserTitle ||
        rawTitle;
    }

    return rawTitle;
  }

  /* =========================================================
     Editor info overlay
  ========================================================= */

  setEditorInfoVisible(visible){

    this.editorInfoVisible =
      Boolean(visible);

    if(!this.editorInfoElement){
      this.editorInfoElement =
        document.getElementById(
          "editor-info"
        );
    }

    if(this.editorInfoElement){
      this.editorInfoElement.hidden =
        !this.editorInfoVisible;
    }

    if(this.editorInfoVisible){
      this.updateEditorInfo();
    }
  }

  updateEditorInfo(){

    if(!this.editorInfoVisible){
      return;
    }

    const element =
      this.editorInfoElement ??
      document.getElementById(
        "editor-info"
      );

    if(!element){
      return;
    }

    this.editorInfoElement =
      element;

    const finite = value => {
      const number = Number(value);
      return Number.isFinite(number)
        ? number
        : null;
    };

    const angleText = value => {
      const number = finite(value);
      return number === null
        ? "—"
        : `${Number(number.toFixed(4))}°`;
    };

    const numberText = (
      value,
      digits = 4
    ) => {
      const number = finite(value);
      return number === null
        ? "—"
        : Number(
            number.toFixed(digits)
          ).toString();
    };

    const frame =
      this.renderEngine?.frameCount ?? 0;

    const fps =
      Number(
        this.renderEngine?.fps ?? 0
      );

    const tileCount =
      this.doc?.ids?.length ?? 0;

    const eventCount =
      this.doc?.actions?.length ?? 0;

    const cameraX =
      Number(
        this.cameraSystem?.tgt?.x ?? 0
      );

    const cameraY =
      Number(
        this.cameraSystem?.tgt?.y ?? 0
      );

    const zoom =
      Number(
        this.cameraSystem?.getZoomPercent?.() ??
        100
      );

    const lines = [
      `Frame: ${frame}  FPS: ${fps.toFixed(1)}`,
      `Tiles: ${tileCount}  Events: ${eventCount}`,
      `Camera: (${cameraX.toFixed(2)}, ${cameraY.toFixed(2)})  Zoom: ${zoom.toFixed(0)}%`
    ];

    const mode =
      String(
        this.state?.mode ?? "edit"
      ).toUpperCase();

    const activeId =
      this.state?.activeFloorId ?? null;

    const selectedCount =
      this.state?.selectedFloorIds?.size ?? 0;

    let activeIndex = -1;

    if(activeId && this.doc){
      activeIndex =
        this.doc.indexOfId(
          activeId
        );
    }

    if(activeIndex >= 0){

      const floor =
        this.compiled?.floors?.[
          activeIndex
        ];

      if(floor){
        lines.push(
          `Selected: #${activeIndex} (${selectedCount})  Tile: (${Number(floor.x).toFixed(2)}, ${Number(floor.y).toFixed(2)})`
        );

        const isTwirled =
          Boolean(
            floor.option?.isTwirled
          );

        lines.push(
          `isTwirled: ${isTwirled}  Orbit: ${isTwirled ? "Counterclockwise (CCW)" : "Clockwise (CW)"}`
        );

        /*
          Absolute direction is reconstructed from Floor.startAngle.
          Compiler stores startAngle as reverseAngle(nowAngle), so
          reversing once more yields the actual resolved ADOFAI angle.
          This also works after a 999/MID run where doc.angles itself is
          deliberately still 999.
        */
        const currentAbsolute =
          normalizeAngle(
            reverseAngle(
              Number(floor.startAngle)
            )
          );

        const previousFloor =
          activeIndex > 0
            ? this.compiled?.floors?.[
                activeIndex - 1
              ]
            : null;

        const nextFloor =
          activeIndex + 1 < tileCount
            ? this.compiled?.floors?.[
                activeIndex + 1
              ]
            : null;

        const previousAbsolute =
          previousFloor
            ? normalizeAngle(
                reverseAngle(
                  Number(
                    previousFloor.startAngle
                  )
                )
              )
            : null;

        const nextAbsolute =
          nextFloor
            ? normalizeAngle(
                reverseAngle(
                  Number(
                    nextFloor.startAngle
                  )
                )
              )
            : finite(
                floor.endAngle
              );

        const rawAngle =
          this.doc?.angles?.[
            activeIndex
          ];

        const relativeAngle =
          finite(
            this.compiled
              ?.relativeAngles?.[
                activeIndex
              ]
          );

        const totalBeat =
          finite(
            this.compiled?.beats?.[
              activeIndex
            ]
          );

        const baseBeat =
          relativeAngle !== null
            ? relativeAngle / 180
            : null;

        const pauseBeat =
          (
            totalBeat !== null &&
            baseBeat !== null
          )
            ? Math.max(
                0,
                totalBeat - baseBeat
              )
            : null;

        const bpm =
          finite(
            this.compiled?.bpms?.[
              activeIndex
            ]
          );

        const relativeBpm =
          (
            bpm !== null &&
            baseBeat !== null &&
            baseBeat > 0
          )
            ? bpm / baseBeat
            : null;

        lines.push(
          `Absolute: ${angleText(currentAbsolute)}${rawAngle === 999 ? "  Raw: MID(999)" : ""}`
        );

        lines.push(
          `Angles: ${angleText(previousAbsolute)} → ${angleText(currentAbsolute)} → ${angleText(nextAbsolute)}`
        );

        lines.push(
          `Tile Arms: ${angleText(floor.startAngle)} → ${angleText(floor.endAngle)}`
        );

        lines.push(
          `Timing Angle: ${angleText(relativeAngle)}  Base Beat: ${numberText(baseBeat, 6)}`
        );

        if(
          totalBeat !== null
        ){
          if(
            pauseBeat !== null &&
            pauseBeat > 0.000001
          ){
            lines.push(
              `Actual Beat: ${numberText(totalBeat, 6)}  (${numberText(baseBeat, 6)} angle + ${numberText(pauseBeat, 6)} pause)`
            );
          }
          else{
            lines.push(
              `Actual Beat: ${numberText(totalBeat, 6)}`
            );
          }
        }

        lines.push(
          `BPM: ${numberText(bpm, 3)}  Relative BPM: ${relativeBpm === null ? "—" : numberText(relativeBpm, 3)}`
        );

        const floorStart_us =
          finite(
            this.compiled?.floorStarts_us?.[
              activeIndex
            ]
          );

        const floorDuration_us =
          finite(
            this.compiled?.floorDurations_us?.[
              activeIndex
            ]
          );

        if(
          floorStart_us !== null &&
          floorDuration_us !== null
        ){
          const startSec =
            floorStart_us / 1000000;

          const endSec =
            (
              floorStart_us +
              floorDuration_us
            ) / 1000000;

          lines.push(
            `Timeline: ${startSec.toFixed(4)}s → ${endSec.toFixed(4)}s  (${(floorDuration_us / 1000).toFixed(2)}ms)`
          );
        }
      }
      else{
        lines.push(
          `Selected: #${activeIndex} (${selectedCount})`
        );
      }
    }
    else{
      lines.push(
        `Selected: — (${selectedCount})`
      );
    }

    const pitch =
      Number(
        this.doc?.settings?.pitch ??
        100
      );

    let statusLine =
      `Mode: ${mode}`;

    if(Number.isFinite(pitch)){
      statusLine +=
        `  Pitch: ${pitch}%`;
    }

    const editorOffset =
      Number(this.editorVisualOffset_ms);

    if(Number.isFinite(editorOffset)){
      const sign =
        editorOffset > 0
          ? "+"
          : "";

      statusLine +=
        `  Editor Offset: ${sign}${editorOffset}ms`;
    }

    lines.push(statusLine);

    if(
      this.state?.mode === "play" &&
      this.clock
    ){
      const levelTimeSec =
        Number(
          this.clock.getTime_us()
        ) /
        1000000;

      /*
        Song and hitsounds share the unshifted level clock.
        Editor Offset affects visuals only.
      */
      const songTimeSec =
        levelTimeSec;

      const songDurationSec =
        finite(
          this.song?.buffer?.duration
        );

      if(songDurationSec !== null){
        lines.push(
          `Playback: ${this.formatPlaybackTime(songTimeSec)} / ${this.formatPlaybackTime(songDurationSec)}`
        );
      }
      else{
        const lastIndex =
          (this.compiled?.floors?.length ?? 0) - 1;

        const levelEnd_us =
          lastIndex >= 0
            ? Number(
                this.compiled.floorStarts_us[
                  lastIndex
                ]
              ) +
              Number(
                this.compiled.floorDurations_us[
                  lastIndex
                ] ?? 0
              )
            : NaN;

        lines.push(
          Number.isFinite(levelEnd_us)
            ? `Level Time: ${this.formatPlaybackTime(levelTimeSec)} / ${this.formatPlaybackTime(levelEnd_us / 1000000)}`
            : `Level Time: ${this.formatPlaybackTime(levelTimeSec)}`
        );
      }
    }

    element.textContent =
      lines.join("\n");
  }

  addEventToSelected(
    eventType
  ){

    /*
      편집 모드에서만
    */
    if(
      this.state.mode !==
      "edit"
    ){
      return null;
    }


    /*
      반드시 타일 하나 선택
    */
    if(
      this.state
        .selectedFloorIds
        .size !== 1
    ){
      return null;
    }


    const floorId =
      this.state.activeFloorId;


    if(!floorId){
      return null;
    }


    /*
      Document가

      allowMultiple
      기존 이벤트 존재 여부

      모두 검사한다.
    */
    if(
      !this.doc.canAddAction(
        floorId,
        eventType
      )
    ){
      return null;
    }


    this.recordHistoryBeforeEdit();


    const action =
      this.doc.addAction(
        floorId,
        eventType
      );


    if(!action){
      return null;
    }


    /*
      즉시 컴파일.

      → 이벤트 탭 생성
      → 타일 이벤트 아이콘 변경
      → BPM / Pause 등 적용
    */
    this.rebuild();

    this.logger.info(
      "Event added",
      {
        eventType,
        floorId
      }
    );

    return action;
  }
}

/*
  Optional admin/debug handle for testers using DevTools.
  Example:
    editorDebug.toText()
    editorDebug.entries
*/
window.editorDebug =
  EDITOR_LOGGER;

window.app = new EditorApp();

app.loadProject("./level.adofai")
  .catch(error => {
    app.setLevelLoading(
      false
    );

    app.reportError(
      error,
      "Editor startup failed"
    );
  });
