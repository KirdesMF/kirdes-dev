import { gsap } from "gsap";
import { events } from "../../lib/states";
import { getGL2Context, resizeCanvasToDisplaySize } from "../../lib/webgl";
import { cssColorToVec3 } from "../../utils/colors";
import {
	mat4Identity,
	mat4Invert,
	mat4LookAt,
	mat4Multiply,
	mat4Perspective,
	mat4RotateX,
	mat4RotateY,
	mat4Translate,
	vec4TransformMat4Values,
} from "./math";
import { SparkleSprites } from "./sparkles";
import { SmearTextMsdf } from "./text-msdf";

function getTheme(): { background: [number, number, number]; foreground: [number, number, number] } {
	const style = getComputedStyle(document.documentElement);
	const background = style.getPropertyValue("--color-background");
	const foreground = style.getPropertyValue("--color-foreground");
	return {
		background: cssColorToVec3(background),
		foreground: cssColorToVec3(foreground),
	};
}

function getShadowColor(colors: {
	background: [number, number, number];
	foreground: [number, number, number];
}): [number, number, number, number] {
	const isDarkTheme = document.documentElement.classList.contains("dark");
	if (!isDarkTheme) {
		return [...colors.foreground, 0.25];
	}

	const [br, bg, bb] = colors.background;
	const darken = 0.25;
	return [br * darken, bg * darken, bb * darken, 0.35];
}

function getSparkleTint(colors: { foreground: [number, number, number] }): [number, number, number, number] {
	return [...colors.foreground, 1];
}

export class Scene {
	#canvas: HTMLCanvasElement;
	#gl: WebGL2RenderingContext;
	#isRunning = false;

	#text: SmearTextMsdf;
	#yearText: SmearTextMsdf;
	#yearOffset = { x: 0, z: 0 };
	#sparkles: SparkleSprites;
	#layoutBounds = { width: 0, depth: 0 };
	#layoutMinX = 0;
	#layoutMaxX = 0;

	#colors = getTheme();
	#mainColor: [number, number, number, number];
	#shadowColor: [number, number, number, number];
	#unsubscribeTheme: (() => void) | null = null;

	#proj = new Float32Array(16);
	#view = new Float32Array(16);
	#viewProj = new Float32Array(16);
	#invViewProj = new Float32Array(16);
	#invViewProjValid = false;

	#model = new Float32Array(16);
	#invModel = new Float32Array(16);
	#invModelValid = false;
	#rotX = 0;
	#rotY = 0;
	#pivotZ = 0;

	#planePoint = { x: 0, y: 0, z: 0 };
	#planeNormal = { x: 0, y: 1, z: 0 };
	#tmpPlanePoint4 = new Float32Array(4);
	#tmpPlaneNormal4 = new Float32Array(4);
	#tmpLocal4 = new Float32Array(4);

	#pointerInside = false;
	#pointerClientX = 0;
	#pointerClientY = 0;

	#cursor = { x: 0, z: 0 };
	#cursorTarget = { x: 0, z: 0 };
	#cursorPrev = { x: 0, z: 0 };
	#velocity = { x: 0, z: 0 };
	#cursorActive = 0;
	#cursorActiveTarget = 0;

	#radius = 80;
	#lift = 50;
	#smear = 14;
	#areaScale = 1;
	#deformScale = 1;

	#tmpNear4 = new Float32Array(4);
	#tmpFar4 = new Float32Array(4);

