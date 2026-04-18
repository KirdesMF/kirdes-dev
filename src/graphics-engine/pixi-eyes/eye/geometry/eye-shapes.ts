import { SCLERA_RADIUS, IRIS_RADIUS, PUPIL_RADIUS, HIGHLIGHT_RADIUS } from "../eye-config";

export type CircleShape = {
  cx: number;
  cy: number;
  r: number;
};

export type BezierCurve = {
  start: { x: number; y: number };
  cp1: { x: number; y: number };
  cp2: { x: number; y: number };
  end: { x: number; y: number };
};

export type StaticShape = {
  type: "circle" | "bezier";
  shape: CircleShape | BezierCurve;
  fillColor: number;
  fillAlpha?: number;
};

export function buildScleraFill(): CircleShape {
  return { cx: 0, cy: 0, r: SCLERA_RADIUS };
}

export function buildScleraMask(): CircleShape {
  return { cx: 0, cy: 0, r: SCLERA_RADIUS };
}

export function buildScleraOutline(): CircleShape & { strokeWidth: number; strokeColor: number } {
  return { cx: 0, cy: 0, r: SCLERA_RADIUS, strokeWidth: 2, strokeColor: 0x2c241d };
}

export function buildIris(): CircleShape {
  return { cx: 0, cy: 0, r: IRIS_RADIUS };
}

export function buildRoundPupil(): CircleShape {
  return { cx: 0, cy: 0, r: PUPIL_RADIUS };
}

export function buildHighlight(): CircleShape {
  return { cx: 0, cy: 0, r: HIGHLIGHT_RADIUS };
}

export function buildIrisShadow(): BezierCurve {
  return {
    start: { x: -IRIS_RADIUS * 0.92, y: IRIS_RADIUS * 0.08 },
    cp1: { x: -IRIS_RADIUS * 0.42, y: IRIS_RADIUS * 0.8 },
    cp2: { x: IRIS_RADIUS * 0.56, y: IRIS_RADIUS * 0.9 },
    end: { x: IRIS_RADIUS * 0.98, y: IRIS_RADIUS * 0.12 },
  };
}

export function buildIrisShadowClose(): BezierCurve {
  return {
    start: { x: IRIS_RADIUS * 0.98, y: IRIS_RADIUS * 0.12 },
    cp1: { x: IRIS_RADIUS * 0.48, y: IRIS_RADIUS * 0.3 },
    cp2: { x: -IRIS_RADIUS * 0.2, y: IRIS_RADIUS * 0.34 },
    end: { x: -IRIS_RADIUS * 0.74, y: -IRIS_RADIUS * 0.04 },
  };
}

export function buildGlobeHighlight(): BezierCurve[] {
  return [
    {
      start: { x: 0.69, y: -7.64 },
      cp1: { x: 7.59, y: -7.64 },
      cp2: { x: 12.5, y: -2.21 },
      end: { x: 12.5, y: 0 },
    },
    {
      start: { x: 12.5, y: 0 },
      cp1: { x: 11.61, y: 2.78 },
      cp2: { x: 6.59, y: -1.55 },
      end: { x: -0.31, y: -1.55 },
    },
    {
      start: { x: -0.31, y: -1.55 },
      cp1: { x: -7.21, y: -1.55 },
      cp2: { x: -12.13, y: 2.65 },
      end: { x: -12.5, y: 0 },
    },
    {
      start: { x: -12.5, y: 0 },
      cp1: { x: -12.5, y: -2.21 },
      cp2: { x: -6.21, y: -7.64 },
      end: { x: 0.69, y: -7.64 },
    },
  ];
}

export function buildScleraShadow(): BezierCurve[] {
  const SHADOW_EDGE_OFFSET_DEGREES = 68;
  const SHADOW_TOP_CONTROL_X_FACTOR = 0.42;
  const SHADOW_TOP_CONTROL_Y = 0.9;
  const SHADOW_SIDE_CONTROL_X_FACTOR = 0.9;
  const SHADOW_RIGHT_CONTROL_Y = 0.82;
  const SHADOW_BOTTOM_CONTROL_X_FACTOR = 0.24;
  const SHADOW_BOTTOM_RIGHT_CONTROL_Y = 1;
  const SHADOW_BOTTOM_LEFT_CONTROL_Y = 1;

  const offset = (SHADOW_EDGE_OFFSET_DEGREES * Math.PI) / 180;
  const shadowLeft = { x: Math.sin(offset) * -1, y: Math.cos(offset) };
  const shadowRight = { x: Math.sin(offset) * 1, y: Math.cos(offset) };

  return [
    {
      start: { x: shadowLeft.x * SCLERA_RADIUS, y: shadowLeft.y * SCLERA_RADIUS },
      cp1: {
        x: shadowLeft.x * SHADOW_TOP_CONTROL_X_FACTOR * SCLERA_RADIUS,
        y: SHADOW_TOP_CONTROL_Y * SCLERA_RADIUS,
      },
      cp2: {
        x: shadowRight.x * SHADOW_TOP_CONTROL_X_FACTOR * SCLERA_RADIUS,
        y: SHADOW_TOP_CONTROL_Y * SCLERA_RADIUS,
      },
      end: { x: shadowRight.x * SCLERA_RADIUS, y: shadowRight.y * SCLERA_RADIUS },
    },
    {
      start: { x: shadowRight.x * SCLERA_RADIUS, y: shadowRight.y * SCLERA_RADIUS },
      cp1: {
        x: shadowRight.x * SHADOW_SIDE_CONTROL_X_FACTOR * SCLERA_RADIUS,
        y: SHADOW_RIGHT_CONTROL_Y * SCLERA_RADIUS,
      },
      cp2: {
        x: shadowRight.x * SHADOW_BOTTOM_CONTROL_X_FACTOR * SCLERA_RADIUS,
        y: SHADOW_BOTTOM_RIGHT_CONTROL_Y * SCLERA_RADIUS,
      },
      end: { x: 0, y: SCLERA_RADIUS },
    },
    {
      start: { x: 0, y: SCLERA_RADIUS },
      cp1: {
        x: shadowLeft.x * SHADOW_BOTTOM_CONTROL_X_FACTOR * SCLERA_RADIUS,
        y: SHADOW_BOTTOM_LEFT_CONTROL_Y * SCLERA_RADIUS,
      },
      cp2: {
        x: shadowLeft.x * SHADOW_SIDE_CONTROL_X_FACTOR * SCLERA_RADIUS,
        y: SHADOW_RIGHT_CONTROL_Y * SCLERA_RADIUS,
      },
      end: { x: shadowLeft.x * SCLERA_RADIUS, y: shadowLeft.y * SCLERA_RADIUS },
    },
  ];
}
