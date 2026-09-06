import { JWT } from "google-auth-library";
import type { Hist, HistEvt, Item, Kind, Loc } from "../src/data";
import { SEED } from "../src/data";
import type { Snapshot } from "../src/mutations";

export const ITEM_COLS = ["id","name","kind","qty","loc","owner","date","exp","min","target","noStock"] as const;
export const LOC_COLS = ["code","name","room"] as const;
export const HIST_COLS = ["ts","evt","name","qty","from","to","who"] as const;

const cell = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function itemsToRows(items: Item[]): string[][] {
  return [
    [...ITEM_COLS],
    ...items.map((i) => [
      cell(i.id), i.name, i.kind, cell(i.qty), i.loc, i.owner, i.date,
      cell(i.exp), cell(i.min), cell(i.target), i.noStock ? "TRUE" : "",
    ]),
  ];
}

export function rowsToItems(rows: string[][]): Item[] {
  return rows.slice(1).filter((r) => r[0] !== "" && r[0] !== undefined).map((r) => ({
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
  }));
}

export function locsToRows(locs: Loc[]): string[][] {
  return [[...LOC_COLS], ...locs.map((l) => [l.code, l.name, l.room])];
}

export function rowsToLocs(rows: string[][]): Loc[] {
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    code: r[0], name: r[1] ?? "", room: r[2] ?? "",
    label: `${r[0]} · ${r[2] ?? ""} – ${r[1] ?? ""}`,
  }));
}

export function historyToRows(hist: Hist[]): string[][] {
  return hist.map((h) => [h.date, h.evt, h.name, cell(h.qty), cell(h.from), cell(h.to), h.who]);
}

export function rowsToHistory(rows: string[][]): Hist[] {
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    date: r[0], evt: r[1] as HistEvt, name: r[2] ?? "", qty: Number(r[3] ?? 0),
    from: r[4] || undefined, to: r[5] || undefined, who: r[6] ?? "",
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

export function realClient(): SheetsClient {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON as string);
  const id = process.env.SHEET_ID as string;
  const jwt = new JWT({
    email: key.client_email,
    key: (key.private_key as string).replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const call = async (url: string, init?: RequestInit) => {
    const { token } = await jwt.getAccessToken();
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Sheets ${res.status}: ${await res.text()}`);
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
    history: rowsToHistory(g.history ?? []),
  };
}

const histKey = (h: { date: string; evt: string; name: string }) => `${h.date}|${h.evt}|${h.name}`;

export async function writeSnapshot(c: SheetsClient, prev: Snapshot, next: Snapshot): Promise<void> {
  await c.clearRange("items!A2:K");
  await c.updateRange("items!A1", itemsToRows(next.items));
  await c.clearRange("locations!A2:C");
  await c.updateRange("locations!A1", locsToRows(next.locations));
  const known = new Set(prev.history.map(histKey));
  const fresh = next.history.filter((h) => !known.has(histKey(h)));
  if (fresh.length) await c.append("history!A1", historyToRows(fresh));
}

export async function ensureSeeded(c: SheetsClient): Promise<{ created: boolean }> {
  const existing = await c.listTabs();
  const missing = TABS.filter((t) => !existing.includes(t));
  if (missing.length) await c.addTabs(missing);
  const g = await c.batchGet([...TABS]);
  const empty = (g.items ?? []).length === 0;
  if (!empty) return { created: false };
  await c.updateRange("items!A1", itemsToRows(SEED.items));
  await c.updateRange("locations!A1", locsToRows(SEED.locations));
  await c.updateRange("history!A1", [[...HIST_COLS], ...historyToRows(SEED.history)]);
  return { created: true };
}
