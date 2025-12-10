// FILE: src/components/smear-text/tilted-text-msdf.ts
// MSDF text rendering on a 3D plane (real perspective via model/view/proj)

import waveFontJson from "../../assets/msdf/wave-text.json";
import { createProgram, getUniform } from "../../lib/webgl";

const vsSource = `#version 300 es
  precision highp float;

  layout(location = 0) in vec3 a_position;
  layout(location = 1) in vec2 a_uv;

  uniform mat4 u_model;
  uniform mat4 u_view;
  uniform mat4 u_proj;

  // Shadow params
  uniform bool u_isShadow;
  uniform vec3 u_shadowOffset; // world-space offset for shadow

  out vec2 v_uv;

  void main() {
    v_uv = a_uv;

    // Local → world
    vec4 worldPos = u_model * vec4(a_position, 1.0);

    // For shadow, slide along world-space offset but keep same plane orientation
    if (u_isShadow) {
      worldPos.xyz += u_shadowOffset;
    }

    // World → view → clip
    vec4 viewPos = u_view * worldPos;
    gl_Position = u_proj * viewPos;
  }
`;

const fsSource = `#version 300 es
  precision highp float;

  uniform sampler2D u_atlas;
  uniform vec4      u_color;
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
    if (alpha <= 0.01) {
      discard;
    }

    outColor = vec4(u_color.rgb, u_color.a * alpha);
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

type Glyph = MsdfFontChar;

// Tesselation grid per glyph – assez dense pour un smear smooth
const GLYPH_GRID_X = 24;
const GLYPH_GRID_Y = 12;
const GLYPH_GRID_MIN = 1;

export type TiltedTextMsdfParams = {
	text: string;
	color: [number, number, number, number];
	scale: number;
	letterSpacing: number;
};

export type TiltedTextMsdfUniforms = {
	model: Float32Array;
	view: Float32Array;
	proj: Float32Array;
	isShadow: boolean;
	shadowOffset: [number, number, number];
};

export type TiltedTextSize = {
	width: number;
	height: number;
};

const DEFAULT_PARAMS: TiltedTextMsdfParams = {
	text: "PORTFOLIO",
	color: [1, 1, 1, 1],
	scale: 3.5,
	letterSpacing: 2,
};

export class TiltedTextMsdf {
	#gl: WebGL2RenderingContext;
	#program: WebGLProgram;

	#atlasTexture: WebGLTexture | null = null;
	#vao: WebGLVertexArrayObject | null = null;
	#vboPos: WebGLBuffer | null = null;
	#vboUv: WebGLBuffer | null = null;
	#ibo: WebGLBuffer | null = null;
	#indexCount = 0;

	#uModel: WebGLUniformLocation;
	#uView: WebGLUniformLocation;
	#uProj: WebGLUniformLocation;
	#uIsShadow: WebGLUniformLocation;
	#uShadowOffset: WebGLUniformLocation;
	#uColor: WebGLUniformLocation;
	#uAtlas: WebGLUniformLocation;
	#uPxRange: WebGLUniformLocation;

	#glyphsByChar: Map<string, Glyph>;
	#kerningByPair: Map<number, number>;

	#params: TiltedTextMsdfParams;
	#pxRange: number;
	#atlasUrl: string;
	#isAtlasReady = false;

	#size: TiltedTextSize = { width: 0, height: 0 };

	// --- Smear state (CPU deformation in local 3D) ---
	#basePositions: Float32Array | null = null;
	#smearPositions: Float32Array | null = null;
	#smearEnabled = false;
	#smearCenter = { x: 0, y: 0 };
	#smearRadius = 0;
	#smearStrength = 0;
	#smearDirty = true;

	constructor(params: {
		gl: WebGL2RenderingContext;
		text?: string;
		color?: [number, number, number, number];
		scale?: number;
		letterSpacing?: number;
	}) {
		this.#gl = params.gl;
		this.#program = createProgram({ gl: this.#gl, vsSource, fsSource });

		this.#params = {
			text: params.text ?? DEFAULT_PARAMS.text,
			color: params.color ?? DEFAULT_PARAMS.color,
			scale: params.scale ?? DEFAULT_PARAMS.scale,
			letterSpacing: params.letterSpacing ?? DEFAULT_PARAMS.letterSpacing,
		};

		this.#uModel = getUniform(this.#gl, this.#program, "u_model");
		this.#uView = getUniform(this.#gl, this.#program, "u_view");
		this.#uProj = getUniform(this.#gl, this.#program, "u_proj");
		this.#uIsShadow = getUniform(this.#gl, this.#program, "u_isShadow");
		this.#uShadowOffset = getUniform(this.#gl, this.#program, "u_shadowOffset");
		this.#uColor = getUniform(this.#gl, this.#program, "u_color");
		this.#uAtlas = getUniform(this.#gl, this.#program, "u_atlas");
		this.#uPxRange = getUniform(this.#gl, this.#program, "u_pxRange");

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

	getSize(): TiltedTextSize {
		return { ...this.#size };
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

	// Smear API: lift vertices along local Z inside an elliptical area in (x, y).
	setSmear(center: { x: number; y: number }, radius: number, strength: number): void {
		this.#smearCenter = { x: center.x, y: center.y };
		this.#smearRadius = radius;
		this.#smearStrength = strength;
		this.#smearEnabled = radius > 0 && strength !== 0;
		this.#smearDirty = true;
	}

	clearSmear(): void {
		this.#smearEnabled = false;
		this.#smearStrength = 0;
		this.#smearDirty = true;
	}

	render(u: TiltedTextMsdfUniforms): void {
		if (!this.#isAtlasReady || !this.#vao || this.#indexCount === 0) return;

		this.#applySmearIfNeeded();

		const gl = this.#gl;
		gl.useProgram(this.#program);

		gl.uniformMatrix4fv(this.#uModel, false, u.model);
		gl.uniformMatrix4fv(this.#uView, false, u.view);
		gl.uniformMatrix4fv(this.#uProj, false, u.proj);
		gl.uniform1i(this.#uIsShadow, u.isShadow ? 1 : 0);
		gl.uniform3f(this.#uShadowOffset, u.shadowOffset[0], u.shadowOffset[1], u.shadowOffset[2]);

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

		let minX = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		for (let i = 0; i < text.length; i += 1) {
			const ch = text[i] ?? "";
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

			const baseIndex = positions.length / 3;

			for (let iy = 0; iy <= gridY; iy += 1) {
				const ty = gridY > 0 ? iy / gridY : 0;
				const gy = gy0 + (gy1 - gy0) * ty;
				const vy = v0 + (v1 - v0) * ty;

				for (let ix = 0; ix <= gridX; ix += 1) {
					const tx = gridX > 0 ? ix / gridX : 0;
					const gx = gx0 + (gx1 - gx0) * tx;
					const ux = u0 + (u1 - u0) * tx;

					const px = gx * scale;
					const py = gy * scale;

					// Flip Y: font space is Y-down, 3D space Y-up
					positions.push(px, -py, 0);
					uvs.push(ux, vy);

					if (px < minX) minX = px;
					if (px > maxX) maxX = px;
					if (py < minY) minY = py;
					if (py > maxY) maxY = py;
				}
			}

			const vertsPerRow = gridX + 1;
			for (let iy = 0; iy < gridY; iy += 1) {
				for (let ix = 0; ix < gridX; ix += 1) {
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

		if (minX === Number.POSITIVE_INFINITY) {
			minX = 0;
			maxX = 0;
			minY = 0;
			maxY = 0;
		}

		const width = maxX - minX;
		const height = maxY - minY;

		// Center geometry around origin in local space
		const centerX = minX + width * 0.5;
		const centerY = minY + height * 0.5;

		for (let i = 0; i < positions.length; i += 3) {
			positions[i] -= centerX;
			positions[i + 1] += centerY; // Y already flipped above
		}

		this.#size = {
			width,
			height,
		};

		this.#uploadGeometry(new Float32Array(positions), new Float32Array(uvs), new Uint16Array(indices));
	}

	#uploadGeometry(positions: Float32Array, uvs: Float32Array, indices: Uint16Array): void {
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
			throw new Error("TiltedTextMsdf: failed to allocate geometry buffers");
		}

		// Store base positions for future smear deformation
		this.#basePositions = new Float32Array(positions.length);
		this.#basePositions.set(positions);
		this.#smearPositions = new Float32Array(positions.length);
		this.#smearPositions.set(positions);
		this.#smearDirty = true;

		gl.bindVertexArray(this.#vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboPos);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboUv);
		gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#ibo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

		gl.bindVertexArray(null);

		this.#indexCount = indices.length;
	}

	#applySmearIfNeeded(): void {
		if (!this.#smearDirty) return;
		if (!this.#vboPos || !this.#basePositions || !this.#smearPositions) return;

		const src = this.#basePositions;
		const dst = this.#smearPositions;

		if (!this.#smearEnabled || this.#smearRadius <= 0 || this.#smearStrength === 0) {
			dst.set(src);
		} else {
			// Elliptical region: plus large le long de X (direction du mot),
			// plus étroit le long de Y (épaisseur de la lettre).
			const baseRadius = this.#smearRadius;
			const radiusX = baseRadius;
			const radiusY = baseRadius * 0.5; // réduit l'influence en vertical

			const invRadiusX2 = radiusX > 0 ? 1 / (radiusX * radiusX) : 0;
			const invRadiusY2 = radiusY > 0 ? 1 / (radiusY * radiusY) : 0;

			const strength = this.#smearStrength;
			const centerX = this.#smearCenter.x;
			const centerY = this.#smearCenter.y;

			for (let i = 0; i < src.length; i += 3) {
				const x = src[i];
				const y = src[i + 1];
				const z = src[i + 2];

				const dx = x - centerX;
				const dy = y - centerY;

				// q = 1 sur l'ellipse, 0 au centre
				const q = dx * dx * invRadiusX2 + dy * dy * invRadiusY2;

				if (q >= 1) {
					dst[i] = x;
					dst[i + 1] = y;
					dst[i + 2] = z;
				} else {
					// Falloff très raide: centre fortement levé, bords presque immobiles
					const t = 1 - q; // t in (0,1]
					const falloff = t * t * t * t; // (1 - q)^4
					const lift = strength * falloff;

					dst[i] = x;
					dst[i + 1] = y;
					dst[i + 2] = z + lift;
				}
			}
		}

		const gl = this.#gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#vboPos);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, dst);
		this.#smearDirty = false;
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

			gl.bindTexture(this.#gl.TEXTURE_2D, texture);
			gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, image);
			gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MIN_FILTER, this.#gl.LINEAR);
			gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MAG_FILTER, this.#gl.LINEAR);
			gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_S, this.#gl.CLAMP_TO_EDGE);
			gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_T, this.#gl.CLAMP_TO_EDGE);
			gl.bindTexture(this.#gl.TEXTURE_2D, null);

			this.#isAtlasReady = true;
		});

		image.addEventListener("error", () => {
			// eslint-disable-next-line no-console
			console.error("TiltedTextMsdf: failed to load atlas image", this.#atlasUrl);
		});
	}
}
