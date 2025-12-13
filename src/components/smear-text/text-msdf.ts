import waveFontJson from "../../assets/msdf/wave-text.json";
import { createProgram, getUniform } from "../../lib/webgl";

const vsSource = `#version 300 es
  precision highp float;

  layout(location = 0) in vec2 a_position; // (x, z) on the ground plane
  layout(location = 1) in vec2 a_uv;

  uniform mat4 u_viewProj;
  uniform mat4 u_model;
  uniform vec2 u_offset; // (x, z) translation in world units
  uniform vec2 u_cursor; // (x, z) world-space cursor on the plane
  uniform vec2 u_velocity; // cursor velocity (world units per frame)
  uniform float u_cursorActive;
  uniform float u_radius;
  uniform float u_lift;
  uniform float u_smear;

  out vec2 v_uv;

  void main() {
    v_uv = a_uv;
    vec2 p = vec2(a_position.x + u_offset.x, a_position.y + u_offset.y);

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

    vec2 texSize = vec2(textureSize(u_atlas, 0));
    vec2 msdfUnit = vec2(u_pxRange) / texSize;
    vec2 screenTexSize = vec2(1.0) / fwidth(v_uv);
    float screenPxRange = max(0.5 * dot(msdfUnit, screenTexSize), 1.0);

    float alpha = clamp(sd * screenPxRange + 0.5, 0.0, 1.0);
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

export type SmearTextMsdfUniforms = {
	viewProj: Float32Array;
	model: Float32Array;
	offset: { x: number; z: number };
	cursor: { x: number; z: number };
	velocity: { x: number; z: number };
	cursorActive: number;
	radius: number;
	lift: number;
	smear: number;
};

export type SmearTextMsdfParams = {
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

type Bounds = {
	width: number;
	depth: number;
};

type Glyph = MsdfFontChar;

const GLYPH_GRID_X = 32;
const GLYPH_GRID_Y = 16;
const GLYPH_GRID_MIN = 1;

const DEFAULT_PARAMS: SmearTextMsdfParams = {
	text: "WORKS",
	color: [1, 1, 1, 1],
	scale: 4.0,
	letterSpacing: 2,
};

export class SmearTextMsdf {
	#gl: WebGL2RenderingContext;
	#program: WebGLProgram;

	#atlasTexture: WebGLTexture | null = null;
	#vao: WebGLVertexArrayObject | null = null;
	#vboPos: WebGLBuffer | null = null;
	#vboUv: WebGLBuffer | null = null;
	#ibo: WebGLBuffer | null = null;
	#indexCount = 0;

	#uViewProj: WebGLUniformLocation;
	#uModel: WebGLUniformLocation;
	#uOffset: WebGLUniformLocation;
	#uCursor: WebGLUniformLocation;
	#uVelocity: WebGLUniformLocation;
	#uCursorActive: WebGLUniformLocation;
	#uRadius: WebGLUniformLocation;
	#uLift: WebGLUniformLocation;
	#uSmear: WebGLUniformLocation;
	#uColor: WebGLUniformLocation;
	#uAtlas: WebGLUniformLocation;
	#uPxRange: WebGLUniformLocation;

	#glyphsByChar: Map<string, Glyph>;
	#kerningByPair: Map<number, number>;

	#params: SmearTextMsdfParams;
	#pxRange: number;
	#atlasUrl: string;
	#isAtlasReady = false;

	#bounds: Bounds = { width: 0, depth: 0 };

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

		this.#uViewProj = getUniform(gl, this.#program, "u_viewProj");
		this.#uModel = getUniform(gl, this.#program, "u_model");
		this.#uOffset = getUniform(gl, this.#program, "u_offset");
		this.#uCursor = getUniform(gl, this.#program, "u_cursor");
		this.#uVelocity = getUniform(gl, this.#program, "u_velocity");
		this.#uCursorActive = getUniform(gl, this.#program, "u_cursorActive");
		this.#uRadius = getUniform(gl, this.#program, "u_radius");
		this.#uLift = getUniform(gl, this.#program, "u_lift");
		this.#uSmear = getUniform(gl, this.#program, "u_smear");
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

	getScale(): number {
		return this.#params.scale;
	}

	getBounds(): Bounds {
		return this.#bounds;
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
		this.#params = { ...this.#params, letterSpacing };
		this.#buildGeometry(this.#params.text);
	}

	render(u: SmearTextMsdfUniforms): void {
		if (!this.#isAtlasReady || !this.#vao || this.#indexCount === 0) return;

		const gl = this.#gl;
		gl.useProgram(this.#program);

		gl.uniformMatrix4fv(this.#uViewProj, false, u.viewProj);
		gl.uniformMatrix4fv(this.#uModel, false, u.model);
		gl.uniform2f(this.#uOffset, u.offset.x, u.offset.z);
		gl.uniform2f(this.#uCursor, u.cursor.x, u.cursor.z);
		gl.uniform2f(this.#uVelocity, u.velocity.x, u.velocity.z);
		gl.uniform1f(this.#uCursorActive, u.cursorActive);
		gl.uniform1f(this.#uRadius, u.radius);
		gl.uniform1f(this.#uLift, u.lift);
		gl.uniform1f(this.#uSmear, u.smear);
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
		let minZ = Number.POSITIVE_INFINITY;
		let maxZ = Number.NEGATIVE_INFINITY;

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

			// Tessellate glyph in local space.
			for (let iy = 0; iy <= gridY; iy++) {
				const ty = gridY > 0 ? iy / gridY : 0;
				const gy = gy0 + (gy1 - gy0) * ty;
				const vy = v0 + (v1 - v0) * ty;

				for (let ix = 0; ix <= gridX; ix++) {
					const tx = gridX > 0 ? ix / gridX : 0;
					const gx = gx0 + (gx1 - gx0) * tx;
					const ux = u0 + (u1 - u0) * tx;

					const x = gx * scale;
					const z = gy * scale;

					minX = Math.min(minX, x);
					maxX = Math.max(maxX, x);
					minZ = Math.min(minZ, z);
					maxZ = Math.max(maxZ, z);

					positions.push(x, z);
					uvs.push(ux, vy);
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

		const width = Number.isFinite(minX) && Number.isFinite(maxX) ? maxX - minX : 0;
		const depth = Number.isFinite(minZ) && Number.isFinite(maxZ) ? maxZ - minZ : 0;
		this.#bounds = { width, depth };

		if (positions.length > 0 && Number.isFinite(minX) && Number.isFinite(minZ)) {
			const xCenter = (minX + maxX) * 0.5;
			const zShift = -minZ;
			for (let i = 0; i < positions.length; i += 2) {
				positions[i] = (positions[i] ?? 0) - xCenter;
				positions[i + 1] = (positions[i + 1] ?? 0) + zShift;
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
			throw new Error("SmearTextMsdf: failed to allocate geometry buffers");
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
		});

		image.addEventListener("error", () => {
			// eslint-disable-next-line no-console
			console.error("SmearTextMsdf: failed to load atlas image", this.#atlasUrl);
		});
	}
}
