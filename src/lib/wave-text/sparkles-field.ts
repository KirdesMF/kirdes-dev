// sparkles-field.ts
import { createProgram, sendLensUniforms } from "./_utils";

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

// Opacité (identique à avant)
uniform float u_minSizePx;
uniform float u_maxSizePx;
uniform float u_alphaMin;
uniform float u_alphaMax;
uniform float u_depthBias;

// Lentille
uniform vec2  u_lensCenterPx;
uniform float u_lensRadiusPx;
uniform float u_lensFeatherPx;

in vec2  v_uv;
flat in float v_sizePx;
flat in float v_depth;

out vec4 outColor;

// -------------------- Réglages “artistiques” --------------------
const float LINE_HALF_UV   = 0.02; // demi-épaisseur des traits en UV (0.06 ≈ traits fins)
const float AA_GAIN        = 1.0;  // anti-aliasing

// Dashed (uniquement dans la lentille)
const float DASH_PERIOD_PX = 8.0; // période (px écran)
const float DASH_DUTY      = 0.55; // rapport cyclique (0..1), 0.5 = 50% plein, 50% vide
// ----------------------------------------------------------------

void main() {
  // ===== Opacité de base (comme avant)
  float denom   = max(0.0001, u_maxSizePx - u_minSizePx);
  float tSize   = clamp((v_sizePx - u_minSizePx) / denom, 0.0, 1.0);
  float alphaSz = mix(u_alphaMin, u_alphaMax, tSize);
  float depthA  = mix(1.0, 1.0 - u_depthBias, v_depth);
  float baseA   = alphaSz * depthA;

  // Coord UV centrées
  vec2 p = v_uv * 2.0 - 1.0;

  // Épaisseur + AA en UV (dépendant de la taille écran via fwidth)
  float aa = max(fwidth(p.x), fwidth(p.y)) * AA_GAIN;

  // Deux traits : vertical (près de x=0) et horizontal (près de y=0)
  float vLine = 1.0 - smoothstep(LINE_HALF_UV, LINE_HALF_UV + aa, abs(p.x));
  float hLine = 1.0 - smoothstep(LINE_HALF_UV, LINE_HALF_UV + aa, abs(p.y));

  // Croix “fine” (sans remplissage)
  float crossMask = max(vLine, hLine);

  // Couleur des sparkles
  vec3  rgb = vec3(1.0);

  // Lentille (masque écran)
  float dLens = distance(gl_FragCoord.xy, u_lensCenterPx);
  float mLens = 1.0 - smoothstep(
    u_lensRadiusPx - u_lensFeatherPx,
    u_lensRadiusPx + u_lensFeatherPx,
    dLens
  );

  // ===== Hors lentille : traits pleins
  float alphaOut = baseA * crossMask;

  // ===== Dans la lentille : traits “dashed”
  //   - pour la barre verticale, on dash selon Y écran (gl_FragCoord.y)
  //   - pour la barre horizontale, on dash selon X écran (gl_FragCoord.x)
  // new (lens-locked): bands live in coords centered on the lens
  vec2 q = gl_FragCoord.xy - u_lensCenterPx;

  // (optional) micro-quantize to calm shimmer on movement:
  // q = floor(q * 0.1) / 0.5;

  float sawY = fract(q.y / DASH_PERIOD_PX);
  float sawX = fract(q.x / DASH_PERIOD_PX);
  float dashV = step(0.0, sawY) * step(sawY, DASH_DUTY); // 1 si dans la partie “pleine”
  float dashH = step(0.0, sawX) * step(sawX, DASH_DUTY);

  float dashedMask = max(vLine * dashV, hLine * dashH);

  // Blend : on remplace le plein par dashed dans la lentille
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
	color: string; // couleur du plus
	texSize: number; // résolution texture du plus
	seed?: number; // optionnel: random seed
	alphaMin?: number; // alpha des plus petits (ex: 0.15)
	alphaMax?: number; // alpha des plus grands (ex: 0.7)
	depthBias?: number; // atténuation par profondeur 0..1 (ex: 0.35)
};

export type SparklesFieldUniforms = {
	resolution: { width: number; height: number };
	parallax: { x: number; y: number }; // [-1..1] relatif au centre du canvas
	reduceMotion?: boolean;
	lens: {
		centerPx: { x: number; y: number };
		radiusPx: number;
		featherPx: number;
	};
};

