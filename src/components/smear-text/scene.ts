// FILE: src/components/smear-text/scene.ts
import { gsap } from "gsap";
import { events } from "../../lib/states";
import { getGL2Context, resizeCanvasToDisplaySize } from "../../lib/webgl";
import { cssColorToVec3 } from "../../utils/colors";
import { TiltedTextMsdf } from "./tilted-text-msdf";

function getTheme(): { background: [number, number, number]; foreground: [number, number, number] } {
	const style = getComputedStyle(document.documentElement);
	const background = style.getPropertyValue("--color-background");
	const foreground = style.getPropertyValue("--color-foreground");
	return {
		background: cssColorToVec3(background),
		foreground: cssColorToVec3(foreground),
	};
}

type Vec3 = [number, number, number];
type Mat4 = Float32Array;

function createIdentityMat4(): Mat4 {
	const m = new Float32Array(16);
	m[0] = 1;
	m[5] = 1;
	m[10] = 1;
	m[15] = 1;
	return m;
}

function createRotationXMat4(angleRad: number): Mat4 {
	const m = createIdentityMat4();
	const c = Math.cos(angleRad);
	const s = Math.sin(angleRad);

	m[5] = c;
	m[6] = s;
	m[9] = -s;
	m[10] = c;

	return m;
}

function createPerspectiveMat4(fovYRad: number, aspect: number, near: number, far: number): Mat4 {
	const f = 1 / Math.tan(fovYRad / 2);
	const nf = 1 / (near - far);

	const out = new Float32Array(16);
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
	out[10] = (far + near) * nf;
	out[11] = -1;

	out[12] = 0;
	out[13] = 0;
	out[14] = 2 * far * near * nf;
	out[15] = 0;

	return out;
}

function createLookAtMat4(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
	const [eyeX, eyeY, eyeZ] = eye;
	const [targetX, targetY, targetZ] = target;
	const [upX, upY, upZ] = up;

	let zx = eyeX - targetX;
	let zy = eyeY - targetY;
	let zz = eyeZ - targetZ;

	let len = Math.hypot(zx, zy, zz);
	if (len === 0) {
		zz = 1;
		zx = 0;
		zy = 0;
		len = 1;
	}
	zx /= len;
	zy /= len;
	zz /= len;

	let xx = upY * zz - upZ * zy;
	let xy = upZ * zx - upX * zz;
	let xz = upX * zy - upY * zx;

	len = Math.hypot(xx, xy, xz);
	if (len === 0) {
		xx = 1;
		xy = 0;
		xz = 0;
		len = 1;
	}
	xx /= len;
	xy /= len;
	xz /= len;

	const yx = zy * xz - zz * xy;
	const yy = zz * xx - zx * xz;
	const yz = zx * xy - zy * xx;

	const out = new Float32Array(16);

	out[0] = xx;
	out[1] = yx;
	out[2] = zx;
	out[3] = 0;

	out[4] = xy;
	out[5] = yy;
	out[6] = zy;
	out[7] = 0;

	out[8] = xz;
	out[9] = yz;
	out[10] = zz;
	out[11] = 0;

	out[12] = -(xx * eyeX + xy * eyeY + xz * eyeZ);
	out[13] = -(yx * eyeX + yy * eyeY + yz * eyeZ);
	out[14] = -(zx * eyeX + zy * eyeY + zz * eyeZ);
	out[15] = 1;

	return out;
}

export class SmearTextScene {
	#canvas: HTMLCanvasElement;
	#gl: WebGL2RenderingContext;
	#isRunning = false;
	#colors = getTheme();

	#unsubscribeTheme: (() => void) | null = null;

	#textFront: TiltedTextMsdf;
	#textShadow: TiltedTextMsdf;

	// 3D camera + transforms
	#fovYRad = (45 * Math.PI) / 180;
	#near = 50;
	#far = 5000;

	#cameraPosition: Vec3 = [0, 140, 1300];
	#cameraTarget: Vec3 = [0, 0, 0];
	#cameraUp: Vec3 = [0, 1, 0];

	#modelMatrix: Mat4;
	#viewMatrix: Mat4;
	#projMatrix: Mat4;

	// Shadow offset (world space) on same tilted plane.
	// De base: zéro → texte et ombre parfaitement confondus tant qu'il n'y a pas de smear.
	#shadowOffset: Vec3 = [0, 0, 0];

