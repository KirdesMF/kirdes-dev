// FILE: src/components/ripple-text/displacement-pass.ts
import { createProgram, getUniform } from "../../lib/webgl";
import type { RippleConfig, RippleInstance } from "./ripples";

const MAX_RIPPLES = 8;

const vsSource = `#version 300 es
  precision highp float;

  layout(location = 0) in vec2 a_position;
  layout(location = 1) in vec2 a_uv;

  out vec2 v_uv;

  void main() {
    v_uv = a_uv;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fsSource = `#version 300 es
  precision highp float;

  const int MAX_RIPPLES = 8;

  uniform sampler2D u_sceneTexture;
  uniform vec2      u_resolution;
  uniform float     u_timeSec;

  uniform int   u_rippleCount;
  uniform vec2  u_rippleCenter[MAX_RIPPLES];
  uniform float u_rippleStartTime[MAX_RIPPLES];
  uniform float u_rippleAmplitude[MAX_RIPPLES];
  uniform float u_rippleFrequency[MAX_RIPPLES];
  uniform float u_rippleSpeed;
  uniform float u_rippleMaxRadius;

  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    vec2 samplePos = vec2(
       v_uv.x * u_resolution.x,
       (1.0 - v_uv.y) * u_resolution.y
     );

    // Displacement procédural type "front de vague"
    for (int i = 0; i < MAX_RIPPLES; i++) {
      if (i >= u_rippleCount) {
        break;
      }

      float t = u_timeSec - u_rippleStartTime[i];
      if (t < 0.0) {
        continue;
      }

      vec2 toPos = samplePos - u_rippleCenter[i];
      float dist = length(toPos);
      if (dist <= 0.0001) {
        continue;
      }

      float frontRadius = t * u_rippleSpeed;
      if (frontRadius <= 0.0 || frontRadius > u_rippleMaxRadius) {
        continue;
      }

      float distToFront = dist - frontRadius;
      float bandWidth = u_rippleMaxRadius * 0.08;
      float band = 1.0 - smoothstep(-bandWidth, bandWidth, abs(distToFront));

      float phase = dist * u_rippleFrequency[i];
      float wave = sin(phase) * u_rippleAmplitude[i];

      float offsetMag = wave * band;
      if (abs(offsetMag) < 0.0001) {
        continue;
      }

      vec2 dir = toPos / dist;
      samplePos += dir * offsetMag;
    }

    vec2 displacedUv = samplePos / u_resolution;
    displacedUv = clamp(displacedUv, vec2(0.0), vec2(1.0));

    vec4 color = texture(u_sceneTexture, displacedUv);
    outColor = color;
  }
