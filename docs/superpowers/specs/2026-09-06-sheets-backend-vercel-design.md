# Maebaan Home Inventory — Google Sheets backend + Vercel deploy

Date: 2026-09-06
Status: approved (brainstorming)

## Goal

Turn the in-memory Maebaan app into a persistent, multi-device household
inventory app: Google Sheets is the database, the app is deployed on Vercel,
and every future `git push` auto-deploys.

Out of scope for v1: real photo files / Google Drive uploads (photos stay as
text labels), any access gate on the URL, concurrency guards beyond
last-write-wins.

## Architecture

```
Phone browser ──HTTPS──> Vercel serverless /api/* ──Sheets API (JWT)──> Google Sheet (3 tabs)
   React app                imports src/logic.ts               service account = Editor
   optimistic state         read → apply reducer → write
```

- The pure reducers in `src/logic.ts` (`applyAdd`, `applyMove`, `applyUse`,
  `autoCode`, `shopRows`, `homeDerived`, …) move to being executed **server
  side**. They are unchanged and remain covered by `src/logic.test.ts`.
- The client keeps optimistic in-memory state for snappy UI, then replaces it
  with the authoritative `{items, locations, history}` returned by each write.

### Request flow (every mutating action)

1. Client `POST /api/mutate` with `{ type, payload, owner }`.
2. Server reads all 3 tabs → `{ items, locations, history }`.
3. Server runs the matching pure reducer from `src/logic.ts`.
4. Server **rewrites** the `items` and `locations` value ranges in full
   (≤ ~20 rows — cheap) and **appends** any new `history` rows.
5. Server returns the fresh `{ items, locations, history }`.
6. Client replaces its state with the response.

Concurrency: last-write-wins. Full-tab rewrite for `items`/`locations`,
append-only `history`. No row-version / etag tracking. Acceptable for a
2-person low-traffic household app.

### Mutation types (`/api/mutate` discriminated union)

| type | payload | reducer |
| --- | --- | --- |
| `add` | `{ addRows: AddRow[] }` | `applyAdd` |
| `move` | `{ moveRows: {itemId,qty,to}[] }` | `applyMove` |
| `use` | `{ useId, useQty }` | `applyUse` |
| `newItem` | `{ name, kind }` | append blank item (qty 0) |
| `delItem` | `{ id }` | drop item row |
| `setItemField` | `{ id, min?, target?, noStock? }` | patch item row |
| `newPlace` | `{ code, name, room }` | append location |
| `renamePlace` | `{ code, name?, room? }` | patch location |
| `setPlaceCode` | `{ code, newCode }` | patch location + cascade `items.loc` |
| `delPlace` | `{ code }` | drop location (guard: no items with qty>0) |
| `buy` / `unbuy` | `{ name }` | toggles a `bought` marker |

`bought` is per-session shopping-list state. v1: keep it **client-only**
(not persisted) — it resets on reload, which matches the current mockup
behaviour. Revisit later if needed.

## API surface

```
GET  /api/state    → { items, locations, history }        (app load)
POST /api/mutate   → { type, payload, owner } → { items, locations, history }
POST /api/init     → idempotent; seed tabs+headers from src/data.ts if empty
```

All under `/api`, same origin on Vercel. Errors → JSON `{ error: string }`
with 4xx/5xx; client shows a red toast and keeps local state.

## Sheet schema

Spreadsheet: **"Maebaan Inventory DB"**, ID in env var `SHEET_ID`.
Row 1 of each tab is the header (exact column keys below).

| tab | columns |
| --- | --- |
| `items` | `id, name, kind, qty, loc, owner, date, exp, min, target, noStock` |
| `locations` | `code, name, room` |
| `history` | `ts, evt, name, qty, from, to, who` |

Types on read: `qty/min/target` → number, `noStock` → `"TRUE"/"" ` boolean,
`exp` → string or empty. `history.ts` is the `NOW_STAMP`-style string the
reducers already produce.

## Auth to Google

- `google-auth-library` `JWT` built from `JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)`
  (`client_email` + `private_key`), scope `https://www.googleapis.com/auth/spreadsheets`.
- Server-only. The key never appears in the client bundle or any committed file.
- The Sheet is shared with the service-account email as **Editor**.

