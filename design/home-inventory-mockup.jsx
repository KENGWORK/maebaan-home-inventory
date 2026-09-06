import { useState } from "react";

const LOCATIONS = [
  { code: "GAR-01", name: "โรงรถ – ตู้เก็บของ" },
  { code: "GAR-02", name: "โรงรถ – ชั้นวาง" },
  { code: "MAS-01", name: "ห้องนอนใหญ่ – ตู้เสื้อผ้า" },
  { code: "MAS-02", name: "ห้องนอนใหญ่ – โต๊ะข้างเตียง" },
  { code: "SML-01", name: "ห้องนอนเล็ก – ตู้เก็บของ" },
  { code: "LIV-01", name: "ห้องนั่งเล่น – ตู้ทีวี" },
  { code: "KIT-01", name: "ห้องครัว – ตู้ใต้ซิงค์" },
  { code: "KIT-02", name: "ห้องครัว – ตู้แขวน" },
  { code: "KIT-03", name: "ห้องครัว – ตู้กับข้าว" },
  { code: "BAT-01", name: "ห้องน้ำ – ตู้เก็บของ" },
];

const PEOPLE = ["เก่ง", "แฟนเก่ง", "แม่บ้าน"];

const PENDING = [
  { id: 1, name: "น้ำปลา", photo: "🧴", status: "missing_both", note: "ยังไม่ได้ระบุจำนวน / สถานที่" },
  { id: 2, name: "สบู่", photo: "🧼", status: "missing_qty", note: "ยังไม่ได้ระบุจำนวน" },
  { id: 3, name: "น้ำยาซักผ้า", photo: "🧴", status: "ready", note: "ข้อมูลพร้อมบันทึก" },
];

const STOCK = [
  { id: 101, name: "น้ำปลา", loc: "KIT-01", qty: 2, unit: "ขวด", food: true, exp: "2026-09-20" },
  { id: 102, name: "สเปรย์ดับกลิ่น", loc: "BAT-01", qty: 1, unit: "กระป๋อง", food: false },
  { id: 103, name: "น้ำยาซักผ้า", loc: "KIT-01", qty: 1, unit: "ขวด", food: false },
];

function Header({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "0.5px solid var(--border)" }}>
      {onBack && (
        <button onClick={onBack} aria-label="ย้อนกลับ" style={{ border: "none", background: "none", fontSize: 20, padding: 0, color: "var(--text-secondary)" }}>
          <i className="ti ti-arrow-left" aria-hidden="true"></i>
        </button>
      )}
      <h2 style={{ margin: 0 }}>{title}</h2>
    </div>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: active ? "1px solid #0F6E56" : "0.5px solid var(--border)",
        background: active ? "#E1F5EE" : "var(--surface-2)",
        color: active ? "#04342C" : "var(--text-primary)",
        borderRadius: 999,
        padding: "6px 14px",
        fontSize: 14,
        fontWeight: active ? 500 : 400,
      }}
    >
      {label}
    </button>
  );
}

