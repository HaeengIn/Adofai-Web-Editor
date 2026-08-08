import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import JSON5 from "https://cdn.jsdelivr.net/npm/json5@2/dist/index.mjs";
import {
  mergeGeometries
} from "three/addons/utils/BufferGeometryUtils.js";


const degToRad = (deg) => {return deg * 2*Math.PI / 360}
const radToDeg = (rad) => {return rad * 360 / (2 * Math.PI)}
const normalizeAngle = (a) => {return ((a % 360) + 360) % 360}
const reverseAngle = (a) => {return (a + 180)%360}




const EVENT_MARKER_ICONS = {

  /*
    1 < BPM 배율 <= 2.05
  */
  rabbit:
    "./icons/Rabbit.png",

  /*
    BPM 배율 > 2.05
  */
  rabbitFast:
    "./icons/Double_Rabbit.png",


  /*
    0.45 < BPM 배율 < 1
  */
  snail:
    "./icons/Snail.png",

  /*
    BPM 배율 <= 0.45
  */
  snailSlow:
    "./icons/Double_Snail.png",


  /*
    Twirl 색상.

    blue = Twirl 적용 후 현재 타일 -> 다음 타일의
           유효 각도가 180° 이상

    red  = 180° 미만
  */
  twirlBlue:
    "./icons/swirl_blue.png",

  twirlRed:
    "./icons/swirl_red.png",


    /*
      Pause 및 기타 모든 이벤트
    */
    star:
      "./icons/tile_vfx.png"
  };



function createEventMarkerInfo(
  actions,
  bpmBefore,
  twirlState, // false = 시계, true = 반시계
  twirlVisual = null
){

  let marker = null;

  /*
    0  = 별
    10 = 전용 아이콘

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
        빨라짐
      */
      if(ratio > 1){

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

          10
        );
      }


      /*
        느려짐
      */
      else if(ratio < 1){

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

          10
        );
      }


      /*
        BPM 변화가 없는 SetSpeed
      */
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
        원본 swirl 이미지는 90° 방향을
        기준 방향으로 사용한다.

        Three.js의 +Z 회전은 반시계 방향이므로
        목표 절대각 A에 맞추려면 A - 90°.

        예:
          next 90° -> 0° 회전
          next 0°  -> -90° 회전 (= 시계 90°)
      */
      const rotationDeg =
        Number.isFinite(
          nextAbsoluteAngle
        )
          ? normalizeAngle(
              nextAbsoluteAngle - 90
            )
          : 0;


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

        10
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

const EVENT_TAB_DEFS = {

  SetSpeed: {
    key:
      "speed",

    title:
      "Set Speed",

    iconSrc:
      "./icons/SetSpeed.png",

    editable:
      true,

    allowMultiple:
      true,

    defaultData: {
      speedType:
        "Bpm",

      beatsPerMinute:
        100,

      bpmMultiplier:
        1,

      angleOffset:
        0
    },

    order:
      10
  },


  Twirl: {
    key:
      "twirl",

    title:
      "Twirl",

    iconSrc:
      "./icons/Twirl.png",

    editable:
      true,

    allowMultiple:
      false,

    defaultData: {},

    order:
      20
  },


  Pause: {
    key:
      "pause",

    title:
      "Pause",

    iconSrc:
      "./icons/Pause.png",

    editable:
      true,

    allowMultiple:
      false,

    defaultData: {
      duration:
        1,

      countdownTicks:
        0,

      angleCorrectionDir:
        "None"
    },

    order:
      30
  },


  SetHitsound: {
    key:
      "hitsound",

    title:
      "Set Hitsound",

    iconSrc:
      "./icons/SetGameSound.png",

    editable:
      true,

    allowMultiple:
      false,

    defaultData: {
      gameSound:
        "Hitsound",

      hitsound:
        "Kick",

      hitsoundVolume:
        100
    },

    order:
      40
  }

};

function getEventDefinition(
  eventType
){

  return (
    EVENT_TAB_DEFS[
      eventType
    ]
    ??
    null
  );
}


