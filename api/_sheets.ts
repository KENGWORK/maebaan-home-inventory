import type { Hist, HistEvt, Item, Kind, Loc } from "../src/data";

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
