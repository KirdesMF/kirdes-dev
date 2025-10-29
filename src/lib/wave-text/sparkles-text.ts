import { createProgram } from "./_utils";

const VS = `#version 300 es
  precision highp float;

  layout(location=0) in vec2 a_unitPos;      // quad unitaire [-0.5..0.5]^2
  layout(location=1) in vec2 a_anchorLocal;  // ancre locale (quad texte)
  layout(location=2) in float a_sizePx;      // taille sprite

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

  uniform sampler2D u_tex;
  uniform vec2  u_lensCenterPx;
  uniform float u_lensRadiusPx;
  uniform float u_lensFeatherPx;
  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    vec4 c = texture(u_tex, v_uv);
    if (c.a < 0.05) discard;
    outColor = c;

    // masque lentille
    float d = distance(gl_FragCoord.xy, u_lensCenterPx);
    float m = 1.0 - smoothstep(u_lensRadiusPx - u_lensFeatherPx, u_lensRadiusPx + u_lensFeatherPx, d);

    // motif dashed (écran) — ajuste la fréquence si tu veux
    float dash = step(0.5, fract(gl_FragCoord.x * 0.05));

    // hors lentille: inchangé, dans lentille: alpha modifié par dash
    float alpha = mix(outColor.a, outColor.a * dash, m);
    if (alpha < 0.01) discard;
    outColor = vec4(outColor.rgb, alpha);
  }
`;

export type SparklesTextConfig = {
	quadWidth: number; // largeur du quad texte
	quadHeight: number; // hauteur du quad texte
	// marge latérale depuis le bord du quad texte pour "coller" au mot
	sideMarginPx: number;

	// lifter vers la wave (haut: -lift, bas: +lift)
	liftFromLinePx: number;

	// tailles des deux sparkles (gros, petit) par ligne
	topSizesPx: [number, number];
	bottomSizesPx: [number, number];

	// décalages locaux pour le duo (gros/petit) en haut et en bas
	// top est côté droit (fin du texte), bottom est côté gauche (début miroir)
	// dx>0 vers la droite, dy>0 vers le bas (avant mirroring vertical de la scène)
	offsetTopBig: { dx: number; dy: number };
	offsetTopSmall: { dx: number; dy: number };
	offsetBottomBig: { dx: number; dy: number };
	offsetBottomSmall: { dx: number; dy: number };

	color: string;
	texSize: number; // dimension texture "plus"
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

export class SparklesText {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;

	private vao: WebGLVertexArrayObject | null = null;
	private vboQuad: WebGLBuffer | null = null;
	private vboAnchors: WebGLBuffer | null = null;
	private vboSize: WebGLBuffer | null = null;
	private tex: WebGLTexture | null = null;

	private instanceCount = 4; // top-big, top-small, bottom-big, bottom-small
	private config: SparklesTextConfig;
	private contentWidthRatio = 0;

	constructor(
		gl: WebGL2RenderingContext,
		config: Partial<SparklesTextConfig> = {},
	) {
		this.gl = gl;
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		// valeurs par défaut ergonomiques
		this.config = {
			quadWidth: 1400,
			quadHeight: 550,
			sideMarginPx: 500,
			liftFromLinePx: 40,
			topSizesPx: [28, 16], // gros, petit
			bottomSizesPx: [28, 16], // gros, petit
			// top: à droite du mot
			offsetTopBig: { dx: 8, dy: -6 },
			offsetTopSmall: { dx: 26, dy: 6 },
			// bottom: en miroir à gauche du mot
			offsetBottomBig: { dx: -8, dy: 6 },
			offsetBottomSmall: { dx: -26, dy: -6 },
			color: "#ffffff",
			texSize: 64,
			...config,
		};

		this.createPlusTexture();
		this.createGeometry();
		this.updateAnchorsAndSizes();
	}

	public updateConfig(cfg: Partial<SparklesTextConfig>): void {
		this.config = { ...this.config, ...cfg };
		this.updateAnchorsAndSizes();
		if (cfg.color || cfg.texSize) {
			this.disposeTexture();
			this.createPlusTexture();
		}
	}

	public setTextContentWidthFromTexture(wordPx: number, texWidthPx: number) {
		if (texWidthPx <= 0) {
			this.contentWidthRatio = 0;
		} else {
			this.contentWidthRatio = Math.max(0, Math.min(1, wordPx / texWidthPx));
		}
		this.updateAnchorsAndSizes();
	}

	public resizeQuadSize({
		width,
		height,
	}: {
		width: number;
		height: number;
	}): void {
		this.config.quadWidth = width;
		this.config.quadHeight = height;
		this.updateAnchorsAndSizes();
	}

	public render(uniforms: SparklesTextUniforms): void {
		const gl = this.gl;
		gl.useProgram(this.program);

		gl.uniform2f(
			gl.getUniformLocation(this.program, "u_resolution"),
			uniforms.resolution.width,
			uniforms.resolution.height,
		);
		gl.uniform2f(
			gl.getUniformLocation(this.program, "u_lensCenterPx"),
			uniforms.lens?.centerPx.x ?? -9999,
			uniforms.lens?.centerPx.y ?? -9999,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_lensRadiusPx"),
			uniforms.lens?.radiusPx ?? 0.0,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_lensFeatherPx"),
			uniforms.lens?.featherPx ?? 1.0,
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

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		gl.uniform1i(gl.getUniformLocation(this.program, "u_tex"), 0);

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
		this.disposeTexture();
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
			throw new Error("Sparkles VAO/VBO allocation failed");
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

		// The word occupies a fraction of the texture; map that to the quad size.
		const wText = Math.min(quadWidth, quadWidth * this.contentWidthRatio);
		const startX = (quadWidth - wText) * 0.5; // left edge of the word (quad space)
		const endX = startX + wText; // right edge of the word (quad space)
		const midY = quadHeight * 0.5;

		// TOP (right side of the word)
		const topBase = {
			x: endX + sideMarginPx,
			y: midY - Math.abs(liftFromLinePx),
		};

		// BOTTOM (left side of the word, mirrored)
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

	private createPlusTexture(): void {
		const gl = this.gl;
		const ts = Math.max(16, Math.floor(this.config.texSize));
		const canvas = document.createElement("canvas");
		canvas.width = ts;
		canvas.height = ts;

		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("2D context not available");

		ctx.clearRect(0, 0, ts, ts);
		ctx.strokeStyle = this.config.color;
		ctx.lineCap = "round";
		ctx.lineWidth = Math.max(2, ts * 0.12);

		const cx = ts * 0.5;
		const cy = ts * 0.5;
		const r = ts * 0.3;

		ctx.beginPath();
		ctx.moveTo(cx - r, cy);
		ctx.lineTo(cx + r, cy);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(cx, cy - r);
		ctx.lineTo(cx, cy + r);
		ctx.stroke();

		const tex = gl.createTexture();
		if (!tex) throw new Error("Texture allocation failed");
		this.tex = tex;

		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	private disposeTexture(): void {
		if (this.tex) {
			this.gl.deleteTexture(this.tex);
			this.tex = null;
		}
	}
}
