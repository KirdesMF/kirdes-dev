# DESIGN

Design & interaction spec for the portfolio of Cédric Gourville.

Ce document décrit les principes visuels, interactifs, la structure globale des pages (présent et futur) et les contraintes multi-langue / thème.

---

## 1. Design principles

### 1.1 Visual language (core)

- **Elasticity / springs**
  - Lignes qui se déforment, bandes qu’on tire et relâche.
  - Oscillations amorties (sinus + damping), jamais de motion “brutale”.
- **Typography as main actor**
  - Titres forts, souvent en caps.
  - Variations : stack répété, extrusion visuelle, warp léger.
- **Structure / grid**
  - Grille 8 colonnes (desktop), max-width centrale.
  - Fenêtres dans cette grille qui révèlent des canvases (Pixi / Rive).
- **Debug / construction**
  - Grilles, outlines, hatch, dashed lines visibles via une “lens” (mode XRAY).
  - ASCII utilisé comme accent “système”, pas comme style global.

### 1.2 Interaction language

- **Desktop**
  - Mouse move → parallax léger, tilt de titres / stacks / bandes.
  - Hover → micro-elasticité sur les éléments interactifs (cartes, techs, ASCII).
  - Drag sur certaines bandes / cordes → réponse spring.
  - Lens (XRAY) autour de la souris sur certains canvases (home/sections principales).

- **Mobile**
  - Tilt (device orientation) comme entrée principale “fun” :
    - Modifie la gravité / courbure de certaines animations (titres, avatar, lignes de décor).
  - Pas de lens.
  - Interactions réduites : tap pour déclencher des animations clés (fist bump, etc.).

### 1.3 Tone

- Technique mais ludique.
- Mélange “signal / terminal / grid” et typographie expressive.
- Lisibilité prioritaire : les titres doivent rester compréhensibles même déformés.

### 1.4 Internationalisation (FR / EN)

- Site **bi-langue** : Français et Anglais.
- Routing prévu avec préfixe de langue (ex: `/fr/...`, `/en/...`) ou équivalent, mais la nav doit rester compacte.
- Contenus texte (titres, descriptions, labels UI, CTA) traduits dans les deux langues.
- Le choix de langue influe sur :
  - les titres typographiques (stack, tissu),
  - la bannière ASCII (“AVAILABLE TO WORK” / “DISPONIBLE POUR TRAVAILLER” ou wording final),
  - le graph GitHub (légende, caption),
  - les textes ABOUT / CONTACT / Blog / Snippets / Gallery.

> Règle : une fois la langue choisie, toute la page / section doit être cohérente (pas de mélange systématique FR/EN en UI).

### 1.5 Tissu texte multi-langue (hero)

- Un canvas “tissu texte” peut être visible dans la hero, dans une fenêtre dédiée.
- Ce tissu affiche des versions de “bienvenue” / “welcome” dans plusieurs langues :
  - “Bienvenue”, “Welcome”, “Willkommen”, “Bienvenido”, etc.
- La **langue active du site** peut être mise en avant dans ce tissu :
  - plus de répétitions,
  - intensité différente,
  - ou légère mise en valeur.
- Les autres langues restent visibles comme texture typographique, pour renforcer le côté international sans casser la cohérence de la langue choisie pour l’UI.

---

## 2. Tech stack

### 2.1 Framework & rendering

- **Astro**
  - Layout statique, sections et pages.
  - Intégration de composants client (Pixi, Rive) via îlots.
  - Gestion multi-langue au niveau des routes / data (FR / EN).

- **Pixi.js**
  - Canvas WebGL principal :
    - Titres élastiques (stack + profondeur).
    - Tissu de texte (bienvenue multi-langue / mots-clés).
    - Scènes décoratives (lignes, ressorts).
  - Ciblage WebGL en priorité; WebGPU comme amélioration future possible.

- **Rive**
  - Animations illustratives :
    - Avatar avec lunettes (ABOUT).
    - Potentielles micro-animations dans des fenêtres (optionnel).

- **DOM + TypeScript**
  - ASCII banner “AVAILABLE TO WORK” / équivalent FR.
  - Graph GitHub ASCII.
  - Compteur d’années `©`.
  - Contrôles / sliders de réglages (panel utilisateur).
  - Gestion device orientation (mobile).
  - Switch de thème (dark/light).
  - Switch de langue (FR / EN).

- **Tailwind v4**
  - Grille, spacing, typographie.
  - Couleurs basées sur le thème CSS.

### 2.2 Theming (dark / light)

- Couleurs principales via variables CSS :
  - `--color-foreground`
  - `--color-background`
  - Couleurs définies en **OKLCH**.