function createEventTabGroups(
  actions
){
  const groups =
    new Map();


  for(const action of actions){

    const def =
      EVENT_TAB_DEFS[
        action.eventType
      ];


    /*
      아직 전용 UI가 없는 이벤트
    */
    if(!def){

      const key =
        "unsupported";
    
    
      if(!groups.has(key)){
    
        groups.set(
          key,
          {
            key:
              "unsupported",
    
            title:
              "Unsupported Events",
    
            iconSrc:
              "./icons/tile_vfx.png",
    
            order:
              1000,
    
            editable:
              false,
    
            actions:
              []
          }
        );
      }
    
    
      groups
        .get(key)
        .actions
        .push(action);
    
    
      continue;
    
    }


    /*
      이미 같은 종류의 탭이 있으면
      그 안에 이벤트만 추가
    */
    if(!groups.has(def.key)){

      groups.set(
        def.key,
        {
          ...def,

          actions: []
        }
      );
    }


    groups
      .get(def.key)
      .actions
      .push(action);
  }


  return [
    ...groups.values()
  ].sort(
    (a, b) =>
      a.order - b.order
  );
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

//카메라를 전문적으로 다루기 위한 카메라 클래그
class CameraSystem{
  constructor(three){
    this.THREE = three;

    this.camera = null;
    this.controls = null;

    // 기존 1920×1080에서 보이던 월드 범위.
    // 화면 비율이 바뀌어도 최소한 이 범위는 유지한다.
    this.baseViewWidth = 19.2;
    this.baseViewHeight = 10.8;

    // 내부 상태(진짜 카메라 상태)
    this.pos = new this.THREE.Vector3(0, 0, 100);
    
    this.tgt = new this.THREE.Vector3(0, 0, 0);

    // 이번 프레임 입력 누적(드래그 등)
    this._panPixels = { dx: 0, dy: 0 };

    // focus 상태
    this._focus = {
      enabled: false,
      fromPos: new this.THREE.Vector3(),
      toPos: new this.THREE.Vector3(),
      fromTgt: new this.THREE.Vector3(),
      toTgt: new this.THREE.Vector3(),
      startMs: 0,
      durationSec: 1,
      ease: "outquad",
    };

    this.viewportWidth = 1;
    this.viewportHeight = 1;
  }
  
  //카메라 초기셋팅
  init(domElement){
    const THREE = this.THREE;
  
    const halfW =
      this.baseViewWidth / 2;
  
    const halfH =
      this.baseViewHeight / 2;
  
    this.camera =
      new THREE.OrthographicCamera(
        -halfW,
         halfW,
         halfH,
        -halfH,
         0.1,
         2000
      );
  
    this.camera.position.copy(
      this.pos
    );
  
    this.camera.lookAt(
      this.tgt
    );
  
    this.controls =
      new OrbitControls(
        this.camera,
        domElement
      );
  
    this.controls.enableRotate = false;
    this.controls.enablePan = false;
  
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 0.8;
  
    this.controls.screenSpacePanning = true;
  
    this.controls.target.copy(
      this.tgt
    );
  
    this.controls.update();
  }

  // 외부 API: 드래그(픽셀)를 요청만 누적
  requestPanByPixels(dx, dy){
    // 드래그가 들어오면 자동 포커스 취소
    if(this._focus.enabled) this.cancelFocus();
    
    this._panPixels.dx += dx;
    this._panPixels.dy += dy;
  }
  
  // 월드 단위로 바로 팬(좌표계 기준)
  requestPanByWorld(worldDx, worldDy){
    if(this._focus.enabled) this.cancelFocus();
    
    this.pos.x += worldDx;
    this.pos.y += worldDy;
  
    this.tgt.x += worldDx;
    this.tgt.y += worldDy;
  }

  // 외부 API: 포커스 이동, 각 포커스에 대한 정보들을 설정하는 함수
  requestFocusTo(toX, toY, durationSec = 0.6, easeName = "outexpo"){
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
  
  //포커스 취소
  cancelFocus(){
    this._focus.enabled = false;
  }

  // 내부: 픽셀 -> 월드 변환 후 pos/tgt에 적용
  _applyPanPixels(domElement){
    const dx = this._panPixels.dx;
    const dy = this._panPixels.dy;
    if(dx === 0 && dy === 0) return;

    this._panPixels.dx = 0;
    this._panPixels.dy = 0;

    const cssW =
      this.viewportWidth;

    const cssH =
      this.viewportHeight;
    if(cssW <= 0 || cssH <= 0) return;

    const cam = this.camera;

    const viewW = (cam.right - cam.left) / cam.zoom;
    const viewH = (cam.top - cam.bottom) / cam.zoom;

    const worldDx = -dx * (viewW / cssW);
    const worldDy =  dy * (viewH / cssH);

    this.pos.x += worldDx;
    this.pos.y += worldDy;

    this.tgt.x += worldDx;
    this.tgt.y += worldDy;
  }
  
  applyCameraFrame(cameraFrame){
    this.pos.x = this.tgt.x = cameraFrame.x;
    this.pos.y = this.tgt.y = cameraFrame.y;
    
    
  }
  
  setZoomPercent(percent){
    const p = Math.max(1, percent);
  
    this.camera.zoom = p / 100;
    this.camera.updateProjectionMatrix();
  
    this.controls.update();
  }
  
  getZoomPercent(){
    return this.camera.zoom * 100;
  }
  
  //최종 값들을 업데이트하는 함수
  update(domElement){
    //focus
    if(this._focus.enabled){
      const now = performance.now();
      const durMs = this._focus.durationSec*1000
      const t = durMs <= 0 ? 1 : (now - this._focus.startMs) / durMs;

      if(t >= 1){
        this.pos.copy(this._focus.toPos);
        this.tgt.copy(this._focus.toTgt);
        this._focus.enabled = false;
      } else {
        const a = ease(t, this._focus.ease);
        //three.js에 있는 lerpVectors
        this.pos.lerpVectors(this._focus.fromPos, this._focus.toPos, a);
        this.tgt.lerpVectors(this._focus.fromTgt, this._focus.toTgt, a);
      }
    }

    //드래그 pan 적용
    this._applyPanPixels(domElement);

    //실제 카메라 반영
    this.camera.position.copy(this.pos);
    this.controls.target.copy(this.tgt);
    this.controls.update();
  }
  
  resize(width, height){

    this.viewportWidth =
      width;

    this.viewportHeight =
      height;

    if(
      !this.camera ||
      width <= 0 ||
      height <= 0
    ){
      return;
    }
  
    const aspect =
      width / height;
  
    const baseAspect =
      this.baseViewWidth /
      this.baseViewHeight;
  
    let viewWidth;
    let viewHeight;
  
    if(aspect >= baseAspect){
  
      viewHeight =
        this.baseViewHeight;
  
      viewWidth =
        viewHeight * aspect;
    }
    else{
  
      viewWidth =
        this.baseViewWidth;
  
      viewHeight =
        viewWidth / aspect;
    }
  
    this.camera.left =
      -viewWidth / 2;
  
    this.camera.right =
      viewWidth / 2;
  
    this.camera.top =
      viewHeight / 2;
  
    this.camera.bottom =
      -viewHeight / 2;
  
    this.camera.updateProjectionMatrix();
  }
} //condition ? true : false

//Three.js 내용 관리
class RuntimeScene{
  constructor(three){
    this.Three = three;
    this.scene = null;
    this.renderer = null;
  
    this.defaultWidth = 150;
    this.defaultHeight = 85;
    this.defaultOutlineOffset = 10;
    this.defaultBorder = 23;
  
    this.isGrid = true;

    /*
      Editor-only view helpers.
      Keep references so Editor Settings can toggle them
      without rebuilding the Three.js scene.
    */
    this.gridHelper = null;
    this.axesHelper = null;
  
    this.floorMeshes = [];
    this.meshByFloorId = new Map();
    this.floorIdByMesh = new Map();
    
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    
    this.eventTextureLoader =
      new this.Three.TextureLoader();
    
    this.eventTextureCache =
      new Map();
    
    this.eventMarkerSize =
      0.5;
    
    this.circleSegments =
      16;
    
    this.renderFloorCount =
      0;
    
    
    /* =========================
       Shared Floor Resources
    ========================= */
    
    /*
      동일한 타일 모양은
      Geometry를 공유한다.
    */
    this.floorGeometryCache =
      new Map();
    
    
    /*
      타일 material도 공유.
    
      선택 여부는 inner material을
      교체하는 방식으로 처리.
    */
    this.sharedOuterMaterial =
      new this.Three.MeshBasicMaterial({
    
        color:
          0xffffff,
    
        depthTest:
          false,
    
        depthWrite:
          false
      });
    
    
    this.sharedInnerMaterial =
      new this.Three.MeshBasicMaterial({
    
        color:
          0x0a0a0a,
    
        depthTest:
          false,
    
        depthWrite:
          false
      });
    
    
    this.sharedSelectedInnerMaterial =
      new this.Three.MeshBasicMaterial({
    
        color:
          0x00ff00,
    
        depthTest:
          false,
    
        depthWrite:
          false
      });
    
    
    /* =========================
       Shared Event Resources
    ========================= */
    
    this.sharedEventMarkerGeometry =
      new this.Three.PlaneGeometry(
        this.eventMarkerSize,
        this.eventMarkerSize
      );
    
    
    this.eventMarkerMaterialCache =
      new Map();
    
    
    this.playbackVisualMode =
      false;

    this.visibleFloorMeshes =
      [];


    this.visibilityMargin =
      2;


    this.visibilityRefreshDistance =
      0.3;


    this.floorVisibilityState = {

      x:
        Infinity,

      y:
        Infinity,

      zoom:
        -1,

      viewWidth:
        -1,

      viewHeight:
        -1
    };
    
    this.floorChunkSize =
      8;
    
    
    this.floorChunks =
      new Map();
    
    
    this.attachedFloorGroups =
      new Set();
  }

  init(){

    const THREE =
      this.Three;
  
  
    this.scene =
      new THREE.Scene();
  
  
    const canvas =
      document.getElementById(
        "canvas"
      );
  
  
    if(!canvas){
  
      throw new Error(
        "canvas not found"
      );
    }
  
  
    this.renderer =
      new THREE.WebGLRenderer({
  
        canvas,
  
        antialias:
          true,
  
        powerPreference:
          "high-performance"
      });
  
  
    this.renderer.setPixelRatio(
  
      Math.min(
  
        window.devicePixelRatio ||
        1,
  
        2
      )
    );
  
  
    /* =====================================================
       Grid
    ===================================================== */
  
    /*
      타일보다 훨씬 어두운 색으로 설정.
    */
    this.gridHelper =
      new THREE.GridHelper(
  
        5000,
        5000,
  
        /*
          중심축
        */
        0x303030,
  
        /*
          일반 grid
        */
        0x202020
      );
  
  
    /*
      GridHelper는 기본적으로 XZ 평면이므로
      타일과 같은 XY 평면으로 회전.
    */
    this.gridHelper.rotation.x =
      Math.PI / 2;
  
  
    /*
      타일은 z = 0.
  
      카메라는 +Z 방향에서 보고 있으므로
      grid를 음수 Z로 보내면
      실제 공간에서도 타일 뒤가 된다.
    */
    this.gridHelper.position.z =
      -1;
  
  
    /*
      Three.js 렌더 순서에서도
      가장 먼저 그려지도록 한다.
    */
    this.gridHelper.renderOrder =
      -10000;
  
  
    /* =====================================================
       Grid Material
    ===================================================== */
  
    if(
      this.gridHelper.material
    ){
    
      const materials =
        Array.isArray(
          this.gridHelper.material
        )
          ? this.gridHelper.material
          : [
              this.gridHelper.material
            ];
    
    
      for(
        const material
        of materials
      ){
    
        /*
          중요:
          Grid를 Transparent render list에서 빼낸다.
    
          타일들은 transparent:true이므로
          Grid가 먼저 렌더링되고
          타일이 그 위를 덮게 된다.
        */
        material.transparent =
          false;
    
    
        /*
          transparent:false에서는
          opacity로 흐리게 만드는 방식은 사용하지 않는다.
        */
        material.opacity =
          1;
    
    
        /*
          순수한 배경 가이드이므로
          depth buffer에는 참여하지 않는다.
        */
        material.depthTest =
          false;
    
        material.depthWrite =
          false;
    
    
        material.needsUpdate =
          true;
      }
    }
  
  
    /* =====================================================
       Axes
    ===================================================== */
  
    this.axesHelper =
      new THREE.AxesHelper(
        10
      );
  
  
    /*
      Grid와 마찬가지로
      타일 뒤쪽에 둔다.
  
      Grid보다 아주 조금 앞.
    */
    this.axesHelper.position.z =
      -0.9;
  
  
    this.axesHelper.renderOrder =
      -9999;
  
  
    /* =====================================================
       Axes Material
    ===================================================== */
  
    if(
      this.axesHelper.material
    ){
    
      const materials =
        Array.isArray(
          this.axesHelper.material
        )
          ? this.axesHelper.material
          : [
              this.axesHelper.material
            ];
    
    
      for(
        const material
        of materials
      ){
    
        material.transparent =
          false;
    
        material.opacity =
          1;
    
        material.depthTest =
          false;
    
        material.depthWrite =
          false;
    
        material.needsUpdate =
          true;
      }
    }
  
  
    /* =====================================================
       Add Helpers
    ===================================================== */
  
    this.scene.add(
      this.gridHelper
    );
  
  
    this.scene.add(
      this.axesHelper
    );
  
  
    this.setGridVisible(
      this.isGrid
    );
  }

  setGridVisible(visible){

    this.isGrid =
      Boolean(visible);

    if(this.gridHelper){
      this.gridHelper.visible =
        this.isGrid;
    }

    if(this.axesHelper){
      this.axesHelper.visible =
        this.isGrid;
    }

    return this.isGrid;
  }
  
  rebuildFloorSpatialIndex(){

    this.floorChunks.clear();
  
  
    const size =
      this.floorChunkSize;
  
  
    for(
      const group
      of this.floorMeshes
    ){
  
      const cx =
        Math.floor(
          group.position.x /
          size
        );
  
  
      const cy =
        Math.floor(
          group.position.y /
          size
        );
  
  
      const key =
        `${cx},${cy}`;
  
  
      let chunk =
        this.floorChunks.get(
          key
        );
  
  
      if(!chunk){
  
        chunk =
          [];
  
  
        this.floorChunks.set(
          key,
          chunk
        );
      }
  
  
      chunk.push(
        group
      );
    }
  }

  // 카메라를 인자로 받는다
  render(
    camera
  ){

    this.updateFloorVisibility(
      camera
    );


    this.renderer.render(
      this.scene,
      camera
    );
  }
  
  resize(width, height){

    if(!this.renderer){
      return;
    }
  
  
    const w =
      Math.max(
        1,
        Math.round(width)
      );
  
    const h =
      Math.max(
        1,
        Math.round(height)
      );
  
  
    /*
      같은 크기라면 WebGL buffer
      다시 만들지 않음
    */
    if(
      w === this.viewportWidth &&
      h === this.viewportHeight
    ){
      return;
    }
  
  
    this.viewportWidth = w;
    this.viewportHeight = h;
  
  
    this.renderer.setSize(
      w,
      h,
      false
    );
  }
/*
  updateCanvasScale() {
    const canvas = this.renderer.domElement;
  
    const scaleX = window.innerWidth / 1920;
    const scaleY = window.innerHeight / 1080;
  
    const scale = Math.min(scaleX, scaleY);
  
    canvas.style.transform = `scale(${scale})`;
  }
  */
  
    mergeGeometryParts(
    geometries
  ){
  
    /*
      mergeGeometries는
  
      indexed / non-indexed geometry가
      섞여 있으면 실패할 수 있다.
  
      그래서 전부 non-indexed로 통일.
    */
  
    const parts = [];
  
  
    for(
      const geometry
      of geometries
    ){
  
      if(geometry.index){
  
        const converted =
          geometry.toNonIndexed();
  
  
        geometry.dispose();
  
  
        parts.push(
          converted
        );
      }
      else{
  
        parts.push(
          geometry
        );
      }
    }
  
  
    /*
      하나뿐이면 merge할 필요 없음.
    */
    if(parts.length === 1){
  
      const geometry =
        parts[0];
  
  
      geometry.computeBoundingSphere();
  
  
      return geometry;
    }
  
  
    const merged =
      mergeGeometries(
        parts,
        false
      );
  
  
    for(
      const geometry
      of parts
    ){
  
      geometry.dispose();
    }
  
  
    if(!merged){
  
      throw new Error(
        "Floor geometry merge failed."
      );
    }
  
  
    merged.computeBoundingSphere();
  
  
    return merged;
  }
  
  createRotatedRectGeometry(
    width,
    height,
    angleRad
  ){
  
    const geometry =
      new this.Three.PlaneGeometry(
        width,
        height
      );
  
  
    /*
      먼저 회전
    */
    geometry.rotateZ(
      angleRad
    );
  
  
    /*
      타일 중심에서
      반쪽 길이만큼 이동
    */
    geometry.translate(
  
      Math.cos(
        angleRad
      ) *
      width / 2,
  
      Math.sin(
        angleRad
      ) *
      width / 2,
  
      0
    );
  
  
    return geometry;
  }
  
  getFloorGeometryPair(
    floor
  ){
  
    const THREE =
      this.Three;
  
  
    const type =
      floor.option?.isFullspin
        ? "fullspin"
        : floor.option?.isMidspin
          ? "midspin"
          : "normal";
  
  
    /*
      같은 모양이면 같은 Geometry 사용
    */
    const key =
      [
        type,
        floor.startAngle,
        floor.endAngle
      ].join("|");
  
  
    const cached =
      this.floorGeometryCache.get(
        key
      );
  
  
    if(cached){
  
      return cached;
    }
  
  
    /* =========================
       Dimensions
    ========================= */
  
    const floorWidth =
      1;
  
  
    const floorHeight =
      this.defaultHeight /
      this.defaultWidth;
  
  
    const halfW =
      floorWidth / 2;
  
  
    const radius =
      floorHeight / 2;
  
  
    const floorBorder =
      this.defaultBorder /
      this.defaultWidth;
  
  
    const innerFloorWidth =
      (
        this.defaultWidth -
        this.defaultOutlineOffset
      ) /
      this.defaultWidth;
  
  
    const innerFloorHeight =
      (
        this.defaultHeight -
        this.defaultOutlineOffset
      ) /
      this.defaultWidth;
  
  
    const innerHalfW =
      innerFloorWidth / 2;
  
  
    const innerRadius =
      innerFloorHeight / 2;
  
  
    let outerGeometry;
    let innerGeometry;
  
  
    /* =========================
       Normal
    ========================= */
  
    if(type === "normal"){
  
      const a0 =
        degToRad(
          floor.startAngle
        );
  
  
      const a1 =
        degToRad(
          floor.endAngle
        );
  
  
      const outerCircle =
        new THREE.CircleGeometry(
          radius,
          this.circleSegments
        );
  
  
      const outerA =
        this.createRotatedRectGeometry(
          halfW,
          floorHeight,
          a0
        );
  
  
      const outerB =
        this.createRotatedRectGeometry(
          halfW,
          floorHeight,
          a1
        );
  
  
      outerGeometry =
        this.mergeGeometryParts([
          outerCircle,
          outerA,
          outerB
        ]);
  
  
      const innerCircle =
        new THREE.CircleGeometry(
          innerRadius,
          this.circleSegments
        );
  
  
      const innerA =
        this.createRotatedRectGeometry(
          innerHalfW,
          innerFloorHeight,
          a0
        );
  
  
      const innerB =
        this.createRotatedRectGeometry(
          innerHalfW,
          innerFloorHeight,
          a1
        );
  
  
      innerGeometry =
        this.mergeGeometryParts([
          innerCircle,
          innerA,
          innerB
        ]);
    }
  
  
    /* =========================
       Fullspin
    ========================= */
  
    else if(
      type === "fullspin"
    ){
  
      const createRectShape = (
        w,
        h,
        r
      ) => {
  
        const shape =
          new THREE.Shape();
  
  
        const b =
          floorBorder;
  
  
        shape.moveTo(
          -w / 2 + b,
          -h / 2
        );
  
  
        shape.lineTo(
          w / 2 - r - b,
          -h / 2
        );
  
  
        shape.lineTo(
          w / 2 - r - b,
          h / 2
        );
  
  
        shape.lineTo(
          -w / 2 + b,
          h / 2
        );
  
  
        shape.closePath();
  
  
        return shape;
      };
  
  
      const rotation =
        degToRad(
          floor.endAngle +
          180
        );
  
  
      const outerRect =
        new THREE.ShapeGeometry(
          createRectShape(
            floorWidth,
            floorHeight,
            radius
          )
        );
  
  
      outerRect.rotateZ(
        rotation
      );
  
  
      const outerCircle =
        new THREE.CircleGeometry(
          radius,
          this.circleSegments
        );
  
  
      outerGeometry =
        this.mergeGeometryParts([
          outerRect,
          outerCircle
        ]);
  
  
      const innerRect =
        new THREE.ShapeGeometry(
          createRectShape(
            innerFloorWidth,
            innerFloorHeight,
            innerRadius
          )
        );
  
  
      innerRect.rotateZ(
        rotation
      );
  
  
      const innerCircle =
        new THREE.CircleGeometry(
          innerRadius,
          this.circleSegments
        );
  
  
      innerGeometry =
        this.mergeGeometryParts([
          innerRect,
          innerCircle
        ]);
    }
  
  
    /* =========================
       Midspin
    ========================= */
  
    else{
  
      const createMidspinShape = (
        w,
        h,
        r
      ) => {
  
        const shape =
          new THREE.Shape();
  
  
        const b =
          floorBorder;
  
  
        shape.moveTo(
          -w / 2 + b,
          -h / 2
        );
  
  
        shape.lineTo(
          w / 2 - r - b,
          -h / 2
        );
  
  
        shape.lineTo(
          w / 2 - b,
          0
        );
  
  
        shape.lineTo(
          w / 2 - r - b,
          h / 2
        );
  
  
        shape.lineTo(
          -w / 2 + b,
          h / 2
        );
  
  
        shape.closePath();
  
  
        return shape;
      };
  
  
      const rotation =
        degToRad(
          floor.endAngle +
          180
        );
  
  
      outerGeometry =
        new THREE.ShapeGeometry(
          createMidspinShape(
            floorWidth,
            floorHeight,
            radius
          )
        );
  
  
      outerGeometry.rotateZ(
        rotation
      );
  
  
      innerGeometry =
        new THREE.ShapeGeometry(
          createMidspinShape(
            innerFloorWidth,
            innerFloorHeight,
            innerRadius
          )
        );
  
  
      innerGeometry.rotateZ(
        rotation
      );
  
  
      outerGeometry
        .computeBoundingSphere();
  
  
      innerGeometry
        .computeBoundingSphere();
    }
  
  
    const pair = {
  
      outer:
        outerGeometry,
  
      inner:
        innerGeometry
    };
  
  
    this.floorGeometryCache.set(
      key,
      pair
    );
  
  
    return pair;
  }
  
  getEventMarkerMaterial(
    src
  ){
  
    const cached =
      this.eventMarkerMaterialCache
        .get(src);
  
  
    if(cached){
  
      return cached;
    }
  
  
    const texture =
      this.getEventMarkerTexture(
        src
      );
  
  
    const material =
      new this.Three.MeshBasicMaterial({
  
        map:
          texture,
  
        /*
          transparent list로
          분리되지 않도록 함.
  
          renderOrder가 타일과
          정확하게 섞여야 한다.
        */
        transparent:
          false,
  
        alphaTest:
          0.02,
  
        depthTest:
          false,
  
        depthWrite:
          false
      });
  
  
    this.eventMarkerMaterialCache.set(
      src,
      material
    );
  
  
    return material;
  }

  getEventMarkerTexture(
    src
  ){

    if(
      this.eventTextureCache
        .has(src)
    ){

      return this.eventTextureCache
        .get(src);
    }


    const texture =
      this.eventTextureLoader
        .load(src);


    texture.colorSpace =
      this.Three.SRGBColorSpace;

    texture.minFilter =
      this.Three.LinearFilter;

    texture.magFilter =
      this.Three.LinearFilter;


    this.eventTextureCache.set(
      src,
      texture
    );


    return texture;
  }

  invalidateFloorVisibility(){

    const state =
      this.floorVisibilityState;
  
  
    state.x =
      Infinity;
  
    state.y =
      Infinity;
  
    state.zoom =
      -1;
  
    state.viewWidth =
      -1;
  
    state.viewHeight =
      -1;
  
  
    this.visibleFloorMeshes =
      [];
  }

  updateFloorVisibility(
    camera,
    force = false
  ){
  
    if(!camera){
      return;
    }
  
  
    const x =
      camera.position.x;
  
    const y =
      camera.position.y;
  
    const zoom =
      camera.zoom;
  
  
    const viewWidth =
      (
        camera.right -
        camera.left
      ) / zoom;
  
  
    const viewHeight =
      (
        camera.top -
        camera.bottom
      ) / zoom;
  
  
    const old =
      this.floorVisibilityState;
  
  
    if(
      !force
      &&
      Math.abs(
        x - old.x
      ) <
        this.visibilityRefreshDistance
      &&
      Math.abs(
        y - old.y
      ) <
        this.visibilityRefreshDistance
      &&
      Math.abs(
        zoom - old.zoom
      ) <
        0.001
      &&
      Math.abs(
        viewWidth -
        old.viewWidth
      ) <
        0.01
      &&
      Math.abs(
        viewHeight -
        old.viewHeight
      ) <
        0.01
    ){
  
      return;
    }
  
  
    old.x =
      x;
  
    old.y =
      y;
  
    old.zoom =
      zoom;
  
    old.viewWidth =
      viewWidth;
  
    old.viewHeight =
      viewHeight;
  
  
    const halfWidth =
      viewWidth / 2 +
      this.visibilityMargin;
  
  
    const halfHeight =
      viewHeight / 2 +
      this.visibilityMargin;
  
  
    const size =
      this.floorChunkSize;
  
  
    const minChunkX =
      Math.floor(
        (
          x -
          halfWidth
        ) /
        size
      );
  
  
    const maxChunkX =
      Math.floor(
        (
          x +
          halfWidth
        ) /
        size
      );
  
  
    const minChunkY =
      Math.floor(
        (
          y -
          halfHeight
        ) /
        size
      );
  
  
    const maxChunkY =
      Math.floor(
        (
          y +
          halfHeight
        ) /
        size
      );
  
  
    const nextVisible =
      [];
  
  
    const nextSet =
      new Set();
  
  
    /* =========================
       주변 Chunk만 검사
    ========================= */
  
    for(
      let cy =
        minChunkY;
  
      cy <=
        maxChunkY;
  
      cy++
    ){
  
      for(
        let cx =
          minChunkX;
  
        cx <=
          maxChunkX;
  
        cx++
      ){
  
        const chunk =
          this.floorChunks.get(
            `${cx},${cy}`
          );
  
  
        if(!chunk){
          continue;
        }
  
  
        for(
          const group
          of chunk
        ){
  
          /*
            Chunk 안에서도
            실제 viewport 범위 확인
          */
          if(
            Math.abs(
              group.position.x -
              x
            ) >
              halfWidth
            ||
            Math.abs(
              group.position.y -
              y
            ) >
              halfHeight
          ){
  
            continue;
          }
  
  
          nextVisible.push(
            group
          );
  
  
          nextSet.add(
            group
          );
        }
      }
    }
  
  
    /* =========================
       화면 밖 Floor 제거
    ========================= */
  
    for(
      const group
      of this.attachedFloorGroups
    ){
  
      if(
        !nextSet.has(
          group
        )
      ){
  
        this.scene.remove(
          group
        );
      }
    }
  
  
    /* =========================
       새로 보이는 Floor 추가
    ========================= */
  
    for(
      const group
      of nextSet
    ){
  
      if(
        !this.attachedFloorGroups
          .has(group)
      ){
  
        this.scene.add(
          group
        );
      }
    }
  
  
    this.attachedFloorGroups =
      nextSet;
  
  
    this.visibleFloorMeshes =
      nextVisible;
  }

  createEventMarkerVisual(
    marker,
    renderOrder = 0
  ){
  
    if(
      !marker?.iconSrc
    ){
      return null;
    }
  
  
    const mesh =
      new this.Three.Mesh(
  
        this.sharedEventMarkerGeometry,
  
        this.getEventMarkerMaterial(
          marker.iconSrc
        )
      );
  
  
    mesh.renderOrder =
      renderOrder;
  
  
    mesh.userData.role =
      "event-marker";
  
  
    mesh.userData.eventType =
      marker.type;
  
  
    mesh.userData.markerType =
      marker.type;


    /* =====================================================
       Twirl marker transform
    ===================================================== */

    if(
      marker.type ===
      "twirl"
    ){

      const rotationDeg =
        Number(
          marker.rotationDeg
        );


      if(
        Number.isFinite(
          rotationDeg
        )
      ){

        mesh.rotation.z =
          degToRad(
            rotationDeg
          );
      }


      /*
        원본 swirl_blue / swirl_red는
        둘 다 시계방향 공전용 이미지다.

        Twirl 적용 후 반시계 공전 상태라면
        로컬 X축을 뒤집어 거울모드로 표시한다.
      */
      mesh.scale.x =
        marker.mirrorX
          ? -1
          : 1;
    }
  
  
    /*
      재생 중 Generic 아이콘이면
      처음부터 숨김.
    */
    mesh.visible =
      !(
        this.playbackVisualMode &&
        marker.type === "other"
      );
  
  
    /*
      이벤트 아이콘 자체는
      Picker 대상 제외.
    */
    mesh.raycast =
      () => {};
  
  
    return mesh;
  }
  
  createFloorVisual(
    floor,
    eventMarker = null,
    floorIndex = 0
  ){
  
    const THREE =
      this.Three;
  
  
    const group =
      new THREE.Group();
  
  
    group.position.set(
      floor.x,
      floor.y,
      0
    );
  
  
    group.userData.floorId =
      floor.id;
  
  
    group.userData.floorIndex =
      floorIndex;
  
  
    group.userData.visualSignature =
      this.getFloorVisualSignature(
        floor,
        eventMarker
      );
  
  
    /* =========================
       Geometry
    ========================= */
  
    const geometryPair =
      this.getFloorGeometryPair(
        floor
      );
  
  
    /* =========================
       Outer
    ========================= */
  
    const outer =
      new THREE.Mesh(
  
        geometryPair.outer,
  
        this.sharedOuterMaterial
      );
  
  
    outer.userData.role =
      "outer";
  
  
    outer.userData.floorId =
      floor.id;
  
  
    group.add(
      outer
    );
  
  
    /* =========================
       Inner
    ========================= */
  
    const inner =
      new THREE.Mesh(
  
        geometryPair.inner,
  
        this.sharedInnerMaterial
      );
  
  
    inner.userData.role =
      "inner";
  
  
    inner.userData.floorId =
      floor.id;
  
  
    group.add(
      inner
    );
  
  
    /*
      traverse를 안 하고
      바로 접근하기 위해 저장.
    */
    group.userData.innerMesh =
      inner;
  
  
    /* =========================
       Event Marker
    ========================= */
  
    if(eventMarker){
  
      const markerMesh =
        this.createEventMarkerVisual(
          eventMarker,
          0
        );
  
  
      if(markerMesh){
  
        group.add(
          markerMesh
        );
  
  
        group.userData.eventMarkerMesh =
          markerMesh;
      }
    }
  
  
    /* =========================
       Layer
    ========================= */
  
    this.applyFloorRenderOrder(
      group,
      floorIndex
    );
  
  
    return group;
  }
  
  // RuntimeScene 내부에 추가
  setInnerColorByGroup(
    group,
    colorHex
  ){
  
    if(!group){
      return;
    }
  
  
    const inner =
      group.userData
        ?.innerMesh;
  
  
    if(!inner){
      return;
    }
  
  
    inner.material =
      colorHex === 0x00ff00
  
        ? this
            .sharedSelectedInnerMaterial
  
        : this
            .sharedInnerMaterial;
  }
  
  highlightFloorById(floorId, enabled){
    const group = this.meshByFloorId.get(floorId);
    if(!group) return;
  
    // enabled면 초록, 아니면 원래색(0x0a0a0a)
    const color = enabled ? 0x00ff00 : 0x0a0a0a;
    this.setInnerColorByGroup(group, color);
  }
  
  setFloor(
    floors,
    eventMarkers = []
  ){
    
    /*
      renderOrder 계산용
    */
    this.renderFloorCount =
      floors.length;
      
      /*
        현재 Scene에 붙어 있는
        Floor만 제거.
      
        Floor 객체 자체는 재사용 가능.
      */
      for(
        const group
        of this.attachedFloorGroups
      ){
      
        this.scene.remove(
          group
        );
      }


this.attachedFloorGroups
  .clear();


    /*
      이전 Runtime 객체들
    */
    const oldFloorMeshes =
      this.floorMeshes;

    const oldById =
      this.meshByFloorId;


    /*
      새 상태
    */
    const nextFloorMeshes =
      [];

    const nextById =
      new Map();

    const keptGroups =
      new Set();


    /* =========================
      Floor Sync
    ========================= */

    for(
      let index = 0;
      index < floors.length;
      index++
    ){

      const floor =
        floors[index];


      const marker =
        eventMarkers[
          index
        ] ?? null;


      const signature =
        this.getFloorVisualSignature(
          floor,
          marker
        );


      /*
        stable ID를 이용해
        기존 visual 검색
      */
      let group =
        oldById.get(
          floor.id
        );


      /*
        모양이 완전히 같다면
        기존 Mesh를 재사용한다.
      */
      const reusable =
        group
        &&
        group.userData
          .visualSignature ===
          signature;


      if(reusable){

        /*
          삽입/삭제 뒤에는
          좌표만 변하는 타일이 대부분이다.
        */
        group.position.set(
          floor.x,
          floor.y,
          0
        );


        /*
          matrixAutoUpdate를 꺼놨으므로
          직접 갱신.
        */
        


        /*
          index가 바뀌었으므로
          layer 재설정
        */
        this.applyFloorRenderOrder(
          group,
          index
        );


        /*
          rebuild 전 선택 상태가
          visual에 남는 것 방지.

          이후 EditorApp.rebuild()가
          현재 selection을 다시 칠한다.
        */
        this.setInnerColorByGroup(
          group,
          0x0a0a0a
        );
      }

      else{

        /*
          같은 ID인데 모양이 바뀐 경우
          새 visual 생성.
        */
        group =
          this.createFloorVisual(
            floor,
            marker,
            index
          );

        
        //this.scene.add(group);
      }


      nextFloorMeshes.push(
        group
      );


      nextById.set(
        floor.id,
        group
      );


      keptGroups.add(
        group
      );
    }


    /* =========================
      더 이상 사용하지 않는 것만 제거
    ========================= */

    for(
      const oldGroup
      of oldFloorMeshes
    ){

      if(
        keptGroups.has(
          oldGroup
        )
      ){
        continue;
      }


      this.scene.remove(
        oldGroup
      );


      this.disposeFloorGroup(
        oldGroup
      );
    }


    /* =========================
      Runtime Map 갱신
    ========================= */

    this.floorMeshes =
      nextFloorMeshes;

    this.meshByFloorId =
      nextById;


    this.floorIdByMesh.clear();


    for(
      const group
      of this.floorMeshes
    ){

      this.floorIdByMesh.set(
        group.uuid,
        group.userData.floorId
      );
    }


    /*
      다음 render 때
      visibility를 다시 계산하도록 한다.
    */
    this.rebuildFloorSpatialIndex();
    this.invalidateFloorVisibility();
  }

  applyFloorRenderOrder(
    group,
    floorIndex
  ){

    /*
      낮은 index가 더 앞.

      floorCount를 이용하므로
      모든 타일 order가 0보다 커서
      GridHelper보다 앞에 유지된다.
    */
    const baseOrder =
      (
        this.renderFloorCount -
        floorIndex
      ) * 4;


    group.userData.floorIndex =
      floorIndex;


    group.traverse(
      obj => {

        if(!obj.isMesh){
          return;
        }


        const role =
          obj.userData?.role;


        /*
          한 타일 내부 순서

          outer
            ↓
          inner
            ↓
          event icon
        */
        if(role === "outer"){

          obj.renderOrder =
            baseOrder;
        }

        else if(role === "inner"){

          obj.renderOrder =
            baseOrder + 1;
        }

        else if(
          role ===
          "event-marker"
        ){

          obj.renderOrder =
            baseOrder + 2;
        }
      }
    );
  }


  

  getFloorVisualSignature(
    floor,
    marker
  ){

    return [
      floor.startAngle,
      floor.endAngle,

      floor.option?.isFullspin
        ? 1
        : 0,

      floor.option?.isMidspin
        ? 1
        : 0,

      marker?.type ??
        "",

      marker?.direction ??
        "",

      marker?.iconSrc ??
        "",

      marker?.mirrorX
        ? 1
        : 0,

      Number.isFinite(
        Number(
          marker?.rotationDeg
        )
      )
        ? Number(
            marker.rotationDeg
          )
        : 0,

      Number.isFinite(
        Number(
          marker?.effectiveAngle
        )
      )
        ? Number(
            marker.effectiveAngle
          )
        : ""
    ].join("|");
  }

  disposeFloorGroup(
    group
  ) {
    
    if (!group) {
      return;
    }
    
    
    /*
      Geometry / Material은
      RuntimeScene이 공유하고 있으므로
      여기서 dispose하면 안 된다.
    */
    
    group.clear();
    
    
    group.userData.innerMesh =
      null;
    
    
    group.userData.eventMarkerMesh =
      null;
  }
  
  setPlaybackVisualMode(
    playing
  ){
  
    this.playbackVisualMode =
      !!playing;
  
  
    for(
      const group
      of this.floorMeshes
    ){
  
      const marker =
        group.userData
          ?.eventMarkerMesh;
  
  
      if(!marker){
        continue;
      }
  
  
      /*
        재생 중에는
        generic marker만 숨김.
      */
      marker.visible =
        !(
          playing &&
          marker.userData
            .markerType ===
            "other"
        );
    }
  }
}

class ModifierKeyController {
  constructor(){
    this.ctrl = false;
    this.shift = false;

    this.ctrlButton = null;
    this.shiftButton = null;
    
    this.enabled = true;
  }

  init(){
    this.ctrlButton = document.getElementById("ctrl-button");
    this.shiftButton = document.getElementById("shift-button");

    if(!this.ctrlButton){
      throw new Error("ctrl-button not found");
    }

    if(!this.shiftButton){
      throw new Error("shift-button not found");
    }

    // 모바일/화면 버튼
    this.ctrlButton.addEventListener(
      "click",
      () => {
    
        if(!this.enabled) return;
    
        this.setCtrl(!this.ctrl);
      }
    );
    
    this.shiftButton.addEventListener(
      "click",
      () => {
    
        if(!this.enabled) return;
    
        this.setShift(!this.shift);
      }
    );

    // 실제 키보드
    window.addEventListener(
      "keydown",
      e => {
    
        if(!this.enabled) return;
    
        if(e.key === "Control"){
          this.setCtrl(true);
        }
    
        if(e.key === "Shift"){
          this.setShift(true);
        }
      }
    );

    window.addEventListener("keyup", (e) => {
      if(e.key === "Control"){
        this.setCtrl(false);
      }

      if(e.key === "Shift"){
        this.setShift(false);
      }
    });

    // 앱이 백그라운드로 가거나 focus를 잃으면
    // 키가 계속 눌린 상태로 남는 것 방지
    window.addEventListener("blur", () => {
      this.setCtrl(false);
      this.setShift(false);
    });

    this.updateVisual();
  }
  
  setEnabled(value){

    this.enabled = value;
  
    this.ctrlButton.disabled =
      !value;
  
    this.shiftButton.disabled =
      !value;
  
  
    if(!value){
  
      this.ctrl = false;
      this.shift = false;
  
      this.updateVisual();
    }
  }

  setCtrl(value){
  this.ctrl = value;

    // Ctrl을 켜면 Shift는 끈다.
    if(value){
      this.shift = false;
    }
  
    this.updateVisual();
  }
  
  setShift(value){
    this.shift = value;
  
    // Shift를 켜면 Ctrl은 끈다.
    if(value){
      this.ctrl = false;
    }
  
    this.updateVisual();
  }

  updateVisual(){
    this.ctrlButton?.classList.toggle(
      "active",
      this.ctrl
    );

    this.shiftButton?.classList.toggle(
      "active",
      this.shift
    );
  }

  isCtrl(){
    return this.ctrl;
  }

  isShift(){
    return this.shift;
  }
}

class PlayButtonController {
  constructor(){
    this.button = null;
    this.isPlaying = false;
    this.onToggle = null;
  }

  init(onToggle){
    this.button =
      document.getElementById("play-button");

    if(!this.button){
      throw new Error("play-button not found");
    }

    this.onToggle = onToggle;

    this.button.addEventListener(
      "click",
      () => {
        this.onToggle?.();
      }
    );

    this.setPlaying(false);
  }

  setPlaying(value){
    this.isPlaying = value;

    if(!this.button) return;

    if(value){
      this.button.textContent = "■";
      this.button.setAttribute(
        "aria-label",
        "Stop"
      );
    }
    else{
      this.button.textContent = "▶";
      this.button.setAttribute(
        "aria-label",
        "Play"
      );
    }
  }
}

class TileEditorUI {
  constructor(){

    this.root = null;

    this.quickButtons = [];

    this.fullspinButton = null;
    this.midspinButton = null;

    this.advancedButton = null;
    this.advancedBackButton = null;
    this.advancedAddButton = null;
    this.advancedDeleteFloorButton = null;

    this.currentAngleLabel = null;
    this.advancedAngleValue = null;

    this.angleDial = null;
    this.angleDialNeedle = null;

    this.multiSelectionCount = null;
    this.deleteSelectedButton = null;
    
    this.deleteFloorButton = null;

    this.isAdvanced = false;
    this.draggingDial = false;

    // Advanced에서 현재 설정 중인 각도
    this.dialAngle = 0;

    this.data = null;
    
    this.tabsElement = null;

    this.activeTabKey =
      "tile";
    
    this.eventTabGroups = [];

    this.callback = {

      onAddAngle: null,
      onAddFullspin: null,
      onAddMidspin: null,
    
      onDeleteFloor: null,
      onDeleteSelected: null,
    
      onUpdateEvent: null,
      onAddEvent: null,
      onDeleteEvent: null,
    };
    
    this.snapEnabled = true;
    this.snapStep = 15;
    
    this.snapToggleButton = null;
    
    this.eventPanel = null;

    this.eventScreenIcon = null;
    this.eventScreenTitle = null;
    this.eventScreenSubtitle = null;
    this.eventScreenBody = null;

    this.eventPaletteElement =
      null;

    this.eventPaletteItems =
      [];

    this.hitsoundOptions =
      [
        {
          value: "None",
          label: "None"
        },
        {
          value: "Kick",
          label: "Kick"
        }
      ];
  }


  init(callback = {}){

    this.callback = {
      ...this.callback,
      ...callback
    };


    this.root =
      document.getElementById("editor");


    this.quickButtons = [
      ...document.querySelectorAll(
        ".angle-button"
      )
    ];


    this.fullspinButton =
      document.getElementById(
        "fullspin-button"
      );

    this.midspinButton =
      document.getElementById(
        "midspin-button"
      );

    this.advancedButton =
      document.getElementById(
        "advanced-button"
      );

    this.advancedBackButton =
      document.getElementById(
        "advanced-back-button"
      );

    this.advancedAddButton =
      document.getElementById(
        "advanced-add-button"
      );

    this.advancedDeleteFloorButton =
      document.getElementById(
        "advanced-delete-floor-button"
      );


    this.currentAngleLabel =
      document.getElementById(
        "angle-current"
      );

    this.advancedAngleValue =
      document.getElementById(
        "advanced-angle-value"
      );


    this.angleDial =
      document.getElementById(
        "angle-dial"
      );

    this.angleDialNeedle =
      document.getElementById(
        "angle-dial-needle"
      );


    this.multiSelectionCount =
      document.getElementById(
        "multi-selection-count"
      );
      
    this.snapToggleButton =
      document.getElementById(
        "snap-toggle-button"
      );

    this.deleteSelectedButton =
      document.getElementById(
        "delete-selected-button"
      );
      
    this.deleteFloorButton =
      document.getElementById(
        "delete-floor-button"
      );
    
    this.tabsElement =
      document.getElementById(
      "editor-tabs"
    );
    
    this.eventPanel =
      document.getElementById(
        "event-panel"
      );


    this.eventScreenIcon =
      document.getElementById(
        "event-screen-icon"
      );
    
    
    this.eventScreenTitle =
      document.getElementById(
        "event-screen-title"
      );
    
    
    this.eventScreenSubtitle =
      document.getElementById(
        "event-screen-subtitle"
      );
    
    
    this.eventScreenBody =
      document.getElementById(
        "event-screen-body"
      );
    
    this.eventPaletteElement =
      document.getElementById(
        "event-palette-list"
      );
      


    /* =========================
       기본 각도
       누르는 즉시 타일 추가
    ========================= */

    for(const button of this.quickButtons){

      button.addEventListener(
        "click",
        () => {

          if(button.disabled){
            return;
          }

          const angle =
            Number(
              button.dataset.angle
            );

          this.callback
            .onAddAngle?.(
              angle
            );
        }
      );
    }


    /* =========================
       360 / Midspin
    ========================= */

    this.fullspinButton
      .addEventListener(
        "click",
        () => {

          if(
            this.fullspinButton.disabled
          ){
            return;
          }

          this.callback
            .onAddFullspin?.();
        }
      );


    this.midspinButton
      .addEventListener(
        "click",
        () => {

          if(
            this.midspinButton.disabled
          ){
            return;
          }

          this.callback
            .onAddMidspin?.();
        }
      );


    /* =========================
       Advanced 열기
    ========================= */

    this.advancedButton
      .addEventListener(
        "click",
        () => {

          if(
            this.advancedButton.disabled
          ){
            return;
          }

          this.isAdvanced = true;

          this.setDialAngle(
            this.dialAngle
          );

          this.render();
        }
      );


    this.advancedBackButton
      .addEventListener(
        "click",
        () => {

          this.isAdvanced = false;

          this.render();
        }
      );


    /*
      Advanced에서는
      여기서만 실제 타일을 추가한다.
    */
    this.advancedAddButton
    .addEventListener(
      "click",
      e => {
  
        e.stopPropagation();
  
  
        if(
          this.advancedAddButton
            .disabled
        ){
          return;
        }
  
  
        this.callback
          .onAddAngle?.(
            this.dialAngle
          );
      }
    );


    this.deleteSelectedButton
      .addEventListener(
        "click",
        () => {

          this.callback
            .onDeleteSelected?.();
        }
      );
      
      this.advancedAddButton
      .addEventListener(
        "pointerdown",
        e => {
    
          /*
            버튼 터치가
            다이얼 drag로 전달되는 것 방지
          */
          e.stopPropagation();
        }
      );
      
      
        
        this.snapToggleButton
      .addEventListener(
        "click",
        () => {
    
          this.snapEnabled =
            !this.snapEnabled;
    
    
          this.snapToggleButton
            .classList.toggle(
              "active",
              this.snapEnabled
            );
    
    
          this.snapToggleButton
            .textContent =
              this.snapEnabled
                ? "15° SNAP"
                : "FREE";
        }
      );
      
      this.deleteFloorButton
  .addEventListener(
    "click",
    () => {

      if(
        this.deleteFloorButton.disabled
      ){
        return;
      }


      this.callback
        .onDeleteFloor?.();
    }
  );


    this.advancedDeleteFloorButton
      ?.addEventListener(
        "click",
        () => {

          if(
            this.advancedDeleteFloorButton.disabled
          ){
            return;
          }

          this.callback
            .onDeleteFloor?.();
        }
      );


    this.initDial();
  }
  
  getActiveEventGroup(){

    if(
      this.activeTabKey ===
      "tile"
    ){
      return null;
    }
  
  
    return (
      this.eventTabGroups.find(
        group =>
          group.key ===
          this.activeTabKey
      )
      ??
      null
    );
  }
  
  createEventInfoRow(
    label,
    value
  ){
  
    const row =
      document.createElement(
        "div"
      );
  
  
    row.className =
      "event-info-row";
  
  
    const labelElement =
      document.createElement(
        "span"
      );
  
  
    labelElement.className =
      "event-info-label";
  
    labelElement.textContent =
      label;
  
  
    const valueElement =
      document.createElement(
        "span"
      );
  
  
    valueElement.className =
      "event-info-value";
  
    valueElement.textContent =
      value;
  
  
    row.append(
      labelElement,
      valueElement
    );
  
  
    return row;
  }
  
  createEventCard(
    title,
    onDelete = null
  ){
  
    const card =
      document.createElement(
        "div"
      );
  
  
    card.className =
      "event-card";
  
  
    const header =
      document.createElement(
        "div"
      );
  
  
    header.className =
      "event-card-header";
  
  
    const heading =
      document.createElement(
        "div"
      );
  
  
    heading.className =
      "event-card-title";
  
    heading.textContent =
      title;
  
  
    header.appendChild(
      heading
    );
  
  
    if(onDelete){
  
      const deleteButton =
        document.createElement(
          "button"
        );
  
  
      deleteButton.type =
        "button";
  
      deleteButton.className =
        "event-card-delete";
  
      deleteButton.textContent =
        "×";
  
  
      deleteButton.setAttribute(
        "aria-label",
        `Delete ${title}`
      );
  
  
      deleteButton.addEventListener(
        "click",
        () => {
  
          onDelete();
        }
      );
  
  
      header.appendChild(
        deleteButton
      );
    }
  
  
    card.appendChild(
      header
    );
  
  
    return card;
  }
  
  renderSpeedEventScreen(
    group
  ){
  
    this.eventScreenBody
      .innerHTML = "";
  
  
    group.actions.forEach(
      (action, index) => {
  
        const card =
          this.createEventCard(
        
            group.actions.length > 1
              ? `Set Speed ${index + 1}`
              : "Set Speed",
        
            () => {
        
              this.callback
                .onDeleteEvent?.(
                  action
                );
            }
          );
  
  
        const rawSpeedType =
          String(
            action.speedType ??
            "Bpm"
          ).toLowerCase();
  
  
        const speedType =
          rawSpeedType ===
          "multiplier"
            ? "Multiplier"
            : "Bpm";
  
  
        const bpm =
          Number.isFinite(
            Number(
              action.beatsPerMinute
            )
          )
            ? Number(
                action.beatsPerMinute
              )
            : 100;
  
  
        const multiplier =
          Number.isFinite(
            Number(
              action.bpmMultiplier
            )
          )
            ? Number(
                action.bpmMultiplier
              )
            : 1;
  
  
        /* =========================
           Speed Type
        ========================= */
  
        card.appendChild(
          this.createSegmentedField({
  
            label:
              "Speed type",
  
            value:
              speedType,
  
            options: [
              {
                label: "BPM",
                value: "Bpm"
              },
              {
                label: "Multiplier",
                value: "Multiplier"
              }
            ],
  
            onChange:
              value => {
  
                const patch = {
                  speedType:
                    value
                };
  
  
                /*
                  값이 없는 옛 이벤트라도
                  안전하게 기본값 생성
                */
                if(
                  value === "Bpm" &&
                  !Number.isFinite(
                    Number(
                      action.beatsPerMinute
                    )
                  )
                ){
  
                  patch.beatsPerMinute =
                    100;
                }
  
  
                if(
                  value === "Multiplier" &&
                  !Number.isFinite(
                    Number(
                      action.bpmMultiplier
                    )
                  )
                ){
  
                  patch.bpmMultiplier =
                    1;
                }
  
  
                this.callback
                  .onUpdateEvent?.(
                    action,
                    patch
                  );
              }
          })
        );
  
  
        /* =========================
           BPM
        ========================= */
  
        card.appendChild(
          this.createNumberField({
  
            label:
              "Beats per minute",
  
            value:
              bpm,
  
            defaultValue:
              100,
  
            step:
              "any",
  
            min:
              0,
  
            disabled:
              speedType !== "Bpm",
  
            onCommit:
              value => {
  
                this.callback
                  .onUpdateEvent?.(
                    action,
                    {
                      beatsPerMinute:
                        value
                    }
                  );
              }
          })
        );
  
  
        /* =========================
           Multiplier
        ========================= */
  
        card.appendChild(
          this.createNumberField({
  
            label:
              "BPM Multiplier",
  
            value:
              multiplier,
  
            defaultValue:
              1,
  
            step:
              "any",
  
            min:
              0,
  
            disabled:
              speedType !==
              "Multiplier",
  
            onCommit:
              value => {
  
                this.callback
                  .onUpdateEvent?.(
                    action,
                    {
                      bpmMultiplier:
                        value
                    }
                  );
              }
          })
        );
  
  
        this.appendAngleOffsetField(
          card,
          action
        );
  
  
        this.eventScreenBody
          .appendChild(
            card
          );
      }
    );
  }
  
  renderTwirlEventScreen(
    group
  ){
  
    this.eventScreenBody
      .innerHTML = "";
  
  
    for(
      const action
      of group.actions
    ){
  
      const card =
        this.createEventCard(
          "Twirl",
  
          () => {
  
            this.callback
              .onDeleteEvent?.(
                action
              );
          }
        );
  
  
      this.eventScreenBody
        .appendChild(
          card
        );
    }
  }
  
  appendAngleOffsetField(
    card,
    action
  ){
  
    const angleOffset =
      Number.isFinite(
        Number(
          action.angleOffset
        )
      )
        ? Number(
            action.angleOffset
          )
        : 0;
  
  
    card.appendChild(
      this.createNumberField({
  
        label:
          "Angle Offset",
  
        value:
          angleOffset,
  
        defaultValue:
          0,
  
        step:
          "any",
  
        onCommit:
          value => {
  
            this.callback
              .onUpdateEvent?.(
                action,
                {
                  angleOffset:
                    value
                }
              );
          }
      })
    );
  }
  
  createNumberField({
    label,
    value,
    defaultValue = 0,
  
    step = "any",
    min = null,
  
        max = null,
  
integer = false,
    disabled = false,
  
    onCommit = null
  }){
  
    const row =
      document.createElement(
        "label"
      );
  
  
    row.className =
      "event-form-row";
  
  
    const labelElement =
      document.createElement(
        "span"
      );
  
  
    labelElement.className =
      "event-form-label";
  
    labelElement.textContent =
      label;
  
  
    const input =
      document.createElement(
        "input"
      );
  
  
    input.className =
      "event-form-input";
  
    input.type =
      "number";
  
    input.step =
      step;
  
    input.inputMode =
      integer
        ? "numeric"
        : "decimal";
  
    input.disabled =
      disabled;
  
  
    if(min !== null){
  
      input.min =
        String(min);
    }


    if(max !== null){

      input.max =
        String(max);
    }
  
  
    let initialValue =
      Number(value);
  
  
    if(
      !Number.isFinite(
        initialValue
      )
    ){
  
      initialValue =
        defaultValue;
    }
  
  
    input.value =
      String(initialValue);
  
  
    const commit = () => {
  
      let nextValue =
        Number(
          input.value
        );
  
  
      if(
        !Number.isFinite(
          nextValue
        )
      ){
  
        nextValue =
          defaultValue;
      }
  
  
      if(integer){
  
        nextValue =
          Math.trunc(
            nextValue
          );
      }
  
  
      if(
        min !== null
      ){
  
        nextValue =
          Math.max(
            min,
            nextValue
          );
      }


      if(
        max !== null
      ){

        nextValue =
          Math.min(
            max,
            nextValue
          );
      }
  
  
      input.value =
        String(nextValue);
  
  
      if(
        nextValue ===
        initialValue
      ){
        return;
      }
  
  
      onCommit?.(
        nextValue
      );
    };
  
  
    /*
      매 글자마다 rebuild하지 않는다.
  
      입력이 끝난 시점에만 적용.
    */
    input.addEventListener(
      "change",
      commit
    );
  
  
    input.addEventListener(
      "keydown",
      e => {
  
        if(
          e.key === "Enter"
        ){
  
          e.preventDefault();
  
          input.blur();
        }
      }
    );
  
  
    row.append(
      labelElement,
      input
    );
  
  
    return row;
  }
  
  createSelectField({
    label,
    value,
    options,
    onChange = null
  }){
  
    const row =
      document.createElement(
        "label"
      );
  
  
    row.className =
      "event-form-row";
  
  
    const labelElement =
      document.createElement(
        "span"
      );
  
  
    labelElement.className =
      "event-form-label";
  
    labelElement.textContent =
      label;
  
  
    const select =
      document.createElement(
        "select"
      );
  
  
    select.className =
      "event-form-select";
  
  
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
  
  
      if(
        optionInfo.value ===
        value
      ){
  
        option.selected =
          true;
      }
  
  
      select.appendChild(
        option
      );
    }
  
  
    select.addEventListener(
      "change",
      () => {
  
        onChange?.(
          select.value
        );
      }
    );
  
  
    row.append(
      labelElement,
      select
    );
  
  
    return row;
  }
  
  createSegmentedField({
    label,
    value,
    options,
    onChange = null
  }){
  
    const row =
      document.createElement(
        "div"
      );
  
  
    row.className =
      "event-form-row";
  
  
    const labelElement =
      document.createElement(
        "span"
      );
  
  
    labelElement.className =
      "event-form-label";
  
    labelElement.textContent =
      label;
  
  
    const control =
      document.createElement(
        "div"
      );
  
  
    control.className =
      "event-segmented";
  
  
    for(
      const optionInfo
      of options
    ){
  
      const button =
        document.createElement(
          "button"
        );
  
  
      button.type =
        "button";
  
      button.className =
        "event-segment-button";
  
      button.textContent =
        optionInfo.label;
  
  
      if(
        optionInfo.value ===
        value
      ){
  
        button.classList.add(
          "active"
        );
      }
  
  
      button.addEventListener(
        "click",
        () => {
  
          if(
            optionInfo.value ===
            value
          ){
            return;
          }
  
  
          onChange?.(
            optionInfo.value
          );
        }
      );
  
  
      control.appendChild(
        button
      );
    }
  
  
    row.append(
      labelElement,
      control
    );
  
  
    return row;
  }
  
  renderPauseEventScreen(
    group
  ){
  
    this.eventScreenBody
      .innerHTML = "";
  
  
    group.actions.forEach(
      (action, index) => {
  
        const card =
          this.createEventCard(
        
            group.actions.length > 1
              ? `Pause ${index + 1}`
              : "Pause",
        
            () => {
        
              this.callback
                .onDeleteEvent?.(
                  action
                );
            }
          );
  
  
        const duration =
          Number.isFinite(
            Number(
              action.duration
            )
          )
            ? Number(
                action.duration
              )
            : 1;
  
  
        const countdownTicks =
          Number.isFinite(
            Number(
              action.countdownTicks
            )
          )
            ? Math.trunc(
                Number(
                  action.countdownTicks
                )
              )
            : 0;
  
  
        const validDirections =
          new Set([
            "None",
            "Forward",
            "Backward"
          ]);
  
  
        const angleCorrectionDir =
          validDirections.has(
            action.angleCorrectionDir
          )
            ? action.angleCorrectionDir
            : "None";
  
  
        /* Duration */
  
        card.appendChild(
          this.createNumberField({
  
            label:
              "Duration",
  
            value:
              duration,
  
            defaultValue:
              1,
  
            step:
              "any",
  
            min:
              0,
  
            onCommit:
              value => {
  
                this.callback
                  .onUpdateEvent?.(
                    action,
                    {
                      duration:
                        value
                    }
                  );
              }
          })
        );
  
  
        /* Countdown ticks */
  
        card.appendChild(
          this.createNumberField({
  
            label:
              "Countdown ticks",
  
            value:
              countdownTicks,
  
            defaultValue:
              0,
  
            step:
              "1",
  
            min:
              0,
  
            integer:
              true,
  
            onCommit:
              value => {
  
                this.callback
                  .onUpdateEvent?.(
                    action,
                    {
                      countdownTicks:
                        value
                    }
                  );
              }
          })
        );
  
  
        /* Angle correction */
  
        card.appendChild(
          this.createSelectField({
  
            label:
              "Angle Correction",
  
            value:
              angleCorrectionDir,
  
            options: [
              {
                label: "None",
                value: "None"
              },
              {
                label: "Forward",
                value: "Forward"
              },
              {
                label: "Backward",
                value: "Backward"
              }
            ],
  
            onChange:
              value => {
  
                this.callback
                  .onUpdateEvent?.(
                    action,
                    {
                      angleCorrectionDir:
                        value
                    }
                  );
              }
          })
        );
  
  
        this.eventScreenBody
          .appendChild(
            card
          );
      }
    );
  }
  
  renderHitsoundEventScreen(
    group
  ){

    this.eventScreenBody
      .innerHTML = "";


    const availableHitsounds =
      Array.isArray(
        this.hitsoundOptions
      )
        ? this.hitsoundOptions
        : [];


    group.actions.forEach(
      (action, index) => {

        const card =
          this.createEventCard(
            group.actions.length > 1
              ? `Set Hitsound ${index + 1}`
              : "Set Hitsound",

            () => {
              this.callback
                .onDeleteEvent?.(
                  action
                );
            }
          );


        const gameSound =
          String(
            action.gameSound ??
            "Hitsound"
          )
          .trim()
          .toLowerCase() ===
          "midspin"
            ? "Midspin"
            : "Hitsound";


        const hitsound =
          String(
            action.hitsound ??
            "Kick"
          );


        const rawVolume =
          Number(
            action.hitsoundVolume
          );


        const volume =
          Number.isFinite(
            rawVolume
          )
            ? Math.max(
                0,
                Math.min(
                  100,
                  rawVolume
                )
              )
            : 100;


        card.appendChild(
          this.createSegmentedField({

            label:
              "Game Sound",

            value:
              gameSound,

            options: [
              {
                label: "Hit Sound",
                value: "Hitsound"
              },
              {
                label: "Midspin",
                value: "Midspin"
              }
            ],

            onChange:
              value => {

                this.callback
                  .onUpdateEvent?.(
                    action,
                    {
                      gameSound:
                        value
                    }
                  );
              }
          })
        );


        const selectOptions =
          availableHitsounds
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
          hitsound &&
          !selectOptions.some(
            option =>
              option.value ===
              hitsound
          )
        ){

          selectOptions.push({
            value:
              hitsound,

            label:
              hitsound
          });
        }


        card.appendChild(
          this.createSelectField({

            label:
              "Hitsound",

            value:
              hitsound,

            options:
              selectOptions,

            onChange:
              value => {

                this.callback
                  .onUpdateEvent?.(
                    action,
                    {
                      hitsound:
                        value
                    }
                  );
              }
          })
        );


        card.appendChild(
          this.createNumberField({

            label:
              "Sound Volume (%)",

            value:
              volume,

            defaultValue:
              100,

            step:
              "1",

            min:
              0,

            max:
              100,

            onCommit:
              value => {

                this.callback
                  .onUpdateEvent?.(
                    action,
                    {
                      hitsoundVolume:
                        value
                    }
                  );
              }
          })
        );


        this.eventScreenBody
          .appendChild(
            card
          );
      }
    );
  }


  renderUnsupportedEventScreen(
    group
  ){
  
    this.eventScreenBody
      .innerHTML = "";
  
  
    const notice =
      document.createElement(
        "div"
      );
  
  
    notice.className =
      "unsupported-event-notice";
  
  
    notice.textContent =
      "These events are not editable in the current editor.";
  
  
    this.eventScreenBody
      .appendChild(
        notice
      );
  
  
    /*
      같은 eventType은 한 번만 표시
    */
    const eventTypes =
      [
        ...new Set(
          group.actions.map(
            action =>
              action.eventType ??
              "Unknown"
          )
        )
      ];
  
  
    for(
      const eventType
      of eventTypes
    ){
  
      const item =
        document.createElement(
          "div"
        );
  
  
      item.className =
        "unsupported-event-item";
  
  
      item.textContent =
        eventType;
  
  
      this.eventScreenBody
        .appendChild(
          item
        );
    }
  }
  
  renderActiveEventScreen(){

    const group =
      this.getActiveEventGroup();
  
  
    if(
      !group ||
      !this.eventScreenBody
    ){
      return;
    }
  
  
    /*
      Header
    */
  
    if(
      this.eventScreenIcon
    ){
  
      this.eventScreenIcon.src =
        group.iconSrc ?? "";
  
      this.eventScreenIcon.alt =
        group.title ?? group.key;
    }
  
  
    if(
      this.eventScreenTitle
    ){
  
      this.eventScreenTitle
        .textContent =
          group.title ??
          group.key;
    }
  
  
    if(
      this.eventScreenSubtitle
    ){
  
      const count =
        group.actions.length;
  
  
      this.eventScreenSubtitle
        .textContent =
          `${count} event${count === 1 ? "" : "s"}`;
    }
  
  
    /*
      Body
    */
  
    switch(
      group.key
    ){
  
      case "speed":
  
        this.renderSpeedEventScreen(
          group
        );
  
        break;
  
  
      case "twirl":
  
        this.renderTwirlEventScreen(
          group
        );
  
        break;
  
  
      case "pause":
  
        this.renderPauseEventScreen(
          group
        );
  
        break;
  
  
      case "hitsound":

        this.renderHitsoundEventScreen(
          group
        );

        break;


      case "unsupported":
  
        this.renderUnsupportedEventScreen(
          group
        );
  
        break;
  
  
      default:
  
        this.eventScreenBody
          .textContent =
            "This event editor has not been implemented yet.";
  
        break;
    }
  }

  initDial(){

    if(!this.angleDial){
      return;
    }


    const updateFromPointer =
      e => {

        const rect =
          this.angleDial
            .getBoundingClientRect();


        const cx =
          rect.left +
          rect.width / 2;

        const cy =
          rect.top +
          rect.height / 2;


        const dx =
          e.clientX - cx;

        const dy =
          cy - e.clientY;


        let angle =
          radToDeg(
            Math.atan2(
              dy,
              dx
            )
          );


        angle =
          normalizeAngle(angle);


        // 15도 스냅
        if (this.snapEnabled) {
  
        angle =
          Math.round(
            angle /
            this.snapStep
          ) *
          this.snapStep;
      }
      
      
      angle =
        normalizeAngle(
          Math.round(angle)
        );


        this.setDialAngle(
          angle
        );
      };


    this.angleDial
      .addEventListener(
        "pointerdown",
        e => {

          if(
            !this.data?.canAdd
          ){
            return;
          }

          this.draggingDial = true;


          this.angleDial
            .setPointerCapture?.(
              e.pointerId
            );


          updateFromPointer(e);
        }
      );


    this.angleDial
      .addEventListener(
        "pointermove",
        e => {

          if(
            !this.draggingDial
          ){
            return;
          }

          updateFromPointer(e);
        }
      );


    this.angleDial
      .addEventListener(
        "pointerup",
        e => {

          if(
            !this.draggingDial
          ){
            return;
          }

          updateFromPointer(e);

          this.draggingDial = false;

          /*
            중요:
            여기서는 타일을 만들지 않는다.

            슬라이더는 각도 설정만 한다.
          */
        }
      );


    this.angleDial
      .addEventListener(
        "pointercancel",
        () => {

          this.draggingDial = false;
        }
      );
  }


  setDialAngle(angle){

    this.dialAngle =
      normalizeAngle(angle);


    if(this.advancedAngleValue){

      this.advancedAngleValue
        .textContent =
          `${this.dialAngle}°`;
    }


    if(this.angleDialNeedle){

      this.angleDialNeedle
        .style.transform =
          `rotate(${-this.dialAngle}deg)`;
    }
  }


  update(data){

    this.data =
      data;
  
  
    this.eventTabGroups =
      data.eventTabGroups ??
      [];
    
    this.eventPaletteItems =
      data.eventPaletteItems ??
      [];

    this.hitsoundOptions =
      Array.isArray(
        data.hitsoundOptions
      ) &&
      data.hitsoundOptions.length > 0
        ? data.hitsoundOptions
        : [
            {
              value: "None",
              label: "None"
            },
            {
              value: "Kick",
              label: "Kick"
            }
          ];
  
  
    /*
      선택된 타일에서 현재 탭이
      여전히 존재하는지 확인
    */
    const validTabKeys =
      new Set([
        "tile",
  
        ...this.eventTabGroups.map(
          group =>
            group.key
        )
      ]);
  
  
    /*
      다른 타일로 이동했는데
      현재 이벤트가 없다면
      타일 생성 탭으로 복귀
    */
    if(
      !validTabKeys.has(
        this.activeTabKey
      )
    ){
  
      this.activeTabKey =
        "tile";
    }
  
  
    /*
      재생 또는 다중 선택에서는
      이벤트 탭 화면을 종료
    */
    if(
      data.mode === "play" ||
      data.selectedCount !== 1
    ){
  
      this.isAdvanced =
        false;
  
      this.activeTabKey =
        "tile";
    }
  
  
    this.render();
  }
  
  renderTabs(){

    if(!this.tabsElement){
      return;
    }
  
  
    const groups =
      this.eventTabGroups ??
      [];
  
  
    /*
      매번 새로 만드는 방식.
  
      현재 탭 개수가 매우 적으므로
      성능 문제 없음.
    */
    this.tabsElement.innerHTML = "";
  
  
    /* =========================
       Tile 생성 탭
    ========================= */
  
    const tileTab =
      document.createElement(
        "button"
      );
  
  
    tileTab.type =
      "button";
  
    tileTab.className =
      "editor-tab";
  
    tileTab.dataset.tab =
      "tile";
  
    tileTab.innerHTML =
      `<span class="editor-tab-icon">＋</span>`;
  
  
    if(
      this.activeTabKey ===
      "tile"
    ){
      tileTab.classList.add(
        "active"
      );
    }
  
  
    tileTab.addEventListener(
      "click",
      () => {
    
        this.activeTabKey =
          "tile";
    
    
        /*
          Advanced 화면에서 이벤트 갔다가
          돌아오는 등의 상태 꼬임 방지
        */
        this.isAdvanced =
          false;
    
    
        this.render();
      }
    );
  
  
    this.tabsElement.appendChild(
      tileTab
    );
  
  
    /* =========================
       Event Tabs
    ========================= */
  
    for(const group of groups){
  
      const button =
        document.createElement(
          "button"
        );
  
  
      button.type =
        "button";
  
      button.className =
        "editor-tab";
  
      button.dataset.tab =
        group.key;
  
  
      const icon =
  document.createElement(
    "img"
  );


      icon.className =
        "editor-tab-icon";
      
      
      icon.src =
        group.iconSrc;
      
      
      icon.alt =
        group.key;
      
      
      icon.draggable =
        false;
      
      
      button.appendChild(
        icon
      );
  
  
      /*
        같은 종류 이벤트가 여러 개면
        숫자 배지 표시
      */
      if(
        group.actions.length > 1
      ){
  
        const count =
          document.createElement(
            "span"
          );
  
  
        count.className =
          "editor-tab-count";
  
        count.textContent =
          group.actions.length;
  
  
        button.appendChild(
          count
        );
      }
  
  
      if(
        this.activeTabKey ===
        group.key
      ){
  
        button.classList.add(
          "active"
        );
      }
  
  
      button.addEventListener(
      "click",
      () => {
    
        this.activeTabKey =
          group.key;
    
    
        /*
          이벤트 탭은 Advanced와
          동시에 존재하지 않도록 함
        */
        this.isAdvanced =
          false;
    
    
        this.render();
      }
    );
  
  
      this.tabsElement.appendChild(
        button
      );
    }
  }

  renderEventPalette(){

    if(
      !this.eventPaletteElement
    ){
      return;
    }


    this.eventPaletteElement
      .innerHTML = "";


    for(
      const item
      of this.eventPaletteItems
    ){

      const button =
        document.createElement(
          "button"
        );


      button.type =
        "button";

      button.className =
        "event-palette-button";


      button.disabled =
        !item.canAdd;


      button.setAttribute(
        "aria-label",
        `Add ${item.title}`
      );


      button.title =
        `Add ${item.title}`;


      /* =========================
        Icon
      ========================= */

      const icon =
        document.createElement(
          "img"
        );


      icon.className =
        "event-palette-icon";

      icon.src =
        item.iconSrc;

      icon.alt =
        "";

      icon.draggable =
        false;


      button.appendChild(
        icon
      );


      /* =========================
        Add Event
      ========================= */

      button.addEventListener(
        "click",
        () => {

          if(button.disabled){
            return;
          }


          /*
            이벤트 추가 직후
            해당 이벤트 탭을 자동으로 연다.
          */

          const previousTab =
            this.activeTabKey;


          this.activeTabKey =
            item.key;


          const added =
            this.callback
              .onAddEvent?.(
                item.eventType
              );


          /*
            추가 실패 시
            이전 탭으로 복원
          */

          if(!added){

            this.activeTabKey =
              previousTab;

            this.render();
          }
        }
      );


      this.eventPaletteElement
        .appendChild(
          button
        );
    }
  }


  render(){

    if(!this.root){
      return;
    }


    const data =
      this.data ?? {
        mode: "edit",
        selectedCount: 0,
        canAdd: false,
        label: "—"
      };


    let uiMode;


    if(data.mode === "play"){
      uiMode = "play";
    }
    else if(data.selectedCount === 0){
      uiMode = "empty";
    }
    else if(data.selectedCount > 1){
      uiMode = "multi";
    }
    else if(this.isAdvanced){
      uiMode = "advanced";
    }
    else{
      uiMode = "single";
    }


    for(
      const mode
      of [
        "empty",
        "single",
        "advanced",
        "multi",
        "play"
      ]
    ){

      this.root.classList.remove(
        `ui-${mode}`
      );
    }


    this.root.classList.add(
      `ui-${uiMode}`
    );
    
    /*
      현재 탭 콘텐츠 종류
    */
    const isEventTab =
      uiMode === "single" &&
      this.activeTabKey !== "tile";
    
    
    this.root.classList.toggle(
      "tab-event",
      isEventTab
    );
    
    
    this.root.classList.toggle(
      "tab-tile",
      !isEventTab
    );


    if(this.currentAngleLabel){

      this.currentAngleLabel
        .textContent =
          data.label ?? "—";
    }


    for(
      const button
      of this.quickButtons
    ){

      button.disabled =
        !data.canAdd;

      // 이제 active angle 개념 없음
      button.classList.remove(
        "active"
      );
    }


    this.fullspinButton.disabled =
      !data.canAdd;

    this.midspinButton.disabled =
      !data.canAdd;

    this.advancedButton.disabled =
      !data.canAdd;

    this.advancedAddButton.disabled =
      !data.canAdd;
    
    if(this.deleteFloorButton){

      this.deleteFloorButton.disabled =
        !data.canDelete;
    }

    if(this.advancedDeleteFloorButton){

      this.advancedDeleteFloorButton.disabled =
        !data.canDelete;
    }


    this.fullspinButton
      .classList.remove(
        "active"
      );

    this.midspinButton
      .classList.remove(
        "active"
      );


    if(this.multiSelectionCount){

      this.multiSelectionCount
        .textContent =
          `${data.selectedCount} tile${data.selectedCount === 1 ? "" : "s"} selected`;
    }


    if(
      uiMode === "advanced" &&
      !this.draggingDial
    ){

      this.setDialAngle(
        this.dialAngle
      );
    }
    
    this.renderTabs();
    this.renderEventPalette();


    if(isEventTab){
    
      this.renderActiveEventScreen();
    }
  }
}

