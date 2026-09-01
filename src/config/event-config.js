export const EVENT_MARKER_ICONS = {
  rabbit: "./icons/Rabbit.png",
  rabbitFast: "./icons/Double_Rabbit.png",
  snail: "./icons/Snail.png",
  snailSlow: "./icons/Double_Snail.png",
  equal: "./icons/equal.png",
  twirlBlue: "./icons/swirl_blue.png",
  twirlRed: "./icons/swirl_red.png",
  star: "./icons/tile_vfx.png",
};

export const EVENT_TAB_DEFS = {
  SetSpeed: {
    key: "speed",
    title: "Set Speed",
    iconSrc: "./icons/SetSpeed.png",
    editable: true,
    allowMultiple: true,
    openTabOnCreate: true,
    defaultData: {
      speedType: "Bpm",
      beatsPerMinute: 100,
      bpmMultiplier: 1,
      angleOffset: 0,
    },
    order: 10,
  },

  Twirl: {
    key: "twirl",
    title: "Twirl",
    iconSrc: "./icons/Twirl.png",
    editable: true,
    allowMultiple: false,
    openTabOnCreate: false,
    defaultData: {},
    order: 20,
  },

  Pause: {
    key: "pause",
    title: "Pause",
    iconSrc: "./icons/Pause.png",
    editable: true,
    allowMultiple: false,
    openTabOnCreate: true,
    defaultData: {
      duration: 1,
      countdownTicks: 0,
      angleCorrectionDir: "None",
    },
    order: 30,
  },

  SetHitsound: {
    key: "hitsound",
    title: "Set Hitsound",
    iconSrc: "./icons/SetGameSound.png",
    editable: true,
    allowMultiple: false,
    openTabOnCreate: true,
    defaultData: {
      gameSound: "Hitsound",
      hitsound: "Kick",
      hitsoundVolume: 100,
    },
    order: 40,
  },
};

export function getEventDefinition(eventType) {
  return EVENT_TAB_DEFS[eventType] ?? null;
}

export function createEventTabGroups(actions) {
  const groups = new Map();

  for (const action of actions) {
    const def = EVENT_TAB_DEFS[action.eventType];

    if (!def) {
      const key = "unsupported";

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: "Unsupported Events",
          iconSrc: "./icons/tile_vfx.png",
          order: 1000,
          editable: false,
          actions: [],
        });
      }

      groups.get(key).actions.push(action);
      continue;
    }

    if (!groups.has(def.key)) {
      groups.set(def.key, {
        key: def.key,
        title: def.title,
        iconSrc: def.iconSrc,
        order: def.order,
        actions: [],
      });
    }

    groups.get(def.key).actions.push(action);
  }

  return [...groups.values()].sort((a, b) => a.order - b.order);
}
