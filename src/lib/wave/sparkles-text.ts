import { createProgram, getUniform } from "./_helpers";

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
  uniform vec2  u_dualOffsetX;  // offsets horizontaux individuels (top, bottom)
  uniform vec2  u_shadowOffset; // offset appliqué à tout le sprite (shadow)

  out vec2 v_uv;

  void main() {
    float offsetX = u_dualOffsetX.y;
    if (gl_InstanceID < 2) {
      offsetX = u_dualOffsetX.x;
    }
    vec2 base = a_anchorLocal + u_offset + vec2(offsetX, 0.0) + u_shadowOffset;
    vec2 local = base + a_unitPos * a_sizePx;

    float wave  = sin(local.x * u_frequency + u_phase) * u_amplitude;
    float slope = cos(local.x * u_frequency + u_phase) * u_amplitude * u_frequency;
    float stretch = sqrt(1.0 + slope * slope);

    float baseline = u_resolution.y * 0.5;
    float yDeformed = baseline + (local.y + wave - baseline) * stretch;

    vec2 posPx = vec2(local.x, yDeformed);

    // NDC
    vec2 clip = (posPx / u_resolution) * 2.0 - 1.0;
    clip.y *= -1.0;

    v_uv = a_unitPos + 0.5;
    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

const FS = `#version 300 es
  precision mediump float;

  uniform sampler2D u_sprite;

  // Lens
  uniform vec2  u_lensCenterPx;
  uniform float u_lensRadiusPx;
  uniform float u_lensFeatherPx;

  // Apparence
  uniform vec3  u_fillColor;
  uniform vec3  u_outlineColor;
  uniform float u_baseAlpha;
  uniform float u_outlineWidth;
  uniform float u_shadowMode;

  // Dashed (dans la lens seulement)
  uniform float u_dashPeriodPx;
  uniform float u_dashDuty;
  uniform float u_dashAngleDeg;

  const float LENS_HATCH_ALPHA = 0.75;
  const float LENS_OUTLINE_GAIN = 1.2;

  in vec2 v_uv;
  out vec4 outColor;

  float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
  }

  void main() {
    vec3 spriteSample = texture(u_sprite, v_uv).rgb;
    float sd = median(spriteSample.r, spriteSample.g, spriteSample.b) - 0.5;
    float aa = max(fwidth(sd), 1e-5);

    float fillMask = smoothstep(-aa, aa, sd);
  float outlineOuter = smoothstep(-aa, aa, sd + u_outlineWidth);
  float outlineInner = smoothstep(-aa, aa, sd - u_outlineWidth);
  float outlineMask = clamp(outlineOuter - outlineInner, 0.0, 1.0);

  if (fillMask <= 0.0 && outlineMask <= 0.0) discard;

  if (u_shadowMode > 0.5) {
    float alpha = u_baseAlpha * fillMask;
    if (alpha < 0.01) discard;
    outColor = vec4(u_fillColor, alpha);
    return;
  }

    // Masque lentille (écran)
    float dLens = distance(gl_FragCoord.xy, u_lensCenterPx);
    float mLens = 1.0 - smoothstep(
      u_lensRadiusPx - u_lensFeatherPx,
      u_lensRadiusPx + u_lensFeatherPx,
      dLens
    );

    // Motif dashed dans la lens (stable quand la lens bouge)
    float period = max(1.0, u_dashPeriodPx);
    vec2  q      = gl_FragCoord.xy - u_lensCenterPx;
    float duty   = clamp(u_dashDuty, 0.0, 1.0);
    float ang    = radians(u_dashAngleDeg);
    mat2 rot     = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 r       = rot * q;
    float saw    = fract(r.x / period);
    float hatch  = step(0.0, saw) * step(saw, duty);

    float outsideFill = fillMask * (1.0 - mLens);
    float interiorMask = clamp(fillMask - outlineMask, 0.0, 1.0);
    float insideOutline = clamp(outlineMask * mLens * LENS_OUTLINE_GAIN, 0.0, 1.0);
    float insideHatch = interiorMask * hatch * mLens * LENS_HATCH_ALPHA;
    float outlineOutside = outlineMask * (1.0 - mLens);

    float maskFinal = clamp(outsideFill + insideOutline + insideHatch + outlineOutside, 0.0, 1.0);
    vec3 premul =
      u_fillColor * outsideFill +
      u_outlineColor * (outlineOutside + insideOutline + insideHatch);

    float alpha = u_baseAlpha * maskFinal;
    if (alpha < 0.01) discard;

    outColor = vec4(premul, alpha);
  }
`;

export type SparklesTextConfig = {
	quadWidth: number; // largeur du quad texte
	quadHeight: number; // hauteur du quad texte
	sideMarginPx: number;
	liftFromLinePx: number;
	spriteUrl: string;

	topSizesPx: [number, number]; // [gros, petit]
	bottomSizesPx: [number, number]; // [gros, petit]

	// offsets pour chaque sparkle (dans le repère du quad texte)
	offsetTopBig: { dx: number; dy: number };
	offsetTopSmall: { dx: number; dy: number };
	offsetBottomBig: { dx: number; dy: number };
	offsetBottomSmall: { dx: number; dy: number };

	// apparence
	fillColor: [number, number, number];
	outlineColor: [number, number, number];
	baseAlpha: number; // alpha global des sparkles
	outlineWidth: number; // épaisseur du contour (en unités SDF)

	// dashed-lens
	dashPeriodPx: number;
	dashDuty: number;
	dashAngleDeg: number;
	shadowLayers: SparklesShadowLayer[];
};

export type SparklesShadowLayer = {
	color: [number, number, number];
	alpha?: number;
	offsetPx?: { x: number; y: number };
	stepOffsetPx?: { x: number; y: number };
	steps?: number;
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

const INSTANCE_COUNT = 4;

const CONFIG_DEFAULTS: SparklesTextConfig = {
	quadWidth: 1400,
	quadHeight: 550,
	sideMarginPx: 95,
	liftFromLinePx: 75,
	spriteUrl: "/assets/msdf/sparkle.png",
	topSizesPx: [78, 56],
	bottomSizesPx: [78, 56],
	offsetTopBig: { dx: -10, dy: -26 },
	offsetTopSmall: { dx: -40, dy: 26 },
	offsetBottomBig: { dx: 10, dy: 26 },
	offsetBottomSmall: { dx: 36, dy: -26 },
	fillColor: [1, 1, 1],
	outlineColor: [1, 1, 1],
	baseAlpha: 1.0,
	outlineWidth: 0.18,
	dashPeriodPx: 6.0,
	dashDuty: 0.5,
	dashAngleDeg: 45.0,
	shadowLayers: [],
};

function createDefaultConfig(): SparklesTextConfig {
	return {
		...CONFIG_DEFAULTS,
		topSizesPx: [...CONFIG_DEFAULTS.topSizesPx] as [number, number],
		bottomSizesPx: [...CONFIG_DEFAULTS.bottomSizesPx] as [number, number],
		offsetTopBig: { ...CONFIG_DEFAULTS.offsetTopBig },
		offsetTopSmall: { ...CONFIG_DEFAULTS.offsetTopSmall },
		offsetBottomBig: { ...CONFIG_DEFAULTS.offsetBottomBig },
		offsetBottomSmall: { ...CONFIG_DEFAULTS.offsetBottomSmall },
		fillColor: [...CONFIG_DEFAULTS.fillColor] as [number, number, number],
		outlineColor: [...CONFIG_DEFAULTS.outlineColor] as [number, number, number],
		shadowLayers: cloneShadowLayers(CONFIG_DEFAULTS.shadowLayers),
	};
}

function cloneShadowLayers(
	layers: SparklesShadowLayer[] | undefined,
): SparklesShadowLayer[] {
	if (!layers?.length) return [];
	return layers.map((layer) => ({
		color: [...layer.color] as [number, number, number],
		alpha: layer.alpha,
		offsetPx: layer.offsetPx
			? { x: layer.offsetPx.x, y: layer.offsetPx.y }
			: undefined,
		stepOffsetPx: layer.stepOffsetPx
			? { x: layer.stepOffsetPx.x, y: layer.stepOffsetPx.y }
			: undefined,
		steps: layer.steps,
	}));
}

export class SparklesText {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;

	private vao: WebGLVertexArrayObject | null = null;
	private vboQuad: WebGLBuffer | null = null;
	private vboAnchors: WebGLBuffer | null = null;
	private vboSize: WebGLBuffer | null = null;

	private readonly instanceCount = INSTANCE_COUNT; // top-big, top-small, bottom-big, bottom-small
	public config: SparklesTextConfig;
	private contentWidthRatio = 0;
	private spriteTexture: WebGLTexture | null = null;
	private spriteReady = false;

	private uResolution: WebGLUniformLocation;
	private uPhase: WebGLUniformLocation;
	private uAmplitude: WebGLUniformLocation;
	private uFrequency: WebGLUniformLocation;
	private uFillColor: WebGLUniformLocation;
	private uOutlineColor: WebGLUniformLocation;
	private uBaseAlpha: WebGLUniformLocation;
	private uDashPeriodPx: WebGLUniformLocation;
	private uDashDuty: WebGLUniformLocation;
	private uOffset: WebGLUniformLocation;
	private uDualOffsetX: WebGLUniformLocation;
	private uLensCenterPx: WebGLUniformLocation;
	private uLensRadiusPx: WebGLUniformLocation;
	private uLensFeatherPx: WebGLUniformLocation;
	private uSprite: WebGLUniformLocation;
	private uOutlineWidth: WebGLUniformLocation;
	private uDashAngleDeg: WebGLUniformLocation;
	private dualOffsetX: [number, number] = [0, 0];
	private uShadowOffset: WebGLUniformLocation;
	private uShadowMode: WebGLUniformLocation;

	constructor(
		gl: WebGL2RenderingContext,
		config: Partial<SparklesTextConfig> = {},
	) {
		this.gl = gl;
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		// default values
		this.config = { ...createDefaultConfig(), ...config };

		this.uResolution = getUniform(gl, this.program, "u_resolution");
		this.uPhase = getUniform(gl, this.program, "u_phase");
		this.uAmplitude = getUniform(gl, this.program, "u_amplitude");
		this.uFrequency = getUniform(gl, this.program, "u_frequency");
		this.uFillColor = getUniform(gl, this.program, "u_fillColor");
		this.uOutlineColor = getUniform(gl, this.program, "u_outlineColor");
		this.uBaseAlpha = getUniform(gl, this.program, "u_baseAlpha");
		this.uOffset = getUniform(gl, this.program, "u_offset");
		this.uDualOffsetX = getUniform(gl, this.program, "u_dualOffsetX");

		// lens uniforms (cached)
		this.uSprite = getUniform(gl, this.program, "u_sprite");
		this.uOutlineWidth = getUniform(gl, this.program, "u_outlineWidth");
		this.uDashDuty = getUniform(gl, this.program, "u_dashDuty");
		this.uDashPeriodPx = getUniform(gl, this.program, "u_dashPeriodPx");
		this.uDashAngleDeg = getUniform(gl, this.program, "u_dashAngleDeg");
		this.uLensCenterPx = getUniform(gl, this.program, "u_lensCenterPx");
		this.uLensRadiusPx = getUniform(gl, this.program, "u_lensRadiusPx");
		this.uLensFeatherPx = getUniform(gl, this.program, "u_lensFeatherPx");
		this.uShadowOffset = getUniform(gl, this.program, "u_shadowOffset");
		this.uShadowMode = getUniform(gl, this.program, "u_shadowMode");

		this.createGeometry();
		this.initSpriteTexture();
		this.updateAnchorsAndSizes();
	}

	private initSpriteTexture() {
		const gl = this.gl;
		const tex = gl.createTexture();
		if (!tex) throw new Error("SparklesText: sprite texture allocation failed");
		this.spriteTexture = tex;

		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		const placeholder = new Uint8Array([0, 0, 0, 0]);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			placeholder,
		);
		gl.bindTexture(gl.TEXTURE_2D, null);

		// Bind sampler unit 0 once
		gl.useProgram(this.program);
		gl.uniform1i(this.uSprite, 0);
		gl.useProgram(null);

		this.loadSpriteTexture(this.config.spriteUrl);
	}

	private loadSpriteTexture(url: string) {
		if (!this.spriteTexture) return;
		if (typeof window === "undefined") {
			this.spriteReady = false;
			return;
		}

		this.spriteReady = false;
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.decoding = "async";
		image.onload = () => {
			const gl = this.gl;
			gl.bindTexture(gl.TEXTURE_2D, this.spriteTexture);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				image,
			);
			gl.bindTexture(gl.TEXTURE_2D, null);
			this.spriteReady = true;
		};
		image.onerror = () => {
			console.warn(`[SparklesText] Failed to load sprite: ${url}`);
			this.spriteReady = false;
		};
		image.src = url;
	}

	public render(uniforms: SparklesTextUniforms) {
		const gl = this.gl;

		if (!this.spriteTexture || !this.spriteReady) {
			return;
		}

		gl.useProgram(this.program);

		// uniforms communs
		gl.uniform2f(
			this.uResolution,
			uniforms.resolution.width,
			uniforms.resolution.height,
		);
		gl.uniform1f(this.uPhase, uniforms.phase);
		gl.uniform1f(this.uAmplitude, uniforms.amplitude);
		gl.uniform1f(this.uFrequency, uniforms.frequency);
		gl.uniform2f(this.uOffset, uniforms.offset.x, uniforms.offset.y);
		gl.uniform2f(this.uDualOffsetX, this.dualOffsetX[0], this.dualOffsetX[1]);

		// apparence
		gl.uniform1f(this.uOutlineWidth, Math.max(0, this.config.outlineWidth));
		gl.uniform1f(this.uDashAngleDeg, this.config.dashAngleDeg);

		// dashed dans la lens
		gl.uniform2f(
			this.uLensCenterPx,
			uniforms.lens.centerPx.x,
			uniforms.lens.centerPx.y,
		);
		gl.uniform1f(this.uLensRadiusPx, uniforms.lens.radiusPx);
		gl.uniform1f(this.uLensFeatherPx, uniforms.lens.featherPx);
		gl.uniform1f(this.uDashPeriodPx, this.config.dashPeriodPx);
		gl.uniform1f(this.uDashDuty, this.config.dashDuty);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.spriteTexture);

		gl.bindVertexArray(this.vao);

		const shadowLayers = this.config.shadowLayers ?? [];
		if (shadowLayers.length > 0) {
			for (const layer of shadowLayers) {
				const color = layer.color;
				if (!color) continue;
				const steps = Math.max(1, Math.floor(layer.steps ?? 1));
				const baseOffset = layer.offsetPx ?? { x: 0, y: 0 };
				const stepOffset = layer.stepOffsetPx ?? baseOffset;
				let dx = baseOffset.x;
				let dy = baseOffset.y;
				for (let i = 0; i < steps; i++) {
					this.drawInstancedPass({
						fillColor: color,
						outlineColor: color,
						baseAlpha: layer.alpha ?? this.config.baseAlpha,
						shadowOffset: { x: dx, y: dy },
						isShadow: true,
					});
					dx += stepOffset.x;
					dy += stepOffset.y;
				}
			}
		}

		this.drawInstancedPass({
			fillColor: this.config.fillColor,
			outlineColor: this.config.outlineColor,
			baseAlpha: this.config.baseAlpha,
			shadowOffset: { x: 0, y: 0 },
			isShadow: false,
		});

		gl.bindVertexArray(null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	public updateConfig(cfg: Partial<SparklesTextConfig>) {
		const prevSpriteUrl = this.config.spriteUrl;
		const next: SparklesTextConfig = { ...this.config, ...cfg };

		if (cfg.fillColor) {
			next.fillColor = [...cfg.fillColor] as [number, number, number];
		}
		if (cfg.outlineColor) {
			next.outlineColor = [...cfg.outlineColor] as [number, number, number];
		}

		if (
			cfg.spriteUrl !== undefined &&
			cfg.spriteUrl.length > 0 &&
			cfg.spriteUrl !== prevSpriteUrl
		) {
			this.loadSpriteTexture(next.spriteUrl);
		}

		if (cfg.shadowLayers !== undefined) {
			next.shadowLayers = cloneShadowLayers(cfg.shadowLayers);
		}

		this.config = next;

		if (
			cfg.quadWidth !== undefined ||
			cfg.quadHeight !== undefined ||
			cfg.sideMarginPx !== undefined ||
			cfg.liftFromLinePx !== undefined ||
			cfg.topSizesPx !== undefined ||
			cfg.bottomSizesPx !== undefined ||
			cfg.offsetTopBig !== undefined ||
			cfg.offsetTopSmall !== undefined ||
			cfg.offsetBottomBig !== undefined ||
			cfg.offsetBottomSmall !== undefined
		) {
			this.updateAnchorsAndSizes();
		}
	}

	public setShadowLayers(layers: SparklesShadowLayer[]) {
		this.config.shadowLayers = cloneShadowLayers(layers);
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

	// Le texte principal te donne la largeur réelle du mot (en px texture) et la largeur totale tex.
	// On convertit ça en ratio pour placer les sparkles visuellement au bord du mot dans le quad.
	public setTextContentWidthFromTexture(wordPx: number, texWidthPx: number) {
		const nextRatio =
			texWidthPx <= 0 ? 0 : Math.max(0, Math.min(1, wordPx / texWidthPx));

		if (Math.abs(nextRatio - this.contentWidthRatio) > 1e-4) {
			this.contentWidthRatio = nextRatio;
			this.updateAnchorsAndSizes();
		}
	}

	public resizeQuad({ width, height }: { width: number; height: number }) {
		if (this.config.quadWidth === width && this.config.quadHeight === height) {
			return;
		}
		this.config.quadWidth = width;
		this.config.quadHeight = height;
		this.updateAnchorsAndSizes();
	}

	public dispose() {
		const gl = this.gl;
		if (this.vao) gl.deleteVertexArray(this.vao);
		if (this.vboQuad) gl.deleteBuffer(this.vboQuad);
		if (this.vboAnchors) gl.deleteBuffer(this.vboAnchors);
		if (this.vboSize) gl.deleteBuffer(this.vboSize);
		if (this.spriteTexture) gl.deleteTexture(this.spriteTexture);
		gl.deleteProgram(this.program);
		this.vao = null;
		this.vboQuad = null;
		this.vboAnchors = null;
		this.vboSize = null;
		this.spriteTexture = null;
		this.spriteReady = false;
	}

	private createGeometry() {
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
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array(INSTANCE_COUNT * 2),
			gl.DYNAMIC_DRAW,
		);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(1, 1);

		// a_sizePx (loc 2) — 4 instances
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboSize);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array(INSTANCE_COUNT),
			gl.DYNAMIC_DRAW,
		);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(2, 1);

		gl.bindVertexArray(null);
	}

	private updateAnchorsAndSizes() {
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

		// TOP (droite du mot)
		const topBase = {
			x: endX + sideMarginPx,
			y: midY - Math.abs(liftFromLinePx),
		};

		// BOTTOM (gauche du mot)
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

	private drawInstancedPass(args: {
		fillColor: [number, number, number];
		outlineColor: [number, number, number];
		baseAlpha: number;
		shadowOffset: { x: number; y: number };
		isShadow: boolean;
	}) {
		const gl = this.gl;
		gl.uniform3f(
			this.uFillColor,
			args.fillColor[0],
			args.fillColor[1],
			args.fillColor[2],
		);
		gl.uniform3f(
			this.uOutlineColor,
			args.outlineColor[0],
			args.outlineColor[1],
			args.outlineColor[2],
		);
		gl.uniform1f(this.uBaseAlpha, args.baseAlpha);
		gl.uniform2f(this.uShadowOffset, args.shadowOffset.x, args.shadowOffset.y);
		gl.uniform1f(this.uShadowMode, args.isShadow ? 1 : 0);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
	}
}
