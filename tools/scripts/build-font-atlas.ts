// tools/scripts/build-font-atlas.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

async function loadGenerator() {
	// @ts-expect-error
	const mod = await import("@pixi/msdf-bmfont-xml"); // CJS compat
	return mod.default ?? mod;
}

type FontCfg = {
	fontPath: string; // ex: tools/fonts-src/Commissioner-Black.ttf
	outBase: string; // ex: public/assets/msdf/fonts/commissioner-800
	pxRange?: number; // distanceRange (default 10)
	charsetWords?: string[]; // ["WORKS","PROJECTS","ABOUT"]
	charset?: string; // alternative directe (chaîne)
	format?: "json" | "xml" | "txt";
	type?: "msdf" | "sdf" | "psdf";
	fontSizePx?: number;
	textureSize?: [number, number];
	padding?: number; // alias texturePadding
	texturePadding?: number;
	border?: number;
	smartSize?: boolean;
	pot?: boolean;
	square?: boolean;
	rot?: boolean;
	// alias “legacy”
	outputType?: "json" | "xml" | "txt";
	fieldType?: "msdf" | "sdf" | "psdf";
	distanceRange?: number;
};

function charsetFromWords(words: string[]) {
	const raw = (words ?? []).join("").replace(/\s+/g, "");
	return Array.from(new Set(Array.from(raw))).join("");
}

async function ensureParent(path: string) {
	await mkdir(dirname(path), { recursive: true });
}

async function main() {
	const cfg = JSON.parse(
		await readFile(resolve("tools/config/font-atlas.config.json"), "utf8"),
	) as FontCfg;

	const generateBMFont = await loadGenerator();

	const fontPath = resolve(cfg.fontPath);
	const outBase = cfg.outBase;

	const outputType = cfg.outputType ?? cfg.format ?? "json";
	const fieldType = cfg.fieldType ?? cfg.type ?? "msdf";
	const distanceRange = cfg.distanceRange ?? cfg.pxRange ?? 10;
	const fontSize = cfg.fontSizePx ?? 42;
	const textureSize = cfg.textureSize ?? [2048, 2048];
	const texturePadding = cfg.texturePadding ?? cfg.padding ?? 1;
	const border = cfg.border ?? 0;
	const smartSize = cfg.smartSize ?? true;
	const pot = cfg.pot ?? false;
	const square = cfg.square ?? false;
	const rot = cfg.rot ?? false;

	const charset = cfg.charset ?? charsetFromWords(cfg.charsetWords ?? []);
	if (!charset)
		throw new Error(
			"Aucun charset : définis `charsetWords` ou `charset` dans la config.",
		);

	await ensureParent(resolve(`${outBase}.json`));

	console.log("▶︎ Génération atlas MSDF…", {
		fontPath,
		outBase,
		outputType,
		fieldType,
		distanceRange,
		fontSize,
		textureSize,
		texturePadding,
		border,
		smartSize,
		pot,
		square,
		rot,
		charset,
	});

	await new Promise<void>((_, fail) => {
		generateBMFont(
			fontPath,
			{
				outputType, // "json" | "xml" | "txt"
				filename: outBase, // base (on va réécrire nous-mêmes)
				charset,
				fieldType, // "msdf" | "sdf" | "psdf"
				distanceRange, // pxRange
				fontSize,
				textureSize,
				texturePadding,
				border,
				vector: false,
				"smart-size": smartSize,
				pot,
				square,
				rot,
				roundDecimal: 0,
			},
			async (
				err: unknown,
				textures: Record<string, Buffer>[],
				font: { data: Buffer },
			) => {
				if (err) return fail(err);
				try {
					// 1) Forcer les noms des pages: outBase-0.png, -1.png, ...
					const baseName = basename(outBase); // "commissioner-800"
					const pageNames: string[] = [];
					for (let i = 0; i < textures.length; i++) {
						const pageName = `${baseName}-${i}.png`;
						const pagePath = resolve(`${outBase}-${i}.png`);
						await writeFile(pagePath, textures[i].texture);
						console.log("🖼️  écrit:", pagePath);
						pageNames.push(pageName);
					}

					// 2) Réécrire le JSON pour y mettre nos pages forçées
					const bm = JSON.parse(font.data.toString("utf8"));
					bm.pages = pageNames; // <<< clé essentielle
					const jsonPath = resolve(`${outBase}.json`);
					await writeFile(jsonPath, JSON.stringify(bm, null, 2), "utf8");
					console.log("📄  écrit:", jsonPath);
				} catch (e) {
					fail(e);
				}
			},
		);
	});

	console.log("✅ Atlas MSDF généré.");
}

main().catch((e) => {
	console.error("❌ build-font-atlas échoué:", e);
	process.exit(1);
});
