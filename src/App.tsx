import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { localDateISO, PENDING, TONE } from "./data";
import type { Hist, Item, Kind, Loc } from "./data";
import {
  autoCode,
  days,
  freshHist,
  freshItems,
  freshLocs,
  homeDerived,
  itemOf,
  locLabel as locLabelOf,
  locSug,
  shopRows,
} from "./logic";
import { applyMutation, type Msg, type Snapshot } from "./mutations";
import { fetchState, mutate } from "./api";
import { idSrc, shotSrc, uploadPhoto, type Shot } from "./photos";
import { css } from "./css";
import { IOSFrame } from "./IOSFrame";
import { chip, codeBadge, DANGER, ghost, PRIM, pill, SEC } from "./ui";
import {
  BackChevron,
  ChevronRight,
  CloseIcon,
  GearIcon,
  MicIcon,
  NavCamIcon,
  NavHistIcon,
  NavHomeIcon,
  NavInvIcon,
  NavShopIcon,
  SearchIcon,
  TrashIcon,
} from "./icons";

type Screen =
  | "home"
  | "pending"
  | "cam"
  | "add"
  | "move"
  | "use"
  | "inv"
  | "hist"
  | "shop"
  | "set";

type CamEvt = "ADD" | "MOVE" | "USE";

interface AddRow {
  name: string;
  kind: Kind;
  qty: number;
  loc: string;
  locQuery: string;
  expMode: "days" | "date";
  expVal: string;
}
interface MoveRow {
  query: string;
  itemId: number | null;
  qty: number;
  to: string;
  locQuery: string;
}
interface Viewer {
  /** already-resolved <img> src strings (local blob URL or /api/photo?id=…) */
  shots: string[];
  idx: number;
  src: string;
  /** when set, the viewer shows a "เปลี่ยนรูป" button that re-shoots this place's photo */
  replaceCode?: string;
}
type Sheet =
  | { kind: "cam" }
  | { kind: "newItem" }
  | { kind: "newPlace" }
  | { kind: "delPlace"; code: string; name: string }
  | { kind: "delItem"; id: number; name: string }
  | { kind: "delPending"; id: string; name: string }
  | { kind: "buy"; name: string };

/** A centre-of-screen red confirmation popup (destructive actions). */
interface Confirm {
  title: string;
  body?: string;
  okLabel: string;
  onOk: () => void;
}

interface State {
  loading: boolean;
  /** True once `fetchState` has returned real server state. Until then the app is
   *  running on the local seed and must NOT write to the server — the seed's
   *  pinned ids have nothing to do with the live sheet's rows. */
  hydrated: boolean;
  online: boolean;
  tone: string | null;
  screen: Screen;
  locs: Loc[];
  setTab: "items" | "places";
  placeQuery: string;
  items: Item[];
  pending: typeof import("./data").PENDING;
  hist: Hist[];
  bought: string[];
  /** shop item name playing its "sink away" exit in the out/low group */
  buyLeaving: string | null;
  /** shop item name playing its "drop in from above" entrance in the bought group */
  buyArriving: string | null;
  toast: string;
  sheet: Sheet | null;
  confirm: Confirm | null;
  /** photos captured on the camera screen, before an event type is chosen */
  camShots: Shot[];
  /** photos carried into the add/move/use screen, uploaded on save */
  draftPhotos: Shot[];
  /** an upload is in flight */
  uploading: boolean;
  camEvt: CamEvt;
  viewer: Viewer | null;
  owner: string;
  addRows: AddRow[];
  moveRows: MoveRow[];
  useId: number | null;
  useQty: number;
  useQuery: string;
  invQuery: string;
  invMode: "all" | "loc" | "item";
  invLoc: string | null;
  setQuery: string;
  sheetText: string;
  newKind: Kind;
  placeRoom: string;
  placeRoomCustom: string;
  placeCode: string;
  histMode: "item" | "date" | "loc";
  histQuery: string;
  histLoc: string;
  histFrom: string;
  histTo: string;
}

const freshAddRow = (name = ""): AddRow => ({
  name,
  kind: "supply",
  qty: 1,
  loc: "",
  locQuery: "",
  expMode: "days",
  expVal: "",
});
const freshMoveRow = (query = "", itemId: number | null = null): MoveRow => ({
  query,
  itemId,
  qty: 1,
  to: "",
  locQuery: "",
});

const initial = (): State => ({
  loading: true,
  hydrated: false,
  online: true,
  tone: null,
  screen: "home",
  locs: freshLocs(),
  setTab: "items",
  placeQuery: "",
  items: freshItems(),
  pending: PENDING.map((p) => ({ ...p, shots: p.shots.slice() })),
  hist: freshHist(),
  bought: [],
  buyLeaving: null,
  buyArriving: null,
  toast: "",
  sheet: null,
  confirm: null,
  camShots: [],
  draftPhotos: [],
  uploading: false,
  camEvt: "ADD",
  viewer: null,
  owner: "เก่ง",
  addRows: [freshAddRow()],
  moveRows: [freshMoveRow()],
  useId: null,
  useQty: 1,
  useQuery: "",
  invQuery: "",
  invMode: "all",
  invLoc: null,
  setQuery: "",
  sheetText: "",
  newKind: "supply",
  placeRoom: "",
  placeRoomCustom: "",
  placeCode: "",
  histMode: "item",
  histQuery: "",
  histLoc: "",
  histFrom: localDateISO(7),
  histTo: localDateISO(0),
});

const st = (decl: string): CSSProperties => css(decl);

const HEAD: Record<Screen, [string, string]> = {
  home: ["", ""],
  pending: ["รายการรอบันทึก", ""],
  cam: ["ถ่ายรูปของ", "ขั้นที่ 1 ของทุกการบันทึก"],
  add: ["เก็บเข้าบ้าน", "ADD · บันทึกได้หลายรายการต่อครั้ง"],
  move: ["ย้ายของ", "MOVE · เลือกจากของที่มีอยู่"],
  use: ["ใช้ของ", "USE · ตัดยอดออกจากสต็อก"],
  inv: ["ค้นหา", "ค้นหาตามสถานที่หรือชื่อของ"],
  hist: ["ประวัติ", "Audit trail ย้อนหลัง"],
  shop: ["รายการซื้อ", "หมดแล้ว / ใกล้หมด"],
  set: ["ตั้งค่า", "โทนสี · stock · การแจ้งเตือน"],
};

