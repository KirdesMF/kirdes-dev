// lens-overlay.ts
import { createProgram } from "./_utils";

const VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 a_pos;   // clip-space quad [-1..1]
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FS = `#version 300 es
  precision mediump float;

  uniform vec2  u_resolution;    // px
  uniform vec2  u_centerPx;      // px
  uniform float u_radiusPx;      // px
  uniform float u_featherPx;     // px
  uniform vec4  u_colorFill;     // RGBA (remplissage léger)
  uniform vec4  u_colorRing;     // RGBA (anneau fin)

  out vec4 outColor;

  void main() {
    // reconstruire coord écran px depuis gl_FragCoord
    vec2 fragPx = gl_FragCoord.xy;

    float d = distance(fragPx, u_centerPx);

    // masque doux sur le bord
    float m = smoothstep(u_radiusPx, u_radiusPx - u_featherPx, d); // 1 au centre → 0 hors

    // un anneau fin (2px ~ via seuils)
    float ringW = max(1.0, u_featherPx * 0.25);
    float edge = abs(d - u_radiusPx + u_featherPx * 0.5);
    float ring = smoothstep(ringW + 0.5, ringW - 0.5, edge);

    // couleur: léger voile au centre + anneau
    vec4 fill  = u_colorFill * m;
    vec4 rim   = u_colorRing * ring;

    // premult simple
    outColor = vec4(fill.rgb + rim.rgb, fill.a + rim.a);
  }
`;

export type LensUniforms = {
	resolution: { width: number; height: number };
	centerPx: { x: number; y: number };
	radiusPx: number;
	featherPx: number;
	colorFill?: [number, number, number, number];
	colorRing?: [number, number, number, number];
};

export class LensOverlay {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;
	private vao: WebGLVertexArrayObject | null = null;

	public constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.program = createProgram({ gl, vsSource: VS, fsSource: FS });

		// full-screen quad en clip-space
		const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);
		const vao = gl.createVertexArray();
		const vbo = gl.createBuffer();
		if (!vao || !vbo) throw new Error("lens-overlay: VAO/VBO alloc failed");
		this.vao = vao;

		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
	}

	public render(u: LensUniforms): void {
		const gl = this.gl;
		if (!this.vao) return;

		gl.useProgram(this.program);
		gl.uniform2f(
			gl.getUniformLocation(this.program, "u_resolution"),
			u.resolution.width,
			u.resolution.height,
		);
		gl.uniform2f(
			gl.getUniformLocation(this.program, "u_centerPx"),
			u.centerPx.x,
			u.centerPx.y,
		);
		gl.uniform1f(gl.getUniformLocation(this.program, "u_radiusPx"), u.radiusPx);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "u_featherPx"),
			u.featherPx,
		);

		const fill = u.colorFill ?? [0, 0, 0, 0]; // léger “blueprint”
		const ring = u.colorRing ?? [1.0, 1.0, 1.0, 1.0];
		gl.uniform4f(gl.getUniformLocation(this.program, "u_colorFill"), ...fill);
		gl.uniform4f(gl.getUniformLocation(this.program, "u_colorRing"), ...ring);

		gl.bindVertexArray(this.vao);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.bindVertexArray(null);
	}

	public dispose(): void {
		const gl = this.gl;
		if (this.vao) gl.deleteVertexArray(this.vao);
		gl.deleteProgram(this.program);
		this.vao = null;
	}
}