//입력 관리 클래스
class InputController{
  constructor(runtime, cameraSystem){
    this.runtime = runtime;
    this.cameraSystem = cameraSystem
    this.canvas = this.runtime.renderer.domElement;

    this.activePointers = new Map(); // pointerId -> {x,y}
    this.lastCenter = null;          // 이전 프레임 중심점
    
    this.isDragging = false;
    this.dragThreshold = 5;
    
    this.enabled = true;
    
    this.picker = new Picker(runtime, cameraSystem);
    
    //콜백
    this.callback = {
      onSelectFloor : null,
    }

    this.canvas.addEventListener('pointerdown', this.onDown.bind(this));
    this.canvas.addEventListener('pointermove', this.onMove.bind(this));
    this.canvas.addEventListener('pointerup', this.onUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.onUp.bind(this));
  }
  
  setEnabled(v){
    this.enabled = v;
  }

  onDown(e){
    this.canvas.setPointerCapture?.(e.pointerId);
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 새 중심점 기준 설정
    this.lastCenter = this.getCenter();
    this.isDragging = false;
    
    const n = this.activePointers.size;
    if(n > 1) this.isDragging = true;
  }

  onMove(e){
    if(!this.activePointers.has(e.pointerId)) return;

    // 포인터 좌표 업데이트
    const p = this.activePointers.get(e.pointerId);
    p.x = e.clientX;
    p.y = e.clientY;
    
    const n = this.activePointers.size;
    if(n > 1) this.isDragging = true;

    const center = this.getCenter();
    if(!this.lastCenter || !center) return;

    const dx = center.x - this.lastCenter.x;
    const dy = center.y - this.lastCenter.y;

    // 드래그량이 너무 작으면 무시 (노이즈 방지)
    if(Math.hypot(dx, dy) < this.dragThreshold) return;
    
    this.isDragging = true;

    if(this.enabled){
      this.cameraSystem.requestPanByPixels(dx, dy);
    }

    this.lastCenter = center;
  }