## Repo layout (added)

```
api/state.ts        GET  handler
api/mutate.ts       POST handler
api/init.ts         POST handler
api/_sheets.ts      shared: JWT client, readTabs(), writeItems(), writeLocations(),
                    appendHistory(), row<->object mappers
api/_sheets.test.ts round-trip mapper tests (pure, no network)
api/mutate.test.ts  handler tests with an in-memory fake sheets client
src/api.ts          client: fetchState(), mutate()
vercel.json         { "framework": "vite" }  + node runtime for /api
```

`api/*` uses `@vercel/node` request/response signature.

## Client changes

- `src/api.ts`: `fetchState()`, `mutate(type, payload, owner)` — `fetch` wrappers,
  throw on non-2xx.
- `App.tsx`:
  - On mount `fetchState()`; show a clay spinner inside the phone frame while
    pending. On failure → fall back to `src/data.ts` seed + one-time offline toast.
  - `addSave`/`moveSave`/`useSave` and the sheet actions call `await mutate(...)`
    then `set(returnedState)`. Network error → red toast `เชื่อมต่อไม่ได้ · ลองใหม่`,
    local state untouched.
  - min/target steppers, place-code rename, noStock toggle: debounce ~600ms
    before calling `mutate` (avoid spamming the Sheet while holding a button).
- `src/data.ts` seed retained (used by `/api/init` and offline fallback).
- `src/logic.ts` unchanged.

## Local dev

- `npx vercel dev` — Vite + `/api` on one port. Primary dev command once the
  backend exists.
- `npm run dev` (plain Vite) still works: `fetchState` fails → seed fallback →
  UI browsable offline for pure front-end work.

## Testing

- `src/logic.test.ts` — unchanged, remains the core.
- `api/_sheets.test.ts` — mapper round-trips, header parsing, empty-tab detection.
- `api/mutate.test.ts` — inject a fake in-memory sheets client; assert each
  mutation type writes the right rows and returns the right state, and that
  `history` is appended not overwritten.
- Manual smoke test on the Vercel **preview** URL before promoting to production.

## Setup runbook

### Claude does

1. `git init` in the project folder, `.gitignore` already present, first commit.
2. Implement `api/*`, `src/api.ts`, `App.tsx` wiring, `vercel.json`, tests — all
   green locally (`npm test`, `npm run build`).
3. Create GitHub repo `maebaan-home-inventory` via `gh` CLI, push `master`.
4. Chrome MCP → `sheets.new` → create + name the Sheet `Maebaan Inventory DB`,
   capture the Sheet ID.
5. Chrome MCP → Google Cloud Console: create project → enable Google Sheets API →
   create service account → open the JSON-key creation dialog.
6. Chrome MCP → Sheet → Share → add the service-account email as Editor.
7. Vercel MCP `create_git_project` (repo + teamId) → link + first preview deploy.
8. Chrome MCP → open the Vercel project **Settings → Environment Variables** page.
9. After env vars are set: redeploy, `POST /api/init` once, smoke-test preview,
   then promote to production.

### User does (auth — Claude cannot)

- Click "Agree and continue" on any GCP terms / consent screen.
- Click "Create" on the service-account **key** dialog; let the JSON download.
- Paste the two env values into Vercel and Save:
  - `GOOGLE_SERVICE_ACCOUNT_JSON` = full contents of the downloaded key file
  - `SHEET_ID` = from the Sheet URL
- Approve the Vercel production promotion.
- Choose GitHub repo visibility (public / private) when asked.

## Risks / notes

- Vercel MCP has no env-var tool → env vars are entered by the user in the
  dashboard (Claude only navigates there).
- GCP Console UI changes often; Chrome MCP steps may need small adjustments live.
- `private_key` in `GOOGLE_SERVICE_ACCOUNT_JSON` contains literal `\n` — the JWT
  client must `.replace(/\\n/g, "\n")` or the JSON must be pasted with real
  newlines. Handle both.
- Serverless cold start + 2 Sheets round-trips ≈ 300–800 ms per action; the
  optimistic client hides most of it.
- `/api/init` must be safe to call twice (check header row / row count before
  writing).
