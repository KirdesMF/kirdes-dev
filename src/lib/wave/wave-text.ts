import { createProgram, cssColorToVec3, getUniform } from "./_helpers";

const VS = `#version 300 es
  precision highp float;

  layout(location=0) in vec2 a_position;
  layout(location=1) in vec2 a_uv;

  uniform vec2  u_resolution;
  uniform float u_phase;
  uniform float u_amplitude;
  uniform float u_frequency;
  uniform vec2  u_offset;
  uniform vec2  u_dualOffsetX;

  out vec2 v_uv;

  void main() {
    v_uv = a_uv;

    vec2 pos = a_position + u_offset;
    float isTop = step(a_uv.y, 0.5);
    float offsetX = mix(u_dualOffsetX.y, u_dualOffsetX.x, isTop);
    pos.x += offsetX;

    float wave  = sin(pos.x * u_frequency + u_phase) * u_amplitude;
    float slope = cos(pos.x * u_frequency + u_phase) * u_amplitude * u_frequency;
    float stretch = sqrt(1.0 + slope * slope);

    float baseline = u_resolution.y * 0.5;
    pos.y = baseline + (pos.y + wave - baseline) * stretch;

    vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
    clip.y *= -1.0;

    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

const FS = `#version 300 es
  precision mediump float;

  uniform sampler2D u_texFill;
  uniform sampler2D u_texStroke;

  uniform vec2  u_lensCenterPx;
  uniform float u_lensRadiusPx;
  uniform float u_lensFeatherPx;

  uniform vec3  u_textColor;     // couleur du contour + hatch
  uniform float u_outlineAlpha;  // opacity du contour
  uniform vec3  u_outlineBaseColor;
  uniform float u_outlineBaseAlpha;
  uniform vec3  u_fillBgColor;

  // Hatch
  uniform float u_hatchPeriodPx;
  uniform float u_hatchDuty;
  uniform float u_hatchAlpha;
  uniform float u_hatchAngleDeg;

  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    vec4 fillS   = texture(u_texFill,   v_uv);
    vec4 strokeS = texture(u_texStroke, v_uv);

    float aFill   = fillS.a;
    float aStroke = strokeS.a;

    // ring = contour pur (stroke sans le plein)
    float ringA = max(0.0, aStroke - aFill);

  // Lens feather
    float d   = distance(gl_FragCoord.xy, u_lensCenterPx);
    float m   = 1.0 - smoothstep(u_lensRadiusPx - u_lensFeatherPx,u_lensRadiusPx + u_lensFeatherPx, d);

    vec4 outside = vec4(fillS.rgb, aFill) * (1.0 - m);
    float shadowDiff = max(
      max(abs(fillS.r - u_fillBgColor.r), abs(fillS.g - u_fillBgColor.g)),
      abs(fillS.b - u_fillBgColor.b)
    );
    float shadowMask = clamp(shadowDiff * 6.0, 0.0, 1.0) * aFill;
    vec4 shadowInside = vec4(u_outlineBaseColor * shadowMask, shadowMask) * m;
    vec4 outlineBase = vec4(u_outlineBaseColor, u_outlineBaseAlpha) * ringA;

    // Hatch (dans la lens), masqué par le corps du texte
    vec2  q   = gl_FragCoord.xy - u_lensCenterPx;
    float ang = radians(u_hatchAngleDeg);
    vec2  r   = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * q;
    float period = max(1.0, u_hatchPeriodPx);
    float saw = fract(r.x / period);
    float dash = step(0.0, saw) * step(saw, clamp(u_hatchDuty, 0.0, 1.0));

    vec4 outlineCol = vec4(u_textColor, u_outlineAlpha) * ringA;
    vec4 hatchCol   = vec4(u_textColor, u_hatchAlpha)  * dash * aFill;

    vec4 inside = (outlineCol + hatchCol) * m;

    vec4 color = outside + shadowInside + outlineBase + inside;
    if (color.a < 0.01) discard;
    outColor = color;
  }
