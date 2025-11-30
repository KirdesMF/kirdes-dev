import { createBuffer, createProgram, getUniform } from "../../lib/webgl";

// ---------- Shaders ----------
const vsSource = `#version 300 es
  precision highp float;

  // Param le long de la ligne [0..1]
  layout(location = 0) in float a_x;
  // Côté du ruban: -1.0 / +1.0
  layout(location = 1) in float a_side;

  uniform vec2  u_resolution;     // px
  uniform float u_phase;          // rad
  uniform float u_amplitude;      // px
  uniform float u_frequency;      // rad/px
  uniform vec2  u_ampEnvelope;    // multipliers start/end
  uniform float u_baselineSlope;  // px delta across width
  uniform float u_lineWidthPx;    // épaisseur du ruban

  void main() {
    float width  = u_resolution.x;
    float height = u_resolution.y;

    float t = clamp(a_x, 0.0, 1.0);
    float xWorld = t * width;

    float env = mix(u_ampEnvelope.x, u_ampEnvelope.y, t);

    float arg  = xWorld * u_frequency + u_phase;
    float wave = sin(arg) * u_amplitude * env;

    // baseline centrée + tilt global + wave
    float baseline = height * 0.5 + (t - 0.5) * u_baselineSlope + wave;

    // pente de la courbe (dY/dX): wave + tilt global
    float slopeWave = cos(arg) * u_amplitude * env * u_frequency;
    float slopeTilt = u_baselineSlope / width;
    float slope     = slopeWave + slopeTilt;

    vec2 tangent = normalize(vec2(1.0, slope));
    vec2 normal  = vec2(-tangent.y, tangent.x);

    float halfWidth = 0.5 * u_lineWidthPx;

    vec2 center   = vec2(xWorld, baseline);
    vec2 worldPos = center + normal * a_side * halfWidth;

    vec2 clip = vec2(
      (worldPos.x / width) * 2.0 - 1.0,
      ((worldPos.y / height) * 2.0 - 1.0) * -1.0
    );

    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

const fsSource = `#version 300 es
  precision highp float;

  out vec4 outColor;

  uniform vec4  u_color;

  // Lens
  uniform vec2  u_lensCenterPx;
  uniform float u_lensRadiusPx;
  uniform float u_lensFeatherPx;

  // Dashes (lens-local)
  uniform int   u_dashEnabled;     // 0 = off, 1 = on
  uniform float u_dashPeriodPx;    // ex: 14.0
  uniform float u_dashDuty;        // 0..1, ex: 0.55

  void main() {
    vec4 c = u_color;

    // masque lentille
    float d = distance(gl_FragCoord.xy, u_lensCenterPx);
    float m = 1.0 - smoothstep(
      u_lensRadiusPx - u_lensFeatherPx,
      u_lensRadiusPx + u_lensFeatherPx,
      d
    );

    float alphaBase = c.a;

    // dashed, stables en coords locales à la lens
    float dashMask = 1.0;
    if (u_dashEnabled == 1) {
      vec2 q = gl_FragCoord.xy - u_lensCenterPx;
      float saw = fract(q.x / max(1.0, u_dashPeriodPx));
      dashMask = step(0.0, saw) * step(saw, clamp(u_dashDuty, 0.0, 1.0));
    }

    // Dans la lens → dashed ; hors lens → plein
    float alpha = mix(alphaBase, alphaBase * dashMask, m);

    if (alpha < 0.01) discard;
    outColor = vec4(c.rgb, alpha);
  }
