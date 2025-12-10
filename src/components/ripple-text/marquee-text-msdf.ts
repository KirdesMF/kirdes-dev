// FILE: src/components/ripple-text/marquee-text-msdf.ts
import waveFontJson from "../../assets/msdf/wave-text.json";
import { createProgram, getUniform } from "../../lib/webgl";

const vsSource = `#version 300 es
  precision highp float;

  layout(location = 0) in vec2 a_position;
  layout(location = 1) in vec2 a_uv;

  uniform vec2  u_resolution;
  uniform vec2  u_baseOffset;
  uniform float u_scrollX;
  uniform float u_rotationRad;

  out vec2 v_uv;

  void main() {
    v_uv = a_uv;

    // Position du texte dans l'espace "monde" 2D (avant rotation)
    vec2 worldPos = vec2(
      a_position.x + u_baseOffset.x + u_scrollX,
      a_position.y + u_baseOffset.y
    );

    // Rotation autour du centre de l'écran
    vec2 center = 0.5 * u_resolution;
    vec2 p = worldPos - center;
    float s = sin(u_rotationRad);
    float c = cos(u_rotationRad);
    vec2 pr = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    worldPos = pr + center;

    vec2 clip = vec2(
      (worldPos.x / u_resolution.x) * 2.0 - 1.0,
      ((worldPos.y / u_resolution.y) * 2.0 - 1.0) * -1.0
    );

    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

const fsSource = `#version 300 es
  precision highp float;

  uniform sampler2D u_atlas;
  uniform vec4      u_color;
  uniform float     u_pxRange;
  uniform int       u_mode;         // 0 = fill, 1 = outline
  uniform float     u_outlineWidth; // band width for outline

  in vec2 v_uv;
  out vec4 outColor;

  float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
  }

  void main() {
    vec3 msd = texture(u_atlas, v_uv).rgb;
    float sd = median(msd.r, msd.g, msd.b) - 0.5;

    float alphaFill = clamp(sd * u_pxRange + 0.5, 0.0, 1.0);

    float edgeWidth = max(u_outlineWidth, 0.0001);
    float edgeDist = abs(sd);
    float alphaOutline = 1.0 - smoothstep(0.0, edgeWidth, edgeDist);

    float alpha = alphaFill;
    if (u_mode == 1) {
      alpha = alphaOutline;
    }

    vec4 color = vec4(u_color.rgb, u_color.a * alpha);

    if (color.a <= 0.01) {
      discard;
    }

    outColor = color;
  }
