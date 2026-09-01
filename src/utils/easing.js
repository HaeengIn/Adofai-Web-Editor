export function ease(t, easeName = "linear") {
  t = Math.min(1, Math.max(0, t));
  const e = String(easeName).toLowerCase();

  switch (e) {
    case "linear":
      return t;

    case "inquad":
      return t * t;

    case "outquad":
      return 1 - (1 - t) * (1 - t);

    case "inoutquad":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    case "incubic":
      return t * t * t;

    case "outcubic":
      return 1 - Math.pow(1 - t, 3);

    case "inoutcubic":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    case "inexpo":
      return t === 0 ? 0 : Math.pow(2, 10 * t - 10);

    case "outexpo":
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

    case "inoutexpo":
      return t === 0
        ? 0
        : t === 1
          ? 1
          : t < 0.5
            ? Math.pow(2, 20 * t - 10) / 2
            : (2 - Math.pow(2, -20 * t + 10)) / 2;

    case "inback": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return c3 * t * t * t - c1 * t * t;
    }

    case "outback": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    case "inoutback": {
      const c1 = 1.70158;
      const c2 = c1 * 1.525;
      return t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    }

    case "outbounce":
      return t < 1 / 2.75
        ? 7.5625 * t * t
        : t < 2 / 2.75
          ? 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
          : t < 2.5 / 2.75
            ? 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
            : 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;

    case "inbounce":
      return 1 - ease(1 - t, "outbounce");

    case "inoutbounce":
      return t < 0.5
        ? (1 - ease(1 - 2 * t, "outbounce")) / 2
        : (1 + ease(2 * t - 1, "outbounce")) / 2;

    case "outelastic": {
      const c4 = (2 * Math.PI) / 3;
      return t === 0
        ? 0
        : t === 1
          ? 1
          : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }

    case "inelastic": {
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
