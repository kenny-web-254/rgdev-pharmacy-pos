# System Audit — RG DEV Pharmacy POS

**Client:** Mshaale Healthcare
**Repository:** `kenny-web-254/rgdev-pharmacy-pos`
**Audited commit:** `dd05bbb` (`main`, 25 Sep 2026)
**Audit date:** 29 September 2026

> **Read this first.** This audit was carried out with access to the source
> repository only. No Mshaale Healthcare database, deployment, or M-Pesa
> credential was reachable. Nothing in this document has been verified against
> the live installation, and no production change has been made. Section 6 lists
> precisely what still has to be checked by someone with that access.

---

## 1. Architecture as actually built

| Layer | Implementation |
|---|---|
| Frontend | React 19 + TypeScript, Vite 6, Tailwind 4 |
| Delivery | PWA (`vite-plugin-pwa`, Workbox), deployed on Vercel |
| Backend | Supabase (PostgreSQL 17), no custom server |
| Local store | `localStorage` via `src/services/storage.ts` |
| Sale commit | `complete_sale` Postgres RPC, `SECURITY DEFINER` |

Data flow is **cloud-authoritative for sales**: the till never writes
`sale_transactions` directly. `App.tsx` → `storage.pushTransactionToCloud()` →
`public.complete_sale` → `private.complete_sale`, which validates and commits
the whole sale in one transaction. `localStorage` holds a cache plus genuinely
local state (cart, POS tabs, filters).

**This design is sound.** The sale function already had row locking (`for
update`), idempotency by sale id, role checks, expiry checks and stock floors
before this audit. The problems below are defects within a reasonable design,
not a case for redesigning it.

---

## 2. Why sales fail — root causes

### 2.1 `private.audit()` is called but defined nowhere — *critical*

`private.complete_sale` ends with:

```sql
perform private.audit('SALE_COMPLETED', 'Sale '||v_existing.receipt_number||' completed', 'SALES', ...);
```

`private.audit(text,text,text,jsonb)` is called by **five** functions and
**created by no migration in this repository**.

If it is missing from the target database, PostgreSQL raises
`undefined_function` on that statement. Because it is the last step of a single
transaction, the whole sale rolls back — after stock, prices, payment and
prescription balances have all validated correctly. **Every sale fails, and
stock is correctly left untouched, which is exactly the reported symptom.**

- **Fixed in:** `supabase/migrations/20260929120000_fix_missing_audit_and_authoritative_pricing.sql`
- **Still to confirm:** whether the function exists in Mshaale's database
  (created by hand, out of band). Query in §6.1. The migration is idempotent
  either way.

### 2.2 The repository does not compile — *critical*

`npm run lint` (`tsc --noEmit`) failed with **19 errors** on `main`. Both the
Vercel build command and the `Production checks` workflow run it, so **`main`
has been red and the live site has been serving a stale artifact.**

The build appeared to work only because `npm run build` first ran twelve Python
scripts that rewrote files under `src/` in place.

Errors included two outright broken features:

| Defect | Effect |
|---|---|
| `handleDispensePrescriptionToCart` deleted in `4f066f9`, two call sites left behind | Loading a prescription into the till called a function that did not exist |
| `BarcodeScannerModal` given `onScanSuccess`/`title` (neither declared) and never given `medications`/`prescriptions` | **Barcode scanning could not work at all** |

The scanner defect was invisible to the compiler because **`@types/react` and
`@types/react-dom` were never declared as dependencies** — TypeScript was not
type-checking any React code. Adding them surfaced it immediately.

- **Fixed in:** commit `7862421`. `npm run lint` now passes.

### 2.3 The build rewrote its own source — *critical*

`npm run build` chained twelve `scripts/production_*.py` files that mutated
`src/` before bundling. Consequences:

- The committed source was **never** the shipped code, so review and `git diff`
  were meaningless.
