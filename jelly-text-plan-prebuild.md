# Jelly Text WebGL Plan — `PORTFOLIO` in a Resizable Box (With Prebuild Step)

This document describes a technical plan for implementing a physically-deformed “jelly text” word **PORTFOLIO** inside a resizable box, in an **Astro** app, with **TypeScript** and **raw WebGL**.

The plan is updated to **separate what happens at prebuild time** (offline script) from what happens **at runtime** in the browser, to keep the runtime as light as possible and prepare future WASM migration.

---

## 1. High-Level Overview

### Goal

- Render the word **PORTFOLIO** inside a **box**.
- The box size is:
  - animated (programmatic resize),
  - and directly resizable by the user (drag handles).
- The word behaves like a **soft body**:
  - branches twist,
  - letters bend and wobble,
  - the word reacts physically to box deformation.

### Core Ideas

1. **Vector Source (Design-time)**  
   - Word “PORTFOLIO” exported as outlines from Illustrator → SVG.
   - Only the basic outlines are needed. No need to add extra anchor points manually.

2. **Prebuild Processing (Node script)**  
   - A Node/TS script runs **before build** (e.g. via `npm run jelly:build`).
   - It:
     - loads the SVG,
     - parses paths and subpaths,
     - detects outer contours vs inner holes,
     - samples contours into discrete points,
     - normalizes coordinates,
     - builds topology information (contours, per-letter mapping),
     - optionally precomputes initial spring connections.
   - The result is serialized into a **static JSON (or binary) asset** consumed at runtime.

3. **Runtime Physics (Browser)**  
   - Loads prebuilt geometry/topology data.
   - Initializes a **mass–spring physics engine** using typed arrays.
   - Applies soft constraints tying each point to its desired position inside the current box.

4. **Box-Driven Deformation**  
   - Each point has a **reference position** in normalized box space `(u, v)` ∈ [0, 1]².
   - Box resize updates the **target position** for each point:
     - `x_target = box.x + u * box.width`
     - `y_target = box.y + v * box.height`
   - Physics step:
     - internal springs + box constraints + damping → new positions.

5. **Rendering (WebGL)**  
   - Raw WebGL context (no Pixi/Three).
   - Typed arrays + a simple shader to draw:
     - either line strips (wireframe),
     - or a filled triangulated mesh (if you extend prebuild to triangulate).

6. **Performance & Future WASM**  
   - Heavy, one-off work (SVG parsing, contour classification, sampling) is done at prebuild.
   - Runtime uses **ready-to-use data** (typed arrays filled from JSON or precomputed values).
   - Physics is initially TypeScript; its API is designed for a drop-in **WASM** replacement later.

---

## 2. Folder & File Structure (Astro + Prebuild)

Inside your Astro project:

```text
scripts/
  build-jelly-geometry.ts   # Node/TS prebuild script

public/
  jelly-text/
    portfolio-geometry.json # Output of prebuild (geometry + topology)

src/
  components/
    jelly-text/
      JellyText.astro          # Canvas html + script for creating the scene
      scene.ts                 # JellyTextScene class (orchestrates runtime)
      config.ts                # Tunable parameters (springs, damping, etc.)

      types/
        geometry.ts            # Geometry/topology types (runtime view of JSON)
        physics.ts             # Physics-related runtime types
        scene.ts               # Scene-level types (box, options)

      runtime-geometry/
        loadGeometry.ts        # Load + map JSON -> runtime structures

      physics/
        engine.ts              # PhysicsEngine (TS) using typed arrays
        integrator.ts          # Integration functions
        constraints.ts         # Springs + box constraints application

      rendering/
        glContext.ts           # WebGL context init + resize
        buffers.ts             # VBO/IBO setup and update
        shaders.ts             # Shader creation/linking
        renderer.ts            # High-level draw call for the jelly word

      input/
        boxControls.ts         # Handle user resize interactions on the box
```

Optional: if you later introduce triangulation at prebuild, add a `mesh` section to the JSON and corresponding types.

---

## 3. Division Prebuild vs Runtime

### 3.1 Prebuild Responsibilities (Node script)

