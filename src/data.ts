// Seed data ported verbatim from design/Home Inventory.dc.html (<script type="text/x-dc">).

/** The design's pinned "today" — used ONLY by the unit tests so their EXP maths
 *  stay deterministic. The running app tracks the real date via todayDate()/todayISO(). */
export const TODAY = new Date("2026-09-06T09:00:00");

export type Kind = "supply" | "food";
export type Owner = "เก่ง" | "omo";
export type HistEvt = "ADD" | "MOVE" | "USE" | "ADJUST";

export interface Loc {
  code: string;
  name: string;
  room: string;
  label: string;
}

export interface Item {
  id: number;
  name: string;
  kind: Kind;
  qty: number;
  loc: string;
  owner: string;
  date: string;
  min: number;
  target: number;
  exp?: string | null;
  /** durable goods that are not stock-counted */
  noStock?: boolean;
  /** Google Drive file ids of attached photos */
  photos?: string[];
}

export interface Pending {
  id: string;
  name: string;
  src: string;
  shots: string[];
  evt: "ADD" | "MOVE" | "USE";
  ready: boolean;
  miss: string;
}

export interface Hist {
  evt: HistEvt;
  name: string;
  qty: number;
  to?: string;
  from?: string;
  who: string;
  date: string;
  /** Google Drive file ids of photos taken for this action */
  photos?: string[];
}

export interface Tone {
  f: string;
  label: string;
  sw: string;
}

const RAW_LOCS: [string, string, string][] = [
  ["GAR-01", "ตู้เก็บของ", "โรงรถ"],
  ["GAR-02", "ชั้นวาง", "โรงรถ"],
  ["MAS-01", "ตู้เสื้อผ้า", "ห้องนอนใหญ่"],
  ["MAS-02", "โต๊ะข้างเตียง", "ห้องนอนใหญ่"],
  ["SML-01", "ตู้เก็บของ", "ห้องนอนเล็ก"],
  ["LIV-01", "ตู้ทีวี", "ห้องนั่งเล่น"],
  ["KIT-01", "ตู้ใต้ซิงค์", "ห้องครัว"],
  ["KIT-02", "ตู้แขวน", "ห้องครัว"],
  ["KIT-03", "ตู้กับข้าว", "ห้องครัว"],
  ["BAT-01", "ตู้เก็บของ", "ห้องน้ำ"],
];

export const LOCS: Loc[] = RAW_LOCS.map((l) => ({
  code: l[0],
  name: l[1],
  room: l[2],
  label: `${l[0]} · ${l[2]} – ${l[1]}`,
}));

export const ITEMS: Item[] = [
  { id: 1, name: "หูฟัง nubwo", kind: "supply", qty: 1, loc: "LIV-01", owner: "เก่ง", date: "2026-08-21", min: 1, target: 1, noStock: true },
  { id: 2, name: "สบู่", kind: "supply", qty: 2, loc: "BAT-01", owner: "omo", date: "2026-09-01", min: 3, target: 6 },
  { id: 3, name: "ทิชชู่", kind: "supply", qty: 1, loc: "BAT-01", owner: "omo", date: "2026-08-30", min: 2, target: 6 },
  { id: 4, name: "สาย usb type-c", kind: "supply", qty: 3, loc: "MAS-02", owner: "เก่ง", date: "2026-08-12", min: 1, target: 3, noStock: true },
  { id: 5, name: "ยาลดไข้", kind: "food", qty: 8, loc: "MAS-02", owner: "omo", date: "2026-07-19", exp: "2026-09-09", min: 4, target: 10 },
  { id: 6, name: "ยาแก้ท้องเสีย", kind: "food", qty: 0, loc: "MAS-02", owner: "omo", date: "2026-09-04", exp: "2027-01-10", min: 2, target: 6 },
  { id: 7, name: "powerbank", kind: "supply", qty: 2, loc: "GAR-01", owner: "เก่ง", date: "2026-06-30", min: 1, target: 2, noStock: true },
  { id: 8, name: "passport", kind: "supply", qty: 2, loc: "MAS-01", owner: "เก่ง", date: "2026-05-02", min: 2, target: 2, noStock: true },
  { id: 9, name: "กระเป๋าตัง", kind: "supply", qty: 1, loc: "MAS-01", owner: "omo", date: "2026-09-05", min: 1, target: 1, noStock: true },
  { id: 10, name: "น้ำปลา", kind: "food", qty: 1, loc: "KIT-03", owner: "เก่ง", date: "2026-08-28", exp: "2026-09-07", min: 1, target: 2 },
  { id: 11, name: "น้ำยาซักผ้า", kind: "supply", qty: 1, loc: "BAT-01", owner: "omo", date: "2026-08-19", min: 1, target: 2 },
];

