export type Point = { x: number; y: number };

function cross2d(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function polygonArea(contour: Point[]): number {
  let area = 0;
  const n = contour.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += contour[i].x * contour[j].y;
    area -= contour[j].x * contour[i].y;
  }
  return area * 0.5;
}

function isEar(contour: Point[], a: number, b: number, c: number, remaining: Set<number>): boolean {
  const pa = contour[a];
  const pb = contour[b];
  const pc = contour[c];
  const cross = cross2d(pa, pb, pc);
  if (cross <= 0) return false;

  for (const p of remaining) {
    if (p === a || p === b || p === c) continue;
    const pp = contour[p];
    if (pointInTriangle(pp, pa, pb, pc)) return false;
  }
  return true;
}

function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = cross2d(p, a, b);
  const d2 = cross2d(p, b, c);
  const d3 = cross2d(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export function triangulateFan(contour: Point[]): Uint32Array {
  if (contour.length < 3) return new Uint32Array(0);

  const indices: number[] = [];
  for (let i = 0; i < contour.length; i++) {
    const next = (i + 1) % contour.length;
    indices.push(contour.length, i, next);
  }

  const result = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    result[i] = indices[i];
  }
  return result;
}

export function triangulateEarClip(contour: Point[]): { indices: Uint32Array; contour: Point[] } {
  const n = contour.length;
  if (n < 3) return { indices: new Uint32Array(0), contour };

  const ccw = polygonArea(contour) > 0;
  if (!ccw) {
    contour = [...contour].reverse();
  }

  const indices: number[] = [];
  const remaining = new Set<number>(Array.from({ length: contour.length }, (_, i) => i));

  let safety = 0;
  while (remaining.size > 3 && safety < contour.length * contour.length) {
    safety++;
    let found = false;

    const verts = Array.from(remaining);
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const c = verts[(i + 2) % verts.length];

      if (isEar(contour, a, b, c, remaining)) {
        indices.push(a, b, c);
        remaining.delete(b);
        found = true;
        break;
      }
    }

    if (!found) break;
  }

  if (remaining.size === 3) {
    const verts = Array.from(remaining);
    indices.push(verts[0], verts[1], verts[2]);
  }

  return { indices: new Uint32Array(indices), contour };
}

export function buildFanVerticesWithCenter(contour: Point[]): {
  positions: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
} {
  const n = contour.length;
  const totalVerts = n + 1;

  const positions = new Float32Array(totalVerts * 2);
  positions[0] = 0;
  positions[1] = 0;

  for (let i = 0; i < n; i++) {
    positions[(i + 1) * 2] = contour[i].x;
    positions[(i + 1) * 2 + 1] = contour[i].y;
  }

  const indices = new Uint32Array(n * 3);
  for (let i = 0; i < n; i++) {
    indices[i * 3] = 0;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = ((i + 1) % n) + 1;
  }

  return { positions, indices, vertexCount: totalVerts };
}
