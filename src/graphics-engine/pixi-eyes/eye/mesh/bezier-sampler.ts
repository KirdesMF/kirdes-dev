export type Point = { x: number; y: number };

export type BezierSegment = {
  start: Point;
  cp1: Point;
  cp2: Point;
  end: Point;
};

function cubicBezierPoint(seg: BezierSegment, t: number): Point {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: u3 * seg.start.x + 3 * u2 * t * seg.cp1.x + 3 * u * t2 * seg.cp2.x + t3 * seg.end.x,
    y: u3 * seg.start.y + 3 * u2 * t * seg.cp1.y + 3 * u * t2 * seg.cp2.y + t3 * seg.end.y,
  };
}

function segmentLengthEstimate(seg: BezierSegment): number {
  const p0 = seg.start;
  const p1 = seg.cp1;
  const p2 = seg.cp2;
  const p3 = seg.end;
  return (
    Math.hypot(p1.x - p0.x, p1.y - p0.y) +
    Math.hypot(p2.x - p1.x, p2.y - p1.y) +
    Math.hypot(p3.x - p2.x, p3.y - p2.y)
  );
}

export function sampleBezierSegment(seg: BezierSegment, segments: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    points.push(cubicBezierPoint(seg, i / segments));
  }
  return points;
}

export function sampleBezierSegments(
  curves: BezierSegment[],
  minSegments: number,
  maxSegments: number,
): Point[] {
  if (curves.length === 0) return [];

  const result: Point[] = [];

  for (let c = 0; c < curves.length; c++) {
    const curve = curves[c];
    const length = segmentLengthEstimate(curve);
    const t = Math.min(length / 60, 1);
    const segs = Math.round(minSegments + (maxSegments - minSegments) * t);
    const clampedSegs = Math.max(minSegments, Math.min(maxSegments, segs));
    const pts = sampleBezierSegment(curve, clampedSegs);

    if (c === 0) {
      result.push(...pts);
    } else {
      result.push(...pts.slice(1));
    }
  }

  return result;
}

export function sampleBezierToFlatArray(
  curves: BezierSegment[],
  minSegments: number,
  maxSegments: number,
): Float32Array {
  const pts = sampleBezierSegments(curves, minSegments, maxSegments);
  const arr = new Float32Array(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    arr[i * 2] = pts[i].x;
    arr[i * 2 + 1] = pts[i].y;
  }
  return arr;
}
