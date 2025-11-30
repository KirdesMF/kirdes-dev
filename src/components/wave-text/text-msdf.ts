import waveFontJson from "../../assets/msdf/wave-text.json";
import { createProgram, getUniform } from "../../lib/webgl";

const vsSource = `#version 300 es
  precision highp float;

  layout(location = 0) in vec2 a_position;
  layout(location = 1) in vec2 a_uv;

  uniform vec2  u_resolution;
  uniform float u_phase;
  uniform float u_amplitude;
  uniform float u_frequency;
  // u_offset.x: world X offset of the text block
  // u_offset.y: vertical offset above the wave baseline (en px, >0 = above line)
  uniform vec2  u_offset;

  out vec2 v_uv;

  void main() {
    v_uv = a_uv;

    // X world position (texte entier translaté par u_offset.x)
    float xWorld = a_position.x + u_offset.x;

    // Même forme de wave que la line (sans envelope, même phase/frequency)
    float arg   = xWorld * u_frequency + u_phase;
    float wave  = sin(arg) * u_amplitude;

    // Baseline centrée, sans point fixe (même logique que la line)
    float baselineY = u_resolution.y * 0.5 + wave;

    // Slope de la wave (dérivée)
    float slope = cos(arg) * u_amplitude * u_frequency;

    // Tangente et normale unitaires le long de la courbe
    vec2 tangent = normalize(vec2(1.0, slope));
    vec2 normal  = vec2(-tangent.y, tangent.x);

    // Point sur la courbe pour ce x, décalé au-dessus de la wave via u_offset.y
    vec2 basePos = vec2(xWorld, baselineY - u_offset.y);

    // a_position.y est interprété comme distance le long de la normale
    vec2 worldPos = basePos + normal * a_position.y;

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

  uniform vec2  u_lensCenterPx;
  uniform float u_lensRadiusPx;
  uniform float u_lensFeatherPx;

  in vec2 v_uv;
  out vec4 outColor;

  float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
  }

  void main() {
    vec3 msd = texture(u_atlas, v_uv).rgb;
    float sd = median(msd.r, msd.g, msd.b) - 0.5;

    // Fill alpha (hors lens)
    float alphaFill = clamp(sd * u_pxRange + 0.5, 0.0, 1.0);

    // Bande d'outline autour de sd=0
    float edgeWidth = 0.12;
    float edgeDist = abs(sd);
    float outline = 1.0 - smoothstep(0.0, edgeWidth, edgeDist);

    // Masque lens radial
    float d = distance(gl_FragCoord.xy, u_lensCenterPx);
    float m = 1.0 - smoothstep(
      u_lensRadiusPx - u_lensFeatherPx,
      u_lensRadiusPx + u_lensFeatherPx,
      d
    );

    // Hors lens: texte plein
    vec4 baseColor = vec4(u_color.rgb, u_color.a * alphaFill);
    // Dans la lens: contour uniquement (même couleur)
    vec4 lensColor = vec4(u_color.rgb, u_color.a * outline);

    vec4 color = mix(baseColor, lensColor, m);

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

export type WaveTextMsdfUniforms = {
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

type Glyph = MsdfFontChar;

export type WaveTextMsdfParams = {
	text: string;
	color: [number, number, number, number];
	/** Geometry scale factor relative to font units */
	scale: number;
	/**
	 * Extra horizontal spacing between glyphs (in font units).
	 * Positive = more spaced, negative = tighter.
	 */
	letterSpacing: number;
};

// Tesselation grid per glyph (in glyph local space)
const GLYPH_GRID_X = 12;
const GLYPH_GRID_Y = 6;
const GLYPH_GRID_MIN = 1;

const DEFAULT_PARAMS: WaveTextMsdfParams = {
	text: "WORKS",
	color: [1, 1, 1, 1],
	scale: 3.0,
	letterSpacing: 0,
};

export class WaveTextMsdf {
	#gl: WebGL2RenderingContext;
	#program: WebGLProgram;

	#atlasTexture: WebGLTexture | null = null;
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
	#uColor: WebGLUniformLocation;
	#uAtlas: WebGLUniformLocation;
	#uPxRange: WebGLUniformLocation;

	#uLensCenterPx: WebGLUniformLocation;
	#uLensRadiusPx: WebGLUniformLocation;
	#uLensFeatherPx: WebGLUniformLocation;

	#glyphsByChar: Map<string, Glyph>;
	#kerningByPair: Map<number, number>;

	#params: WaveTextMsdfParams;
	#textWidth = 0;
	#pxRange: number;
	#atlasUrl: string;
	#isAtlasReady = false;

	constructor({
		gl,
		text,
		color,
		scale,
		letterSpacing,
	}: {
		gl: WebGL2RenderingContext;
		text?: string;
		color?: [number, number, number, number];
		scale?: number;
		letterSpacing?: number;
	}) {
		this.#gl = gl;
		this.#program = createProgram({ gl, vsSource, fsSource });

		this.#params = {
			text: text ?? DEFAULT_PARAMS.text,
			color: color ?? DEFAULT_PARAMS.color,
			scale: scale ?? DEFAULT_PARAMS.scale,
			letterSpacing: letterSpacing ?? DEFAULT_PARAMS.letterSpacing,
		};

		this.#uResolution = getUniform(gl, this.#program, "u_resolution");
		this.#uPhase = getUniform(gl, this.#program, "u_phase");
		this.#uAmplitude = getUniform(gl, this.#program, "u_amplitude");
		this.#uFrequency = getUniform(gl, this.#program, "u_frequency");
		this.#uOffset = getUniform(gl, this.#program, "u_offset");
		this.#uColor = getUniform(gl, this.#program, "u_color");
		this.#uAtlas = getUniform(gl, this.#program, "u_atlas");
		this.#uPxRange = getUniform(gl, this.#program, "u_pxRange");

		this.#uLensCenterPx = getUniform(gl, this.#program, "u_lensCenterPx");
		this.#uLensRadiusPx = getUniform(gl, this.#program, "u_lensRadiusPx");
		this.#uLensFeatherPx = getUniform(gl, this.#program, "u_lensFeatherPx");

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

	getScale(): number {
		return this.#params.scale;
	}

	setText(text: string): void {
		if (text === this.#params.text) return;
		this.#params = { ...this.#params, text };
		this.#buildGeometry(text);
	}

	setColor(color: [number, number, number, number]): void {
		this.#params = { ...this.#params, color };
	}

	setScale(scale: number): void {
		const clamped = scale > 0 ? scale : DEFAULT_PARAMS.scale;
		if (clamped === this.#params.scale) return;
		this.#params = { ...this.#params, scale: clamped };
		this.#buildGeometry(this.#params.text);
	}

	setLetterSpacing(letterSpacing: number): void {
		if (letterSpacing === this.#params.letterSpacing) return;
		this.#params = {
			...this.#params,
			letterSpacing,
		};
		this.#buildGeometry(this.#params.text);
	}

	render(u: WaveTextMsdfUniforms): void {
		if (!this.#isAtlasReady || !this.#vao || this.#indexCount === 0) return;

		const gl = this.#gl;
		gl.useProgram(this.#program);

		gl.uniform2f(this.#uResolution, u.resolution.width, u.resolution.height);
		gl.uniform1f(this.#uPhase, u.phase);
		gl.uniform1f(this.#uAmplitude, u.amplitude);
		gl.uniform1f(this.#uFrequency, u.frequency);
		gl.uniform2f(this.#uOffset, u.offset.x, u.offset.y);

		gl.uniform2f(this.#uLensCenterPx, u.lens.centerPx.x, u.lens.centerPx.y);
		gl.uniform1f(this.#uLensRadiusPx, u.lens.radiusPx);
		gl.uniform1f(this.#uLensFeatherPx, u.lens.featherPx);

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

		const gridX = Math.max(GLYPH_GRID_MIN, GLYPH_GRID_X);
		const gridY = Math.max(GLYPH_GRID_MIN, GLYPH_GRID_Y);

		let penX = 0;
		const penY = 0;
		let prevId: number | null = null;

		for (let i = 0; i < text.length; i++) {
			const ch = text[i] ?? "";
			const glyph = this.#glyphsByChar.get(ch);
			if (!glyph) continue;

			penX += this.#getKerning(prevId, glyph.id);

			// Glyph rectangle in font units, baseline at y = 0 (then scaled to pixels)
			const gx0 = penX + glyph.xoffset;
			const gy0 = penY + glyph.yoffset - baseline;
			const gx1 = gx0 + glyph.width;
			const gy1 = gy0 + glyph.height;

			// UV rectangle in atlas space
			const u0 = glyph.x / scaleW;
			const v0 = glyph.y / scaleH;
			const u1 = (glyph.x + glyph.width) / scaleW;
			const v1 = (glyph.y + glyph.height) / scaleH;

			const baseIndex = positions.length / 2;

			// Tesselate the glyph into a grid in local glyph space
			for (let iy = 0; iy <= gridY; iy++) {
				const ty = gridY > 0 ? iy / gridY : 0;
				const gy = gy0 + (gy1 - gy0) * ty;
				const vy = v0 + (v1 - v0) * ty;

				for (let ix = 0; ix <= gridX; ix++) {
					const tx = gridX > 0 ? ix / gridX : 0;
					const gx = gx0 + (gx1 - gx0) * tx;
					const ux = u0 + (u1 - u0) * tx;

					positions.push(gx * scale, gy * scale);
					uvs.push(ux, vy);
				}
			}

			// Triangles per cell in the grid
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

			// Advance pen position with glyph advance + extra spacing
			penX += glyph.xadvance + letterSpacing;
			prevId = glyph.id;
		}

		this.#textWidth = penX * scale;
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
			throw new Error("WaveTextMsdf: failed to allocate geometry buffers");
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
			console.error("WaveTextMsdf: failed to load atlas image", this.#atlasUrl);
		});
	}
}
