# Hero Animation — PROGRESS

> Branche dédiée à la refonte complète de l’animation hero “liquid text”  
> Stack : Astro (static), React (dev route), Tailwind v4, PixiJS, Matter.js, GSAP, MSDF, WebGL shaders

---

## 0. Description globale

Objectif : créer une **animation hero typographique fluide (“liquid text”)** où des lettres très grasses se comportent comme une matière molle, influencées par la physique et un panel DOM central.

Comportement cible :

- Les **lettres uniquement** (aucun blob) sont rendues en MSDF, très grasses, organiques.
- **Intro** :
  - les lettres apparaissent une par une,
  - remplissent progressivement le canvas,
  - se collisionnent avec un effet jelly visible.
- **Panel** :
  - un panel DOM s’ouvre et sert de “fenêtre” centrale pour du contenu statique (texte, logos…),
  - les lettres sont repoussées / écrasées autour du panel,
  - elles se tassent entre elles et contre les bords du panel, avec un effet jelly qui se stabilise tant que le panel ne bouge plus.
- **Effet jelly** :
  - repose sur la physique (impacts + panel),
  - d’abord implémenté en transformations simples (scale/skew),
  - puis migré vers un **shader 2D WebGL** pour une déformation plus crédible (squash / stretch / twist / bulge).

Couleurs :

- L’animation utilise les **couleurs de base du site** :
  - `--color-foreground` pour les lettres,
  - `--color-background` pour le fond,
- Ces couleurs sont définies en **OKLCH** côté CSS (via Tailwind v4),
- Il faut prévoir une **conversion OKLCH → sRGB** pour Pixi (utilitaire TS),
- Le thème **dark/light** est géré via un toggle global (classe / data-attribute), les variables CSS étant mises à jour, le hero suit automatiquement.

L’animation doit être :

- **statique côté Astro** (SSR + hydration minimale),
- **thémable en CSS + Tailwind** (dark/light via variables),
- **testable par petites étapes** (chaque milestone est validable visuellement),
- **isolée dans `/hero-animation`** (pas de sous-dossiers).

---

## 1. Stack technique

- **Framework / rendu**
  - Astro (pages statiques, hydration côté client minimale).
  - React pour la **route de dev** (éditeur de layout uniquement en dev).

- **Styling / thème**
  - Tailwind CSS v4.
  - Variables CSS globales :
    - `--color-foreground` (texte / lettres, en OKLCH),
    - `--color-background` (fond, en OKLCH).
  - Utilitaire TS pour conversion OKLCH → sRGB/Pixi.

- **Rendu WebGL**
  - PixiJS (Application, Container, Text / BitmapText, Filter / Mesh pour shaders).

- **Physique**
  - Matter.js (Engine, Bodies, World, collisions, step contrôlé).

- **Animation**
  - GSAP (timelines, easing, séquençage intro / panel).

- **Typographie**
  - Font MSDF **classique** générée via AssetPack :
    - atlas `.png`,
    - description `.fnt` ou `.json`.

- **Shaders**
  - Shaders 2D Pixi (`Filter` ou `Mesh` + shader custom).

- **Build / tooling**
  - TypeScript strict.
  - Pas de `any`.
  - Champs privés `#` pour les classes.
  - Dev route active uniquement en dev.

---

## 2. Structure de dossier (sans sous-dossier, naming)

Convention de nommage :

- Fichiers **Astro** : `PascalCase.astro`.
- Tous les autres fichiers (TS, CSS, JSON, GLSL, etc.) : **kebab-case**.

Dossier `hero-animation/` :

- `HeroAnimation.astro` — composant hero côté Astro (prod).
- `hero-scene.ts` — classe principale de scène (Pixi + Matter).
- `hero-letter.ts` — classe Letter (glyph MSDF + body physique + jelly).
- `hero-panel.ts` — classe Panel (DOM → stage, forces physiques).
- `hero-jelly-spring.ts` — implémentation spring/jelly non-shader.
- `hero-jelly-shader.ts` — glue pour les shaders (filter/mesh + uniforms).
- `hero-layout.ts` — types & helpers pour le layout JSON.
- `hero-fixed-step.ts` — pas fixe Matter.
- `hero-timeline.ts` — GSAP timeline (intro, panel, phases).
- `hero-dev-route.tsx` — route de dev (React), éditeur de layout.
- `hero-theme.css` — variables CSS complémentaires et styles hero.
- `hero-layout.json` — layout JSON exporté par la dev route.
- `hero-config.ts` — configuration globale (constantes, tuning).
- `hero-shaders.glsl` (optionnel) — sources GLSL.
- `readme-hero.md` (optionnel) — doc locale.