`;

export type DisplacementUniforms = {
	resolution: { width: number; height: number };
	timeSec: number;
	ripples: RippleInstance[];
	rippleConfig: RippleConfig;
	sceneTexture: WebGLTexture | null;
};

export class DisplacementPass {
	#gl: WebGL2RenderingContext;
	#program: WebGLProgram;

	#vao: WebGLVertexArrayObject | null = null;
	#vboPos: WebGLBuffer | null = null;
	#vboUv: WebGLBuffer | null = null;

	#uSceneTexture: WebGLUniformLocation;
	#uResolution: WebGLUniformLocation;
	#uTimeSec: WebGLUniformLocation;
	#uRippleCount: WebGLUniformLocation;
	#uRippleCenter: WebGLUniformLocation;
	#uRippleStartTime: WebGLUniformLocation;
	#uRippleAmplitude: WebGLUniformLocation;
	#uRippleFrequency: WebGLUniformLocation;
	#uRippleSpeed: WebGLUniformLocation;
	#uRippleMaxRadius: WebGLUniformLocation;

	constructor(gl: WebGL2RenderingContext) {
		this.#gl = gl;
		this.#program = createProgram({ gl, vsSource, fsSource });

		this.#uSceneTexture = getUniform(gl, this.#program, "u_sceneTexture");
		this.#uResolution = getUniform(gl, this.#program, "u_resolution");
		this.#uTimeSec = getUniform(gl, this.#program, "u_timeSec");
		this.#uRippleCount = getUniform(gl, this.#program, "u_rippleCount");
		this.#uRippleCenter = getUniform(gl, this.#program, "u_rippleCenter");
		this.#uRippleStartTime = getUniform(gl, this.#program, "u_rippleStartTime");
		this.#uRippleAmplitude = getUniform(gl, this.#program, "u_rippleAmplitude");
		this.#uRippleFrequency = getUniform(gl, this.#program, "u_rippleFrequency");
		this.#uRippleSpeed = getUniform(gl, this.#program, "u_rippleSpeed");
		this.#uRippleMaxRadius = getUniform(gl, this.#program, "u_rippleMaxRadius");

		this.#buildGeometry();
	}

	render(u: DisplacementUniforms): void {
		if (!this.#vao || !u.sceneTexture) {
			return;
		}

		const gl = this.#gl;
		gl.useProgram(this.#program);

		gl.uniform2f(this.#uResolution, u.resolution.width, u.resolution.height);
		gl.uniform1f(this.#uTimeSec, u.timeSec);

		const ripples = u.ripples.slice(0, MAX_RIPPLES);
		const count = ripples.length;
		gl.uniform1i(this.#uRippleCount, count);

		const centers = new Float32Array(MAX_RIPPLES * 2);
		const startTimes = new Float32Array(MAX_RIPPLES);
		const amplitudes = new Float32Array(MAX_RIPPLES);
		const frequencies = new Float32Array(MAX_RIPPLES);

		for (let i = 0; i < count; i++) {
			const r = ripples[i];
			centers[i * 2] = r.centerPx.x;
			centers[i * 2 + 1] = r.centerPx.y;
			startTimes[i] = r.startTimeSec;
			amplitudes[i] = r.amplitude;
			frequencies[i] = r.frequency;
		}

		gl.uniform2fv(this.#uRippleCenter, centers);
		gl.uniform1fv(this.#uRippleStartTime, startTimes);
		gl.uniform1fv(this.#uRippleAmplitude, amplitudes);
		gl.uniform1fv(this.#uRippleFrequency, frequencies);
		gl.uniform1f(this.#uRippleSpeed, u.rippleConfig.speed);
		gl.uniform1f(this.#uRippleMaxRadius, u.rippleConfig.maxRadius);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, u.sceneTexture);
		gl.uniform1i(this.#uSceneTexture, 0);

		gl.bindVertexArray(this.#vao);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.bindVertexArray(null);
	}

	dispose(): void {
		const gl = this.#gl;
		if (this.#vao) gl.deleteVertexArray(this.#vao);
		if (this.#vboPos) gl.deleteBuffer(this.#vboPos);
		if (this.#vboUv) gl.deleteBuffer(this.#vboUv);
		gl.deleteProgram(this.#program);
	}

	#buildGeometry(): void {
		const gl = this.#gl;

		const positions = new Float32Array([
			-1,
			-1, //
			1,
			-1, //
			-1,
			1, //
			1,
			1,
		]);

		const uvs = new Float32Array([
			0,
			0, //
			1,
			0, //
			0,
			1, //
			1,
			1,
		]);

		const vao = gl.createVertexArray();
		const vboPos = gl.createBuffer();
		const vboUv = gl.createBuffer();

		if (!vao || !vboPos || !vboUv) {
			throw new Error("DisplacementPass: failed to allocate fullscreen quad buffers");
		}

		this.#vao = vao;
		this.#vboPos = vboPos;
		this.#vboUv = vboUv;

		gl.bindVertexArray(vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, vboPos);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, vboUv);
		gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

		gl.bindVertexArray(null);
	}
}

// Simple test function to validate mapping logic in isolation
export function testDisplacementUvMapping(): boolean {
	const width = 800;
	const height = 600;
	const uvCenter = { x: 0.5, y: 0.5 };
	const px = { x: uvCenter.x * width, y: uvCenter.y * height };
	const backUv = { x: px.x / width, y: px.y / height };
	const epsilon = 1e-6;
	const dx = Math.abs(backUv.x - uvCenter.x);
	const dy = Math.abs(backUv.y - uvCenter.y);
	return dx < epsilon && dy < epsilon;
}
