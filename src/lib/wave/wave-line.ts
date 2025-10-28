import { WAVE_CONFIG } from "./_config";
import { createBuffer, createProgram } from "./_utils";

const VERTEX_SHADER = `
  attribute float a_x;
  uniform vec2 u_resolution;
  uniform float u_phase;
  uniform float u_amplitude;
  uniform float u_frequency;
  varying float v_xpx;

  void main() {
    float x = a_x * u_resolution.x;
    float y = sin(x * u_frequency + u_phase) * u_amplitude + (u_resolution.y / 2.0);
    v_xpx = x;
    vec2 clipSpace = (vec2(x, y) / u_resolution) * 2.0 - 1.0;
    clipSpace.y *= -1.0;
    gl_Position = vec4(clipSpace, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  #extension GL_OES_standard_derivatives : enable
  precision mediump float;
  varying float v_xpx;
  uniform float u_dashOnPx;
  uniform float u_dashOffPx;
  uniform float u_dashShift;
  uniform vec4 u_color;

  void main() {
    float period = u_dashOnPx + u_dashOffPx;
    float seg = mod(v_xpx + u_dashShift, period);
    float aa = fwidth(seg) + 0.75;
    float mask = smoothstep(u_dashOnPx + aa, u_dashOnPx - aa, seg);
    gl_FragColor = vec4(u_color.rgb, u_color.a * mask);
  }
`;

export class WaveLine {
	#gl: WebGLRenderingContext;
	#program: WebGLProgram;
	#buffer: WebGLBuffer;
	#pointCount = WAVE_CONFIG.LINE.POINT_COUNT;

	constructor(gl: WebGLRenderingContext) {
		this.#gl = gl;
		this.#program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);

		// Create line positions (0 to 1)
		const positions = new Float32Array(this.#pointCount);
		for (let i = 0; i < this.#pointCount; i++) {
			positions[i] = i / (this.#pointCount - 1);
		}

		this.#buffer = createBuffer(gl, positions);
	}

	render({
		canvasWidth,
		canvasHeight,
		phase,
		frequency,
		amplitude,
		dashShift,
		color,
	}: {
		canvasWidth: number;
		canvasHeight: number;
		phase: number;
		frequency: number;
		amplitude: number;
		dashShift: number;
		color: [number, number, number, number];
	}) {
		const gl = this.#gl;
		gl.useProgram(this.#program);

		// set uniforms
		gl.uniform2f(
			gl.getUniformLocation(this.#program, "u_resolution"),
			canvasWidth,
			canvasHeight,
		);
		gl.uniform1f(gl.getUniformLocation(this.#program, "u_phase"), phase);
		gl.uniform1f(
			gl.getUniformLocation(this.#program, "u_amplitude"),
			amplitude,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.#program, "u_frequency"),
			frequency,
		);
		gl.uniform1f(gl.getUniformLocation(this.#program, "u_dashOnPx"), 8.0);
		gl.uniform1f(gl.getUniformLocation(this.#program, "u_dashOffPx"), 4.0);
		gl.uniform1f(
			gl.getUniformLocation(this.#program, "u_dashShift"),
			dashShift,
		);
		gl.uniform4f(
			gl.getUniformLocation(this.#program, "u_color"),
			color[0],
			color[1],
			color[2],
			color[3],
		);

		// set attribute
		const xLoc = gl.getAttribLocation(this.#program, "a_x");
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
		gl.enableVertexAttribArray(xLoc);
		gl.vertexAttribPointer(xLoc, 1, gl.FLOAT, false, 0, 0);

		// draw
		gl.drawArrays(gl.LINE_STRIP, 0, this.#pointCount);
	}

	dispose() {
		const gl = this.#gl;
		gl.deleteProgram(this.#program);
		gl.deleteBuffer(this.#buffer);
	}
}
