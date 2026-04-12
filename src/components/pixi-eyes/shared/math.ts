// Pure math helpers extracted from eye-field.ts

export function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(value, maxValue));
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function remap01(value: number, start: number, end: number): number {
  return clamp((value - start) / Math.max(end - start, 0.001), 0, 1);
}

export function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

export function easeInSine(value: number): number {
  return 1 - Math.cos((value * Math.PI) / 2);
}

export function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

export function easeInCubic(value: number): number {
  return value ** 3;
}

export function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

export function easeOutSine(value: number): number {
  return Math.sin((value * Math.PI) / 2);
}

export function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) * 0.5;
}

export function easeInQuad(value: number): number {
  return value * value;
}

export function easeOutQuad(value: number): number {
  return 1 - (1 - value) * (1 - value);
}

export function easeInOutQuad(value: number): number {
  return value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;
}

export function easeInBack(value: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * value ** 3 - c1 * value * value;
}

export function easeOutBack(value: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2;
}

export function easeInOutBack(value: number): number {
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  return value < 0.5
    ? ((2 * value) ** 2 * ((c2 + 1) * 2 * value - c2)) / 2
    : ((2 * value - 2) ** 2 * ((c2 + 1) * (value * 2 - 2) + c2) + 2) / 2;
}

export function easeOutElastic(value: number): number {
  const c4 = (2 * Math.PI) / 3;
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return 2 ** (-10 * value) * Math.sin((value * 10 - 0.75) * c4) + 1;
}

export function easeLinear(value: number): number {
  return value;
}

export function smoothTowards(current: number, target: number, speed: number, dt: number): number {
  const t = 1 - Math.exp(-Math.max(speed, 0) * dt);
  return current + (target - current) * t;
}

export function clampMagnitude(x: number, y: number, maxLength: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length <= maxLength || length <= 0.0001) {
    return { x, y };
  }

  const scale = maxLength / length;
  return { x: x * scale, y: y * scale };
}

export function hash01(value: number): number {
  const hashed = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return hashed - Math.floor(hashed);
}

export function wrapDegrees(degrees: number): number {
  degrees = degrees % 360;
  if (degrees > 180) {
    degrees -= 360;
  }
  if (degrees < -180) {
    degrees += 360;
  }
  return degrees;
}

export function smoothRotateTowards(
  current: number,
  target: number,
  speed: number,
  dt: number,
): number {
  const delta = wrapDegrees(target - current);
  const t = 1 - Math.exp(-Math.max(speed, 0) * dt);
  return wrapDegrees(current + delta * t);
}

export type FocusEaseName = "linear" | "out-cubic" | "out-sine" | "in-out-sine";
export type ClickRepulseEaseName =
  | "smoothstep"
  | "linear"
  | "in-sine"
  | "out-sine"
  | "in-out-sine"
  | "in-quad"
  | "out-quad"
  | "in-out-quad"
  | "in-cubic"
  | "out-cubic"
  | "in-out-cubic"
  | "in-back"
  | "out-back"
  | "in-out-back"
  | "out-elastic";

export function applyEase(ease: FocusEaseName | ClickRepulseEaseName, value: number): number {
  const clampedValue = clamp(value, 0, 1);

  switch (ease) {
    case "smoothstep":
      return smoothstep(clampedValue);
    case "linear":
      return easeLinear(clampedValue);
    case "in-sine":
      return easeInSine(clampedValue);
    case "out-sine":
      return easeOutSine(clampedValue);
    case "in-out-sine":
      return easeInOutSine(clampedValue);
    case "in-quad":
      return easeInQuad(clampedValue);
    case "out-quad":
      return easeOutQuad(clampedValue);
    case "in-out-quad":
      return easeInOutQuad(clampedValue);
    case "in-cubic":
      return easeInCubic(clampedValue);
    case "in-out-cubic":
      return easeInOutCubic(clampedValue);
    case "in-back":
      return easeInBack(clampedValue);
    case "out-back":
      return easeOutBack(clampedValue);
    case "in-out-back":
      return easeInOutBack(clampedValue);
    case "out-elastic":
      return easeOutElastic(clampedValue);
    case "out-cubic":
    default:
      return easeOutCubic(clampedValue);
  }
}

export function applyFocusEase(ease: FocusEaseName, value: number): number {
  return applyEase(ease, value);
}

export function applyClickRepulseEase(ease: ClickRepulseEaseName, value: number): number {
  return applyEase(ease, value);
}

/**
 * Linear interpolation between two colors (0xRRGGBB format)
 */
export function lerpColor(color1: number, color2: number, t: number): number {
  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;

  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return (r << 16) | (g << 8) | b;
}
