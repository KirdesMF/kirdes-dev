// FILE: src/lib/globe.ts
export type Vector3 = [number, number, number];
export type Quaternion = [number, number, number, number];

// Generate a sphere grid (Lat/Lon lines)
export function generateGraticule(step: number = 15): Vector3[][] {
  const lines: Vector3[][] = [];
  const R = 1;

  // Meridians (Longitude lines)
  for (let lon = 0; lon < 360; lon += step) {
    const line: Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 5) {
      const phi = (lat * Math.PI) / 180;
      const theta = (lon * Math.PI) / 180;
      const x = R * Math.cos(phi) * Math.cos(theta);
      const y = R * Math.cos(phi) * Math.sin(theta);
      const z = R * Math.sin(phi);
      line.push([x, z, y]);
    }
    lines.push(line);
  }

  // Parallels (Latitude lines)
  for (let lat = -80; lat <= 80; lat += step) {
    const line: Vector3[] = [];
    for (let lon = 0; lon <= 360; lon += 5) {
      const phi = (lat * Math.PI) / 180;
      const theta = (lon * Math.PI) / 180;
      const x = R * Math.cos(phi) * Math.cos(theta);
      const y = R * Math.cos(phi) * Math.sin(theta);
      const z = R * Math.sin(phi);
      line.push([x, z, y]);
    }
    lines.push(line);
  }

  return lines;
}

// Quaternion math
export function quatMultiply(a: Quaternion, b: Quaternion): Quaternion {
  const [w1, x1, y1, z1] = a;
  const [w2, x2, y2, z2] = b;
  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
  ];
}

export function rotateVector(v: Vector3, q: Quaternion): Vector3 {
  const [w, x, y, z] = q;
  const [vx, vy, vz] = v;

  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;

  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x
  ];
}

export function getDeltaQuaternion(v0: Vector3, v1: Vector3): Quaternion {
  const dot = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  const cross: Vector3 = [
    v0[1] * v1[2] - v0[2] * v1[1],
    v0[2] * v1[0] - v0[0] * v1[2],
    v0[0] * v1[1] - v0[1] * v1[0]
  ];

  const l = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
  if (l === 0) {
    return [1, 0, 0, 0];
  }

  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  const s = Math.sin(angle / 2);

  return [Math.cos(angle / 2), (cross[0] / l) * s, (cross[1] / l) * s, (cross[2] / l) * s];
}

export function getVersor(x: number, y: number, width: number, height: number): Vector3 {
  const r = width / 2;
  let x0 = (x - width / 2) / r;
  let y0 = (y - height / 2) / r;
  y0 = -y0;

  const d2 = x0 * x0 + y0 * y0;
  if (d2 > 1) {
    const s = 1 / Math.sqrt(d2);
    return [x0 * s, y0 * s, 0];
  }
  return [x0, y0, Math.sqrt(1 - d2)];
}

export function scaleQuaternionAngle(q: Quaternion, scale: number): Quaternion {
  const angle = 2 * Math.acos(q[0]);
  if (angle < 1e-6) {
    return q;
  }
  const newAngle = angle * scale;
  const s = Math.sin(newAngle / 2) / Math.sin(angle / 2);
  return [Math.cos(newAngle / 2), q[1] * s, q[2] * s, q[3] * s];
}

export function slerp(qa: Quaternion, qb: Quaternion, t: number): Quaternion {
  const [w1, x1, y1, z1] = qa;
  let [w2, x2, y2, z2] = qb;

  let cosHalfTheta = w1 * w2 + x1 * x2 + y1 * y2 + z1 * z2;

  if (cosHalfTheta < 0) {
    w2 = -w2;
    x2 = -x2;
    y2 = -y2;
    z2 = -z2;
    cosHalfTheta = -cosHalfTheta;
  }

  if (Math.abs(cosHalfTheta) >= 1.0) {
    return qa;
  }

  const halfTheta = Math.acos(cosHalfTheta);
  const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

  if (Math.abs(sinHalfTheta) < 0.001) {
    return [
      w1 * 0.5 + w2 * 0.5,
      x1 * 0.5 + x2 * 0.5,
      y1 * 0.5 + y2 * 0.5,
      z1 * 0.5 + z2 * 0.5
    ];
  }

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  return [
    w1 * ratioA + w2 * ratioB,
    x1 * ratioA + x2 * ratioB,
    y1 * ratioA + y2 * ratioB,
    z1 * ratioA + z2 * ratioB
  ];
}

/**
 * Compute SVG path for the graticule given geometry, orientation and viewport.
 */
export function computeGridPath(
  geometry: Vector3[][],
  q: Quaternion,
  width: number,
  height: number,
  padding: number = 10
): string {
  const radius = width / 2 - padding;
  const cx = width / 2;
  const cy = height / 2;

  let pathString = "";

  for (const line of geometry) {
    let isDrawing = false;

    for (const point of line) {
      const p = rotateVector(point, q);

      if (p[2] > 0) {
        const screenX = p[0] * radius + cx;
        const screenY = -p[1] * radius + cy;

        const x = screenX.toFixed(1);
        const y = screenY.toFixed(1);

        if (!isDrawing) {
          pathString += `M${x},${y}`;
          isDrawing = true;
        } else {
          pathString += `L${x},${y}`;
        }
      } else {
        isDrawing = false;
      }
    }
  }

  return pathString;
}
