# Astro Starter Kit: Basics

```sh
bun create astro@latest -- --template basics
```

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src/
│   ├── layouts/
│   │   └── Layout.astro
│   └── pages/
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command               | Action                                           |
| :-------------------- | :----------------------------------------------- |
| `bun install`         | Installs dependencies                            |
| `bun dev`             | Starts local dev server at `localhost:4321`      |
| `bun build`           | Build your production site to `./dist/`          |
| `bun preview`         | Preview your build locally, before deploying     |
| `bun astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `bun astro -- --help` | Get help using the Astro CLI                     |

## Format and Lint

This project uses Biome for formatting and linting, but actually biome can only format frontmatter in astro file, so we also need prettier to format the rest of the code.

## 📋 Improvements

### Replace Custom Event Bus with Nanostores

The current implementation uses a custom event bus (`src/lib/states.ts`) which is overcomplicated. Replace with **Nanostores**:

**Install**: `bun add nanostores`

**Benefits**:
- Official Astro recommendation
- SSR-friendly and works on server/client
- Simple reactive state management
- TypeScript support out of the box
- 2KB bundle size

**Migration**:
```ts
// Replace src/lib/states.ts with:
import { atom } from 'nanostores'

export const themeStore = atom<'light' | 'dark'>('light')
export const menuStore = atom(false)
export const paramsStore = atom<Record<string, unknown>>({})

// Usage in components:
import { themeStore } from '../lib/stores'
const currentTheme = themeStore.get()
themeStore.subscribe(theme => {
  document.documentElement.classList.toggle('dark', theme === 'dark')
})
```

### Centralize Theme and Animation Configuration

Currently hardcoded values are scattered throughout the codebase. Create centralized config files:

**`src/config/theme.ts`**:
```ts
export const theme = {
  colors: {
    background: { light: 'oklch(1 0 0)', dark: 'oklch(0.329 0 0)' },
    foreground: { light: 'oklch(0.329 0 0)', dark: 'oklch(1 0 0)' },
  },
  lens: { radius: 250, maskRadius: 125 },
  spacing: { sectionY: 192, sectionX: 128 },
  typography: { heroSize: 200 },
  grid: { taquinSize: 3, taquinTileSize: 100 },
} as const
```

**`src/config/animations.ts`**:
```ts
export const animations = {
  menu: { duration: 1.1, stagger: 0.08, ease: 'power2.inOut' },
  splitHeading: { duration: 1.1, ease: 'power3.out', blurPx: 18, outYPercent: 120, viewThreshold: 0.2 },
  lens: { duration: 0.3, ease: 'power2.out' },
  wave: { amp: 15, decay: 0.1, freq: 0.55, speed: 0.2, fadeDuration: 0.95, idleDelay: 0.9 },
  theme: { transitionDuration: 900 },
} as const
```

**`src/hooks/useAnimations.ts`**:
```ts
import { animations } from '../config/animations'

export const menuAnimations = {
  toggle: { duration: animations.menu.duration, stagger: animations.menu.stagger, ease: animations.menu.ease }
}
```

**Benefits**:
- Single source of truth for all values
- Type-safe configuration
- Easy to tune and maintain
- Consistent across CSS and JS
- Better DX with auto-completion

### Other Improvements

**Code Quality**:
- Extract inline scripts to separate modules (Menu.astro, SplitHeading.astro, etc.)
- Standardize all comments to English
- Enable full TypeScript strict mode
- Add proper error boundaries and null checks
- Fix memory leaks (cleanup GSAP timelines, disconnect observers)
- Remove commented-out production code

**Performance**:
- Add lazy loading for images/assets
- Optimize continuous animations on scroll
- Properly cleanup event listeners

**Testing & Tooling**:
- Add testing setup (Vitest)
- Add lint/typecheck scripts to package.json
- Remove unused dependencies (Matter.js, Wrangler if not needed)

**Accessibility**:
- Improve ARIA support throughout
- Consistent reduced motion handling
- Add proper focus management

## TODO

### Features & Animations
- [ ] Footer animation
- [ ] Hero animation Rive
- [ ] About animation Rive
- [ ] About picture puzzle
- [ ] Store - matter.js animation
- [ ] Mobile view responsiveness
- [ ] Available to work animation
- [ ] i18n complete implementation
- [ ] Menu - Theme - Lang button integration
- [ ] Intro animation (gsap or Rive)
- [ ] Custom cursor
- [ ] Add flash shape when projects cards hover + animated trim path
- [ ] "THE END" in a circle shape - svg illustrator

### Code Quality & Refactoring
- [ ] Replace custom event bus with Nanostores
- [ ] Centralize theme configuration (src/config/theme.ts)
- [ ] Centralize animation configuration (src/config/animations.ts)
- [ ] Extract inline scripts to separate modules (Menu.astro, SplitHeading.astro, etc.)
- [ ] Create animation hooks (src/hooks/useAnimations.ts)
- [ ] Standardize all comments to English (currently mixed French/English)
- [ ] Extract hardcoded values to config (spacing, durations, sizes)
- [ ] Fix memory leaks (cleanup GSAP timelines, disconnect IntersectionObservers)
- [ ] Remove commented-out production code (Layout.astro:21, Layout.astro:29)
- [ ] Review and clean up unused dependencies (Matter.js, Wrangler)

### Type Safety & Tooling
- [ ] Enable full TypeScript strict mode
- [ ] Fix Biome configuration (reenable noUnusedVariables, noUnusedImports for Astro files)
- [ ] Add proper error boundaries and null checks
- [ ] Add testing setup (Vitest)
- [ ] Add lint/typecheck scripts to package.json
- [ ] Add proper type definitions for custom utilities

### Accessibility
- [ ] Improve ARIA support throughout components
- [ ] Consistent reduced motion handling
- [ ] Add proper focus management
- [ ] Test with screen readers

### Performance
- [ ] Add lazy loading for images/assets
- [ ] Optimize continuous animations on scroll
- [ ] Properly cleanup event listeners
- [ ] Audit bundle size and remove unused code
- [ ] Add font preloading strategy

### SEO & Meta
- [ ] Add proper meta tags
- [ ] Add structured data/JSON-LD
- [ ] Add sitemap generation
- [ ] Add robots.txt

### Documentation
- [ ] Update README with proper project structure
- [ ] Document component API and props
- [ ] Add code examples for common patterns
- [ ] Document animation configurations

---

- panel reveal with fingers
- eyes in the hole
- eyes close
- open panel larger
- two leaf open
- two hands with line / or one hand grabbing a white square (or other shape) / or two hands pushing shape
- reveal initial letters
- button enter coming with sparkles from reveal

---

-
