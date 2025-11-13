import { type Body, Body as MatterBody } from "matter-js";
import { type Application, Graphics } from "pixi.js";

export type PanelOptions = {
	strength?: number; // ~0.0015 .. 0.005
	direction?: "outward" | "inward";
	falloff?: "linear" | "smoothstep";
	debug?: boolean;
	scrollSync?: boolean; // default true
};

export type PanelRect = { x: number; y: number; width: number; height: number };

function clamp01(t: number): number {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}

function clamp(v: number, min: number, max: number): number {
	return v < min ? min : v > max ? max : v;
}

function smoothstep(t: number): number {
	const x = clamp01(t);
	return x * x * (3 - 2 * x);
}

/** Force au point (ou cercle) en intersection avec le panel. */
function computePanelForceForCircle(
	px: number,
	py: number,
	radius: number,
	mass: number,
	rect: PanelRect,
	opts: Required<Pick<PanelOptions, "strength" | "direction" | "falloff">>,
) {
	// Circle/Rect intersection test via closest point on rect
	const rx0 = rect.x;
	const ry0 = rect.y;
	const rx1 = rect.x + rect.width;
	const ry1 = rect.y + rect.height;
	const qx = clamp(px, rx0, rx1);
	const qy = clamp(py, ry0, ry1);
	const dxEdge = px - qx;
	const dyEdge = py - qy;
	const dist = Math.hypot(dxEdge, dyEdge);
	const penetration = Math.max(0, radius - dist); // >0 => intersection (or inside)
	if (penetration <= 0) return { x: 0, y: 0 };

	// Weight from penetration (0 at tangent, 1 deep inside)
	let w = clamp01(penetration / Math.max(1, radius));
	w = opts.falloff === "smoothstep" ? smoothstep(w) : w;

	// Direction: toward/away from rect center (stable and “compressing”)
	const cx = (rx0 + rx1) * 0.5;
	const cy = (ry0 + ry1) * 0.5;
	const dx = px - cx;
	const dy = py - cy;
	const len = Math.hypot(dx, dy) || 1;
	const sgn = opts.direction === "outward" ? 1 : -1;
	const ux = (dx / len) * sgn;
	const uy = (dy / len) * sgn;
	const f = opts.strength * mass * w;
	return { x: ux * f, y: uy * f };
}

export class Panel {
	#app: Application;
	#el: HTMLElement;
	#rect: PanelRect = { x: 0, y: 0, width: 0, height: 0 }; // en coordonnées STAGE
	#strength = 0.0015;
	#direction: "outward" | "inward" = "inward";
	#falloff: "linear" | "smoothstep" = "smoothstep";
	#viz: Graphics | null = null;
	#ro: ResizeObserver | null = null;
	#queued = false;
	#scrollSync = true;

	constructor(app: Application, el: HTMLElement, options?: PanelOptions) {
		this.#app = app;
		this.#el = el;
		if (options?.strength !== undefined) this.#strength = options.strength;
		if (options?.direction) this.#direction = options.direction;
		if (options?.falloff) this.#falloff = options.falloff;
		if (options?.scrollSync === false) this.#scrollSync = false;
		if (options?.debug) {
			this.#viz = new Graphics();
			this.#viz.alpha = 0.25;
			this.#app.stage.addChild(this.#viz);
		}
		this.#ro = new ResizeObserver(() => this.#queueSync());
		this.#ro.observe(this.#el);
		if (this.#scrollSync) {
			window.addEventListener("scroll", this.#onScroll, { passive: true });
		}
		this.syncNow();
	}

	setOptions(patch: PanelOptions): void {
		if (patch.strength !== undefined) this.#strength = patch.strength;
		if (patch.direction) this.#direction = patch.direction;
		if (patch.falloff) this.#falloff = patch.falloff;
		if (typeof patch.debug === "boolean") {
			if (patch.debug && !this.#viz) {
				this.#viz = new Graphics();
				this.#viz.alpha = 0.25;
				this.#app.stage.addChild(this.#viz);
			} else if (!patch.debug && this.#viz) {
				this.#viz.destroy();
				this.#viz = null;
			}
			this.#drawViz();
		}
	}

	/** Recalcule la position/taille stage à partir du DOM. */
	syncNow(): void {
		const canvasRect = this.#app.canvas.getBoundingClientRect();
		const panelRect = this.#el.getBoundingClientRect();
		const x = panelRect.left - canvasRect.left;
		const y = panelRect.top - canvasRect.top;
		const w = panelRect.width;
		const h = panelRect.height;
		this.#rect = { x, y, width: w, height: h }; // top-left align = même repère que le DOM
		this.#drawViz();
	}

	apply(bodies: readonly Body[]): void {
		const opts = {
			strength: this.#strength,
			direction: this.#direction,
			falloff: this.#falloff,
		} as const;
		for (const b of bodies) {
			const radius =
				typeof b.circleRadius === "number" && b.circleRadius > 0
					? b.circleRadius
					: Math.max(
							b.bounds.max.x - b.bounds.min.x,
							b.bounds.max.y - b.bounds.min.y,
						) * 0.5;
			const f = computePanelForceForCircle(
				b.position.x,
				b.position.y,
				radius,
				b.mass,
				this.#rect,
				opts,
			);
			if (f.x !== 0 || f.y !== 0) {
				MatterBody.applyForce(b, b.position, f);
			}
		}
	}

	dispose(): void {
		this.#ro?.disconnect();
		if (this.#scrollSync) window.removeEventListener("scroll", this.#onScroll);
		if (this.#viz) {
			this.#viz.destroy();
			this.#viz = null;
		}
	}

	// ---- internals ----
	#queueSync(): void {
		if (this.#queued) return;
		this.#queued = true;
		requestAnimationFrame(() => {
			this.#queued = false;
			this.syncNow();
		});
	}

	#onScroll = (): void => this.#queueSync();

	#drawViz(): void {
		if (!this.#viz) return;
		const g = this.#viz;
		const p = this.#rect;
		g.clear();
		g.stroke({ width: 2, color: 0x00ff88 });
		g.rect(p.x, p.y, p.width, p.height);
		g.stroke();
	}
}