- Besoin d’une **conversion OKLCH → RGB/hex** côté JS pour Pixi.
- Toggle **dark/light** :
  - Modifie un attribut global (`data-theme` sur `html`/`body`).
  - Met à jour les custom properties.
  - Force les scènes Pixi à rafraîchir les couleurs (foreground/background).

---

## 3. Navigation & global controls

### 3.1 Top navigation (desktop)

- Header fixé en haut, hauteur réduite, superposé à la hero puis fond plein après scroll.
- À gauche : _signature / logo_ (ex: `CEDRIC` ou monogramme).
- Au centre / gauche : liens principaux :
  - `WORKS`
  - `ABOUT`
  - `CONTACT`
  - `BLOG`
  - `SNIPPETS`
  - `GALLERY`
- Les sections de la home (`WORKS`, `ABOUT`, `CONTACT`) scrollent vers les ancres.
- Les pages (`BLOG`, `SNIPPETS`, `GALLERY`) ouvrent des routes dédiées.

- À droite : cluster de contrôles “système” :
  - **Language switch** : `FR / EN` (toggle simple, lisible).
  - **Theme switch** : dark/light (icône ou label textuel).
  - (Éventuellement, accès au panel de réglages si tu décides de le rendre global).

Micro-interaction : les toggles peuvent avoir une micro animation spring à l’activation, mais restent très lisibles.

### 3.2 Navigation mobile

- Header compact :
  - À gauche : logo / signature.
  - À droite : groupe minimal :
    - bouton burger,
    - éventuellement theme switch (ou à l’intérieur du menu),
    - switch de langue (`FR / EN`) peut être dans le menu pour économiser la place.

- Menu plein écran / overlay auquel on accède via burger :
  - liens listés verticalement (`WORKS`, `ABOUT`, `CONTACT`, `BLOG`, `SNIPPETS`, `GALLERY`),
  - `FR / EN` + theme switch dans une zone “système” en bas ou en haut du menu.
  - Animations légères (lignes / pseudo-élastiques), mais le menu reste très lisible.

### 3.3 Langue & thème – comportement

- **Langue** :
  - Composant de switch simple : `FR | EN` (langue active en surbrillance).
  - Change la locale globale (routing + contenu).
  - Doit être persisté (localStorage ou équivalent).

- **Thème** :
  - Switch iconique (soleil / lune) ou textuel (`LIGHT / DARK`).
  - Modifie les variables CSS + rafraîchit les scènes Pixi et les accents ASCII (si besoin).
  - Doit également être persisté.

---

## 4. Layout & grid

- **Grille desktop** : 8 colonnes, max-width centrée.
- **Sections** : chaque section est un “band” vertical dans cette grille.
- **Fenêtres** :
  - Zones rectangulaires qui contiennent :
    - un canvas Pixi (titre / tissu / lignes),
    - une animation Rive,
    - ou un bloc ASCII.
  - Les fenêtres peuvent laisser passer un fond animé (tissu texte) ou une texture de lignes.

---

## 5. Global systems

### 5.1 Elastic model & control panel

- Un spring model cohérent partout :
  - Paramètres : `tension`, `damping`, `range`, `frequency`.
  - Utilisé pour :
    - bandes élastiques,
    - stack de texte,
    - cordes / poings,
    - hover de cartes (micro-spring),
    - grille de techs (voisinage qui bouge),
    - lignes décoratives (repel / snap),
    - **sin waves du tissu texte** (amplitude / fréquence / vitesse),
    - **lignes élastiques** (titres, décor).

- Un **panel de réglages accessible aux utilisateurs** permet de tweaker ces paramètres de manière encadrée :
  - sliders / inputs pour les valeurs clés (amplitude, fréquence, damping, etc.),
  - **petit visuel de preview** intégré au panel :
    - une mini ligne élastique et/ou un mini bout de tissu texte,
    - qui réagit en live aux sliders (pour voir l’effet sans quitter le panel),
  - **pré-réglages nommés** applicables d’un clic, par exemple :
    - `Calm` (amplitude faible, fréquence basse, damping fort),
    - `Tendu` (amplitude modérée, fréquence haute, peu de damping),
    - `Mou` (amplitude moyenne, basse fréquence, damping moyen),
    - d’autres presets possibles pour les besoins (ex: “Bouncy”, “Stiff”).

- Possibilité d’avoir un **mode avancé** (par ex. via un flag dev ou un raccourci) exposant plus de paramètres pour toi, mais la version par défaut doit rester utilisable et compréhensible pour les visiteurs.

Les presets doivent s’appliquer à la fois :
- aux **waves du tissu texte**,
- aux **lignes élastiques** (bandes de titres, cordes, décor),
pour garder une signature de mouvement cohérente sur tout le site.

### 5.2 Lens (XRAY)