`;

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

const waveFontData = waveFontJson as unknown as MsdfFontData;

export type MarqueeTextRenderMode = "fill" | "outline";

export type MarqueeTextUniforms = {
	resolution: { width: number; height: number };
	baseOffset: { x: number; y: number };
	scrollX: number;
	rotationRad: number;
	mode: MarqueeTextRenderMode;
	outlineWidth: number;
};

export type MarqueeTextMsdfParams = {
	text: string;
	color: [number, number, number, number];
	scale: number;
	letterSpacing: number;
	wordSpacingPx: number;
};

// Tesselation grid par glyphe
const GLYPH_GRID_X = 24;
const GLYPH_GRID_Y = 12;
const GLYPH_GRID_MIN = 1;

const DEFAULT_PARAMS: MarqueeTextMsdfParams = {
	text: "PORTFOLIO",
	color: [1, 1, 1, 1],
	scale: 3.0,
	letterSpacing: 0,
	wordSpacingPx: 0,
};

type Glyph = MsdfFontChar;

export class MarqueeTextMsdf {
	#gl: WebGL2RenderingContext;
	#program: WebGLProgram;

	#atlasTexture: WebGLTexture | null = null;
	#vao: WebGLVertexArrayObject | null = null;
	#vboPos: WebGLBuffer | null = null;
	#vboUv: WebGLBuffer | null = null;
	#ibo: WebGLBuffer | null = null;
	#indexCount = 0;

	#uResolution: WebGLUniformLocation;
	#uBaseOffset: WebGLUniformLocation;
	#uScrollX: WebGLUniformLocation;
	#uRotationRad: WebGLUniformLocation;
	#uMode: WebGLUniformLocation;
	#uOutlineWidth: WebGLUniformLocation;
	#uColor: WebGLUniformLocation;
	#uAtlas: WebGLUniformLocation;
	#uPxRange: WebGLUniformLocation;

	#glyphsByChar: Map<string, Glyph>;
	#kerningByPair: Map<number, number>;

	#params: MarqueeTextMsdfParams;
	#textWidth = 0;
	#lineHeight = 0;
	#pxRange: number;
	#atlasUrl: string;
	#isAtlasReady = false;

	constructor({
		gl,
		text,
		color,
		scale,
		letterSpacing,
		wordSpacingPx,
	}: {
		gl: WebGL2RenderingContext;
		text?: string;
		color?: [number, number, number, number];
		scale?: number;
		letterSpacing?: number;
		wordSpacingPx?: number;
	}) {
		this.#gl = gl;
		this.#program = createProgram({ gl, vsSource, fsSource });

		this.#params = {
			text: text ?? DEFAULT_PARAMS.text,
			color: color ?? DEFAULT_PARAMS.color,
			scale: scale ?? DEFAULT_PARAMS.scale,
			letterSpacing: letterSpacing ?? DEFAULT_PARAMS.letterSpacing,
			wordSpacingPx: wordSpacingPx ?? DEFAULT_PARAMS.wordSpacingPx,
		};

		this.#uResolution = getUniform(gl, this.#program, "u_resolution");
		this.#uBaseOffset = getUniform(gl, this.#program, "u_baseOffset");
		this.#uScrollX = getUniform(gl, this.#program, "u_scrollX");
		this.#uRotationRad = getUniform(gl, this.#program, "u_rotationRad");
		this.#uMode = getUniform(gl, this.#program, "u_mode");
		this.#uOutlineWidth = getUniform(gl, this.#program, "u_outlineWidth");
		this.#uColor = getUniform(gl, this.#program, "u_color");
		this.#uAtlas = getUniform(gl, this.#program, "u_atlas");
		this.#uPxRange = getUniform(gl, this.#program, "u_pxRange");

		this.#glyphsByChar = new Map<string, Glyph>();
		for (const glyph of waveFontData.chars) {
			this.#glyphsByChar.set(glyph.char, glyph);
		}

		this.#kerningByPair = new Map<number, number>();
		if (waveFontData.kernings) {
			for (const k of waveFontData.kernings) {
				const key = this.#kerningKey(k.first, k.second);
				this.#kerningByPair.set(key, k.amount);
			}
		}

		this.#pxRange = waveFontData.distanceField.distanceRange;
		this.#atlasUrl = `/assets/msdf/${waveFontData.pages[0]}`;

		this.#buildGeometry(this.#params.text);
		this.#loadAtlasTexture();
	}

	getTextWidth(): number {
		return this.#textWidth;
	}

	getLineHeight(): number {
		return this.#lineHeight;
	}

	setColor(color: [number, number, number, number]): void {
		this.#params = { ...this.#params, color };
	}

	setScale(scale: number): void {
		if (!Number.isFinite(scale) || scale <= 0) {
			return;
		}
		if (scale === this.#params.scale) return;
		this.#params = { ...this.#params, scale };
		this.#buildGeometry(this.#params.text);
	}

	setLetterSpacing(letterSpacing: number): void {
		if (!Number.isFinite(letterSpacing)) {
			return;
		}
		if (letterSpacing === this.#params.letterSpacing) return;
		this.#params = { ...this.#params, letterSpacing };
		this.#buildGeometry(this.#params.text);
	}

	setWordSpacing(px: number): void {
		if (!Number.isFinite(px) || px < 0) return;
		this.#params = { ...this.#params, wordSpacingPx: px };
		this.#buildGeometry(this.#params.text);
	}

	render(u: MarqueeTextUniforms): void {
		if (!this.#isAtlasReady || !this.#vao || this.#indexCount === 0) return;

		const gl = this.#gl;
		gl.useProgram(this.#program);

		gl.uniform2f(this.#uResolution, u.resolution.width, u.resolution.height);
		gl.uniform2f(this.#uBaseOffset, u.baseOffset.x, u.baseOffset.y);
		gl.uniform1f(this.#uScrollX, u.scrollX);
		gl.uniform1f(this.#uRotationRad, u.rotationRad);

		const modeInt = u.mode === "outline" ? 1 : 0;
		gl.uniform1i(this.#uMode, modeInt);

		const outlineWidth = Number.isFinite(u.outlineWidth) && u.outlineWidth > 0 ? u.outlineWidth : 0.12;
		gl.uniform1f(this.#uOutlineWidth, outlineWidth);

		gl.uniform4f(
			this.#uColor,
			this.#params.color[0],
			this.#params.color[1],
			this.#params.color[2],
			this.#params.color[3],
		);
		gl.uniform1f(this.#uPxRange, this.#pxRange);

		gl.activeTexture(this.#gl.TEXTURE0);
		gl.bindTexture(this.#gl.TEXTURE_2D, this.#atlasTexture);
		gl.uniform1i(this.#uAtlas, 0);

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
		if (this.#atlasTexture) gl.deleteTexture(this.#atlasTexture);
		gl.deleteProgram(this.#program);
	}

	#kerningKey(first: number, second: number): number {
		return (first << 16) ^ second;
	}

	#getKerning(prevId: number | null, nextId: number): number {
		if (prevId === null) return 0;
		const key = this.#kerningKey(prevId, nextId);
		const value = this.#kerningByPair.get(key);
		return value ?? 0;
	}

	#buildGeometry(text: string): void {
		const positions: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];

		const scaleW = waveFontData.common.scaleW;
		const scaleH = waveFontData.common.scaleH;
		const baseline = waveFontData.common.base;
		const scale = this.#params.scale;
		const letterSpacing = this.#params.letterSpacing;
		const wordSpacingPx = this.#params.wordSpacingPx;

		const gridX = Math.max(GLYPH_GRID_MIN, GLYPH_GRID_X);
		const gridY = Math.max(GLYPH_GRID_MIN, GLYPH_GRID_Y);

		let penX = 0;
		const penY = 0;
		let prevId: number | null = null;

		let minY = Number.POSITIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		for (let i = 0; i < text.length; i++) {
			const ch = text[i] ?? "";

			if (ch === " ") {
				if (Number.isFinite(wordSpacingPx) && wordSpacingPx > 0 && scale > 0) {
					const deltaUnits = wordSpacingPx / scale;
					penX += deltaUnits;
				}
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

			const u0 = glyph.x / scaleW;
			const v0 = glyph.y / scaleH;
			const u1 = (glyph.x + glyph.width) / scaleW;
			const v1 = (glyph.y + glyph.height) / scaleH;

			const baseIndex = positions.length / 2;

			for (let iy = 0; iy <= gridY; iy++) {
				const ty = gridY > 0 ? iy / gridY : 0;
				const gy = gy0 + (gy1 - gy0) * ty;
				const vy = v0 + (v1 - v0) * ty;

				for (let ix = 0; ix <= gridX; ix++) {
					const tx = gridX > 0 ? ix / gridX : 0;
					const gx = gx0 + (gx1 - gx0) * tx;
					const ux = u0 + (u1 - u0) * tx;

					const px = gx * scale;
					const py = gy * scale;

					positions.push(px, py);
					uvs.push(ux, vy);

					if (py < minY) minY = py;
					if (py > maxY) maxY = py;
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

			penX += glyph.xadvance + letterSpacing;
			prevId = glyph.id;
		}

		this.#textWidth = penX * this.#params.scale;
		this.#lineHeight =
			Number.isFinite(minY) && Number.isFinite(maxY)
				? maxY - minY
				: waveFontData.common.lineHeight * this.#params.scale;

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
			throw new Error("MarqueeTextMsdf: failed to allocate geometry buffers");
		}

		gl.bindVertexArray(this.#vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboPos);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboUv);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#ibo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.DYNAMIC_DRAW);

		gl.bindVertexArray(null);

		this.#indexCount = indices.length;
	}

	#loadAtlasTexture(): void {
		const image = new Image();
		image.src = this.#atlasUrl;

		image.addEventListener("load", () => {
			const gl = this.#gl;
			const texture = gl.createTexture();
			if (!texture) {
				return;
			}
			this.#atlasTexture = texture;

			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindTexture(gl.TEXTURE_2D, null);

			this.#isAtlasReady = true;
		});

		image.addEventListener("error", () => {
			// eslint-disable-next-line no-console
			console.error("MarqueeTextMsdf: failed to load atlas image", this.#atlasUrl);
		});
	}
}
