export type EasingFunction = (t: number) => number;

export const linear: EasingFunction = (t) => t;

export const easeInQuad: EasingFunction = (t) => t * t;
export const easeOutQuad: EasingFunction = (t) => t * (2 - t);
export const easeInOutQuad: EasingFunction = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

export const easeInCubic: EasingFunction = (t) => t * t * t;
export const easeOutCubic: EasingFunction = (t) => --t * t * t + 1;
export const easeInOutCubic: EasingFunction = (t) =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

export const easeInSine: EasingFunction = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const easeOutSine: EasingFunction = (t) => Math.sin((t * Math.PI) / 2);
export const easeInOutSine: EasingFunction = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const easeInExpo: EasingFunction = (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1)));
export const easeOutExpo: EasingFunction = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutExpo: EasingFunction = (t) => {
  if (t === 0 || t === 1) return t;
  const scaled = t * 2;
  if (scaled < 1) {
    return Math.pow(2, 10 * (scaled - 1)) / 2;
  }
  return (2 - Math.pow(2, -10 * (scaled - 1))) / 2;
};

export const easeInCirc: EasingFunction = (t) => 1 - Math.sqrt(1 - t * t);
export const easeOutCirc: EasingFunction = (t) => Math.sqrt(1 - (t - 1) * (t - 1));
export const easeInOutCirc: EasingFunction = (t) =>
  t < 0.5
    ? (1 - Math.sqrt(1 - 4 * t * t)) / 2
    : (Math.sqrt(1 - (2 * t - 2) * (2 * t - 2)) + 1) / 2;

const c1 = 1.70158;
const c2 = c1 * 1.525;

export const easeInBack: EasingFunction = (t) => t * t * ((c1 + 1) * t - c1);
export const easeOutBack: EasingFunction = (t) =>
  1 + Math.pow(t - 1, 3) * ((c1 + 1) * (t - 1) + c1);
export const easeInOutBack: EasingFunction = (t) =>
  t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2;

const bounceOut = (t: number) => {
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
  }
  t -= 2.625 / d1;
  return n1 * t * t + 0.984375;
};

export const easeOutBounce: EasingFunction = (t) => bounceOut(t);

export const easeInBounce: EasingFunction = (t) => 1 - easeOutBounce(1 - t);
export const easeInOutBounce: EasingFunction = (t) =>
  t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2;

export const EASING_PRESETS: Record<string, EasingFunction> = {
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInSine,
  easeOutSine,
  easeInOutSine,
  easeInExpo,
  easeOutExpo,
  easeInOutExpo,
  easeInCirc,
  easeOutCirc,
  easeInOutCirc,
  easeInBack,
  easeOutBack,
  easeInOutBack,
  easeOutBounce,
  easeInBounce,
  easeInOutBounce,
};
