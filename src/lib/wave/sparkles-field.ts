// sparkles-field.ts
import { createProgram, getUniform } from "./_helpers";

const VS = `#version 300 es
precision highp float;

layout(location=0) in vec2 a_unitPos;     // quad unitaire [-0.5..0.5]^2
layout(location=1) in vec2 a_base;        // position de base (px) dans le canvas
layout(location=2) in float a_sizePx;     // taille du sprite (px)
layout(location=3) in float a_depth;      // [0..1] facteur de parallax

uniform vec2  u_resolution;               // px
uniform vec2  u_parallax;                 // souris normalisée [-1..1] (x,y)
uniform float u_strengthPx;               // force max de parallax (px)

out vec2 v_uv;
flat out float v_sizePx;
flat out float v_depth;

void main() {
  // offset parallax : plus profond => moins de déplacement
  vec2 parallaxOff = -u_parallax * u_strengthPx * (1.0 - a_depth);

  vec2 posPx = a_base + a_unitPos * a_sizePx + parallaxOff;

  vec2 clip = (posPx / u_resolution) * 2.0 - 1.0;
  clip.y *= -1.0;

  v_uv     = a_unitPos * 0.5 + 0.5;
  v_sizePx = a_sizePx;
  v_depth  = a_depth;

  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const FS = `#version 300 es
precision mediump float;

// Opacité
uniform float u_minSizePx;
uniform float u_maxSizePx;
uniform float u_alphaMin;
uniform float u_alphaMax;
uniform float u_depthBias;

// Lentille
uniform vec2  u_lensCenterPx;
uniform float u_lensRadiusPx;
uniform float u_lensFeatherPx;

// Couleur
uniform vec3  u_sparklesColor;

in vec2  v_uv;
flat in float v_sizePx;
flat in float v_depth;

out vec4 outColor;

// Réglages “artistiques”
const float LINE_HALF_UV   = 0.02; // demi-épaisseur en UV
const float AA_GAIN        = 1.0;  // anti-aliasing

// Dashed dans la lentille (constants ici pour la grille)
const float DASH_PERIOD_PX = 8.0;
const float DASH_DUTY      = 0.55;

