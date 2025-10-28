// tools/scripts/prebuild-font.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import opentype from "opentype.js";

type BMChar = {
	id: number;
	x: number;
	y: number;
	width: number;
	height: number;
	xoffset: number;
	yoffset: number;
	xadvance: number;
	page: number;
	chnl: number;
};

type BMKern = { first: number; second: number; amount: number };

type BMJson = {
	pages: string[];
	common: { scaleW: number; scaleH: number; lineHeight: number; base?: number };
	chars: BMChar[];
	kernings?: BMKern[];
};

// ==== Réglages de qualité (tu peux ajuster) ====
const SIZE_REF_PX = 256; // taille utilisée pour extraire/échantillonner les contours (px)
const FLAT_TOL_PX = 1.25; // tolérance de flatten (px) ~1–1.5 recommandé
// ===============================================

type Point = { x: number; y: number; on: boolean };
type GlyphContour = { points: Point[] };
type GlyphData = {
	contours: GlyphContour[];
	polylines: number[][];
};

type WordRun = { char: string; x: number; y: number };
type WordLayout = {
	text: string;
	baseline: number;
	runs: WordRun[];
	bounds: { x: number; y: number; w: number; h: number };
};

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}
function dist2(ax: number, ay: number, bx: number, by: number) {
	const dx = ax - bx,
		dy = ay - by;
	return dx * dx + dy * dy;
}

function quadPoint(
	p0: [number, number],
	p1: [number, number],
	p2: [number, number],
	t: number,
): [number, number] {
	const ax = lerp(p0[0], p1[0], t);
	const ay = lerp(p0[1], p1[1], t);
	const bx = lerp(p1[0], p2[0], t);
	const by = lerp(p1[1], p2[1], t);
	return [lerp(ax, bx, t), lerp(ay, by, t)];
}
function cubicPoint(
	p0: [number, number],
	p1: [number, number],
	p2: [number, number],
	p3: [number, number],
	t: number,
): [number, number] {
	const ab: [number, number] = [lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t)];
	const bc: [number, number] = [lerp(p1[0], p2[0], t), lerp(p1[1], p2[1], t)];
	const cd: [number, number] = [lerp(p2[0], p3[0], t), lerp(p2[1], p3[1], t)];
	const abbc: [number, number] = [lerp(ab[0], bc[0], t), lerp(ab[1], bc[1], t)];
	const bccd: [number, number] = [lerp(bc[0], cd[0], t), lerp(bc[1], cd[1], t)];
	return [lerp(abbc[0], bccd[0], t), lerp(abbc[1], bccd[1], t)];
}
function segErrQuad(
	p0: [number, number],
	p1: [number, number],
	p2: [number, number],
) {
	const mid = quadPoint(p0, p1, p2, 0.5);
	const chord: [number, number] = [
		(p0[0] + p2[0]) * 0.5,
		(p0[1] + p2[1]) * 0.5,
	];
	return Math.sqrt(dist2(mid[0], mid[1], chord[0], chord[1]));
}
function segErrCubic(
	p0: [number, number],
	p1: [number, number],
	p2: [number, number],
	p3: [number, number],
) {
	const m1 = cubicPoint(p0, p1, p2, p3, 0.25);
	const m2 = cubicPoint(p0, p1, p2, p3, 0.75);
	const chord = (t: number) =>
		[lerp(p0[0], p3[0], t), lerp(p0[1], p3[1], t)] as [number, number];
	const c1 = chord(0.25),
		c2 = chord(0.75);
	const e1 = Math.sqrt(dist2(m1[0], m1[1], c1[0], c1[1]));
	const e2 = Math.sqrt(dist2(m2[0], m2[1], c2[0], c2[1]));
	return Math.max(e1, e2);
}
function flattenQuad(
	out: number[],
	p0: [number, number],
	p1: [number, number],
	p2: [number, number],
	tol: number,
) {
	if (segErrQuad(p0, p1, p2) <= tol) {
		out.push(p2[0], p2[1]);
		return;
	}
	const p01: [number, number] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
	const p12: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
	const p012: [number, number] = [(p01[0] + p12[0]) / 2, (p01[1] + p12[1]) / 2];
	flattenQuad(out, p0, p01, p012, tol);
	flattenQuad(out, p012, p12, p2, tol);
}
function flattenCubic(
	out: number[],
	p0: [number, number],
	p1: [number, number],
	p2: [number, number],
	p3: [number, number],
	tol: number,
) {
	if (segErrCubic(p0, p1, p2, p3) <= tol) {
		out.push(p3[0], p3[1]);
		return;
	}
	const p01: [number, number] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
	const p12: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
	const p23: [number, number] = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2];
	const p012: [number, number] = [(p01[0] + p12[0]) / 2, (p01[1] + p12[1]) / 2];
	const p123: [number, number] = [(p12[0] + p23[0]) / 2, (p12[1] + p23[1]) / 2];
	const p0123: [number, number] = [
		(p012[0] + p123[0]) / 2,
		(p012[1] + p123[1]) / 2,
	];
	flattenCubic(out, p0, p01, p012, p0123, tol);
	flattenCubic(out, p0123, p123, p23, p3, tol);
}

