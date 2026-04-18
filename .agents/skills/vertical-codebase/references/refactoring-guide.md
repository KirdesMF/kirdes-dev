# Refactoring Guide: Horizontal → Vertical

## Phase 0: Audit (before touching anything)

### 1. Map your files

Run a quick script to list all files grouped by their "subject":

```bash
# List all files and their import counts
find src/ -name "*.ts" -o -name "*.py" -o -name "*.go" | sort

# Who imports who? (example for TS)
grep -r "from '@/utils/billing'" src/ --include="*.ts" -l
```

### 2. Draw a dependency graph

Even a rough hand-drawn sketch is enough. Ask:

- Which files always change together?
- Which files are imported by only one "area"?
- Which files are imported from everywhere?

### 3. Identify natural clusters

Look for naming patterns:

- `billing-*`, `invoice-*`, `stripe-*` → probably one vertical
- `user-*`, `auth-*`, `session-*` → possibly one or two verticals
- `format-*`, `date-*`, `parse-*` → shared utilities

---

## Phase 1: Pick Your First Vertical

Choose the **easiest** domain first:

- Self-contained (few outgoing imports)
- Has a clear owner/team
- Not imported by half the codebase

✅ Good first targets: `billing`, `notifications`, `reports`
❌ Hard first targets: `user`, `auth` (imported everywhere)

---

## Phase 2: Move a Vertical

### Step 1: Create the folder

```bash
mkdir src/billing
```

### Step 2: Move files

```bash
# Move all billing-related files
mv src/utils/billing-utils.ts src/billing/billing-utils.ts
mv src/types/billing.ts src/billing/billing-types.ts
mv src/services/billing-service.ts src/billing/billing-service.ts
mv src/components/InvoiceList.tsx src/billing/InvoiceList.tsx  # if frontend
```

### Step 3: Create the public index

```ts
// src/billing/index.ts
export { BillingService } from "./billing-service";
export type { Invoice, BillingPlan } from "./billing-types";
// Do NOT export internal helpers
```

### Step 4: Fix all imports across the codebase

```bash
# Find all broken imports
grep -r "from.*utils/billing" src/ --include="*.ts"
grep -r "from.*types/billing" src/ --include="*.ts"

# Replace with new path
# (or use your IDE's global find & replace)
```

Update to:

```ts
import { BillingService } from "@/billing";
```

### Step 5: Add a lint rule immediately

Don't move on until you've locked the boundary. Example with `eslint-plugin-boundaries`:

```json
{
  "rules": {
    "boundaries/element-types": [
      "error",
      {
        "default": "disallow",
        "rules": [
          {
            "from": "billing",
            "allow": ["shared", "infrastructure", "design-system"]
          }
        ]
      }
    ]
  }
}
```

### Step 6: Run tests & commit

One vertical at a time. Never combine multiple migrations in one PR.

---

## Phase 3: Handle Shared Code

As you migrate verticals, you'll discover code used by multiple domains.

### Decision matrix:

```
Is it generic (no business logic)?
  YES → move to /design-system or /lib
  NO  → Is it used by 2-3 specific verticals?
          YES → move to /shared, or give it its own vertical
          NO  → keep it in the vertical that "owns" it most
```

### Creating a /shared vertical:

```
src/shared/
  index.ts          ← export only what's needed externally
  pagination.ts
  date-utils.ts
  currency.ts
  use-permissions.ts
```

Rule: `/shared` is still a vertical with a public interface. It's not a dumping ground.

---

## Phase 4: Handle the "God" Files

Every codebase has them — files imported by 50 other files. Strategy:

1. **Don't move them first** — work around them
2. **Identify what they export** — split into smaller, targeted files
3. **Migrate exports one by one** — move each export to its rightful vertical
4. **Update imports incrementally** — use barrel re-exports temporarily if needed
5. **Delete the god file** when empty

```ts
// Temporary barrel re-export (delete once all imports are updated)
// src/utils/index.ts
export { formatCurrency } from "@/shared"; // ← already migrated
export { BillingService } from "@/billing"; // ← already migrated
// ... keep adding as you migrate
```

---

## Phase 5: Monorepo (optional, for larger teams)

When lint rules aren't enough, formalize with packages:

```
packages/
  billing/
    package.json   ← name: "@myapp/billing"
    src/
    index.ts
  auth/
    package.json   ← name: "@myapp/auth"
    src/
    index.ts
  design-system/
    package.json   ← name: "@myapp/design-system"
    src/
    index.ts
```

Each package explicitly declares its dependencies in `package.json`. Circular dependencies become impossible to miss.

Tools: `pnpm workspaces`, `turborepo`, `nx`

---

## Timeline Expectations

| Codebase size  | Migration time                       |
| -------------- | ------------------------------------ |
| < 50 files     | 1-2 days                             |
| 50-200 files   | 1-2 weeks                            |
| 200-1000 files | 1-3 months (incremental)             |
| 1000+ files    | Quarter-long initiative, team effort |

**Never do a big-bang rewrite.** Always migrate incrementally, vertical by vertical.