Run once, offline or as part of `npm run build`:

- Input: **SVG file** exported from Illustrator containing the word “PORTFOLIO”.
- Steps:
  1. Parse SVG and extract per-letter path data.
  2. Decompose each `<path>` into **contours** (subpaths `M ... Z`).
  3. For each contour:
     - compute signed area,
     - determine winding order.
  4. Determine **outer contour vs holes**:
     - outer = contour with largest area (per letter),
     - holes = contours with opposite winding and bounding-box inclusion.
  5. Sample each contour into discrete points:
     - e.g. fixed count per contour, or adaptive based on length.
  6. Compute global bounding box and **normalize** coordinates:
     - `nx = (x - minX) / (maxX - minX)`
     - `ny = (y - minY) / (maxY - minY)`
  7. For each sampled point:
     - store normalized `(nx, ny)` as both:
       - initial position in logical space,
       - reference `(u, v)` in box space.
  8. Build **topology**:
     - `pointIndices` per letter,
     - `contourIndices` per letter (outer + holes),
     - connectivity of points along contours (for springs).
  9. (Optionally) precompute:
     - rest lengths for contour springs,
     - indices for initial springs,
     - groupings useful for box constraints (e.g. edge rows).

- Output: a `portfolio-geometry.json` file containing everything needed at runtime.

### 3.2 Runtime Responsibilities (Browser)

- Load `portfolio-geometry.json`.
- Convert it into typed arrays for physics and rendering.
- Maintain:
  - current box state,
  - physics simulation,
  - WebGL drawing.

---

## 4. Prebuild Script Design (`scripts/build-jelly-geometry.ts`)

### 4.1 Input/Output Interfaces

**Input**:
- Path to SVG file (e.g. `assets/jelly-text/portfolio.svg`).

**Output JSON** (simplified shape):

```ts
export type PrebuiltPoint = {
  x: number;           // normalized x in [0, 1]
  y: number;           // normalized y in [0, 1]
  letterIndex: number;
  contourIndex: number;
  contourPosition: number; // 0..1 along contour
};

export type PrebuiltLetter = {
  pointIndices: number[];      // indices into global points
  contours: number[][];        // arrays of indices (outer + holes)
};

export type PrebuiltGeometry = {
  points: PrebuiltPoint[];
  letters: PrebuiltLetter[];
};
```

You can extend this with:

```ts
export type PrebuiltSpring = {
  a: number;
  b: number;
  restLength: number;
};

export type PrebuiltPhysics = {
  springs: PrebuiltSpring[];
};
```

Final JSON:

```ts
export type PrebuiltJellyData = {
  geometry: PrebuiltGeometry;
  physics: PrebuiltPhysics;
};
```

The script writes:

```text
public/jelly-text/portfolio-geometry.json
```

### 4.2 Steps in the Script

1. **Load and parse SVG**  
   - Use a Node XML parser.
   - Find the `<path>` elements corresponding to “PORTFOLIO”.

2. **Extract path commands per letter**  
   - Either:
     - one path per letter, or
     - one compound path that you split by subpaths.

3. **Contours & outer/inner classification**  
   - For each letter:
     - break into contours (subpaths).
     - compute signed area and bounding boxes.
     - determine which contour is outer vs hole.

4. **Sampling**  
   - For each contour:
     - approximate its length,
     - sample N points along the contour (e.g. using a path library or your own Bézier sampler),
     - record raw `(x, y)`.

5. **Normalization**  
   - Compute global `minX, maxX, minY, maxY` over all points.
   - Normalize all points to `[0, 1]²`.
   - Save normalized coords in `PrebuiltPoint`.

6. **Topology**  
   - For each letter:
     - `pointIndices` = all point indices in this letter.
     - `contours` = arrays of point indices per contour (outer + holes).
   - For each contour:
     - add springs between successive points `(i, i+1)` and `(last, first)`.
   - Optionally create cross-links between outer and inner contours (for holes).

7. **Serialize**  
   - Serialize `PrebuiltJellyData` to JSON.
   - Write to `public/jelly-text/portfolio-geometry.json`.

---