	#timeSec = 0;

	constructor(canvas: HTMLCanvasElement) {
		this.#canvas = canvas;
		this.#gl = getGL2Context(canvas);

		const packedForeground: [number, number, number, number] = [...this.#colors.foreground, 1];

		this.#textFront = new TiltedTextMsdf({
			gl: this.#gl,
			text: "PORTFOLIO",
			color: packedForeground,
			scale: 3.5,
			letterSpacing: 2,
		});

		this.#textShadow = new TiltedTextMsdf({
			gl: this.#gl,
			text: "PORTFOLIO",
			color: [0, 0, 0, 0.7],
			scale: 3.5,
			letterSpacing: 2,
		});

		// Static model tilt: plane incliné vers le fond.
		this.#modelMatrix = createRotationXMat4(-0.8);
		this.#viewMatrix = createLookAtMat4(this.#cameraPosition, this.#cameraTarget, this.#cameraUp);
		this.#projMatrix = createPerspectiveMat4(this.#fovYRad, 1, this.#near, this.#far);

		this.#subscribeToThemeChange();
		this.#updateLayout();
	}

	start(): void {
		if (this.#isRunning) return;
		gsap.ticker.add(this.#tick);
		this.#isRunning = true;
	}

	stop(): void {
		if (!this.#isRunning) return;
		gsap.ticker.remove(this.#tick);
		this.#isRunning = false;
	}

	dispose(): void {
		this.stop();
		this.#unsubscribeTheme?.();
		this.#textFront.dispose();
		this.#textShadow.dispose();
	}

	setColorsFromTheme(): void {
		this.#colors = getTheme();
		const packedForeground: [number, number, number, number] = [...this.#colors.foreground, 1];
		this.#textFront.setColor(packedForeground);
		// Shadow stays black
	}

	#subscribeToThemeChange(): void {
		this.#unsubscribeTheme = events.onThemeChange(() => {
			this.setColorsFromTheme();
		});
	}

	#tick = (): void => {
		const deltaRatio = gsap.ticker.deltaRatio(60);
		const dtSec = deltaRatio / 60;
		this.#timeSec += dtSec;

		this.#updateLayout();
		this.#updateSmear(dtSec);
		this.#render();
	};

	#updateLayout(): void {
		resizeCanvasToDisplaySize({ canvas: this.#canvas });
		const { width, height } = this.#canvas;
		this.#gl.viewport(0, 0, width, height);

		const aspect = width > 0 && height > 0 ? width / height : 1;
		this.#projMatrix = createPerspectiveMat4(this.#fovYRad, aspect, this.#near, this.#far);
	}

	#updateSmear(dtSec: number): void {
		void dtSec;

		const size = this.#textFront.getSize();
		const width = size.width;
		const height = size.height;

		if (width <= 0 || height <= 0) {
			this.#textFront.clearSmear();
			this.#textShadow.clearSmear();
			return;
		}

		// Breeze smear qui traverse le mot, en espace local centré.
		const t = this.#timeSec * 0.5;
		const wave = (Math.sin(t) + 1) * 0.5; // 0..1
		const centerX = wave * width - width * 0.5; // map 0..1 → [-width/2, +width/2]
		const centerY = 0;

		// Rayon plus petit pour n'affecter que le cœur de la lettre
		const radius = height * 0.7;
		const strength = height * 0.9;

		// Front text gets lifted (smear local au milieu)
		this.#textFront.setSmear({ x: centerX, y: centerY }, radius, strength);
		// Shadow stays glued to the base plane (no smear, same transform)
		this.#textShadow.clearSmear();
	}

	#clear(): void {
		const gl = this.#gl;
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	#render(): void {
		this.#clear();

		const uniformsBase = {
			model: this.#modelMatrix,
			view: this.#viewMatrix,
			proj: this.#projMatrix,
			isShadow: false,
			shadowOffset: this.#shadowOffset,
		} as const;

		// Shadow d'abord, identique au texte quand pas de smear
		this.#textShadow.render({
			...uniformsBase,
			isShadow: true,
		});

		// Puis texte (qui peut être déformé)
		this.#textFront.render({
			...uniformsBase,
			isShadow: false,
		});
	}
}
