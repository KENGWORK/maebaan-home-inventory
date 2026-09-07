# แม่บ้าน Maebaan · Home Inventory

Thai-language household inventory mobile app. Implementation of
`design/Home Inventory.dc.html` (Claude Design canvas doc) as a
Vite + React + TypeScript app, backed by a Google Sheet via Vercel
serverless functions.

**Live:** https://maebaan-home-inventory.vercel.app

## Run

```bash
npm install
npx vercel dev   # http://localhost:5273 — app + /api together (needs env, below)
npm run dev      # plain Vite — /api unavailable, app runs on seed data (ตัวอย่าง pill)
npm run build    # type-check + production bundle -> dist/
npm test         # vitest — 59 tests (domain logic, mappers, mutate handler)
```

## Backend

- `api/state.ts` `GET`  → `{ items, locations, history }` from the Sheet
- `api/mutate.ts` `POST` → `{ type, owner, ...payload }` → applies `applyMutation`, writes the Sheet, returns the fresh snapshot
- `api/init.ts` `POST`  → idempotent: creates the 3 tabs + headers + seed from `src/data.ts` if empty
- Auth: `google-auth-library` JWT from env `GOOGLE_SERVICE_ACCOUNT_JSON`; sheet id from env `SHEET_ID`. Server-only.
- The Sheet must be shared with the service-account email as **Editor**.
- Concurrency: last-write-wins; `items`/`locations` tabs rewritten in full per mutation, `history` append-only (newest-first on read, Asia/Bangkok timestamps).
- The client writes to `/api` only after a successful `GET /api/state` (`hydrated`); a boot-time failure = local-only demo session on seed data.

### Vercel env vars

| var | value |
| --- | --- |
| `SHEET_ID` | the id from the Sheet URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | full contents of the service-account JSON key |

After the first deploy, `POST /api/init` once to seed the Sheet.

## Design & build docs

`docs/superpowers/specs/2026-09-06-sheets-backend-vercel-design.md` (spec),
`docs/superpowers/plans/2026-09-06-sheets-backend-vercel.md` (implementation plan).

## What it does

A clay / neumorphic single-screen phone UI with a bottom nav and 10 screens:

| Screen | Purpose |
| --- | --- |
| หน้าแรก (home) | ready-% headline, stat tiles, pending count, quick actions, alert cards, LINE daily summary |
| รายการรอบันทึก (pending) | photos waiting to be filed (from app / LINE Official) → ADD / MOVE / USE |
| กล้อง (cam) | capture step 1 of every record; choose event type; send now or to pending |
| เก็บของ (add) | ADD — multi-row; name, kind, EXP (days or date) for food, qty, location search |
| ย้ายของ (move) | MOVE — pick an existing item, qty, destination location |
| ใช้ของ (use) | USE — search stock, decrement, low/out warnings |
| ของในบ้าน (inv) | browse by location or item, live qty / EXP badges |
| ประวัติ (hist) | read-only audit trail, filter by item / date range / location |
| รายการซื้อ (shop) | auto shopping list: out / low / bought, aggregated by name |
| ตั้งค่า (set) | clay tone (lilac / peach / mint), storage places CRUD, per-item min/target, notifications |

State is in-memory and seeded from the design doc (`src/data.ts`); "today" is
pinned to 2026-09-06 so the demo alerts stay stable.

## Layout

```
design/Home Inventory.dc.html   source design doc (canvas templating)
design/home-inventory-mockup.jsx earlier rough React mockup (reference only)
src/data.ts       seed data (locations, items, pending, history, tones)
src/logic.ts      pure domain logic: days(), autoCode(), shopRows(), applyAdd/Move/Use()
src/logic.test.ts unit tests for the above
src/css.ts        CSS-string -> React style-object parser (lets design styles paste verbatim)
src/ui.ts         style-string factories (chip, codeBadge, pill, shot, ...)
src/icons.tsx     inline SVGs from the design
src/IOSFrame.tsx  440x956 iPhone shell, scales to fit (replaces the doc's ios-frame.jsx import)
src/App.tsx       state machine + view-model builder + screen components
```

`support.js` / `ios-frame.jsx` from the original design are the Claude Design
runtime and are not needed here — the templating (`sc-if` / `sc-for` / `{{ }}`)
was ported to JSX and the device frame reimplemented in `IOSFrame.tsx`.
