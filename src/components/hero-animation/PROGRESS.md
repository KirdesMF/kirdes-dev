## Mise à jour — 2025-11-13

> Effet souhaité : **lettres MSDF** + **shapes/blobs/sparkles** à **déformation gélatine** (couleur unie noir/blanc selon thème), qui **s’écrasent et ondulent** sous l’effet d’un **panel** (synchro avec un panneau HTML).

- [ ] **Couleur unie** (noir/blanc) pour lettres & shapes (pas de shader texte custom).
- [ ] **Panel ⇄ HTML** : synchroniser la zone physique avec le panel DOM (ResizeObserver + `getBoundingClientRect` → coordonnées Pixi).
- [ ] **Gélatine** : déformation élastique (squash/stretch + oscillation amortie à l’impact), priorité sur lettres.
- [ ] **Critères** : déformation bornée (clamp), lecture intacte, 60 FPS visés.
- [ ] **Dark / Light mode** : couleurs unies synchronisées au thème (variables CSS), contraste AA min.

---

# PROGRESS.md

## 🎯 Vision de l'Animation

**Hero interactive avec physique organique (Pixi v8 + Matter.js + GSAP)** :

- Lettres (MSDF) et shapes/blobs tombent et collisionnent
- Un **panel** s'ouvre et **compresse** la masse
- **Déformation gélatine** (écrasement + ondulation amortie) — pas de texture “ballon”, rendu **uni** N/B
- Lettres MSDF nettes à toutes tailles

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
- [x] Ajouter le pipe `msdfFont(...)`
- [x] Ajouter le pipe **en dernier** `pixiManifest({ output: 'manifest.json', includeMetaData: true })`
- [x] Lancer `npm run dev` (watch) et `npm run build` (run unique)
- **Validation**
  - [x] `public/assets/generated/fonts/<Family>.png` + `<Family>.fnt`
  - [x] `public/assets/generated/manifest.json` présent

### 1.3 Canvas Pixi (client-only)

- [x] Composant Astro client-only (`HeroAnimation.astro`)
- [x] `Application.init({ canvas, background: 'red', resolution: devicePixelRatio, resizeTo })`
- **Validation**
  - [x] Canvas visible (rouge de dev)
  - [x] Resize correct et netteté dPR

---

## Étape 2 — Boucle Physique (Matter.js) minimaliste

- [x] Instancier `Engine`, `World`, un body simple (cercle)
- [x] Ticker Pixi ↔ `Engine.update` via **pas fixe**
- [x] Associer 1 DisplayObject ↔ 1 Body (position/angle)
- **Validation**
  - [x] Gravité OK + collisions avec murs
  - [x] Pas fixe stable (no spiral-of-death)

---

## Étape 3 — Blobs & Shapes (instanciation + base)

- [x] Créer **N blobs** (placeholder Graphics)
- [x] Régler `density`, `friction`, `restitution`
- [x] **Classe `Blob`** (encapsule body + visuel + `update()`/`dispose()`) — à introduire
- [ ] **Style gélatine (blobs/shapes)** : couleur unie, légère oscillation amortie sur collision (visuel uniquement)
- [ ] **Thème dark/light (blobs/shapes)** : teinte unie liée à des variables CSS (`--fg`), synchro avec le thème.
- **Validation**
  - [x] 80 blobs vivants, FPS stable
  - [x] Collisions réalistes

---

## Étape 4 — Panel de compression (logique + sync HTML)

- [x] Type/Classe **`Panel`** (AABB + `strength`, `direction`, `falloff`)
- [x] **Hook** avant chaque sous-step (appliquer **forces** aux bodies dans la zone)
- [x] **Sync HTML** : `ResizeObserver` + `getBoundingClientRect()` → conversion coord. Pixi → maj panel physique
- [x] (Option) **Debug viz** : rectangle semi-transparent dans Pixi
- **Validation**
  - [ ] Les blobs/lettres sont densifiés/repoussés quand le panel passe

---

## Étape 5 — Lettres MSDF (rendu + gélatine)

