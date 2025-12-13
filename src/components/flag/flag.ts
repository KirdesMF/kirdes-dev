import { gsap } from "gsap";
import { events } from "../../lib/states";
import { createProgram, getGL2Context, getUniform, resizeCanvasToDisplaySize } from "../../lib/webgl";
import { cssColorToVec3 } from "../../utils/colors";

function getThemeVarRgb(varName: "--color-foreground" | "--color-background"): [number, number, number] {
	const style = getComputedStyle(document.documentElement);
	const value = style.getPropertyValue(varName);
	return cssColorToVec3(value);
}

function nextPow2(v: number): number {
	let x = 1;
	while (x < v) x <<= 1;
	return x;
}

const FLAG_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_frequency;
uniform float u_amplitude;
uniform vec2  u_waveDir;

out vec2 v_uv;
out float v_shade;

void main() {
  vec2 pos = a_position;

  float phase = dot(pos, u_waveDir) * u_frequency * 0.01 + u_time;
  float offset = sin(phase) * u_amplitude;
  vec2 waveNormal = normalize(vec2(-u_waveDir.y, u_waveDir.x));
  vec2 displaced = pos + waveNormal * (offset * 0.75);

  vec2 clip = vec2(
    (displaced.x / u_resolution.x) * 2.0 - 1.0,
    ((displaced.y / u_resolution.y) * 2.0 - 1.0) * -1.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);

  v_uv = a_uv;
  v_shade = 0.78 + 0.22 * cos(phase);
}
`;

const FLAG_FS = `#version 300 es
precision highp float;

uniform sampler2D u_text;
uniform vec4      u_textColor;

in vec2 v_uv;
out vec4 outColor;

