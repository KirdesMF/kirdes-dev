// FILE: src/components/wave-text/sparkles.ts
import { createProgram, getUniform } from "../../lib/webgl";

const SPARKLE_TEXTURE_URL = new URL("/assets/msdf/sparkle.png", import.meta.url).href;

const vsSource = `#version 300 es
  precision highp float;

  layout(location = 0) in vec2 a_position;
  layout(location = 1) in vec2 a_uv;

  uniform vec2  u_resolution;
  uniform float u_phase;
  uniform float u_amplitude;
  uniform float u_frequency;
  // u_offset.x: world X offset of the sparkle group (anchor along the wave)
  // u_offset.y: vertical offset above the wave baseline (px, >0 = above)
  uniform vec2  u_offset;
  // 0.0 = no deformation, 1.0 = full deformation along wave normal
  uniform float u_deformStrength;
  // uniform scale factor for sparkle geometry
  uniform float u_scale;

  out vec2 v_uv;

  void main() {
    v_uv = a_uv;

    // Local sprite position (two-quads layout), scaled
    vec2 local = a_position * u_scale;

    // World X: anchor + local.x (same convention as text: geometry encodes X)
    float xWorld = u_offset.x + local.x;

    // Wave sample at this X (same formula as text)
    float arg      = xWorld * u_frequency + u_phase;
    float wave     = sin(arg) * u_amplitude;
    float baselineY = u_resolution.y * 0.5 + wave;

    // Slope and normal of the wave at this X
    float slope = cos(arg) * u_amplitude * u_frequency;
    vec2  tangent = normalize(vec2(1.0, slope));
    vec2  normal  = vec2(-tangent.y, tangent.x);

    // Distance above the wave baseline (same sign convention as text)
    float offsetAbove = u_offset.y;

    // Blend between axis-aligned up vector and the true normal
    float k = clamp(u_deformStrength, 0.0, 1.0);
    vec2 upAxis = vec2(0.0, -1.0);      // screen up (negative Y in clip space)
    vec2 basisY = normalize(mix(upAxis, -normal, k));

    // Base point on the curve
    vec2 basePos = vec2(xWorld, baselineY);

    // Move above the wave by offsetAbove and then apply local.y along basisY.
    // Sign chosen so that for k=0 we approximate the previous behaviour:
    // baselineY - offsetAbove + local.y
    vec2 world = basePos + basisY * (offsetAbove - local.y);

    vec2 clip = vec2(
      (world.x / u_resolution.x) * 2.0 - 1.0,
      ((world.y / u_resolution.y) * 2.0 - 1.0) * -1.0
    );

    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

const fsSource = `#version 300 es
  precision highp float;

  uniform sampler2D u_texture;
  uniform vec4      u_tint;
  uniform float     u_pxRange;

  uniform vec2  u_lensCenterPx;
  uniform float u_lensRadiusPx;
  uniform float u_lensFeatherPx;

  in vec2 v_uv;
  out vec4 outColor;

  float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
  }

  void main() {
    vec3 msd = texture(u_texture, v_uv).rgb;
    float sd = median(msd.r, msd.g, msd.b) - 0.5;

    float alphaFill = clamp(sd * u_pxRange + 0.5, 0.0, 1.0);

    float edgeWidth = 0.12;
    float edgeDist = abs(sd);
    float outline = 1.0 - smoothstep(0.0, edgeWidth, edgeDist);

    float d = distance(gl_FragCoord.xy, u_lensCenterPx);
    float m = 1.0 - smoothstep(
      u_lensRadiusPx - u_lensFeatherPx,
      u_lensRadiusPx + u_lensFeatherPx,
      d
    );

    vec4 baseColor = vec4(u_tint.rgb, u_tint.a * alphaFill);
    vec4 lensColor = vec4(u_tint.rgb, u_tint.a * outline);

    vec4 color = mix(baseColor, lensColor, m);

    if (color.a <= 0.01) {
      discard;
    }
    outColor = color;
  }