- **Desktop uniquement** (pas mobile).
- Forme : cercle ou léger ovale autour de la souris.
- Implémentation type :
  - Deux layers par scène :
    - `normalLayer` (rendu habituel),
    - `debugLayer` (wireframe, outlines, grid, charset alternatif).
  - Mask circulaire appliqué sur `debugLayer`.

Comportement selon scène :
- Tissu texte :
  - Outlines, mesh, hatching, grid.
- Titres élastiques :
  - Version wireframe / outlines de la pile, bande explicitement dessinée.
- Graph GitHub ASCII :
  - charset alternatif dans la zone (ex: `. + * #` → `x X`).

Lens avec breathing léger (scale in/out discret).

### 5.3 ASCII usage (strict)

ASCII est **limité** à :

1. **Banner “AVAILABLE TO WORK”** sous la hero.
   - Texte défilant en monospace :
     - `>> AVAILABLE TO WORK · AVAILABLE TO WORK · ...`
     - ou équivalent FR selon la langue active (ex: `>> DISPONIBLE POUR TRAVAILLER` si wording conservé).
   - Dans un coin de cette bande (ex : à droite), petit bloc info :
     - `lat: <fixed>`, `lon: <fixed>`
     - `cedric: <local time>`
     - `you: <visitor time>`.
2. **Flèches de projets**
   - CTA ASCII unique sur les cartes (ex: `-->` ou similaire).
   - Toujours la même flèche, même monospace.
3. **Graph GitHub ASCII** (ABOUT).
4. **Compteur d’années ASCII** dans le footer (`©`).
   - Colonne d’années de la naissance → année actuelle, type “slot machine”.

Hors de ces usages : ASCII au mieux en micro-labels très discrets (monospace, petits textes).

---

## 6. HOME

Home = page la plus stylisée : hero, works, about, contact (sections verticales).

### 6.1 HERO

#### 6.1.1 Titre principal (Pixi)

- Titre typographique animé :
  - **Bande élastique** avec le texte principal.
  - **Stack de couches** :
    - copies de ce texte derrière, légèrement scale/décalées en profondeur,
    - suivent le mouvement de la bande avec un léger lag temporel + amplitude réduite.
- Animation :
  - Elastic spring sur la bande (drag desktop, tilt mobile éventuel).
  - Les couches derrière réagissent avec retard (effet volume / inertie).

#### 6.1.2 Banner ASCII “AVAILABLE TO WORK”

- Bande full width sous la hero, monospace, fond plein.
- Texte défilant ou step :
  - `>> AVAILABLE TO WORK · AVAILABLE TO WORK · ...`
  - ou équivalent FR selon la langue active.
- Dans un coin (droite) :
  - `lat <fixed>, lon <fixed> | cedric <HH:MM> | you <HH:MM>`.

#### 6.1.3 Fenêtre(s) & tissu texte

- 0 à 1 fenêtre d’animation forte max dans la hero.
- Si le tissu texte est utilisé dans la hero :
  - il peut afficher des mots de bienvenue multi-langues,
  - la langue active (FR / EN) peut être légèrement mise en avant.
- Éviter d’empiler plusieurs systèmes (store, pills, etc.) dans la même hero pour garder la lisibilité.

### 6.2 WORKS (projets)

#### 6.2.1 Layout

- Grille 8 colonnes, cartes projets décalées verticalement.
- Chaque carte :
  - titre,
  - description courte,
  - stack technos,
  - flèche ASCII (CTA).

#### 6.2.2 Interactions

- Hover carte :
  - micro-élévation (shadow, translateY),
  - éventuellement overlay avec une **ligne élastique** (sin wave) qui descend/monte.
- Flèches ASCII :
  - motif constant (une seule forme globale).

#### 6.2.3 Tissu / décor

- Possibles **fenêtres** laissant voir le tissu texte derrière les cartes.
- Tissu = fond animé subtil (warp léger), pas sujet principal.
- Lens XRAY active sur les canvases concernés (outlines + mesh + grid).

### 6.3 ABOUT (sur la home)

#### 6.3.1 Fenêtre avatar (Rive)

- Perso stylisé (haut du corps, lunettes).
- Desktop :
  - suit la souris (légère rotation / eyes follow).
- Mobile :
  - réagit à l’inclinaison (tilt) pour l’orientation.

#### 6.3.2 Grille de technos

- Grid de symboles / noms de technos.
- Hover (desktop) / tap (mobile) :
  - case cible translate x/y + fake shadow (divs décalées),
  - voisins bougent subtilement (effet ressort de voisinage).

#### 6.3.3 Graph GitHub ASCII

- Placé dans ABOUT, proche de la grille tech (même “ligne” conceptuelle).
- Grille 7 x N (jours x semaines).
- Caractères par intensité (ex: `' '`, `.`, `+`, `*`, `#`).

- Lens XRAY :
  - dans la zone de la lens, mapping de charset différent (ex: `x`, `X`).

#### 6.3.4 Éléments optionnels (v2)

