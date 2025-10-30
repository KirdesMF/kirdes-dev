export type CompileShaderArgs = {
	gl: WebGL2RenderingContext;
	type: GLenum;
	source: string;
};

export function compileShader({
	gl,
	type,
	source,
}: CompileShaderArgs): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error("Failed to create shader");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
	if (!ok) {
		const info = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`Shader compilation failed: ${info ?? "unknown error"}`);
	}
	return shader;
}

export type CreateProgramArgs = {
	gl: WebGL2RenderingContext;
	vsSource: string;
	fsSource: string;
};

export function createProgram({
	gl,
	vsSource,
	fsSource,
}: CreateProgramArgs): WebGLProgram {
	const vs = compileShader({ gl, type: gl.VERTEX_SHADER, source: vsSource });
	const fs = compileShader({ gl, type: gl.FRAGMENT_SHADER, source: fsSource });

	const program = gl.createProgram();
	if (!program) throw new Error("Failed to create program");

	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);

	const ok = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
	if (!ok) {
		const info = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		throw new Error(`Program linking failed: ${info ?? "unknown error"}`);
	}

	gl.deleteShader(vs);
	gl.deleteShader(fs);
	return program;
}

export type CreateBufferArgs = {
	gl: WebGL2RenderingContext;
	target: GLenum;
	data: Float32Array | Uint16Array | Uint32Array;
	usage?: GLenum;
};

export function createBuffer({
	gl,
	target,
	data,
	usage,
}: CreateBufferArgs): WebGLBuffer {
	const buffer = gl.createBuffer();
	if (!buffer) throw new Error("Failed to create buffer");
	gl.bindBuffer(target, buffer);
	gl.bufferData(target, data, usage ?? gl.STATIC_DRAW);
	return buffer;
}

export type ResizeCanvasArgs = {
	canvas: HTMLCanvasElement;
	/** Cap du devicePixelRatio pour limiter la charge GPU, utile en mobile */
	maxDPR?: number; // ex: 1.5 en mobile
};

export function resizeCanvasToDisplaySize({
	canvas,
	maxDPR,
}: ResizeCanvasArgs): boolean {
	const dprRaw = window.devicePixelRatio || 1;
	const dpr = maxDPR ? Math.min(dprRaw, maxDPR) : dprRaw;

	const width = Math.floor(canvas.clientWidth * dpr);
	const height = Math.floor(canvas.clientHeight * dpr);
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
		return true;
	}
	return false;
}

export type GetGL2Args = {
	canvas: HTMLCanvasElement;
	powerPreference?: WebGLPowerPreference; // "default" | "high-performance" | "low-power"
};

export function getGL2({
	canvas,
	powerPreference,
}: GetGL2Args): WebGL2RenderingContext {
	const gl = canvas.getContext("webgl2", {
		antialias: true,
		alpha: true,
		premultipliedAlpha: true,
		powerPreference: powerPreference ?? "high-performance",
	}) as WebGL2RenderingContext | null;

	if (!gl) throw new Error("WebGL2 not supported");
	return gl;
}

/** Heuristique simple pour adapter perf mobile */
export function isLikelyMobile(): boolean {
	const ua = navigator.userAgent.toLowerCase();
	return /iphone|ipad|ipod|android|mobile/.test(ua);
}

export type LensParams = {
	centerPx: { x: number; y: number };
	radiusPx: number;
	featherPx: number;
};

export function sendLensUniforms({
	gl,
	program,
	lens,
}: {
	gl: WebGL2RenderingContext;
	program: WebGLProgram;
	lens?: LensParams;
}) {
	const cx = lens?.centerPx.x ?? -9999;
	const cy = lens?.centerPx.y ?? -9999;
	const r = lens?.radiusPx ?? 0.0;
	const f = lens?.featherPx ?? 1.0;

	gl.uniform2f(gl.getUniformLocation(program, "u_lensCenterPx"), cx, cy);
	gl.uniform1f(gl.getUniformLocation(program, "u_lensRadiusPx"), r);
	gl.uniform1f(gl.getUniformLocation(program, "u_lensFeatherPx"), f);
}
