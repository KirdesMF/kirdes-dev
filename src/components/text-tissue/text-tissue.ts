import waveFontJson from "../../assets/msdf/wave-text.json";
import { events } from "../../lib/states";
import { createProgram, getGL2Context, getUniform, resizeCanvasToDisplaySize } from "../../lib/webgl";
import { cssColorToVec3 } from "../../utils/colors";

type MsdfFontChar = {
	id: number;
	index: number;
	char: string;
	width: number;
	height: number;
	xoffset: number;
	yoffset: number;
	xadvance: number;
	chnl: number;
	x: number;
	y: number;
	page: number;
};

type MsdfFontKerning = {
	first: number;
	second: number;
	amount: number;
};

type MsdfFontCommon = {
	lineHeight: number;
	base: number;
	scaleW: number;
	scaleH: number;
	pages: number;
	packed: number;
};

type MsdfFontDistanceField = {
	fieldType: "msdf" | "sdf" | "psdf";
	distanceRange: number;
};

type MsdfFontData = {
	pages: string[];
	chars: MsdfFontChar[];
	common: MsdfFontCommon;
	distanceField: MsdfFontDistanceField;
	kernings?: MsdfFontKerning[];
};

const fontData = waveFontJson as unknown as MsdfFontData;

function getThemeForegroundRgb(): [number, number, number] {
	const style = getComputedStyle(document.documentElement);
	const foreground = style.getPropertyValue("--color-foreground");
	return cssColorToVec3(foreground);
}

function nextPow2(v: number): number {
	let x = 1;
	while (x < v) x <<= 1;
	return x;
}

const BAKE_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;

uniform vec2 u_resolution;

out vec2 v_uv;