- **The build could not run on Windows at all.** Two scripts read files without
  specifying an encoding and crash on cp1252; the chain invokes `python3`, which
  does not exist on a standard Windows install.
- `production_verify.py` **still reported success** after those two transforms
  had silently been skipped.
- A failure part-way through left `src/` half-mutated.

- **Fixed in:** commit `7862421`. The chain's output is now committed source;
  the scripts are deleted and replaced by `scripts/verify-production.mjs`, which
  only *verifies* invariants and never edits source. It has been tested against
  a deliberate violation. Running `npm run build` twice now leaves every file
  under `src/` byte-identical.

### 2.4 The client was the sole authority for money — *critical*

`complete_sale` accepted `subtotal`, `discount`, `total` and each line's
`unitPrice`/`totalPrice` from the browser and checked only that they were not
negative.

**A tampered or simply buggy till could record a sale for any amount, including
zero, while stock was deducted correctly.** Stock would reconcile; revenue would
not.

- **Fixed in:** the same migration as §2.1. Unit prices are now verified against
  `public.medications.price` under the row lock already held; a line total
  greater than quantity × unit price is rejected; subtotal, discount and total
  are recomputed server-side and the server's figures are stored. Payment
  sufficiency is checked against the server total.

### 2.5 Till and database rounded differently

Line totals and the subtotal were computed in unrounded floating point and
stored into `NUMERIC(12,2)`. `Math.round(8.165 * 100) / 100` is `8.16`, but
Postgres rounds the JSON text `"8.165"` to `8.17` — so a stored subtotal could
disagree with its own total by a cent, and would now fail the §2.4 checks.

- **Fixed in:** `src/utils/pricing.ts`, which rounds decimal text the way
  Postgres does, and rounds at every step. Covered by tests.

### 2.6 The offline queue destroyed and duplicated work — *critical*

Three defects in `handleSyncOfflineQueue`:

- When Supabase was not configured, it **cleared the offline queue** while
  displaying "Cannot synchronize offline transactions". Completed sales were
  destroyed by the same code path that reported they had not been sent.
- `pushTransactionToCloud` returned a bare boolean, so a transient network
  failure and an outright refusal ("insufficient stock", "price has changed")
  were indistinguishable. A refused sale was retried on every reconnect forever,
  with no indication of which sale or why.
- Offline sales deduct local stock when rung up. A refused sale's deduction was
  never reverted, so cached stock stayed wrong indefinitely.

- **Fixed in:** commit `46bb9a4`. Failures now report permanent vs transient;
  refusals are surfaced per-receipt with the server's reason and authoritative
  stock is re-pulled. Sales sync sequentially rather than via `Promise.all`,
  which was taking row locks on the same medications concurrently.

### 2.7 `strict` mode was disabled — *high*

`tsconfig.json` did not enable `strict`, so **nothing in the codebase was
checked for null or undefined.** This is a large part of why §2.2's defects
survived review and CI.

Enabling it produced nine errors, all genuine. The most serious: the admin
**data-wipe** handler read `currentUser.role` before establishing a user was
signed in, so its authorisation check could throw before it could deny. Also a
validation that could never fire (`unitPrice < 0` on a possibly-undefined value)
and two null dereferences reachable without an active session.

- **Fixed in:** commit `997bee0`.

---

## 3. Other findings (not yet fixed)