---

## 3. Thème CSS & Tailwind v4

### 3.1. Couleurs globales

- `--color-background: oklch(...);`
- `--color-foreground: oklch(...);`
- Aliases hero (dans `hero-theme.css`) :
  - `--hero-bg: var(--color-background);`
  - `--hero-fg: var(--color-foreground);`

### 3.2. Utilisation côté hero

- Container hero stylé via Tailwind + ces variables.
- Panel DOM et contenu textuel utilisent aussi `--hero-fg` / `--hero-bg`.

### 3.3. Conversion OKLCH → Pixi

- Utilitaire `cssVarToPixiColor(varName: string): number` (fichier util si besoin, ex. `css-color.ts` ou intégré dans `hero-config.ts`) :
  - lit la valeur CSS (OKLCH),
  - parse,
  - convertit en sRGB,
  - retourne `0xRRGGBB`.

Utilisation :

- background Pixi ← `--hero-bg`,
- lettres (tint) ← `--hero-fg`.

### 3.4. Toggle dark / light

- Basé sur Tailwind (classe `.dark` ou `data-theme`).
- Cette bascule met à jour `--color-background` / `--color-foreground` (OKLCH).
- Le hero récupère les nouvelles valeurs via `cssVarToPixiColor` (au mount ou sur changement si nécessaire).

Axes d’amélioration :

- Support d’un troisième thème “alt”.
- Mode debug avec couleurs forcées.

---

## 4. Génération MSDF

- AssetPack génère :
  - `hero-font.png` (atlas MSDF),
  - `hero-font.fnt` / `.json` (métriques).
- Utilisation via Pixi / BitmapFont.

Axes d’amélioration :

- Pipeline alternatif SVG → font custom → MSDF (plus tard).
- Deux graisses différentes pour variations.

---

## 5. Roadmap par étapes (checklist)

> Chaque étape est validée visuellement avant de passer à la suivante.

### Étape 1 — Setup de base (Astro + Tailwind v4 + CSS + structure fichiers)

- [x] Créer le dossier `hero-animation/` et les fichiers vides principaux (noms en kebab-case, sauf `HeroAnimation.astro`).
- [x] Configurer Tailwind v4 (si pas déjà fait) avec :
  - [x] `--color-background` en OKLCH,
  - [x] `--color-foreground` en OKLCH,
  - [x] gestion dark/light globale.
  - [x] alias `--hero-bg` / `--hero-fg`,
  - [x] styles de base pour le container hero (ratio, overflow).
- [x] Créer `HeroAnimation.astro` :
  - [x] wrapper `<section>` hero avec classes Tailwind,
  - [x] `<canvas>` pour Pixi,
  - [x] panel DOM central (contenu placeholder).
- [x] Intégrer le hero sur une page Astro en statique (pas de JS client).

**Done lorsque :**

- [x] Hero visible en statique avec panel + canvas.
- [x] Thème dark/light affecte bien fond + texte via `--color-background` / `--color-foreground`.

**Axes d’amélioration :**

- [ ] Flag pour désactiver facilement le hero.
- [ ] Fallback pure CSS sans canvas.

---

### Étape 2 — Initialisation Pixi (sans physique, sans animation)

- [ ] Implémenter `hero-scene.ts` :
  - [ ] constructeur(canvas),
  - [ ] `start()` qui crée `Application`, utilise `--hero-bg` via `cssVarToPixiColor`, gère `resolution` + `resizeTo`.
- [ ] Dans `HeroAnimation.astro` :
  - [ ] récupérer le canvas,
  - [ ] instancier `HeroScene` (import depuis `hero-scene.ts`),
  - [ ] appeler `scene.start()` côté client.
- [ ] Gérer `dispose()` dans `HeroScene` et nettoyage sur unmount / navigation.

**Done lorsque :**

- [ ] Le canvas Pixi est visible.
- [ ] Le background reflète les variables CSS (thème).

**Axes d’amélioration :**

- [ ] Support d’un refresh des couleurs lors d’un changement de thème live.
- [ ] Exposer `getViewportSize()`.

---

### Étape 3 — Intégration MSDF + lettres statiques (sans physique)

- [ ] Définir les types dans `hero-layout.ts` :
  - [ ] `HeroLetterLayout` (id, char, x, y, scale, rotation),
  - [ ] `HeroLayout` (designCanvas + letters[]).
- [ ] Créer un `hero-layout.json` minimal à la main.
- [ ] Charger la font MSDF via AssetPack dans `HeroScene.start()` (via `hero-scene.ts`).
- [ ] Implémenter `hero-letter.ts` (rendu uniquement) :
  - [ ] création d’un display MSDF (BitmapText ou équivalent),
  - [ ] méthode `setTransform`.
