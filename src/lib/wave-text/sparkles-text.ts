// sparkles-text.ts (version sans texture)
// Rendu: deux traits fins qui se croisent; dans la lens => motif dashed lens-local.

import { get2DContext } from "../canvas-2d/_utils";
import { createProgram, sendLensUniforms } from "./_utils";

// ---------- Shaders ----------

const VS = `#version 300 es
precision highp float;

layout(location=0) in vec2 a_unitPos;      // quad unitaire [-0.5..0.5]^2
layout(location=1) in vec2 a_anchorLocal;  // ancre locale (quad texte)
layout(location=2) in float a_sizePx;      // taille sprite (px)

uniform vec2  u_resolution;   // px
uniform float u_phase;        // rad
uniform float u_amplitude;    // px
uniform float u_frequency;    // rad/px
uniform vec2  u_offset;       // offset du quad texte (px)

out vec2 v_uv;

void main() {
  // base locale -> espace scène
  vec2 base = a_anchorLocal + u_offset;

  // onde + "stretch" identiques au texte
  float wave  = sin(base.x * u_frequency + u_phase) * u_amplitude;
  float slope = cos(base.x * u_frequency + u_phase) * u_amplitude * u_frequency;
  float stretch = sqrt(1.0 + slope * slope);

  float baseline = u_resolution.y * 0.5;
  float yDeformed = baseline + (base.y + wave - baseline) * stretch;

  // billboard du sprite autour de la position déformée
  vec2 spritePx = a_unitPos * a_sizePx;
  vec2 posPx = vec2(base.x, yDeformed) + spritePx;

  // NDC
  vec2 clip = (posPx / u_resolution) * 2.0 - 1.0;
  clip.y *= -1.0;

  v_uv = a_unitPos * 0.5 + 0.5;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const FS = `#version 300 es
precision mediump float;

// Lens
uniform vec2  u_lensCenterPx;
uniform float u_lensRadiusPx;
uniform float u_lensFeatherPx;

// Apparence
uniform vec3  u_color;        // ex: vec3(1.0)
uniform float u_baseAlpha;    // ex: 1.0

// Dashed (dans la lens seulement)
uniform float u_dashPeriodPx; // ex: 14.0 (px écran)
uniform float u_dashDuty;     // ex: 0.55 (0..1)

// Croisillon "fin" (épaisseur en UV du quad unité)
const float LINE_HALF_UV = 0.04; // plus petit => plus fin
const float AA_GAIN      = 1.0;  // anti-aliasing

in vec2 v_uv;
out vec4 outColor;