void main() {
  v_uv = a_uv;
  vec2 clip = vec2(
    (a_position.x / u_resolution.x) * 2.0 - 1.0,
    ((a_position.y / u_resolution.y) * 2.0 - 1.0) * -1.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const BAKE_FS = `#version 300 es
precision highp float;

uniform sampler2D u_atlas;
uniform float     u_pxRange;

in vec2 v_uv;
out vec4 outColor;

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  vec3 msd = texture(u_atlas, v_uv).rgb;
  float sd = median(msd.r, msd.g, msd.b) - 0.5;
  float alpha = clamp(sd * u_pxRange + 0.5, 0.0, 1.0);

  if (alpha <= 0.01) discard;
  outColor = vec4(1.0, 1.0, 1.0, alpha);
}
`;

const TISSUE_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_frequency;
uniform float u_amplitude;
uniform vec2  u_waveDir;

uniform vec2  u_tileRot;
uniform float u_tileScale;
uniform float u_patternSize;
uniform vec2  u_tileOffsetPx;

out vec2 v_uv;

void main() {
  vec2 pos = a_position;

  float phase = dot(pos, u_waveDir) * u_frequency * 0.01 + u_time;
  float offset = sin(phase) * u_amplitude;
  vec2 waveNormal = normalize(vec2(-u_waveDir.y, u_waveDir.x));
  vec2 displaced = pos + waveNormal * (offset * 0.5);

  vec2 clip = vec2(
    (displaced.x / u_resolution.x) * 2.0 - 1.0,
    ((displaced.y / u_resolution.y) * 2.0 - 1.0) * -1.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);

  // Keep pattern "pinned" to the original plane (pos), not the displaced position.
  vec2 uv = (pos + u_tileOffsetPx) / (u_patternSize * u_tileScale);
  // Our world Y grows downward; WebGL texture V grows upward.
  uv.y = 1.0 - uv.y;
  v_uv = vec2(
    uv.x * u_tileRot.x - uv.y * u_tileRot.y,
    uv.x * u_tileRot.y + uv.y * u_tileRot.x
  );
}
`;

const TISSUE_FS = `#version 300 es
precision highp float;

uniform sampler2D u_pattern;
uniform vec4      u_color;

in vec2 v_uv;
out vec4 outColor;

void main() {
  float a = texture(u_pattern, v_uv).a;
  float alpha = a * u_color.a;
  if (alpha <= 0.01) discard;
  outColor = vec4(u_color.rgb, alpha);
}
`;

type TextGeometry = {
	positions: Float32Array;
	uvs: Float32Array;
	indices: Uint16Array;
	widthPx: number;
	heightPx: number;
};

function kerningKey(first: number, second: number): number {
	return (first << 16) ^ second;
}

export class PortfolioTissue {
	#container: HTMLElement;
	#canvas: HTMLCanvasElement;
	#gl: WebGL2RenderingContext;

	#isRunning = false;
	#raf: number | null = null;
	#lastNowMs = 0;
	#time = 0;

	public frequency: number;
	public amplitude: number;
	public speed: number;
	public rotation: number;
	public textRotation: number;
	public textScale: number;
	public wordSpacing: number;

	#unsubscribeTheme: (() => void) | null = null;

	#atlasTexture: WebGLTexture | null = null;
	#atlasUrl: string;
	#isAtlasReady = false;

	#bakeProgram: WebGLProgram;
	#bakeVao: WebGLVertexArrayObject | null = null;
	#bakeVboPos: WebGLBuffer | null = null;
	#bakeVboUv: WebGLBuffer | null = null;
	#bakeIbo: WebGLBuffer | null = null;
	#bakeIndexCount = 0;
	#uBakeResolution: WebGLUniformLocation;
	#uBakeAtlas: WebGLUniformLocation;
	#uBakePxRange: WebGLUniformLocation;

	#patternTexture: WebGLTexture | null = null;
	#patternFbo: WebGLFramebuffer | null = null;
	#patternSize = 1024;
	#lastBakedKey: string | null = null;

	#tissueProgram: WebGLProgram;
	#planeVao: WebGLVertexArrayObject | null = null;
	#planeVboPos: WebGLBuffer | null = null;
	#planeIbo: WebGLBuffer | null = null;
	#planeIndexCount = 0;

	#uResolution: WebGLUniformLocation;
	#uTime: WebGLUniformLocation;
	#uFrequency: WebGLUniformLocation;
	#uAmplitude: WebGLUniformLocation;
	#uWaveDir: WebGLUniformLocation;
	#uTileRot: WebGLUniformLocation;
	#uTileScale: WebGLUniformLocation;
	#uPatternSize: WebGLUniformLocation;
	#uTileOffsetPx: WebGLUniformLocation;
	#uPattern: WebGLUniformLocation;
	#uColor: WebGLUniformLocation;

	#glyphsByChar: Map<string, MsdfFontChar>;
	#kerningByPair: Map<number, number>;
	#pxRange: number;

	#color: [number, number, number, number] = [1, 1, 1, 1];

	#onVisibilityChange = () => {
		if (document.visibilityState === "hidden") {
			this.stop();
		} else {
			this.start();
		}
	};

	constructor(container: HTMLElement) {
		this.#container = container;
		this.frequency = Number.parseFloat(container.dataset.frequency || "0.5");
		this.amplitude = Number.parseFloat(container.dataset.amplitude || "60");
		this.speed = Number.parseFloat(container.dataset.speed || "0.1");
		this.rotation = Number.parseFloat(container.dataset.rotation || "45");
		this.textRotation = Number.parseFloat(container.dataset.textRotation || "-45");
		this.textScale = Number.parseFloat(container.dataset.textScale || "1.6");
		this.wordSpacing = Number.parseFloat(container.dataset.wordSpacing || "80");

		this.#canvas = document.createElement("canvas");
		this.#canvas.className = "absolute inset-0 size-full block pointer-events-none";
		this.#container.appendChild(this.#canvas);

		this.#gl = getGL2Context(this.#canvas);

		this.#glyphsByChar = new Map<string, MsdfFontChar>();
		for (const glyph of fontData.chars) {
			this.#glyphsByChar.set(glyph.char, glyph);
		}

		this.#kerningByPair = new Map<number, number>();
		if (fontData.kernings) {
			for (const k of fontData.kernings) {
				this.#kerningByPair.set(kerningKey(k.first, k.second), k.amount);
			}
		}

		this.#pxRange = fontData.distanceField.distanceRange;
		this.#atlasUrl = `/assets/msdf/${fontData.pages[0]}`;

		this.#bakeProgram = createProgram({ gl: this.#gl, vsSource: BAKE_VS, fsSource: BAKE_FS });
		this.#uBakeResolution = getUniform(this.#gl, this.#bakeProgram, "u_resolution");
		this.#uBakeAtlas = getUniform(this.#gl, this.#bakeProgram, "u_atlas");
		this.#uBakePxRange = getUniform(this.#gl, this.#bakeProgram, "u_pxRange");

		this.#tissueProgram = createProgram({ gl: this.#gl, vsSource: TISSUE_VS, fsSource: TISSUE_FS });
		this.#uResolution = getUniform(this.#gl, this.#tissueProgram, "u_resolution");
		this.#uTime = getUniform(this.#gl, this.#tissueProgram, "u_time");
		this.#uFrequency = getUniform(this.#gl, this.#tissueProgram, "u_frequency");
		this.#uAmplitude = getUniform(this.#gl, this.#tissueProgram, "u_amplitude");
		this.#uWaveDir = getUniform(this.#gl, this.#tissueProgram, "u_waveDir");
		this.#uTileRot = getUniform(this.#gl, this.#tissueProgram, "u_tileRot");
		this.#uTileScale = getUniform(this.#gl, this.#tissueProgram, "u_tileScale");
		this.#uPatternSize = getUniform(this.#gl, this.#tissueProgram, "u_patternSize");
		this.#uTileOffsetPx = getUniform(this.#gl, this.#tissueProgram, "u_tileOffsetPx");
		this.#uPattern = getUniform(this.#gl, this.#tissueProgram, "u_pattern");
		this.#uColor = getUniform(this.#gl, this.#tissueProgram, "u_color");

		this.#setupGLState();
		this.#setColorFromTheme();
		this.#subscribeToThemeChange();

		this.#loadAtlasTexture();
		this.start();

		document.addEventListener("visibilitychange", this.#onVisibilityChange);
	}

	start(): void {
		if (this.#isRunning) return;
		this.#isRunning = true;
		this.#lastNowMs = performance.now();
		this.#raf = requestAnimationFrame(this.#frame);
	}

	stop(): void {
		if (!this.#isRunning) return;
		this.#isRunning = false;
		if (this.#raf !== null) {
			cancelAnimationFrame(this.#raf);
			this.#raf = null;
		}
	}

	destroy(): void {
		this.stop();
		document.removeEventListener("visibilitychange", this.#onVisibilityChange);
		this.#unsubscribeTheme?.();

		const gl = this.#gl;
		if (this.#planeVao) gl.deleteVertexArray(this.#planeVao);
		if (this.#planeVboPos) gl.deleteBuffer(this.#planeVboPos);
		if (this.#planeIbo) gl.deleteBuffer(this.#planeIbo);

		if (this.#bakeVao) gl.deleteVertexArray(this.#bakeVao);
		if (this.#bakeVboPos) gl.deleteBuffer(this.#bakeVboPos);
		if (this.#bakeVboUv) gl.deleteBuffer(this.#bakeVboUv);
		if (this.#bakeIbo) gl.deleteBuffer(this.#bakeIbo);

		if (this.#patternFbo) gl.deleteFramebuffer(this.#patternFbo);
		if (this.#patternTexture) gl.deleteTexture(this.#patternTexture);
		if (this.#atlasTexture) gl.deleteTexture(this.#atlasTexture);

		gl.deleteProgram(this.#bakeProgram);
		gl.deleteProgram(this.#tissueProgram);

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
			this.#setColorFromTheme();
		});
	}

	#setColorFromTheme(): void {
		const [r, g, b] = getThemeForegroundRgb();
		this.#color = [r, g, b, 1];
	}

	#getKerning(prevId: number | null, nextId: number): number {
		if (prevId === null) return 0;
		return this.#kerningByPair.get(kerningKey(prevId, nextId)) ?? 0;
	}

	#buildWordMesh({ text, scale, letterSpacing }: { text: string; scale: number; letterSpacing: number }): TextGeometry {
		const positions: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];

		const scaleW = fontData.common.scaleW;
		const scaleH = fontData.common.scaleH;
		const baseline = fontData.common.base;

		let penX = 0;
		const penY = 0;
		let prevId: number | null = null;

		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		for (let i = 0; i < text.length; i++) {
			const ch = text[i] ?? "";
			if (ch === " ") {
				prevId = null;
				continue;
			}

			const glyph = this.#glyphsByChar.get(ch);
			if (!glyph) continue;

			penX += this.#getKerning(prevId, glyph.id);

			const gx0 = penX + glyph.xoffset;
			const gy0 = penY + glyph.yoffset - baseline;
			const gx1 = gx0 + glyph.width;
			const gy1 = gy0 + glyph.height;

			const x0 = gx0 * scale;
			const y0 = gy0 * scale;
			const x1 = gx1 * scale;
			const y1 = gy1 * scale;

			minX = Math.min(minX, x0, x1);
			maxX = Math.max(maxX, x0, x1);
			minY = Math.min(minY, y0, y1);
			maxY = Math.max(maxY, y0, y1);

			const u0 = glyph.x / scaleW;
			const v0 = glyph.y / scaleH;
			const u1 = (glyph.x + glyph.width) / scaleW;
			const v1 = (glyph.y + glyph.height) / scaleH;

			const base = positions.length / 2;
			positions.push(x0, y0, x1, y0, x1, y1, x0, y1);
			uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
			indices.push(base + 0, base + 2, base + 1, base + 0, base + 3, base + 2);

			penX += glyph.xadvance + letterSpacing;
			prevId = glyph.id;
		}

		if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
			return {
				positions: new Float32Array(),
				uvs: new Float32Array(),
				indices: new Uint16Array(),
				widthPx: 0,
				heightPx: 0,
			};
		}

		const widthPx = maxX - minX;
		const heightPx = maxY - minY;

		for (let i = 0; i < positions.length; i += 2) {
			positions[i] = (positions[i] ?? 0) - minX;
			positions[i + 1] = (positions[i + 1] ?? 0) - minY;
		}

		return {
			positions: new Float32Array(positions),
			uvs: new Float32Array(uvs),
			indices: new Uint16Array(indices),
			widthPx,
			heightPx,
		};
	}

	#buildTextGeometryForTile({
		tileSizePx,
		text,
		scale,
		letterSpacing,
	}: {
		tileSizePx: number;
		text: string;
		scale: number;
		letterSpacing: number;
	}): TextGeometry {
		const word = this.#buildWordMesh({ text, scale, letterSpacing });
		if (word.indices.length === 0) {
			return word;
		}

		const desiredGapX = Math.min(400, Math.max(0, this.wordSpacing));
		const minGapX = Math.max(0, desiredGapX * 0.4);
		const maxGapX = Math.max(minGapX + 1, desiredGapX * 1.6 + 40);

		const idealCols = Math.max(1, Math.round(tileSizePx / (word.widthPx + Math.max(1, desiredGapX))));
		let colsPerTile = idealCols;
		let bestCols = idealCols;
		let bestScore = Number.POSITIVE_INFINITY;
		for (let cols = Math.max(1, idealCols - 32); cols <= idealCols + 32; cols++) {
			const step = tileSizePx / cols;
			const gap = step - word.widthPx;
			if (!Number.isFinite(gap)) continue;

			// Prefer gaps within bounds; otherwise pick closest to desired.
			let score = Math.abs(gap - desiredGapX);
			if (gap < minGapX) score += (minGapX - gap) * 4;
			if (gap > maxGapX) score += (gap - maxGapX) * 4;

			if (score < bestScore) {
				bestScore = score;
				bestCols = cols;
			}
		}

		colsPerTile = Math.max(1, bestCols);
		const stepX = tileSizePx / colsPerTile;
		const gapX = stepX - word.widthPx;

		const desiredGapY = Math.max(16, word.heightPx * 0.35);
		const minGapY = 12;
		const maxGapY = 120;

		let rowsPerTile = Math.max(2, Math.round(tileSizePx / (word.heightPx + desiredGapY)));
		if (rowsPerTile % 2 === 1) rowsPerTile += 1;

		let stepY = tileSizePx / rowsPerTile;
		let gapY = stepY - word.heightPx;
		while (gapY > maxGapY && rowsPerTile < 256) {
			rowsPerTile += 2;
			stepY = tileSizePx / rowsPerTile;
			gapY = stepY - word.heightPx;
		}
		while (gapY < minGapY && rowsPerTile > 2) {
			rowsPerTile -= 2;
			stepY = tileSizePx / rowsPerTile;
			gapY = stepY - word.heightPx;
		}

		const positions: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];

		const vertCountPerWord = word.positions.length / 2;
		const indexCountPerWord = word.indices.length;

		// Draw an extra ring of instances around the tile so edges match when GL_REPEAT interpolates.
		for (let row = -1; row <= rowsPerTile; row++) {
			const parity = ((row % 2) + 2) % 2;
			const rowOffsetX = parity * (stepX * 0.5);
			const originY = row * stepY + Math.max(0, gapY * 0.5);

			for (let col = -1; col <= colsPerTile; col++) {
				const originX = col * stepX + rowOffsetX + Math.max(0, gapX * 0.5);

				const baseVertex = positions.length / 2;
				for (let i = 0; i < word.positions.length; i += 2) {
					positions.push(originX + (word.positions[i] ?? 0), originY + (word.positions[i + 1] ?? 0));
				}
				for (let i = 0; i < word.uvs.length; i++) {
					uvs.push(word.uvs[i] ?? 0);
				}
				for (let i = 0; i < indexCountPerWord; i++) {
					indices.push(baseVertex + (word.indices[i] ?? 0));
				}

				if (baseVertex + vertCountPerWord > 65530) break;
			}
		}

		return {
			positions: new Float32Array(positions),
			uvs: new Float32Array(uvs),
			indices: new Uint16Array(indices),
			widthPx: word.widthPx,
			heightPx: word.heightPx,
		};
	}

	#ensureBakeGeometry(): void {
		const gl = this.#gl;
		if (!this.#bakeVao) this.#bakeVao = gl.createVertexArray();
		if (!this.#bakeVboPos) this.#bakeVboPos = gl.createBuffer();
		if (!this.#bakeVboUv) this.#bakeVboUv = gl.createBuffer();
		if (!this.#bakeIbo) this.#bakeIbo = gl.createBuffer();

		if (!this.#bakeVao || !this.#bakeVboPos || !this.#bakeVboUv || !this.#bakeIbo) {
			throw new Error("PortfolioTissue: failed to allocate bake buffers");
		}

		const geo = this.#buildTextGeometryForTile({
			tileSizePx: this.#patternSize,
			text: "PORTFOLIO",
			scale: this.textScale,
			letterSpacing: 0,
		});

		this.#bakeIndexCount = geo.indices.length;

		gl.bindVertexArray(this.#bakeVao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#bakeVboPos);
		gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#bakeVboUv);
		gl.bufferData(gl.ARRAY_BUFFER, geo.uvs, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#bakeIbo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);

		gl.bindVertexArray(null);
	}

	#ensurePatternTarget(): void {
		const gl = this.#gl;

		if (!this.#patternTexture) {
			this.#patternTexture = gl.createTexture();
			if (!this.#patternTexture) throw new Error("PortfolioTissue: failed to create pattern texture");
		}

		if (!this.#patternFbo) {
			this.#patternFbo = gl.createFramebuffer();
			if (!this.#patternFbo) throw new Error("PortfolioTissue: failed to create pattern framebuffer");
		}

		gl.bindTexture(gl.TEXTURE_2D, this.#patternTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.#patternSize, this.#patternSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.#patternFbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.#patternTexture, 0);
		const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);

		if (!ok) throw new Error("PortfolioTissue: pattern framebuffer incomplete");
	}

	#bakePattern(): void {
		if (!this.#isAtlasReady || !this.#atlasTexture) return;
		if (!this.#patternFbo || !this.#patternTexture || !this.#bakeVao || this.#bakeIndexCount === 0) return;

		const gl = this.#gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.#patternFbo);
		gl.viewport(0, 0, this.#patternSize, this.#patternSize);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.useProgram(this.#bakeProgram);
		gl.uniform2f(this.#uBakeResolution, this.#patternSize, this.#patternSize);
		gl.uniform1f(this.#uBakePxRange, this.#pxRange);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.#atlasTexture);
		gl.uniform1i(this.#uBakeAtlas, 0);

		gl.bindVertexArray(this.#bakeVao);
		gl.drawElements(gl.TRIANGLES, this.#bakeIndexCount, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	#maybeRebake(): void {
		if (!this.#isAtlasReady) return;
		const scale = Number.isFinite(this.textScale) && this.textScale > 0 ? this.textScale : 1.6;
		if (scale !== this.textScale) this.textScale = scale;

		const wordSpacing = Number.isFinite(this.wordSpacing) && this.wordSpacing >= 0 ? this.wordSpacing : 80;
		if (wordSpacing !== this.wordSpacing) this.wordSpacing = wordSpacing;

		const key = `${this.#patternSize}|${this.textScale.toFixed(4)}|${this.wordSpacing.toFixed(2)}`;
		if (this.#lastBakedKey === key) return;

		this.#ensureBakeGeometry();
		this.#ensurePatternTarget();
		this.#bakePattern();
		this.#lastBakedKey = key;
	}

	#loadAtlasTexture(): void {
		const image = new Image();
		image.src = this.#atlasUrl;

		image.addEventListener("load", () => {
			const gl = this.#gl;
			const texture = gl.createTexture();
			if (!texture) return;
			this.#atlasTexture = texture;

			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindTexture(gl.TEXTURE_2D, null);

			this.#isAtlasReady = true;
			this.#ensureBakeGeometry();
			this.#ensurePatternTarget();
			this.#bakePattern();
			this.#lastBakedKey = null;
		});

		image.addEventListener("error", () => {
			// eslint-disable-next-line no-console
			console.error("PortfolioTissue: failed to load atlas image", this.#atlasUrl);
		});
	}

	#ensurePlaneGeometry(canvasWidth: number, canvasHeight: number): void {
		const gl = this.#gl;

		const padding = 100;
		const width = canvasWidth + padding * 2;
		const height = canvasHeight + padding * 2;

		const segX = 60;
		const segY = 60;
		const vertsX = segX + 1;
		const vertsY = segY + 1;

		const positions = new Float32Array(vertsX * vertsY * 2);
		let p = 0;
		for (let y = 0; y < vertsY; y++) {
			const ty = segY > 0 ? y / segY : 0;
			const py = -padding + ty * height;
			for (let x = 0; x < vertsX; x++) {
				const tx = segX > 0 ? x / segX : 0;
				const px = -padding + tx * width;
				positions[p++] = px;
				positions[p++] = py;
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

		const indexArray = new Uint16Array(indices);
		this.#planeIndexCount = indexArray.length;

		if (!this.#planeVao) this.#planeVao = gl.createVertexArray();
		if (!this.#planeVboPos) this.#planeVboPos = gl.createBuffer();
		if (!this.#planeIbo) this.#planeIbo = gl.createBuffer();

		if (!this.#planeVao || !this.#planeVboPos || !this.#planeIbo) {
			throw new Error("PortfolioTissue: failed to allocate plane buffers");
		}

		gl.bindVertexArray(this.#planeVao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#planeVboPos);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#planeIbo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);

		gl.bindVertexArray(null);
	}

	#maybeResizeAndRebuild(): { width: number; height: number; resized: boolean } | null {
		const resized = resizeCanvasToDisplaySize({ canvas: this.#canvas, maxDPR: 2 });
		const width = this.#canvas.width;
		const height = this.#canvas.height;
		if (width === 0 || height === 0) return null;

		if (resized || !this.#planeVao) {
			this.#gl.viewport(0, 0, width, height);
			this.#ensurePlaneGeometry(width, height);
		}

		const desiredPattern = Math.min(2048, Math.max(512, nextPow2(Math.max(width, height))));
		if (desiredPattern !== this.#patternSize) {
			this.#patternSize = desiredPattern;
			this.#lastBakedKey = null;
		}

		return { width, height, resized };
	}

	#frame = (nowMs: number) => {
		if (!this.#isRunning) return;

		const sized = this.#maybeResizeAndRebuild();
		if (!sized) {
			this.#raf = requestAnimationFrame(this.#frame);
			return;
		}

		this.#maybeRebake();

		const dtMs = Math.max(0, nowMs - this.#lastNowMs);
		this.#lastNowMs = nowMs;
		const dtFrames = dtMs / (1000 / 60);
		this.#time += this.speed * dtFrames;

		this.#render(sized.width, sized.height);
		this.#raf = requestAnimationFrame(this.#frame);
	};

	#render(width: number, height: number): void {
		const gl = this.#gl;

		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		if (!this.#patternTexture || !this.#planeVao || this.#planeIndexCount === 0) return;

		const angle = (this.rotation * Math.PI) / 180;
		const waveDirX = Math.cos(angle);
		const waveDirY = Math.sin(angle);

		const tileRotation = (this.textRotation * Math.PI) / 180;
		const tileRotX = Math.cos(tileRotation);
		const tileRotY = Math.sin(tileRotation);

		gl.useProgram(this.#tissueProgram);
		gl.uniform2f(this.#uResolution, width, height);
		gl.uniform1f(this.#uTime, this.#time);
		gl.uniform1f(this.#uFrequency, this.frequency);
		gl.uniform1f(this.#uAmplitude, this.amplitude);
		gl.uniform2f(this.#uWaveDir, waveDirX, waveDirY);

		gl.uniform2f(this.#uTileRot, tileRotX, tileRotY);
		gl.uniform1f(this.#uTileScale, 0.8);
		gl.uniform1f(this.#uPatternSize, this.#patternSize);
		gl.uniform2f(this.#uTileOffsetPx, 0, 0);

		gl.uniform4f(this.#uColor, this.#color[0], this.#color[1], this.#color[2], this.#color[3]);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.#patternTexture);
		gl.uniform1i(this.#uPattern, 0);

		gl.bindVertexArray(this.#planeVao);
		gl.drawElements(gl.TRIANGLES, this.#planeIndexCount, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}
}
