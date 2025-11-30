# WaveText WebGL2 – Implementation Plan

## 1. Goals & Constraints

- WebGL2-only implementation (no Three.js).
- Sin wave running horizontally across the canvas.
- Text deformed along the wave, sitting above the line only (no mirror / shadow).
- Two MSDF-based sparkles that follow the same deformation.
- Lens following the mouse:
  - Outside lens: normal filled text and solid wave line.
  - Inside lens: text outlined + hatched fill; wave line rendered dashed.
  - Later: zoomed text inside lens.
- Colors driven by CSS custom properties:
  - `--color-background`
  - `--color-foreground`
- Astro app with Tailwind v4.
- Code in TypeScript, classes for animation primitives, strongly typed.

## 2. File & Module Structure

Create a dedicated folder for the feature:

- `src/components/wave-text/WaveText.astro`
  - Owns the `<canvas>`.
  - Mounts the scene on client (`client:load`).
  - Hooks mouse & resize events.
  - Emits/receives custom events for config & theme changes (optional).

- `src/components/wave-text/scene.ts`
  - `Scene` class:
    - Owns WebGL2 context, programs, buffers, global state.
    - Manages resize and devicePixelRatio.
    - Holds references to `WaveLine`, `WaveText`, `WaveSparkles`, `Lens`.
    - Main render loop (requestAnimationFrame).
    - Public API for:
      - `setParams({ amplitude, frequency, speed })`
      - `setText(text: string)`
      - `setThemeColors({ foreground, background })`
      - `setLensState({ x, y, radius })`
      - `destroy()`.

- `src/components/wave-text/line.ts`
  - `WaveLine` class:
    - Creates line geometry for sin wave.
    - Maintains uniforms:
      - `u_time`
      - `u_amplitude`
      - `u_frequency`
      - `u_speed`
      - `u_color` (vec3 from CSS foreground).
      - `u_lensCenter`, `u_lensRadius` for future dashed-in-lens behavior.
    - Public methods:
      - `resize(width, height)`
      - `update(dt, params)`
      - `draw()`

- `src/components/wave-text/text.ts` (later step)
  - `WaveText` class using MSDF font:
    - Manages glyph layout.
    - Generates quads for characters.
    - Applies deformation to follow sin wave.
    - Shares wave parameters with `WaveLine`.

- `src/components/wave-text/sparkles.ts` (later step)
  - `WaveSparkles` class:
    - Two sparkles moving with the text baseline on the wave.
    - Uses MSDF sparkle atlas.

- `src/components/wave-text/lens.ts` (later step)
  - `Lens` class:
    - Stores lens position & radius.
    - Provides uniforms to other primitives.
    - Optionally manages a separate framebuffer if needed for zoom effect.

- `src/components/wave-text/types.ts`
  - Shared types:
    - `type WaveParams = { amplitude: number; frequency: number; speed: number };`
    - `type ThemeColors = { foreground: [number, number, number]; background: [number, number, number]; };`
    - `type LensState = { x: number; y: number; radius: number };`
    - `type MsdfFontMeta = { ... }` (matching your MSDF JSON).

- `src/components/wave-text/utils/color.ts`
  - Helpers to read CSS variables and convert to WebGL `vec3`:
    - `getCssVarValue(name: string): string`
    - `parseOklch(value: string): { l: number; c: number; h: number }`
    - `oklchToSRGB(l, c, h): { r: number; g: number; b: number }`
    - `getForegroundColor(): [number, number, number]`
    - `getBackgroundColor(): [number, number, number]`

- `src/components/wave-text/utils/events.ts`
  - Custom events contracts:
    - `type WaveConfigEventDetail = WaveParams`
    - `type WaveTextEventDetail = { text: string }`
    - `type WaveThemeEventDetail = { foreground: string; background: string }`
  - Functions to dispatch/listen:
    - `dispatchWaveConfigEvent(target: EventTarget, detail: WaveConfigEventDetail)`
    - `addWaveConfigListener(target: EventTarget, handler: (detail: WaveConfigEventDetail) => void)`
    - Similar for text & theme.

## 3. Assets Strategy (MSDF font & sparkles)

### 3.1. Location

Preferred approach:

- Store MSDF assets under `src/assets/msdf`:
  - `src/assets/msdf/wave-font.png`
  - `src/assets/msdf/wave-font.json`
  - `src/assets/msdf/sparkle.png`
