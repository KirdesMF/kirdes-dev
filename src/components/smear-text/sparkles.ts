import { createProgram, getUniform } from "../../lib/webgl";

const SPARKLE_TEXTURE_URL = new URL("/assets/msdf/sparkle.png", import.meta.url).href;

const vsSource = `#version 300 es
  precision highp float;

  layout(location = 0) in vec2 a_position; // (x, z) in local space
  layout(location = 1) in vec2 a_uv;

  uniform mat4 u_viewProj;
  uniform mat4 u_model;
  uniform vec2 u_cursor; // (x, z) world-space cursor on the plane
  uniform vec2 u_velocity; // cursor velocity (world units per frame)
  uniform float u_cursorActive;
  uniform float u_radius;
  uniform float u_lift;
  uniform float u_smear;

  out vec2 v_uv;

  void main() {
    v_uv = a_uv;
    vec2 p = a_position;

    vec2 d = p - u_cursor;
    float dist = length(d);
    float speed = length(u_velocity);
    float speedNorm = clamp(speed * 0.04, 0.0, 1.0);

    float upBoost = clamp(-u_velocity.y * 0.02, 0.0, 1.0);
    float radius = u_radius * (1.0 + upBoost * 1.6);

    float near = 1.0 - smoothstep(0.0, radius, dist);
    near = pow(near, 0.6);

    float right = smoothstep(0.0, radius * 0.75, d.x);

    float lift = u_cursorActive * u_lift * near * right * (0.45 + speedNorm * 0.75) * (1.0 + upBoost * 0.9);
    vec3 localPos = vec3(p.x, lift, p.y);

    vec2 velDir = speed > 1e-5 ? (u_velocity / speed) : vec2(0.0);
    float smear = u_cursorActive * u_smear * near * right * speedNorm * (1.0 + upBoost * 1.3);
    localPos.x += velDir.x * smear;
    localPos.z += velDir.y * smear;

    gl_Position = u_viewProj * u_model * vec4(localPos, 1.0);
  }
`;

const fsSource = `#version 300 es
  precision highp float;

  uniform sampler2D u_texture;
  uniform vec4      u_tint;

  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    // The sparkle texture is an RGBA mask; use the alpha channel.
    float a = texture(u_texture, v_uv).a;
    float w = fwidth(a);
    float alpha = smoothstep(0.5 - w, 0.5 + w, a);
    if (alpha <= 0.01) {
      discard;
    }

    outColor = vec4(u_tint.rgb, u_tint.a * alpha);
  }
`;

export type SparkleSpec = {
	x: number;
	z: number;
	size: number;
	rotationRad?: number;
};

export class SparkleSprites {
	#gl: WebGL2RenderingContext;
	#program: WebGLProgram;

	#texture: WebGLTexture | null = null;
	#vao: WebGLVertexArrayObject | null = null;
	#vboPos: WebGLBuffer | null = null;
	#vboUv: WebGLBuffer | null = null;
	#ibo: WebGLBuffer | null = null;
	#indexCount = 0;

	#uViewProj: WebGLUniformLocation;
	#uModel: WebGLUniformLocation;
	#uCursor: WebGLUniformLocation;
	#uVelocity: WebGLUniformLocation;
	#uCursorActive: WebGLUniformLocation;
	#uRadius: WebGLUniformLocation;
	#uLift: WebGLUniformLocation;
	#uSmear: WebGLUniformLocation;
	#uTexture: WebGLUniformLocation;
	#uTint: WebGLUniformLocation;

	#tint: [number, number, number, number];
	#isReady = false;

	constructor(
		gl: WebGL2RenderingContext,
		{ sparkles, tint }: { sparkles: SparkleSpec[]; tint?: [number, number, number, number] },
	) {
		this.#gl = gl;
		this.#program = createProgram({ gl, vsSource, fsSource });

		this.#uViewProj = getUniform(gl, this.#program, "u_viewProj");
		this.#uModel = getUniform(gl, this.#program, "u_model");
		this.#uCursor = getUniform(gl, this.#program, "u_cursor");
		this.#uVelocity = getUniform(gl, this.#program, "u_velocity");
		this.#uCursorActive = getUniform(gl, this.#program, "u_cursorActive");
		this.#uRadius = getUniform(gl, this.#program, "u_radius");
		this.#uLift = getUniform(gl, this.#program, "u_lift");
		this.#uSmear = getUniform(gl, this.#program, "u_smear");
		this.#uTexture = getUniform(gl, this.#program, "u_texture");
		this.#uTint = getUniform(gl, this.#program, "u_tint");

		this.#tint = tint ?? [1, 1, 1, 1];

		this.rebuild(sparkles);
		this.#loadTexture();
	}

	setTint(tint: [number, number, number, number]): void {
		this.#tint = tint;
	}

