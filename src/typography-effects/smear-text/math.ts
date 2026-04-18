export type Vec3 = readonly [number, number, number];

export function mat4Identity(out: Float32Array): Float32Array {
	out[0] = 1;
	out[1] = 0;
	out[2] = 0;
	out[3] = 0;
	out[4] = 0;
	out[5] = 1;
	out[6] = 0;
	out[7] = 0;
	out[8] = 0;
	out[9] = 0;
	out[10] = 1;
	out[11] = 0;
	out[12] = 0;
	out[13] = 0;
	out[14] = 0;
	out[15] = 1;
	return out;
}

export function mat4Copy(out: Float32Array, a: Float32Array): Float32Array {
	out.set(a);
	return out;
}

export function mat4Multiply(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
	const a00 = a[0];
	const a01 = a[1];
	const a02 = a[2];
	const a03 = a[3];
	const a10 = a[4];
	const a11 = a[5];
	const a12 = a[6];
	const a13 = a[7];
	const a20 = a[8];
	const a21 = a[9];
	const a22 = a[10];
	const a23 = a[11];
	const a30 = a[12];
	const a31 = a[13];
	const a32 = a[14];
	const a33 = a[15];

	let b0 = b[0];
	let b1 = b[1];
	let b2 = b[2];
	let b3 = b[3];
	out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

	b0 = b[4];
	b1 = b[5];
	b2 = b[6];
	b3 = b[7];
	out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

	b0 = b[8];
	b1 = b[9];
	b2 = b[10];
	b3 = b[11];
	out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

	b0 = b[12];
	b1 = b[13];
	b2 = b[14];
	b3 = b[15];
	out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

	return out;
}

export function mat4Translate(out: Float32Array, a: Float32Array, v: Vec3): Float32Array {
	const x = v[0];
	const y = v[1];
	const z = v[2];

	if (out === a) {
		out[12] = (a[0] ?? 0) * x + (a[4] ?? 0) * y + (a[8] ?? 0) * z + (a[12] ?? 0);
		out[13] = (a[1] ?? 0) * x + (a[5] ?? 0) * y + (a[9] ?? 0) * z + (a[13] ?? 0);
		out[14] = (a[2] ?? 0) * x + (a[6] ?? 0) * y + (a[10] ?? 0) * z + (a[14] ?? 0);
		out[15] = (a[3] ?? 0) * x + (a[7] ?? 0) * y + (a[11] ?? 0) * z + (a[15] ?? 0);
		return out;
	}

	out[0] = a[0] ?? 0;
	out[1] = a[1] ?? 0;
	out[2] = a[2] ?? 0;
	out[3] = a[3] ?? 0;
	out[4] = a[4] ?? 0;
	out[5] = a[5] ?? 0;
	out[6] = a[6] ?? 0;
	out[7] = a[7] ?? 0;
	out[8] = a[8] ?? 0;
	out[9] = a[9] ?? 0;
	out[10] = a[10] ?? 0;
	out[11] = a[11] ?? 0;

	out[12] = (a[0] ?? 0) * x + (a[4] ?? 0) * y + (a[8] ?? 0) * z + (a[12] ?? 0);
	out[13] = (a[1] ?? 0) * x + (a[5] ?? 0) * y + (a[9] ?? 0) * z + (a[13] ?? 0);
	out[14] = (a[2] ?? 0) * x + (a[6] ?? 0) * y + (a[10] ?? 0) * z + (a[14] ?? 0);
	out[15] = (a[3] ?? 0) * x + (a[7] ?? 0) * y + (a[11] ?? 0) * z + (a[15] ?? 0);
	return out;
}

export function mat4RotateX(out: Float32Array, a: Float32Array, rad: number): Float32Array {
	const s = Math.sin(rad);
	const c = Math.cos(rad);

	const a10 = a[4] ?? 0;
	const a11 = a[5] ?? 0;
	const a12 = a[6] ?? 0;
	const a13 = a[7] ?? 0;
	const a20 = a[8] ?? 0;
	const a21 = a[9] ?? 0;
	const a22 = a[10] ?? 0;
	const a23 = a[11] ?? 0;

	if (out !== a) {
		out[0] = a[0] ?? 0;
		out[1] = a[1] ?? 0;
		out[2] = a[2] ?? 0;
		out[3] = a[3] ?? 0;
		out[12] = a[12] ?? 0;
		out[13] = a[13] ?? 0;
		out[14] = a[14] ?? 0;
		out[15] = a[15] ?? 0;
	}

	out[4] = a10 * c + a20 * s;
	out[5] = a11 * c + a21 * s;
	out[6] = a12 * c + a22 * s;
	out[7] = a13 * c + a23 * s;
	out[8] = a20 * c - a10 * s;
	out[9] = a21 * c - a11 * s;
	out[10] = a22 * c - a12 * s;
	out[11] = a23 * c - a13 * s;
	return out;
}

