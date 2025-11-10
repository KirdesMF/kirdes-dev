// wave-line.ts
// ------------------------------------------------------------
// Rôles :
// - Build (rare)    : segments (géométrie, buffers)
// - Config (style)  : couleur, dashPeriodPx, dashDuty
// - Uniforms (frame): resolution, phase, amplitude, frequency, lens
// ------------------------------------------------------------

import { createBuffer, createProgram, getUniform } from "./_helpers";

// ---------- Shaders ----------
const VS = `#version 300 es
precision highp float;

layout(location = 0) in float a_x;          // x normalisé [0..1]
uniform vec2  u_resolution;                 // px
uniform float u_phase;                      // rad
uniform float u_amplitude;                  // px
uniform float u_frequency;                  // rad/px
uniform vec2  u_ampEnvelope;               // multipliers start/end
uniform float u_baselineSlope;             // px delta across width

void main() {
  float xPx = a_x * u_resolution.x;
  float norm = clamp(a_x, 0.0, 1.0);
  float ramp = smoothstep(0.0, 0.5, norm);
  float env = mix(u_ampEnvelope.x, u_ampEnvelope.y, ramp);
  float wave = sin(xPx * u_frequency + u_phase) * u_amplitude * env;
  float anchorWave = sin(u_phase) * u_amplitude * u_ampEnvelope.x;
  float baseline = u_resolution.y * 0.5 + (norm - 0.5) * u_baselineSlope;
  float y = baseline + (wave - anchorWave);

  vec2 clip = vec2(
    (xPx / u_resolution.x) * 2.0 - 1.0,
    ((y / u_resolution.y) * 2.0 - 1.0) * -1.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const FS = `#version 300 es
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

// ---------- Types publics ----------
export type WaveLineBuild = {
	segments: number; // géométrie : nécessite (re)allocation VBO/VAO
};