function Stepper({ value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <button onClick={() => onChange(Math.max(0, value - 1))} aria-label="ลดจำนวน" style={{ width: 36, height: 36, borderRadius: "50%", border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", fontSize: 18 }}>−</button>
      <span style={{ fontSize: 20, fontWeight: 500, minWidth: 24, textAlign: "center" }}>{value}</span>
      <button onClick={() => onChange(value + 1)} aria-label="เพิ่มจำนวน" style={{ width: 36, height: 36, borderRadius: "50%", border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", fontSize: 18 }}>+</button>
    </div>
  );
}

function LocationPicker({ value, onChange }) {
  const [q, setQ] = useState("");
  const matches = q ? LOCATIONS.filter(l => l.name.includes(q) || l.code.includes(q)) : LOCATIONS;
  return (
    <div>
      <input placeholder="พิมพ์ชื่อสถานที่ เช่น ตู้" value={q} onChange={e => setQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
        {matches.map(l => (
          <button key={l.code} onClick={() => onChange(l.code)}
            style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, border: value === l.code ? "1px solid #0F6E56" : "0.5px solid var(--border)", background: value === l.code ? "#E1F5EE" : "var(--surface-2)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#0F6E56", marginRight: 8 }}>{l.code}</span>
            <span style={{ fontSize: 14 }}>{l.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PendingScreen({ go }) {
  return (
    <div>
      <Header title={`รอบันทึก (${PENDING.length})`} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {PENDING.map(p => (
          <button key={p.id} onClick={() => go(p.status === "ready" ? "add" : "add", p)}
            style={{ textAlign: "left", display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 12, border: "0.5px solid var(--border)", background: "var(--surface-2)" }}>
            <div style={{ fontSize: 28, width: 44, height: 44, borderRadius: 10, background: "var(--surface-1)", display: "flex", alignItems: "center", justifyContent: "center" }}>{p.photo}</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>{p.name}</p>
              <p style={{ margin: 0, fontSize: 13, color: p.status === "ready" ? "var(--text-success)" : "var(--text-secondary)" }}>{p.note}</p>
            </div>
            <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: "var(--text-muted)" }}></i>
          </button>
        ))}
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        <button onClick={() => go("capture")} style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "1px solid #0F6E56", background: "#E1F5EE", color: "#04342C", fontWeight: 500 }}>
          <i className="ti ti-camera" aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }}></i>ถ่ายรูปเพิ่ม
        </button>
      </div>
    </div>
  );
}

function CaptureScreen({ go }) {
  const [type, setType] = useState(null);
  return (
    <div>
      <Header title="ถ่ายรูป" onBack={() => go("pending")} />
      <div style={{ padding: 16 }}>
        <div style={{ aspectRatio: "4/3", background: "var(--surface-1)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", marginBottom: 16 }}>
          <i className="ti ti-camera" style={{ fontSize: 36 }} aria-hidden="true"></i>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 8 }}>เลือกประเภทของการบันทึก</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <Chip label="เก็บของ" active={type === "add"} onClick={() => setType("add")} />
          <Chip label="ย้ายของ" active={type === "move"} onClick={() => setType("move")} />
          <Chip label="ใช้ของ" active={type === "use"} onClick={() => setType("use")} />
        </div>
        <button disabled={!type} onClick={() => go("confirmDest", { type })}
          style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: type ? "#0F6E56" : "var(--surface-1)", color: type ? "#fff" : "var(--text-muted)", fontWeight: 500 }}>
          บันทึกรูปนี้
        </button>
      </div>
    </div>
  );
}

function ConfirmDestScreen({ go, ctx }) {
  return (
    <div>
      <Header title="บันทึกรูปแล้ว" onBack={() => go("capture")} />
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 15, color: "var(--text-secondary)" }}>ต้องการกรอกรายละเอียดตอนนี้เลย หรือเก็บรูปไว้ในรายการรอบันทึกก่อน</p>
        <button onClick={() => go(ctx.type)} style={{ padding: "12px 0", borderRadius: 10, border: "none", background: "#0F6E56", color: "#fff", fontWeight: 500 }}>กรอกข้อมูลเลย</button>
        <button onClick={() => go("pending")} style={{ padding: "12px 0", borderRadius: 10, border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", fontWeight: 500 }}>ส่งเข้ารายการรอบันทึก</button>
      </div>
    </div>
  );
}

