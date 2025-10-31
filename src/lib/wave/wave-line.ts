import {
	createBuffer,
	createProgram,
	cssColorToVec3,
	getUniform,
} from "./_helpers";

const VS = `#version 300 es
  precision highp float;

  layout(location = 0) in float a_x;          // x normalisé [0..1]
  uniform vec2  u_resolution;                 // px
  uniform float u_phase;                      // rad
  uniform float u_amplitude;                  // px
  uniform float u_frequency;                  // rad/px

  void main() {
    float xPx = a_x * u_resolution.x;
    float y = sin(xPx * u_frequency + u_phase) * u_amplitude + (u_resolution.y * 0.5);

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
  uniform int   u_dashEnabled;     // 0 = off (ligne pleine), 1 = on
  uniform float u_dashPeriodPx;    // ex: 14.0
  uniform float u_dashDuty;        // 0..1, ex: 0.55

  void main() {
    vec4 c = u_color;

    // masque lentille
    float d = distance(gl_FragCoord.xy, u_lensCenterPx);
    float m = 1.0 - smoothstep(u_lensRadiusPx - u_lensFeatherPx,u_lensRadiusPx + u_lensFeatherPx, d);

    // alpha de base (plein)
    float alphaBase = c.a;

    // dashes lens-local (stables quand la lens bouge)
    // On dash selon l'axe X local de la lentille (tu peux passer à .y si tu préfères)
    float dashMask = 1.0;
    if (u_dashEnabled == 1) {
      vec2 q = gl_FragCoord.xy - u_lensCenterPx;   // coords locales lens (px)
      float saw = fract(q.x / max(1.0, u_dashPeriodPx));
      dashMask = step(0.0, saw) * step(saw, clamp(u_dashDuty, 0.0, 1.0));
    }

    // Dans la lens: on mixe vers dashed ; hors lens: plein
    float alpha = mix(alphaBase, alphaBase * dashMask, m);

    if (alpha < 0.01) discard;
    outColor = vec4(c.rgb, alpha);
  }
`;

export type WaveLineConfig = {
	dashPeriodPx: number;
	dashDuty: number;
	color: string;
};

const CONFIG_DEFAULTS: WaveLineConfig = {
	dashPeriodPx: 10.0,
	dashDuty: 0.5,
	color: "#ffffff",
};

export type WaveLineUniforms = {
	resolution: { width: number; height: number };
	amplitude: number;
	frequency: number;
	phase: number;
	lens: {
		centerPx: { x: number; y: number };
		radiusPx: number;
		featherPx: number;
	};
};

export class WaveLine {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;
	private vbo: WebGLBuffer;
	private vao: WebGLVertexArrayObject;

	// uniforms (cached)
	private uResolution: WebGLUniformLocation;
	private uPhase: WebGLUniformLocation;
	private uAmplitude: WebGLUniformLocation;
	private uFrequency: WebGLUniformLocation;
	private uColor: WebGLUniformLocation;
	private uDashEnabled: WebGLUniformLocation;
	private uDashPeriodPx: WebGLUniformLocation;
	private uDashDuty: WebGLUniformLocation;

	// lens uniforms (cached)
	private uLensCenterPx: WebGLUniformLocation;
	private uLensRadiusPx: WebGLUniformLocation;
	private uLensFeatherPx: WebGLUniformLocation;

	private color: [number, number, number];
	private segments: number;

	public config: WaveLineConfig;

	public constructor(gl: WebGL2RenderingContext, segments = 768) {
		this.gl = gl;
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });
		this.segments = Math.max(2, segments);

		this.config = { ...CONFIG_DEFAULTS };
		this.color = cssColorToVec3(this.config.color);

		// positions 1D (x in [0..1])
		const xs = new Float32Array(this.segments);
		for (let i = 0; i < this.segments; i++) xs[i] = i / (this.segments - 1);
		this.vbo = createBuffer({ gl, target: gl.ARRAY_BUFFER, data: xs });

		const vao = gl.createVertexArray();
		if (!vao) throw new Error("Failed to create VAO");
		this.vao = vao;

		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);

		// cache uniforms
		this.uResolution = getUniform(gl, this.program, "u_resolution");
		this.uPhase = getUniform(gl, this.program, "u_phase");
		this.uAmplitude = getUniform(gl, this.program, "u_amplitude");
		this.uFrequency = getUniform(gl, this.program, "u_frequency");
		this.uColor = getUniform(gl, this.program, "u_color");
		this.uDashEnabled = getUniform(gl, this.program, "u_dashEnabled");
		this.uDashPeriodPx = getUniform(gl, this.program, "u_dashPeriodPx");
		this.uDashDuty = getUniform(gl, this.program, "u_dashDuty");
		this.uLensCenterPx = getUniform(gl, this.program, "u_lensCenterPx");
		this.uLensRadiusPx = getUniform(gl, this.program, "u_lensRadiusPx");
		this.uLensFeatherPx = getUniform(gl, this.program, "u_lensFeatherPx");
	}

	public render(args: WaveLineUniforms) {
		const { resolution, lens } = args;
		const gl = this.gl;
		gl.useProgram(this.program);

		gl.uniform2f(this.uResolution, resolution.width, resolution.height);
		gl.uniform1f(this.uPhase, args.phase);
		gl.uniform1f(this.uAmplitude, args.amplitude);
		gl.uniform1f(this.uFrequency, args.frequency);
		gl.uniform4f(this.uColor, ...this.color, 1);
		gl.uniform1i(this.uDashEnabled, 1);
		gl.uniform1f(this.uDashPeriodPx, this.config.dashPeriodPx);
		gl.uniform1f(this.uDashDuty, this.config.dashDuty);

		// lens
		gl.uniform2f(this.uLensCenterPx, lens.centerPx.x, lens.centerPx.y);
		gl.uniform1f(this.uLensRadiusPx, lens.radiusPx);
		gl.uniform1f(this.uLensFeatherPx, lens.featherPx);

		gl.bindVertexArray(this.vao);
		gl.drawArrays(gl.LINE_STRIP, 0, this.segments);
		gl.bindVertexArray(null);
	}

	public dispose() {
		this.gl.deleteVertexArray(this.vao);
		this.gl.deleteBuffer(this.vbo);
		this.gl.deleteProgram(this.program);
	}
}