function toPublicUrl(p: string) {
	// Transforme "public/.../file" → "/.../file"
	const norm = p.replace(/\\/g, "/");
	const i = norm.indexOf("/assets/");
	return i >= 0 ? norm.slice(i) : `/${norm.split("public/").pop()}`;
}

function buildCharset(words: string[]) {
	const raw = words.join("").replace(/\s+/g, "");
	const set = new Set(Array.from(raw));
	return Array.from(set);
}

async function main() {
	// 1) Lire la config & le JSON msdf-bmfont
	const cfgPath = resolve(process.cwd(), "tools/config/font-atlas.config.json");
	const cfgRaw = await readFile(cfgPath, "utf8");
	const cfg = JSON.parse(cfgRaw) as {
		fontPath: string;
		outBase: string; // base du PNG/JSON générés par msdf-bmfont
		pxRange: number;
		charsetWords: string[];
	};

	const atlasJsonPath = resolve(process.cwd(), `${cfg.outBase}.json`);
	const bmRaw = await readFile(atlasJsonPath, "utf8");
	const bm = JSON.parse(bmRaw) as BMJson;

	const fontPath = resolve(process.cwd(), cfg.fontPath);
	const font = await new Promise<opentype.Font>((resolve, reject) => {
		opentype.load(fontPath, (err, f) => {
			if (err || !f) return reject(err ?? new Error("Failed to load font"));
			resolve(f);
		});
	});

	const unitsPerEm = font.unitsPerEm;
	const scale = SIZE_REF_PX / unitsPerEm; // em → px@sizeRef
	const ascender = font.ascender * scale;
	const descender = font.descender * scale;

	// 2) Construire le charset à partir des mots
	const charset = buildCharset(cfg.charsetWords ?? []);

	// 3) Extraire contours + polylignes pour chaque glyphe
	const glyphs: Record<string, GlyphData> = {};

	for (const ch of charset) {
		const g = font.charToGlyph(ch);
		// Points on/off + polylignes flatten (en px @ sizeRef)
		const contours: GlyphContour[] = [];
		const polylines: number[][] = [];

		const path = g.getPath(0, 0, SIZE_REF_PX); // OpenType dessine en y-up (baseline à y=0)
		let curPts: Point[] = [];
		let curPoly: number[] = [];
		let pen: [number, number] = [0, 0];

		for (const cmd of path.commands) {
			if (cmd.type === "M") {
				if (curPts.length) {
					contours.push({ points: curPts });
					curPts = [];
				}
				if (curPoly.length) {
					polylines.push(curPoly);
					curPoly = [];
				}
				curPts.push({ x: cmd.x, y: -cmd.y, on: true }); // y-down pour l’écran
				curPoly.push(cmd.x, -cmd.y);
				pen = [cmd.x, -cmd.y];
			} else if (cmd.type === "L") {
				curPts.push({ x: cmd.x, y: -cmd.y, on: true });
				curPoly.push(cmd.x, -cmd.y);
				pen = [cmd.x, -cmd.y];
			} else if (cmd.type === "Q") {
				// off-curve + on-curve
				curPts.push({ x: cmd.x1, y: -cmd.y1, on: false });
				curPts.push({ x: cmd.x, y: -cmd.y, on: true });
				// flatten quad
				flattenQuad(
					curPoly,
					pen,
					[cmd.x1, -cmd.y1],
					[cmd.x, -cmd.y],
					FLAT_TOL_PX,
				);
				pen = [cmd.x, -cmd.y];
			} else if (cmd.type === "C") {
				// deux off-curve + on-curve
				curPts.push({ x: cmd.x1, y: -cmd.y1, on: false });
				curPts.push({ x: cmd.x2, y: -cmd.y2, on: false });
				curPts.push({ x: cmd.x, y: -cmd.y, on: true });
				// flatten cubic
				flattenCubic(
					curPoly,
					pen,
					[cmd.x1, -cmd.y1],
					[cmd.x2, -cmd.y2],
					[cmd.x, -cmd.y],
					FLAT_TOL_PX,
				);
				pen = [cmd.x, -cmd.y];
			} else if (cmd.type === "Z") {
				// refermer la polyline si besoin
				if (curPoly.length >= 2) {
					curPoly.push(curPoly[0], curPoly[1]);
				}
			}
		}
		if (curPts.length) contours.push({ points: curPts });
		if (curPoly.length) polylines.push(curPoly);

		glyphs[ch] = { contours, polylines };
	}

	// 4) Atlas: remapper chars -> UV + metrics utiles
	const scaleW = bm.common.scaleW;
	const scaleH = bm.common.scaleH;

	// ⚠️ lire le vrai nom de la page depuis le JSON BMFont
	const firstPage = bm.pages?.[0];
	if (!firstPage) {
		throw new Error("BMFont JSON has no pages[] entry");
	}
	const pageAbs = resolve(process.cwd(), dirname(cfg.outBase), firstPage);
	const atlasImage = toPublicUrl(pageAbs);

	const chars: Record<string, unknown> = {};
	for (const c of bm.chars) {
		const ch = String.fromCodePoint(c.id);
		chars[ch] = {
			x: c.x,
			y: c.y,
			w: c.width,
			h: c.height,
			uv: {
				u0: c.x / scaleW,
				v0: c.y / scaleH,
				u1: (c.x + c.width) / scaleW,
				v1: (c.y + c.height) / scaleH,
			},
			xoffset: c.xoffset,
			yoffset: c.yoffset,
			xadvance: c.xadvance,
		};
	}

	// 5) Kerns (px @ size in BM JSON). On garde tel quel.
	const kern: Record<string, number> = {};
	if (bm.kernings) {
		for (const k of bm.kernings) {
			const a = String.fromCodePoint(k.first);
			const b = String.fromCodePoint(k.second);
			kern[`${a}${b}`] = k.amount;
		}
	}

	// 6) Layout des mots (runs x/y en px @ SIZE_REF_PX)
	const words: WordLayout[] = [];
	for (const text of cfg.charsetWords ?? []) {
		let x = 0;
		const runs: WordRun[] = [];
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			const g = font.charToGlyph(ch);
			if (i > 0) {
				const prev = text[i - 1];
				const kernValEm = font.getKerningValue(font.charToGlyph(prev), g); // en unités EM
				const kernPx = kernValEm * scale;
				x += Math.round(kernPx);
			}
			runs.push({ char: ch, x: Math.round(x), y: 0 });
			const advPx = Math.round((g.advanceWidth || 0) * scale);
			x += advPx;
		}
		const minY = -ascender;
		const maxY = -descender;
		const baseline = Math.round(ascender); // y écran + vers le bas
		words.push({
			text,
			baseline,
			runs,
			bounds: { x: 0, y: 0, w: Math.max(0, x), h: Math.round(maxY - minY) },
		});
	}

	// 7) Pack & write
	const pack = {
		font: {
			unitsPerEm,
			sizeRefPx: SIZE_REF_PX,
			pxRange: cfg.pxRange,
			ascenderPx: Math.round(ascender),
			descenderPx: Math.round(descender),
			lineHeightPx: Math.round(bm.common.lineHeight),
		},
		atlas: {
			image: atlasImage, // ← maintenant correct (…-0.png)
			width: scaleW,
			height: scaleH,
			chars,
		},
		kern,
		words,
		contours: glyphs,
	};

	const outPath = resolve(process.cwd(), "public/assets/packs/text-pack.json");
	await mkdir(dirname(outPath), { recursive: true });
	await writeFile(outPath, JSON.stringify(pack, null, 2), "utf8");

	const rel = relative(process.cwd(), outPath);
	console.log(`✅ Écrit ${rel}`);
}

main().catch((err) => {
	console.error("❌ prebuild-font échoué:", err);
	process.exit(1);
});