export type WaveLineConfig = {
	color: [number, number, number, number]; // RGBA 0..1
	isDashed: boolean;
	dashPeriodPx: number;
	dashDuty: number;
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

// ---------- Defaults ----------
const BUILD_DEFAULTS: WaveLineBuild = { segments: 768 };

const CONFIG_DEFAULTS: WaveLineConfig = {
	color: [1, 1, 1, 1],
	isDashed: true,
	dashPeriodPx: 14,
	dashDuty: 0.55,
};

// ---------- Classe ----------
export class WaveLine {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;

	private build: WaveLineBuild;
	public config: WaveLineConfig;

	private vbo!: WebGLBuffer;
	private vao!: WebGLVertexArrayObject;

	// uniforms (cached)
	private uResolution: WebGLUniformLocation;
	private uPhase: WebGLUniformLocation;
	private uAmplitude: WebGLUniformLocation;
	private uFrequency: WebGLUniformLocation;
	private uAmpEnvelope: WebGLUniformLocation;
	private uBaselineSlope: WebGLUniformLocation;
	private uColor: WebGLUniformLocation;
	private uDashEnabled: WebGLUniformLocation;
	private uDashPeriodPx: WebGLUniformLocation;
	private uDashDuty: WebGLUniformLocation;
	private uLensCenterPx: WebGLUniformLocation;
	private uLensRadiusPx: WebGLUniformLocation;
	private uLensFeatherPx: WebGLUniformLocation;

	constructor(
		gl: WebGL2RenderingContext,
		build?: Partial<WaveLineBuild>,
		config?: Partial<WaveLineConfig>,
	) {
		this.gl = gl;
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		this.build = { ...BUILD_DEFAULTS, ...build };
		this.config = { ...CONFIG_DEFAULTS, ...config };

		this.allocateBuffers();
		this.uResolution = getUniform(gl, this.program, "u_resolution");
		this.uPhase = getUniform(gl, this.program, "u_phase");
		this.uAmplitude = getUniform(gl, this.program, "u_amplitude");
		this.uFrequency = getUniform(gl, this.program, "u_frequency");
		this.uAmpEnvelope = getUniform(gl, this.program, "u_ampEnvelope");
		this.uBaselineSlope = getUniform(gl, this.program, "u_baselineSlope");
		this.uColor = getUniform(gl, this.program, "u_color");
		this.uDashEnabled = getUniform(gl, this.program, "u_dashEnabled");
		this.uDashPeriodPx = getUniform(gl, this.program, "u_dashPeriodPx");
		this.uDashDuty = getUniform(gl, this.program, "u_dashDuty");
		this.uLensCenterPx = getUniform(gl, this.program, "u_lensCenterPx");
		this.uLensRadiusPx = getUniform(gl, this.program, "u_lensRadiusPx");
		this.uLensFeatherPx = getUniform(gl, this.program, "u_lensFeatherPx");
	}

	// -------- API Build --------
	public rebuild(patch: Partial<WaveLineBuild>) {
		const next = { ...this.build, ...patch };
		if (next.segments !== this.build.segments) {
			this.build = next;
			this.disposeBuffersOnly();
			this.allocateBuffers();
		} else {
			this.build = next;
		}
	}

	// -------- API Config --------
	public updateConfig(patch: Partial<WaveLineConfig>) {
		this.config = { ...this.config, ...patch };
		// Simple & clair : on pousse quand même ces uniforms à chaque frame dans render()
		// (Si tu veux optimiser : uploader ici les uniforms “stables” et les retirer de render)
	}

	// -------- Render (Uniforms) --------
	public render(u: WaveLineUniforms) {
		const gl = this.gl;
		gl.useProgram(this.program);

		// uniforms runtime (frame)
		gl.uniform2f(this.uResolution, u.resolution.width, u.resolution.height);
		gl.uniform1f(this.uPhase, u.phase);
		gl.uniform1f(this.uAmplitude, u.amplitude);
		gl.uniform1f(this.uFrequency, u.frequency);
		gl.uniform2f(this.uAmpEnvelope, u.ampEnvelope.start, u.ampEnvelope.end);
		gl.uniform1f(this.uBaselineSlope, u.baselineSlopePx);

		// uniforms issus de la config (style)
		gl.uniform4f(
			this.uColor,
			this.config.color[0],
			this.config.color[1],
			this.config.color[2],
			this.config.color[3],
		);
		gl.uniform1i(this.uDashEnabled, this.config.isDashed ? 1 : 0);
		gl.uniform1f(this.uDashPeriodPx, this.config.dashPeriodPx);
		gl.uniform1f(this.uDashDuty, this.config.dashDuty);

		// lens
		gl.uniform2f(this.uLensCenterPx, u.lens.centerPx.x, u.lens.centerPx.y);
		gl.uniform1f(this.uLensRadiusPx, u.lens.radiusPx);
		gl.uniform1f(this.uLensFeatherPx, u.lens.featherPx);

		gl.bindVertexArray(this.vao);
		gl.drawArrays(gl.LINE_STRIP, 0, this.build.segments);
		gl.bindVertexArray(null);
	}

	public dispose() {
		this.disposeBuffersOnly();
		this.gl.deleteProgram(this.program);
	}

	// -------- Internals --------
	private allocateBuffers() {
		const gl = this.gl;

		// positions 1D (x in [0..1])
		const xs = new Float32Array(this.build.segments);
		for (let i = 0; i < this.build.segments; i++)
			xs[i] = i / (this.build.segments - 1);
		this.vbo = createBuffer({ gl, target: gl.ARRAY_BUFFER, data: xs });

		const vao = gl.createVertexArray();
		if (!vao) throw new Error("WaveLine: VAO alloc failed");
		this.vao = vao;

		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
	}

	private disposeBuffersOnly() {
		const gl = this.gl;
		if (this.vao) gl.deleteVertexArray(this.vao);
		if (this.vbo) gl.deleteBuffer(this.vbo);
		// Noter: on garde le program (les shaders ne changent pas)
	}
}