function AddScreen({ go, item }) {
  const [name, setName] = useState(item?.name || "");
  const [foodType, setFoodType] = useState(null);
  const [qty, setQty] = useState(1);
  const [loc, setLoc] = useState("");
  const [person, setPerson] = useState(PEOPLE[0]);
  const [exp, setExp] = useState("");
  return (
    <div>
      <Header title="เก็บของ" onBack={() => go("pending")} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>ชื่อของ</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น สเปรย์กระจก" style={{ width: "100%" }} />
        </div>
        <div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 6px" }}>ประเภท</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Chip label="ของกิน" active={foodType === "food"} onClick={() => setFoodType("food")} />
            <Chip label="ของใช้" active={foodType === "goods"} onClick={() => setFoodType("goods")} />
          </div>
        </div>
        {foodType === "food" && (
          <div>
            <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>วันหมดอายุ</label>
            <input type="date" value={exp} onChange={e => setExp(e.target.value)} style={{ width: "100%" }} />
          </div>
        )}
        <div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 6px" }}>จำนวน</p>
          <Stepper value={qty} onChange={setQty} />
        </div>
        <div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 6px" }}>สถานที่เก็บ</p>
          <LocationPicker value={loc} onChange={setLoc} />
        </div>
        <div>
          <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>ผู้เก็บ</label>
          <select value={person} onChange={e => setPerson(e.target.value)} style={{ width: "100%" }}>
            {PEOPLE.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <button style={{ padding: "8px 0", borderRadius: 10, border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", fontWeight: 500 }}>
          <i className="ti ti-plus" aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }}></i>เพิ่มอีกรายการในการบันทึกนี้
        </button>
        <button onClick={() => go("pending")} disabled={!name || !loc}
          style={{ padding: "12px 0", borderRadius: 10, border: "none", background: name && loc ? "#0F6E56" : "var(--surface-1)", color: name && loc ? "#fff" : "var(--text-muted)", fontWeight: 500 }}>
          บันทึก
        </button>
      </div>
    </div>
  );
}

function MoveScreen({ go }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);
  const [qty, setQty] = useState(1);
  const [loc, setLoc] = useState("");
  const matches = q ? STOCK.filter(s => s.name.includes(q)) : STOCK;
  return (
    <div>
      <Header title="ย้ายของ" onBack={() => go("pending")} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>ผู้ย้าย</label>
          <select style={{ width: "100%" }}>{PEOPLE.map(p => <option key={p}>{p}</option>)}</select>
        </div>
        {!picked ? (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 6px" }}>เลือกของที่จะย้าย</p>
            <input placeholder="ค้นหาชื่อของ" value={q} onChange={e => setQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {matches.map(s => (
                <button key={s.id} onClick={() => setPicked(s)} style={{ textAlign: "left", padding: 10, borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface-2)" }}>
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span style={{ float: "right", fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{s.loc} · เหลือ {s.qty}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: 10, borderRadius: 8, background: "var(--surface-1)" }}>
              <span style={{ fontWeight: 500 }}>{picked.name}</span>
              <span style={{ marginLeft: 8, fontSize: 13, color: "var(--text-secondary)" }}>มีอยู่ {picked.qty} {picked.unit}</span>
            </div>
            <div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 6px" }}>จำนวนที่ย้าย</p>
              <Stepper value={qty} onChange={setQty} />
            </div>
            <div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 6px" }}>สถานที่ใหม่</p>
              <LocationPicker value={loc} onChange={setLoc} />
            </div>
            <button style={{ padding: "8px 0", borderRadius: 10, border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", fontWeight: 500 }}>
              <i className="ti ti-plus" aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }}></i>เพิ่มรายการย้ายอื่น
            </button>
            <button onClick={() => go("pending")} disabled={!loc}
              style={{ padding: "12px 0", borderRadius: 10, border: "none", background: loc ? "#0F6E56" : "var(--surface-1)", color: loc ? "#fff" : "var(--text-muted)", fontWeight: 500 }}>
              บันทึก
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function UseScreen({ go }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);
  const [qty, setQty] = useState(1);
  const matches = q ? STOCK.filter(s => s.name.includes(q)) : [];
  return (
    <div>
      <Header title="ใช้ของ" onBack={() => go("pending")} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {!picked ? (
          <div>
            <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>ค้นหา</label>
            <input placeholder="เช่น น้ำปลา" value={q} onChange={e => setQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {matches.map(s => (
                <button key={s.id} onClick={() => setPicked(s)} style={{ textAlign: "left", padding: 10, borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface-2)" }}>
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span style={{ float: "right", fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{s.loc} — เหลือ {s.qty}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: 10, borderRadius: 8, background: "var(--surface-1)" }}>
              <span style={{ fontWeight: 500 }}>{picked.name}</span>
              <span style={{ marginLeft: 8, fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{picked.loc} — เหลือ {picked.qty}</span>
            </div>
            <div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 6px" }}>จำนวน</p>
              <Stepper value={qty} onChange={setQty} />
            </div>
            <button onClick={() => go("pending")} style={{ padding: "12px 0", borderRadius: 10, border: "none", background: "#0F6E56", color: "#fff", fontWeight: 500 }}>บันทึก</button>
          </>
        )}
      </div>
    </div>
  );
}

function ListScreen({ go }) {
  const [mode, setMode] = useState("item");
  return (
    <div>
      <Header title="รายการของในบ้าน" />
      <div style={{ padding: "0 16px 12px", display: "flex", gap: 8 }}>
        <Chip label="ตามสิ่งของ" active={mode === "item"} onClick={() => setMode("item")} />
        <Chip label="ตามสถานที่" active={mode === "loc"} onClick={() => setMode("loc")} />
      </div>
      <div style={{ padding: "0 16px" }}>
        <input placeholder="ค้นหาชื่อของหรือรหัสสถานที่" style={{ width: "100%", marginBottom: 12 }} />
      </div>
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {mode === "item" ? STOCK.map(s => (
          <div key={s.id} style={{ padding: 12, borderRadius: 10, border: "0.5px solid var(--border)", background: "var(--surface-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 500 }}>{s.name}</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.qty} {s.unit}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", marginTop: 4 }}>{s.loc}{s.exp ? ` · หมดอายุ ${s.exp}` : ""}</div>
          </div>
        )) : LOCATIONS.map(l => (
          <div key={l.code} style={{ padding: 12, borderRadius: 10, border: "0.5px solid var(--border)", background: "var(--surface-2)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#0F6E56", marginRight: 8 }}>{l.code}</span>
            <span style={{ fontSize: 14 }}>{l.name}</span>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{STOCK.filter(s => s.loc === l.code).length} รายการ</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("pending");
  const [ctx, setCtx] = useState(null);

  const go = (s, c) => { setScreen(s); setCtx(c || null); };

  const screens = {
    pending: <PendingScreen go={go} />,
    capture: <CaptureScreen go={go} />,
    confirmDest: <ConfirmDestScreen go={go} ctx={ctx} />,
    add: <AddScreen go={go} item={ctx} />,
    move: <MoveScreen go={go} />,
    use: <UseScreen go={go} />,
    list: <ListScreen go={go} />,
  };

  const tabs = [
    { key: "pending", icon: "ti-clock", label: "รอบันทึก" },
    { key: "list", icon: "ti-list", label: "รายการของ" },
  ];

  return (
    <div style={{ maxWidth: 380, margin: "0 auto", background: "var(--surface-1)", borderRadius: 20, overflow: "hidden", fontFamily: "var(--font-sans)" }}>
      <div style={{ background: "var(--surface-2)", minHeight: 560 }}>{screens[screen]}</div>
      <div style={{ display: "flex", borderTop: "0.5px solid var(--border)", background: "var(--surface-2)" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => go(t.key)}
            style={{ flex: 1, padding: "10px 0", border: "none", background: "none", color: screen === t.key ? "#0F6E56" : "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 11 }}>
            <i className={`ti ${t.icon}`} aria-hidden="true" style={{ fontSize: 20 }}></i>
            {t.label}
          </button>
        ))}
        <button onClick={() => go("capture")} style={{ flex: 1, padding: "10px 0", border: "none", background: "none", color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 11 }}>
          <i className="ti ti-camera-plus" aria-hidden="true" style={{ fontSize: 20 }}></i>
          เพิ่ม
        </button>
      </div>
    </div>
  );
}
