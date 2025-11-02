import { createProgram, getUniform } from "./_helpers";

const SHADER_CONSTANTS = {
	lensHatchAlpha: 0.6,
	lensOutlineGain: 1.15,
} as const;

const VS = `#version 300 es
  precision highp float;

  layout(location=0) in vec2 a_unitPos;
  layout(location=1) in vec4 a_state0; // baseX(px), baseYOffset(px), sizePx, depth
  layout(location=2) in vec4 a_state1; // speedPx, rotSpeed(rad/s), alphaBase, baseRotation(rad)
  layout(location=3) in vec3 a_state2; // timeOffset(s), tiltAmplitude(rad), tiltSpeed(rad/s)

  uniform vec2  u_resolution;
  uniform vec2  u_areaSize;
  uniform vec2  u_offset;
  uniform float u_phase;
  uniform float u_amplitude;
  uniform float u_frequency;
  uniform float u_time;
  uniform float u_direction;
  uniform float u_depthWaveNear;
  uniform float u_depthWaveFar;

  out vec2 v_uv;
  flat out float v_alpha;
  flat out float v_depth;

  void main() {
    float baseX    = a_state0.x;
    float baseYOffset = a_state0.y;
    float sizePx   = a_state0.z;
    float depth    = clamp(a_state0.w, 0.0, 1.0);

    float speedPx  = a_state1.x;
    float rotSpeed = a_state1.y;
    float alphaBase = a_state1.z;
    float baseRotation = a_state1.w;
    float timeOffset = a_state2.x;
    float tiltAmplitude = a_state2.y;
    float tiltSpeed = a_state2.z;

    float t = u_time + timeOffset;

    float dir = u_direction;
    float wrapSpan = max(1.0, u_areaSize.x);
    float xTravel = baseX + speedPx * dir * t;
    float xWrapped = mod(xTravel, wrapSpan);
    if (xWrapped < 0.0) {
      xWrapped += wrapSpan;
    }
    float posX = u_offset.x + xWrapped;

    float localAmplitude = mix(u_depthWaveNear, u_depthWaveFar, depth) * u_amplitude;
    float wave  = sin(posX * u_frequency + u_phase) * localAmplitude;
    float slope = cos(posX * u_frequency + u_phase) * localAmplitude * u_frequency;
    float stretch = sqrt(1.0 + slope * slope);

    float baseline = u_resolution.y * 0.5;
    float baseY = u_offset.y + baseYOffset;
    float yDeformed = baseline + (baseY + wave - baseline) * stretch;

    float tiltAngle = tiltAmplitude * sin((u_time + timeOffset) * tiltSpeed);
    float angle = baseRotation + rotSpeed * t;
    float c = cos(angle);
    float s = sin(angle);
    vec2 local = a_unitPos * sizePx;
    float tiltCos = cos(tiltAngle);
    float tiltSin = sin(tiltAngle);
    local.y *= tiltCos;
    local.y += tiltSin * sizePx * 0.3;

    vec2 localOffset = mat2(c, -s, s, c) * local;

    vec2 finalPos = vec2(posX, yDeformed) + localOffset;

    vec2 clip = (finalPos / u_resolution) * 2.0 - 1.0;
    clip.y *= -1.0;

    v_uv = a_unitPos + 0.5;
    v_alpha = alphaBase;
    v_depth = depth;

    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

const FS = `#version 300 es
  precision mediump float;

  uniform sampler2D u_sprite;
  uniform vec3  u_color;
  uniform float u_baseAlpha;
  uniform float u_outlineWidth;
  uniform float u_depthAlphaNear;
  uniform float u_depthAlphaFar;

  uniform vec2  u_lensCenterPx;
  uniform float u_lensRadiusPx;
  uniform float u_lensFeatherPx;
  uniform float u_dashPeriodPx;
  uniform float u_dashDuty;
  uniform float u_dashAngleDeg;

  in vec2 v_uv;
  flat in float v_alpha;
  flat in float v_depth;

  out vec4 outColor;

  float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
  }

  void main() {
    vec3 spriteSample = texture(u_sprite, v_uv).rgb;
    float sd = median(spriteSample.r, spriteSample.g, spriteSample.b) - 0.5;
    float aa = max(fwidth(sd), 1e-5);

    float fillMask = smoothstep(-aa, aa, sd);
    float outlineMask = smoothstep(-aa, aa, sd + u_outlineWidth) -
                        smoothstep(-aa, aa, sd - u_outlineWidth);
    outlineMask = clamp(outlineMask, 0.0, 1.0);

    if (fillMask <= 0.0 && outlineMask <= 0.0) discard;

    float dLens = distance(gl_FragCoord.xy, u_lensCenterPx);
    float mLens = 1.0 - smoothstep(
      u_lensRadiusPx - u_lensFeatherPx,
      u_lensRadiusPx + u_lensFeatherPx,
      dLens
    );

    float period = max(1.0, u_dashPeriodPx);
    vec2  q      = gl_FragCoord.xy - u_lensCenterPx;
    float duty   = clamp(u_dashDuty, 0.0, 1.0);
    float ang    = radians(u_dashAngleDeg);
    mat2 rot     = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 r       = rot * q;
    float saw    = fract(r.x / period);
    float hatch  = step(0.0, saw) * step(saw, duty);

    float insideMask = clamp(outlineMask * ${SHADER_CONSTANTS.lensOutlineGain.toFixed(
			6,
		)} + fillMask * hatch * ${SHADER_CONSTANTS.lensHatchAlpha.toFixed(6)}, 0.0, 1.0);
    float maskFinal = mix(fillMask, insideMask, mLens);

    float depthAlpha = mix(u_depthAlphaFar, u_depthAlphaNear, clamp(1.0 - v_depth, 0.0, 1.0));
    float alpha = u_baseAlpha * v_alpha * depthAlpha * maskFinal;

    if (alpha < 0.01) discard;
    outColor = vec4(u_color, alpha);
  }