  onUp(e){
    const n = this.activePointers.size;
  
    if(n > 1) this.isDragging = true;
  
    if(!this.isDragging && this.enabled){
      this.handleTap(e.clientX, e.clientY);
    }
  
    this.activePointers.delete(e.pointerId);
  
    this.lastCenter = this.getCenter();
  
    if(this.activePointers.size === 0){
      this.isDragging = false;
    }
  }

  // 모든 포인터 좌표의 평균
  getCenter(){
    const n = this.activePointers.size;
    if(n === 0) return null;

    let sx = 0, sy = 0;
    for(const p of this.activePointers.values()){
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  
  handleTap(x, y){
    const floorId = this.picker.pickFloorId(x, y);
    if(!floorId){
      this.callback.onSelectFloor?.(floorId);
      return;
    }
  
    // runtime에서 그룹(mesh) 찾기
    const group = this.runtime.meshByFloorId.get(floorId);
    if(!group) return;
  
    //const floorIndex = group.userData.floorIndex; // 여기로 index 가져오기
  
    // EditorApp 콜백 호출
    this.callback.onSelectFloor?.(floorId);
  }
  
}

//레이캐스팅을 이용한 뽑기 전용 클래스
class Picker{
  constructor(runtime, cameraSystem){
    this.runtime = runtime;
    this.cameraSystem = cameraSystem;
    
    this.raycaster = new this.runtime.Three.Raycaster();
    this.ndc = new this.runtime.Three.Vector2();
    
    this.prevSelectArr = [];
    this.selectArrIdx = 0;
  }

  pickFloorId(clientX, clientY){
    const dom = this.runtime.renderer.domElement;
    const rect = dom.getBoundingClientRect();

    // NDC (-1 ~ 1)
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera(this.ndc, this.cameraSystem.camera);

    const hits =
      this.raycaster.intersectObjects(
        this.runtime
          .visibleFloorMeshes,
        true
      );
    if(hits.length === 0){
      return null
    }

    const result = [];
    const seen = new Set();

    for(const hit of hits){
      let obj = hit.object;

      while(obj){
        const fid = obj.userData?.floorId;
        if(fid){
          if(!seen.has(fid)){
            seen.add(fid);
            result.push(fid); // depth 순서 유지
          }
          break;
        }
        obj = obj.parent;
      }
    }
    
    result.sort(
      (a, b) => {

        const groupA =
          this.runtime
            .meshByFloorId
            .get(a);

        const groupB =
          this.runtime
            .meshByFloorId
            .get(b);


        const indexA =
          groupA?.userData
            ?.floorIndex ??
          Infinity;

        const indexB =
          groupB?.userData
            ?.floorIndex ??
          Infinity;


        /*
          작은 index가 화면 위이므로
          먼저 선택
        */
        return (
          indexA -
          indexB
        );
      }
    );
    
    const compare = (a, b) => {
      if(!a || !b) return false;
      if(a.length != b.length) return false;
      for(let i = 0; i<a.length; i++){
        if(a[i] !== b[i]) return false;
      }
      //console.log('same')
      return true;
    }
    
    if(!compare(result, this.prevSelectArr)){
      this.prevSelectArr = [...result];
      this.selectArrIdx = 0;
    }
    
    if(result.length === 0){

      this.prevSelectArr = [];
    
      this.selectArrIdx = 0;
    
      return null;
    }
    
    const id = result[this.selectArrIdx];
    this.selectArrIdx = (this.selectArrIdx + 1)%this.prevSelectArr.length;
    return id
  }
}

//Playback을 위한 계산 클래스
class Evaluator{
  constructor(){
    this.compiled = null;
    this.startTime_us = null,
    this.lastTime_us = -Infinity;
    this.lastIndex = null;
    
    this.activePlayerCameraPositions = [];
    
    this.playerCameraPosition = {
      x : 0,
      y : 0,
    }
  }
  
  init(
    compiled,
    t_us
  ){

    this.reset();

    this.compiled =
      compiled;

    this.startTime_us =
      Number(t_us);

    if(
      !Number.isFinite(
        this.startTime_us
      )
    ){
      this.startTime_us = 0;
    }

    this.lastTime_us =
      this.startTime_us;

    const index =
      this.findFloorIndexByTime_us(
        this.startTime_us
      );

    this.lastIndex =
      index;

    /*
      Restore the camera timeline at an arbitrary playback start.

      The old implementation placed the camera directly on the
      selected floor. That discarded camera moves that had started
      before this floor and caused the first N -> N+1 transition to
      snap.

      Completed moves are accumulated into playerCameraPosition,
      while moves that are still in progress are restored to the
      active list.
    */
    const cameraMoves =
      Array.isArray(
        this.compiled
          ?.playerCameraPositions
      )
        ? this.compiled
            .playerCameraPositions
        : [];

    for(
      let i = 1;
      i < cameraMoves.length;
      i++
    ){

      const move =
        cameraMoves[i];

      if(!move){
        continue;
      }

      const start_us =
        Number(
          move.start_us
        );

      const duration_us =
        Number(
          move.duration_us
        );

      const dx =
        Number(
          move.dx
        );

      const dy =
        Number(
          move.dy
        );

      if(
        !Number.isFinite(start_us) ||
        !Number.isFinite(duration_us) ||
        duration_us <= 0 ||
        !Number.isFinite(dx) ||
        !Number.isFinite(dy)
      ){
        continue;
      }

      const rawEnd_us =
        Number(
          move.end_us
        );

      const end_us =
        Number.isFinite(rawEnd_us)
          ? rawEnd_us
          : start_us +
            duration_us;

      if(
        this.startTime_us >=
        end_us
      ){

        this.playerCameraPosition.x +=
          dx;

        this.playerCameraPosition.y +=
          dy;

        continue;
      }

      if(
        this.startTime_us >=
        start_us
      ){

        this.activePlayerCameraPositions
          .push(move);

        continue;
      }

      /* Camera moves are compiled in chronological order. */
      break;
    }
  }
  
  //특정 시간대 계산
  evaluateAt(compiled, t_us, knownIndex = null){

    this.compiled =
      compiled;

    this.lastTime_us =
      t_us;


    const index =
      knownIndex ??
      this.findFloorIndexByTime_us(
        t_us
      );


    const floor =
      this.compiled.floors[
        index
      ];
    
    //새로운 플레이어 카메라 오브젝트 추가
    if(this.lastIndex == null){
      this.lastIndex = index;
    }

    for(
      let i = this.lastIndex + 1;
      i <= index;
      i++
    ){

      const move =
        this.compiled
          .playerCameraPositions[i];

      if(move){
        this.activePlayerCameraPositions
          .push(move);
      }
    }
    
    let dx = 0;
    let dy = 0;
    
    for(
      let i =
        this.activePlayerCameraPositions.length - 1;
      i >= 0;
      i--
    ){

      const obj =
        this.activePlayerCameraPositions[i];

      if(
        !obj ||
        !Number.isFinite(Number(obj.duration_us)) ||
        Number(obj.duration_us) <= 0
      ){
        this.activePlayerCameraPositions.splice(i, 1);
        continue;
      }
      
      let progress =
        (
          t_us -
          Number(obj.start_us)
        ) /
        Number(obj.duration_us);

      progress =
        Math.max(
          0,
          Math.min(
            1,
            progress
          )
        );

      if(progress >= 1){
        this.playerCameraPosition.x +=
          Number(obj.dx) || 0;

        this.playerCameraPosition.y +=
          Number(obj.dy) || 0;

        this.activePlayerCameraPositions.splice(i,1);
        continue;
      }
      
      dx +=
        progress *
        (Number(obj.dx) || 0);

      dy +=
        progress *
        (Number(obj.dy) || 0);
    }
    
    //console.log(this.activePlayerCameraPositiois.length)
    
    const frameState = {
      camera : {}
    };
    
    frameState.camera.x = this.playerCameraPosition.x + dx;
    frameState.camera.y = this.playerCameraPosition.y + dy;
    
    //간이 카메라 정보, 일단 해당 타일로 카메라가 바로 이동하도록 하기
    /*
    frameState.camera.x = floor.x;
    frameState.camera.y = floor.y;
    frameState.camera.rotation = 0;
    frameState.camera.zoom = 100;
    */
    
    this.lastIndex = index
    return frameState;
  }
  
  reset(){
    this.compiled = null;
    this.startTime_us = null,
    this.lastTime_us = -Infinity;
    this.lastIndex = null;

    this.activePlayerCameraPositions = [];
    
    this.playerCameraPosition = {
      x: 0,
      y: 0,
    }
  }
  
  evaluatePlayerCameraPosition(){
    
  }
  
  //시간 -> 타일 인덱스 출력 (바이너리 서치)
  findFloorIndexByTime_us(t_us){

    const arr =
      this.compiled
        .floorStarts_us;


    let low = 0;

    let high =
      arr.length - 1;


    while(
      low < high
    ){

      const mid =
        Math.ceil(
          (low + high) / 2
        );


      if(
        arr[mid] <= t_us
      ){

        low =
          mid;
      }
      else{

        high =
          mid - 1;
      }
    }


    return low;
  }
}

class HitSoundSystem {
  constructor(){
    this.ctx =
      null;
    
    
    /*
      일반 타일 hitsound
    */
    this.buffer =
      null;
    
    
    /*
      Countdown.mp3
    */
    this.countdownBuffer =
      null;
      
    /*
      Hitsound 이름
      →
      AudioBuffer
    */
    this.buffers =
      new Map();
    
    
    /*
      아직 로드 실패 로그를
      반복 출력하지 않기 위함
    */
    this.missingSoundWarnings =
      new Set();
    
    
    

    /*
      External hitsound manifest.
    */
    this.soundEntries =
      [];

    this.soundDefinitions =
      new Map();

    this.masterGain =
      null;
    
    
    /*
      일반 타일 시간
    */
    this.hitEvents =
      [];
    
    this.nextIndex =
      0;
    
    
    /*
      Countdown 시간
    */
    this.countdownTimes_us =
      [];
    
    this.nextCountdownIndex =
      0;

    // 앞으로 120ms까지 미리 예약
    this.lookAhead_us = 120000;

    // 정지할 때 예약된 소리도 취소하기 위함
    this.scheduledSources = new Set();

    this.enabled = true;
    
    this.maxSchedulePerUpdate =
      64;
    
    
    this.maxActiveSources =
      128;

    /*
      Level speed only changes scheduling time.
      Individual hitsound playbackRate/pitch is untouched.
    */
    this.timelineRate =
      1;


  /*
    같은 정확한 시간의 히트는
    하나만 울린다.
  
    0 duration 타일 연속 구간
    AudioNode 폭증 방지.
  */
  this.lastScheduledHit_us =
    null;
    
  this.lastScheduledCountdown_us =
    null;
  }

  async init(
    manifestUrl =
      "./sfx/hitsounds.json",

    countdownHitsound =
      "Hat"
  ){

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;


    if(!AudioContextClass){

      throw new Error(
        "Web Audio API is not supported."
      );
    }


    this.ctx =
      new AudioContextClass();


    this.masterGain =
      this.ctx.createGain();


    this.masterGain.gain.value =
      0.3;


    this.masterGain.connect(
      this.ctx.destination
    );


    await this.loadSoundLibrary(
      manifestUrl
    );


    this.buffer =
      this.getBufferForHitsound(
        "Kick"
      );


    this.countdownBuffer =
      this.getBufferForHitsound(
        countdownHitsound
      );
  }

  async resume(){
    if(!this.ctx) return;

    if(this.ctx.state === "suspended"){
      await this.ctx.resume();
    }
  }
  
  normalizeHitsoundKey(
    name
  ){

    return String(
      name ??
      ""
    )
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ""
    );
  }


  getSoundDefinition(
    name
  ){

    const key =
      this.normalizeHitsoundKey(
        name
      );


    if(!key){
      return null;
    }


    return (
      this.soundDefinitions.get(
        key
      ) ??
      null
    );
  }


  getBufferForHitsound(
    name
  ){

    const definition =
      this.getSoundDefinition(
        name
      );


    if(!definition){
      return null;
    }


    return (
      this.buffers.get(
        definition.name
      ) ??
      null
    );
  }


  isSilentHitsound(
    name
  ){

    const definition =
      this.getSoundDefinition(
        name
      );


    return Boolean(
      definition &&
      (
        definition.file === null ||
        definition.file === "" ||
        definition.file === false
      )
    );
  }


  getAvailableHitsoundOptions(){

    const options =
      this.soundEntries
      .map(
        entry => ({
          value:
            String(
              entry?.name ??
              ""
            ).trim(),

          label:
            String(
              entry?.label ??
              entry?.name ??
              ""
            ).trim()
        })
      )
      .filter(
        option =>
          option.value.length > 0
      );


    if(options.length > 0){
      return options;
    }


    return [
      {
        value: "None",
        label: "None"
      },
      {
        value: "Kick",
        label: "Kick"
      }
    ];
  }


  getAvailableHitsoundNames(){

    return this
      .getAvailableHitsoundOptions()
      .map(
        option =>
          option.value
      );
  }


  async loadSoundLibrary(
    manifestUrl
  ){

    this.soundEntries =
      [];

    this.soundDefinitions.clear();

    this.buffers.clear();

    this.missingSoundWarnings.clear();


    try{

      const manifestAbsoluteUrl =
        new URL(
          manifestUrl,
          window.location.href
        );


      const response =
        await fetch(
          manifestAbsoluteUrl.href
        );


      if(!response.ok){

        throw new Error(
          `hitsound manifest load failed: ${response.status}`
        );
      }


      const manifest =
        await response.json();


      const entries =
        Array.isArray(
          manifest
        )
          ? manifest
          : Array.isArray(
              manifest?.sounds
            )
              ? manifest.sounds
              : [];


      this.soundEntries =
        entries
        .filter(
          entry =>
            entry &&
            typeof entry.name ===
              "string"
        )
        .map(
          entry => ({
            name:
              String(
                entry.name
              ),

            label:
              String(
                entry.label ??
                entry.name
              ),

            file:
              entry.file == null
                ? null
                : String(
                    entry.file
                  ),

            aliases:
              Array.isArray(
                entry.aliases
              )
                ? entry.aliases.map(
                    alias =>
                      String(alias)
                  )
                : []
          })
        );


      for(
        const entry
        of this.soundEntries
      ){

        const names =
          [
            entry.name,
            ...entry.aliases
          ];


        for(
          const name
          of names
        ){

          const key =
            this.normalizeHitsoundKey(
              name
            );


          if(key){

            this.soundDefinitions.set(
              key,
              entry
            );
          }
        }
      }


      await Promise.all(
        this.soundEntries
        .filter(
          entry =>
            typeof entry.file ===
              "string" &&
            entry.file.length > 0
        )
        .map(
          entry => {

            const soundUrl =
              new URL(
                entry.file,
                manifestAbsoluteUrl
              ).href;


            return this.loadSound(
              entry.name,
              soundUrl
            );
          }
        )
      );


      console.log(
        `hitsound library loaded: ${this.soundEntries.length} definitions, ${this.buffers.size} audio buffers`
      );


      return true;
    }
    catch(error){

      console.warn(
        "Failed to load hitsound library. Missing sounds will use beep fallback.",
        error
      );


      return false;
    }
  }


  async loadSound(
    name,
    url
  ){
  
    try{
  
      const response =
        await fetch(
          url
        );
  
  
      if(!response.ok){
  
        throw new Error(
          `${response.status}`
        );
      }
  
  
      const data =
        await response
          .arrayBuffer();
  
  
      const buffer =
        await this.ctx
          .decodeAudioData(
            data
          );
  
  
      this.buffers.set(
        name,
        buffer
      );
  
  
      return true;
    }
    catch(error){
  
      console.warn(
        `hitsound load failed: ${name}`,
        url,
        error
      );
  
  
      return false;
    }
  }


  setTimelineRate(
    value
  ){
    const rate =
      Number(value);

    if(
      !Number.isFinite(rate) ||
      rate <= 0
    ){
      return false;
    }

    this.timelineRate =
      rate;

    return true;
  }


  start(
    hitEvents,
    countdownTimes_us,
    startTime_us
  ){
  
    this.stopScheduled();
  
  
    const safeStartTime_us =
      Number.isFinite(
        Number(
          startTime_us
        )
      )
        ? Number(
            startTime_us
          )
        : 0;
  
  
    /* =========================
       일반 Hitsound Events
    ========================= */
  
    /*
      time_us가 정상인 이벤트만 유지.
  
      SoundEvent 구조:
      {
        time_us,
        hitsound,
        volume,
        pitch,
        ...
      }
    */
    this.hitEvents =
      (
        Array.isArray(
          hitEvents
        )
          ? hitEvents
          : []
      )
      .filter(
        event =>
          event &&
          Number.isFinite(
            Number(
              event.time_us
            )
          )
      )
      .sort(
        (a, b) =>
          Number(a.time_us) -
          Number(b.time_us)
      );
  
  
    /* =========================
       Countdown Times
    ========================= */
  
    this.countdownTimes_us =
      (
        Array.isArray(
          countdownTimes_us
        )
          ? countdownTimes_us
          : []
      )
      .map(
        value =>
          Number(
            value
          )
      )
      .filter(
        value =>
          Number.isFinite(
            value
          )
      )
      .sort(
        (a, b) =>
          a - b
      );
  
  
    /* =========================
       Binary Search
    ========================= */
  
    const findEventStartIndex =
      array => {
  
        let low =
          0;
  
        let high =
          array.length;
  
  
        while(
          low < high
        ){
  
          const mid =
            Math.floor(
              (low + high) /
              2
            );
  
  
          if(
            Number(
              array[mid].time_us
            ) <
            safeStartTime_us
          ){
  
            low =
              mid + 1;
          }
          else{
  
            high =
              mid;
          }
        }
  
  
        return low;
      };
  
  
    const findTimeStartIndex =
      array => {
  
        let low =
          0;
  
        let high =
          array.length;
  
  
        while(
          low < high
        ){
  
          const mid =
            Math.floor(
              (low + high) /
              2
            );
  
  
          if(
            array[mid] <
            safeStartTime_us
          ){
  
            low =
              mid + 1;
          }
          else{
  
            high =
              mid;
          }
        }
  
  
        return low;
      };
  
  
    this.nextIndex =
      findEventStartIndex(
        this.hitEvents
      );
  
  
    this.nextCountdownIndex =
      findTimeStartIndex(
        this.countdownTimes_us
      );
  
  
    this.lastScheduledHit_us =
      null;
  
  
    this.lastScheduledCountdown_us =
      null;
  }


  update(
    t_us
  ){
  
    if(!this.enabled){
      return;
    }
  
  
    if(!this.ctx){
      return;
    }
  
  
    if(
      this.ctx.state !==
      "running"
    ){
      return;
    }
  
  
    /*
      현재 재생 시간 자체가
      비정상이면 스케줄링하지 않는다.
    */
    const currentTime_us =
      Number(
        t_us
      );
  
  
    if(
      !Number.isFinite(
        currentTime_us
      )
    ){
      return;
    }
  
  
    const scheduleUntil_us =
      currentTime_us +
      this.lookAhead_us;
  
  
    let scheduledCount =
      0;
  
  
    while(
      scheduledCount <
      this.maxSchedulePerUpdate
    ){
  
      /* =========================
         다음 일반 Hitsound
      ========================= */
  
      const nextHitEvent =
        this.nextIndex <
        this.hitEvents.length
  
          ? this.hitEvents[
              this.nextIndex
            ]
  
          : null;
  
  
      let nextHitTime_us =
        nextHitEvent
          ? Number(
              nextHitEvent.time_us
            )
          : Infinity;
  
  
      /*
        잘못된 SoundEvent가 있다면
        그냥 버리고 다음 이벤트로 이동.
      */
      if(
        nextHitEvent &&
        !Number.isFinite(
          nextHitTime_us
        )
      ){
  
        console.warn(
          "Invalid hitsound event:",
          nextHitEvent
        );
  
  
        this.nextIndex++;
  
        continue;
      }
  
  
      /* =========================
         다음 Countdown
      ========================= */
  
      let nextCountdownTime_us =
        this.nextCountdownIndex <
        this.countdownTimes_us.length
  
          ? Number(
              this.countdownTimes_us[
                this.nextCountdownIndex
              ]
            )
  
          : Infinity;
  
  
      /*
        잘못된 Countdown timestamp도
        버리고 다음 것으로 이동.
      */
      if(
        nextCountdownTime_us !==
          Infinity
        &&
        !Number.isFinite(
          nextCountdownTime_us
        )
      ){
  
        console.warn(
          "Invalid countdown time:",
          this.countdownTimes_us[
            this.nextCountdownIndex
          ]
        );
  
  
        this.nextCountdownIndex++;
  
        continue;
      }
  
  
      /* =========================
         전부 끝남
      ========================= */
  
      if(
        nextHitTime_us ===
          Infinity
        &&
        nextCountdownTime_us ===
          Infinity
      ){
        break;
      }
  
  
      /*
        시간이 더 빠른 소리를 선택.
  
        같은 시간이면
        일반 Hitsound를 먼저 예약하고
        다음 반복에서 Countdown도 예약됨.
      */
      const isCountdown =
        nextCountdownTime_us <
        nextHitTime_us;
  
  
      const soundTime_us =
        isCountdown
          ? nextCountdownTime_us
          : nextHitTime_us;
  
  
      /*
        아직 look-ahead 범위 밖이면
        다음 frame까지 기다린다.
      */
      if(
        soundTime_us >
        scheduleUntil_us
      ){
        break;
      }
  
  
      /* =========================
         AudioNode 폭증 방지
      ========================= */
  
      if(
        this.scheduledSources.size >=
        this.maxActiveSources
      ){
  
        if(isCountdown){
  
          this.nextCountdownIndex++;
        }
        else{
  
          this.nextIndex++;
        }
  
  
        continue;
      }
  
  
      /* =========================
         중복 timestamp 방지
      ========================= */
  
      if(isCountdown){
  
        if(
          soundTime_us ===
          this.lastScheduledCountdown_us
        ){
  
          this.nextCountdownIndex++;
  
          continue;
        }
      }
      else{
  
        if(
          soundTime_us ===
          this.lastScheduledHit_us
        ){
  
          this.nextIndex++;
  
          continue;
        }
      }
  
  
      /* =========================
         WebAudio 시간으로 변환
      ========================= */
  
      const delta_us =
        soundTime_us -
        currentTime_us;
  
  
      const safeTimelineRate =
        Number.isFinite(
          this.timelineRate
        ) &&
        this.timelineRate > 0
          ? this.timelineRate
          : 1;


      const delaySec =
        Math.max(
          0.003,
          delta_us /
          (
            1000000 *
            safeTimelineRate
          )
        );
  
  
      const when =
        this.ctx.currentTime +
        delaySec;
  
  
      /*
        source.start()에
        NaN / Infinity가 절대 들어가지 않도록
        마지막 방어선.
      */
      if(
        !Number.isFinite(
          when
        )
      ){
  
        console.warn(
          "Invalid audio schedule time:",
          {
            soundTime_us,
            currentTime_us,
            delta_us,
            when
          }
        );
  
  
        if(isCountdown){
  
          this.nextCountdownIndex++;
        }
        else{
  
          this.nextIndex++;
        }
  
  
        continue;
      }
  
  
      /* =========================
         실제 재생
      ========================= */
  
      if(isCountdown){
  
        this.playCountdownAt(
          when
        );
  
  
        this.lastScheduledCountdown_us =
          soundTime_us;
  
  
        this.nextCountdownIndex++;
      }
      else{
  
        this.playSoundEventAt(
          nextHitEvent,
          when
        );
  
  
        this.lastScheduledHit_us =
          soundTime_us;
  
  
        this.nextIndex++;
      }
  
  
      scheduledCount++;
    }
  }


  playAt(when){
    if(!this.ctx) return;


    // hitsound.mp3가 존재하면 파일 재생
    if(this.buffer){

      const source =
        this.ctx.createBufferSource();

      source.buffer = this.buffer;

      source.connect(
        this.masterGain
      );

      this.scheduledSources.add(
        source
      );

      source.onended = () => {
        this.scheduledSources.delete(
          source
        );
      };

      source.start(when);

      return;
    }


    // 파일이 없으면 임시 비프음
    this.playBeepAt(when);
  }
  
  playCountdownAt(
    when
  ){
  
    if(!this.ctx){
      return;
    }
  
  
    if(
      !Number.isFinite(
        Number(
          when
        )
      )
    ){
  
      console.warn(
        "playCountdownAt: invalid when",
        when
      );
  
  
      return;
    }
  
  
    if(
      !this.countdownBuffer
    ){
    
      /*
        Countdown 사운드 로딩 실패 시
        기존 비프음으로 대체
      */
      this.playBeepAt(
        when,
        100,
        100
      );
    
    
      return;
    }
  
  
    const source =
      this.ctx.createBufferSource();
  
  
    source.buffer =
      this.countdownBuffer;
  
  
    source.connect(
      this.masterGain
    );
  
  
    this.scheduledSources.add(
      source
    );
  
  
    source.onended =
      () => {
  
        this.scheduledSources.delete(
          source
        );
      };
  
  
    source.start(
      when
    );
  }


  playBeepAt(
    when,
    volumePercent = 100,
    pitchPercent = 100
  ){
  
    if(!this.ctx){
      return false;
    }
  
  
    const safeWhen =
      Number(
        when
      );
  
  
    if(
      !Number.isFinite(
        safeWhen
      )
    ){
      return false;
    }
  
  
    const volume =
      Number.isFinite(
        Number(
          volumePercent
        )
      )
        ? Math.max(
            0,
            Number(
              volumePercent
            )
          )
        : 100;
  
  
    const pitch =
      Number.isFinite(
        Number(
          pitchPercent
        )
      )
        ? Math.max(
            1,
            Number(
              pitchPercent
            )
          )
        : 100;
  
  
    const osc =
      this.ctx.createOscillator();
  
  
    const gain =
      this.ctx.createGain();
  
  
    osc.type =
      "square";
  
  
    /*
      기존 비프음:
      pitch 100 = 900Hz
    */
    osc.frequency.value =
      900 *
      (
        pitch /
        100
      );
  
  
    /*
      기존 최대 음량 0.18에
      이벤트 볼륨을 반영한다.
    */
    const peakGain =
      0.18 *
      (
        volume /
        100
      );
  
  
    gain.gain.setValueAtTime(
      0,
      safeWhen
    );
  
  
    gain.gain.linearRampToValueAtTime(
      Math.max(
        0.0001,
        peakGain
      ),
      safeWhen + 0.002
    );
  
  
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      safeWhen + 0.04
    );
  
  
    osc.connect(
      gain
    );
  
  
    gain.connect(
      this.masterGain
    );
  
  
    this.scheduledSources.add(
      osc
    );
  
  
    osc.onended =
      () => {
  
        this.scheduledSources.delete(
          osc
        );
  
  
        try{
  
          osc.disconnect();
  
          gain.disconnect();
        }
        catch{
        }
      };
  
  
    osc.start(
      safeWhen
    );
  
  
    osc.stop(
      safeWhen +
      0.045
    );
  
  
    return true;
  }

