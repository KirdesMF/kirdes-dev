export function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
	const shader = gl.createShader(type);
	if (!shader) throw new Error("Failed to create shader");

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`Shader compilation failed: ${info}`);
	}
	return shader;
}

export function createProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
	const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vs);
	const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fs);

	const program = gl.createProgram();
	if (!program) throw new Error("Failed to create program");

	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const info = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error(`Program linking failed: ${info}`);
	}

	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);

	return program;
}

export function createBuffer(gl: WebGLRenderingContext, data: Float32Array | Uint16Array) {
	const buffer = gl.createBuffer();
	if (!buffer) throw new Error("Failed to create buffer");

	const target = data instanceof Uint16Array ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
	gl.bindBuffer(target, buffer);
	gl.bufferData(target, data, gl.STATIC_DRAW);

	return buffer;
}