- Import them from TS:
  - `import fontAtlasUrl from '~/assets/msdf/wave-font.png';`
  - `import fontMeta from '~/assets/msdf/wave-font.json';`
- Rationale:
  - Typed imports for JSON.
  - Easy refactors and bundler-managed hashing of asset URLs.
  - No manual `fetch` paths; the bundler produces the final URLs.

Alternative (if you want runtime-replaceable assets):

- Put PNG/JSON under `public/msdf/` and load via `fetch` and `Image`.
- Slightly more manual but decouples WebGL code from bundler.

This plan assumes we start with `src/assets/msdf` and module imports.

### 3.2. Sparkles as MSDF

- Since you already have an MSDF sparkle texture, we will:
  - Treat sparkles like single-glyph MSDF quads.
  - Either:
    - Share the same MSDF fragment shader as text (same distance field logic, different UVs).
    - Or use a lighter variant of the shader if you want a simpler look.
- This replaces the old “draw from canvas snapshot” approach:
  - Better quality on scaling/zoom.
  - Consistent look between text and sparkles.
  - Simpler pipeline (all SDF-based visuals use the same code path).

## 4. Theme & Color Handling

### 4.1. Reading CSS variables

- Use `getComputedStyle(document.documentElement)` to read:
  - `--color-foreground`
  - `--color-background`
- Values are declared as `oklch(...)`, so we need:
  - A parser for the `oklch(L C h)` syntax.
  - A conversion from Oklch to sRGB.
- Once converted, we normalize to `[0, 1]` floats for WebGL uniforms.

### 4.2. Reacting to theme changes

Options:

1. **Custom event (recommended)**:
   - When the theme toggles, your theme switcher dispatches:
     - `new CustomEvent('wave:theme', { detail: { foreground: 'oklch(...)', background: 'oklch(...)' } })`
   - The `Scene` listens to this event on `window` or `document`, then:
     - Converts the colors.
     - Updates uniforms in `WaveLine`, `WaveText`, `WaveSparkles`.

2. **MutationObserver on `document.documentElement`**:
   - Observe class changes (`:root` vs `:root.dark`).
   - On change, re-read CSS variables, re-compute colors.
   - No explicit integration with the theme toggle code required.

The plan will assume **custom events** for explicit control, but utilities will also support a “pull” mode (just reading current values).

## 5. Animation Parameters & External Controls

We want amplitude, frequency, and speed to be editable by a UI box and by GSAP.

### 5.1. Internal state

- `Scene` maintains a `WaveParams` object:
  - Example default:
    - `amplitude: 40`
    - `frequency: 1.2`
    - `speed: 0.4`
- `WaveLine`, `WaveText`, and `WaveSparkles` read from this shared state each frame.

### 5.2. External config API

Two entry points:

1. **Custom events:**
   - UI component dispatches:
     - `new CustomEvent('wave:config', { detail: { amplitude, frequency, speed } })`
   - `Scene` listens, updates internal `WaveParams`.

2. **Direct method calls:**
   - If UI and WaveText are in the same island, you can hold a reference to `Scene` and call:
     - `scene.setParams({ amplitude, frequency, speed })`.

The plan assumes custom events first, direct calls as a secondary option.

### 5.3. GSAP integration

- GSAP can tween the same `WaveParams` object:
  - `gsap.to(waveParams, { amplitude: 80, duration: 1, onUpdate: () => scene.markParamsDirty() })`
- `Scene` exposes a small hook for GSAP:
  - `getWaveParamsRef()` or direct use of `scene.waveParams` if you decide to expose it.
- No GSAP integration in the core classes themselves; they just consume params.

## 6. Lens Behavior

We separate “tracking the mouse” from “visual style in the lens”.

### 6.1. Input

- `WaveText.astro` listens to pointer events on the canvas:
  - `pointermove` → compute canvas-local coordinates.
  - Normalize to [0, 1] or directly to clip space.
- The lens radius is derived from CSS (`--lens-radius`) or passed as a prop.
- The component forwards this to the `Scene`:
  - Via direct call: `scene.setLensState({ x, y, radius })`.

### 6.2. Uniforms

- Common uniforms:
  - `u_lensCenter` in clip space.
  - `u_lensRadius` in clip space units.
- Each primitive (line, text, sparkles) can branch in the fragment shader:
  - Inside lens: use outlined/hatched variants.
  - Outside lens: regular fill.

### 6.3. Dashed line in lens

Two possible strategies (we can pick one later):