void main() {
  float a = texture(u_text, v_uv).a;
  if (a <= 0.01) discard;

  outColor = vec4(u_textColor.rgb, a);
}
`;

export class Flag {
	#container: HTMLElement;
	#canvas: HTMLCanvasElement;
	#gl: WebGL2RenderingContext;

	#isRunning = false;
	#time = 0;

	public frequency: number;
	public amplitude: number;
	public speed: number;
	public rotation: number;

	#unsubscribeTheme: (() => void) | null = null;

	#program: WebGLProgram;
	#vao: WebGLVertexArrayObject | null = null;
	#vboPos: WebGLBuffer | null = null;
	#vboUv: WebGLBuffer | null = null;
	#ibo: WebGLBuffer | null = null;
	#indexCount = 0;

	#uResolution: WebGLUniformLocation;
	#uTime: WebGLUniformLocation;
	#uFrequency: WebGLUniformLocation;
	#uAmplitude: WebGLUniformLocation;
	#uWaveDir: WebGLUniformLocation;
	#uText: WebGLUniformLocation;
	#uTextColor: WebGLUniformLocation;

	#textTexture: WebGLTexture | null = null;
	#textCanvas: HTMLCanvasElement;
	#textCtx: CanvasRenderingContext2D;
	#texWidth = 0;
	#texHeight = 0;
	#needsTextUpdate = true;

	#textColor: [number, number, number, number] = [1, 1, 1, 1];

	#onVisibilityChange = () => {
		if (document.visibilityState === "hidden") {
			this.stop();
		} else {
			this.start();
		}
	};

	constructor(container: HTMLElement) {
		this.#container = container;
		this.frequency = Number.parseFloat(container.dataset.frequency || "0.6");
		this.amplitude = Number.parseFloat(container.dataset.amplitude || "18");
		this.speed = Number.parseFloat(container.dataset.speed || "0.1");
		this.rotation = Number.parseFloat(container.dataset.rotation || "0");

		this.#canvas = document.createElement("canvas");
		this.#canvas.className = "absolute inset-0 size-full block pointer-events-none";
		this.#container.appendChild(this.#canvas);

		this.#gl = getGL2Context(this.#canvas);
		this.#program = createProgram({ gl: this.#gl, vsSource: FLAG_VS, fsSource: FLAG_FS });

		this.#uResolution = getUniform(this.#gl, this.#program, "u_resolution");
		this.#uTime = getUniform(this.#gl, this.#program, "u_time");
		this.#uFrequency = getUniform(this.#gl, this.#program, "u_frequency");
		this.#uAmplitude = getUniform(this.#gl, this.#program, "u_amplitude");
		this.#uWaveDir = getUniform(this.#gl, this.#program, "u_waveDir");
		this.#uText = getUniform(this.#gl, this.#program, "u_text");
		this.#uTextColor = getUniform(this.#gl, this.#program, "u_textColor");

		this.#textCanvas = document.createElement("canvas");
		const ctx = this.#textCanvas.getContext("2d");
		if (!ctx) throw new Error("Flag: Canvas 2D context not supported");
		this.#textCtx = ctx;

		this.#setupGLState();
		this.#setColorsFromTheme();
		this.#subscribeToThemeChange();

		this.#createTextTexture();

		if ("fonts" in document) {
			document.fonts.ready
				.then(() => {
					this.#needsTextUpdate = true;
				})
				.catch(() => {});
		}

		this.start();
		document.addEventListener("visibilitychange", this.#onVisibilityChange);
	}

	start(): void {
		if (this.#isRunning) return;
		gsap.ticker.add(this.#tick);
		this.#isRunning = true;
	}

	stop(): void {
		if (!this.#isRunning) return;
		gsap.ticker.remove(this.#tick);
		this.#isRunning = false;
	}

	destroy(): void {
		this.stop();
		document.removeEventListener("visibilitychange", this.#onVisibilityChange);
		this.#unsubscribeTheme?.();

		const gl = this.#gl;
		if (this.#vao) gl.deleteVertexArray(this.#vao);
		if (this.#vboPos) gl.deleteBuffer(this.#vboPos);
		if (this.#vboUv) gl.deleteBuffer(this.#vboUv);
		if (this.#ibo) gl.deleteBuffer(this.#ibo);
		if (this.#textTexture) gl.deleteTexture(this.#textTexture);
		gl.deleteProgram(this.#program);

		this.#canvas.remove();
	}

	#setupGLState(): void {
		const gl = this.#gl;
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	}

	#subscribeToThemeChange(): void {
		this.#unsubscribeTheme = events.onThemeChange(() => {
			this.#setColorsFromTheme();
		});
	}

	#setColorsFromTheme(): void {
		const [fr, fg, fb] = getThemeVarRgb("--color-foreground");
		this.#textColor = [fr, fg, fb, 1];
	}

	#createTextTexture(): void {
		const gl = this.#gl;
		const texture = gl.createTexture();
		if (!texture) throw new Error("Flag: failed to create text texture");
		this.#textTexture = texture;

		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	#drawTextMask(width: number, height: number): void {
		const canvas = this.#textCanvas;
		canvas.width = width;
		canvas.height = height;

		const ctx = this.#textCtx;
		ctx.clearRect(0, 0, width, height);

		const text = "Available to work";
		const paddingX = Math.max(24, Math.floor(width * 0.08));
		const maxTextWidth = Math.max(0, width - paddingX * 2);

		let fontSize = Math.max(14, Math.floor(height * 0.32));
		const maxFontSize = Math.min(220, Math.floor(height * 0.55));
		fontSize = Math.min(fontSize, maxFontSize);

		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = "rgba(255, 255, 255, 1)";

		for (let i = 0; i < 24; i++) {
			ctx.font = `700 ${fontSize}px "SwissPoster Variable", system-ui, sans-serif`;
			const measured = ctx.measureText(text);
			if (measured.width <= maxTextWidth) break;
			fontSize = Math.floor(fontSize * 0.92);
			if (fontSize <= 10) break;
		}

		const x = Math.floor(width * 0.5);
		const y = Math.floor(height * 0.5);
		ctx.fillText(text, x, y);
	}

	#uploadTextTexture(): void {
		if (!this.#textTexture) return;
		const gl = this.#gl;
		gl.bindTexture(gl.TEXTURE_2D, this.#textTexture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.#textCanvas);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	#ensurePlaneGeometry(canvasWidth: number, canvasHeight: number): void {
		const gl = this.#gl;

		const padding = 80;
		const width = canvasWidth + padding * 2;
		const height = canvasHeight + padding * 2;

		const segX = 90;
		const segY = 45;
		const vertsX = segX + 1;
		const vertsY = segY + 1;

		const positions = new Float32Array(vertsX * vertsY * 2);
		const uvs = new Float32Array(vertsX * vertsY * 2);

		let p = 0;
		for (let y = 0; y < vertsY; y++) {
			const ty = segY > 0 ? y / segY : 0;
			const py = -padding + ty * height;
			for (let x = 0; x < vertsX; x++) {
				const tx = segX > 0 ? x / segX : 0;
				const px = -padding + tx * width;
				positions[p] = px;
				uvs[p++] = tx;
				positions[p] = py;
				uvs[p++] = 1 - ty;
			}
		}

		const indices: number[] = [];
		for (let y = 0; y < segY; y++) {
			for (let x = 0; x < segX; x++) {
				const i0 = y * vertsX + x;
				const i1 = i0 + 1;
				const i2 = i0 + vertsX;
				const i3 = i2 + 1;
				indices.push(i0, i2, i1, i1, i2, i3);
			}
		}

		this.#indexCount = indices.length;
		const indexArray = new Uint16Array(indices);

		if (!this.#vao) this.#vao = gl.createVertexArray();
		if (!this.#vboPos) this.#vboPos = gl.createBuffer();
		if (!this.#vboUv) this.#vboUv = gl.createBuffer();
		if (!this.#ibo) this.#ibo = gl.createBuffer();
		if (!this.#vao || !this.#vboPos || !this.#vboUv || !this.#ibo) {
			throw new Error("Flag: failed to allocate plane buffers");
		}

		gl.bindVertexArray(this.#vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboPos);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboUv);
		gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#ibo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);

		gl.bindVertexArray(null);
	}

	#maybeResizeAndRebuild(): { width: number; height: number } | null {
		const resized = resizeCanvasToDisplaySize({ canvas: this.#canvas, maxDPR: 2 });
		const width = this.#canvas.width;
		const height = this.#canvas.height;
		if (width === 0 || height === 0) return null;

		if (resized || !this.#vao) {
			this.#gl.viewport(0, 0, width, height);
			this.#ensurePlaneGeometry(width, height);
		}

		const desiredTexWidth = Math.min(2048, Math.max(256, nextPow2(width)));
		const desiredTexHeight = Math.min(2048, Math.max(256, nextPow2(height)));

		if (desiredTexWidth !== this.#texWidth || desiredTexHeight !== this.#texHeight) {
			this.#texWidth = desiredTexWidth;
			this.#texHeight = desiredTexHeight;
			this.#needsTextUpdate = true;
		}

		return { width, height };
	}

	#tick = (): void => {
		const sized = this.#maybeResizeAndRebuild();
		if (!sized) return;

		if (this.#needsTextUpdate) {
			this.#needsTextUpdate = false;
			this.#drawTextMask(this.#texWidth, this.#texHeight);
			this.#uploadTextTexture();
		}

		const dtFrames = gsap.ticker.deltaRatio(60);
		this.#time += this.speed * dtFrames;

		this.#render(sized.width, sized.height);
	};

	#render(width: number, height: number): void {
		const gl = this.#gl;

		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		if (!this.#textTexture || !this.#vao || this.#indexCount === 0) return;

		const angle = (this.rotation * Math.PI) / 180;
		const waveDirX = Math.cos(angle);
		const waveDirY = Math.sin(angle);

		gl.useProgram(this.#program);
		gl.uniform2f(this.#uResolution, width, height);
		gl.uniform1f(this.#uTime, this.#time);
		gl.uniform1f(this.#uFrequency, this.frequency);
		gl.uniform1f(this.#uAmplitude, this.amplitude);
		gl.uniform2f(this.#uWaveDir, waveDirX, waveDirY);

		gl.uniform4f(this.#uTextColor, this.#textColor[0], this.#textColor[1], this.#textColor[2], this.#textColor[3]);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.#textTexture);
		gl.uniform1i(this.#uText, 0);

		gl.bindVertexArray(this.#vao);
		gl.drawElements(gl.TRIANGLES, this.#indexCount, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}
}