- [x] `Assets.init({ manifest: '/assets/generated/manifest.json' })` + `loadBundle('fonts')`
- [x] `BitmapText` avec `fontFamily` MSDF + **couleur unie** (N/B)
- [ ] **Déformation gélatine** sur lettres : squash/stretch visuel + oscillation amortie à l’impact (sans shader texte custom)
- [ ] (Option) Bodies Matter pour lettres (sinon décoratives)
- [ ] **Option avancée — JellyPlane (mesh)** : BitmapText → RenderTexture 2× → plan maillé (ex. 24×8) ; compression **locale** dans l’AABB du panel (avec léger bulge), oscillation amortie par sommet.
- [ ] **Thème dark/light (lettres)** : couleur MSDF via variables CSS (`--color-foreground`), contraste AA min.
- **Validation**
  - [ ] Netteté parfaite à différentes tailles (pas de franges/halos)
  - [ ] Déformation visible mais **lecture intacte**

---

## Étape 6 — Séquence / Timeline (GSAP)

- [x] **Choix lib** : **GSAP**
- [ ] Orchestrations : **lettres plein container** (repos) → **ouverture panel** (compression + ondulation) → release
- [ ] Piloter des **valeurs JS** (ex: `panel.x/y/width/height`, intensité)
- [ ] (Option) Controls: play/pause/seek minimal
- **Validation**
  - [ ] Séquence cohérente et reproductible

---

## Étape 7 — Responsive & Performance

- [x] Rendu: cap du dPR (`resolutionCap`, défaut 2) + `resizeTo`
- [x] Clamp du delta physique (`maxDeltaMs`) pour éviter les sauts après idle
- [x] Pause/Resume du ticker sur `visibilitychange`
- [x] Recalculer les bornes monde/Matter au resize
- [ ] Limiter le nombre de bodies (budget FPS)
- [ ] Choisir taille atlas MSDF (1024/2048 selon besoins)
- [ ] Éviter `filter`/`backdrop-filter` sur le parent du canvas
- **Validation**
  - [ ] Net sur dPR 1/2/3
  - [ ] > 50–60 FPS sur laptop récent

---

## Étape 8 — Polish

- [ ] **Gélatine avancée** (option) : **JellyPlane (mesh warp)** ou shader displacement si besoin de réalisme ↑
- [ ] Sparkles non-physiques synchronisées à la timeline
- [ ] Accessibilité (contraste, focus sur CTA superposé)
- **Validation**
  - [ ] Aucun warning/erreur console
  - [ ] Hero “prête prod” (visuel/UX)

---

## 🧩 Classes & Modules (présents / prévus)

- [x] **`Scene`** : own Pixi App + Engine + boucle; `start()`, `dispose()`
- [ ] **`Blob`** : body circulaire + visuel Pixi; `update()`, `dispose()`
- [ ] **`Panel`** : logique compression (AABB + forces), sync DOM
- [ ] **`JellyDeformer`** : mini système ressort-amorti (valeurs visuelles: scale/skew), déclenché par collisions/impulsions
- [ ] **`JellyPlane`** : plane subdivisé (mesh) pour lettres ; `updateJelly(panelRect)` applique une compression **locale** (bulge + amorti)
- [ ] **`SoftBody`** _(optionnel plus tard)_ : anneau de particules + contraintes (coûteux)

---

## Notes d’implémentation rapides

- **Pas fixe** : forces panel via hook `beforeStep` (stable).
- **Gélatine sans shader** : map _impulse/collision_ → cibles `(scaleX, scaleY, skew)` + oscillation amortie (ressort critique ou léger underdamp).
- **Sync panel HTML** : convertir `{left, top, width, height}` DOM → `{x, y, w, h}` Pixi.
- **Couleur** : unie (noir/blanc) selon thème; pas de highlights “ballon”.
- **GSAP** : tweener des **paramètres logiques** (pas les positions Matter).
- **JellyPlane** : BitmapText → RenderTexture **2×** → Mesh (cols×rows) ; offsets par sommet **uniquement** dans l’AABB du panel, **bulge latéral**, amorti (ω, ζ) ; update d’un **unique buffer de positions** par frame.