void main() {
  // Coord UV centrées
  vec2 p = v_uv * 2.0 - 1.0;

  // AA en fonction de la taille écran
  float aa = max(fwidth(p.x), fwidth(p.y)) * AA_GAIN;

  // Deux traits minces : vertical (x≈0) et horizontal (y≈0)
  float vLine = 1.0 - smoothstep(LINE_HALF_UV, LINE_HALF_UV + aa, abs(p.x));
  float hLine = 1.0 - smoothstep(LINE_HALF_UV, LINE_HALF_UV + aa, abs(p.y));
  float crossMask = max(vLine, hLine);  // plein (hors lens)

  // Masque lentille (écran)
  float dLens = distance(gl_FragCoord.xy, u_lensCenterPx);
  float mLens = 1.0 - smoothstep(
    u_lensRadiusPx - u_lensFeatherPx,
    u_lensRadiusPx + u_lensFeatherPx,
    dLens
  );

  // Motif dashed **lens-local** (stable quand la lens bouge)
  float period = max(1.0, u_dashPeriodPx);
  vec2  q      = gl_FragCoord.xy - u_lensCenterPx; // coords locales à la lens
  float duty   = clamp(u_dashDuty, 0.0, 1.0);

  // On dash la barre verticale le long de Y, et l’horizontale le long de X
  float sawY = fract(q.y / period);
  float sawX = fract(q.x / period);
  float dashV = step(0.0, sawY) * step(sawY, duty);
  float dashH = step(0.0, sawX) * step(sawX, duty);
  float dashedMask = max(vLine * dashV, hLine * dashH);

  // Hors lens: traits pleins ; Dans lens: traits dashed
  float maskFinal = mix(crossMask, dashedMask, mLens);

  float a = u_baseAlpha * maskFinal;
  if (a < 0.01) discard;
  outColor = vec4(u_color, a);
}
`;

// ---------- Types ----------

export type SparklesTextConfig = {
	quadWidth: number; // largeur du quad texte
	quadHeight: number; // hauteur du quad texte
	sideMarginPx: number;
	liftFromLinePx: number;

	topSizesPx: [number, number]; // [gros, petit]
	bottomSizesPx: [number, number]; // [gros, petit]

	// offsets pour chaque sparkle (dans le repère du quad texte)
	offsetTopBig: { dx: number; dy: number };
	offsetTopSmall: { dx: number; dy: number };
	offsetBottomBig: { dx: number; dy: number };
	offsetBottomSmall: { dx: number; dy: number };

	// apparence
	color: string; // couleur (CSS) → uniform vec3
	baseAlpha: number; // alpha global des sparkles

	// dashed-lens
	dashPeriodPx: number;
	dashDuty: number;
};

export type SparklesTextUniforms = {
	resolution: { width: number; height: number };
	phase: number;
	amplitude: number;
	frequency: number;
	offset: { x: number; y: number }; // offset du quad texte
	lens: {
		centerPx: { x: number; y: number };
		radiusPx: number;
		featherPx: number;
	};
};

// ---------- Impl ----------

export class SparklesText {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;

	private vao: WebGLVertexArrayObject | null = null;
	private vboQuad: WebGLBuffer | null = null;
	private vboAnchors: WebGLBuffer | null = null;
	private vboSize: WebGLBuffer | null = null;

	private instanceCount = 4; // top-big, top-small, bottom-big, bottom-small
	private config: SparklesTextConfig;
	private contentWidthRatio = 0;

	constructor(
		gl: WebGL2RenderingContext,
		config: Partial<SparklesTextConfig> = {},
	) {
		this.gl = gl;
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		// valeurs par défaut
		this.config = {
			quadWidth: 1400,
			quadHeight: 550,
			sideMarginPx: 60,
			liftFromLinePx: 50,
			topSizesPx: [26, 18],
			bottomSizesPx: [26, 18],
			offsetTopBig: { dx: 8, dy: -6 },
			offsetTopSmall: { dx: 26, dy: 6 },
			offsetBottomBig: { dx: -8, dy: 6 },
			offsetBottomSmall: { dx: -26, dy: -6 },
			color: "#ffffff",
			baseAlpha: 1.0,
			dashPeriodPx: 10.0,
			dashDuty: 0.75,
			...config,
		};

		this.createGeometry();
		this.updateAnchorsAndSizes();
	}

	// --- API de placement / config ---

	public updateConfig(cfg: Partial<SparklesTextConfig>): void {
		this.config = { ...this.config, ...cfg };
		this.updateAnchorsAndSizes();
	}

	// Le texte principal te donne la largeur réelle du mot (en px texture) et la largeur totale tex.
	// On convertit ça en ratio pour placer les sparkles visuellement au bord du mot dans le quad.
	public setTextContentWidthFromTexture(wordPx: number, texWidthPx: number) {
		if (texWidthPx <= 0) this.contentWidthRatio = 0;
		else this.contentWidthRatio = Math.max(0, Math.min(1, wordPx / texWidthPx));
		this.updateAnchorsAndSizes();
	}

	public resizeQuadSize({ width, height }: { width: number; height: number }) {
		this.config.quadWidth = width;
		this.config.quadHeight = height;
		this.updateAnchorsAndSizes();
	}

	// --- Render ---

	public render(uniforms: SparklesTextUniforms): void {
		const gl = this.gl;
		gl.useProgram(this.program);

		// uniforms communs
		gl.uniform2f(
			gl.getUniformLocation(this.program, "u_resolution"),
			uniforms.resolution.width,
			uniforms.resolution.height,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_phase"),
			uniforms.phase,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_amplitude"),
			uniforms.amplitude,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_frequency"),
			uniforms.frequency,
		);
		gl.uniform2f(
			gl.getUniformLocation(this.program, "u_offset"),
			uniforms.offset.x,
			uniforms.offset.y,
		);

		// lens
		sendLensUniforms({ gl, program: this.program, lens: uniforms.lens });

		// apparence
		const col = this.cssToRgb01(this.config.color);
		gl.uniform3f(
			gl.getUniformLocation(this.program, "u_color"),
			col[0],
			col[1],
			col[2],
		);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_baseAlpha"),
			this.config.baseAlpha,
		);

		// dashed dans la lens
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_dashPeriodPx"),
			this.config.dashPeriodPx,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_dashDuty"),
			this.config.dashDuty,
		);

		gl.bindVertexArray(this.vao);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
		gl.bindVertexArray(null);
	}

	public dispose(): void {
		const gl = this.gl;
		if (this.vao) gl.deleteVertexArray(this.vao);
		if (this.vboQuad) gl.deleteBuffer(this.vboQuad);
		if (this.vboAnchors) gl.deleteBuffer(this.vboAnchors);
		if (this.vboSize) gl.deleteBuffer(this.vboSize);
		gl.deleteProgram(this.program);
		this.vao = null;
		this.vboQuad = null;
		this.vboAnchors = null;
		this.vboSize = null;
	}

	// --- internals ---

	private createGeometry(): void {
		const gl = this.gl;

		// quad unitaire centré (TRIANGLE_STRIP)
		const quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);

		this.vao = gl.createVertexArray();
		this.vboQuad = gl.createBuffer();
		this.vboAnchors = gl.createBuffer();
		this.vboSize = gl.createBuffer();

		if (!this.vao || !this.vboQuad || !this.vboAnchors || !this.vboSize) {
			throw new Error("SparklesText: VAO/VBO allocation failed");
		}

		gl.bindVertexArray(this.vao);

		// a_unitPos (loc 0)
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboQuad);
		gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		// a_anchorLocal (loc 1) — 4 instances
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboAnchors);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(8), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(1, 1);

		// a_sizePx (loc 2) — 4 instances
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboSize);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(4), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(2, 1);

		gl.bindVertexArray(null);
	}

	private updateAnchorsAndSizes(): void {
		const gl = this.gl;
		const {
			quadWidth,
			quadHeight,
			sideMarginPx,
			liftFromLinePx,
			topSizesPx,
			bottomSizesPx,
			offsetTopBig,
			offsetTopSmall,
			offsetBottomBig,
			offsetBottomSmall,
		} = this.config;

		// largeur “visuelle” du mot dans le quad
		const wText = Math.min(quadWidth, quadWidth * this.contentWidthRatio);
		const startX = (quadWidth - wText) * 0.5; // bord gauche du mot
		const endX = startX + wText; // bord droit du mot
		const midY = quadHeight * 0.5;

		// TOP (à droite du mot)
		const topBase = {
			x: endX + sideMarginPx,
			y: midY - Math.abs(liftFromLinePx),
		};

		// BOTTOM (miroir à gauche du mot)
		const botBase = {
			x: startX - sideMarginPx,
			y: midY + Math.abs(liftFromLinePx),
		};

		// ordre: top-big, top-small, bottom-big, bottom-small
		const anchors = new Float32Array([
			topBase.x + offsetTopBig.dx,
			topBase.y + offsetTopBig.dy,
			topBase.x + offsetTopSmall.dx,
			topBase.y + offsetTopSmall.dy,
			botBase.x + offsetBottomBig.dx,
			botBase.y + offsetBottomBig.dy,
			botBase.x + offsetBottomSmall.dx,
			botBase.y + offsetBottomSmall.dy,
		]);

		const sizes = new Float32Array([
			topSizesPx[0], // top-big
			topSizesPx[1], // top-small
			bottomSizesPx[0], // bottom-big
			bottomSizesPx[1], // bottom-small
		]);

		if (this.vboAnchors) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.vboAnchors);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, anchors);
		}
		if (this.vboSize) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.vboSize);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, sizes);
		}
	}

	private cssToRgb01(css: string): [number, number, number] {
		// support #rgb, #rrggbb, rgb(), rgba(), named colors via canvas
		const c = document.createElement("canvas");
		c.width = c.height = 1;
		const ctx = get2DContext(c);
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = css;
		ctx.fillRect(0, 0, 1, 1);
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
		return [r / 255, g / 255, b / 255];
	}
}