function rng(seed: number) {
	// xorshift32 simple
	let s = seed | 0 || 123456789;
	return () => {
		s ^= s << 13;
		s ^= s >> 17;
		s ^= s << 5;
		// [0,1)
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

	private uRes: WebGLUniformLocation;
	private uParallax: WebGLUniformLocation;
	private uStrength: WebGLUniformLocation;
	private uMinSize: WebGLUniformLocation;
	private uMaxSize: WebGLUniformLocation;
	private uAlphaMin: WebGLUniformLocation;
	private uAlphaMax: WebGLUniformLocation;
	private uDepthBias: WebGLUniformLocation;

	private config: SparklesFieldConfig;

	public constructor(
		gl: WebGL2RenderingContext,
		cfg: Partial<SparklesFieldConfig> = {},
	) {
		this.gl = gl;
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		this.config = {
			count: 80,
			minSizePx: 4,
			maxSizePx: 16,
			parallaxStrengthPx: 50,
			color: "#ffffff",
			texSize: 48,
			seed: 999, // 0xc0ffee
			alphaMin: 0.1,
			alphaMax: 0.8,
			depthBias: 0.6,
			...cfg,
		};

		const uRes = gl.getUniformLocation(this.program, "u_resolution");
		const uParallax = gl.getUniformLocation(this.program, "u_parallax");
		const uStrength = gl.getUniformLocation(this.program, "u_strengthPx");
		if (!uRes || !uParallax || !uStrength) {
			throw new Error("sparkles-field: uniform(s) not found");
		}

		const uMinSize = gl.getUniformLocation(this.program, "u_minSizePx");
		const uMaxSize = gl.getUniformLocation(this.program, "u_maxSizePx");
		const uAlphaMin = gl.getUniformLocation(this.program, "u_alphaMin");
		const uAlphaMax = gl.getUniformLocation(this.program, "u_alphaMax");
		const uDepthBias = gl.getUniformLocation(this.program, "u_depthBias");
		if (!uMinSize || !uMaxSize || !uAlphaMin || !uAlphaMax || !uDepthBias) {
			throw new Error("sparkles-field: opacity uniforms not found");
		}

		this.uRes = uRes;
		this.uParallax = uParallax;
		this.uStrength = uStrength;
		this.uMinSize = uMinSize;
		this.uMaxSize = uMaxSize;
		this.uAlphaMin = uAlphaMin;
		this.uAlphaMax = uAlphaMax;
		this.uDepthBias = uDepthBias;

		this.allocBuffers();
	}

	public updateConfig(cfg: Partial<SparklesFieldConfig>): void {
		this.config = { ...this.config, ...cfg };
		// pas besoin de rebuild si tailles / count ne changent pas, sinon:
		if (
			cfg.count !== undefined ||
			cfg.minSizePx !== undefined ||
			cfg.maxSizePx !== undefined
		) {
			this.allocBuffers(); // remet tout (positions, tailles, profondeurs)
		}
	}

	public resize(args: { width: number; height: number }): void {
		const { width, height } = args;
		if (width === this.canvasW && height === this.canvasH) return;
		this.canvasW = width;
		this.canvasH = height;
		this.allocBuffers(); // recalcule positions dans les nouvelles dimensions
	}

	public render(uniforms: SparklesFieldUniforms): void {
		const gl = this.gl;
		if (!this.vao) return;

		gl.useProgram(this.program);

		gl.uniform2f(
			this.uRes,
			uniforms.resolution.width,
			uniforms.resolution.height,
		);

		sendLensUniforms({ gl, program: this.program, lens: uniforms.lens });
		gl.uniform1f(this.uMinSize, this.config.minSizePx);
		gl.uniform1f(this.uMaxSize, this.config.maxSizePx);
		gl.uniform1f(this.uAlphaMin, this.config.alphaMin ?? 0.15);
		gl.uniform1f(this.uAlphaMax, this.config.alphaMax ?? 0.7);
		gl.uniform1f(this.uDepthBias, this.config.depthBias ?? 0.35);

		const uLensMode = gl.getUniformLocation(this.program, "u_lensMode");
		if (uLensMode) gl.uniform1i(uLensMode, 1); // 1 = outline-only in lens

		// reduceMotion atténue la force
		const strength =
			this.config.parallaxStrengthPx * (uniforms.reduceMotion ? 0.4 : 1.0);
		gl.uniform1f(this.uStrength, strength);

		gl.uniform2f(this.uParallax, uniforms.parallax.x, uniforms.parallax.y);

		gl.bindVertexArray(this.vao);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
		gl.bindVertexArray(null);
	}

	public dispose(): void {
		const gl = this.gl;
		if (this.vao) gl.deleteVertexArray(this.vao);
		if (this.vboQuad) gl.deleteBuffer(this.vboQuad);
		if (this.vboBase) gl.deleteBuffer(this.vboBase);
		if (this.vboSize) gl.deleteBuffer(this.vboSize);
		if (this.vboDepth) gl.deleteBuffer(this.vboDepth);
		gl.deleteProgram(this.program);

		this.vao = null;
		this.vboQuad = null;
		this.vboBase = null;
		this.vboSize = null;
		this.vboDepth = null;
	}

	// --- internals ---

	private allocBuffers(): void {
		const gl = this.gl;

		// (ré)alloue VAO/VBO si nécessaire
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

		// quad unit
		const quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);

		// random distrib
		const rand = rng(
			(this.config.seed ?? 1) ^ (this.canvasW + 31 * this.canvasH),
		);
		const bases = new Float32Array(count * 2);
		const sizes = new Float32Array(count);
		const depths = new Float32Array(count);

		const minS = this.config.minSizePx;
		const maxS = Math.max(minS, this.config.maxSizePx);

		// léger padding pour éviter de coller aux bords
		const padX = Math.min(40, this.canvasW * 0.05);
		const padY = Math.min(40, this.canvasH * 0.05);

		for (let i = 0; i < count; i++) {
			const rx = rand(); // 0..1
			const ry = rand();
			const dRaw = rand(); // profondeur brute 0..1

			// positions
			bases[i * 2 + 0] = padX + rx * Math.max(1, this.canvasW - padX * 2);
			bases[i * 2 + 1] = padY + ry * Math.max(1, this.canvasH - padY * 2);

			// profondeur (biais léger vers "loin")
			const depth = dRaw ** 1.2; // 0 = près, 1 = loin
			depths[i] = depth;

			// taille liée à la profondeur : près => plus grand ; loin => plus petit
			const near = 1.0 - depth; // 1 = près ; 0 = loin
			const jitter = rand() ** 1.4; // variation douce, biaisée petit
			const kNear = 0.75; // poids du near vs jitter (0..1)
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
