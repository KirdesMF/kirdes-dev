# Vertical Refactor Plan

Goal: migrate `src/` from horizontal-by-type to vertical-by-domain.

Guiding rule: **code that changes together lives together**.

---

## 0) Session outcomes

By end of session:
- [x] clear vertical map for this repo
- [x] first leaf domain moved fully (move, not copy)
- [x] imports fixed, app builds
- [ ] boundary rule added (or equivalent enforcement)
- [x] next domains queued with owners

---

## 1) Baseline audit (no moves yet)

Current structure has horizontal buckets (`components/`, `lib/`, `utils/`, `types/`, `styles/`).

### Audit tasks
- [x] list all files in `src/`
- [x] group files by behavior/domain (not file type)
- [x] mark cross-cutting infra vs domain logic
- [x] mark true generic primitives (design-system/lib)
- [x] pick first **leaf** domain (few dependencies)

### Initial domain candidates (from current tree)
- **navigation**: `Header`, `Menu`, `LanguagePicker`
- **theme**: `ThemeToggle`, `ThemeScript`
- **typography-effects**: `FillText`, `SplitHeading`, `PatternTitle`, `CutoutTypography`, `wave-text`, `smear-text`
- **visual-effects**: `Lens`, `Vortex`, `sunburst`, `splash-wave`, `stripes`, `lines-repel`
- **graphics-engine**: `pixi-eyes/*`, `grid/*`, `accordia-gallery/*`
- **i18n**: `src/i18n/*`
- **app-shell**: `layouts/Layout.astro`, top-level pages

Note: finalize names after dependency scan.

---

## 2) Target structure (draft)

```txt
src/
  app-shell/
  navigation/
  theme/
  typography-effects/
  visual-effects/
  graphics-engine/
  i18n/
  shared/
  infrastructure/
  design-system/
  pages/
```

Placement rules:
1. Feature/domain-specific code -> owning vertical.
2. Shared business logic across verticals -> `shared/`.
3. Cross-cutting concerns (config, app wiring, error handling, routing adapters) -> `infrastructure/`.
4. Truly generic reusable primitives with zero product logic -> `design-system/`.
5. Keep verticals flat. Add nesting only when large.
6. No barrel `index` files.

---

## 3) Migration strategy (incremental)

### Phase A — first leaf vertical
- [x] create vertical folder
- [x] move related files into vertical
- [x] keep names stable where possible
- [x] update imports immediately
- [x] run build/tests after each small batch

Definition of done for a moved vertical:
- [x] no leftover domain files in old horizontal folders
- [x] imports clean
- [ ] no cross-feature imports
- [x] pages still render

### Phase B — repeat domain by domain
Order:
1. low-dependency visual/domain modules
2. medium shared UI behavior
3. high-dependency app shell and composition

### Phase C — cleanup
- [x] remove empty horizontal folders
- [ ] rename ambiguous folders/files to domain names
- [x] document ownership per vertical

---

## 4) Boundary enforcement

Rule: feature verticals can import only from `shared/`, `infrastructure/`, `design-system/` (not from other feature verticals).

Tasks:
- [ ] choose enforcement tool for current lint stack
- [ ] encode allowed dependency directions
- [ ] fail CI on violations

Note (current project decision): skipped for now (portfolio scope). Enforce by process + review instead.

If two verticals need same code:
- extract to `shared/`
- do **not** add rule exceptions

---

## 5) File placement rubric (quick decisions)

Ask in order:
1. What does this code do?
2. Which domain owns that behavior?
3. Is it business logic used by multiple domains? -> `shared/`
4. Is it cross-cutting infra? -> `infrastructure/`
5. Could it live unchanged in unrelated product? -> `design-system/`

---

## 6) Session checklist template (repeat per vertical)

For `<vertical-name>`:
- [ ] inventory files
- [ ] move files
- [ ] fix imports
- [ ] run `build`
- [ ] run tests/smoke checks
- [ ] remove obsolete files
- [ ] note follow-up extraction to `shared/` if needed

---

## 7) Risks and guardrails

Risks:
- accidental over-sharing into `shared/`
- hidden coupling between visual modules
- large-bang move causing import churn

Guardrails:
- move one vertical at time
- small commits per vertical
- build/test after each move
- boundary lint rule early

---

## 8) First execution slice (today)

- [x] pick one leaf vertical (`theme` or isolated visual effect)
- [x] migrate fully
- [ ] add boundary enforcement baseline
- [x] open follow-up ticket list for remaining verticals

Done when: one complete vertical migration proves pattern, tooling, and dependency direction.

---

## 9) Unused component audit + parking area (for removal review)

Goal: identify components not reachable from pages, move to parking folder, review later for deletion/reuse.

Parking folder (temporary):
- `src/_refactor/unused-components/`

Process:
- [x] run static reachability audit from `src/pages/**/*.astro`
- [x] produce candidate list (unused in pages)
- [x] move candidates to `src/_refactor/unused-components/` (preserve subfolders)
- [x] run build after move
- [ ] if imports break, component is still in use indirectly -> move back + mark as active
- [ ] after review, either delete or re-home into proper vertical

Execution snapshot (done):
- moved `33` Astro components from `src/components/**` to `src/_refactor/unused-components/**`
- preserved original subfolder layout (`grid/`, `icons/`, `smear-text/`, `splash-wave/`, `stripes/`, `text-tissue/`, `wave-text/`)
- build status: `bun run build` ✅ passed

Moved groups:
- root: `CutoutTypography.astro`, `FillText.astro`, `HeadSquashedRive.astro`, `PatternTitle.astro`, `Vortex.astro`
- grid: `grid/GridBox.astro`, `grid/GridContainer.astro`
- icons: all except `icons/CloseIcon.astro`
- effects: `smear-text/SmearText.astro`, `splash-wave/SplashWave.astro`, `stripes/Stripes.astro`, `text-tissue/PortfolioTissue.astro`, `wave-text/WaveText.astro`

Note: list based on static imports. Dynamic/runtime usage may not appear; verify with manual smoke checks.