  playSoundEventAt(
    soundEvent,
    when
  ){
  
    if(!this.ctx){
      return false;
    }
  
  
    if(!soundEvent){
      return false;
    }
  
  
    /*
      AudioBufferSourceNode.start()
      에 NaN/Infinity가 절대 들어가지 않도록 한다.
    */
    if(
      !Number.isFinite(
        Number(
          when
        )
      )
    ){
  
      console.warn(
        "playSoundEventAt: invalid when",
        when,
        soundEvent
      );
  
  
      return false;
    }
  
  
    const hitsound =
      String(
        soundEvent.hitsound ??
        "Kick"
      );
  
  
    /*
      file:null means intentional silence.
    */
    if(
      this.isSilentHitsound(
        hitsound
      )
    ){
      return true;
    }


    const buffer =
      this.getBufferForHitsound(
        hitsound
      );


    if(!buffer){

      if(
        !this.missingSoundWarnings
          .has(
            hitsound
          )
      ){
    
        this.missingSoundWarnings
          .add(
            hitsound
          );
    
    
        console.warn(
          `Unknown or unloaded hitsound: ${hitsound}. Using beep fallback.`
        );
      }
    
    
      /*
        파일을 못 찾은 경우에도
        이벤트 자체는 사라지지 않고
        비프음으로 대체한다.
      */
      this.playBeepAt(
    
        when,
    
        soundEvent.volume ??
          100,
    
        soundEvent.pitch ??
          100
      );
    
    
      return true;
    }
  
  
    const source =
      this.ctx
        .createBufferSource();
  
  
    source.buffer =
      buffer;
  
  
    /* =========================
       Pitch
    ========================= */
  
    const pitch =
      Number(
        soundEvent.pitch ??
        100
      );
  
  
    source.playbackRate.value =
      Number.isFinite(pitch)
        ? Math.max(
            0.01,
            pitch / 100
          )
        : 1;
  
  
    /* =========================
       Volume
    ========================= */
  
    const gain =
      this.ctx
        .createGain();
  
  
    const volume =
      Number(
        soundEvent.volume ??
        100
      );
  
  
    gain.gain.value =
      Number.isFinite(volume)
        ? Math.max(
            0,
            volume / 100
          )
        : 1;
  
  
    source.connect(
      gain
    );
  
  
    gain.connect(
      this.masterGain
    );
  
  
    this.scheduledSources.add(
      source
    );
  
  
    source.onended =
      () => {
  
        this.scheduledSources.delete(
          source
        );
  
  
        try{
  
          source.disconnect();
  
          gain.disconnect();
        }
        catch{
        }
      };
  
  
    source.start(
      when
    );
  
  
    return true;
  }

