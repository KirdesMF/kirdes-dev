## 🎯 Vision de l'Animation

**Hero interactive avec physique organique** :

- Blobs et lettres "portfolio" tombent et flottent avec collisions réalistes
- Panel central s'ouvre, compressant les éléments via des forces de répulsion
- Déformation élastique type ballon de baudruche
- Style N&B épuré avec texte MSDF haute définition
- Physique Matter.js + rendu Pixi v8 + timeline GSAP

---

## Étape 1 — Build assets MSDF (AssetPack) & bootstrap rendu

### 1.1 Structure & convention des assets

- [x] Créer `raw-assets/fonts/` pour les sources TTF/OTF
- [x] Utiliser `public/assets/generated` pour les sorties AssetPack (atlas + fnt/json + manifest)
- [x] Renommer les fontes avec tags (ex: `Inter{msdf}{family=Inter}.ttf`)
- [x] Vérifier que `{msdf}` déclenche la génération MSDF
- [x] Vérifier que `{family=...}` fixe la famille utilisée côté Pixi

### 1.2 Configuration AssetPack

- [x] Brancher AssetPack via `astro.config.mjs` → `vite.plugins`
- [x] Définir `output: 'public/assets/generated/'`
- [x] Ajouter le pipe `msdfFont({ font: { outputType: 'xml', fieldType: 'msdf', distanceRange: 3, textureSize: [1024,1024], pot: true, square: true } })`
- [x] Ajouter le pipe **en dernier** `pixiManifest({ output: 'manifest.json', includeMetaData: true })`
- [x] Lancer `npm run dev` (watch) et `npm run build` (run unique)
- **Validation**
  - [x] Génération de `public/assets/generated/fonts/<Family>.png` + `<Family>.fnt`
  - [x] Présence de `public/assets/generated/manifest.json`

### 1.3 Canvas Pixi noir (client-only)

- [x] Créer un composant Astro client-only (ex: `src/components/PixiHero.astro`)
- [x] `Application.init({ view, background: 'red', resolution: devicePixelRatio, resizeTo: container })`
- **Validation**
  - [x] Canvas rouge visible (sans erreur SSR)
  - [x] Resize correct et netteté dPR

---

## Étape 2 — Boucle Physique (Matter.js) minimaliste

- [ ] Instancier `Engine`, `World`, un body simple (cercle)
- [ ] Synchroniser Pixi `Ticker` (rendu) et `Engine.update(engine, 1000/60)` (physique)
- [ ] Associer 1 DisplayObject ↔ 1 Body (position/angle chaque frame)
- **Validation**
  - [ ] Gravité OK + collisions avec murs
  - [ ] Pas de dérive visible à FPS variables

> Note: ne pas tweener directement `Body.position`/`angle` de Matter ; garder un **pas fixe** et pousser les bodies via des **forces** vers des cibles tweenées (cf. Étape 6.B).

---

## Étape 3 — Blobs (esthétique + instanciation)

- [ ] Créer N blobs (au départ en `Graphics` ou `Sprite` placeholder)
- [ ] Régler `density`, `friction`, `restitution`
- **Validation**
  - [ ] N blobs vivants
  - [ ] FPS stable
  - [ ] Collisions réalistes

---

## Étape 4 — Panel de compression (couche logique)

- [ ] Définir une zone (AABB) "panel" **sans** DisplayObject
- [ ] Appliquer une force radiale selon la distance au centre quand panel traverse
- **Validation**
  - [ ] Les blobs sont compressés/repoussés lors du passage du panel

---

## Étape 5 — Lettres MSDF

- [ ] `Assets.init({ manifest: '/assets/manifest.json' })`
- [ ] Charger bundle `fonts` (ou `.fnt` direct)
- [ ] `new BitmapText({ text, style: { fontFamily: 'Inter', fontSize: 64 } })`
- [ ] Décider si les lettres ont des bodies Matter (ou décoratives)
- **Validation**
  - [ ] Netteté parfaite à différentes tailles (pas de franges/halos)

---

## Étape 6 — Séquence / Timeline (entrée, compression, release)

- [ ] **Choix lib d’animation**: **GSAP** (pilotage de valeurs JS + éventuels sprites Pixi)
- [ ] Orchestrer: entrée blobs → panel → apparition texte → release
- [ ] Garder la physique en pas fixe (animer les paramètres cibles)
- [ ] Option: ajouter play/pause/seek minimal
- **Validation**
  - [ ] Séquence cohérente et reproductible

### 6.A — Pourquoi GSAP (et pas Motion) ici ?

- GSAP
  - [x] Tween de **valeurs JS** (ex: `panel.x`, coefficients), parfait pour Pixi/Matter
  - [x] **PixiPlugin** dispo pour animer des sprites décoratifs
  - [x] Timelines (play/pause/seek/reverse) faciles
- Motion (Motion One / Framer Motion)
  - [ ] Très orienté DOM/CSS/React ; moins direct pour Pixi et valeurs JS “pures”
  - [ ] Impliquerait des îlots React si Framer, inutile ici

### 6.B — Patrons d’intégration GSAP × Pixi × Matter