export function mat4RotateY(out: Float32Array, a: Float32Array, rad: number): Float32Array {
	const s = Math.sin(rad);
	const c = Math.cos(rad);

	const a00 = a[0] ?? 0;
	const a01 = a[1] ?? 0;
	const a02 = a[2] ?? 0;
	const a03 = a[3] ?? 0;
	const a20 = a[8] ?? 0;
	const a21 = a[9] ?? 0;
	const a22 = a[10] ?? 0;
	const a23 = a[11] ?? 0;

	if (out !== a) {
		out[4] = a[4] ?? 0;
		out[5] = a[5] ?? 0;
		out[6] = a[6] ?? 0;
		out[7] = a[7] ?? 0;
		out[12] = a[12] ?? 0;
		out[13] = a[13] ?? 0;
		out[14] = a[14] ?? 0;
		out[15] = a[15] ?? 0;
	}

	out[0] = a00 * c - a20 * s;
	out[1] = a01 * c - a21 * s;
	out[2] = a02 * c - a22 * s;
	out[3] = a03 * c - a23 * s;
	out[8] = a00 * s + a20 * c;
	out[9] = a01 * s + a21 * c;
	out[10] = a02 * s + a22 * c;
	out[11] = a03 * s + a23 * c;
	return out;
}

export function mat4Perspective(
	out: Float32Array,
	fovyRad: number,
	aspect: number,
	near: number,
	far: number,
): Float32Array {
	const f = 1.0 / Math.tan(fovyRad / 2);
	out[0] = f / aspect;
	out[1] = 0;
	out[2] = 0;
	out[3] = 0;
	out[4] = 0;
	out[5] = f;
	out[6] = 0;
	out[7] = 0;
	out[8] = 0;
	out[9] = 0;
	out[11] = -1;
	out[12] = 0;
	out[13] = 0;
	out[15] = 0;

	const nf = 1 / (near - far);
	out[10] = (far + near) * nf;
	out[14] = 2 * far * near * nf;
	return out;
}

export function mat4LookAt(out: Float32Array, eye: Vec3, center: Vec3, up: Vec3): Float32Array {
	const eyex = eye[0];
	const eyey = eye[1];
	const eyez = eye[2];
	const upx = up[0];
	const upy = up[1];
	const upz = up[2];
	const centerx = center[0];
	const centery = center[1];
	const centerz = center[2];

	let z0 = eyex - centerx;
	let z1 = eyey - centery;
	let z2 = eyez - centerz;

	let len = Math.hypot(z0, z1, z2);
	if (len === 0) {
		z2 = 1;
	} else {
		len = 1 / len;
		z0 *= len;
		z1 *= len;
		z2 *= len;
	}

	let x0 = upy * z2 - upz * z1;
	let x1 = upz * z0 - upx * z2;
	let x2 = upx * z1 - upy * z0;
	len = Math.hypot(x0, x1, x2);
	if (len === 0) {
		x0 = 0;
		x1 = 0;
		x2 = 0;
	} else {
		len = 1 / len;
		x0 *= len;
		x1 *= len;
		x2 *= len;
	}

	const y0 = z1 * x2 - z2 * x1;
	const y1 = z2 * x0 - z0 * x2;
	const y2 = z0 * x1 - z1 * x0;

	out[0] = x0;
	out[1] = y0;
	out[2] = z0;
	out[3] = 0;
	out[4] = x1;
	out[5] = y1;
	out[6] = z1;
	out[7] = 0;
	out[8] = x2;
	out[9] = y2;
	out[10] = z2;
	out[11] = 0;
	out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
	out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
	out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
	out[15] = 1;
	return out;
}

export function mat4Invert(out: Float32Array, a: Float32Array): Float32Array | null {
	const a00 = a[0];
	const a01 = a[1];
	const a02 = a[2];
	const a03 = a[3];
	const a10 = a[4];
	const a11 = a[5];
	const a12 = a[6];
	const a13 = a[7];
	const a20 = a[8];
	const a21 = a[9];
	const a22 = a[10];
	const a23 = a[11];
	const a30 = a[12];
	const a31 = a[13];
	const a32 = a[14];
	const a33 = a[15];

	const b00 = a00 * a11 - a01 * a10;
	const b01 = a00 * a12 - a02 * a10;
	const b02 = a00 * a13 - a03 * a10;
	const b03 = a01 * a12 - a02 * a11;
	const b04 = a01 * a13 - a03 * a11;
	const b05 = a02 * a13 - a03 * a12;
	const b06 = a20 * a31 - a21 * a30;
	const b07 = a20 * a32 - a22 * a30;
	const b08 = a20 * a33 - a23 * a30;
	const b09 = a21 * a32 - a22 * a31;
	const b10 = a21 * a33 - a23 * a31;
	const b11 = a22 * a33 - a23 * a32;

	let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
	if (det === 0) return null;
	det = 1.0 / det;

	out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
	out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
	out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
	out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
	out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
	out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
	out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
	out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
	out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
	out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
	out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
	out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
	out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
	out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
	out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
	out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

	return out;
}

export function vec4TransformMat4(
	out: Float32Array,
	v: readonly [number, number, number, number],
	m: Float32Array,
): Float32Array {
	const x = v[0];
	const y = v[1];
	const z = v[2];
	const w = v[3];
	out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
	out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
	out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
	out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
	return out;
}

export function vec4TransformMat4Values(
	out: Float32Array,
	x: number,
	y: number,
	z: number,
	w: number,
	m: Float32Array,
): Float32Array {
	out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
	out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
	out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
	out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
	return out;
}