`;

export type SparkleUniforms = {
	resolution: { width: number; height: number };
	phase: number;
	amplitude: number;
	frequency: number;
	offset: { x: number; y: number };
	lens: {
		centerPx: { x: number; y: number };
		radiusPx: number;
		featherPx: number;
	};
};

export type SparkleParams = {
	tint: [number, number, number, number];
	deformStrength: number;
	scale: number;
	spacingPx: number;
};

const DEFAULT_PARAMS: SparkleParams = {
	tint: [1, 1, 1, 1],
	deformStrength: 1,
	scale: 2,
	spacingPx: 20,
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

	#uResolution: WebGLUniformLocation;
	#uPhase: WebGLUniformLocation;
	#uAmplitude: WebGLUniformLocation;
	#uFrequency: WebGLUniformLocation;
	#uOffset: WebGLUniformLocation;
	#uDeformStrength: WebGLUniformLocation;
	#uTexture: WebGLUniformLocation;
	#uTint: WebGLUniformLocation;
	#uScale: WebGLUniformLocation;
	#uPxRange: WebGLUniformLocation;

	#uLensCenterPx: WebGLUniformLocation;
	#uLensRadiusPx: WebGLUniformLocation;
	#uLensFeatherPx: WebGLUniformLocation;

	#params: SparkleParams;
	#isReady = false;
	#scale: number;
	#pxRange: number;

	constructor(gl: WebGL2RenderingContext, params?: Partial<SparkleParams>) {
		this.#gl = gl;
		this.#program = createProgram({ gl, vsSource, fsSource });

		this.#params = {
			...DEFAULT_PARAMS,
			...(params ?? {}),
		};

		this.#scale = this.#params.scale;
		this.#pxRange = 4;

		this.#uResolution = getUniform(gl, this.#program, "u_resolution");
		this.#uPhase = getUniform(gl, this.#program, "u_phase");
		this.#uAmplitude = getUniform(gl, this.#program, "u_amplitude");
		this.#uFrequency = getUniform(gl, this.#program, "u_frequency");
		this.#uOffset = getUniform(gl, this.#program, "u_offset");
		this.#uDeformStrength = getUniform(gl, this.#program, "u_deformStrength");
		this.#uTexture = getUniform(gl, this.#program, "u_texture");
		this.#uTint = getUniform(gl, this.#program, "u_tint");
		this.#uScale = getUniform(gl, this.#program, "u_scale");
		this.#uPxRange = getUniform(gl, this.#program, "u_pxRange");

		this.#uLensCenterPx = getUniform(gl, this.#program, "u_lensCenterPx");
		this.#uLensRadiusPx = getUniform(gl, this.#program, "u_lensRadiusPx");
		this.#uLensFeatherPx = getUniform(gl, this.#program, "u_lensFeatherPx");

		this.#buildGeometry();
		this.#loadTexture();
	}

	setTint(tint: [number, number, number, number]): void {
		this.#params = {
			...this.#params,
			tint,
		};
	}

	setDeformStrength(deformStrength: number): void {
		const clamped = Number.isFinite(deformStrength) ? deformStrength : this.#params.deformStrength;
		const bounded = Math.max(0, Math.min(clamped, 1));
		this.#params = {
			...this.#params,
			deformStrength: bounded,
		};
	}

	setScale(scale: number): void {
		if (!Number.isFinite(scale) || scale <= 0) {
			return;
		}
		this.#scale = scale;
		this.#params = {
			...this.#params,
			scale,
		};
	}

	render(u: SparkleUniforms): void {
		if (!this.#isReady || !this.#vao || this.#indexCount === 0 || !this.#texture) return;

		const gl = this.#gl;
		gl.useProgram(this.#program);

		gl.uniform2f(this.#uResolution, u.resolution.width, u.resolution.height);
		gl.uniform1f(this.#uPhase, u.phase);
		gl.uniform1f(this.#uAmplitude, u.amplitude);
		gl.uniform1f(this.#uFrequency, u.frequency);
		gl.uniform2f(this.#uOffset, u.offset.x, u.offset.y);
		gl.uniform1f(this.#uDeformStrength, this.#params.deformStrength);
		gl.uniform1f(this.#uScale, this.#scale);

		gl.uniform1f(this.#uPxRange, this.#pxRange);

		gl.uniform2f(this.#uLensCenterPx, u.lens.centerPx.x, u.lens.centerPx.y);
		gl.uniform1f(this.#uLensRadiusPx, u.lens.radiusPx);
		gl.uniform1f(this.#uLensFeatherPx, u.lens.featherPx);

		gl.uniform4f(this.#uTint, this.#params.tint[0], this.#params.tint[1], this.#params.tint[2], this.#params.tint[3]);

		gl.activeTexture(this.#gl.TEXTURE0);
		gl.bindTexture(this.#gl.TEXTURE_2D, this.#texture);
		gl.uniform1i(this.#uTexture, 0);

		gl.bindVertexArray(this.#vao);
		gl.drawElements(this.#gl.TRIANGLES, this.#indexCount, this.#gl.UNSIGNED_SHORT, 0);
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

	#buildGeometry(): void {
		// Two sparkles, each a small quad (base size before scale).
		const sizePx = 40;
		const half = sizePx * 0.5;

		// First sparkle centered at (0, 0).
		const s0x0 = -half;
		const s0x1 = half;
		const s0y0 = -half;
		const s0y1 = half;

		// Second sparkle slightly to the right and above the first.
		const offsetX = this.#params.spacingPx;
		const offsetY = 48;
		const s1x0 = offsetX - half;
		const s1x1 = offsetX + half;
		const s1y0 = -(offsetY + half);
		const s1y1 = -(offsetY - half);

		const positions: number[] = [
			// sparkle 0
			s0x0,
			s0y0,
			s0x1,
			s0y0,
			s0x0,
			s0y1,
			s0x1,
			s0y1,
			// sparkle 1
			s1x0,
			s1y0,
			s1x1,
			s1y0,
			s1x0,
			s1y1,
			s1x1,
			s1y1,
		];

		const uvs: number[] = [
			// sparkle 0
			0, 0, 1, 0, 0, 1, 1, 1,
			// sparkle 1
			0, 0, 1, 0, 0, 1, 1, 1,
		];

		const indices: number[] = [0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7];

		this.#indexCount = indices.length;

		const gl = this.#gl;
		this.#vao = gl.createVertexArray();
		this.#vboPos = gl.createBuffer();
		this.#vboUv = gl.createBuffer();
		this.#ibo = gl.createBuffer();

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