`;

export type WaveParticlesConfig = {
	count: number;
	spriteUrl: string;
	color: [number, number, number];
	baseAlpha: number;
	areaWidth: number;
	areaHeight: number;
	sizeRangePx: [number, number];
	yOffsetRangePx: [number, number];
	speedRangePxPerSec: [number, number];
	rotationSpeedRangeDeg: [number, number];
	rotationBaseRangeDeg: [number, number];
	tiltAmplitudeDegRange: [number, number];
	tiltSpeedRangeHz: [number, number];
	alphaRange: [number, number];
	depthRange: [number, number];
	depthWaveNear: number;
	depthWaveFar: number;
	depthAlphaNear: number;
	depthAlphaFar: number;
	outlineWidth: number;
	dashPeriodPx: number;
	dashDuty: number;
	dashAngleDeg: number;
	direction: 1 | -1;
	seed?: number;
};

export type WaveParticlesUniforms = {
	resolution: { width: number; height: number };
	phase: number;
	amplitude: number;
	frequency: number;
	offset: { x: number; y: number };
	areaSize: { width: number; height: number };
	time: number;
	lens: {
		centerPx: { x: number; y: number };
		radiusPx: number;
		featherPx: number;
	};
};

const CONFIG_DEFAULTS: WaveParticlesConfig = {
	count: 80,
	spriteUrl: "/assets/msdf/sparkle.png",
	color: [1, 1, 1],
	baseAlpha: 0.9,
	areaWidth: 1000,
	areaHeight: 480,
	sizeRangePx: [24, 64],
	yOffsetRangePx: [-140, 140],
	speedRangePxPerSec: [40, 180],
	rotationSpeedRangeDeg: [-40, 40],
	rotationBaseRangeDeg: [-25, 25],
	tiltAmplitudeDegRange: [0, 35],
	tiltSpeedRangeHz: [0.2, 0.6],
	alphaRange: [0.35, 1.0],
	depthRange: [0.05, 0.85],
	depthWaveNear: 1.0,
	depthWaveFar: 0.45,
	depthAlphaNear: 1.0,
	depthAlphaFar: 0.55,
	outlineWidth: 0.12,
	dashPeriodPx: 8.0,
	dashDuty: 0.55,
	dashAngleDeg: 45.0,
	direction: 1,
	seed: 7,
};

function mixRange([min, max]: [number, number], t: number) {
	return min + (max - min) * t;
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function rng(seed: number) {
	let s = seed | 0 || 1234567;
	return () => {
		s ^= s << 13;
		s ^= s >> 17;
		s ^= s << 5;
		return (s >>> 0) / 4294967296;
	};
}

export class SparklesWaveParticles {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;

	private vao: WebGLVertexArrayObject | null = null;
	private vboQuad: WebGLBuffer | null = null;
	private vboState0: WebGLBuffer | null = null;
	private vboState1: WebGLBuffer | null = null;
	private vboState2: WebGLBuffer | null = null;

	public config: WaveParticlesConfig;
	private readonly count: number;

	private area = {
		width: CONFIG_DEFAULTS.areaWidth,
		height: CONFIG_DEFAULTS.areaHeight,
	};

	private spriteTexture: WebGLTexture | null = null;
	private spriteReady = false;

	private uResolution: WebGLUniformLocation;
	private uPhase: WebGLUniformLocation;
	private uAmplitude: WebGLUniformLocation;
	private uFrequency: WebGLUniformLocation;
	private uOffset: WebGLUniformLocation;
	private uAreaSize: WebGLUniformLocation;
	private uTime: WebGLUniformLocation;
	private uDirection: WebGLUniformLocation;
	private uDepthWaveNear: WebGLUniformLocation;
	private uDepthWaveFar: WebGLUniformLocation;
	private uColor: WebGLUniformLocation;
	private uBaseAlpha: WebGLUniformLocation;
	private uOutlineWidth: WebGLUniformLocation;
	private uDepthAlphaNear: WebGLUniformLocation;
	private uDepthAlphaFar: WebGLUniformLocation;

	private uLensCenter: WebGLUniformLocation;
	private uLensRadius: WebGLUniformLocation;
	private uLensFeather: WebGLUniformLocation;
	private uDashPeriod: WebGLUniformLocation;
	private uDashDuty: WebGLUniformLocation;
	private uDashAngle: WebGLUniformLocation;
	private uSprite: WebGLUniformLocation;

	constructor(
		gl: WebGL2RenderingContext,
		config: Partial<WaveParticlesConfig> = {},
	) {
		this.gl = gl;
		this.config = { ...CONFIG_DEFAULTS, ...config };
		this.config.direction = this.config.direction >= 0 ? 1 : -1;
		this.count = Math.max(1, Math.floor(this.config.count));
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		this.uResolution = getUniform(gl, this.program, "u_resolution");
		this.uPhase = getUniform(gl, this.program, "u_phase");
		this.uAmplitude = getUniform(gl, this.program, "u_amplitude");
		this.uFrequency = getUniform(gl, this.program, "u_frequency");
		this.uOffset = getUniform(gl, this.program, "u_offset");
		this.uAreaSize = getUniform(gl, this.program, "u_areaSize");
		this.uTime = getUniform(gl, this.program, "u_time");
		this.uDirection = getUniform(gl, this.program, "u_direction");
		this.uDepthWaveNear = getUniform(gl, this.program, "u_depthWaveNear");
		this.uDepthWaveFar = getUniform(gl, this.program, "u_depthWaveFar");
		this.uColor = getUniform(gl, this.program, "u_color");
		this.uBaseAlpha = getUniform(gl, this.program, "u_baseAlpha");
		this.uOutlineWidth = getUniform(gl, this.program, "u_outlineWidth");
		this.uDepthAlphaNear = getUniform(gl, this.program, "u_depthAlphaNear");
		this.uDepthAlphaFar = getUniform(gl, this.program, "u_depthAlphaFar");

		this.uLensCenter = getUniform(gl, this.program, "u_lensCenterPx");
		this.uLensRadius = getUniform(gl, this.program, "u_lensRadiusPx");
		this.uLensFeather = getUniform(gl, this.program, "u_lensFeatherPx");
		this.uDashPeriod = getUniform(gl, this.program, "u_dashPeriodPx");
		this.uDashDuty = getUniform(gl, this.program, "u_dashDuty");
		this.uDashAngle = getUniform(gl, this.program, "u_dashAngleDeg");
		this.uSprite = getUniform(gl, this.program, "u_sprite");

		this.area.width = this.config.areaWidth;
		this.area.height = this.config.areaHeight;

		this.createBuffers();
		this.initSpriteTexture();
		this.populateParticles();
	}

	public updateConfig(patch: Partial<WaveParticlesConfig>) {
		const prevUrl = this.config.spriteUrl;
		this.config = { ...this.config, ...patch };

		if (patch.direction !== undefined) {
			this.config.direction = patch.direction >= 0 ? 1 : -1;
		}

		if (patch.spriteUrl && patch.spriteUrl !== prevUrl) {
			this.loadSpriteTexture(this.config.spriteUrl);
		}

		if (
			patch.count !== undefined ||
			patch.sizeRangePx !== undefined ||
			patch.speedRangePxPerSec !== undefined ||
			patch.rotationSpeedRangeDeg !== undefined ||
			patch.rotationBaseRangeDeg !== undefined ||
			patch.tiltAmplitudeDegRange !== undefined ||
			patch.tiltSpeedRangeHz !== undefined ||
			patch.yOffsetRangePx !== undefined ||
			patch.alphaRange !== undefined ||
			patch.depthRange !== undefined ||
			patch.seed !== undefined
		) {
			this.populateParticles();
		}
	}

	public resizeArea({ width, height }: { width: number; height: number }) {
		if (width <= 0 || height <= 0) return;
		if (
			Math.abs(width - this.area.width) < 0.5 &&
			Math.abs(height - this.area.height) < 0.5
		) {
			return;
		}
		this.area.width = width;
		this.area.height = height;
		this.populateParticles();
	}

	public render(uniforms: WaveParticlesUniforms) {
		if (!this.spriteTexture || !this.spriteReady || !this.vao) return;

		const gl = this.gl;
		gl.useProgram(this.program);

		gl.uniform2f(
			this.uResolution,
			uniforms.resolution.width,
			uniforms.resolution.height,
		);
		gl.uniform1f(this.uPhase, uniforms.phase);
		gl.uniform1f(this.uAmplitude, uniforms.amplitude);
		gl.uniform1f(this.uFrequency, uniforms.frequency);
		gl.uniform2f(this.uOffset, uniforms.offset.x, uniforms.offset.y);
		gl.uniform2f(
			this.uAreaSize,
			uniforms.areaSize.width,
			uniforms.areaSize.height,
		);
		gl.uniform1f(this.uTime, uniforms.time);
		gl.uniform1f(this.uDirection, this.config.direction);
		gl.uniform1f(this.uDepthWaveNear, this.config.depthWaveNear);
		gl.uniform1f(this.uDepthWaveFar, this.config.depthWaveFar);

		gl.uniform3f(
			this.uColor,
			this.config.color[0],
			this.config.color[1],
			this.config.color[2],
		);
		gl.uniform1f(this.uBaseAlpha, this.config.baseAlpha);
		gl.uniform1f(this.uOutlineWidth, this.config.outlineWidth);
		gl.uniform1f(this.uDepthAlphaNear, this.config.depthAlphaNear);
		gl.uniform1f(this.uDepthAlphaFar, this.config.depthAlphaFar);

		gl.uniform2f(
			this.uLensCenter,
			uniforms.lens.centerPx.x,
			uniforms.lens.centerPx.y,
		);
		gl.uniform1f(this.uLensRadius, uniforms.lens.radiusPx);
		gl.uniform1f(this.uLensFeather, uniforms.lens.featherPx);
		gl.uniform1f(this.uDashPeriod, this.config.dashPeriodPx);
		gl.uniform1f(this.uDashDuty, this.config.dashDuty);
		gl.uniform1f(this.uDashAngle, this.config.dashAngleDeg);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.spriteTexture);
		gl.uniform1i(this.uSprite, 0);

		gl.bindVertexArray(this.vao);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
		gl.bindVertexArray(null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	public dispose() {
		const gl = this.gl;
		if (this.vao) gl.deleteVertexArray(this.vao);
		if (this.vboQuad) gl.deleteBuffer(this.vboQuad);
		if (this.vboState0) gl.deleteBuffer(this.vboState0);
		if (this.vboState1) gl.deleteBuffer(this.vboState1);
		if (this.vboState2) gl.deleteBuffer(this.vboState2);
		if (this.spriteTexture) gl.deleteTexture(this.spriteTexture);
		gl.deleteProgram(this.program);
		this.vao = null;
		this.vboQuad = null;
		this.vboState0 = null;
		this.vboState1 = null;
		this.vboState2 = null;
		this.spriteTexture = null;
		this.spriteReady = false;
	}

	private createBuffers() {
		const gl = this.gl;
		const quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);

		this.vao = gl.createVertexArray();
		this.vboQuad = gl.createBuffer();
		this.vboState0 = gl.createBuffer();
		this.vboState1 = gl.createBuffer();
		this.vboState2 = gl.createBuffer();

		if (
			!this.vao ||
			!this.vboQuad ||
			!this.vboState0 ||
			!this.vboState1 ||
			!this.vboState2
		) {
			throw new Error("SparklesWaveParticles: VAO/VBO allocation failed");
		}

		gl.bindVertexArray(this.vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboQuad);
		gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboState0);
		gl.bufferData(gl.ARRAY_BUFFER, this.count * 4 * 4, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(1, 1);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboState1);
		gl.bufferData(gl.ARRAY_BUFFER, this.count * 4 * 4, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(2, 1);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboState2);
		gl.bufferData(gl.ARRAY_BUFFER, this.count * 3 * 4, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(3, 1);

		gl.bindVertexArray(null);
	}

	private initSpriteTexture() {
		const gl = this.gl;
		const tex = gl.createTexture();
		if (!tex)
			throw new Error("SparklesWaveParticles: texture allocation failed");
		this.spriteTexture = tex;

		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array([0, 0, 0, 0]),
		);
		gl.bindTexture(gl.TEXTURE_2D, null);

		this.loadSpriteTexture(this.config.spriteUrl);
	}

	private loadSpriteTexture(url: string) {
		if (!this.spriteTexture) return;
		if (typeof window === "undefined") {
			this.spriteReady = false;
			return;
		}

		this.spriteReady = false;
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.decoding = "async";
		image.onload = () => {
			const gl = this.gl;
			gl.bindTexture(gl.TEXTURE_2D, this.spriteTexture);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				image,
			);
			gl.bindTexture(gl.TEXTURE_2D, null);
			this.spriteReady = true;
		};
		image.onerror = () => {
			console.warn(`[SparklesWaveParticles] Failed to load sprite: ${url}`);
			this.spriteReady = false;
		};
		image.src = url;
	}

	private populateParticles() {
		const gl = this.gl;
		if (!this.vboState0 || !this.vboState1 || !this.vboState2) return;

		const state0 = new Float32Array(this.count * 4);
		const state1 = new Float32Array(this.count * 4);
		const state2 = new Float32Array(this.count * 3);

		const {
			sizeRangePx,
			speedRangePxPerSec,
			rotationSpeedRangeDeg,
			rotationBaseRangeDeg,
			tiltAmplitudeDegRange,
			tiltSpeedRangeHz,
			yOffsetRangePx,
			alphaRange,
			depthRange,
			seed,
		} = this.config;

		const rand = rng(seed ?? CONFIG_DEFAULTS.seed ?? 1);

		for (let i = 0; i < this.count; i++) {
			const tSize = rand();
			const size = mixRange(sizeRangePx, tSize);

			const baseX = rand() * this.area.width;
			const yOff = mixRange(yOffsetRangePx, rand());

			const depthJitter = rand() * 0.15;
			const depthT = clamp(1.0 - tSize + depthJitter, 0.0, 1.0);
			const depth = mixRange(depthRange, depthT);

			const speed = mixRange(speedRangePxPerSec, tSize) * (0.7 + rand() * 0.6);
			const rotSpeedDeg = mixRange(rotationSpeedRangeDeg, rand());
			const rotSpeedRad = (rotSpeedDeg * Math.PI) / 180.0;
			const baseRotDeg = mixRange(rotationBaseRangeDeg, rand());
			const baseRotRad = (baseRotDeg * Math.PI) / 180.0;
			const tiltAmpDeg = mixRange(tiltAmplitudeDegRange, rand());
			const tiltAmpRad = (tiltAmpDeg * Math.PI) / 180.0;
			const tiltSpeedHz = mixRange(tiltSpeedRangeHz, rand());
			const tiltSpeed = tiltSpeedHz * 6.283185307179586;

			const alphaBase = mixRange(alphaRange, tSize);
			const timeOffset = rand() * 10.0;

			const idx0 = i * 4;
			state0[idx0 + 0] = baseX;
			state0[idx0 + 1] = yOff;
			state0[idx0 + 2] = size;
			state0[idx0 + 3] = depth;

			state1[idx0 + 0] = speed;
			state1[idx0 + 1] = rotSpeedRad;
			state1[idx0 + 2] = alphaBase;
			state1[idx0 + 3] = baseRotRad;
			const idx2 = i * 3;
			state2[idx2 + 0] = timeOffset;
			state2[idx2 + 1] = tiltAmpRad;
			state2[idx2 + 2] = tiltSpeed;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboState0);
		gl.bufferData(gl.ARRAY_BUFFER, state0, gl.DYNAMIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboState1);
		gl.bufferData(gl.ARRAY_BUFFER, state1, gl.DYNAMIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboState2);
		gl.bufferData(gl.ARRAY_BUFFER, state2, gl.DYNAMIC_DRAW);
	}
}