## 5. Runtime Geometry Loader

`src/components/jelly-text/runtime-geometry/loadGeometry.ts`:

Responsibilities:

- Fetch or import `portfolio-geometry.json`.
- Map it into runtime types and typed arrays.

### 5.1 Runtime Types

`types/geometry.ts` (runtime view):

```ts
export type RuntimePoint = {
  refU: number;
  refV: number;
  letterIndex: number;
  contourIndex: number;
  contourPosition: number;
};

export type RuntimeLetter = {
  pointIndices: number[];
  contourIndices: number[][];
};

export type RuntimeGeometry = {
  points: RuntimePoint[];
  letters: RuntimeLetter[];
};
```

### 5.2 Loader API

```ts
import type { RuntimeGeometry } from "../types/geometry";
import type { PrebuiltJellyData } from "../../../scripts/types"; // or local copy

export async function loadRuntimeGeometry(): Promise<RuntimeGeometry> {
  const response = await fetch("/jelly-text/portfolio-geometry.json");
  const data = (await response.json()) as PrebuiltJellyData;

  // Map PrebuiltGeometry → RuntimeGeometry
  // (norm coords become refU/refV, etc.)
  return {
    points: data.geometry.points.map((p) => ({
      refU: p.x,
      refV: p.y,
      letterIndex: p.letterIndex,
      contourIndex: p.contourIndex,
      contourPosition: p.contourPosition
    })),
    letters: data.geometry.letters.map((letter) => ({
      pointIndices: letter.pointIndices,
      contourIndices: letter.contours
    }))
  };
}
```

---

## 6. Physics Engine (Runtime, TS)

### 6.1 Memory Layout

`physics/engine.ts` uses typed arrays, but it does **not** know about SVG or contours directly; it just receives positions, springs, and references.

```ts
export type PhysicsState = {
  positions: Float32Array;          // [x0, y0, x1, y1, ...]
  previousPositions: Float32Array;  // Verlet
  masses: Float32Array;             // [m0, m1, ...]
};

export type SpringState = {
  indices: Uint16Array;             // [a0, b0, a1, b1, ...]
  restLengths: Float32Array;
  stiffness: Float32Array;
  damping: Float32Array;
};

export type BoxConstraintsState = {
  pointIndices: Uint16Array;
  stiffness: Float32Array;
  damping: Float32Array;
};

export type PhysicsEngineState = {
  points: PhysicsState;
  springs: SpringState;
  boxConstraints: BoxConstraintsState;
  refUV: Float32Array; // [u0, v0, u1, v1, ...]
};
```

A helper function `buildPhysicsStateFromPrebuilt` convert `PrebuiltJellyData` → `PhysicsEngineState`:

- fill `positions` with the normalized coords `(x, y)`,
- copy `refUV` from `(x, y)`,
- create `indices` & `restLengths` for springs from prebuilt connections,
- assign masses and stiffness/damping from `config.ts`.

### 6.2 PhysicsEngine API

Same as before, just explicitly fed by prebuilt data:

```ts
import type { JellyBox } from "../types/scene";

export type PhysicsConfig = {
  globalDamping: number;
  iterations: number;
};

export type PhysicsEngineInitParams = {
  state: PhysicsEngineState;
  config: PhysicsConfig;
};

export type PhysicsStepParams = {
  box: JellyBox;
  deltaTime: number;
};

export type PhysicsEngine = {
  init(params: PhysicsEngineInitParams): void;
  step(params: PhysicsStepParams): void;
  getPositions(): Float32Array;
};
```

---

## 7. WebGL Rendering (Runtime)

No change conceptually vs le plan précédent, la différence étant que :

- vertices sont construits à partir de `PhysicsEngineState.positions` (qui vient de prebuild),
- si tu ajoutes un mesh triangulé côté prebuild, tu n’auras qu’à stocker les indices de triangles dans le JSON, puis les charger en `Uint16Array` à runtime.

`rendering/renderer.ts` reste responsable de :

- `init(params: { canvas, pointCount, ... })`,
- `resize(width, height)`,
- `updatePositions(positions)`,
- `render()`.

---