export const PENDING: Pending[] = [
  { id: "p1", name: "น้ำปลา", src: "LINE OFFICIAL", shots: [], evt: "ADD", ready: false, miss: "ยังไม่ได้ระบุจำนวน / สถานที่" },
  { id: "p2", name: "สบู่", src: "IN-APP", shots: [], evt: "ADD", ready: false, miss: "ยังไม่ได้ระบุจำนวน" },
  { id: "p3", name: "น้ำยาซักผ้า", src: "IN-APP", shots: [], evt: "MOVE", ready: true, miss: "ข้อมูลพร้อมบันทึก" },
];

export const HIST: Hist[] = [
  { evt: "USE", name: "ทิชชู่", qty: 1, to: "BAT-01", who: "omo", date: "2026-09-05 20:14" },
  { evt: "ADD", name: "กระเป๋าตัง", qty: 1, to: "MAS-01", who: "omo", date: "2026-09-05 18:02" },
  { evt: "ADJUST", name: "ยาแก้ท้องเสีย", qty: 0, to: "MAS-02", who: "omo", date: "2026-09-04 09:30" },
  { evt: "MOVE", name: "powerbank", qty: 1, from: "LIV-01", to: "GAR-01", who: "เก่ง", date: "2026-09-02 11:47" },
  { evt: "ADD", name: "สบู่", qty: 2, to: "BAT-01", who: "omo", date: "2026-09-01 19:20" },
  { evt: "USE", name: "น้ำปลา", qty: 1, to: "KIT-03", who: "เก่ง", date: "2026-08-30 17:05" },
];

export const TONE: Record<string, Tone> = {
  lilac: { f: "none", label: "ลาเวนเดอร์", sw: "linear-gradient(145deg,#8B7BE8,#5B49C9)" },
  peach: { f: "hue-rotate(-42deg) saturate(1.05)", label: "พีชอบอุ่น", sw: "linear-gradient(145deg,#E8917B,#C95649)" },
  mint: { f: "hue-rotate(112deg) saturate(.88)", label: "มินต์เย็น", sw: "linear-gradient(145deg,#4FC0A8,#2E8F86)" },
};

// A `toLocaleString("sv-SE")` one-liner is only ISO-shaped when the runtime
// actually ships the sv-SE locale — a small-ICU build silently falls back to
// en-US and yields "9/7/2026, 2:23:45 PM". Build the string from
// `formatToParts` instead: the explicit `2-digit`/`numeric` options are the
// guarantee, so the locale tag barely matters.
const BKK = { timeZone: "Asia/Bangkok" } as const;

const parts = (d: Date): Record<string, string> =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      ...BKK,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;

/** Real Asia/Bangkok wall-clock stamp for audit rows: "YYYY-MM-DD HH:MM:SS". */
export const nowStamp = () => {
  const p = parts(new Date());
  // Some engines emit hour "24" for midnight under hour12:false.
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}`;
};

/** Real Asia/Bangkok date "YYYY-MM-DD", `daysAgo` days before now (default today). */
export const localDateISO = (daysAgo = 0) => {
  const p = parts(new Date(Date.now() - daysAgo * 86_400_000));
  return `${p.year}-${p.month}-${p.day}`;
};

/** Real current date "YYYY-MM-DD" (Asia/Bangkok) — the running app's "today". */
export const todayISO = () => localDateISO(0);

/** Real current date as a Date, anchored at 09:00 so whole-day EXP maths line up
 *  with the `${exp}T09:00:00` parse in logic.ts (Bangkok has no DST). */
export const todayDate = () => new Date(`${localDateISO(0)}T09:00:00`);

export const SEED = {
  items: ITEMS.map((i) => ({ ...i })),
  locations: LOCS.map((l) => ({ ...l })),
  history: HIST.slice(),
};