  stopScheduled(){
    for(
      const source
      of this.scheduledSources
    ){
      try{
        source.stop();
      }
      catch{
        // 이미 끝난 source면 무시
      }
    }

    this.scheduledSources.clear();
  }


  stop(){

    this.stopScheduled();
  
  
    this.hitEvents =
      [];
  
  
    this.countdownTimes_us =
      [];
  
  
    this.nextIndex =
      0;
  
  
    this.nextCountdownIndex =
      0;
  
  
    this.lastScheduledHit_us =
      null;
  
  
    this.lastScheduledCountdown_us =
      null;
  }


  setVolume(value){
    if(!this.masterGain) return;

    this.masterGain.gain.value =
      Math.max(0, value);
  }
}

class SongSystem {
  constructor(){
    this.ctx = null;

    this.buffer = null;
    this.source = null;

    this.gain = null;

    this.url = null;

    this.playbackRate = 1;
  }


  async init(audioContext, url){
    this.ctx = audioContext;

    /*
      곡을 다시 선택하거나 다른 레벨을 열어도
      GainNode를 계속 새로 만들지 않는다.
    */
    if(!this.gain){
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.5;

      this.gain.connect(
        this.ctx.destination
      );
    }

    this.stop();

    this.url = url ?? null;
    this.buffer = null;

    if(!url){
      console.warn("songFilename is missing.");
      return false;
    }

    try{
      const res = await fetch(url);

      if(!res.ok){
        throw new Error(
          `song load failed: ${res.status}`
        );
      }

      const arrayBuffer =
        await res.arrayBuffer();

      this.buffer =
        await this.ctx.decodeAudioData(
          arrayBuffer
        );

      console.log(
        "song loaded:",
        url,
        this.buffer.duration,
        "sec"
      );

      return true;
    }
    catch(err){
      console.warn(
        "Failed to load song.",
        err
      );

      this.buffer = null;

      return false;
    }
  }