`;

export type WaveLineBuild = {
	segments: number;
};

export type WaveLineConfig = {
	color: [number, number, number, number];
	isDashed: boolean;
	dashPeriodPx: number;
	dashDuty: number;
	lineWidthPx: number;
};

export type WaveLineUniforms = {
	resolution: { width: number; height: number };
	phase: number;
	amplitude: number;
	frequency: number;
	ampEnvelope: { start: number; end: number };
	baselineSlopePx: number;
	lens: {
		centerPx: { x: number; y: number };
		radiusPx: number;
		featherPx: number;
	};
};

const BUILD_DEFAULTS: WaveLineBuild = { segments: 768 };

const CONFIG_DEFAULTS: WaveLineConfig = {
	color: [1, 1, 1, 1],
	isDashed: true,
	dashPeriodPx: 14,
	dashDuty: 0.55,
	lineWidthPx: 4.0,
};

export class WaveLine {
	#gl: WebGL2RenderingContext;
	#program: WebGLProgram;

	#build: WaveLineBuild;
	#vao: WebGLVertexArrayObject | null = null;
	#vboX: WebGLBuffer | null = null;
	#vboSide: WebGLBuffer | null = null;
	#ibo: WebGLBuffer | null = null;
	#indexCount = 0;

	#uResolution: WebGLUniformLocation;
	#uPhase: WebGLUniformLocation;
	#uAmplitude: WebGLUniformLocation;
	#uFrequency: WebGLUniformLocation;
	#uAmpEnvelope: WebGLUniformLocation;
	#uBaselineSlope: WebGLUniformLocation;
	#uLineWidthPx: WebGLUniformLocation;
	#uColor: WebGLUniformLocation;
	#uDashEnabled: WebGLUniformLocation;
	#uDashPeriodPx: WebGLUniformLocation;
	#uDashDuty: WebGLUniformLocation;
	#uLensCenterPx: WebGLUniformLocation;
	#uLensRadiusPx: WebGLUniformLocation;
	#uLensFeatherPx: WebGLUniformLocation;

	config: WaveLineConfig;

	constructor({
		gl,
		build,
		config,
	}: {
		gl: WebGL2RenderingContext;
		build?: Partial<WaveLineBuild>;
		config?: Partial<WaveLineConfig>;
	}) {
		this.#gl = gl;
		this.#program = createProgram({ gl, vsSource, fsSource });

		this.#build = { ...BUILD_DEFAULTS, ...build };
		this.config = { ...CONFIG_DEFAULTS, ...config };

		this.#buildGeometry();

		this.#uResolution = getUniform(gl, this.#program, "u_resolution");
		this.#uPhase = getUniform(gl, this.#program, "u_phase");
		this.#uAmplitude = getUniform(gl, this.#program, "u_amplitude");
		this.#uFrequency = getUniform(gl, this.#program, "u_frequency");
		this.#uAmpEnvelope = getUniform(gl, this.#program, "u_ampEnvelope");
		this.#uBaselineSlope = getUniform(gl, this.#program, "u_baselineSlope");
		this.#uLineWidthPx = getUniform(gl, this.#program, "u_lineWidthPx");
		this.#uColor = getUniform(gl, this.#program, "u_color");
		this.#uDashEnabled = getUniform(gl, this.#program, "u_dashEnabled");
		this.#uDashPeriodPx = getUniform(gl, this.#program, "u_dashPeriodPx");
		this.#uDashDuty = getUniform(gl, this.#program, "u_dashDuty");
		this.#uLensCenterPx = getUniform(gl, this.#program, "u_lensCenterPx");
		this.#uLensRadiusPx = getUniform(gl, this.#program, "u_lensRadiusPx");
		this.#uLensFeatherPx = getUniform(gl, this.#program, "u_lensFeatherPx");
	}

	render(u: WaveLineUniforms): void {
		if (!this.#vao || this.#indexCount === 0) return;

		const gl = this.#gl;
		gl.useProgram(this.#program);

		gl.uniform2f(this.#uResolution, u.resolution.width, u.resolution.height);
		gl.uniform1f(this.#uPhase, u.phase);
		gl.uniform1f(this.#uAmplitude, u.amplitude);
		gl.uniform1f(this.#uFrequency, u.frequency);
		gl.uniform2f(this.#uAmpEnvelope, u.ampEnvelope.start, u.ampEnvelope.end);
		gl.uniform1f(this.#uBaselineSlope, u.baselineSlopePx);
		gl.uniform1f(this.#uLineWidthPx, this.config.lineWidthPx);

		gl.uniform4f(this.#uColor, this.config.color[0], this.config.color[1], this.config.color[2], this.config.color[3]);
		gl.uniform1i(this.#uDashEnabled, this.config.isDashed ? 1 : 0);
		gl.uniform1f(this.#uDashPeriodPx, this.config.dashPeriodPx);
		gl.uniform1f(this.#uDashDuty, this.config.dashDuty);

		gl.uniform2f(this.#uLensCenterPx, u.lens.centerPx.x, u.lens.centerPx.y);
		gl.uniform1f(this.#uLensRadiusPx, u.lens.radiusPx);
		gl.uniform1f(this.#uLensFeatherPx, u.lens.featherPx);

		gl.bindVertexArray(this.#vao);
		gl.drawElements(gl.TRIANGLES, this.#indexCount, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}

	updateConfig(config: Partial<WaveLineConfig>): void {
		this.config = { ...this.config, ...config };
	}

	rebuild(build: Partial<WaveLineBuild>): void {
		const next = { ...this.#build, ...build };
		const segmentsChanged = next.segments !== this.#build.segments;
		this.#build = next;
		if (segmentsChanged) {
			this.#disposeGeometry();
			this.#buildGeometry();
		}
	}

	dispose(): void {
		this.#disposeGeometry();
		this.#gl.deleteProgram(this.#program);
	}

	#buildGeometry(): void {
		const gl = this.#gl;

		const segments = this.#build.segments > 1 ? this.#build.segments : BUILD_DEFAULTS.segments;

		const xs: number[] = [];
		const sides: number[] = [];
		const indices: number[] = [];

		for (let i = 0; i < segments; i++) {
			const t = segments > 1 ? i / (segments - 1) : 0;
			xs.push(t, t);
			sides.push(-1, 1);
		}

		for (let i = 0; i < segments - 1; i++) {
			const base = i * 2;
			const i0 = base;
			const i1 = base + 1;
			const i2 = base + 2;
			const i3 = base + 3;

			indices.push(i0, i2, i1);
			indices.push(i1, i2, i3);
		}

		this.#indexCount = indices.length;

		const vboX = createBuffer({
			gl,
			target: gl.ARRAY_BUFFER,
			data: new Float32Array(xs),
		});
		const vboSide = createBuffer({
			gl,
			target: gl.ARRAY_BUFFER,
			data: new Float32Array(sides),
		});
		const ibo = createBuffer({
			gl,
			target: gl.ELEMENT_ARRAY_BUFFER,
			data: new Uint16Array(indices),
		});

		const vao = gl.createVertexArray();
		if (!vao) {
			throw new Error("WaveLine: VAO alloc failed");
		}

		this.#vao = vao;
		this.#vboX = vboX;
		this.#vboSide = vboSide;
		this.#ibo = ibo;

		gl.bindVertexArray(this.#vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboX);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboSide);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#ibo);

		gl.bindVertexArray(null);
	}

	#disposeGeometry(): void {
		const gl = this.#gl;

		if (this.#vboX) {
			gl.deleteBuffer(this.#vboX);
			this.#vboX = null;
		}
		if (this.#vboSide) {
			gl.deleteBuffer(this.#vboSide);
			this.#vboSide = null;
		}
		if (this.#ibo) {
			gl.deleteBuffer(this.#ibo);
			this.#ibo = null;
		}
		if (this.#vao) {
			gl.deleteVertexArray(this.#vao);
			this.#vao = null;
		}
		this.#indexCount = 0;
	}
}