	rebuild(sparkles: SparkleSpec[]): void {
		this.#buildGeometry(sparkles);
	}

	render({
		viewProj,
		model,
		cursor,
		velocity,
		cursorActive,
		radius,
		lift,
		smear,
	}: {
		viewProj: Float32Array;
		model: Float32Array;
		cursor: { x: number; z: number };
		velocity: { x: number; z: number };
		cursorActive: number;
		radius: number;
		lift: number;
		smear: number;
	}): void {
		if (!this.#isReady || !this.#texture || !this.#vao || this.#indexCount === 0) return;

		const gl = this.#gl;
		gl.useProgram(this.#program);

		gl.uniformMatrix4fv(this.#uViewProj, false, viewProj);
		gl.uniformMatrix4fv(this.#uModel, false, model);
		gl.uniform2f(this.#uCursor, cursor.x, cursor.z);
		gl.uniform2f(this.#uVelocity, velocity.x, velocity.z);
		gl.uniform1f(this.#uCursorActive, cursorActive);
		gl.uniform1f(this.#uRadius, radius);
		gl.uniform1f(this.#uLift, lift);
		gl.uniform1f(this.#uSmear, smear);
		gl.uniform4f(this.#uTint, this.#tint[0], this.#tint[1], this.#tint[2], this.#tint[3]);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.#texture);
		gl.uniform1i(this.#uTexture, 0);

		gl.bindVertexArray(this.#vao);
		gl.drawElements(gl.TRIANGLES, this.#indexCount, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}

	dispose(): void {
		const gl = this.#gl;
		if (this.#vao) gl.deleteVertexArray(this.#vao);
		if (this.#vboPos) gl.deleteBuffer(this.#vboPos);
		if (this.#vboUv) gl.deleteBuffer(this.#vboUv);
		if (this.#ibo) gl.deleteBuffer(this.#ibo);
		if (this.#texture) gl.deleteTexture(this.#texture);
		gl.deleteProgram(this.#program);
	}

	#buildGeometry(sparkles: SparkleSpec[]): void {
		const gridX = 24;
		const gridY = 24;

		const positions: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];

		for (const sparkle of sparkles) {
			const size = Math.max(1, sparkle.size);
			const half = size * 0.5;
			const rot = sparkle.rotationRad ?? 0;
			const cos = Math.cos(rot);
			const sin = Math.sin(rot);

			const baseIndex = positions.length / 2;

			for (let iy = 0; iy <= gridY; iy++) {
				const ty = gridY > 0 ? iy / gridY : 0;
				const dz = -half + (half - -half) * ty;
				const v = ty;

				for (let ix = 0; ix <= gridX; ix++) {
					const tx = gridX > 0 ? ix / gridX : 0;
					const dx = -half + (half - -half) * tx;
					const u = tx;

					const rx = dx * cos - dz * sin;
					const rz = dx * sin + dz * cos;
					positions.push(sparkle.x + rx, sparkle.z + rz);
					uvs.push(u, v);
				}
			}

			const vertsPerRow = gridX + 1;
			for (let iy = 0; iy < gridY; iy++) {
				for (let ix = 0; ix < gridX; ix++) {
					const rowStart = baseIndex + iy * vertsPerRow;
					const tl = rowStart + ix;
					const tr = tl + 1;
					const bl = rowStart + vertsPerRow + ix;
					const br = bl + 1;
					indices.push(tl, bl, tr, tr, bl, br);
				}
			}
		}

		this.#uploadGeometry(positions, uvs, indices);
	}

	#uploadGeometry(positions: number[], uvs: number[], indices: number[]): void {
		const gl = this.#gl;

		if (!this.#vao) {
			this.#vao = gl.createVertexArray();
		}
		if (!this.#vboPos) {
			this.#vboPos = gl.createBuffer();
		}
		if (!this.#vboUv) {
			this.#vboUv = gl.createBuffer();
		}
		if (!this.#ibo) {
			this.#ibo = gl.createBuffer();
		}

		if (!this.#vao || !this.#vboPos || !this.#vboUv || !this.#ibo) {
			throw new Error("SparkleSprites: failed to allocate geometry buffers");
		}

		gl.bindVertexArray(this.#vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboPos);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboUv);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#ibo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

		gl.bindVertexArray(null);
		this.#indexCount = indices.length;
	}

	#loadTexture(): void {
		const image = new Image();
		image.src = SPARKLE_TEXTURE_URL;

		image.addEventListener("load", () => {
			const gl = this.#gl;
			const texture = gl.createTexture();
			if (!texture) {
				return;
			}
			this.#texture = texture;

			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindTexture(gl.TEXTURE_2D, null);

			this.#isReady = true;
		});

		image.addEventListener("error", () => {
			// eslint-disable-next-line no-console
			console.error("SparkleSprites: failed to load texture", SPARKLE_TEXTURE_URL);
		});
	}
}