  setPlaybackRate(
    value
  ){
    const rate =
      Number(value);

    if(
      !Number.isFinite(rate) ||
      rate <= 0
    ){
      return false;
    }

    this.playbackRate =
      rate;

    if(this.source){

      try{
        this.source.playbackRate.setValueAtTime(
          rate,
          this.ctx.currentTime
        );
      }
      catch{
        this.source.playbackRate.value =
          rate;
      }
    }

    return true;
  }


  playFromLevelTime(
    levelTime_us,
    ctxStartTime,
    globalOffset_us = 0
  ){
    this.stop();

    if(!this.ctx || !this.buffer){
      return false;
    }


    /*
      + globalOffset이면 음악이 늦게 들림.

      예:
      level = 10.000 sec
      globalOffset = +0.050 sec

      song = 9.950 sec
    */
    let songTime_sec =
      (
        levelTime_us -
        globalOffset_us
      ) / 1000000;


    let when =
      ctxStartTime;

    let offset =
      songTime_sec;


    /*
      곡 시작 전 시간이라면

      level = -0.5 sec

      → 지금 곡을 -0.5초부터 틀 수 없으므로
      → 0.5초 뒤에 song 0초부터 시작
    */
    if(songTime_sec < 0){

      const safeRate =
        Number.isFinite(
          this.playbackRate
        ) &&
        this.playbackRate > 0
          ? this.playbackRate
          : 1;

      when +=
        -songTime_sec /
        safeRate;

      offset = 0;
    }


    // 이미 곡 끝을 넘어갔다면 재생하지 않음
    if(offset >= this.buffer.duration){
      return false;
    }


    const source =
      this.ctx.createBufferSource();

    source.buffer =
      this.buffer;

    source.playbackRate.value =
      Number.isFinite(
        this.playbackRate
      ) &&
      this.playbackRate > 0
        ? this.playbackRate
        : 1;

    source.connect(
      this.gain
    );


    source.onended = () => {

      if(this.source === source){
        this.source = null;
      }
    };


    source.start(
      when,
      offset
    );

    this.source =
      source;

    return true;
  }


  stop(){

    if(!this.source){
      return;
    }
  
  
    try{
  
      this.source.stop();
    }
    catch{
  
      // 이미 종료된 source면 무시
    }
  
  
    this.source =
      null;
  }


  setVolume(value){
    if(!this.gain) return;

    this.gain.gain.value =
      Math.max(0, value);
  }
}

class Clock{
  constructor(){
    this.time_us = 0;

    this.startOffset_us = 0;

    this.startTime_sec = 0;

    this.audioContext = null;

    // 1.0 = 100%, 0.5 = 50%, 2.0 = 200%
    this.playbackRate = 1;

    this.running = false;
  }


  setAudioContext(ctx){
    this.audioContext = ctx;
  }


  _now(){
    if(this.audioContext){
      return this.audioContext.currentTime;
    }

    return performance.now() / 1000;
  }


  startAt(
    time_us,
    startTime_sec = null
  ){
    this.startOffset_us =
      time_us;

    this.startTime_sec =
      startTime_sec ??
      this._now();

    this.time_us =
      time_us;

    this.running =
      true;
  }


  setPlaybackRate(
    value
  ){
    const rate =
      Number(value);

    if(
      !Number.isFinite(rate) ||
      rate <= 0
    ){
      return false;
    }

    if(this.running){

      const now_sec =
        this._now();

      const dt_sec =
        now_sec -
        this.startTime_sec;

      this.time_us =
        this.startOffset_us +
        dt_sec *
        1000000 *
        this.playbackRate;

      this.startOffset_us =
        this.time_us;

      this.startTime_sec =
        now_sec;
    }

    this.playbackRate =
      rate;

    return true;
  }


  update(){
    if(!this.running){
      return;
    }

    const now_sec =
      this._now();

    const dt_sec =
      now_sec -
      this.startTime_sec;

    this.time_us =
      this.startOffset_us +
      dt_sec *
      1000000 *
      this.playbackRate;
  }


  stop(){
    this.startOffset_us = 0;
    this.time_us = 0;
    this.startTime_sec = 0;
    this.running = false;
  }


  getTime_us(){
    return this.time_us;
  }
}

//에디터의 상태 정보를 담은 클래스
class EditorState{
  constructor(){

    // 현재 선택된 모든 타일
    this.selectedFloorIds = new Set();

    // 선택된 것 중 현재 대표 타일
    this.activeFloorId = null;

    // Shift 범위 선택의 시작점
    this.selectionAnchorId = null;

    this.mode = "edit";
  }
}

//Three.js 렌더 관리
class RenderEngine{
  constructor(runtime, cameraSystem,clock){
    this.runtime = runtime; //런타임 클래스 저장
    this.cameraSystem = cameraSystem;
    this.clock = clock
    this._raf = null;
    
    //state.mode에 따라 바뀌는 프레임 로드
    this.onFrame = (now_ms) =>{ return; }

    /*
      UI diagnostics hook.
      EditorApp can update its info text here without wrapping every
      play/edit onFrame assignment separately.
    */
    this.afterFrame = (now_ms) =>{ return; };

    this.frameCount = 0;
    this.fps = 0;
    this._fpsWindowStart = null;
    this._fpsWindowFrames = 0;
    
    this._lastTime = null;
  }

  start(){
  const loop = (now) => {

    if(this._lastTime == null){
      this._lastTime = now;
    }

    const dtMs = now - this._lastTime;
    this._lastTime = now;

    this.frameCount++;
    this._fpsWindowFrames++;

    if(this._fpsWindowStart === null){
      this._fpsWindowStart = now;
    }

    const fpsElapsed =
      now - this._fpsWindowStart;

    if(fpsElapsed >= 500){
      this.fps =
        this._fpsWindowFrames *
        1000 /
        fpsElapsed;

      this._fpsWindowFrames = 0;
      this._fpsWindowStart = now;
    }

    this.onFrame(now);
    this.afterFrame(now);

    this.runtime.render(
      this.cameraSystem.camera
    );

    this._raf = requestAnimationFrame(loop);
  };

  this._raf = requestAnimationFrame(loop);
}

  stop(){ //렌더링 종료
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._lastTime = null;
  }
}

//컴파일돤 프로젝트를 클래스 형태로 저장
class CompiledProject{
  constructor(){
    this.floors = null;
    
    this.bpms = [];
    this.beats = [];
    this.floorStarts_us = [];
    this.floorDurations_us = [];
    
    
    /*
      Pause countdown으로 인해
      추가로 발생하는 hitsound 시간
    */
    this.countdownHitTimes_us = [];
    
    
    /*
      일반 타일 hit +
      countdown hit을 합친 최종 배열
    */
    
    
    this.playerCameraPositions = [];

    /*
      index별 이벤트 표시 정보

      null
      또는

      {
        type: "...",
        color: 0xffffff
      }
    */
    this.eventMarkers = [];
    
    /*
    실제 타일을 밟을 때
    발생하는 hitsound 목록
  
    [
      {
        time_us,
        hitsound,
        volume,
        pitch,
        kind
      }
    ]
  */
  this.hitSoundEvents =
    [];
  
  
  /*
    PlaySound는 정확한 offset 해석을
    이후에 확정하기 전까지
  
    원본 정보를 컴파일 결과에
    보존만 해둔다.
  */
  this.playSoundActions =
    [];
  }
}

//직접적으로 에디터에 사용가능하고 수정 삭제따위에 용이한 문서 클래스
class Document {
  constructor(){
    this.ids = [];    // ["f_0","f_1",...]
    this.angles = []; // [0, 30, 999, ...]  (원본 그대로 보관)
    this.nextId = 0;
    this.actions = [];
    this.settings = null;
  }
  
  removeAction(
    action
  ){
  
    const index =
      this.actions.indexOf(
        action
      );
  
  
    if(index < 0){
      return false;
    }
  
  
    this.actions.splice(
      index,
      1
    );
  
  
    return true;
  }
  
  getActionsByFloorId(
    floorId
  ){
    return this.actions.filter(
      action =>
        action.floorId === floorId
    );
  }
  
  indexOfId(id){ return this.ids.indexOf(id); }

  //새 각도 추가
  insertAfter(afterId, angle){
    const i = this.indexOfId(afterId);
    const idx = (i < 0) ? this.ids.length : i + 1;
    this.ids.splice(idx, 0, this.newId());
    this.angles.splice(idx, 0, angle);
    return this.ids[idx]; // 새로 만든 id 반환
  }

  //해당 아이디 삭제
  removeById(id){
    const i = this.indexOfId(id);
  
    if(i < 0) return false;
  
    this.actions = this.actions.filter(action => {
      return action.floorId !== id;
    });
  
    this.ids.splice(i, 1);
    this.angles.splice(i, 1);
  
    return true;
  }
  
  updateAction(
    action,
    patch
  ){
  
    const index =
      this.actions.indexOf(
        action
      );
  
  
    if(index < 0){
      return false;
    }
  
  
    Object.assign(
      this.actions[index],
      patch
    );
  
  
    return true;
  }
  
  //해당 아이디의 앵글 바꿈
  setAngle(id, angle){
    const i = this.indexOfId(id);
    if(i < 0) return false;
    this.angles[i] = angle;
    return true;
  }
  
  newId(){
    return "f_" + (this.nextId++);
  }

  canAddAction(
    floorId,
    eventType
  ){

    /*
      유효한 타일인지
    */
    if(
      this.indexOfId(
        floorId
      ) < 0
    ){
      return false;
    }


    const def =
      getEventDefinition(
        eventType
      );


    /*
      이 에디터가 지원하지 않는 이벤트는
      새로 추가할 수 없다.

      기존 파일에 들어있는 이벤트는
      그대로 보존만 한다.
    */
    if(!def){
      return false;
    }


    /*
      복수 설치 허용 이벤트
    */
    if(
      def.allowMultiple
    ){
      return true;
    }


    /*
      단일 이벤트라면
      같은 floor + 같은 eventType이
      이미 존재하는지 검사한다.
    */
    const alreadyExists =
      this.actions.some(
        action =>
          action.floorId ===
            floorId
          &&
          action.eventType ===
            eventType
      );


    return !alreadyExists;
  }

  addAction(
    floorId,
    eventType,
    data = {}
  ){

    if(
      !this.canAddAction(
        floorId,
        eventType
      )
    ){
      return null;
    }


    const def =
      getEventDefinition(
        eventType
      );


    const action = {

      eventType,

      ...structuredClone(
        def.defaultData ??
        {}
      ),

      ...data,

      floorId
    };


    this.actions.push(
      action
    );


    return action;
  }
}

class DocumentBuilder{
  constructor(){
    
  }
  
  //newId(){ return "f_" + (this._id++); }

  
  fromProject(project){
    const doc = new Document();
  
    const angles = [0, ...project.json.angleData];
    const settings =
      structuredClone(
        project.json.settings ??
        {}
      );
  
    for(const a of angles){
      doc.ids.push(doc.newId());
      doc.angles.push(a);
    }
  
    doc.actions =
      (project.json.actions ?? [])
      .map(action => {
    
        const { floor, ...rest } = action;
    
        return {
          ...rest,
          floorId:
            doc.ids[floor] ?? null
        };
      });
  
    doc.settings = {

      songFilename:
        "",

      bpm:
        100,

      volume:
        100,

      offset:
        0,

      pitch:
        100,

      hitsound:
        "Kick",

      hitsoundVolume:
        100,

      artist:
        "Artist",

      song:
        "Song",

      author:
        "",
    
      ...settings
    };
  
    return doc;
  }
}


//json 전처리
class Compiler{ 
  constructor(){
    
  }
  
  //project가 아닌 document를 받는 새로운 compile 함수
  compile(doc){

    const EMPTY_ACTIONS =
      Object.freeze([]);

    

    const floorIndexById =
      new Map();


    for(
      let i = 0;
      i < doc.ids.length;
      i++
    ){

      floorIndexById.set(
        doc.ids[i],
        i
      );
    }
    //console.log(doc)
    //this.doc = doc //document 클래스를 저장
    const compiled = new CompiledProject();
    
    //const actionsIdx = 0;
    
    /* 타일 시작 */
    const angleData =
      doc.angles;

    const actions =
      doc.actions;

    /*
      이벤트가 없는 타일은 null.

      이벤트가 실제로 존재하는 타일에서만
      Array를 생성한다.
    */
    const actionsByFloor =
      new Array(
        angleData.length
      ).fill(
        null
      );


    for(
      const action
      of actions
    ){

      const floorIndex =
        floorIndexById.get(
          action.floorId
        );


      if(
        floorIndex ===
        undefined
      ){
        continue;
      }


      let floorActions =
        actionsByFloor[
          floorIndex
        ];


      if(!floorActions){

        floorActions =
          [];

        actionsByFloor[
          floorIndex
        ] =
          floorActions;
      }


      floorActions.push(
        action
      );
    }
    
    /*
      렌더링용 이벤트 표시와
      이후 이벤트 UI에서도 활용하기 좋도록
    
      타일별 전체 action도 따로 묶는다.
    */
    
    const floorLength = 1; //얼불춤은 내부적으로 타일당 1.5유닛의 크기를 가짐, 다만 에디터에선 타일 크기가 1이므로 1로 통일
    let x = 0; //타일 시작 x위치
    let y = 0; //타일 시작 y위치
    let prev_x = 0; //이전 타일 시작 x위치
    let prev_y = 0; //이전 타일 시작 y위치
    
    //새로운 for문; 이전 for문은 현재 각도와 이전 각도를 가져와 타일을 만들었지만 마지막타일은 안만들어지며 무엇보다 시스템적으로 어울리지 않은 형태
    //얼불춤의 앵글데이터는 가장 먼저 생성되는 0도짜리 첫번째 타일 다음것부터 저장하며, 예컨대 [0, 90, 0]일 경우 0도 타일은 다음 90도 타일에 따라 그 모양이 L모양 따위로 결정되므로, 시스템적으론 다음 각도를 참조하는게 더 옳은 형태
    //박자 계산에 대해 : 얼불춤은 음수 각도와 상관없이 모든 각도를 0부터 360 사이로 정규화시켜서 계산함. 이때 서로 반대방향의 각도가 있으면 360도 타일로, 999라는 특수 각도는 미드스핀으로 계산함
    //변경 : rawAngle을 nowAngle로 변경, 더러웠던 코드 싹 정리하고 깔끔하게 정의
    
    let prevAngle = 0; //이전 앵글 저장
    let midspinCount = 0; //미드스핀이 얼마나 나왔는지
    let isTwirled = false; //지금 뒤집어진 상태인지
    let currentBpm =
      Number(
        doc.settings?.bpm
      );
    
    
    /*
      BPM이 없거나 0 이하라면
      안전한 기본값 사용.
    */
    if(
      !Number.isFinite(
        currentBpm
      )
      ||
      currentBpm <= 0
    ){
    
      currentBpm =
        100;
    }
    
    
    const rawOffset =
      Number(
        doc.settings?.offset
      );
    
    
    const offset_us =
      Number.isFinite(
        rawOffset
      )
        ? rawOffset * 1000
        : 0;
    
    
    let t_us =
      -Math.round(
        60000000 /
        currentBpm
      )
      +
      offset_us;
    
    //카메라 이펙트 정조 전면 삭제
    
    const floors = []; //앵글데이터를 통해 나온 타일 클래스를 저장할 배열
    const angles = [] //타일 각도 저장
    const beats = [] //타일 박자 저장
    const bpms = [] //그 타일 인덱스의 bpm 저장
    const floorStarts_us = [] //us단위 타일 시작시간
    const floorDurations_us = [] //us단위 타일 기간
    
    const countdownHitTimes_us = [];
    
    const playerCameraPositions = []; //플레이어 카메라 벡터값 배열
    const eventMarkers = [];
    //const cameraActionsArr = [];
    
    /* =========================================================
       Hitsound state
    ========================================================= */
    
    let currentHitsound =
      String(
        doc.settings?.hitsound ??
        "Kick"
      );
    
    
    let currentHitsoundVolume =
      Number(
        doc.settings
          ?.hitsoundVolume ??
        100
      );
    
    
    if(
      !Number.isFinite(
        currentHitsoundVolume
      )
    ){
    
      currentHitsoundVolume =
        100;
    }
    
    
    const hitSoundEvents =
      [];
    
    
    

    /*
      MID tiles follow the regular Hitsound channel until
      gameSound:"Midspin" creates a dedicated override.
    */
    let currentMidspinHitsound =
      currentHitsound;

    let currentMidspinHitsoundVolume =
      currentHitsoundVolume;

    let hasMidspinHitsoundOverride =
      false;


    const playSoundActions =
      [];
    
    
    //floorStarts_us[0] = Math.round(-1*60000000/currentBpm);
    floorStarts_us[0] = t_us;
    //playerCameraPositions[0] = null;
    playerCameraPositions[0] = {
      start_us: 0,
      duration_us: 0,
      end_us: 0,
      from_x: 0,
      from_y: 0,
      to_x: 0,
      to_y: 0,
      dx: 0,
      dy: 0,
    }
    
    for(let i = 0; i < angleData.length; i++){
      
      const floorActions =
        actionsByFloor[i] ??
        EMPTY_ACTIONS;
      //현재 각도, 0~359사이로 정규화
      let nowAngle = angleData[i] == 999 ? angleData[i] : normalizeAngle(angleData[i]);
      
      //다음 인덱스, i+1은 배열 최대 인덱스를 벗어나지 않음
      let j = Math.min((i + 1), angleData.length-1);
      let nextAngle = angleData[j] == 999 ? angleData[j] : normalizeAngle(angleData[j]); //다음각도, 999일땐 냄김
      
      //floor의 option을 위한 변수
      let option = {isTwirled : false, isFullspin : false, isMidspin : false};
      let isUpdatePrev = true;

      /* =========================
        Twirl 상태

        기본:
        false = 시계 방향
        true  = 반시계 방향

        Twirl을 만날 때마다 교차한다.
      ========================= */

      let twirlCount =
        0;


      for(
        const action
        of floorActions
      ){

        if(
          action.eventType ===
          "Twirl"
        ){

          twirlCount++;
        }
      }


      if(
        twirlCount % 2 === 1
      ){

        isTwirled =
          !isTwirled;
      }


      option.isTwirled =
        isTwirled;


      option.isTwirled =
        isTwirled;
      
      //twirl이 고려된 타일 각도
      let angle = 0
      const setAngle = (now, next) => {return normalizeAngle(now - next + 180)}
      
      //다음 각도가 999면 => 현재 타일은 미드스핀
      if(nextAngle === 999 && nowAngle != 999){
        option.isMidspin = true;
        angle = 0;
        nextAngle = reverseAngle(nowAngle);
        midspinCount ++;
      }
      //다음 각도가 999고 현재도 999면 (미드스핀이 연속으로 나오면)
      else if(nextAngle === 999 && nowAngle === 999){
        option.isMidspin = true;
        angle = 0;
        nowAngle = midspinCount%2==0 ? prevAngle : reverseAngle(prevAngle);
        nextAngle = midspinCount%2==0 ? reverseAngle(prevAngle) : prevAngle;
        isUpdatePrev = false;
        midspinCount++
      }
      else{
        //현재 각도가 999면 => 이전 각도 사용
        if(nowAngle === 999){
          nowAngle = reverseAngle(prevAngle);
        }
        //각도 구하기
        angle = setAngle(nowAngle, nextAngle);
        
        
        
        //소용돌이 적용 상태면
        if(isTwirled){
          //각도 뒤집기
          angle = normalizeAngle(360 - angle)
          option.isTwirled = true;
        }
        
        //박자가 0이면 => 360도
        if(angle == 0){
          angle = 360;
          option.isFullspin = true;
        }
        
        //미드스핀이 없으므로 미드스핀카운트를 0으로
        midspinCount = 0;
      }
      
      let floor = new Floor(doc.ids[i], x, y, reverseAngle(nowAngle), nextAngle, option) // 타일 생성
      floors.push(floor); //타일 추가
      
      /*
        현재 타일의 이벤트 표시.
      
        여기서의 currentBpm은
        이 타일의 SetSpeed가 적용되기 전 BPM이다.
        따라서 증가/감소 여부를 제대로 판정할 수 있다.
      */
      eventMarkers.push(
        createEventMarkerInfo(
          floorActions,
          currentBpm,
          isTwirled,
          {
            /*
              angle은 이미 현재 타일의 Twirl 상태가
              적용된 뒤의 유효 이동각이다.

              nextAngle은 999/MID도 위에서
              실제 절대각으로 해석한 값이다.
            */
            effectiveAngle:
              angle,

            nextAbsoluteAngle:
              normalizeAngle(
                nextAngle
              )
          }
        )
      );
      
      // bpm설정
      for(
        const action
        of floorActions
      ){
        
        if(
          action.eventType !==
          "SetSpeed"
        ){
          continue;
        }
      
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
            currentBpm =
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
      
            currentBpm *=
              multiplier;
          }
        }
      }
      
