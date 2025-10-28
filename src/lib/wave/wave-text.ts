import { createProgram } from "./_utils";

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  uniform vec2 u_resolution;
  uniform float u_phase;
  uniform float u_amplitude;
  uniform float u_frequency;
  uniform vec2 u_offset;
  uniform float u_scrollProgress;
  varying vec2 v_texCoord;

  void main() {
    v_texCoord = a_texCoord;
    vec2 position = a_position + u_offset;

    // Calcul de la position X basée sur le scroll
    // Utilise la coordonnée V de texture pour déterminer haut/bas
    // Texte du haut (v < 0.5) vient de la gauche (-), texte du bas (v >= 0.5) vient de la droite (+)
    float slideDirection = a_texCoord.y < 0.5 ? -1.0 : 1.0;
    float slideAmount = mix(2500.0 * slideDirection, 0.0, u_scrollProgress);

    position.x += slideAmount;

    float wave = sin(position.x * u_frequency + u_phase) * u_amplitude;
    position.y += wave;
    float slope = cos(position.x * u_frequency + u_phase) * u_amplitude * u_frequency;
    float stretch = sqrt(1.0 + slope * slope);
    float baselineY = u_resolution.y / 2.0;
    position.y = baselineY + (position.y - baselineY) * stretch;
    vec2 clipSpace = (position / u_resolution) * 2.0 - 1.0;
    clipSpace.y *= -1.0;
    gl_Position = vec4(clipSpace, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_texture;
  varying vec2 v_texCoord;

  void main() {
    vec4 color = texture2D(u_texture, v_texCoord);
    if (color.a < 0.1) discard;
    gl_FragColor = color;
  }
`;

type TextConfig = {
	text: string;
	font: string;
	lineSpacing: number;
	letterSpacing: number;
};

type TextMesh = {
	positions: Float32Array;
	texCoords: Float32Array;
	indices: Uint16Array;
};

function get2DContext(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to get 2D context");
	return ctx;
}

export class WaveText {
	#gl: WebGLRenderingContext;
	#program: WebGLProgram;
	#texture: WebGLTexture;
	#textCanvas: HTMLCanvasElement;
	#textCtx: CanvasRenderingContext2D;

	#positionBuffer: WebGLBuffer;
	#texCoordBuffer: WebGLBuffer;
	#indexBuffer: WebGLBuffer;

	#mesh: TextMesh;
	#textWidth = 0;
	#textHeight = 0;
	#gridResolution = 200;
	#scrollProgress = 0;

	config: TextConfig = {
		text: "WORKS",
		font: "800 260px Arial, sans-serif",
		lineSpacing: 20,
		letterSpacing: -15,
	};

	constructor(gl: WebGLRenderingContext, color: string) {
		this.#gl = gl;
		this.#program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);

		// create text canvas
		this.#textCanvas = document.createElement("canvas");
		this.#textCanvas.width = 2048;
		this.#textCanvas.height = 1024;
		this.#textCtx = get2DContext(this.#textCanvas);

		// create texture
		this.#texture = gl.createTexture();

		// init buffers
		this.#positionBuffer = gl.createBuffer();
		this.#texCoordBuffer = gl.createBuffer();
		this.#indexBuffer = gl.createBuffer();

		// create initial mesh
		this.#mesh = this.#createMesh(1400, 550, this.#gridResolution);
		this.#updateBuffers();
		this.#textCtx.fillStyle = color;
		this.#loadFont();
	}

	async #loadFont() {
		await document.fonts.ready;
		await document.fonts.load(this.config.font);
		this.#drawText();
		this.#uploadTexture(true);
	}

	#createMesh(width: number, height: number, gridRes: number) {
		const positions: number[] = [];
		const texCoords: number[] = [];
		const indices: number[] = [];

		for (let y = 0; y <= gridRes; y++) {
			for (let x = 0; x <= gridRes; x++) {
				const px = (x / gridRes) * width;
				const py = (y / gridRes) * height;
				positions.push(px, py);
				texCoords.push(x / gridRes, y / gridRes);
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

		return {
			positions: new Float32Array(positions),
			texCoords: new Float32Array(texCoords),
			indices: new Uint16Array(indices),
		};
	}

	#updateBuffers() {
		const gl = this.#gl;

		// position buffers
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.#mesh.positions, gl.STATIC_DRAW);

		// texture coordinate buffers
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#texCoordBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.#mesh.texCoords, gl.STATIC_DRAW);

		// index buffers
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#indexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.#mesh.indices, gl.STATIC_DRAW);
	}

	#drawText() {
		this.#textCtx.clearRect(
			0,
			0,
			this.#textCanvas.width,
			this.#textCanvas.height,
		);
		this.#textCtx.font = this.config.font;
		this.#textCtx.letterSpacing = `${this.config.letterSpacing}px`;
		this.#textCtx.textAlign = "center";
		this.#textCtx.textBaseline = "alphabetic";

		const centerY = this.#textCanvas.height / 2;
		const centerX = this.#textCanvas.width / 2;

		// Texte du haut (normal)
		this.#textCtx.fillText(
			this.config.text,
			centerX,
			centerY - this.config.lineSpacing,
		);

		// Texte du bas (reflet miroir avec flip horizontal)
		this.#textCtx.save();
		this.#textCtx.translate(centerX, centerY + this.config.lineSpacing);
		this.#textCtx.scale(-1, -1);
		this.#textCtx.fillText(this.config.text, 0, 0);
		this.#textCtx.restore();
	}

	#uploadTexture(initial = false) {
		const gl = this.#gl;
		gl.bindTexture(gl.TEXTURE_2D, this.#texture);

		initial
			? gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					gl.RGBA,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					this.#textCanvas,
				)
			: gl.texSubImage2D(
					gl.TEXTURE_2D,
					0,
					0,
					0,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					this.#textCanvas,
				);

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	updateTextColor(color: string) {
		this.#textCtx.fillStyle = color;
		this.#drawText();
		this.#uploadTexture(false);
	}

	updateText(text: string) {
		this.config.text = text;
		this.#drawText();
		this.#uploadTexture(false);
	}

	setScrollProgress(progress: number) {
		this.#scrollProgress = Math.max(0, Math.min(1, progress));
	}

	resize(canvasWidth: number, canvasHeight: number, avgFps: number | null) {
		// Adaptive grid resolution based on performance
		const byWidth = canvasWidth < 900;
		const byFps = avgFps !== null && avgFps < 45;
		const newGridRes = byWidth || byFps ? 140 : 200;

		// Calculate responsive text size
		const baseWidth = 1400;
		const baseHeight = 550;
		const scale = Math.min(
			(canvasWidth * 0.9) / baseWidth,
			(canvasHeight * 0.6) / baseHeight,
			1,
		);

		const newWidth = baseWidth * scale;
		const newHeight = baseHeight * scale;

		// Only recreate mesh if resolution or size changed significantly
		if (
			newGridRes !== this.#gridResolution ||
			Math.abs(newWidth - this.#textWidth) > 10 ||
			Math.abs(newHeight - this.#textHeight) > 10
		) {
			this.#gridResolution = newGridRes;
			this.#textWidth = newWidth;
			this.#textHeight = newHeight;
			this.#mesh = this.#createMesh(newWidth, newHeight, newGridRes);
			this.#updateBuffers();
		}
	}

	render({
		canvasWidth,
		canvasHeight,
		phase,
		frequency,
		amplitude,
	}: {
		canvasWidth: number;
		canvasHeight: number;
		phase: number;
		frequency: number;
		amplitude: number;
	}) {
		const gl = this.#gl;

		gl.useProgram(this.#program);

		// Set uniforms
		gl.uniform2f(
			gl.getUniformLocation(this.#program, "u_resolution"),
			canvasWidth,
			canvasHeight,
		);
		gl.uniform1f(gl.getUniformLocation(this.#program, "u_phase"), phase);
		gl.uniform1f(
			gl.getUniformLocation(this.#program, "u_amplitude"),
			amplitude,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.#program, "u_frequency"),
			frequency,
		);
		gl.uniform2f(
			gl.getUniformLocation(this.#program, "u_offset"),
			canvasWidth / 2 - this.#textWidth / 2,
			canvasHeight / 2 - this.#textHeight / 2,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.#program, "u_scrollProgress"),
			this.#scrollProgress,
		);

		// Bind texture
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.#texture);
		gl.uniform1i(gl.getUniformLocation(this.#program, "u_texture"), 0);

		// Set attributes
		const posLoc = gl.getAttribLocation(this.#program, "a_position");
		const texLoc = gl.getAttribLocation(this.#program, "a_texCoord");

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#positionBuffer);
		gl.enableVertexAttribArray(posLoc);
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#texCoordBuffer);
		gl.enableVertexAttribArray(texLoc);
		gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#indexBuffer);

		// Draw
		gl.drawElements(
			gl.TRIANGLES,
			this.#mesh.indices.length,
			gl.UNSIGNED_SHORT,
			0,
		);
	}

	dispose() {
		const gl = this.#gl;
		gl.deleteProgram(this.#program);
		gl.deleteTexture(this.#texture);
		gl.deleteBuffer(this.#positionBuffer);
		gl.deleteBuffer(this.#texCoordBuffer);
		gl.deleteBuffer(this.#indexBuffer);
	}
}