## 8. Scene Orchestration (`JellyTextScene`)

`scene.ts` (runtime only) évolue légèrement pour inclure le chargement de la géométrie prébuildée :

```ts
export class JellyTextScene {
  #canvas: HTMLCanvasElement;
  #box: JellyBox;
  #physics: PhysicsEngine | null;
  #renderer: JellyRenderer | null;
  #lastTime: number | null;

  constructor(options: JellySceneOptions) {
    this.#canvas = options.canvas;
    this.#box = options.initialBox;
    this.#lastTime = null;
    this.#physics = null;
    this.#renderer = null;
  }

  async init(): Promise<void> {
    // 1. Load prebuilt geometry
    const runtimeGeometry = await loadRuntimeGeometry();

    // 2. Build physics state (typed arrays) from geometry
    const physicsState = buildPhysicsStateFromPrebuilt(runtimeGeometry);

    // 3. Create physics engine
    this.#physics = createPhysicsEngine({
      state: physicsState,
      config: { globalDamping: 0.98, iterations: 4 }
    });

    // 4. Create renderer
    this.#renderer = createJellyRenderer({
      canvas: this.#canvas,
      pointCount: physicsState.points.positions.length / 2
    });

    // 5. Start loop
    this.#startLoop();
  }

  setBox(box: JellyBox): void {
    this.#box = box;
  }

  #startLoop(): void {
    const loop = (timestamp: number) => {
      if (this.#lastTime === null) {
        this.#lastTime = timestamp;
      }
      const deltaMs = timestamp - this.#lastTime;
      this.#lastTime = timestamp;

      const deltaTime = deltaMs / 1000;

      if (this.#physics === null || this.#renderer === null) {
        window.requestAnimationFrame(loop);
        return;
      }

      // Update physics
      this.#physics.step({
        box: this.#box,
        deltaTime
      });

      // Render
      const positions = this.#physics.getPositions();
      this.#renderer.updatePositions(positions);
      this.#renderer.render();

      window.requestAnimationFrame(loop);
    };

    window.requestAnimationFrame(loop);
  }
}
```

---

## 9. Astro Component (`JellyText.astro`)

Pas de changement majeur, si ce n’est que la scène charge maintenant des données prébuildées au lieu de parser du SVG au runtime.

```astro
---
import { onMount } from "astro/client";
import { JellyTextScene } from "./scene";
---

<canvas id="jelly-canvas"></canvas>

<script>
  import { JellyTextScene } from "./scene";

  window.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("jelly-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;

    const scene = new JellyTextScene({
      canvas,
      initialBox: {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      }
    });

    scene.init().catch((error) => {
      console.error("Failed to init jelly scene", error);
    });
  });
</script>

<style>
  canvas#jelly-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
```

---

## 10. Future: WASM Migration

Grâce à cette séparation :

- Toute la logique lourde de **préparation géométrique** est déjà en **Node script** (pas dans le navigateur).
- Le runtime se contente de:
  - charger des données prépackagées,
  - exécuter la physique dans des typed arrays,
  - dessiner via WebGL.

Pour passer à WASM :

1. Tu gardes `build-jelly-geometry.ts` tel quel (ou quasi).
2. Tu réimplémentes uniquement `PhysicsEngine` (init/step) en WASM.
3. Optionnel : tu mets le WASM dans un Web Worker, partage les positions via `SharedArrayBuffer`.

Cette architecture reste stable, le reste du code (Astro, scène, rendu) évolue peu.

---

## 11. Summary

- **Prebuild (Node)**:
  - parse SVG,
  - détecte outer/holes,
  - sample contours,
  - normalise,
  - construit topologie + springs,
  - sauvegarde en JSON (`portfolio-geometry.json`).

- **Runtime (Browser)**:
  - charge JSON,
  - construit les typed arrays pour la physique,
  - anime le mot “PORTFOLIO” dans une box resizable,
  - affiche le résultat en WebGL.

Tout ce qui est complexe et coûteux (parsing, classification, sampling) est déplacé hors du runtime, ce qui simplifie le code client et prépare un futur moteur physique WASM sans refaire toute la pipeline.