	constructor(canvas: HTMLCanvasElement) {
		this.#canvas = canvas;
		this.#gl = getGL2Context(canvas);
		this.#setupGLState();

		this.#mainColor = [...this.#colors.foreground, 1];
		this.#shadowColor = getShadowColor(this.#colors);

		this.#text = new SmearTextMsdf({
			gl: this.#gl,
			text: "PORTFOLIO",
			color: this.#mainColor,
			scale: 4.0,
			letterSpacing: 2,
		});

		const year = String(new Date().getFullYear());
		this.#yearText = new SmearTextMsdf({
			gl: this.#gl,
			text: year,
			color: this.#mainColor,
			scale: 2.0,
			letterSpacing: 1,
		});

		const bounds = this.#text.getBounds();
		const yearBounds = this.#yearText.getBounds();

		const yearGap = Math.max(14, bounds.depth * 0.12);
		const yearInset = Math.max(10, bounds.width * 0.02);
		this.#yearOffset = {
			x: bounds.width * 0.5 - yearBounds.width * 0.5 - yearInset,
			z: bounds.depth + yearGap,
		};

		const sparkleSize = Math.max(18, bounds.depth * 0.38);
		const sparkleGap = Math.max(12, bounds.width * 0.035);
		const sparkleGroupRightX = -bounds.width * 0.5 - sparkleGap;
		const sparkleBaseX = sparkleGroupRightX - sparkleSize * 0.5;
		const sparkleBaseZ = sparkleSize * 0.5;
		const sparkles = [
			{ x: sparkleBaseX, z: sparkleBaseZ, size: sparkleSize, rotationRad: -0.35 },
			{
				x: sparkleBaseX - sparkleSize * 0.6,
				z: sparkleBaseZ + sparkleSize * 0.25,
				size: sparkleSize * 0.7,
				rotationRad: 0.25,
			},
		];

		const minX = Math.min(
			-bounds.width * 0.5,
			this.#yearOffset.x - yearBounds.width * 0.5,
			...sparkles.map((s) => s.x - s.size * 0.5),
		);
		const maxX = Math.max(
			bounds.width * 0.5,
			this.#yearOffset.x + yearBounds.width * 0.5,
			...sparkles.map((s) => s.x + s.size * 0.5),
		);
		const maxZ = Math.max(
			bounds.depth,
			this.#yearOffset.z + yearBounds.depth,
			...sparkles.map((s) => s.z + s.size * 0.5),
		);
		this.#layoutMinX = minX;
		this.#layoutMaxX = maxX;
		this.#layoutBounds = { width: maxX - minX, depth: maxZ };

		this.#pivotZ = this.#layoutBounds.depth * 0.5;
		this.#cursor.z = bounds.depth * 0.5;
		this.#cursorTarget.z = this.#cursor.z;
		this.#cursorPrev.z = this.#cursor.z;

		this.#sparkles = new SparkleSprites(this.#gl, { sparkles, tint: getSparkleTint(this.#colors) });

		this.#updateModel();
		this.#updateEffectParams();
		this.#setupPointerEvents();
		this.#subscribeToThemeChange();
	}

	#setupGLState(): void {
		const gl = this.#gl;
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
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
		this.#teardownPointerEvents();
		this.#text.dispose();
		this.#yearText.dispose();
		this.#sparkles.dispose();
	}

	setColorsFromTheme(): void {
		this.#colors = getTheme();
		this.#mainColor = [...this.#colors.foreground, 1];
		this.#shadowColor = getShadowColor(this.#colors);
		this.#text.setColor(this.#mainColor);
		this.#yearText.setColor(this.#mainColor);
		this.#sparkles.setTint(getSparkleTint(this.#colors));
	}

	setRotation({ yawDeg, pitchDeg }: { yawDeg: number; pitchDeg: number }): void {
		this.#rotY = (yawDeg * Math.PI) / 180;
		this.#rotX = (pitchDeg * Math.PI) / 180;
		this.#updateModel();
	}

	setSmearArea(areaScale: number): void {
		const safe = Number.isFinite(areaScale) ? areaScale : 1;
		this.#areaScale = Math.max(0.1, Math.min(safe, 6));
		this.#updateEffectParams();
	}

	setDeformAmount(amount: number): void {
		const safe = Number.isFinite(amount) ? amount : 1;
		this.#deformScale = Math.max(0, Math.min(safe, 6));
		this.#updateEffectParams();
	}

	#subscribeToThemeChange(): void {
		this.#unsubscribeTheme = events.onThemeChange(() => {
			this.setColorsFromTheme();
		});
	}

	#tick = (): void => {
		const deltaRatio = gsap.ticker.deltaRatio(60);
		const dtSec = deltaRatio / 60;

		this.#resize();
		this.#update(dtSec, deltaRatio);
		this.#render();
	};

	#lerp(from: number, to: number, alpha: number): number {
		return from + (to - from) * alpha;
	}

	#resize(): boolean {
		const hasChanged = resizeCanvasToDisplaySize({ canvas: this.#canvas });
		if (!hasChanged) return false;

		const { width, height } = this.#canvas;
		this.#gl.viewport(0, 0, width, height);
		this.#updateCamera();
		return true;
	}

	#updateCamera(): void {
		const width = this.#canvas.width;
		const height = this.#canvas.height;
		const aspect = width > 0 && height > 0 ? width / height : 1;

		const fovRad = (45 * Math.PI) / 180;
		mat4Perspective(this.#proj, fovRad, aspect, 0.1, 5000);

		const bounds = this.#layoutBounds;
		const halfWidth = Math.max(1, Math.max(Math.abs(this.#layoutMinX), Math.abs(this.#layoutMaxX))) * 1.1;
		const hFov = 2 * Math.atan(Math.tan(fovRad * 0.5) * aspect);
		const zDist = halfWidth / Math.tan(hFov * 0.5);

		const eye: [number, number, number] = [0, Math.max(bounds.depth * 1.1, zDist * 0.7), zDist * 1.2];
		const target: [number, number, number] = [0, 0, this.#pivotZ];
		mat4LookAt(this.#view, eye, target, [0, 1, 0]);
		mat4Multiply(this.#viewProj, this.#proj, this.#view);

		this.#invViewProjValid = mat4Invert(this.#invViewProj, this.#viewProj) !== null;
		this.#updateEffectParams();
	}

	#updateModel(): void {
		mat4Identity(this.#model);
		mat4Translate(this.#model, this.#model, [0, 0, this.#pivotZ]);
		mat4RotateY(this.#model, this.#model, this.#rotY);
		mat4RotateX(this.#model, this.#model, this.#rotX);
		mat4Translate(this.#model, this.#model, [0, 0, -this.#pivotZ]);

		this.#invModelValid = mat4Invert(this.#invModel, this.#model) !== null;

		vec4TransformMat4Values(this.#tmpPlanePoint4, 0, 0, 0, 1, this.#model);
		const pw = this.#tmpPlanePoint4[3] || 1;
		this.#planePoint = {
			x: (this.#tmpPlanePoint4[0] ?? 0) / pw,
			y: (this.#tmpPlanePoint4[1] ?? 0) / pw,
			z: (this.#tmpPlanePoint4[2] ?? 0) / pw,
		};

		vec4TransformMat4Values(this.#tmpPlaneNormal4, 0, 1, 0, 0, this.#model);
		const nx = this.#tmpPlaneNormal4[0] ?? 0;
		const ny = this.#tmpPlaneNormal4[1] ?? 0;
		const nz = this.#tmpPlaneNormal4[2] ?? 0;
		const nLen = Math.hypot(nx, ny, nz) || 1;
		this.#planeNormal = { x: nx / nLen, y: ny / nLen, z: nz / nLen };
	}

	#updateEffectParams(): void {
		const bounds = this.#text.getBounds();
		this.#radius = Math.max(90, bounds.depth * 0.8) * this.#areaScale;
		this.#lift = Math.max(35, bounds.depth * 0.45) * this.#deformScale;
		this.#smear = Math.max(10, bounds.depth * 0.12);
	}

	#setupPointerEvents(): void {
		this.#canvas.addEventListener("pointermove", this.#onPointerMove);
		this.#canvas.addEventListener("pointerenter", this.#onPointerEnter);
		this.#canvas.addEventListener("pointerleave", this.#onPointerLeave);
		this.#canvas.addEventListener("pointercancel", this.#onPointerLeave);
	}

	#teardownPointerEvents(): void {
		this.#canvas.removeEventListener("pointermove", this.#onPointerMove);
		this.#canvas.removeEventListener("pointerenter", this.#onPointerEnter);
		this.#canvas.removeEventListener("pointerleave", this.#onPointerLeave);
		this.#canvas.removeEventListener("pointercancel", this.#onPointerLeave);
	}

	#onPointerEnter = (event: PointerEvent): void => {
		this.#pointerClientX = event.clientX;
		this.#pointerClientY = event.clientY;
		this.#pointerInside = true;
	};

	#onPointerLeave = (): void => {
		this.#pointerInside = false;
		this.#cursorActiveTarget = 0;
	};

	#onPointerMove = (event: PointerEvent): void => {
		this.#pointerClientX = event.clientX;
		this.#pointerClientY = event.clientY;
		this.#pointerInside = true;
	};

	#getPointerPlaneHit(): { x: number; z: number } | null {
		if (!this.#pointerInside || !this.#invViewProjValid || !this.#invModelValid) return null;

		const rect = this.#canvas.getBoundingClientRect();
		const clientWidth = this.#canvas.clientWidth;
		const clientHeight = this.#canvas.clientHeight;
		if (clientWidth <= 0 || clientHeight <= 0) return null;
		if (this.#canvas.width <= 0 || this.#canvas.height <= 0) return null;

		const dpr = clientWidth > 0 ? this.#canvas.width / clientWidth : 1;
		const px = (this.#pointerClientX - rect.left) * dpr;
		const py = (this.#pointerClientY - rect.top) * dpr;

		const xNdc = (px / this.#canvas.width) * 2 - 1;
		const yNdc = 1 - (py / this.#canvas.height) * 2;

		vec4TransformMat4Values(this.#tmpNear4, xNdc, yNdc, -1, 1, this.#invViewProj);
		vec4TransformMat4Values(this.#tmpFar4, xNdc, yNdc, 1, 1, this.#invViewProj);

		const nearW = this.#tmpNear4[3];
		const farW = this.#tmpFar4[3];
		if (nearW === 0 || farW === 0) return null;

		const nearX = (this.#tmpNear4[0] ?? 0) / nearW;
		const nearY = (this.#tmpNear4[1] ?? 0) / nearW;
		const nearZ = (this.#tmpNear4[2] ?? 0) / nearW;

		const farX = (this.#tmpFar4[0] ?? 0) / farW;
		const farY = (this.#tmpFar4[1] ?? 0) / farW;
		const farZ = (this.#tmpFar4[2] ?? 0) / farW;

		let dx = farX - nearX;
		let dy = farY - nearY;
		let dz = farZ - nearZ;

		const len = Math.hypot(dx, dy, dz);
		if (len === 0) return null;
		const invLen = 1 / len;
		dx *= invLen;
		dy *= invLen;
		dz *= invLen;

		const denom = dx * this.#planeNormal.x + dy * this.#planeNormal.y + dz * this.#planeNormal.z;
		if (Math.abs(denom) < 1e-5) return null;

		const ox = nearX;
		const oy = nearY;
		const oz = nearZ;

		const px0 = this.#planePoint.x - ox;
		const py0 = this.#planePoint.y - oy;
		const pz0 = this.#planePoint.z - oz;
		const t = (px0 * this.#planeNormal.x + py0 * this.#planeNormal.y + pz0 * this.#planeNormal.z) / denom;
		if (t < 0) return null;

		const hitX = ox + dx * t;
		const hitY = oy + dy * t;
		const hitZ = oz + dz * t;

		vec4TransformMat4Values(this.#tmpLocal4, hitX, hitY, hitZ, 1, this.#invModel);
		const lw = this.#tmpLocal4[3] || 1;
		return {
			x: (this.#tmpLocal4[0] ?? 0) / lw,
			z: (this.#tmpLocal4[2] ?? 0) / lw,
		};
	}

	#isOverText(hit: { x: number; z: number }): boolean {
		const bounds = this.#layoutBounds;
		const marginX = Math.max(24, bounds.width * 0.03);
		const marginZ = Math.max(24, bounds.depth * 0.03);
		return (
			hit.x >= this.#layoutMinX - marginX &&
			hit.x <= this.#layoutMaxX + marginX &&
			hit.z >= -marginZ &&
			hit.z <= bounds.depth + marginZ
		);
	}

	#update(_dtSec: number, deltaRatio: number): void {
		const follow = 1;
		const activeFollow = 1 - (1 - 0.2) ** deltaRatio;
		const velFollow = 1 - (1 - 0.35) ** deltaRatio;

		const hit = this.#getPointerPlaneHit();
		if (hit) {
			this.#cursorTarget.x = hit.x;
			this.#cursorTarget.z = hit.z;
			this.#cursorActiveTarget = this.#isOverText(hit) ? 1 : 0;
		} else {
			this.#cursorActiveTarget = 0;
		}

		this.#cursor.x = this.#lerp(this.#cursor.x, this.#cursorTarget.x, follow);
		this.#cursor.z = this.#lerp(this.#cursor.z, this.#cursorTarget.z, follow);
		this.#cursorActive = this.#lerp(this.#cursorActive, this.#cursorActiveTarget, activeFollow);

		const rawVx = this.#cursor.x - this.#cursorPrev.x;
		const rawVz = this.#cursor.z - this.#cursorPrev.z;
		const clampV = (v: number) => Math.max(-80, Math.min(80, v));

		this.#velocity.x = this.#lerp(this.#velocity.x, clampV(rawVx), velFollow);
		this.#velocity.z = this.#lerp(this.#velocity.z, clampV(rawVz), velFollow);

		if (this.#cursorActiveTarget === 0) {
			const decay = 0.85 ** deltaRatio;
			this.#velocity.x *= decay;
			this.#velocity.z *= decay;
		}

		this.#cursorPrev.x = this.#cursor.x;
		this.#cursorPrev.z = this.#cursor.z;
	}

	#clear(): void {
		const gl = this.#gl;
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	#render(): void {
		this.#clear();

		this.#text.setColor(this.#shadowColor);
		this.#text.render({
			viewProj: this.#viewProj,
			model: this.#model,
			offset: { x: 0, z: 0 },
			cursor: { x: this.#cursor.x, z: this.#cursor.z },
			velocity: { x: 0, z: 0 },
			cursorActive: 0,
			radius: this.#radius,
			lift: 0,
			smear: 0,
		});

		this.#yearText.setColor([
			this.#shadowColor[0],
			this.#shadowColor[1],
			this.#shadowColor[2],
			this.#shadowColor[3] * 0.8,
		]);
		this.#yearText.render({
			viewProj: this.#viewProj,
			model: this.#model,
			offset: this.#yearOffset,
			cursor: { x: this.#cursor.x, z: this.#cursor.z },
			velocity: { x: 0, z: 0 },
			cursorActive: 0,
			radius: this.#radius,
			lift: 0,
			smear: 0,
		});

		this.#text.setColor(this.#mainColor);
		this.#text.render({
			viewProj: this.#viewProj,
			model: this.#model,
			offset: { x: 0, z: 0 },
			cursor: { x: this.#cursor.x, z: this.#cursor.z },
			velocity: { x: this.#velocity.x, z: this.#velocity.z },
			cursorActive: this.#cursorActive,
			radius: this.#radius,
			lift: this.#lift,
			smear: this.#smear,
		});

		this.#yearText.setColor(this.#mainColor);
		this.#yearText.render({
			viewProj: this.#viewProj,
			model: this.#model,
			offset: this.#yearOffset,
			cursor: { x: this.#cursor.x, z: this.#cursor.z },
			velocity: { x: 0, z: 0 },
			cursorActive: 0,
			radius: this.#radius,
			lift: 0,
			smear: 0,
		});

		this.#sparkles.setTint(this.#shadowColor);
		this.#sparkles.render({
			viewProj: this.#viewProj,
			model: this.#model,
			cursor: { x: this.#cursor.x, z: this.#cursor.z },
			velocity: { x: 0, z: 0 },
			cursorActive: 0,
			radius: this.#radius,
			lift: 0,
			smear: 0,
		});

		this.#sparkles.setTint(getSparkleTint(this.#colors));
		this.#sparkles.render({
			viewProj: this.#viewProj,
			model: this.#model,
			cursor: { x: this.#cursor.x, z: this.#cursor.z },
			velocity: { x: this.#velocity.x, z: this.#velocity.z },
			cursorActive: this.#cursorActive,
			radius: this.#radius,
			lift: this.#lift,
			smear: this.#smear,
		});
	}
}
