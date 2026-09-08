import { JWT } from "google-auth-library";
import type { Hist, HistEvt, Item, Kind, Loc } from "../src/data.js";
import { SEED } from "../src/data.js";
import type { Snapshot } from "../src/mutations.js";

export const ITEM_COLS = ["id","name","kind","qty","loc","owner","date","exp","min","target","noStock","photos"] as const;
export const LOC_COLS = ["code","name","room","photo"] as const;
export const HIST_COLS = ["ts","evt","name","qty","from","to","who","photos"] as const;

const cell = (v: unknown) => (v === undefined || v === null ? "" : String(v));
/** photo id lists live in one cell, comma-separated (Drive ids have no commas). */
const photoCell = (ids: string[] | undefined) => (ids ?? []).join(",");
/** empty -> undefined, to match the "absent key" convention used for exp/noStock */
const parsePhotos = (s: string | undefined): string[] | undefined => {
  const out = (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return out.length ? out : undefined;
};

export function itemsToRows(items: Item[]): string[][] {
  return [
    [...ITEM_COLS],
    ...items.map((i) => [
      cell(i.id), i.name, i.kind, cell(i.qty), i.loc, i.owner, i.date,
      cell(i.exp), cell(i.min), cell(i.target), i.noStock ? "TRUE" : "", photoCell(i.photos),
    ]),
  ];
}

export function rowsToItems(rows: string[][]): Item[] {
  return rows.slice(1).filter((r) => r[0] !== "" && r[0] !== undefined && !Number.isNaN(Number(r[0]))).map((r) => ({
    id: Number(r[0]),
    name: r[1] ?? "",
    kind: (r[2] as Kind) || "supply",
    qty: Number(r[3] ?? 0),
    loc: r[4] ?? "",
    owner: r[5] ?? "",
    date: r[6] ?? "",
    exp: r[7] ? r[7] : undefined,
    min: Number(r[8] ?? 0),
    target: Number(r[9] ?? 1),
    noStock: (r[10] ?? "").toUpperCase() === "TRUE" ? true : undefined,
    photos: parsePhotos(r[11]),
  }));
}

export function locsToRows(locs: Loc[]): string[][] {
  return [[...LOC_COLS], ...locs.map((l) => [l.code, l.name, l.room, l.photo ?? ""])];
}

export function rowsToLocs(rows: string[][]): Loc[] {
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    code: r[0], name: r[1] ?? "", room: r[2] ?? "",
    label: `${r[0]} · ${r[2] ?? ""} – ${r[1] ?? ""}`,
    photo: r[3] || undefined,
  }));
}

export function historyToRows(hist: Hist[]): string[][] {
  return hist.map((h) => [
    h.date, h.evt, h.name, cell(h.qty), cell(h.from), cell(h.to), h.who, photoCell(h.photos),
  ]);
}

export function rowsToHistory(rows: string[][]): Hist[] {
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    date: r[0], evt: r[1] as HistEvt, name: r[2] ?? "", qty: Number(r[3] ?? 0),
    from: r[4] || undefined, to: r[5] || undefined, who: r[6] ?? "",
    photos: parsePhotos(r[7]),
  }));
}

const TABS = ["items", "locations", "history"] as const;

export interface SheetsClient {
  batchGet(ranges: string[]): Promise<Record<string, string[][]>>;
  updateRange(range: string, values: string[][]): Promise<void>;
  clearRange(range: string): Promise<void>;
  append(range: string, values: string[][]): Promise<void>;
  listTabs(): Promise<string[]>;
  addTabs(names: string[]): Promise<void>;
}

/** A JWT for the service account, scoped as asked. Shared by the Sheets + Drive clients. */
export function serviceJwt(scopes: string[]): JWT {
  let key: { client_email: string; private_key: string };
  try {
    key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON as string);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!key.client_email || !key.private_key)
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key");
  return new JWT({ email: key.client_email, key: key.private_key.replace(/\\n/g, "\n"), scopes });
}

