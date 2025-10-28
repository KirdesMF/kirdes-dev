// wave-line.ts
import { createBuffer, createProgram } from "./_utils";

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
      ((y   / u_resolution.y) * 2.0 - 1.0) * -1.0
    );
    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

const FS = `#version 300 es
  precision highp float;
  out vec4 outColor;
  uniform vec4 u_color;

  void main() {
    outColor = u_color; // ligne pleine
  }
`;

export type WaveLineParams = {
	amplitude: number; // px
	frequency: number; // rad/px
	phase: number; // rad
	color: [number, number, number, number]; // RGBA 0..1
};

function getUniform(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	name: string,
): WebGLUniformLocation {
	const loc = gl.getUniformLocation(program, name);
	if (loc === null) throw new Error(`uniform ${name} not found`);
	return loc;
}

export class WaveLine {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;
	private vbo: WebGLBuffer;
	private vao: WebGLVertexArrayObject;

	// uniforms (cachés)
	private uResolution: WebGLUniformLocation;
	private uPhase: WebGLUniformLocation;
	private uAmplitude: WebGLUniformLocation;
	private uFrequency: WebGLUniformLocation;
	private uColor: WebGLUniformLocation;

	private pointCount: number;

	public constructor(gl: WebGL2RenderingContext, pointCount = 1024) {
		this.gl = gl;
		this.pointCount = Math.max(2, pointCount);

		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		// positions 1D (x in [0..1])
		const xs = new Float32Array(this.pointCount);
		for (let i = 0; i < this.pointCount; i++) xs[i] = i / (this.pointCount - 1);

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
	}

	public render(args: {
		resolution: { width: number; height: number };
		params: WaveLineParams;
	}): void {
		const { resolution, params } = args;
		const gl = this.gl;
		gl.useProgram(this.program);

		gl.uniform2f(this.uResolution, resolution.width, resolution.height);
		gl.uniform1f(this.uPhase, params.phase);
		gl.uniform1f(this.uAmplitude, params.amplitude);
		gl.uniform1f(this.uFrequency, params.frequency);
		gl.uniform4f(
			this.uColor,
			params.color[0],
			params.color[1],
			params.color[2],
			params.color[3],
		);

		gl.bindVertexArray(this.vao);
		gl.drawArrays(gl.LINE_STRIP, 0, this.pointCount);
		gl.bindVertexArray(null);
	}

	public dispose(): void {
		const gl = this.gl;
		gl.deleteVertexArray(this.vao);
		gl.deleteBuffer(this.vbo);
		gl.deleteProgram(this.program);
	}
}