export function App() {
  const [s, setS] = useState<State>(initial);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  // Kept in sync every render so debounced closures never fire with a stale owner.
  const ownerRef = useRef(s.owner);
  ownerRef.current = s.owner;
  // Same reason: the debounce timer fires long after the render that scheduled it.
  const hydratedRef = useRef(s.hydrated);
  hydratedRef.current = s.hydrated;

  // ── camera capture ─────────────────────────────────────────────────────────
  // One hidden <input capture> shared by every "take a photo" button; a ref says
  // whether the resulting files go to the camera screen or the current draft.
  const fileInput = useRef<HTMLInputElement>(null);
  const captureTarget = useRef<"cam" | "draft" | "place">("cam");
  const placeCode = useRef<string>("");
  const openCamera = (target: "cam" | "draft") => {
    captureTarget.current = target;
    fileInput.current?.click();
  };
  const openPlacePhoto = (code: string) => {
    captureTarget.current = "place";
    placeCode.current = code;
    fileInput.current?.click();
  };
  const onCapture = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    e.target.value = ""; // allow re-selecting the same file
    if (!files.length) return;
    if (captureTarget.current === "place") {
      const code = placeCode.current;
      captureTarget.current = "cam";
      if (!hydratedRef.current) return flash("โหมดตัวอย่าง — เพิ่มรูปไม่ได้");
      setS((p) => ({ ...p, uploading: true }));
      uploadPhoto(files[0])
        .then((id) => {
          setS((p) => ({ ...p, uploading: false }));
          dispatch({ type: "setPlacePhoto", code, photo: id }, () => "เพิ่มรูปสถานที่แล้ว");
        })
        .catch((err) => {
          setS((p) => ({ ...p, uploading: false }));
          flash(`อัปโหลดรูปไม่สำเร็จ · ${(err as Error).message}`);
        });
      return;
    }
    const shots: Shot[] = files.map((file) => ({ file, local: URL.createObjectURL(file) }));
    if (captureTarget.current === "cam") setS((p) => ({ ...p, camShots: [...p.camShots, ...shots] }));
    else setS((p) => ({ ...p, draftPhotos: [...p.draftPhotos, ...shots] }));
  };
  const revoke = (list: Shot[]) => list.forEach((sh) => sh.local && URL.revokeObjectURL(sh.local));

  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));
  const nav = (screen: Screen) => () => set({ screen, sheet: null });
  const flash = (t: string) => {
    set({ toast: t });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => set({ toast: "" }), 2600);
  };

  // ── shop "bought" move-down animation ──────────────────────────────────────
  // The item sinks away in its out/low group, then (after 240ms) drops into the
  // bought group from above. Two staggered timers drive the two phases.
  const buyTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const buyItem = (name: string) => {
    buyTimers.current.forEach(clearTimeout);
    buyTimers.current = [];
    setS((p) => ({ ...p, sheet: null, buyLeaving: name, buyArriving: null }));
    flash(`ติ๊ก “${name}” เป็นซื้อแล้ว`);
    buyTimers.current.push(
      setTimeout(() => {
        setS((p) =>
          p.bought.includes(name)
            ? { ...p, buyLeaving: null }
            : { ...p, bought: [...p.bought, name], buyLeaving: null, buyArriving: name },
        );
        buyTimers.current.push(
          setTimeout(
            () => setS((p) => (p.buyArriving === name ? { ...p, buyArriving: null } : p)),
            520,
          ),
        );
      }, 240),
    );
  };

  /**
   * Attempt the server write — but only once we hold server-sourced state. A
   * boot-offline client is running the local seed, whose pinned ids do not match
   * any live sheet, so writing from it would corrupt real data; it stays a
   * local-only demo session until reload. A success flips `online` back to true,
   * so a client that *is* hydrated heals itself after a blip; a failure always
   * rolls the optimistic change back, since `hydrated` makes that unambiguous.
   */
  const syncOrRollback = (msg: Msg, prev: Snapshot) => {
    if (!s.hydrated) return;
    mutate(msg, s.owner)
      .then(({ snapshot }) =>
        set({
          items: snapshot.items,
          locs: snapshot.locations,
          hist: snapshot.history,
          online: true,
        }),
      )
      .catch((e) => {
        set({ items: prev.items, locs: prev.locations, hist: prev.history, online: false });
        flash(`บันทึกไม่สำเร็จ · ${(e as Error).message}`);
      });
  };

  const dispatch = (msg: Msg, toastFor?: (r: Record<string, unknown>) => string) => {
    const prev: Snapshot = { items: s.items, locations: s.locs, history: s.hist };
    const local = applyMutation(prev, msg, s.owner);
    if ("error" in local) {
      flash(local.error);
      return false;
    }
    set({
      items: local.snapshot.items,
      locs: local.snapshot.locations,
      hist: local.snapshot.history,
    });
    if (toastFor) flash(toastFor(local.result));
    syncOrRollback(msg, prev);
    return true;
  };

  useEffect(() => {
    let cancelled = false;
    fetchState()
      .then((snap) => {
        if (!cancelled)
          set({
            items: snap.items,
            locs: snap.locations,
            hist: snap.history,
            loading: false,
            hydrated: true,
          });
      })
      .catch(() => {
        if (!cancelled) {
          set({ loading: false, online: false });
          flash("ออฟไลน์ · ใช้ข้อมูลตัวอย่าง");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── keyed mutate debounce ──────────────────────────────────────────────────
  // One in-flight patch per key: the optimistic apply lands immediately so the
  // input/stepper stays responsive, while the server write is coalesced. Keys are
  // per-field (item-<id>-min vs item-<id>-target) so sibling edits never clobber.
  const pendingPatch = useRef<Record<string, Msg>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // A code edit renames the row's own key, so remember which code the SERVER still
  // knows for a row mid-retype — otherwise the coalesced write would carry an
  // intermediate code the server never saw, and the debounce key would change on
  // every keystroke (defeating the debounce entirely).
  const placeOrigin = useRef<Record<string, string>>({});
  useEffect(
    () => () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    },
    [],
  );

  /**
   * `serverMsg` is what the coalesced write sends; `localMsg` is what we apply
   * optimistically. They differ whenever a keystroke changes the row's own
   * identity: a place-code edit renames GAR-01 → GAR-0 → GAR-0X locally one
   * keystroke at a time, while the server — which still knows the row as
   * GAR-01 — must receive the single NET rename GAR-01 → GAR-0X. Sending the
   * incremental message instead would 400 on a code the server never saw.
   */
  const debouncedMutate = (key: string, serverMsg: Msg, localMsg: Msg = serverMsg): boolean => {
    const probe = applyMutation(
      { items: s.items, locations: s.locs, history: s.hist },
      localMsg,
      s.owner,
    );
    if ("error" in probe) {
      flash(probe.error);
      return false;
    }
    // Functional update: rapid clicks compose instead of racing a stale snapshot.
    setS((prev) => {
      const r = applyMutation(
        { items: prev.items, locations: prev.locs, history: prev.hist },
        localMsg,
        prev.owner,
      );
      if ("error" in r) return prev;
      return { ...prev, items: r.snapshot.items, locs: r.snapshot.locations, hist: r.snapshot.history };
    });
    // A non-hydrated client is a local-only demo session: the optimistic apply
    // above still lands so the UI works, but nothing goes to the server.
    if (!s.hydrated) return true;
    pendingPatch.current[key] = serverMsg; // latest message per key wins
    clearTimeout(debounceTimers.current[key]);
    const wasOnline = s.online;
    debounceTimers.current[key] = setTimeout(() => {
      if (!hydratedRef.current) return;
      const m = pendingPatch.current[key];
      delete pendingPatch.current[key];
      mutate(m, ownerRef.current)
        .then(({ snapshot }) => {
          // The server now knows the row under its new code.
          if (m.type === "setPlaceCode") delete placeOrigin.current[m.newCode.trim().toUpperCase()];
          set({
            items: snapshot.items,
            locs: snapshot.locations,
            hist: snapshot.history,
            online: true,
          });
        })
        .catch((e) => {
          // Known minor: the optimistic apply stands. A debounced field edit has
          // coalesced away its "before" by this point, so it reverts on reload.
          set({ online: false });
          if (wasOnline) flash(`บันทึกไม่สำเร็จ · ${(e as Error).message}`);
        });
    }, 600);
    return true;
  };

  const setItemFieldDebounced = (id: number, patch: { min?: number; target?: number }) => {
    const field = patch.min !== undefined ? "min" : "target";
    debouncedMutate(`item-${id}-${field}`, { type: "setItemField", id, ...patch });
  };

  const renamePlaceDebounced = (code: string, fields: { name?: string; room?: string }) => {
    const field = fields.name !== undefined ? "name" : "room";
    debouncedMutate(`place-${code}-${field}`, {
      type: "renamePlace",
      code,
      name: fields.name,
      room: fields.room,
    });
  };

  /**
   * `cur` is the row's code in current (already-optimistically-renamed) state;
   * `raw` is what the user has now typed. The row's identity as far as the SERVER
   * is concerned is still `origin` — the code it had when this edit began — so we
   * carry that forward under each new code the row takes, keeping both the
   * debounce key and the server message stable across keystrokes.
   */
  const setPlaceCodeDebounced = (cur: string, raw: string) => {
    const origin = placeOrigin.current[cur] ?? cur;
    // Remember the origin under the NEW code so the next keystroke still knows it.
    placeOrigin.current[raw] = origin;
    debouncedMutate(
      `place-${origin}-code`, // stable: origin never changes mid-edit
      { type: "setPlaceCode", code: origin, newCode: raw }, // server: net rename
      { type: "setPlaceCode", code: cur, newCode: raw }, // local: incremental
    );
  };

  const tone = TONE[s.tone || "lilac"] || TONE.lilac;
  const locLabel = (code: string) => locLabelOf(s.locs, code);
  const item = (id: number | null) => itemOf(s.items, id);

  const head = (): [string, string] => {
    if (s.screen === "home") return [`สวัสดี ${s.owner}`, "ภาพรวมของในบ้าน · 6 ก.ย. 2569"];
    if (s.screen === "pending")
      return ["รายการรอบันทึก", `${s.pending.length} รายการ · เลือกรูปเพื่อบันทึกต่อ`];
    return HEAD[s.screen];
  };

  // ── flows ──────────────────────────────────────────────────────────────────
  const startAddFrom = (p: (typeof s.pending)[number]) => () => {
    set({
      screen: "add",
      addRows: [freshAddRow(p.name)],
      pending: s.pending.filter((x) => x.id !== p.id),
    });
    flash(`ดึง “${p.name}” จากรายการรอบันทึกแล้ว`);
  };
  const startMoveFrom = (p: (typeof s.pending)[number]) => () => {
    const match = s.items.find((i) => i.name === p.name);
    set({
      screen: "move",
      moveRows: [freshMoveRow(p.name, match ? match.id : null)],
      pending: s.pending.filter((x) => x.id !== p.id),
    });
  };
  const startUseFrom = (p: (typeof s.pending)[number]) => () => {
    const match = s.items.find((i) => i.name === p.name);
    set({
      screen: "use",
      useQuery: p.name,
      useId: match ? match.id : null,
      useQty: 1,
      pending: s.pending.filter((x) => x.id !== p.id),
    });
  };

  /**
   * Upload every draft photo and return their Drive ids. Empty (with a note) when
   * there is nothing to upload, when the client is not hydrated (demo mode — cannot
   * persist), or when an upload fails; the record is still saved, just photo-less.
   */
  const resolvePhotos = async (): Promise<string[]> => {
    if (!s.draftPhotos.length) return [];
    if (!s.hydrated) {
      flash("โหมดตัวอย่าง — รูปยังไม่ถูกบันทึก");
      return [];
    }
    set({ uploading: true });
    try {
      const ids = await Promise.all(s.draftPhotos.map((sh) => uploadPhoto(sh.file!)));
      revoke(s.draftPhotos);
      set({ uploading: false, draftPhotos: [] });
      return ids;
    } catch (e) {
      set({ uploading: false });
      revoke(s.draftPhotos);
      set({ draftPhotos: [] });
      flash(`อัปโหลดรูปไม่สำเร็จ · ${(e as Error).message} — บันทึกรายการโดยไม่มีรูป`);
      return [];
    }
  };

  const addSave = async () => {
    if (s.uploading) return;
    const photos = await resolvePhotos();
    const prev: Snapshot = { items: s.items, locations: s.locs, history: s.hist };
    const msg: Msg = { type: "add", addRows: s.addRows, photos };
    const res = applyMutation(prev, msg, s.owner);
    if ("error" in res) return flash(res.error);
    set({
      items: res.snapshot.items,
      locs: res.snapshot.locations,
      hist: res.snapshot.history,
      screen: "inv",
      invMode: "item",
      invQuery: "",
      invLoc: null,
      addRows: [freshAddRow()],
    });
    flash(`บันทึกเก็บของ ${res.result.added} รายการ โดย ${s.owner}`);
    syncOrRollback(msg, prev);
  };
  const moveSave = async () => {
    if (s.uploading) return;
    const photos = await resolvePhotos();
    const prev: Snapshot = { items: s.items, locations: s.locs, history: s.hist };
    const msg: Msg = {
      type: "move",
      moveRows: s.moveRows.map((r) => ({ itemId: r.itemId, qty: r.qty, to: r.to })),
      photos,
    };
    const res = applyMutation(prev, msg, s.owner);
    if ("error" in res) return flash(res.error);
    set({
      items: res.snapshot.items,
      locs: res.snapshot.locations,
      hist: res.snapshot.history,
      screen: "inv",
      invMode: "loc",
      invLoc: (res.result.firstTo as string) ?? null,
      moveRows: [freshMoveRow()],
    });
    flash(`ย้าย ${res.result.moved} รายการ โดย ${s.owner}`);
    syncOrRollback(msg, prev);
  };
  const useSave = async () => {
    if (s.uploading) return;
    const photos = await resolvePhotos();
    const prev: Snapshot = { items: s.items, locations: s.locs, history: s.hist };
    const msg: Msg = { type: "use", useId: s.useId, useQty: s.useQty, photos };
    const res = applyMutation(prev, msg, s.owner);
    if ("error" in res) return flash(res.error);
    set({
      items: res.snapshot.items,
      locs: res.snapshot.locations,
      hist: res.snapshot.history,
      useId: null,
      useQuery: "",
      useQty: 1,
    });
    const left = res.result.left as number;
    if (left <= 0) flash(`⚠ ${res.result.name} หมดแล้ว — เพิ่มเข้ารายการซื้ออัตโนมัติ`);
    else flash(`ใช้ ${res.result.name} ${res.result.used} หน่วย · เหลือ ${left}`);
    syncOrRollback(msg, prev);
  };

  // ── derived ────────────────────────────────────────────────────────────────
  const v = useMemo(() => build(s, tone, head, locLabel, item, {
    startAddFrom,
    startMoveFrom,
    startUseFrom,
    set,
    flash,
    nav,
    dispatch,
    setItemFieldDebounced,
    renamePlaceDebounced,
    setPlaceCodeDebounced,
    onAddSave: addSave,
    onMoveSave: moveSave,
    onUseSave: useSave,
    openCamera,
    openPlacePhoto,
    revoke,
    buyItem,
  }), [s]); // eslint-disable-line react-hooks/exhaustive-deps

  const h = v.head;

  return (
    <IOSFrame>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={onCapture}
      />
      <div style={st(`height:100%;filter:${tone.f}`)}>
        <div style={st("height:100%;display:flex;flex-direction:column;background:linear-gradient(180deg,#F5EFFC 0%,#EDE5F7 100%);position:relative;overflow:hidden")}>
          {/* header */}
          <div style={st("padding:56px 22px 10px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex:none")}>
            <div style={st("min-width:0")}>
              <div style={st("display:flex;align-items:center;gap:9px")}>
                {s.screen !== "home" && (
                  <button onClick={nav("home")} style={st("width:34px;height:34px;flex:none;border:none;border-radius:12px;background:#F8F3FD;box-shadow:4px 5px 12px rgba(120,95,175,.18),-3px -4px 10px #ffffff;cursor:pointer;display:grid;place-items:center")}>
                    <BackChevron />
                  </button>
                )}
                <div style={st("font:500 24px/1.3 Mitr,sans-serif;color:#3A3254")}>{h[0]}</div>
              </div>
              <div style={st("font:400 12.5px/1.45 'IBM Plex Sans Thai',sans-serif;color:#8B82A6;margin-top:2px")}>{h[1]}</div>
            </div>
            <div style={st("display:flex;align-items:center;gap:8px;flex:none")}>
              {/* Never hydrated → local-only seed session; hydrated but a write
                  failed → offline. `online` is meaningless before hydration. */}
              {!s.loading && !s.hydrated && (
                <div style={st("font:500 10px 'IBM Plex Mono',monospace;color:#9A90BC;background:#F1ECFA;border-radius:8px;padding:4px 8px")}>
                  ตัวอย่าง
                </div>
              )}
              {s.hydrated && !s.online && (
                <div style={st("font:500 10px 'IBM Plex Mono',monospace;color:#9A90BC;background:#F1ECFA;border-radius:8px;padding:4px 8px")}>
                  ออฟไลน์
                </div>
              )}
              <button onClick={nav("set")} style={st("width:46px;height:46px;flex:none;border:none;border-radius:16px;background:#F8F3FD;box-shadow:6px 7px 16px rgba(120,95,175,.2),-5px -6px 14px #ffffff,inset 1px 1px 3px #ffffff;cursor:pointer;display:grid;place-items:center")}>
                <GearIcon />
              </button>
            </div>
          </div>

          {/* scroll area */}
          <div style={st("flex:1;overflow-y:auto;padding:8px 22px 140px")}>
            {s.loading ? (
              <div style={st("display:grid;place-items:center;height:60vh")}>
                <div
                  style={st(
                    "width:34px;height:34px;border-radius:50%;border:3px solid #C6B9E6;border-top-color:#6A57D6;animation:spin .8s linear infinite",
                  )}
                />
              </div>
            ) : (
              <>
                {s.screen === "home" && <HomeScreen v={v} />}
                {s.screen === "pending" && <PendingScreen v={v} />}
                {s.screen === "cam" && <CamScreen v={v} />}
                {s.screen === "add" && <AddScreen v={v} />}
                {s.screen === "move" && <MoveScreen v={v} />}
                {s.screen === "use" && <UseScreen v={v} />}
                {s.screen === "inv" && <InvScreen v={v} />}
                {s.screen === "hist" && <HistScreen v={v} />}
                {s.screen === "shop" && <ShopScreen v={v} />}
                {s.screen === "set" && <SetScreen v={v} />}
              </>
            )}
          </div>

          {/* bottom nav */}
          <div style={st("position:absolute;left:0;right:0;bottom:0;height:126px;padding:0 16px 30px;display:flex;align-items:flex-end;z-index:40;background:linear-gradient(180deg,rgba(240,232,250,0) 0%,rgba(239,231,248,.55) 40%,#EFE7F8 78%);pointer-events:none")}>
            <div style={st("width:100%;display:flex;align-items:center;gap:2px;padding:8px;border-radius:34px;pointer-events:auto;background:linear-gradient(150deg,rgba(255,255,255,.78) 0%,rgba(243,236,252,.5) 48%,rgba(224,213,244,.62) 100%);backdrop-filter:blur(20px) saturate(1.6);-webkit-backdrop-filter:blur(20px) saturate(1.6);box-shadow:0 16px 36px rgba(88,64,148,.26),0 2px 0 rgba(255,255,255,.9) inset,inset 3px 4px 10px rgba(255,255,255,.85),inset -4px -6px 14px rgba(120,95,175,.2)")}>
              <NavBtn item={v.navHome} label="หน้าแรก"><NavHomeIcon /></NavBtn>
              <NavBtn item={v.navInv} label="ค้นหา"><NavInvIcon /></NavBtn>
              <button
                onClick={() => {
                  // jump to the camera screen AND fire the OS camera in the same
                  // user gesture so the user lands ready to shoot
                  set({ screen: "cam", sheet: null });
                  openCamera("cam");
                }}
                style={st("width:66px;height:66px;flex:none;margin:0 2px;border:none;border-radius:24px;background:linear-gradient(150deg,#8B7BE8 0%,#6A57D6 45%,#5039BD 100%);box-shadow:0 14px 28px rgba(80,57,189,.45),-5px -7px 14px rgba(255,255,255,.65),inset 3px 4px 9px rgba(255,255,255,.42),inset -4px -7px 12px rgba(40,20,90,.3);cursor:pointer;display:grid;place-items:center;transform:translateY(-10px)")}
              >
                <NavCamIcon />
              </button>
              <NavBtn item={v.navShop} label="รายการซื้อ"><NavShopIcon /></NavBtn>
              <NavBtn item={v.navHist} label="ประวัติ"><NavHistIcon /></NavBtn>
            </div>
          </div>

          {/* toast */}
          {s.toast && (
            <div style={st("position:absolute;left:22px;right:22px;bottom:118px;z-index:55;border-radius:20px;padding:14px 16px;font:500 12.5px/1.5 Mitr,sans-serif;color:#ffffff;background:rgba(58,46,92,.94);box-shadow:0 14px 30px rgba(60,42,110,.35);animation:clayIn .25s ease both")}>
              {s.toast}
            </div>
          )}

          {/* photo viewer */}
          {s.viewer && <ViewerLayer v={v} />}

          {/* bottom sheet */}
          {s.sheet && <SheetLayer v={v} />}

          {/* centre-screen red confirm */}
          {s.confirm && <CenterConfirm v={v} />}
        </div>
      </div>
    </IOSFrame>
  );
}

// ═══ view-model builder ══════════════════════════════════════════════════════

type PendingItem = State["pending"][number];
type Helpers = {
  startAddFrom: (p: PendingItem) => () => void;
  startMoveFrom: (p: PendingItem) => () => void;
  startUseFrom: (p: PendingItem) => () => void;
  set: (patch: Partial<State>) => void;
  flash: (t: string) => void;
  nav: (screen: Screen) => () => void;
  dispatch: (msg: Msg, toastFor?: (r: Record<string, unknown>) => string) => boolean;
  setItemFieldDebounced: (id: number, patch: { min?: number; target?: number }) => void;
  renamePlaceDebounced: (code: string, fields: { name?: string; room?: string }) => void;
  setPlaceCodeDebounced: (code: string, newCode: string) => void;
  onAddSave: () => void;
  onMoveSave: () => void;
  onUseSave: () => void;
  openCamera: (target: "cam" | "draft") => void;
  openPlacePhoto: (code: string) => void;
  revoke: (list: Shot[]) => void;
  buyItem: (name: string) => void;
};

function build(
  s: State,
  tone: (typeof TONE)[string],
  head: () => [string, string],
  locLabel: (code: string) => string,
  item: (id: number | null) => Item | undefined,
  H: Helpers,
) {
  const {
    set, flash, nav, dispatch,
    setItemFieldDebounced, renamePlaceDebounced, setPlaceCodeDebounced,
    onAddSave, onMoveSave, onUseSave, openCamera, openPlacePhoto, revoke, buyItem,
  } = H;
  const items = s.items;
  const screen = s.screen;
  const d = homeDerived(items);
  const { expiring, out, low, totalQty, ready } = d;
  const shop = shopRows(items, s.bought);

  // alerts
  const alerts: {
    tag: string;
    pill: string;
    name: string;
    detail: string;
    cta: string;
    ctaStyle?: string;
    on: () => void;
  }[] = [];
  // most-overdue first, so already-expired items float to the top of the home list
  [...expiring]
    .sort((a, b) => (days(a.exp) ?? 99) - (days(b.exp) ?? 99))
    .forEach((i) => {
      const dd = days(i.exp)!;
      if (dd < 0) {
        alerts.push({
          tag: "หมดอายุ",
          pill: pill("#FBE1E0", "#B23F3B"),
          name: i.name,
          detail: `หมดอายุแล้ว ${i.exp} · ${locLabel(i.loc)} · ควรนำไปทิ้ง`,
          cta: "ทิ้ง",
          ctaStyle:
            "border:none;flex:none;border-radius:14px;padding:9px 14px;font:500 12px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#E07A76,#C24A46);box-shadow:3px 4px 10px rgba(194,74,70,.3);cursor:pointer",
          on: () =>
            set({
              confirm: {
                title: `ทิ้ง “${i.name}” ?`,
                body: `หมดอายุแล้ว — จะลบออกจากระบบถาวร`,
                okLabel: "ทิ้งเลย",
                onOk: () => dispatch({ type: "delItem", id: i.id }, () => `ทิ้ง “${i.name}” แล้ว`),
              },
            }),
        });
        return;
      }
      alerts.push({
        tag: dd <= 1 ? "EXP 1 วัน" : `EXP ${dd} วัน`,
        pill: pill("#FFE6E6", "#C9524F"),
        name: i.name,
        detail: `หมดอายุ ${i.exp} · ${locLabel(i.loc)} · เหลือ ${i.qty}`,
        cta: "ใช้เลย",
        on: () => set({ screen: "use", useQuery: i.name, useId: i.id, useQty: 1 }),
      });
    });
  out.forEach((i) => {
    alerts.push({
      tag: "หมดแล้ว",
      pill: pill("#FFE9DC", "#C4692F"),
      name: i.name,
      detail: `ที่ ${locLabel(i.loc)} · ต้องมีขั้นต่ำ ${i.min}`,
      cta: "ใส่ลิสต์",
      on: nav("shop"),
    });
  });
  low.forEach((i) => {
    alerts.push({
      tag: "ใกล้หมด",
      pill: pill("#FFF4D9", "#A9741B"),
      name: i.name,
      detail: `เหลือ ${i.qty} · ขั้นต่ำ ${i.min} · target ${i.target}`,
      cta: "ใส่ลิสต์",
      on: nav("shop"),
    });
  });

  // pending cards
  const pendingList = s.pending.map((p) => ({
    key: p.id,
    name: p.name,
    src: p.src,
    shots: p.shots.map((id, si) => ({
      src: idSrc(id),
      w: p.shots.length > 1 ? 126 : 170,
      on: () =>
        set({ viewer: { shots: p.shots.map(idSrc), idx: si, src: `${p.name} · ${p.src}` } }),
    })),
    status: p.miss,
    statusStyle: `margin-top:5px;font:400 12px "IBM Plex Sans Thai",sans-serif;color:${p.ready ? "#2E8F6B" : "#C4692F"}`,
    actions: [
      { label: "เก็บของ", on: H.startAddFrom(p), style: chip(p.evt === "ADD", true) },
      { label: "ย้ายของ", on: H.startMoveFrom(p), style: chip(p.evt === "MOVE", true) },
      { label: "ใช้ของ", on: H.startUseFrom(p), style: chip(p.evt === "USE", true) },
    ],
    onDelete: () => set({ sheet: { kind: "delPending", id: p.id, name: p.name } }),
  }));

  // camera
  const camEvents = ([["ADD", "เก็บของ"], ["MOVE", "ย้ายของ"], ["USE", "ใช้ของ"]] as const).map(
    (e) => ({ label: e[1], style: chip(s.camEvt === e[0], true), on: () => set({ camEvt: e[0] }) }),
  );

  // add rows
  const addRows = s.addRows.map((r, idx) => {
    const put = (patch: Partial<AddRow>) =>
      set({ addRows: s.addRows.map((x, i) => (i === idx ? { ...x, ...patch } : x)) });
    return {
      key: idx,
      tag: `รายการที่ ${idx + 1}`,
      removeStyle: s.addRows.length > 1 ? ghost() : "display:none",
      remove: () => set({ addRows: s.addRows.filter((_, i) => i !== idx) }),
      name: r.name,
      setName: (e: ChangeEvent<HTMLInputElement>) => put({ name: e.target.value }),
      mic: () => {
        put({ name: r.name || "สเปรย์กระจก" });
        flash("🎙 Voice-to-Text: “สเปรย์กระจก”");
      },
      kinds: ([["supply", "ของใช้"], ["food", "ของกิน"]] as const).map((k) => ({
        label: k[1],
        style: chip(r.kind === k[0], true),
        on: () => put({ kind: k[0], expVal: "" }),
      })),
      isFood: r.kind === "food",
      expModes: ([["days", "อายุกี่วัน"], ["date", "ระบุวันที่"]] as const).map((m) => ({
        label: m[1],
        style: chip(r.expMode === m[0], true),
        on: () => put({ expMode: m[0], expVal: "" }),
      })),
      expVal: r.expVal,
      setExp: (e: ChangeEvent<HTMLInputElement>) => put({ expVal: e.target.value }),
      expInputType: r.expMode === "days" ? "number" : "date",
      expPlaceholder: r.expMode === "days" ? "เช่น 7" : "",
      expHint: r.expMode === "days" ? "วันนับจากวันนี้" : "วัน EXP จริง",
      qty: r.qty,
      inc: () => put({ qty: r.qty + 1 }),
      dec: () => put({ qty: Math.max(1, r.qty - 1) }),
      locQuery: r.locQuery || "",
      setLocQuery: (e: ChangeEvent<HTMLInputElement>) => put({ locQuery: e.target.value, loc: "" }),
      clearLoc: () => put({ locQuery: "", loc: "" }),
      clearLocStyle: r.locQuery || r.loc ? ghost() : "display:none",
      locPicked: !!r.loc,
      locCode: r.loc,
      locName: r.loc ? locLabel(r.loc) : "",
      locSuggest: locSug(s.locs, r.locQuery, r.loc).map((l) => ({
        name: `${l.name} (${l.room})`,
        meta: l.code,
        on: () => put({ loc: l.code, locQuery: `${l.name} (${l.room})` }),
      })),
    };
  });

  // move rows
  const moveRows = s.moveRows.map((r, idx) => {
    const put = (patch: Partial<MoveRow>) =>
      set({ moveRows: s.moveRows.map((x, i) => (i === idx ? { ...x, ...patch } : x)) });
    const picked = r.itemId ? item(r.itemId) : null;
    const q = r.query.trim();
    const sug = !picked && q ? items.filter((i) => i.qty > 0 && i.name.includes(q)).slice(0, 4) : [];
    return {
      key: idx,
      tag: `ย้ายรายการที่ ${idx + 1}`,
      removeStyle: s.moveRows.length > 1 ? ghost() : "display:none",
      remove: () => set({ moveRows: s.moveRows.filter((_, i) => i !== idx) }),
      query: r.query,
      setQuery: (e: ChangeEvent<HTMLInputElement>) => put({ query: e.target.value, itemId: null }),
      suggest: sug.map((i) => ({
        name: i.name,
        meta: `${i.loc} · เหลือ ${i.qty}`,
        on: () => put({ itemId: i.id, query: i.name, qty: 1 }),
      })),
      picked: !!picked,
      pickedName: picked ? picked.name : "",
      pickedMeta: picked ? `เหลือ ${picked.qty}` : "",
      fromCode: picked ? picked.loc : "",
      fromName: picked ? locLabel(picked.loc) : "",
      fromCodeStyle: codeBadge(true),
      qty: r.qty,
      inc: () => put({ qty: Math.min(picked ? picked.qty : 99, r.qty + 1) }),
      dec: () => put({ qty: Math.max(1, r.qty - 1) }),
      locQuery: r.locQuery || "",
      setLocQuery: (e: ChangeEvent<HTMLInputElement>) => put({ locQuery: e.target.value, to: "" }),
      clearLoc: () => put({ locQuery: "", to: "" }),
      clearLocStyle: r.locQuery || r.to ? ghost() : "display:none",
      locPicked: !!r.to,
      locCode: r.to,
      locName: r.to ? locLabel(r.to) : "",
      locSuggest: locSug(s.locs, r.locQuery, r.to).map((l) => ({
        name: `${l.name} (${l.room})`,
        meta: l.code,
        on: () => put({ to: l.code, locQuery: `${l.name} (${l.room})` }),
      })),
    };
  });

  // use
  const uq = s.useQuery.trim();
  const usePick = s.useId ? item(s.useId) : null;
  const useSuggest = items
    .filter((i) => !uq || i.name.includes(uq))
    .map((i) => ({
      name: i.name,
      loc: locLabel(i.loc),
      code: i.loc,
      left: `เหลือ ${i.qty}`,
      codeStyle: codeBadge(false),
      style:
        "border:none;cursor:pointer;display:flex;align-items:center;gap:12px;border-radius:22px;padding:14px 16px;background:#FBF6FE;box-shadow:8px 10px 22px rgba(120,95,175,.16),-5px -6px 14px #ffffff" +
        (i.qty <= 0 ? ";opacity:.55" : ""),
      on: () => set({ useId: i.id, useQty: 1, useQuery: i.name }),
    }));
  let useWarn = "";
  let useWarnStyle = "display:none";
  if (usePick) {
    if (usePick.qty - s.useQty <= 0) {
      useWarn = "ใช้แล้วจะเหลือ 0 — ระบบจะเตือนของหมดและใส่รายการซื้อ";
      useWarnStyle =
        'margin-top:12px;border-radius:16px;padding:11px 13px;font:400 12px/1.5 "IBM Plex Sans Thai",sans-serif;color:#C4692F;background:#FFF1E6;box-shadow:inset 3px 4px 9px rgba(200,120,70,.14)';
    } else if (usePick.qty - s.useQty <= usePick.min) {
      useWarn = `ใช้แล้วจะต่ำกว่าขั้นต่ำ (${usePick.min})`;
      useWarnStyle =
        'margin-top:12px;border-radius:16px;padding:11px 13px;font:400 12px/1.5 "IBM Plex Sans Thai",sans-serif;color:#A9741B;background:#FFF7E3;box-shadow:inset 3px 4px 9px rgba(180,140,40,.14)';
    }
  }

  // inventory
  const iq = s.invQuery.trim().toLowerCase();
  const locMatch = s.locs.filter((l) => !iq || (l.name + l.room + l.code).toLowerCase().includes(iq));
  let itemMatch = items.filter((i) => !iq || (i.name + i.loc).toLowerCase().includes(iq));
  if (s.invLoc) itemMatch = items.filter((i) => i.loc === s.invLoc);
  const showLocs = (s.invMode === "all" || s.invMode === "loc") && !s.invLoc;
  const showItems = s.invMode === "all" || s.invMode === "item" || !!s.invLoc;
  const invItems = itemMatch.map((i) => {
    const dd = days(i.exp);
    return {
      key: i.id,
      name: i.name,
      locLabel: locLabel(i.loc),
      code: i.loc,
      date: i.date,
      codeStyle: codeBadge(true),
      qtyLabel: i.qty <= 0 ? "หมด" : `เหลือ ${i.qty}`,
      qtyStyle: pill(
        i.qty <= 0 ? "#FFE6E6" : !i.noStock && i.qty <= i.min ? "#FFF4D9" : "#E9F7EF",
        i.qty <= 0 ? "#C9524F" : !i.noStock && i.qty <= i.min ? "#A9741B" : "#2E8F6B",
      ),
      expLabel: i.exp
        ? `EXP ${i.exp}${dd !== null ? (dd < 0 ? " (เลยแล้ว)" : ` (อีก ${dd} วัน)`) : ""}`
        : "ของใช้ · ไม่มี EXP",
      expStyle: `font:400 11px "IBM Plex Mono",monospace;color:${i.exp && dd !== null && dd <= 3 ? "#C9524F" : "#9A90BC"}`,
      photo: (i.photos ?? [])[0] ? idSrc((i.photos ?? [])[0]) : "",
      photoCount: (i.photos ?? []).length,
      openPhotos:
        (i.photos ?? []).length > 0
          ? () =>
              set({
                viewer: { shots: (i.photos ?? []).map(idSrc), idx: 0, src: i.name },
              })
          : undefined,
    };
  });

  // history
  const histList = s.hist
    .filter((e) => {
      if (s.histMode === "item")
        return !s.histQuery.trim() || e.name.includes(s.histQuery.trim());
      if (s.histMode === "loc") return !s.histLoc || e.to === s.histLoc || e.from === s.histLoc;
      const dd = e.date.slice(0, 10);
      return dd >= s.histFrom && dd <= s.histTo;
    })
    .map((e, idx) => {
      const color = { ADD: "#5B49C9", MOVE: "#2E8F86", USE: "#C4692F", ADJUST: "#8B82A6" }[e.evt];
      const label = { ADD: "เก็บเข้าบ้าน", MOVE: "ย้าย", USE: "ใช้", ADJUST: "ปรับจำนวน" }[e.evt];
      const tint = { ADD: "#F3F0FE", MOVE: "#E9F7F5", USE: "#FFF2E8", ADJUST: "#F5F2FA" }[e.evt];
      return {
        key: idx,
        title: `${label} · ${e.name}`,
        date: e.date.slice(5),
        titleStyle: `font:500 14px Mitr,sans-serif;color:${color}`,
        codeLabel: e.evt === "MOVE" ? `${e.from} → ${e.to}` : e.to,
        codeStyle:
          'flex:none;border-radius:11px;padding:6px 9px;font:500 10.5px "IBM Plex Mono",monospace;letter-spacing:.6px;color:#ffffff;background:' +
          color +
          ";box-shadow:3px 4px 9px rgba(90,68,180,.22),inset 2px 2px 5px rgba(255,255,255,.24)",
        detail:
          (e.evt === "MOVE" ? `${locLabel(e.from!)} → ${locLabel(e.to!)}` : locLabel(e.to!)) +
          ` · ${e.qty} หน่วย`,
        who: e.who,
        initial: e.who.slice(0, 1),
        avatarStyle:
          "width:22px;height:22px;flex:none;border-radius:8px;display:grid;place-items:center;font:500 10.5px Mitr,sans-serif;color:#ffffff;background:" +
          color +
          ";box-shadow:2px 3px 7px rgba(90,68,180,.24)",
        whoStyle: `font:500 12.5px Mitr,sans-serif;color:${color}`,
        cardStyle:
          "border-radius:20px;padding:13px 15px;background:" +
          tint +
          ";border:1.5px solid " +
          color +
          ";box-shadow:7px 9px 20px rgba(120,95,175,.14),-4px -5px 12px #ffffff,inset 2px 2px 5px rgba(255,255,255,.7)",
        dot:
          "width:14px;height:14px;border-radius:50%;margin:14px 0 4px;background:" +
          color +
          ";box-shadow:0 0 0 5px rgba(255,255,255,.9),3px 4px 9px rgba(120,95,175,.3)",
      };
    });

  // shopping groups
  const mk = (g: "out" | "low" | "bought") =>
    shop
      .filter((r) => r.group === g)
      .map((r) => {
        const isB = g === "bought";
        return {
          // key by name (unique per shopRows) so a card keeps its identity when it
          // moves between groups — lets the exit/enter animations play cleanly
          key: r.name,
          name: r.name,
          code: r.code,
          tick: isB ? "✓" : "",
          codeStyle: codeBadge(false),
          nameStyle:
            "font:500 14.5px Mitr,sans-serif;color:" +
            (isB ? "#8B82A6" : "#3A3254") +
            (isB ? ";text-decoration:line-through" : ""),
          detail: isB
            ? "ซื้อแล้ว · ยังไม่เพิ่ม stock (รอบันทึก ADD)"
            : r.qty <= 0
              ? `หมดแล้ว · ขั้นต่ำ ${r.min}`
              : `เหลือ ${r.qty} · ขั้นต่ำ ${r.min}`,
          cardStyle:
            "display:flex;align-items:center;gap:13px;border-radius:22px;padding:14px 16px;background:#FBF6FE;box-shadow:8px 10px 22px rgba(120,95,175,.16),-5px -6px 14px #ffffff" +
            (isB ? ";opacity:.7" : "") +
            (!isB && s.buyLeaving === r.name
              ? ";animation:shopLeave .24s ease forwards;pointer-events:none"
              : "") +
            (isB && s.buyArriving === r.name
              ? ";animation:shopDrop .46s cubic-bezier(.2,1.15,.45,1) both"
              : ""),
          tickStyle:
            "width:34px;height:34px;flex:none;border:none;border-radius:12px;cursor:pointer;font:500 15px Mitr,sans-serif;color:#ffffff;background:" +
            (isB ? "linear-gradient(145deg,#5FC79E,#2E8F6B)" : "#F1ECFA") +
            ";box-shadow:" +
            (isB
              ? "4px 5px 12px rgba(46,143,107,.3)"
              : "inset 3px 4px 9px rgba(120,95,175,.2),inset -2px -2px 6px #ffffff"),
          on: isB
            ? () => set({ bought: s.bought.filter((x) => x !== r.name) })
            : () => set({ sheet: { kind: "buy", name: r.name } }),
          onTrash: isB
            ? () =>
                set({
                  confirm: {
                    title: `ลบ “${r.name}” ออกจากรายการซื้อ?`,
                    okLabel: "ลบ",
                    onOk: () => set({ bought: s.bought.filter((x) => x !== r.name) }),
                  },
                })
            : undefined,
        };
      });
  const shopGroups = [
    { key: "out", title: "หมดแล้ว", rows: mk("out"), dotColor: "#D9605C", dotRgb: "217,96,92" },
    { key: "low", title: "ใกล้หมด", rows: mk("low"), dotColor: "#E0A02F", dotRgb: "224,160,47" },
    { key: "bought", title: "ซื้อแล้ว", rows: mk("bought"), dotColor: "#3EA57C", dotRgb: "62,165,124" },
  ].map((g) => ({
    ...g,
    count: `${g.rows.length} รายการ`,
    empty: g.rows.length === 0,
    dot: `width:11px;height:11px;border-radius:50%;background:${g.dotColor};box-shadow:0 0 0 4px rgba(${g.dotRgb},.16)`,
  }));

  // settings – items
  const sq = s.setQuery.trim().toLowerCase();
  const setRows = items
    .filter((i) => !sq || (i.name + i.loc).toLowerCase().includes(sq))
    .map((i) => {
      const patch = (k: "min" | "target", vv: number) =>
        setItemFieldDebounced(i.id, k === "min" ? { min: vv } : { target: vv });
      return {
        key: i.id,
        name: i.name,
        qty: i.qty,
        code: i.loc || "ยังไม่ระบุ",
        codeStyle: codeBadge(true),
        kindLabel: i.kind === "food" ? "ของกิน" : "ของใช้",
        del: () => set({ sheet: { kind: "delItem", id: i.id, name: i.name }, sheetText: "" }),
        toggleTrack: () => dispatch({ type: "setItemField", id: i.id, noStock: !i.noStock }),
        trackLabel: i.noStock ? "ไม่นับสต็อก (ของคงทน)" : "นับสต็อก · ตั้งขั้นต่ำได้",
        trackStyle:
          "border:none;cursor:pointer;text-align:left;border-radius:13px;padding:8px 10px;font:500 10.5px Mitr,sans-serif;" +
          (i.noStock
            ? "color:#8B82A6;background:#F1ECFA;box-shadow:inset 2px 3px 7px rgba(120,95,175,.16),inset -2px -2px 6px #ffffff"
            : "color:#2E8F6B;background:#E9F7EF;box-shadow:inset 2px 3px 7px rgba(46,143,107,.14),2px 3px 8px rgba(46,143,107,.12)"),
        fields: i.noStock
          ? []
          : [
              { label: "MINIMUM", value: i.min, inc: () => patch("min", i.min + 1), dec: () => patch("min", Math.max(0, i.min - 1)) },
              { label: "TARGET", value: i.target, inc: () => patch("target", i.target + 1), dec: () => patch("target", Math.max(1, i.target - 1)) },
            ],
      };
    });

  // settings – places
  const pq = s.placeQuery.trim().toLowerCase();
  const placeRows = s.locs
    .filter((l) => !pq || (l.name + l.room + l.code).toLowerCase().includes(pq))
    .map((l, idx) => {
      return {
        // Position, NOT `l.code`: a code edit rewrites `l.code` on every
        // keystroke, and a changing key remounts the row — which blurs the input
        // the user is typing into, so every character after the first is lost.
        // The list neither reorders nor changes length mid-edit, so the index is
        // stable exactly when it needs to be; the inputs are controlled, so a
        // reused node across a filter change just takes the new values.
        key: idx,
        code: l.code,
        name: l.name,
        room: l.room,
        itemCount: `${items.filter((i) => i.loc === l.code).length} items`,
        photo: l.photo ? idSrc(l.photo) : "",
        addPhoto: () => openPlacePhoto(l.code),
        viewPhoto: l.photo
          ? () =>
              set({
                viewer: {
                  shots: [idSrc(l.photo as string)],
                  idx: 0,
                  src: `${l.code} · ${l.name}`,
                  replaceCode: l.code,
                },
              })
          : undefined,
        removePhoto: () =>
          dispatch({ type: "setPlacePhoto", code: l.code, photo: null }, () => "ลบรูปสถานที่แล้ว"),
        setCode: (e: ChangeEvent<HTMLInputElement>) =>
          setPlaceCodeDebounced(l.code, e.target.value.toUpperCase()),
        setName: (e: ChangeEvent<HTMLInputElement>) =>
          renamePlaceDebounced(l.code, { name: e.target.value }),
        setRoom: (e: ChangeEvent<HTMLInputElement>) =>
          renamePlaceDebounced(l.code, { room: e.target.value }),
        del: () => {
          if (items.filter((i) => i.loc === l.code && i.qty > 0).length) {
            flash(`ยังมีของอยู่ใน ${l.code} — ย้ายของออกก่อนลบ`);
            return;
          }
          set({ sheet: { kind: "delPlace", code: l.code, name: l.name }, sheetText: "" });
        },
      };
    });

  // sheet
  const sheet = s.sheet;
  const sheetDanger =
    sheet?.kind === "delItem" || sheet?.kind === "delPlace" || sheet?.kind === "delPending";
  let sheetTitle = "";
  let sheetSub = "";
  let sheetActions: { label: string; style: string; on: () => void; disabled?: boolean }[] = [];
  let sheetHasInput = false;
  let sheetInputPh = "";
  let sheetHasChips = false;
  let sheetChips: { label: string; style: string; on: () => void }[] = [];
  let sheetHasPlace = false;
  let placeRoomChips: { label: string; style: string; on: () => void }[] = [];
  let placeRoomIsNew = false;
  let placeCodeVal = "";
  let placeCodeHint = "";

  if (sheet?.kind === "cam") {
    const evtLabel = { ADD: "เก็บของ", MOVE: "ย้ายของ", USE: "ใช้ของ" }[s.camEvt];
    sheetTitle = "บันทึกเลย หรือส่งเข้ารายการรอบันทึก?";
    sheetSub = `รูป ${s.camShots.length} รูป · ประเภท ${evtLabel}`;
    sheetActions = [
      {
        label: `บันทึกเลย (${evtLabel})`,
        style: PRIM,
        disabled: s.uploading,
        on: () => {
          const scr = { ADD: "add", MOVE: "move", USE: "use" }[s.camEvt] as Screen;
          // carry the captured shots into the draft for this screen; they upload on save
          set({ sheet: null, screen: scr, draftPhotos: s.camShots, camShots: [] });
        },
      },
      {
        label: "ส่งเข้ารายการรอบันทึก",
        style: SEC,
        disabled: s.uploading,
        on: async () => {
          if (!s.hydrated) return flash("โหมดตัวอย่าง — บันทึกรูปไม่ได้");
          set({ uploading: true });
          try {
            const ids = await Promise.all(s.camShots.map((sh) => uploadPhoto(sh.file!)));
            revoke(s.camShots);
            const p = {
              id: `p${Date.now()}`,
              name: "ของจากรูปใหม่",
              src: "IN-APP" as const,
              shots: ids,
              evt: s.camEvt,
              ready: false,
              miss: "ยังไม่ได้ระบุชื่อ / จำนวน / สถานที่",
            };
            set({
              sheet: null,
              screen: "pending",
              camShots: [],
              uploading: false,
              pending: [p, ...s.pending],
            });
            flash("ส่งเข้ารายการรอบันทึกแล้ว");
          } catch (e) {
            set({ uploading: false });
            flash(`อัปโหลดรูปไม่สำเร็จ · ${(e as Error).message}`);
          }
        },
      },
    ];
  }

  if (sheet?.kind === "newItem") {
    sheetTitle = "เพิ่มรายการของในบ้าน";
    sheetSub = "ตั้งชื่อและประเภท — จำนวนเริ่มต้น 0 ชิ้น รอบันทึก ADD";
    sheetHasInput = true;
    sheetInputPh = "ชื่อของ เช่น ถ่าน AA";
    sheetHasChips = true;
    sheetChips = ([["supply", "ของใช้"], ["food", "ของกิน"]] as const).map((k) => ({
      label: k[1],
      style: chip(s.newKind === k[0], true),
      on: () => set({ newKind: k[0] }),
    }));
    sheetActions = [
      {
        label: "เพิ่มรายการ",
        style: PRIM,
        on: () => {
          const name = s.sheetText.trim();
          if (dispatch({ type: "newItem", name, kind: s.newKind }, () => `เพิ่ม “${name}” เข้ารายการแล้ว`))
            set({ sheet: null, sheetText: "" });
        },
      },
      { label: "ยกเลิก", style: SEC, on: () => set({ sheet: null, sheetText: "" }) },
    ];
  }

  if (sheet?.kind === "newPlace") {
    sheetHasPlace = true;
    const rooms: string[] = [];
    s.locs.forEach((l) => {
      if (!rooms.includes(l.room)) rooms.push(l.room);
    });
    const room =
      s.placeRoom === "__new" ? s.placeRoomCustom.trim() : s.placeRoom || rooms[0];
    placeRoomIsNew = s.placeRoom === "__new";
    placeRoomChips = [...rooms, "+ หลักใหม่"].map((r) => {
      const key = r === "+ หลักใหม่" ? "__new" : r;
      return {
        label: r,
        style: chip((s.placeRoom || rooms[0]) === key, false),
        on: () => set({ placeRoom: key, placeCode: "" }),
      };
    });
    placeCodeVal = s.placeCode || autoCode(s.locs, room);
    placeCodeHint = "ตั้งตาม location หลัก แล้ว run เลขต่อไปเรื่อย ๆ";
    sheetTitle = "เพิ่มสถานที่จัดเก็บ";
    sheetSub = "เลือก location หลัก แล้วพิมพ์ location รอง เช่น “ลิ้นชักล่างสุด”";
    sheetHasInput = true;
    sheetInputPh = "location รอง เช่น ลิ้นชักล่างสุด";
    sheetActions = [
      {
        label: "สร้างสถานที่",
        style: PRIM,
        on: () => {
          const name = s.sheetText.trim();
          const code = (s.placeCode || autoCode(s.locs, room)).toUpperCase();
          if (
            dispatch(
              { type: "newPlace", code, name, room },
              () => `สร้าง ${code} · ${room} – ${name} แล้ว`,
            )
          )
            set({
              sheet: null,
              sheetText: "",
              setTab: "places",
              placeCode: "",
              placeRoom: "",
              placeRoomCustom: "",
            });
        },
      },
      {
        label: "ยกเลิก",
        style: SEC,
        on: () => set({ sheet: null, sheetText: "", placeCode: "", placeRoom: "", placeRoomCustom: "" }),
      },
    ];
  }

  if (sheet?.kind === "delPlace") {
    const okP = s.sheetText.trim().toLowerCase() === "delete";
    sheetTitle = `ลบสถานที่ “${sheet.name}” (${sheet.code})?`;
    sheetSub = "พิมพ์คำว่า Delete เพื่อยืนยัน";
    sheetHasInput = true;
    sheetInputPh = "พิมพ์ Delete";
    sheetActions = [
      {
        label: okP ? "ลบสถานที่นี้" : "พิมพ์ Delete ให้ถูกต้องก่อน",
        style: okP ? DANGER : SEC + ";opacity:.6",
        on: () => {
          if (!okP) return flash("ต้องพิมพ์ Delete เพื่อยืนยัน");
          if (dispatch({ type: "delPlace", code: sheet.code }, () => `ลบสถานที่ ${sheet.code} แล้ว`))
            set({ sheet: null, sheetText: "" });
        },
      },
      { label: "ยกเลิก", style: SEC, on: () => set({ sheet: null, sheetText: "" }) },
    ];
  }

  if (sheet?.kind === "delItem") {
    const ok = s.sheetText.trim().toLowerCase() === "delete";
    sheetTitle = `ลบ “${sheet.name}” ออกจากระบบ?`;
    sheetSub = "พิมพ์คำว่า Delete เพื่อยืนยัน — ประวัติเดิมยังอยู่ใน Audit trail";
    sheetHasInput = true;
    sheetInputPh = "พิมพ์ Delete";
    sheetActions = [
      {
        label: ok ? "ลบรายการนี้" : "พิมพ์ Delete ให้ถูกต้องก่อน",
        style: ok ? DANGER : SEC + ";opacity:.6",
        on: () => {
          if (!ok) return flash("ต้องพิมพ์ Delete เพื่อยืนยัน");
          if (dispatch({ type: "delItem", id: sheet.id }, () => `ลบ “${sheet.name}” แล้ว`))
            set({ sheet: null, sheetText: "" });
        },
      },
      { label: "ยกเลิก", style: SEC, on: () => set({ sheet: null, sheetText: "" }) },
    ];
  }

  if (sheet?.kind === "delPending") {
    sheetTitle = `ลบ “${sheet.name}” ออกจากรายการรอบันทึก?`;
    sheetSub = "รูปที่แนบไว้จะไม่ถูกบันทึกเข้าระบบ";
    sheetActions = [
      {
        label: "ลบทิ้ง",
        style: DANGER,
        on: () => {
          set({ pending: s.pending.filter((x) => x.id !== sheet.id), sheet: null });
          flash("ลบรายการรอบันทึกแล้ว");
        },
      },
      { label: "ยกเลิก", style: SEC, on: () => set({ sheet: null }) },
    ];
  }

  if (sheet?.kind === "buy") {
    sheetTitle = `ซื้อ “${sheet.name}” สำเร็จแล้วใช่ไหม?`;
    sheetSub = "ยืนยันแล้วจะย้ายไปกลุ่มซื้อแล้ว แต่ stock จะเพิ่มเมื่อบันทึก ADD";
    sheetActions = [
      {
        label: "ยืนยัน",
        style: PRIM,
        on: () => buyItem(sheet.name),
      },
      { label: "ยกเลิก", style: SEC, on: () => set({ sheet: null }) },
    ];
  }

  const navItem = (key: Screen) => {
    const on =
      screen === key ||
      (key === "inv" && (screen === "use" || screen === "add" || screen === "move"));
    return {
      on: nav(key),
      style:
        "flex:1;min-width:0;border:none;cursor:pointer;border-radius:24px;padding:10px 4px 9px;color:" +
        (on ? "#4E3CB8" : "#9A90BC") +
        ";background:" +
        (on
          ? "linear-gradient(150deg,rgba(255,255,255,.95),rgba(232,224,250,.75))"
          : "transparent") +
        ";box-shadow:" +
        (on
          ? "0 8px 18px rgba(90,68,150,.18),inset 2px 3px 7px rgba(255,255,255,.95),inset -3px -4px 9px rgba(120,95,175,.18)"
          : "none") +
        ";display:flex;flex-direction:column;align-items:center;gap:4px;transition:color .2s ease",
      labelStyle: `font:500 10px Mitr,sans-serif;color:${on ? "#4E3CB8" : "#9A90BC"}`,
    };
  };

  const h = head();

  return {
    head: h,
    tone,
    todayLabel: "อาทิตย์ 6 ก.ย. 2569 · 09:12",
    homeHeadline: `ของพร้อมใช้ ${ready}% · ต้องดูด่วน ${expiring.length + out.length} รายการ`,
    stats: [
      { num: totalQty, label: "ชิ้นในบ้าน", numStyle: "font:500 21px Mitr,sans-serif;color:#ffffff" },
      { num: expiring.length, label: "ใกล้หมดอายุ", numStyle: "font:500 21px Mitr,sans-serif;color:#FFD98A" },
      { num: shop.length, label: "ต้องซื้อ", numStyle: "font:500 21px Mitr,sans-serif;color:#FFB3A6" },
    ],
    goPending: nav("pending"),
    pendingCount: s.pending.length,
    quickActions: [
      { label: "เก็บของ", sub: "ADD · หลายรายการ", sign: "+", on: nav("add"), dot: "width:40px;height:40px;border-radius:14px;display:grid;place-items:center;font:500 20px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:5px 6px 14px rgba(90,68,180,.3),inset 2px 2px 5px rgba(255,255,255,.3)" },
      { label: "ค้นหาของ", sub: "สถานที่ / ชื่อของ", sign: "⌕", on: nav("inv"), dot: "width:40px;height:40px;border-radius:14px;display:grid;place-items:center;font:500 20px Mitr,sans-serif;color:#5B49C9;background:#EFE9FC;box-shadow:inset 3px 4px 9px rgba(120,95,175,.2),inset -2px -2px 7px #ffffff" },
      { label: "ย้ายของ", sub: "MOVE · เปลี่ยนที่เก็บ", sign: "⇄", on: nav("move"), dot: "width:40px;height:40px;border-radius:14px;display:grid;place-items:center;font:500 18px Mitr,sans-serif;color:#2E8F86;background:#E4F5F1;box-shadow:inset 3px 4px 9px rgba(46,143,134,.18),inset -2px -2px 7px #ffffff" },
      { label: "ใช้ของ", sub: "USE · ตัดยอด", sign: "–", on: nav("use"), dot: "width:40px;height:40px;border-radius:14px;display:grid;place-items:center;font:500 20px Mitr,sans-serif;color:#C4692F;background:#FFEFE4;box-shadow:inset 3px 4px 9px rgba(196,105,47,.18),inset -2px -2px 7px #ffffff" },
    ],
    showAlerts: true,
    alerts: alerts.slice(0, 5),
    lineSummary: `📦 ใกล้หมดอายุ ${expiring.length} รายการ · ของหมด ${out.length} รายการ\n🛒 ต้องซื้อ ${shop.length} รายการ · รอบันทึก ${s.pending.length} รูป`,

    pendingList,
    pendingEmpty: s.pending.length === 0,

    camShootItem: () => openCamera("cam"),
    camShootPlace: () => openCamera("cam"),
    camClear: () => {
      revoke(s.camShots);
      set({ camShots: [] });
    },
    camClearStyle: s.camShots.length ? ghost() : "display:none",
    camCount: s.camShots.length,
    camThumbs: s.camShots.map((sh, si) => ({
      key: si,
      src: shotSrc(sh),
      on: () =>
        set({ viewer: { shots: s.camShots.map(shotSrc), idx: si, src: "รูปที่ถ่ายในแอพ" } }),
    })),
    camEvents,
    uploading: s.uploading,
    camSave: () => {
      if (!s.camShots.length) return flash("ถ่ายรูปอย่างน้อย 1 รูปก่อน");
      set({ sheet: { kind: "cam" } });
    },
    // draft photos on the add/move/use screens
    draftThumbs: s.draftPhotos.map((sh, si) => ({
      key: si,
      src: shotSrc(sh),
      remove: () => {
        if (sh.local) URL.revokeObjectURL(sh.local);
        set({ draftPhotos: s.draftPhotos.filter((_, i) => i !== si) });
      },
      on: () =>
        set({ viewer: { shots: s.draftPhotos.map(shotSrc), idx: si, src: "รูปที่จะแนบ" } }),
    })),
    addDraftPhoto: () => openCamera("draft"),

    ownerChips: (["เก่ง", "omo"] as const).map((o) => ({
      label: o,
      style: chip(s.owner === o, true),
      on: () => set({ owner: o }),
    })),

    addRows,
    addRow: () => set({ addRows: [...s.addRows, freshAddRow()] }),
    addSaveLabel: `บันทึกเก็บของ ${s.addRows.length} รายการ`,

    moveRows,
    moveAddRow: () => set({ moveRows: [...s.moveRows, freshMoveRow()] }),
    moveSaveLabel: `บันทึกการย้าย ${s.moveRows.length} รายการ`,

    useQuery: s.useQuery,
    setUseQuery: (e: ChangeEvent<HTMLInputElement>) => set({ useQuery: e.target.value, useId: null }),
    useSuggest,
    useCount: useSuggest.length,
    usePicked: !!usePick,
    useName: usePick ? usePick.name : "",
    useMeta: usePick ? `${usePick.loc} — เหลือ ${usePick.qty}` : "",
    useQty: s.useQty,
    useInc: () => set({ useQty: Math.min(usePick ? usePick.qty : 99, s.useQty + 1) }),
    useDec: () => set({ useQty: Math.max(1, s.useQty - 1) }),
    useWarn,
    useWarnStyle,

    invQuery: s.invQuery,
    setInvQuery: (e: ChangeEvent<HTMLInputElement>) => set({ invQuery: e.target.value, invLoc: null }),
    invModes: ([["all", "ทั้งหมด"], ["loc", "สถานที่"], ["item", "สิ่งของ"]] as const).map((m) => ({
      label: m[1],
      style: chip(s.invMode === m[0] && !s.invLoc, true),
      on: () => set({ invMode: m[0], invLoc: null }),
    })),
    invShowLocs: showLocs,
    invLocCount: locMatch.length,
    invLocs: locMatch.map((l) => ({
      key: l.code,
      code: l.code,
      name: l.name,
      room: l.room,
      count: `${items.filter((i) => i.loc === l.code).reduce((a, i) => a + i.qty, 0)} ชิ้น`,
      on: () => set({ invLoc: l.code, invQuery: l.name }),
    })),
    invShowItems: showItems,
    invItemCount: invItems.length,
    invItems,

    histModes: ([["item", "ชื่อของ"], ["date", "ช่วงเวลา"], ["loc", "สถานที่"]] as const).map((m) => ({
      label: m[1],
      style: chip(s.histMode === m[0], true),
      on: () => set({ histMode: m[0] }),
    })),
    histIsItem: s.histMode === "item",
    histIsDate: s.histMode === "date",
    histIsLoc: s.histMode === "loc",
    histQuery: s.histQuery,
    setHistQuery: (e: ChangeEvent<HTMLInputElement>) => set({ histQuery: e.target.value }),
    histLoc: s.histLoc,
    setHistLoc: (e: ChangeEvent<HTMLSelectElement>) => set({ histLoc: e.target.value }),
    histFrom: s.histFrom,
    setHistFrom: (e: ChangeEvent<HTMLInputElement>) => set({ histFrom: e.target.value }),
    histTo: s.histTo,
    setHistTo: (e: ChangeEvent<HTMLInputElement>) => set({ histTo: e.target.value }),
    histRanges: (
      [
        ["เมื่อวาน", localDateISO(1), localDateISO(1)],
        ["สัปดาห์นี้", localDateISO(6), localDateISO(0)],
        ["30 วัน", localDateISO(30), localDateISO(0)],
      ] as [string, string, string][]
    ).map((dr) => ({
      label: dr[0],
      style: chip(s.histFrom === dr[1] && s.histTo === dr[2], false),
      on: () => set({ histFrom: dr[1], histTo: dr[2] }),
    })),
    locOptions: s.locs,
    histCount: histList.length,
    histList,

    shopGroups,

    tones: (["lilac", "peach", "mint"] as const).map((k) => {
      const t = TONE[k];
      const on = (s.tone || "lilac") === k;
      return {
        key: k,
        label: t.label,
        on: () => set({ tone: k }),
        style:
          "flex:1;border:none;cursor:pointer;border-radius:22px;padding:14px 10px;background:#FBF6FE;box-shadow:" +
          (on
            ? "inset 4px 5px 12px rgba(120,95,175,.2),inset -3px -3px 9px #ffffff"
            : "8px 10px 22px rgba(120,95,175,.16),-5px -6px 14px #ffffff"),
        swatch: `width:100%;height:34px;border-radius:14px;background:${t.sw};box-shadow:inset 2px 3px 7px rgba(255,255,255,.35),3px 4px 10px rgba(90,68,180,.25)`,
      };
    }),
    setTabs: ([["places", "สถานที่จัดเก็บ"], ["items", "รายการของในบ้าน"]] as const).map((t) => ({
      label: t[1],
      style: chip(s.setTab === t[0], true),
      on: () => set({ setTab: t[0] }),
    })),
    isSetPlaces: s.setTab === "places",
    isSetItems: s.setTab === "items",
    placeQuery: s.placeQuery,
    setPlaceQuery: (e: ChangeEvent<HTMLInputElement>) => set({ placeQuery: e.target.value }),
    placeCount: s.locs.length,
    placeEmpty: placeRows.length === 0,
    placeRows,
    placeAddOpen: () => set({ sheet: { kind: "newPlace" }, sheetText: "" }),
    setRows,
    setCount: setRows.length,
    setEmpty: setRows.length === 0,
    setQuery: s.setQuery,
    setSetQuery: (e: ChangeEvent<HTMLInputElement>) => set({ setQuery: e.target.value }),
    setAddOpen: () => set({ sheet: { kind: "newItem" }, sheetText: "" }),

    // viewer
    viewerSrc: s.viewer ? s.viewer.shots[s.viewer.idx] : "",
    viewerMeta: s.viewer ? `${s.viewer.src} · ${s.viewer.idx + 1}/${s.viewer.shots.length}` : "",
    viewerHasMany: !!s.viewer && s.viewer.shots.length > 1,
    viewerReplace: s.viewer?.replaceCode
      ? () => {
          const code = s.viewer!.replaceCode!;
          set({ viewer: null });
          openPlacePhoto(code);
        }
      : undefined,
    viewerPrev: () => {
      const vv = s.viewer;
      if (!vv) return;
      set({ viewer: { ...vv, idx: (vv.idx - 1 + vv.shots.length) % vv.shots.length } });
    },
    viewerNext: () => {
      const vv = s.viewer;
      if (!vv) return;
      set({ viewer: { ...vv, idx: (vv.idx + 1) % vv.shots.length } });
    },
    closeViewer: () => set({ viewer: null }),

    // sheet
    sheetTitle,
    sheetSub,
    sheetDanger,
    sheetActions,
    sheetHasInput,
    sheetInputPh,
    sheetInputVal: s.sheetText,
    sheetInputSet: (e: ChangeEvent<HTMLInputElement>) => set({ sheetText: e.target.value }),
    sheetHasChips,
    sheetChips,
    sheetHasPlace,
    placeRoomChips,
    placeRoomIsNew,
    placeRoomCustom: s.placeRoomCustom,
    setPlaceRoomCustom: (e: ChangeEvent<HTMLInputElement>) =>
      set({ placeRoomCustom: e.target.value, placeCode: "" }),
    placeCodeVal,
    placeCodeHint,
    setPlaceCode: (e: ChangeEvent<HTMLInputElement>) =>
      set({ placeCode: e.target.value.toUpperCase() }),
    closeSheet: () => set({ sheet: null }),

    // centre-screen confirm
    confirm: s.confirm,
    confirmOk: () => {
      s.confirm?.onOk();
      set({ confirm: null });
    },
    confirmCancel: () => set({ confirm: null }),

    navHome: navItem("home"),
    navInv: navItem("inv"),
    navShop: navItem("shop"),
    navHist: navItem("hist"),

    onAddSave,
    onMoveSave,
    onUseSave,
  };
}

type V = ReturnType<typeof build>;

// ═══ screen components ═══════════════════════════════════════════════════════

function NavBtn({ item, label, children }: { item: V["navHome"]; label: string; children: ReactNode }) {
  return (
    <button onClick={item.on} style={st(item.style)}>
      {children}
      <div style={st(item.labelStyle)}>{label}</div>
    </button>
  );
}

function HomeScreen({ v }: { v: V }) {
  return (
    <div style={st("animation:clayIn .3s ease both")}>
      <div style={st("border-radius:30px;padding:20px 22px;background:linear-gradient(145deg,#7A6AE2 0%,#5B49C9 100%);box-shadow:12px 16px 30px rgba(90,68,180,.34),-6px -8px 18px rgba(255,255,255,.55),inset 3px 4px 8px rgba(255,255,255,.28),inset -4px -6px 12px rgba(40,20,90,.22)")}>
        <div style={st("font:400 11.5px 'IBM Plex Mono',monospace;color:#D6CEF7;letter-spacing:.6px")}>{v.todayLabel}</div>
        <div style={st("font:500 19px/1.4 Mitr,sans-serif;color:#ffffff;margin-top:6px")}>{v.homeHeadline}</div>
        <div style={st("display:flex;gap:10px;margin-top:16px")}>
          {v.stats.map((s2, i) => (
            <div key={i} style={st("flex:1;background:rgba(255,255,255,.16);border-radius:18px;padding:11px 12px;box-shadow:inset 2px 3px 6px rgba(40,20,90,.18)")}>
              <div style={st(s2.numStyle)}>{s2.num}</div>
              <div style={st("font:400 11px 'IBM Plex Sans Thai',sans-serif;color:#DDD6F8")}>{s2.label}</div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={v.goPending} style={st("width:100%;margin-top:15px;border:none;text-align:left;border-radius:26px;padding:15px 18px;background:#FBF6FE;box-shadow:10px 12px 26px rgba(120,95,175,.18),-6px -8px 18px #ffffff,inset 2px 2px 4px #ffffff;cursor:pointer;display:flex;align-items:center;gap:14px")}>
        <div style={st("width:44px;height:44px;flex:none;border-radius:15px;background:#FFEFE4;box-shadow:inset 3px 4px 8px rgba(200,120,70,.2),3px 4px 10px rgba(220,140,90,.18);display:grid;place-items:center;font:500 17px Mitr,sans-serif;color:#DE7440")}>{v.pendingCount}</div>
        <div style={st("flex:1")}>
          <div style={st("font:500 15px Mitr,sans-serif;color:#3A3254")}>รายการรอบันทึก</div>
          <div style={st("font:400 12px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>รูปจากแอพ และ LINE Official รออยู่</div>
        </div>
        <ChevronRight />
      </button>

      <div style={st("font:500 14px Mitr,sans-serif;color:#5B5375;margin:22px 0 10px")}>ทำอะไรดี</div>
      <div style={st("display:grid;grid-template-columns:1fr 1fr;gap:13px")}>
        {v.quickActions.map((q, i) => (
          <button key={i} onClick={q.on} style={st("border:none;text-align:left;border-radius:24px;padding:16px;background:#FBF6FE;box-shadow:9px 11px 24px rgba(120,95,175,.17),-6px -7px 16px #ffffff,inset 2px 2px 4px #ffffff;cursor:pointer")}>
            <div style={st(q.dot)}>{q.sign}</div>
            <div style={st("font:500 15px Mitr,sans-serif;color:#3A3254;margin-top:11px")}>{q.label}</div>
            <div style={st("font:400 11.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>{q.sub}</div>
          </button>
        ))}
      </div>

      {v.showAlerts && (
        <>
          <div style={st("font:500 14px Mitr,sans-serif;color:#5B5375;margin:24px 0 10px")}>การ์ดเตือน</div>
          <div style={st("display:flex;flex-direction:column;gap:12px")}>
            {v.alerts.map((a, i) => (
              <div key={i} style={st("border-radius:24px;padding:14px 16px;background:#FBF6FE;box-shadow:9px 11px 24px rgba(120,95,175,.16),-6px -7px 16px #ffffff;display:flex;align-items:center;gap:12px")}>
                <div style={st(a.pill)}>{a.tag}</div>
                <div style={st("flex:1;min-width:0")}>
                  <div style={st("font:500 14.5px Mitr,sans-serif;color:#3A3254")}>{a.name}</div>
                  <div style={st("font:400 11.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>{a.detail}</div>
                </div>
                <button onClick={a.on} style={st(a.ctaStyle ?? "border:none;flex:none;border-radius:14px;padding:9px 12px;font:500 12px Mitr,sans-serif;color:#5B49C9;background:#EFE9FC;box-shadow:inset 1px 1px 3px #ffffff,3px 4px 10px rgba(120,95,175,.18);cursor:pointer")}>{a.cta}</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={st("margin-top:20px;border-radius:22px;padding:14px 16px;background:#F1ECFA;box-shadow:inset 4px 5px 12px rgba(120,95,175,.16),inset -3px -4px 10px #ffffff")}>
        <div style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#8B82A6;letter-spacing:.5px")}>LINE DAILY SUMMARY · 09:00</div>
        <div style={st("font:400 12.5px/1.65 'IBM Plex Sans Thai',sans-serif;color:#5B5375;margin-top:6px;white-space:pre-line")}>{v.lineSummary}</div>
      </div>
    </div>
  );
}

function PendingScreen({ v }: { v: V }) {
  return (
    <div style={st("animation:clayIn .3s ease both;display:flex;flex-direction:column;gap:14px")}>
      {v.pendingList.map((p) => (
        <div key={p.key} style={st("border-radius:28px;padding:14px;background:#FBF6FE;box-shadow:10px 13px 28px rgba(120,95,175,.18),-6px -8px 18px #ffffff,inset 2px 2px 4px #ffffff")}>
          {p.shots.length > 0 && (
            <div style={st("display:flex;gap:10px;overflow-x:auto;padding-bottom:2px")}>
              {p.shots.map((sh, i) => (
                <PhotoTile key={i} src={sh.src} w={sh.w} onClick={sh.on} />
              ))}
            </div>
          )}
          <div style={st("display:flex;align-items:center;gap:8px;margin-top:12px")}>
            <div style={st("font:500 16px Mitr,sans-serif;color:#3A3254")}>{p.name}</div>
            <div style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#9A90BC")}>{p.src}</div>
            <button
              onClick={p.onDelete}
              style={st("margin-left:auto;flex:none;border:none;cursor:pointer;border-radius:12px;padding:6px 12px;font:500 11.5px Mitr,sans-serif;color:#C24A46;background:#FBE9E8;box-shadow:inset 2px 3px 7px rgba(194,74,70,.16),2px 3px 8px rgba(194,74,70,.12)")}
            >
              ลบทิ้ง
            </button>
          </div>
          <div style={st(p.statusStyle)}>{p.status}</div>
          <div style={st("display:flex;gap:8px;margin-top:12px;flex-wrap:wrap")}>
            {p.actions.map((ac, i) => (
              <button key={i} onClick={ac.on} style={st(ac.style)}>{ac.label}</button>
            ))}
          </div>
        </div>
      ))}
      {v.pendingEmpty && (
        <div style={st("border-radius:26px;padding:34px 20px;text-align:center;background:#F1ECFA;box-shadow:inset 5px 6px 14px rgba(120,95,175,.16),inset -4px -5px 12px #ffffff")}>
          <div style={st("font:500 15px Mitr,sans-serif;color:#5B5375")}>ไม่มีรายการรอบันทึก</div>
          <div style={st("font:400 12px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6;margin-top:4px")}>ถ่ายรูปของ หรือส่งรูปเข้า LINE Official</div>
        </div>
      )}
    </div>
  );
}

/** rounded photo tile with a lazy <img>; falls back to a soft placeholder while loading / on error */
function PhotoTile({
  src,
  w = 86,
  onClick,
  onRemove,
}: {
  src: string;
  w?: number;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        flex: "none",
        width: w,
        height: Math.round(w * 0.78),
        borderRadius: 18,
        overflow: "hidden",
        background: "#E9E1F6",
        boxShadow:
          "inset 3px 4px 9px rgba(90,68,150,.18),inset -2px -3px 8px rgba(255,255,255,.7)",
        cursor: onClick ? "zoom-in" : "default",
      }}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={st(
            "position:absolute;right:4px;top:4px;width:20px;height:20px;border:none;border-radius:8px;cursor:pointer;background:rgba(58,46,92,.82);color:#fff;font:500 12px Mitr,sans-serif;display:grid;place-items:center",
          )}
        >
          ×
        </button>
      )}
    </div>
  );
}

function CamScreen({ v }: { v: V }) {
  const last = v.camThumbs[v.camThumbs.length - 1];
  return (
    <div style={st("animation:clayIn .3s ease both")}>
      <div style={st("border-radius:30px;height:286px;overflow:hidden;background:repeating-linear-gradient(135deg,#E3DAF3 0 12px,#DAD0EE 12px 24px);box-shadow:inset 6px 8px 18px rgba(90,68,150,.22),inset -5px -6px 14px rgba(255,255,255,.6);display:grid;place-items:center;position:relative")}>
        {last ? (
          <img src={last.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <>
            <div style={st("text-align:center")}>
              <div style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#7C7299;letter-spacing:1.2px")}>CAMERA</div>
              <div style={st("font:400 12px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6;margin-top:6px")}>กดปุ่มเพื่อเปิดกล้อง</div>
            </div>
            <div style={st("position:absolute;left:16px;top:16px;width:34px;height:34px;border-left:3px solid #C3B7E2;border-top:3px solid #C3B7E2;border-radius:10px 0 0 0")} />
            <div style={st("position:absolute;right:16px;bottom:16px;width:34px;height:34px;border-right:3px solid #C3B7E2;border-bottom:3px solid #C3B7E2;border-radius:0 0 10px 0")} />
          </>
        )}
      </div>
      <div style={st("display:flex;align-items:center;justify-content:center;gap:20px;margin-top:18px")}>
        <button onClick={v.camShootItem} style={st("border:none;border-radius:18px;padding:13px 15px;font:500 12.5px Mitr,sans-serif;color:#5B5375;background:#F8F3FD;box-shadow:5px 6px 14px rgba(120,95,175,.16),-4px -5px 12px #ffffff;cursor:pointer")}>เปิดกล้อง</button>
        <button onClick={v.camShootItem} style={st("width:76px;height:76px;flex:none;border:none;border-radius:50%;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:10px 14px 26px rgba(90,68,180,.4),-6px -8px 16px rgba(255,255,255,.6),inset 3px 4px 8px rgba(255,255,255,.3),inset -4px -6px 10px rgba(40,20,90,.25);cursor:pointer;display:grid;place-items:center")}>
          <div style={st("width:26px;height:26px;border-radius:50%;border:3px solid rgba(255,255,255,.85)")} />
        </button>
        <button onClick={v.camShootPlace} style={st("border:none;border-radius:18px;padding:13px 15px;font:500 12.5px Mitr,sans-serif;color:#5B5375;background:#F8F3FD;box-shadow:5px 6px 14px rgba(120,95,175,.16),-4px -5px 12px #ffffff;cursor:pointer")}>เลือกจากคลัง</button>
      </div>
      <div style={st("display:flex;align-items:center;justify-content:space-between;margin:20px 0 9px")}>
        <div style={st("font:500 13.5px Mitr,sans-serif;color:#5B5375")}>รูปที่ถ่ายไว้ ({v.camCount})</div>
        <button onClick={v.camClear} style={st(v.camClearStyle)}>ล้างรูป</button>
      </div>
      <div style={st("display:flex;gap:10px;overflow-x:auto;min-height:70px")}>
        {v.camThumbs.map((s2) => (
          <PhotoTile key={s2.key} src={s2.src} onClick={s2.on} />
        ))}
      </div>
      <div style={st("font:500 13.5px Mitr,sans-serif;color:#5B5375;margin:18px 0 10px")}>ประเภทของการบันทึก</div>
      <div style={st("display:flex;gap:9px")}>
        {v.camEvents.map((e, i) => (
          <button key={i} onClick={e.on} style={st(e.style)}>{e.label}</button>
        ))}
      </div>
      <button disabled={v.uploading} onClick={v.camSave} style={st(`width:100%;margin-top:20px;border:none;border-radius:24px;padding:17px;font:500 16px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:10px 14px 26px rgba(90,68,180,.34),-5px -7px 14px rgba(255,255,255,.5),inset 2px 3px 6px rgba(255,255,255,.28);cursor:pointer${v.uploading ? ";opacity:.6" : ""}`)}>
        {v.uploading ? "กำลังอัปโหลด…" : "บันทึก"}
      </button>
    </div>
  );
}

/** photo strip for the add / move / use screens: draft thumbs + "add photo" */
function DraftPhotos({ v }: { v: V }) {
  return (
    <div style={st("display:flex;gap:10px;overflow-x:auto;margin:4px 0 14px;align-items:center")}>
      {v.draftThumbs.map((t) => (
        <PhotoTile key={t.key} src={t.src} w={72} onClick={t.on} onRemove={t.remove} />
      ))}
      <button
        onClick={v.addDraftPhoto}
        style={st(
          "flex:none;width:72px;height:56px;border:none;border-radius:18px;cursor:pointer;background:#F1ECFA;box-shadow:inset 3px 4px 9px rgba(120,95,175,.18),inset -2px -2px 7px #ffffff;color:#6A57D6;font:500 12px Mitr,sans-serif;display:grid;place-items:center",
        )}
      >
        + รูป
      </button>
    </div>
  );
}

function LocSuggestList({ rows }: { rows: { name: string; meta: string; on: () => void }[] }) {
  return (
    <div style={st("display:flex;flex-direction:column;gap:8px;margin-top:9px")}>
      {rows.map((l, i) => (
        <button key={i} onClick={l.on} style={st("border:none;text-align:left;border-radius:16px;padding:12px 14px;background:#F8F3FD;box-shadow:4px 5px 12px rgba(120,95,175,.14),-3px -3px 8px #ffffff;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px")}>
          <span style={st("font:400 13.5px 'IBM Plex Sans Thai',sans-serif;color:#3A3254")}>{l.name}</span>
          <span style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#9A90BC")}>{l.meta}</span>
        </button>
      ))}
    </div>
  );
}

function Stepper({
  value,
  dec,
  inc,
  size = 42,
}: {
  value: number | string;
  dec: () => void;
  inc: () => void;
  size?: number;
}) {
  return (
    <div style={st("display:flex;align-items:center;gap:12px")}>
      <button onClick={dec} style={st(`width:${size}px;height:${size}px;border:none;border-radius:15px;font:500 20px Mitr,sans-serif;color:#6A57D6;background:#F1ECFA;box-shadow:inset 3px 4px 9px rgba(120,95,175,.18),inset -2px -2px 7px #ffffff;cursor:pointer`)}>–</button>
      <div style={st("min-width:34px;text-align:center;font:500 18px Mitr,sans-serif;color:#3A3254")}>{value}</div>
      <button onClick={inc} style={st(`width:${size}px;height:${size}px;border:none;border-radius:15px;font:500 20px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:5px 6px 13px rgba(90,68,180,.3),-3px -4px 9px #ffffff,inset 2px 2px 5px rgba(255,255,255,.3);cursor:pointer`)}>+</button>
    </div>
  );
}

function OwnerChips({ v, label }: { v: V; label: string }) {
  return (
    <>
      <div style={st("font:500 13.5px Mitr,sans-serif;color:#5B5375;margin-bottom:9px")}>{label}</div>
      <div style={st("display:flex;gap:9px")}>
        {v.ownerChips.map((o, i) => (
          <button key={i} onClick={o.on} style={st(o.style)}>{o.label}</button>
        ))}
      </div>
    </>
  );
}

function AddScreen({ v }: { v: V }) {
  return (
    <div style={st("animation:clayIn .3s ease both")}>
      <OwnerChips v={v} label="ผู้เก็บ" />
      <div style={st("display:flex;flex-direction:column;gap:14px;margin-top:16px")}>
        {v.addRows.map((r) => (
          <div key={r.key} style={st("border-radius:28px;padding:17px;background:#FBF6FE;box-shadow:10px 13px 28px rgba(120,95,175,.18),-6px -8px 18px #ffffff,inset 2px 2px 4px #ffffff")}>
            <div style={st("display:flex;justify-content:space-between;align-items:center")}>
              <div style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#9A90BC")}>{r.tag}</div>
              <button onClick={r.remove} style={st(r.removeStyle)}>ลบ</button>
            </div>
            <div style={st("display:flex;gap:9px;margin-top:11px")}>
              <input value={r.name} onChange={r.setName} placeholder="ชื่อของ เช่น สาย usb type-c" style={st("flex:1;min-width:0;border:none;border-radius:18px;padding:14px 16px;font:400 14.5px 'IBM Plex Sans Thai',sans-serif;color:#3A3254;background:#F1ECFA;box-shadow:inset 4px 5px 10px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")} />
              <button onClick={r.mic} style={st("width:50px;flex:none;border:none;border-radius:18px;background:#EFE9FC;box-shadow:4px 5px 12px rgba(120,95,175,.2),-3px -4px 10px #ffffff;cursor:pointer;display:grid;place-items:center")}>
                <MicIcon />
              </button>
            </div>
            <div style={st("display:flex;gap:8px;margin-top:11px")}>
              {r.kinds.map((k, i) => (
                <button key={i} onClick={k.on} style={st(k.style)}>{k.label}</button>
              ))}
            </div>
            {r.isFood && (
              <div style={st("margin-top:12px;border-radius:20px;padding:13px 14px;background:#F1ECFA;box-shadow:inset 4px 5px 11px rgba(120,95,175,.16),inset -3px -3px 8px #ffffff")}>
                <div style={st("font:500 12.5px Mitr,sans-serif;color:#5B5375")}>วันหมดอายุ (EXP)</div>
                <div style={st("display:flex;gap:8px;margin-top:9px")}>
                  {r.expModes.map((m, i) => (
                    <button key={i} onClick={m.on} style={st(m.style)}>{m.label}</button>
                  ))}
                </div>
                <div style={st("display:flex;align-items:center;gap:10px;margin-top:10px")}>
                  <input value={r.expVal} onChange={r.setExp} type={r.expInputType} placeholder={r.expPlaceholder} style={st("flex:1;min-width:0;border:none;border-radius:15px;padding:12px 14px;font:400 13.5px 'IBM Plex Sans Thai',sans-serif;color:#3A3254;background:#FBF6FE;box-shadow:3px 4px 9px rgba(120,95,175,.15),-2px -2px 6px #ffffff")} />
                  <div style={st("font:400 11.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>{r.expHint}</div>
                </div>
              </div>
            )}
            <div style={st("display:flex;align-items:center;justify-content:space-between;margin-top:13px")}>
              <div style={st("font:500 12.5px Mitr,sans-serif;color:#5B5375")}>จำนวน</div>
              <Stepper value={r.qty} dec={r.dec} inc={r.inc} />
            </div>
            <div style={st("font:500 12.5px Mitr,sans-serif;color:#5B5375;margin:14px 0 8px")}>สถานที่เก็บ</div>
            <div style={st("display:flex;align-items:center;gap:10px;border-radius:18px;padding:4px 6px 4px 15px;background:#F1ECFA;box-shadow:inset 4px 5px 10px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")}>
              <SearchIcon size={15} />
              <input value={r.locQuery} onChange={r.setLocQuery} placeholder="พิมพ์ชื่อที่เก็บ เช่น ตู้ / ครัว / KIT" style={st("flex:1;min-width:0;border:none;background:transparent;padding:12px 0;font:400 14px 'IBM Plex Sans Thai',sans-serif;color:#3A3254")} />
              <button onClick={r.clearLoc} style={st(r.clearLocStyle)}>ล้าง</button>
            </div>
            {r.locPicked && (
              <div style={st("margin-top:9px;display:flex;align-items:center;gap:9px;border-radius:16px;padding:11px 13px;background:#EFE9FC;box-shadow:inset 3px 4px 9px rgba(120,95,175,.18),inset -2px -2px 7px #ffffff")}>
                <div style={st("font:500 10.5px 'IBM Plex Mono',monospace;color:#5B49C9;background:#FBF6FE;border-radius:9px;padding:5px 8px;box-shadow:2px 3px 7px rgba(120,95,175,.16)")}>{r.locCode}</div>
                <div style={st("font:400 13px 'IBM Plex Sans Thai',sans-serif;color:#3A3254")}>{r.locName}</div>
              </div>
            )}
            <LocSuggestList rows={r.locSuggest} />
          </div>
        ))}
      </div>
      <button onClick={v.addRow} style={st("width:100%;margin-top:14px;border:none;border-radius:22px;padding:15px;font:500 14px Mitr,sans-serif;color:#6A57D6;background:#F1ECFA;box-shadow:inset 4px 5px 12px rgba(120,95,175,.16),inset -3px -4px 10px #ffffff;cursor:pointer")}>+ เพิ่มรายการ</button>
      <div style={st("font:500 12.5px Mitr,sans-serif;color:#5B5375;margin:16px 0 4px")}>รูปประกอบ</div>
      <DraftPhotos v={v} />
      <button disabled={v.uploading} onClick={v.onAddSave} style={st(`width:100%;margin-top:6px;border:none;border-radius:24px;padding:17px;font:500 16px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:10px 14px 26px rgba(90,68,180,.34),-5px -7px 14px rgba(255,255,255,.5),inset 2px 3px 6px rgba(255,255,255,.28);cursor:pointer${v.uploading ? ";opacity:.6" : ""}`)}>{v.uploading ? "กำลังอัปโหลดรูป…" : v.addSaveLabel}</button>
    </div>
  );
}

function MoveScreen({ v }: { v: V }) {
  return (
    <div style={st("animation:clayIn .3s ease both")}>
      <OwnerChips v={v} label="ผู้ย้าย" />
      <div style={st("display:flex;flex-direction:column;gap:14px;margin-top:16px")}>
        {v.moveRows.map((r) => (
          <div key={r.key} style={st("border-radius:28px;padding:17px;background:#FBF6FE;box-shadow:10px 13px 28px rgba(120,95,175,.18),-6px -8px 18px #ffffff,inset 2px 2px 4px #ffffff")}>
            <div style={st("display:flex;justify-content:space-between;align-items:center")}>
              <div style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#9A90BC")}>{r.tag}</div>
              <button onClick={r.remove} style={st(r.removeStyle)}>ลบ</button>
            </div>
            <input value={r.query} onChange={r.setQuery} placeholder="ค้นหาของที่มีอยู่ (พิมพ์ชื่อไม่ได้เอง)" style={st("width:100%;margin-top:11px;border:none;border-radius:18px;padding:14px 16px;font:400 14px 'IBM Plex Sans Thai',sans-serif;color:#3A3254;background:#F1ECFA;box-shadow:inset 4px 5px 10px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")} />
            <div style={st("display:flex;flex-direction:column;gap:8px;margin-top:10px")}>
              {r.suggest.map((sg, i) => (
                <button key={i} onClick={sg.on} style={st("border:none;text-align:left;border-radius:16px;padding:12px 14px;background:#F8F3FD;box-shadow:4px 5px 12px rgba(120,95,175,.14),-3px -3px 8px #ffffff;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px")}>
                  <span style={st("font:400 13.5px 'IBM Plex Sans Thai',sans-serif;color:#3A3254")}>{sg.name}</span>
                  <span style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#9A90BC")}>{sg.meta}</span>
                </button>
              ))}
            </div>
            {r.picked && (
              <div style={st("margin-top:12px;border-radius:20px;padding:14px;background:#EFE9FC;box-shadow:inset 4px 5px 11px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")}>
                <div style={st("display:flex;justify-content:space-between;align-items:center;gap:8px")}>
                  <div style={st("font:500 15px Mitr,sans-serif;color:#3A3254")}>{r.pickedName}</div>
                  <div style={st("font:500 11.5px Mitr,sans-serif;color:#5B49C9")}>{r.pickedMeta}</div>
                </div>
                <div style={st("display:flex;align-items:center;gap:9px;margin-top:10px;flex-wrap:wrap")}>
                  <div style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#9A90BC;letter-spacing:.4px")}>จาก</div>
                  <div style={st(r.fromCodeStyle)}>{r.fromCode}</div>
                  <div style={st("font:400 12px 'IBM Plex Sans Thai',sans-serif;color:#5B5375")}>{r.fromName}</div>
                </div>
                <div style={st("display:flex;align-items:center;justify-content:space-between;margin-top:12px")}>
                  <div style={st("font:500 12.5px Mitr,sans-serif;color:#5B5375")}>จำนวนที่ย้าย</div>
                  <Stepper value={r.qty} dec={r.dec} inc={r.inc} />
                </div>
              </div>
            )}
            <div style={st("font:500 12.5px Mitr,sans-serif;color:#5B5375;margin:14px 0 8px")}>ย้ายไปที่</div>
            <div style={st("display:flex;align-items:center;gap:10px;border-radius:18px;padding:4px 6px 4px 15px;background:#F1ECFA;box-shadow:inset 4px 5px 10px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")}>
              <SearchIcon size={15} />
              <input value={r.locQuery} onChange={r.setLocQuery} placeholder="พิมพ์ที่เก็บใหม่ เช่น ตู้ / ห้องน้ำ / BAT" style={st("flex:1;min-width:0;border:none;background:transparent;padding:12px 0;font:400 14px 'IBM Plex Sans Thai',sans-serif;color:#3A3254")} />
              <button onClick={r.clearLoc} style={st(r.clearLocStyle)}>ล้าง</button>
            </div>
            {r.locPicked && (
              <div style={st("margin-top:9px;display:flex;align-items:center;gap:9px;border-radius:16px;padding:11px 13px;background:#EFE9FC;box-shadow:inset 3px 4px 9px rgba(120,95,175,.18),inset -2px -2px 7px #ffffff")}>
                <div style={st("font:500 10.5px 'IBM Plex Mono',monospace;color:#5B49C9;background:#FBF6FE;border-radius:9px;padding:5px 8px;box-shadow:2px 3px 7px rgba(120,95,175,.16)")}>{r.locCode}</div>
                <div style={st("font:400 13px 'IBM Plex Sans Thai',sans-serif;color:#3A3254")}>{r.locName}</div>
              </div>
            )}
            <LocSuggestList rows={r.locSuggest} />
          </div>
        ))}
      </div>
      <button onClick={v.moveAddRow} style={st("width:100%;margin-top:14px;border:none;border-radius:22px;padding:15px;font:500 14px Mitr,sans-serif;color:#6A57D6;background:#F1ECFA;box-shadow:inset 4px 5px 12px rgba(120,95,175,.16),inset -3px -4px 10px #ffffff;cursor:pointer")}>+ เพิ่มรายการ</button>
      <div style={st("font:500 12.5px Mitr,sans-serif;color:#5B5375;margin:16px 0 4px")}>รูปประกอบ</div>
      <DraftPhotos v={v} />
      <button disabled={v.uploading} onClick={v.onMoveSave} style={st(`width:100%;margin-top:6px;border:none;border-radius:24px;padding:17px;font:500 16px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:10px 14px 26px rgba(90,68,180,.34),-5px -7px 14px rgba(255,255,255,.5);cursor:pointer${v.uploading ? ";opacity:.6" : ""}`)}>{v.uploading ? "กำลังอัปโหลดรูป…" : v.moveSaveLabel}</button>
    </div>
  );
}

function UseScreen({ v }: { v: V }) {
  return (
    <div style={st("animation:clayIn .3s ease both;display:flex;flex-direction:column;min-height:100%")}>
      <div style={st("display:flex;align-items:center;gap:10px;border-radius:22px;padding:5px 6px 5px 16px;background:#F1ECFA;box-shadow:inset 4px 5px 11px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")}>
        <SearchIcon />
        <input value={v.useQuery} onChange={v.setUseQuery} placeholder="ค้นหาของที่จะใช้" style={st("flex:1;min-width:0;border:none;background:transparent;padding:13px 0;font:400 14.5px 'IBM Plex Sans Thai',sans-serif;color:#3A3254")} />
      </div>
      <div style={st("display:flex;align-items:center;justify-content:space-between;margin-top:15px")}>
        <div style={st("font:500 13px Mitr,sans-serif;color:#5B5375")}>ของทั้งหมดในบ้าน ({v.useCount})</div>
        <div style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#9A90BC")}>เลื่อนขึ้น–ลงเพื่อดูทั้งหมด</div>
      </div>
      <div data-scroll="1" style={st("display:flex;flex-direction:column;gap:10px;margin-top:10px;flex:1;min-height:140px;overflow-y:auto;padding:2px 8px 2px 2px;border-radius:24px")}>
        {v.useSuggest.map((s2, i) => (
          <button key={i} onClick={s2.on} style={st(s2.style)}>
            <div style={st("flex:1;min-width:0;text-align:left")}>
              <div style={st("font:500 14.5px Mitr,sans-serif;color:#3A3254")}>{s2.name}</div>
              <div style={st("font:400 11.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>{s2.loc}</div>
            </div>
            <div style={st("display:flex;flex-direction:column;align-items:flex-end;gap:6px")}>
              <div style={st("font:500 14px Mitr,sans-serif;color:#5B49C9")}>{s2.left}</div>
              <div style={st(s2.codeStyle)}>{s2.code}</div>
            </div>
          </button>
        ))}
      </div>
      {v.usePicked && (
        <div style={st("margin-top:16px;border-radius:28px;padding:20px;background:#FBF6FE;box-shadow:10px 13px 28px rgba(120,95,175,.18),-6px -8px 18px #ffffff,inset 2px 2px 4px #ffffff")}>
          <div style={st("font:500 18px Mitr,sans-serif;color:#3A3254")}>{v.useName}</div>
          <div style={st("font:400 11.5px 'IBM Plex Mono',monospace;color:#6A57D6;margin-top:3px")}>{v.useMeta}</div>
          <div style={st("display:flex;align-items:center;justify-content:space-between;margin-top:16px")}>
            <div style={st("font:500 13px Mitr,sans-serif;color:#5B5375")}>จำนวนที่ใช้</div>
            <Stepper value={v.useQty} dec={v.useDec} inc={v.useInc} size={46} />
          </div>
          <div style={st(v.useWarnStyle)}>{v.useWarn}</div>
          <div style={st("font:500 12.5px Mitr,sans-serif;color:#5B5375;margin:14px 0 4px")}>รูปประกอบ</div>
          <DraftPhotos v={v} />
          <button disabled={v.uploading} onClick={v.onUseSave} style={st(`width:100%;margin-top:4px;border:none;border-radius:22px;padding:16px;font:500 15.5px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:8px 11px 22px rgba(90,68,180,.32),-4px -6px 12px rgba(255,255,255,.5);cursor:pointer${v.uploading ? ";opacity:.6" : ""}`)}>{v.uploading ? "กำลังอัปโหลดรูป…" : "บันทึกการใช้"}</button>
        </div>
      )}
    </div>
  );
}

function InvScreen({ v }: { v: V }) {
  return (
    <div style={st("animation:clayIn .3s ease both")}>
      <div style={st("display:flex;align-items:center;gap:10px;border-radius:22px;padding:5px 6px 5px 16px;background:#F1ECFA;box-shadow:inset 4px 5px 11px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")}>
        <SearchIcon />
        <input value={v.invQuery} onChange={v.setInvQuery} placeholder="พิมพ์ ตู้ / ชื่อของ / รหัส เช่น KIT" style={st("flex:1;min-width:0;border:none;background:transparent;padding:13px 0;font:400 14.5px 'IBM Plex Sans Thai',sans-serif;color:#3A3254")} />
      </div>
      <div style={st("display:flex;gap:9px;margin-top:13px")}>
        {v.invModes.map((m, i) => (
          <button key={i} onClick={m.on} style={st(m.style)}>{m.label}</button>
        ))}
      </div>
      {v.invShowLocs && (
        <>
          <div style={st("font:500 13px Mitr,sans-serif;color:#5B5375;margin:20px 0 10px")}>สถานที่ ({v.invLocCount})</div>
          <div style={st("display:flex;flex-direction:column;gap:11px")}>
            {v.invLocs.map((l) => (
              <button key={l.key} onClick={l.on} style={st("border:none;text-align:left;border-radius:22px;padding:15px 17px;background:#FBF6FE;box-shadow:8px 10px 22px rgba(120,95,175,.16),-5px -6px 14px #ffffff,inset 2px 2px 4px #ffffff;cursor:pointer;display:flex;align-items:center;gap:12px")}>
                <div style={st("flex:none;border-radius:13px;padding:9px 10px;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:4px 5px 12px rgba(90,68,180,.3),inset 2px 2px 5px rgba(255,255,255,.28);font:500 11px 'IBM Plex Mono',monospace;color:#ffffff;letter-spacing:.5px")}>{l.code}</div>
                <div style={st("flex:1;min-width:0")}>
                  <div style={st("font:500 14.5px Mitr,sans-serif;color:#3A3254")}>{l.name}</div>
                  <div style={st("font:400 11.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>{l.room}</div>
                </div>
                <div style={st("font:500 13px Mitr,sans-serif;color:#5B49C9")}>{l.count}</div>
              </button>
            ))}
          </div>
        </>
      )}
      {v.invShowItems && (
        <>
          <div style={st("font:500 13px Mitr,sans-serif;color:#5B5375;margin:20px 0 10px")}>สิ่งของ ({v.invItemCount})</div>
          <div style={st("display:flex;flex-direction:column;gap:11px")}>
            {v.invItems.map((i2) => (
              <div key={i2.key} style={st("border-radius:22px;padding:15px 17px;background:#FBF6FE;box-shadow:8px 10px 22px rgba(120,95,175,.16),-5px -6px 14px #ffffff,inset 2px 2px 4px #ffffff")}>
                <div style={st("display:flex;align-items:center;gap:10px")}>
                  {i2.photo && (
                    <div onClick={i2.openPhotos} style={st("position:relative;flex:none;width:46px;height:46px;border-radius:13px;overflow:hidden;cursor:zoom-in;box-shadow:inset 2px 3px 7px rgba(90,68,150,.18)")}>
                      <img src={i2.photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      {i2.photoCount > 1 && (
                        <span style={st("position:absolute;right:2px;bottom:2px;font:500 8.5px 'IBM Plex Mono',monospace;color:#fff;background:rgba(58,46,92,.8);border-radius:6px;padding:1px 4px")}>{i2.photoCount}</span>
                      )}
                    </div>
                  )}
                  <div style={st("flex:1;min-width:0")}>
                    <div style={st("font:500 15px Mitr,sans-serif;color:#3A3254")}>{i2.name}</div>
                    <div style={st("display:flex;align-items:center;gap:7px;margin-top:5px")}>
                      <div style={st(i2.codeStyle)}>{i2.code}</div>
                      <div style={st("font:400 11.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>{i2.locLabel}</div>
                    </div>
                  </div>
                  <div style={st(i2.qtyStyle)}>{i2.qtyLabel}</div>
                </div>
                <div style={st("display:flex;gap:14px;margin-top:10px;flex-wrap:wrap")}>
                  <div style={st("font:400 11px 'IBM Plex Mono',monospace;color:#9A90BC")}>อัปเดต {i2.date}</div>
                  <div style={st(i2.expStyle)}>{i2.expLabel}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HistScreen({ v }: { v: V }) {
  return (
    <div style={st("animation:clayIn .3s ease both")}>
      <div style={st("display:flex;gap:9px")}>
        {v.histModes.map((m, i) => (
          <button key={i} onClick={m.on} style={st(m.style)}>{m.label}</button>
        ))}
      </div>
      <div style={st("margin-top:13px")}>
        {v.histIsDate && (
          <>
            <div style={st("display:flex;gap:9px;flex-wrap:wrap")}>
              {v.histRanges.map((dr, i) => (
                <button key={i} onClick={dr.on} style={st(dr.style)}>{dr.label}</button>
              ))}
            </div>
            <div style={st("display:flex;gap:10px;margin-top:11px")}>
              <input value={v.histFrom} onChange={v.setHistFrom} type="date" style={st("flex:1;min-width:0;border:none;border-radius:16px;padding:13px 14px;font:400 13px 'IBM Plex Mono',monospace;color:#3A3254;background:#F1ECFA;box-shadow:inset 4px 5px 10px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")} />
              <input value={v.histTo} onChange={v.setHistTo} type="date" style={st("flex:1;min-width:0;border:none;border-radius:16px;padding:13px 14px;font:400 13px 'IBM Plex Mono',monospace;color:#3A3254;background:#F1ECFA;box-shadow:inset 4px 5px 10px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")} />
            </div>
          </>
        )}
        {v.histIsLoc && (
          <select value={v.histLoc} onChange={v.setHistLoc} style={st("width:100%;border:none;appearance:none;border-radius:18px;padding:14px 16px;font:400 14px 'IBM Plex Sans Thai',sans-serif;color:#3A3254;background:#F1ECFA;box-shadow:inset 4px 5px 10px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff;cursor:pointer")}>
            <option value="">— ทุกสถานที่ —</option>
            {v.locOptions.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        )}
        {v.histIsItem && (
          <input value={v.histQuery} onChange={v.setHistQuery} placeholder="พิมพ์ชื่อของ เช่น สบู่" style={st("width:100%;border:none;border-radius:18px;padding:14px 16px;font:400 14px 'IBM Plex Sans Thai',sans-serif;color:#3A3254;background:#F1ECFA;box-shadow:inset 4px 5px 10px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")} />
        )}
      </div>
      <div style={st("font:400 11px 'IBM Plex Mono',monospace;color:#9A90BC;margin:18px 0 10px;letter-spacing:.4px")}>AUDIT TRAIL · ดูได้เท่านั้น แก้ไขไม่ได้ · {v.histCount} รายการ</div>
      <div style={st("display:flex;flex-direction:column;gap:0")}>
        {v.histList.map((hh) => (
          <div key={hh.key} style={st("display:flex;gap:13px")}>
            <div style={st("width:34px;flex:none;display:flex;flex-direction:column;align-items:center")}>
              <div style={st(hh.dot)} />
              <div style={st("flex:1;width:2px;background:#DED5F0;border-radius:2px")} />
            </div>
            <div style={st("flex:1;min-width:0;padding-bottom:14px")}>
              <div style={st(hh.cardStyle)}>
                <div style={st("display:flex;justify-content:space-between;gap:8px;align-items:baseline")}>
                  <div style={st(hh.titleStyle)}>{hh.title}</div>
                  <div style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#9A90BC")}>{hh.date}</div>
                </div>
                <div style={st("display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:8px")}>
                  <div style={st(hh.codeStyle)}>{hh.codeLabel}</div>
                  <div style={st("font:400 11.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>{hh.detail}</div>
                </div>
                <div style={st("display:flex;align-items:center;gap:8px;margin-top:9px")}>
                  <div style={st(hh.avatarStyle)}>{hh.initial}</div>
                  <div style={st(hh.whoStyle)}>{hh.who}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShopScreen({ v }: { v: V }) {
  return (
    <div style={st("animation:clayIn .3s ease both")}>
      {v.shopGroups.map((g) => (
        <div key={g.key} style={st("margin-bottom:22px")}>
          <div style={st("display:flex;align-items:center;gap:9px;margin-bottom:11px")}>
            <div style={st(g.dot)} />
            <div style={st("font:500 14.5px Mitr,sans-serif;color:#3A3254")}>{g.title}</div>
            <div style={st("font:400 11.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>{g.count}</div>
          </div>
          <div style={st("display:flex;flex-direction:column;gap:11px")}>
            {g.rows.map((r) => (
              <div key={r.key} style={st(r.cardStyle)}>
                <button onClick={r.on} style={st(r.tickStyle)}>{r.tick}</button>
                <div style={st("flex:1;min-width:0")}>
                  <div style={st(r.nameStyle)}>{r.name}</div>
                  <div style={st("font:400 11.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>{r.detail}</div>
                </div>
                <div style={st(r.codeStyle)}>{r.code}</div>
                {r.onTrash && (
                  <button
                    onClick={r.onTrash}
                    style={st("width:28px;height:28px;flex:none;border:none;border-radius:9px;cursor:pointer;background:#FBE9E8;box-shadow:inset 2px 2px 6px rgba(194,74,70,.16);display:grid;place-items:center")}
                  >
                    <TrashIcon color="#C24A46" w={12} />
                  </button>
                )}
              </div>
            ))}
            {g.empty && (
              <div style={st("border-radius:20px;padding:18px;text-align:center;font:400 12.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6;background:#F1ECFA;box-shadow:inset 4px 5px 12px rgba(120,95,175,.14),inset -3px -3px 9px #ffffff")}>ไม่มีรายการ</div>
            )}
          </div>
        </div>
      ))}
      <div style={st("border-radius:22px;padding:14px 16px;background:#F1ECFA;box-shadow:inset 4px 5px 12px rgba(120,95,175,.16),inset -3px -4px 10px #ffffff")}>
        <div style={st("font:400 12.5px/1.6 'IBM Plex Sans Thai',sans-serif;color:#5B5375")}>ติ๊กแล้วจะย้ายไปกลุ่ม “ซื้อแล้ว” แต่ยังไม่เพิ่ม stock จนกว่าจะบันทึก ADD</div>
      </div>
    </div>
  );
}

function SetScreen({ v }: { v: V }) {
  return (
    <div style={st("animation:clayIn .3s ease both")}>
      <div style={st("font:500 13.5px Mitr,sans-serif;color:#5B5375;margin-bottom:10px")}>โทนสี clay</div>
      <div style={st("display:flex;gap:11px")}>
        {v.tones.map((t) => (
          <button key={t.key} onClick={t.on} style={st(t.style)}>
            <div style={st(t.swatch)} />
            <div style={st("font:500 12.5px Mitr,sans-serif;color:#3A3254;margin-top:8px")}>{t.label}</div>
          </button>
        ))}
      </div>
      <div style={st("display:flex;gap:9px;margin-top:22px")}>
        {v.setTabs.map((t, i) => (
          <button key={i} onClick={t.on} style={st(t.style)}>{t.label}</button>
        ))}
      </div>

      {v.isSetPlaces && (
        <>
          <div style={st("display:flex;align-items:center;justify-content:space-between;margin:20px 0 10px;gap:10px")}>
            <div style={st("font:500 13.5px Mitr,sans-serif;color:#5B5375")}>สถานที่จัดเก็บ ({v.placeCount})</div>
            <button onClick={v.placeAddOpen} style={st("border:none;cursor:pointer;border-radius:15px;padding:10px 14px;font:500 12.5px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:5px 7px 15px rgba(90,68,180,.32),-3px -4px 10px rgba(255,255,255,.6)")}>+ เพิ่มสถานที่</button>
          </div>
          <div style={st("display:flex;align-items:center;gap:10px;border-radius:20px;padding:4px 6px 4px 15px;background:#F1ECFA;box-shadow:inset 4px 5px 11px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")}>
            <SearchIcon size={15} />
            <input value={v.placeQuery} onChange={v.setPlaceQuery} placeholder="ค้นหาชื่อสถานที่ / ห้อง / รหัส" style={st("flex:1;min-width:0;border:none;background:transparent;padding:12px 0;font:400 13.5px 'IBM Plex Sans Thai',sans-serif;color:#3A3254")} />
          </div>
          <div style={st("display:flex;flex-direction:column;gap:11px;margin-top:13px")}>
            {v.placeRows.map((p) => (
              <div key={p.key} style={st("border-radius:24px;padding:15px;background:#FBF6FE;box-shadow:8px 10px 22px rgba(120,95,175,.16),-5px -6px 14px #ffffff,inset 2px 2px 4px #ffffff")}>
                <div style={st("display:flex;align-items:center;gap:10px")}>
                  <input value={p.code} onChange={p.setCode} style={st("width:104px;flex:none;border:none;border-radius:13px;padding:10px 11px;text-align:center;font:500 12px 'IBM Plex Mono',monospace;letter-spacing:.6px;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:4px 5px 12px rgba(90,68,180,.3),inset 2px 2px 5px rgba(255,255,255,.28)")} />
                  <input value={p.name} onChange={p.setName} placeholder="สถานที่รอง เช่น ตู้กับข้าว" style={st("flex:1;min-width:0;border:none;border-radius:14px;padding:11px 13px;font:500 14px Mitr,sans-serif;color:#3A3254;background:#F1ECFA;box-shadow:inset 3px 4px 9px rgba(120,95,175,.16),inset -2px -2px 7px #ffffff")} />
                  <button onClick={p.del} style={st("width:30px;height:30px;flex:none;border:none;border-radius:10px;cursor:pointer;background:#FFE9E9;box-shadow:inset 2px 2px 6px rgba(201,82,79,.16);display:grid;place-items:center")}>
                    <TrashIcon />
                  </button>
                </div>
                <div style={st("display:flex;align-items:center;gap:10px;margin-top:10px")}>
                  <input value={p.room} onChange={p.setRoom} placeholder="สถานที่หลัก เช่น ห้องครัว" style={st("flex:1;min-width:0;border:none;border-radius:14px;padding:11px 13px;font:400 13px 'IBM Plex Sans Thai',sans-serif;letter-spacing:.2px;color:#6A57D6;background:#ECE6FB;box-shadow:inset 3px 4px 9px rgba(120,95,175,.16),inset -2px -2px 7px #ffffff")} />
                  {p.photo ? (
                    <div
                      onClick={p.viewPhoto}
                      style={st("position:relative;flex:none;width:40px;height:40px;border-radius:12px;overflow:hidden;cursor:zoom-in;box-shadow:inset 2px 3px 7px rgba(90,68,150,.18)")}
                    >
                      <img src={p.photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          p.removePhoto();
                        }}
                        style={st("position:absolute;right:1px;top:1px;width:16px;height:16px;border:none;border-radius:6px;cursor:pointer;background:rgba(58,46,92,.82);color:#fff;font:500 10px Mitr,sans-serif;display:grid;place-items:center")}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={p.addPhoto}
                      style={st("flex:none;width:40px;height:40px;border:none;border-radius:12px;cursor:pointer;background:#F1ECFA;box-shadow:inset 3px 4px 9px rgba(120,95,175,.18),inset -2px -2px 7px #ffffff;color:#6A57D6;font:500 18px Mitr,sans-serif;display:grid;place-items:center")}
                    >
                      +
                    </button>
                  )}
                  <div style={st("font:400 10.5px 'IBM Plex Mono',monospace;color:#9A90BC")}>{p.itemCount}</div>
                </div>
              </div>
            ))}
            {v.placeEmpty && (
              <div style={st("border-radius:20px;padding:22px;text-align:center;font:400 12.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6;background:#F1ECFA;box-shadow:inset 4px 5px 12px rgba(120,95,175,.14),inset -3px -3px 9px #ffffff")}>ไม่พบสถานที่ที่ค้นหา</div>
            )}
          </div>
        </>
      )}

      {v.isSetItems && (
        <>
          <div style={st("display:flex;align-items:center;justify-content:space-between;margin:20px 0 10px;gap:10px")}>
            <div style={st("font:500 13.5px Mitr,sans-serif;color:#5B5375")}>รายการของในบ้าน ({v.setCount})</div>
            <button onClick={v.setAddOpen} style={st("border:none;cursor:pointer;border-radius:15px;padding:10px 14px;font:500 12.5px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:5px 7px 15px rgba(90,68,180,.32),-3px -4px 10px rgba(255,255,255,.6);display:flex;align-items:center;gap:6px")}>+ เพิ่มของ</button>
          </div>
          <div style={st("display:flex;align-items:center;gap:10px;border-radius:20px;padding:4px 6px 4px 15px;background:#F1ECFA;box-shadow:inset 4px 5px 11px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")}>
            <SearchIcon size={15} />
            <input value={v.setQuery} onChange={v.setSetQuery} placeholder="ค้นหาชื่อของ หรือรหัสที่เก็บ" style={st("flex:1;min-width:0;border:none;background:transparent;padding:12px 0;font:400 13.5px 'IBM Plex Sans Thai',sans-serif;color:#3A3254")} />
          </div>
          <div style={st("display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:13px")}>
            {v.setRows.map((r) => (
              <div key={r.key} style={st("border-radius:22px;padding:13px;background:#FBF6FE;box-shadow:8px 10px 22px rgba(120,95,175,.16),-5px -6px 14px #ffffff,inset 2px 2px 4px #ffffff;display:flex;flex-direction:column;gap:9px")}>
                <div style={st("display:flex;align-items:flex-start;justify-content:space-between;gap:6px")}>
                  <div style={st("font:500 13.5px/1.3 Mitr,sans-serif;color:#3A3254;min-width:0")}>{r.name}</div>
                  <button onClick={r.del} style={st("width:26px;height:26px;flex:none;border:none;border-radius:9px;cursor:pointer;background:#FFE9E9;box-shadow:inset 2px 2px 6px rgba(201,82,79,.16);display:grid;place-items:center")}>
                    <TrashIcon />
                  </button>
                </div>
                <div style={st(r.codeStyle)}>{r.code}</div>
                <div style={st("font:400 10.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>มีอยู่ {r.qty} · {r.kindLabel}</div>
                <button onClick={r.toggleTrack} style={st(r.trackStyle)}>{r.trackLabel}</button>
                {r.fields.map((f, i) => (
                  <div key={i} style={st("border-radius:15px;padding:9px 10px;background:#F1ECFA;box-shadow:inset 3px 4px 9px rgba(120,95,175,.16),inset -2px -2px 7px #ffffff")}>
                    <div style={st("font:400 9.5px 'IBM Plex Mono',monospace;color:#8B82A6;letter-spacing:.4px")}>{f.label}</div>
                    <div style={st("display:flex;align-items:center;justify-content:space-between;margin-top:5px")}>
                      <button onClick={f.dec} style={st("width:28px;height:28px;border:none;border-radius:10px;font:500 15px Mitr,sans-serif;color:#6A57D6;background:#FBF6FE;box-shadow:3px 3px 8px rgba(120,95,175,.16),-2px -2px 6px #ffffff;cursor:pointer")}>–</button>
                      <div style={st("font:500 15px Mitr,sans-serif;color:#3A3254")}>{f.value}</div>
                      <button onClick={f.inc} style={st("width:28px;height:28px;border:none;border-radius:10px;font:500 15px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:3px 4px 9px rgba(90,68,180,.28),-2px -2px 6px #ffffff;cursor:pointer")}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {v.setEmpty && (
            <div style={st("margin-top:12px;border-radius:20px;padding:22px;text-align:center;font:400 12.5px 'IBM Plex Sans Thai',sans-serif;color:#8B82A6;background:#F1ECFA;box-shadow:inset 4px 5px 12px rgba(120,95,175,.14),inset -3px -3px 9px #ffffff")}>ไม่พบรายการที่ค้นหา</div>
          )}
        </>
      )}

      <div style={st("margin-top:20px;border-radius:22px;padding:16px;background:#FBF6FE;box-shadow:8px 10px 22px rgba(120,95,175,.16),-5px -6px 14px #ffffff")}>
        <div style={st("font:500 14px Mitr,sans-serif;color:#3A3254")}>การแจ้งเตือน</div>
        <div style={st("font:400 12.5px/1.7 'IBM Plex Sans Thai',sans-serif;color:#8B82A6;margin-top:6px;white-space:pre-line")}>{"ของกิน: เตือน 3 วัน และ 1 วันก่อน EXP\nของใช้: เตือน 7 วันก่อนหมด และวันที่หมดจริง\nสรุปรวมผ่าน LINE ทุกวัน 09:00"}</div>
      </div>
    </div>
  );
}

function ViewerLayer({ v }: { v: V }) {
  return (
    <div onClick={v.closeViewer} style={st("position:absolute;inset:0;z-index:70;background:rgba(38,30,62,.86);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;flex-direction:column;padding:56px 18px 34px;animation:clayIn .22s ease both")}>
      <div style={st("display:flex;align-items:center;justify-content:space-between;gap:10px")}>
        <div style={st("font:400 11px 'IBM Plex Mono',monospace;color:#C6B9E6;min-width:0")}>{v.viewerMeta}</div>
        <button onClick={v.closeViewer} style={st("width:40px;height:40px;flex:none;border:none;border-radius:14px;cursor:pointer;background:rgba(255,255,255,.14);box-shadow:inset 2px 3px 8px rgba(255,255,255,.22);display:grid;place-items:center")}>
          <CloseIcon />
        </button>
      </div>
      <div onClick={(e) => e.stopPropagation()} style={st("flex:1;margin-top:18px;border-radius:30px;overflow:hidden;background:#1c1630;display:grid;place-items:center")}>
        <img src={v.viewerSrc} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
      </div>
      {v.viewerHasMany && (
        <div style={st("display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px")}>
          <button onClick={(e) => { e.stopPropagation(); v.viewerPrev(); }} style={st("border:none;cursor:pointer;border-radius:16px;padding:12px 16px;font:500 12.5px Mitr,sans-serif;color:#ffffff;background:rgba(255,255,255,.16);box-shadow:inset 2px 3px 8px rgba(255,255,255,.22)")}>‹ ก่อนหน้า</button>
          <button onClick={(e) => { e.stopPropagation(); v.viewerNext(); }} style={st("border:none;cursor:pointer;border-radius:16px;padding:12px 16px;font:500 12.5px Mitr,sans-serif;color:#ffffff;background:rgba(255,255,255,.16);box-shadow:inset 2px 3px 8px rgba(255,255,255,.22)")}>ถัดไป ›</button>
        </div>
      )}
      {v.viewerReplace && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            v.viewerReplace!();
          }}
          style={st("margin-top:16px;align-self:center;border:none;cursor:pointer;border-radius:18px;padding:13px 22px;font:500 13.5px Mitr,sans-serif;color:#3A3254;background:rgba(255,255,255,.92);box-shadow:0 10px 24px rgba(0,0,0,.28)")}
        >
          เปลี่ยนรูป
        </button>
      )}
    </div>
  );
}

function CenterConfirm({ v }: { v: V }) {
  const c = v.confirm;
  if (!c) return null;
  return (
    <div
      onClick={v.confirmCancel}
      style={st("position:absolute;inset:0;z-index:80;background:rgba(58,40,50,.44);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:grid;place-items:center;padding:28px;animation:clayIn .16s ease both")}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={st("width:100%;max-width:320px;border-radius:26px;padding:22px 20px 18px;text-align:center;background:#FCEFEE;box-shadow:0 24px 54px rgba(120,40,36,.34),inset 3px 4px 10px #ffffff;animation:popIn .24s cubic-bezier(.2,1.25,.4,1) both")}
      >
        <div style={st("width:44px;height:44px;margin:0 auto 12px;border-radius:15px;background:#F7DAD8;box-shadow:inset 2px 3px 8px rgba(178,63,59,.22);display:grid;place-items:center")}>
          <TrashIcon color="#B23F3B" w={18} />
        </div>
        <div style={st("font:500 16px/1.4 Mitr,sans-serif;color:#B23F3B")}>{c.title}</div>
        {c.body && (
          <div style={st("font:400 12.5px/1.6 'IBM Plex Sans Thai',sans-serif;color:#B87873;margin-top:6px")}>{c.body}</div>
        )}
        <div style={st("display:flex;gap:10px;margin-top:18px")}>
          <button
            onClick={v.confirmCancel}
            style={st("flex:1;border:none;cursor:pointer;border-radius:16px;padding:13px;font:500 14px Mitr,sans-serif;color:#8B6B68;background:#F3E4E3;box-shadow:inset 3px 4px 9px rgba(178,63,59,.12),inset -2px -2px 7px #ffffff")}
          >
            ยกเลิก
          </button>
          <button
            onClick={v.confirmOk}
            style={st("flex:1;border:none;cursor:pointer;border-radius:16px;padding:13px;font:500 14px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#E07A76,#C24A46);box-shadow:6px 9px 20px rgba(194,74,70,.34)")}
          >
            {c.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetLayer({ v }: { v: V }) {
  const danger = v.sheetDanger;
  return (
    <div onClick={v.closeSheet} style={st("position:absolute;inset:0;background:rgba(58,50,84,.34);z-index:60;display:flex;align-items:flex-end")}>
      <div onClick={(e) => e.stopPropagation()} style={st(`width:100%;border-radius:34px 34px 0 0;padding:22px 22px 40px;background:${danger ? "#FCEFEE" : "#F6F0FC"};box-shadow:0 -12px 34px ${danger ? "rgba(150,50,45,.26)" : "rgba(70,50,120,.28)"},inset 3px 5px 10px #ffffff;animation:clayUp .26s cubic-bezier(.3,1.2,.5,1) both`)}>
        <div style={st(`width:46px;height:5px;border-radius:99px;background:${danger ? "#EAC7C4" : "#DCD2ED"};margin:0 auto 16px`)} />
        <div style={st(`font:500 18px/1.4 Mitr,sans-serif;color:${danger ? "#B23F3B" : "#3A3254"}`)}>{v.sheetTitle}</div>
        <div style={st(`font:400 12.5px/1.6 'IBM Plex Sans Thai',sans-serif;color:${danger ? "#B87873" : "#8B82A6"};margin-top:5px`)}>{v.sheetSub}</div>

        {v.sheetHasInput && (
          <input value={v.sheetInputVal} onChange={v.sheetInputSet} placeholder={v.sheetInputPh} style={st("width:100%;margin-top:15px;border:none;border-radius:18px;padding:15px 16px;font:400 14.5px 'IBM Plex Sans Thai',sans-serif;color:#3A3254;background:#F1ECFA;box-shadow:inset 4px 5px 11px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")} />
        )}

        {v.sheetHasChips && (
          <div style={st("display:flex;gap:9px;margin-top:11px")}>
            {v.sheetChips.map((c, i) => (
              <button key={i} onClick={c.on} style={st(c.style)}>{c.label}</button>
            ))}
          </div>
        )}

        {v.sheetHasPlace && (
          <div style={st("margin-top:14px")}>
            <div style={st("font:500 12.5px Mitr,sans-serif;color:#5B5375;margin-bottom:8px")}>Location หลัก</div>
            <div style={st("display:flex;gap:8px;flex-wrap:wrap")}>
              {v.placeRoomChips.map((c, i) => (
                <button key={i} onClick={c.on} style={st(c.style)}>{c.label}</button>
              ))}
            </div>
            {v.placeRoomIsNew && (
              <input value={v.placeRoomCustom} onChange={v.setPlaceRoomCustom} placeholder="ชื่อ location หลักใหม่ เช่น ห้องทำงาน" style={st("width:100%;margin-top:10px;border:none;border-radius:16px;padding:13px 15px;font:400 13.5px 'IBM Plex Sans Thai',sans-serif;color:#3A3254;background:#F1ECFA;box-shadow:inset 4px 5px 11px rgba(120,95,175,.18),inset -3px -3px 8px #ffffff")} />
            )}
            <div style={st("font:500 12.5px Mitr,sans-serif;color:#5B5375;margin:16px 0 8px")}>รหัส location (แก้ได้ · ห้ามซ้ำ)</div>
            <div style={st("display:flex;align-items:center;gap:10px")}>
              <input value={v.placeCodeVal} onChange={v.setPlaceCode} style={st("width:132px;flex:none;border:none;border-radius:14px;padding:13px 12px;text-align:center;font:500 13px 'IBM Plex Mono',monospace;letter-spacing:.7px;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:4px 6px 13px rgba(90,68,180,.3),inset 2px 2px 5px rgba(255,255,255,.28)")} />
              <div style={st("flex:1;font:400 11.5px/1.5 'IBM Plex Sans Thai',sans-serif;color:#8B82A6")}>{v.placeCodeHint}</div>
            </div>
          </div>
        )}

        <div style={st("display:flex;flex-direction:column;gap:11px;margin-top:18px")}>
          {v.sheetActions.map((a, i) => (
            <button
              key={i}
              onClick={a.on}
              disabled={a.disabled}
              style={st(a.style + (a.disabled ? ";opacity:.5" : ""))}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