**1) Animer un paramètre logique (panel.x)**

```ts
import gsap from "gsap";

const state = { panelX: 0 };
const tl = gsap.timeline({ defaults: { duration: 1.2, ease: "power2.inOut" } });

tl.to(state, {
  panelX: 600,
  onUpdate: () => panel.setX(state.panelX), // applique dans ta logique
}).to(state, {
  panelX: 100,
  onUpdate: () => panel.setX(state.panelX),
});
```

---

## Étape 7 — Responsive & Performance

- [ ] Rendu: `resolution: devicePixelRatio`, `resizeTo`
- [ ] Recalculer les bornes monde/Matter au resize
- [ ] Limiter le nombre de bodies
- [ ] Choisir taille atlas MSDF (1024/2048 selon besoins)
- [ ] Éviter `filter`/`backdrop-filter` sur le parent du canvas
- **Validation**
  - [ ] Net sur dPR 1/2/3
  - [ ] > 50–60 FPS sur laptop récent

---

## Étape 8 — Polish

- [ ] Couleurs, easing, petites particules (optionnel)
- [ ] Accessibilité (contraste, focus sur CTA superposé)
- **Validation**
  - [ ] Aucun warning/erreur console
  - [ ] Hero "prête prod" (visuel/UX)

---

# Détails d’implémentation

## A. `astro.config.mjs` — plugin AssetPack (exemple)

```js
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import { AssetPack } from "@assetpack/core";
import { msdfFont } from "@assetpack/core/webfont";
import { pixiManifest } from "@assetpack/core/manifest";

function assetpackPlugin() {
  const apConfig = {
    entry: "./raw-assets",
    output: "./public/assets",
    pipes: [
      msdfFont({
        font: {
          outputType: "xml", // 'json' possible
          fieldType: "msdf",
          distanceRange: 3,
          textureSize: [1024, 1024],
          pot: true,
          square: true,
          // charset: '...'       // optionnel: limiter la table
        },
      }),
      pixiManifest({ output: "manifest.json", includeMetaData: true }),
    ],
  };

  let watcher;
  return {
    name: "assetpack-in-astro",
    async buildStart() {
      if (process.env.ASTRO_CLI === "dev") {
        if (!watcher) {
          watcher = new AssetPack(apConfig);
          void watcher.watch();
        }
      } else {
        await new AssetPack(apConfig).run();
      }
    },
    async closeBundle() {
      if (watcher) {
        await watcher.stop();
        watcher = undefined;
      }
    },
  };
}

export default defineConfig({
  integrations: [tailwind()],
  vite: { plugins: [assetpackPlugin()] },
});
```

## B. Arborescence

```
public/
  assets/
    manifest.json
    fonts/
      Inter.png
      Inter.fnt
raw-assets/
  fonts/
    Inter{msdf}{family=Inter}.ttf
src/
  components/
    PixiHero.astro
  pages/
    index.astro
```

## C. `PixiHero.astro` — canvas noir (base)

```astro
---
const id = 'pixi-hero';
---
<div class="min-h-screen w-full flex items-center justify-center bg-black">
  <canvas id={id} class="block w-full h-[80vh]"></canvas>
</div>
<script type="module">
  import { Application } from 'pixi.js';
  const canvas = document.getElementById('{id}');
  const app = new Application();
  (async () => {
    await app.init({
      view: canvas,
      background: '#000000',
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: canvas.parentElement
    });
  })();
</script>
```

## D. Chargement MSDF (plus tard, Étape 5)

```ts
import { Assets, BitmapText } from "pixi.js";
await Assets.init({ manifest: "/assets/manifest.json" });
await Assets.loadBundle(["fonts"]); // ou charge direct Inter.fnt
const title = new BitmapText({
  text: "Hello MSDF",
  style: { fontFamily: "Inter", fontSize: 64 },
});
app.stage.addChild(title);
```

## E. Notes Tailwind v4

- [ ] Conteneur plein écran: `min-h-screen w-full overflow-hidden`
- [ ] Éviter `filter`/`backdrop-filter` sur le parent du canvas
- [ ] Remettre `body { margin: 0; }` si nécessaire

---

# Checklist de livrables par étape

- [ ] **Étape 1**: sorties MSDF + manifest; canvas noir responsif
- [ ] **Étape 2**: moteur physique au pas fixe; 1 body + sprite
- [ ] **Étape 3**: N blobs; perf OK
- [ ] **Étape 4**: panel logique qui compresse
- [ ] **Étape 5**: texte MSDF net; métriques correctes
- [ ] **Étape 6**: séquence reproductible
- [ ] **Étape 7**: responsive dPR; FPS stable
- [ ] **Étape 8**: polish final

---

# Paramètres par défaut

- [ ] Sortie police: **BMFont XML (.fnt)**
- [ ] Atlas: **1024×1024**, `pot: true`, `square: true`
- [ ] `distanceRange: 3` (augmenter à 4–6 si artefacts à grosse taille)
- [ ] Basculer en JSON si besoin (`outputType: 'json'`)
- [ ] Lib d’animation: **GSAP**