- [ ] Dans `hero-scene.ts` :
  - [ ] lire `hero-layout.json`,
  - [ ] appliquer un scale global design → stage,
  - [ ] instancier un `HeroLetter` par entrée.

**Done lorsque :**

- [ ] Les lettres apparaissent aux bonnes positions et tailles (sans physique),
- [ ] Modifier `hero-layout.json` modifie le rendu.

**Axes d’amélioration :**

- [ ] Mode debug qui affiche les bboxes/ids.
- [ ] Centrage automatique global de la composition.

---

### Étape 4 — Dev route / éditeur de layout (React, dev-only)

- [ ] Créer `hero-dev-route.tsx` (accessible uniquement en dev) :
  - [ ] canvas Pixi dans un design space fixe (ex. 1400×900).
- [ ] Charger :
  - [ ] la font MSDF,
  - [ ] un layout initial (le même `hero-layout.json`).
- [ ] Implémenter les interactions :
  - [ ] sélection de lettre (clic),
  - [ ] drag (update x/y),
  - [ ] contrôle scale et rotation (inputs / sliders).
- [ ] Panneau latéral :
  - [ ] affiche id, char, x, y, scale, rotation,
  - [ ] editable.
- [ ] Bouton “Export layout” :
  - [ ] génère JSON valide (`HeroLayout`),
  - [ ] copie dans le presse-papier ou console.
- [ ] Remplacer `hero-layout.json` par la version exportée.

**Done lorsque :**

- [ ] On peut éditer visuellement la composition et exporter un JSON que la scène prod consomme.

**Axes d’amélioration :**

- [ ] Import direct d’un JSON (roundtrip complet).
- [ ] Snap to grid, zIndex, undo/redo.

---

### Étape 5 — Physique Matter (bodies simples, pas encore de panel)

- [ ] Créer `hero-fixed-step.ts` (stepper Matter time fixe).
- [ ] Étendre `hero-letter.ts` :
  - [ ] création d’un `Bodies.circle` par lettre (rayon basé sur taille visuelle),
  - [ ] méthode `updateFromPhysics(dt)` pour sync display ↔ body.
- [ ] Dans `hero-scene.ts` :
  - [ ] créer `Engine` + murs,
  - [ ] brancher le stepper sur le `ticker` Pixi,
  - [ ] appliquer la gravité.
- [ ] Les letters sont initialisées selon le layout puis “lâchées”.

**Done lorsque :**

- [ ] Les lettres tombent, rebondissent, se collisionnent proprement.

**Axes d’amélioration :**

- [ ] Tuning gravité, restitution, friction.
- [ ] Bouton “reset” pour relancer la simulation.

---

### Étape 6 — Panel DOM & forces physiques (sans jelly visuel)

- [ ] Implémenter `hero-panel.ts` :
  - [ ] stocker l’`HTMLElement` du panel,
  - [ ] observer panel + canvas (`ResizeObserver` + scroll),
  - [ ] calculer un rect stage (x, y, width, height),
  - [ ] méthode `apply(bodies[])` qui applique une force inward/outward sur les bodies intersectant le rect.
- [ ] Dans `hero-scene.ts` :
  - [ ] ajouter `setPanelElement(el: HTMLElement)`,
  - [ ] appeler `panel.apply([...letterBodies])` dans le stepper.
- [ ] Dans `HeroAnimation.astro` :
  - [ ] passer le panel DOM à `HeroScene`.

**Done lorsque :**

- [ ] En bougeant le panel (via CSS/JS), les lettres sont repoussées / attirées autour de son rect.

**Axes d’amélioration :**

- [ ] Mode debug (dessin de la rect dans Pixi).
- [ ] Paramètres de force (strength, falloff) ajustables.

---

### Étape 7 — Jelly “spring” non-shader (scale/skew)

- [ ] Implémenter `hero-jelly-spring.ts` :
  - [ ] paramètres : frequency, damping, maxStretch, maxSkew,
  - [ ] méthodes : `hit(magnitude)`, `update(dt)` → (sx, sy, skew).
- [ ] Intégrer dans `hero-letter.ts` :
  - [ ] champ privé pour le spring,
  - [ ] `onImpact(magnitude)`,
  - [ ] appliquer (sx, sy, skew) au display dans `updateFromPhysics`.
- [ ] Collisions Matter :
  - [ ] handler `collisionStart` → calcul magnitude → `onImpact(mag)`.
- [ ] Panel :
  - [ ] calcul d’overlap rect panel / bounds lettre → `onImpact(mag)`.