| # | Finding | Severity |
|---|---|---|
| 3.1 | **No batch model.** `medications` has a single `batch_number`/`expiry_date` column pair, not a batch table. Multi-batch stock and FEFO are structurally impossible without a schema change. | High |
| 3.2 | **No packaging hierarchy.** `pack_size`/`stock_unit`/`sale_unit` give one flat level. The brief's unlimited nesting is not implemented, and the POS prices every line from `medication.price` regardless — `saleAsPack` exists in the type but is never used in pricing. | High |
| 3.3 | **No partial-payment model.** `sale_transactions` has no amount-paid or balance column, and `complete_sale` rejects any tender below the total. A sale is fully paid or it does not exist. | High |
| 3.5 | **No M-Pesa integration.** `mpesa_reference` is a free-text field a cashier types. There is no STK push, no callback handler, no reconciliation. Nothing verifies the customer actually paid. | High |
| 3.6 | **Money stored as `NUMERIC(12,2)`, not integer minor units** — contrary to the brief. Acceptable in Postgres (`NUMERIC` is exact), but every JS path must round consistently; §2.5 is the first instance of that risk. | Medium |
| 3.7 | **No line-item table.** `sale_transactions.items` is JSONB, so per-line batch allocation cannot be recorded or reported on. | Medium |
| 3.8 | **Discount authority is not enforced.** Any cashier can apply any cart discount up to 100%. The brief requires discounts validated against role permissions. | Medium |
| 3.9 | **No stock-take, reorder-by-package, or goods-receiving override** workflows exist. | Medium |
| 3.10 | **Bundle is a single 1.25 MB chunk** (330 KB gzipped), with no code splitting. Slow first load on a poor connection. | Low |

---

## 4. What was verified to work

- `npm run lint` — passes (was 19 errors).
- `npm test` — 24 tests pass. **The project previously had no tests at all.**
- `strict` mode is now enabled and the tree compiles clean under it.
- `npm run build` — completes; output `dist/`, 1.25 MB JS / 63 KB CSS.
- Build reproducibility — two consecutive builds leave `src/` byte-identical.
- `scripts/verify-production.mjs` — confirmed to fail on a deliberately
  introduced violation, not merely to pass.

---

## 5. What was NOT verified

Stated plainly, because a passing local suite is not evidence about a live
pharmacy:

- **The migration has never been executed.** No PostgreSQL instance carrying
  this schema was reachable. It is reviewed SQL, not tested SQL.
- No production data was read, backed up, or migrated.
- No M-Pesa, printing, or barcode-hardware path was exercised.
- The barcode scanner fix is compile-verified and correctly wired, but has not
  been run against a camera or a physical scanner.
- No load, concurrency, or offline-sync testing was performed against a real
  deployment.
- The only Supabase project reachable from this session was
  `rg-dev-pos-licensing`, which holds licensing tables and **is not** the
  pharmacy database.

---

## 6. Required next steps (need production access)

### 6.1 Confirm the root cause — read-only, run this first

```sql
select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'audit';
```

**No rows returned confirms §2.1 as the cause of the sales failure.**

### 6.2 Before any migration

1. Take a verified backup and **restore it into a separate project** — an
   untested backup is not a backup.
2. Apply `20260929120000_...sql` to that restored copy first.
3. Re-run the §6.1 query and complete one test sale end to end there.
4. Compare `sum(stock)` across `medications` before and after; the migration
   alters no stock and the figures must match exactly.

### 6.3 Rollback

The migration is additive — one nullable column and two `create or replace`
function definitions. To roll back, re-apply the previous definition of
`private.complete_sale` from
`20260921093234_production_hardening_workflow_audit_and_security.sql`. Leave
`audit_logs.metadata` in place; dropping it would discard audit detail.

### 6.4 Then redeploy

`main` has been red, so the live site is stale. Once the migration is verified,
deploy from this branch so the site and the database match.

---

## 7. Honest status

**This system is not production-ready, and it is not close.**

What has been done is necessary groundwork: the repository now compiles and
builds reproducibly, two broken features are repaired, the most likely cause of
the total sales failure is identified and has a fix, and the revenue-integrity
hole is closed. There is a test suite where there was none.

What has **not** been done is most of the commissioned scope. Nested packaging,
FEFO batch allocation, partial payments, stock takes, goods-receiving overrides
and real M-Pesa integration are all absent (§3), and several need schema changes
that must be designed against the live data rather than guessed at.

The single highest-value next action is §6.1. It is one read-only query and it
will confirm or refute the root cause of the sales failure in seconds.
