// Circle clipping utility for geometric mask replacement (Phase 11)

export type Point = { x: number; y: number };

/**
 * Clips a point to be within a circle.
 * If the point is outside the circle, it's projected to the boundary.
 * @param point - The point to clip
 * @param centerX - Circle center X
 * @param centerY - Circle center Y
 * @param radius - Circle radius
 * @returns The clipped point (same reference if inside, new if clipped)
 */
export function clipPointToCircle(
  point: Point,
  centerX: number,
  centerY: number,
  radius: number,
): Point {
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const distSq = dx * dx + dy * dy;
  const radiusSq = radius * radius;

  // Point is inside, return as-is
  if (distSq <= radiusSq) {
    return point;
  }

  // Point is outside, project to boundary
  const dist = Math.sqrt(distSq);
  const scale = radius / dist;

  return {
    x: centerX + dx * scale,
    y: centerY + dy * scale,
  };
}

/**
 * Clips an array of points to be within a circle.
 * @param points - Array of points to clip
 * @param centerX - Circle center X
 * @param centerY - Circle center Y
 * @param radius - Circle radius
 * @returns New array with clipped points
 */
export function clipPointsToCircle(
  points: Point[],
  centerX: number,
  centerY: number,
  radius: number,
): Point[] {
  const clipped: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    clipped.push(clipPointToCircle(points[i], centerX, centerY, radius));
  }

  return clipped;
}

/**
 * Clips a point to be within an ellipse.
 * @param point - The point to clip
 * @param centerX - Ellipse center X
 * @param centerY - Ellipse center Y
 * @param radiusX - Ellipse radius X
 * @param radiusY - Ellipse radius Y
 * @returns The clipped point
 */
export function clipPointToEllipse(
  point: Point,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): Point {
  const dx = point.x - centerX;
  const dy = point.y - centerY;

  // Normalize to unit circle
  const nx = dx / radiusX;
  const ny = dy / radiusY;
  const distSq = nx * nx + ny * ny;

  // Point is inside, return as-is
  if (distSq <= 1) {
    return point;
  }

  // Point is outside, project to boundary
  const dist = Math.sqrt(distSq);
  const scale = 1 / dist;

  return {
    x: centerX + nx * scale * radiusX,
    y: centerY + ny * scale * radiusY,
  };
}