export function realClient(): SheetsClient {
  const id = process.env.SHEET_ID as string;
  const jwt = serviceJwt(["https://www.googleapis.com/auth/spreadsheets"]);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const call = async (url: string, init?: RequestInit) => {
    const { token } = await jwt.getAccessToken();
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      // Body may echo the sheet id / service-account address — log it, never return it.
      console.error("Sheets API", res.status, await res.text());
      throw new Error(`Sheets API error ${res.status}`);
    }
    return res.json();
  };
  return {
    async batchGet(ranges) {
      const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
      const j = await call(`${base}/values:batchGet?${qs}&majorDimension=ROWS`);
      const out: Record<string, string[][]> = {};
      (j.valueRanges ?? []).forEach((vr: { range: string; values?: string[][] }, i: number) => {
        out[ranges[i]] = vr.values ?? [];
      });
      return out;
    },
    async updateRange(range, values) {
      await call(`${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        method: "PUT", body: JSON.stringify({ values }),
      });
    },
    async clearRange(range) {
      await call(`${base}/values/${encodeURIComponent(range)}:clear`, { method: "POST", body: "{}" });
    },
    async append(range, values) {
      await call(`${base}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST", body: JSON.stringify({ values }),
      });
    },
    async listTabs() {
      const j = await call(`${base}?fields=sheets.properties.title`);
      return (j.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title);
    },
    async addTabs(names) {
      await call(`${base}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: names.map((title) => ({ addSheet: { properties: { title } } })) }),
      });
    },
  };
}

export async function readState(c: SheetsClient): Promise<Snapshot> {
  const g = await c.batchGet([...TABS]);
  return {
    items: rowsToItems(g.items ?? []),
    locations: rowsToLocs(g.locations ?? []),
    // The sheet stores history chronological-ascending (append at the bottom);
    // the app model is newest-first. Convert at the boundary.
    history: rowsToHistory(g.history ?? []).reverse(),
  };
}

/**
 * Overwrite items/locations with `next` and append `appendHistory` (chronological
 * ascending) to the history tab. Writes the new rows FIRST and only then clears the
 * surplus tail, so a mid-write failure leaves stale-but-complete data rather than a
 * truncated sheet, and readers never see an empty window.
 */
export async function writeSnapshot(
  c: SheetsClient,
  next: Snapshot,
  appendHistory: Hist[],
): Promise<void> {
  const itemRows = itemsToRows(next.items); // header + N rows
  await c.updateRange("items!A1", itemRows);
  await c.clearRange(`items!A${itemRows.length + 1}:L`);
  const locRows = locsToRows(next.locations);
  await c.updateRange("locations!A1", locRows);
  await c.clearRange(`locations!A${locRows.length + 1}:D`);
  if (appendHistory.length) await c.append("history!A1", historyToRows(appendHistory));
}

const HEADERS: Record<string, string[]> = {
  items: [...ITEM_COLS],
  locations: [...LOC_COLS],
  history: [...HIST_COLS],
};

const sameHeader = (row: string[] | undefined, want: string[]) =>
  !!row && want.every((h, i) => row[i] === h);

export async function ensureSeeded(c: SheetsClient): Promise<{ created: boolean }> {
  const existing = await c.listTabs();
  const missing = TABS.filter((t) => !existing.includes(t));
  if (missing.length) await c.addTabs(missing);
  const g = await c.batchGet([...TABS]);
  // Never rewrite a header over a tab that already holds rows: a partially
  // corrupted sheet is a manual-fix situation, not something to auto-clobber.
  // We only warn, and we refuse to seed on top of it.
  let mismatched = false;
  for (const t of TABS) {
    const rows = g[t] ?? [];
    if (rows.length && !sameHeader(rows[0], HEADERS[t])) {
      console.warn(`${t} tab header mismatch — leaving it untouched (manual fix required)`);
      mismatched = true;
    }
  }
  // Seed only when `items` is genuinely empty: no rows at all, or exactly the
  // expected header and no data. One row that is NOT the header is data we do
  // not understand — warn and skip rather than overwrite it.
  const itemRows = g.items ?? [];
  const empty =
    itemRows.length === 0 || (itemRows.length === 1 && sameHeader(itemRows[0], HEADERS.items));
  if (!empty || mismatched) return { created: false };
  await c.updateRange("items!A1", itemsToRows(SEED.items));
  await c.updateRange("locations!A1", locsToRows(SEED.locations));
  // SEED.history is newest-first; the sheet wants chronological ascending.
  await c.updateRange("history!A1", [
    [...HIST_COLS],
    ...historyToRows([...SEED.history].reverse()),
  ]);
  return { created: true };
}