1. **Single pass, fragment-based dashes:**
   - Use UV along line (`v_t` from 0..1) and compute:
     - `float dash = step(0.5, fract(v_t * dashCount));`
   - Mix dashed style only when within lens radius.

2. **Two-pass:**
   - Base line rendered solid.
   - Second pass writes only where inside lens and uses dashed pattern.
   - Slightly more complex, but gives full control.

Plan will start with a simple “style toggle” in the lens and iterate to full dashes later.

## 7. Step-by-Step Roadmap

We will implement in the following order:

### Step 1 – Base scene & responsive canvas

- Implement `WaveText.astro` with:
  - `<canvas>` element.
  - `client:load` script that:
    - Instantiates `Scene` with the canvas element.
    - Sets up resize handling (ResizeObserver).
    - Sets up basic pointermove → lens state wiring (even if unused at first).
    - Tears down scene on unmount.
- Implement `Scene` with:
  - WebGL2 context initialization.
  - Clear color from CSS background.
  - Viewport updates on resize & dpr change.
  - RAF loop: `update(dt)` then `draw()`.

### Step 2 – Sin wave line only

- Implement `WaveLine`:
  - Create a strip of vertices along X with a param `t` ∈ [0, 1].
  - Vertex shader:
    - Compute Y via `sin(t * frequency + time * speed) * amplitude`.
    - Map to clip space using canvas width/height.
  - Fragment shader:
    - Solid color from `u_color` uniform (foreground).
  - Hook into `Scene`:
    - `scene.update(dt)` updates `time`.
    - `scene.draw()` calls `waveLine.draw()`.

### Step 3 – Hooking params & theme

- Add `WaveParams` structure into `Scene`.
- Add `Scene.setParams()` and apply to `WaveLine`.
- Add color utilities and:
  - Read CSS foreground/background on init.
  - Provide `Scene.setThemeColors()` for future custom events.
- Optionally:
  - Wire a basic example custom event (`wave:config`) for manual testing.

### Step 4 – Lens skeleton (no special rendering yet)

- Implement `Lens` class storing `LensState`.
- Pass `u_lensCenter` and `u_lensRadius` to the line shader.
- Initially, use lens just to slightly tint the line inside the lens:
  - Quick visual check that math is correct.
- Confirm:
  - Mouse tracking.
  - Lens radius from CSS.

### Step 5 – MSDF text along the wave

- Implement MSDF loader:
  - Import PNG/JSON.
  - Parse JSON into `MsdfFontMeta`.
- Implement `WaveText`:
  - Layout text along a straight baseline.
  - Deform glyph positions based on wave function (same as `WaveLine`).
- Implement MSDF shader:
  - Standard multi-channel distance field sampling.
  - Use `u_color` foreground for fill.
- Draw text after the line to ensure correct layering.

### Step 6 – Sparkles

- Implement `WaveSparkles`:
  - Two instances defined relative to text length or fixed offsets along the wave.
  - Use MSDF sparkle atlas and same shader with adjusted params.
- Make sparkles follow the same wave function and lens uniforms.

### Step 7 – Advanced lens rendering

- Extend shaders to support:
  - Outlined text in lens:
    - Use distance field to separate outline and fill.
  - Hatched fill:
    - Use screen-space UV to generate stripes inside glyph area.
  - Dashed line in lens:
    - Implement fragment-based pattern using a line parameter varying.
- Consider whether a separate framebuffer is needed for zoom:
  - If yes, `Lens` manages offscreen render, and final pass samples from it with a zoom factor.

### Step 8 – GSAP & UI integration

- Define stable public API on `Scene` for:
  - `setParams`
  - `setText`
  - `setThemeColors`
- Provide example GSAP usage snippet (outside the core).
- Provide example of a control panel component that:
  - Dispatches `wave:config` events.
  - Updates text via `wave:text` events.

## 8. Next Concrete Coding Step

The first implementation step after this plan:

1. Create `WaveText.astro`, `scene.ts`, and `line.ts`.
2. Implement:
   - WebGL2 context & resize handling.
   - Main RAF loop.
   - A single solid sin wave line, driven by `time`, `amplitude`, `frequency`, `speed`.
3. Verify that:
   - Canvas resizes with the container / window.
   - Line is crisp (respect dpr).
   - Parameters are easy to tweak via a small hard-coded `WaveParams` object.

After that, we can iterate on lens, text, and sparkles following the plan above.
