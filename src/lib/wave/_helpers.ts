import type { UniformsNames } from "./_types";

/**
 * Compile a shader from source code.
 *
 * @param gl WebGL rendering context.
 * @param type Shader type (e.g., gl.VERTEX_SHADER or gl.FRAGMENT_SHADER).
 * @param source Shader source code.
 * @returns Compiled shader.
 */
export function compileShader({
	gl,
	type,
	source,
}: {
	gl: WebGL2RenderingContext;
	type: GLenum;
	source: string;
}) {
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

/**
 * Create a WebGL program from vertex and fragment shader sources.
 *
 * @param gl WebGL rendering context.
 * @param vsSrc Vertex shader source code.
 * @param fsSrc Fragment shader source code.
 * @returns Created program.
 */
export function createProgram({
	gl,
	vsSource,
	fsSource,
}: {
	gl: WebGL2RenderingContext;
	vsSource: string;
	fsSource: string;
}) {
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

export function createBuffer({
	gl,
	target,
	data,
	usage,
}: {
	gl: WebGL2RenderingContext;
	target: GLenum;
	data: ArrayBufferView;
	usage?: GLenum;
}): WebGLBuffer {
	const buffer = gl.createBuffer();
	if (!buffer) throw new Error("Failed to create buffer");
	gl.bindBuffer(target, buffer);
	gl.bufferData(target, data, usage ?? gl.STATIC_DRAW);
	return buffer;
}

/**
 * Get a WebGL2 rendering context.
 *
 * @param canvas Canvas element to get context from.
 * @param powerPreference Power preference for the context.
 * @returns Created context.
 */
export function getGL2Context(
	canvas: HTMLCanvasElement,
	powerPreference?: WebGLPowerPreference,
) {
	const gl = canvas.getContext("webgl2", {
		antialias: true,
		alpha: true,
		premultipliedAlpha: true,
		powerPreference: powerPreference ?? "high-performance",
	}) as WebGL2RenderingContext | null;

	if (!gl) throw new Error("WebGL2 not supported");
	return gl;
}

/**
 * Get a required uniform location from a WebGL program.
 *
 * @param gl WebGL2 rendering context.
 * @param program WebGL program.
 * @param name Name of the uniform.
 * @returns Uniform location.
 */
export function getUniform(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	name: UniformsNames,
) {
	const loc = gl.getUniformLocation(program, name);
	if (loc === null) throw new Error(`Uniform not found: ${name}`);
	return loc;
}

/**
 * Cache uniform locations from a WebGL program.
 *
 * @param gl WebGL2 rendering context.
 * @param program WebGL program.
 * @param names Names of the uniforms to cache.
 * @returns Cached uniform locations.
 */
export function cacheUniforms<T extends UniformsNames>(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	names: T[],
) {
	const out = {} as Record<T, WebGLUniformLocation>;
	for (const name of names) {
		out[name] = getUniform(gl, program, name);
	}
	return out;
}

/**
 * Convert a CSS color string to a vec3.
 *
 * @param color CSS color string.
 * @returns vec3 color.
 */
export function cssColorToVec3(color: string): [number, number, number] {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 1;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas context not supported");
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return [r / 255, g / 255, b / 255];
}
