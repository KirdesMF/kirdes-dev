import { AssetPack, type AssetPackConfig } from "@assetpack/core";
import { pixiManifest } from "@assetpack/core/manifest";
import { msdfFont } from "@assetpack/core/webfont";
import type { Plugin, ResolvedConfig } from "vite";

export function assetpackPlugin(): Plugin {
	const apConfig: AssetPackConfig = {
		entry: "./raw-assets",
		pipes: [
			msdfFont({
				font: {
					outputType: "json",
					fieldtype: "msdf",
					distanceRange: 3,
					textureSize: [1024, 1024],
					pot: true,
					square: true,
					charset: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
				},
			}),
			pixiManifest({ output: "manifest.json", includeMetaData: true }),
		],
	};
	let mode: ResolvedConfig["command"];
	let ap: AssetPack | undefined;

	return {
		name: "vite-plugin-assetpack",
		configResolved(resolvedConfig) {
			mode = resolvedConfig.command;
			if (!resolvedConfig.publicDir) return;
			if (apConfig.output) return;
			const publicDir = resolvedConfig.publicDir.replace(process.cwd(), "");
			apConfig.output = `.${publicDir}/assets/generated/`;
		},
		buildStart: async () => {
			if (mode === "serve") {
				if (ap) return;
				ap = new AssetPack(apConfig);
				void ap.watch();
			} else {
				await new AssetPack(apConfig).run();
			}
		},
		buildEnd: async () => {
			if (ap) {
				await ap.stop();
				ap = undefined;
			}
		},
	};
}