      // 시각적인 타일 각도는
      // Pause와 관계없이 원래 값 유지
      angles.push(
        angle
      );
      
      
      // 현재 타일 BPM
      bpms.push(
        currentBpm
      );
      
    
      
    
    
    /* =========================
       Pause
    ========================= */
    
    
    
    let pauseBeat =
      0;
    
    
    for(
      const pauseAction
      of floorActions
    ){
    
      if(
        pauseAction.eventType !==
        "Pause"
      ){
        continue;
      }
    
    
      const pauseDuration =
        Number(
          pauseAction.duration
        );
    
    
      if(
        !Number.isFinite(
          pauseDuration
        ) ||
        pauseDuration <= 0
      ){
        continue;
      }
    
    
      /*
        Duration 자체는
        타일 종류와 관계없이 동일하게 적용.
    
        일반 타일 / 360° / MID 모두
        Pause duration 계산은 동일하다.
    
        MID에서 무시되는 것은
        countdownTicks뿐이다.
      */
      pauseBeat +=
        pauseDuration;
    }
      
      /*
        일반 타일 박자
      
        angle 180° = 1박
        angle 90°  = 0.5박
        angle 360° = 2박
      */
      const normalBeat =
        angle / 180;
      
      
      /*
        Pause는
      
        기존 각도에
        180° * duration
      
        을 추가한 것과 동일.
      
        즉:
      
        totalBeat
          = angle / 180
          + pauseDuration
      */
      const beat =
        normalBeat +
        pauseBeat;
      
      
      beats.push(
        beat
      );
      
      
      /*
        현재 BPM을 기준으로
        실제 체류시간 계산
      */
      const duration =
        Math.round(
          beat *
          60000000 /
          currentBpm
        );
      
      
      floorDurations_us.push(
        duration
      );
      
      //타일 시작 지점 (마이크로초 단위)
      if(i > 0){
        /*
        t_us = t_us + Math.round(
          beats[i-1] * 60000000 / currentBpm
        );
        */
        t_us += floorDurations_us[i - 1];
      
        floorStarts_us.push(t_us);
        
        /* 플레이어 카메라 이동을 위한 변수 */
        //현재 bpm의 두 박자
        let twoBeats_us = Math.round(2 * 60000000 / currentBpm);
        //방향
        let dirAngle = nowAngle;
        //전 타일 기준 dirAngle 방향으로 floorLength만큼 갔을때의 위치
        let cam_x = prev_x + floorLength * Math.cos(degToRad(dirAngle));
        let cam_y = prev_y + floorLength * Math.sin(degToRad(dirAngle));
        //전체 종합
        let cameraPosition = {
          start_us : t_us,
          duration_us : twoBeats_us,
          end_us : t_us + twoBeats_us,
          from_x : prev_x,
          from_y : prev_y,
          to_x : cam_x,
          to_y : cam_y,
          dx : cam_x - prev_x,
          dy : cam_y - prev_y,
        }
        playerCameraPositions.push(cameraPosition);
      }
      
      //카메라 이벤트 설정
      //*전면삭제
      
      prev_x = x
      prev_y = y
      
      let reg = degToRad(nextAngle);
      x = x + floorLength * Math.cos(reg); //타일 중심 (타일이 꺾이는 부분)으로부터 다음 타일 x위치
      y = y + floorLength * Math.sin(reg); //타일 중심 (타일이 꺾이는 부분)으로부터 다음 타일 y위치
      
      //미드스핀이 아닐 경우에만 prevAngle 최신화
      if(isUpdatePrev) prevAngle = nowAngle
    }
    
    /* =========================================================
       Compile Hitsound Events
    ========================================================= */

    currentHitsound =
      String(
        doc.settings?.hitsound ??
        "Kick"
      );


    currentHitsoundVolume =
      Number(
        doc.settings
          ?.hitsoundVolume ??
        100
      );


    if(
      !Number.isFinite(
        currentHitsoundVolume
      )
    ){

      currentHitsoundVolume =
        100;
    }


    currentMidspinHitsound =
      currentHitsound;

    currentMidspinHitsoundVolume =
      currentHitsoundVolume;

    hasMidspinHitsoundOverride =
      false;


    for(
      let i = 0;
      i < floors.length;
      i++
    ){

      const floor =
        floors[i];


      const floorActions =
        actionsByFloor[i] ??
        EMPTY_ACTIONS;


      /*
        SetHitsound applies from its own tile.

        floor N has SetHitsound(Hat)
        -> floor N itself already uses Hat.
      */
      for(
        const action
        of floorActions
      ){

        if(
          action.eventType !==
          "SetHitsound"
        ){
          continue;
        }


        const gameSound =
          String(
            action.gameSound ??
            "Hitsound"
          )
          .trim()
          .toLowerCase();


        const nextHitsound =
          action.hitsound != null
            ? String(
                action.hitsound
              )
            : null;


        const nextVolume =
          Number(
            action.hitsoundVolume
          );


        if(
          gameSound ===
          "hitsound"
        ){

          if(
            nextHitsound !==
            null
          ){

            currentHitsound =
              nextHitsound;
          }


          if(
            Number.isFinite(
              nextVolume
            )
          ){

            currentHitsoundVolume =
              nextVolume;
          }


          continue;
        }


        if(
          gameSound ===
          "midspin"
        ){

          hasMidspinHitsoundOverride =
            true;


          if(
            nextHitsound !==
            null
          ){

            currentMidspinHitsound =
              nextHitsound;
          }


          if(
            Number.isFinite(
              nextVolume
            )
          ){

            currentMidspinHitsoundVolume =
              nextVolume;
          }
        }
      }


      const isMidspin =
        Boolean(
          floor?.option?.isMidspin
        );


      const useMidspinChannel =
        isMidspin &&
        hasMidspinHitsoundOverride;


      hitSoundEvents.push({

        time_us:
          floorStarts_us[i],

        hitsound:
          useMidspinChannel
            ? currentMidspinHitsound
            : currentHitsound,

        volume:
          useMidspinChannel
            ? currentMidspinHitsoundVolume
            : currentHitsoundVolume,

        pitch:
          100,

        kind:
          "tile",

        gameSound:
          useMidspinChannel
            ? "Midspin"
            : "Hitsound",

        isMidspin,

        floorIndex:
          i,

        floorId:
          doc.ids[i]
      });


      /*
        PlaySound is intentionally not played yet.
        Keep its source data for future support.
      */
      for(
        const action
        of floorActions
      ){

        if(
          action.eventType !==
          "PlaySound"
        ){
          continue;
        }


        playSoundActions.push({

          floorIndex:
            i,

          floorId:
            doc.ids[i],

          floorStart_us:
            floorStarts_us[i],

          hitsound:
            String(
              action.hitsound ??
              "Kick"
            ),

          offset:
            Number(
              action.offset ??
              0
            ),

          playDuration:
            Number(
              action.playDuration ??
              0
            ),

          pitch:
            Number(
              action.pitch ??
              100
            ),

          volume:
            Number(
              action.hitsoundVolume ??
              100
            ),

          angleOffset:
            Number(
              action.angleOffset ??
              0
            ),

          eventTag:
            String(
              action.eventTag ??
              ""
            )
        });
      }
    }

    /* =========================================================
     Countdown playback
  ========================================================= */
  
  for(
    let i = 0;
    i < floors.length;
    i++
  ){
  
    const floor =
      floors[i];
  
  
    /*
      MID는 countdown을 완전히 무시.
  
      현재 Compiler에서
      next angle이 999인 타일이
      isMidspin = true가 된다.
    */
    if(
      floor?.option?.isMidspin
    ){
      continue;
    }
  
  
    const floorActions =
      actionsByFloor[i] ??
      EMPTY_ACTIONS;
  
  
    let rawCountdownTicks =
      0;
  
  
    /*
      현재는 Pause를 하나만 허용하지만
      외부 파일의 비정상 중복까지 고려해서
      가장 큰 countdown 값을 사용.
    */
    for(
      const action
      of floorActions
    ){
  
      if(
        action.eventType !==
        "Pause"
      ){
        continue;
      }
  
  
      const ticks =
        Math.max(
          0,
          Math.trunc(
            Number(
              action.countdownTicks
            ) || 0
          )
        );
  
  
      rawCountdownTicks =
        Math.max(
          rawCountdownTicks,
          ticks
        );
    }
  
  
    const effectiveCountdownTicks = rawCountdownTicks;
  
  
    if(
      effectiveCountdownTicks <= 0
    ){
      continue;
    }
  
  
    const bpm =
      Number(
        bpms[i]
      );
  
  
    if(
      !Number.isFinite(bpm) ||
      bpm <= 0
    ){
      continue;
    }
  
  
    const beat_us =
      60000000 /
      bpm;
  
  
    const floorStart_us =
      floorStarts_us[i];
  
  
    const floorEnd_us =
      floorStart_us +
      floorDurations_us[i];
  
  

  
    /*
      countdown은 다음 타일 직전부터
      1박 간격으로 역산한다.
    */
    for(
      let tick =
        effectiveCountdownTicks;
  
      tick >= 1;
  
      tick--
    ){
  
      const hit_us =
        Math.round(
          floorEnd_us -
          tick *
          beat_us
        );
  
  
      countdownHitTimes_us.push(
        hit_us
      );
    }
  }
  
  countdownHitTimes_us.sort(
    (a, b) =>
      a - b
  );
  
  const uniqueCountdownHitTimes_us =
    countdownHitTimes_us.filter(
      (
        time,
        index,
        array
      ) =>
  
        index === 0 ||
        time !==
          array[index - 1]
    );
  

    /*
    
    console.log(floors)
    console.log(bpms);
    console.log(beats);
    console.log(floorStarts_us);
    console.log(floorDurations_us);
    console.log(playerCameraPositions)

    */
    
    
    compiled.floors = floors;
    compiled.bpms = bpms;
    compiled.beats = beats;
    compiled.floorStarts_us =
      floorStarts_us;
    
    compiled.floorDurations_us =
      floorDurations_us;
    
    
    compiled.countdownHitTimes_us =
      uniqueCountdownHitTimes_us;
    
    
    
    
    compiled.playerCameraPositions =
      playerCameraPositions;
    compiled.eventMarkers = eventMarkers;
    
    compiled.hitSoundEvents =
      hitSoundEvents;
    
    
    compiled.playSoundActions =
      playSoundActions;
    
    //console.log(twirlActions);
    //console.log(floors)
    return compiled;
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
    this.editorGlobalOffset_ms = 0;
    /*
      화면 렌더 보정값.
      +값 = 화면을 늦춤.
    */
    this.editorVisualOffset_ms = 0;
    
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

    this.levelStarted = false;
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

    if(!this.autosaveInitialized){
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
    
    
    this.editorUI.init({

      onAddAngle: angle => {
    
        this.addFloorAfterSelected(
          angle
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
    
    });

    this.initProjectSettingsUI();

    this.initEditorSettingsUI();

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


    /*
      Do not open Level Settings automatically on the first page load.
      Missing song information is still shown when the user opens
      Level Settings manually.
    */
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
      localStorage.getItem(
        "adofai-editor-grid"
      );

    const showGrid =
      savedGrid !== "false";

    gridInput.checked =
      showGrid;

    this.runtime.setGridVisible(
      showGrid
    );

    const savedInfo =
      localStorage.getItem(
        "adofai-editor-info"
      );

    const showInfo =
      savedInfo !== "false";

    infoInput.checked =
      showInfo;

    this.setEditorInfoVisible(
      showInfo
    );

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
        if(
          e.key === "Escape" &&
          !overlay.hidden
        ){
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

        localStorage.setItem(
          "adofai-editor-grid",
          String(visible)
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

        localStorage.setItem(
          "adofai-editor-info",
          String(visible)
        );
      }
    );

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

      return true;
    }
    catch(error){

      console.error(
        "level file load failed:",
        error
      );

      alert(
        "Failed to load the level file."
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


      return true;
    }
    catch(error){

      console.error(
        "default level load failed:",
        error
      );


      alert(
        "Failed to load the default level.adofai file."
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
    let baseName =
      `${artist} - ${song}`
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

      alert(
        "There is no level to download."
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
  
  
    return true;
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
  
  
    this.doc.setAngle(
      nextFloorId,
      normalizeAngle(angle)
    );
  
  
    /*
      선택 상태는 stable ID라
      rebuild 후에도 그대로 살아 있음.
    */
    this.rebuild();
  
  
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
  
  
    this.doc.setAngle(
      nextId,
      999
    );
  
  
    this.rebuild();
  
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
  
  
    this.doc.setAngle(
      nextId,
      fullspinAngle
    );
  
  
    this.rebuild();
  
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
  
  addFloorAfterSelected(angle = 0){

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
    const rawAngle =
      angle === 999
        ? 999
        : normalizeAngle(angle);
  
  
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
      삭제하기 전에
      다음에 선택할 타일을 기억한다.
  
      우선순위:
        1. 다음 타일
        2. 없다면 이전 타일
    */
    const nextSelectedId =
      this.doc.ids[index - 1] ??
      this.doc.ids[index + 1] ??
      null;
  
  
    /*
      실제 삭제
  
      Document.removeById()가
      이 타일에 속한 action도 같이 제거함.
    */
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
  
    for(const id of removableIds){
      this.doc.removeById(id);
    }
  
    this.state.selectedFloorIds.clear();
    this.state.activeFloorId = null;
    this.state.selectionAnchorId = null;
  
    this.rebuild();
  
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
      Restore the camera state at the exact level start time
      before pre-roll begins. This prevents the first playback
      transition from snapping when playback starts from an
      arbitrary middle tile.
    */
    this.evaluator.init(
      this.compiled,
      this.playTarget_us
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
    this.song.playFromLevelTime(
      preRollStart_us,
      ctxStartTime,
      this.editorGlobalOffset_ms * 1000
    );
  
  
    /*
      pre-roll 중에는 히트사운드 없음.
      실제 target에 도착할 때 시작.
    */
    this.hitSound.stop();
  
  
    this.playButton.setPlaying(
      true
    );
  
  
    this.renderEngine.onFrame =
      () => {
  
        this.clock.update();
  
        const t_us =
          this.clock.getTime_us();
          
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
  
  
          this.hitSound.start(

            this.compiled
              .hitSoundEvents,
          
            this.compiled
              .countdownHitTimes_us,
          
            this.playTarget_us
          );

            
  
  
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
          히트사운드
          ==========================
        */
  
        this.hitSound.update(
          t_us
        );
  
  
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
  
      index =
        this.evaluator
          .findFloorIndexByTime_us(
            t_us
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
  
  setEditorGlobalOffset(ms){

    const value =
      Number(ms);
  
    if(!Number.isFinite(value)){
      return false;
    }
  
    this.editorGlobalOffset_ms =
      value;
  
    return true;
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

        /*
          Compiler stores the orbit state AFTER applying a Twirl on
          this floor. false = clockwise, true = counterclockwise.
        */
        const isTwirled =
          Boolean(
            floor.option?.isTwirled
          );

        lines.push(
          `isTwirled: ${isTwirled}  Orbit: ${isTwirled ? "Counterclockwise (CCW)" : "Clockwise (CW)"}`
        );
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

    let bpm = null;

    if(activeIndex >= 0){
      const value =
        Number(
          this.compiled?.bpms?.[
            activeIndex
          ]
        );

      if(Number.isFinite(value)){
        bpm = value;
      }
    }

    const pitch =
      Number(
        this.doc?.settings?.pitch ??
        100
      );

    let statusLine =
      `Mode: ${mode}`;

    if(bpm !== null){
      statusLine +=
        `  BPM: ${bpm.toFixed(2).replace(/\.00$/, "")}`;
    }

    if(Number.isFinite(pitch)){
      statusLine +=
        `  Pitch: ${pitch}%`;
    }

    if(
      this.state?.mode === "play" &&
      this.clock
    ){
      const timeSec =
        Number(
          this.clock.getTime_us()
        ) /
        1000000;

      if(Number.isFinite(timeSec)){
        statusLine +=
          `  Time: ${timeSec.toFixed(3)}s`;
      }
    }

    lines.push(
      statusLine
    );

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


    return action;
  }
}

window.app = new EditorApp();
app.loadProject("./level.adofai");