**Done lorsque :**

- [ ] Les lettres “rebondissent” visuellement après impacts (collisions + panel),
- [ ] L’effet est amorti et revient à la forme neutre.

**Axes d’amélioration :**

- [ ] Paramétrage différent pour panel vs collisions.
- [ ] Clamp pour éviter des déformations extrêmes.

---

### Étape 8 — Shader jelly (Filter / Mesh)

- [ ] Créer `hero-jelly-shader.ts` :
  - [ ] encapsuler un Filter / Mesh shader,
  - [ ] définir uniforms (amplitude, direction, phase, etc.).
- [ ] Adapter `hero-letter.ts` :
  - [ ] transmettre les infos jelly au shader plutôt qu’uniquement aux scales/skews globaux.
- [ ] Implémenter un shader simple :
  - [ ] déformation interne (bord écrasé / centre qui gonfle),
  - [ ] petite torsion.
- [ ] Garder un fallback spring “simple” tant que le shader n’est pas validé.

**Done lorsque :**

- [ ] Les lettres ont un rendu plus “organique” que le simple scale/skew,
- [ ] La lettre reste lisible.

**Axes d’amélioration :**

- [ ] Différents profils de déformation selon type d’impact.
- [ ] Optimisations perf (mutualisation uniforms, passes limitées).

---

### Étape 9 — Timeline GSAP (intro + panel)

- [ ] Créer `hero-timeline.ts` avec `createHeroTimeline(scene: HeroScene)`.
- [ ] Phase Intro :
  - [ ] spawn / activation des lettres en stagger,
  - [ ] petit mouvement de scale/position pour faire apparaître.
- [ ] Phase “full canvas” :
  - [ ] laisser la physique remplir l’espace,
  - [ ] tuning gravité/restitution.
- [ ] Phase Panel :
  - [ ] animer l’ouverture du panel DOM (CSS/GSAP),
  - [ ] augmenter la strength du panel (forces),
  - [ ] observer les lettres se tasser autour.
- [ ] Phase Stabilisation :
  - [ ] réduire l’intensité du jelly,
  - [ ] laisser une micro “respiration” si souhaité.

**Done lorsque :**

- [ ] L’animation suit le script : intro → remplissage → ouverture panel → stabilisation.

**Axes d’amélioration :**

- [ ] Idle loop subtil après stabilisation.
- [ ] Hooks pour scrubbing / replay en dev.

---

### Étape 10 — Responsive (MVP) & polish

- [ ] Choisir un design space (ex. 1400×900) comme référence unique.
- [ ] Container hero :
  - [ ] conserver un ratio proche via CSS/Tailwind,
  - [ ] scaler le canvas Pixi uniformément pour remplir ce container.
- [ ] `hero-scene.ts` :
  - [ ] mapper design → stage via un scale global,
  - [ ] gérer le resize proprement (reposition initiale si nécessaire).
- [ ] Panel DOM :
  - [ ] responsive via Tailwind,
  - [ ] `hero-panel.ts` recalcule son rect au resize/scroll.
- [ ] Perf & polish :
  - [ ] tester sur plusieurs tailles d’écran,
  - [ ] ajuster le nombre de lettres / paramètres shader si besoin.

**Done lorsque :**

- [ ] Le hero reste lisible et crédible sur plusieurs tailles d’écran,
- [ ] Pas de glitch majeur sur resize / orientation.

**Axes d’amélioration :**

- [ ] Layouts spécifiques pour mobile/tablet (multi JSON).
- [ ] Qualité dynamique selon device (LOD).

---

## 6. Axes d’amélioration globaux (backlog)

- Debug / tooling (FPS, colliders, forces).
- Performance (profiling shaders, LOD).
- Typo / contenu (plusieurs phrases, variantes).
- Accessibilité (reduced motion, fallback texte).
- Thème / design system (thèmes supplémentaires, transitions douces).
- Dev UX (éditeur layout plus riche : undo/redo, presets).

---

## 7. Rappel des contraintes clés

- Pas de blobs : seules les lettres sont animées.
- Classes bien séparées (`HeroScene`, `HeroLetter`, `HeroPanel`, etc., mais fichiers en kebab-case).
- TypeScript strict, pas de `any`, pas de `!`.
- Dev route React uniquement en dev.
- Astro maître du rendu statique, hero WebGL par-dessus.
- Shaders jelly pour aller au-delà du simple scale/skew.
- Couleurs issues du design system Tailwind v4 (`--color-foreground` / `--color-background` en OKLCH), converties pour Pixi.
- **Convention de nommage** :
  - Composants Astro : `PascalCase.astro`,
  - Tout le reste : kebab-case.
