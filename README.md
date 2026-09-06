# แม่บ้าน Maebaan · Home Inventory

Thai-language household inventory mobile app. Implementation of
`design/Home Inventory.dc.html` (Claude Design canvas doc) as a runnable
Vite + React + TypeScript app.

## Run

```bash
npm install
npm run dev      # http://localhost:5273
npm run build    # type-check + production bundle -> dist/
npm test         # vitest (pure domain logic)
```

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