`;

export type WaveTextLensConfig = {
	textColor: [number, number, number]; // vec3
	outlineAlpha: number;
	hatchPeriodPx: number;
	hatchDuty: number;
	hatchAlpha: number;
	hatchAngleDeg: number;
};

export type WaveTextShadowLayer = {
	color: string;
	alpha?: number;
	offsetPx?: { x: number; y: number };
	stepOffsetPx?: { x: number; y: number };
	steps?: number;
	topOnly?: boolean;
};

export type WaveTextConfig = {
	text: string;
	font: string; // ex: "800 300px Commissioner Variable, sans-serif"
	color: string; // fill color (CSS) pour Canvas2D
	letterSpacingPx: number;
	lineSpacingPx: number; // distance half-top/half-bottom (miroir)
	gridRes: number;
	maxTextureSize?: number;
	strokeWidthPx: number; // épaisseur du contour (en px écran car on le bake dans la texture stroke)
	lens: WaveTextLensConfig;
	shadowLayers: WaveTextShadowLayer[];
	outlineOutsideColor: [number, number, number];
	outlineOutsideAlpha: number;
};

export type WaveUniforms = {
	resolution: { width: number; height: number };
	phase: number;
	amplitude: number;
	frequency: number;
	offset: { x: number; y: number };
	lens: {
		centerPx: { x: number; y: number };
		radiusPx: number;
		featherPx: number;
	};
};

const LENS_DEFAULTS: WaveTextLensConfig = {
	textColor: [1, 1, 1],
	outlineAlpha: 1.0,
	hatchPeriodPx: 6.0,
	hatchDuty: 0.5,
	hatchAlpha: 0.75,
	hatchAngleDeg: 45.0,
};

const CONFIG_DEFAULTS: WaveTextConfig = {
	text: "WORKS",
	font: "850 240px Commissioner Variable, sans-serif",
	color: "#ffffff",
	letterSpacingPx: -5,
	lineSpacingPx: 60,
	gridRes: 200,
	maxTextureSize: 2048,
	strokeWidthPx: 10,
	lens: { ...LENS_DEFAULTS },
	shadowLayers: [],
	outlineOutsideColor: [1, 1, 1],
	outlineOutsideAlpha: 1.0,
};

function createDefaultConfig(): WaveTextConfig {
	return {
		...CONFIG_DEFAULTS,
		lens: {
			...CONFIG_DEFAULTS.lens,
			textColor: [...CONFIG_DEFAULTS.lens.textColor] as [
				number,
				number,
				number,
			],
		},
		shadowLayers: cloneShadowLayers(CONFIG_DEFAULTS.shadowLayers),
		outlineOutsideColor: [...CONFIG_DEFAULTS.outlineOutsideColor] as [
			number,
			number,
			number,
		],
	};
}

function mergeConfig(patch: Partial<WaveTextConfig>): WaveTextConfig {
	const base = createDefaultConfig();
	const lensPartial = (patch.lens ?? {}) as Partial<WaveTextLensConfig>;
	return {
		...base,
		...patch,
		lens: {
			...base.lens,
			...lensPartial,
			textColor: [...(lensPartial.textColor ?? base.lens.textColor)] as [
				number,
				number,
				number,
			],
		},
		shadowLayers: cloneShadowLayers(patch.shadowLayers ?? base.shadowLayers),
		outlineOutsideColor: [
			...((patch.outlineOutsideColor as [number, number, number]) ??
				base.outlineOutsideColor),
		] as [number, number, number],
	};
}

function cloneShadowLayers(
	layers: WaveTextShadowLayer[] | undefined,
): WaveTextShadowLayer[] {
	if (!layers?.length) return [];
	return layers.map((layer) => ({
		color: layer.color,
		alpha: layer.alpha,
		offsetPx: layer.offsetPx
			? { x: layer.offsetPx.x, y: layer.offsetPx.y }
			: undefined,
		stepOffsetPx: layer.stepOffsetPx
			? { x: layer.stepOffsetPx.x, y: layer.stepOffsetPx.y }
			: undefined,
		steps: layer.steps,
		topOnly: layer.topOnly,
	}));
}

export class WaveText {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;

	private texFill: WebGLTexture | null = null;
	private texStroke: WebGLTexture | null = null;

	private vao: WebGLVertexArrayObject | null = null;
	private vboPos: WebGLBuffer | null = null;
	private vboUV: WebGLBuffer | null = null;
	private ibo: WebGLBuffer | null = null;
	private meshIndexCount = 0;

	// Offscreen canvases
	private canvasFill: HTMLCanvasElement;
	private ctxFill: CanvasRenderingContext2D;
	private canvasStroke: HTMLCanvasElement;
	private ctxStroke: CanvasRenderingContext2D;

	// quad & tex sizes
	private quadW = 1400;
	private quadH = 550;
	private texW = 2048;
	private texH = 1024;
	private dualOffsetX: [number, number] = [0, 0];

	// lens uniforms (cached)
	private uLensCenterPx: WebGLUniformLocation;
	private uLensRadiusPx: WebGLUniformLocation;
	private uLensFeatherPx: WebGLUniformLocation;

	// texture uniforms (cached)
	private uTexFill: WebGLUniformLocation;
	private uTexStroke: WebGLUniformLocation;
	private uResolution: WebGLUniformLocation;
	private uPhase: WebGLUniformLocation;
	private uAmp: WebGLUniformLocation;
	private uFreq: WebGLUniformLocation;
	private uOffset: WebGLUniformLocation;
	private uDualOffsetX: WebGLUniformLocation;
	private uTextColor: WebGLUniformLocation;
	private uOutlineAlpha: WebGLUniformLocation;
	private uHatchPeriodPx: WebGLUniformLocation;
	private uHatchAlpha: WebGLUniformLocation;
	private uHatchDuty: WebGLUniformLocation;
	private uHatchAngleDeg: WebGLUniformLocation;
	private uOutlineBaseColor: WebGLUniformLocation;
	private uOutlineBaseAlpha: WebGLUniformLocation;
	private uFillBgColor: WebGLUniformLocation;
	private fillBgColorVec3: [number, number, number] = [1, 1, 1];

	public config: WaveTextConfig;

	constructor(
		gl: WebGL2RenderingContext,
		config: Partial<WaveTextConfig> = {},
	) {
		this.gl = gl;
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		this.config = mergeConfig(config);
		this.fillBgColorVec3 = cssColorToVec3(this.config.color);

		// cache uniforms
		this.uResolution = getUniform(gl, this.program, "u_resolution");
		this.uPhase = getUniform(gl, this.program, "u_phase");
		this.uAmp = getUniform(gl, this.program, "u_amplitude");
		this.uFreq = getUniform(gl, this.program, "u_frequency");
		this.uOffset = getUniform(gl, this.program, "u_offset");
		this.uDualOffsetX = getUniform(gl, this.program, "u_dualOffsetX");
		this.uTexFill = getUniform(gl, this.program, "u_texFill");
		this.uTexStroke = getUniform(gl, this.program, "u_texStroke");
		this.uTextColor = getUniform(gl, this.program, "u_textColor");
		this.uOutlineAlpha = getUniform(gl, this.program, "u_outlineAlpha");
		this.uOutlineBaseColor = getUniform(gl, this.program, "u_outlineBaseColor");
		this.uOutlineBaseAlpha = getUniform(gl, this.program, "u_outlineBaseAlpha");
		this.uFillBgColor = getUniform(gl, this.program, "u_fillBgColor");
		this.uHatchAngleDeg = getUniform(gl, this.program, "u_hatchAngleDeg");
		this.uHatchPeriodPx = getUniform(gl, this.program, "u_hatchPeriodPx");
		this.uHatchAlpha = getUniform(gl, this.program, "u_hatchAlpha");
		this.uHatchDuty = getUniform(gl, this.program, "u_hatchDuty");

		// lens uniforms (cached)
		this.uLensCenterPx = getUniform(gl, this.program, "u_lensCenterPx");
		this.uLensRadiusPx = getUniform(gl, this.program, "u_lensRadiusPx");
		this.uLensFeatherPx = getUniform(gl, this.program, "u_lensFeatherPx");

		// offscreen
		const maxTex = this.config.maxTextureSize ?? 2048;

		// fill text texture
		this.canvasFill = document.createElement("canvas");
		this.canvasFill.width = this.texW = Math.min(this.texW, maxTex);
		this.canvasFill.height = this.texH = Math.min(this.texH, maxTex >> 1);
		const ctxF = this.canvasFill.getContext("2d");
		if (!ctxF) throw new Error("2D context (fill) not available");
		this.ctxFill = ctxF;

		// stroke text texture
		this.canvasStroke = document.createElement("canvas");
		this.canvasStroke.width = this.texW;
		this.canvasStroke.height = this.texH;
		const ctxS = this.canvasStroke.getContext("2d");
		if (!ctxS) throw new Error("2D context (stroke) not available");
		this.ctxStroke = ctxS;

		// GL resources
		this.createTextures();
		this.createMesh(this.quadW, this.quadH, this.config.gridRes);
		this.loadFontAndUpload();
	}

	public render(uniforms: WaveUniforms) {
		const gl = this.gl;
		gl.useProgram(this.program);

		// TEX0 = fill, TEX1 = stroke
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.texFill);
		gl.uniform1i(this.uTexFill, 0);

		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.texStroke);
		gl.uniform1i(this.uTexStroke, 1);

		gl.uniform2f(
			this.uResolution,
			uniforms.resolution.width,
			uniforms.resolution.height,
		);
		gl.uniform1f(this.uPhase, uniforms.phase);
		gl.uniform1f(this.uAmp, uniforms.amplitude);
		gl.uniform1f(this.uFreq, uniforms.frequency);
		gl.uniform2f(this.uOffset, uniforms.offset.x, uniforms.offset.y);
		gl.uniform2f(this.uDualOffsetX, this.dualOffsetX[0], this.dualOffsetX[1]);

		// Lens
		gl.uniform2f(
			this.uLensCenterPx,
			uniforms.lens.centerPx.x,
			uniforms.lens.centerPx.y,
		);
		gl.uniform1f(this.uLensRadiusPx, uniforms.lens.radiusPx);
		gl.uniform1f(this.uLensFeatherPx, uniforms.lens.featherPx);

		// Inside lens
		const lens = this.config.lens;
		gl.uniform3f(
			this.uTextColor,
			lens.textColor[0],
			lens.textColor[1],
			lens.textColor[2],
		);
		gl.uniform1f(this.uOutlineAlpha, lens.outlineAlpha);
		gl.uniform1f(this.uHatchPeriodPx, lens.hatchPeriodPx);
		gl.uniform1f(this.uHatchDuty, lens.hatchDuty);
		gl.uniform1f(this.uHatchAlpha, lens.hatchAlpha);
		gl.uniform1f(this.uHatchAngleDeg, lens.hatchAngleDeg);
		gl.uniform3f(
			this.uOutlineBaseColor,
			this.config.outlineOutsideColor[0],
			this.config.outlineOutsideColor[1],
			this.config.outlineOutsideColor[2],
		);
		gl.uniform1f(this.uOutlineBaseAlpha, this.config.outlineOutsideAlpha);
		gl.uniform3f(
			this.uFillBgColor,
			this.fillBgColorVec3[0],
			this.fillBgColorVec3[1],
			this.fillBgColorVec3[2],
		);

		gl.bindVertexArray(this.vao);
		gl.drawElements(gl.TRIANGLES, this.meshIndexCount, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}

	private async loadFontAndUpload() {
		const fonts = document.fonts;
		if (fonts?.ready) {
			try {
				await fonts.ready;
			} catch {
				console.error("Failed to load fonts");
			}
		}
		if (fonts?.load) {
			try {
				await fonts.load(this.config.font);
			} catch {
				console.error("Failed to load font");
			}
		}

		this.drawToCanvases();
		this.uploadTextures(true);
	}

	public getTextureCanvasWidth() {
		return this.canvasFill.width;
	}

	public getTextContentWidthPx() {
		const ctx = this.ctxFill;
		const text = this.config.text;
		if (!text) return 0;
		ctx.font = this.config.font;
		ctx.letterSpacing = `${this.config.letterSpacingPx}px`;
		const m = ctx.measureText(text);
		const extra = Math.max(0, text.length - 1) * this.config.letterSpacingPx;
		return Math.max(0, m.width + extra);
	}

	public updateText(t: string) {
		this.config.text = t;
		this.drawToCanvases();
		this.uploadTextures(false);
	}

	public updateColor(cssColor: string) {
		if (cssColor === this.config.color) return;
		this.config.color = cssColor;
		this.fillBgColorVec3 = cssColorToVec3(cssColor);
		this.drawToCanvases();
		this.uploadTextures(false);
	}

	public updateLensConfig(patch: Partial<WaveTextLensConfig>) {
		const current = this.config.lens;
		const next: WaveTextLensConfig = {
			...current,
			...patch,
			textColor: patch.textColor
				? ([...patch.textColor] as [number, number, number])
				: ([...current.textColor] as [number, number, number]),
		};
		this.config.lens = next;
	}

	public setShadowLayers(layers: WaveTextShadowLayer[]) {
		this.config.shadowLayers = cloneShadowLayers(layers);
		this.drawToCanvases();
		this.uploadTextures(false);
	}

	public setOutlineOutside(color: [number, number, number], alpha?: number) {
		this.config.outlineOutsideColor = [color[0], color[1], color[2]];
		if (typeof alpha === "number") {
			this.config.outlineOutsideAlpha = alpha;
		}
	}

	public setStrokeWidthPx(px: number) {
		this.config.strokeWidthPx = Math.max(1, px | 0);
		this.drawToCanvases();
		this.uploadTextures(false);
	}

	public setDualOffsetX(topOffset: number, bottomOffset: number) {
		const top = Number.isFinite(topOffset) ? topOffset : 0;
		const bottom = Number.isFinite(bottomOffset) ? bottomOffset : 0;
		if (top === this.dualOffsetX[0] && bottom === this.dualOffsetX[1]) {
			return;
		}
		this.dualOffsetX[0] = top;
		this.dualOffsetX[1] = bottom;
	}

	public getDualOffsetX(): readonly [number, number] {
		return this.dualOffsetX;
	}

	public resizeQuad(args: { width: number; height: number; gridRes?: number }) {
		const { width, height, gridRes } = args;
		const res = gridRes ?? this.config.gridRes;
		const nextW = Math.max(100, Math.floor(width));
		const nextH = Math.max(100, Math.floor(height));

		if (
			this.quadW === nextW &&
			this.quadH === nextH &&
			this.config.gridRes === res
		) {
			return;
		}

		this.quadW = nextW;
		this.quadH = nextH;
		this.config.gridRes = res;
		this.destroyMesh();
		this.createMesh(this.quadW, this.quadH, res);
	}

	private createTextures() {
		const gl = this.gl;
		const t0 = gl.createTexture();
		const t1 = gl.createTexture();
		if (!t0 || !t1) throw new Error("texture alloc failed");
		this.texFill = t0;
		this.texStroke = t1;

		for (const t of [t0, t1]) {
			gl.bindTexture(gl.TEXTURE_2D, t);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		}
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	private uploadTextures(initial: boolean) {
		const gl = this.gl;

		// fill
		gl.bindTexture(gl.TEXTURE_2D, this.texFill);
		if (initial) {
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				this.canvasFill,
			);
		} else {
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				this.canvasFill,
			);
		}

		// stroke
		gl.bindTexture(gl.TEXTURE_2D, this.texStroke);
		if (initial) {
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				this.canvasStroke,
			);
		} else {
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				this.canvasStroke,
			);
		}

		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	private drawToCanvases() {
		const text = this.config.text;
		const W = this.texW;
		const H = this.texH;

		// ---- FILL ----
		const fctx = this.ctxFill;
		fctx.clearRect(0, 0, W, H);
		fctx.fillStyle = this.config.color;
		fctx.letterSpacing = `${this.config.letterSpacingPx}px`;
		fctx.textAlign = "center";
		fctx.textBaseline = "alphabetic";
		fctx.font = this.config.font;

		const cx = W * 0.5;
		const cy = H * 0.5;

		// haut (normal)
		this.drawShadowLayers2D(
			fctx,
			text,
			cx,
			cy - this.config.lineSpacingPx,
			false,
		);
		fctx.fillText(text, cx, cy - this.config.lineSpacingPx);
		// bas (miroir)
		fctx.save();
		fctx.translate(cx, cy + this.config.lineSpacingPx);
		fctx.scale(-1, -1);
		this.drawShadowLayers2D(fctx, text, 0, 0, true);
		fctx.fillText(text, 0, 0);
		fctx.restore();

		// ---- STROKE ----
		const sctx = this.ctxStroke;
		sctx.clearRect(0, 0, W, H);
		sctx.strokeStyle = "rgba(255,255,255,1)"; // la couleur n’a pas d’importance : on n’utilise que l’ALPHA
		sctx.lineWidth = Math.max(1, this.config.strokeWidthPx);
		sctx.lineJoin = "round";
		sctx.miterLimit = 2;
		sctx.letterSpacing = `${this.config.letterSpacingPx}px`;
		sctx.textAlign = "center";
		sctx.textBaseline = "alphabetic";
		sctx.font = this.config.font;

		// haut
		sctx.strokeText(text, cx, cy - this.config.lineSpacingPx);

		// bas (miroir)
		sctx.save();
		sctx.translate(cx, cy + this.config.lineSpacingPx);
		sctx.scale(-1, -1);
		sctx.strokeText(text, 0, 0);
		sctx.restore();
	}

	private drawShadowLayers2D(
		ctx: CanvasRenderingContext2D,
		text: string,
		baseX: number,
		baseY: number,
		isMirrored: boolean,
	) {
		if (!text || !this.config.shadowLayers.length) return;
		for (const layer of this.config.shadowLayers) {
			if (!layer.color) continue;
			if (isMirrored && layer.topOnly) continue;
			const steps = Math.max(1, Math.floor(layer.steps ?? 1));
			const rawOffset = layer.offsetPx ?? { x: 0, y: 0 };
			const rawStep = layer.stepOffsetPx ?? rawOffset;
			const dir = isMirrored ? -1 : 1;
			const offset = { x: rawOffset.x * dir, y: rawOffset.y * dir };
			const step = { x: rawStep.x * dir, y: rawStep.y * dir };
			ctx.save();
			ctx.fillStyle = layer.color;
			ctx.globalAlpha = layer.alpha ?? 1;
			let dx = offset.x;
			let dy = offset.y;
			for (let i = 0; i < steps; i++) {
				ctx.fillText(text, baseX + dx, baseY + dy);
				dx += step.x;
				dy += step.y;
			}
			ctx.restore();
		}
	}

	private createMesh(width: number, height: number, gridRes: number) {
		const gl = this.gl;

		const positions: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];

		const cols = gridRes + 1;
		const midRow = Math.floor(gridRes / 2);

		const bottomIndex: number[][] = Array.from(
			{ length: midRow + 1 },
			() => new Array<number>(cols),
		);
		const topIndex: number[][] = Array.from(
			{ length: gridRes - midRow + 1 },
			() => new Array<number>(cols),
		);

		let vertexCount = 0;
		const pushVertex = (x: number, y: number) => {
			const px = (x / gridRes) * width;
			const py = (y / gridRes) * height;
			positions.push(px, py);
			uvs.push(x / gridRes, y / gridRes);
			return vertexCount++;
		};

		for (let y = 0; y <= midRow; y++) {
			for (let x = 0; x <= gridRes; x++) {
				bottomIndex[y][x] = pushVertex(x, y);
			}
		}

		for (let y = midRow; y <= gridRes; y++) {
			for (let x = 0; x <= gridRes; x++) {
				topIndex[y - midRow][x] = pushVertex(x, y);
			}
		}

		for (let y = 0; y < midRow; y++) {
			for (let x = 0; x < gridRes; x++) {
				const bl = bottomIndex[y][x];
				const br = bottomIndex[y][x + 1];
				const tl = bottomIndex[y + 1][x];
				const tr = bottomIndex[y + 1][x + 1];
				indices.push(tl, bl, tr, tr, bl, br);
			}
		}

		for (let y = 0; y < gridRes - midRow; y++) {
			for (let x = 0; x < gridRes; x++) {
				const bl = topIndex[y][x];
				const br = topIndex[y][x + 1];
				const tl = topIndex[y + 1][x];
				const tr = topIndex[y + 1][x + 1];
				indices.push(tl, bl, tr, tr, bl, br);
			}
		}

		this.meshIndexCount = indices.length;

		const vao = gl.createVertexArray();
		const vboPos = gl.createBuffer();
		const vboUV = gl.createBuffer();
		const ibo = gl.createBuffer();
		if (!vao || !vboPos || !vboUV || !ibo) throw new Error("mesh alloc failed");

		this.vao = vao;
		this.vboPos = vboPos;
		this.vboUV = vboUV;
		this.ibo = ibo;

		gl.bindVertexArray(this.vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboUV);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
		gl.bufferData(
			gl.ELEMENT_ARRAY_BUFFER,
			new Uint16Array(indices),
			gl.STATIC_DRAW,
		);

		gl.bindVertexArray(null);
	}

	private destroyMesh() {
		const gl = this.gl;
		if (this.vao) {
			gl.deleteVertexArray(this.vao);
			this.vao = null;
		}
		if (this.vboPos) {
			gl.deleteBuffer(this.vboPos);
			this.vboPos = null;
		}
		if (this.vboUV) {
			gl.deleteBuffer(this.vboUV);
			this.vboUV = null;
		}
		if (this.ibo) {
			gl.deleteBuffer(this.ibo);
			this.ibo = null;
		}
	}

	public dispose() {
		const gl = this.gl;
		if (this.vao) gl.deleteVertexArray(this.vao);
		if (this.vboPos) gl.deleteBuffer(this.vboPos);
		if (this.vboUV) gl.deleteBuffer(this.vboUV);
		if (this.ibo) gl.deleteBuffer(this.ibo);
		if (this.texFill) gl.deleteTexture(this.texFill);
		if (this.texStroke) gl.deleteTexture(this.texStroke);
		gl.deleteProgram(this.program);
	}
}