void main() {
  // Opacité de base en fonction de la taille et de la profondeur
  float denom   = max(0.0001, u_maxSizePx - u_minSizePx);
  float tSize   = clamp((v_sizePx - u_minSizePx) / denom, 0.0, 1.0);
  float alphaSz = mix(u_alphaMin, u_alphaMax, tSize);
  float depthA  = mix(1.0, 1.0 - u_depthBias, v_depth);
  float baseA   = alphaSz * depthA;

  // UV centrées
  vec2 p = v_uv * 2.0 - 1.0;
  float aa = max(fwidth(p.x), fwidth(p.y)) * AA_GAIN;

  float vLine = 1.0 - smoothstep(LINE_HALF_UV, LINE_HALF_UV + aa, abs(p.x));
  float hLine = 1.0 - smoothstep(LINE_HALF_UV, LINE_HALF_UV + aa, abs(p.y));
  float crossMask = max(vLine, hLine);

  vec3  rgb = u_sparklesColor;

  // Lentille (écran)
  float dLens = distance(gl_FragCoord.xy, u_lensCenterPx);
  float mLens = 1.0 - smoothstep(
    u_lensRadiusPx - u_lensFeatherPx,
    u_lensRadiusPx + u_lensFeatherPx,
    dLens
  );

  // Dashed lens-local
  vec2 q = gl_FragCoord.xy - u_lensCenterPx;
  float sawY = fract(q.y / DASH_PERIOD_PX);
  float sawX = fract(q.x / DASH_PERIOD_PX);
  float dashV = step(0.0, sawY) * step(sawY, DASH_DUTY);
  float dashH = step(0.0, sawX) * step(sawX, DASH_DUTY);
  float dashedMask = max(vLine * dashV, hLine * dashH);

  float maskFinal = mix(crossMask, dashedMask, mLens);

  float a = baseA * maskFinal;
  if (a < 0.01) discard;
  outColor = vec4(rgb, a);
}
`;

export type SparklesFieldConfig = {
	count: number; // nb total d’instances
	minSizePx: number;
	maxSizePx: number;
	parallaxStrengthPx: number; // force max
	color: [number, number, number]; // vec3 0..1
	texSize?: number; // (réserve si tu veux raster un sprite plus tard)
	seed?: number; // random seed
	alphaMin?: number; // alpha des petits
	alphaMax?: number; // alpha des grands
	depthBias?: number; // atténuation par profondeur 0..1
};

export type SparklesFieldUniforms = {
	resolution: { width: number; height: number };
	parallax: { x: number; y: number }; // [-1..1]
	reduceMotion?: boolean;
	lens: {
		centerPx: { x: number; y: number };
		radiusPx: number;
		featherPx: number;
	};
};

function rng(seed: number) {
	let s = seed | 0 || 123456789;
	return () => {
		s ^= s << 13;
		s ^= s >> 17;
		s ^= s << 5;
		return (s >>> 0) / 4294967296;
	};
}

export class SparklesField {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;

	private vao: WebGLVertexArrayObject | null = null;
	private vboQuad: WebGLBuffer | null = null;
	private vboBase: WebGLBuffer | null = null;
	private vboSize: WebGLBuffer | null = null;
	private vboDepth: WebGLBuffer | null = null;

	private instanceCount = 0;
	private canvasW = 0;
	private canvasH = 0;

	// uniforms
	private uRes: WebGLUniformLocation;
	private uParallax: WebGLUniformLocation;
	private uStrength: WebGLUniformLocation;
	private uMinSize: WebGLUniformLocation;
	private uMaxSize: WebGLUniformLocation;
	private uAlphaMin: WebGLUniformLocation;
	private uAlphaMax: WebGLUniformLocation;
	private uDepthBias: WebGLUniformLocation;
	private uSparklesColor: WebGLUniformLocation;

	private uLensCenterPx: WebGLUniformLocation;
	private uLensRadiusPx: WebGLUniformLocation;
	private uLensFeatherPx: WebGLUniformLocation;

	public config: SparklesFieldConfig;

	constructor(
		gl: WebGL2RenderingContext,
		cfg: Partial<SparklesFieldConfig> = {},
	) {
		this.gl = gl;
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		this.config = {
			count: 120,
			minSizePx: 4,
			maxSizePx: 16,
			parallaxStrengthPx: 60,
			color: [1, 1, 1],
			texSize: 48,
			seed: 2,
			alphaMin: 0.12,
			alphaMax: 0.85,
			depthBias: 0.6,
			...cfg,
		};
		this.config.color = [...this.config.color] as [number, number, number];

		// cache uniforms
		const { program } = this;
		const { gl: g } = this;
		this.uRes = getUniform(g, program, "u_resolution");
		this.uParallax = getUniform(g, program, "u_parallax");
		this.uStrength = getUniform(g, program, "u_strengthPx");
		this.uMinSize = getUniform(g, program, "u_minSizePx");
		this.uMaxSize = getUniform(g, program, "u_maxSizePx");
		this.uAlphaMin = getUniform(g, program, "u_alphaMin");
		this.uAlphaMax = getUniform(g, program, "u_alphaMax");
		this.uDepthBias = getUniform(g, program, "u_depthBias");
		this.uSparklesColor = getUniform(g, program, "u_sparklesColor");

		this.uLensCenterPx = getUniform(g, program, "u_lensCenterPx");
		this.uLensRadiusPx = getUniform(g, program, "u_lensRadiusPx");
		this.uLensFeatherPx = getUniform(g, program, "u_lensFeatherPx");

		this.allocateBuffers();
	}

	// ——— API ———
	public updateConfig(cfg: Partial<SparklesFieldConfig>) {
		const prevColor = this.config.color;
		this.config = { ...this.config, ...cfg };

		if (cfg.color) {
			const next = cfg.color;
			const changed = next.some(
				(component, index) => Math.abs(component - prevColor[index]) > 1e-6,
			);
			if (!changed) {
				this.config.color = prevColor;
			} else {
				this.config.color = [...next] as [number, number, number];
			}
		}

		// (re)build si paramètres de distribution changent
		if (
			cfg.count !== undefined ||
			cfg.minSizePx !== undefined ||
			cfg.maxSizePx !== undefined
		) {
			this.allocateBuffers();
		}
	}

	public resize(args: { width: number; height: number }) {
		const { width, height } = args;
		if (width === this.canvasW && height === this.canvasH) return;
		this.canvasW = width;
		this.canvasH = height;
		this.allocateBuffers();
	}

	public render(u: SparklesFieldUniforms) {
		const gl = this.gl;
		if (!this.vao) return;

		gl.useProgram(this.program);

		gl.uniform2f(this.uRes, u.resolution.width, u.resolution.height);

		gl.uniform1f(this.uMinSize, this.config.minSizePx);
		gl.uniform1f(this.uMaxSize, this.config.maxSizePx);
		gl.uniform1f(this.uAlphaMin, this.config.alphaMin ?? 0.15);
		gl.uniform1f(this.uAlphaMax, this.config.alphaMax ?? 0.7);
		gl.uniform1f(this.uDepthBias, this.config.depthBias ?? 0.35);
		const [r, g, b] = this.config.color;
		gl.uniform3f(this.uSparklesColor, r, g, b);

		// lens
		gl.uniform2f(this.uLensCenterPx, u.lens.centerPx.x, u.lens.centerPx.y);
		gl.uniform1f(this.uLensRadiusPx, u.lens.radiusPx);
		gl.uniform1f(this.uLensFeatherPx, u.lens.featherPx);

		// parallax (atténué si reduceMotion)
		const strength =
			this.config.parallaxStrengthPx * (u.reduceMotion ? 0.4 : 1.0);
		gl.uniform1f(this.uStrength, strength);
		gl.uniform2f(this.uParallax, u.parallax.x, u.parallax.y);

		gl.bindVertexArray(this.vao);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
		gl.bindVertexArray(null);
	}

	public dispose() {
		const gl = this.gl;
		if (this.vao) gl.deleteVertexArray(this.vao);
		if (this.vboQuad) gl.deleteBuffer(this.vboQuad);
		if (this.vboBase) gl.deleteBuffer(this.vboBase);
		if (this.vboSize) gl.deleteBuffer(this.vboSize);
		if (this.vboDepth) gl.deleteBuffer(this.vboDepth);
		gl.deleteProgram(this.program);

		this.vao =
			this.vboQuad =
			this.vboBase =
			this.vboSize =
			this.vboDepth =
				null;
	}

	// ——— Internals ———
	private allocateBuffers() {
		const gl = this.gl;

		if (!this.vao) this.vao = gl.createVertexArray();
		if (!this.vboQuad) this.vboQuad = gl.createBuffer();
		if (!this.vboBase) this.vboBase = gl.createBuffer();
		if (!this.vboSize) this.vboSize = gl.createBuffer();
		if (!this.vboDepth) this.vboDepth = gl.createBuffer();

		if (
			!this.vao ||
			!this.vboQuad ||
			!this.vboBase ||
			!this.vboSize ||
			!this.vboDepth
		) {
			throw new Error("sparkles-field: VAO/VBO allocation failed");
		}

		const count = Math.max(0, Math.floor(this.config.count));
		this.instanceCount = count;

		// quad unité
		const quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);

		// distribution pseudo-aléatoire mais stable (seed + taille canvas)
		const rand = rng(
			(this.config.seed ?? 1) ^ (this.canvasW + 31 * this.canvasH),
		);
		const bases = new Float32Array(count * 2);
		const sizes = new Float32Array(count);
		const depths = new Float32Array(count);

		const minS = this.config.minSizePx;
		const maxS = Math.max(minS, this.config.maxSizePx);

		const padX = Math.min(40, this.canvasW * 0.05);
		const padY = Math.min(40, this.canvasH * 0.05);

		for (let i = 0; i < count; i++) {
			const rx = rand();
			const ry = rand();
			const dRaw = rand();

			bases[i * 2 + 0] = padX + rx * Math.max(1, this.canvasW - padX * 2);
			bases[i * 2 + 1] = padY + ry * Math.max(1, this.canvasH - padY * 2);

			const depth = pow(dRaw, 1.2); // 0 proche, 1 loin
			depths[i] = depth;

			const near = 1.0 - depth;
			const jitter = pow(rand(), 1.4);
			const kNear = 0.75;
			const bias = kNear * near + (1.0 - kNear) * jitter;

			sizes[i] = minS + bias * (maxS - minS);
		}

		gl.bindVertexArray(this.vao);

		// a_unitPos (loc 0)
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboQuad);
		gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		// a_base (loc 1)
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboBase);
		gl.bufferData(gl.ARRAY_BUFFER, bases, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(1, 1);

		// a_sizePx (loc 2)
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboSize);
		gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(2, 1);

		// a_depth (loc 3)
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboDepth);
		gl.bufferData(gl.ARRAY_BUFFER, depths, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(3, 1);

		gl.bindVertexArray(null);
	}
}

// petit helper GLSL-like
function pow(x: number, e: number) {
	return x ** e;
}
