import type { LayoutShapeName, CrossType } from "../eye/eye-types";

function hash01(value: number): number {
  const hashed = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return hashed - Math.floor(hashed);
}

export function resolvePackedRadii(count: number, minRadius: number, maxRadius: number): number[] {
  const safeMinRadius = Math.max(Math.min(minRadius, maxRadius), 0);
  const safeMaxRadius = Math.max(Math.max(minRadius, maxRadius), 0);

  return Array.from({ length: count }, (_, index) => {
    const radiusMix = count <= 1 ? 0 : index / Math.max(count - 1, 1);
    return safeMinRadius + (safeMaxRadius - safeMinRadius) * radiusMix;
  });
}

function shapeBoundaryDistance(
  shape: LayoutShapeName,
  angle: number,
  extent: number,
  _ringInnerRatio: number = 0.5,
  crossType: CrossType = "x",
  starBranches: number = 5,
): number {
  const safeExtent = Math.max(extent, 0.001);
  if (shape === "circle") {
    return safeExtent;
  }

  if (shape === "ring") {
    // Ring uses same boundary as circle, but eyes near center are hidden in eye-field.ts
    return safeExtent;
  }

  if (shape === "heart") {
    // Heart shape: r = a * (1 - sin(angle)) * 0.7 for downward-pointing heart
    return safeExtent * (1 - Math.sin(angle)) * 0.7;
  }

  if (shape === "cross") {
    // Cross: X or + shape
    if (crossType === "plus") {
      // Vertical/horizontal cross
      const normalized = Math.abs(angle % (Math.PI / 2));
      const t = Math.min(normalized, Math.PI / 2 - normalized) / (Math.PI / 4);
      return safeExtent * (1 - t * 0.7);
    } else {
      // Diagonal cross (X)
      const normalized = Math.abs((angle - Math.PI / 4) % (Math.PI / 2));
      const t = Math.min(normalized, Math.PI / 2 - normalized) / (Math.PI / 4);
      return safeExtent * (1 - t * 0.7);
    }
  }

  if (shape === "star") {
    // Star with n branches
    const branches = Math.max(3, Math.min(starBranches, 12));
    const starFactor = Math.cos(angle * branches) * 0.5 + 0.5;
    return safeExtent * (0.35 + starFactor * 0.65);
  }

  // Default to circle
  return safeExtent;
}

export type PackedPosition = {
  x: number;
  y: number;
  r: number;
};

export function packEyePositions(
  radii: number[],
  clusterRadius: number,
  attempts: number,
  spiralStepDegrees: number,
  radialExponent: number,
  eyeSpiralOffset: number,
  shape: LayoutShapeName,
  jitter: number = 0, // 0 = perfect alignment, 1 = maximum organic disorder
  ringInnerRatio: number = 0.5,
  crossType: CrossType = "x",
  starBranches: number = 5,
): PackedPosition[] {
  const placed: PackedPosition[] = [];
  const safeClusterRadius = Math.max(clusterRadius, 0);
  const maxAttempts = Math.max(1, Math.min(Math.floor(attempts), 2048));
  const spiralStep = (spiralStepDegrees * Math.PI) / 180;
  const safeRadialExponent = Math.max(radialExponent, 0.01);
  const jitterAmount = Math.max(0, Math.min(jitter, 1)); // Clamp 0-1

  for (let i = 0; i < radii.length; i += 1) {
    const radius = radii[i];
    let bestX = 0;
    let bestY = 0;
    let bestClearance = Number.NEGATIVE_INFINITY;
    let placedWithoutOverlap = false;

    for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
      const t = attempt / maxAttempts;
      const angle = (i + 1) * eyeSpiralOffset + attempt * spiralStep;
      const boundaryDistance = shapeBoundaryDistance(
        shape,
        angle,
        safeClusterRadius,
        ringInnerRatio,
        crossType,
        starBranches,
      );
      const maxDistance = Math.max(0, boundaryDistance - radius);
      const distance = maxDistance * t ** safeRadialExponent;

      // Apply stronger deterministic jitter for a more visibly organic placement.
      // Blend a per-eye bias with a per-attempt wobble so dense layouts still show variation.
      const eyeJitterAngle = (hash01(i * 7.31) - 0.5) * jitterAmount * 0.75;
      const attemptJitterAngle =
        (hash01(i * 31.17 + attempt * 0.73) - 0.5) * jitterAmount * 0.45;
      const eyeJitterDistance = (hash01(i * 13.7 + 5) - 0.5) * jitterAmount * 0.45;
      const attemptJitterDistance =
        (hash01(i * 19.41 + attempt * 1.11 + 9) - 0.5) * jitterAmount * 0.35;

      const finalAngle = angle + eyeJitterAngle + attemptJitterAngle;
      const finalDistance = distance * (1 + eyeJitterDistance + attemptJitterDistance);

      const candidateX = Math.cos(finalAngle) * finalDistance;
      const candidateY = Math.sin(finalAngle) * finalDistance;

      let clearance = maxDistance - distance;
      let overlaps = false;

      for (const placedCircle of placed) {
        const dx = candidateX - placedCircle.x;
        const dy = candidateY - placedCircle.y;
        const gap = Math.hypot(dx, dy) - (radius + placedCircle.r);

        if (gap < 0) {
          overlaps = true;
        }

        if (gap < clearance) {
          clearance = gap;
        }
      }

      if (!overlaps) {
        placed.push({ x: candidateX, y: candidateY, r: radius });
        placedWithoutOverlap = true;
        break;
      }

      if (clearance > bestClearance) {
        bestClearance = clearance;
        bestX = candidateX;
        bestY = candidateY;
      }
    }

    // If no valid position found, use best attempt OR spiral fallback
    if (!placedWithoutOverlap) {
      if (bestClearance > Number.NEGATIVE_INFINITY) {
        placed.push({ x: bestX, y: bestY, r: radius });
      } else {
        // Fallback: place on spiral anyway
        const angle = (i + 1) * eyeSpiralOffset;
        const boundaryDistance = shapeBoundaryDistance(shape, angle, safeClusterRadius);
        const distance =
          Math.max(0, boundaryDistance - radius) * (i / radii.length) ** safeRadialExponent;
        placed.push({
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          r: radius,
        });
      }
    }
  }

  return placed;
}

export function resolveEyeType(index: number, count: number, catMix: number): "cat" | "round" {
  return hash01(index * 2.187 + count * 0.713) < Math.max(0, Math.min(catMix, 1)) ? "cat" : "round";
}

export function staggerDelay(
  index: number,
  count: number,
  staggerSeconds: number,
  randomize: boolean,
): number {
  const step = Math.max(staggerSeconds, 0);
  if (randomize) {
    return hash01(index * 1.61803398875) * step * Math.max(count - 1, 0);
  }

  return (index - 1) * step;
}
