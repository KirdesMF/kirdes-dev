import { createProgram } from "./_utils";

export type WaveTextConfig = {
	text: string;
	fontCSS: string; // ex: "800 260px Arial, sans-serif"
	color: string; // fill style 2D
	lineSpacingPx: number; // distance entre haut et miroir
	letterSpacingPx: number; // letter-spacing CSS
	gridRes: number; // subdivisions (ex: 200)
	maxTextureSize?: number; // pour mobile (ex: 2048)
};

export type WaveUniforms = {
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

const VS = `#version 300 es
  precision highp float;

  layout(location=0) in vec2 a_position;
  layout(location=1) in vec2 a_uv;

  uniform vec2  u_resolution;
  uniform float u_phase;
  uniform float u_amplitude;
  uniform float u_frequency;
  uniform vec2  u_offset;

  out vec2 v_uv;

  void main() {
    v_uv = a_uv;

    vec2 pos = a_position + u_offset;

    // onde appliquée le long de x
    float wave = sin(pos.x * u_frequency + u_phase) * u_amplitude;

    // étirement vertical (suivre la pente)
    float slope   = cos(pos.x * u_frequency + u_phase) * u_amplitude * u_frequency;
    float stretch = sqrt(1.0 + slope * slope);

    // ancre sur baseline verticale (milieu d'écran)
    float baseline = u_resolution.y * 0.5;
    pos.y = baseline + (pos.y + wave - baseline) * stretch;

    // NDC
    vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
    clip.y *= -1.0;

    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

const FS = `#version 300 es
  precision mediump float;

  uniform sampler2D u_tex;
  uniform vec2  u_resolution;
  uniform vec2  u_lensCenterPx;
  uniform float u_lensRadiusPx;
  uniform float u_lensFeatherPx;

  in vec2 v_uv;
  out vec4 outColor;

  float smoothCircleMask(vec2 p, vec2 c, float r, float feather) {
    float d = distance(p, c);
    return 1.0 - smoothstep(r - feather, r + feather, d);
  }

  void main() {
    vec4 texel = texture(u_tex, v_uv);
    if (texel.a < 0.05) discard;

    // Lens mask en coordonnées écran (gl_FragCoord.xy)
    vec2 fragPx = gl_FragCoord.xy; // déjà en px
    float m = smoothCircleMask(fragPx, u_lensCenterPx, u_lensRadiusPx, u_lensFeatherPx);

    // Hors lentille -> rendu normal
    if (m <= 0.001) {
      outColor = texel;
      return;
    }

    // ----- Dans la lentille: outline + hatch -----
    // Détection de bord (sur la texture alpha)
    vec2 texelSize = vec2(dFdx(v_uv.x), dFdy(v_uv.y)); // approx screen-texel
    // 4-neighbors
    float aC = texel.a;
    float aL = texture(u_tex, v_uv + vec2(-texelSize.x, 0.0)).a;
    float aR = texture(u_tex, v_uv + vec2( texelSize.x, 0.0)).a;
    float aT = texture(u_tex, v_uv + vec2(0.0, -texelSize.y)).a;
    float aB = texture(u_tex, v_uv + vec2(0.0,  texelSize.y)).a;

    float edge = step(0.1, abs(aC - aL) + abs(aC - aR) + abs(aC - aT) + abs(aC - aB));

    // Hatch diagonales en écran
    float stripe = step(0.5, fract((fragPx.x + fragPx.y) * 0.02)); // densité ~ 50px
    float hatchAlpha = texel.a * (1.0 - edge) * (stripe * 0.55);   // rempli mais discret
    float outlineAlpha = edge * 1.0; // contour net

    vec3 col = vec3(1.0); // blanc (reprend ta teinte si tu veux)
    vec4 hatch = vec4(col, hatchAlpha);
    vec4 outline = vec4(col, outlineAlpha);

    // Combine + re-mask par la lentille (m)
    vec4 wf = (hatch + outline) * m;

    // Petit fail-safe : si rien dans la lentille (extrêmement mince), retombe sur texel
    if (wf.a < 0.01) wf = texel;

    outColor = wf;
  }
`;

function getUniform(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	name: string,
): WebGLUniformLocation {
	const loc = gl.getUniformLocation(program, name);
	if (loc === null) throw new Error(`uniform ${name} not found`);
	return loc;
}

export class WaveText {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;

	private tex: WebGLTexture | null = null;
	private vao: WebGLVertexArrayObject | null = null;
	private vboPos: WebGLBuffer | null = null;
	private vboUV: WebGLBuffer | null = null;
	private ibo: WebGLBuffer | null = null;

	private meshIndexCount = 0;

	private textCanvas: HTMLCanvasElement;
	private textCtx: CanvasRenderingContext2D;

	// taille du quad (en pixels scène) et offscreen (texture)
	private quadW = 1400;
	private quadH = 550;
	private texW = 2048;
	private texH = 1024;

	private uTex: WebGLUniformLocation;
	private uRes: WebGLUniformLocation;
	private uPhase: WebGLUniformLocation;
	private uAmp: WebGLUniformLocation;
	private uFreq: WebGLUniformLocation;
	private uOffset: WebGLUniformLocation;

	public config: WaveTextConfig;

	constructor(
		gl: WebGL2RenderingContext,
		config: Partial<WaveTextConfig> = {},
	) {
		this.gl = gl;
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		this.config = {
			text: "WORKS",
			fontCSS: "800 240px Commissioner Variable, sans-serif",
			color: "#ffffff",
			lineSpacingPx: 20,
			letterSpacingPx: -15,
			gridRes: 200,
			maxTextureSize: 2048,
			...config,
		};

		// uniforms (avec checks)
		this.uTex = getUniform(this.gl, this.program, "u_tex");
		this.uRes = getUniform(this.gl, this.program, "u_resolution");
		this.uPhase = getUniform(this.gl, this.program, "u_phase");
		this.uAmp = getUniform(this.gl, this.program, "u_amplitude");
		this.uFreq = getUniform(this.gl, this.program, "u_frequency");
		this.uOffset = getUniform(this.gl, this.program, "u_offset");

		// offscreen canvas pour générer la texture texte (sans non-null assertions)
		const maxTex = this.config.maxTextureSize ?? 2048;
		this.textCanvas = document.createElement("canvas");
		this.textCanvas.width = this.texW = Math.min(this.texW, maxTex);
		this.textCanvas.height = this.texH = Math.min(this.texH, maxTex >> 1);

		const ctx = this.textCanvas.getContext("2d");
		if (!ctx) throw new Error("2D context not available");
		this.textCtx = ctx;

		// init GL resources
		this.createTexture();
		this.createMesh(this.quadW, this.quadH, this.config.gridRes);
		this.loadFontAndUpload();
	}

	private async loadFontAndUpload(): Promise<void> {
		const fonts = (
			document as unknown as {
				fonts?: {
					ready?: Promise<void>;
					load?: (f: string) => Promise<unknown>;
				};
			}
		).fonts;
		if (fonts?.ready) {
			try {
				await fonts.ready;
			} catch {
				/* no-op */
			}
		}
		if (fonts?.load) {
			try {
				await fonts.load(this.config.fontCSS);
			} catch {
				/* no-op */
			}
		}
		this.drawTextToCanvas();
		this.uploadTexture(true);
	}

	public getTextureCanvasWidth(): number {
		return this.textCanvas.width; // equals this.texW
	}

	public getTextContentWidthPx(): number {
		const ctx = this.textCtx;
		const text = this.config.text;
		if (!text) return 0;

		// Police/align identiques au rendu
		ctx.font = this.config.fontCSS;
		ctx.letterSpacing = `${this.config.letterSpacingPx}px`;

		// measureText (ne compte pas le letter-spacing)
		const m = ctx.measureText(text);
		const extra = Math.max(0, text.length - 1) * this.config.letterSpacingPx;
		return Math.max(0, m.width + extra);
	}

	// --- public controls ---
	public updateText(t: string): void {
		this.config.text = t;
		this.drawTextToCanvas();
		this.uploadTexture(false);
	}

	public updateColor(cssColor: string): void {
		this.config.color = cssColor;
		this.drawTextToCanvas();
		this.uploadTexture(false);
	}

	public resizeQuad(args: {
		width: number;
		height: number;
		gridRes?: number;
	}): void {
		const { width, height, gridRes } = args;
		const res = gridRes ?? this.config.gridRes;
		this.quadW = Math.max(100, Math.floor(width));
		this.quadH = Math.max(100, Math.floor(height));
		this.destroyMesh();
		this.createMesh(this.quadW, this.quadH, res);
	}

	// --- drawing ---
	public render(uniforms: WaveUniforms): void {
		const gl = this.gl;
		gl.useProgram(this.program);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		gl.uniform1i(this.uTex, 0);

		gl.uniform2f(
			this.uRes,
			uniforms.resolution.width,
			uniforms.resolution.height,
		);
		gl.uniform2f(
			gl.getUniformLocation(this.program, "u_lensCenterPx"),
			uniforms.lens?.centerPx.x ?? -9999,
			uniforms.lens?.centerPx.y ?? -9999,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_lensRadiusPx"),
			uniforms.lens?.radiusPx ?? 0.0,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_lensFeatherPx"),
			uniforms.lens?.featherPx ?? 1.0,
		);
		gl.uniform1f(this.uPhase, uniforms.phase);
		gl.uniform1f(this.uAmp, uniforms.amplitude);
		gl.uniform1f(this.uFreq, uniforms.frequency);
		gl.uniform2f(this.uOffset, uniforms.offset.x, uniforms.offset.y);

		gl.bindVertexArray(this.vao);
		gl.drawElements(gl.TRIANGLES, this.meshIndexCount, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}

	public dispose(): void {
		const gl = this.gl;
		if (this.vao) gl.deleteVertexArray(this.vao);
		if (this.vboPos) gl.deleteBuffer(this.vboPos);
		if (this.vboUV) gl.deleteBuffer(this.vboUV);
		if (this.ibo) gl.deleteBuffer(this.ibo);
		if (this.tex) gl.deleteTexture(this.tex);
		gl.deleteProgram(this.program);
	}

	// --- internals ---
	private createTexture(): void {
		const gl = this.gl;
		const t = gl.createTexture();
		if (!t) throw new Error("texture alloc failed");
		this.tex = t;

		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	private uploadTexture(initial: boolean): void {
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		if (initial) {
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				this.textCanvas,
			);
		} else {
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				this.textCanvas,
			);
		}
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	private drawTextToCanvas(): void {
		const ctx = this.textCtx;
		const W = this.textCanvas.width;
		const H = this.textCanvas.height;

		ctx.clearRect(0, 0, W, H);
		ctx.fillStyle = this.config.color;
		ctx.letterSpacing = `${this.config.letterSpacingPx}px`;
		ctx.textAlign = "center";
		ctx.textBaseline = "alphabetic";
		ctx.font = this.config.fontCSS;

		const cx = W * 0.5;
		const cy = H * 0.5;

		// texte haut (normal)
		ctx.fillText(this.config.text, cx, cy - this.config.lineSpacingPx);

		// miroir bas (flip X/Y)
		ctx.save();
		ctx.translate(cx, cy + this.config.lineSpacingPx);
		ctx.scale(-1, -1);
		ctx.fillText(this.config.text, 0, 0);
		ctx.restore();
	}

	private createMesh(width: number, height: number, gridRes: number): void {
		const gl = this.gl;

		const positions: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];

		for (let y = 0; y <= gridRes; y++) {
			for (let x = 0; x <= gridRes; x++) {
				const px = (x / gridRes) * width;
				const py = (y / gridRes) * height;
				positions.push(px, py);
				uvs.push(x / gridRes, y / gridRes);
			}
		}
		for (let y = 0; y < gridRes; y++) {
			for (let x = 0; x < gridRes; x++) {
				const tl = y * (gridRes + 1) + x;
				const tr = tl + 1;
				const bl = (y + 1) * (gridRes + 1) + x;
				const br = bl + 1;
				indices.push(tl, bl, tr, tr, bl, br);
			}
		}

		this.meshIndexCount = indices.length;

		const vao = gl.createVertexArray();
		const vboPos = gl.createBuffer();
		const vboUV = gl.createBuffer();
		const ibo = gl.createBuffer();
		if (!vao || !vboPos || !vboUV || !ibo) throw new Error("mesh alloc failed");

		this.vao = vao;
		this.vboPos = vboPos;
		this.vboUV = vboUV;
		this.ibo = ibo;

		gl.bindVertexArray(this.vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboUV);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
		gl.bufferData(
			gl.ELEMENT_ARRAY_BUFFER,
			new Uint16Array(indices),
			gl.STATIC_DRAW,
		);

		gl.bindVertexArray(null);
	}

	private destroyMesh(): void {
		const gl = this.gl;
		if (this.vao) {
			gl.deleteVertexArray(this.vao);
			this.vao = null;
		}
		if (this.vboPos) {
			gl.deleteBuffer(this.vboPos);
			this.vboPos = null;
		}
		if (this.vboUV) {
			gl.deleteBuffer(this.vboUV);
			this.vboUV = null;
		}
		if (this.ibo) {
			gl.deleteBuffer(this.ibo);
			this.ibo = null;
		}
	}
}