- Taquin avec photo :
  - difficulté simple,
  - compteur de coups.
- Texte de description avec quelques mots clés en gras qui changent un panneau latéral (ou mini pop-in), lié à de petites animations.

#### 6.3.5 Fenêtre tissu

- Une petite fenêtre (max) dans ABOUT montrant le tissu texte.
- Décor seulement.

### 6.4 CONTACT (sur la home)

#### 6.4.1 Overlay SVG d’ouverture

- À l’entrée dans la section :
  - overlay plein dans la section, deux panneaux (gauche/droite),
  - séparation centrale = **sin wave**.
- Animation :
  - panneaux glissent en s’ouvrant,
  - sin wave avec léger overshoot élastique.
- Une fois l’ouverture terminée, overlay retiré (ou transparent).

#### 6.4.2 Scène fist bump

- Deux “cordes” / rubans venant des bords, avec un poing stylisé à chaque extrémité.
- Animation initiale :
  - poings avancent → **fist bump** au centre,
  - impact génère une **sin wave dégressive** le long de la corde.
- Interaction :
  - Desktop :
    - drag sur certains points de la corde → réponse spring.
  - Mobile :
    - tap pour rejouer l’animation,
    - tilt peut influer légèrement sur la direction/la gravité.

#### 6.4.3 Liens de contact

- Section simple “LET’S TALK” :
  - mail,
  - GitHub,
  - LinkedIn,
  - autres réseaux.
- UI très sobre (typo, survol minimal).

#### 6.4.4 Footer ASCII – compteur d’années

- Ligne finale :

  ```text
  © 2025 CEDRIC GOURVILLE
  ```

- Derière / près du `2025` :
  - une **colonne ASCII** listant les années de naissance → année actuelle.
  - À l’entrée de la section :
    - animation “slot machine” qui scroll de la première année à la dernière.
    - stabilisation sur l’année actuelle, micro spring.

- Hover (desktop) :
  - micro effet local (oscillation courte), sans relancer tout le défilement.

---

## 7. Future pages

Ces pages réutilisent la **grille et la typographie**, mais **sans lens** et avec un style moins chargé que la home.

### 7.1 Blog

- Articles longs / breakdowns de projets / notes techniques.
- Layout :
  - grille 8 colonnes, cartes d’articles (titre, tags, date).
- Header de page :
  - **titre en stack répétée** (comme l’extrusion), qui réagit légèrement à la souris (version calme).
- Décor minimal (éventuelles lignes élastiques low-contrast).

### 7.2 Snippets

- Snippets de CSS / animation / design / UI.
- Layout :
  - grille 8 colonnes,
  - cartes avec code + preview.
- Titre de page :
  - stack répété + mouvement souris (comme Blog, légèrement différent).
- Interactions :
  - micro hover (ombre, léger move),
  - bouton “Copy” avec micro-spring.

### 7.3 Gallery

- Galerie d’**animations complexes / jeux / expérimentations**.
- Layout :
  - cartes plus grandes avec visuels, lien vers des démos.
- Titre :
  - stack répété, mouvement de souris (comme Blog / Snippets).
- Les gros effets sont dans les **démos elles-mêmes**, pas dans le cadre de page.

---

## 8. Scope lens & perf

- Lens activée uniquement sur :
  - canvases de la home (titres Pixi, tissu, certaines scènes),
  - graph GitHub ASCII (optionnel mais cohérent).
- Pas de lens sur :
  - Blog, Snippets, Gallery.
- Sur mobile : pas de lens, tilt remplace le rôle “fun”.

Limiter :
- le nombre de canvases actifs simultanément,
- la complexité des shaders,
- les subdivisions de mesh (pour conserver de bonnes perfs).

---

## 9. Roadmap (haute-niveau)

1. **Infrastructure**
   - Astro: layout de base, sections sur la home, structure FR / EN.
   - Tailwind v4 + thème OKLCH (+ conversion pour Pixi).
2. **Hero minimal**
   - Canvas Pixi simple.
   - Banner ASCII “AVAILABLE TO WORK” + lat/lon + heures.
3. **Titre stack élastique (hero)**
   - Implémentation bande + couches + spring.
   - Panel de réglages utilisateur, avec mini preview + presets.
4. **WORKS**
   - Grid de cartes + flèches ASCII + hover spring simple.
5. **ABOUT**
   - Avatar Rive simple.
   - Grille de techs + hover.
   - Graph GitHub ASCII.
6. **CONTACT**
   - Overlay sin wave + ouverture.
   - Fist bump + corde spring.
   - Liens de contact + compteur d’années ASCII.
7. **Lens XRAY**
   - Implémentation globale sur 1–2 scènes clés.
8. **Pages futures**
   - Blog / Snippets / Gallery avec titres stack + layouts sobres.
