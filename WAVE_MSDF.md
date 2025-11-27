## Wave – Pipeline MSDF prébuild

Objectif : afficher le texte de la wave en MSDF avec rendu net, en pré-calculant tout ce qui est possible avant runtime.

### 1) Générer la fonte MSDF en JSON + atlas

- Source : `raw-assets/fonts/Commissioner-Black{msdf}{family=Commissioner}.ttf`.
- Option A (patch assetpack) : dans `plugins/asset-pack.ts`, ne force plus `outputType: 'xml'` dans `msdfFont` pour laisser passer `outputType: 'json'`, puis relancer AssetPack (dev ou build) ⇒ produit `public/assets/generated/fonts/Commissioner-Black.json` + `.png`.
- Option B (direct CLI) : `npx msdf-bmfont-xml raw-assets/fonts/Commissioner-Black{msdf}{family=Commissioner}.ttf --output-type json --field-type msdf --distance-range 3 --texture-size 1024,1024 --pot --square --charset "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" --filename Commissioner-Black` ⇒ copie le `.json` et le `.png` dans `public/assets/generated/fonts/`.

### 2) Préparer les données statiques côté code

- Charger le JSON au build (import statique) et exposer :
  - `scaleW/scaleH`, `lineHeight`, `base`, `distanceRange`.
  - `glyphs` par codepoint : `{x,y,width,height,xoffset,yoffset,xadvance,page}`.
  - `kerning` map clé `(first<<16)|second -> amount`.
- Générer en Node les layouts pour tous les textes connus (desktop/mobile si besoin) :
  - Appliquer kerning + `xadvance`, gérer `\n` avec `lineHeight`/`base`.
  - Produire positions locales + UV normalisés (`x/scaleW`, `y/scaleH`) par quad.
  - Sauvegarder ce cache (JSON/TS) dans `public/assets/generated/` ou un module importable.

### 3) Runtime dans la WaveScene

- Charger une seule fois l’atlas MSDF (page 0) dans une texture WebGL.
- Créer un VAO/VBO par texte pré-calculé et simplement “switcher” selon la scène (pas de layout CPU à l’exécution).
- Vertex shader : conserver la même déformation (baseline + sin) que le texte actuel.
- Fragment shader : utiliser le MSDF (median + fwidth), et injecter `distanceRange` du JSON pour régler le seuil.
- Thèmes/couleurs restent des uniforms (fill/outline/hatch identiques à aujourd’hui).

### Notes kerning

- `@assetpack/core` + `@pixi/msdf-bmfont-xml` gèrent le kerning si la fonte/charset le fournit. Dans l’output actuel `<kernings count="0"/>` parce que la table est vide pour ce charset/variant. Si besoin de kerning, vérifier la fonte ou élargir le charset avant génération.
